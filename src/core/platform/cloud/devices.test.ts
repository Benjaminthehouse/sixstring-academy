/**
 * Two (or three) simulated devices of one learner on one fake Supabase backend, each running the
 * real account layer and the real sync engine: the phone away from the laptop, the laptop with the
 * guitar, the same progress on both. The merge rules are the engine's (see `sync.ts` and
 * `storage-merge.ts`); these tests check they hold end to end through the table and Realtime.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLibrary, memoryStore, songSyncPort } from '@/core/library';
import { createFakeServer } from './fake';
import { testDevice, type TestDevice } from './testing';

const pass = (ms: number): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => undefined);
async function act<T>(promise: Promise<T>, ms = 2000): Promise<T> {
  await pass(ms);
  return promise;
}

const lesson = (d: TestDevice, n: number): void => {
  d.actions.recordActivity({ kind: 'theory-lesson', id: `theory:unit-1:lesson-${n}`, title: `Lesson ${n}`, accuracy: 1, durationSec: 240, route: 'learn', params: ['unit-1', `lesson-${n}`] });
};
const journal = (d: TestDevice): string[] => (((d.read('practice.data') as { journal?: Array<{ id: string }> } | null)?.journal ?? []).map((e) => e.id)).sort();
const entry = (id: string, endedAt: number) => ({ id, startedAt: endedAt - 600_000, endedAt, day: '2026-11-16', title: `Practice ${id}`, plannedSec: 600, practisedSec: 600, blocks: [], xp: 8, feel: 4, note: '', endedEarly: false });
const practice = (...entries: Array<ReturnType<typeof entry>>) => ({ v: 1, journal: entries, routines: [], goals: [] });

async function device(server: ReturnType<typeof createFakeServer>, name: string, options: Parameters<typeof testDevice>[2] = {}): Promise<TestDevice> {
  const d = testDevice(server, name, options);
  await act(d.start(), 500);
  return d;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse('2026-11-16T09:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('one learner, two devices', () => {
  it('the first sign-in uploads this device’s progress; a fresh second device pulls everything', async () => {
    const server = createFakeServer();
    const phone = await device(server, 'phone');
    lesson(phone, 1);
    lesson(phone, 2);
    phone.write('practice.data', practice(entry('on-the-bus', Date.now())));
    phone.write('metronome.settings', { bpm: 88 });
    phone.write('rhythm.calibration', { v: 1, tapMs: 31, tapAt: 1 }); // this phone's own delay: never synced
    expect(await act(phone.signIn('ana@example.com'))).toBe(true);
    await pass(10_000);
    expect(phone.status()).toMatchObject({ state: 'synced', provider: 'account' });

    await pass(61_000); // the next code for the address may be asked for after a minute
    const laptop = await device(server, 'laptop');
    expect(await act(laptop.signIn('ana@example.com'))).toBe(true);
    await pass(10_000);
    expect(laptop.store.getState().xp.total).toBe(phone.store.getState().xp.total);
    expect(laptop.store.getState().skills['theory:unit-1:lesson-2']?.completed).toBe(true);
    expect(journal(laptop)).toEqual(['on-the-bus']);
    expect(laptop.read('metronome.settings')).toEqual({ bpm: 88 });
    expect(laptop.read('rhythm.calibration')).toBeNull();
    expect(laptop.status().state).toBe('synced');
  });

  it('a device that already has progress merges with the account at its first sign-in: neither side is wiped', async () => {
    const server = createFakeServer();
    const laptop = await device(server, 'laptop');
    lesson(laptop, 1);
    laptop.write('practice.data', practice(entry('laptop-first', Date.now() - 3_600_000)));
    await act(laptop.signIn('ana@example.com'));
    await pass(10_000);
    const laptopXp = laptop.store.getState().xp.total;

    // The phone was used for weeks before its owner signed in there.
    await pass(61_000);
    const phone = await device(server, 'phone');
    lesson(phone, 5);
    lesson(phone, 6);
    phone.write('practice.data', practice(entry('phone-own', Date.now())));
    const phoneXp = phone.store.getState().xp.total;
    await act(phone.signIn('ana@example.com'));
    await pass(90_000);

    for (const d of [phone, laptop]) {
      expect(journal(d)).toEqual(['laptop-first', 'phone-own']);
      expect(d.store.getState().skills['theory:unit-1:lesson-1']?.completed).toBe(true);
      expect(d.store.getState().skills['theory:unit-1:lesson-6']?.completed).toBe(true);
      expect(d.store.getState().xp.total).toBeGreaterThanOrEqual(Math.max(laptopXp, phoneXp));
      expect(d.status().state).toBe('synced');
    }
  });

  it('a change on one device reaches the other through Realtime within seconds, and idle devices stop writing', async () => {
    const server = createFakeServer();
    const laptop = await device(server, 'laptop');
    await act(laptop.signIn('ana@example.com'));
    await pass(61_000);
    const phone = await device(server, 'phone');
    await act(phone.signIn('ana@example.com'));
    await pass(30_000);

    laptop.actions.setProfile({ name: 'Ana at the desk' });
    await pass(30_000); // the quiet period and the minimum gap between writes
    expect(phone.store.getState().profile.name).toBe('Ana at the desk');

    const writes = server.log.filter((op) => op === 'db.upsert').length;
    await pass(15 * 60_000);
    expect(server.log.filter((op) => op === 'db.upsert').length).toBe(writes);
  });

  it('offline changes on both devices, then back online: nothing is lost, lists are joined, the newer setting wins', async () => {
    const server = createFakeServer();
    const laptop = await device(server, 'laptop');
    laptop.write('practice.data', practice(entry('shared', Date.now() - 86_400_000)));
    await act(laptop.signIn('ana@example.com'));
    await pass(61_000);
    const phone = await device(server, 'phone');
    await act(phone.signIn('ana@example.com'));
    await pass(30_000);
    expect(journal(phone)).toEqual(['shared']);

    laptop.goOffline();
    phone.goOffline();
    await pass(1000);
    expect(laptop.status()).toMatchObject({ state: 'offline', issue: 'offline' });
    expect(laptop.status().message).toMatch(/offline/);

    // The laptop, in the morning.
    lesson(laptop, 3);
    laptop.write('practice.data', practice(entry('shared', Date.now() - 86_400_000), entry('laptop-morning', Date.now())));
    laptop.write('chords.dots', 'fingers');
    await pass(2 * 3_600_000);
    // The phone, on the train later.
    lesson(phone, 4);
    phone.write('practice.data', practice(entry('shared', Date.now() - 86_400_000 - 7_200_000), entry('phone-train', Date.now())));
    phone.write('chords.dots', 'notes');
    await pass(60_000);
    expect(laptop.status().pending).toBe(true);

    laptop.goOnline();
    await pass(60_000);
    phone.goOnline();
    await pass(3 * 60_000);

    for (const d of [laptop, phone]) {
      expect(journal(d)).toEqual(['laptop-morning', 'phone-train', 'shared']);
      expect(d.read('chords.dots')).toBe('notes'); // changed last on the phone
      expect(d.store.getState().skills['theory:unit-1:lesson-3']?.completed).toBe(true);
      expect(d.store.getState().skills['theory:unit-1:lesson-4']?.completed).toBe(true);
      expect(d.status()).toMatchObject({ state: 'synced', pending: false });
    }
    expect(laptop.store.getState().xp.total).toBe(phone.store.getState().xp.total);
  });

  it('the learner’s own songs ride along, one row each, within the sync limits', async () => {
    const server = createFakeServer();
    let seed = 7;
    const random = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const laptopLib = createLibrary({ store: memoryStore(), broadcast: false, random });
    const phoneLib = createLibrary({ store: memoryStore(), broadcast: false, random });
    const laptop = await device(server, 'laptop', { songs: songSyncPort(laptopLib) });
    const song = await laptopLib.importText('e|-0-2-3-|\nB|-------|\nG|-------|\nD|-------|\nA|-------|\nE|-------|\n', { title: 'Little riff' });
    await act(laptop.signIn('ana@example.com'));
    await pass(30_000);
    const uid = server.userId('ana@example.com') ?? '';
    expect(server.rowsOf(uid).map((row) => row.path)).toContain(`song.${song.listing.id}`);

    await pass(61_000);
    const phone = await device(server, 'phone', { songs: songSyncPort(phoneLib) });
    await act(phone.signIn('ana@example.com'));
    await pass(30_000);
    const mine = (await phoneLib.list()).filter((s) => s.source === 'mine');
    expect(mine.map((s) => [s.id, s.title])).toEqual([[song.listing.id, 'Little riff']]);
    expect(phone.status().songs).toMatchObject({ synced: true, count: 1 });
  });
});

describe('a project that is not set up', () => {
  it('pauses syncing with a sentence for the owner, keeps everything on the device, and a retry works once the table exists', async () => {
    const server = createFakeServer();
    server.tableMissing = true;
    const phone = await device(server, 'phone');
    lesson(phone, 1);
    expect(await act(phone.signIn('ana@example.com'))).toBe(true);
    await pass(10_000);
    expect(phone.status()).toMatchObject({ state: 'error', issue: 'setup-needed', provider: 'account', pending: true });
    expect(phone.status().message).toMatch(/schema\.sql/);
    expect(phone.store.getState().skills['theory:unit-1:lesson-1']?.completed).toBe(true);

    server.tableMissing = false;
    await act(phone.accounts.ready().then(() => phone.sync()?.stop()));
    await act(phone.start(), 10_000); // "Try again" restarts the service
    expect(phone.status()).toMatchObject({ state: 'synced', pending: false });
  });
});

describe('deleting the cloud copy from one device', () => {
  it('stops the other device instead of letting it write the copy back; signing in there again starts afresh', async () => {
    const server = createFakeServer();
    const phone = await device(server, 'phone');
    lesson(phone, 1);
    await act(phone.signIn('ana@example.com'));
    await pass(61_000);
    const laptop = await device(server, 'laptop');
    await act(laptop.signIn('ana@example.com'));
    await pass(30_000);
    const uid = server.userId('ana@example.com') ?? '';

    expect(await act(phone.accounts.deleteCloudData(), 5000)).toBe(true);
    await pass(30_000);
    expect(laptop.account()).toMatchObject({ phase: 'signed-out', notice: 'erased' });
    expect(laptop.status()).toMatchObject({ state: 'off', issue: 'signed-out' });
    // The laptop keeps its progress, and nothing went back to the cloud.
    expect(laptop.store.getState().skills['theory:unit-1:lesson-1']?.completed).toBe(true);
    await pass(10 * 60_000);
    expect(server.rowsOf(uid).map((row) => [row.path, row.data.kind])).toEqual([['progress', 'erased']]);

    // Later the learner decides to sync again from the laptop: its copy starts the cloud anew.
    await pass(61_000);
    await act(laptop.signIn('ana@example.com'));
    await pass(30_000);
    expect(server.rowsOf(uid).find((row) => row.path === 'progress')?.data.kind).toBe('progress-sync');
    expect(laptop.status().state).toBe('synced');
  });

  it('a device that was closed during the deletion is signed out, and signing in there again starts a fresh copy (not signed straight out again)', async () => {
    const server = createFakeServer({ accessTtlSec: 600 });
    const phone = await device(server, 'phone');
    await act(phone.signIn('ana@example.com'));
    await pass(61_000);
    const laptop = await device(server, 'laptop');
    lesson(laptop, 2);
    laptop.write('practice.data', practice(entry('laptop-only', Date.now())));
    await act(laptop.signIn('ana@example.com'));
    await pass(30_000);
    const uid = server.userId('ana@example.com') ?? '';

    // The laptop is shut; the learner deletes the cloud data from the phone.
    const shut = laptop.reload();
    expect(await act(phone.accounts.deleteCloudData(), 5000)).toBe(true);

    // Opened again later: the global sign-out ended its session before it could see the marker.
    await pass(30 * 60_000);
    await act(shut.start(), 5000);
    expect(shut.account()).toMatchObject({ phase: 'signed-out', notice: 'signed-out' });

    // The learner signs in there again, on purpose: the laptop's copy starts the cloud anew.
    expect(await act(shut.signIn('ana@example.com'), 3000)).toBe(true);
    await pass(30_000);
    expect(shut.account()).toMatchObject({ phase: 'signed-in', notice: null });
    expect(shut.status()).toMatchObject({ state: 'synced', provider: 'account' });
    const head = server.rowsOf(uid).find((row) => row.path === 'progress');
    expect(head?.data.kind).toBe('progress-sync');
    expect(JSON.stringify(head?.data)).toContain('laptop-only');
  });
});

/**
 * The account state machine on the fake backend: signing in with an emailed code (and every way
 * it can go wrong), staying signed in across reloads and offline starts, expiry, signing out with
 * "keep" or "remove", and deleting the cloud copy.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyKey, syncsKey } from '../storage-scope';
import { readRaw } from '../storage';
import { authStorage, AUTH_STORAGE_PREFIX, storedSessionUser } from './client';
import { createFakeServer } from './fake';
import { testDevice } from './testing';

const pass = (ms: number): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => undefined);

/** Run an action while fake time passes. */
async function act<T>(promise: Promise<T>, ms = 500): Promise<T> {
  await pass(ms);
  return promise;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse('2026-11-16T09:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('a copy without accounts', () => {
  it('says accounts are not offered, offers nothing to sync and sends no email', async () => {
    const server = createFakeServer();
    const d = testDevice(server, 'phone', { config: null });
    await act(d.start());
    await act(d.accounts.ready());
    expect(d.account()).toMatchObject({ phase: 'unavailable', unavailable: 'not-configured' });
    expect(d.status()).toMatchObject({ state: 'off', issue: 'standalone' });
    expect(await act(d.accounts.sendCode('ana@example.com'))).toBe(false);
    expect(server.mail).toEqual([]);
  });
});

describe('signing in with a code', () => {
  it('sends a code, refuses a wrong one kindly, signs in with the right one and starts syncing', async () => {
    const server = createFakeServer();
    const d = testDevice(server, 'phone');
    await act(d.start());
    expect(d.account().phase).toBe('signed-out');
    expect(d.status()).toMatchObject({ state: 'off', issue: 'signed-out' });
    expect(d.status().message).toMatch(/Sign in under Me, Account/);

    expect(await act(d.accounts.sendCode('  Ana@Example.com '))).toBe(true);
    expect(d.account()).toMatchObject({ phase: 'code-sent', email: 'ana@example.com', error: null });
    const code = server.lastCode('ana@example.com') ?? '';

    expect(await act(d.accounts.verifyCode(code === '123456' ? '654321' : '123456'))).toBe(false);
    expect(d.account()).toMatchObject({ phase: 'code-sent', error: { kind: 'wrong-code' } });
    expect(await act(d.accounts.verifyCode('12 34'))).toBe(false);
    expect(d.account().error?.kind).toBe('invalid-code');

    expect(await act(d.accounts.verifyCode(` ${code.slice(0, 3)} ${code.slice(3)} `), 2000)).toBe(true);
    expect(d.account()).toMatchObject({ phase: 'signed-in', email: 'ana@example.com', error: null });
    await pass(2000);
    expect(d.status()).toMatchObject({ state: 'synced', provider: 'account' });
    expect(d.status().message).toBe('Your progress is backed up to your account.');
  });

  it('keeps "enter the code" across a reload (the mail app may close the page), and lets the learner change the address', async () => {
    const server = createFakeServer();
    const d = testDevice(server, 'phone');
    await act(d.start());
    await act(d.accounts.sendCode('ana@example.com'));
    const back = d.reload();
    await act(back.start());
    expect(back.account()).toMatchObject({ phase: 'code-sent', email: 'ana@example.com' });
    back.accounts.changeEmail();
    expect(back.account().phase).toBe('signed-out');
    const again = back.reload();
    await act(again.start());
    expect(again.account().phase).toBe('signed-out');
  });

  it('says what went wrong: a bad address, offline, a code asked for twice in a minute, and the hourly email limit', async () => {
    const server = createFakeServer({ emailsPerHour: 2 });
    const d = testDevice(server, 'phone');
    await act(d.start());
    expect(await act(d.accounts.sendCode('ana@example'))).toBe(false);
    expect(d.account().error?.kind).toBe('invalid-email');

    d.goOffline();
    expect(await act(d.accounts.sendCode('ana@example.com'))).toBe(false);
    expect(d.account().error?.kind).toBe('offline');
    d.goOnline();

    expect(await act(d.accounts.sendCode('ana@example.com'))).toBe(true);
    d.accounts.changeEmail();
    expect(await act(d.accounts.sendCode('ana@example.com'))).toBe(false);
    // The code already sent is the one to type.
    expect(d.account()).toMatchObject({ phase: 'code-sent', error: { kind: 'wait' } });
    expect(d.account().error?.retryInSec).toBeGreaterThan(0);

    d.accounts.changeEmail();
    expect(await act(d.accounts.sendCode('ben@example.com'))).toBe(true);
    d.accounts.changeEmail();
    expect(await act(d.accounts.sendCode('cleo@example.com'))).toBe(false);
    expect(d.account().error?.kind).toBe('too-many-emails');
    expect(d.account().error?.message).toMatch(/hour/);
  });

  it('a code more than an hour old is called expired', async () => {
    const server = createFakeServer();
    const d = testDevice(server, 'phone');
    await act(d.start());
    await act(d.accounts.sendCode('ana@example.com'));
    const code = server.lastCode('ana@example.com') ?? '';
    await pass(59 * 60_000);
    // Still waiting for the code after almost an hour: still offered.
    expect(d.account().phase).toBe('code-sent');
    await pass(2 * 60_000);
    expect(await act(d.accounts.verifyCode(code))).toBe(false);
    expect(d.account().error?.kind).toBe('expired-code');
  });
});

describe('staying signed in', () => {
  it('a reload keeps the session, also offline with an expired access token; the status says offline', async () => {
    const server = createFakeServer({ accessTtlSec: 600 });
    const d = testDevice(server, 'phone');
    await act(d.start());
    await act(d.signIn('ana@example.com'), 2000);
    await pass(30 * 60_000);
    d.goOffline();
    const back = d.reload();
    back.goOffline();
    await act(back.start(), 15_000);
    expect(back.account()).toMatchObject({ phase: 'signed-in', email: 'ana@example.com' });
    expect(back.status()).toMatchObject({ state: 'offline', issue: 'offline', provider: 'account' });

    back.goOnline();
    await pass(90_000);
    expect(back.status().state).toBe('synced');
  });

  it('when the session cannot be refreshed any more, the learner is signed out kindly and keeps their progress', async () => {
    const server = createFakeServer({ accessTtlSec: 600 });
    const d = testDevice(server, 'phone');
    await act(d.start());
    await act(d.signIn('ana@example.com'), 2000);
    d.actions.recordActivity({ kind: 'theory-lesson', id: 'theory:unit-1:lesson-1', title: 'A lesson', accuracy: 1, durationSec: 200 });
    await pass(90_000);
    const xp = d.store.getState().xp.total;
    server.revokeSessions(server.userId('ana@example.com') ?? '');
    await pass(15 * 60_000);
    d.poke();
    await pass(5_000);
    expect(d.account()).toMatchObject({ phase: 'signed-out', notice: 'signed-out' });
    expect(d.status()).toMatchObject({ state: 'off', issue: 'signed-out' });
    expect(d.store.getState().xp.total).toBe(xp);
  });

  it('keeps the session in sync.auth.*: device data, never in a backup or synced', () => {
    expect(AUTH_STORAGE_PREFIX).toBe('sync.auth.');
    expect(classifyKey('sync.auth.session')).toBe('device');
    expect(syncsKey('sync.auth.session')).toBe(false);
    expect(classifyKey('sync.account.pending')).toBe('device');
    const storage = authStorage();
    storage.setItem('session', JSON.stringify({ access_token: 'a', refresh_token: 'r', user: { id: 'u1', email: 'ana@example.com' } }));
    expect(readRaw('sync.auth.session')).toContain('"u1"');
    expect(storedSessionUser(storage)).toEqual({ id: 'u1', email: 'ana@example.com' });
    storage.removeItem('session');
    expect(storedSessionUser(storage)).toBeNull();
  });
});

describe('signing out', () => {
  it('"keep" leaves this device’s progress here and stops syncing; signing in again carries on', async () => {
    const server = createFakeServer();
    const d = testDevice(server, 'laptop');
    await act(d.start());
    await act(d.signIn('ana@example.com'), 2000);
    d.write('practice.data', { v: 1, journal: [{ id: 'j1', endedAt: 1 }], routines: [], goals: [] });
    await pass(90_000);
    expect(await act(d.accounts.signOut({ removeLocal: false }), 3000)).toBe(true);
    expect(d.account().phase).toBe('signed-out');
    expect(d.status()).toMatchObject({ state: 'off', issue: 'signed-out' });
    expect(d.read('practice.data')).toMatchObject({ journal: [{ id: 'j1' }] });
    expect(d.storage.session.map.size).toBe(0);

    d.write('practice.data', { v: 1, journal: [{ id: 'j1', endedAt: 1 }, { id: 'j2', endedAt: 2 }], routines: [], goals: [] });
    await pass(61_000);
    await act(d.signIn('ana@example.com'), 3000);
    await pass(90_000);
    const head = server.rowsOf(server.userId('ana@example.com') ?? '').find((row) => row.path === 'progress');
    expect(JSON.stringify(head?.data)).toContain('j2');
  });

  it('"remove" waits for unsent changes, refuses while they cannot reach the cloud, then erases this device and reloads', async () => {
    const server = createFakeServer();
    const d = testDevice(server, 'borrowed');
    await act(d.start());
    await act(d.signIn('ana@example.com'), 2000);
    await pass(90_000);
    d.goOffline();
    d.write('metronome.settings', { bpm: 77 });
    await pass(10_000);
    expect(await act(d.accounts.signOut({ removeLocal: true }), 12_000)).toBe(false);
    expect(d.account()).toMatchObject({ phase: 'signed-in', error: { kind: 'unsynced' } });
    expect(d.removals).toBe(0);

    d.goOnline();
    expect(await act(d.accounts.signOut({ removeLocal: true }), 12_000)).toBe(true);
    // The change reached the cloud first, then this device was erased.
    const head = server.rowsOf(server.userId('ana@example.com') ?? '').find((row) => row.path === 'progress');
    expect(JSON.stringify(head?.data)).toContain('77');
    expect(d.removals).toBe(1);
    expect(d.reloads).toBe(1);
    expect(d.storage.memory.meta).toBeNull();
    const back = d.reload();
    await act(back.start());
    expect(back.account()).toMatchObject({ phase: 'signed-out', notice: 'removed' });
  });
});

describe('deleting the cloud data', () => {
  it('removes every row but a small marker, signs out everywhere and keeps this device’s progress', async () => {
    const server = createFakeServer();
    const laptop = testDevice(server, 'laptop');
    await act(laptop.start());
    await act(laptop.signIn('ana@example.com'), 2000);
    laptop.write('practice.data', { v: 1, journal: [{ id: 'j1', endedAt: 1 }], routines: [], goals: [] });
    laptop.actions.recordActivity({ kind: 'theory-lesson', id: 'theory:unit-1:lesson-1', title: 'A lesson', accuracy: 1, durationSec: 200 });
    await pass(90_000);
    const uid = server.userId('ana@example.com') ?? '';
    expect(server.rowsOf(uid).length).toBeGreaterThan(0);

    expect(await act(laptop.accounts.deleteCloudData(), 3000)).toBe(true);
    expect(server.rowsOf(uid).map((row) => [row.path, row.data.kind])).toEqual([['progress', 'erased']]);
    expect(JSON.stringify(server.rowsOf(uid))).not.toContain('j1');
    expect(laptop.account()).toMatchObject({ phase: 'signed-out', notice: 'deleted' });
    expect(laptop.read('practice.data')).toMatchObject({ journal: [{ id: 'j1' }] });
    expect(laptop.storage.memory.meta).toBeNull();
    await pass(10 * 60_000);
    // Nothing was written back.
    expect(server.rowsOf(uid).map((row) => row.path)).toEqual(['progress']);
  });

  it('is refused offline, with a plain reason, and nothing changes', async () => {
    const server = createFakeServer();
    const d = testDevice(server, 'laptop');
    await act(d.start());
    await act(d.signIn('ana@example.com'), 2000);
    await pass(60_000);
    d.goOffline();
    expect(await act(d.accounts.deleteCloudData())).toBe(false);
    expect(d.account()).toMatchObject({ phase: 'signed-in', error: { kind: 'offline' } });
    expect(server.rowsOf(server.userId('ana@example.com') ?? '').find((row) => row.path === 'progress')?.data.kind).toBe('progress-sync');
  });
});

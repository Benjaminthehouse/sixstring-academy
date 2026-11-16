/**
 * The sync engine's document database on the Supabase table: paths to rows, row security from
 * the client's side, Realtime with a polling fallback, and failures turned into the engine's codes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncDocSnapshot, SyncTimers } from '../sync';
import { POLL_MS, supabaseDatabase } from './db';
import { createFakeClient, createFakeServer, memoryTransport, type FakeRequest, type FakeSupabaseServer, type MemoryTransport } from './fake';
import type { AuthStorage, SupabaseLike } from './types';

const timers: SyncTimers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };
const pass = (ms: number): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => undefined);

function memoryStorage(): AuthStorage {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

interface Rig {
  server: FakeSupabaseServer;
  transport: MemoryTransport;
  client: SupabaseLike;
  uid: string;
  requests: FakeRequest[];
  poke(): void;
}

async function rig(server = createFakeServer(), email = 'ana@example.com'): Promise<Rig> {
  const transport = memoryTransport(server, { latencyMs: 10 });
  const requests: FakeRequest[] = [];
  const call = transport.call.bind(transport);
  transport.call = (request) => {
    requests.push(request);
    return call(request);
  };
  const client = createFakeClient(transport, { storage: memoryStorage() });
  const sent = client.auth.signInWithOtp({ email });
  await pass(50);
  await sent;
  const verified = client.auth.verifyOtp({ email, token: server.lastCode(email) ?? '', type: 'email' });
  await pass(50);
  const uid = (await verified).data.session?.user.id ?? '';
  const pokes = new Set<() => void>();
  return { server, transport, client, uid, requests, poke: () => pokes.forEach((p) => p()), ...{ pokes } } as Rig & { pokes: Set<() => void> };
}

function database(r: Rig) {
  const pokes = (r as Rig & { pokes: Set<() => void> }).pokes;
  return supabaseDatabase(r.client, r.uid, {
    timers,
    watch: (poke) => {
      pokes.add(poke);
      return () => pokes.delete(poke);
    },
  });
}

/** Collect what a listener hears. */
function listen(db: ReturnType<typeof database>, path: string) {
  const heard: Array<{ exists: boolean; data: unknown; fromCache: boolean }> = [];
  const errors: Array<{ code?: string }> = [];
  const off = db.doc(path).onSnapshot(
    (snap: SyncDocSnapshot) => heard.push({ exists: snap.exists, data: snap.data(), fromCache: snap.metadata?.fromCache === true }),
    (error) => errors.push(error),
  );
  return { heard, errors, off };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse('2026-11-16T09:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('documents are the signed-in learner’s rows', () => {
  it('reads, writes and deletes `data/users/<uid>/<name>` as the row (user_id, path)', async () => {
    const r = await rig();
    const db = database(r);
    const head = db.doc(`data/users/${r.uid}/progress`);
    const missing = head.get();
    await pass(100);
    expect((await missing).exists).toBe(false);

    const written = head.set({ kind: 'progress-sync', v: 1, body: '{}' });
    await pass(100);
    await written;
    expect(r.server.rowsOf(r.uid).map((row) => [row.user_id, row.path, row.data])).toEqual([[r.uid, 'progress', { kind: 'progress-sync', v: 1, body: '{}' }]]);

    const read = head.get();
    await pass(100);
    const snap = await read;
    expect(snap).toMatchObject({ id: 'progress', exists: true, metadata: { fromCache: false } });
    expect(snap.data()).toEqual({ kind: 'progress-sync', v: 1, body: '{}' });

    const gone = head.delete();
    await pass(100);
    await gone;
    expect(r.server.rowsOf(r.uid)).toEqual([]);
  });

  it('refuses any other learner’s path, or a strange name, before a request is made', async () => {
    const r = await rig();
    const db = database(r);
    const before = r.requests.length;
    expect(() => db.doc('data/users/someone-else/progress')).toThrow(TypeError);
    expect(() => db.doc(`data/users/${r.uid}/../x`)).toThrow(TypeError);
    expect(() => db.doc(`data/users/${r.uid}/a/b`)).toThrow(TypeError);
    expect(r.requests.length).toBe(before);
  });

  it('deleteAllExcept keeps one document and removes the rest', async () => {
    const r = await rig();
    const db = database(r);
    for (const name of ['progress', 'progress.g1.0', 'song.my-riff']) {
      const p = db.doc(`data/users/${r.uid}/${name}`).set({ n: name });
      await pass(60);
      await p;
    }
    const cleared = db.deleteAllExcept('progress');
    await pass(100);
    await cleared;
    expect(r.server.rowsOf(r.uid).map((row) => row.path)).toEqual(['progress']);
  });
});

describe('listening', () => {
  it('starts with a confirmed answer, then hears another device’s change through Realtime, once', async () => {
    const server = createFakeServer();
    const phone = await rig(server);
    await pass(61_000);
    const laptop = await rig(server); // same account, second device
    const db = database(phone);
    const { heard, errors } = listen(db, `data/users/${phone.uid}/progress`);
    await pass(200);
    expect(heard).toEqual([{ exists: false, data: undefined, fromCache: false }]);

    const write = database(laptop).doc(`data/users/${laptop.uid}/progress`).set({ gen: 'a' });
    await pass(200);
    await write;
    expect(heard.at(-1)).toEqual({ exists: true, data: { gen: 'a' }, fromCache: false });
    // A poke with nothing new delivers nothing more.
    const count = heard.length;
    phone.poke();
    await pass(200);
    expect(heard.length).toBe(count);
    expect(errors).toEqual([]);
  });

  it('a change missed while offline is found when the browser is back online (the poke), with a cheap look first', async () => {
    const server = createFakeServer();
    const phone = await rig(server);
    await pass(61_000);
    const laptop = await rig(server);
    const { heard } = listen(database(phone), `data/users/${phone.uid}/progress`);
    await pass(200);

    phone.transport.setOnline(false);
    const write = database(laptop).doc(`data/users/${laptop.uid}/progress`).set({ gen: 'while-away' });
    await pass(200);
    await write;
    expect(heard.at(-1)?.exists).toBe(false); // not heard: the phone was offline

    phone.transport.setOnline(true);
    phone.requests.length = 0;
    await pass(10_000); // past the gap between two pokes
    phone.poke();
    await pass(500);
    expect(heard.at(-1)).toMatchObject({ exists: true, data: { gen: 'while-away' } });
    const selects = phone.requests.filter((q): q is Extract<FakeRequest, { op: 'db.select' }> => q.op === 'db.select').map((q) => q.columns);
    expect(selects[0]).toBe('updated_at');
  });

  it('polls every few minutes when Realtime says nothing', async () => {
    const r = await rig();
    const { heard } = listen(database(r), `data/users/${r.uid}/progress`);
    await pass(200);
    // A change Realtime never announced (written behind its back).
    r.server.rows.set('x', { id: 'x', user_id: r.uid, path: 'progress', data: { gen: 'quiet' }, updated_at: '2026-11-16T09:00:01.000001+00:00' });
    await pass(POLL_MS - 1000);
    expect(heard.at(-1)?.exists).toBe(false);
    await pass(2000);
    expect(heard.at(-1)).toMatchObject({ exists: true, data: { gen: 'quiet' } });
  });

  it('offline from the start: no error, it keeps trying, and the first answer comes when the connection is back', async () => {
    const r = await rig();
    r.transport.setOnline(false);
    const { heard, errors } = listen(database(r), `data/users/${r.uid}/progress`);
    await pass(30_000);
    expect(heard).toEqual([]);
    expect(errors).toEqual([]);
    r.transport.setOnline(true);
    await pass(70_000);
    expect(heard).toEqual([{ exists: false, data: undefined, fromCache: false }]);
  });

  it('ends the listener when the learner is signed out, and when the table is missing', async () => {
    const r = await rig();
    const db = database(r);
    const signedOut = listen(db, `data/users/${r.uid}/progress`);
    await pass(200);
    // Signed out everywhere: the access token works until it expires, then refreshing fails.
    r.server.revokeSessions(r.uid);
    await pass(61 * 60_000);
    r.poke();
    await pass(500);
    expect(signedOut.errors.map((e) => e.code)).toEqual(['revoked']);

    const fresh = await rig(createFakeServer(), 'ben@example.com');
    fresh.server.tableMissing = true;
    const missing = listen(database(fresh), `data/users/${fresh.uid}/progress`);
    await pass(500);
    expect(missing.errors.map((e) => e.code)).toEqual(['setup_needed']);
  });

  it('a new database for the same learner on the same client (sync restarted, "Try again") still hears Realtime at once', async () => {
    const server = createFakeServer();
    const phone = await rig(server);
    await pass(61_000);
    const laptop = await rig(server);
    const path = `data/users/${phone.uid}/progress`;
    const first = listen(database(phone), path);
    await pass(200);
    // The old service stops and the new one starts straight away, while the old channel is still
    // leaving: realtime-js would hand that leaving channel back for the same name.
    first.off();
    const second = listen(database(phone), path);
    await pass(200);
    const write = database(laptop).doc(`data/users/${laptop.uid}/progress`).set({ gen: 'after-restart' });
    await pass(200);
    await write;
    await pass(1000); // seconds, far below the 3-minute poll
    expect(second.heard.at(-1)).toEqual({ exists: true, data: { gen: 'after-restart' }, fromCache: false });
    expect(second.errors).toEqual([]);
  });

  it('refresh() reads at once; the channel goes when the last listener does', async () => {
    const r = await rig();
    const db = database(r);
    const { heard, off } = listen(db, `data/users/${r.uid}/progress`);
    await pass(200);
    r.server.rows.set('x', { id: 'x', user_id: r.uid, path: 'progress', data: { gen: 'now' }, updated_at: 'later' });
    const looked = db.refresh();
    await pass(200);
    await looked;
    expect(heard.at(-1)).toMatchObject({ data: { gen: 'now' } });
    off();
    await pass(200);
    expect(r.server.log).toContain('rt.leave');
  });
});

describe('failures become the engine’s codes', () => {
  it('offline is "unavailable", a refused row is "setup_needed", a refused token is "unauthenticated", a session that cannot refresh is "revoked"', async () => {
    const r = await rig();
    const head = database(r).doc(`data/users/${r.uid}/progress`);
    const codeOf = async (p: Promise<unknown>): Promise<string> => {
      const settled = p.then(
        () => 'ok',
        (e: { code?: string }) => e.code ?? 'none',
      );
      await pass(200);
      return settled;
    };
    r.transport.setOnline(false);
    expect(await codeOf(head.set({ a: 1 }))).toBe('unavailable');
    r.transport.setOnline(true);
    r.server.failNext('db.upsert', 403, '42501', 'new row violates row-level security policy for table "sync_docs"');
    expect(await codeOf(head.set({ a: 1 }))).toBe('setup_needed');
    // The server refuses a token the client still thinks good: try again after a refresh.
    r.server.expireAccessTokens();
    expect(await codeOf(head.get())).toBe('unauthenticated');
    r.server.revokeSessions(r.uid);
    await pass(61 * 60_000);
    expect(await codeOf(head.get())).toBe('revoked');
  });
});

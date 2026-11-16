/**
 * The stand-in backend keeps Supabase's rules, so tests built on it mean something: row-level
 * security exactly as `supabase/schema.sql` writes it, one-time codes with Supabase's limits,
 * rotating refresh tokens, and Realtime that only tells a user about their own rows.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeClient, createFakeServer, memoryTransport, type FakeSupabaseServer } from './fake';
import type { AuthStorage, ChangePayload, SupabaseLike } from './types';

function memoryStorage(): AuthStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

const pass = (ms: number): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => undefined);

async function signIn(server: FakeSupabaseServer, client: SupabaseLike, email: string): Promise<string> {
  const sent = client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  await pass(50);
  expect((await sent).error).toBeNull();
  const verified = client.auth.verifyOtp({ email, token: server.lastCode(email) ?? '', type: 'email' });
  await pass(50);
  const { data, error } = await verified;
  expect(error).toBeNull();
  return data.session?.user.id ?? '';
}

/** Await a query while fake time passes. */
async function run<T>(query: PromiseLike<T>): Promise<T> {
  const promise = Promise.resolve(query);
  await pass(50);
  return promise;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse('2026-11-16T09:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('row-level security (the policies of schema.sql)', () => {
  it('a user reads, writes and deletes only their own rows; another user and the anonymous role reach none of them', async () => {
    const server = createFakeServer();
    const ana = createFakeClient(memoryTransport(server), { storage: memoryStorage() });
    const ben = createFakeClient(memoryTransport(server), { storage: memoryStorage() });
    const anon = createFakeClient(memoryTransport(server), { storage: memoryStorage() });
    const anaId = await signIn(server, ana, 'ana@example.com');
    const benId = await signIn(server, ben, 'ben@example.com');

    expect((await run(ana.from('sync_docs').upsert({ user_id: anaId, path: 'progress', data: { secret: 'ana' } }, { onConflict: 'user_id,path' }))).error).toBeNull();
    // Writing a row in someone else's name is refused (with check (auth.uid() = user_id)).
    const forged = await run(ben.from('sync_docs').upsert({ user_id: anaId, path: 'progress', data: { evil: true } }, { onConflict: 'user_id,path' }));
    expect(forged.error?.code).toBe('42501');
    expect(server.rowsOf(anaId)[0].data).toEqual({ secret: 'ana' });

    // Reading: ben sees nothing of ana's, even asking for her id outright; anon sees nothing at all.
    expect((await run(ben.from('sync_docs').select('data').eq('user_id', anaId))).data).toEqual([]);
    expect((await run(anon.from('sync_docs').select('*'))).data).toEqual([]);
    const anonWrite = await run(anon.from('sync_docs').upsert({ user_id: anaId, path: 'x', data: {} }, { onConflict: 'user_id,path' }));
    expect(anonWrite.error?.code).toBe('42501');

    // Deleting: ben's delete of ana's row matches nothing.
    await run(ben.from('sync_docs').delete().eq('user_id', anaId));
    expect(server.rowsOf(anaId)).toHaveLength(1);
    expect(benId).not.toBe(anaId);
  });

  it('an upsert updates the one row per (user, path) and moves updated_at forward', async () => {
    const server = createFakeServer();
    const ana = createFakeClient(memoryTransport(server), { storage: memoryStorage() });
    const id = await signIn(server, ana, 'ana@example.com');
    await run(ana.from('sync_docs').upsert({ user_id: id, path: 'progress', data: { n: 1 } }, { onConflict: 'user_id,path' }));
    const first = server.rowsOf(id)[0].updated_at;
    await run(ana.from('sync_docs').upsert({ user_id: id, path: 'progress', data: { n: 2 } }, { onConflict: 'user_id,path' }));
    expect(server.rowsOf(id)).toHaveLength(1);
    expect(server.rowsOf(id)[0].data).toEqual({ n: 2 });
    expect(server.rowsOf(id)[0].updated_at > first).toBe(true);
  });
});

describe('the schema’s limits', () => {
  it('a ceiling on rows per learner stops new rows but never the update of one that exists', async () => {
    const server = createFakeServer({ maxRowsPerUser: 2 });
    const ana = createFakeClient(memoryTransport(server), { storage: memoryStorage() });
    const id = await signIn(server, ana, 'ana@example.com');
    const put = (path: string, n: number) => run(ana.from('sync_docs').upsert({ user_id: id, path, data: { n } }, { onConflict: 'user_id,path' }));
    expect((await put('a', 1)).error).toBeNull();
    expect((await put('b', 1)).error).toBeNull();
    expect((await put('c', 1)).error?.code).toBe('54000');
    expect((await put('a', 2)).error).toBeNull();
    const big = await run(ana.from('sync_docs').upsert({ user_id: id, path: 'b', data: { text: 'x'.repeat(300_001) } }, { onConflict: 'user_id,path' }));
    expect(big.error?.code).toBe('23514');
  });
});

describe('one-time codes', () => {
  it('a code works once and for an hour', async () => {
    const server = createFakeServer();
    const client = createFakeClient(memoryTransport(server), { storage: memoryStorage() });
    await run(client.auth.signInWithOtp({ email: 'ana@example.com' }));
    const code = server.lastCode('ana@example.com') ?? '';
    expect(code).toMatch(/^\d{6}$/);
    expect((await run(client.auth.verifyOtp({ email: 'ana@example.com', token: code === '000000' ? '111111' : '000000', type: 'email' }))).error?.code).toBe('otp_expired');
    expect((await run(client.auth.verifyOtp({ email: 'ana@example.com', token: code, type: 'email' }))).error).toBeNull();
    expect((await run(client.auth.verifyOtp({ email: 'ana@example.com', token: code, type: 'email' }))).error?.code).toBe('otp_expired');

    await pass(61_000);
    await run(client.auth.signInWithOtp({ email: 'ana@example.com' }));
    const late = server.lastCode('ana@example.com') ?? '';
    await pass(61 * 60_000);
    expect((await run(client.auth.verifyOtp({ email: 'ana@example.com', token: late, type: 'email' }))).error?.code).toBe('otp_expired');
  });

  it('one code per address per minute, and only a few emails an hour in all', async () => {
    const server = createFakeServer({ emailsPerHour: 3 });
    const client = createFakeClient(memoryTransport(server), { storage: memoryStorage() });
    expect((await run(client.auth.signInWithOtp({ email: 'a@example.com' }))).error).toBeNull();
    const again = await run(client.auth.signInWithOtp({ email: 'a@example.com' }));
    expect(again.error?.message).toMatch(/after \d+ seconds/);
    await run(client.auth.signInWithOtp({ email: 'b@example.com' }));
    await run(client.auth.signInWithOtp({ email: 'c@example.com' }));
    const fourth = await run(client.auth.signInWithOtp({ email: 'd@example.com' }));
    expect(fourth.error).toMatchObject({ code: 'over_email_send_rate_limit', status: 429, message: 'email rate limit exceeded' });
    await pass(3_600_000);
    expect((await run(client.auth.signInWithOtp({ email: 'd@example.com' }))).error).toBeNull();
  });
});

describe('sessions', () => {
  it('keeps the session in the storage it is given, refreshes an expired token, and rotates the refresh token', async () => {
    const server = createFakeServer({ accessTtlSec: 600 });
    const storage = memoryStorage();
    const client = createFakeClient(memoryTransport(server), { storage });
    await signIn(server, client, 'ana@example.com');
    const first = JSON.parse(storage.map.get('session') ?? '{}') as { refresh_token: string; access_token: string };
    await pass(10 * 60_000);
    const { data } = await run(client.auth.getSession());
    expect(data.session?.access_token).not.toBe(first.access_token);
    // The old refresh token is spent: a second device holding it could not reuse it.
    expect((await server.handle({ op: 'auth.refresh', refreshToken: first.refresh_token })).error?.code).toBe('refresh_token_not_found');
  });

  it('offline with an expired token: no session for now, but it is kept for later; a revoked one is removed', async () => {
    const server = createFakeServer({ accessTtlSec: 600 });
    const storage = memoryStorage();
    const transport = memoryTransport(server);
    const client = createFakeClient(transport, { storage });
    const id = await signIn(server, client, 'ana@example.com');
    await pass(10 * 60_000);
    transport.setOnline(false);
    const offline = await run(client.auth.getSession());
    expect(offline.data.session).toBeNull();
    expect(offline.error?.name).toBe('AuthRetryableFetchError');
    expect(storage.map.has('session')).toBe(true);

    transport.setOnline(true);
    server.revokeSessions(id);
    const events: string[] = [];
    client.auth.onAuthStateChange((event) => events.push(event));
    const revoked = await run(client.auth.getSession());
    expect(revoked.data.session).toBeNull();
    expect(storage.map.has('session')).toBe(false);
    expect(events).toContain('SIGNED_OUT');
  });

  it('signing out everywhere ends the other devices’ sessions at their next refresh', async () => {
    const server = createFakeServer({ accessTtlSec: 600 });
    const phone = createFakeClient(memoryTransport(server), { storage: memoryStorage() });
    const laptop = createFakeClient(memoryTransport(server), { storage: memoryStorage() });
    await signIn(server, phone, 'ana@example.com');
    await pass(61_000);
    await signIn(server, laptop, 'ana@example.com');
    await run(phone.auth.signOut({ scope: 'global' }));
    await pass(10 * 60_000);
    expect((await run(laptop.auth.getSession())).data.session).toBeNull();
  });
});

describe('Realtime', () => {
  it('tells a user about their own rows only; a delete event carries nothing but the random row id', async () => {
    const server = createFakeServer();
    const ana = createFakeClient(memoryTransport(server), { storage: memoryStorage() });
    const ben = createFakeClient(memoryTransport(server), { storage: memoryStorage() });
    const anaId = await signIn(server, ana, 'ana@example.com');
    const benId = await signIn(server, ben, 'ben@example.com');
    const heard: Array<{ who: string; payload: ChangePayload }> = [];
    const listen = (client: SupabaseLike, who: string, filter: string | undefined, event: 'UPDATE' | 'INSERT' | 'DELETE' | '*') =>
      client
        .channel(`t-${who}-${event}`)
        .on('postgres_changes', { event, schema: 'public', table: 'sync_docs', filter }, (payload) => heard.push({ who, payload }))
        .subscribe();
    listen(ana, 'ana', `user_id=eq.${anaId}`, '*');
    // Ben tries to listen to ana's rows by naming her id: row security still hides them.
    listen(ben, 'ben-snoop', `user_id=eq.${anaId}`, '*');
    listen(ben, 'ben-deletes', undefined, 'DELETE');
    await pass(100);

    await run(ana.from('sync_docs').upsert({ user_id: anaId, path: 'progress', data: { n: 1 } }, { onConflict: 'user_id,path' }));
    await run(ana.from('sync_docs').delete().eq('user_id', anaId).eq('path', 'progress'));
    await pass(100);
    expect(heard.filter((h) => h.who === 'ana').map((h) => h.payload.eventType)).toEqual(['INSERT', 'DELETE']);
    // Inserts and updates are checked against row security: ben hears none of ana's.
    expect(heard.filter((h) => h.who === 'ben-snoop' && h.payload.eventType !== 'DELETE')).toEqual([]);
    // Deletes are not (the real service cannot check them), so they carry only the random row id.
    const deletes = heard.filter((h) => h.who.startsWith('ben'));
    expect(deletes.length).toBeGreaterThan(0);
    for (const d of deletes) {
      expect(Object.keys(d.payload.old)).toEqual(['id']);
      expect(d.payload.new).toEqual({});
      expect(JSON.stringify(d.payload)).not.toContain(anaId);
      expect(JSON.stringify(d.payload)).not.toContain('progress');
    }
    expect(benId).toBeTruthy();
  });
});

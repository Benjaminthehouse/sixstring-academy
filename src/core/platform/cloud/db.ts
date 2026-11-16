/**
 * The sync engine's document database (`doc(path).get/set/delete/onSnapshot`, see `sync.ts`) on
 * one Supabase table, so the standalone app and the Claude artifact share one merge path.
 *
 * A document `data/users/<uid>/<name>` is the row (user_id = uid, path = name) of `sync_docs`;
 * its body is the row's `data` (jsonb). Row-level security lets a signed-in learner reach only
 * rows with their own user_id, and this adapter refuses any other path before a request is made.
 *
 * Changes from other devices arrive through Realtime (inserts and updates of this learner's rows;
 * delete events are not subscribed: Supabase cannot check row security for them). Realtime is a
 * nudge, not the truth, so there is also polling: when a listener starts, when the page becomes
 * visible or gets focus, when the browser comes back online, when the channel reconnects, and
 * every few minutes while the page is open. A poll asks only for the row's `updated_at` and reads
 * the whole row when that moved. Network trouble never reaches the listener's error callback: it
 * keeps trying, as the artifact's own listener does, and the engine reports "unreachable" by its
 * load timer. Only a signed-out session or a missing table end the listener.
 */
import type { SyncDatabase, SyncDocRef, SyncDocSnapshot, SyncTimers } from '../sync';
import { tableErrorCode } from './errors';
import type { ChangePayload, ChannelLike, ChannelStatus, SupabaseLike } from './types';

/** The one table (see `supabase/schema.sql`). */
export const SYNC_TABLE = 'sync_docs';
/** How often an open page looks for changes when Realtime is quiet. */
export const POLL_MS = 3 * 60_000;
/** Pokes closer together than this (focus right after visibility) make one poll. */
const POKE_GAP_MS = 5_000;
const RETRY_MIN_MS = 5_000;
const RETRY_MAX_MS = 60_000;

/** An error the engine understands: `{ code }` (see `tableErrorCode`). */
export interface SyncFailure {
  code: string;
  message: string;
}
const fail = (code: string, message: string): SyncFailure => ({ code, message });

/** Codes after which a listener stops for good (the engine shuts down or pauses). */
const FINAL = new Set(['revoked', 'setup_needed']);

/** Options; tests pass fakes for the clock and the page's events. */
export interface SupabaseDatabaseOptions {
  timers: SyncTimers;
  /** Polling interval. Default 3 minutes. */
  pollMs?: number;
  /**
   * Call `poke` when it is worth looking for changes now (the page became visible, got focus, came
   * back online). Returns the cleanup. Default: those window and document events.
   */
  watch?: (poke: () => void) => () => void;
  now?: () => number;
}

/** The engine's database plus what "delete my cloud data" and "Sync now" need. */
export interface SupabaseDatabase extends SyncDatabase {
  /** Look for changes to every listened document now. Resolves when the look is over. */
  refresh(): Promise<void>;
  /** Delete every one of this learner's rows except `keep` (a document name such as `progress`). */
  deleteAllExcept(keep: string): Promise<void>;
  /** Stop listening and polling. */
  close(): void;
}

type Row = Record<string, unknown>;
const isRec = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);
const NAME = /^[A-Za-z0-9_.~:@+-]{1,200}$/;

function browserWatch(poke: () => void): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined;
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') poke();
  };
  window.addEventListener('focus', poke);
  window.addEventListener('online', poke);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener('focus', poke);
    window.removeEventListener('online', poke);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

interface Listener {
  name: string;
  next: (snapshot: SyncDocSnapshot) => void;
  error?: (error: { code?: string; message?: string }) => void;
  /** What was last delivered (`data` as JSON, or `-` for "no row"), or undefined before the first answer. */
  last: string | undefined;
  /** The row's `updated_at` when last read (`-` for no row). */
  version: string | undefined;
  /** A read is under way. */
  reading: boolean;
  /** Another read was asked for while one was under way. */
  again: boolean;
  retry: unknown;
  failures: number;
  dead: boolean;
}

/** Build the engine's database on a Supabase client, for the signed-in learner `uid`. */
export function supabaseDatabase(client: SupabaseLike, uid: string, options: SupabaseDatabaseOptions): SupabaseDatabase {
  const timers = options.timers;
  const pollMs = options.pollMs ?? POLL_MS;
  const watch = options.watch ?? browserWatch;
  const now = options.now ?? (() => Date.now());
  const prefix = `data/users/${uid}/`;

  const listeners = new Set<Listener>();
  let channel: ChannelLike | null = null;
  let channelDropped = false;
  let pollTimer: unknown = null;
  let unwatch: (() => void) | null = null;
  let lastPoke = -Infinity;
  let closed = false;

  /** The document name of a path in this learner's space; anything else is refused before a request. */
  function nameOf(path: string): string {
    if (!path.startsWith(prefix)) throw new TypeError('This document is outside the signed-in learner’s space.');
    const name = path.slice(prefix.length);
    if (!NAME.test(name) || name === '.' || name === '..') throw new TypeError('Not a document name.');
    return name;
  }

  /** The session must still be this learner's. Offline with an expired token is "try later", not "signed out". */
  async function ensureSession(): Promise<void> {
    let result: Awaited<ReturnType<SupabaseLike['auth']['getSession']>>;
    try {
      result = await client.auth.getSession();
    } catch {
      throw fail('unavailable', 'The session could not be checked.');
    }
    const session = result.data?.session ?? null;
    if (!session) {
      if (result.error) throw fail('unavailable', 'The session could not be refreshed yet.');
      throw fail('revoked', 'Signed out.');
    }
    if (session.user?.id !== uid) throw fail('revoked', 'Signed in as someone else now.');
  }

  async function readRow(name: string): Promise<{ data: Row; updatedAt: string } | null> {
    await ensureSession();
    const result = await client.from(SYNC_TABLE).select('data,updated_at').eq('user_id', uid).eq('path', name).maybeSingle();
    if (result.error) throw fail(tableErrorCode(result.error, result.status), result.error.message);
    const row = result.data;
    if (!row) return null;
    return { data: isRec(row.data) ? row.data : {}, updatedAt: String(row.updated_at ?? '') };
  }

  async function readVersion(name: string): Promise<string> {
    await ensureSession();
    const result = await client.from(SYNC_TABLE).select('updated_at').eq('user_id', uid).eq('path', name).maybeSingle();
    if (result.error) throw fail(tableErrorCode(result.error, result.status), result.error.message);
    return result.data ? String(result.data.updated_at ?? '') : '-';
  }

  const snapshotOf = (name: string, row: { data: Row } | null): SyncDocSnapshot => {
    const copy = row ? (JSON.parse(JSON.stringify(row.data)) as Row) : undefined;
    return { id: name, exists: row !== null, data: () => copy, metadata: { fromCache: false, hasPendingWrites: false } };
  };

  function deliver(listener: Listener, row: { data: Row; updatedAt: string } | null): void {
    if (listener.dead) return;
    const text = row ? JSON.stringify(row.data) : '-';
    listener.version = row ? row.updatedAt : '-';
    listener.failures = 0;
    if (text === listener.last) return;
    listener.last = text;
    listener.next(snapshotOf(listener.name, row));
  }

  function end(listener: Listener, code: string, message: string): void {
    if (listener.dead) return;
    listener.dead = true;
    listener.retry = clearTimer(listener.retry);
    listeners.delete(listener);
    listener.error?.({ code, message });
    if (listeners.size === 0) stopWatching();
  }

  function clearTimer(handle: unknown): null {
    if (handle !== null) timers.clear(handle);
    return null;
  }

  /** Read a listened document and deliver it if it changed. Failures retry; the final ones end the listener. */
  async function read(listener: Listener): Promise<void> {
    if (listener.dead) return;
    if (listener.reading) {
      listener.again = true;
      return;
    }
    listener.reading = true;
    listener.retry = clearTimer(listener.retry);
    try {
      do {
        listener.again = false;
        deliver(listener, await readRow(listener.name));
      } while (listener.again && !listener.dead);
    } catch (error) {
      const failure = error as Partial<SyncFailure>;
      const code = typeof failure.code === 'string' ? failure.code : 'unavailable';
      if (FINAL.has(code)) end(listener, code, String(failure.message ?? code));
      else if (!listener.dead && !closed) {
        listener.failures += 1;
        const wait = Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** Math.min(listener.failures - 1, 6));
        listener.retry = timers.set(() => {
          listener.retry = null;
          void read(listener);
        }, wait);
      }
    } finally {
      listener.reading = false;
    }
  }

  /** Cheap look at one listened document: read it whole only when its version moved. */
  async function peek(listener: Listener): Promise<void> {
    if (listener.dead) return;
    if (listener.last === undefined || listener.retry !== null) return read(listener);
    try {
      const version = await readVersion(listener.name);
      if (version !== listener.version) await read(listener);
    } catch (error) {
      const failure = error as Partial<SyncFailure>;
      if (typeof failure.code === 'string' && FINAL.has(failure.code)) end(listener, failure.code, String(failure.message ?? failure.code));
      // Anything else: the next poke or poll tries again.
    }
  }

  async function pollAll(): Promise<void> {
    lastPoke = now();
    await Promise.all([...listeners].map((listener) => peek(listener)));
  }

  function poke(): void {
    if (closed || listeners.size === 0) return;
    if (now() - lastPoke < POKE_GAP_MS) return;
    void pollAll();
  }

  function onChange(payload: ChangePayload): void {
    const row = payload.new;
    if (!isRec(row) || row.user_id !== uid || typeof row.path !== 'string') return;
    for (const listener of listeners) {
      if (listener.name !== row.path) continue;
      // Use the row Realtime carried when it is whole; otherwise read it.
      const whole = isRec(row.data) && (payload.errors === undefined || payload.errors === null || (Array.isArray(payload.errors) && payload.errors.length === 0));
      if (whole && !listener.reading && listener.retry === null) deliver(listener, { data: row.data as Row, updatedAt: String(row.updated_at ?? '') });
      else void read(listener);
    }
  }

  function onStatus(status: ChannelStatus): void {
    if (status === 'SUBSCRIBED') {
      // Back after a drop: whatever changed meanwhile was not delivered.
      if (channelDropped) {
        channelDropped = false;
        lastPoke = -Infinity;
        poke();
      }
    } else channelDropped = true;
  }

  function startWatching(): void {
    if (channel || closed) return;
    const filter = `user_id=eq.${uid}`;
    channel = client
      .channel(`sync-docs-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: SYNC_TABLE, filter }, onChange)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: SYNC_TABLE, filter }, onChange)
      .subscribe((status) => onStatus(status));
    const schedule = (): void => {
      pollTimer = timers.set(() => {
        pollTimer = null;
        void pollAll();
        if (channel) schedule();
      }, pollMs);
    };
    schedule();
    unwatch = watch(poke);
  }

  function stopWatching(): void {
    pollTimer = clearTimer(pollTimer);
    unwatch?.();
    unwatch = null;
    const old = channel;
    channel = null;
    channelDropped = false;
    if (old) void client.removeChannel(old).catch(() => undefined);
  }

  function doc(path: string): SyncDocRef {
    const name = nameOf(path);
    return {
      async get() {
        const row = await readRow(name);
        return snapshotOf(name, row);
      },
      async set(data) {
        await ensureSession();
        const result = await client.from(SYNC_TABLE).upsert({ user_id: uid, path: name, data }, { onConflict: 'user_id,path' });
        if (result.error) throw fail(tableErrorCode(result.error, result.status), result.error.message);
      },
      async delete() {
        await ensureSession();
        const result = await client.from(SYNC_TABLE).delete().eq('user_id', uid).eq('path', name);
        if (result.error) throw fail(tableErrorCode(result.error, result.status), result.error.message);
      },
      onSnapshot(next, error) {
        const listener: Listener = { name, next, error, last: undefined, version: undefined, reading: false, again: false, retry: null, failures: 0, dead: false };
        if (closed) return () => undefined;
        listeners.add(listener);
        startWatching();
        void read(listener);
        return () => {
          if (listener.dead) return;
          listener.dead = true;
          listener.retry = clearTimer(listener.retry);
          listeners.delete(listener);
          if (listeners.size === 0) stopWatching();
        };
      },
    };
  }

  return {
    doc,
    async refresh() {
      await Promise.all([...listeners].map((listener) => read(listener)));
    },
    async deleteAllExcept(keep: string) {
      await ensureSession();
      const result = await client.from(SYNC_TABLE).delete().eq('user_id', uid).neq('path', keep);
      if (result.error) throw fail(tableErrorCode(result.error, result.status), result.error.message);
    },
    close() {
      closed = true;
      for (const listener of listeners) {
        listener.dead = true;
        listener.retry = clearTimer(listener.retry);
      }
      listeners.clear();
      stopWatching();
    },
  };
}

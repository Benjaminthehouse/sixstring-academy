/**
 * Accounts: sign in with an email and a 6-digit code, stay signed in, sign out, delete the cloud
 * copy. The sync engine (`sync.ts`) asks `accountLink()` for the signed-in learner's database and
 * merges exactly as it does inside Claude.
 *
 * Why a typed code and not a magic link: a link opens the phone's browser, not the app installed
 * on the home screen, so the learner would end up signed in somewhere else. The code works in
 * whatever window asked for it.
 *
 *   unavailable                     this copy has no accounts (no project configured, or inside Claude)
 *   starting                        reading the stored session
 *   signed-out  --sendCode-->       code-sent (the address and when; kept across a reload, so
 *                                   switching to the mail app and back loses nothing)
 *   code-sent   --verifyCode-->     signed-in (sync restarts on the account)
 *   signed-in   --signOut-->        signed-out (keep this device's progress, or remove it and reload)
 *   signed-in   --deleteCloudData-> signed-out (the cloud copy is replaced by an "erased" marker)
 *
 * The session (tokens) lives in `sync.auth.*`, the pending code in `sync.account.*`: both are
 * device keys, never in a backup, never synced. Nothing here logs.
 */
import { erasedHeadDoc, forgetSyncMemory, getSyncStatus, HEAD_DOC, isErasedHeadDoc, restartCloudSync, stopCloudSync, syncNow, type AccountLink, type SyncStatus, type SyncTimers } from '../sync';
import { readRaw, remove, writeRaw } from '../storage';
import { authStorage, loadSupabase, storedSessionUser } from './client';
import { cloudConfig, cloudUnavailableReason, type CloudConfig, type CloudUnavailable } from './config';
import { supabaseDatabase, type SupabaseDatabase } from './db';
import { CODE_LIFETIME_MS, accountError, codeDigits, isNetworkError, looksLikeEmail, sendCodeError, verifyCodeError, type AccountError } from './errors';
import type { AuthEvent, AuthStorage, SessionLike, SupabaseLike, UserLike } from './types';

/** Where signing in stands. */
export type AccountPhase = 'unavailable' | 'starting' | 'signed-out' | 'code-sent' | 'signed-in';

/** What is under way. */
export type AccountBusy = 'sending' | 'verifying' | 'signing-out' | 'deleting' | null;

/**
 * Something to tell the learner once: signed out by the service (an expired session, or another
 * tab), the cloud copy deleted elsewhere, deleted here, or this device's progress removed.
 */
export type AccountNotice = 'signed-out' | 'erased' | 'deleted' | 'removed' | null;

/** A snapshot of the account. A new object whenever anything changes. */
export interface AccountState {
  phase: AccountPhase;
  /** Why accounts are not offered (phase `unavailable`). */
  unavailable: CloudUnavailable | null;
  /** Signed in as, or the address the code went to (or the one typed before "Use another email"). */
  email: string | null;
  userId: string | null;
  /** When the last code was sent. */
  sentAt: number | null;
  busy: AccountBusy;
  /** The last action's problem, for the form. */
  error: AccountError | null;
  notice: AccountNotice;
}

/** What the account layer needs; tests pass fakes. */
export interface AccountDeps {
  config: () => CloudConfig | null;
  unavailable: () => CloudUnavailable | null;
  client: (config: CloudConfig) => Promise<SupabaseLike>;
  /** Where the client keeps its session (read here only for an offline start). */
  sessionStorage: AuthStorage;
  /** Small device-only memory: the pending code, a notice for after a reload. */
  kv: { read(key: string): string | null; write(key: string, value: string): void; remove(key: string): void };
  database: (client: SupabaseLike, uid: string) => SupabaseDatabase;
  sync: { restart(): Promise<SyncStatus>; stop(): void; flush(): Promise<void>; status(): SyncStatus };
  /** Forget what this device knew about the cloud copy. */
  forgetSync: () => void;
  /** Erase this device's progress, data and songs (sign out with "remove"). */
  removeLocal: () => Promise<void>;
  reload: () => void;
  now: () => number;
  online: () => boolean;
  timers: SyncTimers;
  /** Longest wait for unsent changes before signing out. Default 10 s. */
  flushTimeoutMs?: number;
}

/** The account service. Use the module-level functions unless you are testing. */
export interface Accounts {
  state(): AccountState;
  subscribe(listener: () => void): () => void;
  /** Read the stored session once (safe to call often). */
  ready(): Promise<AccountState>;
  /** Email a sign-in code. Resolves true when it was sent. */
  sendCode(email: string): Promise<boolean>;
  /** Check the code from the email. Resolves true when signed in. */
  verifyCode(code: string): Promise<boolean>;
  /** Back from "enter the code" to the email field. */
  changeEmail(): void;
  /**
   * Sign out of this device. `removeLocal`: also erase this device's progress (it stays in the
   * account), then reload; refused while changes have not reached the cloud.
   */
  signOut(options: { removeLocal: boolean }): Promise<boolean>;
  /** Delete the learner's rows (an "erased" marker stays), sign out everywhere, keep this device's progress. */
  deleteCloudData(): Promise<boolean>;
  clearError(): void;
  clearNotice(): void;
  /** The signed-in learner's database, for the sync engine; null when nobody is signed in. */
  link(): Promise<AccountLink | null>;
}

const PENDING_KEY = 'sync.account.pending';
const NOTICE_KEY = 'sync.account.notice';
const NOTICES: readonly AccountNotice[] = ['signed-out', 'erased', 'deleted', 'removed'];

/** Create the account service. Production code uses the shared one (`getAccounts`). */
export function createAccounts(deps: AccountDeps): Accounts {
  const flushTimeoutMs = deps.flushTimeoutMs ?? 10_000;
  let snapshot: AccountState = { phase: 'starting', unavailable: null, email: null, userId: null, sentAt: null, busy: null, error: null, notice: null };
  const listeners = new Set<() => void>();
  let client: SupabaseLike | null = null;
  let starting: Promise<AccountState> | null = null;
  /** Signing out on purpose: the client's SIGNED_OUT is ours, not news. */
  let leaving = false;

  const set = (patch: Partial<AccountState>): void => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of [...listeners]) listener();
  };

  const readPending = (): { email: string; sentAt: number } | null => {
    try {
      const value = JSON.parse(deps.kv.read(PENDING_KEY) ?? 'null') as { email?: unknown; sentAt?: unknown } | null;
      if (value && typeof value.email === 'string' && typeof value.sentAt === 'number') return { email: value.email, sentAt: value.sentAt };
    } catch {
      /* unreadable: no pending code */
    }
    return null;
  };
  const writePending = (email: string, sentAt: number): void => {
    try {
      deps.kv.write(PENDING_KEY, JSON.stringify({ email, sentAt }));
    } catch {
      /* storage full or blocked: the code still works in this visit */
    }
  };
  const clearPending = (): void => {
    try {
      deps.kv.remove(PENDING_KEY);
    } catch {
      /* nothing to clear */
    }
  };
  const takeStoredNotice = (): AccountNotice => {
    try {
      const value = deps.kv.read(NOTICE_KEY);
      deps.kv.remove(NOTICE_KEY);
      return NOTICES.includes(value as AccountNotice) ? (value as AccountNotice) : null;
    } catch {
      return null;
    }
  };

  const signedIn = (user: UserLike | { id: string; email: string | null }, extra: Partial<AccountState> = {}): void => {
    set({ phase: 'signed-in', userId: user.id, email: user.email ?? snapshot.email, sentAt: null, error: null, ...extra });
  };

  const signedOutOrPending = (extra: Partial<AccountState> = {}): void => {
    const pending = readPending();
    if (pending && deps.now() - pending.sentAt < CODE_LIFETIME_MS) set({ phase: 'code-sent', email: pending.email, sentAt: pending.sentAt, userId: null, ...extra });
    else set({ phase: 'signed-out', userId: null, sentAt: null, ...extra });
  };

  function onAuth(event: AuthEvent, session: SessionLike | null): void {
    // Our own sign-out, or the first read of the session (init decides that one).
    if (leaving || snapshot.phase === 'starting') return;
    if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
      // Another tab signed in (or the account changed): follow it.
      if (snapshot.phase !== 'signed-in' || snapshot.userId !== session.user.id) {
        clearPending();
        signedIn(session.user, { notice: null });
        void deps.sync.restart();
      }
    } else if (event === 'SIGNED_OUT' && snapshot.phase === 'signed-in') {
      // The session could not be refreshed any more, or another tab signed out.
      set({ phase: 'signed-out', userId: null, notice: 'signed-out', busy: null });
      void deps.sync.restart();
    }
  }

  async function init(): Promise<AccountState> {
    const config = deps.config();
    if (!config) {
      set({ phase: 'unavailable', unavailable: deps.unavailable() });
      return snapshot;
    }
    const notice = takeStoredNotice();
    // A session on this device is enough to say "signed in", even before the client has loaded or while offline.
    const stored = storedSessionUser(deps.sessionStorage);
    try {
      client = await deps.client(config);
    } catch {
      client = null;
      if (stored) signedIn(stored, { notice });
      else signedOutOrPending({ notice });
      // The client could not load (offline on a first visit): try again when the connection is back.
      if (typeof window !== 'undefined') {
        const retry = (): void => {
          window.removeEventListener('online', retry);
          starting = null;
          void ready().then(() => deps.sync.restart());
        };
        window.addEventListener('online', retry);
      }
      return snapshot;
    }
    client.auth.onAuthStateChange((event, session) => {
      // Never call the client from inside its own callback: it may be holding its lock.
      deps.timers.set(() => onAuth(event, session), 0);
    });
    let result: Awaited<ReturnType<SupabaseLike['auth']['getSession']>>;
    try {
      result = await client.auth.getSession();
    } catch {
      result = { data: { session: null }, error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 } };
    }
    const session = result.data?.session ?? null;
    if (session) signedIn(session.user, { notice });
    else if (stored && isNetworkError(result.error)) signedIn(stored, { notice }); // offline with an expired token: still signed in
    else signedOutOrPending({ notice: notice ?? (stored ? 'signed-out' : null) });
    return snapshot;
  }

  function ready(): Promise<AccountState> {
    starting ??= init().catch(() => {
      set({ phase: 'signed-out' });
      return snapshot;
    });
    return starting;
  }

  async function sendCode(rawEmail: string): Promise<boolean> {
    await ready();
    if (snapshot.busy || (snapshot.phase !== 'signed-out' && snapshot.phase !== 'code-sent')) return false;
    const email = rawEmail.trim().toLowerCase();
    if (!looksLikeEmail(email)) {
      set({ email: rawEmail.trim(), error: accountError('invalid-email') });
      return false;
    }
    if (!deps.online() || !client) {
      set({ email, error: accountError('offline') });
      return false;
    }
    set({ busy: 'sending', error: null, email, notice: null });
    let result: Awaited<ReturnType<SupabaseLike['auth']['signInWithOtp']>>;
    try {
      result = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    } catch {
      result = { data: null, error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 } };
    }
    if (result.error) {
      const problem = sendCodeError(result.error, deps.online());
      if (problem.kind === 'wait') {
        // A code went to this address a moment ago: it is the one to type.
        const pending = readPending();
        const sentAt = pending && pending.email === email ? pending.sentAt : deps.now() - Math.max(0, 60 - (problem.retryInSec ?? 60)) * 1000;
        writePending(email, sentAt);
        set({ phase: 'code-sent', busy: null, sentAt, error: problem });
        return false;
      }
      set({ busy: null, error: problem });
      return false;
    }
    const sentAt = deps.now();
    writePending(email, sentAt);
    set({ phase: 'code-sent', busy: null, email, sentAt, error: null });
    return true;
  }

  async function verifyCode(raw: string): Promise<boolean> {
    await ready();
    if (snapshot.busy || snapshot.phase !== 'code-sent' || !snapshot.email) return false;
    const code = codeDigits(raw);
    if (!/^\d{6,10}$/.test(code)) {
      set({ error: accountError('invalid-code') });
      return false;
    }
    if (!deps.online() || !client) {
      set({ error: accountError('offline') });
      return false;
    }
    set({ busy: 'verifying', error: null });
    let result: Awaited<ReturnType<SupabaseLike['auth']['verifyOtp']>>;
    try {
      result = await client.auth.verifyOtp({ email: snapshot.email, token: code, type: 'email' });
    } catch {
      result = { data: { session: null, user: null }, error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 } };
    }
    const user = result.data?.session?.user ?? result.data?.user ?? null;
    if (result.error || !user) {
      set({ busy: null, error: verifyCodeError(result.error ?? { message: 'no session', status: 500 }, { online: deps.online(), sentAt: snapshot.sentAt, now: deps.now() }) });
      return false;
    }
    clearPending();
    await forgetIfErased(user.id);
    signedIn(user, { busy: null, notice: null });
    // Sync starts on the account: this device's progress is merged with the cloud copy, never replaced by it unless it is untouched.
    await deps.sync.restart();
    return true;
  }

  /**
   * Signing in on purpose where the cloud copy was deleted: this device's memory of that copy is
   * stale (it was signed out before it could see the deletion), so forget it and let this device
   * start a fresh copy. Otherwise the engine would take it for a device still syncing the deleted
   * copy and sign the learner straight out again. Nothing is lost: the cloud holds only the marker.
   */
  async function forgetIfErased(uid: string): Promise<void> {
    if (!client) return;
    const database = deps.database(client, uid);
    try {
      const head = await database.doc(`data/users/${uid}/${HEAD_DOC}`).get();
      if (head.exists && isErasedHeadDoc(head.data())) deps.forgetSync();
    } catch {
      /* not readable right now: the engine looks again (at worst this device stops, as before) */
    } finally {
      database.close();
    }
  }

  function changeEmail(): void {
    if (snapshot.busy || snapshot.phase !== 'code-sent') return;
    clearPending();
    set({ phase: 'signed-out', sentAt: null, error: null });
  }

  /** Wait for unsent changes, at most `flushTimeoutMs`. */
  async function settleChanges(): Promise<void> {
    const status = deps.sync.status();
    if (status.provider !== 'account' || !status.pending) return;
    let timer: unknown = null;
    await Promise.race([deps.sync.flush().catch(() => undefined), new Promise<void>((resolve) => (timer = deps.timers.set(resolve, flushTimeoutMs)))]);
    if (timer !== null) deps.timers.clear(timer);
  }

  async function signOut({ removeLocal }: { removeLocal: boolean }): Promise<boolean> {
    await ready();
    if (snapshot.busy || snapshot.phase !== 'signed-in') return false;
    set({ busy: 'signing-out', error: null });
    await settleChanges();
    if (removeLocal && deps.sync.status().pending) {
      set({ busy: null, error: accountError('unsynced') });
      return false;
    }
    leaving = true;
    try {
      deps.sync.stop();
      try {
        await client?.auth.signOut({ scope: 'local' });
      } catch {
        /* the local session goes either way */
      }
      clearPending();
      if (removeLocal) {
        // The next sign-in here starts afresh and takes the account's copy as it is.
        deps.forgetSync();
        try {
          deps.kv.write(NOTICE_KEY, 'removed');
        } catch {
          /* the notice is a nicety */
        }
        await deps.removeLocal();
        deps.reload();
        return true;
      }
      set({ phase: 'signed-out', userId: null, busy: null, notice: null });
    } finally {
      leaving = false;
    }
    await deps.sync.restart();
    return true;
  }

  async function deleteCloudData(): Promise<boolean> {
    await ready();
    if (snapshot.busy || snapshot.phase !== 'signed-in' || !client || !snapshot.userId) return false;
    if (!deps.online()) {
      set({ error: accountError('offline') });
      return false;
    }
    const uid = snapshot.userId;
    set({ busy: 'deleting', error: null });
    deps.sync.stop();
    const database = deps.database(client, uid);
    try {
      // The marker first: devices that are syncing see it and stop, instead of writing their copy back.
      await database.doc(`data/users/${uid}/${HEAD_DOC}`).set(erasedHeadDoc(deps.now()));
      await database.deleteAllExcept(HEAD_DOC);
    } catch (error) {
      database.close();
      const code = (error as { code?: unknown }).code;
      set({ busy: null, error: accountError(code === 'unavailable' && !deps.online() ? 'offline' : 'server') });
      await deps.sync.restart();
      return false;
    }
    database.close();
    leaving = true;
    try {
      // Everywhere: other devices' sessions end at their next refresh.
      const { error } = await client.auth.signOut({ scope: 'global' }).catch(() => ({ error: { message: 'failed' } }));
      if (error) await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
      deps.forgetSync();
      clearPending();
      set({ phase: 'signed-out', userId: null, busy: null, notice: 'deleted' });
    } finally {
      leaving = false;
    }
    await deps.sync.restart();
    return true;
  }

  async function handleErased(): Promise<void> {
    if (snapshot.phase !== 'signed-in') return;
    leaving = true;
    try {
      await client?.auth.signOut({ scope: 'local' }).catch(() => undefined);
      set({ phase: 'signed-out', userId: null, busy: null, notice: 'erased' });
    } finally {
      leaving = false;
    }
    await deps.sync.restart();
  }

  async function link(): Promise<AccountLink | null> {
    await ready();
    if (snapshot.phase !== 'signed-in' || !snapshot.userId) return null;
    if (!client) throw new Error('The account service could not be loaded yet.');
    const uid = snapshot.userId;
    return { database: deps.database(client, uid), uid, onErased: () => void handleErased() };
  }

  return {
    state: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    ready,
    sendCode,
    verifyCode,
    changeEmail,
    signOut,
    deleteCloudData,
    clearError: () => {
      if (snapshot.error) set({ error: null });
    },
    clearNotice: () => {
      if (snapshot.notice) set({ notice: null });
    },
    link,
  };
}

// ---------------------------------------------------------------------------------------------
// The shared instance
// ---------------------------------------------------------------------------------------------

const timers: SyncTimers = { set: (fn, ms) => setTimeout(fn, ms), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) };

async function removeThisDevicesData(): Promise<void> {
  // Loaded on demand: the platform layer must not pull the progress module in at import time.
  const progress = await import('@/core/progress');
  await progress.resetEverything({ keepPrefs: false, deleteSongs: true });
  // Removing is the point: no copy is kept for Undo on this device.
  progress.discardUndo();
}

let shared: Accounts | null = null;

/** The app's account service. */
export function getAccounts(): Accounts {
  shared ??= createAccounts({
    config: cloudConfig,
    unavailable: cloudUnavailableReason,
    client: loadSupabase,
    sessionStorage: authStorage(),
    kv: { read: readRaw, write: (key, value) => void writeRaw(key, value), remove },
    database: (client, uid) => supabaseDatabase(client, uid, { timers }),
    sync: { restart: restartCloudSync, stop: stopCloudSync, flush: syncNow, status: getSyncStatus },
    forgetSync: forgetSyncMemory,
    removeLocal: removeThisDevicesData,
    reload: () => window.location.reload(),
    now: () => Date.now(),
    online: () => typeof navigator === 'undefined' || navigator.onLine !== false,
    timers,
  });
  return shared;
}

/** For the sync engine: the signed-in learner's database, or null. */
export function accountLink(): Promise<AccountLink | null> {
  return getAccounts().link();
}

/** The current account snapshot (stable until it changes), for `useSyncExternalStore`. */
export function getAccountState(): AccountState {
  return getAccounts().state();
}

/** Be told when the account snapshot changes. Returns the unsubscribe function. */
export function subscribeAccount(listener: () => void): () => void {
  return getAccounts().subscribe(listener);
}

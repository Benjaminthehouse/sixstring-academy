/**
 * Optional cloud sync of the learner's progress, for the Claude-artifact host only.
 *
 * When the page is published with the `db` and `user` capabilities, the progress export is kept
 * in the viewer's private subtree of the artifact's database (`data/users/<id>/progress`, which
 * nobody else can read, the artifact's owner included), so the same learner sees the same
 * progress on every device. In the standalone app, and wherever the capabilities are missing,
 * this module does nothing and reports `off`.
 *
 * HOW TWO COPIES ARE MERGED
 *
 *  1. The change-stamp decides whether there is anything to do: a cloud copy this device wrote
 *     or already merged is skipped.
 *  2. Otherwise the cloud copy is imported with the progress module's `newest-wins` strategy,
 *     which merges per item rather than per file: the newer side's profile, preferences, hearts
 *     and quests; per day the higher XP and time; per skill the later record with the best
 *     scores and crowns of both; achievements, cosmetics, favourites and the log as a union;
 *     total XP and gems as the larger of both. (`core/progress/merge.ts` has the full table.)
 *  3. Two guards run on the result, because losing either would hurt most:
 *       - total XP is never below the higher of the two sides;
 *       - the streak is never shorter than the merged day history proves. Two devices that each
 *         saw only part of an unbroken run (50 days on the laptop, then today on the phone) are
 *         joined into one streak of 51 instead of keeping "the latest device's" 1.
 *  4. If the merged result holds anything the cloud copy lacks, it is written back.
 *
 * Two things are taken over whole instead of merged:
 *   - a deliberate reset (or a backup restored with "replace"). It starts a new epoch, and
 *     devices that synced under an older epoch adopt the new state rather than merging their old
 *     progress back in;
 *   - the cloud copy, by an install nobody has used yet. Merging a blank slate in would let "the
 *     newer side" overwrite the learner's hearts, quests and streak freezes with defaults.
 *
 * Nothing is imported or written when the cloud copy and the local state hold the same progress
 * (only bookkeeping differs), which also keeps two tabs of one browser from echoing each other.
 *
 * WRITING is debounced and rate-limited, one write at a time, only when something changed, and
 * never before the cloud copy has been read (a fresh device must not overwrite a full one).
 * Transient failures back off exponentially; nothing here ever reloads the page. A document
 * holds at most 256 KiB, so a large export is split into immutable part documents and a small
 * head document that names them; the head is written last, so readers never see half a save.
 */
import { claudeCapability, host as currentHost, type Host } from './env';
import { readJSON, writeJSON } from './storage';

// ---------------------------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------------------------

/** The four states the profile screen shows. */
export type SyncState = 'off' | 'syncing' | 'synced' | 'error';

/** More precisely why sync is off or failing. */
export type SyncIssue =
  | 'standalone' // not running inside Claude: there is nothing to sync with
  | 'not-offered' // inside Claude, but the page has no database or identity for this viewer
  | 'unreachable' // the cloud copy could not be read yet (offline, slow network)
  | 'retrying' // writes keep failing; still trying, with longer and longer pauses
  | 'read-only' // this viewer may not write their data (view-only access)
  | 'storage-full' // the artifact's database is out of room
  | 'update-needed' // the cloud copy was written by a newer version of the app
  | 'revoked'; // access was withdrawn while the page was open

/** A snapshot of the sync service. A new object whenever anything changes. */
export interface SyncStatus {
  state: SyncState;
  issue: SyncIssue | null;
  /** One plain sentence for the profile screen. */
  message: string;
  /** When this device and the cloud last agreed (epoch ms), if ever. */
  lastSyncedAt: number | null;
  /** True while local changes are waiting to be written. */
  pending: boolean;
}

/** The slice of the progress store that sync needs. `getProgressStore()` provides all of it. */
export interface SyncProgressPort {
  /** Everything as one JSON-serialisable object with its change-stamp. */
  exportData(): { stamp: string; state: unknown };
  /** Import an export object: `newest-wins` merges per item, `replace` overwrites. */
  importData(data: unknown, strategy: 'replace' | 'newest-wins'): { ok: true } | { ok: false; reason: string; detail?: string };
  /** Changes whenever the state changes. */
  changeStamp(): string;
  /** Call `listener` after every state change. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Call `handler` when the learner reset or replaced their data. Returns the unsubscribe function. */
  onReplaced(handler: () => void): () => void;
}

/** Timers the service uses; tests pass fakes. */
export interface SyncTimers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

/** What the service needs from its surroundings; tests swap these for fakes. */
export interface SyncDeps {
  host: () => Host;
  capability: <T>(name: string) => Promise<T | null>;
  /** The progress store port (loaded lazily so this module does not pull the store in by itself). */
  progress: () => Promise<SyncProgressPort> | SyncProgressPort;
  /** Small device-local memory: what was last synced, and under which account. */
  loadMeta: () => unknown;
  saveMeta: (meta: unknown) => void;
  timers: SyncTimers;
  now: () => number;
  random: () => number;
  /** Quiet time after a change before it is written. Default 5 s. */
  debounceMs: number;
  /** Shortest time between two writes. Default 20 s. */
  minIntervalMs: number;
  /** Longest a change may wait while more changes keep arriving. Default 60 s. */
  maxWaitMs: number;
  /** How long the first read may take before `unreachable` is reported. Default 10 s. */
  loadTimeoutMs: number;
}

/** The sync service. Use the module-level functions unless you are testing. */
export interface CloudSync {
  /** Start syncing. Safe to call more than once. Resolves when sync is running, or off. */
  start(): Promise<SyncStatus>;
  /** Stop listening and writing (pending changes are not flushed). */
  stop(): void;
  /** Write pending changes now instead of waiting for the quiet period. */
  flush(): Promise<void>;
  status(): SyncStatus;
  subscribe(listener: () => void): () => void;
}

// ---------------------------------------------------------------------------------------------
// The `db` and `user` capabilities (shapes copied from the platform's type definitions)
// ---------------------------------------------------------------------------------------------

interface DocSnapshot {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
  metadata?: { fromCache?: boolean; hasPendingWrites?: boolean };
}
interface DocRef {
  get(): Promise<DocSnapshot>;
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  onSnapshot(next: (snapshot: DocSnapshot) => void, error?: (error: { code?: string; message?: string }) => void): () => void;
}
interface Database {
  doc(path: string): DocRef;
}
interface UserCapability {
  id(): Promise<string | null>;
}

// ---------------------------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------------------------

type Rec = Record<string, unknown>;
const isRec = (value: unknown): value is Rec => typeof value === 'object' && value !== null && !Array.isArray(value);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (value: unknown): value is string => typeof value === 'string' && DAY_KEY.test(value);
const dayNumber = (key: string): number => {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};
const dayKey = (n: number): string => new Date(n * 86_400_000).toISOString().slice(0, 10);

/** The streak fields `strongerStreak` corrects. */
export interface StreakRepair {
  current: number;
  longest: number;
  lastGoalDay: string;
  coveredThrough: string;
  startedOn: string | null;
  lastGoalAt: number | null;
}

/**
 * The streak the merged day history proves, when it is longer than the one the merge kept.
 *
 * Walks back from today (or yesterday) through days that are met or frozen. The number of met
 * days in that unbroken run is a streak the learner really has. Where one side's own counter
 * ends on a day inside the run, the days met after it are added to that counter, which also
 * covers streaks longer than the stored history. Returns null when there is nothing to repair.
 */
export function strongerStreak(merged: unknown, sides: readonly unknown[]): StreakRepair | null {
  if (!isRec(merged) || !isRec(merged.days) || !isRec(merged.streak) || !isRec(merged.meta)) return null;
  const days = merged.days;
  const today = merged.meta.today;
  if (!isDay(today)) return null;
  const covered = (key: string): boolean => {
    const day = days[key];
    return isRec(day) && (day.met === true || day.frozen === true);
  };
  const met = (key: string): boolean => {
    const day = days[key];
    return isRec(day) && day.met === true;
  };

  const todayN = dayNumber(today);
  const endN = covered(today) ? todayN : covered(dayKey(todayN - 1)) ? todayN - 1 : null;
  if (endN === null) return null; // nothing recent enough to be a live streak

  const metDays: string[] = []; // newest first
  let startN = endN;
  for (let n = endN; n > endN - 5000; n--) {
    const key = dayKey(n);
    if (!covered(key)) break;
    if (met(key)) metDays.push(key);
    startN = n;
  }
  if (metDays.length === 0) return null;
  const lastMet = metDays[0];
  let best = metDays.length;
  let startedOn: string | null = metDays[metDays.length - 1];

  for (const side of sides) {
    const streak = isRec(side) && isRec(side.streak) ? side.streak : null;
    if (!streak) continue;
    const count = num(streak.current);
    const last = streak.lastGoalDay;
    if (count === null || count <= 0 || count > 100_000 || !isDay(last)) continue;
    const lastN = dayNumber(last);
    // The side's counter only joins the run if its last goal day lies inside it and is met there.
    if (lastN < startN || lastN > endN || !met(last)) continue;
    const joined = Math.floor(count) + metDays.filter((key) => key > last).length;
    if (joined > best) {
      best = joined;
      startedOn = isDay(streak.startedOn) ? streak.startedOn : startedOn;
    }
  }

  const current = num(merged.streak.current) ?? 0;
  if (best <= current) return null;

  let lastGoalAt: number | null = null;
  for (const candidate of [merged, ...sides]) {
    const streak = isRec(candidate) && isRec(candidate.streak) ? candidate.streak : null;
    if (streak && streak.lastGoalDay === lastMet && num(streak.lastGoalAt) !== null) {
      lastGoalAt = Math.max(lastGoalAt ?? 0, num(streak.lastGoalAt) ?? 0);
    }
  }
  return {
    current: best,
    longest: Math.max(num(merged.streak.longest) ?? 0, best),
    lastGoalDay: lastMet,
    coveredThrough: dayKey(endN),
    startedOn,
    lastGoalAt,
  };
}

function totalXp(state: unknown): number {
  const xp = isRec(state) && isRec(state.xp) ? num(state.xp.total) : null;
  return xp !== null && xp >= 0 && xp < 1e9 ? xp : 0;
}

/**
 * True for the state of an install nobody has used yet: no XP, no practice days, no skills, not
 * onboarded. Such a device takes the cloud copy over as it is instead of merging into it.
 */
export function isPristine(state: unknown): boolean {
  if (!isRec(state)) return false;
  const count = (value: unknown): number => (isRec(value) ? Object.keys(value).length : Array.isArray(value) ? value.length : 0);
  const onboarded = isRec(state.profile) && state.profile.onboarded === true;
  return !onboarded && totalXp(state) === 0 && count(state.days) === 0 && count(state.skills) === 0 && count(state.log) === 0;
}

/** JSON with sorted keys, so two equal values always give the same text. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item === undefined ? null : item)).join(',')}]`;
  if (isRec(value)) {
    const parts: string[] = [];
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) parts.push(`${JSON.stringify(key)}:${canonical(value[key])}`);
    }
    return `{${parts.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Everything in a progress state that matters to the learner, as comparable text: the state
 * without its bookkeeping (`meta` changes on every import even when nothing else does).
 */
export function materialKey(state: unknown): string {
  if (!isRec(state)) return canonical(state);
  const { meta: _bookkeeping, ...rest } = state;
  return canonical(rest);
}

/** FNV-1a over the UTF-16 code units: cheap, and enough to notice a damaged or mismatched body. */
export function checksum(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** UTF-8 bytes one UTF-16 code unit takes once it sits inside a JSON string. */
function escapedBytes(code: number): number {
  if (code === 0x22 || code === 0x5c) return 2;
  if (code < 0x20) return 6;
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  if (code >= 0xd800 && code <= 0xdfff) return 2; // half of a four-byte pair
  return 3;
}

/**
 * Cut a long text into pieces that each stay under `maxBytes` when stored as a JSON string.
 * Surrogate pairs are never split. Joining the pieces gives the text back exactly.
 */
export function splitBody(text: string, maxBytes: number): string[] {
  const out: string[] = [];
  let start = 0;
  let size = 0;
  for (let i = 0; i < text.length; i++) {
    const cost = escapedBytes(text.charCodeAt(i));
    if (size + cost > maxBytes && i > start) {
      let cut = i;
      const previous = text.charCodeAt(cut - 1);
      if (previous >= 0xd800 && previous <= 0xdbff && cut - 1 > start) cut -= 1; // keep the pair together
      out.push(text.slice(start, cut));
      start = cut;
      size = 0;
      for (let j = cut; j < i; j++) size += escapedBytes(text.charCodeAt(j));
    }
    size += cost;
  }
  if (start < text.length || out.length === 0) out.push(text.slice(start));
  return out;
}

// ---------------------------------------------------------------------------------------------
// The cloud documents
// ---------------------------------------------------------------------------------------------

const APP_ID = 'sixstring-academy';
const FORMAT = 1;
/** Room one document may take. The store's limit is 256 KiB; the rest is headroom for the envelope. */
const DOC_BYTES = 200_000;
const MAX_PARTS = 48;
const MAX_ECHO_PUSHES = 3;
const MAX_BACKOFF_MS = 5 * 60_000;
const QUOTA_RETRY_MS = 10 * 60_000;
const STALE_GRACE_MS = 60_000;
const META_KEY = 'sync.meta';

/** The small document that describes the current cloud copy. */
interface Head {
  /** Format of these documents; a larger number than we know means "written by a newer app". */
  v: number;
  /** Id of this save. Part documents carry it in their name. */
  gen: string;
  /** Change-stamp of the saved state. */
  stamp: string;
  /** Raised by a deliberate reset; see the header. */
  epoch: number;
  /** Length and checksum of the body, to verify what was put back together. */
  chars: number;
  sum: string;
  /** 0 when the body is inline, otherwise the number of part documents. */
  parts: number;
  body?: string;
}

function parseHead(data: Record<string, unknown> | undefined): Head | null {
  if (!data || data.kind !== 'progress-sync') return null;
  const v = num(data.v);
  const parts = num(data.parts);
  const chars = num(data.chars);
  const epoch = num(data.epoch) ?? 0;
  if (v === null || v < 1 || typeof data.gen !== 'string' || !data.gen) return null;
  if (v > FORMAT) return { v, gen: data.gen, stamp: '', epoch, chars: 0, sum: '', parts: 0 };
  if (parts === null || parts < 0 || parts > MAX_PARTS || chars === null || typeof data.sum !== 'string' || typeof data.stamp !== 'string') return null;
  if (parts === 0 && typeof data.body !== 'string') return null;
  const head: Head = { v, gen: data.gen, stamp: data.stamp, epoch, chars, sum: data.sum, parts };
  if (typeof data.body === 'string') head.body = data.body;
  return head;
}

/** What this device remembers between visits. */
interface LocalMeta {
  /** The account the fields below belong to. */
  uid: string | null;
  /** The cloud save this device last wrote or merged. */
  gen: string | null;
  parts: number;
  /** The local change-stamp at the moment this device and the cloud agreed. */
  stamp: string | null;
  /** Checksum of what mattered in the state at that moment (see `materialKey`). */
  sum: string | null;
  epoch: number;
  syncedAt: number | null;
  /** Part documents to delete: replaced saves, and saves that were interrupted half-way. */
  trash: Array<{ gen: string; parts: number }>;
}

function readMeta(raw: unknown): LocalMeta {
  const meta: LocalMeta = { uid: null, gen: null, parts: 0, stamp: null, sum: null, epoch: 0, syncedAt: null, trash: [] };
  if (!isRec(raw)) return meta;
  if (typeof raw.uid === 'string') meta.uid = raw.uid;
  if (typeof raw.gen === 'string') meta.gen = raw.gen;
  if (typeof raw.stamp === 'string') meta.stamp = raw.stamp;
  if (typeof raw.sum === 'string') meta.sum = raw.sum;
  meta.parts = Math.max(0, Math.floor(num(raw.parts) ?? 0));
  meta.epoch = Math.max(0, num(raw.epoch) ?? 0);
  meta.syncedAt = num(raw.syncedAt);
  if (Array.isArray(raw.trash)) {
    for (const item of raw.trash) {
      const parts = isRec(item) ? num(item.parts) : null;
      if (isRec(item) && typeof item.gen === 'string' && parts !== null && parts > 0 && parts <= MAX_PARTS) meta.trash.push({ gen: item.gen, parts });
    }
  }
  return meta;
}

const MESSAGES: Record<SyncState, string> = {
  off: 'Your progress is saved on this device.',
  syncing: 'Syncing your progress…',
  synced: 'Your progress is backed up to your Claude account.',
  error: 'Cloud sync has a problem. Your progress is safe on this device.',
};
const ISSUE_MESSAGES: Record<SyncIssue, string> = {
  standalone: 'Your progress is saved on this device. Cloud sync is available when the app runs inside Claude.',
  'not-offered': 'Cloud sync is not available in this view. Your progress is saved on this device.',
  unreachable: 'Cloud sync cannot be reached right now. Your progress is safe on this device and will sync when the connection is back.',
  retrying: 'Syncing is taking longer than usual. Your progress is safe on this device, and we will keep trying.',
  'read-only': 'This view cannot save to the cloud for your account. Your progress is saved on this device.',
  'storage-full': 'Cloud storage for this app is full, so syncing is paused. Your progress is saved on this device.',
  'update-needed': 'Your cloud progress was saved by a newer version of the app. Reload to update; syncing continues after that.',
  revoked: 'Cloud sync was switched off for this view. Your progress is saved on this device.',
};

/** Codes after which the database is gone for this page load. */
const TERMINAL_CODES = new Set(['revoked', 'not_granted', 'capability_disabled', 'capability_removed']);

const codeOf = (error: unknown): string => {
  const code = isRec(error) ? error.code : undefined;
  return typeof code === 'string' ? code : 'unavailable';
};

/** The parts of the progress store the port is built from (`ProgressStore` has them all). */
export interface SyncableStore {
  exportData(): { stamp: string; state: unknown };
  importData(data: unknown, strategy: 'replace' | 'newest-wins'): { ok: true } | { ok: false; reason: string; detail?: string };
  changeStamp(): string;
  subscribe(listener: () => void): () => void;
  on(type: 'data-reset' | 'data-imported', handler: (event: { type: string; strategy?: 'replace' | 'newest-wins' }) => void): () => void;
}

/** Wrap a progress store as the port sync works with. */
export function progressStorePort(store: SyncableStore): SyncProgressPort {
  return {
    exportData: () => store.exportData(),
    importData: (data, strategy) => store.importData(data, strategy),
    changeStamp: () => store.changeStamp(),
    subscribe: (listener) => store.subscribe(listener),
    onReplaced(handler) {
      const offReset = store.on('data-reset', () => handler());
      const offImport = store.on('data-imported', (event) => {
        if (event.strategy === 'replace') handler();
      });
      return () => {
        offReset();
        offImport();
      };
    },
  };
}

async function defaultProgressPort(): Promise<SyncProgressPort> {
  // Loaded on demand: the platform layer must not pull the whole progress module in at import time.
  const progress = await import('@/core/progress');
  return progressStorePort(progress.getProgressStore());
}

// ---------------------------------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------------------------------

/** Create a sync service. Production code uses the shared instance behind `startCloudSync`. */
export function createCloudSync(overrides: Partial<SyncDeps> = {}): CloudSync {
  const deps: SyncDeps = {
    host: currentHost,
    capability: claudeCapability,
    progress: defaultProgressPort,
    loadMeta: () => readJSON<unknown>(META_KEY, null),
    saveMeta: (meta) => {
      writeJSON(META_KEY, meta);
    },
    timers: { set: (fn, ms) => setTimeout(fn, ms), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) },
    now: () => Date.now(),
    random: () => Math.random(),
    debounceMs: 5000,
    minIntervalMs: 20_000,
    maxWaitMs: 60_000,
    loadTimeoutMs: 10_000,
    ...overrides,
  };

  let snapshot: SyncStatus = { state: 'off', issue: 'standalone', message: ISSUE_MESSAGES.standalone, lastSyncedAt: null, pending: false };
  const listeners = new Set<() => void>();
  const publish = (state: SyncState, issue: SyncIssue | null, pending: boolean): void => {
    const next: SyncStatus = { state, issue, message: issue ? ISSUE_MESSAGES[issue] : MESSAGES[state], lastSyncedAt: meta.syncedAt, pending };
    if (
      next.state === snapshot.state &&
      next.issue === snapshot.issue &&
      next.pending === snapshot.pending &&
      next.lastSyncedAt === snapshot.lastSyncedAt
    ) {
      return;
    }
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };

  let startPromise: Promise<SyncStatus> | null = null;
  let running = false;
  let stopped = false;
  /** Why sync is switched off for good in this page load, if it is. */
  let off: SyncIssue | null = null;
  /** Why this device must not write, if it must not. Reading goes on. */
  let blocked: SyncIssue | null = null;

  let db: Database | null = null;
  let port: SyncProgressPort | null = null;
  let headRef: DocRef | null = null;
  let uid = '';
  let meta: LocalMeta = readMeta(null);
  /** Take the first cloud copy over instead of merging: the local data belongs to another account. */
  let adoptRemote = false;

  /** A head the listener delivered that has not been dealt with yet. */
  let incoming: { exists: boolean; head: Head | null } | undefined;
  /** A server-confirmed snapshot arrived / has been merged. Writing needs the second. */
  let confirmedSeen = false;
  let confirmed = false;
  let loadTimedOut = false;
  /** A head whose part documents were gone: a newer save is on its way. */
  let stale: { gen: string; since: number } | null = null;

  let applying = false;
  let needPush = false;
  let pushRequested = false;
  let echoPushes = 0;
  let failures = 0;
  let quotaFull = false;
  let working = false;
  let lastPushAt = -Infinity;
  /** When the oldest change that is still waiting to be written was made. */
  let waitingSince: number | null = null;
  let chain: Promise<void> = Promise.resolve();

  let pushTimer: unknown = null;
  let retryTimer: unknown = null;
  let loadTimer: unknown = null;
  let staleTimer: unknown = null;
  const cleanups: Array<() => void> = [];

  const clearTimer = (handle: unknown): null => {
    if (handle !== null) deps.timers.clear(handle);
    return null;
  };

  const persist = (): void => {
    try {
      deps.saveMeta(meta);
    } catch {
      /* device storage is full or blocked: sync still works for this visit */
    }
  };

  const isDirty = (): boolean => needPush || (port !== null && port.changeStamp() !== meta.stamp);

  function settle(): void {
    if (off) return publish('off', off, false);
    if (!running) return;
    const dirty = isDirty();
    if (blocked) return publish('error', blocked, dirty);
    if (quotaFull) return publish('error', 'storage-full', dirty);
    if (!confirmed) return publish(loadTimedOut ? 'error' : 'syncing', loadTimedOut ? 'unreachable' : null, dirty);
    if (failures >= 2) return publish('error', 'retrying', dirty);
    if (dirty || working || stale !== null) return publish('syncing', null, dirty);
    publish('synced', null, false);
  }

  function shutDown(issue: SyncIssue): void {
    off = issue;
    running = false;
    pushTimer = clearTimer(pushTimer);
    retryTimer = clearTimer(retryTimer);
    loadTimer = clearTimer(loadTimer);
    staleTimer = clearTimer(staleTimer);
    for (const cleanup of cleanups.splice(0)) {
      try {
        cleanup();
      } catch {
        /* already gone */
      }
    }
    settle();
  }

  const partRef = (gen: string, index: number): DocRef => (db as Database).doc(`data/users/${uid}/progress.${gen}.${index}`);

  // -- scheduling -------------------------------------------------------------------------------

  function enqueue(): Promise<void> {
    chain = chain.then(work, work);
    return chain;
  }

  function schedulePush(delayMs: number): void {
    if (!running || blocked) return;
    pushTimer = clearTimer(pushTimer);
    const now = deps.now();
    waitingSince ??= now;
    // Each new change restarts the quiet period, but a change never waits longer than the maximum,
    // and two writes are never closer together than the minimum interval.
    const quiet = Math.min(delayMs, Math.max(0, waitingSince + deps.maxWaitMs - now));
    const wait = Math.max(quiet, lastPushAt + deps.minIntervalMs - now, 0);
    pushTimer = deps.timers.set(() => {
      pushTimer = null;
      pushRequested = true;
      void enqueue();
    }, wait);
    settle();
  }

  function retryLater(code: string): void {
    retryTimer = clearTimer(retryTimer);
    const base = Math.min(MAX_BACKOFF_MS, 2000 * 2 ** Math.min(failures - 1, 10));
    // A rate budget needs a longer rest than a dropped connection.
    const scaled = code === 'resource_exhausted' ? Math.min(MAX_BACKOFF_MS, base * 4) : base;
    const wait = code === 'quota_exceeded' ? QUOTA_RETRY_MS : Math.round(scaled * (0.75 + deps.random() * 0.5));
    retryTimer = deps.timers.set(() => {
      retryTimer = null;
      pushRequested = true;
      void enqueue();
    }, wait);
  }

  // -- reading ----------------------------------------------------------------------------------

  /** The body a head describes, or null when its parts are missing or do not add up. */
  async function readBody(head: Head): Promise<string | null> {
    let body = head.body ?? '';
    if (head.parts > 0) {
      const pieces: string[] = [];
      for (let i = 0; i < head.parts; i++) {
        const snap = await partRef(head.gen, i).get();
        const data = snap.exists ? snap.data() : undefined;
        if (!data || typeof data.data !== 'string') return null;
        pieces.push(data.data);
      }
      body = pieces.join('');
    }
    return body.length === head.chars && checksum(body) === head.sum ? body : null;
  }

  function guard(before: unknown, remote: unknown): void {
    const p = port as SyncProgressPort;
    const exported = p.exportData();
    const state = exported.state;
    if (!isRec(state)) return;
    const repair = strongerStreak(state, [before, remote]);
    const floor = Math.max(totalXp(before), totalXp(remote));
    const xpLow = totalXp(state) < floor;
    if (!repair && !xpLow) return;
    const patched: Rec = { ...state };
    if (repair && isRec(state.streak)) patched.streak = { ...state.streak, ...repair };
    if (xpLow && isRec(state.xp)) patched.xp = { ...state.xp, total: floor };
    p.importData({ ...exported, state: patched }, 'replace');
  }

  /** Bring one cloud copy into the local state. Throws only for transient database errors. */
  async function merge(found: { exists: boolean; head: Head | null }): Promise<void> {
    const p = port as SyncProgressPort;
    const acknowledge = (head: Head): void => {
      // Its parts become ours to tidy up once we replace it.
      meta.gen = head.gen;
      meta.parts = head.parts;
    };
    stale = null;
    staleTimer = clearTimer(staleTimer);

    if (!found.exists) {
      // Nothing in the cloud yet (or it was erased): everything local is news.
      if (meta.gen !== null && meta.parts > 0) meta.trash.push({ gen: meta.gen, parts: meta.parts });
      meta.gen = null;
      meta.parts = 0;
      meta.sum = null;
      needPush = true;
      persist();
      return;
    }
    const head = found.head;
    if (!head) {
      // A document we cannot read at all. Local data is good, so it replaces it.
      needPush = true;
      return;
    }
    if (head.gen === meta.gen) return; // our own save, or one already merged
    if (head.v > FORMAT) {
      blocked = 'update-needed';
      return;
    }

    const body = await readBody(head);
    if (body === null) {
      // Its parts are gone, so a newer save has replaced it and its head is on the way. Wait for
      // that one; if it never comes, the copy is damaged and local data takes its place.
      stale = { gen: head.gen, since: deps.now() };
      staleTimer = deps.timers.set(() => {
        staleTimer = null;
        if (stale && stale.gen === head.gen) {
          stale = null;
          acknowledge(head);
          needPush = true;
          pushRequested = true;
          void enqueue();
        }
      }, STALE_GRACE_MS);
      return;
    }

    let remote: unknown;
    try {
      remote = JSON.parse(body) as unknown;
    } catch {
      remote = undefined;
    }
    const remoteState = isRec(remote) ? remote.state : undefined;
    const dirtyBefore = isDirty();

    if (remote === undefined || head.epoch < meta.epoch) {
      // Damaged, or from before a reset made on this device: not merged, and replaced by ours.
      acknowledge(head);
      needPush = true;
      persist();
      return;
    }

    const local = p.exportData();
    const before = local.state;
    // Three cases take the cloud copy over instead of merging:
    //  - a reset elsewhere, seen by a device that synced before it (a device that never synced
    //    has nothing "from before" and merges, so its first-day progress is not thrown away);
    //  - an untouched install: merging its defaults in would let "the newest side" overwrite the
    //    learner's hearts, quests and streak freezes with a blank slate;
    //  - local data that belongs to another account and is already safe there.
    const replace = adoptRemote || (head.epoch > meta.epoch && meta.syncedAt !== null) || (meta.syncedAt === null && isPristine(before));
    const remoteKey = materialKey(remoteState);
    if (!replace && isRec(remoteState) && remoteKey === materialKey(before)) {
      // The same progress already (another tab of this browser saved it, or our own save came
      // back): importing it would only churn the bookkeeping.
      meta.epoch = Math.max(meta.epoch, head.epoch);
      acknowledge(head);
      needPush = false;
      meta.stamp = local.stamp;
      meta.sum = checksum(remoteKey);
      meta.syncedAt = deps.now();
      persist();
      return;
    }
    let result: { ok: true } | { ok: false; reason: string; detail?: string };
    applying = true;
    try {
      result = p.importData(remote, replace ? 'replace' : 'newest-wins');
      if (result.ok && !replace) guard(before, remoteState);
    } finally {
      applying = false;
    }
    if (!result.ok) {
      if (result.reason === 'newer-version') {
        blocked = 'update-needed';
        return;
      }
      acknowledge(head);
      needPush = true;
      persist();
      return;
    }

    adoptRemote = false;
    meta.epoch = Math.max(meta.epoch, head.epoch);
    acknowledge(head);
    const after = p.exportData();
    const afterKey = materialKey(after.state);
    let ahead = afterKey !== remoteKey;
    // What was local before a take-over is gone, so only a merge can have unsaved local changes.
    const unsaved = dirtyBefore && !replace;
    if (ahead && !unsaved) {
      // Writing back only because the result differs must not ping-pong between two devices.
      echoPushes += 1;
      if (echoPushes > MAX_ECHO_PUSHES) ahead = false;
    }
    needPush = unsaved || ahead;
    if (!needPush) {
      meta.stamp = after.stamp;
      meta.sum = checksum(afterKey);
      meta.syncedAt = deps.now();
    }
    persist();
  }

  // -- writing ----------------------------------------------------------------------------------

  async function emptyTrash(): Promise<void> {
    while (meta.trash.length > 0) {
      const item = meta.trash[0];
      if (item.gen !== meta.gen) {
        for (let i = 0; i < item.parts; i++) await partRef(item.gen, i).delete();
      }
      meta.trash.shift();
      persist();
    }
  }

  async function push(): Promise<void> {
    const p = port as SyncProgressPort;
    const ref = headRef as DocRef;

    // The listener can lag behind another device's save; look once more before writing over it.
    const latest = await ref.get();
    const latestHead = latest.exists ? parseHead(latest.data()) : null;
    if (latest.exists && latestHead && latestHead.gen !== meta.gen) {
      await merge({ exists: true, head: latestHead });
      if (blocked || stale) return;
    }
    if (!isDirty()) return;

    const exported = p.exportData();
    const sum = checksum(materialKey(exported.state));
    if (!needPush && meta.sum !== null && sum === meta.sum && latest.exists) {
      // Only bookkeeping moved (a day tick, another tab's echo): nothing worth a write.
      meta.stamp = exported.stamp;
      persist();
      return;
    }
    const json = JSON.stringify(exported);
    const pieces = splitBody(json, DOC_BYTES);
    if (pieces.length > MAX_PARTS) {
      blocked = 'storage-full';
      return;
    }
    const now = deps.now();
    const gen = `${Math.floor(now).toString(36)}${Math.floor(deps.random() * 0xffffff).toString(36).padStart(4, '0')}`;
    const parts = pieces.length > 1 ? pieces.length : 0;

    if (parts > 0) {
      // Remember the half-written save first: if the page dies now, the next visit removes it.
      meta.trash.push({ gen, parts });
      if (meta.trash.length > 12) meta.trash.splice(0, meta.trash.length - 12);
      persist();
      for (let i = 0; i < parts; i++) {
        if (!running) return; // stopped meanwhile: the parts written so far are in the trash list
        await partRef(gen, i).set({ app: APP_ID, kind: 'progress-part', gen, index: i, at: now, data: pieces[i] });
      }
    }
    if (!running) return;
    const head: Record<string, unknown> = {
      app: APP_ID,
      kind: 'progress-sync',
      v: FORMAT,
      gen,
      stamp: exported.stamp,
      epoch: meta.epoch,
      at: now,
      chars: json.length,
      sum: checksum(json),
      parts,
    };
    if (parts === 0) head.body = json;
    await ref.set(head);

    // The new save is live. The one it replaced is now rubbish.
    const previous = meta.gen !== null && meta.parts > 0 ? { gen: meta.gen, parts: meta.parts } : null;
    meta.trash = meta.trash.filter((item) => item.gen !== gen);
    if (previous) meta.trash.push(previous);
    meta.gen = gen;
    meta.parts = parts;
    meta.stamp = exported.stamp;
    meta.sum = sum;
    meta.syncedAt = now;
    needPush = false;
    quotaFull = false;
    lastPushAt = now;
    persist();
    try {
      await emptyTrash();
    } catch {
      /* tidying can wait for the next save */
    }
  }

  // -- the one worker ---------------------------------------------------------------------------

  async function work(): Promise<void> {
    if (!running || stopped) return;
    working = true;
    let current: { exists: boolean; head: Head | null } | undefined;
    try {
      while (incoming !== undefined) {
        current = incoming;
        incoming = undefined;
        await merge(current);
        current = undefined;
      }
      if (confirmedSeen && !confirmed && stale === null) {
        confirmed = true;
        // The first agreement after loading needs no quiet period.
        if (isDirty()) pushRequested = true;
        // Leftovers of a save this device did not get to finish last time.
        try {
          await emptyTrash();
        } catch {
          /* tidying can wait for the next save */
        }
      }
      if (confirmed && pushRequested && !blocked && stale === null) {
        pushRequested = false;
        pushTimer = clearTimer(pushTimer);
        if (isDirty()) await push();
        if (!isDirty()) waitingSince = null;
      }
      failures = 0;
      retryTimer = clearTimer(retryTimer);
      // Something changed while the write was under way: go again after the usual pause.
      if (running && confirmed && !blocked && isDirty() && pushTimer === null) schedulePush(deps.debounceMs);
    } catch (error) {
      if (current !== undefined && incoming === undefined) incoming = current; // merge it on the next try
      const code = codeOf(error);
      if (TERMINAL_CODES.has(code)) {
        shutDown('revoked');
      } else if (code === 'invalid_argument' || code === 'transform_error') {
        // A well-formed write to the viewer's own subtree is refused: they may not write here.
        blocked = 'read-only';
      } else if (code === 'quota_exceeded') {
        // Not transient, but room can be made (documents deleted elsewhere): look again much later.
        quotaFull = true;
        retryLater(code);
      } else {
        failures += 1;
        retryLater(code);
      }
    } finally {
      working = false;
    }
    settle();
  }

  // -- wiring -----------------------------------------------------------------------------------

  function listen(): void {
    const ref = headRef as DocRef;
    let resubscribes = 0;
    const subscribe = (): void => {
      const unsubscribe = ref.onSnapshot(
        (snap) => {
          if (!running || stopped) return;
          // Our own write, echoed before the store confirmed it: the confirmed one follows.
          if (snap.metadata?.hasPendingWrites) return;
          const fromCache = snap.metadata?.fromCache === true;
          if (snap.exists) incoming = { exists: true, head: parseHead(snap.data()) };
          else if (!fromCache) incoming = { exists: false, head: null }; // only a confirmed "nothing there" counts
          if (!fromCache && !confirmedSeen) {
            confirmedSeen = true;
            loadTimedOut = false;
            loadTimer = clearTimer(loadTimer);
          }
          void enqueue();
        },
        (error) => {
          if (!running || stopped) return;
          loadTimer = clearTimer(loadTimer);
          const code = codeOf(error);
          if (TERMINAL_CODES.has(code)) return shutDown('revoked');
          if (code === 'invalid_argument') return shutDown('not-offered');
          // This listener is dead (the host stopped answering it, or a rate budget ran out).
          // A fresh one is the only way back; ask for it with longer and longer pauses.
          resubscribes += 1;
          const pause = Math.min(MAX_BACKOFF_MS, 5000 * 2 ** Math.min(resubscribes, 8));
          const handle = deps.timers.set(subscribe, pause);
          cleanups.push(() => deps.timers.clear(handle));
          if (!confirmed) loadTimedOut = true;
          settle();
        },
      );
      cleanups.push(unsubscribe);
    };
    subscribe();
  }

  async function begin(): Promise<SyncStatus> {
    if (deps.host() !== 'artifact') {
      off = 'standalone';
      settle();
      return snapshot;
    }
    publish('syncing', null, false);
    const [database, user] = await Promise.all([deps.capability<Database>('db'), deps.capability<UserCapability>('user')]);
    if (stopped) return snapshot;
    let id: string | null = null;
    try {
      id = database && user && typeof user.id === 'function' ? await user.id() : null;
    } catch {
      id = null;
    }
    // No identity means no private subtree; progress must not be moved to a shared path instead.
    if (!database || typeof database.doc !== 'function' || !id) {
      shutDown('not-offered');
      return snapshot;
    }
    try {
      headRef = database.doc(`data/users/${id}/progress`);
    } catch {
      shutDown('not-offered'); // an id the path grammar refuses
      return snapshot;
    }
    db = database;
    uid = id;
    port = await deps.progress();
    if (stopped) return snapshot;

    meta = readMeta(deps.loadMeta());
    if (meta.uid !== uid) {
      // Another account used this device before. If everything local is already safe in that
      // account's cloud, this account starts from its own cloud copy; otherwise the unsaved
      // local progress is merged rather than lost.
      adoptRemote = meta.uid !== null && meta.stamp !== null && port.changeStamp() === meta.stamp;
      meta = { ...readMeta(null), uid };
      persist();
    }

    running = true;
    cleanups.push(
      port.subscribe(() => {
        if (applying || !running) return;
        echoPushes = 0;
        if (isDirty()) schedulePush(deps.debounceMs);
      }),
      port.onReplaced(() => {
        if (applying || !running) return;
        // A deliberate reset or restore: it must win everywhere, so it starts a new epoch.
        meta.epoch = Math.max(meta.epoch + 1, deps.now());
        needPush = true;
        persist();
        schedulePush(deps.debounceMs);
      }),
    );
    if (typeof document !== 'undefined') {
      const onVisibility = (): void => {
        // A hidden tab may never run again: save what is pending while we still can.
        if (document.visibilityState === 'hidden' && running && confirmed && isDirty()) void flush();
      };
      document.addEventListener('visibilitychange', onVisibility);
      cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));
    }

    loadTimer = deps.timers.set(() => {
      loadTimer = null;
      // Keep the listener: it reconnects by itself. Only the message changes.
      if (!confirmedSeen) loadTimedOut = true;
      settle();
    }, deps.loadTimeoutMs);
    listen();
    settle();
    return snapshot;
  }

  function flush(): Promise<void> {
    if (!running || blocked) return Promise.resolve();
    pushTimer = clearTimer(pushTimer);
    pushRequested = true;
    return enqueue();
  }

  return {
    start() {
      startPromise ??= begin().catch(() => {
        shutDown('not-offered');
        return snapshot;
      });
      return startPromise;
    },
    stop() {
      stopped = true;
      const issue = off ?? (deps.host() === 'artifact' ? 'not-offered' : 'standalone');
      shutDown(issue);
    },
    flush,
    status: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The shared instance
// ---------------------------------------------------------------------------------------------

let shared: CloudSync | null = null;
const instance = (): CloudSync => (shared ??= createCloudSync());

/**
 * Start cloud sync. The app shell calls this once at startup; it does nothing (and resolves with
 * `state: 'off'`) outside a Claude artifact that was published with the `db` and `user`
 * capabilities. Never throws.
 */
export function startCloudSync(): Promise<SyncStatus> {
  return instance().start();
}

/** Stop cloud sync for this page load. */
export function stopCloudSync(): void {
  instance().stop();
}

/** Write pending changes now (a "Sync now" button). Resolves when the attempt is over. */
export function syncNow(): Promise<void> {
  return instance().flush();
}

/** The current snapshot (stable until it changes), for `useSyncExternalStore`. */
export function getSyncStatus(): SyncStatus {
  return instance().status();
}

/** Be told when the snapshot changes. Returns the unsubscribe function. */
export function subscribeSyncStatus(listener: () => void): () => void {
  return instance().subscribe(listener);
}

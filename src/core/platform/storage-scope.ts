/**
 * What each stored key is, and the learner's data as one portable set.
 *
 * THE RULE. Every key the app keeps through platform storage is the learner's data (it travels in
 * backups and cloud sync, and a reset erases it) unless `DATA_RULES` says otherwise. A new feature
 * that stores something with `useLocalState` / `writeJSON` is therefore covered without anyone
 * remembering to list it. The exceptions are few and each says why:
 *
 *   - `progress`, `progress.*`  the progress store's own save and safety copies (exported by the store);
 *   - `library.*`               the learner's songs in the key-value fallback (exported song by song);
 *   - secret                    the AI key: never in a backup, never synced, kept by a reset;
 *   - device                    about this device, not the learner (notices already shown, this screen's
 *                               sidebar, sync and backup bookkeeping): stays here, kept by a reset;
 *   - session                   work in progress on this device (a running practice session, a lesson
 *                               half done): stays here, but a reset clears it.
 *
 * Learner data is either something the learner made or earned (`DATA_ITEMS`: the journal, saved
 * progressions, arcade records ...) or a setting. "Reset, keep my name and settings" keeps the
 * settings and erases the rest, so an unlisted new key counts as a setting.
 *
 * WHEN A KEY CHANGED. Features write through `storage.ts`, which says nothing when they do, so a
 * small ledger (`data.ledger`) remembers a checksum of every learner key and the time a change was
 * first noticed. `notice()` runs at startup, every 30 s, when the page is hidden and before every
 * backup or sync, so "newest change wins" works to within half a minute.
 */
import { keys as storedKeys, isPersistent, readRaw, remove, writeRaw } from './storage';

// ---------------------------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------------------------

/** What a stored key holds, for backups, cloud sync and reset. */
export type DataClass = 'learner' | 'session' | 'device' | 'secret' | 'progress' | 'songs';

/** One exception to "everything is learner data". `match` is a key, or a prefix ending in `*`. */
export interface DataRule {
  match: string;
  class: DataClass;
  /** Why, in words for the API digest and the Your data screen. */
  why: string;
  /** Learner data that travels in backups but stays off cloud sync (it describes this device). */
  sync?: false;
}

/** The exceptions, first match wins. Anything not matched is learner data. */
export const DATA_RULES: readonly DataRule[] = [
  { match: 'progress', class: 'progress', why: 'XP, streak, skills and settings: the progress store exports it itself.' },
  { match: 'progress.*', class: 'progress', why: 'the progress store’s safety copies (yesterday’s save, unreadable data).' },
  { match: 'library.*', class: 'songs', why: 'your own songs when the browser has no IndexedDB: backed up song by song.' },
  { match: 'ai.*', class: 'secret', why: 'your Anthropic API key: it never leaves this device.' },
  { match: 'sync.*', class: 'device', why: 'what cloud sync last agreed with the cloud.' },
  { match: 'data.*', class: 'device', why: 'bookkeeping of backups and sync: when each key changed, the undo of an import or reset.' },
  { match: '__probe', class: 'device', why: 'the check that storage works.' },
  { match: 'shell.nav-open', class: 'device', why: 'which sidebar groups are open on this screen.' },
  { match: 'kit.*', class: 'device', why: 'the component gallery.' },
  { match: 'arcade.test-seed', class: 'device', why: 'browser checks only.' },
  { match: 'player.micNotice', class: 'device', why: 'a notice about this device’s microphone was shown.' },
  { match: 'camera.blockedOnce', class: 'device', why: 'this device’s camera was refused once.' },
  { match: 'camera.capoAskedAt', class: 'device', why: 'when the camera last asked about a capo.' },
  { match: 'learn.conditions', class: 'device', why: 'guitar at hand and sound allowed: where this device is right now.' },
  { match: 'practice.session', class: 'session', why: 'a practice session that is running.' },
  { match: 'lesson-session.*', class: 'session', why: 'a lesson you are half way through.' },
  { match: 'player.session.*', class: 'session', why: 'where you were in each song on this device.' },
  { match: 'teachers.task', class: 'session', why: 'a teacher’s task you went off to do.' },
  { match: 'shell.onboarding', class: 'session', why: 'the first-run questions, so a reset asks them again.' },
  { match: 'rhythm.calibration', class: 'learner', sync: false, why: 'the delay of this device’s screen and speakers: backed up, but each device measures its own.' },
];

function matches(rule: DataRule, key: string): boolean {
  return rule.match.endsWith('*') ? key.startsWith(rule.match.slice(0, -1)) : key === rule.match;
}

/** The rule that decides a key, or null for plain learner data. */
export function ruleFor(key: string): DataRule | null {
  for (const rule of DATA_RULES) if (matches(rule, key)) return rule;
  return null;
}

/** What a key holds. Anything no rule names is learner data. */
export function classifyKey(key: string): DataClass {
  return ruleFor(key)?.class ?? 'learner';
}

/** True for learner data that cloud sync carries. */
export function syncsKey(key: string): boolean {
  const rule = ruleFor(key);
  return (rule?.class ?? 'learner') === 'learner' && rule?.sync !== false;
}

// ---------------------------------------------------------------------------------------------
// What the learner made or earned, with words and counts for the screen
// ---------------------------------------------------------------------------------------------

/** Something the learner made or earned, with a count to show ("Practice journal: 12 entries"). */
export interface DataItem {
  id: string;
  key: string;
  label: string;
  /** Singular and plural of what is counted. */
  unit: readonly [string, string];
  /** What the stored value is: a list, or an object. Any other value is a damaged entry. */
  shape: 'list' | 'object';
  /** For an object: the list inside it that this item counts (it must be a list when present). */
  field?: string;
  /** Most the feature keeps (it drops the rest when it reads the value): counts never go above it. */
  max?: number;
  /** A draft: merged by taking the copy changed last whole, never by joining what is inside. */
  whole?: true;
  /** How many there are in a stored value (0 for anything unreadable). */
  count(value: unknown): number;
}

type Rec = Record<string, unknown>;
const isRec = (value: unknown): value is Rec => typeof value === 'object' && value !== null && !Array.isArray(value);
/** The objects in a list (a damaged item is not counted: the feature drops it when it reads the list). */
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value.filter(isRec) : []);
const own = (value: unknown): unknown[] => list(value).filter((item) => isRec(item) && item.builtIn !== true);
const field = (value: unknown, name: string): unknown => (isRec(value) ? value[name] : undefined);
const atMost = (n: number, max: number): number => Math.min(n, max);

// The features' own limits (practice/model/journal.ts MAX_JOURNAL, practice/model/routines.ts
// MAX_ROUTINES): a merge can join more than that, and the feature keeps only the newest / first.
const MAX_JOURNAL = 400;
const MAX_ROUTINES = 30;

function arcadeLevels(value: unknown): number {
  let n = 0;
  const levels = field(value, 'levels');
  if (!isRec(levels)) return 0;
  for (const scopes of Object.values(levels)) {
    if (!isRec(scopes)) continue;
    for (const byLevel of Object.values(scopes)) if (isRec(byLevel)) n += Object.keys(byLevel).length;
  }
  return n;
}

/** The learner's own things, in the order the Your data screen lists them. */
export const DATA_ITEMS: readonly DataItem[] = [
  { id: 'journal', key: 'practice.data', label: 'Practice journal', unit: ['entry', 'entries'], shape: 'object', field: 'journal', max: MAX_JOURNAL, count: (v) => atMost(list(field(v, 'journal')).length, MAX_JOURNAL) },
  { id: 'routines', key: 'practice.data', label: 'Practice routines', unit: ['routine', 'routines'], shape: 'object', field: 'routines', max: MAX_ROUTINES, count: (v) => atMost(own(field(v, 'routines')).length, MAX_ROUTINES) },
  { id: 'goals', key: 'practice.data', label: 'Practice goals', unit: ['goal', 'goals'], shape: 'object', field: 'goals', count: (v) => list(field(v, 'goals')).length },
  { id: 'arcade', key: 'arcade', label: 'Arcade records', unit: ['level played', 'levels played'], shape: 'object', count: arcadeLevels },
  { id: 'progressions', key: 'progressions.saved', label: 'Saved progressions', unit: ['progression', 'progressions'], shape: 'list', count: (v) => list(v).length },
  { id: 'progression-draft', key: 'progressions.draft', label: 'Progression in the builder', unit: ['draft', 'drafts'], shape: 'object', whole: true, count: (v) => (isRec(v) && list(v.slots).length > 0 ? 1 : 0) },
  { id: 'patterns', key: 'rhythm.patterns', label: 'Strumming patterns', unit: ['pattern', 'patterns'], shape: 'list', count: (v) => list(v).length },
  {
    id: 'calibration',
    key: 'rhythm.calibration',
    label: 'Rhythm calibration',
    unit: ['measurement', 'measurements'],
    shape: 'object',
    count: (v) => (typeof field(v, 'tapMs') === 'number' ? 1 : 0) + (typeof field(v, 'micMs') === 'number' ? 1 : 0),
  },
  { id: 'presets', key: 'metronome.presets', label: 'Metronome presets', unit: ['preset', 'presets'], shape: 'list', count: (v) => own(v).length },
  { id: 'tunings', key: 'tuner.tunings', label: 'Custom tunings', unit: ['tuning', 'tunings'], shape: 'list', count: (v) => list(v).length },
];

const RECORD_KEYS = new Set(DATA_ITEMS.map((item) => item.key));

/** True for learner data the learner made or earned; false for settings (kept by "keep my settings"). */
export function isRecordKey(key: string): boolean {
  return classifyKey(key) === 'learner' && RECORD_KEYS.has(key);
}

/** True for a record that merges as a whole (a draft): the copy changed last is taken, nothing inside is joined. */
export function isWholeRecord(key: string): boolean {
  return DATA_ITEMS.some((item) => item.key === key && item.whole === true);
}

/**
 * True when a stored record has the wrong shape for its key: not a list where the feature keeps a
 * list, not an object where it keeps an object, or a list inside it that is not a list. Such an entry
 * in a file or another copy is damaged: it must never take the place of a good one. Settings are
 * never called damaged here (their screens check them when they read them).
 */
export function isDamagedRecord(key: string, entry: DataEntry): boolean {
  const items = DATA_ITEMS.filter((item) => item.key === key);
  if (items.length === 0 || classifyKey(key) !== 'learner') return false;
  if (typeof entry.raw === 'string') return true;
  const value = entry.value;
  for (const item of items) {
    if (item.shape === 'list' ? !Array.isArray(value) : !isRec(value)) return true;
    if (item.field !== undefined && isRec(value) && value[item.field] !== undefined && !Array.isArray(value[item.field])) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Values as they travel
// ---------------------------------------------------------------------------------------------

/** One stored key as it travels: the parsed value (or the exact text when it is not JSON) and when it last changed. */
export interface DataEntry {
  /** When the value last changed (epoch ms); 0 = before changes were tracked. */
  at: number;
  value?: unknown;
  /** The stored text, only when it is not JSON. */
  raw?: string;
}

/** Learner data by key. */
export type DataSet = Record<string, DataEntry>;

/** The exact text an entry stores. */
export function entryText(entry: DataEntry): string {
  if (typeof entry.raw === 'string') return entry.raw;
  return JSON.stringify(entry.value === undefined ? null : entry.value);
}

/** Read stored text into an entry (JSON when it parses, the text itself otherwise). */
export function entryFromText(text: string, at: number): DataEntry {
  try {
    return { at, value: JSON.parse(text) as unknown };
  } catch {
    return { at, raw: text };
  }
}

/**
 * A data set from a file or the cloud, checked entry by entry: keys that are not learner data, and
 * entries that are damaged, are left out and named in `skipped`. With `records`, a record of the
 * wrong shape (`isDamagedRecord`: a journal that is not a list ...) counts as damaged too, and its key
 * is also named in `damaged`, so an import leaves this device's copy of it as it is. Never throws.
 */
export function sanitizeDataSet(
  input: unknown,
  { only = (key: string) => classifyKey(key) === 'learner', records = false }: { only?: (key: string) => boolean; records?: boolean } = {},
): { data: DataSet; skipped: string[]; damaged: string[] } {
  const data: DataSet = {};
  const skipped: string[] = [];
  const damaged: string[] = [];
  if (!isRec(input)) return { data, skipped, damaged };
  for (const [key, entry] of Object.entries(input)) {
    if (!key || key.length > 200 || !only(key)) {
      skipped.push(key);
      continue;
    }
    if (!isRec(entry) || (entry.value === undefined && typeof entry.raw !== 'string')) {
      skipped.push(key);
      damaged.push(key);
      continue;
    }
    const at = typeof entry.at === 'number' && Number.isFinite(entry.at) && entry.at >= 0 ? entry.at : 0;
    const clean: DataEntry = typeof entry.raw === 'string' ? { at, raw: entry.raw } : { at, value: entry.value };
    if (records && isDamagedRecord(key, clean)) {
      skipped.push(key);
      damaged.push(key);
      continue;
    }
    data[key] = clean;
  }
  return { data, skipped, damaged };
}

/** FNV-1a over the UTF-16 code units: cheap, and enough to notice that a value changed. */
export function textSum(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${(hash >>> 0).toString(16).padStart(8, '0')}${text.length.toString(36)}`;
}

/** Checksum of an entry's stored text. */
export function entrySum(entry: DataEntry): string {
  return textSum(entryText(entry));
}

// ---------------------------------------------------------------------------------------------
// The key-value store underneath
// ---------------------------------------------------------------------------------------------

/** The storage calls this module needs (platform storage by default; tests pass a map). */
export interface DataKv {
  keys(): string[];
  read(key: string): string | null;
  write(key: string, value: string): boolean;
  remove(key: string): void;
  /** True when what is written survives a reload. */
  persistent(): boolean;
}

/** The platform storage as a `DataKv`. */
export const platformKv: DataKv = { keys: storedKeys, read: readRaw, write: writeRaw, remove, persistent: isPersistent };

/** A `DataKv` in memory, for tests. */
export function memoryKv(initial: Record<string, string> = {}): DataKv & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    keys: () => [...data.keys()],
    read: (key) => data.get(key) ?? null,
    write: (key, value) => {
      data.set(key, value);
      return true;
    },
    remove: (key) => {
      data.delete(key);
    },
    persistent: () => true,
  };
}

// ---------------------------------------------------------------------------------------------
// The learner data store: snapshot, write, ledger, change notices
// ---------------------------------------------------------------------------------------------

/** Key of the change ledger (device-only). */
export const LEDGER_KEY = 'data.ledger';

interface Ledger {
  v: 1;
  keys: Record<string, { s: string; at: number }>;
}

/** The learner's data on one key-value store. */
export interface LearnerData {
  /** Stored keys of some classes (all classes when omitted), sorted. */
  keys(classes?: readonly DataClass[]): string[];
  /** Update the ledger from what is stored now. Returns true when something changed. */
  notice(): boolean;
  /** Learner data (or the keys `only` accepts) with change times. Notices changes first. */
  snapshot(only?: (key: string) => boolean): DataSet;
  /** One stored key as an entry, or null. */
  entry(key: string): DataEntry | null;
  /** Store an entry, keeping its change time. False when the browser refused it. */
  write(key: string, entry: DataEntry): boolean;
  /** Remove a key. */
  remove(key: string): void;
  /** Checksum per key, from the ledger (cheap; call `notice` first to be current). */
  sums(only?: (key: string) => boolean): Record<string, string>;
  /** One short text that changes whenever any accepted key changes (from the ledger). */
  digest(only?: (key: string) => boolean): string;
  /** Hear about changes `notice`, `write` and `remove` find. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** True when what is written survives a reload. */
  persistent(): boolean;
}

/** Create the learner data store on a key-value store. */
export function createLearnerData(kv: DataKv = platformKv, now: () => number = Date.now): LearnerData {
  const listeners = new Set<() => void>();
  let ledger: Ledger | null = null;

  const isLearner = (key: string): boolean => classifyKey(key) === 'learner';

  function loadLedger(): Ledger {
    if (ledger) return ledger;
    const raw = kv.read(LEDGER_KEY);
    let parsed: unknown = null;
    try {
      parsed = raw ? (JSON.parse(raw) as unknown) : null;
    } catch {
      parsed = null;
    }
    const out: Ledger = { v: 1, keys: {} };
    if (isRec(parsed) && isRec(parsed.keys)) {
      for (const [key, value] of Object.entries(parsed.keys)) {
        if (isRec(value) && typeof value.s === 'string' && typeof value.at === 'number' && Number.isFinite(value.at)) out.keys[key] = { s: value.s, at: value.at };
      }
      ledger = out;
    } else {
      // No ledger yet: what is stored now was changed "before tracking began" (time 0), so any
      // change seen from now on, here or elsewhere, counts as newer.
      ledger = out;
      for (const key of kv.keys()) {
        const text = isLearner(key) ? kv.read(key) : null;
        if (text !== null) out.keys[key] = { s: textSum(text), at: 0 };
      }
      saveLedger();
    }
    return ledger;
  }

  function saveLedger(): void {
    if (!ledger) return;
    try {
      kv.write(LEDGER_KEY, JSON.stringify(ledger));
    } catch {
      /* storage full: the ledger is rebuilt next time */
    }
  }

  function emit(): void {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        /* one broken listener must not stop the others */
      }
    }
  }

  function notice(): boolean {
    const book = loadLedger();
    const t = now();
    let changed = false;
    const seen = new Set<string>();
    for (const key of kv.keys()) {
      if (!isLearner(key)) continue;
      const text = kv.read(key);
      if (text === null) continue;
      seen.add(key);
      const s = textSum(text);
      if (book.keys[key]?.s !== s) {
        book.keys[key] = { s, at: t };
        changed = true;
      }
    }
    for (const key of Object.keys(book.keys)) {
      if (!seen.has(key)) {
        delete book.keys[key];
        changed = true;
      }
    }
    if (changed) {
      saveLedger();
      emit();
    }
    return changed;
  }

  function entry(key: string): DataEntry | null {
    const text = kv.read(key);
    if (text === null) return null;
    const known = loadLedger().keys[key];
    return entryFromText(text, known && known.s === textSum(text) ? known.at : now());
  }

  return {
    keys(classes) {
      const all = kv.keys().filter((key) => key !== '');
      return (classes ? all.filter((key) => classes.includes(classifyKey(key))) : all).sort();
    },
    notice,
    snapshot(only = isLearner) {
      notice();
      const out: DataSet = {};
      for (const key of kv.keys().sort()) {
        if (!only(key)) continue;
        const e = entry(key);
        if (e) out[key] = e;
      }
      return out;
    },
    entry,
    write(key, e) {
      const text = entryText(e);
      const ok = kv.write(key, text);
      if (isLearner(key)) {
        loadLedger().keys[key] = { s: textSum(text), at: e.at };
        saveLedger();
      }
      emit();
      return ok;
    },
    remove(key) {
      kv.remove(key);
      const book = loadLedger();
      if (book.keys[key]) {
        delete book.keys[key];
        saveLedger();
      }
      emit();
    },
    sums(only = isLearner) {
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(loadLedger().keys)) if (only(key)) out[key] = value.s;
      return out;
    },
    digest(only = isLearner) {
      const parts = Object.entries(loadLedger().keys)
        .filter(([key]) => only(key))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, value]) => `${key}=${value.s}`);
      return textSum(parts.join('\n'));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    persistent: () => {
      try {
        return kv.persistent();
      } catch {
        return false;
      }
    },
  };
}

let appData: LearnerData | null = null;

/** The app's learner data, on platform storage. */
export function getLearnerData(): LearnerData {
  return (appData ??= createLearnerData());
}

let stopTracker: (() => void) | null = null;

/**
 * Keep the change ledger current: notice changes now, every 30 s while the page is open, when it
 * is hidden or closed, and when another tab writes. Safe to call more than once. `startCloudSync`
 * calls it (in every host), so the shell needs nothing else.
 */
export function startDataTracker(data: LearnerData = getLearnerData()): () => void {
  if (stopTracker) return stopTracker;
  const run = (): void => {
    try {
      data.notice();
    } catch {
      /* storage blocked: nothing to track */
    }
  };
  run();
  if (typeof window === 'undefined') {
    stopTracker = () => {
      stopTracker = null;
    };
    return stopTracker;
  }
  const timer = setInterval(run, 30_000);
  const onHide = (): void => {
    if (typeof document === 'undefined' || document.visibilityState === 'hidden') run();
  };
  window.addEventListener('pagehide', run);
  window.addEventListener('storage', run);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onHide);
  stopTracker = () => {
    clearInterval(timer);
    window.removeEventListener('pagehide', run);
    window.removeEventListener('storage', run);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onHide);
    stopTracker = null;
  };
  return stopTracker;
}

/**
 * Tell the open page that stored keys changed under it (an import, a reset, a synced change):
 * a `storage` event per key, which is what features that follow other tabs already listen for.
 */
export function announceStorageChange(changed: readonly string[]): void {
  if (typeof window === 'undefined' || typeof StorageEvent === 'undefined') return;
  for (const key of changed) {
    try {
      window.dispatchEvent(new StorageEvent('storage', { key: `ssa:${key}`, newValue: readRaw(key) }));
    } catch {
      /* an old browser without the constructor: features see it after a reload */
    }
  }
}

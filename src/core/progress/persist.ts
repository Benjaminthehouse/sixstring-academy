/**
 * Versioned persistence: the saved envelope, migrations from older shapes, corruption-tolerant
 * loading, and the export / import file format.
 *
 * Saved under the storage key `progress` as `{ app, v, savedAt, state }`. Two helper keys sit
 * beside it: `progress.bak` (the last good save from before the current day or session, used
 * when the main save is unreadable) and `progress.corrupt` (a copy of unreadable data, so nothing
 * is destroyed silently).
 */
import type { InitialStateEnv } from './defaults';
import { createInitialState } from './defaults';
import { isObj, sanitizeState, type SanitizeReport } from './sanitize';
import { dayKey, isDayKey } from './time';
import type { ImportFailure, ProgressState } from './types';

/** Identifies our files and saves. */
export const APP_ID = 'sixstring-academy';
/** Version of the persisted state shape. Bump it and add a migration when the shape changes. */
export const SCHEMA_VERSION = 2;
/** Default storage key (the platform storage layer adds its own prefix). */
export const STORAGE_KEY = 'progress';

/** The minimal key-value store the progress store needs. `core/platform/storage` satisfies it. */
export interface StorageAdapter {
  read(key: string): string | null;
  write(key: string, value: string): boolean;
  remove(key: string): void;
}

/** An in-memory `StorageAdapter`, for tests and for hosts without storage. */
export function memoryStorage(initial: Record<string, string> = {}): StorageAdapter & { data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    data,
    read: (key) => data.get(key) ?? null,
    write: (key, value) => {
      data.set(key, value);
      return true;
    },
    remove: (key) => {
      data.delete(key);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------------------------

type Obj = Record<string, unknown>;
type Migration = (old: Obj, env: InitialStateEnv) => Obj;

const asObj = (v: unknown): Obj => (isObj(v) ? v : {});
const asNum = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * Version 1 was the flat pre-release shape, stored without an envelope:
 *
 *   { v: 1, name, avatar, level, teacher, onboarded, xp, xpByDay: { day: xp }, dailyGoal,
 *     streak, bestStreak, streakDay, freezes, hearts, heartsAt, gems,
 *     settings: { theme, leftHanded, a4, tuning, volume, uiSounds, solfege, showDegrees,
 *                 notation, micDevice, cameraDevice, mirror },
 *     skills: { id: { plays, best, last, crowns, stars, done, time, at } },   best/last in percent
 *     cards: [{ id, kind, ref, due, interval, ease, reps, lapses }],          due in epoch ms
 *     achievements: string[], favourites: string[] ("kind:id"), updatedAt }
 *
 * Version 2 groups everything into slices (see `ProgressState`).
 */
function migrateV1(old: Obj, env: InitialStateEnv): Obj {
  const settings = asObj(old.settings);
  const updatedAt = asNum(old.updatedAt, env.now);
  const goal = asNum(old.dailyGoal, 20);

  const days: Obj = {};
  let goalDays = 0;
  for (const [key, value] of Object.entries(asObj(old.xpByDay))) {
    if (!isDayKey(key) || typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue;
    const met = value >= goal;
    if (met) goalDays++;
    days[key] = { xp: value, goal, met, sec: 0, n: 1, kinds: {} };
  }

  const skills: Obj = {};
  for (const [id, value] of Object.entries(asObj(old.skills))) {
    const s = asObj(value);
    const at = asNum(s.at, updatedAt);
    const done = s.done === true;
    const plays = asNum(s.plays, done ? 1 : 0);
    skills[id] = {
      attempts: plays,
      completions: done ? plays : 0,
      bestAccuracy: asNum(s.best, 0) / 100,
      lastAccuracy: asNum(s.last, 0) / 100,
      history: typeof s.last === 'number' ? [s.last] : [],
      timeSec: asNum(s.time, 0),
      mastery: asNum(s.crowns, 0),
      stars: asNum(s.stars, 0),
      completed: done,
      firstAt: at,
      lastAt: at,
      completedAt: done ? at : null,
    };
  }

  const items: Obj = {};
  for (const value of Array.isArray(old.cards) ? old.cards : []) {
    const card = asObj(value);
    if (typeof card.id !== 'string') continue;
    const interval = asNum(card.interval, 0);
    const due = asNum(card.due, env.now);
    items[card.id] = {
      kind: card.kind,
      ref: card.ref,
      state: interval > 0 ? 'review' : 'new',
      interval,
      ease: asNum(card.ease, 2.5),
      reps: asNum(card.reps, 0),
      lapses: asNum(card.lapses, 0),
      dueDay: dayKey(due, env.timeZone),
      addedAt: updatedAt,
      lastAt: interval > 0 ? updatedAt : 0,
    };
  }

  const achievements: Obj = {};
  for (const id of Array.isArray(old.achievements) ? old.achievements : []) {
    if (typeof id === 'string') achievements[id] = { at: updatedAt };
  }

  const favourites: Obj = {};
  for (const entry of Array.isArray(old.favourites) ? old.favourites : []) {
    if (typeof entry !== 'string') continue;
    const cut = entry.indexOf(':');
    if (cut <= 0 || cut === entry.length - 1) continue;
    favourites[entry] = { kind: entry.slice(0, cut), id: entry.slice(cut + 1), title: entry.slice(cut + 1), at: updatedAt };
  }

  const streakDay = isDayKey(old.streakDay) ? old.streakDay : null;
  const gems = asNum(old.gems, 0);
  return {
    profile: { name: old.name, avatar: old.avatar, experience: old.level, teacher: old.teacher, onboarded: old.onboarded === true, createdAt: updatedAt },
    prefs: {
      dailyGoalXp: goal,
      handedness: settings.leftHanded === true ? 'left' : 'right',
      tuningId: settings.tuning,
      a4: settings.a4,
      theme: settings.theme,
      noteNaming: settings.solfege === true ? 'solfege' : 'letters',
      fretboard: { labels: settings.showDegrees === true ? 'degrees' : 'notes' },
      sound: { volume: settings.volume, uiSounds: settings.uiSounds },
      notation: settings.notation,
      mic: { deviceId: settings.micDevice },
      camera: { deviceId: settings.cameraDevice, mirrored: settings.mirror },
    },
    xp: { total: asNum(old.xp, 0) },
    days,
    streak: { current: asNum(old.streak, 0), longest: asNum(old.bestStreak, 0), lastGoalDay: streakDay, coveredThrough: streakDay, freezes: asNum(old.freezes, 0) },
    hearts: { count: asNum(old.hearts, 5), regenFrom: old.heartsAt },
    gems: { balance: gems, earned: gems, spent: 0 },
    skills,
    srs: { items },
    achievements,
    favourites,
    stats: { 'goal.days': goalDays, 'active.days': Object.keys(days).length },
    meta: { updatedAt, createdAt: updatedAt },
  };
}

/** Migrations by the version they upgrade FROM. Each returns the next version's shape. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = { 1: migrateV1 };

// ---------------------------------------------------------------------------------------------
// Encode / decode
// ---------------------------------------------------------------------------------------------

/** The saved envelope. */
export interface SavedEnvelope {
  app: typeof APP_ID;
  v: number;
  savedAt: number;
  state: ProgressState;
}

/** Serialise a state for storage. */
export function encodeState(state: ProgressState, now: number): string {
  const envelope: SavedEnvelope = { app: APP_ID, v: SCHEMA_VERSION, savedAt: now, state };
  return JSON.stringify(envelope);
}

/** Outcome of decoding saved or imported data. */
export type DecodeResult =
  | { ok: true; state: ProgressState; version: number; savedAt: number; report: SanitizeReport }
  | { ok: false; reason: ImportFailure; detail?: string };

function versionOf(data: Obj): number | null {
  const v = data.v ?? data.schema ?? data.version;
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : null;
}

/**
 * Turn saved or imported data (a JSON string or an already parsed value) into a valid state:
 * parse, find the version, run migrations, then sanitise. `allowNewer` accepts data written by a
 * newer app version on a best-effort basis (used when loading, never when importing).
 */
export function decodeState(input: unknown, env: InitialStateEnv, options: { allowNewer?: boolean } = {}): DecodeResult {
  let data: unknown = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch (err) {
      return { ok: false, reason: 'not-json', detail: String((err as Error)?.message ?? err) };
    }
  }
  if (!isObj(data)) return { ok: false, reason: 'not-an-export', detail: 'not an object' };
  if (data.app !== undefined && data.app !== APP_ID) return { ok: false, reason: 'not-an-export', detail: 'made by another app' };

  const version = versionOf(data);
  if (version === null) return { ok: false, reason: 'not-an-export', detail: 'no version' };
  if (version > SCHEMA_VERSION && !options.allowNewer) return { ok: false, reason: 'newer-version', detail: `version ${version}` };

  // Version 1 had no envelope; from version 2 the state sits under `state`.
  let payload: unknown = version === 1 ? data : data.state;
  if (!isObj(payload)) return { ok: false, reason: 'not-an-export', detail: 'no state' };

  try {
    for (let v = version; v < SCHEMA_VERSION; v++) {
      const step = MIGRATIONS[v];
      if (!step) return { ok: false, reason: 'invalid', detail: `no migration from version ${v}` };
      payload = step(payload as Obj, env);
    }
  } catch (err) {
    return { ok: false, reason: 'invalid', detail: String((err as Error)?.message ?? err) };
  }
  if (!isObj(payload)) return { ok: false, reason: 'invalid', detail: 'migration produced no state' };

  // Something recognisable must be there, or this is some other JSON file.
  if (!isObj(payload.profile) && !isObj(payload.xp) && !isObj(payload.prefs) && !isObj(payload.meta)) {
    return { ok: false, reason: 'not-an-export', detail: 'no progress data' };
  }

  const report: SanitizeReport = { reset: [] };
  // Keep the saved install id; only a state without one gets this install's id.
  const state = sanitizeState(payload, env, report);
  const savedAt = typeof data.savedAt === 'number' ? data.savedAt : typeof data.exportedAt === 'number' ? data.exportedAt : state.meta.updatedAt;
  return { ok: true, state, version, savedAt, report };
}

// ---------------------------------------------------------------------------------------------
// Loading from storage
// ---------------------------------------------------------------------------------------------

/** What happened while loading. The shell can use it to tell the learner about recovered data. */
export interface LoadReport {
  /** `fresh`: nothing saved; `saved`: the normal case; `backup`: the main save was unreadable. */
  source: 'fresh' | 'saved' | 'backup';
  /** Set when the save came from an older version and was migrated. */
  migratedFrom: number | null;
  /** The main save could not be read (it was copied to `<key>.corrupt`). */
  corrupt: boolean;
  /** The save was written by a newer app version and read on a best-effort basis. */
  newer: boolean;
  /** Top-level slices that were unusable and reset to defaults. */
  reset: string[];
}

/** Load the state from storage. Never throws and always returns a usable state. */
export function loadState(storage: StorageAdapter | null, key: string, env: InitialStateEnv): { state: ProgressState; report: LoadReport } {
  const report: LoadReport = { source: 'fresh', migratedFrom: null, corrupt: false, newer: false, reset: [] };
  const fresh = (): ProgressState => createInitialState(env);
  if (!storage) return { state: fresh(), report };

  let raw: string | null = null;
  try {
    raw = storage.read(key);
  } catch {
    raw = null;
  }

  if (raw !== null) {
    const decoded = decodeState(raw, env, { allowNewer: true });
    if (decoded.ok) {
      report.source = 'saved';
      report.reset = decoded.report.reset;
      if (decoded.version < SCHEMA_VERSION) report.migratedFrom = decoded.version;
      if (decoded.version > SCHEMA_VERSION) {
        // An older build is about to overwrite a newer save: keep the original around.
        report.newer = true;
        safeWrite(storage, `${key}.newer`, raw);
      }
      return { state: decoded.state, report };
    }
    report.corrupt = true;
    safeWrite(storage, `${key}.corrupt`, raw.slice(0, 500_000));
  }

  let backup: string | null = null;
  try {
    backup = storage.read(`${key}.bak`);
  } catch {
    backup = null;
  }
  if (backup !== null) {
    const decoded = decodeState(backup, env, { allowNewer: true });
    if (decoded.ok) {
      report.source = 'backup';
      report.reset = decoded.report.reset;
      if (decoded.version < SCHEMA_VERSION) report.migratedFrom = decoded.version;
      return { state: decoded.state, report };
    }
  }
  return { state: fresh(), report };
}

function safeWrite(storage: StorageAdapter, key: string, value: string): boolean {
  try {
    return storage.write(key, value);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Export file
// ---------------------------------------------------------------------------------------------

/** The export file: everything, as one JSON object. */
export interface ProgressExport {
  app: typeof APP_ID;
  kind: 'progress-export';
  v: number;
  exportedAt: number;
  /** The change-stamp of the exported state. */
  stamp: string;
  state: ProgressState;
}

/** A compact stamp that changes whenever the state changes: `<device>.<rev>.<updatedAt>` in base 36. */
export function changeStamp(state: ProgressState): string {
  return `${state.meta.deviceId}.${state.meta.rev.toString(36)}.${Math.round(state.meta.updatedAt).toString(36)}`;
}

/** Build the export object for a state. */
export function buildExport(state: ProgressState, now: number): ProgressExport {
  return { app: APP_ID, kind: 'progress-export', v: SCHEMA_VERSION, exportedAt: now, stamp: changeStamp(state), state };
}

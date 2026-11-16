/**
 * "Your data", complete: one backup file with the progress, every other thing the learner keeps
 * on this device (the practice journal, arcade records, saved progressions, presets, settings ...:
 * see `classifyKey` in `@/core/platform/storage-scope`) and the learner's own songs; importing it
 * back (replace or merge) with a preview; a reset that erases all of it; and an undo for both.
 *
 * FILE FORMAT (`kind: 'backup'`, `v: 3`):
 *   { app, kind, v, exportedAt, progress: <progress export>, data: { key: { at, value | raw } },
 *     songs: [{ listing, json }] | null }
 * Older files (the bare progress export of version 2, the flat version-1 save, a raw save) still
 * import: they carry only the progress, so nothing else on the device is touched.
 *
 * IMPORT. `replace`: the progress and the learner data become the file's (keys only this device
 * has go). `merge` (`newest-wins`): the progress is merged per item as before, and each data key as
 * `mergeEntry` says (lists joined, settings from the side changed last). Songs: importing never
 * deletes a song; songs missing here are added with their own id; a song in both is overwritten
 * by the file's copy with `replace`, and kept as the newer copy with `merge`. Damaged entries are
 * skipped and named, never fatal.
 *
 * RESET erases the progress, the learner data and work in progress (sessions); it keeps the AI key,
 * the device's own bookkeeping, and the learner's songs unless `deleteSongs`. `keepPrefs` keeps the
 * name, the progress preferences and every setting, and erases only what was made or earned.
 *
 * After an import or reset changes learner data, features that hold it in memory are stale, so the
 * caller reloads the page when `reload` is true (a notice left with `leaveNotice` is shown after the
 * reload, with Undo). Where storage does not survive a reload, the change is announced in place instead.
 */
import {
  DATA_ITEMS,
  announceStorageChange,
  classifyKey,
  getLearnerData,
  isRecordKey,
  sanitizeDataSet,
  type DataClass,
  type DataSet,
  type LearnerData,
} from '@/core/platform/storage-scope';
import { planDataImport, type DataPlan } from '@/core/platform/storage-merge';
import type { RemovedSong, SongBackup, SongImportResult } from '@/core/library';
import { getProgressStore } from './actions';
import { mergeStates } from './merge';
import { APP_ID, decodeState, type ProgressExport } from './persist';
import { isObj } from './sanitize';
import type { ProgressStore } from './store';
import type { ImportFailure, MergeStrategy, ProgressState } from './types';

/** Version of the backup file format (the progress inside has its own `v`). */
export const BACKUP_VERSION = 3;
/** Key of the undo of the last import or reset (device-only). */
export const UNDO_KEY = 'data.undo';
/** Key of a message to show once after the page reloads (device-only). */
export const NOTICE_KEY = 'data.notice';
/** How long an import or reset can be undone. */
export const UNDO_MS = 30 * 60_000;
/** Deleted songs are kept for undo up to this size (they share the browser's ~5 MB with everything else). */
export const UNDO_SONG_BYTES = 1_500_000;

/** The backup file. */
export interface BackupFile {
  app: typeof APP_ID;
  kind: 'backup';
  v: number;
  exportedAt: number;
  progress: ProgressExport;
  data: DataSet;
  /** The learner's own songs; null when they could not be read (the library was unavailable). */
  songs: SongBackup[] | null;
}

/** The songs side of a backup (the library by default; tests pass a fake). */
export interface BackupSongs {
  list(): Promise<SongBackup[]>;
  size(): Promise<{ count: number; bytes: number; ids: Array<{ id: string; updatedAt: number }> }>;
  importAll(items: readonly unknown[], strategy: 'merge' | 'replace'): Promise<SongImportResult>;
  removeAll(): Promise<RemovedSong[]>;
  restore(songs: readonly RemovedSong[]): Promise<void>;
  remove(ids: readonly string[]): Promise<void>;
}

/** Where a backup reads from and writes to. Every field is optional; the defaults are the app's own. */
export interface BackupDeps {
  store?: ProgressStore;
  data?: LearnerData;
  /** null: no songs (the backup says so). Default: the song library, loaded on first use. */
  songs?: BackupSongs | null;
  now?: () => number;
}

async function librarySongs(): Promise<BackupSongs | null> {
  try {
    const lib = await import('@/core/library');
    const library = lib.getLibrary();
    return {
      list: () => lib.exportMySongs(library),
      size: () => lib.mySongsSize(library),
      importAll: (items, strategy) => lib.importSongBackups(items, strategy, library),
      removeAll: () => lib.removeMySongs(library),
      restore: async (songs) => {
        for (const song of songs) await library.restore(song);
      },
      remove: async (ids) => {
        for (const id of ids) if (await library.get(id)) await library.remove(id);
      },
    };
  } catch {
    return null;
  }
}

interface Resolved {
  store: ProgressStore;
  data: LearnerData;
  songs: () => Promise<BackupSongs | null>;
  now: () => number;
}

function resolve(deps: BackupDeps = {}): Resolved {
  const store = deps.store ?? getProgressStore();
  let songs: Promise<BackupSongs | null> | null = deps.songs === undefined ? null : Promise.resolve(deps.songs);
  return {
    store,
    data: deps.data ?? getLearnerData(),
    songs: () => (songs ??= librarySongs()),
    now: deps.now ?? (() => store.now()),
  };
}

const isLearner = (key: string): boolean => classifyKey(key) === 'learner';
const isLearnerOrSession = (key: string): boolean => {
  const c = classifyKey(key);
  return c === 'learner' || c === 'session';
};

// ---------------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------------

/** Everything the learner has, as one JSON-serialisable object. */
export async function createBackup(deps?: BackupDeps): Promise<BackupFile> {
  const r = resolve(deps);
  const progress = r.store.exportData();
  const data = r.data.snapshot(isLearner);
  let songs: SongBackup[] | null = null;
  try {
    const port = await r.songs();
    songs = port ? await port.list() : null;
  } catch {
    songs = null;
  }
  return { app: APP_ID, kind: 'backup', v: BACKUP_VERSION, exportedAt: r.now(), progress, data, songs };
}

// ---------------------------------------------------------------------------------------------
// Reading a file
// ---------------------------------------------------------------------------------------------

/** A file that was read and understood. */
export interface ReadBackupOk {
  ok: true;
  /** `full`: a backup of everything; `progress-only`: a file from an older version, with only the progress. */
  format: 'full' | 'progress-only';
  /** Version of the progress inside (older ones are migrated). */
  version: number;
  exportedAt: number;
  /** The progress as the file has it, for the store's own import. */
  progress: unknown;
  /** The progress, decoded and checked. */
  state: ProgressState;
  /** The learner data in the file; null for an older file that has none. */
  data: DataSet | null;
  /** The songs in the file, unchecked (each is checked as it is imported); null when the file has none. */
  songs: unknown[] | null;
  /** Songs that look readable. */
  songCount: number;
  /** What was left out because it is damaged or does not belong in a backup. */
  skipped: string[];
}

/** Read a backup (text or parsed). Nothing is imported. */
export function readBackup(input: unknown, env: { now: number; timeZone?: string; deviceId?: string }): ReadBackupOk | { ok: false; reason: ImportFailure; detail?: string } {
  let parsed: unknown = input;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch (err) {
      return { ok: false, reason: 'not-json', detail: String((err as Error)?.message ?? err) };
    }
  }
  if (isObj(parsed) && parsed.kind === 'backup') {
    if (parsed.app !== APP_ID) return { ok: false, reason: 'not-an-export', detail: 'made by another app' };
    const v = parsed.v;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 3) return { ok: false, reason: 'not-an-export', detail: 'no version' };
    if (v > BACKUP_VERSION) return { ok: false, reason: 'newer-version', detail: `backup version ${v}` };
    const decoded = decodeState(parsed.progress, env);
    if (!decoded.ok) return decoded;
    const { data, skipped } = sanitizeDataSet(parsed.data);
    const songs = Array.isArray(parsed.songs) ? parsed.songs : null;
    const songCount = songs ? songs.filter(looksLikeSong).length : 0;
    if (songs && songCount < songs.length) skipped.push(`${songs.length - songCount} ${songs.length - songCount === 1 ? 'song' : 'songs'}`);
    const exportedAt = typeof parsed.exportedAt === 'number' ? parsed.exportedAt : decoded.savedAt;
    return { ok: true, format: 'full', version: decoded.version, exportedAt, progress: parsed.progress, state: decoded.state, data, songs, songCount, skipped };
  }
  const decoded = decodeState(parsed, env);
  if (!decoded.ok) return decoded;
  return { ok: true, format: 'progress-only', version: decoded.version, exportedAt: decoded.savedAt, progress: parsed, state: decoded.state, data: null, songs: null, songCount: 0, skipped: [] };
}

function looksLikeSong(item: unknown): boolean {
  return isObj(item) && isObj(item.listing) && typeof item.listing.id === 'string' && item.listing.id.startsWith('my-') && typeof item.json === 'string';
}

// ---------------------------------------------------------------------------------------------
// What is there, and what an import would do
// ---------------------------------------------------------------------------------------------

/** One line of "what is included": something the learner made, with how many. */
export interface DataCount {
  id: string;
  label: string;
  unit: readonly [string, string];
  count: number;
}

/** The learner data in words: the things made or earned, and how many settings. */
export function countLearnerData(data: DataSet): { items: DataCount[]; settings: number } {
  const items = DATA_ITEMS.map((item) => {
    const e = data[item.key];
    let count = 0;
    try {
      count = e && e.value !== undefined ? item.count(e.value) : 0;
    } catch {
      count = 0;
    }
    return { id: item.id, label: item.label, unit: item.unit, count };
  });
  const settings = Object.keys(data).filter((key) => isLearner(key) && !isRecordKey(key)).length;
  return { items, settings };
}

/** One line of the preview: now and after. */
export interface DataRow {
  id: string;
  label: string;
  unit: readonly [string, string];
  before: number;
  after: number;
}

/** What an import would do, worked out without changing anything. */
export interface BackupPreview {
  strategy: MergeStrategy;
  /** The progress now and after (for the existing number-by-number table). */
  before: ProgressState;
  after: ProgressState;
  /** The things the learner made, where either side has any. */
  rows: DataRow[];
  /** Settings kept on this device for the screens (tempo, view, chosen key ...). */
  settings: { before: number; after: number };
  /** The learner's songs; null when the file holds none (an older file, or the library was unavailable). */
  songs: { before: number; after: number; inBoth: number } | null;
  /** The file is from an older version and holds only the progress. */
  progressOnly: boolean;
  /** Keys of learner data the import would write or remove. */
  dataChanges: number;
}

/** The learner data plan of an import (scope: learner data only). */
export function planBackupData(local: DataSet, read: ReadBackupOk, strategy: MergeStrategy): DataPlan | null {
  if (!read.data) return null;
  return planDataImport(local, read.data, strategy === 'replace' ? 'replace' : 'merge', isLearner);
}

/** Preview an import. `local.songs` lists the learner's songs here (null when unknown). */
export function previewBackup(read: ReadBackupOk, local: { state: ProgressState; data: DataSet; songs: ReadonlyArray<{ id: string }> | null }, strategy: MergeStrategy, now: number): BackupPreview {
  const after = strategy === 'newest-wins' ? mergeStates(local.state, read.state, now) : read.state;
  const plan = planBackupData(local.data, read, strategy);
  const before = countLearnerData(local.data);
  const afterCounts = plan ? countLearnerData(plan.result) : before;
  const rows: DataRow[] = before.items
    .map((item, i) => ({ id: item.id, label: item.label, unit: item.unit, before: item.count, after: afterCounts.items[i].count }))
    .filter((row) => row.before > 0 || row.after > 0);
  let songs: BackupPreview['songs'] = null;
  if (read.songs && local.songs) {
    const here = new Set(local.songs.map((s) => s.id));
    const ids = new Set(read.songs.filter(looksLikeSong).map((s) => String((s as { listing: { id: string } }).listing.id)));
    let inBoth = 0;
    for (const id of ids) if (here.has(id)) inBoth++;
    songs = { before: here.size, after: here.size + ids.size - inBoth, inBoth };
  }
  return {
    strategy,
    before: local.state,
    after,
    rows,
    settings: { before: before.settings, after: afterCounts.settings },
    songs,
    progressOnly: read.format === 'progress-only',
    dataChanges: plan ? plan.write.length + plan.remove.length : 0,
  };
}

/** The learner's songs here, for a preview (null when the library cannot be read). */
export async function localSongs(deps?: BackupDeps): Promise<{ count: number; bytes: number; ids: Array<{ id: string; updatedAt: number }> } | null> {
  try {
    const port = await resolve(deps).songs();
    return port ? await port.size() : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Undo, and the message after a reload
// ---------------------------------------------------------------------------------------------

interface UndoStash {
  v: 1;
  at: number;
  action: 'import' | 'reset';
  progress: ProgressExport;
  data: DataSet;
  /** The classes `data` covers: these are put back exactly. */
  classes: DataClass[];
  songs: { remove: string[]; restore: RemovedSong[] | null };
}

function writeStash(r: Resolved, stash: UndoStash): boolean {
  try {
    return r.data.write(UNDO_KEY, { at: stash.at, value: stash });
  } catch {
    return false;
  }
}

function readStash(r: Resolved): UndoStash | null {
  const e = r.data.entry(UNDO_KEY);
  const v = e?.value;
  if (!isObj(v) || v.v !== 1 || typeof v.at !== 'number' || !isObj(v.progress) || !isObj(v.data) || !Array.isArray(v.classes) || !isObj(v.songs) || !Array.isArray(v.songs.remove)) return null;
  if (r.now() - v.at > UNDO_MS || v.at > r.now() + 60_000) return null;
  return v as unknown as UndoStash;
}

/** The import or reset that can still be undone, if any. */
export function pendingUndo(deps?: BackupDeps): { action: 'import' | 'reset'; at: number; songs: boolean } | null {
  const stash = readStash(resolve(deps));
  return stash ? { action: stash.action, at: stash.at, songs: stash.songs.restore !== null || stash.songs.remove.length === 0 } : null;
}

/** Forget the undo (it was used, dismissed or has run out). */
export function discardUndo(deps?: BackupDeps): void {
  resolve(deps).data.remove(UNDO_KEY);
}

/** A message for after the reload. */
export interface DataNotice {
  at: number;
  tone: 'ok' | 'warn';
  title: string;
  description?: string;
  /** Offer Undo with it. */
  undo: boolean;
}

/** Leave a message to show once the page has reloaded. */
export function leaveNotice(notice: Omit<DataNotice, 'at'>, deps?: BackupDeps): void {
  const r = resolve(deps);
  r.data.write(NOTICE_KEY, { at: r.now(), value: { ...notice, at: r.now() } });
}

/** The message left before a reload (once: it is removed). Messages older than two minutes are dropped. */
export function takeNotice(deps?: BackupDeps): DataNotice | null {
  const r = resolve(deps);
  const e = r.data.entry(NOTICE_KEY);
  if (!e) return null;
  r.data.remove(NOTICE_KEY);
  const v = e.value;
  if (!isObj(v) || typeof v.title !== 'string' || typeof v.at !== 'number' || r.now() - v.at > 120_000) return null;
  return { at: v.at, tone: v.tone === 'warn' ? 'warn' : 'ok', title: v.title, description: typeof v.description === 'string' ? v.description : undefined, undo: v.undo === true };
}

/** Write a data plan key by key; a key the browser refuses does not stop the others. Returns what changed and what failed. */
function applyPlan(data: LearnerData, plan: DataPlan): { changed: string[]; failed: string[] } {
  const changed: string[] = [];
  const failed: string[] = [];
  for (const key of plan.write) {
    try {
      if (data.write(key, plan.result[key])) changed.push(key);
      else failed.push(key);
    } catch {
      failed.push(key);
    }
  }
  for (const key of plan.remove) {
    try {
      data.remove(key);
      changed.push(key);
    } catch {
      failed.push(key);
    }
  }
  return { changed, failed };
}

/** Reload when learner data changed under the open screens, if a reload keeps it; otherwise tell the page. */
function settle(r: Resolved, changed: readonly string[]): boolean {
  r.store.flush();
  if (changed.length === 0) return false;
  if (r.data.persistent() && changed.some(isLearner)) return true;
  announceStorageChange(changed);
  return false;
}

// ---------------------------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------------------------

/** What an import did. */
export type ApplyResult =
  | {
      ok: true;
      strategy: MergeStrategy;
      /** Reload the page now (features hold the old data in memory). */
      reload: boolean;
      /** It can be undone (the copy of what was there was stored). */
      undo: boolean;
      /** Learner data keys written or removed. */
      changed: string[];
      /** Keys the browser refused to store (it is full). */
      failed: string[];
      songs: SongImportResult | null;
      /** Damaged entries in the file that were left out. */
      skipped: string[];
    }
  | { ok: false; reason: ImportFailure; detail?: string };

/** Import a file that `readBackup` read. */
export async function applyBackup(read: ReadBackupOk, strategy: MergeStrategy, deps?: BackupDeps): Promise<ApplyResult> {
  const r = resolve(deps);
  const before: UndoStash = {
    v: 1,
    at: r.now(),
    action: 'import',
    progress: r.store.exportData(),
    data: r.data.snapshot(isLearner),
    classes: ['learner'],
    songs: { remove: [], restore: [] },
  };
  // The copy for Undo goes first, so even an import that fails half-way can be taken back.
  let undo = writeStash(r, before);
  const progress = r.store.importData(read.progress, strategy);
  if (!progress.ok) {
    if (undo) r.data.remove(UNDO_KEY);
    return progress;
  }

  const plan = planBackupData(before.data, read, strategy);
  const applied = plan ? applyPlan(r.data, plan) : { changed: [], failed: [] };

  let songs: SongImportResult | null = null;
  if (read.songs) {
    try {
      const port = await r.songs();
      songs = port ? await port.importAll(read.songs, strategy === 'replace' ? 'replace' : 'merge') : null;
    } catch {
      songs = null;
    }
  }
  if (songs && (songs.added.length > 0 || songs.replaced.length > 0)) {
    before.songs.remove = songs.added;
    const bytes = songs.replaced.reduce((n, s) => n + s.json.length, 0);
    before.songs.restore = bytes <= UNDO_SONG_BYTES ? songs.replaced : null;
    undo = writeStash(r, before);
  }
  return { ok: true, strategy, reload: settle(r, applied.changed), undo, changed: applied.changed, failed: applied.failed, songs, skipped: read.skipped };
}

// ---------------------------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------------------------

/** What a reset did. */
export interface ResetResult {
  reload: boolean;
  undo: boolean;
  /** Songs deleted (only with `deleteSongs`). */
  songsDeleted: number;
  /** Deleted songs come back with Undo (false when they were too large to keep a copy of). */
  songsUndoable: boolean;
  /** Keys erased. */
  erased: string[];
}

/**
 * Erase the learner's data on this device: progress, everything the learner made, settings (unless
 * `keepPrefs`) and work in progress. The AI key and the device's bookkeeping stay; the learner's
 * songs stay unless `deleteSongs`.
 */
export async function resetEverything(options: { keepPrefs?: boolean; deleteSongs?: boolean } = {}, deps?: BackupDeps): Promise<ResetResult> {
  const r = resolve(deps);
  const keepPrefs = options.keepPrefs === true;
  const stash: UndoStash = {
    v: 1,
    at: r.now(),
    action: 'reset',
    progress: r.store.exportData(),
    data: r.data.snapshot(isLearnerOrSession),
    classes: ['learner', 'session'],
    songs: { remove: [], restore: [] },
  };

  let removed: RemovedSong[] = [];
  if (options.deleteSongs) {
    try {
      const port = await r.songs();
      removed = port ? await port.removeAll() : [];
    } catch {
      removed = [];
    }
  }
  const songBytes = removed.reduce((n, s) => n + s.json.length, 0);
  stash.songs.restore = songBytes <= UNDO_SONG_BYTES ? removed : null;
  // The copy for Undo goes before anything is erased; if the browser has no room for it now, it is
  // tried again once the erased keys have made some.
  let undo = writeStash(r, stash);

  r.store.dispatch({ type: 'reset', keepPrefs });
  r.store.flush();
  r.store.forgetSafetyCopies();

  const erased: string[] = [];
  for (const key of r.data.keys(['learner', 'session'])) {
    if (keepPrefs && classifyKey(key) === 'learner' && !isRecordKey(key)) continue;
    try {
      r.data.remove(key);
      erased.push(key);
    } catch {
      /* already gone */
    }
  }
  if (!undo) undo = writeStash(r, stash);
  return { reload: settle(r, erased), undo, songsDeleted: removed.length, songsUndoable: stash.songs.restore !== null, erased };
}

// ---------------------------------------------------------------------------------------------
// Undo
// ---------------------------------------------------------------------------------------------

/** Put back what the last import or reset changed. */
export async function undoLastChange(deps?: BackupDeps): Promise<{ ok: boolean; reload: boolean; action: 'import' | 'reset' | null }> {
  const r = resolve(deps);
  const stash = readStash(r);
  if (!stash) return { ok: false, reload: false, action: null };
  const progress = r.store.importData(stash.progress, 'replace');
  if (!progress.ok) return { ok: false, reload: false, action: stash.action };
  const inScope = (key: string): boolean => stash.classes.includes(classifyKey(key));
  const { data: back } = sanitizeDataSet(stash.data, { only: inScope });
  const plan = planDataImport(r.data.snapshot(inScope), back, 'replace', inScope);
  const applied = applyPlan(r.data, plan);
  try {
    const port = await r.songs();
    if (port) {
      if (stash.songs.remove.length) await port.remove(stash.songs.remove);
      if (stash.songs.restore?.length) await port.restore(stash.songs.restore);
    }
  } catch {
    /* the songs could not be put back; the rest is */
  }
  r.data.remove(UNDO_KEY);
  return { ok: true, reload: settle(r, applied.changed), action: stash.action };
}

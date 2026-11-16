/**
 * Export, import and reset as data: a summary of a progress state in the numbers a learner cares
 * about, a before/after preview of an import (replace or merge), and the words for what can go
 * wrong. Pure; the store does the importing.
 */
import { COSMETIC_BY_ID, levelInfo, mergeStates, readBackup as readBackupFile, type BackupPreview, type DataCount, type ImportFailure, type LoadReport, type MergeStrategy, type ProgressState, type ReadBackupOk } from '@/core/progress';
import type { SongSyncInfo } from '@/core/platform';
import { dateTimeText, durationText, fileDate, plural, thousands } from '../format';

/** A progress state in a dozen numbers. */
export interface StateSummary {
  name: string;
  level: number;
  title: string;
  xp: number;
  streak: number;
  longestStreak: number;
  gems: number;
  achievements: number;
  /** Skills with any practice. */
  skills: number;
  crowns: number;
  /** Days with any practice. */
  practiceDays: number;
  practiceSec: number;
  /** Cosmetics bought (free ones not counted). */
  cosmetics: number;
  reviewCards: number;
  /** When the state last changed (epoch ms). */
  updatedAt: number;
}

/** Sum a state up. */
export function summarise(state: ProgressState): StateSummary {
  const level = levelInfo(state.xp.total);
  let crowns = 0;
  for (const id in state.skills) crowns += state.skills[id].mastery;
  let practiceDays = 0;
  for (const day in state.days) if (state.days[day].n > 0) practiceDays++;
  return {
    name: state.profile.name,
    level: level.level,
    title: level.title,
    xp: state.xp.total,
    streak: state.streak.current,
    longestStreak: state.streak.longest,
    gems: state.gems.balance,
    achievements: Object.keys(state.achievements).length,
    skills: Object.keys(state.skills).length,
    crowns,
    practiceDays: Math.max(practiceDays, state.stats['active.days'] ?? 0),
    practiceSec: state.stats['time.total'] ?? 0,
    cosmetics: state.cosmetics.filter((id) => (COSMETIC_BY_ID[id]?.price ?? 0) > 0).length,
    reviewCards: Object.keys(state.srs.items).length,
    updatedAt: state.meta.updatedAt,
  };
}

/** One line of the before/after table. */
export interface DiffRow {
  key: string;
  label: string;
  before: string;
  after: string;
  /** `same`: nothing changes; `up` / `down`: a number grows or shrinks; `different`: a text changes. */
  change: 'same' | 'up' | 'down' | 'different';
}

function numberRow(key: string, label: string, before: number, after: number, format: (n: number) => string = thousands): DiffRow {
  return { key, label, before: format(before), after: format(after), change: after === before ? 'same' : after > before ? 'up' : 'down' };
}

/** The before/after table of two summaries. */
export function diffRows(before: StateSummary, after: StateSummary): DiffRow[] {
  const nameOf = (s: StateSummary): string => s.name || 'No name yet';
  return [
    { key: 'name', label: 'Name', before: nameOf(before), after: nameOf(after), change: before.name === after.name ? 'same' : 'different' },
    numberRow('level', 'Level', before.level, after.level),
    numberRow('xp', 'Total XP', before.xp, after.xp),
    numberRow('streak', 'Streak', before.streak, after.streak, (n) => plural(n, 'day')),
    numberRow('gems', 'Gems', before.gems, after.gems),
    numberRow('achievements', 'Achievements', before.achievements, after.achievements),
    numberRow('skills', 'Skills practised', before.skills, after.skills),
    numberRow('crowns', 'Crowns', before.crowns, after.crowns),
    numberRow('days', 'Days practised', before.practiceDays, after.practiceDays),
    numberRow('time', 'Practice time', before.practiceSec, after.practiceSec, durationText),
    numberRow('cosmetics', 'Cosmetics bought', before.cosmetics, after.cosmetics),
    numberRow('cards', 'Review cards', before.reviewCards, after.reviewCards),
  ];
}

/** What an import would do, worked out without changing anything. */
export interface ImportPreview {
  strategy: MergeStrategy;
  before: StateSummary;
  after: StateSummary;
  rows: DiffRow[];
  /** Rows that change. */
  changed: number;
  /** True when at least one number would go down (only possible with `replace`). */
  loses: boolean;
}

/** Preview an import of `incoming` into `local` with a strategy. */
export function previewImport(local: ProgressState, incoming: ProgressState, strategy: MergeStrategy, now: number): ImportPreview {
  const result = strategy === 'newest-wins' ? mergeStates(local, incoming, now) : incoming;
  const before = summarise(local);
  const after = summarise(result);
  const rows = diffRows(before, after);
  return { strategy, before, after, rows, changed: rows.filter((r) => r.change !== 'same').length, loses: rows.some((r) => r.change === 'down') };
}

/** A file that was read and understood, ready to preview. */
export interface ReadFile {
  ok: true;
  state: ProgressState;
  /** When the file was exported (epoch ms). */
  exportedAt: number;
  /** Version of the progress inside. */
  version: number;
  /** Everything the file holds (progress, the learner's other data, songs). */
  backup: ReadBackupOk;
}

/** A file that cannot be imported, with the words to show. */
export interface UnreadableFile {
  ok: false;
  reason: ImportFailure | 'too-large' | 'wrong-type' | 'unreadable';
  title: string;
  description: string;
}

/** Larger than any real backup: three years of daily practice is under 2 MB, and the learner's own songs travel too. */
export const MAX_IMPORT_BYTES = 64_000_000;

/** Why the file picker turned a file away before it was read: its size, or else its type. */
export function rejectionReason(files: ReadonlyArray<{ size: number }>, maxBytes = MAX_IMPORT_BYTES): 'too-large' | 'wrong-type' {
  return files.some((file) => file.size > maxBytes) ? 'too-large' : 'wrong-type';
}

/** The words for a file that cannot be imported. */
export function importFailureText(reason: UnreadableFile['reason']): { title: string; description: string } {
  switch (reason) {
    case 'not-json':
      return { title: 'That file could not be read', description: 'It is not a Sixstring Academy backup, or it was damaged on the way. Pick the .json file that Export saved.' };
    case 'not-an-export':
      return { title: 'That is not a Sixstring Academy backup', description: 'The file is valid, but it was not made by Export on this screen. Pick the .json file that Export saved.' };
    case 'newer-version':
      return { title: 'That backup comes from a newer version of the app', description: 'Update this app first (reload the page), then import the file again.' };
    case 'too-large':
      return { title: 'That file is too large to be a backup', description: 'A backup is a small .json file. Check that you picked the right one.' };
    case 'wrong-type':
      return { title: 'That is not a backup file', description: 'A backup is the .json file that Export saved. Check that you picked the right one.' };
    case 'unreadable':
      return { title: 'That file could not be opened', description: 'The browser could not read it. Try picking it again.' };
    default:
      return { title: 'That backup is damaged', description: 'Parts of it are missing or broken, so it was not imported. Your progress here has not been touched.' };
  }
}

/** Check the text of a picked file. Nothing is imported: this only says whether it could be. */
export function readBackup(text: string, env: { now: number; timeZone?: string; deviceId?: string }): ReadFile | UnreadableFile {
  const read = readBackupFile(text, env);
  if (!read.ok) return { ok: false, reason: read.reason, ...importFailureText(read.reason) };
  return { ok: true, state: read.state, exportedAt: read.exportedAt, version: read.version, backup: read };
}

/** The other lines of the preview: each thing the learner made, the screen settings, the songs. */
export function dataDiffRows(preview: Pick<BackupPreview, 'rows' | 'settings' | 'songs'>): DiffRow[] {
  const row = (key: string, label: string, before: number, after: number, unit: readonly [string, string]): DiffRow => ({
    key,
    label,
    before: plural(before, unit[0], unit[1]),
    after: plural(after, unit[0], unit[1]),
    change: after === before ? 'same' : after > before ? 'up' : 'down',
  });
  const rows = preview.rows.map((r) => row(`data-${r.id}`, r.label, r.before, r.after, r.unit));
  if (preview.settings.before > 0 || preview.settings.after > 0) rows.push(row('settings', 'Screen settings', preview.settings.before, preview.settings.after, ['setting', 'settings']));
  if (preview.songs) rows.push(row('songs', 'Your own songs', preview.songs.before, preview.songs.after, ['song', 'songs']));
  return rows;
}

/** What the import does with the learner's other data, in one or two sentences under the table. */
export function dataImportNote(preview: Pick<BackupPreview, 'strategy' | 'progressOnly' | 'songs'>): string {
  if (preview.progressOnly) return 'This backup was made by an older version of the app and holds only your progress. Your practice journal, saved things, settings and songs here stay as they are.';
  const songs = preview.songs
    ? preview.songs.inBoth > 0
      ? preview.strategy === 'replace'
        ? ` ${plural(preview.songs.inBoth, 'song is', 'songs are')} in both: the file’s copy is used. Importing never deletes a song.`
        : ` ${plural(preview.songs.inBoth, 'song is', 'songs are')} in both: the copy changed last is kept. Importing never deletes a song.`
      : ' Importing never deletes a song.'
    : '';
  return preview.strategy === 'replace'
    ? `Everything else becomes exactly what the file holds: things only this device has are removed.${songs}`
    : `Lists are joined (nothing is lost), and each setting comes from the side where it changed last.${songs}`;
}

/** Bytes in words: "840 B", "12 KB", "3.4 MB". */
export function sizeText(bytes: number): string {
  if (bytes < 1000) return `${Math.max(0, Math.round(bytes))} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  return `${(Math.round(bytes / 100_000) / 10).toFixed(1).replace(/\.0$/, '')} MB`;
}

/** Icons of the things the learner made (an item added later falls back to a generic one). */
export const ITEM_ICONS: Readonly<Record<string, string>> = {
  progress: 'Trophy',
  journal: 'NotebookPen',
  routines: 'ListChecks',
  goals: 'Target',
  arcade: 'Gamepad2',
  progressions: 'Music',
  'progression-draft': 'Music4',
  patterns: 'Drum',
  calibration: 'Timer',
  presets: 'Gauge',
  tunings: 'Guitar',
  settings: 'SlidersHorizontal',
  songs: 'ListMusic',
};

/** One line of "what a backup holds". */
export interface IncludedLine {
  id: string;
  icon: string;
  label: string;
  /** "12 entries", "none yet". */
  detail: string;
  /** Nothing of it yet. */
  empty: boolean;
}

/**
 * What a backup holds right now: the progress and each thing the learner has some of (`lines`),
 * and the names of the kinds they have none of yet (`later`), so the list stays short for a
 * beginner and still says what will travel.
 */
export function includedLines(input: { progress: StateSummary; counts: { items: DataCount[]; settings: number }; songs: { count: number; bytes: number } | null }): { lines: IncludedLine[]; later: string[] } {
  const p = input.progress;
  const progressBits = [`level ${p.level}`, `${thousands(p.xp)} XP`];
  if (p.streak > 0) progressBits.push(`a ${p.streak}-day streak`);
  if (p.achievements > 0) progressBits.push(plural(p.achievements, 'achievement'));
  const all: IncludedLine[] = [{ id: 'progress', icon: ITEM_ICONS.progress, label: 'Progress', detail: `${progressBits.join(', ')}; skills, review cards and settings`, empty: false }];
  for (const item of input.counts.items) {
    all.push({ id: item.id, icon: ITEM_ICONS[item.id] ?? 'Archive', label: item.label, detail: plural(item.count, item.unit[0], item.unit[1]), empty: item.count === 0 });
  }
  all.push({ id: 'settings', icon: ITEM_ICONS.settings, label: 'Screen settings', detail: `${plural(input.counts.settings, 'setting')}: tempos, views, chosen keys`, empty: input.counts.settings === 0 });
  if (input.songs) all.push({ id: 'songs', icon: ITEM_ICONS.songs, label: 'Your own songs', detail: `${plural(input.songs.count, 'song')}, ${sizeText(input.songs.bytes)}`, empty: input.songs.count === 0 });
  return { lines: all.filter((line) => !line.empty), later: all.filter((line) => line.empty).map((line) => line.label.charAt(0).toLowerCase() + line.label.slice(1)) };
}

/** What never leaves this device, line by line. */
export function staysLines(input: { hasApiKey: boolean }): Array<{ id: string; icon: string; label: string; detail: string }> {
  const lines = [
    { id: 'device', icon: 'Smartphone', label: 'About this device', detail: 'Notices you have already seen, open sidebar groups, the guitar-at-hand and sound switches.' },
    { id: 'session', icon: 'Hourglass', label: 'Work in progress', detail: 'A practice session that is running, a lesson half done, where you were in each song. A reset clears these too.' },
  ];
  if (input.hasApiKey) lines.unshift({ id: 'key', icon: 'KeyRound', label: 'Your API key', detail: 'Never in a backup or the cloud, and a reset keeps it. Remove it under Settings, AI helper.' });
  return lines;
}

/** The sentence about songs under the cloud sync status, or null when there is nothing to say. */
export function songSyncText(songs: SongSyncInfo | null, limits: { songs: number; bytes: number; songBytes: number }): string | null {
  if (!songs) return null;
  if (songs.synced) return songs.count > 0 ? `Your ${plural(songs.count, 'song')} sync too.` : 'Songs you add sync too.';
  const why =
    songs.reason === 'count'
      ? `cloud sync carries up to ${limits.songs} songs and you have ${songs.count}`
      : songs.reason === 'size'
        ? `one of them is larger than ${sizeText(limits.songBytes)}, the most one song can be`
        : songs.reason === 'total'
          ? `together they are ${sizeText(songs.bytes)} and cloud sync carries up to ${sizeText(limits.bytes)}`
          : 'the songs on another of your devices are more than cloud sync can carry';
  return `Your songs stay on each device: ${why}. Export a backup to move them.`;
}

/** The sentence about what cloud sync carries. */
export const SYNC_CARRIES = 'Everything in a backup syncs except the rhythm calibration, which each device measures for itself.';

/** The file name of an export: `sixstring-backup-robin-2026-11-15.json`. */
export function exportFileName(name: string, at: number): string {
  const who = name
    .toLowerCase()
    .normalize('NFKD')
    // Drop the accents that normalising split off, so "José" reads "jose", not "jose-".
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return `sixstring-backup-${who ? `${who}-` : ''}${fileDate(at)}.json`;
}

/** JSON with object keys in a fixed order, so two equal values always give the same text. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * The slices that make two states "the same progress", as one text that is equal exactly when they
 * are. Bookkeeping (the revision, when it was saved, which install wrote it) is left out, and the
 * order in which keys happen to be stored does not matter.
 */
export function progressFingerprint(state: ProgressState): string {
  return canonical([state.profile, state.prefs, state.xp.total, state.xp.byTag, state.days, state.streak, state.hearts.count, state.gems, [...state.cosmetics].sort(), state.skills, state.achievements, state.srs.items, state.favourites, state.quests, state.stats, state.log, state.recents]);
}

/** The word to type before everything is erased. */
export const RESET_WORD = 'RESET';

/** True when the typed text confirms a reset (case and surrounding spaces are forgiven). */
export function confirmsReset(typed: string): boolean {
  return typed.trim().toUpperCase() === RESET_WORD;
}

/** Whether progress survives closing the browser, in words. */
export interface StorageStatus {
  tone: 'ok' | 'warn' | 'bad';
  title: string;
  text: string;
}

/** Describe where progress is kept and whether saving works. */
export function storageStatus(input: { persistent: boolean; saveFailed: boolean; report: Pick<LoadReport, 'source' | 'corrupt' | 'newer'>; host: 'standalone' | 'artifact'; savedAt: number }): StorageStatus {
  if (!input.persistent) {
    return {
      tone: 'bad',
      title: 'Progress is not being saved',
      text:
        input.host === 'artifact'
          ? 'This view cannot store anything in the browser, so progress lasts until you close it. Export a backup to keep it.'
          : 'This browser is blocking storage for this page (a private window does that). Progress lasts until you close the tab. Export a backup to keep it.',
    };
  }
  if (input.saveFailed) {
    return { tone: 'bad', title: 'The last save did not work', text: 'The browser refused to store your progress, most likely because its storage is full. Export a backup now, then free some space.' };
  }
  if (input.report.corrupt) {
    return {
      tone: 'warn',
      title: input.report.source === 'backup' ? 'Recovered from yesterday’s backup' : 'The saved progress could not be read',
      text:
        input.report.source === 'backup'
          ? 'The save on this device was damaged, so the app went back to its last good copy. Anything since then may be missing.'
          : 'The save on this device was damaged and there was no good copy to fall back on, so the app started fresh. If you have an exported backup, import it below.',
    };
  }
  if (input.report.newer) {
    return { tone: 'warn', title: 'Saved by a newer version of the app', text: 'Your progress was read as well as this version can. Reload the page to get the newest version.' };
  }
  return {
    tone: 'ok',
    title: 'Saved on this device',
    text: `Your progress is stored in this browser and survives closing it. Last saved ${dateTimeText(input.savedAt)}. Clearing the browser’s site data erases it, so keep a backup file.`,
  };
}

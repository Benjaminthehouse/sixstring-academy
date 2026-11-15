/**
 * Export, import and reset as data: a summary of a progress state in the numbers a learner cares
 * about, a before/after preview of an import (replace or merge), and the words for what can go
 * wrong. Pure; the store does the importing.
 */
import { COSMETIC_BY_ID, decodeState, levelInfo, mergeStates, type ImportFailure, type LoadReport, type MergeStrategy, type ProgressState } from '@/core/progress';
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
  /** Version of the file format. */
  version: number;
}

/** A file that cannot be imported, with the words to show. */
export interface UnreadableFile {
  ok: false;
  reason: ImportFailure | 'too-large' | 'unreadable';
  title: string;
  description: string;
}

/** Larger than any real export (three years of daily practice is under 2 MB). */
export const MAX_IMPORT_BYTES = 8_000_000;

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
    case 'unreadable':
      return { title: 'That file could not be opened', description: 'The browser could not read it. Try picking it again.' };
    default:
      return { title: 'That backup is damaged', description: 'Parts of it are missing or broken, so it was not imported. Your progress here has not been touched.' };
  }
}

/** Check the text of a picked file. Nothing is imported: this only says whether it could be. */
export function readBackup(text: string, env: { now: number; timeZone?: string; deviceId?: string }): ReadFile | UnreadableFile {
  const decoded = decodeState(text, env);
  if (!decoded.ok) return { ok: false, reason: decoded.reason, ...importFailureText(decoded.reason) };
  return { ok: true, state: decoded.state, exportedAt: decoded.savedAt, version: decoded.version };
}

/** The file name of an export: `sixstring-progress-robin-2026-11-15.json`. */
export function exportFileName(name: string, at: number): string {
  const who = name
    .toLowerCase()
    .normalize('NFKD')
    // Drop the accents that normalising split off, so "José" reads "jose", not "jose-".
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return `sixstring-progress-${who ? `${who}-` : ''}${fileDate(at)}.json`;
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

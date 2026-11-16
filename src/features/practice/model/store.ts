/**
 * The practice data this feature owns: the learner's routines, the journal, focus goals and the
 * weekly minutes goal. XP, streaks and minutes stay in `core/progress`; this is content the learner
 * writes (names, notes, goals), saved through the platform storage layer under `practice.data`.
 *
 * Framework-free: `getPracticeData` / `updatePracticeData` / `subscribePracticeData`, plus a hook in
 * `usePracticeData.ts`. Other tabs' writes arrive through the storage event.
 */
// The storage file itself, not the platform barrel: this module loads with the global session bar
// on every screen, and the barrel would bring the AI, file and sync services along.
import { readJSON, writeJSON } from '@/core/platform/storage';
import { MAX_JOURNAL, parseEntry, type JournalEntry } from './journal';
import { parseGoal, type FocusGoal } from './goals';
// The routine parser without the exercise pool and the planner (`routines.ts` brings both), for
// the same reason: this file is part of the session bar on every screen.
import { MAX_ROUTINES, parseRoutine, type Routine } from './routine-data';

/** Everything saved under `practice.data`. */
export interface PracticeData {
  v: 1;
  routines: Routine[];
  journal: JournalEntry[];
  goals: FocusGoal[];
  /** Weekly minutes goal; null follows the daily goal. */
  weeklyGoalMin: number | null;
}

/** Storage key (the platform layer adds its own prefix). */
export const PRACTICE_DATA_KEY = 'practice.data';

/** An empty data set. */
export function emptyPracticeData(): PracticeData {
  return { v: 1, routines: [], journal: [], goals: [], weeklyGoalMin: null };
}

/** Read saved data into a valid shape; anything damaged is dropped, never thrown. */
export function parsePracticeData(value: unknown): PracticeData {
  const out = emptyPracticeData();
  if (typeof value !== 'object' || value === null) return out;
  const v = value as Record<string, unknown>;
  if (Array.isArray(v.routines)) out.routines = v.routines.map(parseRoutine).filter((r): r is Routine => r !== null).slice(0, MAX_ROUTINES);
  if (Array.isArray(v.journal)) {
    const seen = new Set<string>();
    out.journal = v.journal
      .map(parseEntry)
      .filter((e): e is JournalEntry => e !== null && !seen.has(e.id) && (seen.add(e.id), true))
      .sort((a, b) => b.endedAt - a.endedAt)
      .slice(0, MAX_JOURNAL);
  }
  if (Array.isArray(v.goals)) out.goals = v.goals.map(parseGoal).filter((g): g is FocusGoal => g !== null);
  if (typeof v.weeklyGoalMin === 'number' && Number.isFinite(v.weeklyGoalMin)) out.weeklyGoalMin = clampWeekly(v.weeklyGoalMin);
  return out;
}

/** Weekly goals between 15 minutes and 20 hours, in 15-minute steps. */
export function clampWeekly(minutes: number): number {
  return Math.min(1200, Math.max(15, Math.round(minutes / 15) * 15));
}

let data: PracticeData | null = null;
const listeners = new Set<() => void>();

function load(): PracticeData {
  return parsePracticeData(readJSON<unknown>(PRACTICE_DATA_KEY, null));
}

function emit(): void {
  for (const l of [...listeners]) l();
}

let watching = false;
function watchOtherTabs(): void {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key.endsWith(PRACTICE_DATA_KEY)) {
      data = load();
      emit();
    }
  });
}

/** The current data (loaded on first use). */
export function getPracticeData(): PracticeData {
  if (!data) {
    data = load();
    watchOtherTabs();
  }
  return data;
}

/** Change the data and save it. Returns the new data. */
export function updatePracticeData(change: (current: PracticeData) => PracticeData): PracticeData {
  const next = change(getPracticeData());
  if (next === data) return next;
  data = next;
  writeJSON(PRACTICE_DATA_KEY, next);
  emit();
  return next;
}

/** Listen for changes; returns the unsubscribe function. */
export function subscribePracticeData(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests: replace the in-memory copy (and optionally what is saved). */
export function setPracticeDataForTests(next: PracticeData | null): void {
  data = next;
  emit();
}

/** Add a journal entry (newest first, bounded). */
export function addJournalEntry(entry: JournalEntry): void {
  updatePracticeData((d) => ({ ...d, journal: [entry, ...d.journal.filter((e) => e.id !== entry.id)].slice(0, MAX_JOURNAL) }));
}

/** Change one journal entry. */
export function updateJournalEntry(id: string, patch: Partial<Pick<JournalEntry, 'feel' | 'note'>>): void {
  updatePracticeData((d) => ({ ...d, journal: d.journal.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
}

/** Remove one journal entry; returns it (for undo). */
export function removeJournalEntry(id: string): JournalEntry | null {
  const found = getPracticeData().journal.find((e) => e.id === id) ?? null;
  if (found) updatePracticeData((d) => ({ ...d, journal: d.journal.filter((e) => e.id !== id) }));
  return found;
}

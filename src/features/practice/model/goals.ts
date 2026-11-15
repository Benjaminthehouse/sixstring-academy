/**
 * Focus goals: up to three things the learner is working toward ("Clean F barre chord", "A minor
 * pentatonic at 100 BPM"), each with an area, an optional target date and progress they mark by
 * hand. The planner gives the open ones time first, the most urgent first.
 */
import { diffDays, type DayKey, type ExperienceLevel } from '@/core/progress';
import { isArea, type Area } from './areas';
import type { GoalSignal } from './planner';

/** One focus goal. */
export interface FocusGoal {
  id: string;
  title: string;
  area: Area;
  /** Target date, or null for "no deadline". */
  targetDay: DayKey | null;
  /** 0 to 100, in steps the learner chooses. */
  progress: number;
  createdAt: number;
  /** When it was marked achieved. */
  doneAt: number | null;
}

/** Open goals at most. */
export const MAX_OPEN_GOALS = 3;
/** Longest goal title. */
export const MAX_GOAL_TITLE = 80;
/** Achieved goals kept for the record. */
export const MAX_DONE_GOALS = 30;

/** Ready-made goals to pin with one tap, per level. */
export const GOAL_SUGGESTIONS: Readonly<Record<ExperienceLevel, ReadonlyArray<{ title: string; area: Area }>>> = {
  beginner: [
    { title: 'Change G to C cleanly 30 times a minute', area: 'chords' },
    { title: 'Strum D, DU, UDU at 80 BPM', area: 'rhythm' },
    { title: 'Name every note on the low E string', area: 'theory' },
    { title: 'Play a whole song without stopping', area: 'repertoire' },
  ],
  intermediate: [
    { title: 'Clean F barre chord', area: 'chords' },
    { title: 'A minor pentatonic at 100 BPM', area: 'scales' },
    { title: 'Bend a whole step in tune', area: 'technique' },
    { title: 'Hear major and minor every time', area: 'ear' },
  ],
  expert: [
    { title: 'Three-notes-per-string G major at 140 BPM', area: 'scales' },
    { title: 'Drop-2 voicings in every inversion', area: 'chords' },
    { title: 'Transcribe one solo by ear', area: 'ear' },
    { title: 'Perform one piece start to finish', area: 'repertoire' },
  ],
};

/** Goals still being worked on, oldest first. */
export function openGoals(goals: readonly FocusGoal[]): FocusGoal[] {
  return goals.filter((g) => g.doneAt === null).sort((a, b) => a.createdAt - b.createdAt);
}

/** Achieved goals, most recent first. */
export function achievedGoals(goals: readonly FocusGoal[]): FocusGoal[] {
  return goals.filter((g) => g.doneAt !== null).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
}

/** Days from today to a goal's target date (negative when past), or null without one. */
export function daysLeft(goal: FocusGoal, today: DayKey): number | null {
  return goal.targetDay ? diffDays(today, goal.targetDay) : null;
}

/** The open goals as the planner wants them: the nearest target date first, undated last. */
export function goalSignals(goals: readonly FocusGoal[], today: DayKey): GoalSignal[] {
  return openGoals(goals)
    .map((g) => ({ id: g.id, title: g.title, area: g.area, daysLeft: daysLeft(g, today), createdAt: g.createdAt }))
    .sort((a, b) => {
      const da = a.daysLeft ?? Number.POSITIVE_INFINITY;
      const db = b.daysLeft ?? Number.POSITIVE_INFINITY;
      return da - db || a.createdAt - b.createdAt;
    })
    .map(({ createdAt: _createdAt, ...signal }) => signal);
}

/** What a new goal needs. */
export interface GoalInput {
  title: string;
  area: Area;
  targetDay?: DayKey | null;
}

/** Why a goal could not be added or saved. */
export type GoalError = 'empty' | 'full';

function cleanTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim().slice(0, MAX_GOAL_TITLE);
}

function cleanDay(day: DayKey | null | undefined): DayKey | null {
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/** Add a goal (refused when three are already open or the title is empty). */
export function addGoal(goals: readonly FocusGoal[], input: GoalInput, now: number, id: string): { goals: FocusGoal[]; error: GoalError | null } {
  const title = cleanTitle(input.title);
  if (!title) return { goals: [...goals], error: 'empty' };
  if (openGoals(goals).length >= MAX_OPEN_GOALS) return { goals: [...goals], error: 'full' };
  const goal: FocusGoal = { id, title, area: input.area, targetDay: cleanDay(input.targetDay), progress: 0, createdAt: now, doneAt: null };
  return { goals: [...goals, goal], error: null };
}

/** Change a goal's title, area or date. */
export function editGoal(goals: readonly FocusGoal[], id: string, patch: Partial<GoalInput>): FocusGoal[] {
  return goals.map((g) => {
    if (g.id !== id) return g;
    const title = patch.title !== undefined ? cleanTitle(patch.title) || g.title : g.title;
    return { ...g, title, area: patch.area ?? g.area, targetDay: patch.targetDay !== undefined ? cleanDay(patch.targetDay) : g.targetDay };
  });
}

/** Set progress (0 to 100). Reaching 100 does not close the goal by itself: the learner says so. */
export function setGoalProgress(goals: readonly FocusGoal[], id: string, progress: number): FocusGoal[] {
  const p = Math.min(100, Math.max(0, Math.round(Number.isFinite(progress) ? progress : 0)));
  return goals.map((g) => (g.id === id ? { ...g, progress: p } : g));
}

/** Mark a goal achieved (or reopen it when `done` is false and there is room). */
export function markGoal(goals: readonly FocusGoal[], id: string, done: boolean, now: number): FocusGoal[] {
  if (!done && openGoals(goals).length >= MAX_OPEN_GOALS) return [...goals];
  const out = goals.map((g) => (g.id === id ? { ...g, doneAt: done ? now : null, progress: done ? 100 : g.progress } : g));
  // Keep the record of achieved goals bounded.
  const achieved = achievedGoals(out);
  if (achieved.length <= MAX_DONE_GOALS) return out;
  const drop = new Set(achieved.slice(MAX_DONE_GOALS).map((g) => g.id));
  return out.filter((g) => !drop.has(g.id));
}

/** Remove a goal. */
export function removeGoal(goals: readonly FocusGoal[], id: string): FocusGoal[] {
  return goals.filter((g) => g.id !== id);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A goal from saved data, or null when it is malformed. */
export function parseGoal(v: unknown): FocusGoal | null {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.title !== 'string' || !isArea(v.area)) return null;
  const title = cleanTitle(v.title);
  if (!title) return null;
  const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
  return {
    id: v.id,
    title,
    area: v.area,
    targetDay: cleanDay(typeof v.targetDay === 'string' ? v.targetDay : null),
    progress: Math.min(100, Math.max(0, Math.round(num(v.progress, 0)))),
    createdAt: num(v.createdAt, 0),
    doneAt: typeof v.doneAt === 'number' && Number.isFinite(v.doneAt) ? v.doneAt : null,
  };
}

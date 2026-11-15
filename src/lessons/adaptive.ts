/**
 * Adaptive difficulty for generated drills. The aim (the app's rule) is that a learner succeeds
 * roughly 80 % of the time: often enough to feel good, rarely enough to keep learning.
 *
 * Difficulty is a number from 0 to 1 that says how much of each generator's easiest-first pools is
 * in play. It moves by a weighted staircase: a small step up after a right answer, a step four
 * times as large down after a wrong one. Those steps balance exactly when four answers in five are
 * right, so the staircase settles where the learner's success rate is 80 %.
 */
import type { JsonValue, SkillRecord } from '@/core/progress';
import type { CourseLevel } from './types';

/** The success rate the staircase aims for. */
export const TARGET_SUCCESS = 0.8;

/** How far a right answer raises the difficulty. */
export const STEP_UP = 0.04;

/** How far a wrong answer lowers it: `STEP_UP * target / (1 - target)`, so the two balance at the target. */
export const STEP_DOWN = (STEP_UP * TARGET_SUCCESS) / (1 - TARGET_SUCCESS);

/** Where a learner with no history starts, by course level. */
export const START_DIFFICULTY: Readonly<Record<CourseLevel, number>> = { beginner: 0.2, intermediate: 0.45, expert: 0.7 };

const clamp = (d: number): number => Math.min(1, Math.max(0, Number.isFinite(d) ? d : 0));

/** The difficulty after one more answer. */
export function nextDifficulty(difficulty: number, correct: boolean): number {
  return clamp(clamp(difficulty) + (correct ? STEP_UP : -STEP_DOWN));
}

/** The difficulty after a run of answers, oldest first. */
export function difficultyAfter(start: number, results: readonly boolean[]): number {
  return results.reduce((d, correct) => nextDifficulty(d, correct), clamp(start));
}

/** Share of right answers (0 to 1); null for an empty list. */
export function successRate(results: readonly boolean[]): number | null {
  return results.length === 0 ? null : results.filter(Boolean).length / results.length;
}

/** The difficulty a session left on a skill (`data.d`, written by `recordActivity`), or null. */
export function storedDifficulty(record: Pick<SkillRecord, 'data'> | null | undefined): number | null {
  const data: JsonValue | undefined = record?.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const d = data.d;
  return typeof d === 'number' && Number.isFinite(d) ? clamp(d) : null;
}

/**
 * Where to start a drill for a learner, from their recent results for the skill:
 *
 *   1. the difficulty their last session on this skill ended at, when it was saved;
 *   2. otherwise the level's starting point, shifted by how far their recent accuracies sit from
 *      the 80 % target (a learner at 95 % starts harder, one at 60 % easier);
 *   3. otherwise the level's starting point.
 *
 * Several records (a unit drill covers several lessons) are averaged.
 */
export function startingDifficulty(level: CourseLevel, records: ReadonlyArray<Pick<SkillRecord, 'data' | 'history'> | null | undefined> = []): number {
  const base = START_DIFFICULTY[level] ?? START_DIFFICULTY.beginner;
  const estimates: number[] = [];
  for (const record of records) {
    if (!record) continue;
    const stored = storedDifficulty(record);
    if (stored !== null) {
      estimates.push(stored);
      continue;
    }
    const recent = (record.history ?? []).slice(-5);
    if (recent.length > 0) {
      const mean = recent.reduce((sum, percent) => sum + percent, 0) / recent.length / 100;
      estimates.push(clamp(base + (mean - TARGET_SUCCESS)));
    }
  }
  if (estimates.length === 0) return base;
  return clamp(estimates.reduce((sum, d) => sum + d, 0) / estimates.length);
}

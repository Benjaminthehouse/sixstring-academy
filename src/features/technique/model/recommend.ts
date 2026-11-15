/**
 * What to practise next: the first exercise at the learner's level that is not at its goal yet,
 * and whether to warm up or cool down first.
 */
import { TECHNIQUE_EXERCISES, type TechniqueExercise } from '@/content/technique';
import type { ProgressState } from '@/core/progress';
import { readRecord } from './history';
import { climbs } from './ladder';

/** Plan levels each experience band works in. */
export const LEVEL_BANDS: Record<'beginner' | 'intermediate' | 'expert', [number, number]> = {
  beginner: [1, 3],
  intermediate: [3, 6],
  expert: [6, 10],
};

/** The best clean tempo stored for an exercise, or null. */
export function bestOf(state: Pick<ProgressState, 'skills'>, id: string): number | null {
  return readRecord(state.skills[`technique:${id}`]?.data).best;
}

/** Whether an exercise has reached its goal (fixed-tempo ones: a clean pass). */
export function atGoal(e: TechniqueExercise, best: number | null): boolean {
  if (best === null) return false;
  return climbs(e.tempo) ? best >= e.tempo.goal : true;
}

/**
 * The exercise to suggest: inside the learner's band, not a routine or a guide, not at its goal,
 * preferring ones never tried at the easiest level, then the one closest to its goal.
 */
export function recommend(state: Pick<ProgressState, 'skills' | 'profile'>): TechniqueExercise {
  const band = LEVEL_BANDS[state.profile.experience] ?? LEVEL_BANDS.beginner;
  const pool = TECHNIQUE_EXERCISES.filter((e) => e.mode === 'ladder' || e.mode === 'changes');
  const inBand = pool.filter((e) => e.level >= band[0] && e.level <= band[1]);
  const open = inBand.filter((e) => !atGoal(e, bestOf(state, e.id)));
  // Something already started and not finished comes first: momentum.
  const started = open.filter((e) => bestOf(state, e.id) !== null);
  if (started.length) return started[0];
  if (open.length) return open[0];
  const above = pool.find((e) => e.level > band[1] && !atGoal(e, bestOf(state, e.id)));
  return above ?? inBand[0] ?? pool[0];
}

/** Whether the learner did the warm-up today (any technique warm-up activity recorded today). */
export function warmedUpToday(state: Pick<ProgressState, 'skills'>, todayStartMs: number): boolean {
  const s = state.skills['technique:tech-warm-up'];
  return !!s?.lastAt && s.lastAt >= todayStartMs;
}

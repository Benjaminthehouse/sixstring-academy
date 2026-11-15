/**
 * Scoring shared by every game: points, the combo multiplier, speed and timing judgements, stars.
 * Stars follow the app-wide rule for game rounds (60 / 80 / 95 % accuracy), so a star means the
 * same thing here as in every other game.
 */

/** 0–3 stars. */
export type Stars = 0 | 1 | 2 | 3;

/** Stars for an accuracy (0–1): 60 % one, 80 % two, 95 % three. */
export function starsFor(accuracy: number): Stars {
  if (!(accuracy >= 0.6)) return 0;
  if (accuracy >= 0.95) return 3;
  if (accuracy >= 0.8) return 2;
  return 1;
}

/** Points multiplier for a combo: ×1 at the start, +0.1 per hit in a row, capped at ×2. */
export function comboMultiplier(combo: number): number {
  return 1 + Math.min(10, Math.max(0, combo)) * 0.1;
}

/** Combo steps where the game cheers (the combo sound rises and a badge pops). */
export function isComboMilestone(combo: number): boolean {
  return combo >= 5 && combo % 5 === 0;
}

/** Speed verdict for finding a note. */
export type Speed = 'fast' | 'good' | 'slow';

/** Fast under 1.5 s, good under 3 s, slow after that. */
export function speedOf(seconds: number): Speed {
  if (seconds < 1.5) return 'fast';
  if (seconds < 3) return 'good';
  return 'slow';
}

/** Speed bonus: the full 100 under a second, nothing after four seconds. */
export function speedBonus(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0;
  return Math.round(100 * Math.min(1, Math.max(0, (4 - seconds) / 3)));
}

/** Points for one found note: 100, plus the speed bonus, times the combo multiplier; half without a first-try hit. */
export function findPoints(seconds: number, combo: number, firstTry: boolean): number {
  const base = 100 + speedBonus(seconds);
  return Math.round((firstTry ? base : base / 2) * comboMultiplier(combo));
}

/** When a note lands against the beat. */
export type Timing = 'early' | 'on-time' | 'late';

/**
 * The on-time window for notes `noteSec` apart: 18 % of the gap, never tighter than 60 ms or
 * looser than 110 ms. Slow notes get room; fast runs stay strict enough to mean something.
 */
export function onTimeWindow(noteSec: number): number {
  return Math.min(0.11, Math.max(0.06, 0.18 * noteSec));
}

/** Judge a deviation from the beat in seconds (negative = early). */
export function judgeTiming(deviation: number, window: number): Timing {
  if (deviation < -window) return 'early';
  if (deviation > window) return 'late';
  return 'on-time';
}

/** Points for a note in time: 100 on the beat, 60 early or late. */
export function timingPoints(timing: Timing, combo: number): number {
  return Math.round((timing === 'on-time' ? 100 : 60) * comboMultiplier(combo));
}

/** Credit a note earns toward accuracy: a full note on time, half early or late. */
export function timingCredit(timing: Timing): number {
  return timing === 'on-time' ? 1 : 0.5;
}

/** A tally of hits and misses that keeps the combo. */
export interface Tally {
  score: number;
  combo: number;
  bestCombo: number;
  hits: number;
  misses: number;
}

/** A fresh tally. */
export function newTally(): Tally {
  return { score: 0, combo: 0, bestCombo: 0, hits: 0, misses: 0 };
}

/** Add a hit worth `points` (already multiplied). */
export function addHit(t: Tally, points: number): Tally {
  const combo = t.combo + 1;
  return { score: t.score + points, combo, bestCombo: Math.max(t.bestCombo, combo), hits: t.hits + 1, misses: t.misses };
}

/** Add a miss: the combo starts again. */
export function addMiss(t: Tally): Tally {
  return { ...t, combo: 0, misses: t.misses + 1 };
}

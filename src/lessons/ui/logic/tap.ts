/**
 * Timing of a tap-rhythm exercise: the count-in, the clicks that keep the beat while the learner
 * taps, when to stop listening, and the conversion of raw tap timestamps into "seconds from beat
 * one" for the grader.
 */
import { parseRhythm, tickSeconds } from '../../rhythm';
import { tapTargets, tapToleranceMs } from '../../grade';
import type { CourseLevel, TapRhythmExercise } from '../../types';

/** One click of the count-in or of the running beat. Times are seconds from the first click. */
export interface TapClick {
  at: number;
  /** First beat of a bar. */
  accent: boolean;
  /** The number shown and counted ("1", "2" ...). */
  count: number;
  /** Part of the count-in (before beat one). */
  countIn: boolean;
}

/** Everything a tap-rhythm screen schedules. */
export interface TapPlan {
  /** Seconds between clicks. */
  beat: number;
  /** Clicks per bar. */
  beatsPerBar: number;
  /** Seconds of count-in before beat one (0 for `first-tap`). */
  countIn: number;
  /** Seconds the rhythm lasts from beat one. */
  length: number;
  /** Count-in and running clicks, from the first click. */
  clicks: TapClick[];
  /** When each note falls, seconds from beat one. */
  targets: number[];
  /** Seconds after beat one at which listening stops and the taps are handed in. */
  stopAfter: number;
  /** The timing window, ms. */
  toleranceMs: number;
}

/** Plan a tap-rhythm exercise. */
export function tapPlan(exercise: TapRhythmExercise, level: CourseLevel = 'beginner'): TapPlan {
  const parsed = parseRhythm(exercise.rhythm);
  const unit = Math.max(1, parsed.time.unitTicks);
  const beatsPerBar = Math.max(1, Math.round(parsed.barTicks / unit));
  const beat = tickSeconds(unit, exercise.tempo);
  const firstTap = exercise.start === 'first-tap';
  const countBeats = firstTap ? 0 : beatsPerBar;
  const countIn = countBeats * beat;
  const length = tickSeconds(parsed.totalTicks, exercise.tempo);
  const clicks: TapClick[] = [];
  for (let i = 0; i < countBeats; i++) clicks.push({ at: i * beat, accent: i === 0, count: i + 1, countIn: true });
  if (!firstTap) {
    const running = Math.round(parsed.totalTicks / unit);
    for (let i = 0; i < running; i++) clicks.push({ at: countIn + i * beat, accent: i % beatsPerBar === 0, count: (i % beatsPerBar) + 1, countIn: false });
  }
  const targets = tapTargets(exercise);
  const toleranceMs = tapToleranceMs({ ...exercise, level: exercise.level ?? level });
  const last = targets.length > 0 ? targets[targets.length - 1] : length;
  // Listen a little past the end of the rhythm, so a late last tap still counts.
  const stopAfter = Math.max(length, last + Math.max(0.6, beat)) + 0.15;
  return { beat, beatsPerBar, countIn, length, clicks, targets, stopAfter, toleranceMs };
}

/**
 * Taps in seconds from beat one, from raw timestamps in ms (`performance.now()` or event time
 * stamps) and the moment beat one was heard. Taps more than a beat before beat one are dropped.
 */
export function tapsFromBeatOne(rawMs: readonly number[], beatOneMs: number, beat: number): number[] {
  return rawMs
    .map((t) => (t - beatOneMs) / 1000)
    .filter((t) => Number.isFinite(t) && t >= -beat)
    .sort((a, b) => a - b)
    .map((t) => Math.round(t * 1000) / 1000);
}

/** Which count is showing at a moment `t` seconds after the first click (null before and after). */
export function countAt(plan: TapPlan, t: number): TapClick | null {
  let current: TapClick | null = null;
  for (const c of plan.clicks) {
    if (c.at <= t + 1e-6) current = c;
    else break;
  }
  if (!current) return null;
  return t - current.at < plan.beat ? current : null;
}

/**
 * The tempo ladder: start slow, go up one step after a clean pass, step back after two passes
 * that are not clean yet, stop at the goal. The learner can always set the tempo by hand.
 */
import type { TempoLadder } from '@/content/technique';
import type { Verdict } from './takes';

/** Slowest and fastest tempo the screen offers, whatever the ladder says. */
export const MIN_TEMPO = 30;
export const MAX_TEMPO = 240;

/** The ladder state in one visit. */
export interface LadderState {
  tempo: number;
  /** Passes at this tempo that were not clean yet, in a row. */
  missesHere: number;
}

/** What a pass did to the tempo. */
export type LadderMove = 'up' | 'down' | 'stay' | 'goal' | 'fixed';

/** Whether the ladder climbs at all (bends and posture keep one tempo). */
export function climbs(ladder: TempoLadder): boolean {
  return ladder.step > 0 && ladder.goal > ladder.start;
}

/** Keep a tempo inside what the screen offers; with an eighth-note pulse, keep it even. */
export function clampTempo(tempo: number, even = false): number {
  const t = Math.round(Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, Number.isFinite(tempo) ? tempo : MIN_TEMPO)));
  return even && t % 2 !== 0 ? t + 1 : t;
}

/**
 * Where a visit starts: one step under the best clean tempo so far (a warm-up rung), never under
 * the ladder's start and never over its goal.
 */
export function startTempo(ladder: TempoLadder, best: number | null): number {
  if (!climbs(ladder) || best === null) return ladder.start;
  return Math.max(ladder.start, Math.min(ladder.goal, best - ladder.step));
}

/** The rung at or below a tempo (0 = start), or -1 below the start. */
export function rungOf(ladder: TempoLadder, tempo: number): number {
  if (!climbs(ladder)) return tempo >= ladder.start ? 0 : -1;
  if (tempo < ladder.start) return -1;
  return Math.min(Math.floor((tempo - ladder.start) / ladder.step), Math.round((ladder.goal - ladder.start) / ladder.step));
}

/** Number of rungs from start to goal. */
export function rungCount(ladder: TempoLadder): number {
  return climbs(ladder) ? Math.round((ladder.goal - ladder.start) / ladder.step) + 1 : 1;
}

/** How far up the ladder a tempo is, 0..1 (1 at the goal). */
export function ladderFraction(ladder: TempoLadder, tempo: number | null): number {
  if (tempo === null) return 0;
  if (!climbs(ladder)) return tempo >= ladder.start ? 1 : 0;
  return Math.max(0, Math.min(1, (tempo - ladder.start) / (ladder.goal - ladder.start)));
}

/** Apply the verdict of a pass. `close` stays; two `not-yet` in a row step down. */
export function afterPass(state: LadderState, verdict: Verdict, ladder: TempoLadder): { state: LadderState; move: LadderMove } {
  if (!climbs(ladder)) return { state: { ...state, missesHere: verdict === 'clean' ? 0 : state.missesHere + 1 }, move: 'fixed' };
  if (verdict === 'clean') {
    if (state.tempo >= ladder.goal) return { state: { tempo: state.tempo, missesHere: 0 }, move: 'goal' };
    // Back onto the grid of rungs if the learner had set an in-between tempo.
    const next = Math.min(ladder.goal, state.tempo < ladder.start ? ladder.start : ladder.start + (rungOf(ladder, state.tempo) + 1) * ladder.step);
    return { state: { tempo: next, missesHere: 0 }, move: next >= ladder.goal ? 'goal' : 'up' };
  }
  if (verdict === 'not-yet') {
    const misses = state.missesHere + 1;
    if (misses >= 2 && state.tempo > ladder.start) {
      return { state: { tempo: Math.max(ladder.start, state.tempo - ladder.step), missesHere: 0 }, move: 'down' };
    }
    return { state: { tempo: state.tempo, missesHere: misses }, move: 'stay' };
  }
  return { state: { ...state, missesHere: 0 }, move: 'stay' };
}

/** The tempo one keyboard or button nudge away: a ladder step (or 4 BPM), or 1 BPM when fine (2 with an eighth pulse). */
export function nudge(tempo: number, direction: 1 | -1, ladder: TempoLadder, fine = false, even = false): number {
  const big = ladder.step > 0 ? ladder.step : 4;
  const small = even ? 2 : 1;
  return clampTempo(tempo + direction * (fine ? small : big), even);
}

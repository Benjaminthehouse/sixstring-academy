/**
 * A window into the ear trainer for the browser check (`e2e/ear.cjs` imports this module in the
 * page). The screens and the player write here; nothing in the app reads from it.
 */
import type { Question, SoundPlan } from '../core/types';

/** One plan the player started. */
export interface PlayedPlan {
  plan: SoundPlan;
  /** Audio-clock time of the plan's zero. */
  t0: number;
  /** What it was: the question, a slower replay, a comparison… */
  label: string;
  band: boolean;
  /** 1 for the first plan played since the page loaded, then 2, 3 … (the list itself is capped). */
  seq: number;
}

/** What the checks can see. */
export interface EarDebug {
  /** The question on screen. */
  question: Question | null;
  /** Every plan started since the page loaded (most recent last, at most 40). */
  plays: PlayedPlan[];
  /** Rounds finished since the page loaded. */
  finished: number;
  /** Plans played since the page loaded. */
  played: number;
}

/** The single debug record. */
export const earDebug: EarDebug = { question: null, plays: [], finished: 0, played: 0 };

/** Note a plan the player started. */
export function notePlay(entry: Omit<PlayedPlan, 'seq'>): void {
  earDebug.played++;
  earDebug.plays.push({ ...entry, seq: earDebug.played });
  if (earDebug.plays.length > 40) earDebug.plays.splice(0, earDebug.plays.length - 40);
}

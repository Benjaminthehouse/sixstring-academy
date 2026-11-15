/**
 * A window into the trainer for the browser check (`e2e/fretboard.cjs` imports this module in the
 * page). The round writes here; nothing in the app reads from it.
 */
import type { Question, QuestionResult } from '../core/types';

/** What the checks can see. */
export interface FretboardDebug {
  /** The question on screen (null between rounds). */
  question: Question | null;
  /** Results of the round in progress, or of the last one. */
  results: QuestionResult[];
  /** Rounds finished since the page loaded. */
  finished: number;
}

/** The single debug record. */
export const fretboardDebug: FretboardDebug = { question: null, results: [], finished: 0 };

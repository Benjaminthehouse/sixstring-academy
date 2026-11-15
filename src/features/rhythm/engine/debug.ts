/**
 * A window into the running round for the browser checks (`e2e/rhythm.cjs` imports this module in
 * the page). The screens write here; nothing in the app reads from it.
 */
import type { RhythmSession, SessionResult } from './session';

/** What the checks can see. */
export interface RhythmDebug {
  /** The session of the round on screen, from the moment it starts. */
  session: RhythmSession | null;
  /** Result of the last finished round. */
  lastResult: SessionResult | null;
  /** Rounds started since the page loaded. */
  started: number;
}

/** The single debug record. */
export const rhythmDebug: RhythmDebug = { session: null, lastResult: null, started: 0 };

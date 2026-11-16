/**
 * Shared shapes of the player's view models. Bars are 0-based song bars everywhere in data (the
 * screen prints bar n as n + 1); tempo is a percent of the written tempo (25–150).
 */

/** How the learner practises: listen only, the song waits for each note, the song keeps time and scores, or tap along without a microphone. */
export type PracticeMode = 'listen' | 'wait' | 'flow' | 'tap';

/** Every practice mode, in picker order. */
export const PRACTICE_MODES: readonly PracticeMode[] = ['listen', 'wait', 'flow', 'tap'];

/** Modes that listen through the microphone. */
export const MIC_MODES: readonly PracticeMode[] = ['wait', 'flow'];

/** What the score shows: tab only, or tab with standard notation above it, note for note. */
export type ScoreLayer = 'tab' | 'both';

/** A range of song bars, both ends included. */
export interface BarRange {
  from: number;
  to: number;
}

/** Practice tempo limits of the song player (percent of the written tempo). */
export const MIN_TEMPO = 25;
export const MAX_TEMPO = 150;

/** Clamp and round a tempo percent into the player's range. */
export function clampTempo(percent: number): number {
  if (!Number.isFinite(percent)) return 100;
  return Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, Math.round(percent)));
}

/** True for a mode that needs the microphone. */
export function needsMic(mode: PracticeMode): boolean {
  return mode === 'wait' || mode === 'flow';
}

/** Short names for the mode picker. */
export const MODE_NAMES: Record<PracticeMode, string> = {
  listen: 'Listen',
  wait: 'Wait',
  flow: 'Flow',
  tap: 'Tap along',
};

/** One line on what each mode does, for the picker's description. */
export const MODE_HINTS: Record<PracticeMode, string> = {
  listen: 'Hear the song with the cursor moving. Nothing is scored.',
  wait: 'The song waits on every note until you play it. Take your time.',
  flow: 'The song keeps time and scores every note: perfect, good, early, late or missed.',
  tap: 'No microphone needed: tap in time with the notes and get a timing score.',
};

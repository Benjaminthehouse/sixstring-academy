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

/**
 * What the score shows: tab only, tab with standard notation above it note for note, or the
 * notation alone (the tab covered: sight reading).
 */
export type ScoreLayer = 'tab' | 'both' | 'notation';

/** Every score layer, in picker order. */
export const SCORE_LAYERS: readonly ScoreLayer[] = ['tab', 'both', 'notation'];

/** True when the score shows standard notation. */
export function showsNotation(layer: ScoreLayer): boolean {
  return layer !== 'tab';
}

/** How the song is moved for the learner: by semitones (for singing) and to the learner's capo. */
export interface Arrangement {
  /** Semitones the shapes move (the song sounds this much higher, plus what the capo adds). -7 … 7. */
  transpose: number;
  /** Where the learner's capo is (0 = none), or null for the song's own capo. */
  capo: number | null;
}

/** Transposition limits, in semitones. */
export const MAX_TRANSPOSE = 7;
/** Highest capo fret offered. */
export const MAX_CAPO = 9;

/** Clamp a transposition into the player's range. */
export function clampTranspose(semitones: number): number {
  if (!Number.isFinite(semitones)) return 0;
  return Math.max(-MAX_TRANSPOSE, Math.min(MAX_TRANSPOSE, Math.round(semitones)));
}

/** Clamp a capo fret into the player's range (null stays null: the song's own capo). */
export function clampCapo(fret: number | null): number | null {
  if (fret === null || !Number.isFinite(fret)) return null;
  return Math.max(0, Math.min(MAX_CAPO, Math.round(fret)));
}

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

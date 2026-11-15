/**
 * Sounds of the arcade, all from the audio engine: the note itself when a dot is tapped, a chime
 * for a hit that climbs with the combo, a soft buzz for a miss. While the microphone listens, the
 * game's own sounds would be heard as notes, so `appSoundAt()` remembers when the app last made one.
 */
import { normalizeTone, pluck, playUi } from '@/core/audio';
import { soundPrefs } from '@/core/settings';
import { isComboMilestone } from '../core/scoring';

let lastSound = -Infinity;

/** `performance.now()` of the last sound the app made (for ignoring it on the microphone). */
export function appSoundAt(): number {
  return lastSound;
}

function mark(): void {
  lastSound = typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** True for ~0.45 s after the app made a sound. */
export function appIsSounding(windowMs = 450): boolean {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return now - lastSound < windowMs;
}

/** Play a note the way the learner's guitar sounds (on its own string). */
export function playNote(midi: number, string?: number, when?: number, duration = 0.9): void {
  mark();
  pluck(midi, when, { string, tone: normalizeTone(soundPrefs().guitarTone), duration, velocity: 0.75 });
}

/** A right answer: the chime rises every five in a row. */
export function hitSound(combo: number, quiet = false): void {
  mark();
  if (isComboMilestone(combo)) playUi('combo', { step: Math.min(6, Math.floor(combo / 5)) });
  else playUi(quiet ? 'tap' : 'correct', { volume: quiet ? 0.6 : 0.8 });
}

/** A wrong answer: short and soft, never a punishment. */
export function missSound(): void {
  mark();
  playUi('miss', { volume: 0.6 });
}

/** Countdown tick and "go". */
export function countSound(go: boolean): void {
  mark();
  playUi(go ? 'go' : 'countdown', { volume: 0.7 });
}

/** The end of a round: perfect, good, or just done. */
export function endSound(stars: number): void {
  mark();
  playUi(stars >= 3 ? 'perfect' : stars >= 1 ? 'lessonComplete' : 'good');
}

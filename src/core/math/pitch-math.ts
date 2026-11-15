/**
 * Pitch arithmetic shared by audio, pitch detection and theory. Dependency-free on purpose.
 *
 * Conventions used across the whole app:
 *  - MIDI note numbers with middle C = C4 = 60 (scientific pitch notation). A4 = 69.
 *  - Guitar standard tuning sounds E2 A2 D3 G3 B3 E4 = MIDI 40 45 50 55 59 64.
 *    (Guitar music is WRITTEN an octave higher than it sounds; notation code handles that.)
 *  - 12-tone equal temperament, reference A4 defaults to 440 Hz and is user-adjustable.
 */
export const A4_MIDI = 69;
export const DEFAULT_A4 = 440;

export function midiToFreq(midi: number, a4: number = DEFAULT_A4): number {
  return a4 * Math.pow(2, (midi - A4_MIDI) / 12);
}

/** Fractional MIDI number for a frequency (e.g. 440 -> 69, 446 -> ~69.23). */
export function freqToMidi(freq: number, a4: number = DEFAULT_A4): number {
  return A4_MIDI + 12 * Math.log2(freq / a4);
}

/** Cents from `freq` to the target frequency. Positive = sharp, negative = flat. */
export function centsBetween(freq: number, target: number): number {
  return 1200 * Math.log2(freq / target);
}

export interface NearestNote {
  /** Nearest equal-tempered MIDI note. */
  midi: number;
  /** Deviation from that note in cents, in (-50, 50]. Positive = sharp. */
  cents: number;
  /** Frequency of the nearest note. */
  target: number;
}

export function nearestNote(freq: number, a4: number = DEFAULT_A4): NearestNote {
  const exact = freqToMidi(freq, a4);
  const midi = Math.round(exact);
  return { midi, cents: (exact - midi) * 100, target: midiToFreq(midi, a4) };
}

/** Pitch class 0..11 (C = 0) of a MIDI note. */
export function pitchClass(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

/** Scientific octave number of a MIDI note (60 -> 4). */
export function octaveOf(midi: number): number {
  return Math.floor(Math.round(midi) / 12) - 1;
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

/**
 * Context-free note name, e.g. 61 -> "C#4". For correct spelling inside a key or chord
 * (F# major has E#, not F) use the theory module instead.
 */
export function midiToName(midi: number, opts: { flats?: boolean; octave?: boolean } = {}): string {
  const names = opts.flats ? FLAT_NAMES : SHARP_NAMES;
  const name = names[pitchClass(midi)];
  return opts.octave === false ? name : `${name}${octaveOf(midi)}`;
}

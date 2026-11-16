/**
 * Note names for the trainer. On a bare fretboard there is no key to decide how a black-key note
 * is spelled, so the learner chooses: sharps (C♯), flats (D♭) or both (each question picks one and
 * every answer accepts either name of the same sound).
 */
import type { NoteSet, Spelling } from './types';

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

/** Pitch classes of the natural notes (the white keys): C D E F G A B. */
export const NATURAL_PCS: readonly number[] = [0, 2, 4, 5, 7, 9, 11];
/** Pitch classes of the sharps and flats (the black keys). */
export const ACCIDENTAL_PCS: readonly number[] = [1, 3, 6, 8, 10];

/** Pitch class (0–11) of a MIDI number. */
export function pcOf(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

/** True for C D E F G A B. */
export function isNatural(pc: number): boolean {
  return NATURAL_PCS.includes(pcOf(pc));
}

/** Pitch classes a note set allows. */
export function pcsOf(notes: NoteSet): number[] {
  if (notes === 'naturals') return [...NATURAL_PCS];
  if (notes === 'accidentals') return [...ACCIDENTAL_PCS];
  return Array.from({ length: 12 }, (_, i) => i);
}

/**
 * ASCII name of a pitch class in a spelling. With `both`, `flat` picks the flat name (each
 * question decides once, so a round shows both names).
 */
export function spell(pc: number, spelling: Spelling, flat = false): string {
  const p = pcOf(pc);
  if (spelling === 'flats' || (spelling === 'both' && flat)) return FLAT_NAMES[p];
  return SHARP_NAMES[p];
}

/** Both names of a pitch class: `['C#', 'Db']`, or one for a natural note. */
export function namesOf(pc: number): string[] {
  const p = pcOf(pc);
  return SHARP_NAMES[p] === FLAT_NAMES[p] ? [SHARP_NAMES[p]] : [SHARP_NAMES[p], FLAT_NAMES[p]];
}

/** Pitch class of an ASCII note name (`C#`, `Db`, `E#`, `Cb`), or null. */
export function pcOfName(name: string): number | null {
  const m = /^([A-Ga-g])(#{1,2}|b{1,2})?$/.exec(name.trim());
  if (!m) return null;
  const base = [9, 11, 0, 2, 4, 5, 7]['ABCDEFG'.indexOf(m[1].toUpperCase())];
  const acc = m[2] ? (m[2][0] === '#' ? m[2].length : -m[2].length) : 0;
  return pcOf(base + acc);
}

/**
 * The pitch class a key press names: letters A to G, Shift for a sharp (a flat when the learner
 * spells with flats). German naming also takes H for B natural and reads plain B as B♭.
 */
export function pcForKey(key: string, shift: boolean, spelling: Spelling, german = false): number | null {
  const k = key.toLowerCase();
  // In German, B is already B flat: it needs no Shift.
  if (german && k === 'b') return 10;
  let base: number | null = null;
  if (german && k === 'h') base = 11;
  else if (k.length === 1 && k >= 'a' && k <= 'g') base = pcOfName(k.toUpperCase());
  if (base === null) return null;
  if (!shift) return base;
  return pcOf(base + (spelling === 'flats' ? -1 : 1));
}

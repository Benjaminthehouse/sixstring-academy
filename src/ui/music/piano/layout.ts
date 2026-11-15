/**
 * Piano keyboard geometry: which keys a range holds and where each one is drawn. White keys are
 * one unit wide; black keys sit over the gaps, nudged the way a real keyboard groups them
 * (C♯ D♯ apart, F♯ G♯ A♯ apart). Pure; units are white-key widths.
 */
import { noteToMidi } from '@/core/theory';

/** One key of the keyboard. */
export interface PianoKey {
  midi: number;
  black: boolean;
  /** Left edge and width in white-key units. */
  x: number;
  w: number;
}

const BLACK_PCS = new Set([1, 3, 6, 8, 10]);
/** Black-key centre offset from the gap between its white neighbours, in white-key units. */
const BLACK_NUDGE: Record<number, number> = { 1: -0.1, 3: 0.1, 6: -0.12, 8: 0, 10: 0.12 };

/** True for the black keys (C♯, D♯, F♯, G♯, A♯). */
export function isBlackKey(midi: number): boolean {
  return BLACK_PCS.has(((midi % 12) + 12) % 12);
}

/** A MIDI number from a note name with octave or a number. */
export function toMidi(input: string | number): number {
  return typeof input === 'number' ? Math.round(input) : noteToMidi(input);
}

/**
 * The keys from `from` to `to` inclusive. A range that starts or ends on a black key is widened to
 * the white key beside it, and very long ranges are capped at five octaves.
 */
export function pianoLayout(fromInput: string | number, toInput: string | number): { keys: PianoKey[]; whiteCount: number; from: number; to: number } {
  let from = toMidi(fromInput);
  let to = toMidi(toInput);
  if (to < from) [from, to] = [to, from];
  if (isBlackKey(from)) from -= 1;
  if (isBlackKey(to)) to += 1;
  to = Math.min(to, from + 60);
  const keys: PianoKey[] = [];
  let whites = 0;
  for (let midi = from; midi <= to; midi++) {
    if (isBlackKey(midi)) {
      const w = 0.6;
      const centre = whites + BLACK_NUDGE[midi % 12];
      keys.push({ midi, black: true, x: centre - w / 2, w });
    } else {
      keys.push({ midi, black: false, x: whites, w: 1 });
      whites += 1;
    }
  }
  return { keys, whiteCount: whites, from, to };
}

/** The range of whole octaves around some notes: C below the lowest to B above the highest (at least one octave). */
export function rangeAround(notes: ReadonlyArray<string | number>, fallback: [string, string] = ['C4', 'B4']): [number, number] {
  const midis = notes.map(toMidi).filter((m) => Number.isFinite(m));
  if (!midis.length) return [toMidi(fallback[0]), toMidi(fallback[1])];
  const lo = Math.min(...midis);
  const hi = Math.max(...midis);
  const from = lo - (((lo % 12) + 12) % 12);
  const to = hi + (11 - (((hi % 12) + 12) % 12));
  return [from, Math.max(to, from + 11)];
}

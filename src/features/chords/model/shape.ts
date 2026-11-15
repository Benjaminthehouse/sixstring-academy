/**
 * "Name that shape": the frets the learner taps on an empty box, and what the guitar engine calls
 * the result. A string starts muted; tapping a fret puts a finger there, tapping the same spot
 * again mutes the string, the open column makes it ring open.
 */
import { formatFrets, identifyFretted, parseFrets, type TuningInput } from '@/core/guitar';

/** Frets low to high (index 0 = string 6); null = muted, 0 = open. */
export type ShapeFrets = Array<number | null>;

/** The shape the screen opens on: an open C chord, already named. */
export const EXAMPLE_SHAPE: ShapeFrets = [null, 3, 2, 0, 1, 0];

/** Tap a cell: place the finger, or take it away again (mute) when it is already there. */
export function tapCell(frets: readonly (number | null)[], string: number, fret: number): ShapeFrets {
  const next = [...frets];
  const i = next.length - string;
  if (i < 0 || i >= next.length) return next;
  next[i] = next[i] === fret ? null : fret;
  return next;
}

/** Mute one string. */
export function muteString(frets: readonly (number | null)[], string: number): ShapeFrets {
  const next = [...frets];
  const i = next.length - string;
  if (i >= 0 && i < next.length) next[i] = null;
  return next;
}

/** Every string muted. */
export function emptyShape(strings = 6): ShapeFrets {
  return Array.from({ length: strings }, () => null);
}

/** A shape as a route param (`x32010`, `8-10-10-9-8-8`), or null for an empty shape. */
export function shapeParam(frets: readonly (number | null)[]): string | null {
  if (frets.every((f) => f === null)) return null;
  return formatFrets([...frets]).toLowerCase();
}

/** Read a route param back; null when it is not a shape for this many strings. */
export function shapeFromParam(param: string | null | undefined, strings = 6): ShapeFrets | null {
  if (!param) return null;
  try {
    const frets = parseFrets(param);
    if (frets.length !== strings) return null;
    if (frets.some((f) => f !== null && (!Number.isInteger(f) || f < 0 || f > 24))) return null;
    return frets;
  } catch {
    return null;
  }
}

/** What the engine makes of a tapped shape. */
export interface ShapeName {
  /** Best name, or null when the notes make no chord the engine can name. */
  symbol: string | null;
  /** Other names for the same notes (an inversion read another way, a rarer chord). */
  alternatives: Array<{ symbol: string; kind: 'exact' | 'partial' | 'slash' }>;
  /** True when the best name has notes missing (a fifth left out): still the chord, just thinner. */
  partial: boolean;
  /** The sounding notes, low to high, with their degree in the named chord. */
  notes: Array<{ string: number; fret: number; note: string; degree: string | null }>;
  /** How many strings sound. */
  sounding: number;
}

/** Name a tapped shape with the guitar engine. */
export function nameShape(frets: readonly (number | null)[], tuning?: TuningInput): ShapeName {
  const sounding = frets.filter((f) => f !== null).length;
  if (sounding === 0) return { symbol: null, alternatives: [], partial: false, notes: [], sounding };
  try {
    const r = identifyFretted([...frets], { tuning, limit: 6 });
    const first = r.matches[0];
    return {
      symbol: r.symbol,
      alternatives: r.matches.slice(1, 5).map((m) => ({ symbol: m.symbol, kind: m.kind })),
      partial: first ? first.kind === 'partial' : false,
      notes: r.notes.map((n) => ({ string: n.string, fret: n.fret, note: n.note, degree: n.degree })),
      sounding,
    };
  } catch {
    return { symbol: null, alternatives: [], partial: false, notes: [], sounding };
  }
}

/** The lowest and highest fretted (non-open) fret of a shape, or null when nothing is fretted. */
export function fretSpan(frets: readonly (number | null)[]): { min: number; max: number } | null {
  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  if (!fretted.length) return null;
  return { min: Math.min(...fretted), max: Math.max(...fretted) };
}

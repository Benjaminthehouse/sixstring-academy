/**
 * The interval table: every simple interval (with both names of the tritone) and the common
 * compound ones, each with its size, inversion, an example from C and its shape on two
 * neighbouring strings. Everything is computed by the theory and guitar engines.
 */
import { tuningIntervals } from '@/core/guitar';
import {
  SIMPLE_INTERVALS,
  consonance,
  intervalName,
  intervalToDegree,
  invertInterval,
  semitones,
  simplifyInterval,
  transpose,
} from '@/core/theory';

/** One row of the interval table. */
export interface IntervalRow {
  /** Short name, the id (`m3`, `A4`). */
  id: string;
  /** Long name (`minor third`). */
  name: string;
  semitones: number;
  /** The interval that completes it to an octave (`M6` for `m3`). */
  inversion: string;
  /** Degree label of the upper note against the root (`b3`). */
  degree: string;
  /** Stable, mild or tense. */
  consonance: 'perfect' | 'imperfect' | 'dissonant';
  /** The upper note when the lower one is C, ASCII (`Eb`). */
  fromC: string;
  /** Frets to move on the next higher string for most pairs (can be negative: back toward the nut). */
  nextString: number;
  /** The same from the G string to the B string, one fret more. */
  gToB: number;
}

/** Compound intervals worth knowing (the tensions of chords and the double octave). */
export const COMPOUND_IDS = ['m9', 'M9', 'm10', 'M10', 'P11', 'A11', 'P12', 'm13', 'M13', 'P15'] as const;

/** One row of the compound-interval table. */
export interface CompoundRow {
  id: string;
  name: string;
  semitones: number;
  /** The simple interval it is an octave above (`M2` for `M9`). */
  simple: string;
  fromC: string;
}

const STANDARD_GAPS = tuningIntervals('standard');
/** Half steps between two neighbouring strings in standard tuning (a fourth). */
export const STRING_GAP = STANDARD_GAPS[0];
/** Half steps between the G and B strings (a major third). */
export const G_B_GAP = STANDARD_GAPS[3];

/** Every simple interval from unison to octave, in order of size (A4 before d5). */
export function intervalRows(): IntervalRow[] {
  return SIMPLE_INTERVALS.map((id) => {
    const s = semitones(id);
    return {
      id,
      name: intervalName(id),
      semitones: s,
      inversion: invertInterval(id),
      degree: intervalToDegree(id),
      consonance: consonance(id),
      fromC: transpose('C', id),
      nextString: s - STRING_GAP,
      gToB: s - G_B_GAP,
    };
  });
}

/** The compound intervals of `COMPOUND_IDS`. */
export function compoundRows(): CompoundRow[] {
  return COMPOUND_IDS.map((id) => ({ id, name: intervalName(id), semitones: semitones(id), simple: simplifyInterval(id), fromC: transpose('C', id) }));
}

/** A string and fret. */
export interface Spot {
  string: number;
  fret: number;
}

/** Two notes of an interval shape: the root and the upper note on the next higher string. */
export interface IntervalShape {
  pairs: Array<{ root: Spot; upper: Spot; across: 'fourth' | 'g-b' }>;
  /** Frets to draw: `[first, last]`. */
  frets: [number, number];
}

/** Root fret of the drawn shapes: high enough that every interval up to an octave fits. */
const ROOT_FRET = 5;

/**
 * The interval drawn twice on the neck: from string 5 to string 4 (any pair a fourth apart) and
 * from string 3 to string 2 (the G–B pair, a major third apart), both roots at fret 5.
 */
export function intervalShape(semis: number): IntervalShape {
  const normal = { root: { string: 5, fret: ROOT_FRET }, upper: { string: 4, fret: ROOT_FRET + semis - STRING_GAP }, across: 'fourth' as const };
  const gb = { root: { string: 3, fret: ROOT_FRET }, upper: { string: 2, fret: ROOT_FRET + semis - G_B_GAP }, across: 'g-b' as const };
  const frets = [normal.root.fret, normal.upper.fret, gb.root.fret, gb.upper.fret];
  const lo = Math.max(0, Math.min(...frets) - 1);
  const hi = Math.max(...frets) + 1;
  return { pairs: [normal, gb], frets: [lo, Math.max(hi, lo + 4)] };
}

/** "same fret", "2 frets up", "1 fret back" for a fret move on the next string. */
export function fretMoveWords(delta: number): string {
  if (delta === 0) return 'same fret';
  const n = Math.abs(delta);
  return `${n} fret${n === 1 ? '' : 's'} ${delta > 0 ? 'up' : 'back'}`;
}

/** Plain words for how an interval sounds. */
export function consonanceWords(c: IntervalRow['consonance']): string {
  return c === 'perfect' ? 'Open, stable' : c === 'imperfect' ? 'Sweet, stable' : 'Tense';
}

/** A row by id (`m3`), or null. Accepts the route spelling in lower case for perfect/major ids too. */
export function intervalById(id: string | null | undefined): IntervalRow | CompoundRow | null {
  if (!id) return null;
  const all: Array<IntervalRow | CompoundRow> = [...intervalRows(), ...compoundRows()];
  return all.find((r) => r.id === id) ?? all.find((r) => intervalSlug(r.id) === id) ?? null;
}

/**
 * A route-safe id for an interval. Route params are lower case, so the capital marks quality:
 * `m3` stays `m3`, `M3` becomes `maj3`, `P5` `p5`, `A4` `aug4`, `d5` `dim5`.
 */
export function intervalSlug(id: string): string {
  const m = /^([PMmAd])(\d+)$/.exec(id);
  if (!m) return id.toLowerCase();
  const q = { P: 'p', M: 'maj', m: 'm', A: 'aug', d: 'dim' }[m[1] as 'P' | 'M' | 'm' | 'A' | 'd'];
  return `${q}${m[2]}`;
}

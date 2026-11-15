/**
 * Fret geometry: where the frets physically are. Fret n sits at `1 - 2^(-n/12)` of the scale
 * length from the nut, so frets get closer together up the neck. Fretboard drawings use this for
 * realistic spacing, and the camera overlay uses it to place notes on the neck it sees.
 *
 * Distances are in the unit of the scale length you pass (default 1, i.e. fractions of the scale
 * length). Frets here are frets on the wood: add the capo first (`physicalFret`).
 */
import type { FretPosition } from './types';

/** Distance from the nut to fret wire `fret` (fractional frets allowed): `scaleLength * (1 - 2^(-fret/12))`. */
export function fretDistance(fret: number, scaleLength = 1): number {
  return scaleLength * (1 - Math.pow(2, -fret / 12));
}

/** The (fractional) fret at a distance from the nut; the inverse of `fretDistance`. Infinity at or past the bridge. */
export function fretAtDistance(distance: number, scaleLength = 1): number {
  const remaining = 1 - distance / scaleLength;
  if (remaining <= 0) return Infinity;
  return -12 * Math.log2(remaining);
}

/** Width of fret space `fret`: the gap between wire `fret - 1` and wire `fret`. 0 for the open string. */
export function fretWidth(fret: number, scaleLength = 1): number {
  if (fret <= 0) return 0;
  return fretDistance(fret, scaleLength) - fretDistance(fret - 1, scaleLength);
}

/**
 * Centre of fret space `fret`, halfway between wire `fret - 1` and wire `fret`: where a note
 * marker is drawn. Fret 0 (the open string) gives 0, the nut.
 */
export function fretMidpoint(fret: number, scaleLength = 1): number {
  if (fret <= 0) return 0;
  return (fretDistance(fret - 1, scaleLength) + fretDistance(fret, scaleLength)) / 2;
}

/**
 * Where the fingertip presses for fret `fret`: inside the fret space, close behind the wire.
 * `bias` is the fraction of the space from the lower wire (default 0.7; 0.5 is the midpoint).
 */
export function fingertipDistance(fret: number, scaleLength = 1, bias = 0.7): number {
  if (fret <= 0) return 0;
  const low = fretDistance(fret - 1, scaleLength);
  return low + (fretDistance(fret, scaleLength) - low) * bias;
}

/** The fret space (1-based; 0 = behind the nut) that a distance from the nut falls into. */
export function fretSpaceAt(distance: number, scaleLength = 1): number {
  if (distance <= 0) return 0;
  const exact = fretAtDistance(distance, scaleLength);
  return Number.isFinite(exact) ? Math.ceil(exact - 1e-9) : Infinity;
}

/** Frets that carry a position marker on most guitars. */
export const INLAY_FRETS: readonly number[] = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
/** Frets that carry a double marker. */
export const DOUBLE_INLAY_FRETS: readonly number[] = [12, 24];

/** The marker frets up to `maxFret`, each flagged single or double. */
export function inlayFrets(maxFret = 24): Array<{ fret: number; double: boolean }> {
  return INLAY_FRETS.filter((f) => f <= maxFret).map((fret) => ({ fret, double: DOUBLE_INLAY_FRETS.includes(fret) }));
}

/** The physical dimensions of a neck, all in the same unit (millimetres in the presets). */
export interface NeckGeometry {
  /** Nut to bridge saddle. */
  scaleLength: number;
  /** Number of strings. */
  stringCount: number;
  /** Number of frets. */
  frets: number;
  /** Fretboard width at the nut. */
  nutWidth: number;
  /** Fretboard width at the 12th fret. */
  width12: number;
  /** Distance between the two outer strings at the nut. */
  nutSpread: number;
  /** Distance between the two outer strings at the bridge. */
  bridgeSpread: number;
}

/** Typical dimensions in millimetres. */
export const NECK_PRESETS: Readonly<Record<'electric' | 'acoustic' | 'classical' | 'short-scale' | 'bass' | 'ukulele', NeckGeometry>> = {
  electric: { scaleLength: 648, stringCount: 6, frets: 22, nutWidth: 42, width12: 52, nutSpread: 35, bridgeSpread: 52.5 },
  acoustic: { scaleLength: 645, stringCount: 6, frets: 20, nutWidth: 44.5, width12: 55, nutSpread: 37.5, bridgeSpread: 55 },
  classical: { scaleLength: 650, stringCount: 6, frets: 19, nutWidth: 52, width12: 62, nutSpread: 43, bridgeSpread: 58 },
  'short-scale': { scaleLength: 628, stringCount: 6, frets: 22, nutWidth: 43, width12: 52, nutSpread: 35.5, bridgeSpread: 51.5 },
  bass: { scaleLength: 864, stringCount: 4, frets: 20, nutWidth: 41, width12: 56, nutSpread: 30, bridgeSpread: 57 },
  ukulele: { scaleLength: 380, stringCount: 4, frets: 18, nutWidth: 35, width12: 43, nutSpread: 27, bridgeSpread: 40 },
};

/** A neck geometry from a preset or partial values; anything missing comes from the electric-guitar preset. */
export function neckGeometry(input: keyof typeof NECK_PRESETS | Partial<NeckGeometry> = 'electric'): NeckGeometry {
  if (typeof input === 'string') return { ...NECK_PRESETS[input] };
  const base = NECK_PRESETS.electric;
  const merged = { ...base, ...input };
  // More or fewer strings on an otherwise default neck keep the default string spacing.
  if (input.stringCount && input.stringCount !== base.stringCount && input.nutSpread === undefined) {
    const perGap = base.nutSpread / (base.stringCount - 1);
    const bridgeGap = base.bridgeSpread / (base.stringCount - 1);
    merged.nutSpread = perGap * (merged.stringCount - 1);
    merged.bridgeSpread = bridgeGap * (merged.stringCount - 1);
    if (input.nutWidth === undefined) merged.nutWidth = merged.nutSpread + 7;
    if (input.width12 === undefined) merged.width12 = (merged.nutSpread + merged.bridgeSpread) / 2 + 8;
  }
  return merged;
}

/** A point on the neck plane. */
export interface NeckPoint {
  /** Along the neck from the nut toward the bridge. */
  x: number;
  /** Across the neck from the centre line: negative toward the lowest string, positive toward string 1. */
  y: number;
}

/**
 * Sideways offset of a string from the centre line at a distance from the nut. Strings fan out
 * from the nut to the bridge; negative is toward the lowest string, positive toward string 1.
 */
export function stringOffset(string: number, distance: number, geometry: NeckGeometry = NECK_PRESETS.electric): number {
  const { stringCount, nutSpread, bridgeSpread, scaleLength } = geometry;
  if (stringCount <= 1) return 0;
  const spread = nutSpread + (bridgeSpread - nutSpread) * (distance / scaleLength);
  // String 1 is the highest: index from the low side is stringCount - string.
  return ((stringCount - string) / (stringCount - 1) - 0.5) * spread;
}

/** Half the fretboard width at a distance from the nut (the edges widen linearly toward the body). */
export function fretboardHalfWidth(distance: number, geometry: NeckGeometry = NECK_PRESETS.electric): number {
  const at12 = fretDistance(12, geometry.scaleLength);
  return (geometry.nutWidth + (geometry.width12 - geometry.nutWidth) * (distance / at12)) / 2;
}

/**
 * The point on the neck plane where a note marker (or a fingertip) goes for a position.
 * `at: 'marker'` (default) is the centre of the fret space, `'fingertip'` close behind the wire,
 * `'wire'` on the fret wire itself. Open strings are placed on the nut. Frets are frets on the wood.
 */
export function neckPoint(pos: FretPosition, geometry: NeckGeometry = NECK_PRESETS.electric, at: 'marker' | 'fingertip' | 'wire' = 'marker'): NeckPoint {
  const L = geometry.scaleLength;
  const x = at === 'wire' ? fretDistance(pos.fret, L) : at === 'fingertip' ? fingertipDistance(pos.fret, L) : fretMidpoint(pos.fret, L);
  return { x, y: stringOffset(pos.string, x, geometry) };
}

/** Where a point on the neck plane lies in terms of strings and frets. */
export interface NeckHit extends FretPosition {
  /** How far the point is from that string, in string spacings: 0 on it, ±0.5 halfway to the next (+ toward string 1). */
  stringOffset: number;
  /** True when the point is on the fretboard: between the nut and the last fret, inside both edges. */
  onNeck: boolean;
}

/**
 * The string and fret space a point on the neck plane falls on: the inverse of `neckPoint`, for
 * reading a fingertip the camera sees. `fret` 0 means on or behind the nut. Points off the board
 * still get their nearest string and fret, with `onNeck: false`.
 */
export function positionAtPoint(point: NeckPoint, geometry: NeckGeometry = NECK_PRESETS.electric): NeckHit {
  const { stringCount, scaleLength, frets } = geometry;
  const space = fretSpaceAt(point.x, scaleLength);
  const fret = Number.isFinite(space) ? space : frets + 1;
  const x = Math.min(Math.max(point.x, 0), scaleLength);
  const gap = stringCount > 1 ? (stringOffset(1, x, geometry) - stringOffset(stringCount, x, geometry)) / (stringCount - 1) : 1;
  // String 1 has the largest offset; one spacing lower each string after it.
  const exact = stringCount > 1 ? 1 + (stringOffset(1, x, geometry) - point.y) / gap : 1;
  const string = Math.min(stringCount, Math.max(1, Math.round(exact)));
  const onNeck = point.x >= 0 && fret <= frets && Math.abs(point.y) <= fretboardHalfWidth(x, geometry);
  return { string, fret, stringOffset: string - exact, onNeck };
}

/** The two ends of fret wire `fret` on the neck plane, low-string edge first. */
export function fretWireSegment(fret: number, geometry: NeckGeometry = NECK_PRESETS.electric): [NeckPoint, NeckPoint] {
  const x = fretDistance(fret, geometry.scaleLength);
  const half = fretboardHalfWidth(x, geometry);
  return [{ x, y: -half }, { x, y: half }];
}

/** Layout of a stretch of fretboard, normalised for drawing. */
export interface FretboardLayout {
  firstFret: number;
  lastFret: number;
  /**
   * Horizontal position (0–1) of each fret wire from `firstFret - 1` (the nut when `firstFret` is 1)
   * to `lastFret`; `wires[i]` belongs to fret `firstFret - 1 + i`.
   */
  wires: number[];
  /** Horizontal centre (0–1) of each fret space from `firstFret` to `lastFret`: where markers go. */
  centres: number[];
  /** Vertical position (0–1) of each string, **string 1 first** (top of a standard diagram). */
  strings: number[];
}

/**
 * Normalised positions for drawing frets `firstFret`…`lastFret` (fret spaces, 1-based) across a
 * box of width 1 and height 1. `proportional: true` (default) uses real fret spacing, `false`
 * equal spacing (chord boxes). Strings are evenly spaced with string 1 at the top.
 */
export function fretboardLayout(opts: { firstFret?: number; lastFret?: number; stringCount?: number; proportional?: boolean } = {}): FretboardLayout {
  const firstFret = Math.max(1, Math.round(opts.firstFret ?? 1));
  const lastFret = Math.max(firstFret, Math.round(opts.lastFret ?? 12));
  const stringCount = opts.stringCount ?? 6;
  const proportional = opts.proportional ?? true;
  const at = (fret: number) => (proportional ? fretDistance(fret) : fret);
  const start = at(firstFret - 1);
  const length = at(lastFret) - start;
  const wires: number[] = [];
  const centres: number[] = [];
  for (let fret = firstFret - 1; fret <= lastFret; fret++) wires.push((at(fret) - start) / length);
  for (let fret = firstFret; fret <= lastFret; fret++) centres.push(((at(fret - 1) + at(fret)) / 2 - start) / length);
  const strings = Array.from({ length: stringCount }, (_unused, i) => (stringCount === 1 ? 0.5 : i / (stringCount - 1)));
  return { firstFret, lastFret, wires, centres, strings };
}

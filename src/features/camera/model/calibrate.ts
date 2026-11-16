/**
 * Marking the neck by hand when automatic detection struggles: four taps on a still picture, both
 * ends of two fret wires (the nut and the 12th fret unless the learner picks others), turned into
 * the two wire taps the vision module's `poseFromWireTaps` takes. Also the "this is fret N" fix and
 * the sticker (marker) mode steps. Pure: the screen feeds display taps already converted to video
 * pixels.
 */
import type { Point, WireTap } from '@/core/vision';

/** Which two wires the learner marks (0 = the nut). */
export interface WirePair {
  near: number;
  far: number;
}

/** The usual pair: the nut and the 12th fret (the double dot). */
export const DEFAULT_WIRES: WirePair = { near: 0, far: 12 };

/** One tap to make. */
export interface TapStep {
  wire: number;
  side: 'bass' | 'treble';
  /** What to tap, in plain words. */
  prompt: string;
}

/** A wire's name in a sentence: "the nut", "fret 12". */
export function wireName(wire: number): string {
  return wire === 0 ? 'the nut' : `fret ${wire}`;
}

/** The four taps, in order: near wire (thick side, thin side), then far wire (thick side, thin side). */
export function tapSteps(pair: WirePair = DEFAULT_WIRES): TapStep[] {
  const steps: TapStep[] = [];
  for (const wire of [pair.near, pair.far]) {
    const what = wire === 0 ? 'the nut (where the headstock starts)' : `the metal wire of fret ${wire}`;
    steps.push({ wire, side: 'bass', prompt: `Tap ${what} at the edge by the thickest string.` });
    steps.push({ wire, side: 'treble', prompt: `Now tap ${wireName(wire)} at the edge by the thinnest string.` });
  }
  return steps;
}

/** A sensible pair from what is in view: the nut and the 12th fret, or two wires the learner names. */
export function validPair(pair: WirePair): WirePair | null {
  const near = Math.round(pair.near);
  const far = Math.round(pair.far);
  if (!(near >= 0 && far > near && far <= 24)) return null;
  return { near, far };
}

/** The two wire taps from four taps (video pixels), or null until all four are there. */
export function wireTaps(pair: WirePair, taps: readonly Point[]): [WireTap, WireTap] | null {
  if (taps.length < 4 || !taps.slice(0, 4).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return null;
  return [
    { fret: pair.near, ends: [taps[0], taps[1]] },
    { fret: pair.far, ends: [taps[2], taps[3]] },
  ];
}

/** Two taps of the same wire too close together to mean anything (pixels). */
export function tooClose(a: Point, b: Point, minPx = 8): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < minPx;
}

/** Sticker mode: the two frets the tape goes on (5 and 12 are easy to find and far apart). */
export const DEFAULT_STICKER_FRETS: readonly [number, number] = [5, 12];

/** The prompt for sticker tap `i` (0 or 1). */
export function stickerPrompt(i: number, frets: readonly [number, number] = DEFAULT_STICKER_FRETS): string {
  return i === 0 ? `Tap the sticker at fret ${frets[0]} on the picture.` : `Now tap the sticker at fret ${frets[1]}.`;
}

/** Fret numbers to offer for "this is fret N", around the one the tracker gives (or the first twelve). */
export function fretChoices(current: number | null, count = 9, max = 20): number[] {
  const centre = current === null ? 5 : Math.max(1, Math.min(max, current));
  let lo = Math.max(1, centre - Math.floor(count / 2));
  const hi = Math.min(max, lo + count - 1);
  lo = Math.max(1, hi - count + 1);
  const out: number[] = [];
  for (let f = lo; f <= hi; f++) out.push(f);
  return out;
}

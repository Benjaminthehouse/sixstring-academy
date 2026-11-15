/**
 * How well does a pose explain the image? The same measure accepts or rejects a detection,
 * ranks competing hypotheses and tells the tracker when it has lost the board.
 *
 * For every fret line the pose predicts inside the frame we ask: is there a thin line of the right
 * polarity along it (`present`), and is the cell behind it free of such lines (`clean`)? A pose that
 * is shifted, scaled or half-spaced fails one of the two. A hand hides a few neighbouring frets, so
 * one run of missing frets is forgiven; frets missing here and there are not.
 */
import { boardEdgeY, fretX } from '../geometry';
import type { Mat3, NeckModel } from '../types';
import type { GrayImage } from './image';
import { FRET_SAMPLE_FRACTIONS, wireResponse, type FretSpan } from './refine';

/** Evidence for one fret line of the model. */
export interface FretEvidence {
  /** Model fret line (0 = nut). */
  n: number;
  /** Lateral samples that fell inside the frame. */
  inView: number;
  /** Fraction of those with a wire under them. */
  present: number;
  /** Mean thin-line response over the samples. */
  strength: number;
  /** Fraction of the samples in the cell toward line n + 1 that are free of wire-like lines (NaN when out of view). */
  clean: number;
}

/** Summary of how well a pose fits. */
export interface PoseScore {
  frets: FretEvidence[];
  /** Typical fret contrast (grey levels of thin-line response). */
  contrast: number;
  /** First and last fret line judged present. Empty (max < min) when none is. */
  seenSpan: FretSpan;
  /** Fret lines judged present / fret lines in view between the first and last seen. */
  seen: number;
  expected: number;
  /** Longest run of unseen fret lines between seen ones. */
  longestGap: number;
  /** seen / expected with one hidden run mostly forgiven, 0..1. */
  coverage: number;
  /** Mean cleanliness of the cells between the first and last seen fret, 0..1. */
  cleanliness: number;
  /** Mean presence over the seen frets: do wires span the whole board width? 0..1. */
  fill: number;
  /** Overall fit quality, 0..1. */
  quality: number;
}

const CELL_X_FRACTIONS = [0.3, 0.5, 0.7];
const CELL_Y_FRACTIONS = [0.18, 0.4, 0.6, 0.82];

/** Score a homography (neck mm -> working pixels) over the fret lines in `span`. */
export function scorePose(fine: GrayImage, coarse: GrayImage, H: Mat3, model: NeckModel, polarity: number, span: FretSpan): PoseScore {
  const W = fine.width;
  const Hh = fine.height;
  const frets: FretEvidence[] = [];
  const strengths: number[] = [];
  // Pass 1: raw responses on the wires.
  const raw: number[][] = [];
  for (let n = span.min; n <= span.max; n++) {
    const x = fretX(model, n);
    const yBass = boardEdgeY(model, x, 'bass');
    const yTreble = boardEdgeY(model, x, 'treble');
    const values: number[] = [];
    let sum = 0;
    for (let k = 0; k < FRET_SAMPLE_FRACTIONS.length; k++) {
      const y = yBass + (yTreble - yBass) * FRET_SAMPLE_FRACTIONS[k];
      const q2 = H[6] * x + H[7] * y + H[8];
      if (!(q2 > 1e-9)) continue;
      const u = (H[0] * x + H[1] * y + H[2]) / q2;
      const v = (H[3] * x + H[4] * y + H[5]) / q2;
      if (u < 4 || v < 4 || u > W - 4 || v > Hh - 4) continue;
      let fx = (H[1] - H[7] * u) / q2;
      let fy = (H[4] - H[7] * v) / q2;
      const fl = Math.hypot(fx, fy) || 1;
      fx /= fl;
      fy /= fl;
      const nx = -fy;
      const ny = fx;
      // The wire may sit a pixel off the prediction: take the best of three.
      let r = wireResponse(fine, coarse, u, v, nx, ny, polarity);
      const r2 = wireResponse(fine, coarse, u + nx, v + ny, nx, ny, polarity);
      const r3 = wireResponse(fine, coarse, u - nx, v - ny, nx, ny, polarity);
      if (r2 > r) r = r2;
      if (r3 > r) r = r3;
      if (r < 0) r = 0;
      values.push(r);
      sum += r;
    }
    raw.push(values);
    if (values.length >= 3) strengths.push(sum / values.length);
  }
  // Typical contrast: the 60th percentile of per-fret means (robust to glints and to hidden frets).
  strengths.sort((a, b) => a - b);
  const contrast = strengths.length > 0 ? strengths[Math.min(strengths.length - 1, Math.floor(strengths.length * 0.6))] : 0;
  const thr = Math.max(0.5, 0.35 * contrast);
  // Pass 2: presence per fret, cleanliness per cell.
  for (let n = span.min; n <= span.max; n++) {
    const values = raw[n - span.min];
    let present = 0;
    let sum = 0;
    for (const v of values) {
      if (v >= thr) present++;
      sum += v;
    }
    let clean = NaN;
    {
      const xa = fretX(model, n);
      const xb = fretX(model, n + 1);
      let total = 0;
      let dirty = 0;
      for (const fxr of CELL_X_FRACTIONS) {
        const x = xa + (xb - xa) * fxr;
        const yBass = boardEdgeY(model, x, 'bass');
        const yTreble = boardEdgeY(model, x, 'treble');
        for (const fyr of CELL_Y_FRACTIONS) {
          const y = yBass + (yTreble - yBass) * fyr;
          const q2 = H[6] * x + H[7] * y + H[8];
          if (!(q2 > 1e-9)) continue;
          const u = (H[0] * x + H[1] * y + H[2]) / q2;
          const v = (H[3] * x + H[4] * y + H[5]) / q2;
          if (u < 4 || v < 4 || u > W - 4 || v > Hh - 4) continue;
          let fx = (H[1] - H[7] * u) / q2;
          let fy = (H[4] - H[7] * v) / q2;
          const fl = Math.hypot(fx, fy) || 1;
          fx /= fl;
          fy /= fl;
          total++;
          if (wireResponse(fine, coarse, u, v, -fy, fx, polarity) >= thr) dirty++;
        }
      }
      if (total >= 4) clean = 1 - dirty / total;
    }
    frets.push({ n, inView: values.length, present: values.length > 0 ? present / values.length : 0, strength: values.length > 0 ? sum / values.length : 0, clean });
  }
  // Seen run and the gaps inside it.
  let first = Infinity;
  let last = -Infinity;
  for (const f of frets) {
    if (f.inView >= 3 && f.present >= 0.5) {
      if (f.n < first) first = f.n;
      if (f.n > last) last = f.n;
    }
  }
  if (!(last >= first)) {
    return { frets, contrast, seenSpan: { min: 0, max: -1 }, seen: 0, expected: 0, longestGap: 0, coverage: 0, cleanliness: 0, fill: 0, quality: 0 };
  }
  let seen = 0;
  let expected = 0;
  let longestGap = 0;
  let run = 0;
  let cleanSum = 0;
  let cleanN = 0;
  let fillSum = 0;
  for (const f of frets) {
    if (f.n < first || f.n > last) continue;
    if (f.inView < 3) continue;
    expected++;
    if (f.present >= 0.5) {
      seen++;
      fillSum += f.present;
      run = 0;
    } else {
      run++;
      if (run > longestGap) longestGap = run;
    }
    if (f.n < last && !Number.isNaN(f.clean)) {
      cleanSum += f.clean;
      cleanN++;
    }
  }
  const forgiven = Math.min(longestGap, 6);
  const coverage = Math.min(1, seen / Math.max(1, expected - 0.75 * forgiven));
  const cleanliness = cleanN > 0 ? cleanSum / cleanN : 0;
  const fill = seen > 0 ? fillSum / seen : 0;
  // Quality: all three must be good; more seen frets make the evidence firmer.
  const enough = Math.min(1, seen / 8);
  const quality = coverage * Math.max(0, (cleanliness - 0.5) * 2) * fill * (0.5 + 0.5 * enough);
  return { frets, contrast, seenSpan: { min: first, max: last }, seen, expected, longestGap, coverage, cleanliness, fill, quality };
}

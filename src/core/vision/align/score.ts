/**
 * How well does a pose explain the image? The same measure accepts or rejects a detection,
 * ranks competing hypotheses and tells the tracker when it has lost the board.
 *
 * For every fret line the pose predicts inside the frame we ask: is there a thin line of the right
 * polarity along it (`present`), and is the cell behind it free of such lines (`clean`)? A pose that
 * is shifted, scaled or half-spaced fails one of the two. A hand hides a few neighbouring frets, so
 * one run of missing frets is forgiven; frets missing here and there are not.
 */
import { boardEdgeY, fretX, stringY } from '../geometry';
import type { Mat3, NeckModel } from '../types';
import type { GrayImage } from './image';
import { bil, ridgeAt } from './features';
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
  /** Fraction of samples just beyond the board edges, on the lines of seen frets, that still show a wire. Frets stop at the edge (near 0); stripes, slats and shelves run on (near 1). */
  overrun: number;
  /**
   * Sideways imbalance, about -2..2: (wire beyond the bass edge + no wire just inside the treble
   * edge) minus the same with the sides swapped. Near 0 for a board that sits right; beyond about
   * 0.5 the real board lies further toward the bass side (positive) or the treble side (negative),
   * typically by one string: the strings look the same after such a slip, the wire ends do not.
   */
  lateral: number;
  /**
   * String evidence: thin-line response along the neck at the six predicted string positions minus
   * the response half-way between them, relative to the fret contrast. Clearly positive on a real
   * board at webcam resolution; about zero on clutter (and on a board too blurred to show strings).
   */
  strings: number;
  /**
   * How fat the "wires" are for their spacing: brightness a fifth of a cell away from a wire,
   * relative to the wire itself, measured against the middle of the cell (median over the seen
   * frets at least `THICKNESS_MIN_SPACING` pixels apart; NaN when there are none). A fret wire is
   * a few percent of its cell wide (near 0); piano keys, slats, rungs and stripes fill about half
   * of theirs (near 1).
   */
  thickness: number;
  /** Overall fit quality, 0..1. */
  quality: number;
}

/** Wires closer together than this many pixels are too blurred to measure their thickness. */
export const THICKNESS_MIN_SPACING = 14;

const CELL_X_FRACTIONS = [0.3, 0.5, 0.7];
const CELL_Y_FRACTIONS = [0.18, 0.4, 0.6, 0.82];
/** How far beyond an edge (in board widths) the overrun samples sit. */
const OVERRUN_FRACTIONS = [0.14, 0.24, 0.34];
/** Where along a cell (fractions from one wire to the next) strings are sampled. */
const STRING_X_FRACTIONS = [0.3, 0.7];
/** Where across the board (between strings) wire thickness is sampled. */
const THICKNESS_Y_FRACTIONS = [0.21, 0.5, 0.79];

/**
 * Fraction of the samples along model fret line n that show a wire of the given polarity at least
 * `threshold` strong (within a pixel of the prediction, optionally `offsetMm` further along the
 * neck). NaN when fewer than three samples are in view.
 */
export function linePresence(fine: GrayImage, coarse: GrayImage, H: Mat3, model: NeckModel, n: number, polarity: number, threshold: number, offsetMm = 0): number {
  const W = fine.width;
  const Hh = fine.height;
  const x = fretX(model, n) + offsetMm;
  const xe = Math.max(0, x);
  const yBass = boardEdgeY(model, xe, 'bass');
  const yTreble = boardEdgeY(model, xe, 'treble');
  let inView = 0;
  let present = 0;
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
    let r = wireResponse(fine, coarse, u, v, nx, ny, polarity);
    const r2 = wireResponse(fine, coarse, u + nx, v + ny, nx, ny, polarity);
    const r3 = wireResponse(fine, coarse, u - nx, v - ny, nx, ny, polarity);
    if (r2 > r) r = r2;
    if (r3 > r) r = r3;
    inView++;
    if (r >= threshold) present++;
  }
  return inView >= 3 ? present / inView : NaN;
}

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
  // Pass 3: do the wires stop at the board edges?
  let beyond = 0;
  let beyondN = 0;
  const sideBeyond = [0, 0];
  const sideBeyondN = [0, 0];
  const sideInside = [0, 0];
  const sideInsideN = [0, 0];
  for (const f of frets) {
    if (f.inView < 3 || f.present < 0.5) continue;
    const x = fretX(model, f.n);
    const yBass = boardEdgeY(model, x, 'bass');
    const yTreble = boardEdgeY(model, x, 'treble');
    const width = yTreble - yBass;
    for (let side = 0; side < 2; side++) {
      for (const frac of OVERRUN_FRACTIONS) {
        const y = side === 0 ? yBass - frac * width : yTreble + frac * width;
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
        let r = wireResponse(fine, coarse, u, v, nx, ny, polarity);
        const r2 = wireResponse(fine, coarse, u + nx, v + ny, nx, ny, polarity);
        const r3 = wireResponse(fine, coarse, u - nx, v - ny, nx, ny, polarity);
        if (r2 > r) r = r2;
        if (r3 > r) r = r3;
        beyondN++;
        sideBeyondN[side]++;
        if (r >= thr) {
          beyond++;
          sideBeyond[side]++;
        }
      }
      // Just inside the same edge: the outermost wire sample of this fret.
      const edgeValue = raw[f.n - span.min][side === 0 ? 0 : raw[f.n - span.min].length - 1];
      if (raw[f.n - span.min].length === FRET_SAMPLE_FRACTIONS.length) {
        sideInsideN[side]++;
        if (edgeValue >= thr) sideInside[side]++;
      }
    }
  }
  const overrun = beyondN >= 6 ? beyond / beyondN : 0;
  const frac = (a: number, b: number, fallback: number): number => (b >= 3 ? a / b : fallback);
  const lateral = frac(sideBeyond[0], sideBeyondN[0], 0) + (1 - frac(sideInside[1], sideInsideN[1], 1)) - frac(sideBeyond[1], sideBeyondN[1], 0) - (1 - frac(sideInside[0], sideInsideN[0], 1));
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
    return { frets, contrast, seenSpan: { min: 0, max: -1 }, seen: 0, expected: 0, longestGap: 0, coverage: 0, cleanliness: 0, fill: 0, overrun, lateral: 0, strings: 0, thickness: NaN, quality: 0 };
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
  const quality = coverage * Math.max(0, (cleanliness - 0.5) * 2) * fill * (0.5 + 0.5 * enough) * Math.max(0, 1 - 1.6 * overrun);
  // Strings: in every cell between two seen frets, across the six predicted string lines.
  let onSum = 0;
  let offSum = 0;
  let stringN = 0;
  const nStr = model.stringCount;
  for (let k = 0; k + 1 < frets.length; k++) {
    const a = frets[k];
    const b = frets[k + 1];
    if (a.n < first || b.n > last || a.present < 0.5 || b.present < 0.5) continue;
    for (const fxr of STRING_X_FRACTIONS) {
      const x = fretX(model, a.n) + (fretX(model, b.n) - fretX(model, a.n)) * fxr;
      for (let st = 1; st <= nStr; st++) {
        const yOn = stringY(model, st, x);
        // Half-way to the next string (or the same distance outside the last one, still on the board).
        const yOff = st < nStr ? (yOn + stringY(model, st + 1, x)) / 2 : NaN;
        for (let pass = 0; pass < 2; pass++) {
          const y = pass === 0 ? yOn : yOff;
          if (Number.isNaN(y)) continue;
          const q2 = H[6] * x + H[7] * y + H[8];
          if (!(q2 > 1e-9)) continue;
          const u = (H[0] * x + H[1] * y + H[2]) / q2;
          const v = (H[3] * x + H[4] * y + H[5]) / q2;
          if (u < 4 || v < 4 || u > W - 4 || v > Hh - 4) continue;
          // Across the string = along the fret.
          let fx = (H[1] - H[7] * u) / q2;
          let fy = (H[4] - H[7] * v) / q2;
          const fl = Math.hypot(fx, fy) || 1;
          fx /= fl;
          fy /= fl;
          // Strings are bright or dark depending on board and light: take the magnitude, within a small tube.
          let r = Math.abs(ridgeAt(fine, u, v, fx, fy, 1.5));
          const r2 = Math.abs(ridgeAt(fine, u + fx, v + fy, fx, fy, 1.5));
          const r3 = Math.abs(ridgeAt(fine, u - fx, v - fy, fx, fy, 1.5));
          if (pass === 0) {
            if (r2 > r) r = r2;
            if (r3 > r) r = r3;
            onSum += r;
            stringN++;
          } else {
            offSum += r;
          }
        }
      }
    }
  }
  const strings = stringN >= 12 && contrast > 0 ? (onSum / stringN - offSum / Math.max(1, (stringN * (nStr - 1)) / nStr)) / contrast : 0;
  // Thickness of the wires relative to their spacing.
  const fills: number[] = [];
  const d = fine.data;
  for (const f of frets) {
    if (f.n < first || f.n > last || f.inView < 3 || f.present < 0.5) continue;
    const x = fretX(model, f.n);
    const before = x - fretX(model, f.n - 1);
    const after = fretX(model, f.n + 1) - x;
    const yBass = boardEdgeY(model, x, 'bass');
    const yTreble = boardEdgeY(model, x, 'treble');
    let sum = 0;
    let count = 0;
    for (const fyr of THICKNESS_Y_FRACTIONS) {
      const y = yBass + (yTreble - yBass) * fyr;
      const at = (xx: number): number => {
        const q2 = H[6] * xx + H[7] * y + H[8];
        if (!(q2 > 1e-9)) return NaN;
        const u = (H[0] * xx + H[1] * y + H[2]) / q2;
        const v = (H[3] * xx + H[4] * y + H[5]) / q2;
        return u < 2 || v < 2 || u > W - 2 || v > Hh - 2 ? NaN : bil(d, W, Hh, u, v);
      };
      const q2 = H[6] * x + H[7] * y + H[8];
      if (!(q2 > 1e-9)) continue;
      const u = (H[0] * x + H[1] * y + H[2]) / q2;
      const v = (H[3] * x + H[4] * y + H[5]) / q2;
      const ax = (H[0] - H[6] * u) / q2;
      const ay = (H[3] - H[6] * v) / q2;
      const pxPerMm = Math.hypot(ax, ay);
      if (Math.min(before, after) * pxPerMm < THICKNESS_MIN_SPACING) continue;
      // The wire itself: the extreme within a pixel of the prediction.
      const off = 1 / pxPerMm;
      const c0 = at(x);
      const c1 = at(x - off);
      const c2 = at(x + off);
      if (Number.isNaN(c0 + c1 + c2)) continue;
      const centre = polarity > 0 ? Math.max(c0, c1, c2) : Math.min(c0, c1, c2);
      let best = Infinity;
      // The same distance on both sides: a fifth of the narrower neighbouring cell.
      const reach = 0.2 * Math.min(before, after);
      for (let side = 0; side < 2; side++) {
        const cell = side === 0 ? -before : after;
        const mid = at(x + 0.5 * cell);
        const near = at(x + (side === 0 ? -reach : reach));
        if (Number.isNaN(mid + near)) continue;
        const range = polarity * (centre - mid);
        if (range < 3) continue;
        const fillRatio = Math.max(0, Math.min(1.5, (polarity * (near - mid)) / range));
        // A block inlay or a finger on one side must not make a wire look fat: the thinner side counts.
        if (fillRatio < best) best = fillRatio;
      }
      if (best !== Infinity) {
        sum += best;
        count++;
      }
    }
    if (count > 0) fills.push(sum / count);
  }
  fills.sort((a, b) => a - b);
  const thickness = fills.length >= 3 ? fills[fills.length >> 1] : NaN;
  // Fat "wires" are not wires: the quality of such a fit is worth less.
  const thin = Number.isNaN(thickness) ? 1 : Math.max(0, 1 - 1.5 * Math.max(0, thickness - 0.2));
  return { frets, contrast, seenSpan: { min: first, max: last }, seen, expected, longestGap, coverage, cleanliness, fill, overrun, lateral, strings, thickness, quality: quality * thin };
}

/** Offsets (fractions of the board width, + = outward) at which wire ends are looked for by `lengthTrend`. */
const END_OFFSETS = [-0.3, -0.25, -0.2, -0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3];

/**
 * Do the wires get longer toward the body at the rate the pose says? A row of evenly spaced bars
 * (a radiator, a fence, a ladder) can be matched to the 12-tone spacing over a dozen "frets" by a
 * perspective that brings the far end nearer; but that same perspective makes the board, and so
 * the wires, grow toward that end, and bars of constant length do not. For every seen fret this
 * measures where its wire really ends on both sides, relative to the pose's board edges, and
 * returns the robust (Theil-Sen) trend of the measured length along the neck as the relative
 * change over the seen span: about 0 on a real board. NaN when fewer than five wires have two clear ends.
 */
export function lengthTrend(fine: GrayImage, coarse: GrayImage, H: Mat3, model: NeckModel, polarity: number, score: PoseScore): number {
  const W = fine.width;
  const Hh = fine.height;
  const thr = Math.max(0.5, 0.35 * score.contrast);
  const ns: number[] = [];
  const lengths: number[] = [];
  const pattern = new Uint8Array(END_OFFSETS.length);
  for (const f of score.frets) {
    if (f.n < score.seenSpan.min || f.n > score.seenSpan.max || f.inView < 3 || f.present < 0.5) continue;
    const x = fretX(model, f.n);
    const yBass = boardEdgeY(model, x, 'bass');
    const yTreble = boardEdgeY(model, x, 'treble');
    const width = yTreble - yBass;
    let total = 1;
    let ok = true;
    for (let side = 0; side < 2 && ok; side++) {
      // Presence at each offset, then the change point with the most (present inside, absent outside).
      let presentAll = 0;
      for (let k = 0; k < END_OFFSETS.length; k++) {
        const y = side === 0 ? yBass - END_OFFSETS[k] * width : yTreble + END_OFFSETS[k] * width;
        const q2 = H[6] * x + H[7] * y + H[8];
        const u = (H[0] * x + H[1] * y + H[2]) / q2;
        const v = (H[3] * x + H[4] * y + H[5]) / q2;
        if (!(q2 > 1e-9) || u < 4 || v < 4 || u > W - 4 || v > Hh - 4) {
          ok = false;
          break;
        }
        let fx = (H[1] - H[7] * u) / q2;
        let fy = (H[4] - H[7] * v) / q2;
        const fl = Math.hypot(fx, fy) || 1;
        fx /= fl;
        fy /= fl;
        let r = wireResponse(fine, coarse, u, v, -fy, fx, polarity);
        const r2 = wireResponse(fine, coarse, u - fy, v + fx, -fy, fx, polarity);
        const r3 = wireResponse(fine, coarse, u + fy, v - fx, -fy, fx, polarity);
        if (r2 > r) r = r2;
        if (r3 > r) r = r3;
        pattern[k] = r >= thr ? 1 : 0;
        presentAll += pattern[k];
      }
      if (!ok) break;
      const N = END_OFFSETS.length;
      let best = -Infinity;
      let bestE = 0;
      let inside = 0;
      for (let e = 0; e <= N; e++) {
        const sc = inside + (N - e - (presentAll - inside));
        if (sc > best) {
          best = sc;
          bestE = e;
        }
        if (e < N) inside += pattern[e];
      }
      // A clear end inside the searched range, or this wire says nothing.
      if (best / N < 0.85 || bestE === 0 || bestE === N) ok = false;
      else total += (END_OFFSETS[bestE - 1] + END_OFFSETS[bestE]) / 2;
    }
    if (!ok) continue;
    ns.push(f.n);
    lengths.push(total);
  }
  if (ns.length < 5) return NaN;
  // Theil-Sen: the median of all pairwise slopes shrugs off wires cut short by a hand.
  const slopes: number[] = [];
  for (let a = 0; a < ns.length; a++) for (let b = a + 1; b < ns.length; b++) slopes.push((lengths[b] - lengths[a]) / (ns[b] - ns[a]));
  slopes.sort((p, q) => p - q);
  return slopes[slopes.length >> 1] * (ns[ns.length - 1] - ns[0]);
}

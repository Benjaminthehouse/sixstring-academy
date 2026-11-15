/**
 * Stage 4: continuous alignment of a pose to the image.
 *
 * The model's fret wires are projected with the current homography and sampled sparsely. At every
 * sample the image is searched along the wire's normal for the thin-line response (a 1-D search of
 * a few pixels), which gives "the wire is really d pixels over there". At both ends of every wire
 * the image is searched along the wire for the place where it stops, which pins the board across
 * its width; so do the six strings, once the pose is within half a string spacing. One robust
 * Gauss-Newton step then moves the pose to explain all displacements at once (frets hidden by a
 * hand simply have no measurement, or an outlying one that the robust weights switch off).
 * Iterating with a shrinking search range converges from several pixels of error.
 *
 * Two parameterisations share the measurements:
 *
 *  - `refineHomography`: all eight parameters, H' = H N^-1 (I + D) N, where N maps the visible part
 *    of the board to about [-1, 1]^2 and D combines eight generators (two shifts, two scales, two
 *    shears, two perspective terms). Used by detection, where the neck's true proportions and the
 *    view are both unknown.
 *  - `refineRigid`: six parameters, a rotation and a translation of the board as a rigid body in
 *    front of a camera of known focal length. Used by tracking: a neck does not change shape from
 *    one frame to the next, and with only six freedoms the frets alone pin five of them, so a hand
 *    over the board edge or motion-blurred strings cannot bend the pose.
 */
import { boardEdgeY, fretX, stringY } from '../geometry';
import type { Mat3, NeckModel } from '../types';
import { ridgeAt } from './features';
import { COARSE_SCALE, type GrayImage } from './image';

/** Lateral positions (fractions of the board width from the bass edge) where a fret wire is sampled. */
export const FRET_SAMPLE_FRACTIONS: readonly number[] = [0.1, 0.26, 0.42, 0.58, 0.74, 0.9];

/**
 * Thin-line response used throughout alignment: the better of two line widths. `fine` is the
 * working-resolution image (wires up to about 4 pixels wide), `coarse` the half-resolution one
 * (wires up to about 8). Coordinates are working-frame pixels. Positive = a wire of the given polarity.
 */
export function wireResponse(fine: GrayImage, coarse: GrayImage, x: number, y: number, nx: number, ny: number, polarity: number): number {
  const a = polarity * ridgeAt(fine, x, y, nx, ny, 2);
  const b = polarity * ridgeAt(coarse, x * COARSE_SCALE, y * COARSE_SCALE, nx, ny, 2) * 0.8;
  return a > b ? a : b;
}

/** Range of model fret lines (0 = nut; negative = behind the nut) to align and score. */
export interface FretSpan {
  min: number;
  max: number;
}

/** Fret lines whose centre projects inside the image (with a margin), limited to [lo, hi]. Empty when max < min. */
export function visibleSpan(H: Mat3, model: NeckModel, width: number, height: number, lo: number, hi: number, margin = 2): FretSpan {
  let min = Infinity;
  let max = -Infinity;
  const yc = model.nutWidth / 2;
  for (let n = lo; n <= hi; n++) {
    const x = fretX(model, n);
    const w = H[6] * x + H[7] * yc + H[8];
    if (!(w > 1e-9)) continue;
    const u = (H[0] * x + H[1] * yc + H[2]) / w;
    const v = (H[3] * x + H[4] * yc + H[5]) / w;
    if (u >= margin && u <= width - margin && v >= margin && v <= height - margin) {
      if (n < min) min = n;
      if (n > max) max = n;
    }
  }
  return min <= max ? { min, max } : { min: 0, max: -1 };
}

/** Options shared by `refineHomography` and `refineRigid`. */
export interface RefineOptions {
  /** Search half-ranges in pixels, one Gauss-Newton iteration each (default [4, 3, 2, 1.5, 1]). */
  radii?: readonly number[];
  /** Fit the fret ends (board edges) as well as the wires (default true). */
  useEnds?: boolean;
  /** Fit the six strings where they can be seen (default true): they pin the pose across the neck far better than the edges. */
  useStrings?: boolean;
  /**
   * First iteration that uses the strings (default: the last two). Strings repeat every string
   * spacing, so they can only refine a pose already within half a spacing across the neck; from
   * scratch the unambiguous fret ends must go first. A tracker that knows the board moved little
   * can use them from iteration 0.
   */
  stringsFrom?: number;
  /** Levenberg damping added to the normal matrix diagonal, relative to its mean (default 0.02). */
  damping?: number;
  /** Extra damping on the two perspective parameters of `refineHomography` (default 0.3). */
  perspectiveDamping?: number;
}

/** What a refinement reports. */
export interface RefineResult {
  H: Mat3;
  /** Wire samples that found a response in the last iteration, and how many were tried. */
  matched: number;
  tried: number;
  /** RMS of the remaining normal displacements over matched samples, in pixels. */
  rms: number;
  /** Mean thin-line response over matched samples (the board's fret contrast). */
  contrast: number;
  /** String samples that found a string in the last iteration, and how many were tried. */
  stringsMatched: number;
  stringsTried: number;
}

// ---------------------------------------------------------------------------------------------
// Measurements: "the model point (x, y) should move by `res` pixels along (nx, ny)"
// ---------------------------------------------------------------------------------------------

let M_X = new Float64Array(512);
let M_Y = new Float64Array(512);
let M_NX = new Float64Array(512);
let M_NY = new Float64Array(512);
let M_RES = new Float64Array(512);
let M_WGT = new Float64Array(512);
let M_COUNT = 0;
const END_PATTERN = new Uint8Array(32);

function ensureMeasurements(n: number): void {
  if (M_X.length >= n) return;
  const size = Math.max(n, M_X.length * 2);
  M_X = new Float64Array(size);
  M_Y = new Float64Array(size);
  M_NX = new Float64Array(size);
  M_NY = new Float64Array(size);
  M_RES = new Float64Array(size);
  M_WGT = new Float64Array(size);
}

function addMeasurement(x: number, y: number, nx: number, ny: number, res: number, weight: number): void {
  const i = M_COUNT++;
  M_X[i] = x;
  M_Y[i] = y;
  M_NX[i] = nx;
  M_NY[i] = ny;
  M_RES[i] = res;
  M_WGT[i] = weight;
}

interface MeasureStats {
  matched: number;
  tried: number;
  sumSq: number;
  sumStrength: number;
  stringsMatched: number;
  stringsTried: number;
}

/** Collect the measurements of one iteration into the M_* arrays. */
function measure(fine: GrayImage, coarse: GrayImage, H: ArrayLike<number>, model: NeckModel, polarity: number, span: FretSpan, radius: number, useEnds: boolean, useStrings: boolean): MeasureStats {
  const W = fine.width;
  const Hh = fine.height;
  const yc = model.nutWidth / 2;
  const nStr = model.stringCount;
  ensureMeasurements(Math.max(0, span.max - span.min + 1) * (FRET_SAMPLE_FRACTIONS.length + 2 + 2 * nStr) + 8);
  M_COUNT = 0;
  let matched = 0;
  let tried = 0;
  let sumSq = 0;
  let sumStrength = 0;
  // Coarse to fine over the frets themselves: a search of +-r pixels can only be trusted on wires
  // more than about 2.6 r apart (otherwise the neighbouring wire is within reach and a large
  // displacement locks densely spaced frets one fret off). Early iterations therefore use only
  // the widely spaced frets; the dense ones join as the range shrinks.
  let widest = 0;
  {
    const spacings: number[] = [];
    for (let n = span.min; n <= span.max; n++) {
      const x = fretX(model, n);
      const q2 = H[6] * x + H[7] * yc + H[8];
      if (!(q2 > 1e-9)) continue;
      const u = (H[0] * x + H[1] * yc + H[2]) / q2;
      const v = (H[3] * x + H[4] * yc + H[5]) / q2;
      if (u < 4 || v < 4 || u > W - 4 || v > Hh - 4) continue;
      const ax = (H[0] - H[6] * u) / q2;
      const ay = (H[3] - H[6] * v) / q2;
      spacings.push((fretX(model, n + 1) - x) * Math.hypot(ax, ay));
    }
    spacings.sort((a, b) => b - a);
    // The fourth widest spacing in view: at least four frets must take part.
    widest = spacings.length > 0 ? spacings[Math.min(3, spacings.length - 1)] : 0;
  }
  const reach = Math.min(radius, 0.38 * widest);
  for (let n = span.min; n <= span.max && reach >= 0.4; n++) {
    const x = fretX(model, n);
    const yBass = boardEdgeY(model, x, 'bass');
    const yTreble = boardEdgeY(model, x, 'treble');
    const xNext = fretX(model, n + 1);
    let centreStrength = 0;
    let centreCount = 0;
    let dirX = 0;
    let dirY = 0;
    let nxKeep = 0;
    let nyKeep = 0;
    for (let k = 0; k < FRET_SAMPLE_FRACTIONS.length; k++) {
      const y = yBass + (yTreble - yBass) * FRET_SAMPLE_FRACTIONS[k];
      const q2 = H[6] * x + H[7] * y + H[8];
      if (!(q2 > 1e-9)) continue;
      const u = (H[0] * x + H[1] * y + H[2]) / q2;
      const v = (H[3] * x + H[4] * y + H[5]) / q2;
      if (u < 4 || v < 4 || u > W - 4 || v > Hh - 4) continue;
      // Image direction of the wire (d/dy) and of the neck (d/dx) at this point.
      let fx = (H[1] - H[7] * u) / q2;
      let fy = (H[4] - H[7] * v) / q2;
      const fl = Math.hypot(fx, fy) || 1;
      fx /= fl;
      fy /= fl;
      let nx = -fy;
      let ny = fx;
      const ax = (H[0] - H[6] * u) / q2;
      const ay = (H[3] - H[6] * v) / q2;
      if (nx * ax + ny * ay < 0) {
        nx = -nx;
        ny = -ny;
      }
      const spacingPx = Math.abs((xNext - x) * (ax * nx + ay * ny));
      // Too dense for this iteration's range: wait for a later one.
      if (0.38 * spacingPx < 0.9 * reach) continue;
      tried++;
      // 1-D search along the normal.
      const stepLen = reach > 2.5 ? 0.75 : 0.5;
      const steps = Math.ceil(reach / stepLen);
      let best = 0;
      let bestS = 0;
      let before = 0;
      let after = 0;
      let last = 0;
      let lastWasBest = false;
      for (let s = -steps; s <= steps; s++) {
        const r = wireResponse(fine, coarse, u + nx * s * stepLen, v + ny * s * stepLen, nx, ny, polarity);
        if (lastWasBest) {
          after = r;
          lastWasBest = false;
        }
        if (r > best) {
          best = r;
          bestS = s;
          before = last;
          after = 0;
          lastWasBest = true;
        }
        last = r;
      }
      if (best <= 0.25) continue;
      let d = bestS * stepLen;
      if (bestS > -steps && bestS < steps) {
        const den = before - 2 * best + after;
        if (den < -1e-9) d += Math.max(-0.5, Math.min(0.5, (0.5 * (before - after)) / den)) * stepLen;
      }
      addMeasurement(x, y, nx, ny, d, best);
      centreStrength += best;
      centreCount++;
      dirX = fx;
      dirY = fy;
      nxKeep = nx;
      nyKeep = ny;
      matched++;
      sumSq += d * d;
      sumStrength += best;
    }
    if (!useEnds || centreCount < 3) continue;
    // Fret ends: where along the wire does it stop? (dirX, dirY) points from bass to treble.
    const level = centreStrength / centreCount;
    const thr = Math.max(0.3, 0.4 * level);
    for (let side = 0; side < 2; side++) {
      const y = side === 0 ? yBass : yTreble;
      const outward = side === 0 ? -1 : 1;
      const q2 = H[6] * x + H[7] * y + H[8];
      if (!(q2 > 1e-9)) continue;
      const u = (H[0] * x + H[1] * y + H[2]) / q2;
      const v = (H[3] * x + H[4] * y + H[5]) / q2;
      const endReach = Math.max(3, radius * 1.5);
      if (u < 4 + endReach || v < 4 + endReach || u > W - 4 - endReach || v > Hh - 4 - endReach) continue;
      // Presence at steps -R .. +R along the outward direction; the best change point has the most
      // (present inside, absent outside) samples.
      const R = Math.min(15, Math.ceil(endReach));
      const N = 2 * R + 1;
      let presentAll = 0;
      for (let s = -R; s <= R; s++) {
        const px = u + outward * dirX * s;
        const py = v + outward * dirY * s;
        let r = wireResponse(fine, coarse, px, py, nxKeep, nyKeep, polarity);
        const r2 = wireResponse(fine, coarse, px + nxKeep, py + nyKeep, nxKeep, nyKeep, polarity);
        const r3 = wireResponse(fine, coarse, px - nxKeep, py - nyKeep, nxKeep, nyKeep, polarity);
        if (r2 > r) r = r2;
        if (r3 > r) r = r3;
        const p = r >= thr ? 1 : 0;
        END_PATTERN[s + R] = p;
        presentAll += p;
      }
      let bestScore = -Infinity;
      let bestE = 0;
      let insideSum = 0;
      for (let e = 0; e <= N; e++) {
        // inside = samples [0, e), outside = [e, N)
        const score = insideSum + (N - e - (presentAll - insideSum));
        if (score > bestScore) {
          bestScore = score;
          bestE = e;
        }
        if (e < N) insideSum += END_PATTERN[e];
      }
      // A clear end has wire on the inside and none on the outside.
      if (bestScore / N < 0.8 || bestE === 0 || bestE === N) continue;
      addMeasurement(x, y, outward * dirX, outward * dirY, bestE - 0.5 - R, 0.6 * level);
    }
  }
  // Strings: in every cell, search across the neck for each string's thin line.
  let stringsMatched = 0;
  let stringsTried = 0;
  if (useStrings && matched >= 8) {
    const level = sumStrength / matched;
    const floor = Math.max(0.4, 0.1 * level);
    const firstStringRow = M_COUNT;
    for (let n = span.min; n < span.max; n++) {
      const xa = fretX(model, n);
      const xb = fretX(model, n + 1);
      for (let part = 0; part < 2; part++) {
        const x = xa + (xb - xa) * (part === 0 ? 0.3 : 0.7);
        const spacingMm = Math.abs(stringY(model, 1, x) - stringY(model, 2, x));
        for (let st = 1; st <= nStr; st++) {
          const y = stringY(model, st, x);
          const q2 = H[6] * x + H[7] * y + H[8];
          if (!(q2 > 1e-9)) continue;
          const u = (H[0] * x + H[1] * y + H[2]) / q2;
          const v = (H[3] * x + H[4] * y + H[5]) / q2;
          if (u < 5 || v < 5 || u > W - 5 || v > Hh - 5) continue;
          let fx = (H[1] - H[7] * u) / q2;
          let fy = (H[4] - H[7] * v) / q2;
          const fl = Math.hypot(fx, fy) || 1;
          fx /= fl;
          fy /= fl;
          // Strings are evenly spaced at any x: `fl` is pixels per millimetre across the neck here.
          const stringReach = Math.min(radius * 1.2, 0.36 * spacingMm * fl);
          if (stringReach < 0.6) continue;
          stringsTried++;
          const steps = Math.ceil(stringReach / 0.5);
          let best = 0;
          let bestS = -steps - 1;
          let before = 0;
          let after = 0;
          let last = 0;
          let lastWasBest = false;
          for (let k = -steps; k <= steps; k++) {
            let r = ridgeAt(fine, u + fx * k * 0.5, v + fy * k * 0.5, fx, fy, 1.5);
            // Strings shine on a dark board; on a light one they may read dark, so take either sign there.
            if (polarity < 0 && r < 0) r = -r;
            if (lastWasBest) {
              after = r;
              lastWasBest = false;
            }
            if (r > best) {
              best = r;
              bestS = k;
              before = last;
              after = 0;
              lastWasBest = true;
            }
            last = r;
          }
          // A string is a local maximum inside the search range, not a slope at its end.
          if (best < floor || bestS <= -steps || bestS >= steps) continue;
          let d = bestS * 0.5;
          const den = before - 2 * best + after;
          if (den < -1e-9) d += Math.max(-0.5, Math.min(0.5, (0.5 * (before - after)) / den)) * 0.5;
          addMeasurement(x, y, fx, fy, d, Math.min(best, level));
          stringsMatched++;
        }
      }
    }
    // Too few strings found: they are noise (blurred or tiny board). Leave the edges to do the job.
    if (stringsMatched < 0.3 * stringsTried || stringsMatched < 10) {
      M_COUNT = firstStringRow;
      stringsMatched = 0;
    }
  }
  return { matched, tried, sumSq, sumStrength, stringsMatched, stringsTried };
}

// ---------------------------------------------------------------------------------------------
// Solving
// ---------------------------------------------------------------------------------------------

const ATA = new Float64Array(64);
const ATB = new Float64Array(8);
const ROW = new Float64Array(8);
const SOLVE = new Float64Array(72);
const DELTA = new Float64Array(8);

/** Solve the n x n system in ATA / ATB (row stride 8) by Gaussian elimination with partial pivoting into `out`. False if singular. */
function solveNormal(n: number, out: Float64Array): boolean {
  const m = SOLVE;
  const stride = n + 1;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) m[r * stride + c] = ATA[r * 8 + c];
    m[r * stride + n] = ATB[r];
  }
  for (let c = 0; c < n; c++) {
    let piv = c;
    let best = Math.abs(m[c * stride + c]);
    for (let r = c + 1; r < n; r++) {
      const v = Math.abs(m[r * stride + c]);
      if (v > best) {
        best = v;
        piv = r;
      }
    }
    if (!(best > 1e-12)) return false;
    if (piv !== c) {
      for (let k = c; k <= n; k++) {
        const t = m[c * stride + k];
        m[c * stride + k] = m[piv * stride + k];
        m[piv * stride + k] = t;
      }
    }
    const d = m[c * stride + c];
    for (let r = c + 1; r < n; r++) {
      const f = m[r * stride + c] / d;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) m[r * stride + k] -= f * m[c * stride + k];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r * stride + n];
    for (let k = r + 1; k < n; k++) s -= m[r * stride + k] * out[k];
    out[r] = s / m[r * stride + r];
  }
  for (let k = 0; k < n; k++) if (!Number.isFinite(out[k])) return false;
  return true;
}

/** Robust weight of measurement i (Tukey on the residual, response-proportional, capped) or 0. */
function robustWeight(i: number, scale: number, cap: number): number {
  const r = M_RES[i] / (3 * scale);
  if (r >= 1 || r <= -1) return 0;
  return (1 - r * r) * (1 - r * r) * Math.min(M_WGT[i], cap);
}

function residualScale(): number {
  let scale = 0;
  for (let i = 0; i < M_COUNT; i++) scale += Math.abs(M_RES[i]);
  return Math.max(0.6, (1.5 * scale) / Math.max(1, M_COUNT));
}

/**
 * Align a homography (neck mm -> working pixels) to the image, all eight parameters free. `span`
 * is the range of fret lines to use (model numbering; lines outside the image are skipped).
 * Returns the input unchanged, with `matched = 0`, when nothing could be measured.
 */
export function refineHomography(fine: GrayImage, coarse: GrayImage, H0: Mat3, model: NeckModel, polarity: number, span: FretSpan, options: RefineOptions = {}): RefineResult {
  const radii = options.radii ?? [4, 3, 2, 1.5, 1];
  const useEnds = options.useEnds ?? true;
  const useStrings = options.useStrings ?? true;
  const stringsFrom = options.stringsFrom ?? radii.length - 2;
  const damping = options.damping ?? 0.02;
  const perspectiveDamping = options.perspectiveDamping ?? 0.3;
  const yc = model.nutWidth / 2;
  // Normalisation of the plane: visible x range -> [-1, 1], board half width -> about 1.
  const xa = fretX(model, span.min);
  const xb = fretX(model, span.max);
  const xc = (xa + xb) / 2;
  const sx = Math.max(20, (xb - xa) / 2);
  const sy = model.width12 / 2;
  let H: number[] = [H0[0], H0[1], H0[2], H0[3], H0[4], H0[5], H0[6], H0[7], H0[8]];
  let out: RefineResult = { H: H0, matched: 0, tried: 0, rms: 0, contrast: 0, stringsMatched: 0, stringsTried: 0 };

  for (let it = 0; it < radii.length; it++) {
    const radius = radii[it];
    const stats = measure(fine, coarse, H, model, polarity, span, radius, useEnds, useStrings && it >= stringsFrom);
    out = { ...out, matched: stats.matched, tried: stats.tried, stringsMatched: stats.stringsMatched, stringsTried: stats.stringsTried };
    if (stats.matched < 8) break;
    // Hn = H N^-1: maps normalised plane coordinates to the image.
    const h0 = H[0] * sx;
    const h1 = H[1] * sy;
    const h2 = H[0] * xc + H[1] * yc + H[2];
    const h3 = H[3] * sx;
    const h4 = H[4] * sy;
    const h5 = H[3] * xc + H[4] * yc + H[5];
    const h6 = H[6] * sx;
    const h7 = H[7] * sy;
    const h8 = H[6] * xc + H[7] * yc + H[8];
    const scale = residualScale();
    const cap = 4 * (stats.sumStrength / stats.matched);
    ATA.fill(0);
    ATB.fill(0);
    let wsum = 0;
    for (let i = 0; i < M_COUNT; i++) {
      const w = robustWeight(i, scale, cap);
      if (w <= 0) continue;
      wsum += w;
      const xi = (M_X[i] - xc) / sx;
      const eta = (M_Y[i] - yc) / sy;
      const q2 = h6 * xi + h7 * eta + h8;
      const u = (h0 * xi + h1 * eta + h2) / q2;
      const v = (h3 * xi + h4 * eta + h5) / q2;
      const nx = M_NX[i];
      const ny = M_NY[i];
      // d(image point)/d(unit change of xi, eta, homogeneous weight), projected on (nx, ny).
      const along = u * nx + v * ny;
      const ax = (h0 * nx + h3 * ny - along * h6) / q2;
      const ay = (h1 * nx + h4 * ny - along * h7) / q2;
      const az = (h2 * nx + h5 * ny - along * h8) / q2;
      // Generators: shift xi, shift eta, scale xi, scale eta, shear xi by eta, shear eta by xi, perspective xi, perspective eta.
      ROW[0] = ax;
      ROW[1] = ay;
      ROW[2] = ax * xi;
      ROW[3] = ay * eta;
      ROW[4] = ax * eta;
      ROW[5] = ay * xi;
      ROW[6] = az * xi;
      ROW[7] = az * eta;
      for (let a = 0; a < 8; a++) {
        const ra = ROW[a] * w;
        ATB[a] += ra * M_RES[i];
        for (let b = a; b < 8; b++) ATA[a * 8 + b] += ra * ROW[b];
      }
    }
    if (!(wsum > 0)) break;
    let trace = 0;
    for (let a = 0; a < 8; a++) {
      trace += ATA[a * 8 + a];
      for (let b = 0; b < a; b++) ATA[a * 8 + b] = ATA[b * 8 + a];
    }
    const lambda = (damping * trace) / 8;
    for (let a = 0; a < 8; a++) ATA[a * 8 + a] += lambda * (a >= 6 ? perspectiveDamping * 10 : a >= 4 ? 2 : 1);
    if (!solveNormal(8, DELTA)) break;
    // H <- Hn (I + D) N, with I + D = [[1 + d2, d4, d0], [d5, 1 + d3, d1], [d6, d7, 1]].
    const d0 = 1 + DELTA[2];
    const d1 = DELTA[4];
    const d2 = DELTA[0];
    const d3 = DELTA[5];
    const d4 = 1 + DELTA[3];
    const d5 = DELTA[1];
    const d6 = DELTA[6];
    const d7 = DELTA[7];
    const m0 = h0 * d0 + h1 * d3 + h2 * d6;
    const m1 = h0 * d1 + h1 * d4 + h2 * d7;
    const m2 = h0 * d2 + h1 * d5 + h2;
    const m3 = h3 * d0 + h4 * d3 + h5 * d6;
    const m4 = h3 * d1 + h4 * d4 + h5 * d7;
    const m5 = h3 * d2 + h4 * d5 + h5;
    const m6 = h6 * d0 + h7 * d3 + h8 * d6;
    const m7 = h6 * d1 + h7 * d4 + h8 * d7;
    const m8 = h6 * d2 + h7 * d5 + h8;
    // H = M N, N = [[1/sx, 0, -xc/sx], [0, 1/sy, -yc/sy], [0, 0, 1]]
    const next = [m0 / sx, m1 / sy, m2 - (m0 * xc) / sx - (m1 * yc) / sy, m3 / sx, m4 / sy, m5 - (m3 * xc) / sx - (m4 * yc) / sy, m6 / sx, m7 / sy, m8 - (m6 * xc) / sx - (m7 * yc) / sy];
    const norm = next[8];
    if (!(Math.abs(norm) > 1e-12)) break;
    let ok = true;
    for (let k = 0; k < 9; k++) {
      next[k] /= norm;
      if (!Number.isFinite(next[k])) ok = false;
    }
    if (!ok) break;
    H = next;
    out.H = H as unknown as Mat3;
    out.rms = Math.sqrt(stats.sumSq / stats.matched);
    out.contrast = stats.sumStrength / stats.matched;
    // Converged (the step moved nothing by more than a few hundredths of a pixel; the parameters are
    // in units of half the visible board): the remaining, smaller ranges would only repeat this one.
    let change = 0;
    for (let k = 0; k < 8; k++) change = Math.max(change, Math.abs(DELTA[k]));
    if (change < 1e-4 && radius <= 2 && (!useStrings || it >= stringsFrom)) break;
  }
  return out;
}

/**
 * Align a pose to the image as a RIGID body: only a rotation and a translation of the board in
 * front of a pinhole camera with focal length `focalPx` (pixels; principal point at the frame
 * centre) are adjusted, so the board keeps exactly the shape `H0` gives it. See the file header
 * for why the tracker wants this. Returns the input unchanged, with `matched = 0`, when nothing
 * could be measured.
 */
export function refineRigid(fine: GrayImage, coarse: GrayImage, H0: Mat3, focalPx: number, model: NeckModel, polarity: number, span: FretSpan, options: RefineOptions = {}): RefineResult {
  const radii = options.radii ?? [4, 3, 2, 1.5, 1];
  const useEnds = options.useEnds ?? true;
  const useStrings = options.useStrings ?? true;
  const stringsFrom = options.stringsFrom ?? radii.length - 2;
  const damping = options.damping ?? 0.02;
  const cx = fine.width / 2;
  const cy = fine.height / 2;
  const f = focalPx;
  // G = K^-1 H: column k of G is where the plane's k-th basis vector sits in camera space (up to one common scale).
  const G = [(H0[0] - cx * H0[6]) / f, (H0[1] - cx * H0[7]) / f, (H0[2] - cx * H0[8]) / f, (H0[3] - cy * H0[6]) / f, (H0[4] - cy * H0[7]) / f, (H0[5] - cy * H0[8]) / f, H0[6], H0[7], H0[8]];
  const toH = (): number[] => {
    const h = [f * G[0] + cx * G[6], f * G[1] + cx * G[7], f * G[2] + cx * G[8], f * G[3] + cy * G[6], f * G[4] + cy * G[7], f * G[5] + cy * G[8], G[6], G[7], G[8]];
    const norm = h[8];
    for (let k = 0; k < 9; k++) h[k] /= norm;
    return h;
  };
  let H = toH();
  let out: RefineResult = { H: H0, matched: 0, tried: 0, rms: 0, contrast: 0, stringsMatched: 0, stringsTried: 0 };
  // Translations are solved in units of the board's distance, so all six parameters are of order one.
  const depth = Math.hypot(G[2], G[5], G[8]) || 1;

  for (let it = 0; it < radii.length; it++) {
    const radius = radii[it];
    const stats = measure(fine, coarse, H, model, polarity, span, radius, useEnds, useStrings && it >= stringsFrom);
    out = { ...out, matched: stats.matched, tried: stats.tried, stringsMatched: stats.stringsMatched, stringsTried: stats.stringsTried };
    if (stats.matched < 6) break;
    const scale = residualScale();
    const cap = 4 * (stats.sumStrength / stats.matched);
    ATA.fill(0);
    ATB.fill(0);
    let wsum = 0;
    for (let i = 0; i < M_COUNT; i++) {
      const w = robustWeight(i, scale, cap);
      if (w <= 0) continue;
      wsum += w;
      const x = M_X[i];
      const y = M_Y[i];
      const p0 = G[0] * x + G[1] * y + G[2];
      const p1 = G[3] * x + G[4] * y + G[5];
      const p2 = G[6] * x + G[7] * y + G[8];
      const nx = M_NX[i];
      const ny = M_NY[i];
      // n . d(image)/dP = a, for a displacement dP of the camera-space point.
      const k = f / p2;
      const a0 = k * nx;
      const a1 = k * ny;
      const a2 = (-k * (nx * p0 + ny * p1)) / p2;
      // dP = omega x P + v  =>  n . d(image) = omega . (P x a) + v . a
      ROW[0] = p1 * a2 - p2 * a1;
      ROW[1] = p2 * a0 - p0 * a2;
      ROW[2] = p0 * a1 - p1 * a0;
      ROW[3] = a0 * depth;
      ROW[4] = a1 * depth;
      ROW[5] = a2 * depth;
      for (let a = 0; a < 6; a++) {
        const ra = ROW[a] * w;
        ATB[a] += ra * M_RES[i];
        for (let b = a; b < 6; b++) ATA[a * 8 + b] += ra * ROW[b];
      }
    }
    if (!(wsum > 0)) break;
    let trace = 0;
    for (let a = 0; a < 6; a++) {
      trace += ATA[a * 8 + a];
      for (let b = 0; b < a; b++) ATA[a * 8 + b] = ATA[b * 8 + a];
    }
    const lambda = (damping * trace) / 6;
    for (let a = 0; a < 6; a++) ATA[a * 8 + a] += lambda;
    if (!solveNormal(6, DELTA)) break;
    // Rotate by exp([omega]x) (Rodrigues) and translate.
    const wx = DELTA[0];
    const wy = DELTA[1];
    const wz = DELTA[2];
    const theta = Math.hypot(wx, wy, wz);
    const sn = theta > 1e-9 ? Math.sin(theta) / theta : 1;
    const cs = theta > 1e-9 ? (1 - Math.cos(theta)) / (theta * theta) : 0.5;
    const r00 = 1 - cs * (wy * wy + wz * wz);
    const r01 = -sn * wz + cs * wx * wy;
    const r02 = sn * wy + cs * wx * wz;
    const r10 = sn * wz + cs * wx * wy;
    const r11 = 1 - cs * (wx * wx + wz * wz);
    const r12 = -sn * wx + cs * wy * wz;
    const r20 = -sn * wy + cs * wx * wz;
    const r21 = sn * wx + cs * wy * wz;
    const r22 = 1 - cs * (wx * wx + wy * wy);
    for (let c = 0; c < 3; c++) {
      const g0 = G[c];
      const g1 = G[3 + c];
      const g2 = G[6 + c];
      G[c] = r00 * g0 + r01 * g1 + r02 * g2;
      G[3 + c] = r10 * g0 + r11 * g1 + r12 * g2;
      G[6 + c] = r20 * g0 + r21 * g1 + r22 * g2;
    }
    G[2] += DELTA[3] * depth;
    G[5] += DELTA[4] * depth;
    G[8] += DELTA[5] * depth;
    if (!(G[8] > 1e-9)) break;
    const next = toH();
    let ok = true;
    for (let k = 0; k < 9; k++) if (!Number.isFinite(next[k])) ok = false;
    if (!ok) break;
    H = next;
    out.H = H as unknown as Mat3;
    out.rms = Math.sqrt(stats.sumSq / stats.matched);
    out.contrast = stats.sumStrength / stats.matched;
    let change = 0;
    for (let k = 0; k < 6; k++) change = Math.max(change, Math.abs(DELTA[k]));
    if (change < 5e-5 && radius <= 2 && (!useStrings || it >= stringsFrom)) break;
  }
  return out;
}

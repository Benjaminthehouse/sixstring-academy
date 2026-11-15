/**
 * Stage 4: continuous alignment of all eight homography parameters to the image.
 *
 * The model's fret wires are projected with the current homography and sampled sparsely. At every
 * sample the image is searched along the wire's normal for the thin-line response (a 1-D search of
 * a few pixels), which gives "the wire is really d pixels over there". At both ends of every wire
 * the image is searched along the wire for the place where it stops, which pins the board across
 * its width. One robust Gauss-Newton step then moves the homography to explain all displacements
 * at once (frets hidden by a hand simply have no measurement, or an outlying one that the robust
 * weights switch off). Iterating with a shrinking search range converges from several pixels of
 * error; the same routine, started from the previous frame's pose, is the tracker.
 *
 * Parameterisation: H' = H N^-1 (I + D) N, where N maps the visible part of the board to about
 * [-1, 1]^2 and D is a combination of eight generators (two shifts, two scales, two shears, two
 * perspective terms). All eight are well scaled, so one damping constant serves them all.
 */
import { boardEdgeY, fretX } from '../geometry';
import type { Mat3, NeckModel } from '../types';
import { ridgeAt } from './features';
import type { GrayImage } from './image';

/** Lateral positions (fractions of the board width from the bass edge) where a fret wire is sampled. */
export const FRET_SAMPLE_FRACTIONS: readonly number[] = [0.1, 0.26, 0.42, 0.58, 0.74, 0.9];

/** Thin-line response used throughout alignment: the better of the fine and the coarse scale. */
export function wireResponse(fine: GrayImage, coarse: GrayImage, x: number, y: number, nx: number, ny: number, polarity: number): number {
  const a = polarity * ridgeAt(fine, x, y, nx, ny, 2);
  const b = polarity * ridgeAt(coarse, x, y, nx, ny, 4) * 0.8;
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

/** Options of `refineHomography`. */
export interface RefineOptions {
  /** Search half-ranges in pixels, one Gauss-Newton iteration each (default [4, 3, 2, 1.5, 1]). */
  radii?: readonly number[];
  /** Fit the fret ends (board edges) as well as the wires (default true). */
  useEnds?: boolean;
  /** Levenberg damping added to the normal matrix diagonal, relative to its mean (default 0.02). */
  damping?: number;
  /** Extra damping on the two perspective parameters (default 3). */
  perspectiveDamping?: number;
}

/** What `refineHomography` reports. */
export interface RefineResult {
  H: Mat3;
  /** Wire samples that found a response in the last iteration, and how many were tried. */
  matched: number;
  tried: number;
  /** RMS of the remaining normal displacements over matched samples, in pixels. */
  rms: number;
  /** Mean thin-line response over matched samples (the board's fret contrast). */
  contrast: number;
}

const ATA = new Float64Array(64);
const ATB = new Float64Array(8);
const ROW = new Float64Array(8);
const SOLVE = new Float64Array(72);

/** Solve the 8x8 system in ATA / ATB by Gaussian elimination with partial pivoting into `out`. False if singular. */
function solve8(out: Float64Array): boolean {
  const m = SOLVE;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) m[r * 9 + c] = ATA[r * 8 + c];
    m[r * 9 + 8] = ATB[r];
  }
  for (let c = 0; c < 8; c++) {
    let piv = c;
    let best = Math.abs(m[c * 9 + c]);
    for (let r = c + 1; r < 8; r++) {
      const v = Math.abs(m[r * 9 + c]);
      if (v > best) {
        best = v;
        piv = r;
      }
    }
    if (!(best > 1e-12)) return false;
    if (piv !== c) {
      for (let k = c; k < 9; k++) {
        const t = m[c * 9 + k];
        m[c * 9 + k] = m[piv * 9 + k];
        m[piv * 9 + k] = t;
      }
    }
    const d = m[c * 9 + c];
    for (let r = c + 1; r < 8; r++) {
      const f = m[r * 9 + c] / d;
      if (f === 0) continue;
      for (let k = c; k < 9; k++) m[r * 9 + k] -= f * m[c * 9 + k];
    }
  }
  for (let r = 7; r >= 0; r--) {
    let s = m[r * 9 + 8];
    for (let k = r + 1; k < 8; k++) s -= m[r * 9 + k] * out[k];
    out[r] = s / m[r * 9 + r];
  }
  for (let k = 0; k < 8; k++) if (!Number.isFinite(out[k])) return false;
  return true;
}

const DELTA = new Float64Array(8);
const END_PATTERN = new Uint8Array(32);
// Per-sample scratch of one iteration (grown on demand).
let S_ROWS = new Float64Array(8 * 512);
let S_RES = new Float64Array(512);
let S_WGT = new Float64Array(512);

function ensureScratch(n: number): void {
  if (S_RES.length >= n) return;
  const size = Math.max(n, S_RES.length * 2);
  S_ROWS = new Float64Array(8 * size);
  S_RES = new Float64Array(size);
  S_WGT = new Float64Array(size);
}

/**
 * Align a homography (neck mm -> working pixels) to the image. `span` is the range of fret lines
 * to use (model numbering; lines outside the image are skipped). Returns the input unchanged, with
 * `matched = 0`, when nothing could be measured.
 */
export function refineHomography(fine: GrayImage, coarse: GrayImage, H0: Mat3, model: NeckModel, polarity: number, span: FretSpan, options: RefineOptions = {}): RefineResult {
  const radii = options.radii ?? [4, 3, 2, 1.5, 1];
  const useEnds = options.useEnds ?? true;
  const damping = options.damping ?? 0.02;
  const perspectiveDamping = options.perspectiveDamping ?? 3;
  const W = fine.width;
  const Hh = fine.height;
  const yc = model.nutWidth / 2;
  // Normalisation of the plane: visible x range -> [-1, 1], board half width -> about 1.
  const xa = fretX(model, span.min);
  const xb = fretX(model, span.max);
  const xc = (xa + xb) / 2;
  const sx = Math.max(20, (xb - xa) / 2);
  const sy = model.width12 / 2;
  let H: number[] = [H0[0], H0[1], H0[2], H0[3], H0[4], H0[5], H0[6], H0[7], H0[8]];
  let matched = 0;
  let tried = 0;
  let rms = 0;
  let contrast = 0;
  const fretCount = Math.max(0, span.max - span.min + 1);
  ensureScratch(fretCount * (FRET_SAMPLE_FRACTIONS.length + 2) + 8);

  for (let it = 0; it < radii.length; it++) {
    const radius = radii[it];
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
    let count = 0;
    matched = 0;
    tried = 0;
    let sumSq = 0;
    let sumStrength = 0;
    const addRow = (xi: number, eta: number, q2: number, u: number, v: number, nx: number, ny: number, residual: number, weight: number): void => {
      // d(image point)/d(delta_k) projected on (nx, ny); generators listed in the file header.
      const ax = (h0 * nx + h3 * ny - (u * nx + v * ny) * h6) / q2; // effect of a unit change of xi
      const ay = (h1 * nx + h4 * ny - (u * nx + v * ny) * h7) / q2; // ... of eta
      const aw = -(u * nx + v * ny);
      const o = count * 8;
      S_ROWS[o] = ax;
      S_ROWS[o + 1] = ay;
      S_ROWS[o + 2] = ax * xi;
      S_ROWS[o + 3] = ay * eta;
      S_ROWS[o + 4] = ax * eta;
      S_ROWS[o + 5] = ay * xi;
      // The perspective generators add xi (or eta) to the homogeneous coordinate.
      const az = (h2 * nx + h5 * ny + aw * h8) / q2;
      S_ROWS[o + 6] = az * xi;
      S_ROWS[o + 7] = az * eta;
      S_RES[count] = residual;
      S_WGT[count] = weight;
      count++;
    };

    for (let n = span.min; n <= span.max; n++) {
      const x = fretX(model, n);
      const yBass = boardEdgeY(model, x, 'bass');
      const yTreble = boardEdgeY(model, x, 'treble');
      const xi = (x - xc) / sx;
      // Local spacing in pixels limits the search so a wire cannot be matched to its neighbour.
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
        const reach = Math.min(radius, 0.38 * spacingPx);
        if (reach < 0.4) continue;
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
        addRow(xi, (y - yc) / sy, q2, u, v, nx, ny, d, best);
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
        const reach = Math.max(3, radius * 1.5);
        if (u < 4 + reach || v < 4 + reach || u > W - 4 - reach || v > Hh - 4 - reach) continue;
        // Presence at steps -R .. +R along the outward direction; the best change point has the most
        // (present inside, absent outside) samples.
        const R = Math.min(15, Math.ceil(reach));
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
        const total = N;
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
        const clarity = bestScore / total;
        if (clarity < 0.8 || bestE === 0 || bestE === N) continue;
        const d = bestE - 0.5 - R; // signed distance of the end from the prediction, outward positive
        addRow(xi, (y - yc) / sy, q2, u, v, outward * dirX, outward * dirY, d, 0.6 * level);
      }
    }
    if (matched < 8) break;
    // Robust scale of the residuals, then one damped Gauss-Newton step.
    let scale = 0;
    for (let i = 0; i < count; i++) scale += Math.abs(S_RES[i]);
    scale = Math.max(0.6, (1.5 * scale) / count);
    ATA.fill(0);
    ATB.fill(0);
    let wsum = 0;
    for (let i = 0; i < count; i++) {
      const r = S_RES[i] / (3 * scale);
      if (r >= 1 || r <= -1) continue;
      const tukey = (1 - r * r) * (1 - r * r);
      const w = tukey * Math.min(S_WGT[i], 4 * (sumStrength / matched));
      wsum += w;
      const o = i * 8;
      for (let a = 0; a < 8; a++) ROW[a] = S_ROWS[o + a];
      for (let a = 0; a < 8; a++) {
        const ra = ROW[a] * w;
        ATB[a] += ra * S_RES[i];
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
    if (!solve8(DELTA)) break;
    // H <- Hn (I + D) N, with D from DELTA.
    const d0 = 1 + DELTA[2];
    const d1 = DELTA[4];
    const d2 = DELTA[0];
    const d3 = DELTA[5];
    const d4 = 1 + DELTA[3];
    const d5 = DELTA[1];
    const d6 = DELTA[6];
    const d7 = DELTA[7];
    // M = Hn * (I + D)
    const m0 = h0 * d0 + h1 * d3 + h2 * d6;
    const m1 = h0 * d1 + h1 * d4 + h2 * d7;
    const m2 = h0 * d2 + h1 * d5 + h2;
    const m3 = h3 * d0 + h4 * d3 + h5 * d6;
    const m4 = h3 * d1 + h4 * d4 + h5 * d7;
    const m5 = h3 * d2 + h4 * d5 + h5;
    const m6 = h6 * d0 + h7 * d3 + h8 * d6;
    const m7 = h6 * d1 + h7 * d4 + h8 * d7;
    const m8 = h6 * d2 + h7 * d5 + h8;
    // H = M * N, N = [[1/sx, 0, -xc/sx], [0, 1/sy, -yc/sy], [0, 0, 1]]
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
    rms = Math.sqrt(sumSq / matched);
    contrast = sumStrength / matched;
  }
  return { H: H as unknown as Mat3, matched, tried, rms, contrast };
}

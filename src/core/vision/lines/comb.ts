/**
 * Fret candidates inside a board band. The band is resampled into a strip whose rows follow the
 * pencil of strings between its two edges; fret wires are then thin ridges crossing the rows. Their
 * direction is not perpendicular to the rows and it changes along the neck (the wires converge to a
 * vanishing point), so the profile of the upper third of the board is registered against that of
 * the lower third with a shift and a stretch, and the ridge evidence of all rows is accumulated
 * along the fret directions this implies. Peaks of that accumulated profile that most rows agree on
 * are the candidates.
 */
import type { Point } from '../types';
import { profilePeaks, type BandQuad } from './band';
import type { Image32 } from './image';
import { fractionRow, ridgeAlongRows, ridgeScale, sampleRow, sampleStrip, stripToImage, type Strip, type StripGeometry } from './strip';

/** One candidate fret wire: a segment from edge 0 to edge 1 of the band. */
export interface FretLine {
  /** Distance along the centre line of the band from its start, in pixels. */
  u: number;
  /** End points on edge 0 and edge 1, in pixels of the image that was analysed. */
  p0: Point;
  p1: Point;
  /** Ridge strength relative to a typical fret of this band (about 1), reduced when it spans only part of the board. */
  weight: number;
  /** Fraction of the board width over which the ridge is present. */
  coverage: number;
}

/** Result of `analyseBand`. */
export interface Comb {
  band: BandQuad;
  frets: FretLine[];
  /** Typical ridge strength of a fret in gray levels. */
  strength: number;
  /** Start of the centre line and its unit direction: position u is `origin + u * dir`. */
  origin: Point;
  dir: Point;
  /** Length of the centre line in pixels. */
  length: number;
  /** Width of the band at the start and at the end of the centre line, in pixels. */
  widthStart: number;
  widthEnd: number;
}

/** Tunables of `analyseBand`. */
export interface CombOptions {
  /** Half-width of the ridge filter in strip columns (default: from the band width, see `ridgeScale`). */
  ridge?: number;
  /** A candidate must be present over at least this fraction of the board width (default 0.45). */
  minCoverage?: number;
  /** Largest number of rows across the band (default 48). */
  maxRows?: number;
}

let STRIP: Strip | undefined;
let RIDGE = new Float32Array(0);

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Find the fret candidates of a band. Returns null when the band holds no comb of ridges at all.
 */
export function analyseBand(img: Image32, band: BandQuad, options: CombOptions = {}): Comb | null {
  const wA = dist(band.a0, band.a1);
  const wB = dist(band.b0, band.b1);
  const aMid = { x: (band.a0.x + band.a1.x) / 2, y: (band.a0.y + band.a1.y) / 2 };
  const bMid = { x: (band.b0.x + band.b1.x) / 2, y: (band.b0.y + band.b1.y) / 2 };
  const length = dist(aMid, bMid);
  const rows = Math.max(12, Math.min(options.maxRows ?? 48, Math.round(Math.max(wA, wB)))) + 1;
  const cols = Math.round(length) + 1;
  if (cols < 40 || !(Math.min(wA, wB) > 3)) return null;
  const geom: StripGeometry = { a0: band.a0, a1: band.a1, b0: band.b0, b1: band.b1, fLo: 0, fHi: 1, rows, cols };
  STRIP = sampleStrip(img, geom, STRIP && STRIP.data.length >= rows * cols ? STRIP : undefined);
  if (RIDGE.length < rows * cols) RIDGE = new Float32Array(rows * cols);
  // Two scales, the stronger response kept: sharp wires and wires smeared by motion both count.
  const fine = options.ridge ?? ridgeScale((wA + wB) / 2);
  const ridge = ridgeAlongRows(STRIP, fine, RIDGE, Math.min(8, Math.max(fine + 2, Math.round(1.8 * fine))));
  const pol = band.polarity;
  // Keep only fret-polarity ridges, as positive numbers.
  for (let k = 0, n = rows * cols; k < n; k++) {
    const v = ridge[k] * pol;
    ridge[k] = v > 0 ? v : 0;
  }
  // Rows safely inside the board (its rim is binding, rounded wire ends and the outer strings).
  const iLo = Math.max(0, Math.ceil(fractionRow(geom, 0.06)));
  const iHi = Math.min(rows - 1, Math.floor(fractionRow(geom, 0.94)));
  const iMid = (iLo + iHi) / 2;
  const nBand = iHi - iLo + 1;
  if (nBand < 7) return null;

  // 1. Coarse common skew of the frets (columns per row): the one that makes the summed profile sharpest.
  const acc = new Float32Array(cols);
  const rowStride = nBand > 30 ? 3 : 2;
  let s0 = 0;
  let bestSharp = -1;
  for (let k = -6; k <= 6; k++) {
    const s = k * 0.15;
    acc.fill(0);
    for (let i = iLo; i <= iHi; i += rowStride) {
      const shift = Math.round(s * (i - iMid));
      const o2 = i * cols;
      const j0 = Math.max(0, -shift);
      const j1 = Math.min(cols, cols - shift);
      for (let j = j0; j < j1; j++) acc[j] += ridge[o2 + j + shift];
    }
    let sharp = 0;
    for (let j = 0; j < cols; j++) sharp += acc[j] * acc[j];
    if (sharp > bestSharp) {
      bestSharp = sharp;
      s0 = s;
    }
  }

  // 2. Profiles of the upper and the lower third, each aligned with the coarse skew.
  const third = (fa: number, fb: number, out: Float32Array): number => {
    const ia = Math.max(0, Math.ceil(fractionRow(geom, fa)));
    const ib = Math.min(rows - 1, Math.floor(fractionRow(geom, fb)));
    const ic = (ia + ib) / 2;
    out.fill(0);
    for (let i = ia; i <= ib; i++) {
      const shift = Math.round(s0 * (i - ic));
      const o2 = i * cols;
      const j0 = Math.max(0, -shift);
      const j1 = Math.min(cols, cols - shift);
      for (let j = j0; j < j1; j++) out[j] += ridge[o2 + j + shift];
    }
    const k = 1 / Math.max(1, ib - ia + 1);
    for (let j = 0; j < cols; j++) out[j] *= k;
    return ic;
  };
  const pTop = new Float32Array(cols);
  const pBot = new Float32Array(cols);
  const iT = third(0.08, 0.36, pTop);
  const iB = third(0.64, 0.92, pBot);
  if (!(iB - iT >= 3)) return null;

  // 3. Register top against bottom: u_top = c0 + alpha + beta (u_bot - c0).
  const c0 = (cols - 1) / 2;
  const correlate = (alpha: number, beta: number): number => {
    let sum = 0;
    for (let j = 0; j < cols; j++) {
      const b = pBot[j];
      if (b <= 0) continue;
      const t = c0 + alpha + beta * (j - c0);
      if (t < 0 || t > cols - 1) continue;
      const k = t | 0;
      const a = t - k;
      sum += b * (a > 0 ? pTop[k] + (pTop[k + 1] - pTop[k]) * a : pTop[k]);
    }
    return sum;
  };
  const a0 = s0 * (iT - iB);
  let alpha = a0;
  let beta = 1;
  let best = -1;
  for (let k = -12; k <= 12; k++) {
    const c = correlate(a0 + k * 0.5, 1);
    if (c > best) {
      best = c;
      alpha = a0 + k * 0.5;
    }
  }
  for (let round = 0; round < 2; round++) {
    const bCentre = beta;
    const span = round === 0 ? 0.08 : 0.01;
    const stepB = round === 0 ? 0.005 : 0.00125;
    for (let b = bCentre - span; b <= bCentre + span + 1e-9; b += stepB) {
      const c = correlate(alpha, b);
      if (c > best) {
        best = c;
        beta = b;
      }
    }
    const aCentre = alpha;
    const stepA = round === 0 ? 0.25 : 0.125;
    for (let k = -6; k <= 6; k++) {
      const c = correlate(aCentre + k * stepA, beta);
      if (c > best) {
        best = c;
        alpha = aCentre + k * stepA;
      }
    }
  }
  if (!(best > 0)) return null;

  // 4. Accumulate every band row along the implied fret directions, indexed by the centre-line column.
  const profile = new Float32Array(cols);
  const bottomOf = (uc: number): number => c0 + (2 * (uc - c0) - alpha) / (1 + beta);
  const topOf = (ub: number): number => c0 + alpha + beta * (ub - c0);
  for (let j = 0; j < cols; j++) {
    const ub = bottomOf(j);
    const g = (topOf(ub) - ub) / (iT - iB);
    let sum = 0;
    for (let i = iLo; i <= iHi; i++) sum += sampleRow(ridge, cols, i, ub + g * (i - iB));
    profile[j] = sum / nBand;
  }
  const smooth = new Float32Array(cols);
  for (let j = 1; j < cols - 1; j++) smooth[j] = 0.25 * profile[j - 1] + 0.5 * profile[j] + 0.25 * profile[j + 1];
  const peaks = profilePeaks(smooth, cols, 0.8, 3);
  if (peaks.length < 3) return null;
  const ref = smooth[peaks[Math.min(4, peaks.length - 1)]];
  const present = 0.3 * ref;

  // 5. Candidates: peaks that most rows of the board agree on.
  const perCol = length / (cols - 1);
  const row0 = fractionRow(geom, 0);
  const row1 = fractionRow(geom, 1);
  const frets: FretLine[] = [];
  for (const j of peaks) {
    if (smooth[j] < 0.25 * ref) continue;
    const l = smooth[j - 1];
    const c = smooth[j];
    const r = smooth[j + 1];
    const den = l - 2 * c + r;
    const uc = j + (den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (l - r)) / den)) : 0);
    const ub = bottomOf(uc);
    const g = (topOf(ub) - ub) / (iT - iB);
    let hit = 0;
    for (let i = iLo; i <= iHi; i++) {
      const k = Math.round(ub + g * (i - iB));
      if (k < 1 || k >= cols - 1) continue;
      const o2 = i * cols + k;
      if (ridge[o2] >= present || ridge[o2 - 1] >= present || ridge[o2 + 1] >= present) hit++;
    }
    const coverage = hit / nBand;
    if (coverage < (options.minCoverage ?? 0.45)) continue;
    frets.push({
      u: uc * perCol,
      p0: stripToImage(geom, row0, ub + g * (row0 - iB)),
      p1: stripToImage(geom, row1, ub + g * (row1 - iB)),
      weight: Math.min(1.5, c / ref) * Math.min(1, coverage / 0.8),
      coverage,
    });
  }
  if (frets.length < 3) return null;
  frets.sort((p, q) => p.u - q.u);
  return { band, frets, strength: ref, origin: aMid, dir: { x: (bMid.x - aMid.x) / length, y: (bMid.y - aMid.y) / length }, length, widthStart: wA, widthEnd: wB };
}

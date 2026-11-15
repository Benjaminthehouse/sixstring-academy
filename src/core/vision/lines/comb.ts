/**
 * Fret candidates inside a board band. The band is resampled into a strip whose rows follow the
 * pencil of strings between its two edges; fret wires are then thin ridges crossing the rows. Their
 * direction is not perpendicular to the rows and it changes along the neck (the wires converge to a
 * vanishing point), so the profile of the upper third of the board is registered against that of
 * the lower third with a shift and a stretch, and the ridge evidence of all rows is accumulated
 * along the fret directions this implies. Peaks of that accumulated profile that most rows agree on
 * are the candidates; where the wires end gives the precise edges of the board.
 */
import type { Point } from '../types';
import { profilePeaks, type BandQuad } from './band';
import type { Image32 } from './image';
import { fractionRow, ridgeAlongRows, rowFraction, sampleRow, sampleStrip, stripToImage, type Strip, type StripGeometry } from './strip';

/** One candidate fret wire: a segment from edge 0 to edge 1 of the band. */
export interface FretLine {
  /** Distance along the centre line of the band from its start, in pixels. */
  u: number;
  /** End points on edge 0 and edge 1, in pixels of the image that was analysed. */
  p0: Point;
  p1: Point;
  /** Ridge strength relative to a typical fret of this band (about 1). */
  weight: number;
  /** Fraction of the board width over which the ridge is present. */
  coverage: number;
}

/** Result of `analyseBand`. */
export interface Comb {
  /** The band with its edges moved to where the fret wires end. */
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
  /** Half-width of the ridge filter in strip columns (default 2). */
  ridge?: number;
  /** A candidate must be present over at least this fraction of the board width (default 0.45). */
  minCoverage?: number;
  /** Margin rows beyond each edge as a fraction of the band width (default 0.3). */
  margin?: number;
  /** Largest number of rows across the band itself (default 56). */
  maxRows?: number;
}

let STRIP: Strip | undefined;
let RIDGE = new Float32Array(0);

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Median of the first n entries (the array is reordered). */
function median(values: Float32Array | number[], n: number): number {
  const v = Array.prototype.slice.call(values, 0, n) as number[];
  v.sort((a, b) => a - b);
  return n === 0 ? 0 : n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
}

interface Pass {
  geom: StripGeometry;
  frets: { uc: number; ub: number; ut: number; value: number; coverage: number }[];
  ref: number;
  /** Row fractions where the frets start and end, at the two column stations. */
  edge0: [number, number];
  edge1: [number, number];
  stations: [number, number];
  iT: number;
  iB: number;
}

function analyseOnce(img: Image32, band: BandQuad, o: Required<CombOptions>): Pass | null {
  const wA = dist(band.a0, band.a1);
  const wB = dist(band.b0, band.b1);
  const aMid = { x: (band.a0.x + band.a1.x) / 2, y: (band.a0.y + band.a1.y) / 2 };
  const bMid = { x: (band.b0.x + band.b1.x) / 2, y: (band.b0.y + band.b1.y) / 2 };
  const length = dist(aMid, bMid);
  const inBand = Math.max(12, Math.min(o.maxRows, Math.round(Math.max(wA, wB))));
  const rows = Math.round(inBand * (1 + 2 * o.margin)) + 1;
  const cols = Math.round(length) + 1;
  if (cols < 40 || !(Math.min(wA, wB) > 3)) return null;
  const geom: StripGeometry = { a0: band.a0, a1: band.a1, b0: band.b0, b1: band.b1, fLo: -o.margin, fHi: 1 + o.margin, rows, cols };
  STRIP = sampleStrip(img, geom, STRIP && STRIP.data.length >= rows * cols ? STRIP : undefined);
  const strip = STRIP;
  if (RIDGE.length < rows * cols) RIDGE = new Float32Array(rows * cols);
  const ridge = ridgeAlongRows(strip, o.ridge, RIDGE);
  const pol = band.polarity;
  // Keep only fret-polarity ridges, as positive numbers.
  for (let k = 0, n = rows * cols; k < n; k++) {
    const v = ridge[k] * pol;
    ridge[k] = v > 0 ? v : 0;
  }
  const iLo = Math.max(0, Math.ceil(fractionRow(geom, 0.06)));
  const iHi = Math.min(rows - 1, Math.floor(fractionRow(geom, 0.94)));
  const iMid = (iLo + iHi) / 2;
  if (iHi - iLo < 6) return null;

  // 1. Coarse common skew of the frets (columns per row): the one that makes the summed profile sharpest.
  const acc = new Float32Array(cols);
  let s0 = 0;
  let bestSharp = -1;
  for (let k = -9; k <= 9; k++) {
    const s = k * 0.1;
    acc.fill(0);
    for (let i = iLo; i <= iHi; i += 2) {
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
  let alpha = s0 * (iT - iB);
  let beta = 1;
  let best = -1;
  const a0 = alpha;
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
  const nBand = iHi - iLo + 1;
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
  const frets: Pass['frets'] = [];
  for (const j of peaks) {
    if (smooth[j] < 0.25 * ref) continue;
    // Sub-column peak position.
    const l = smooth[j - 1];
    const c = smooth[j];
    const r = smooth[j + 1];
    const den = l - 2 * c + r;
    const uc = j + (den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (l - r)) / den)) : 0);
    const ub = bottomOf(uc);
    const ut = topOf(ub);
    const g = (ut - ub) / (iT - iB);
    let hit = 0;
    for (let i = iLo; i <= iHi; i++) {
      const col = ub + g * (i - iB);
      const k = Math.round(col);
      if (k < 1 || k >= cols - 1) continue;
      const o2 = i * cols + k;
      if (ridge[o2] >= present || ridge[o2 - 1] >= present || ridge[o2 + 1] >= present) hit++;
    }
    const coverage = hit / nBand;
    if (coverage < o.minCoverage) continue;
    frets.push({ uc, ub, ut, value: c, coverage });
  }
  if (frets.length < 3) return null;
  frets.sort((p, q) => p.uc - q.uc);

  // 6. Where do the wires end? Per row, the share of candidates whose ridge is present there,
  //    separately for the first and the second half of the comb so a tapering band is followed.
  const halves: [number, number][] = frets.length >= 8 ? [[0, frets.length >> 1], [frets.length >> 1, frets.length]] : [[0, frets.length]];
  const part = new Float32Array(rows);
  const edge0: number[] = [];
  const edge1: number[] = [];
  const stations: number[] = [];
  for (const [from, to] of halves) {
    let station = 0;
    part.fill(0);
    for (let k = from; k < to; k++) {
      const f = frets[k];
      const g = (f.ut - f.ub) / (iT - iB);
      station += f.uc;
      for (let i = 0; i < rows; i++) {
        const col = Math.round(f.ub + g * (i - iB));
        if (col < 1 || col >= cols - 1) continue;
        const o2 = i * cols + col;
        if (ridge[o2] >= present || ridge[o2 - 1] >= present || ridge[o2 + 1] >= present) part[i] += 1;
      }
    }
    station /= to - from;
    const level = 0.45 * median(part.subarray(iLo, iHi + 1), nBand);
    const start = Math.round(iMid);
    // Walk outward until two consecutive rows fall below the level; the edge is the crossing.
    const walk = (dir: 1 | -1): number => {
      let last = start;
      for (let i = start; i >= 0 && i < rows; i += dir) {
        if (part[i] >= level) {
          last = i;
          continue;
        }
        const next = i + dir;
        if (next < 0 || next >= rows || part[next] < level) break;
      }
      const out = last + dir;
      if (out < 0 || out >= rows) return last;
      const a = part[last];
      const b = part[out];
      // Linear crossing of the level between the last row inside and the first row outside.
      const t = a > b ? Math.max(0, Math.min(1, (a - level) / (a - b))) : 0.5;
      return last + dir * t;
    };
    edge0.push(rowFraction(geom, walk(-1)));
    edge1.push(rowFraction(geom, walk(1)));
    stations.push(station);
  }
  if (halves.length === 1) {
    edge0.push(edge0[0]);
    edge1.push(edge1[0]);
    stations.push(stations[0] + 1);
  }
  return { geom, frets, ref, edge0: [edge0[0], edge0[1]], edge1: [edge1[0], edge1[1]], stations: [stations[0], stations[1]], iT, iB };
}

/** Row fraction of a measured edge at a column: the line through its values at the two stations. */
function edgeFractionAt(pass: Pass, fr: [number, number], col: number): number {
  const d = pass.stations[1] - pass.stations[0];
  const slope = Math.abs(d) > 1e-6 ? (fr[1] - fr[0]) / d : 0;
  return fr[0] + slope * (col - pass.stations[0]);
}

/** Move the edges of a band to the row fractions measured at two column stations. */
function adjustBand(band: BandQuad, pass: Pass): BandQuad {
  const { geom } = pass;
  const point = (fr: [number, number], col: number): Point => stripToImage(geom, fractionRow(geom, edgeFractionAt(pass, fr, col)), col);
  const last = geom.cols - 1;
  return { ...band, a0: point(pass.edge0, 0), a1: point(pass.edge1, 0), b0: point(pass.edge0, last), b1: point(pass.edge1, last) };
}

/** The measured fret ends describe a real band: positive width at both stations and not far outside the strip. */
function edgesSane(pass: Pass): boolean {
  return pass.edge1[0] - pass.edge0[0] > 0.3 && pass.edge1[1] - pass.edge0[1] > 0.3;
}

/**
 * Find the fret candidates of a band and tighten its edges. Returns null when the band holds no
 * comb of ridges at all.
 */
export function analyseBand(img: Image32, band: BandQuad, options: CombOptions = {}): Comb | null {
  const o: Required<CombOptions> = { ridge: options.ridge ?? 2, minCoverage: options.minCoverage ?? 0.45, margin: options.margin ?? 0.3, maxRows: options.maxRows ?? 56 };
  let pass = analyseOnce(img, band, o);
  if (!pass) return null;
  // Re-run with corrected edges when they moved noticeably: the row thirds must sit on the board.
  for (let it = 0; it < 2; it++) {
    if (!edgesSane(pass)) break;
    const moved = Math.max(Math.abs(pass.edge0[0]), Math.abs(pass.edge0[1]), Math.abs(pass.edge1[0] - 1), Math.abs(pass.edge1[1] - 1));
    if (moved < 0.06) break;
    const again = analyseOnce(img, adjustBand(band, pass), o);
    if (!again) break;
    pass = again;
  }
  const { geom } = pass;
  const sane = edgesSane(pass);
  const final = sane ? adjustBand(band, pass) : { ...band, a0: geom.a0, a1: geom.a1, b0: geom.b0, b1: geom.b1 };
  const aMid = { x: (geom.a0.x + geom.a1.x) / 2, y: (geom.a0.y + geom.a1.y) / 2 };
  const bMid = { x: (geom.b0.x + geom.b1.x) / 2, y: (geom.b0.y + geom.b1.y) / 2 };
  const length = dist(aMid, bMid);
  const perCol = length / (geom.cols - 1);
  const frets: FretLine[] = pass.frets.map((f) => {
    const g = (f.ut - f.ub) / (pass.iT - pass.iB);
    // End points where the fret direction meets the two (measured) edges.
    const row0 = fractionRow(geom, sane ? edgeFractionAt(pass, pass.edge0, f.uc) : 0);
    const row1 = fractionRow(geom, sane ? edgeFractionAt(pass, pass.edge1, f.uc) : 1);
    return {
      u: f.uc * perCol,
      p0: stripToImage(geom, row0, f.ub + g * (row0 - pass.iB)),
      p1: stripToImage(geom, row1, f.ub + g * (row1 - pass.iB)),
      weight: Math.min(1.5, f.value / pass.ref) * Math.min(1, f.coverage / 0.8),
      coverage: f.coverage,
    };
  });
  return {
    band: final,
    frets,
    strength: pass.ref,
    origin: aMid,
    dir: { x: (bMid.x - aMid.x) / length, y: (bMid.y - aMid.y) / length },
    length,
    widthStart: dist(final.a0, final.a1),
    widthEnd: dist(final.b0, final.b1),
  };
}

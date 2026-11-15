/**
 * From long lines to the board: cluster near-parallel long lines into candidate neck axes, then for
 * each axis find the band the frets occupy. A fret is a thin ridge crossing the rows of a strip laid
 * along the axis; following every fret across the rows until it ends gives two end points per fret,
 * and the two robust lines through those end points are the edges of the board. Strings and painted
 * board edges are never needed, so a dark board on a dark shirt still has edges.
 */
import type { Point } from '../types';
import type { HoughLine } from './hough';
import type { Image32 } from './image';
import { ridgeAlongRows, sampleStrip, stripToImage, type Strip, type StripGeometry } from './strip';

/** A candidate direction and position of the neck. */
export interface AxisCandidate {
  /** Unit normal and offset of the axis line (nx * x + ny * y = rho). */
  nx: number;
  ny: number;
  rho: number;
  /** Summed support of the lines in the cluster. */
  score: number;
  /** Number of lines in the cluster. */
  lines: number;
}

/** The board as a quadrilateral: edge 0 runs a0 -> b0, edge 1 runs a1 -> b1 (a = start of the axis, b = end). */
export interface BandQuad {
  a0: Point;
  a1: Point;
  b0: Point;
  b1: Point;
  /** +1 when the frets are brighter than the board, -1 when darker. */
  polarity: 1 | -1;
  /** Frets that agree with both edges. */
  frets: number;
  /** Typical ridge strength of those frets (gray levels). */
  strength: number;
  /** frets * a quality factor; used to rank bands. */
  score: number;
}

/** Tunables of the band search. Lengths are in pixels of the image passed in. */
export interface BandOptions {
  /** Half-width of the search strip around the axis (default 30% of the image height). */
  halfWidth?: number;
  /** Row spacing of the search strip (default 2). */
  rowStep?: number;
  /** Half-width of the ridge filter (default 2). */
  ridge?: number;
  /** Fewest frets that must agree on both edges (default 5). */
  minFrets?: number;
}

/** Angle of a line direction in degrees, folded to [0, 180). */
function directionDeg(nx: number, ny: number): number {
  let a = (Math.atan2(nx, -ny) * 180) / Math.PI;
  if (a < 0) a += 180;
  if (a >= 180) a -= 180;
  return a;
}

function foldedDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 180;
  return d > 90 ? 180 - d : d;
}

/**
 * Group lines into candidate axes: a strong line seeds a cluster and absorbs the lines that are
 * within `maxAngleDeg` of it and closer than `maxDistance` (measured at their own midpoint).
 * Strongest clusters first.
 */
export function clusterAxes(lines: readonly HoughLine[], maxAngleDeg: number, maxDistance: number, maxClusters: number): AxisCandidate[] {
  const order = lines.map((_, i) => i).sort((a, b) => lines[b].longestRun * lines[b].support - lines[a].longestRun * lines[a].support);
  const taken = new Uint8Array(lines.length);
  const out: AxisCandidate[] = [];
  for (const s of order) {
    if (taken[s]) continue;
    const seed = lines[s];
    const dirSeed = directionDeg(seed.nx, seed.ny);
    let score = 0;
    let count = 0;
    for (const k of order) {
      if (taken[k]) continue;
      const l = lines[k];
      if (foldedDiff(directionDeg(l.nx, l.ny), dirSeed) > maxAngleDeg) continue;
      // Midpoint of the member's support, and its distance to the seed line.
      const tm = (l.t0 + l.t1) / 2;
      const mx = l.nx * l.rho - l.ny * tm;
      const my = l.ny * l.rho + l.nx * tm;
      if (Math.abs(mx * seed.nx + my * seed.ny - seed.rho) > maxDistance) continue;
      // It must also overlap the seed along the axis.
      const ts = -seed.ny * mx + seed.nx * my;
      const half = (l.t1 - l.t0) / 2;
      if (ts + half < seed.t0 - maxDistance || ts - half > seed.t1 + maxDistance) continue;
      taken[k] = 1;
      score += l.support;
      count++;
    }
    out.push({ nx: seed.nx, ny: seed.ny, rho: seed.rho, score, lines: count });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, maxClusters);
}

/** Clip the line n . p = rho to the rectangle [0, w] x [0, h]; returns the range of t along (-ny, nx) from the foot point, or null. */
export function clipLineToImage(nx: number, ny: number, rho: number, w: number, h: number): [number, number] | null {
  const px = nx * rho;
  const py = ny * rho;
  const dx = -ny;
  const dy = nx;
  let t0 = -Infinity;
  let t1 = Infinity;
  if (Math.abs(dx) > 1e-9) {
    const a = (0 - px) / dx;
    const b = (w - px) / dx;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  } else if (px < 0 || px > w) return null;
  if (Math.abs(dy) > 1e-9) {
    const a = (0 - py) / dy;
    const b = (h - py) / dy;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  } else if (py < 0 || py > h) return null;
  return t1 > t0 ? [t0, t1] : null;
}

/**
 * Robust line row = a + b * col through points, most of which lie on it and the rest on one side
 * (frets cut short by fingers end inside the board). Exhaustive two-point consensus, then least
 * squares on the consensus set. `inlier` is filled with 0 / 1.
 */
export function fitEdgeLine(cols: Float64Array, rows: Float64Array, n: number, tol: number, inlier: Uint8Array): { a: number; b: number; count: number } | null {
  if (n < 2) return null;
  let bestCount = 0;
  let bestErr = Infinity;
  let bestA = 0;
  let bestB = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const dc = cols[j] - cols[i];
      if (Math.abs(dc) < 8) continue;
      const b = (rows[j] - rows[i]) / dc;
      const a = rows[i] - b * cols[i];
      let count = 0;
      let err = 0;
      for (let k = 0; k < n; k++) {
        const e = Math.abs(rows[k] - a - b * cols[k]);
        if (e <= tol) {
          count++;
          err += e;
        }
      }
      if (count > bestCount || (count === bestCount && err < bestErr)) {
        bestCount = count;
        bestErr = err;
        bestA = a;
        bestB = b;
      }
    }
  }
  if (bestCount < 2) return null;
  let s1 = 0, sc = 0, sr = 0, scc = 0, scr = 0;
  for (let k = 0; k < n; k++) {
    const ok = Math.abs(rows[k] - bestA - bestB * cols[k]) <= tol;
    inlier[k] = ok ? 1 : 0;
    if (!ok) continue;
    s1++;
    sc += cols[k];
    sr += rows[k];
    scc += cols[k] * cols[k];
    scr += cols[k] * rows[k];
  }
  const den = s1 * scc - sc * sc;
  if (Math.abs(den) < 1e-9) return { a: bestA, b: bestB, count: bestCount };
  const b = (s1 * scr - sc * sr) / den;
  return { a: (sr - b * sc) / s1, b, count: bestCount };
}

/** Local maxima of a profile above `floor`, at least `minSep` apart (the stronger wins). Returns column indices, strongest first. */
export function profilePeaks(profile: Float32Array, n: number, floor: number, minSep: number): number[] {
  const raw: number[] = [];
  for (let j = 1; j < n - 1; j++) {
    const v = profile[j];
    if (v >= floor && v >= profile[j - 1] && v > profile[j + 1]) raw.push(j);
  }
  raw.sort((a, b) => profile[b] - profile[a]);
  const kept: number[] = [];
  for (const j of raw) {
    let ok = true;
    for (const k of kept) {
      if (Math.abs(k - j) < minSep) {
        ok = false;
        break;
      }
    }
    if (ok) kept.push(j);
  }
  return kept;
}

let WIDE: Strip | undefined;
let RIDGE = new Float32Array(0);

/**
 * Look for fretboard bands along an axis. Returns up to two bands (one per seed row), best first.
 * `diag`, when given, receives the traced fret segments in image coordinates.
 */
export function findBands(img: Image32, axis: AxisCandidate, options: BandOptions = {}, diag?: Point[][]): BandQuad[] {
  const w = img.width;
  const h = img.height;
  const clip = clipLineToImage(axis.nx, axis.ny, axis.rho, w, h);
  if (!clip || clip[1] - clip[0] < 60) return [];
  const rowStep = options.rowStep ?? 2;
  const V = options.halfWidth ?? 0.3 * h;
  const half = Math.max(4, Math.round(V / rowStep));
  const rows = 2 * half + 1;
  const cols = Math.floor(clip[1] - clip[0]) + 1;
  const px = axis.nx * axis.rho;
  const py = axis.ny * axis.rho;
  const dx = -axis.ny;
  const dy = axis.nx;
  const reach = half * rowStep;
  const at = (t: number, v: number): Point => ({ x: px + dx * t + axis.nx * v, y: py + dy * t + axis.ny * v });
  const geom: StripGeometry = { a0: at(clip[0], -reach), a1: at(clip[0], reach), b0: at(clip[0] + cols - 1, -reach), b1: at(clip[0] + cols - 1, reach), fLo: 0, fHi: 1, rows, cols };
  WIDE = sampleStrip(img, geom, WIDE && WIDE.data.length >= rows * cols ? WIDE : undefined);
  const strip = WIDE;
  const d = options.ridge ?? 2;
  if (RIDGE.length < rows * cols) RIDGE = new Float32Array(rows * cols);
  const ridge = ridgeAlongRows(strip, d, RIDGE);

  // Row energy per polarity: how much thin-ridge evidence a row holds (capped so one glint cannot dominate).
  const CAP = 30;
  const ePos = new Float32Array(rows);
  const eNeg = new Float32Array(rows);
  for (let i = 0; i < rows; i++) {
    let p = 0;
    let q = 0;
    const o = i * cols;
    for (let j = 0; j < cols; j++) {
      const v = ridge[o + j];
      if (v > 1.5) p += v < CAP ? v : CAP;
      else if (v < -1.5) q += -v < CAP ? -v : CAP;
    }
    ePos[i] = p;
    eNeg[i] = q;
  }
  const smooth = (e: Float32Array): Float32Array => {
    const s = new Float32Array(rows);
    for (let i = 1; i < rows - 1; i++) s[i] = (e[i - 1] + e[i] + e[i + 1]) / 3;
    return s;
  };
  const sPos = smooth(ePos);
  const sNeg = smooth(eNeg);
  const seeds: { row: number; polarity: 1 | -1; energy: number }[] = [];
  const minSepRows = Math.max(3, Math.round(14 / rowStep));
  for (const [s, pol] of [[sPos, 1], [sNeg, -1]] as const) {
    for (const row of profilePeaks(s, rows, 1, minSepRows).slice(0, 2)) seeds.push({ row, polarity: pol, energy: s[row] });
  }
  seeds.sort((a, b) => b.energy - a.energy);
  const top = seeds.length > 0 ? seeds[0].energy : 0;

  const out: BandQuad[] = [];
  const profile = new Float32Array(cols);
  for (const seed of seeds.slice(0, 3)) {
    if (seed.energy < 0.5 * top) continue;
    const pol = seed.polarity;
    const i0 = seed.row;
    for (let j = 0; j < cols; j++) {
      let v = 0;
      for (let di = -1; di <= 1; di++) {
        const r = ridge[(i0 + di) * cols + j] * pol;
        if (r > 0) v += r;
      }
      profile[j] = v / 3;
    }
    const peaks = profilePeaks(profile, cols, 2, 3);
    if (peaks.length < (options.minFrets ?? 5)) continue;
    const ref = profile[peaks[Math.min(3, peaks.length - 1)]];
    const frets = peaks.filter((j) => profile[j] >= 0.3 * ref);
    if (frets.length < (options.minFrets ?? 5)) continue;

    // Follow every fret up and down the rows until its ridge stops.
    const n = frets.length;
    const topCol = new Float64Array(n);
    const topRow = new Float64Array(n);
    const botCol = new Float64Array(n);
    const botRow = new Float64Array(n);
    const strength = new Float64Array(n);
    const maxMiss = Math.max(1, Math.round(4 / rowStep));
    for (let k = 0; k < n; k++) {
      strength[k] = profile[frets[k]];
      for (const dir of [-1, 1] as const) {
        let pos = frets[k];
        let slope = 0;
        let level = profile[frets[k]];
        let misses = 0;
        let hitRow = i0;
        let hitCol = pos;
        for (let i = i0 + dir; i >= 0 && i < rows; i += dir) {
          const c = Math.round(pos + slope);
          if (c < 1 || c >= cols - 1) break;
          const o = i * cols + c;
          let best = ridge[o] * pol;
          let bj = c;
          if (ridge[o - 1] * pol > best) {
            best = ridge[o - 1] * pol;
            bj = c - 1;
          }
          if (ridge[o + 1] * pol > best) {
            best = ridge[o + 1] * pol;
            bj = c + 1;
          }
          if (best >= 0.3 * level) {
            const delta = bj - pos;
            slope = Math.max(-1.6, Math.min(1.6, 0.7 * slope + 0.3 * delta));
            pos = bj;
            level = 0.85 * level + 0.15 * best;
            misses = 0;
            hitRow = i;
            hitCol = bj;
          } else {
            pos += slope;
            if (++misses > maxMiss) break;
          }
        }
        if (dir < 0) {
          topRow[k] = hitRow;
          topCol[k] = hitCol;
        } else {
          botRow[k] = hitRow;
          botCol[k] = hitCol;
        }
      }
    }
    // Keep ridges long enough to be frets, then fit both edges through their ends.
    const minLen = Math.max(3, Math.round(8 / rowStep));
    let m = 0;
    for (let k = 0; k < n; k++) {
      if (botRow[k] - topRow[k] < minLen) continue;
      topCol[m] = topCol[k];
      topRow[m] = topRow[k];
      botCol[m] = botCol[k];
      botRow[m] = botRow[k];
      strength[m] = strength[k];
      m++;
    }
    if (m < (options.minFrets ?? 5)) continue;
    const inTop = new Uint8Array(m);
    const inBot = new Uint8Array(m);
    const tol = Math.max(1.5, 3 / rowStep);
    const edgeTop = fitEdgeLine(topCol, topRow, m, tol, inTop);
    const edgeBot = fitEdgeLine(botCol, botRow, m, tol, inBot);
    if (!edgeTop || !edgeBot) continue;
    let both = 0;
    let sum = 0;
    let cMin = Infinity;
    let cMax = -Infinity;
    for (let k = 0; k < m; k++) {
      if (!(inTop[k] && inBot[k])) continue;
      both++;
      sum += strength[k];
      cMin = Math.min(cMin, topCol[k], botCol[k]);
      cMax = Math.max(cMax, topCol[k], botCol[k]);
      if (diag) diag.push([stripToImage(geom, topRow[k], topCol[k]), stripToImage(geom, botRow[k], botCol[k])]);
    }
    if (both < (options.minFrets ?? 5)) continue;
    // The band must have a sane width over the stretch the frets cover and may not flare absurdly.
    const widthAt = (c: number): number => (edgeBot.a + edgeBot.b * c - edgeTop.a - edgeTop.b * c) * rowStep;
    const wA = widthAt(cMin);
    const wB = widthAt(cMax);
    if (!(wA > 6 && wB > 6) || Math.max(wA, wB) > 1.9 * reach) continue;
    if (Math.max(wA, wB) / Math.min(wA, wB) > 2.2) continue;
    const corner = (edge: { a: number; b: number }, c: number): Point => stripToImage(geom, edge.a + edge.b * c, c);
    out.push({
      a0: corner(edgeTop, 0),
      a1: corner(edgeBot, 0),
      b0: corner(edgeTop, cols - 1),
      b1: corner(edgeBot, cols - 1),
      polarity: pol,
      frets: both,
      strength: sum / both,
      score: both * Math.min(1, sum / both / 12),
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

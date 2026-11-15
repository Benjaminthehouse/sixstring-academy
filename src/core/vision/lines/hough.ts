/**
 * Long straight lines from a gradient image: thinned edges vote in a Hough accumulator, but only for
 * line normals close to their own gradient direction (so texture cannot fake a line and the
 * accumulator stays sharp); peaks are then refitted by total least squares on their own edge pixels.
 *
 * Lines are oriented: the normal points from the dark to the bright side, so the two flanks of a
 * thin bright string are two different lines (theta and theta + 180 degrees).
 */
import { approxMedian, type Gradients } from './image';

/** Thinned edge pixels of an image. */
export interface EdgeSet {
  count: number;
  /** Pixel column / row of every edge. */
  x: Uint16Array;
  y: Uint16Array;
  /** Gradient direction in whole degrees, 0..359 (0 = brighter to the right, 90 = brighter below). */
  angle: Uint16Array;
  /** For every pixel: index into the arrays above, or -1. */
  index: Int32Array;
  /** The magnitude threshold that was used (gray levels per pixel). */
  threshold: number;
  width: number;
  height: number;
}

/** An oriented infinite line with the extent of its support. */
export interface HoughLine {
  /** Unit normal, pointing toward the brighter side. Points p on the line satisfy nx * p.x + ny * p.y = rho. */
  nx: number;
  ny: number;
  rho: number;
  /** Edge pixels on the line. */
  support: number;
  /** Extent of the support along the direction (-ny, nx). */
  t0: number;
  t1: number;
  /** Longest stretch without a gap larger than `maxGap`, in pixels. */
  longestRun: number;
}

/** Tunables of `detectLines`. Lengths are in pixels of the image the gradients were computed on. */
export interface LineOptions {
  /** Lower bound of the edge threshold in gray levels per pixel (default 2). */
  minGradient?: number;
  /** The threshold is this many times the median gradient magnitude, within [minGradient, maxGradient] (default 3). */
  noiseFactor?: number;
  /** Upper bound of the edge threshold (default 10). */
  maxGradient?: number;
  /** Votes a peak needs (default 5% of the image width). */
  minVotes?: number;
  /** Edge pixels a refitted line needs (default: `minVotes`). */
  minSupport?: number;
  /** Gaps up to this many pixels do not end a run (default 6). */
  maxGap?: number;
  /** Keep at most this many lines, strongest first (default 120). */
  maxLines?: number;
}

const DEG = Math.PI / 180;
const COS = new Float64Array(360);
const SIN = new Float64Array(360);
for (let i = 0; i < 360; i++) {
  COS[i] = Math.cos(i * DEG);
  SIN[i] = Math.sin(i * DEG);
}

interface Buffers {
  size: number;
  ex: Uint16Array;
  ey: Uint16Array;
  ea: Uint16Array;
  index: Int32Array;
  used: Uint8Array;
}
let BUF: Buffers | null = null;
let ACC = new Uint16Array(0);

function buffers(n: number): Buffers {
  if (!BUF || BUF.size !== n) BUF = { size: n, ex: new Uint16Array(n), ey: new Uint16Array(n), ea: new Uint16Array(n), index: new Int32Array(n), used: new Uint8Array(n) };
  return BUF;
}

/**
 * Thin the gradient magnitude to one-pixel edges (non-maximum suppression along the gradient).
 * The threshold adapts to the noise: a multiple of the median magnitude, clamped to a sane range.
 * The returned arrays are reused by the next call.
 */
export function extractEdges(g: Gradients, options: LineOptions = {}): EdgeSet {
  const w = g.width;
  const h = g.height;
  const n = w * h;
  const b = buffers(n);
  const { gx, gy, mag } = g;
  const median = approxMedian(mag, n);
  const lo = options.minGradient ?? 2;
  const hi = options.maxGradient ?? 10;
  const threshold = Math.min(hi, Math.max(lo, (options.noiseFactor ?? 3) * median));
  b.index.fill(-1);
  let count = 0;
  for (let r = 1; r < h - 1; r++) {
    let i = r * w + 1;
    for (let c = 1; c < w - 1; c++, i++) {
      const m = mag[i];
      if (m < threshold) continue;
      const x = gx[i];
      const y = gy[i];
      const ax = x < 0 ? -x : x;
      const ay = y < 0 ? -y : y;
      let m1: number;
      let m2: number;
      if (ay <= 0.4142 * ax) {
        m1 = mag[i - 1];
        m2 = mag[i + 1];
      } else if (ax <= 0.4142 * ay) {
        m1 = mag[i - w];
        m2 = mag[i + w];
      } else if (x * y > 0) {
        m1 = mag[i - w - 1];
        m2 = mag[i + w + 1];
      } else {
        m1 = mag[i - w + 1];
        m2 = mag[i + w - 1];
      }
      if (m < m1 || m <= m2) continue;
      let a = Math.round(Math.atan2(y, x) / DEG);
      if (a < 0) a += 360;
      if (a >= 360) a -= 360;
      b.ex[count] = c;
      b.ey[count] = r;
      b.ea[count] = a;
      b.index[i] = count;
      count++;
    }
  }
  return { count, x: b.ex, y: b.ey, angle: b.ea, index: b.index, threshold, width: w, height: h };
}

/** Smallest absolute difference between two angles in degrees (0..180). */
export function angleDiffDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

interface Fit {
  nx: number;
  ny: number;
  rho: number;
  support: number;
  t0: number;
  t1: number;
  longestRun: number;
}

/**
 * Collect the unused edge pixels within `tol` of a line whose gradient agrees with its normal, and
 * refit the line through them. With `mark`, the pixels are flagged as used.
 */
function collect(edges: EdgeSet, used: Uint8Array, nx: number, ny: number, rho: number, tol: number, maxGap: number, mark: boolean): Fit | null {
  const w = edges.width;
  const h = edges.height;
  let theta = Math.atan2(ny, nx) / DEG;
  if (theta < 0) theta += 360;
  const steep = Math.abs(nx) >= Math.abs(ny);
  const len = steep ? h : w;
  let s1 = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  let t0 = Infinity;
  let t1 = -Infinity;
  let runStart = NaN;
  let prevT = NaN;
  let longest = 0;
  for (let k = 0; k < len; k++) {
    // Position of the line in this row (steep) or column (shallow), as a pixel index.
    const pos = steep ? (rho - ny * (k + 0.5)) / nx - 0.5 : (rho - nx * (k + 0.5)) / ny - 0.5;
    const c0 = Math.round(pos);
    for (let o = -1; o <= 1; o++) {
      const q = c0 + o;
      if (q < 0 || q >= (steep ? w : h)) continue;
      const px = steep ? q : k;
      const py = steep ? k : q;
      const e = edges.index[py * w + px];
      if (e < 0 || used[e]) continue;
      const cx = px + 0.5;
      const cy = py + 0.5;
      const dist = cx * nx + cy * ny - rho;
      if (dist > tol || dist < -tol) continue;
      if (angleDiffDeg(edges.angle[e], theta) > 22) continue;
      if (mark) used[e] = 1;
      s1++;
      sx += cx;
      sy += cy;
      sxx += cx * cx;
      sxy += cx * cy;
      syy += cy * cy;
      const t = -ny * cx + nx * cy;
      if (t < t0) t0 = t;
      if (t > t1) t1 = t;
      if (Number.isNaN(prevT) || Math.abs(t - prevT) > maxGap) {
        if (!Number.isNaN(prevT)) longest = Math.max(longest, Math.abs(prevT - runStart) + 1);
        runStart = t;
      }
      prevT = t;
    }
  }
  if (s1 < 2) return null;
  longest = Math.max(longest, Math.abs(prevT - runStart) + 1);
  const mx = sx / s1;
  const my = sy / s1;
  const cxx = sxx / s1 - mx * mx;
  const cxy = sxy / s1 - mx * my;
  const cyy = syy / s1 - my * my;
  // Direction of largest variance; the normal is perpendicular to it and keeps its polarity.
  const phi = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  let fx = -Math.sin(phi);
  let fy = Math.cos(phi);
  if (fx * nx + fy * ny < 0) {
    fx = -fx;
    fy = -fy;
  }
  return { nx: fx, ny: fy, rho: fx * mx + fy * my, support: s1, t0, t1, longestRun: longest };
}

/**
 * Detect long oriented lines. Returns the lines (strongest first) and the edge set they were built
 * from (whose arrays are overwritten by the next call).
 */
export function detectLines(g: Gradients, options: LineOptions = {}): { lines: HoughLine[]; edges: EdgeSet } {
  const edges = extractEdges(g, options);
  const w = g.width;
  const h = g.height;
  const R = Math.ceil(Math.hypot(w, h)) + 2;
  const NR = 2 * R + 1;
  if (ACC.length !== 360 * NR) ACC = new Uint16Array(360 * NR);
  const acc = ACC;
  acc.fill(0);
  const { x: ex, y: ey, angle: ea } = edges;
  for (let e = 0; e < edges.count; e++) {
    const cx = ex[e] + 0.5;
    const cy = ey[e] + 0.5;
    const a = ea[e];
    for (let k = -2; k <= 2; k++) {
      let th = a + k;
      if (th < 0) th += 360;
      else if (th >= 360) th -= 360;
      acc[th * NR + Math.round(cx * COS[th] + cy * SIN[th]) + R]++;
    }
  }

  // Peaks: local maxima over (theta +- 2, rho +- 2).
  const minVotes = Math.max(8, Math.round(options.minVotes ?? 0.05 * w));
  const peaks: number[] = [];
  for (let th = 0; th < 360; th++) {
    const row = th * NR;
    for (let r = 2; r < NR - 2; r++) {
      const v = acc[row + r];
      if (v < minVotes) continue;
      let isMax = true;
      for (let dt = -2; dt <= 2 && isMax; dt++) {
        let t2 = th + dt;
        if (t2 < 0) t2 += 360;
        else if (t2 >= 360) t2 -= 360;
        const row2 = t2 * NR;
        for (let dr = -2; dr <= 2; dr++) {
          if (dt === 0 && dr === 0) continue;
          const u = acc[row2 + r + dr];
          // Ties are broken by position so exactly one cell of a plateau survives.
          if (u > v || (u === v && (dt < 0 || (dt === 0 && dr < 0)))) {
            isMax = false;
            break;
          }
        }
      }
      if (isMax) peaks.push(row + r);
    }
  }
  peaks.sort((p, q) => acc[q] - acc[p]);

  const used = buffers(w * h).used;
  used.fill(0, 0, edges.count);
  const minSupport = Math.max(6, Math.round(options.minSupport ?? minVotes));
  const maxGap = options.maxGap ?? 6;
  const maxLines = options.maxLines ?? 120;
  const lines: HoughLine[] = [];
  const limit = Math.min(peaks.length, maxLines * 4);
  for (let p = 0; p < limit && lines.length < maxLines; p++) {
    const th = Math.floor(peaks[p] / NR);
    const rho = (peaks[p] % NR) - R;
    const first = collect(edges, used, COS[th], SIN[th], rho, 2, maxGap, false);
    if (!first || first.support < minSupport) continue;
    const second = collect(edges, used, first.nx, first.ny, first.rho, 1.5, maxGap, false);
    if (!second || second.support < minSupport) continue;
    const final = collect(edges, used, second.nx, second.ny, second.rho, 1.5, maxGap, true);
    if (!final || final.support < minSupport) continue;
    lines.push({ nx: final.nx, ny: final.ny, rho: final.rho, support: final.support, t0: final.t0, t1: final.t1, longestRun: final.longestRun });
  }
  lines.sort((a, b) => b.support - a.support);
  return { lines, edges };
}

/** The two end points of a line's support, for drawing. */
export function lineEndpoints(line: HoughLine): [{ x: number; y: number }, { x: number; y: number }] {
  const px = line.nx * line.rho;
  const py = line.ny * line.rho;
  return [
    { x: px - line.ny * line.t0, y: py + line.nx * line.t0 },
    { x: px - line.ny * line.t1, y: py + line.nx * line.t1 },
  ];
}

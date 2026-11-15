/**
 * Geometric normalisation driven by the staff lines themselves.
 *
 * Given the staves traced on the raw capture, build the mesh that maps a normalised page (staff
 * lines straight, horizontal, evenly spaced and exactly `targetSpace` px apart) back to the
 * capture. Three levels, chosen from how distorted the traces are:
 *   - 'scale'       born-digital pages: lines already straight and level; only the size changes
 *   - 'similarity'  flatbed scans: one rotation plus the size change
 *   - 'mesh'        photos: every staff is straightened along its own centre curve (page curl),
 *                   lengths are measured in local staff spaces (perspective foreshortening), and
 *                   staves are aligned on the common left / right edge of the systems (shear).
 */
import type { StaffGeom } from '../staff/model';
import type { Point } from './gray';
import { type Affine, type WarpMesh, meshFromAffine, meshFromFunction } from './warp';

export type CorrectionMode = 'none' | 'scale' | 'similarity' | 'mesh';

/** Options for {@link buildDewarp}. */
export interface DewarpOptions {
  /** Staff space of notation staves in the normalised page, px. Default 16. */
  targetSpace?: number;
  /** Force a correction level (for tests); default picks from the measured distortion. */
  mode?: CorrectionMode;
  /** Largest output size in px on either side (default 6000). */
  maxSide?: number;
}

/** Result of {@link buildDewarp}. */
export interface Dewarp {
  mode: CorrectionMode;
  /** Normalised page -> source image. */
  mesh: WarpMesh;
  /** Normalised px per source px (typical). */
  scale: number;
  /** Rotation of the page content in the source, radians (positive = downhill to the right). */
  skew: number;
  /** Staff space of notation staves in the source, px. */
  sourceSpace: number;
  /** Ratio of tab staff space to notation staff space on this page (1 when only one kind). */
  tabRatio: number;
  /** Measured distortion: largest deviation of a line slope from the page skew, and relative spread of the staff space. */
  slopeSpread: number;
  spaceSpread: number;
}

function median(values: number[]): number {
  if (!values.length) return NaN;
  const s = values.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Per-staff curves used by the mesh: centre line, local space, arc position in target px. */
interface StaffCurve {
  staff: StaffGeom;
  xs: Float64Array;
  /** Smoothed centre y at xs. */
  c: Float64Array;
  /** Linear model of the local staff space: s(x) = sa + sb * x. */
  sa: number;
  sb: number;
  /** Target staff space of this staff. */
  T: number;
  /** Cumulative length along the staff in target px, at xs (0 at xs[0]). */
  u: Float64Array;
  /** Slopes for extrapolation at the two ends. */
  slope0: number;
  slope1: number;
}

function buildCurve(staff: StaffGeom, T: number): StaffCurve {
  const n = staff.xs.length;
  const xs = Float64Array.from(staff.xs);
  const raw = new Float64Array(n);
  const sp = new Float64Array(n);
  const L = staff.lineCount;
  for (let k = 0; k < n; k++) {
    let a = 0;
    for (let l = 0; l < L; l++) a += staff.ys[l][k];
    raw[k] = a / L;
    sp[k] = (staff.ys[L - 1][k] - staff.ys[0][k]) / (L - 1);
  }
  // Smooth the centre over about three staff spaces on either side.
  const step = n > 1 ? (xs[n - 1] - xs[0]) / (n - 1) : 1;
  const r = Math.max(1, Math.round((3 * staff.space) / Math.max(1, step)));
  const c = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, k - r);
    const b = Math.min(n - 1, k + r);
    // Local linear fit evaluated at k (keeps slopes at the ends, unlike a plain average).
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    const m = b - a + 1;
    for (let i = a; i <= b; i++) {
      sx += xs[i];
      sy += raw[i];
      sxx += xs[i] * xs[i];
      sxy += xs[i] * raw[i];
    }
    const den = m * sxx - sx * sx;
    if (m >= 3 && Math.abs(den) > 1e-9) {
      const slope = (m * sxy - sx * sy) / den;
      c[k] = (sy - slope * sx) / m + slope * xs[k];
    } else {
      c[k] = sy / m;
    }
  }
  // Linear model of the staff space along the staff.
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let k = 0; k < n; k++) {
    sx += xs[k];
    sy += sp[k];
    sxx += xs[k] * xs[k];
    sxy += xs[k] * sp[k];
  }
  const den = n * sxx - sx * sx;
  let sb = n >= 4 && Math.abs(den) > 1e-9 ? (n * sxy - sx * sy) / den : 0;
  let sa = (sy - sb * sx) / n;
  // A staff space that changes by more than a third along one staff is a tracking error, not perspective.
  const span = xs[n - 1] - xs[0];
  if (Math.abs(sb * span) > 0.35 * (sy / n)) {
    sb = 0;
    sa = sy / n;
  }
  const u = new Float64Array(n);
  for (let k = 1; k < n; k++) {
    const dx = xs[k] - xs[k - 1];
    const dy = c[k] - c[k - 1];
    const xm = (xs[k] + xs[k - 1]) / 2;
    u[k] = u[k - 1] + (Math.hypot(dx, dy) * T) / (sa + sb * xm);
  }
  const e = Math.max(1, Math.min(n - 1, Math.round(n * 0.12)));
  const slope0 = (c[e] - c[0]) / (xs[e] - xs[0]);
  const slope1 = (c[n - 1] - c[n - 1 - e]) / (xs[n - 1] - xs[n - 1 - e]);
  return { staff, xs, c, sa, sb, T, u, slope0, slope1 };
}

function seg(xs: Float64Array, x: number): number {
  const n = xs.length;
  if (x <= xs[0]) return 0;
  if (x >= xs[n - 1]) return n - 2;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid; else hi = mid;
  }
  return lo;
}

/** Centre y of a staff at source x (extrapolated with the end slopes). */
function centreAt(cv: StaffCurve, x: number): number {
  const n = cv.xs.length;
  if (x <= cv.xs[0]) return cv.c[0] + (x - cv.xs[0]) * cv.slope0;
  if (x >= cv.xs[n - 1]) return cv.c[n - 1] + (x - cv.xs[n - 1]) * cv.slope1;
  const k = seg(cv.xs, x);
  const t = (x - cv.xs[k]) / (cv.xs[k + 1] - cv.xs[k]);
  return cv.c[k] + (cv.c[k + 1] - cv.c[k]) * t;
}

function slopeAt(cv: StaffCurve, x: number): number {
  const n = cv.xs.length;
  if (x <= cv.xs[0]) return cv.slope0;
  if (x >= cv.xs[n - 1]) return cv.slope1;
  const k = seg(cv.xs, x);
  return (cv.c[k + 1] - cv.c[k]) / (cv.xs[k + 1] - cv.xs[k]);
}

function spaceAt(cv: StaffCurve, x: number): number {
  return Math.max(1, cv.sa + cv.sb * x);
}

/** Arc position (target px from the staff's first sample) of source x. */
function arcAt(cv: StaffCurve, x: number): number {
  const n = cv.xs.length;
  if (x <= cv.xs[0]) return ((x - cv.xs[0]) * Math.hypot(1, cv.slope0) * cv.T) / spaceAt(cv, cv.xs[0]);
  if (x >= cv.xs[n - 1]) return cv.u[n - 1] + ((x - cv.xs[n - 1]) * Math.hypot(1, cv.slope1) * cv.T) / spaceAt(cv, cv.xs[n - 1]);
  const k = seg(cv.xs, x);
  const t = (x - cv.xs[k]) / (cv.xs[k + 1] - cv.xs[k]);
  return cv.u[k] + (cv.u[k + 1] - cv.u[k]) * t;
}

/** Source x at an arc position (inverse of {@link arcAt}). */
function xAtArc(cv: StaffCurve, u: number): number {
  const n = cv.xs.length;
  if (u <= 0) return cv.xs[0] + (u * spaceAt(cv, cv.xs[0])) / (cv.T * Math.hypot(1, cv.slope0));
  if (u >= cv.u[n - 1]) return cv.xs[n - 1] + ((u - cv.u[n - 1]) * spaceAt(cv, cv.xs[n - 1])) / (cv.T * Math.hypot(1, cv.slope1));
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cv.u[mid] <= u) lo = mid; else hi = mid;
  }
  const t = (u - cv.u[lo]) / Math.max(1e-9, cv.u[hi] - cv.u[lo]);
  return cv.xs[lo] + (cv.xs[hi] - cv.xs[lo]) * t;
}

/**
 * Fit the common edge x = a + b * y of the staff ends. Most staves share it; the exceptions lie on
 * the inside (an indented first system, a short last one), so with three or more staves the line
 * supported by the most ends wins. With one or two staves the edge is taken perpendicular to the
 * staves unless both ends agree with a nearly perpendicular line.
 */
function fitEdge(points: Point[], slopes: number[], tol: number, inner: 1 | -1): { a: number; b: number } {
  const n = points.length;
  const perp = -median(slopes);
  if (n === 1) return { a: points[0].x - perp * points[0].y, b: perp };
  let best: { a: number; b: number; inl: number; res: number } | null = null;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dy = points[j].y - points[i].y;
      if (Math.abs(dy) < 1e-6) continue;
      const b = (points[j].x - points[i].x) / dy;
      if (Math.abs(b - perp) > 0.2) continue;
      const a = points[i].x - b * points[i].y;
      let inl = 0;
      let res = 0;
      let bad = false;
      for (const p of points) {
        const d = p.x - (a + b * p.y);
        if (Math.abs(d) <= tol) {
          inl++;
          res += Math.abs(d);
        } else if (d * inner < 0) {
          // An end sticking out beyond the edge: this is not the outer edge.
          bad = true;
        }
      }
      if (bad) continue;
      if (!best || inl > best.inl || (inl === best.inl && res < best.res)) best = { a, b, inl, res };
    }
  }
  if (best && best.inl >= 2) {
    // Least-squares refit on the inliers.
    let sy = 0, sx = 0, syy = 0, sxy = 0, m = 0;
    for (const p of points) {
      if (Math.abs(p.x - (best.a + best.b * p.y)) > tol) continue;
      m++;
      sy += p.y;
      sx += p.x;
      syy += p.y * p.y;
      sxy += p.y * p.x;
    }
    const den = m * syy - sy * sy;
    if (m >= 2 && Math.abs(den) > 1e-6) {
      const b = (m * sxy - sy * sx) / den;
      return { a: (sx - b * sy) / m, b };
    }
    return { a: best.a, b: best.b };
  }
  // Fall back to a perpendicular through the outermost end.
  let ext = points[0];
  for (const p of points) if ((p.x - perp * p.y - (ext.x - perp * ext.y)) * inner < 0) ext = p;
  return { a: ext.x - perp * ext.y, b: perp };
}

/** Build the normalisation for a page from its traced staves (all in source px). */
export function buildDewarp(staves: StaffGeom[], width: number, height: number, opts: DewarpOptions = {}): Dewarp {
  const S = opts.targetSpace ?? 16;
  const maxSide = opts.maxSide ?? 6000;
  const identity = (): Dewarp => ({
    mode: 'none', mesh: meshFromAffine(width, height, [1, 0, 0, 0, 1, 0], Math.max(width, height)), scale: 1, skew: 0,
    sourceSpace: 0, tabRatio: 1, slopeSpread: 0, spaceSpread: 0,
  });
  if (!staves.length) return identity();

  // Reference staff spaces per kind.
  const five = staves.filter((s) => s.lineCount === 5).map((s) => s.space);
  const other = staves.filter((s) => s.lineCount !== 5).map((s) => s.space);
  const s5 = five.length ? median(five) : NaN;
  const s6 = other.length ? median(other) : NaN;
  let tabRatio = five.length && other.length ? s6 / s5 : 1;
  if (Math.abs(tabRatio - 1) < 0.06) tabRatio = 1;
  tabRatio = Math.max(0.6, Math.min(2, tabRatio));
  const sourceSpace = five.length ? s5 : s6;
  const targetOf = (st: StaffGeom): number => (five.length && st.lineCount !== 5 ? S * tabRatio : S);
  const curves = staves.map((st) => buildCurve(st, targetOf(st)));

  // Distortion measures.
  const slopes: number[] = [];
  const weights: number[] = [];
  for (const cv of curves) {
    const n = cv.xs.length;
    slopes.push((cv.c[n - 1] - cv.c[0]) / (cv.xs[n - 1] - cv.xs[0]));
    weights.push(cv.xs[n - 1] - cv.xs[0]);
  }
  const skewSlope = median(slopes);
  let slopeSpread = 0;
  let spaceSpread = 0;
  for (const cv of curves) {
    const n = cv.xs.length;
    const q = Math.max(1, Math.floor(n / 4));
    for (let k = 0; k + q < n; k += q) {
      const local = (cv.c[k + q] - cv.c[k]) / (cv.xs[k + q] - cv.xs[k]);
      slopeSpread = Math.max(slopeSpread, Math.abs(local - skewSlope));
    }
    const ref = cv.staff.lineCount === 5 || !five.length ? sourceSpace : sourceSpace * tabRatio;
    for (const x of [cv.xs[0], cv.xs[n - 1]]) spaceSpread = Math.max(spaceSpread, Math.abs(spaceAt(cv, x) - ref) / ref);
  }
  const scale0 = S / sourceSpace;
  let mode: CorrectionMode;
  if (opts.mode) mode = opts.mode;
  else if (Math.abs(skewSlope) < 0.0009 && slopeSpread < 0.004 && spaceSpread < 0.03) mode = Math.abs(scale0 - 1) < 0.02 ? 'none' : 'scale';
  else if (slopeSpread < 0.004 && spaceSpread < 0.03) mode = 'similarity';
  else mode = 'mesh';
  const skew = Math.atan(skewSlope);
  const base = { skew, sourceSpace, tabRatio, slopeSpread, spaceSpread };

  if (mode === 'none') return { ...identity(), ...base, skew: 0 };
  if (mode === 'scale' || mode === 'similarity') {
    let k = scale0;
    const th = mode === 'similarity' ? skew : 0;
    const c = Math.cos(th);
    const s = Math.sin(th);
    // Size of the rotated, scaled page.
    let outW = Math.round((Math.abs(c) * width + Math.abs(s) * height) * k);
    let outH = Math.round((Math.abs(s) * width + Math.abs(c) * height) * k);
    if (Math.max(outW, outH) > maxSide) {
      k *= maxSide / Math.max(outW, outH);
      outW = Math.round((Math.abs(c) * width + Math.abs(s) * height) * k);
      outH = Math.round((Math.abs(s) * width + Math.abs(c) * height) * k);
    }
    // Output -> source: scale by 1/k about the centres, rotate by +skew (content at angle th becomes level).
    const t: Affine = [c / k, -s / k, width / 2 - (c * outW) / (2 * k) + (s * outH) / (2 * k), s / k, c / k, height / 2 - (s * outW) / (2 * k) - (c * outH) / (2 * k)];
    return { mode, mesh: meshFromAffine(outW, outH, t, 64), scale: k, ...base, skew: th };
  }

  // ---- mesh mode ------------------------------------------------------------------------------
  // Order the staves top to bottom by their centre at the page middle.
  const order = curves.map((cv, i) => ({ i, y: centreAt(cv, width / 2) })).sort((a, b) => a.y - b.y).map((o) => o.i);
  const cs = order.map((i) => curves[i]);
  const K = cs.length;
  const tol = 0.75 * sourceSpace;
  const endSlopes = cs.map((cv) => cv.slope0);
  const leftPts = cs.map((cv) => ({ x: cv.xs[0], y: cv.c[0] }));
  const rightPts = cs.map((cv) => ({ x: cv.xs[cv.xs.length - 1], y: cv.c[cv.xs.length - 1] }));
  const left = fitEdge(leftPts, endSlopes, tol, 1);
  const right = fitEdge(rightPts, cs.map((cv) => cv.slope1), tol, -1);
  // Where each staff (extended) meets the two edges, as arc positions.
  const uL: number[] = [];
  const uR: number[] = [];
  for (const cv of cs) {
    let xl = cv.xs[0];
    let xr = cv.xs[cv.xs.length - 1];
    for (let it = 0; it < 4; it++) {
      xl = left.a + left.b * centreAt(cv, xl);
      xr = right.a + right.b * centreAt(cv, xr);
    }
    uL.push(arcAt(cv, xl));
    uR.push(arcAt(cv, xr));
  }
  const lengths = cs.map((_, k) => uR[k] - uL[k]);
  let Wt = median(lengths);
  // Per-staff stretch so both edges line up; distrust large corrections.
  const gamma = lengths.map((len) => {
    const g = Wt / len;
    return g > 0.9 && g < 1.1 ? g : 1;
  });
  // Typical scale and margins.
  const scales = cs.map((cv) => cv.T / spaceAt(cv, (cv.xs[0] + cv.xs[cv.xs.length - 1]) / 2));
  let scale = median(scales);
  const yMid = height / 2;
  const leftMargin = Math.max(2 * S, (left.a + left.b * yMid) * scale);
  const rightMargin = Math.max(2 * S, (width - (right.a + right.b * yMid)) * scale);
  // Vertical layout: distances between staff centres measured in local staff spaces.
  const Y: number[] = [];
  const sampleU = [0.15, 0.35, 0.5, 0.65, 0.85];
  const pointAt = (k: number, X: number): { x: number; y: number; cv: StaffCurve } => {
    const cv = cs[k];
    const u = uL[k] + (X - leftMargin) / gamma[k];
    const x = xAtArc(cv, u);
    return { x, y: centreAt(cv, x), cv };
  };
  const topScale = scales[0];
  Y.push(Math.max(4 * S, centreAt(cs[0], (cs[0].xs[0] + cs[0].xs[cs[0].xs.length - 1]) / 2) * topScale));
  for (let k = 0; k + 1 < K; k++) {
    const ds: number[] = [];
    for (const f of sampleU) {
      const X = leftMargin + f * Wt;
      const a = pointAt(k, X);
      const b = pointAt(k + 1, X);
      const local = (spaceAt(a.cv, a.x) / a.cv.T + spaceAt(b.cv, b.x) / b.cv.T) / 2;
      ds.push(Math.hypot(b.x - a.x, b.y - a.y) / local);
    }
    Y.push(Y[k] + Math.max(3 * S, median(ds)));
  }
  const lastCv = cs[K - 1];
  const bottomMargin = Math.max(4 * S, (height - centreAt(lastCv, (lastCv.xs[0] + lastCv.xs[lastCv.xs.length - 1]) / 2)) * scales[K - 1]);
  let outW = Math.round(leftMargin + Wt + rightMargin);
  let outH = Math.round(Y[K - 1] + bottomMargin);
  if (Math.max(outW, outH) > maxSide || outW < 16 || outH < 16 || !(Wt > 0)) {
    // Something is off (or the page is enormous): fall back to a rotation.
    return buildDewarp(staves, width, height, { ...opts, mode: 'similarity' });
  }
  scale = Math.max(1e-3, scale);
  Wt = Math.max(1, Wt);

  /** Local frame of staff k at target column X: centre point, transversal direction, px per target px. */
  const frame = (k: number, X: number): { cx: number; cy: number; ux: number; uy: number; rate: number } => {
    const p = pointAt(k, X);
    const m = slopeAt(p.cv, p.x);
    const norm = Math.hypot(1, m);
    // Normal to the staff (pointing down the page).
    let ux = -m / norm;
    let uy = 1 / norm;
    let cosNormal = 1;
    if (K > 1) {
      // The line through the same column of the neighbouring staves is the image of a page vertical.
      const a = pointAt(Math.max(0, k - 1), X);
      const b = pointAt(Math.min(K - 1, k + 1), X);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len > 1e-6) {
        const tx = dx / len;
        const ty = dy / len;
        const cosN = tx * ux + ty * uy;
        if (cosN > 0.9) {
          ux = tx;
          uy = ty;
          cosNormal = cosN;
        }
      }
    }
    return { cx: p.x, cy: p.y, ux, uy, rate: spaceAt(p.cv, p.x) / p.cv.T / cosNormal };
  };
  const half = cs.map((cv) => ((cv.staff.lineCount - 1) / 2) * cv.T + cv.T);
  const fn = (X: number, Yt: number): Point => {
    // Staff interval containing Yt.
    let k = 0;
    while (k + 1 < K && Yt > Y[k + 1]) k++;
    const f0 = frame(k, X);
    const p0x = f0.cx + f0.ux * (Yt - Y[k]) * f0.rate;
    const p0y = f0.cy + f0.uy * (Yt - Y[k]) * f0.rate;
    if (k + 1 >= K || Yt <= Y[k]) return { x: p0x, y: p0y };
    const lo = Y[k] + half[k];
    const hi = Y[k + 1] - half[k + 1];
    let wgt = hi > lo ? (Yt - lo) / (hi - lo) : Yt > (lo + hi) / 2 ? 1 : 0;
    wgt = wgt <= 0 ? 0 : wgt >= 1 ? 1 : wgt * wgt * (3 - 2 * wgt);
    if (wgt === 0) return { x: p0x, y: p0y };
    const f1 = frame(k + 1, X);
    const p1x = f1.cx + f1.ux * (Yt - Y[k + 1]) * f1.rate;
    const p1y = f1.cy + f1.uy * (Yt - Y[k + 1]) * f1.rate;
    return { x: p0x + (p1x - p0x) * wgt, y: p0y + (p1y - p0y) * wgt };
  };
  const mesh = meshFromFunction(outW, outH, Math.max(8, Math.round(S)), fn);
  // Sanity: the mesh must not fold (positive area everywhere) and must stay near the image.
  let ok = true;
  for (let j = 0; j + 1 < mesh.rows && ok; j++) {
    for (let i = 0; i + 1 < mesh.cols; i++) {
      const p = j * mesh.cols + i;
      const ax = mesh.sx[p + 1] - mesh.sx[p];
      const ay = mesh.sy[p + 1] - mesh.sy[p];
      const bx = mesh.sx[p + mesh.cols] - mesh.sx[p];
      const by = mesh.sy[p + mesh.cols] - mesh.sy[p];
      const area = ax * by - ay * bx;
      if (!(area > 0) || !Number.isFinite(area)) {
        ok = false;
        break;
      }
    }
  }
  if (!ok) return buildDewarp(staves, width, height, { ...opts, mode: 'similarity' });
  return { mode: 'mesh', mesh, scale, ...base };
}

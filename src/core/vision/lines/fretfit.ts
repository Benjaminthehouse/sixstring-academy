/**
 * The 1-D fret model: given candidate fret positions along the neck axis (with some missing under
 * the hand and some spurious), find which candidate is which fret, up to the unknowable whole-fret
 * offset.
 *
 * Model. Fret m sits at x(m) = 1 - r^m scale lengths from fret 0 (r = 2^(-1/12)). A camera maps the
 * axis by a 1-D projective map, so its image position is u(m) = (A x + B) / (C x + 1). Shifting
 * every index by k is an affine change of x, so the offset is exactly unobservable here and the
 * indices returned are RELATIVE (the caller resolves the offset from the nut, inlays or a tap).
 * Reversing the direction is also a projective change of x, so it is only resolved by bounding the
 * perspective: the depth ratio C x + 1 between the two ends of the comb must stay within what a real
 * camera could produce (or within what the board edges say). Short combs can fit both ways: pass
 * the direction if it is known.
 */

/** Ratio between consecutive fret spacings. */
export const FRET_RATIO = Math.pow(2, -1 / 12);

/** One candidate fret position along the axis. */
export interface FretCandidate {
  /** Position along the axis in pixels. */
  u: number;
  /** Relative strength; a typical clean fret should be about 1. */
  weight: number;
}

/** Options of `fitFretPattern`. */
export interface FretFitOptions {
  /** +1: the nut is toward smaller u; -1: toward larger u; 0 (default): try both. */
  direction?: 1 | -1 | 0;
  /** Inlier tolerance as a fraction of the local fret spacing (default 0.16). */
  tolerance?: number;
  /** Lower bound of the inlier tolerance in pixels (default 1.2). */
  minTolerancePx?: number;
  /**
   * Allowed range of the depth ratio w(u_max) / w(u_min): the camera depth (projective weight) at the
   * candidate with the largest u over that at the smallest u. Default [1 / 2.2, 2.2]; pass a narrow
   * range when the convergence of the board edges tells how the neck recedes.
   */
  depthRatio?: [number, number];
  /** Believable fret spacing in pixels (defaults 3 and 120). */
  minSpacing?: number;
  maxSpacing?: number;
  /** Fewest matched frets for a fit to count (default 5). */
  minInliers?: number;
}

/** Result of `fitFretPattern`. */
export interface FretFit {
  /** u(m) = (A x + B) / (C x + 1) with x = 1 - r^m. */
  A: number;
  B: number;
  C: number;
  /** +1 when indices grow with u (nut toward smaller u), -1 otherwise. */
  direction: 1 | -1;
  /** Relative fret index of every candidate (input order), or null for candidates that fit no fret. */
  indices: (number | null)[];
  /** Number of matched candidates. */
  inliers: number;
  /** Smallest and largest relative index that was matched. */
  minIndex: number;
  maxIndex: number;
  /** Frets between minIndex and maxIndex that have no candidate (hidden by the hand, or not frets at all). */
  missing: number;
  /** Total weight of unmatched candidates lying between the first and the last matched fret. */
  spurious: number;
  /** Root-mean-square residual of the inliers, as a fraction of the local fret spacing. */
  rms: number;
  /** Depth ratio (>= 1) between the two ends of the matched comb. */
  depthRatio: number;
  /** Inlier weight minus penalties for missing frets, spurious candidates and residual; higher is better. */
  score: number;
}

/** Normalised distance of fret m from fret 0 (in scale lengths). */
export function fretXNorm(m: number): number {
  return 1 - Math.pow(FRET_RATIO, m);
}

/** Position along the axis of (possibly fractional) relative fret index m under a fit. */
export function fretU(fit: Pick<FretFit, 'A' | 'B' | 'C'>, m: number): number {
  const x = fretXNorm(m);
  return (fit.A * x + fit.B) / (fit.C * x + 1);
}

/** Relative fret index (fractional) of a position along the axis; NaN beyond the model's range. */
export function fretIndexAt(fit: Pick<FretFit, 'A' | 'B' | 'C'>, u: number): number {
  const x = (u - fit.B) / (fit.A - fit.C * u);
  return x < 1 ? Math.log(1 - x) / Math.log(FRET_RATIO) : NaN;
}

interface Params {
  A: number;
  B: number;
  C: number;
}

interface Match {
  score: number;
  inliers: number;
  missing: number;
  spurious: number;
  rms: number;
  minIndex: number;
  maxIndex: number;
}

const MAX_INDEX = 40;
/** r^m for m = -MAX_INDEX - 1 .. MAX_INDEX + 1. */
const POW = new Float64Array(2 * MAX_INDEX + 3);
for (let m = -MAX_INDEX - 1; m <= MAX_INDEX + 1; m++) POW[m + MAX_INDEX + 1] = Math.pow(FRET_RATIO, m);

/**
 * Match sorted candidates to the predicted frets of a model. `assign[i]` receives the fret index of
 * candidate i or NO_INDEX. Returns null when the model leaves the believable range.
 */
const NO_INDEX = -1000;
function matchModel(us: Float64Array, ws: Float64Array, n: number, p: Params, tolFrac: number, tolPx: number, minSpacing: number, maxSpacing: number, assign: Int16Array): Match | null {
  for (let i = 0; i < n; i++) assign[i] = NO_INDEX;
  const uLo = us[0];
  const uHi = us[n - 1];
  let inliers = 0;
  let weight = 0;
  let sumSq = 0;
  let minIndex = MAX_INDEX;
  let maxIndex = -MAX_INDEX;
  // Walk outward from index 0 in both directions.
  for (let dir = 1; dir >= -1; dir -= 2) {
    let ptr = dir > 0 ? 0 : n - 1;
    let prev = NaN;
    for (let m = dir > 0 ? 0 : -1; m <= MAX_INDEX && m >= -MAX_INDEX; m += dir) {
      const x = 1 - POW[m + MAX_INDEX + 1];
      const wgt = p.C * x + 1;
      if (!(wgt > 1e-6)) break;
      const u = (p.A * x + p.B) / wgt;
      const xn = 1 - POW[m + MAX_INDEX + 2];
      const wn = p.C * xn + 1;
      if (!(wn > 1e-6)) break;
      const spacing = (p.A * xn + p.B) / wn - u;
      if (!(spacing > 0)) return null;
      if (dir > 0 && spacing < minSpacing * 0.6) break;
      if (dir < 0 && spacing > maxSpacing * 1.5) break;
      const tol = Math.max(tolPx, tolFrac * spacing);
      if (dir > 0 ? u > uHi + tol : u < uLo - tol) break;
      if (!Number.isNaN(prev) && Math.abs(u - prev) < 1e-9) break;
      prev = u;
      // Nearest candidate to u.
      if (dir > 0) {
        while (ptr < n - 1 && us[ptr + 1] <= u) ptr++;
        let best = ptr;
        if (ptr < n - 1 && Math.abs(us[ptr + 1] - u) < Math.abs(us[ptr] - u)) best = ptr + 1;
        const err = Math.abs(us[best] - u);
        if (err <= tol && assign[best] === NO_INDEX) {
          assign[best] = m;
          inliers++;
          weight += ws[best];
          sumSq += (err / spacing) * (err / spacing);
          if (m < minIndex) minIndex = m;
          if (m > maxIndex) maxIndex = m;
        }
      } else {
        while (ptr > 0 && us[ptr - 1] >= u) ptr--;
        let best = ptr;
        if (ptr > 0 && Math.abs(us[ptr - 1] - u) < Math.abs(us[ptr] - u)) best = ptr - 1;
        const err = Math.abs(us[best] - u);
        if (err <= tol && assign[best] === NO_INDEX) {
          assign[best] = m;
          inliers++;
          weight += ws[best];
          sumSq += (err / spacing) * (err / spacing);
          if (m < minIndex) minIndex = m;
          if (m > maxIndex) maxIndex = m;
        }
      }
    }
  }
  if (inliers === 0) return null;
  // Frets inside the matched span without a candidate, and candidates inside it that are not frets.
  let first = -1;
  let last = -1;
  for (let i = 0; i < n; i++) {
    if (assign[i] !== NO_INDEX) {
      if (first < 0) first = i;
      last = i;
    }
  }
  let spurious = 0;
  for (let i = first + 1; i < last; i++) if (assign[i] === NO_INDEX) spurious += Math.min(1, ws[i]);
  const missing = maxIndex - minIndex + 1 - inliers;
  const rms = Math.sqrt(sumSq / inliers);
  // A gap is cheap (hands hide frets) but not free, or every comb could be read as every other fret.
  return { score: weight - 0.25 * missing - 0.5 * spurious - 4 * rms, inliers, missing, spurious, rms, minIndex, maxIndex };
}

/** Weighted least squares for (A, B, C) on the matched candidates; null when degenerate. */
function refit(us: Float64Array, ws: Float64Array, n: number, assign: Int16Array): Params | null {
  // Normalise u to keep the 3x3 system well conditioned.
  let u0 = 0;
  let cnt = 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    if (assign[i] === NO_INDEX) continue;
    u0 += us[i];
    cnt++;
    if (us[i] < lo) lo = us[i];
    if (us[i] > hi) hi = us[i];
  }
  if (cnt < 3 || !(hi > lo)) return null;
  u0 /= cnt;
  const su = hi - lo;
  // Rows: [x, 1, -x v] . (a, b, c) = v with v = (u - u0) / su.
  let m00 = 0, m01 = 0, m02 = 0, m11 = 0, m12 = 0, m22 = 0, r0 = 0, r1 = 0, r2 = 0;
  for (let i = 0; i < n; i++) {
    if (assign[i] === NO_INDEX) continue;
    const x = 1 - Math.pow(FRET_RATIO, assign[i]);
    const v = (us[i] - u0) / su;
    const w = Math.max(0.2, Math.min(1.5, ws[i]));
    const c0 = x;
    const c2 = -x * v;
    m00 += w * c0 * c0;
    m01 += w * c0;
    m02 += w * c0 * c2;
    m11 += w;
    m12 += w * c2;
    m22 += w * c2 * c2;
    r0 += w * c0 * v;
    r1 += w * v;
    r2 += w * c2 * v;
  }
  const det = m00 * (m11 * m22 - m12 * m12) - m01 * (m01 * m22 - m12 * m02) + m02 * (m01 * m12 - m11 * m02);
  const scale = Math.max(m00, m11, m22);
  if (!(Math.abs(det) > 1e-12 * scale * scale * scale)) return null;
  const a = (r0 * (m11 * m22 - m12 * m12) - m01 * (r1 * m22 - m12 * r2) + m02 * (r1 * m12 - m11 * r2)) / det;
  const b = (m00 * (r1 * m22 - m12 * r2) - r0 * (m01 * m22 - m12 * m02) + m02 * (m01 * r2 - r1 * m02)) / det;
  const c = (m00 * (m11 * r2 - r1 * m12) - m01 * (m01 * r2 - r1 * m02) + r0 * (m01 * m12 - m11 * m02)) / det;
  // v = (a x + b) / (c x + 1)  ->  u = u0 + su v.
  return { A: su * a + u0 * c, B: su * b + u0, C: c };
}

/** Depth ratio (>= 1) between two axis positions under a model; Infinity when either is beyond the horizon. */
function depthRatio(p: Params, uA: number, uB: number): number {
  const xa = (uA - p.B) / (p.A - p.C * uA);
  const xb = (uB - p.B) / (p.A - p.C * uB);
  const wa = p.C * xa + 1;
  const wb = p.C * xb + 1;
  if (!(wa > 1e-6) || !(wb > 1e-6)) return Infinity;
  return wa > wb ? wa / wb : wb / wa;
}

/** The weight of the `keep`-th strongest candidate (at least 0.45): candidates below it do not start a seed. */
function seedWeightFloor(ws: Float64Array, n: number, keep: number): number {
  if (n <= keep) return 0.45;
  const sorted = Array.from(ws.subarray(0, n)).sort((a, b) => b - a);
  return Math.max(0.45, sorted[keep - 1]);
}

/** Convert a comb u~ = alpha + beta r^m in depth-rectified coordinates (see below) to the (A, B, C) form. */
function fromRectified(alpha: number, beta: number, kappa: number, uRef: number): Params {
  const d0 = 1 + kappa * alpha;
  const d1 = kappa * beta;
  const n0 = uRef * d0 + alpha;
  const n1 = beta * (uRef * kappa + 1);
  const den = d0 + d1;
  return { A: -n1 / den, B: (n0 + n1) / den, C: -d1 / den };
}

/**
 * Best comb with indices growing with u. The perspective is handled by an outer scan over the depth
 * ratio rho between the last and the first candidate: for a given rho the substitution
 * u~ = v / (1 - kappa v), v = u - u_first, kappa = (1 - 1/rho) / span undoes the foreshortening, and
 * what remains is a pure geometric comb u~ = alpha + beta r^m with two unknowns, which a single pair
 * of neighbouring candidates determines. Each seed is then grown by matching and refitting.
 */
function fitOneDirection(us: Float64Array, ws: Float64Array, n: number, o: Required<FretFitOptions>): { p: Params; match: Match; assign: Int16Array } | null {
  const assign = new Int16Array(n);
  const scratch = new Int16Array(n);
  const bestAssign = new Int16Array(n);
  const rect = new Float64Array(n);
  let best: Match | null = null;
  let bestP: Params | null = null;
  const uLo = us[0];
  const uHi = us[n - 1];
  const span = uHi - uLo;
  if (!(span > 0)) return null;
  const rhoMin = Math.max(0.2, o.depthRatio[0]);
  const rhoMax = Math.max(rhoMin, o.depthRatio[1]);
  const inRange = (p: Params): boolean => {
    const xa = (uLo - p.B) / (p.A - p.C * uLo);
    const xb = (uHi - p.B) / (p.A - p.C * uHi);
    const wa = p.C * xa + 1;
    const wb = p.C * xb + 1;
    if (!(wa > 1e-6) || !(wb > 1e-6)) return false;
    const rho = wb / wa;
    return rho >= rhoMin * 0.98 && rho <= rhoMax * 1.02;
  };
  const better = (m: Match, than: Match | null): boolean => !than || m.score > than.score + 1e-9 || (Math.abs(m.score - than.score) <= 1e-9 && m.rms < than.rms);

  const steps = Math.max(1, Math.ceil(Math.log(rhoMax / rhoMin) / Math.log(1.12)));
  // Seeds start at the strongest candidates only: one true pair of neighbouring wires is enough,
  // and the strong ridges are the wires.
  const seedFloor = seedWeightFloor(ws, n, 12);
  for (let s = 0; s <= steps; s++) {
    const rho = steps > 0 ? rhoMin * Math.pow(rhoMax / rhoMin, s / steps) : rhoMin;
    const kappa = (1 - 1 / rho) / span;
    for (let i = 0; i < n; i++) {
      const v = us[i] - uLo;
      rect[i] = v / (1 - kappa * v);
    }
    for (let i = 0; i < n - 1; i++) {
      // Faint candidates (dots, finger edges) do not seed a comb; they can still join one.
      if (ws[i] < seedFloor) continue;
      for (let j = i + 1; j <= i + 2 && j < n; j++) {
        if (ws[j] < 0.45) continue;
        const gap = us[j] - us[i];
        for (let d = 1; d <= 3; d++) {
          const spacing = gap / d;
          if (spacing < o.minSpacing || spacing > o.maxSpacing) continue;
          let beta = (rect[j] - rect[i]) / (Math.pow(FRET_RATIO, d) - 1);
          let alpha = rect[i] - beta;
          // Grow the seed: match loosely, refit the two parameters on the matches, match again.
          let grown: Match | null = null;
          let grownP: Params | null = null;
          for (let it = 0; it < 4; it++) {
            const p = fromRectified(alpha, beta, kappa, uLo);
            const m = matchModel(us, ws, n, p, o.tolerance * (it === 0 ? 1.6 : 1), o.minTolerancePx, o.minSpacing, o.maxSpacing, scratch);
            // A seed that does not even find two more wires nearby is not worth growing.
            if (!m || m.inliers < 4) break;
            if (it > 0 && grown && !better(m, grown)) break;
            if (it > 0) {
              grown = m;
              grownP = p;
              assign.set(scratch);
            }
            // Weighted linear regression of u~ on z = r^m over the matches.
            let sw = 0, sz = 0, su = 0, szz = 0, szu = 0;
            for (let k = 0; k < n; k++) {
              if (scratch[k] === NO_INDEX) continue;
              const z = POW[scratch[k] + MAX_INDEX + 1];
              const w = Math.max(0.2, Math.min(1.5, ws[k]));
              sw += w;
              sz += w * z;
              su += w * rect[k];
              szz += w * z * z;
              szu += w * z * rect[k];
            }
            const den = sw * szz - sz * sz;
            if (!(Math.abs(den) > 1e-12)) break;
            beta = (sw * szu - sz * su) / den;
            alpha = (su - beta * sz) / sw;
            if (!(beta < 0)) break;
          }
          if (grown && grownP && better(grown, best)) {
            best = grown;
            bestP = grownP;
            bestAssign.set(assign);
          }
        }
      }
    }
  }
  if (!best || !bestP) return null;
  // Polish all three parameters by least squares on the matches, as long as the depth ratio stays allowed.
  let p: Params = bestP;
  let match: Match = best;
  assign.set(bestAssign);
  for (let it = 0; it < 3; it++) {
    const q = refit(us, ws, n, assign);
    if (!q || !inRange(q)) break;
    const m = matchModel(us, ws, n, q, o.tolerance, o.minTolerancePx, o.minSpacing, o.maxSpacing, scratch);
    if (!m || m.score < match.score - 1e-9) break;
    const improved = m.score > match.score + 1e-9 || m.rms < match.rms - 1e-6;
    p = q;
    match = m;
    assign.set(scratch);
    if (!improved) break;
  }
  return { p, match, assign };
}

/**
 * Fit the fret pattern to candidates. Returns null when fewer than `minInliers` candidates agree
 * with any believable fret comb.
 */
export function fitFretPattern(candidates: readonly FretCandidate[], options: FretFitOptions = {}): FretFit | null {
  const o: Required<FretFitOptions> = {
    direction: options.direction ?? 0,
    tolerance: options.tolerance ?? 0.16,
    minTolerancePx: options.minTolerancePx ?? 1.2,
    depthRatio: options.depthRatio ?? [1 / 2.2, 2.2],
    minSpacing: options.minSpacing ?? 3,
    maxSpacing: options.maxSpacing ?? 120,
    minInliers: options.minInliers ?? 5,
  };
  const n = candidates.length;
  if (n < Math.max(3, o.minInliers)) return null;
  const order = candidates.map((_, i) => i).sort((a, b) => candidates[a].u - candidates[b].u);
  let result: FretFit | null = null;
  for (const dir of o.direction === 0 ? ([1, -1] as const) : ([o.direction] as const)) {
    // Direction -1 is fitted on the mirrored axis.
    const us = new Float64Array(n);
    const ws = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const c = candidates[order[dir > 0 ? k : n - 1 - k]];
      us[k] = dir * c.u;
      ws[k] = c.weight;
    }
    // On the mirrored axis the two ends swap, so the allowed depth ratio is inverted.
    const fit = fitOneDirection(us, ws, n, dir > 0 ? o : { ...o, depthRatio: [1 / o.depthRatio[1], 1 / o.depthRatio[0]] });
    if (!fit || fit.match.inliers < o.minInliers) continue;
    if (result && result.score >= fit.match.score) continue;
    const indices: (number | null)[] = new Array<number | null>(n).fill(null);
    for (let k = 0; k < n; k++) {
      const idx = fit.assign[k];
      if (idx !== NO_INDEX) indices[order[dir > 0 ? k : n - 1 - k]] = idx;
    }
    const p = { A: dir * fit.p.A, B: dir * fit.p.B, C: fit.p.C };
    result = {
      ...p,
      direction: dir,
      indices,
      inliers: fit.match.inliers,
      minIndex: fit.match.minIndex,
      maxIndex: fit.match.maxIndex,
      missing: fit.match.missing,
      spurious: fit.match.spurious,
      rms: fit.match.rms,
      depthRatio: depthRatio(p, fretU(p, fit.match.minIndex), fretU(p, fit.match.maxIndex)),
      score: fit.match.score,
    };
  }
  return result;
}

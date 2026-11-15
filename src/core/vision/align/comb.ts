/**
 * Stage 2 of detection: frets along a candidate axis.
 *
 * Along any line that runs down a neck, the fret wires show up as peaks of the thin-line response.
 * Their positions follow the 12-tone rule seen through a 1-D projective map:
 *
 *     s(j) = (A + B x_j) / (1 + C x_j),   x_j = 1 - 2^(-j/12)
 *
 * where j is a RELATIVE fret index (the rule is self-similar, so the absolute number cannot come
 * from spacing), B carries the scale and C the perspective along the neck. `findCombs` grows such
 * a "comb" from every pair of neighbouring peaks, one fret at a time, re-fitting as it goes and
 * predicting across gaps (a hand hides a few frets in a row), and returns the best ones.
 */
import { straightRidgeAt } from './features';
import { COARSE_SCALE, type GrayImage } from './image';

/** 2^(-1/12): ratio between consecutive fret spacings. */
export const FRET_RATIO = Math.pow(2, -1 / 12);

/** Relative fret coordinate of (possibly fractional or negative) index j, for a unit scale length. */
export function combX(j: number): number {
  return 1 - Math.pow(FRET_RATIO, j);
}

/** A 1-D response profile sampled along a line of the working frame. */
export interface LineProfile {
  /** Response at each sample (>= 0), one sample per pixel of line length. */
  values: Float32Array;
  count: number;
  /** Image position of sample 0 and the unit direction of the line. */
  x0: number;
  y0: number;
  ux: number;
  uy: number;
}

/** Clip the line through (px, py) with direction (ux, uy) to the image rectangle shrunk by `margin`. Null if it misses. */
export function clipLine(width: number, height: number, px: number, py: number, ux: number, uy: number, margin: number): { t0: number; t1: number } | null {
  let t0 = -Infinity;
  let t1 = Infinity;
  const lim = [margin, width - margin, margin, height - margin];
  if (Math.abs(ux) > 1e-9) {
    const a = (lim[0] - px) / ux;
    const b = (lim[1] - px) / ux;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  } else if (px < lim[0] || px > lim[1]) return null;
  if (Math.abs(uy) > 1e-9) {
    const a = (lim[2] - py) / uy;
    const b = (lim[3] - py) / uy;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  } else if (py < lim[2] || py > lim[3]) return null;
  return t1 > t0 ? { t0, t1 } : null;
}

/** How the fret normal turns along a line: degrees at sample 0 plus degrees per sample (perspective fans the frets). */
export interface NormalModel {
  deg0: number;
  slope: number;
}

/**
 * Thin-line response along a line, pooled over a short stretch of each (presumed) fret:
 * `polarity * ridge` across the fret normal, averaged over `halfBand` pixels to either side along
 * the fret, at two line widths (the fine and the coarse image). Negative responses count as zero.
 */
export function sampleLineProfile(
  fine: GrayImage,
  coarse: GrayImage,
  px: number,
  py: number,
  ux: number,
  uy: number,
  normal: NormalModel,
  polarity: number,
  halfBand: number,
  reuse?: LineProfile | null,
): LineProfile | null {
  const clip = clipLine(fine.width, fine.height, px, py, ux, uy, 4);
  if (!clip) return null;
  const count = Math.floor(clip.t1 - clip.t0) + 1;
  if (count < 24) return null;
  const values = reuse && reuse.values.length >= count ? reuse.values : new Float32Array(Math.max(count, 1024));
  const x0 = px + clip.t0 * ux;
  const y0 = py + clip.t0 * uy;
  const offsets = Math.max(1, Math.round(halfBand / 2));
  const inv = 1 / (2 * offsets + 1);
  for (let i = 0; i < count; i++) {
    const a = ((normal.deg0 + normal.slope * i) * Math.PI) / 180;
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    const cx = x0 + i * ux;
    const cy = y0 + i * uy;
    let sum = 0;
    for (let k = -offsets; k <= offsets; k++) {
      // Step along the fret (perpendicular to its normal).
      const qx = cx - ny * 2 * k;
      const qy = cy + nx * 2 * k;
      const r1 = polarity * straightRidgeAt(fine, qx, qy, nx, ny, 2);
      const r2 = polarity * straightRidgeAt(coarse, qx * COARSE_SCALE, qy * COARSE_SCALE, nx, ny, 2) * 0.8;
      const r = r1 > r2 ? r1 : r2;
      if (r > 0) sum += r;
    }
    values[i] = sum * inv;
  }
  return { values, count, x0, y0, ux, uy };
}

/** A local maximum of a profile. */
export interface ProfilePeak {
  /** Sub-sample position. */
  pos: number;
  /** Smoothed response at the peak. */
  strength: number;
}

/** Local maxima of a profile (lightly smoothed), with parabolic sub-sample positions, above a threshold relative to the strong ones. */
export function findPeaks(profile: LineProfile, minRelative = 0.18, floor = 0.35): ProfilePeak[] {
  const n = profile.count;
  const v = profile.values;
  const sm = new Float32Array(n);
  for (let i = 1; i < n - 1; i++) sm[i] = 0.25 * v[i - 1] + 0.5 * v[i] + 0.25 * v[i + 1];
  const raw: ProfilePeak[] = [];
  for (let i = 2; i < n - 2; i++) {
    const c = sm[i];
    if (c <= floor || c < sm[i - 1] || c <= sm[i + 1]) continue;
    const denom = sm[i - 1] - 2 * c + sm[i + 1];
    const off = denom < -1e-9 ? (0.5 * (sm[i - 1] - sm[i + 1])) / denom : 0;
    raw.push({ pos: i + Math.max(-0.5, Math.min(0.5, off)), strength: c });
  }
  if (raw.length === 0) return raw;
  // Reference level: the 5th strongest peak (a single glint must not set the bar).
  const sorted = raw.map((p) => p.strength).sort((a, b) => b - a);
  const ref = sorted[Math.min(sorted.length - 1, 4)];
  const thr = Math.max(floor, minRelative * ref);
  // Merge peaks closer than 3 samples (the two flanks of one wide wire): keep the stronger.
  const out: ProfilePeak[] = [];
  for (const p of raw) {
    if (p.strength < thr) continue;
    const last = out[out.length - 1];
    if (last && p.pos - last.pos < 3) {
      if (p.strength > last.strength) out[out.length - 1] = p;
    } else {
      out.push(p);
    }
  }
  return out;
}

/** A fret of a comb that was matched to a profile peak. */
export interface CombFret {
  /** Relative fret index (larger = toward the bridge). */
  j: number;
  /** Measured position along the profile, in samples. */
  pos: number;
  strength: number;
}

/** A fitted fret comb. Positions are along the profile; `dir` says which way the bridge is. */
export interface Comb {
  /** +1 when fret indices grow with the profile position, -1 when they grow against it. */
  dir: 1 | -1;
  /** s(j) = (A + B x_j) / (1 + C x_j) with s = dir * position. */
  A: number;
  B: number;
  C: number;
  /** Matched frets, ascending in j; the first has j = 0. */
  frets: CombFret[];
  /** Frets predicted between the first and last matched fret that found no peak. */
  misses: number;
  /** Length of the longest run of consecutive misses (a hand hides one run). */
  longestGap: number;
  /** Strong unexplained peaks between the first and last matched fret. */
  extras: number;
  /** RMS distance between matched peaks and the model, in samples. */
  rms: number;
  /** Matched frets minus penalties; comparable between combs of one profile. */
  score: number;
}

/** Position along the profile (in samples) of relative fret j under a comb. */
export function combPosition(comb: Pick<Comb, 'dir' | 'A' | 'B' | 'C'>, j: number): number {
  const x = combX(j);
  return (comb.dir * (comb.A + comb.B * x)) / (1 + comb.C * x);
}

/** Fractional relative fret index of a profile position under a comb (inverse of `combPosition`); NaN beyond the saddle. */
export function combIndexAt(comb: Pick<Comb, 'dir' | 'A' | 'B' | 'C'>, pos: number): number {
  const s = comb.dir * pos;
  const x = (s - comb.A) / (comb.B - comb.C * s);
  return x < 1 ? Math.log(1 - x) / Math.log(FRET_RATIO) : NaN;
}

const NORMAL = new Float64Array(9);
const RHS = new Float64Array(3);

interface Model {
  A: number;
  B: number;
  C: number;
}

/**
 * Least squares for (A, B, C) from s_i = A + B x_i - C x_i s_i, with a prior of weight `prior`
 * pulling the perspective term C toward `c0`. Returns false if the system is singular.
 */
function fitModel(xs: ArrayLike<number>, ss: ArrayLike<number>, n: number, prior: number, c0: number, out: Model): boolean {
  NORMAL.fill(0);
  RHS.fill(0);
  let scale = 0;
  for (let i = 0; i < n; i++) scale += Math.abs(xs[i] * ss[i]);
  scale = scale / n + 1e-9;
  for (let i = 0; i < n; i++) {
    const r1 = xs[i];
    const r2 = -xs[i] * ss[i];
    const s = ss[i];
    NORMAL[0] += 1;
    NORMAL[1] += r1;
    NORMAL[2] += r2;
    NORMAL[4] += r1 * r1;
    NORMAL[5] += r1 * r2;
    NORMAL[8] += r2 * r2;
    RHS[0] += s;
    RHS[1] += r1 * s;
    RHS[2] += r2 * s;
  }
  const pw = prior * prior * scale * scale * n;
  NORMAL[8] += pw;
  RHS[2] += pw * c0;
  NORMAL[3] = NORMAL[1];
  NORMAL[6] = NORMAL[2];
  NORMAL[7] = NORMAL[5];
  // Cramer's rule on the symmetric 3x3 system.
  const a = NORMAL;
  const det = a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);
  if (!(Math.abs(det) > 1e-12)) return false;
  const b0 = RHS[0];
  const b1 = RHS[1];
  const b2 = RHS[2];
  const A = (b0 * (a[4] * a[8] - a[5] * a[7]) - a[1] * (b1 * a[8] - a[5] * b2) + a[2] * (b1 * a[7] - a[4] * b2)) / det;
  const B = (a[0] * (b1 * a[8] - a[5] * b2) - b0 * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * b2 - b1 * a[6])) / det;
  const C = (a[0] * (a[4] * b2 - b1 * a[7]) - a[1] * (a[3] * b2 - b1 * a[6]) + b0 * (a[3] * a[7] - a[4] * a[6])) / det;
  if (!Number.isFinite(A + B + C)) return false;
  out.A = A;
  out.B = B;
  out.C = C;
  return true;
}

/** Options of `findCombs`. */
export interface CombOptions {
  /** Directions to try: +1 = fret numbers grow with position, -1 = against it. Default both. */
  directions?: readonly (1 | -1)[];
  /** Fret spacing limits in samples (default 4.5 .. 120). */
  minSpacing?: number;
  maxSpacing?: number;
  /** While growing, step across at most this many unseen frets in a row (default 1). */
  maxGap?: number;
  /** Merge two combs across at most this many hidden frets (default 8). */
  maxMergeGap?: number;
  /** A comb needs at least this many matched frets (default 5). */
  minFrets?: number;
  /** Return at most this many combs (default 2). */
  maxCombs?: number;
}

/** Most peaks of one profile that take part in the comb search. */
const MAX_PEAKS = 56;

/** Perspective values a seed pair is grown with (in the seed's own coordinates); see README. */
const SEED_PERSPECTIVE = [0, 0.45, -0.45, 0.95];

interface Member {
  peak: number;
  j: number;
}

/** Build a scored comb from members (peak index + relative fret index) and a model in the members' indexing. */
function buildComb(peaks: readonly ProfilePeak[], members: Member[], dir: 1 | -1, grown: Model): Comb {
  members.sort((p, q) => p.j - q.j);
  // With enough frets the perspective needs no prior: refit freely (the growth held it near its seed value).
  let model = grown;
  if (members.length >= 7) {
    const xs = members.map((m) => combX(m.j));
    const ss = members.map((m) => dir * peaks[m.peak].pos);
    const free: Model = { A: 0, B: 0, C: 0 };
    if (fitModel(xs, ss, members.length, 1e-3, grown.C, free) && free.B - free.C * free.A > 0 && Math.abs(free.C) < 3) model = free;
  }
  const strengths = members.map((m) => peaks[m.peak].strength).sort((p, q) => p - q);
  const median = strengths[strengths.length >> 1];
  const sFirst = dir * peaks[members[0].peak].pos;
  const sLast = dir * peaks[members[members.length - 1].peak].pos;
  const isMember = new Uint8Array(peaks.length);
  let quality = 0;
  let sq = 0;
  for (const m of members) {
    isMember[m.peak] = 1;
    quality += Math.min(1, peaks[m.peak].strength / median);
    const x = combX(m.j);
    const res = dir * peaks[m.peak].pos - (model.A + model.B * x) / (1 + model.C * x);
    sq += res * res;
  }
  let extras = 0;
  for (let i = 0; i < peaks.length; i++) {
    if (isMember[i]) continue;
    const s = dir * peaks[i].pos;
    if (s > sFirst && s < sLast && peaks[i].strength > 0.5 * median) extras++;
  }
  let misses = 0;
  let longest = 0;
  for (let k = 0; k + 1 < members.length; k++) {
    const gap = members[k + 1].j - members[k].j - 1;
    misses += gap;
    if (gap > longest) longest = gap;
  }
  // Re-base the indices so the first matched fret is j = 0: x_j = x_j0 + r^j0 * x_(j - j0).
  const j0 = members[0].j;
  const r = Math.pow(FRET_RATIO, j0);
  const den = 1 + model.C * combX(j0);
  return {
    dir,
    A: (model.A + model.B * combX(j0)) / den,
    B: (model.B * r) / den,
    C: (model.C * r) / den,
    frets: members.map((m) => ({ j: m.j - j0, pos: peaks[m.peak].pos, strength: peaks[m.peak].strength })),
    misses,
    longestGap: longest,
    extras,
    rms: Math.sqrt(sq / members.length),
    // One run of hidden frets is what a hand does and costs little; scattered misses mean the
    // spacing is wrong (a comb at half the true spacing misses every other fret).
    score: quality - 0.8 * extras - 0.25 * longest - 1.0 * (misses - longest),
  };
}

/**
 * Grow fret combs from every pair of neighbouring peaks and return the best (most matched frets,
 * fewest unexplained peaks), best first. Combs separated by a run of hidden frets are merged when
 * one model explains both.
 */
export function findCombs(allPeaks: readonly ProfilePeak[], length: number, options: CombOptions = {}): Comb[] {
  // A neck shows at most a couple of dozen wires; along a bookshelf a profile can have a hundred
  // peaks. Keep the strongest (in position order) so that clutter cannot make this stage slow.
  let peaks = allPeaks;
  if (allPeaks.length > MAX_PEAKS) {
    const cut = allPeaks.map((p) => p.strength).sort((a, b) => b - a)[MAX_PEAKS - 1];
    peaks = allPeaks.filter((p) => p.strength >= cut).slice(0, MAX_PEAKS);
  }
  const dirs = options.directions ?? [1, -1];
  const minSpacing = options.minSpacing ?? 4.5;
  const maxSpacing = options.maxSpacing ?? 120;
  const maxGap = options.maxGap ?? 1;
  const maxMergeGap = options.maxMergeGap ?? 8;
  const minFrets = options.minFrets ?? 5;
  const maxCombs = options.maxCombs ?? 2;
  const n = peaks.length;
  if (n < Math.min(minFrets, 4)) return [];
  const xs = new Float64Array(n);
  const ss = new Float64Array(n);
  const model: Model = { A: 0, B: 0, C: 0 };
  const assignedJ = new Int32Array(n);
  const NONE = -100000;
  const x1 = combX(1);
  const all: { comb: Comb; members: Member[]; model: Model }[] = [];

  for (const dir of dirs) {
    // s = dir * pos is ascending along the neck toward the bridge.
    const sOf = (i: number): number => dir * peaks[i].pos;
    const order: number[] = [];
    for (let i = 0; i < n; i++) order.push(dir > 0 ? i : n - 1 - i);
    const sLo = dir > 0 ? 0 : -(length - 1);
    const sHi = dir > 0 ? length - 1 : 0;
    const seen = new Set<number>();
    const grown: { comb: Comb; members: Member[]; model: Model }[] = [];
    for (let a = 0; a < n - 1; a++) {
      for (let skip = 1; skip <= 2 && a + skip < n; skip++) {
        const i0 = order[a];
        const i1 = order[a + skip];
        if (seen.has(i0 * 1024 + i1)) continue;
        const q = sOf(i1) - sOf(i0);
        if (q < minSpacing || q > maxSpacing) continue;
        let bestHere: { comb: Comb; members: Member[]; model: Model } | null = null;
        for (const c0 of SEED_PERSPECTIVE) {
          // Start: the two peaks are frets 0 and 1 seen with perspective c0.
          assignedJ.fill(NONE);
          assignedJ[i0] = 0;
          assignedJ[i1] = 1;
          model.A = sOf(i0);
          model.C = c0;
          model.B = (sOf(i1) * (1 + c0 * x1) - model.A) / x1;
          let lo = 0;
          let hi = 1;
          let count = 2;
          let missLo = 0;
          let missHi = 0;
          const predict = (j: number): number => {
            const x = combX(j);
            return (model.A + model.B * x) / (1 + model.C * x);
          };
          const refit = (): void => {
            let m = 0;
            for (let i = 0; i < n; i++) {
              if (assignedJ[i] === NONE) continue;
              xs[m] = combX(assignedJ[i]);
              ss[m] = sOf(i);
              m++;
            }
            // Few frets cannot tell perspective from noise: hold C at the seed's value, then release it.
            const prior = count <= 4 ? 1e4 : count <= 6 ? 0.5 : count <= 9 ? 0.15 : 0.04;
            const a0 = model.A;
            const b0 = model.B;
            const cc = model.C;
            if (!fitModel(xs, ss, m, prior, c0, model) || !(model.B - model.C * model.A > 0)) {
              model.A = a0;
              model.B = b0;
              model.C = cc;
            }
          };
          const tryExtend = (j: number, toward: 1 | -1): boolean | null => {
            const sp = predict(j);
            const neighbour = predict(j - toward);
            const spacing = (sp - neighbour) * toward;
            if (!Number.isFinite(sp) || spacing < minSpacing * 0.8 || spacing > maxSpacing * 1.3) return null;
            if (sp < sLo - 0.5 || sp > sHi + 0.5) return null;
            const tol = (count < 5 ? 0.22 : 0.16) * spacing + 0.6;
            // Nearest free peak within the tolerance: the peaks are sorted by position, so bisect and look around.
            const target = dir * sp;
            let lo2 = 0;
            let hi2 = n - 1;
            while (lo2 < hi2) {
              const mid = (lo2 + hi2) >> 1;
              if (peaks[mid].pos < target) lo2 = mid + 1;
              else hi2 = mid;
            }
            let best = -1;
            let bestD = tol;
            for (let i = lo2; i < n && peaks[i].pos - target < bestD; i++) {
              if (assignedJ[i] !== NONE) continue;
              const dd = Math.abs(peaks[i].pos - target);
              if (dd < bestD) {
                bestD = dd;
                best = i;
              }
            }
            for (let i = lo2 - 1; i >= 0 && target - peaks[i].pos < bestD; i--) {
              if (assignedJ[i] !== NONE) continue;
              const dd = Math.abs(peaks[i].pos - target);
              if (dd < bestD) {
                bestD = dd;
                best = i;
              }
            }
            if (best < 0) return false;
            assignedJ[best] = j;
            count++;
            refit();
            return true;
          };
          let openLo = true;
          let openHi = true;
          while (openLo || openHi) {
            if (openHi) {
              const r = tryExtend(hi + 1 + missHi, 1);
              if (r === null) openHi = false;
              else if (r) {
                hi = hi + 1 + missHi;
                missHi = 0;
              } else if (++missHi > maxGap) openHi = false;
            }
            if (openLo) {
              const r = tryExtend(lo - 1 - missLo, -1);
              if (r === null) openLo = false;
              else if (r) {
                lo = lo - 1 - missLo;
                missLo = 0;
              } else if (++missLo > maxGap) openLo = false;
            }
          }
          if (count < 4) continue;
          const members: Member[] = [];
          for (let i = 0; i < n; i++) if (assignedJ[i] !== NONE) members.push({ peak: i, j: assignedJ[i] });
          const comb = buildComb(peaks, members, dir, model);
          if (!bestHere || comb.score > bestHere.comb.score) bestHere = { comb, members, model: { ...model } };
        }
        if (!bestHere) continue;
        // A long clean comb explains its neighbouring pairs: no need to grow the same comb from each of them.
        // (A short or dubious one must not block better seeds.)
        const ms = bestHere.members;
        if (ms.length >= 7 && bestHere.comb.extras === 0 && bestHere.comb.rms < 0.7) {
          for (let k = 0; k + 1 < ms.length; k++) if (ms[k + 1].j === ms[k].j + 1) seen.add(ms[k].peak * 1024 + ms[k + 1].peak);
        }
        grown.push(bestHere);
      }
    }
    // Merge combs that lie on either side of a run of hidden frets (twice: a merged comb may meet a third group).
    for (let round = 0; round < 2; round++) {
      grown.sort((p, q) => q.comb.score - p.comb.score);
      const top = grown.slice(0, 8);
      const added: typeof grown = [];
      for (let a = 0; a < top.length; a++) {
        for (let b = 0; b < top.length; b++) {
          if (a === b) continue;
          const P = top[a];
          const Q = top[b];
          const pEnd = P.comb.frets[P.comb.frets.length - 1];
          if (!(dir * Q.comb.frets[0].pos > dir * pEnd.pos)) continue;
          // Where does Q start in P's indexing? Try the nearest whole frets.
          const jf = combIndexAt(P.comb, Q.comb.frets[0].pos);
          if (!Number.isFinite(jf)) continue;
          const gap = Math.round(jf) - pEnd.j - 1;
          if (gap < 0 || gap > maxMergeGap) continue;
          let bestMerge: { members: Member[]; model: Model; rel: number } | null = null;
          for (let dm = -1; dm <= 1; dm++) {
            const shift = Math.round(jf) + dm;
            if (shift <= pEnd.j) continue;
            // P.members are in the seed's indexing; rebuild both in P's re-based indexing.
            const members: Member[] = [];
            const pBase = P.members[0].j;
            const qBase = Q.members[0].j;
            for (const m of P.members) members.push({ peak: m.peak, j: m.j - pBase });
            for (const m of Q.members) members.push({ peak: m.peak, j: m.j - qBase + shift });
            for (let i = 0; i < members.length; i++) {
              xs[i] = combX(members[i].j);
              ss[i] = sOf(members[i].peak);
            }
            const merged: Model = { A: 0, B: 0, C: 0 };
            if (!fitModel(xs, ss, members.length, 0.03, P.comb.C, merged) || !(merged.B - merged.C * merged.A > 0)) continue;
            // Residuals relative to the local spacing. One member may be off (the nut reads as a fat
            // line centred a few millimetres behind where a fret would be): judge by the second worst.
            let worst = 0;
            let second = 0;
            for (const m of members) {
              const x = combX(m.j);
              const xn = combX(m.j + 1);
              const sp = (merged.A + merged.B * x) / (1 + merged.C * x);
              const sn = (merged.A + merged.B * xn) / (1 + merged.C * xn);
              const rel = Math.abs(sOf(m.peak) - sp) / (Math.abs(sn - sp) + 3);
              if (rel > worst) {
                second = worst;
                worst = rel;
              } else if (rel > second) second = rel;
            }
            if (second < 0.1 && worst < 0.3 && (!bestMerge || second < bestMerge.rel)) bestMerge = { members, model: merged, rel: second };
          }
          if (bestMerge) added.push({ comb: buildComb(peaks, bestMerge.members, dir, bestMerge.model), members: bestMerge.members, model: bestMerge.model });
        }
      }
      if (added.length === 0) break;
      for (const g of added) grown.push(g);
    }
    for (const g of grown) all.push(g);
  }
  const combs = all.map((g) => g.comb).filter((c) => c.frets.length >= minFrets);
  combs.sort((a, b) => b.score - a.score);
  // Drop combs that share most of their peaks with a better one in the same direction, unless
  // they fit their peaks much more tightly: a long comb that swallowed a stretch of non-frets
  // (block inlays read as fat bright lines) scores higher than the clean shorter comb inside it,
  // and only the pose score can tell which is the board.
  const kept: Comb[] = [];
  for (const c of combs) {
    let duplicate = false;
    for (const k of kept) {
      if (k.dir !== c.dir) continue;
      let shared = 0;
      for (const f of c.frets) if (k.frets.some((g) => g.pos === f.pos)) shared++;
      if (shared < 0.6 * c.frets.length) continue;
      const cleaner = c.rms < 0.6 * k.rms && c.misses + c.extras <= k.misses + k.extras && shared < c.frets.length;
      const alreadyHaveCleaner = kept.some((o) => o !== k && o.dir === c.dir && o.rms < 0.6 * k.rms);
      if (!cleaner || alreadyHaveCleaner) {
        duplicate = true;
        break;
      }
    }
    if (!duplicate) kept.push(c);
    if (kept.length >= maxCombs) break;
  }
  return kept;
}

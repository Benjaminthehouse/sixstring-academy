/**
 * Does the board in view carry as many strings as the neck model says?
 *
 * The fret comb cannot tell: a 7-string or a 4-string bass has the same wire spacing as a guitar
 * (a bass is a guitar scaled up, which a homography absorbs), so a tracker told "six strings"
 * locks onto a 7-string neck with every fret right and every note marker between two strings
 * (measured on the alt bench: confident locks with 0% of the frames right). This reader looks at
 * the strings themselves: it averages brightness profiles across the board at several cells
 * (normalised to the board width, so the fan of the strings lines up), and scores combs of
 * n = model - 2 .. model + 2 evenly spaced ridges against it. A comb of the wrong count either
 * misses the inner strings or lands between them, so the right count stands out wherever the
 * strings are resolved at all; where they are not, every score is low and nothing is claimed.
 */
import { applyHomography, boardWidthAt, fretX, stringSpanAt } from './geometry';
import type { Frame, FretboardPose } from './types';

/** What `readStringCount` found. */
export interface StringCountReading {
  /** String count of the model the pose was read with. */
  model: number;
  /** String count whose comb explains the profile best. */
  best: number;
  /** Normalised correlation (0..1) of the ridge profile with a comb of the model's count and of the best count. */
  modelScore: number;
  bestScore: number;
  /** Robust spread of the ridge profile (gray levels): how much there is to see at all. */
  noise: number;
  /** Cross-sections averaged. */
  samples: number;
}

const BINS = 96;
const PROFILE = new Float64Array(BINS);
const RIDGE = new Float64Array(BINS);
/** Where in a cell the cross-sections are taken: clear of the wires and of a centre inlay. */
const CELL_FRACTIONS = [0.2, 0.32, 0.68, 0.8];

function luminance(frame: Frame, x: number, y: number): number {
  const w = frame.width;
  const h = frame.height;
  const fx = x - 0.5;
  const fy = y - 0.5;
  if (!(fx >= 0 && fy >= 0 && fx < w - 1 && fy < h - 1)) return NaN;
  const x0 = fx | 0;
  const y0 = fy | 0;
  const ax = fx - x0;
  const ay = fy - y0;
  const d = frame.data;
  const i = (y0 * w + x0) * 4;
  const j = i + w * 4;
  const l = (k: number): number => d[k] * 0.299 + d[k + 1] * 0.587 + d[k + 2] * 0.114;
  const top = l(i) + (l(i + 4) - l(i)) * ax;
  const bottom = l(j) + (l(j + 4) - l(j)) * ax;
  return top + (bottom - top) * ay;
}

function at(a: Float64Array, p: number): number {
  if (!(p >= 0 && p <= BINS - 1)) return NaN;
  const i = Math.min(BINS - 2, Math.floor(p));
  const t = p - i;
  return a[i] + (a[i + 1] - a[i]) * t;
}

/**
 * Read the string count of the board under `pose` in `frame` (pixels of that frame). Null when too
 * little of the board is in view or the strings are too close together in the picture to resolve.
 */
export function readStringCount(frame: Frame, pose: FretboardPose): StringCountReading | null {
  const m = pose.model;
  const sx = frame.width / pose.frameWidth;
  const sy = frame.height / pose.frameHeight;
  const v = pose.visibleFrets;
  if (v.max - v.min < 3 || m.stringCount < 3) return null;
  const lo = Math.max(1, v.min + 1);
  const hi = Math.min(m.fretCount, v.max);
  const cells: number[] = [];
  const want = 10;
  for (let k = 0; k < want; k++) {
    const c = Math.round(lo + ((hi - lo) * (k + 0.5)) / want);
    if (!cells.includes(c)) cells.push(c);
  }
  PROFILE.fill(0);
  const counts = new Float64Array(BINS);
  let samples = 0;
  const ratioAt = (x: number): number => stringSpanAt(m, x) / boardWidthAt(m, x);
  let ratioSum = 0;
  for (const c of cells) {
    const x0 = fretX(m, c - 1);
    const x1 = fretX(m, c);
    for (const f of CELL_FRACTIONS) {
      const x = x0 + f * (x1 - x0);
      const half = boardWidthAt(m, x) / 2;
      const yc = m.nutWidth / 2;
      const a = applyHomography(pose.H, x, yc - half);
      const b = applyHomography(pose.H, x, yc + half);
      const across = Math.hypot((b.x - a.x) * sx, (b.y - a.y) * sy);
      // The strings must be at least ~4 px apart to be told apart.
      if (!(across / (m.stringCount + 1) >= 4)) continue;
      let ok = 0;
      for (let i = 0; i < BINS; i++) {
        const eta = -1 + (2 * (i + 0.5)) / BINS;
        const p = applyHomography(pose.H, x, yc + eta * half);
        const g = luminance(frame, p.x * sx, p.y * sy);
        if (!Number.isFinite(g)) continue;
        PROFILE[i] += g;
        counts[i]++;
        ok++;
      }
      if (ok > BINS * 0.8) {
        samples++;
        ratioSum += ratioAt(x);
      }
    }
  }
  if (samples < 6) return null;
  for (let i = 0; i < BINS; i++) PROFILE[i] = counts[i] > 0 ? PROFILE[i] / counts[i] : NaN;
  const ratio = ratioSum / samples;
  // Ridge response at about a quarter of the narrowest string spacing tried.
  const nMax = m.stringCount + 2;
  const binsPerEta = BINS / 2;
  const d = Math.max(1, Math.round(((2 * ratio) / (nMax - 1)) * binsPerEta * 0.25));
  const abs: number[] = [];
  for (let i = 0; i < BINS; i++) {
    const r = i - d >= 0 && i + d < BINS ? PROFILE[i] - (PROFILE[i - d] + PROFILE[i + d]) / 2 : NaN;
    RIDGE[i] = Number.isFinite(r) ? r : 0;
    if (Number.isFinite(r)) abs.push(Math.abs(r));
  }
  abs.sort((p, q) => p - q);
  const noise = abs.length ? abs[abs.length >> 1] / 0.6745 : 0;
  const centre = (BINS - 1) / 2;
  const sigma = 1.2;
  // Normalised cross-correlation of the ridge profile with a comb of n Gaussian ridges, over the
  // strings' own window (the outer strings plus a third of a spacing): a comb with ridges where
  // there are none, or one that leaves ridges unexplained, correlates poorly whatever its count.
  const scoreFor = (n: number): number => {
    let best = -Infinity;
    const spacing = ((2 * ratio) / (n - 1)) * binsPerEta;
    for (let s = 0.88; s <= 1.1501; s += 0.03) {
      const sp = spacing * s;
      const half = ((n - 1) / 2) * sp;
      for (let shift = -0.3; shift <= 0.3001; shift += 0.075) {
        const p0 = centre + shift * sp - half;
        const w0 = Math.max(d, Math.ceil(p0 - 0.35 * sp));
        const w1 = Math.min(BINS - 1 - d, Math.floor(p0 + 2 * half + 0.35 * sp));
        const N = w1 - w0 + 1;
        if (N < 8) continue;
        let sr = 0;
        let srr = 0;
        let st = 0;
        let stt = 0;
        let srt = 0;
        for (let i = w0; i <= w1; i++) {
          const k = Math.max(0, Math.min(n - 1, Math.round((i - p0) / sp)));
          const e = (i - (p0 + k * sp)) / sigma;
          const t = Math.exp(-0.5 * e * e);
          const r = RIDGE[i];
          sr += r;
          srr += r * r;
          st += t;
          stt += t * t;
          srt += r * t;
        }
        const vr = srr - (sr * sr) / N;
        const vt = stt - (st * st) / N;
        if (!(vr > 1e-9 && vt > 1e-9)) continue;
        const ncc = (srt - (sr * st) / N) / Math.sqrt(vr * vt);
        // Strings may be brighter or darker than the board: either sign of a clean comb counts.
        const score = Math.abs(ncc);
        if (score > best) best = score;
      }
    }
    return best;
  };
  let best = m.stringCount;
  let bestScore = -Infinity;
  let modelScore = -Infinity;
  for (let n = Math.max(3, m.stringCount - 2); n <= m.stringCount + 2; n++) {
    const sc = scoreFor(n);
    if (n === m.stringCount) modelScore = sc;
    if (sc > bestScore) {
      bestScore = sc;
      best = n;
    }
  }
  return { model: m.stringCount, best, modelScore, bestScore, noise, samples };
}

/**
 * Evidence (one frame) that the model has the wrong string count: the lead of another count's
 * correlation over the model's, when that comb is clean; 0 when nothing can be said.
 */
export function stringCountDoubt(r: StringCountReading | null): number {
  if (!r || r.best === r.model || !(r.noise >= 1)) return 0;
  const lead = r.bestScore - Math.max(0, r.modelScore);
  return r.bestScore >= 0.6 && lead >= 0.3 ? Math.min(1, lead) : 0;
}

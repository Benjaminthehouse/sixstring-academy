/**
 * Coarse motion of the board between two frames, for coasting through motion blur.
 *
 * When the guitar moves fast the fret wires smear into soft bars and neither tracker has thin lines
 * to hold on to, yet the board is plainly still there. This module follows it without thresholds:
 * the board is resampled through the last pose into two brightness profiles, one along the neck
 * (averaged across the board: every wire, inlay and finger is a bump, however blurred) and one
 * across it (averaged along the neck: the strings and both edges). The same profiles taken from the
 * next frame through the same pose are slid against them; the best normalised correlation, refined
 * to a fraction of a pixel, is how far the picture of the board moved. Fret spacing is not
 * periodic, so the slide along the neck has one clear optimum.
 *
 * It only shifts the pose in the image and it drifts, so it is no substitute for the
 * trackers; but a dozen blurred frames later the pose is still within a fraction of a fret of the
 * truth, the trackers pick the board up where it is, and the fret numbers survive.
 */
import { applyHomography, boardEdgeY, fretX, invertHomography } from './geometry';
import type { FretRange, Mat3, NeckModel } from './types';


/** Brightness profiles of the board through a pose. */
export interface BoardProfiles {
  /** Mean brightness across the board at one-pixel steps along the neck's axis in the image. */
  along: Float32Array;
  /** Mean brightness along the neck at one-pixel steps across it, for the nut-side and the bridge-side half of the stretch. */
  acrossNear: Float32Array;
  acrossFar: Float32Array;
  /** Samples before and after the compared stretch of each profile (the room for sliding). */
  padAlong: number;
  padAcross: number;
  /** Image point of sample `padAlong` of `along` (on the board's centre line) and the unit direction of the axis. */
  origin: { x: number; y: number };
  axis: { x: number; y: number };
  /** Number of samples of the compared stretch along the neck. */
  length: number;
}

/** Plain gray image the profiles are sampled from. */
export interface FlowImage {
  data: Float32Array;
  width: number;
  height: number;
}

function sample(img: FlowImage, x: number, y: number): number {
  const w = img.width;
  const h = img.height;
  const fx = x - 0.5;
  const fy = y - 0.5;
  if (!(fx >= 0 && fy >= 0 && fx <= w - 1.001 && fy <= h - 1.001)) return NaN;
  const ix = fx | 0;
  const iy = fy | 0;
  const ax = fx - ix;
  const ay = fy - iy;
  const o = iy * w + ix;
  const d = img.data;
  return (d[o] * (1 - ax) + d[o + 1] * ax) * (1 - ay) + (d[o + w] * (1 - ax) + d[o + w + 1] * ax) * ay;
}

/** Longest slide searched per frame, in pixels along and across the neck. */
const REACH_ALONG_PX = 30;
const REACH_ACROSS_PX = 10;
/** Rows across the board that the profile along the neck is averaged over. */
const ROWS = 12;
/** Columns along the neck that the profile across it is averaged over. */
const COLS = 24;
/** Half-width in samples of the moving average removed from the profile along the neck (about one wide fret cell). */
const DETREND_ALONG = 24;
/** Correlation of the plain profiles above which the softened ones are not consulted. */
const SHARP_PEAK = 0.85;
/** Half-width in samples of the moving average that softens the profile along the neck (about half a typical motion blur). */
const SOFTEN_ALONG = 3;
/** How far beyond the board edges the profile across the neck reaches, in board widths. */
const BEYOND = 0.35;

/**
 * Sample the profiles of the visible board through `H` (neck mm -> pixels of `img`). The samples
 * are evenly spaced in the IMAGE (a moving guitar shifts the picture of its neck, it does not slide
 * the neck within its own plane), and the board's own geometry only decides which pixels belong to
 * each sample. Returns null when too little of the board is in the frame.
 */
export function boardProfiles(img: FlowImage, H: Mat3, model: NeckModel, visible: FretRange): BoardProfiles | null {
  if (visible.max - visible.min < 3) return null;
  const inv = invertHomography(H);
  if (!inv) return null;
  const yc = model.nutWidth / 2;
  const xa = fretX(model, visible.min);
  const xb = fretX(model, visible.max);
  const pa = applyHomography(H, xa, yc);
  const pb = applyHomography(H, xb, yc);
  const lengthPx = Math.hypot(pb.x - pa.x, pb.y - pa.y);
  if (!(lengthPx > 40)) return null;
  const axis = { x: (pb.x - pa.x) / lengthPx, y: (pb.y - pa.y) / lengthPx };
  const length = Math.round(lengthPx);
  const padAlong = REACH_ALONG_PX;
  const along = new Float32Array(length + 2 * padAlong);
  let valid = 0;
  for (let i = 0; i < along.length; i++) {
    const px = pa.x + (i - padAlong) * axis.x;
    const py = pa.y + (i - padAlong) * axis.y;
    // Which wire-parallel line of the board passes through this pixel of the centre line.
    const plane = applyHomography(inv, px, py);
    const xe = Math.max(0, plane.x);
    const yb = boardEdgeY(model, xe, 'bass');
    const yt = boardEdgeY(model, xe, 'treble');
    let sum = 0;
    let n = 0;
    for (let r = 0; r < ROWS; r++) {
      const q = applyHomography(H, plane.x, yb + (yt - yb) * (0.1 + (0.8 * (r + 0.5)) / ROWS));
      const v = sample(img, q.x, q.y);
      if (v === v) {
        sum += v;
        n++;
      }
    }
    along[i] = n >= ROWS / 2 ? sum / n : NaN;
    if (n >= ROWS / 2) valid++;
  }
  if (valid < 0.5 * along.length) return null;
  // Across the neck: lines parallel to the axis, one pixel apart, averaged over the stretch.
  const xm = (xa + xb) / 2;
  const top = applyHomography(H, xm, boardEdgeY(model, xm, 'bass'));
  const bottom = applyHomography(H, xm, boardEdgeY(model, xm, 'treble'));
  const widthPx = Math.hypot(top.x - bottom.x, top.y - bottom.y);
  if (!(widthPx > 8)) return null;
  const normal = { x: -axis.y, y: axis.x };
  const half = Math.ceil(widthPx * (0.5 + BEYOND));
  const padAcross = REACH_ACROSS_PX;
  const count = 2 * half + 1 + 2 * padAcross;
  const acrossNear = new Float32Array(count);
  const acrossFar = new Float32Array(count);
  const centre = count >> 1;
  for (let part = 0; part < 2; part++) {
    const out = part === 0 ? acrossNear : acrossFar;
    for (let j = 0; j < count; j++) {
      const off = j - centre;
      let sum = 0;
      let n = 0;
      for (let c = 0; c < COLS; c++) {
        const t = (length * (part + (c + 0.5) / COLS)) / 2;
        const v = sample(img, pa.x + t * axis.x + off * normal.x, pa.y + t * axis.y + off * normal.y);
        if (v === v) {
          sum += v;
          n++;
        }
      }
      out[j] = n >= COLS / 2 ? sum / n : NaN;
    }
  }
  return { along, acrossNear, acrossFar, padAlong, padAcross, origin: pa, axis, length };
}

/**
 * Band-pass of a profile: its moving average over +-`fine` samples minus the one over +-`half`
 * samples. The wide average takes out lighting that stays put in the image (it must not vote for
 * "nothing moved"); the narrow one brings a sharp frame and a motion-blurred one to the same
 * softness, so that they still correlate.
 */
function bandPass(p: Float32Array, half: number, fine: number): Float32Array {
  const n = p.length;
  const out = new Float32Array(n);
  const prefix = new Float64Array(n + 1);
  const count = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) {
    const ok = p[i] === p[i];
    prefix[i + 1] = prefix[i] + (ok ? p[i] : 0);
    count[i + 1] = count[i] + (ok ? 1 : 0);
  }
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n, i + half + 1);
    const m = count[hi] - count[lo];
    const lo2 = Math.max(0, i - fine);
    const hi2 = Math.min(n, i + fine + 1);
    const m2 = count[hi2] - count[lo2];
    out[i] = p[i] === p[i] && m > 0 && m2 > 0 ? (prefix[hi2] - prefix[lo2]) / m2 - (prefix[hi] - prefix[lo]) / m : NaN;
  }
  return out;
}

/**
 * Best slide of profile `b` against profile `a` within +-pad samples: the shift s (samples, with a
 * fraction) that maximises the normalised correlation of a[i] with b[i + s] over the middle stretch.
 */
function slide(a: Float32Array, b: Float32Array, pad: number, from = pad, to = a.length - pad): { shift: number; peak: number; second: number } | null {
  const n = a.length;
  if (b.length !== n || to - from < 2 * pad + 8 || from < pad || to > n - pad) return null;
  const scores = new Float32Array(2 * pad + 1);
  let best = -Infinity;
  let bestAt = 0;
  for (let s = -pad; s <= pad; s++) {
    let sa = 0;
    let sb = 0;
    let saa = 0;
    let sbb = 0;
    let sab = 0;
    let m = 0;
    for (let i = from; i < to; i++) {
      const va = a[i];
      const vb = b[i + s];
      if (va !== va || vb !== vb) continue;
      sa += va;
      sb += vb;
      saa += va * va;
      sbb += vb * vb;
      sab += va * vb;
      m++;
    }
    let score = -1;
    if (m >= 0.6 * (to - from)) {
      const cov = sab - (sa * sb) / m;
      const var1 = saa - (sa * sa) / m;
      const var2 = sbb - (sb * sb) / m;
      score = var1 > 1e-6 && var2 > 1e-6 ? cov / Math.sqrt(var1 * var2) : -1;
    }
    scores[s + pad] = score;
    if (score > best) {
      best = score;
      bestAt = s + pad;
    }
  }
  if (!(best > -1)) return null;
  let frac = 0;
  if (bestAt > 0 && bestAt < 2 * pad) {
    const denom = scores[bestAt - 1] - 2 * best + scores[bestAt + 1];
    if (denom < -1e-9) frac = Math.max(-0.5, Math.min(0.5, (0.5 * (scores[bestAt - 1] - scores[bestAt + 1])) / denom));
  }
  // The best score at least a few samples away from the peak: how distinct the peak is.
  let second = -1;
  for (let k = 0; k < scores.length; k++) if (Math.abs(k - bestAt) > 4 && scores[k] > second) second = scores[k];
  return { shift: bestAt - pad + frac, peak: best, second };
}

/** How the picture of the board moved between two frames. */
export interface BoardShift {
  /** Image-to-image map (pixels of the earlier frame -> pixels of the later one) for points on the board: apply it on the left of the pose. */
  map: Mat3;
  /** Shift of the middle of the board in pixels. */
  dx: number;
  dy: number;
  /** Normalised correlation at the best slide along the neck, -1..1, and the best one elsewhere. */
  peak: number;
  second: number;
}

/**
 * Compare the profiles of an earlier frame with those of the current frame, both sampled through
 * the same (earlier) pose, and return how the picture of the board moved: a shift across the neck
 * and, along it, a shift that may differ between the two halves of the board (a neck seen at an
 * angle moves more pixels at its near end than at its far end).
 */
export function boardShift(before: BoardProfiles, after: BoardProfiles): BoardShift | null {
  const pad = before.padAlong;
  // The plain profiles place the board most precisely; softened ones still match when one frame is
  // sharp and the next smeared. Measure on the plain ones unless only the softened ones correlate.
  let a0 = bandPass(before.along, DETREND_ALONG, 0);
  let a1 = bandPass(after.along, DETREND_ALONG, 0);
  let whole = slide(a0, a1, pad);
  if (!whole || whole.peak < SHARP_PEAK) {
    const b0 = bandPass(before.along, DETREND_ALONG, SOFTEN_ALONG);
    const b1 = bandPass(after.along, DETREND_ALONG, SOFTEN_ALONG);
    const soft = slide(b0, b1, pad);
    if (soft && (!whole || soft.peak > whole.peak)) {
      whole = soft;
      a0 = b0;
      a1 = b1;
    }
  }
  if (!whole) return null;
  const L = before.length;
  let s0 = whole.shift;
  let s1 = 0;
  if (L >= 6 * pad) {
    const mid = pad + (L >> 1);
    const near = slide(a0, a1, pad, pad, mid);
    const far = slide(a0, a1, pad, mid, pad + L);
    // Two halves that each found a clear peak near the whole board's: let the shift vary linearly along the neck.
    if (near && far && near.peak > 0.6 && far.peak > 0.6 && Math.abs(near.shift - whole.shift) < 4 && Math.abs(far.shift - whole.shift) < 4) {
      s1 = (far.shift - near.shift) / (L / 2);
      s0 = near.shift - s1 * (L / 4);
    }
  }
  // Across the neck the two halves are measured separately too: together they give a shift and a turn.
  const cn = slide(before.acrossNear, after.acrossNear, before.padAcross);
  const cf = slide(before.acrossFar, after.acrossFar, before.padAcross);
  let c0 = 0;
  let c1 = 0;
  const nearOk = cn !== null && cn.peak > 0.5;
  const farOk = cf !== null && cf.peak > 0.5;
  if (nearOk && farOk && cn && cf) {
    c1 = (cf.shift - cn.shift) / (L / 2);
    c0 = cn.shift - c1 * (L / 4);
  } else if (nearOk && cn) c0 = cn.shift;
  else if (farOk && cf) c0 = cf.shift;
  const ax = before.axis;
  const o = before.origin;
  const nx = -ax.y;
  const ny = ax.x;
  // A point p moves by (s0 + s1 u) along the axis and by (c0 + c1 u) along the normal, u = (p - origin) . axis.
  const u0 = o.x * ax.x + o.y * ax.y;
  const kx = s1 * ax.x + c1 * nx;
  const ky = s1 * ax.y + c1 * ny;
  const map: Mat3 = [1 + kx * ax.x, kx * ax.y, (s0 - s1 * u0) * ax.x + (c0 - c1 * u0) * nx, ky * ax.x, 1 + ky * ax.y, (s0 - s1 * u0) * ax.y + (c0 - c1 * u0) * ny, 0, 0, 1];
  const across = c0 + c1 * (L / 2);
  const middle = s0 + s1 * (L / 2);
  return { map, dx: middle * ax.x + across * nx, dy: middle * ax.y + across * ny, peak: whole.peak, second: whole.second };
}

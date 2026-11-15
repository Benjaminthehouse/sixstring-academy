/**
 * Skew estimation by projection profile: the page is at its "sharpest" when sheared by the angle
 * that makes text baselines and staff lines horizontal. Works on any page with horizontal
 * structure (chord sheets and lyric pages too, where there are no staff lines to follow).
 */
import type { BinaryImage, GrayImage } from './gray';
import { rotateGray } from './warp';

/** Result of {@link estimateSkew}. */
export interface SkewEstimate {
  /** Angle of the page content in radians; positive = lines run downhill to the right. Rotate by -angle to fix. */
  angle: number;
  /** 0..1: how much sharper the best angle is than a typical one (low on pages without lines). */
  confidence: number;
}

/** Options for {@link estimateSkew}. */
export interface SkewOptions {
  /** Search range in degrees on either side of zero (default 8). */
  maxDegrees?: number;
  /** Upper bound on the number of ink pixels sampled (default 150 000). */
  maxSamples?: number;
}

/** Estimate the skew of a binary page. */
export function estimateSkew(bin: BinaryImage, opts: SkewOptions = {}): SkewEstimate {
  const { width: w, height: h, data } = bin;
  const maxDeg = opts.maxDegrees ?? 8;
  const maxSamples = opts.maxSamples ?? 150_000;
  let ink = 0;
  for (let i = 0; i < data.length; i++) ink += data[i];
  if (ink < 50) return { angle: 0, confidence: 0 };
  // Sample every n-th ink pixel (in scan order, so all rows and columns are represented).
  const stride = Math.max(1, Math.floor(ink / maxSamples));
  const n = Math.ceil(ink / stride);
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  let k = 0;
  let c = 0;
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      if (!data[o + x]) continue;
      if (c++ % stride === 0 && k < n) {
        xs[k] = x - w / 2;
        ys[k] = y;
        k++;
      }
    }
  }
  const pad = Math.ceil((w / 2) * Math.tan((maxDeg * Math.PI) / 180)) + 2;
  const bins = new Float64Array(h + 2 * pad);
  const score = (deg: number): number => {
    const t = Math.tan((deg * Math.PI) / 180);
    bins.fill(0);
    for (let i = 0; i < k; i++) bins[(ys[i] - xs[i] * t + pad + 0.5) | 0]++;
    let s = 0;
    for (let i = 0; i < bins.length; i++) s += bins[i] * bins[i];
    return s;
  };
  let best = 0;
  let bestScore = -1;
  const coarse: number[] = [];
  for (let d = -maxDeg; d <= maxDeg + 1e-9; d += 0.5) {
    const s = score(d);
    coarse.push(s);
    if (s > bestScore) { bestScore = s; best = d; }
  }
  for (const step of [0.1, 0.02]) {
    const centre = best;
    for (let i = -5; i <= 5; i++) {
      const d = centre + i * step;
      const s = score(d);
      if (s > bestScore) { bestScore = s; best = d; }
    }
  }
  const sorted = coarse.slice().sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  return { angle: (best * Math.PI) / 180, confidence: bestScore > 0 ? Math.max(0, Math.min(1, 1 - median / bestScore)) : 0 };
}

/** Rotate a grey page so that content measured at `skew` becomes horizontal. */
export function deskewGray(img: GrayImage, skew: number, fill = 255): GrayImage {
  return Math.abs(skew) < 1e-5 ? img : rotateGray(img, -skew, fill);
}

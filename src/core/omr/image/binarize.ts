/**
 * Binarisation. The adaptive methods (Sauvola, Wolf) compare each pixel with a threshold computed
 * from the mean and standard deviation of its neighbourhood; both statistics come from integral
 * images, so the cost does not depend on the window size. On big pages the statistics are computed
 * on a 2x2-reduced grid, which quarters the memory and time and changes nothing visible because
 * the threshold surface is smooth at the scale of a staff space.
 */
import { type BinaryImage, type GrayImage, histogram } from './gray';

/** Options for {@link binarize}. */
export interface BinarizeOptions {
  /** 'sauvola' (default), 'wolf' (better on very low contrast) or 'otsu' (one global threshold). */
  method?: 'sauvola' | 'wolf' | 'otsu';
  /** Window side in px (default: about 1/40 of the page width, at least 15). Use ~2.5 staff spaces when known. */
  window?: number;
  /** Sensitivity. Sauvola default 0.2 (lower keeps fainter strokes), Wolf default 0.5. */
  k?: number;
  /** Dynamic range of the standard deviation for Sauvola (default 128). */
  r?: number;
  /** Reduction of the statistics grid: 1, 2, or 'auto' (2 above 3 megapixels). */
  block?: 1 | 2 | 'auto';
  /** Pixels at least this dark are ink regardless of the neighbourhood (default 0 = off). */
  darkFloor?: number;
  /** Pixels brighter than this are never ink (default 255 = off). Keeps paper noise out. */
  lightCeil?: number;
}

/** Summed-area tables of a grey image (optionally of its squares), padded by one row and column. */
export interface Integral {
  /** Padded size: width + 1, height + 1. */
  width: number;
  height: number;
  sum: Float64Array;
  sq: Float64Array | null;
}

/** Build the summed-area table (and the table of squares when asked). */
export function integral(img: GrayImage, withSquares = false): Integral {
  const { width: w, height: h, data } = img;
  const W = w + 1;
  const sum = new Float64Array(W * (h + 1));
  const sq = withSquares ? new Float64Array(W * (h + 1)) : null;
  for (let y = 0; y < h; y++) {
    let rs = 0;
    let rq = 0;
    const o = y * w;
    const p = (y + 1) * W;
    const up = y * W;
    for (let x = 0; x < w; x++) {
      const v = data[o + x];
      rs += v;
      sum[p + x + 1] = sum[up + x + 1] + rs;
      if (sq) {
        rq += v * v;
        sq[p + x + 1] = sq[up + x + 1] + rq;
      }
    }
  }
  return { width: W, height: h + 1, sum, sq };
}

/** Sum over the rectangle [x0, x1) x [y0, y1) of a summed-area table. */
export function boxSum(table: Float64Array, W: number, x0: number, y0: number, x1: number, y1: number): number {
  return table[y1 * W + x1] - table[y0 * W + x1] - table[y1 * W + x0] + table[y0 * W + x0];
}

/** Otsu's global threshold for a grey histogram: pixels strictly below the result are ink. */
export function otsuThreshold(hist: Uint32Array): number {
  let total = 0;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) {
    total += hist[i];
    sumAll += i * hist[i];
  }
  let wB = 0;
  let sumB = 0;
  let best = 0;
  let bestT = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      bestT = t + 1;
    }
  }
  return bestT;
}

/** Threshold with one global level: pixels below `threshold` become ink. */
export function thresholdGlobal(img: GrayImage, threshold: number): BinaryImage {
  const out = new Uint8Array(img.data.length);
  const d = img.data;
  for (let i = 0; i < d.length; i++) out[i] = d[i] < threshold ? 1 : 0;
  return { width: img.width, height: img.height, data: out };
}

/** Adaptive (or global) binarisation of a grey page. Returns 1 for ink. */
export function binarize(img: GrayImage, opts: BinarizeOptions = {}): BinaryImage {
  const method = opts.method ?? 'sauvola';
  if (method === 'otsu') return thresholdGlobal(img, otsuThreshold(histogram(img)));
  const { width: w, height: h, data } = img;
  const block = opts.block === 'auto' || opts.block === undefined ? (w * h > 3_000_000 ? 2 : 1) : opts.block;
  const win = Math.max(9, Math.round(opts.window ?? Math.max(15, w / 40)));
  const k = opts.k ?? (method === 'wolf' ? 0.5 : 0.2);
  const R = opts.r ?? 128;
  const darkFloor = opts.darkFloor ?? 0;
  const lightCeil = opts.lightCeil ?? 255;

  // Per-cell sums on the (possibly reduced) grid.
  const gw = Math.ceil(w / block);
  const gh = Math.ceil(h / block);
  const GW = gw + 1;
  const sum = new Float64Array(GW * (gh + 1));
  const sq = new Float64Array(GW * (gh + 1));
  let minGrey = 255;
  if (block === 1) {
    for (let y = 0; y < h; y++) {
      let rs = 0;
      let rq = 0;
      const o = y * w;
      const p = (y + 1) * GW;
      const up = y * GW;
      for (let x = 0; x < w; x++) {
        const v = data[o + x];
        if (v < minGrey) minGrey = v;
        rs += v;
        rq += v * v;
        sum[p + x + 1] = sum[up + x + 1] + rs;
        sq[p + x + 1] = sq[up + x + 1] + rq;
      }
    }
  } else {
    const rowS = new Float64Array(gw);
    const rowQ = new Float64Array(gw);
    for (let gy = 0; gy < gh; gy++) {
      rowS.fill(0);
      rowQ.fill(0);
      for (let dy = 0; dy < block; dy++) {
        const y = gy * block + dy;
        if (y >= h) break;
        const o = y * w;
        for (let x = 0; x < w; x++) {
          const v = data[o + x];
          if (v < minGrey) minGrey = v;
          const gx = (x / block) | 0;
          rowS[gx] += v;
          rowQ[gx] += v * v;
        }
      }
      let rs = 0;
      let rq = 0;
      const p = (gy + 1) * GW;
      const up = gy * GW;
      for (let gx = 0; gx < gw; gx++) {
        rs += rowS[gx];
        rq += rowQ[gx];
        sum[p + gx + 1] = sum[up + gx + 1] + rs;
        sq[p + gx + 1] = sq[up + gx + 1] + rq;
      }
    }
  }

  // Threshold per grid cell.
  const rc = Math.max(1, Math.round(win / 2 / block));
  const means = new Float32Array(gw * gh);
  const stds = new Float32Array(gw * gh);
  let maxStd = 1;
  for (let gy = 0; gy < gh; gy++) {
    const y0 = Math.max(0, gy - rc);
    const y1 = Math.min(gh, gy + rc + 1);
    const py0 = Math.min(h, y0 * block);
    const py1 = Math.min(h, y1 * block);
    for (let gx = 0; gx < gw; gx++) {
      const x0 = Math.max(0, gx - rc);
      const x1 = Math.min(gw, gx + rc + 1);
      const n = (Math.min(w, x1 * block) - Math.min(w, x0 * block)) * (py1 - py0);
      const s = sum[y1 * GW + x1] - sum[y0 * GW + x1] - sum[y1 * GW + x0] + sum[y0 * GW + x0];
      const q = sq[y1 * GW + x1] - sq[y0 * GW + x1] - sq[y1 * GW + x0] + sq[y0 * GW + x0];
      const m = s / n;
      const v = q / n - m * m;
      const sd = v > 0 ? Math.sqrt(v) : 0;
      means[gy * gw + gx] = m;
      stds[gy * gw + gx] = sd;
      if (sd > maxStd) maxStd = sd;
    }
  }
  const thr = new Float32Array(gw * gh);
  if (method === 'wolf') {
    for (let i = 0; i < thr.length; i++) {
      const m = means[i];
      thr[i] = (1 - k) * m + k * minGrey + k * (stds[i] / maxStd) * (m - minGrey);
    }
  } else {
    for (let i = 0; i < thr.length; i++) thr[i] = means[i] * (1 + k * (stds[i] / R - 1));
  }
  for (let i = 0; i < thr.length; i++) {
    if (thr[i] > lightCeil) thr[i] = lightCeil;
    if (thr[i] < darkFloor) thr[i] = darkFloor;
  }

  const out = new Uint8Array(w * h);
  if (block === 1) {
    for (let i = 0; i < out.length; i++) out[i] = data[i] < thr[i] ? 1 : 0;
  } else {
    for (let y = 0; y < h; y++) {
      const o = y * w;
      const g = ((y / block) | 0) * gw;
      for (let x = 0; x < w; x++) out[o + x] = data[o + x] < thr[g + ((x / block) | 0)] ? 1 : 0;
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * Illumination flattening: estimate the paper brightness everywhere (shadows, lamp gradients,
 * grey scanner backgrounds, yellowed paper) and divide it out, so that paper becomes white and
 * a single threshold policy works over the whole page.
 */
import { type GrayImage, histogram, percentile } from './gray';

/** Coarse map of the paper level: one value per `cell` x `cell` block of the page. */
export interface BackgroundMap {
  /** Grid size. */
  cols: number;
  rows: number;
  /** Block size in pixels. */
  cell: number;
  /** Paper level (0..255) per block, row-major. */
  data: Float32Array;
  /** Typical paper level of the page (a high percentile of the map). */
  paper: number;
}

/** Options for {@link estimateBackground} and {@link flatten}. */
export interface FlattenOptions {
  /** Block size in px. Default: about 1/160 of the short side, at least 4. */
  cell?: number;
  /** Radius (in blocks) of the closing that bridges symbols. Default 3. */
  radius?: number;
  /** Blocks darker than this fraction of the page's paper level are treated as "not paper" (desk, scanner lid). Default 0.45. */
  minPaper?: number;
  /** Stretch the result so the page's ink level maps to black. Default true. */
  stretch?: boolean;
  /** Pixel distance used for the noise estimate (see {@link estimateNoise}). Default 1. */
  noiseLag?: number;
}

/** Result of {@link flatten}. */
export interface FlattenResult {
  /** The flattened page: paper ~255, ink dark. */
  image: GrayImage;
  background: BackgroundMap;
  /** Robust estimate of the pixel noise (grey levels, 1 sigma) on the flattened page. */
  noise: number;
  /** Grey level of ink before stretching (0..255 on the flattened scale). */
  inkLevel: number;
  /** Contrast between paper and ink in the source, 0..1 (1 = black on white). */
  contrast: number;
  /** Fraction of the image judged to be outside the paper (dark desk, lid). */
  offPage: number;
}

function maxFilter1d(src: Float32Array, dst: Float32Array, n: number, stride: number, offset: number, r: number, min: boolean): void {
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - r);
    const b = Math.min(n - 1, i + r);
    let m = src[offset + a * stride];
    for (let j = a + 1; j <= b; j++) {
      const v = src[offset + j * stride];
      if (min ? v < m : v > m) m = v;
    }
    dst[offset + i * stride] = m;
  }
}

function filter2d(data: Float32Array, cols: number, rows: number, r: number, min: boolean): Float32Array {
  const tmp = new Float32Array(data.length);
  const out = new Float32Array(data.length);
  for (let y = 0; y < rows; y++) maxFilter1d(data, tmp, cols, 1, y * cols, r, min);
  for (let x = 0; x < cols; x++) maxFilter1d(tmp, out, rows, cols, x, r, min);
  return out;
}

function boxBlurGrid(data: Float32Array, cols: number, rows: number): Float32Array {
  const out = new Float32Array(data.length);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= rows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= cols) continue;
          s += data[yy * cols + xx];
          n++;
        }
      }
      out[y * cols + x] = s / n;
    }
  }
  return out;
}

/**
 * Estimate the paper level on a coarse grid: a high percentile per block (ink is the minority in
 * any block that shows paper at all), then a grey closing so blocks buried under a clef or a thick
 * beam inherit the level of the paper around them, then a light blur.
 */
export function estimateBackground(img: GrayImage, opts: FlattenOptions = {}): BackgroundMap {
  const { width: w, height: h, data } = img;
  const cell = Math.max(4, Math.round(opts.cell ?? Math.min(w, h) / 160));
  const radius = opts.radius ?? 3;
  const cols = Math.max(1, Math.ceil(w / cell));
  const rows = Math.max(1, Math.ceil(h / cell));
  const grid = new Float32Array(cols * rows);
  const bins = new Uint16Array(32);
  for (let gy = 0; gy < rows; gy++) {
    const y0 = gy * cell;
    const y1 = Math.min(h, y0 + cell);
    for (let gx = 0; gx < cols; gx++) {
      const x0 = gx * cell;
      const x1 = Math.min(w, x0 + cell);
      bins.fill(0);
      for (let y = y0; y < y1; y++) {
        const o = y * w;
        for (let x = x0; x < x1; x++) bins[data[o + x] >> 3]++;
      }
      // 80th percentile, interpolated inside its 8-level bin.
      const total = (x1 - x0) * (y1 - y0);
      const target = total * 0.8;
      let acc = 0;
      let v = 255;
      for (let b = 0; b < 32; b++) {
        if (acc + bins[b] >= target) {
          v = b * 8 + (bins[b] ? ((target - acc) / bins[b]) * 8 : 4);
          break;
        }
        acc += bins[b];
      }
      grid[gy * cols + gx] = v;
    }
  }
  let bg = filter2d(grid, cols, rows, radius, false);
  bg = filter2d(bg, cols, rows, radius, true);
  bg = boxBlurGrid(bg, cols, rows);
  // Page paper level: a high percentile of the map.
  const sorted = Float32Array.from(bg).sort();
  const paper = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
  return { cols, rows, cell, data: bg, paper };
}

/**
 * Robust pixel-noise estimate (1 sigma) from horizontal differences `lag` pixels apart. On an
 * image that was enlarged, neighbouring pixels share their noise; use a lag of about the
 * enlargement factor to measure the real amplitude.
 */
export function estimateNoise(img: GrayImage, lag = 1): number {
  const { width: w, height: h, data } = img;
  const hist = new Uint32Array(256);
  const stepY = Math.max(1, Math.floor(h / 400));
  let n = 0;
  for (let y = 0; y < h; y += stepY) {
    const o = y * w;
    for (let x = 0; x + lag < w; x += 2) {
      const d = data[o + x] - data[o + x + lag];
      hist[d < 0 ? -d : d]++;
      n++;
    }
  }
  // Median absolute difference -> sigma of one pixel.
  let acc = 0;
  let med = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= n / 2) {
      // Interpolate inside the integer bin for small noise levels.
      const before = acc - hist[i];
      med = i + (hist[i] ? (n / 2 - before) / hist[i] : 0) - 0.5;
      break;
    }
  }
  return Math.max(0, med) / 0.6745 / Math.SQRT2;
}

/**
 * Divide out the paper level. Pixels in regions that are not paper at all (much darker than the
 * page) are set to white so a desk or scanner lid does not turn into a black mass.
 */
export function flatten(img: GrayImage, opts: FlattenOptions = {}): FlattenResult {
  const { width: w, height: h, data } = img;
  const bg = estimateBackground(img, opts);
  const { cols, rows, cell } = bg;
  const floor = bg.paper * (opts.minPaper ?? 0.45);
  // Gain per block (0 marks "not paper").
  const gain = new Float32Array(cols * rows);
  let off = 0;
  for (let i = 0; i < gain.length; i++) {
    if (bg.data[i] < floor) {
      gain[i] = 0;
      off++;
    } else {
      gain[i] = 255 / Math.max(1, bg.data[i]);
    }
  }
  const out = new Uint8Array(w * h);
  const rowGain = new Float32Array(cols + 1);
  const rowMask = new Uint8Array(cols + 1);
  for (let y = 0; y < h; y++) {
    // Vertical interpolation of the block gains for this row.
    const fy = (y + 0.5) / cell - 0.5;
    let gy0 = Math.floor(fy);
    let wy = fy - gy0;
    if (gy0 < 0) { gy0 = 0; wy = 0; }
    let gy1 = gy0 + 1;
    if (gy1 > rows - 1) { gy1 = rows - 1; if (gy0 > rows - 1) gy0 = rows - 1; }
    for (let gx = 0; gx < cols; gx++) {
      const a = gain[gy0 * cols + gx];
      const b = gain[gy1 * cols + gx];
      rowMask[gx] = a === 0 || b === 0 ? 1 : 0;
      rowGain[gx] = a + (b - a) * wy;
    }
    rowGain[cols] = rowGain[cols - 1];
    rowMask[cols] = rowMask[cols - 1];
    const o = y * w;
    for (let x = 0; x < w; x++) {
      const fx = (x + 0.5) / cell - 0.5;
      let gx0 = Math.floor(fx);
      let wx = fx - gx0;
      if (gx0 < 0) { gx0 = 0; wx = 0; }
      if (gx0 > cols - 1) gx0 = cols - 1;
      if (rowMask[gx0] || rowMask[gx0 + 1]) {
        out[o + x] = 255;
        continue;
      }
      const g = rowGain[gx0] + (rowGain[gx0 + 1] - rowGain[gx0]) * wx;
      const v = data[o + x] * g;
      out[o + x] = v >= 255 ? 255 : v + 0.5;
    }
  }
  const flat: GrayImage = { width: w, height: h, data: out };
  const hist = histogram(flat, Math.max(1, Math.floor((w * h) / 400000)));
  // Ink level: a low percentile. Even a sparse page has a few tenths of a percent of solid ink.
  const inkLevel = percentile(hist, 0.003);
  const noise = estimateNoise(flat, Math.max(1, Math.round(opts.noiseLag ?? 1)));
  const contrast = Math.max(0, Math.min(1, ((255 - inkLevel) / 255) * (bg.paper / 255)));
  if ((opts.stretch ?? true) && inkLevel > 12 && inkLevel < 205 && 255 - inkLevel > 8 * noise) {
    // Map ink to black; cap the gain so a nearly blank page is not turned into noise.
    const scale = Math.min(3, 255 / (255 - inkLevel));
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      const v = 255 - (255 - i) * scale;
      lut[i] = v <= 0 ? 0 : v + 0.5;
    }
    for (let i = 0; i < out.length; i++) out[i] = lut[out[i]];
    return { image: flat, background: bg, noise: noise * scale, inkLevel, contrast, offPage: off / gain.length };
  }
  return { image: flat, background: bg, noise, inkLevel, contrast, offPage: off / gain.length };
}

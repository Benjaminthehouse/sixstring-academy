/**
 * Image plumbing for the alignment detector: the grey working frame (always about 640 pixels wide,
 * whatever the camera delivers), separable Gaussian smoothing, the two-level pyramid and bilinear sampling.
 *
 * Pixel convention (see `../types.ts`): the centre of pixel (column c, row r) is (c + 0.5, r + 0.5).
 * Everything is `Float32Array`, 0..255, row-major. Buffers are reused between frames.
 */
import type { Frame } from '../types';

/** Single-channel float image, 0..255. */
export interface GrayImage {
  data: Float32Array;
  width: number;
  height: number;
}

/** Width of the working frame every later stage is tuned for. */
export const WORK_WIDTH = 640;

/** Allocate (or reuse) an image of the given size. */
export function ensureImage(width: number, height: number, reuse?: GrayImage | null): GrayImage {
  if (reuse && reuse.data.length === width * height) {
    reuse.width = width;
    reuse.height = height;
    return reuse;
  }
  return { data: new Float32Array(width * height), width, height };
}

/** Working-frame size for a camera frame: 640 wide unless the frame is already close to that. */
export function workingSize(frameWidth: number, frameHeight: number): { width: number; height: number; scale: number } {
  if (frameWidth >= WORK_WIDTH * 0.9 && frameWidth <= WORK_WIDTH * 1.1) return { width: frameWidth, height: frameHeight, scale: 1 };
  const scale = WORK_WIDTH / frameWidth;
  return { width: WORK_WIDTH, height: Math.max(1, Math.round(frameHeight * scale)), scale };
}

let LUMA_SCRATCH = new Float32Array(0);
let ROW_SCRATCH = new Float32Array(0);

/**
 * Rec. 601 luminance of an RGBA frame, resampled to the working size: copied 1:1, area-averaged
 * when the camera frame is larger, bilinear when it is smaller. `scale` is working pixels per
 * frame pixel (the same on both axes up to rounding of the height).
 */
export function toWorkingGray(frame: Frame, reuse?: GrayImage | null): { gray: GrayImage; scaleX: number; scaleY: number } {
  const fw = frame.width;
  const fh = frame.height;
  const size = workingSize(fw, fh);
  const out = ensureImage(size.width, size.height, reuse);
  const src = frame.data;
  const dst = out.data;
  if (size.width === fw && size.height === fh) {
    for (let i = 0, j = 0, n = fw * fh; i < n; i++, j += 4) dst[i] = src[j] * 0.299 + src[j + 1] * 0.587 + src[j + 2] * 0.114;
    return { gray: out, scaleX: 1, scaleY: 1 };
  }
  const n = fw * fh;
  if (LUMA_SCRATCH.length < n) LUMA_SCRATCH = new Float32Array(n);
  const luma = LUMA_SCRATCH;
  for (let i = 0, j = 0; i < n; i++, j += 4) luma[i] = src[j] * 0.299 + src[j + 1] * 0.587 + src[j + 2] * 0.114;
  const W = size.width;
  const Hh = size.height;
  const rx = fw / W;
  const ry = fh / Hh;
  if (rx <= 1) {
    // Upsampling: bilinear.
    for (let y = 0; y < Hh; y++) {
      let sy = (y + 0.5) * ry - 0.5;
      if (sy < 0) sy = 0;
      if (sy > fh - 1) sy = fh - 1;
      const y0 = Math.min(fh - 2, Math.floor(sy));
      const ty = sy - y0;
      const r0 = Math.max(0, y0) * fw;
      const r1 = Math.min(fh - 1, y0 + 1) * fw;
      for (let x = 0; x < W; x++) {
        let sx = (x + 0.5) * rx - 0.5;
        if (sx < 0) sx = 0;
        if (sx > fw - 1) sx = fw - 1;
        const x0 = Math.min(fw - 2, Math.floor(sx));
        const tx = sx - x0;
        const a = luma[r0 + x0] + (luma[r0 + x0 + 1] - luma[r0 + x0]) * tx;
        const b = luma[r1 + x0] + (luma[r1 + x0 + 1] - luma[r1 + x0]) * tx;
        dst[y * W + x] = a + (b - a) * ty;
      }
    }
    return { gray: out, scaleX: W / fw, scaleY: Hh / fh };
  }
  // Downsampling: separable area average with fractional coverage at both ends of every span.
  if (ROW_SCRATCH.length < W * fh) ROW_SCRATCH = new Float32Array(W * fh);
  const rows = ROW_SCRATCH;
  for (let x = 0; x < W; x++) {
    const a = x * rx;
    const b = Math.min(fw, (x + 1) * rx);
    const i0 = Math.floor(a);
    const i1 = Math.min(fw - 1, Math.ceil(b) - 1);
    const inv = 1 / (b - a);
    for (let y = 0; y < fh; y++) {
      const row = y * fw;
      let s = 0;
      for (let i = i0; i <= i1; i++) {
        const lo = i > a ? i : a;
        const hi = i + 1 < b ? i + 1 : b;
        s += luma[row + i] * (hi - lo);
      }
      rows[y * W + x] = s * inv;
    }
  }
  for (let y = 0; y < Hh; y++) {
    const a = y * ry;
    const b = Math.min(fh, (y + 1) * ry);
    const i0 = Math.floor(a);
    const i1 = Math.min(fh - 1, Math.ceil(b) - 1);
    const inv = 1 / (b - a);
    const o = y * W;
    for (let x = 0; x < W; x++) dst[o + x] = 0;
    for (let i = i0; i <= i1; i++) {
      const lo = i > a ? i : a;
      const hi = i + 1 < b ? i + 1 : b;
      const k = (hi - lo) * inv;
      const row = i * W;
      for (let x = 0; x < W; x++) dst[o + x] += rows[row + x] * k;
    }
  }
  return { gray: out, scaleX: W / fw, scaleY: Hh / fh };
}

/** Normalised 1-D Gaussian taps for a sigma (radius = ceil(2.5 sigma), at least 1). */
export function gaussianKernel(sigma: number): Float32Array {
  const radius = Math.max(1, Math.ceil(2.5 * sigma));
  const k = new Float32Array(2 * radius + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  return k;
}

let BLUR_SCRATCH = new Float32Array(0);

/** A rectangle of pixels, inclusive on all sides. */
export interface PixelRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Separable Gaussian blur with clamped borders. `out` must not be the same image as `src`. With a
 * rectangle only the pixels inside it are written: the tracker blurs just the neighbourhood of the
 * board. The kernel is symmetric, so each tap pair costs one multiplication.
 */
export function gaussianBlur(src: GrayImage, sigma: number, out?: GrayImage | null, rect?: PixelRect): GrayImage {
  const W = src.width;
  const Hh = src.height;
  const dst = ensureImage(W, Hh, out);
  const k = gaussianKernel(sigma);
  const r = (k.length - 1) >> 1;
  if (BLUR_SCRATCH.length < W * Hh) BLUR_SCRATCH = new Float32Array(W * Hh);
  const tmp = BLUR_SCRATCH;
  const x0 = rect ? Math.max(0, rect.x0) : 0;
  const x1 = rect ? Math.min(W - 1, rect.x1) : W - 1;
  const y0 = rect ? Math.max(0, rect.y0) : 0;
  const y1 = rect ? Math.min(Hh - 1, rect.y1) : Hh - 1;
  if (x1 < x0 || y1 < y0) return dst;
  const s = src.data;
  const d = dst.data;
  const k0 = k[r];
  // Horizontal pass over the rows the vertical pass will read.
  const ya = Math.max(0, y0 - r);
  const yb = Math.min(Hh - 1, y1 + r);
  const xi0 = Math.max(x0, r);
  const xi1 = Math.min(x1, W - 1 - r);
  for (let y = ya; y <= yb; y++) {
    const row = y * W;
    for (let x = x0; x < xi0 && x <= x1; x++) {
      let acc = 0;
      for (let j = -r; j <= r; j++) {
        const xx = x + j < 0 ? 0 : x + j >= W ? W - 1 : x + j;
        acc += s[row + xx] * k[j + r];
      }
      tmp[row + x] = acc;
    }
    for (let x = xi0; x <= xi1; x++) {
      const c = row + x;
      let acc = s[c] * k0;
      for (let j = 1; j <= r; j++) acc += (s[c - j] + s[c + j]) * k[r + j];
      tmp[c] = acc;
    }
    for (let x = Math.max(xi1 + 1, x0); x <= x1; x++) {
      let acc = 0;
      for (let j = -r; j <= r; j++) {
        const xx = x + j < 0 ? 0 : x + j >= W ? W - 1 : x + j;
        acc += s[row + xx] * k[j + r];
      }
      tmp[row + x] = acc;
    }
  }
  // Vertical pass: accumulate whole rows so the inner loop runs along memory.
  for (let y = y0; y <= y1; y++) {
    const row = y * W;
    const crow = y * W;
    for (let x = x0; x <= x1; x++) d[row + x] = tmp[crow + x] * k0;
    for (let j = 1; j <= r; j++) {
      const up = (y - j < 0 ? 0 : y - j) * W;
      const down = (y + j >= Hh ? Hh - 1 : y + j) * W;
      const kk = k[r + j];
      for (let x = x0; x <= x1; x++) d[row + x] += (tmp[up + x] + tmp[down + x]) * kk;
    }
  }
  return dst;
}

/** Halve an image by averaging 2x2 blocks (odd trailing rows / columns are dropped). */
export function halve(src: GrayImage, out?: GrayImage | null): GrayImage {
  const w = src.width >> 1;
  const h = src.height >> 1;
  const dst = ensureImage(w, h, out);
  const s = src.data;
  const d = dst.data;
  const W = src.width;
  for (let y = 0; y < h; y++) {
    const a = 2 * y * W;
    const b = a + W;
    const o = y * w;
    for (let x = 0; x < w; x++) d[o + x] = 0.25 * (s[a + 2 * x] + s[a + 2 * x + 1] + s[b + 2 * x] + s[b + 2 * x + 1]);
  }
  return dst;
}

/** Smoothing of the fine image (pixels of the working frame). */
export const SIGMA_FINE = 1.2;
/** The coarse image is the fine one halved and smoothed by this much more (half-resolution pixels); overall sigma about 2.4 working pixels. */
export const SIGMA_COARSE = 1.0;
/** Pixels of the coarse image per working pixel. */
export const COARSE_SCALE = 0.5;

/** The two smoothed images every stage samples: `fine` at working resolution, `coarse` at half of it. */
export interface Pyramid {
  fine: GrayImage;
  coarse: GrayImage;
}

let HALF_SCRATCH: GrayImage | null = null;

/** Build (or refill) the two-level pyramid of a working-frame grey image. */
export function buildPyramid(gray: GrayImage, reuse?: Pyramid | null): Pyramid {
  const fine = gaussianBlur(gray, SIGMA_FINE, reuse?.fine);
  HALF_SCRATCH = halve(fine, HALF_SCRATCH);
  const coarse = gaussianBlur(HALF_SCRATCH, SIGMA_COARSE, reuse?.coarse);
  return { fine, coarse };
}

/** Bilinear sample at continuous image coordinates (clamped to the border). */
export function sampleBilinear(img: GrayImage, x: number, y: number): number {
  const W = img.width;
  const Hh = img.height;
  let fx = x - 0.5;
  let fy = y - 0.5;
  if (fx < 0) fx = 0;
  else if (fx > W - 1.001) fx = W - 1.001;
  if (fy < 0) fy = 0;
  else if (fy > Hh - 1.001) fy = Hh - 1.001;
  const x0 = fx | 0;
  const y0 = fy | 0;
  const tx = fx - x0;
  const ty = fy - y0;
  const i = y0 * W + x0;
  const d = img.data;
  const a = d[i] + (d[i + 1] - d[i]) * tx;
  const b = d[i + W] + (d[i + W + 1] - d[i + W]) * tx;
  return a + (b - a) * ty;
}

/** True when a point lies inside the image with a margin (pixels). */
export function insideImage(img: { width: number; height: number }, x: number, y: number, margin = 0): boolean {
  return x >= margin && y >= margin && x <= img.width - margin && y <= img.height - margin;
}

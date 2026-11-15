/**
 * Image plumbing for the alignment detector: the grey working frame (always about 640 pixels wide,
 * whatever the camera delivers), separable Gaussian smoothing and bilinear sampling.
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

/** Normalised 1-D Gaussian taps for a sigma (radius = ceil(2.6 sigma), at least 1). */
export function gaussianKernel(sigma: number): Float32Array {
  const radius = Math.max(1, Math.ceil(2.6 * sigma));
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

/**
 * Separable Gaussian blur with clamped borders. `out` may be the same image as `src`. With a
 * rectangle only the rows and columns inside it (plus nothing else) are written: the tracker blurs
 * just the neighbourhood of the board.
 */
export function gaussianBlur(src: GrayImage, sigma: number, out?: GrayImage | null, rect?: { x0: number; y0: number; x1: number; y1: number }): GrayImage {
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
  // Horizontal pass over the rows the vertical pass will read.
  const ya = Math.max(0, y0 - r);
  const yb = Math.min(Hh - 1, y1 + r);
  const xi0 = Math.max(x0, r);
  const xi1 = Math.min(x1, W - 1 - r);
  for (let y = ya; y <= yb; y++) {
    const row = y * W;
    for (let x = x0; x <= x1; x++) {
      let acc = 0;
      if (x >= xi0 && x <= xi1) {
        const base = row + x - r;
        for (let j = 0; j < k.length; j++) acc += s[base + j] * k[j];
      } else {
        for (let j = -r; j <= r; j++) {
          const xx = x + j < 0 ? 0 : x + j >= W ? W - 1 : x + j;
          acc += s[row + xx] * k[j + r];
        }
      }
      tmp[row + x] = acc;
    }
  }
  // Vertical pass.
  for (let y = y0; y <= y1; y++) {
    const row = y * W;
    for (let x = x0; x <= x1; x++) d[row + x] = 0;
    for (let j = -r; j <= r; j++) {
      const yy = y + j < 0 ? 0 : y + j >= Hh ? Hh - 1 : y + j;
      const kk = k[j + r];
      const srow = yy * W;
      for (let x = x0; x <= x1; x++) d[row + x] += tmp[srow + x] * kk;
    }
  }
  return dst;
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

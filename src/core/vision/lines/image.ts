/**
 * Image primitives of the line-structure detector: the working luminance image, a small pyramid,
 * bilinear sampling and gradients. Everything is a flat `Float32Array` in gray levels 0..255 and
 * uses the shared pixel convention (the centre of pixel (c, r) is (c + 0.5, r + 0.5)).
 */
import type { Frame } from '../types';

/** Single-channel float image, row-major, gray levels 0..255. */
export interface Image32 {
  data: Float32Array;
  width: number;
  height: number;
}

/** An empty image of the given size. */
export function createImage(width: number, height: number): Image32 {
  return { data: new Float32Array(width * height), width, height };
}

function reuse(out: Image32 | undefined, width: number, height: number): Image32 {
  if (out && out.data.length === width * height) {
    out.width = width;
    out.height = height;
    return out;
  }
  return createImage(width, height);
}

/** Integer factor by which a frame is shrunk so its width does not exceed `maxWidth` by much (640 -> 1, 960 -> 2, 1280 -> 2). */
export function workingFactor(frameWidth: number, maxWidth = 640): number {
  return Math.max(1, Math.round(frameWidth / maxWidth - 0.01));
}

/**
 * Luminance (Rec. 601) of an RGBA frame, box-averaged over `factor` x `factor` pixels. The result is
 * `floor(width / factor)` wide; working pixel (c, r) covers frame pixels [c*factor, (c+1)*factor).
 */
export function toWorkingGray(frame: Frame, factor: number, out?: Image32): Image32 {
  const f = Math.max(1, Math.floor(factor));
  const w = Math.floor(frame.width / f);
  const h = Math.floor(frame.height / f);
  const img = reuse(out, w, h);
  const src = frame.data;
  const dst = img.data;
  const fw = frame.width;
  if (f === 1) {
    for (let i = 0, j = 0, n = w * h; i < n; i++, j += 4) dst[i] = src[j] * 0.299 + src[j + 1] * 0.587 + src[j + 2] * 0.114;
    return img;
  }
  const norm = 1 / (f * f);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      let sum = 0;
      for (let dy = 0; dy < f; dy++) {
        let j = ((r * f + dy) * fw + c * f) * 4;
        for (let dx = 0; dx < f; dx++, j += 4) sum += src[j] * 0.299 + src[j + 1] * 0.587 + src[j + 2] * 0.114;
      }
      dst[r * w + c] = sum * norm;
    }
  }
  return img;
}

/** Separable binomial blur [1 2 1] / 4 (sigma about 0.85 px); borders are replicated. */
export function smooth3(src: Image32, out?: Image32, scratch?: Float32Array): Image32 {
  const w = src.width;
  const h = src.height;
  const img = reuse(out, w, h);
  const tmp = scratch && scratch.length >= w * h ? scratch : new Float32Array(w * h);
  const s = src.data;
  const d = img.data;
  for (let r = 0; r < h; r++) {
    const o = r * w;
    tmp[o] = (3 * s[o] + s[o + 1]) * 0.25;
    for (let c = 1; c < w - 1; c++) tmp[o + c] = (s[o + c - 1] + 2 * s[o + c] + s[o + c + 1]) * 0.25;
    tmp[o + w - 1] = (s[o + w - 2] + 3 * s[o + w - 1]) * 0.25;
  }
  for (let r = 0; r < h; r++) {
    const o = r * w;
    const up = r > 0 ? o - w : o;
    const dn = r < h - 1 ? o + w : o;
    for (let c = 0; c < w; c++) d[o + c] = (tmp[up + c] + 2 * tmp[o + c] + tmp[dn + c]) * 0.25;
  }
  return img;
}

/** Half-resolution copy (2x2 box average). */
export function halve(src: Image32, out?: Image32): Image32 {
  const w = src.width >> 1;
  const h = src.height >> 1;
  const img = reuse(out, w, h);
  const s = src.data;
  const d = img.data;
  const sw = src.width;
  for (let r = 0; r < h; r++) {
    let i = 2 * r * sw;
    const o = r * w;
    for (let c = 0; c < w; c++, i += 2) d[o + c] = (s[i] + s[i + 1] + s[i + sw] + s[i + sw + 1]) * 0.25;
  }
  return img;
}

/** Bilinear sample at continuous image coordinates; positions outside the image read the nearest border pixel. */
export function sampleBilinear(img: Image32, x: number, y: number): number {
  const w = img.width;
  const h = img.height;
  let fx = x - 0.5;
  let fy = y - 0.5;
  if (fx < 0) fx = 0;
  else if (fx > w - 1.001) fx = w - 1.001;
  if (fy < 0) fy = 0;
  else if (fy > h - 1.001) fy = h - 1.001;
  const x0 = fx | 0;
  const y0 = fy | 0;
  const ax = fx - x0;
  const ay = fy - y0;
  const i = y0 * w + x0;
  const d = img.data;
  const top = d[i] + (d[i + 1] - d[i]) * ax;
  const bot = d[i + w] + (d[i + w + 1] - d[i + w]) * ax;
  return top + (bot - top) * ay;
}

/** Sobel gradients (divided by 8, so they are gray levels per pixel) and their magnitude. */
export interface Gradients {
  gx: Float32Array;
  gy: Float32Array;
  mag: Float32Array;
  width: number;
  height: number;
}

/** Sobel gradient of an image; the one-pixel border is left at zero. Pass `out` to reuse buffers. */
export function sobel(img: Image32, out?: Gradients): Gradients {
  const w = img.width;
  const h = img.height;
  const n = w * h;
  const g: Gradients = out && out.gx.length === n ? out : { gx: new Float32Array(n), gy: new Float32Array(n), mag: new Float32Array(n), width: w, height: h };
  g.width = w;
  g.height = h;
  const s = img.data;
  const { gx, gy, mag } = g;
  for (let r = 1; r < h - 1; r++) {
    let i = r * w + 1;
    for (let c = 1; c < w - 1; c++, i++) {
      const a = s[i - w - 1];
      const b = s[i - w];
      const cc = s[i - w + 1];
      const d = s[i - 1];
      const f = s[i + 1];
      const p = s[i + w - 1];
      const q = s[i + w];
      const t = s[i + w + 1];
      const x = (cc + 2 * f + t - a - 2 * d - p) * 0.125;
      const y = (p + 2 * q + t - a - 2 * b - cc) * 0.125;
      gx[i] = x;
      gy[i] = y;
      mag[i] = Math.sqrt(x * x + y * y);
    }
  }
  return g;
}

/** Median of a non-negative float array, estimated from a histogram with bins of `binWidth` (values above `max` are clamped). */
export function approxMedian(values: Float32Array, count: number, binWidth = 0.125, max = 32): number {
  const bins = Math.ceil(max / binWidth) + 1;
  const hist = new Int32Array(bins);
  const inv = 1 / binWidth;
  for (let i = 0; i < count; i++) {
    const b = (values[i] * inv) | 0;
    hist[b < bins ? b : bins - 1]++;
  }
  let acc = 0;
  const half = count / 2;
  for (let b = 0; b < bins; b++) {
    acc += hist[b];
    if (acc >= half) return (b + 0.5) * binWidth;
  }
  return max;
}

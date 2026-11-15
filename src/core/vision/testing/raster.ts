/**
 * Low-level raster helpers for the scene renderer: a premultiplied float layer with analytic
 * anti-aliasing, blurs, sensor noise, 8x8 block compression and the final 8-bit encode.
 * Everything works on typed arrays and never allocates per pixel.
 */
import type { Frame } from '../types';
import { Rng } from './rng';

/** Where shapes are drawn: a premultiplied RGBA float layer plus the lens mapping of the frame. */
export interface RenderTarget {
  width: number;
  height: number;
  /** Pinhole-image position of every output pixel centre (differs from the pixel grid under lens distortion). */
  ux: Float32Array;
  uy: Float32Array;
  /** How far (px) distortion can move a point: bounding boxes are grown by this. */
  margin: number;
  /** Premultiplied linear RGBA, 4 floats per pixel. */
  layer: Float32Array;
}

/** Signed distance in pixels at a pinhole-image position; negative inside. */
export type Sdf = (x: number, y: number) => number;
/** Writes the linear colour of a shape at a position into out[0..2] and its opacity into out[3]. */
export type Shader = (x: number, y: number, d: number, out: Float32Array) => void;

const SHADE = new Float32Array(4);

/**
 * Fill a shape given by a signed distance function, with one-pixel analytic anti-aliasing (or a
 * wider falloff when `soft` > 1, for shadows). The bounding box is in pinhole-image pixels.
 */
export function fillShape(t: RenderTarget, x0: number, y0: number, x1: number, y1: number, sdf: Sdf, shader: Shader, soft = 1): void {
  const ix0 = Math.max(0, Math.floor(x0 - t.margin - soft));
  const iy0 = Math.max(0, Math.floor(y0 - t.margin - soft));
  const ix1 = Math.min(t.width - 1, Math.ceil(x1 + t.margin + soft));
  const iy1 = Math.min(t.height - 1, Math.ceil(y1 + t.margin + soft));
  if (ix1 < ix0 || iy1 < iy0) return;
  const { ux, uy, layer, width } = t;
  const inv = 1 / soft;
  for (let py = iy0; py <= iy1; py++) {
    let i = py * width + ix0;
    for (let px = ix0; px <= ix1; px++, i++) {
      const x = ux[i];
      const y = uy[i];
      const d = sdf(x, y);
      let cov = 0.5 - d * inv;
      if (cov <= 0) continue;
      if (cov > 1) cov = 1;
      SHADE[3] = 1;
      shader(x, y, d, SHADE);
      const a = cov * SHADE[3];
      if (a <= 0) continue;
      const j = i * 4;
      const k = 1 - a;
      layer[j] = SHADE[0] * a + layer[j] * k;
      layer[j + 1] = SHADE[1] * a + layer[j + 1] * k;
      layer[j + 2] = SHADE[2] * a + layer[j + 2] * k;
      layer[j + 3] = a + layer[j + 3] * k;
    }
  }
}

/** Darken whatever is already on the layer inside a shape (a cast shadow); leaves empty pixels empty. */
export function shadeShape(t: RenderTarget, x0: number, y0: number, x1: number, y1: number, sdf: Sdf, strength: number, soft: number): void {
  const ix0 = Math.max(0, Math.floor(x0 - t.margin - soft));
  const iy0 = Math.max(0, Math.floor(y0 - t.margin - soft));
  const ix1 = Math.min(t.width - 1, Math.ceil(x1 + t.margin + soft));
  const iy1 = Math.min(t.height - 1, Math.ceil(y1 + t.margin + soft));
  if (ix1 < ix0 || iy1 < iy0) return;
  const { ux, uy, layer, width } = t;
  const inv = 1 / soft;
  for (let py = iy0; py <= iy1; py++) {
    let i = py * width + ix0;
    for (let px = ix0; px <= ix1; px++, i++) {
      const j = i * 4;
      if (layer[j + 3] <= 0) continue;
      let cov = 0.5 - sdf(ux[i], uy[i]) * inv;
      if (cov <= 0) continue;
      if (cov > 1) cov = 1;
      const k = 1 - strength * cov;
      layer[j] *= k;
      layer[j + 1] *= k;
      layer[j + 2] *= k;
    }
  }
}

/** Distance function of a capsule whose radius changes linearly from `ra` at a to `rb` at b. */
export function capsuleSdf(ax: number, ay: number, bx: number, by: number, ra: number, rb: number): Sdf {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-9;
  return (x, y) => {
    let h = ((x - ax) * dx + (y - ay) * dy) / len2;
    h = h < 0 ? 0 : h > 1 ? 1 : h;
    const px = x - ax - h * dx;
    const py = y - ay - h * dy;
    return Math.sqrt(px * px + py * py) - (ra + (rb - ra) * h);
  };
}

/** Distance function of an ellipse (approximate away from the boundary, exact enough for anti-aliasing). */
export function ellipseSdf(cx: number, cy: number, rx: number, ry: number): Sdf {
  return (x, y) => {
    const nx = (x - cx) / rx;
    const ny = (y - cy) / ry;
    const k = Math.sqrt(nx * nx + ny * ny);
    if (k < 1e-6) return -Math.min(rx, ry);
    // First-order distance: (k - 1) divided by the gradient magnitude of k.
    const g = Math.sqrt((nx / rx) * (nx / rx) + (ny / ry) * (ny / ry)) / k;
    return (k - 1) / g;
  };
}

/** Distance function of a rounded box, rotated by `angle` radians about its centre. */
export function roundBoxSdf(cx: number, cy: number, hw: number, hh: number, radius: number, angle = 0): Sdf {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const bw = hw - radius;
  const bh = hh - radius;
  return (x, y) => {
    const rx = (x - cx) * c + (y - cy) * s;
    const ry = -(x - cx) * s + (y - cy) * c;
    const qx = Math.abs(rx) - bw;
    const qy = Math.abs(ry) - bh;
    const ox = qx > 0 ? qx : 0;
    const oy = qy > 0 ? qy : 0;
    return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - radius;
  };
}

/** Bounding box [x0, y0, x1, y1] of a capsule. */
export function capsuleBounds(ax: number, ay: number, bx: number, by: number, ra: number, rb: number): [number, number, number, number] {
  const r = Math.max(ra, rb);
  return [Math.min(ax, bx) - r, Math.min(ay, by) - r, Math.max(ax, bx) + r, Math.max(ay, by) + r];
}

// ---------------------------------------------------------------------------------------------
// Blur
// ---------------------------------------------------------------------------------------------

let BLUR_TMP = new Float32Array(0);

/**
 * One 1-D pass of a symmetric kernel: dst[i] = sum over taps of src[i + tap * stride]. `count` runs
 * of `runLength` elements start at 0, `runStep`, 2 * `runStep`, ...; inside a run, reads that would
 * leave it are clamped to its first / last `clampStride` block (edge replication).
 */
function convolveRuns(src: Float32Array, dst: Float32Array, kernel: Float32Array, radius: number, stride: number, runLength: number, runStep: number, count: number): void {
  const k0 = kernel[radius];
  const k1 = radius >= 1 ? kernel[radius + 1] : 0;
  const k2 = radius >= 2 ? kernel[radius + 2] : 0;
  const k3 = radius >= 3 ? kernel[radius + 3] : 0;
  const reach = radius * stride;
  for (let run = 0; run < count; run++) {
    const start = run * runStep;
    const end = start + runLength;
    const lo = Math.min(end, start + reach);
    const hi = Math.max(lo, end - reach);
    // Interior: every tap is inside the run, so no clamping is needed.
    if (radius === 1) {
      for (let i = lo; i < hi; i++) dst[i] = k0 * src[i] + k1 * (src[i - stride] + src[i + stride]);
    } else if (radius === 2) {
      const s2 = 2 * stride;
      for (let i = lo; i < hi; i++) dst[i] = k0 * src[i] + k1 * (src[i - stride] + src[i + stride]) + k2 * (src[i - s2] + src[i + s2]);
    } else if (radius === 3) {
      const s2 = 2 * stride;
      const s3 = 3 * stride;
      for (let i = lo; i < hi; i++) dst[i] = k0 * src[i] + k1 * (src[i - stride] + src[i + stride]) + k2 * (src[i - s2] + src[i + s2]) + k3 * (src[i - s3] + src[i + s3]);
    } else {
      for (let i = lo; i < hi; i++) {
        let acc = k0 * src[i];
        for (let t = 1, o = stride; t <= radius; t++, o += stride) acc += kernel[radius + t] * (src[i - o] + src[i + o]);
        dst[i] = acc;
      }
    }
    // Borders: clamp each tap to the run.
    for (let pass = 0; pass < 2; pass++) {
      const from = pass === 0 ? start : hi;
      const to = pass === 0 ? lo : end;
      for (let i = from; i < to; i++) {
        const phase = (i - start) % stride;
        const first = start + phase;
        const last = end - stride + phase;
        let acc = k0 * src[i];
        for (let t = 1, o = stride; t <= radius; t++, o += stride) {
          const a = i - o < first ? first : i - o;
          const b = i + o > last ? last : i + o;
          acc += kernel[radius + t] * (src[a] + src[b]);
        }
        dst[i] = acc;
      }
    }
  }
}

/** Separable Gaussian blur in place on an interleaved float image with `channels` floats per pixel. */
export function gaussianBlur(data: Float32Array, width: number, height: number, channels: number, sigma: number): void {
  if (!(sigma > 0.25)) return;
  const radius = Math.min(Math.max(1, Math.ceil(sigma * 2.3)), Math.max(1, Math.min(width, height) - 1));
  const kernel = new Float32Array(2 * radius + 1);
  let sum = 0;
  for (let k = -radius; k <= radius; k++) {
    kernel[k + radius] = Math.exp((-k * k) / (2 * sigma * sigma));
    sum += kernel[k + radius];
  }
  for (let k = 0; k < kernel.length; k++) kernel[k] /= sum;
  const total = width * height * channels;
  if (BLUR_TMP.length < total) BLUR_TMP = new Float32Array(total);
  const rowLen = width * channels;
  // Horizontal: each row is a run, neighbours are `channels` apart.
  convolveRuns(data, BLUR_TMP, kernel, radius, channels, rowLen, rowLen, height);
  // Vertical: the whole image is one run, neighbours are a row apart.
  convolveRuns(BLUR_TMP, data, kernel, radius, rowLen, total, total, 1);
}

/** Box blur along a direction (camera or subject motion during the exposure), in place on RGB floats. */
export function motionBlur(data: Float32Array, width: number, height: number, length: number, angleDeg: number): void {
  if (!(length > 0.75)) return;
  const taps = Math.max(2, Math.round(length) + 1);
  const dx = Math.cos((angleDeg * Math.PI) / 180);
  const dy = Math.sin((angleDeg * Math.PI) / 180);
  const total = width * height * 3;
  if (BLUR_TMP.length < total) BLUR_TMP = new Float32Array(total);
  const tmp = BLUR_TMP;
  tmp.set(data.subarray(0, total));
  data.fill(0, 0, total);
  const wTap = 1 / taps;
  const rowLen = width * 3;
  // Each tap adds a shifted copy of the image: a whole-pixel step along the major axis and a
  // linear blend of the two nearest pixels along the minor axis. Shifted reads are clamped at the borders.
  const addBlend = (wa: number, ax: number, ay: number, wb: number, bx: number, by: number): void => {
    const x0 = Math.min(width, Math.max(0, -ax, -bx));
    const x1 = Math.max(x0, Math.min(width, width - ax, width - bx));
    for (let y = 0; y < height; y++) {
      const ya = y + ay < 0 ? 0 : y + ay >= height ? height - 1 : y + ay;
      const yb = y + by < 0 ? 0 : y + by >= height ? height - 1 : y + by;
      const dst = y * rowLen;
      const sa = ya * rowLen + ax * 3;
      const sb = yb * rowLen + bx * 3;
      for (let i = x0 * 3, end = x1 * 3; i < end; i++) data[dst + i] += wa * tmp[sa + i] + wb * tmp[sb + i];
      for (let x = 0; x < width; x++) {
        if (x === x0 && x1 > x0) x = x1;
        if (x >= width) break;
        const xa = x + ax < 0 ? 0 : x + ax >= width ? width - 1 : x + ax;
        const xb = x + bx < 0 ? 0 : x + bx >= width ? width - 1 : x + bx;
        for (let c = 0; c < 3; c++) data[dst + x * 3 + c] += wa * tmp[ya * rowLen + xa * 3 + c] + wb * tmp[yb * rowLen + xb * 3 + c];
      }
    }
  };
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  for (let k = 0; k < taps; k++) {
    const tt = (k / (taps - 1) - 0.5) * length;
    const ox = tt * dx;
    const oy = tt * dy;
    if (horizontal) {
      const fy = Math.floor(oy);
      const ix = Math.round(ox);
      addBlend(wTap * (1 - (oy - fy)), ix, fy, wTap * (oy - fy), ix, fy + 1);
    } else {
      const fx = Math.floor(ox);
      const iy = Math.round(oy);
      addBlend(wTap * (1 - (ox - fx)), fx, iy, wTap * (ox - fx), fx + 1, iy);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Sensor: noise, encode, block compression
// ---------------------------------------------------------------------------------------------

const GAUSS_TABLE = (() => {
  const table = new Float32Array(4096);
  const rng = new Rng(0xc0ffee);
  for (let i = 0; i < table.length; i++) table[i] = rng.gauss();
  return table;
})();

const SRGB_LUT = (() => {
  const lut = new Uint8Array(4097);
  for (let i = 0; i <= 4096; i++) {
    const v = i / 4096;
    const s = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    lut[i] = Math.min(255, Math.max(0, Math.round(s * 255)));
  }
  return lut;
})();

/**
 * Add sensor noise to linear RGB and encode to 8-bit sRGB RGBA. `read` is the signal-independent
 * sigma and `shot` the extra sigma at full-scale signal (variance grows linearly with the signal);
 * both in linear 0..1 units.
 */
export function exposeToFrame(linear: Float32Array, width: number, height: number, read: number, shot: number, seed: number): Frame {
  const n = width * height;
  const out = new Uint8ClampedArray(n * 4);
  let state = (seed | 0) === 0 ? 0x9e3779b9 : seed | 0;
  const noisy = read > 0 || shot > 0;
  const read2 = read * read;
  shot = shot * shot;
  for (let i = 0, j = 0, o = 0; i < n; i++, j += 3, o += 4) {
    let r = linear[j];
    let g = linear[j + 1];
    let b = linear[j + 2];
    if (noisy) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      r += Math.sqrt(read2 + shot * (r > 0 ? r : 0)) * GAUSS_TABLE[state & 4095];
      g += Math.sqrt(read2 + shot * (g > 0 ? g : 0)) * GAUSS_TABLE[(state >>> 12) & 4095];
      b += Math.sqrt(read2 + shot * (b > 0 ? b : 0)) * GAUSS_TABLE[(state >>> 20) & 4095];
    }
    out[o] = SRGB_LUT[r <= 0 ? 0 : r >= 1 ? 4096 : (r * 4096 + 0.5) | 0];
    out[o + 1] = SRGB_LUT[g <= 0 ? 0 : g >= 1 ? 4096 : (g * 4096 + 0.5) | 0];
    out[o + 2] = SRGB_LUT[b <= 0 ? 0 : b >= 1 ? 4096 : (b * 4096 + 0.5) | 0];
    out[o + 3] = 255;
  }
  return { data: out, width, height };
}

const LUMA_Q = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const CHROMA_Q = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99];

const DCT = (() => {
  const m = new Float32Array(64);
  for (let u = 0; u < 8; u++) {
    const c = u === 0 ? Math.SQRT1_2 : 1;
    for (let x = 0; x < 8; x++) m[u * 8 + x] = (c / 2) * Math.cos(((2 * x + 1) * u * Math.PI) / 16);
  }
  return m;
})();

function scaledTable(base: number[], quality: number): Float32Array {
  const q = Math.min(100, Math.max(1, quality));
  const scale = q < 50 ? 5000 / q : 200 - 2 * q;
  const out = new Float32Array(64);
  for (let i = 0; i < 64; i++) out[i] = Math.min(255, Math.max(1, Math.floor((base[i] * scale + 50) / 100)));
  return out;
}

const BLOCK = new Float32Array(64);
const BLOCK_TMP = new Float32Array(64);

/**
 * 8-point DCT of 8 values spaced `stride` apart starting at `at`, written to `dst` with the same
 * layout. Uses the even/odd symmetry of the cosine basis: half the multiplications of the plain product.
 */
function fdct8(src: Float32Array, dst: Float32Array, at: number, stride: number): void {
  const m = DCT;
  const s0 = src[at] + src[at + 7 * stride];
  const s1 = src[at + stride] + src[at + 6 * stride];
  const s2 = src[at + 2 * stride] + src[at + 5 * stride];
  const s3 = src[at + 3 * stride] + src[at + 4 * stride];
  const d0 = src[at] - src[at + 7 * stride];
  const d1 = src[at + stride] - src[at + 6 * stride];
  const d2 = src[at + 2 * stride] - src[at + 5 * stride];
  const d3 = src[at + 3 * stride] - src[at + 4 * stride];
  dst[at] = m[0] * s0 + m[1] * s1 + m[2] * s2 + m[3] * s3;
  dst[at + 2 * stride] = m[16] * s0 + m[17] * s1 + m[18] * s2 + m[19] * s3;
  dst[at + 4 * stride] = m[32] * s0 + m[33] * s1 + m[34] * s2 + m[35] * s3;
  dst[at + 6 * stride] = m[48] * s0 + m[49] * s1 + m[50] * s2 + m[51] * s3;
  dst[at + stride] = m[8] * d0 + m[9] * d1 + m[10] * d2 + m[11] * d3;
  dst[at + 3 * stride] = m[24] * d0 + m[25] * d1 + m[26] * d2 + m[27] * d3;
  dst[at + 5 * stride] = m[40] * d0 + m[41] * d1 + m[42] * d2 + m[43] * d3;
  dst[at + 7 * stride] = m[56] * d0 + m[57] * d1 + m[58] * d2 + m[59] * d3;
}

/** Inverse of `fdct8`. */
function idct8(src: Float32Array, dst: Float32Array, at: number, stride: number): void {
  const m = DCT;
  const f0 = src[at];
  const f1 = src[at + stride];
  const f2 = src[at + 2 * stride];
  const f3 = src[at + 3 * stride];
  const f4 = src[at + 4 * stride];
  const f5 = src[at + 5 * stride];
  const f6 = src[at + 6 * stride];
  const f7 = src[at + 7 * stride];
  for (let x = 0; x < 4; x++) {
    const e = m[x] * f0 + m[16 + x] * f2 + m[32 + x] * f4 + m[48 + x] * f6;
    const o = m[8 + x] * f1 + m[24 + x] * f3 + m[40 + x] * f5 + m[56 + x] * f7;
    dst[at + x * stride] = e + o;
    dst[at + (7 - x) * stride] = e - o;
  }
}

/** Quantise one plane (values 0..255) in the 8x8 DCT domain, in place. */
function quantisePlane(plane: Float32Array, width: number, height: number, table: Float32Array): void {
  const b = BLOCK;
  const tmp = BLOCK_TMP;
  const inv = new Float32Array(64);
  for (let i = 0; i < 64; i++) inv[i] = 1 / table[i];
  for (let by = 0; by < height; by += 8) {
    for (let bx = 0; bx < width; bx += 8) {
      const full = bx + 8 <= width && by + 8 <= height;
      if (full) {
        for (let y = 0; y < 8; y++) {
          const row = (by + y) * width + bx;
          for (let x = 0; x < 8; x++) b[y * 8 + x] = plane[row + x] - 128;
        }
      } else {
        for (let y = 0; y < 8; y++) {
          const yy = Math.min(height - 1, by + y);
          for (let x = 0; x < 8; x++) b[y * 8 + x] = plane[yy * width + Math.min(width - 1, bx + x)] - 128;
        }
      }
      // Forward: rows, then columns.
      for (let y = 0; y < 8; y++) fdct8(b, tmp, y * 8, 1);
      for (let x = 0; x < 8; x++) fdct8(tmp, b, x, 8);
      for (let i = 0; i < 64; i++) b[i] = Math.round(b[i] * inv[i]) * table[i];
      // Inverse: columns, then rows.
      for (let x = 0; x < 8; x++) idct8(b, tmp, x, 8);
      for (let y = 0; y < 8; y++) idct8(tmp, b, y * 8, 1);
      const ny = Math.min(8, height - by);
      const nx = Math.min(8, width - bx);
      for (let y = 0; y < ny; y++) {
        const row = (by + y) * width + bx;
        for (let x = 0; x < nx; x++) plane[row + x] = b[y * 8 + x] + 128;
      }
    }
  }
}

let PLANE_Y = new Float32Array(0);
let PLANE_CB = new Float32Array(0);
let PLANE_CR = new Float32Array(0);

/**
 * JPEG-style lossy compression in place: YCbCr, 4:2:0 chroma, 8x8 DCT quantisation at `quality`
 * (1..100, libjpeg scale). Reproduces blocking, ringing around thin lines and colour bleeding.
 */
export function compressBlocks(frame: Frame, quality: number): void {
  if (quality >= 100) return;
  const { width, height, data } = frame;
  const n = width * height;
  const cw = (width + 1) >> 1;
  const ch = (height + 1) >> 1;
  if (PLANE_Y.length < n) PLANE_Y = new Float32Array(n);
  if (PLANE_CB.length < cw * ch) {
    PLANE_CB = new Float32Array(cw * ch);
    PLANE_CR = new Float32Array(cw * ch);
  }
  const Y = PLANE_Y;
  const Cb = PLANE_CB;
  const Cr = PLANE_CR;
  Cb.fill(0, 0, cw * ch);
  Cr.fill(0, 0, cw * ch);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      Y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      const c = (y >> 1) * cw + (x >> 1);
      // Average the (up to) four pixels of each chroma sample.
      const wgt = (x + 1 < width || (x & 1) === 1 ? 0.5 : 1) * (y + 1 < height || (y & 1) === 1 ? 0.5 : 1);
      Cb[c] += wgt * (128 - 0.168736 * r - 0.331264 * g + 0.5 * b);
      Cr[c] += wgt * (128 + 0.5 * r - 0.418688 * g - 0.081312 * b);
    }
  }
  quantisePlane(Y, width, height, scaledTable(LUMA_Q, quality));
  const cq = scaledTable(CHROMA_Q, quality);
  quantisePlane(Cb, cw, ch, cq);
  quantisePlane(Cr, cw, ch, cq);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const c = (y >> 1) * cw + (x >> 1);
      const yy = Y[i];
      const cb = Cb[c] - 128;
      const cr = Cr[c] - 128;
      data[i * 4] = yy + 1.402 * cr;
      data[i * 4 + 1] = yy - 0.344136 * cb - 0.714136 * cr;
      data[i * 4 + 2] = yy + 1.772 * cb;
    }
  }
}

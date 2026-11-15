/**
 * Pixel buffers used by the sheet reader, and the cheap conversions between them.
 *
 * Everything in `image/` is plain typed-array code with no DOM dependency, so it runs unchanged in
 * a Web Worker and in Node tests.
 */

/** 8-bit grey image, row-major. 0 = black, 255 = white. */
export interface GrayImage {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Bilevel image, row-major, one byte per pixel: 1 = ink, 0 = paper. */
export interface BinaryImage {
  width: number;
  height: number;
  data: Uint8Array;
}

/** A point in some pixel coordinate system (x to the right, y down). */
export interface Point {
  x: number;
  y: number;
}

/** Allocate a grey image filled with one value (white by default). */
export function createGray(width: number, height: number, fill = 255): GrayImage {
  const data = new Uint8Array(width * height);
  if (fill !== 0) data.fill(fill);
  return { width, height, data };
}

/** Allocate an empty (all paper) binary image. */
export function createBinary(width: number, height: number): BinaryImage {
  return { width, height, data: new Uint8Array(width * height) };
}

/** Luma of an RGBA buffer (canvas ImageData order); transparent pixels count as white paper. */
export function rgbaToGray(rgba: ArrayLike<number>, width: number, height: number): GrayImage {
  const n = width * height;
  const out = new Uint8Array(n);
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    // Integer BT.601 weights (77 + 150 + 29 = 256).
    const l = (77 * rgba[i] + 150 * rgba[i + 1] + 29 * rgba[i + 2] + 128) >> 8;
    const a = rgba[i + 3];
    out[j] = a === 255 ? l : (l * a + 255 * (255 - a) + 127) / 255;
  }
  return { width, height, data: out };
}

/** Expand a grey image to opaque RGBA (for canvas ImageData or PNG encoders). */
export function grayToRgba(img: GrayImage): Uint8ClampedArray {
  const n = img.width * img.height;
  const out = new Uint8ClampedArray(n * 4);
  const d = img.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    out[j] = out[j + 1] = out[j + 2] = d[i];
    out[j + 3] = 255;
  }
  return out;
}

/** Render a binary image as grey (ink black on white). */
export function binaryToGray(bin: BinaryImage): GrayImage {
  const n = bin.width * bin.height;
  const out = new Uint8Array(n);
  const d = bin.data;
  for (let i = 0; i < n; i++) out[i] = d[i] ? 0 : 255;
  return { width: bin.width, height: bin.height, data: out };
}

/** Copy a rectangle out of an image; the part outside the source is filled with `fill`. */
export function cropGray(img: GrayImage, x: number, y: number, w: number, h: number, fill = 255): GrayImage {
  const out = createGray(w, h, fill);
  copyRect(img.data, img.width, img.height, out.data, x, y, w, h);
  return out;
}

/** Copy a rectangle out of a binary image; the part outside the source is paper. */
export function cropBinary(img: BinaryImage, x: number, y: number, w: number, h: number): BinaryImage {
  const out = createBinary(w, h);
  copyRect(img.data, img.width, img.height, out.data, x, y, w, h);
  return out;
}

function copyRect(src: Uint8Array, sw: number, sh: number, dst: Uint8Array, x: number, y: number, w: number, h: number): void {
  const x0 = Math.max(0, x);
  const x1 = Math.min(sw, x + w);
  if (x1 <= x0) return;
  for (let yy = Math.max(0, y); yy < Math.min(sh, y + h); yy++) {
    dst.set(src.subarray(yy * sw + x0, yy * sw + x1), (yy - y) * w + (x0 - x));
  }
}

/** Shrink by an integer factor with box averaging (the anti-aliased way to drop resolution). */
export function downscaleInt(img: GrayImage, factor: number): GrayImage {
  const f = Math.max(1, Math.floor(factor));
  if (f === 1) return img;
  const w = Math.floor(img.width / f);
  const h = Math.floor(img.height / f);
  const out = new Uint8Array(w * h);
  const src = img.data;
  const sw = img.width;
  const acc = new Uint32Array(w);
  const norm = 1 / (f * f);
  for (let y = 0; y < h; y++) {
    acc.fill(0);
    for (let dy = 0; dy < f; dy++) {
      let p = (y * f + dy) * sw;
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let dx = 0; dx < f; dx++) s += src[p++];
        acc[x] += s;
      }
    }
    const o = y * w;
    for (let x = 0; x < w; x++) out[o + x] = (acc[x] * norm + 0.5) | 0;
  }
  return { width: w, height: h, data: out };
}

/** 3x3 binomial blur ([1 2 1] in both directions); a cheap low-pass before shrinking or thresholding. */
export function blur3(img: GrayImage): GrayImage {
  const { width: w, height: h, data: s } = img;
  const tmp = new Uint16Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    tmp[o] = 3 * s[o] + s[o + (w > 1 ? 1 : 0)];
    for (let x = 1; x < w - 1; x++) tmp[o + x] = s[o + x - 1] + 2 * s[o + x] + s[o + x + 1];
    if (w > 1) tmp[o + w - 1] = s[o + w - 2] + 3 * s[o + w - 1];
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    const up = y > 0 ? o - w : o;
    const dn = y < h - 1 ? o + w : o;
    for (let x = 0; x < w; x++) out[o + x] = (tmp[up + x] + 2 * tmp[o + x] + tmp[dn + x] + 8) >> 4;
  }
  return { width: w, height: h, data: out };
}

/** Separable Gaussian blur with standard deviation `sigma` pixels (edges are clamped). */
export function gaussianBlur(img: GrayImage, sigma: number): GrayImage {
  if (sigma < 0.2) return { width: img.width, height: img.height, data: img.data.slice() };
  const r = Math.max(1, Math.ceil(sigma * 2.8));
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
    sum += k[i + r];
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const { width: w, height: h, data: s } = img;
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) {
        const xx = x + i < 0 ? 0 : x + i >= w ? w - 1 : x + i;
        a += k[i + r] * s[o + xx];
      }
      tmp[o + x] = a;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) {
        const yy = y + i < 0 ? 0 : y + i >= h ? h - 1 : y + i;
        a += k[i + r] * tmp[yy * w + x];
      }
      out[y * w + x] = a + 0.5;
    }
  }
  return { width: w, height: h, data: out };
}

/** Resize with bilinear sampling; when shrinking a lot the source is box-reduced first to avoid aliasing. */
export function resizeGray(img: GrayImage, width: number, height: number): GrayImage {
  let src = img;
  const shrink = Math.min(img.width / width, img.height / height);
  if (shrink >= 2) src = downscaleInt(img, Math.floor(shrink));
  const out = new Uint8Array(width * height);
  const sx = src.width / width;
  const sy = src.height / height;
  const sw = src.width;
  const sh = src.height;
  const d = src.data;
  for (let y = 0; y < height; y++) {
    let fy = (y + 0.5) * sy - 0.5;
    if (fy < 0) fy = 0;
    let y0 = fy | 0;
    if (y0 > sh - 2) y0 = Math.max(0, sh - 2);
    const wy = Math.min(1, fy - y0);
    const r0 = y0 * sw;
    const r1 = Math.min(sh - 1, y0 + 1) * sw;
    for (let x = 0; x < width; x++) {
      let fx = (x + 0.5) * sx - 0.5;
      if (fx < 0) fx = 0;
      let x0 = fx | 0;
      if (x0 > sw - 2) x0 = Math.max(0, sw - 2);
      const wx = Math.min(1, fx - x0);
      const x1 = Math.min(sw - 1, x0 + 1);
      const top = d[r0 + x0] + (d[r0 + x1] - d[r0 + x0]) * wx;
      const bot = d[r1 + x0] + (d[r1 + x1] - d[r1 + x0]) * wx;
      out[y * width + x] = top + (bot - top) * wy + 0.5;
    }
  }
  return { width, height, data: out };
}

/** 256-bin histogram of a grey image (optionally every `step`-th pixel for speed). */
export function histogram(img: GrayImage, step = 1): Uint32Array {
  const hist = new Uint32Array(256);
  const d = img.data;
  for (let i = 0; i < d.length; i += step) hist[d[i]]++;
  return hist;
}

/** The grey level below which `fraction` of the histogram mass lies. */
export function percentile(hist: Uint32Array, fraction: number): number {
  let total = 0;
  for (let i = 0; i < hist.length; i++) total += hist[i];
  const target = total * fraction;
  let acc = 0;
  for (let i = 0; i < hist.length; i++) {
    acc += hist[i];
    if (acc >= target) return i;
  }
  return hist.length - 1;
}

/**
 * Horizontal box mean of radius `r` (window 2r + 1). Averaging along the staff direction lifts
 * faint, noisy staff lines above the noise without thickening them; symbols smear, so use the
 * result only for finding lines.
 */
export function boxBlurHorizontal(img: GrayImage, r: number): GrayImage {
  const { width: w, height: h, data: s } = img;
  if (r < 1) return img;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let sum = 0;
    let n = 0;
    for (let x = 0; x <= Math.min(w - 1, r); x++) {
      sum += s[o + x];
      n++;
    }
    for (let x = 0; x < w; x++) {
      out[o + x] = (sum / n + 0.5) | 0;
      const add = x + r + 1;
      const sub = x - r;
      if (add < w) {
        sum += s[o + add];
        n++;
      }
      if (sub >= 0) {
        sum -= s[o + sub];
        n--;
      }
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * Box mean of radius `r` along a slanted line (dy/dx = `slope`): the same idea as
 * {@link boxBlurHorizontal} for a page that is rotated, so that staff lines are averaged along
 * themselves rather than across.
 */
export function boxBlurSheared(img: GrayImage, r: number, slope: number): GrayImage {
  if (r < 1) return img;
  if (Math.abs(slope * r) < 0.35) return boxBlurHorizontal(img, r);
  const { width: w, height: h, data: s } = img;
  const acc = new Uint16Array(w * h);
  const n = 2 * r + 1;
  for (let dx = -r; dx <= r; dx++) {
    const oy = Math.round(dx * slope);
    for (let y = 0; y < h; y++) {
      const sy = y + oy < 0 ? 0 : y + oy >= h ? h - 1 : y + oy;
      const so = sy * w;
      const o = y * w;
      const x0 = Math.max(0, -dx);
      const x1 = Math.min(w, w - dx);
      // Clamp at the left / right border.
      for (let x = 0; x < x0; x++) acc[o + x] += s[so];
      for (let x = x0; x < x1; x++) acc[o + x] += s[so + x + dx];
      for (let x = x1; x < w; x++) acc[o + x] += s[so + w - 1];
    }
  }
  const out = new Uint8Array(w * h);
  const inv = 1 / n;
  for (let i = 0; i < out.length; i++) out[i] = acc[i] * inv + 0.5;
  return { width: w, height: h, data: out };
}

/**
 * Vertical box mean of radius `r` (window 2r + 1). The counterpart of {@link boxBlurHorizontal}
 * for upright strokes: it keeps bar lines and stems, lifts them above the noise, and all but
 * erases the staff lines.
 */
export function boxBlurVertical(img: GrayImage, r: number): GrayImage {
  const { width: w, height: h, data: s } = img;
  if (r < 1) return img;
  const out = new Uint8Array(w * h);
  const acc = new Uint32Array(w);
  let n = 0;
  for (let y = 0; y <= Math.min(h - 1, r); y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) acc[x] += s[o + x];
    n++;
  }
  for (let y = 0; y < h; y++) {
    const o = y * w;
    const inv = 1 / n;
    for (let x = 0; x < w; x++) out[o + x] = acc[x] * inv + 0.5;
    const add = y + r + 1;
    const sub = y - r;
    if (add < h) {
      const a = add * w;
      for (let x = 0; x < w; x++) acc[x] += s[a + x];
      n++;
    }
    if (sub >= 0) {
      const b = sub * w;
      for (let x = 0; x < w; x++) acc[x] -= s[b + x];
      n--;
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * Binary morphology with rectangular structuring elements. Each operation is separable and uses a
 * running count, so the cost is independent of the element size.
 */
import type { BinaryImage } from './gray';

function pass(src: Uint8Array, w: number, h: number, r: number, horizontal: boolean, dilate: boolean): Uint8Array {
  if (r <= 0) return src.slice();
  const out = new Uint8Array(src.length);
  const n = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const stride = horizontal ? 1 : w;
  for (let l = 0; l < lines; l++) {
    const base = horizontal ? l * w : l;
    let count = 0;
    // Window [i - r, i + r] clipped to the image: outside counts as paper for dilation and as
    // ink for erosion, so neither operation invents an edge at the border.
    for (let i = 0; i <= Math.min(n - 1, r); i++) count += src[base + i * stride];
    for (let i = 0; i < n; i++) {
      if (dilate) {
        out[base + i * stride] = count > 0 ? 1 : 0;
      } else {
        const a = Math.max(0, i - r);
        const b = Math.min(n - 1, i + r);
        out[base + i * stride] = count === b - a + 1 ? 1 : 0;
      }
      const add = i + r + 1;
      const sub = i - r;
      if (add < n) count += src[base + add * stride];
      if (sub >= 0) count -= src[base + sub * stride];
    }
  }
  return out;
}

/** Dilate with a (2rx+1) x (2ry+1) rectangle. */
export function dilate(bin: BinaryImage, rx: number, ry = rx): BinaryImage {
  const a = pass(bin.data, bin.width, bin.height, rx, true, true);
  return { width: bin.width, height: bin.height, data: pass(a, bin.width, bin.height, ry, false, true) };
}

/** Erode with a (2rx+1) x (2ry+1) rectangle. */
export function erode(bin: BinaryImage, rx: number, ry = rx): BinaryImage {
  const a = pass(bin.data, bin.width, bin.height, rx, true, false);
  return { width: bin.width, height: bin.height, data: pass(a, bin.width, bin.height, ry, false, false) };
}

/** Opening: removes ink thinner than the element (e.g. `open(bin, 0, k)` keeps only tall strokes). */
export function open(bin: BinaryImage, rx: number, ry = rx): BinaryImage {
  return dilate(erode(bin, rx, ry), rx, ry);
}

/** Closing: fills gaps narrower than the element. */
export function close(bin: BinaryImage, rx: number, ry = rx): BinaryImage {
  return erode(dilate(bin, rx, ry), rx, ry);
}

/** Pixel-wise a AND NOT b. */
export function subtract(a: BinaryImage, b: BinaryImage): BinaryImage {
  const out = new Uint8Array(a.data.length);
  for (let i = 0; i < out.length; i++) out[i] = a.data[i] && !b.data[i] ? 1 : 0;
  return { width: a.width, height: a.height, data: out };
}

/** Number of ink pixels. */
export function countInk(bin: BinaryImage): number {
  let n = 0;
  const d = bin.data;
  for (let i = 0; i < d.length; i++) n += d[i];
  return n;
}

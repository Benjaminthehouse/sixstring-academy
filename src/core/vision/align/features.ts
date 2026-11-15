/**
 * Point features sampled from the smoothed working frame. Nothing here is a dense map: a thin-line
 * (ridge) response at any position, orientation and scale is three bilinear lookups, which is what
 * makes scoring and refining a pose hypothesis cheap.
 *
 * Sign convention: responses are positive for a BRIGHT line on a darker surround. Callers multiply
 * by the board's polarity (+1 bright frets on a dark board, -1 dark frets on maple).
 */
import type { GrayImage } from './image';

/** Bilinear lookup on raw image data (pixel centres at +0.5), clamped at the border. */
export function bil(d: Float32Array, W: number, Hh: number, x: number, y: number): number {
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
  const a = d[i] + (d[i + 1] - d[i]) * tx;
  const b = d[i + W] + (d[i + W + 1] - d[i + W]) * tx;
  return a + (b - a) * ty;
}

/**
 * Thin-line response across direction (nx, ny) (unit vector, the line's normal) at half-width `h`
 * pixels: the second difference along the normal, reduced by the first difference so that the
 * flanks of a step edge do not pass for a line. Signed: positive = bright line.
 */
export function ridgeAt(img: GrayImage, x: number, y: number, nx: number, ny: number, h: number): number {
  const d = img.data;
  const W = img.width;
  const Hh = img.height;
  const c = bil(d, W, Hh, x, y);
  const a = bil(d, W, Hh, x + nx * h, y + ny * h);
  const b = bil(d, W, Hh, x - nx * h, y - ny * h);
  const second = 2 * c - a - b;
  const first = a > b ? a - b : b - a;
  if (second >= 0) {
    const v = second - first;
    return v > 0 ? v : 0;
  }
  const v = second + first;
  return v < 0 ? v : 0;
}

/**
 * Like `ridgeAt`, additionally reduced by the line response along the line itself: a dot or a
 * corner (curved both ways) scores nothing, a straight line keeps its full response.
 */
export function straightRidgeAt(img: GrayImage, x: number, y: number, nx: number, ny: number, h: number): number {
  const d = img.data;
  const W = img.width;
  const Hh = img.height;
  const c = bil(d, W, Hh, x, y);
  const a = bil(d, W, Hh, x + nx * h, y + ny * h);
  const b = bil(d, W, Hh, x - nx * h, y - ny * h);
  const p = bil(d, W, Hh, x - ny * h, y + nx * h);
  const q = bil(d, W, Hh, x + ny * h, y - nx * h);
  const second = 2 * c - a - b;
  const along = 2 * c - p - q;
  const first = a > b ? a - b : b - a;
  if (second >= 0) {
    const v = second - first - (along > 0 ? along : 0);
    return v > 0 ? v : 0;
  }
  const v = second + first - (along < 0 ? along : 0);
  return v < 0 ? v : 0;
}

/** Signed step across direction (nx, ny): brightness at +h minus brightness at -h. */
export function stepAt(img: GrayImage, x: number, y: number, nx: number, ny: number, h: number): number {
  return bil(img.data, img.width, img.height, x + nx * h, y + ny * h) - bil(img.data, img.width, img.height, x - nx * h, y - ny * h);
}

/**
 * Blob response at a point: centre brightness minus the mean of eight samples on a circle of the
 * given radius. Positive = bright dot. Used for inlay dots and stickers.
 */
export function blobAt(img: GrayImage, x: number, y: number, radius: number): number {
  const d = img.data;
  const W = img.width;
  const Hh = img.height;
  const k = radius * 0.7071;
  const ring =
    bil(d, W, Hh, x + radius, y) +
    bil(d, W, Hh, x - radius, y) +
    bil(d, W, Hh, x, y + radius) +
    bil(d, W, Hh, x, y - radius) +
    bil(d, W, Hh, x + k, y + k) +
    bil(d, W, Hh, x - k, y + k) +
    bil(d, W, Hh, x + k, y - k) +
    bil(d, W, Hh, x - k, y - k);
  return bil(d, W, Hh, x, y) - ring / 8;
}

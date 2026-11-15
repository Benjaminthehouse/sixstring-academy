/**
 * Rectified strips: a quadrilateral of the image resampled onto a small grid whose rows run along
 * the neck and whose columns run across it, plus the 1-D ridge filter that makes fret wires (thin
 * bright or dark lines across the rows) stand out.
 *
 * A strip is "trapezoid" rectified: row i is the straight line between the points at fraction f_i
 * of the start edge (A0 -> A1) and of the end edge (B0 -> B1), so when A0-B0 and A1-B1 are the two
 * edges of the board every row follows the pencil of strings between them.
 */
import type { Point } from '../types';
import type { Image32 } from './image';

/** Where a strip sits in the image. */
export interface StripGeometry {
  /** Start edge (column 0): row fraction 0 and row fraction 1. */
  a0: Point;
  a1: Point;
  /** End edge (last column): row fraction 0 and row fraction 1. */
  b0: Point;
  b1: Point;
  /** Row fractions of the first and the last row (outside 0..1 = margin beyond the edges). */
  fLo: number;
  fHi: number;
  rows: number;
  cols: number;
}

/** A sampled strip. `valid` is 0 where the sample fell outside the image. */
export interface Strip {
  geom: StripGeometry;
  data: Float32Array;
  valid: Uint8Array;
  rows: number;
  cols: number;
}

/** Row fraction of a (possibly fractional) row index. */
export function rowFraction(g: StripGeometry, row: number): number {
  return g.rows > 1 ? g.fLo + ((g.fHi - g.fLo) * row) / (g.rows - 1) : (g.fLo + g.fHi) / 2;
}

/** Row index (fractional) of a row fraction. */
export function fractionRow(g: StripGeometry, f: number): number {
  return g.rows > 1 ? ((f - g.fLo) / (g.fHi - g.fLo)) * (g.rows - 1) : 0;
}

/** Image position of a (fractional) strip cell. */
export function stripToImage(g: StripGeometry, row: number, col: number): Point {
  const f = rowFraction(g, row);
  const t = g.cols > 1 ? col / (g.cols - 1) : 0;
  const sx = g.a0.x + (g.a1.x - g.a0.x) * f;
  const sy = g.a0.y + (g.a1.y - g.a0.y) * f;
  const ex = g.b0.x + (g.b1.x - g.b0.x) * f;
  const ey = g.b0.y + (g.b1.y - g.b0.y) * f;
  return { x: sx + (ex - sx) * t, y: sy + (ey - sy) * t };
}

/** Resample the image under a strip geometry (bilinear). Pass `out` to reuse its buffers when the size matches. */
export function sampleStrip(img: Image32, geom: StripGeometry, out?: Strip): Strip {
  const { rows, cols } = geom;
  const n = rows * cols;
  const strip: Strip = out && out.data.length >= n ? out : { geom, data: new Float32Array(n), valid: new Uint8Array(n), rows, cols };
  strip.geom = geom;
  strip.rows = rows;
  strip.cols = cols;
  const w = img.width;
  const h = img.height;
  const src = img.data;
  const dst = strip.data;
  const valid = strip.valid;
  const maxX = w - 1.001;
  const maxY = h - 1.001;
  for (let i = 0; i < rows; i++) {
    const f = rowFraction(geom, i);
    const sx = geom.a0.x + (geom.a1.x - geom.a0.x) * f - 0.5;
    const sy = geom.a0.y + (geom.a1.y - geom.a0.y) * f - 0.5;
    const ex = geom.b0.x + (geom.b1.x - geom.b0.x) * f - 0.5;
    const ey = geom.b0.y + (geom.b1.y - geom.b0.y) * f - 0.5;
    const dx = cols > 1 ? (ex - sx) / (cols - 1) : 0;
    const dy = cols > 1 ? (ey - sy) / (cols - 1) : 0;
    let o = i * cols;
    for (let j = 0; j < cols; j++, o++) {
      let fx = sx + dx * j;
      let fy = sy + dy * j;
      let ok = 1;
      if (fx < 0) {
        ok = fx < -0.5 ? 0 : 1;
        fx = 0;
      } else if (fx > maxX) {
        ok = fx > maxX + 0.5 ? 0 : 1;
        fx = maxX;
      }
      if (fy < 0) {
        if (fy < -0.5) ok = 0;
        fy = 0;
      } else if (fy > maxY) {
        if (fy > maxY + 0.5) ok = 0;
        fy = maxY;
      }
      const x0 = fx | 0;
      const y0 = fy | 0;
      const ax = fx - x0;
      const ay = fy - y0;
      const k = y0 * w + x0;
      const top = src[k] + (src[k + 1] - src[k]) * ax;
      const bot = src[k + w] + (src[k + w + 1] - src[k + w]) * ax;
      dst[o] = top + (bot - top) * ay;
      valid[o] = ok;
    }
  }
  return strip;
}

/**
 * Signed ridge strength along the columns of every row: positive where a pixel is brighter than
 * both neighbours `d` columns away (by the smaller of the two differences), negative where it is
 * darker than both, zero on slopes and steps. A fret wire crossing the rows is a ridge; the edge of
 * a finger or a book is a step and gives nothing.
 */
export function ridgeAlongRows(strip: Strip, d: number, out?: Float32Array): Float32Array {
  const { rows, cols, data, valid } = strip;
  const n = rows * cols;
  const r = out && out.length >= n ? out : new Float32Array(n);
  for (let i = 0; i < rows; i++) {
    const o = i * cols;
    for (let j = 0; j < d && j < cols; j++) r[o + j] = 0;
    for (let j = Math.max(d, cols - d); j < cols; j++) r[o + j] = 0;
    for (let j = d; j < cols - d; j++) {
      const k = o + j;
      if (!(valid[k] && valid[k - d] && valid[k + d])) {
        r[k] = 0;
        continue;
      }
      const a = data[k] - data[k - d];
      const b = data[k] - data[k + d];
      if (a > 0 && b > 0) r[k] = a < b ? a : b;
      else if (a < 0 && b < 0) r[k] = a > b ? a : b;
      else r[k] = 0;
    }
  }
  return r;
}

/** Same filter across the rows (per column): strings and board edges running along the strip. */
export function ridgeAcrossRows(strip: Strip, d: number, out?: Float32Array): Float32Array {
  const { rows, cols, data, valid } = strip;
  const n = rows * cols;
  const r = out && out.length >= n ? out : new Float32Array(n);
  r.fill(0, 0, n);
  const off = d * cols;
  for (let i = d; i < rows - d; i++) {
    const o = i * cols;
    for (let j = 0; j < cols; j++) {
      const k = o + j;
      if (!(valid[k] && valid[k - off] && valid[k + off])) continue;
      const a = data[k] - data[k - off];
      const b = data[k] - data[k + off];
      if (a > 0 && b > 0) r[k] = a < b ? a : b;
      else if (a < 0 && b < 0) r[k] = a > b ? a : b;
    }
  }
  return r;
}

/** Linear interpolation into one row of a strip-shaped array (0 outside). */
export function sampleRow(values: Float32Array, cols: number, row: number, col: number): number {
  if (!(col >= 0 && col <= cols - 1)) return 0;
  const j = col | 0;
  const a = col - j;
  const o = row * cols + j;
  return a > 0 ? values[o] + (values[o + 1] - values[o]) * a : values[o];
}

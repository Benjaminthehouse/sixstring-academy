/**
 * The board seen through a pose: a strip resampled with the pose's own homography so that, if the
 * pose is right, every fret wire is exactly one column and every string exactly one row. Columns
 * are spaced evenly in IMAGE pixels along the board's centre line (so near and far frets are sampled
 * at the resolution the camera gave them) and rows evenly across the board in units of its local
 * half-width: eta = -1 is the bass edge, +1 the treble edge, whatever the taper.
 */
import { boardCenterY, boardWidthAt, fretX } from '../geometry';
import type { Mat3, NeckModel, Point } from '../types';
import type { Image32 } from './image';
import type { Strip } from './strip';

/** A pose-rectified strip and the maps between its cells, the neck plane and the image. */
export interface Rectified {
  strip: Strip;
  rows: number;
  cols: number;
  /** Largest |eta| sampled (row 0 is -etaMax, the last row +etaMax). */
  etaMax: number;
  /** Plane x of the first and last column. */
  xStart: number;
  xEnd: number;
  /** Image pixels (of the sampled image) between neighbouring columns on the centre line. */
  colStep: number;
  /** Homography from plane mm to pixels of the sampled image. */
  H: Mat3;
  model: NeckModel;
  // Coefficients of the centre-line arc length s(x) = k (x - xStart) / w(x) and its inverse.
  k: number;
  w0: number;
  w1: number;
}

/** Fractional column of a plane position x. */
export function colOfX(r: Rectified, x: number): number {
  const w = r.w0 + r.w1 * x;
  return (r.k * (x - r.xStart)) / w / r.colStep;
}

/** Plane position x of a (fractional) column. */
export function xOfCol(r: Rectified, col: number): number {
  const s = col * r.colStep;
  // s w(x) = k (x - xStart)  ->  x (k - s w1) = s w0 + k xStart
  return (s * r.w0 + r.k * r.xStart) / (r.k - s * r.w1);
}

/** eta of a (fractional) row. */
export function etaOfRow(r: Rectified, row: number): number {
  return r.rows > 1 ? -r.etaMax + (2 * r.etaMax * row) / (r.rows - 1) : 0;
}

/** Fractional row of an eta. */
export function rowOfEta(r: Rectified, eta: number): number {
  return ((eta + r.etaMax) / (2 * r.etaMax)) * (r.rows - 1);
}

/** Neck-plane point of a (fractional) strip cell. */
export function cellToPlane(r: Rectified, row: number, col: number): Point {
  const x = xOfCol(r, col);
  return { x, y: boardCenterY(r.model) + (etaOfRow(r, row) * boardWidthAt(r.model, x)) / 2 };
}

/** Image point (pixels of the sampled image) of a (fractional) strip cell. */
export function cellToImage(r: Rectified, row: number, col: number): Point {
  const p = cellToPlane(r, row, col);
  const H = r.H;
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
}

/**
 * The stretch of the board centre line that lies inside the image, as a plane-x interval within
 * [fret `fromFret`, fret `toFret`] (fractional, may be negative: beyond the nut). Null when none does.
 */
export function visibleRange(H: Mat3, model: NeckModel, width: number, height: number, fromFret: number, toFret: number, margin = 1): [number, number] | null {
  const yc = boardCenterY(model);
  let lo = NaN;
  let hi = NaN;
  const steps = Math.max(8, Math.ceil((toFret - fromFret) * 4));
  let sign = 0;
  for (let k = 0; k <= steps; k++) {
    const x = fretX(model, fromFret + ((toFret - fromFret) * k) / steps);
    const w = H[6] * x + H[7] * yc + H[8];
    if (sign === 0) sign = w > 0 ? 1 : -1;
    if (w * sign <= 1e-9) continue;
    const u = (H[0] * x + H[1] * yc + H[2]) / w;
    const v = (H[3] * x + H[4] * yc + H[5]) / w;
    if (u < margin || u > width - margin || v < margin || v > height - margin) continue;
    if (Number.isNaN(lo)) lo = x;
    hi = x;
  }
  return Number.isNaN(lo) || !(hi > lo) ? null : [lo, hi];
}

/**
 * Resample the board under a pose. `H` maps plane mm to pixels of `img`. `xStart..xEnd` is the plane
 * interval to cover; `rowsAcross` is the number of rows across the board itself (the strip has
 * margins of (etaMax - 1) half-widths on both sides). Pass `reuse` to recycle buffers.
 */
export function rectify(img: Image32, H: Mat3, model: NeckModel, xStart: number, xEnd: number, etaMax: number, maxCols: number, maxRowsAcross: number, reuse?: Rectified): Rectified | null {
  const yc = boardCenterY(model);
  const wa = H[6] * xStart + H[7] * yc + H[8];
  const wb = H[6] * xEnd + H[7] * yc + H[8];
  if (!(wa * wb > 0)) return null;
  const pax = (H[0] * xStart + H[1] * yc + H[2]) / wa;
  const pay = (H[3] * xStart + H[4] * yc + H[5]) / wa;
  const pbx = (H[0] * xEnd + H[1] * yc + H[2]) / wb;
  const pby = (H[3] * xEnd + H[4] * yc + H[5]) / wb;
  const length = Math.hypot(pbx - pax, pby - pay);
  if (!(length > 8) || !Number.isFinite(length)) return null;
  // Board width in pixels at the middle decides the row count.
  const xm = (xStart + xEnd) / 2;
  const half = boardWidthAt(model, xm) / 2;
  const wm0 = H[6] * xm + H[7] * (yc - half) + H[8];
  const wm1 = H[6] * xm + H[7] * (yc + half) + H[8];
  if (!(wm0 * wa > 0 && wm1 * wa > 0)) return null;
  const widthPx = Math.hypot(
    (H[0] * xm + H[1] * (yc + half) + H[2]) / wm1 - (H[0] * xm + H[1] * (yc - half) + H[2]) / wm0,
    (H[3] * xm + H[4] * (yc + half) + H[5]) / wm1 - (H[3] * xm + H[4] * (yc - half) + H[5]) / wm0,
  );
  if (!(widthPx > 4)) return null;
  const across = Math.max(10, Math.min(maxRowsAcross, Math.round(widthPx)));
  const rows = Math.round(across * etaMax) + 1;
  const cols = Math.max(8, Math.min(maxCols, Math.round(length) + 1));
  const colStep = length / (cols - 1);
  const n = rows * cols;
  const strip: Strip =
    reuse && reuse.strip.data.length >= n
      ? reuse.strip
      : { geom: { a0: { x: 0, y: 0 }, a1: { x: 0, y: 0 }, b0: { x: 0, y: 0 }, b1: { x: 0, y: 0 }, fLo: 0, fHi: 1, rows, cols }, data: new Float32Array(n), valid: new Uint8Array(n), rows, cols };
  strip.rows = rows;
  strip.cols = cols;
  // Arc length along the centre line: s(x) = k (x - xStart) / w(x), with w normalised to 1 at xStart.
  const w1 = H[6] / wa;
  const w0 = (H[7] * yc + H[8]) / wa;
  const wEnd = w0 + w1 * xEnd;
  const k = (length * wEnd) / (xEnd - xStart);
  const out: Rectified = { strip, rows, cols, etaMax, xStart, xEnd, colStep, H, model, k, w0, w1 };

  const src = img.data;
  const iw = img.width;
  const ih = img.height;
  const maxX = iw - 1.001;
  const maxY = ih - 1.001;
  const dst = strip.data;
  const valid = strip.valid;
  const taper = (model.width12 - model.nutWidth) / (model.scaleLength / 2);
  for (let j = 0; j < cols; j++) {
    const x = xOfCol(out, j);
    const halfW = (model.nutWidth + taper * x) / 2;
    // Homogeneous image coordinates are linear in eta along a column.
    const bu = H[0] * x + H[1] * yc + H[2];
    const bv = H[3] * x + H[4] * yc + H[5];
    const bw = H[6] * x + H[7] * yc + H[8];
    const du = H[1] * halfW;
    const dv = H[4] * halfW;
    const dw = H[7] * halfW;
    for (let i = 0; i < rows; i++) {
      const eta = -etaMax + (2 * etaMax * i) / (rows - 1);
      const w = bw + dw * eta;
      let fx = (bu + du * eta) / w - 0.5;
      let fy = (bv + dv * eta) / w - 0.5;
      let ok = 1;
      if (!(fx >= 0)) {
        if (!(fx >= -0.5)) ok = 0;
        fx = 0;
      } else if (fx > maxX) {
        if (fx > maxX + 0.5) ok = 0;
        fx = maxX;
      }
      if (!(fy >= 0)) {
        if (!(fy >= -0.5)) ok = 0;
        fy = 0;
      } else if (fy > maxY) {
        if (fy > maxY + 0.5) ok = 0;
        fy = maxY;
      }
      const x0 = fx | 0;
      const y0 = fy | 0;
      const ax = fx - x0;
      const ay = fy - y0;
      const q = y0 * iw + x0;
      const top = src[q] + (src[q + 1] - src[q]) * ax;
      const bot = src[q + iw] + (src[q + iw + 1] - src[q + iw]) * ax;
      const o = i * cols + j;
      dst[o] = top + (bot - top) * ay;
      valid[o] = ok;
    }
  }
  return out;
}

/**
 * Helpers for tracking: where will the board be in the next frame, and a cheap rigid search for
 * when it moved further than the fine alignment can follow.
 */
import { applyHomography, boardEdgeY, controlPlanePoints, fretX, homographyFromPoints } from '../geometry';
import type { Mat3, NeckModel, Point } from '../types';
import type { GrayImage } from './image';
import { wireResponse, type FretSpan } from './refine';

/** Image positions of the four control points of a homography (board corners at the nut and the 12th fret). */
export function controlPointsOf(H: Mat3, model: NeckModel): Point[] {
  return controlPlanePoints(model).map((p) => applyHomography(H, p.x, p.y));
}

/** Largest distance between corresponding control points of two homographies, in pixels. */
export function controlDistance(a: Point[], b: Point[]): number {
  let worst = 0;
  for (let i = 0; i < 4; i++) worst = Math.max(worst, Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y));
  return worst;
}

/**
 * Constant-velocity prediction as an image shift: the mean displacement of the control points
 * between the two previous poses, times `ratio`, capped at `maxStep` pixels (a jerk must not fling
 * the prediction out of the frame).
 */
export function predictShift(before: Point[], current: Point[], ratio: number, maxStep: number): { dx: number; dy: number } {
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < 4; i++) {
    dx += (current[i].x - before[i].x) * ratio;
    dy += (current[i].y - before[i].y) * ratio;
  }
  dx /= 4;
  dy /= 4;
  const len = Math.hypot(dx, dy);
  if (len > maxStep) {
    dx *= maxStep / len;
    dy *= maxStep / len;
  }
  return { dx, dy };
}

/**
 * Move a pose by about (dx, dy) pixels the way a rigid board would: by turning it about the camera
 * centre (focal length `focalPx`, principal point at the frame centre). Unlike adding the shift to
 * the homography, this keeps the pose inside the family of rigid views of the same board.
 */
export function shiftRigidly(H: Mat3, focalPx: number, width: number, height: number, dx: number, dy: number): Mat3 {
  if (dx === 0 && dy === 0) return H;
  const cx = width / 2;
  const cy = height / 2;
  const f = focalPx;
  // Small rotation: about the camera's y axis for a shift along x, about its x axis for a shift along y.
  const wy = Math.atan2(dx, f);
  const wx = -Math.atan2(dy, f);
  const cyR = Math.cos(wy);
  const syR = Math.sin(wy);
  const cxR = Math.cos(wx);
  const sxR = Math.sin(wx);
  // R = Rx(wx) * Ry(wy)
  const R = [cyR, 0, syR, sxR * syR, cxR, -sxR * cyR, -cxR * syR, sxR, cxR * cyR];
  // G = K^-1 H, then H' = K R G.
  const out: number[] = [];
  const G = [(H[0] - cx * H[6]) / f, (H[1] - cx * H[7]) / f, (H[2] - cx * H[8]) / f, (H[3] - cy * H[6]) / f, (H[4] - cy * H[7]) / f, (H[5] - cy * H[8]) / f, H[6], H[7], H[8]];
  const RG: number[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) RG.push(R[r * 3] * G[c] + R[r * 3 + 1] * G[3 + c] + R[r * 3 + 2] * G[6 + c]);
  for (let c = 0; c < 3; c++) {
    out[c] = f * RG[c] + cx * RG[6 + c];
    out[3 + c] = f * RG[3 + c] + cy * RG[6 + c];
    out[6 + c] = RG[6 + c];
  }
  const norm = out[8];
  return out.map((v) => v / norm) as unknown as Mat3;
}

/** Blend two sets of control points and return the homography through the result. */
export function blendHomography(model: NeckModel, a: Point[], b: Point[], t: number): Mat3 | null {
  const pts = a.map((p, i) => ({ x: p.x + (b[i].x - p.x) * t, y: p.y + (b[i].y - p.y) * t }));
  return homographyFromPoints(controlPlanePoints(model), pts);
}

/** Positions across the board where the wires are sampled; the two outside [0, 1] lie beyond the edges and must be EMPTY. */
const SHIFT_LATERAL = [-0.14, 0.12, 0.35, 0.65, 0.88, 1.14];
let SX = new Float32Array(256);
let SY = new Float32Array(256);
let SNX = new Float32Array(256);
let SNY = new Float32Array(256);
let SSIGN = new Float32Array(256);

/** Result of `searchShift`. */
export interface ShiftResult {
  dx: number;
  dy: number;
  /** Summed wire response at the best shift and at zero shift. */
  best: number;
  zero: number;
}

/**
 * Rigid 2-D search: slide the projected fret wires over the image and return the shift with the
 * strongest summed wire response. Only the most widely spaced third of the frets takes part, and
 * the range along the neck stays below half their spacing: beyond that a shift by a whole fret
 * looks as good as the truth. Across the neck the range is `acrossPx`; samples just beyond both
 * board edges count negatively, so the wires' ends pin the shift along them. Ties prefer the smaller shift.
 */
export function searchShift(fine: GrayImage, coarse: GrayImage, H: Mat3, model: NeckModel, polarity: number, span: FretSpan, alongPx: number, acrossPx: number, step = 2): ShiftResult {
  const W = fine.width;
  const Hh = fine.height;
  const yc = model.nutWidth / 2;
  // Spacing of every fret in view, to pick the widely spaced ones.
  const spacings: { n: number; spacing: number }[] = [];
  for (let n = span.min; n <= span.max; n++) {
    const x = fretX(model, n);
    const q = H[6] * x + H[7] * yc + H[8];
    if (!(q > 1e-9)) continue;
    const u = (H[0] * x + H[1] * yc + H[2]) / q;
    const v = (H[3] * x + H[4] * yc + H[5]) / q;
    if (u < 4 || v < 4 || u > W - 4 || v > Hh - 4) continue;
    const ax = (H[0] - H[6] * u) / q;
    const ay = (H[3] - H[6] * v) / q;
    spacings.push({ n, spacing: (fretX(model, n + 1) - x) * Math.hypot(ax, ay) });
  }
  if (spacings.length < 3) return { dx: 0, dy: 0, best: 0, zero: 0 };
  spacings.sort((a, b) => b.spacing - a.spacing);
  const use = spacings.slice(0, Math.max(4, Math.ceil(spacings.length / 3)));
  const minSpacing = use[use.length - 1].spacing;
  let count = 0;
  let ux = 0;
  let uy = 0;
  const need = use.length * SHIFT_LATERAL.length;
  if (SX.length < need) {
    SX = new Float32Array(need);
    SY = new Float32Array(need);
    SNX = new Float32Array(need);
    SNY = new Float32Array(need);
    SSIGN = new Float32Array(need);
  }
  for (const item of use) {
    const x = fretX(model, item.n);
    const y0 = boardEdgeY(model, x, 'bass');
    const y1 = boardEdgeY(model, x, 'treble');
    for (const f of SHIFT_LATERAL) {
      const y = y0 + (y1 - y0) * f;
      const q = H[6] * x + H[7] * y + H[8];
      if (!(q > 1e-9)) continue;
      const u = (H[0] * x + H[1] * y + H[2]) / q;
      const v = (H[3] * x + H[4] * y + H[5]) / q;
      if (u < 4 || v < 4 || u > W - 4 || v > Hh - 4) continue;
      let fx = (H[1] - H[7] * u) / q;
      let fy = (H[4] - H[7] * v) / q;
      const fl = Math.hypot(fx, fy) || 1;
      fx /= fl;
      fy /= fl;
      let nx = -fy;
      let ny = fx;
      const ax = (H[0] - H[6] * u) / q;
      const ay = (H[3] - H[6] * v) / q;
      if (nx * ax + ny * ay < 0) {
        nx = -nx;
        ny = -ny;
      }
      SX[count] = u;
      SY[count] = v;
      SNX[count] = nx;
      SNY[count] = ny;
      SSIGN[count] = f < 0 || f > 1 ? -1 : 1;
      ux += nx;
      uy += ny;
      count++;
    }
  }
  if (count < 6) return { dx: 0, dy: 0, best: 0, zero: 0 };
  const ul = Math.hypot(ux, uy) || 1;
  ux /= ul;
  uy /= ul;
  const along = Math.min(alongPx, 0.45 * minSpacing);
  const stepsA = Math.max(0, Math.floor(along / step));
  const stepsB = Math.max(0, Math.floor(acrossPx / step));
  let best = -1;
  let zero = 0;
  let bestDx = 0;
  let bestDy = 0;
  for (let a = -stepsA; a <= stepsA; a++) {
    for (let b = -stepsB; b <= stepsB; b++) {
      const dx = ux * a * step - uy * b * step;
      const dy = uy * a * step + ux * b * step;
      let sum = 0;
      for (let i = 0; i < count; i++) {
        const r = wireResponse(fine, coarse, SX[i] + dx, SY[i] + dy, SNX[i], SNY[i], polarity);
        // Wire on the board counts for the shift, wire beyond the edges against it: that is what
        // makes the score sensitive to sliding ALONG the wires.
        if (r > 0) sum += r * SSIGN[i];
      }
      if (a === 0 && b === 0) zero = sum;
      // Prefer the smaller shift among near-equals.
      const penalised = sum * (1 - 0.004 * (Math.abs(a) + Math.abs(b)) * step);
      if (penalised > best) {
        best = penalised;
        bestDx = dx;
        bestDy = dy;
      }
    }
  }
  return { dx: bestDx, dy: bestDy, best, zero };
}

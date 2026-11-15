/**
 * Shared geometry for the live fretboard camera: the neck model, homographies, projection between
 * neck-plane millimetres and image pixels, pose construction / smoothing, and pose-error metrics.
 *
 * Pure maths: no DOM, no allocation in the per-point helpers that take an `out` argument, no
 * `Math.random` (anything stochastic takes a seeded generator). Coordinate conventions are documented
 * once, at the top of `./types.ts`.
 */
import type {
  DetectOptions,
  Frame,
  FretRange,
  FretboardPose,
  GrayFrame,
  Line,
  MarkerHint,
  Mat3,
  NeckModel,
  NeckPresetId,
  NumberingSource,
  PixelLocation,
  Point,
} from './types';

// ---------------------------------------------------------------------------------------------
// Seeded random numbers
// ---------------------------------------------------------------------------------------------

/** Deterministic uniform generator in [0, 1) (mulberry32). Use instead of `Math.random`. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// Neck model
// ---------------------------------------------------------------------------------------------

/** Default neck dimensions (mm) for the three guitar families. */
export const NECK_PRESETS: Readonly<Record<NeckPresetId, NeckModel>> = {
  steel: {
    preset: 'steel',
    scaleLength: 645,
    nutWidth: 43,
    width12: 54,
    stringSpanNut: 36,
    stringSpanBridge: 54.5,
    stringCount: 6,
    fretCount: 20,
    bodyJoinFret: 14,
  },
  electric: {
    preset: 'electric',
    scaleLength: 648,
    nutWidth: 42,
    width12: 52,
    stringSpanNut: 35,
    stringSpanBridge: 52.5,
    stringCount: 6,
    fretCount: 22,
    bodyJoinFret: 17,
  },
  classical: {
    preset: 'classical',
    scaleLength: 650,
    nutWidth: 52,
    width12: 62,
    stringSpanNut: 43,
    stringSpanBridge: 58,
    stringCount: 6,
    fretCount: 19,
    bodyJoinFret: 12,
  },
};

/** Frets that carry an inlay; the marker sits mid-way between wire n-1 and wire n. */
export const INLAY_FRETS: readonly number[] = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
/** Frets whose inlay is a double dot. */
export const DOUBLE_INLAY_FRETS: readonly number[] = [12, 24];
/** Where a note marker sits inside its cell: this fraction of the way from wire n-1 to wire n. */
export const MARKER_CELL_FRACTION = 0.68;
/** Open-string markers are drawn this far behind the nut (toward the headstock), in mm. */
export const OPEN_MARKER_OFFSET_MM = 10;
/** The board continues this far past the last fret wire, in mm. */
export const BOARD_OVERHANG_MM = 7;

/** A neck model from a preset id (default 'steel') or an existing model, with optional overrides. */
export function neckModel(base: NeckPresetId | NeckModel = 'steel', overrides?: Partial<NeckModel>): NeckModel {
  const from = typeof base === 'string' ? NECK_PRESETS[base] : base;
  if (!overrides) return { ...from };
  return { ...from, ...overrides, preset: overrides.preset ?? 'custom' };
}

/** Distance from the nut to fret wire `fret` in mm (fret 0 = nut). Works for fractional frets. */
export function fretX(model: NeckModel, fret: number): number {
  return model.scaleLength * (1 - Math.pow(2, -fret / 12));
}

/** Continuous fret coordinate of a distance from the nut (inverse of `fretX`); Infinity at the saddle. */
export function fretAtX(model: NeckModel, x: number): number {
  const rest = 1 - x / model.scaleLength;
  return rest > 0 ? -12 * Math.log2(rest) : Infinity;
}

/** Fret cell a distance from the nut falls in: 0 at or behind the nut, n between wire n-1 and wire n. */
export function fretCellAtX(model: NeckModel, x: number): number {
  if (!(x > 0)) return 0;
  const n = fretAtX(model, x);
  return Number.isFinite(n) ? Math.ceil(n - 1e-9) : model.fretCount + 1;
}

/** Distance between wire `fret` and the wire before it (the first cell for fret 0), in mm. */
export function fretSpacing(model: NeckModel, fret: number): number {
  const n = Math.max(1, fret);
  return fretX(model, n) - fretX(model, n - 1);
}

/** y of the board centre line (it is straight). */
export function boardCenterY(model: NeckModel): number {
  return model.nutWidth / 2;
}

/** Board width at distance x from the nut (linear taper through the nut and 12th-fret widths). */
export function boardWidthAt(model: NeckModel, x: number): number {
  return model.nutWidth + ((model.width12 - model.nutWidth) * x) / (model.scaleLength / 2);
}

/** y of the bass-side or treble-side board edge at distance x from the nut. */
export function boardEdgeY(model: NeckModel, x: number, side: 'bass' | 'treble'): number {
  const half = boardWidthAt(model, x) / 2;
  return model.nutWidth / 2 + (side === 'bass' ? -half : half);
}

/** x at which the board ends (a little past the last fret). */
export function boardEndX(model: NeckModel): number {
  return fretX(model, model.fretCount) + BOARD_OVERHANG_MM;
}

/** Distance between the two outer strings at x. */
export function stringSpanAt(model: NeckModel, x: number): number {
  return model.stringSpanNut + ((model.stringSpanBridge - model.stringSpanNut) * x) / model.scaleLength;
}

/** Distance between adjacent strings at x. */
export function stringSpacingAt(model: NeckModel, x: number): number {
  return stringSpanAt(model, x) / Math.max(1, model.stringCount - 1);
}

/** y of a string (1 = treble side ... stringCount = bass side) at distance x from the nut. */
export function stringY(model: NeckModel, string: number, x: number): number {
  const t = model.stringCount > 1 ? (model.stringCount - string) / (model.stringCount - 1) : 0.5;
  return model.nutWidth / 2 + (t - 0.5) * stringSpanAt(model, x);
}

/** Nearest string to a neck-plane point and the signed offset in string spacings (+ = toward treble). */
export function nearestStringAt(model: NeckModel, x: number, y: number): { string: number; offset: number } {
  const n = model.stringCount;
  const idx = ((y - model.nutWidth / 2) / stringSpanAt(model, x) + 0.5) * (n - 1);
  const i = Math.min(n - 1, Math.max(0, Math.round(idx)));
  return { string: n - i, offset: idx - i };
}

/** Neck-plane position of the note marker for (string, fret): on the string, just behind the wire. */
export function markerPlanePosition(model: NeckModel, string: number, fret: number): Point {
  const x =
    fret <= 0
      ? -OPEN_MARKER_OFFSET_MM
      : fretX(model, fret - 1) + MARKER_CELL_FRACTION * (fretX(model, fret) - fretX(model, fret - 1));
  return { x, y: stringY(model, string, Math.max(0, x)) };
}

/** Neck-plane centres of the inlay dots this model would carry (double dots give two entries). */
export function inlayPositions(model: NeckModel): { fret: number; x: number; y: number }[] {
  const out: { fret: number; x: number; y: number }[] = [];
  const yc = model.nutWidth / 2;
  for (const fret of INLAY_FRETS) {
    if (fret > model.fretCount) break;
    const x = (fretX(model, fret - 1) + fretX(model, fret)) / 2;
    if (DOUBLE_INLAY_FRETS.includes(fret)) {
      const dy = stringSpanAt(model, x) * 0.3;
      out.push({ fret, x, y: yc - dy }, { fret, x, y: yc + dy });
    } else {
      out.push({ fret, x, y: yc });
    }
  }
  return out;
}

/**
 * Neck-plane centres of the stickers described by a marker-mode hint: mid-way between wire n-1 and
 * wire n (like an inlay), on the bass edge (the default), the treble edge, or the board centre line.
 */
export function markerHintPlanePoints(model: NeckModel, hint: MarkerHint): Point[] {
  return hint.frets.map((fret) => {
    const x = (fretX(model, fret - 1) + fretX(model, fret)) / 2;
    const y = hint.placement === 'board' ? model.nutWidth / 2 : boardEdgeY(model, x, hint.placement === 'treble-edge' ? 'treble' : 'bass');
    return { x, y };
  });
}

// ---------------------------------------------------------------------------------------------
// 3x3 matrices and homographies
// ---------------------------------------------------------------------------------------------

/** The identity homography. */
export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Matrix product a * b (as a homography: apply b first, then a). */
export function multiply(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

/** Compose homographies left to right in application order: `compose(A, B, C)` applies A, then B, then C. */
export function composeHomographies(first: Mat3, ...rest: Mat3[]): Mat3 {
  let out = first;
  for (const next of rest) out = multiply(next, out);
  return out;
}

/** Determinant of a 3x3 matrix. */
export function determinant(m: Mat3): number {
  return (
    m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6])
  );
}

/** Transpose of a 3x3 matrix. */
export function transpose(m: Mat3): Mat3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

/** Inverse homography, or null when the matrix is singular or not finite. */
export function invertHomography(m: Mat3): Mat3 | null {
  const c0 = m[4] * m[8] - m[5] * m[7];
  const c1 = m[5] * m[6] - m[3] * m[8];
  const c2 = m[3] * m[7] - m[4] * m[6];
  const det = m[0] * c0 + m[1] * c1 + m[2] * c2;
  let scale = 0;
  for (let i = 0; i < 9; i++) scale = Math.max(scale, Math.abs(m[i]));
  if (!Number.isFinite(det) || scale === 0 || Math.abs(det) <= 1e-14 * scale * scale * scale) return null;
  const inv = 1 / det;
  return [
    c0 * inv,
    (m[2] * m[7] - m[1] * m[8]) * inv,
    (m[1] * m[5] - m[2] * m[4]) * inv,
    c1 * inv,
    (m[0] * m[8] - m[2] * m[6]) * inv,
    (m[2] * m[3] - m[0] * m[5]) * inv,
    c2 * inv,
    (m[1] * m[6] - m[0] * m[7]) * inv,
    (m[0] * m[4] - m[1] * m[3]) * inv,
  ];
}

/** Scale a homography so its last entry is 1 (or its largest entry is 1 when the last is ~0). */
export function normalizeHomography(m: Mat3): Mat3 {
  let scale = m[8];
  let max = 0;
  for (let i = 0; i < 9; i++) max = Math.max(max, Math.abs(m[i]));
  if (Math.abs(scale) < 1e-12 * max) scale = max;
  if (scale === 0) return m;
  return [m[0] / scale, m[1] / scale, m[2] / scale, m[3] / scale, m[4] / scale, m[5] / scale, m[6] / scale, m[7] / scale, m[8] / scale];
}

/** Map a point through a homography. Coordinates are not finite when the point maps to infinity. */
export function applyHomography(H: Mat3, x: number, y: number): Point {
  const w = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}

/** The projective weight of a point; its sign changes across the plane's horizon line. */
export function homogeneousW(H: Mat3, x: number, y: number): number {
  return H[6] * x + H[7] * y + H[8];
}

/** Sign (+1 / -1) of the projective weight on the board itself, so tests do not depend on how H is scaled. */
function boardSideSign(H: Mat3, model: NeckModel): number {
  return H[6] * (model.scaleLength / 4) + H[7] * (model.nutWidth / 2) + H[8] >= 0 ? 1 : -1;
}

/** Jacobian [du/dx, du/dy, dv/dx, dv/dy] of a homography at a point: local pixels per millimetre. */
export function homographyJacobian(H: Mat3, x: number, y: number): [number, number, number, number] {
  const w = H[6] * x + H[7] * y + H[8];
  const u = (H[0] * x + H[1] * y + H[2]) / w;
  const v = (H[3] * x + H[4] * y + H[5]) / w;
  return [(H[0] - H[6] * u) / w, (H[1] - H[7] * u) / w, (H[3] - H[6] * v) / w, (H[4] - H[7] * v) / w];
}

/**
 * +1 when the homography keeps orientation at (x, y) (neck x to the right with neck y down), -1 when
 * it reflects. For a camera looking at the face of the board this is -1 for a right-handed player in
 * a true image, and flips with mirroring or left-handedness (see `expectedOrientation`).
 */
export function homographyOrientation(H: Mat3, x: number, y: number): 1 | -1 {
  const j = homographyJacobian(H, x, y);
  return j[0] * j[3] - j[1] * j[2] >= 0 ? 1 : -1;
}

/** Orientation a pose homography must have for the given flags (the camera always sees the board's face). */
export function expectedOrientation(mirrored: boolean, leftHanded: boolean): 1 | -1 {
  return mirrored !== leftHanded ? 1 : -1;
}

// ---------------------------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------------------------

/** Line through two points, normalised so (a, b) has unit length; null when the points coincide. */
export function lineThrough(p: Point, q: Point): Line | null {
  const a = p.y - q.y;
  const b = q.x - p.x;
  const n = Math.hypot(a, b);
  if (!(n > 1e-12)) return null;
  return [a / n, b / n, -(a * p.x + b * p.y) / n];
}

/** Signed distance from a point to a line with unit normal. */
export function pointLineDistance(line: Line, p: Point): number {
  return line[0] * p.x + line[1] * p.y + line[2];
}

/** Intersection of two lines, or null when they are (numerically) parallel. */
export function intersectLines(l: Line, m: Line): Point | null {
  const w = l[0] * m[1] - l[1] * m[0];
  if (Math.abs(w) < 1e-12) return null;
  return { x: (l[1] * m[2] - l[2] * m[1]) / w, y: (l[2] * m[0] - l[0] * m[2]) / w };
}

/** Map a line through a homography (lines transform with the inverse transpose). Null if H is singular. */
export function transformLine(H: Mat3, line: Line): Line | null {
  const inv = invertHomography(H);
  if (!inv) return null;
  const a = inv[0] * line[0] + inv[3] * line[1] + inv[6] * line[2];
  const b = inv[1] * line[0] + inv[4] * line[1] + inv[7] * line[2];
  const c = inv[2] * line[0] + inv[5] * line[1] + inv[8] * line[2];
  const n = Math.hypot(a, b);
  if (!(n > 1e-300)) return null;
  return [a / n, b / n, c / n];
}

/** Total-least-squares line through 2+ points (optionally weighted); null when they do not define one. */
export function fitLine(points: readonly Point[], weights?: readonly number[]): Line | null {
  const n = points.length;
  if (n < 2) return null;
  let sw = 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    const w = weights ? weights[i] : 1;
    sw += w;
    mx += w * points[i].x;
    my += w * points[i].y;
  }
  if (!(sw > 0)) return null;
  mx /= sw;
  my /= sw;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const w = weights ? weights[i] : 1;
    const dx = points[i].x - mx;
    const dy = points[i].y - my;
    sxx += w * dx * dx;
    sxy += w * dx * dy;
    syy += w * dy * dy;
  }
  if (!(sxx + syy > 1e-18)) return null;
  // Direction of largest variance; the normal is perpendicular to it.
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const a = -Math.sin(theta);
  const b = Math.cos(theta);
  return [a, b, -(a * mx + b * my)];
}

/** Neck-plane line of fret wire `fret` (x = fretX). */
export function fretPlaneLine(model: NeckModel, fret: number): Line {
  return [1, 0, -fretX(model, fret)];
}

/** Neck-plane line of a board edge (it is slanted by the taper). */
export function boardEdgePlaneLine(model: NeckModel, side: 'bass' | 'treble'): Line {
  const x1 = model.scaleLength / 2;
  return lineThrough({ x: 0, y: boardEdgeY(model, 0, side) }, { x: x1, y: boardEdgeY(model, x1, side) }) as Line;
}

/** Neck-plane line of a string (it is slanted by the fan-out). */
export function stringPlaneLine(model: NeckModel, string: number): Line {
  const x1 = model.scaleLength;
  return lineThrough({ x: 0, y: stringY(model, string, 0) }, { x: x1, y: stringY(model, string, x1) }) as Line;
}

// ---------------------------------------------------------------------------------------------
// Homography estimation (normalised DLT, least squares)
// ---------------------------------------------------------------------------------------------

const ATA = new Float64Array(81);
const EVEC = new Float64Array(81);
const ROW_A = new Float64Array(9);
const ROW_B = new Float64Array(9);
const NULLVEC = new Float64Array(9);

/**
 * Eigenvector of the smallest eigenvalue of the symmetric 9x9 matrix in ATA (cyclic Jacobi), written
 * to NULLVEC. Returns the ratio (second smallest eigenvalue) / (largest eigenvalue): ~0 means the
 * null space has more than one dimension, i.e. the constraints were degenerate.
 */
function solveNullVector(): number {
  const a = ATA;
  const v = EVEC;
  v.fill(0);
  for (let i = 0; i < 9; i++) v[i * 10] = 1;
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    let diag = 0;
    for (let p = 0; p < 9; p++) {
      diag += a[p * 10] * a[p * 10];
      for (let q = p + 1; q < 9; q++) off += a[p * 9 + q] * a[p * 9 + q];
    }
    if (off <= 1e-30 * diag || off === 0) break;
    for (let p = 0; p < 8; p++) {
      for (let q = p + 1; q < 9; q++) {
        const apq = a[p * 9 + q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (a[q * 10] - a[p * 10]) / (2 * apq);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 9; k++) {
          const akp = a[k * 9 + p];
          const akq = a[k * 9 + q];
          a[k * 9 + p] = c * akp - s * akq;
          a[k * 9 + q] = s * akp + c * akq;
        }
        for (let k = 0; k < 9; k++) {
          const apk = a[p * 9 + k];
          const aqk = a[q * 9 + k];
          a[p * 9 + k] = c * apk - s * aqk;
          a[q * 9 + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 9; k++) {
          const vkp = v[k * 9 + p];
          const vkq = v[k * 9 + q];
          v[k * 9 + p] = c * vkp - s * vkq;
          v[k * 9 + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  let min = Infinity;
  let second = Infinity;
  let max = 0;
  let arg = 0;
  for (let i = 0; i < 9; i++) {
    const e = Math.abs(a[i * 10]);
    if (e > max) max = e;
    if (e < min) {
      second = min;
      min = e;
      arg = i;
    } else if (e < second) {
      second = e;
    }
  }
  for (let k = 0; k < 9; k++) NULLVEC[k] = v[k * 9 + arg];
  return max > 0 ? second / max : 0;
}

function accumulateRow(row: Float64Array, weight: number): void {
  for (let i = 0; i < 9; i++) {
    const ri = row[i] * weight;
    if (ri === 0) continue;
    for (let j = 0; j < 9; j++) ATA[i * 9 + j] += ri * row[j];
  }
}

interface Normalisation {
  s: number;
  cx: number;
  cy: number;
}

/** Hartley normalisation: centroid to the origin, mean distance sqrt(2). Null for coincident points. */
function normalisationOf(xs: ArrayLike<number>, ys: ArrayLike<number>, n: number): Normalisation | null {
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    cx += xs[i];
    cy += ys[i];
  }
  cx /= n;
  cy /= n;
  let d = 0;
  for (let i = 0; i < n; i++) d += Math.hypot(xs[i] - cx, ys[i] - cy);
  d /= n;
  if (!Number.isFinite(d) || d < 1e-9) return null;
  return { s: Math.SQRT2 / d, cx, cy };
}

/** Scale by 1/|h33| (or the largest entry) with the sign that makes w positive at (x, y). */
function finishHomography(h: Mat3, x: number, y: number): Mat3 | null {
  let max = 0;
  for (let i = 0; i < 9; i++) {
    if (!Number.isFinite(h[i])) return null;
    max = Math.max(max, Math.abs(h[i]));
  }
  if (max === 0) return null;
  let scale = Math.abs(h[8]) > 1e-9 * max ? Math.abs(h[8]) : max;
  if (h[6] * x + h[7] * y + h[8] < 0) scale = -scale;
  return [h[0] / scale, h[1] / scale, h[2] / scale, h[3] / scale, h[4] / scale, h[5] / scale, h[6] / scale, h[7] / scale, h[8] / scale];
}

/** Smallest eigenvalue ratio below which a DLT system is treated as degenerate. */
const DEGENERATE_RATIO = 1e-10;

/**
 * Least-squares homography mapping `src[i]` to `dst[i]` (normalised DLT; exact for 4 points).
 * Returns null for fewer than 4 pairs, non-finite input, degenerate layouts (all points on a line,
 * three of four collinear, repeated points) and for "twisted" solutions that send part of the
 * source points through infinity. The result is scaled so the projective weight is positive at the
 * source points (and h33 = 1 in every ordinary case).
 */
export function homographyFromPoints(src: readonly Point[], dst: readonly Point[], weights?: readonly number[]): Mat3 | null {
  const n = Math.min(src.length, dst.length);
  if (n < 4) return null;
  const sx = new Float64Array(n);
  const sy = new Float64Array(n);
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    sx[i] = src[i].x;
    sy[i] = src[i].y;
    dx[i] = dst[i].x;
    dy[i] = dst[i].y;
    if (!Number.isFinite(sx[i] + sy[i] + dx[i] + dy[i])) return null;
  }
  const ns = normalisationOf(sx, sy, n);
  const nd = normalisationOf(dx, dy, n);
  if (!ns || !nd) return null;

  ATA.fill(0);
  const ra = ROW_A;
  const rb = ROW_B;
  for (let i = 0; i < n; i++) {
    const x = (sx[i] - ns.cx) * ns.s;
    const y = (sy[i] - ns.cy) * ns.s;
    const u = (dx[i] - nd.cx) * nd.s;
    const v = (dy[i] - nd.cy) * nd.s;
    const w = weights ? weights[i] : 1;
    ra[0] = -x; ra[1] = -y; ra[2] = -1; ra[3] = 0; ra[4] = 0; ra[5] = 0; ra[6] = u * x; ra[7] = u * y; ra[8] = u;
    rb[0] = 0; rb[1] = 0; rb[2] = 0; rb[3] = -x; rb[4] = -y; rb[5] = -1; rb[6] = v * x; rb[7] = v * y; rb[8] = v;
    accumulateRow(ra, w);
    accumulateRow(rb, w);
  }
  if (solveNullVector() < DEGENERATE_RATIO) return null;
  const g = NULLVEC;
  // Reject singular solutions (three collinear source points mapped to non-collinear targets, ...).
  const detN = g[0] * (g[4] * g[8] - g[5] * g[7]) - g[1] * (g[3] * g[8] - g[5] * g[6]) + g[2] * (g[3] * g[7] - g[4] * g[6]);
  if (!(Math.abs(detN) > 1e-9)) return null;
  // Reject solutions whose horizon line passes between the source points.
  let pos = 0;
  let neg = 0;
  for (let i = 0; i < n; i++) {
    const w = g[6] * (sx[i] - ns.cx) * ns.s + g[7] * (sy[i] - ns.cy) * ns.s + g[8];
    if (w > 0) pos++;
    else neg++;
  }
  if (pos > 0 && neg > 0) return null;
  // H = Td^-1 * Hn * Ts
  const ts: Mat3 = [ns.s, 0, -ns.s * ns.cx, 0, ns.s, -ns.s * ns.cy, 0, 0, 1];
  const tdInv: Mat3 = [1 / nd.s, 0, nd.cx, 0, 1 / nd.s, nd.cy, 0, 0, 1];
  const hn: Mat3 = [g[0], g[1], g[2], g[3], g[4], g[5], g[6], g[7], g[8]];
  return finishHomography(multiply(tdInv, multiply(hn, ts)), ns.cx, ns.cy);
}

/** One "this image point lies on that neck-plane line" constraint for `homographyFromPointsOnLines`. */
export interface PointOnLine {
  /** Observed point in image pixels. */
  point: Point;
  /** Neck-plane line it lies on (a fret wire, a board edge, a string), unit normal. */
  line: Line;
  /** Relative weight, default 1. */
  weight?: number;
}

/** A neck-plane point paired with its image position. */
export interface PointPair {
  plane: Point;
  image: Point;
  weight?: number;
}

/**
 * Least-squares homography (neck plane -> image) from image points known to lie on neck-plane lines,
 * optionally mixed with ordinary point pairs. Each point-on-line gives one equation and each pair
 * two; at least 8 are needed, from lines in at least two directions (for example points along several
 * fret wires plus points along both board edges). This is the natural fit when a detector finds
 * fret wires and edges but cannot tell which point along a wire it is looking at.
 */
export function homographyFromPointsOnLines(observations: readonly PointOnLine[], pairs: readonly PointPair[] = []): Mat3 | null {
  const no = observations.length;
  const np = pairs.length;
  if (no + 2 * np < 8) return null;
  // Image normalisation from every observed image point.
  const ix = new Float64Array(no + np);
  const iy = new Float64Array(no + np);
  // Plane normalisation from the foot of each line (its point closest to the origin) and pair points.
  const px = new Float64Array(no + np);
  const py = new Float64Array(no + np);
  for (let i = 0; i < no; i++) {
    const o = observations[i];
    const nrm = Math.hypot(o.line[0], o.line[1]);
    if (!(nrm > 1e-12) || !Number.isFinite(o.point.x + o.point.y + o.line[2])) return null;
    ix[i] = o.point.x;
    iy[i] = o.point.y;
    px[i] = (-o.line[0] * o.line[2]) / (nrm * nrm);
    py[i] = (-o.line[1] * o.line[2]) / (nrm * nrm);
  }
  for (let i = 0; i < np; i++) {
    const p = pairs[i];
    if (!Number.isFinite(p.plane.x + p.plane.y + p.image.x + p.image.y)) return null;
    ix[no + i] = p.image.x;
    iy[no + i] = p.image.y;
    px[no + i] = p.plane.x;
    py[no + i] = p.plane.y;
  }
  const ni = normalisationOf(ix, iy, no + np);
  const npl = normalisationOf(px, py, no + np);
  if (!ni || !npl) return null;

  // Unknown G maps normalised image points to normalised plane points; rows index G as 3*i + j.
  ATA.fill(0);
  const ra = ROW_A;
  const rb = ROW_B;
  for (let i = 0; i < no; i++) {
    const o = observations[i];
    const nrm = Math.hypot(o.line[0], o.line[1]);
    const la = o.line[0] / nrm;
    const lb = o.line[1] / nrm;
    // Line in normalised plane coordinates, still with a unit normal.
    const lc = npl.s * (la * npl.cx + lb * npl.cy + o.line[2] / nrm);
    const u = (o.point.x - ni.cx) * ni.s;
    const v = (o.point.y - ni.cy) * ni.s;
    ra[0] = la * u; ra[1] = la * v; ra[2] = la; ra[3] = lb * u; ra[4] = lb * v; ra[5] = lb; ra[6] = lc * u; ra[7] = lc * v; ra[8] = lc;
    accumulateRow(ra, o.weight ?? 1);
  }
  for (let i = 0; i < np; i++) {
    const p = pairs[i];
    const x = (p.image.x - ni.cx) * ni.s;
    const y = (p.image.y - ni.cy) * ni.s;
    const u = (p.plane.x - npl.cx) * npl.s;
    const v = (p.plane.y - npl.cy) * npl.s;
    ra[0] = -x; ra[1] = -y; ra[2] = -1; ra[3] = 0; ra[4] = 0; ra[5] = 0; ra[6] = u * x; ra[7] = u * y; ra[8] = u;
    rb[0] = 0; rb[1] = 0; rb[2] = 0; rb[3] = -x; rb[4] = -y; rb[5] = -1; rb[6] = v * x; rb[7] = v * y; rb[8] = v;
    accumulateRow(ra, p.weight ?? 1);
    accumulateRow(rb, p.weight ?? 1);
  }
  if (solveNullVector() < DEGENERATE_RATIO) return null;
  const g = NULLVEC;
  const gn: Mat3 = [g[0], g[1], g[2], g[3], g[4], g[5], g[6], g[7], g[8]];
  if (!(Math.abs(determinant(gn)) > 1e-9)) return null;
  const ti: Mat3 = [ni.s, 0, -ni.s * ni.cx, 0, ni.s, -ni.s * ni.cy, 0, 0, 1];
  const tpInv: Mat3 = [1 / npl.s, 0, npl.cx, 0, 1 / npl.s, npl.cy, 0, 0, 1];
  const G = multiply(tpInv, multiply(gn, ti));
  const H = invertHomography(G);
  if (!H) return null;
  // All observed image points must come from the same side of the plane's horizon.
  let pos = 0;
  let neg = 0;
  for (let i = 0; i < no + np; i++) {
    if (G[6] * ix[i] + G[7] * iy[i] + G[8] > 0) pos++;
    else neg++;
  }
  if (pos > 0 && neg > 0) return null;
  return finishHomography(H, npl.cx, npl.cy);
}

/** An image line segment known to lie along a neck-plane line, for `homographyFromLineSegments`. */
export interface SegmentOnLine {
  /** Neck-plane line (a fret wire, a board edge, a string), unit normal. */
  line: Line;
  /** End points of the observed segment in image pixels; where along the plane line they fall is unknown. */
  a: Point;
  b: Point;
  /** Relative weight, default 1. */
  weight?: number;
}

/**
 * Least-squares homography (neck plane -> image) from line correspondences: image segments (for
 * example from a line detector), each assigned to a neck-plane line. Fret wires alone say nothing
 * about the position across the neck: besides at least two wires, give two lines that run along it
 * (both board edges, or two strings). Returns null when the lines do not determine a pose.
 */
export function homographyFromLineSegments(segments: readonly SegmentOnLine[], pairs: readonly PointPair[] = []): Mat3 | null {
  const observations: PointOnLine[] = [];
  for (const s of segments) {
    observations.push({ point: s.a, line: s.line, weight: s.weight }, { point: s.b, line: s.line, weight: s.weight });
  }
  return homographyFromPointsOnLines(observations, pairs);
}

/** Pixel distance between `H(src[i])` and `dst[i]` for every pair (Infinity where H sends a point to infinity). */
export function reprojectionErrors(H: Mat3, src: readonly Point[], dst: readonly Point[]): number[] {
  const n = Math.min(src.length, dst.length);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const w = H[6] * src[i].x + H[7] * src[i].y + H[8];
    if (!(Math.abs(w) > 1e-12)) {
      out[i] = Infinity;
      continue;
    }
    const u = (H[0] * src[i].x + H[1] * src[i].y + H[2]) / w;
    const v = (H[3] * src[i].x + H[4] * src[i].y + H[5]) / w;
    out[i] = Math.hypot(u - dst[i].x, v - dst[i].y);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// RANSAC
// ---------------------------------------------------------------------------------------------

/** Configuration of the generic RANSAC helper. */
export interface RansacOptions<T, M> {
  /** All data items. */
  data: readonly T[];
  /** Items per minimal sample. */
  sampleSize: number;
  /** Fit a model to a sample (minimal or larger); return null when the sample is degenerate. */
  fit: (sample: T[]) => M | null;
  /** Error of one item under a model (same unit as `threshold`). */
  error: (model: M, item: T) => number;
  /** Items with error at or below this are inliers. */
  threshold: number;
  /** Upper bound on iterations (default 500). The loop stops early once `confidence` is reached. */
  maxIterations?: number;
  /** Probability of having drawn at least one all-inlier sample before stopping early (default 0.995). */
  confidence?: number;
  /** A model needs at least this many inliers (default `sampleSize + 1`, capped at the data size). */
  minInliers?: number;
  /** Seeded uniform generator in [0, 1); default `createRng(1)` so results are reproducible. */
  rng?: () => number;
  /** Refit on all inliers at the end (default true). */
  refine?: boolean;
}

/** Outcome of `ransac`. */
export interface RansacResult<M> {
  model: M;
  /** Indices into `data` of the consensus set. */
  inliers: number[];
  /** Iterations actually run. */
  iterations: number;
}

/** Generic RANSAC: the model with the largest consensus set, refitted on its inliers. Null if none qualifies. */
export function ransac<T, M>(options: RansacOptions<T, M>): RansacResult<M> | null {
  const { data, sampleSize, fit, error, threshold } = options;
  const n = data.length;
  if (n < sampleSize || sampleSize < 1) return null;
  const rng = options.rng ?? createRng(1);
  const confidence = options.confidence ?? 0.995;
  const minInliers = Math.min(n, options.minInliers ?? sampleSize + 1);
  let limit = options.maxIterations ?? 500;
  const picks = new Int32Array(sampleSize);
  const sample = new Array<T>(sampleSize);
  let best: M | null = null;
  let bestCount = 0;
  let bestError = Infinity;
  let iterations = 0;
  while (iterations < limit) {
    iterations++;
    for (let k = 0; k < sampleSize; k++) {
      let idx = 0;
      let unique = false;
      while (!unique) {
        idx = Math.min(n - 1, Math.floor(rng() * n));
        unique = true;
        for (let j = 0; j < k; j++) if (picks[j] === idx) unique = false;
      }
      picks[k] = idx;
      sample[k] = data[idx];
    }
    const model = fit(sample);
    if (model === null) continue;
    let count = 0;
    let total = 0;
    for (let i = 0; i < n; i++) {
      const e = error(model, data[i]);
      if (e <= threshold) {
        count++;
        total += e;
      }
    }
    if (count > bestCount || (count === bestCount && count > 0 && total < bestError)) {
      best = model;
      bestCount = count;
      bestError = total;
      const ratio = count / n;
      const pAllInliers = Math.pow(ratio, sampleSize);
      if (pAllInliers >= 1) limit = Math.min(limit, iterations);
      else if (pAllInliers > 0) limit = Math.min(limit, Math.max(iterations, Math.ceil(Math.log(1 - confidence) / Math.log(1 - pAllInliers))));
    }
  }
  if (best === null || bestCount < minInliers) return null;
  const collect = (model: M): number[] => {
    const idx: number[] = [];
    for (let i = 0; i < n; i++) if (error(model, data[i]) <= threshold) idx.push(i);
    return idx;
  };
  let inliers = collect(best);
  if (options.refine !== false) {
    const refined = fit(inliers.map((i) => data[i]));
    if (refined !== null) {
      const again = collect(refined);
      if (again.length >= inliers.length) {
        best = refined;
        inliers = again;
      }
    }
  }
  return { model: best, inliers, iterations };
}

/** Robust homography from point pairs with outliers. `threshold` is the inlier reprojection error in dst units. */
export function ransacHomography(
  src: readonly Point[],
  dst: readonly Point[],
  options: { threshold: number; maxIterations?: number; confidence?: number; minInliers?: number; rng?: () => number },
): { H: Mat3; inliers: number[]; iterations: number } | null {
  const n = Math.min(src.length, dst.length);
  if (n < 4) return null;
  const idx = new Array<number>(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  const result = ransac<number, Mat3>({
    data: idx,
    sampleSize: 4,
    fit: (sample) => homographyFromPoints(sample.map((i) => src[i]), sample.map((i) => dst[i])),
    error: (H, i) => {
      const w = H[6] * src[i].x + H[7] * src[i].y + H[8];
      if (!(Math.abs(w) > 1e-12)) return Infinity;
      return Math.hypot((H[0] * src[i].x + H[1] * src[i].y + H[2]) / w - dst[i].x, (H[3] * src[i].x + H[4] * src[i].y + H[5]) / w - dst[i].y);
    },
    threshold: options.threshold,
    maxIterations: options.maxIterations,
    confidence: options.confidence,
    minInliers: options.minInliers ?? Math.min(n, 5),
    rng: options.rng,
  });
  return result ? { H: result.model, inliers: result.inliers, iterations: result.iterations } : null;
}

// ---------------------------------------------------------------------------------------------
// Decomposition and plausibility
// ---------------------------------------------------------------------------------------------

/** A homography explained as a pinhole camera looking at the neck plane. */
export interface ViewDecomposition {
  /** Focal length in pixels (estimated from the homography when the view constrains it). */
  focalPx: number;
  /** True when `focalPx` came from the data rather than the default (fronto-parallel views do not constrain it). */
  focalFromData: boolean;
  /** Horizontal field of view in degrees implied by `focalPx`. */
  fovDeg: number;
  /** Angle between the board normal and the camera's optical axis, degrees (0 = seen front-on). */
  tiltDeg: number;
  /** Direction of the neck in the image: angle of nut -> bridge at the nut, degrees, atan2(dy, dx), y down. */
  rollDeg: number;
  /** Distance from the camera to the nut (the neck-plane origin), in the model's millimetres. */
  distanceMm: number;
  /** |r1| / |r2|: 1 for an exact pinhole view of a correctly dimensioned model. */
  aspect: number;
  /** Cosine of the angle between the recovered neck axes: 0 for an exact pinhole view. */
  skew: number;
}

/**
 * Explain a pose homography as K [r1 r2 t] with square pixels and the principal point at the frame
 * centre. The two residuals (`aspect`, `skew`) say how well a real camera could have produced it.
 * Returns null for non-finite or singular input.
 */
export function decomposeHomography(H: Mat3, frameWidth: number, frameHeight: number, focalPx?: number): ViewDecomposition | null {
  for (let i = 0; i < 9; i++) if (!Number.isFinite(H[i])) return null;
  if (Math.abs(determinant(H)) === 0) return null;
  const cx = frameWidth / 2;
  const cy = frameHeight / 2;
  // Move the principal point to the origin.
  const h1x = H[0] - cx * H[6];
  const h1y = H[3] - cy * H[6];
  const h1z = H[6];
  const h2x = H[1] - cx * H[7];
  const h2y = H[4] - cy * H[7];
  const h2z = H[7];
  const h3x = H[2] - cx * H[8];
  const h3y = H[5] - cy * H[8];
  const h3z = H[8];

  const residual = (f: number): number => {
    const n1 = Math.hypot(h1x / f, h1y / f, h1z);
    const n2 = Math.hypot(h2x / f, h2y / f, h2z);
    if (!(n1 > 0) || !(n2 > 0)) return Infinity;
    const cos = ((h1x * h2x + h1y * h2y) / (f * f) + h1z * h2z) / (n1 * n2);
    const lr = Math.log(n1 / n2);
    return lr * lr + cos * cos;
  };

  const fMin = 0.4 * frameWidth;
  const fMax = 2.5 * frameWidth;
  const fDefault = 0.85 * frameWidth;
  let f = focalPx ?? fDefault;
  let fromData = false;
  if (focalPx === undefined) {
    // Orthogonality and equal length of r1, r2 are both linear in q = 1 / f^2.
    const a1 = h1x * h2x + h1y * h2y;
    const b1 = h1z * h2z;
    const a2 = h1x * h1x + h1y * h1y - h2x * h2x - h2y * h2y;
    const b2 = h1z * h1z - h2z * h2z;
    const den = a1 * a1 + a2 * a2;
    const q = den > 0 ? -(a1 * b1 + a2 * b2) / den : NaN;
    const candidate = q > 0 ? 1 / Math.sqrt(q) : NaN;
    if (candidate >= fMin && candidate <= fMax && residual(candidate) <= residual(fDefault)) {
      f = candidate;
      // A nearly fronto-parallel board barely constrains the focal length: only trust it with real perspective.
      const perspective = Math.hypot(h1z, h2z) / Math.max(1e-12, Math.hypot(h1x, h1y, h2x, h2y) / f);
      fromData = perspective > 0.08;
      if (!fromData) f = fDefault;
    } else {
      // Fall back to the best focal length in the plausible range.
      let bestR = residual(fDefault);
      f = fDefault;
      for (let i = 0; i <= 24; i++) {
        const cand = fMin * Math.pow(fMax / fMin, i / 24);
        const r = residual(cand);
        if (r < bestR - 1e-9) {
          bestR = r;
          f = cand;
        }
      }
    }
  }
  let r1x = h1x / f;
  let r1y = h1y / f;
  let r1z = h1z;
  let r2x = h2x / f;
  let r2y = h2y / f;
  let r2z = h2z;
  const n1 = Math.hypot(r1x, r1y, r1z);
  const n2 = Math.hypot(r2x, r2y, r2z);
  if (!(n1 > 0) || !(n2 > 0)) return null;
  const skew = (r1x * r2x + r1y * r2y + r1z * r2z) / (n1 * n2);
  const lambda = 2 / (n1 + n2);
  r1x /= n1; r1y /= n1; r1z /= n1;
  r2x /= n2; r2y /= n2; r2z /= n2;
  // Board normal (sign irrelevant for the tilt).
  const nx = r1y * r2z - r1z * r2y;
  const ny = r1z * r2x - r1x * r2z;
  const nz = r1x * r2y - r1y * r2x;
  const nn = Math.hypot(nx, ny, nz);
  if (!(nn > 0)) return null;
  const tiltDeg = (Math.acos(Math.min(1, Math.abs(nz) / nn)) * 180) / Math.PI;
  const j = homographyJacobian(H, 0, 0);
  return {
    focalPx: f,
    focalFromData: fromData,
    fovDeg: (2 * Math.atan(frameWidth / (2 * f)) * 180) / Math.PI,
    tiltDeg,
    rollDeg: (Math.atan2(j[2], j[0]) * 180) / Math.PI,
    distanceMm: Math.abs(lambda) * Math.sqrt((h3x / f) * (h3x / f) + (h3y / f) * (h3y / f) + h3z * h3z),
    aspect: n1 / n2,
    skew,
  };
}

/** Thresholds for `checkPlausibleView`. */
export interface PlausibilityLimits {
  /** Largest believable angle between the board normal and the optical axis (default 72 degrees). */
  maxTiltDeg?: number;
  /** Nut-to-12th-fret length must be at least this fraction of the frame width (default 0.1). */
  minSpan?: number;
  /** ...and at most this many frame widths (default 4). */
  maxSpan?: number;
  /** Largest believable |log(aspect)| of the decomposition (default log 1.7). */
  maxLogAspect?: number;
  /** Largest believable |skew| of the decomposition (default 0.4). */
  maxSkew?: number;
  /** Largest ratio between the local scale at the nut and at the 12th fret, either way (default 3.5). */
  maxScaleRatio?: number;
  /** When both flags are given, the orientation of H must match them. */
  mirrored?: boolean;
  leftHanded?: boolean;
}

/** Result of `checkPlausibleView`. */
export interface PlausibilityReport {
  plausible: boolean;
  /** Machine-readable reasons the view was rejected (empty when plausible). */
  reasons: string[];
  view: ViewDecomposition | null;
}

/**
 * Could a real camera looking at a real guitar neck have produced this homography? Rejects bow-tie
 * quads, boards behind the camera, absurd perspective, tiny or enormous necks and (when the flags
 * are given) views that show the back of the board.
 */
export function checkPlausibleView(H: Mat3, model: NeckModel, frameWidth: number, frameHeight: number, limits: PlausibilityLimits = {}): PlausibilityReport {
  const reasons: string[] = [];
  for (let i = 0; i < 9; i++) {
    if (!Number.isFinite(H[i])) return { plausible: false, reasons: ['not-finite'], view: null };
  }
  const x12 = model.scaleLength / 2;
  const corners: Point[] = [
    { x: 0, y: boardEdgeY(model, 0, 'bass') },
    { x: 0, y: boardEdgeY(model, 0, 'treble') },
    { x: x12, y: boardEdgeY(model, x12, 'treble') },
    { x: x12, y: boardEdgeY(model, x12, 'bass') },
  ];
  // Every corner must be on the same side of the horizon, otherwise part of the board is behind the camera.
  const side = boardSideSign(H, model);
  let front = true;
  for (const c of corners) if (!(homogeneousW(H, c.x, c.y) * side > 1e-12)) front = false;
  if (!front) return { plausible: false, reasons: ['behind-camera'], view: null };
  const q = corners.map((c) => applyHomography(H, c.x, c.y));
  let pos = 0;
  let neg = 0;
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross > 0) pos++;
    else if (cross < 0) neg++;
    area += a.x * b.y - b.x * a.y;
  }
  if (pos > 0 && neg > 0) reasons.push('not-convex');
  if (Math.abs(area) / 2 < 16) reasons.push('degenerate-area');

  const yc = model.nutWidth / 2;
  const p0 = applyHomography(H, 0, yc);
  const p12 = applyHomography(H, x12, yc);
  const span = Math.hypot(p12.x - p0.x, p12.y - p0.y) / frameWidth;
  if (span < (limits.minSpan ?? 0.1)) reasons.push('too-small');
  if (span > (limits.maxSpan ?? 4)) reasons.push('too-large');

  const j0 = homographyJacobian(H, 0, yc);
  const j12 = homographyJacobian(H, x12, yc);
  const s0 = Math.sqrt(Math.abs(j0[0] * j0[3] - j0[1] * j0[2]));
  const s12 = Math.sqrt(Math.abs(j12[0] * j12[3] - j12[1] * j12[2]));
  const ratio = s0 > s12 ? s0 / Math.max(1e-12, s12) : s12 / Math.max(1e-12, s0);
  if (!(ratio <= (limits.maxScaleRatio ?? 3.5))) reasons.push('perspective-too-strong');

  const view = decomposeHomography(H, frameWidth, frameHeight);
  if (!view) {
    reasons.push('no-decomposition');
  } else {
    if (Math.abs(Math.log(view.aspect)) > (limits.maxLogAspect ?? Math.log(1.7))) reasons.push('aspect');
    if (Math.abs(view.skew) > (limits.maxSkew ?? 0.4)) reasons.push('skew');
    if (view.tiltDeg > (limits.maxTiltDeg ?? 72)) reasons.push('tilt');
  }
  if (limits.mirrored !== undefined && limits.leftHanded !== undefined) {
    if (homographyOrientation(H, x12 / 2, yc) !== expectedOrientation(limits.mirrored, limits.leftHanded)) reasons.push('orientation');
  }
  return { plausible: reasons.length === 0, reasons, view };
}

// ---------------------------------------------------------------------------------------------
// Projection: neck plane <-> image
// ---------------------------------------------------------------------------------------------

/** The part of a pose the projection helpers need. */
export type PoseLike = Pick<FretboardPose, 'H' | 'model'>;

/** Image position of a neck-plane point (mm). */
export function projectPlanePoint(pose: PoseLike, x: number, y: number): Point {
  return applyHomography(pose.H, x, y);
}

/** Image end points of fret wire `fret` (0 = nut): [bass-side end, treble-side end]. */
export function projectFretWire(pose: PoseLike, fret: number): [Point, Point] {
  const x = fretX(pose.model, fret);
  return [applyHomography(pose.H, x, boardEdgeY(pose.model, x, 'bass')), applyHomography(pose.H, x, boardEdgeY(pose.model, x, 'treble'))];
}

/** Image position of a string (1 = treble side) at a distance x mm from the nut. */
export function projectStringAt(pose: PoseLike, string: number, x: number): Point {
  return applyHomography(pose.H, x, stringY(pose.model, string, x));
}

/** Image segment of a string between two frets (default nut to the last fret): [nut-side end, bridge-side end]. */
export function projectString(pose: PoseLike, string: number, fromFret = 0, toFret: number = pose.model.fretCount): [Point, Point] {
  return [projectStringAt(pose, string, fretX(pose.model, fromFret)), projectStringAt(pose, string, fretX(pose.model, toFret))];
}

/** Image position of the note marker for (string, fret): on the string, just behind wire `fret`. */
export function projectMarker(pose: PoseLike, string: number, fret: number): Point {
  const p = markerPlanePosition(pose.model, string, fret);
  return applyHomography(pose.H, p.x, p.y);
}

/** Distance in pixels between wire `fret` and the wire before it, measured along a string (default: the centre line). */
export function fretSpacingPx(pose: PoseLike, fret: number, string?: number): number {
  const n = Math.max(1, fret);
  const m = pose.model;
  const xa = fretX(m, n - 1);
  const xb = fretX(m, n);
  const ya = string === undefined ? m.nutWidth / 2 : stringY(m, string, xa);
  const yb = string === undefined ? m.nutWidth / 2 : stringY(m, string, xb);
  const a = applyHomography(pose.H, xa, ya);
  const b = applyHomography(pose.H, xb, yb);
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Inverse mapping: which string and fret is under an image point. Returns null when the homography
 * is singular or the point lies beyond the plane's horizon.
 */
export function locatePixel(pose: PoseLike, point: Point, inverse?: Mat3): PixelLocation | null {
  const inv = inverse ?? invertHomography(pose.H);
  if (!inv) return null;
  const w = inv[6] * point.x + inv[7] * point.y + inv[8];
  if (!Number.isFinite(w) || Math.abs(w) < 1e-300) return null;
  const x = (inv[0] * point.x + inv[1] * point.y + inv[2]) / w;
  const y = (inv[3] * point.x + inv[4] * point.y + inv[5]) / w;
  // The point must be on the same side of the horizon as the board itself.
  const m = pose.model;
  if (!(homogeneousW(pose.H, x, y) * boardSideSign(pose.H, m) > 0)) return null;
  const near = nearestStringAt(m, Math.max(0, Math.min(x, m.scaleLength)), y);
  const half = boardWidthAt(m, x) / 2;
  return {
    x,
    y,
    fret: fretCellAtX(m, x),
    fretExact: fretAtX(m, x),
    string: near.string,
    stringOffset: near.offset,
    onBoard: x >= 0 && x <= boardEndX(m) && Math.abs(y - m.nutWidth / 2) <= half,
  };
}

/** Fret wires (0 = nut) whose midpoint projects inside the frame; an empty range (max < min) when none does. */
export function computeVisibleFrets(H: Mat3, model: NeckModel, frameWidth: number, frameHeight: number, marginPx = 0): FretRange {
  let min = Infinity;
  let max = -Infinity;
  const yc = model.nutWidth / 2;
  const side = boardSideSign(H, model);
  for (let n = 0; n <= model.fretCount; n++) {
    const x = fretX(model, n);
    const w = H[6] * x + H[7] * yc + H[8];
    if (!(w * side > 1e-12)) continue;
    const u = (H[0] * x + H[1] * yc + H[2]) / w;
    const v = (H[3] * x + H[4] * yc + H[5]) / w;
    if (u >= marginPx && u <= frameWidth - marginPx && v >= marginPx && v <= frameHeight - marginPx) {
      if (n < min) min = n;
      if (n > max) max = n;
    }
  }
  return min <= max ? { min, max } : { min: 0, max: -1 };
}

/** Clip a polygon to the rectangle [0, width] x [0, height] (Sutherland-Hodgman). */
export function clipPolygonToFrame(polygon: readonly Point[], width: number, height: number): Point[] {
  let pts: Point[] = polygon.map((p) => ({ x: p.x, y: p.y }));
  const edges: [number, number, number][] = [
    [1, 0, 0],
    [-1, 0, width],
    [0, 1, 0],
    [0, -1, height],
  ];
  for (const [a, b, c] of edges) {
    const out: Point[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const dp = a * p.x + b * p.y + c;
      const dq = a * q.x + b * q.y + c;
      if (dp >= 0) out.push(p);
      if (dp >= 0 !== dq >= 0) {
        const t = dp / (dp - dq);
        out.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) });
      }
    }
    pts = out;
    if (pts.length === 0) break;
  }
  return pts;
}

/**
 * Outline of the board in image pixels between two fret wires (default: nut to the end of the board),
 * as [bass at start, treble at start, treble at end, bass at end]. With `clip`, the polygon is cut
 * to the frame and may have more or fewer corners.
 */
export function boardOutline(pose: PoseLike & Partial<Pick<FretboardPose, 'frameWidth' | 'frameHeight'>>, range?: Partial<FretRange>, clip = false): Point[] {
  const m = pose.model;
  const x0 = range?.min !== undefined ? fretX(m, range.min) : 0;
  const x1 = range?.max !== undefined ? fretX(m, range.max) : boardEndX(m);
  const quad = [
    applyHomography(pose.H, x0, boardEdgeY(m, x0, 'bass')),
    applyHomography(pose.H, x0, boardEdgeY(m, x0, 'treble')),
    applyHomography(pose.H, x1, boardEdgeY(m, x1, 'treble')),
    applyHomography(pose.H, x1, boardEdgeY(m, x1, 'bass')),
  ];
  if (!clip || pose.frameWidth === undefined || pose.frameHeight === undefined) return quad;
  return clipPolygonToFrame(quad, pose.frameWidth, pose.frameHeight);
}

// ---------------------------------------------------------------------------------------------
// Building and transforming poses
// ---------------------------------------------------------------------------------------------

/** Assemble a pose from a homography; `visibleFrets` is computed, everything else defaults conservatively. */
export function makePose(
  H: Mat3,
  model: NeckModel,
  frameWidth: number,
  frameHeight: number,
  extras: Partial<Omit<FretboardPose, 'H' | 'model' | 'frameWidth' | 'frameHeight'>> = {},
): FretboardPose {
  return {
    H,
    model,
    confidence: extras.confidence ?? 1,
    visibleFrets: extras.visibleFrets ?? computeVisibleFrets(H, model, frameWidth, frameHeight),
    mirrored: extras.mirrored ?? false,
    leftHanded: extras.leftHanded ?? false,
    numbering: extras.numbering ?? 'assumed',
    numberingConfidence: extras.numberingConfidence ?? 0,
    frameWidth,
    frameHeight,
  };
}

/** Apply an image-space transform (pixels -> pixels) to a pose, e.g. a crop offset or a resize. */
export function transformPose(pose: FretboardPose, imageTransform: Mat3, frameWidth: number, frameHeight: number): FretboardPose {
  const H = multiply(imageTransform, pose.H);
  return { ...pose, H, frameWidth, frameHeight, visibleFrets: computeVisibleFrets(H, pose.model, frameWidth, frameHeight) };
}

/** Move a pose to a frame scaled by (sx, sy), e.g. from the downscaled working frame to the display canvas. */
export function scalePose(pose: FretboardPose, sx: number, sy: number = sx): FretboardPose {
  return transformPose(pose, [sx, 0, 0, 0, sy, 0, 0, 0, 1], pose.frameWidth * sx, pose.frameHeight * sy);
}

/** The same pose in the horizontally flipped frame (true image <-> selfie preview); toggles `mirrored`. */
export function mirrorPose(pose: FretboardPose): FretboardPose {
  const flipped = transformPose(pose, [-1, 0, pose.frameWidth, 0, 1, 0, 0, 0, 1], pose.frameWidth, pose.frameHeight);
  return { ...flipped, mirrored: !pose.mirrored };
}

/** The four taps of assisted calibration: both ends of the nut and both ends of one fret (the 12th by default). */
export interface CalibrationTaps {
  /** The two ends of the nut, in either order. */
  nut: [Point, Point];
  /** The two ends of the reference fret wire, in either order. */
  fret: [Point, Point];
  /** Which fret the second pair is on (default 12). */
  fretNumber?: number;
}

/**
 * Pose from assisted calibration. Which end of each pair is the bass side is decided by
 * `options.bassSideUp` (default true: the end higher in the image); for a neck that stands nearly
 * vertical in the image, where "higher" means nothing, the mirrored / left-handed flags decide.
 * Returns null when the taps do not form a usable quadrilateral.
 */
export function poseFromCalibrationTaps(taps: CalibrationTaps, frameWidth: number, frameHeight: number, options: DetectOptions = {}): FretboardPose | null {
  const model = neckModel(options.model ?? 'steel');
  const fretNumber = taps.fretNumber ?? 12;
  if (!(fretNumber >= 1)) return null;
  const bassUp = options.bassSideUp ?? true;
  const mirrored = options.mirrored ?? false;
  const leftHanded = options.leftHanded ?? false;
  const xf = fretX(model, fretNumber);
  const plane: Point[] = [
    { x: 0, y: boardEdgeY(model, 0, 'bass') },
    { x: 0, y: boardEdgeY(model, 0, 'treble') },
    { x: xf, y: boardEdgeY(model, xf, 'treble') },
    { x: xf, y: boardEdgeY(model, xf, 'bass') },
  ];
  const solve = (nutBass: Point, nutTreble: Point, fretBass: Point, fretTreble: Point): Mat3 | null =>
    homographyFromPoints(plane, [nutBass, nutTreble, fretTreble, fretBass]);

  let [n0, n1] = taps.nut;
  let [f0, f1] = taps.fret;
  // Make the two pairs consistent: the long edges n0-f0 and n1-f1 must not cross.
  const crosses = (a: Point, b: Point, c: Point, d: Point): boolean => {
    const o = (p: Point, q: Point, r: Point): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  };
  if (crosses(n0, f0, n1, f1)) [f0, f1] = [f1, f0];
  // Decide which long edge is the bass side.
  const across = { x: (n1.x - n0.x + f1.x - f0.x) / 2, y: (n1.y - n0.y + f1.y - f0.y) / 2 };
  const steep = Math.abs(across.y) < 0.35 * Math.abs(across.x);
  let swap: boolean;
  if (!steep) {
    // n0 is the bass end when it is above (smaller y) and bass is up, or below and bass is down.
    const n0Above = across.y > 0;
    swap = n0Above !== bassUp;
  } else {
    const trial = solve(n0, n1, f0, f1);
    if (!trial) return null;
    swap = homographyOrientation(trial, xf / 2, model.nutWidth / 2) !== expectedOrientation(mirrored, leftHanded);
  }
  if (swap) {
    [n0, n1] = [n1, n0];
    [f0, f1] = [f1, f0];
  }
  const H = solve(n0, n1, f0, f1);
  if (!H) return null;
  const report = checkPlausibleView(H, model, frameWidth, frameHeight, { minSpan: 0.03, maxSpan: 20, maxLogAspect: Math.log(3), maxSkew: 0.7, maxTiltDeg: 80, maxScaleRatio: 8 });
  if (!report.plausible) return null;
  return makePose(H, model, frameWidth, frameHeight, { confidence: 1, mirrored, leftHanded, numbering: 'user', numberingConfidence: 1 });
}

/**
 * Shift the fret numbering of a pose: the wire that was called n is called n + delta afterwards.
 * Fret positions are self-similar, so this is an exact stretch along the neck; across the neck the
 * taper is not self-similar, so the width is matched at the middle of the visible range (refine with
 * the tracker afterwards if the edges matter).
 */
export function renumberPose(pose: FretboardPose, delta: number, source: NumberingSource = pose.numbering, numberingConfidence: number = pose.numberingConfidence): FretboardPose {
  if (delta === 0) return { ...pose, numbering: source, numberingConfidence };
  const m = pose.model;
  const r = Math.pow(2, -delta / 12);
  const xd = fretX(m, delta);
  const vis = pose.visibleFrets.max >= pose.visibleFrets.min ? pose.visibleFrets : { min: 0, max: 12 };
  const xOldRef = fretX(m, (vis.min + vis.max) / 2);
  const xNewRef = xd + r * xOldRef;
  const s = boardWidthAt(m, xOldRef) / boardWidthAt(m, xNewRef);
  const yc = m.nutWidth / 2;
  // Maps new-numbering plane coordinates to old-numbering plane coordinates.
  const A: Mat3 = [1 / r, 0, -xd / r, 0, s, yc * (1 - s), 0, 0, 1];
  const H = multiply(pose.H, A);
  return {
    ...pose,
    H,
    visibleFrets: computeVisibleFrets(H, m, pose.frameWidth, pose.frameHeight),
    numbering: source,
    numberingConfidence,
  };
}

/** One-tap fret confirmation: renumber the pose so the cell under `point` is fret `fret`. Null if the tap misses the plane. */
export function confirmFretAt(pose: FretboardPose, point: Point, fret: number): FretboardPose | null {
  const loc = locatePixel(pose, point);
  if (!loc || !Number.isFinite(loc.fretExact)) return null;
  return renumberPose(pose, Math.round(fret) - loc.fret, 'user', 1);
}

/** Neck-plane control points used to interpolate poses: the board corners at the nut and the 12th fret. */
export function controlPlanePoints(model: NeckModel): Point[] {
  const x12 = model.scaleLength / 2;
  return [
    { x: 0, y: boardEdgeY(model, 0, 'bass') },
    { x: 0, y: boardEdgeY(model, 0, 'treble') },
    { x: x12, y: boardEdgeY(model, x12, 'treble') },
    { x: x12, y: boardEdgeY(model, x12, 'bass') },
  ];
}

/** Image positions of the four control points of a pose. */
export function poseControlPoints(pose: PoseLike): Point[] {
  return controlPlanePoints(pose.model).map((p) => applyHomography(pose.H, p.x, p.y));
}

/** A pose like `template` whose control points sit at the given image positions. Null when they are degenerate. */
export function poseFromControlPoints(points: readonly Point[], template: FretboardPose): FretboardPose | null {
  const H = homographyFromPoints(controlPlanePoints(template.model), points);
  if (!H) return null;
  return { ...template, H, visibleFrets: computeVisibleFrets(H, template.model, template.frameWidth, template.frameHeight) };
}

/**
 * Blend two poses: t = 0 gives `a`, t = 1 gives `b`. The four control points move on straight lines,
 * which keeps every intermediate pose a valid view. Flags and the model come from `b`; t outside
 * [0, 1] extrapolates.
 */
export function interpolatePoses(a: FretboardPose, b: FretboardPose, t: number): FretboardPose {
  const pa = poseControlPoints({ H: a.H, model: b.model });
  const pb = poseControlPoints(b);
  const pts = pa.map((p, i) => ({ x: p.x + (pb[i].x - p.x) * t, y: p.y + (pb[i].y - p.y) * t }));
  const out = poseFromControlPoints(pts, b);
  if (!out) return t < 0.5 ? a : b;
  return { ...out, confidence: a.confidence + (b.confidence - a.confidence) * Math.min(1, Math.max(0, t)) };
}

/** Constant-velocity prediction: where the pose will be `steps` frames after `current`, given the frame before it. */
export function extrapolatePose(previous: FretboardPose, current: FretboardPose, steps = 1): FretboardPose {
  return interpolatePoses(previous, current, 1 + steps);
}

/** Root-mean-square pixel distance between the note markers of two poses over a fret range (default: `b.visibleFrets`). */
export function poseDistancePx(a: PoseLike, b: FretboardPose, range: FretRange = b.visibleFrets): number {
  let sum = 0;
  let n = 0;
  const lo = Math.max(0, range.min);
  const hi = Math.max(lo, range.max);
  for (let f = lo; f <= hi; f++) {
    for (let s = 1; s <= b.model.stringCount; s += b.model.stringCount - 1 || 1) {
      const pa = projectMarker(a, s, f);
      const pb = projectMarker(b, s, f);
      const d = (pa.x - pb.x) * (pa.x - pb.x) + (pa.y - pb.y) * (pa.y - pb.y);
      if (Number.isFinite(d)) {
        sum += d;
        n++;
      }
    }
  }
  return n > 0 ? Math.sqrt(sum / n) : Infinity;
}

// ---------------------------------------------------------------------------------------------
// Pose-error metrics
// ---------------------------------------------------------------------------------------------

/** Linear-interpolated percentile (p in 0..1) of a list of numbers; NaN when empty. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = Array.from(values).sort((a, b) => a - b);
  const pos = Math.min(1, Math.max(0, p)) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  const a = sorted[lo];
  const b = sorted[hi];
  // Avoid Infinity - Infinity when a list of failures is summarised.
  return a === b ? a : a + (b - a) * (pos - lo);
}

/** Median, 90th percentile and maximum of an error sample. */
export interface ErrorSummary {
  median: number;
  p90: number;
  max: number;
  count: number;
}

function summarise(values: number[]): ErrorSummary {
  if (values.length === 0) return { median: NaN, p90: NaN, max: NaN, count: 0 };
  let max = -Infinity;
  for (const v of values) if (v > max) max = v;
  return { median: percentile(values, 0.5), p90: percentile(values, 0.9), max, count: values.length };
}

/** How far an estimated pose is from the true one, in units a guitarist would feel. */
export interface PoseError {
  /** Fret-wire position error along the neck, as a fraction of the local fret spacing. Absolute numbering. */
  fretError: ErrorSummary;
  /** The same after removing the best whole-fret numbering offset: pure alignment quality. */
  fretErrorAligned: ErrorSummary;
  /** String position error across the neck, as a fraction of the local string spacing. */
  stringError: ErrorSummary;
  /** Pixel distance between estimated and true note-marker positions. */
  markerErrorPx: ErrorSummary;
  /** Fraction (0..1) of note markers over the visible frets that land in the right string / fret cell. */
  cellAccuracy: number;
  /** The same, forgiving a whole-fret numbering offset. */
  cellAccuracyAligned: number;
  /** Markers evaluated. */
  cellCount: number;
  /** Estimated fret number minus true fret number for the same physical fret (0 = fret 5 is called fret 5). */
  numberingOffset: number;
  /** The estimate points from nut to bridge the same way as the truth. */
  nutDirectionCorrect: boolean;
  /** The estimate has the bass strings on the same side as the truth. */
  bassSideCorrect: boolean;
}

/** Raw error samples of one comparison, appended to by `comparePoses` so a benchmark can pool percentiles across frames. */
export interface PoseErrorSamples {
  fret: number[];
  fretAligned: number[];
  string: number[];
}

/**
 * Compare an estimated pose with the ground truth over the frets the truth says are in the frame.
 * Errors are measured in the true neck plane (estimate -> image -> true plane), so they do not
 * depend on perspective or on which neck model the estimate assumed. Pass `collect` to also get
 * the raw samples appended to your own arrays.
 */
export function comparePoses(estimate: PoseLike, truth: FretboardPose, collect?: PoseErrorSamples): PoseError {
  const tm = truth.model;
  const em = estimate.model;
  const inv = invertHomography(truth.H);
  const range = truth.visibleFrets;
  const empty: PoseError = {
    fretError: summarise([]),
    fretErrorAligned: summarise([]),
    stringError: summarise([]),
    markerErrorPx: summarise([]),
    cellAccuracy: 0,
    cellAccuracyAligned: 0,
    cellCount: 0,
    numberingOffset: 0,
    nutDirectionCorrect: false,
    bassSideCorrect: false,
  };
  if (!inv || range.max < range.min) return empty;
  const W = truth.frameWidth;
  const Hh = truth.frameHeight;
  const toTruthPlane = (x: number, y: number): Point | null => {
    const we = estimate.H[6] * x + estimate.H[7] * y + estimate.H[8];
    if (!(Math.abs(we) > 1e-300)) return null;
    const u = (estimate.H[0] * x + estimate.H[1] * y + estimate.H[2]) / we;
    const v = (estimate.H[3] * x + estimate.H[4] * y + estimate.H[5]) / we;
    const w = inv[6] * u + inv[7] * v + inv[8];
    if (!Number.isFinite(w) || Math.abs(w) < 1e-300) return null;
    const px = (inv[0] * u + inv[1] * v + inv[2]) / w;
    const py = (inv[3] * u + inv[4] * v + inv[5]) / w;
    return Number.isFinite(px + py) ? { x: px, y: py } : null;
  };
  const sampleStrings = [tm.stringCount, (tm.stringCount + 1) / 2, 1];
  const FAIL = 99;

  // Pass 1: absolute fret error and the whole-fret numbering offset.
  const fretErr: number[] = [];
  const offsets: number[] = [];
  for (let n = range.min; n <= range.max; n++) {
    const xe = fretX(em, n);
    const xt = fretX(tm, n);
    const spacing = fretSpacing(tm, n);
    for (const s of sampleStrings) {
      const p = toTruthPlane(xe, stringY(em, s, xe));
      if (!p) {
        fretErr.push(FAIL);
        continue;
      }
      fretErr.push(Math.min(FAIL, Math.abs(p.x - xt) / spacing));
      const nt = fretAtX(tm, p.x);
      if (Number.isFinite(nt)) offsets.push(nt - n);
    }
  }
  const k = offsets.length > 0 ? Math.round(percentile(offsets, 0.5)) : 0;

  // Pass 2: alignment with the numbering offset removed, and string error.
  const fretErrAligned: number[] = [];
  const stringErr: number[] = [];
  for (let n = range.min; n <= range.max; n++) {
    const xt = fretX(tm, n);
    const spacing = fretSpacing(tm, n);
    const xa = fretX(em, n - k);
    for (const s of sampleStrings) {
      const p = toTruthPlane(xa, stringY(em, s, Math.max(0, xa)));
      fretErrAligned.push(p ? Math.min(FAIL, Math.abs(p.x - xt) / spacing) : FAIL);
    }
    const xe = fretX(em, n);
    for (let s = 1; s <= tm.stringCount; s++) {
      const se = Math.min(em.stringCount, s);
      const p = toTruthPlane(xe, stringY(em, se, xe));
      if (!p) {
        stringErr.push(FAIL);
        continue;
      }
      const px = Math.max(0, Math.min(tm.scaleLength, p.x));
      stringErr.push(Math.min(FAIL, Math.abs(p.y - stringY(tm, s, px)) / stringSpacingAt(tm, px)));
    }
  }

  // Pass 3: would the markers land in the right cells?
  let cells = 0;
  let cellsAligned = 0;
  let right = 0;
  let rightAligned = 0;
  const markerErr: number[] = [];
  const first = range.min === 0 ? 0 : range.min + 1;
  for (let f = first; f <= range.max; f++) {
    for (let s = 1; s <= tm.stringCount; s++) {
      const t = projectMarker(truth, s, f);
      if (!(t.x >= 0 && t.x <= W && t.y >= 0 && t.y <= Hh)) continue;
      cells++;
      const e = projectMarker(estimate, s, f);
      const d = Math.hypot(e.x - t.x, e.y - t.y);
      markerErr.push(Number.isFinite(d) ? d : Infinity);
      const loc = Number.isFinite(e.x + e.y) ? locatePixel(truth, e, inv) : null;
      if (loc && loc.fret === f && loc.string === s && Math.abs(loc.stringOffset) < 0.5) right++;
      // Cells the estimate has no number for (it would have to be a negative fret) cannot be aligned.
      if (f - k >= 0) {
        cellsAligned++;
        const ea = projectMarker(estimate, s, f - k);
        const la = Number.isFinite(ea.x + ea.y) ? locatePixel(truth, ea, inv) : null;
        if (la && la.fret === f && la.string === s && Math.abs(la.stringOffset) < 0.5) rightAligned++;
      }
    }
  }

  // Direction checks at the middle of the visible range.
  const mid = (range.min + range.max) / 2;
  const dir = (pose: PoseLike, along: boolean): Point => {
    const m = pose.model;
    const x = fretX(m, mid);
    const a = along ? applyHomography(pose.H, fretX(m, mid - 0.5), m.nutWidth / 2) : applyHomography(pose.H, x, boardEdgeY(m, x, 'bass'));
    const b = along ? applyHomography(pose.H, fretX(m, mid + 0.5), m.nutWidth / 2) : applyHomography(pose.H, x, boardEdgeY(m, x, 'treble'));
    return { x: b.x - a.x, y: b.y - a.y };
  };
  if (collect) {
    for (const v of fretErr) collect.fret.push(v);
    for (const v of fretErrAligned) collect.fretAligned.push(v);
    for (const v of stringErr) collect.string.push(v);
  }
  const ea = dir(estimate, true);
  const ta = dir(truth, true);
  const ec = dir(estimate, false);
  const tc = dir(truth, false);

  return {
    fretError: summarise(fretErr),
    fretErrorAligned: summarise(fretErrAligned),
    stringError: summarise(stringErr),
    markerErrorPx: summarise(markerErr),
    cellAccuracy: cells > 0 ? right / cells : 0,
    cellAccuracyAligned: cellsAligned > 0 ? rightAligned / cellsAligned : 0,
    cellCount: cells,
    numberingOffset: k === 0 ? 0 : -k,
    nutDirectionCorrect: ea.x * ta.x + ea.y * ta.y > 0,
    bassSideCorrect: ec.x * tc.x + ec.y * tc.y > 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Frame helpers
// ---------------------------------------------------------------------------------------------

/** Luminance (Rec. 601) of an RGBA frame as 0..255 bytes. Pass `out` to reuse a buffer of the same size. */
export function toGray(frame: Frame, out?: GrayFrame): GrayFrame {
  const n = frame.width * frame.height;
  const reuse = out && out.data instanceof Uint8Array && out.data.length === n ? out.data : new Uint8Array(n);
  const src = frame.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    // Integer weights 77/150/29 sum to 256.
    reuse[i] = (src[j] * 77 + src[j + 1] * 150 + src[j + 2] * 29 + 128) >> 8;
  }
  if (out && out.data === reuse) {
    out.width = frame.width;
    out.height = frame.height;
    return out;
  }
  return { data: reuse, width: frame.width, height: frame.height };
}

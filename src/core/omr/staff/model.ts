/**
 * Geometry of detected staves, in the pixel coordinates of the image they were found in (the
 * normalised page for the final layout, the raw capture for the first rough pass).
 */
import type { BarlineType, BBox, StaffKind } from '../types';

/** A detected staff: `lineCount` lines sampled at shared columns. */
export interface StaffGeom {
  lineCount: number;
  /** Sample columns, increasing, from the left end to the right end of the staff. */
  xs: Float32Array;
  /** ys[l][k] = centre of line l (0 = top) at xs[k]. */
  ys: Float32Array[];
  /** First and last column of the staff lines. */
  x0: number;
  x1: number;
  /** Mean distance between adjacent lines. */
  space: number;
  /** Line thickness in px. */
  thickness: number;
  /** Fraction of the staff's length where line ink was actually seen (0..1). */
  coverage: number;
  /** 0..1 confidence that this is a staff. */
  confidence: number;
}

/** Evidence used to decide whether a staff is notation or tab. */
export interface KindEvidence {
  lineCount: number;
  /** Staff space relative to the page's typical notation staff space. */
  spaceRatio: number;
  /** The letters T-A-B were found stacked at the start of the staff. */
  tabLetters: boolean;
  /** Blobs that look like fret digits sitting on lines. */
  digitLike: number;
  /** Blobs that look like note heads / stems inside the staff. */
  noteLike: number;
}

/** A bar line (possibly a group: double, final, repeat) of one staff. */
export interface BarlineGeom {
  /** Centre of the group at the middle of the staff. */
  x: number;
  /** Ink extent of the group. */
  x0: number;
  x1: number;
  type: BarlineType;
  /** The individual vertical strokes, left to right. */
  strokes: { x: number; width: number }[];
  /** Vertical extent (top line to bottom line at this x). */
  yTop: number;
  yBottom: number;
  /** The stroke continues into a neighbouring staff of the system (above and / or below). */
  systemWide: boolean;
  joinsAbove: boolean;
  joinsBelow: boolean;
  confidence: number;
}

/** The stretch between two bar lines. */
export interface MeasureGeom {
  index: number;
  x0: number;
  x1: number;
}

/** A staff with its role on the page. */
export interface StaffLayout extends StaffGeom {
  /** Reading-order index on the page. */
  index: number;
  kind: StaffKind;
  kindConfidence: number;
  evidence: KindEvidence;
  systemIndex: number;
  indexInSystem: number;
  /** Index of the staff of the same system that shows the same music (notation <-> tab). */
  partner: number | null;
  barlines: BarlineGeom[];
  measures: MeasureGeom[];
  /** Box around everything that belongs to the staff. */
  contentBox: BBox;
  /** Box of the "TAB" letters when found. */
  tabClef: BBox | null;
}

/** A system: staves that sound together. */
export interface SystemLayout {
  index: number;
  /** Indices into `PageLayout.staves`, top to bottom. */
  staves: number[];
  bbox: BBox;
  /** A bar line, bracket or brace joins the staves at the left. */
  connected: boolean;
}

/** Layout of a whole page. */
export interface PageLayout {
  /** Size of the analysed image. */
  width: number;
  height: number;
  /** Typical notation staff space (tab staff space when there is no notation), px. */
  staffSpace: number;
  lineThickness: number;
  staves: StaffLayout[];
  systems: SystemLayout[];
}

/** Index k such that xs[k] <= x < xs[k + 1], clamped to a valid segment. */
function segment(xs: Float32Array, x: number): number {
  const n = xs.length;
  if (n < 2 || x <= xs[0]) return 0;
  if (x >= xs[n - 1]) return n - 2;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid; else hi = mid;
  }
  return lo;
}

/** y of staff line `line` (0 = top) at column x (linear interpolation, extrapolated at the ends). */
export function lineYAt(staff: StaffGeom, line: number, x: number): number {
  const { xs } = staff;
  const ys = staff.ys[line];
  if (xs.length === 1) return ys[0];
  const k = segment(xs, x);
  const t = (x - xs[k]) / (xs[k + 1] - xs[k]);
  return ys[k] + (ys[k + 1] - ys[k]) * t;
}

/** y of the top line at x. */
export function staffTopAt(staff: StaffGeom, x: number): number {
  return lineYAt(staff, 0, x);
}

/** y of the bottom line at x. */
export function staffBottomAt(staff: StaffGeom, x: number): number {
  return lineYAt(staff, staff.lineCount - 1, x);
}

/** y of the middle of the staff at x. */
export function staffCenterAt(staff: StaffGeom, x: number): number {
  return (staffTopAt(staff, x) + staffBottomAt(staff, x)) / 2;
}

/** Local staff space at x. */
export function staffSpaceAt(staff: StaffGeom, x: number): number {
  return (staffBottomAt(staff, x) - staffTopAt(staff, x)) / (staff.lineCount - 1);
}

/**
 * Staff position of a point: half spaces above the bottom line (0 = bottom line, 2 = next line
 * up, negative below the staff). For a tab staff, string s sits at position 2 * (lineCount - s).
 */
export function staffPositionAt(staff: StaffGeom, x: number, y: number): number {
  return (staffBottomAt(staff, x) - y) / (staffSpaceAt(staff, x) / 2);
}

/** y of a staff position (see {@link staffPositionAt}) at x. */
export function yAtStaffPosition(staff: StaffGeom, x: number, position: number): number {
  return staffBottomAt(staff, x) - (position * staffSpaceAt(staff, x)) / 2;
}

/** Distance from the left end of the staff in staff spaces. */
export function staffUnitsX(staff: StaffGeom, x: number): number {
  return (x - staff.x0) / staff.space;
}

/** Box around the staff lines. */
export function staffBox(staff: StaffGeom): BBox {
  let top = Infinity;
  let bottom = -Infinity;
  const a = staff.ys[0];
  const b = staff.ys[staff.lineCount - 1];
  for (let k = 0; k < a.length; k++) {
    if (a[k] < top) top = a[k];
    if (b[k] > bottom) bottom = b[k];
  }
  return { x: staff.x0, y: top - staff.thickness / 2, w: staff.x1 - staff.x0, h: bottom - top + staff.thickness };
}

/** Slope (dy/dx) of the staff's middle between its ends. */
export function staffSlope(staff: StaffGeom): number {
  const n = staff.xs.length;
  if (n < 2) return 0;
  const m = (staff.lineCount - 1) / 2;
  const lo = Math.floor(m);
  const hi = Math.ceil(m);
  const y0 = (staff.ys[lo][0] + staff.ys[hi][0]) / 2;
  const y1 = (staff.ys[lo][n - 1] + staff.ys[hi][n - 1]) / 2;
  return (y1 - y0) / (staff.xs[n - 1] - staff.xs[0]);
}

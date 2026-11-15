/**
 * Assisted calibration: the fallbacks that make the camera usable when automatic detection cannot
 * lock (or the numbering is ambiguous). Each helper turns what the learner did on screen into a
 * `FretboardPose` whose numbers rest on the user; hand it to `FretboardTracker.calibrate` and the
 * tracker follows the board from there (its first frame snaps the pose onto the real wires).
 *
 *  - four taps: both ends of the nut and both ends of the 12th fret (`poseFromTaps`), or both ends
 *    of any two known wires (`poseFromWireTaps`);
 *  - a quadrilateral dragged over the board between two known wires (`poseFromQuad`), starting from
 *    `defaultCalibrationQuad`;
 *  - one-tap numbering fixes (`shiftNumbering`, `FretboardTracker.confirmFret`);
 *  - small manual corrections (`nudgePose`).
 *
 * All coordinates are pixels of the frame the tracker is fed (not of a mirrored display: convert
 * display taps with `displayToFrame` from `overlay.ts` first).
 */
import {
  applyHomography,
  boardEdgeY,
  checkPlausibleView,
  computeVisibleFrets,
  expectedOrientation,
  fretSpacing,
  fretX,
  homographyFromPoints,
  homographyOrientation,
  multiply,
  neckModel,
  renumberPose,
  stringSpacingAt,
  transformPose,
  makePose,
  type CalibrationTaps,
} from './geometry';
import type { DetectOptions, FretboardPose, Mat3, NeckModel, Point } from './types';

/** One tapped fret wire: its number (0 = the nut) and its two ends in frame pixels, in either order. */
export interface WireTap {
  fret: number;
  ends: readonly [Point, Point];
}

/** Calibration settings: the orientation hints and the guitar, as for detection. */
export type CalibrationOptions = Pick<DetectOptions, 'bassSideUp' | 'mirrored' | 'leftHanded' | 'model'>;

/** Loose plausibility limits for a pose the user drew: anything a real camera could have seen. */
const USER_LIMITS = { minSpan: 0.03, maxSpan: 20, maxLogAspect: Math.log(3), maxSkew: 0.7, maxTiltDeg: 80, maxScaleRatio: 8 };

function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/**
 * Pose from both ends of two known fret wires (fret 0 = the nut). Which end of each pair is the bass
 * side comes from `bassSideUp` (default: the end higher in the image); for a neck standing nearly
 * upright in the image it comes from the handedness flags instead. When the taps show the neck the
 * other way round from what `leftHanded` says, the taps win and the pose says so (`leftHanded`
 * flipped): the learner pointed at the real board. Null for degenerate or impossible taps.
 */
export function poseFromWireTaps(a: WireTap, b: WireTap, frameWidth: number, frameHeight: number, options: CalibrationOptions = {}): FretboardPose | null {
  const model: NeckModel = typeof options.model === 'object' ? neckModel(options.model) : neckModel(options.model ?? 'steel');
  if (!Number.isFinite(a.fret) || !Number.isFinite(b.fret) || a.fret === b.fret || a.fret < 0 || b.fret < 0) return null;
  // Order the wires along the neck: `near` is the one closer to the nut.
  const [near, far] = a.fret < b.fret ? [a, b] : [b, a];
  const xn = fretX(model, Math.round(near.fret));
  const xf = fretX(model, Math.round(far.fret));
  const plane: Point[] = [
    { x: xn, y: boardEdgeY(model, xn, 'bass') },
    { x: xn, y: boardEdgeY(model, xn, 'treble') },
    { x: xf, y: boardEdgeY(model, xf, 'treble') },
    { x: xf, y: boardEdgeY(model, xf, 'bass') },
  ];
  const solve = (nb: Point, nt: Point, fb: Point, ft: Point): Mat3 | null => homographyFromPoints(plane, [nb, nt, ft, fb]);
  let [n0, n1] = near.ends;
  let [f0, f1] = far.ends;
  if (![n0, n1, f0, f1].every((p) => Number.isFinite(p.x + p.y))) return null;
  // The long edges n0-f0 and n1-f1 must not cross.
  if (crosses(n0, f0, n1, f1)) [f0, f1] = [f1, f0];
  const bassUp = options.bassSideUp ?? true;
  const mirrored = options.mirrored ?? false;
  let leftHanded = options.leftHanded ?? false;
  const across = { x: (n1.x - n0.x + f1.x - f0.x) / 2, y: (n1.y - n0.y + f1.y - f0.y) / 2 };
  const upright = Math.abs(across.y) < 0.35 * Math.abs(across.x);
  let swap: boolean;
  if (!upright) {
    // n0 is the bass end when it is above (smaller y) and the bass side is up, or below and it is down.
    swap = across.y > 0 !== bassUp;
  } else {
    const trial = solve(n0, n1, f0, f1);
    if (!trial) return null;
    swap = homographyOrientation(trial, (xn + xf) / 2, model.nutWidth / 2) !== expectedOrientation(mirrored, leftHanded);
  }
  if (swap) {
    [n0, n1] = [n1, n0];
    [f0, f1] = [f1, f0];
  }
  const H = solve(n0, n1, f0, f1);
  if (!H) return null;
  if (!checkPlausibleView(H, model, frameWidth, frameHeight, USER_LIMITS).plausible) return null;
  // The camera always sees the face of the board: the taps fix the handedness.
  if (homographyOrientation(H, (xn + xf) / 2, model.nutWidth / 2) !== expectedOrientation(mirrored, leftHanded)) leftHanded = !leftHanded;
  return makePose(H, model, frameWidth, frameHeight, { confidence: 1, mirrored, leftHanded, numbering: 'user', numberingConfidence: 1 });
}

/** Pose from the classic four taps: both ends of the nut and both ends of one fret (the 12th by default). */
export function poseFromTaps(taps: CalibrationTaps, frameWidth: number, frameHeight: number, options: CalibrationOptions = {}): FretboardPose | null {
  return poseFromWireTaps({ fret: 0, ends: taps.nut }, { fret: taps.fretNumber ?? 12, ends: taps.fret }, frameWidth, frameHeight, options);
}

/** Wires a dragged quadrilateral spans (default: the nut to the 12th fret). */
export interface QuadSpan {
  fromFret?: number;
  toFret?: number;
}

/**
 * Pose from a quadrilateral dragged over the board, its corners in order around it (either
 * direction, any start), covering the board from wire `fromFret` to wire `toFret`. The two longer
 * opposite sides run along the neck. Which short side is the nut end and which long side the bass
 * edge follow from `bassSideUp` and the handedness flags, as for detection; for an upright neck the
 * headstock is taken to be up. Null for a degenerate quadrilateral.
 */
export function poseFromQuad(corners: readonly Point[], frameWidth: number, frameHeight: number, options: CalibrationOptions & QuadSpan = {}): FretboardPose | null {
  if (corners.length !== 4 || !corners.every((p) => Number.isFinite(p.x + p.y))) return null;
  const from = options.fromFret ?? 0;
  const to = options.toFret ?? 12;
  if (!(to > from) || from < 0) return null;
  const len = (i: number): number => Math.hypot(corners[(i + 1) % 4].x - corners[i].x, corners[(i + 1) % 4].y - corners[i].y);
  // Sides 0-1 and 2-3 are one opposite pair, 1-2 and 3-0 the other; the short pair are the wires.
  const k = len(0) + len(2) <= len(1) + len(3) ? 0 : 1;
  const wireA: [Point, Point] = [corners[k], corners[k + 1]];
  const wireB: [Point, Point] = [corners[(k + 3) % 4], corners[(k + 2) % 4]];
  const mid = (w: [Point, Point]): Point => ({ x: (w[0].x + w[1].x) / 2, y: (w[0].y + w[1].y) / 2 });
  const ma = mid(wireA);
  const mb = mid(wireB);
  const along = { x: mb.x - ma.x, y: mb.y - ma.y };
  const mirrored = options.mirrored ?? false;
  const leftHanded = options.leftHanded ?? false;
  const bassUp = options.bassSideUp ?? true;
  // Where the nut is, from the hints: a right-handed player seen in a true image has the nut on the
  // image right (bass edge up); mirroring or left-handedness flips it, and so does a bass edge down.
  const nutRight = (expectedOrientation(mirrored, leftHanded) === -1) === bassUp;
  const upright = Math.abs(along.y) > Math.abs(along.x);
  const aIsNut = upright ? ma.y < mb.y : nutRight ? ma.x > mb.x : ma.x < mb.x;
  const nutWire = aIsNut ? wireA : wireB;
  const farWire = aIsNut ? wireB : wireA;
  return poseFromWireTaps({ fret: from, ends: nutWire }, { fret: to, ends: farWire }, frameWidth, frameHeight, options);
}

/**
 * A starting quadrilateral for the drag UI: a board of typical size in the middle of the frame, nut
 * on the side the hints imply. Returned as the four taps it stands for (nut ends, 12th-fret ends,
 * bass end first) and as corners in order around it, ready for `poseFromQuad`.
 */
export function defaultCalibrationQuad(frameWidth: number, frameHeight: number, options: CalibrationOptions = {}): { taps: CalibrationTaps; corners: Point[] } {
  const bassUp = options.bassSideUp ?? true;
  const nutRight = (expectedOrientation(options.mirrored ?? false, options.leftHanded ?? false) === -1) === bassUp;
  const cy = frameHeight * 0.5;
  const nutX = frameWidth * (nutRight ? 0.82 : 0.18);
  const fretX12 = frameWidth * (nutRight ? 0.3 : 0.7);
  const half = (w: number): number => frameHeight * w;
  const bassSign = bassUp ? -1 : 1;
  const nut: [Point, Point] = [
    { x: nutX, y: cy + bassSign * half(0.06) },
    { x: nutX, y: cy - bassSign * half(0.06) },
  ];
  const fret: [Point, Point] = [
    { x: fretX12, y: cy + bassSign * half(0.075) },
    { x: fretX12, y: cy - bassSign * half(0.075) },
  ];
  return { taps: { nut, fret, fretNumber: 12 }, corners: [nut[0], nut[1], fret[1], fret[0]] };
}

/** Shift every fret number by `delta` ("it is two frets higher"); the numbering now rests on the user. */
export function shiftNumbering(pose: FretboardPose, delta: number): FretboardPose {
  return renumberPose(pose, Math.round(delta), 'user', 1);
}

/** A small manual correction of a pose. All fields optional; they apply in the order listed. */
export interface PoseNudge {
  /** Slide along the neck by this many local fret spacings (positive = toward the bridge). */
  alongFrets?: number;
  /** Move across the neck by this many string spacings (positive = toward the treble side). */
  acrossStrings?: number;
  /** Turn by this many degrees (clockwise on screen) about the middle of the visible board. */
  rotateDeg?: number;
  /** Scale about the middle of the visible board (1 = unchanged). */
  scale?: number;
  /** Move by this many frame pixels. */
  dx?: number;
  dy?: number;
}

/** Apply a manual correction to a pose (the numbering is unchanged). */
export function nudgePose(pose: FretboardPose, nudge: PoseNudge): FretboardPose {
  const m = pose.model;
  const vis = pose.visibleFrets.max > pose.visibleFrets.min ? pose.visibleFrets : { min: 0, max: 12 };
  const midFret = (vis.min + vis.max) / 2;
  const xm = fretX(m, midFret);
  let H = pose.H;
  const along = (nudge.alongFrets ?? 0) * fretSpacing(m, Math.max(1, Math.round(midFret)));
  const across = (nudge.acrossStrings ?? 0) * stringSpacingAt(m, xm);
  if (along !== 0 || across !== 0) H = multiply(H, [1, 0, along, 0, 1, across, 0, 0, 1]);
  const c = applyHomography(H, xm, m.nutWidth / 2);
  const turn = ((nudge.rotateDeg ?? 0) * Math.PI) / 180;
  const k = nudge.scale ?? 1;
  const cos = Math.cos(turn) * k;
  const sin = Math.sin(turn) * k;
  const tx = nudge.dx ?? 0;
  const ty = nudge.dy ?? 0;
  // Rotate and scale about c, then translate: p' = R (p - c) + c + t.
  const T: Mat3 = [cos, -sin, c.x - cos * c.x + sin * c.y + tx, sin, cos, c.y - sin * c.x - cos * c.y + ty, 0, 0, 1];
  const moved = transformPose({ ...pose, H }, T, pose.frameWidth, pose.frameHeight);
  return { ...moved, visibleFrets: computeVisibleFrets(moved.H, m, pose.frameWidth, pose.frameHeight) };
}

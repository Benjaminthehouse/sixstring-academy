/**
 * Zoom to the neck: show only the part of the camera picture around the notes on the tracked neck,
 * so the note dots and their labels are big enough to read.
 *
 * On a phone held upright a 16:9 picture is about 360 px wide and the strings are 6-7 px apart on
 * screen, so a dot that fits between two strings is about 12 px across and its label is unreadable.
 * The picture cannot get wider, but most of it is not needed: the notes of a shape or a chord sit
 * in four or five frets. `neckCrop` picks the part of the frame (`CropRect`) that holds them, with
 * a fret of context either side, magnified just enough for readable dots (and never more than 3x);
 * `CropFollower` moves that window smoothly and only when the neck really moved, so the picture
 * does not swim with every sway; `videoCropTransform` is the CSS transform that shows the same part
 * of a `<video>`. The overlay takes the crop in its `DisplayView` (`view.crop`), so every
 * conversion (`poseForDisplay`, `frameToDisplay`, `displayToFrame`) agrees with the picture.
 */
import { applyHomography, boardEdgeY, fretX } from './geometry';
import { displayTransform, placeMarkers, type CropRect, type DisplayView } from './overlay';
import type { FretPosition, FretboardPose, Point } from './types';

/** The whole frame. */
export const FULL_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 };

/** Options of `neckCrop`. */
export interface NeckCropOptions {
  /** Dot radius on screen (CSS px) worth zooming for: magnify just enough to reach it (default 10: labels about 10.5 px). */
  readableRadius?: number;
  /** Most magnification over the whole picture (default 4). */
  maxZoom?: number;
  /** Fret cells of context kept on either side of the notes (default 0.5). */
  marginFrets?: number;
  /** Room kept beyond each edge of the board, as a share of its width (default 0.15). */
  air?: number;
  /** Below this magnification the whole picture is shown instead (default 1.25). */
  minZoom?: number;
}

/** Is this crop the whole frame (or no crop at all)? */
export function isFullCrop(crop: CropRect | null | undefined): boolean {
  return !crop || (crop.x <= 1e-6 && crop.y <= 1e-6 && crop.width >= 1 - 1e-6 && crop.height >= 1 - 1e-6);
}

/** How much a crop magnifies over the whole frame shown in `view` (1 = not at all). */
export function cropZoom(view: DisplayView, frameWidth: number, frameHeight: number): number {
  const whole = displayTransform({ ...view, crop: undefined }, frameWidth, frameHeight);
  const t = displayTransform(view, frameWidth, frameHeight);
  return whole.sx > 0 ? t.sx / whole.sx : 1;
}

/**
 * The part of the frame (fractions) that shows `notes` on `pose` with dots of about
 * `readableRadius` CSS px in `view` (contain fit; the view's own `crop` is ignored), or
 * `FULL_CROP` when the whole picture already shows them that big, when there is nothing to zoom on,
 * or when the notes are spread too wide for it to help.
 */
export function neckCrop(pose: FretboardPose, notes: readonly FretPosition[], view: DisplayView, options: NeckCropOptions = {}): CropRect {
  const fw = pose.frameWidth;
  const fh = pose.frameHeight;
  if (!(fw > 0 && fh > 0 && view.width > 0 && view.height > 0) || notes.length === 0) return FULL_CROP;
  const readable = options.readableRadius ?? 10;
  const maxZoom = options.maxZoom ?? 4;
  const margin = options.marginFrets ?? 0.5;
  const whole = displayTransform({ ...view, crop: undefined, fit: 'contain' }, fw, fh).sx;
  const placed = placeMarkers(pose, notes).filter((p) => p.visible && p.radius > 0);
  if (placed.length === 0 || !(whole > 0)) return FULL_CROP;
  const radii = placed.map((p) => p.radius).sort((a, b) => a - b);
  const shown = radii[radii.length >> 1] * whole;
  if (shown >= readable) return FULL_CROP;
  // The board around the notes: the cells they sit in plus `margin` cells either side, edge to edge
  // with a little air (fret positions may be fractional: wire n is at L(1 - 2^(-n/12))).
  const frets = placed.map((p) => p.fret);
  const m = pose.model;
  const lo = Math.min(...frets) - 1 - margin;
  const hi = Math.min(m.fretCount, Math.max(...frets) + margin);
  const x0 = lo <= 0 ? (Math.min(...frets) === 0 ? -14 : -4) : fretX(m, lo);
  const x1 = fretX(m, hi);
  const pts: Point[] = [];
  for (const x of [x0, x1]) {
    const bass = boardEdgeY(m, Math.max(0, x), 'bass');
    const treble = boardEdgeY(m, Math.max(0, x), 'treble');
    const air = (options.air ?? 0.15) * (treble - bass);
    pts.push(applyHomography(pose.H, x, bass - air), applyHomography(pose.H, x, treble + air));
  }
  if (!pts.every((p) => Number.isFinite(p.x + p.y))) return FULL_CROP;
  const bx0 = Math.max(0, Math.min(...pts.map((p) => p.x)));
  const bx1 = Math.min(fw, Math.max(...pts.map((p) => p.x)));
  const by0 = Math.max(0, Math.min(...pts.map((p) => p.y)));
  const by1 = Math.min(fh, Math.max(...pts.map((p) => p.y)));
  if (!(bx1 > bx0 && by1 > by0)) return FULL_CROP;
  // Magnify only as much as the dots need, as much as the notes' part of the board allows, and not
  // past `maxZoom`.
  const fits = Math.min(view.width / ((bx1 - bx0) * whole), view.height / ((by1 - by0) * whole));
  const zoom = Math.min(maxZoom, readable / shown, fits);
  if (!(zoom >= (options.minZoom ?? 1.25))) return FULL_CROP;
  // The part of the frame the view shows at that magnification: the view's shape where the frame
  // has room (it fills the view exactly), the frame's full height or width where it has not (a
  // full-screen phone held upright: bands above and below, as without the zoom).
  const s = whole * zoom;
  const w = Math.min(fw, view.width / s);
  const h = Math.min(fh, view.height / s);
  const cx = Math.min(fw - w / 2, Math.max(w / 2, (bx0 + bx1) / 2));
  const cy = Math.min(fh - h / 2, Math.max(h / 2, (by0 + by1) / 2));
  return { x: (cx - w / 2) / fw, y: (cy - h / 2) / fh, width: w / fw, height: h / fh };
}

/** Options of `CropFollower`. */
export interface CropFollowerOptions {
  /** How fast the shown crop eases toward a new goal: time constant in ms (default 280). */
  timeConstantMs?: number;
  /** A new target closer than this to the goal (fraction of the crop's size, in position and in zoom) is ignored (default 0.12). */
  deadband?: number;
}

/**
 * Moves the shown crop toward the newest target, smoothly, and only when the target moved by more
 * than the deadband: a swaying neck keeps a still picture; a neck moved along, or a new shape
 * further up, glides the window over in about half a second.
 */
export class CropFollower {
  private readonly tau: number;
  private readonly deadband: number;
  private shown: CropRect = FULL_CROP;
  private goal: CropRect = FULL_CROP;
  private last = NaN;

  /** Create a follower showing the whole frame. */
  constructor(options: CropFollowerOptions = {}) {
    this.tau = Math.max(1, options.timeConstantMs ?? 280);
    this.deadband = options.deadband ?? 0.12;
  }

  /** The crop shown now. */
  get current(): CropRect {
    return this.shown;
  }

  /** Back to the whole frame at once. */
  reset(): void {
    this.shown = FULL_CROP;
    this.goal = FULL_CROP;
    this.last = NaN;
  }

  /** The crop to show at `timeMs` on the way to `target` (`snap`: go there at once, e.g. with reduced motion). */
  update(target: CropRect, timeMs: number, snap = false): CropRect {
    if (this.differs(target, this.goal)) this.goal = target;
    const dt = Number.isFinite(this.last) ? Math.max(0, Math.min(250, timeMs - this.last)) : 0;
    this.last = timeMs;
    if (snap) {
      this.shown = this.goal;
      return this.shown;
    }
    const a = 1 - Math.exp(-dt / this.tau);
    const s = this.shown;
    const g = this.goal;
    const next = { x: s.x + a * (g.x - s.x), y: s.y + a * (g.y - s.y), width: s.width + a * (g.width - s.width), height: s.height + a * (g.height - s.height) };
    // Close enough: land exactly (a full crop then turns the zoom off for good).
    const done = Math.abs(next.x - g.x) + Math.abs(next.y - g.y) + Math.abs(next.width - g.width) + Math.abs(next.height - g.height) < 0.002;
    this.shown = done ? g : next;
    return this.shown;
  }

  /** The target is worth moving for: zoom on or off, or a shift or a size change beyond the deadband. */
  private differs(a: CropRect, b: CropRect): boolean {
    if (isFullCrop(a) !== isFullCrop(b)) return true;
    const w = Math.max(1e-6, b.width);
    const h = Math.max(1e-6, b.height);
    const moved = Math.max(Math.abs(a.x + a.width / 2 - (b.x + w / 2)) / w, Math.abs(a.y + a.height / 2 - (b.y + h / 2)) / h);
    const scaled = Math.abs(Math.log(Math.max(1e-6, a.width) / w));
    return moved > this.deadband || scaled > this.deadband;
  }
}

/**
 * The CSS `transform` that makes a `<video>` (its box the view's size, `object-fit` as `view.fit`,
 * `transform-origin: 0 0`) show `view.crop`, mirroring included; null when there is no crop (use
 * the element's own styling then). Set it on the element in the frame callback that draws the
 * overlay with the same view, so picture and dots move together.
 */
export function videoCropTransform(view: DisplayView, videoWidth: number, videoHeight: number): string | null {
  if (isFullCrop(view.crop) || !(videoWidth > 0 && videoHeight > 0)) return null;
  const base = displayTransform({ ...view, crop: undefined }, videoWidth, videoHeight);
  const t = displayTransform(view, videoWidth, videoHeight);
  const kx = t.sx / base.sx;
  const ky = t.sy / base.sy;
  const tx = t.ox - kx * base.ox;
  const ty = t.oy - ky * base.oy;
  const f = (v: number): string => (Math.round(v * 1e6) / 1e6).toString();
  return view.mirrored ? `matrix(${f(-kx)}, 0, 0, ${f(ky)}, ${f(view.width - tx)}, ${f(ty)})` : `matrix(${f(kx)}, 0, 0, ${f(ky)}, ${f(tx)}, ${f(ty)})`;
}

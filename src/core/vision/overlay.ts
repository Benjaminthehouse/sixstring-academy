/**
 * Drawing helpers for the camera overlay: where each note marker goes and how big it is, and the
 * conversions between the frame the tracker saw and the canvas the learner sees (which may be a
 * different size, cropped or letterboxed like a `<video>` with `object-fit`, and a mirrored selfie
 * preview). `draw.ts` builds the full overlay on top of these.
 */
import { fretSpacingPx, mirrorPose, projectMarker, transformPose } from './geometry';
import type { FretPosition, FretboardPose, Point } from './types';

/**
 * How the camera picture is shown: canvas size (CSS pixels), whether it is flipped left-right
 * relative to the frames the tracker gets, and how the picture is fitted into the box (the
 * `object-fit` of the `<video>`: 'fill' stretches, 'contain' letterboxes, 'cover' crops; default 'fill').
 */
export interface DisplayView {
  width: number;
  height: number;
  /** The display shows the mirror image of the tracked frames (a selfie preview of true frames). */
  mirrored?: boolean;
  /** How the frame is fitted into width x height (default 'fill'). */
  fit?: 'fill' | 'contain' | 'cover';
}

/** Scale and offset taking frame pixels to display pixels (before any mirroring). */
export function displayTransform(view: DisplayView, frameWidth: number, frameHeight: number): { sx: number; sy: number; ox: number; oy: number } {
  const fx = view.width / frameWidth;
  const fy = view.height / frameHeight;
  if (!view.fit || view.fit === 'fill' || !(frameWidth > 0 && frameHeight > 0)) return { sx: fx, sy: fy, ox: 0, oy: 0 };
  const s = view.fit === 'contain' ? Math.min(fx, fy) : Math.max(fx, fy);
  return { sx: s, sy: s, ox: (view.width - frameWidth * s) / 2, oy: (view.height - frameHeight * s) / 2 };
}

/** The pose moved onto the display canvas (scaled and fitted, and mirrored if the display is). */
export function poseForDisplay(pose: FretboardPose, view: DisplayView): FretboardPose {
  const t = displayTransform(view, pose.frameWidth, pose.frameHeight);
  const placed = transformPose(pose, [t.sx, 0, t.ox, 0, t.sy, t.oy, 0, 0, 1], view.width, view.height);
  return view.mirrored ? mirrorPose(placed) : placed;
}

/** A display point (a tap) in pixels of the tracked frame. */
export function displayToFrame(point: Point, view: DisplayView, frameWidth: number, frameHeight: number): Point {
  const t = displayTransform(view, frameWidth, frameHeight);
  const x = view.mirrored ? view.width - point.x : point.x;
  return { x: (x - t.ox) / t.sx, y: (point.y - t.oy) / t.sy };
}

/** A frame point in display pixels. */
export function frameToDisplay(point: Point, view: DisplayView, frameWidth: number, frameHeight: number): Point {
  const t = displayTransform(view, frameWidth, frameHeight);
  const x = point.x * t.sx + t.ox;
  return { x: view.mirrored ? view.width - x : x, y: point.y * t.sy + t.oy };
}

/** Where to draw one note marker. */
export interface MarkerPlacement extends FretPosition {
  /** Centre in pixels of the pose's frame. */
  x: number;
  y: number;
  /** A radius that fits the cell: at most half the string spacing and a third of the fret spacing there. */
  radius: number;
  /** The centre lies inside the frame. */
  visible: boolean;
}

/**
 * Marker placements for fretted positions (string 1 = high E; fret 0 = open, drawn just behind the
 * nut). Use with `poseForDisplay` to draw straight onto the display canvas.
 */
export function placeMarkers(pose: FretboardPose, positions: readonly FretPosition[]): MarkerPlacement[] {
  const m = pose.model;
  return positions.map((pos) => {
    const p = projectMarker(pose, pos.string, pos.fret);
    const fret = Math.max(1, pos.fret);
    const a = projectMarker(pose, 1, fret);
    const b = projectMarker(pose, m.stringCount, fret);
    const stringGap = Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, m.stringCount - 1);
    const r = Math.min(0.5 * stringGap, fretSpacingPx(pose, fret, pos.string) / 3);
    const ok = Number.isFinite(p.x + p.y + r);
    return {
      string: pos.string,
      fret: pos.fret,
      x: p.x,
      y: p.y,
      radius: ok ? Math.max(2, r) : 0,
      visible: ok && p.x >= 0 && p.y >= 0 && p.x <= pose.frameWidth && p.y <= pose.frameHeight,
    };
  });
}

/**
 * Coaching for the camera screen: what the learner should do so that automatic tracking can be
 * trusted, and how far it can be trusted right now.
 *
 * `FretboardTracker` fills `TrackerUpdate.guidance` from three cheap measurements per frame:
 *  - the frame (`frameStats`): brightness, clipping and sensor noise (a dim room under auto
 *    exposure shows up as noise more than as a dark picture);
 *  - the board as the pose sees it (`viewStats`): string spacing in pixels, foreshortening, how
 *    many frets are in view, whether the nut is;
 *  - the tracker's own state: lost, coasting through blur, numbering a guess, calibration offered.
 *
 * The operating limits below were measured on two independent synthetic benches (the original one
 * and `testing/alt-scenes.ts`); README.md and API.md give the numbers behind each. They are the
 * honest edge of what automatic lock does on those benches, not a promise about real cameras.
 */
import { applyHomography, fretX, stringY } from './geometry';
import type { Frame, FretboardPose } from './types';

/** What the camera screen should tell the learner. */
export type GuidanceCode =
  | 'ok'
  | 'point-camera'
  | 'too-dark'
  | 'too-bright'
  | 'move-closer'
  | 'tilt-toward-camera'
  | 'hold-still'
  | 'show-nut'
  | 'confirm-fret'
  | 'check-guitar-type'
  | 'calibrate';

/** How far the drawn notes can be trusted right now. */
export type GuidanceTrust =
  /** Locked inside the operating limits: draw the notes. */
  | 'auto'
  /** Geometry is followed but the fret numbers (or the guitar type) need the learner's word: ask. */
  | 'confirm'
  /** Automatic detection is not working here: offer the four-tap calibration. */
  | 'calibrate'
  /** Nothing trustworthy yet (searching, lost, or a board outside the limits): coach, do not draw notes. */
  | 'wait';

/** One line of coaching plus what it rests on. */
export interface TrackerGuidance {
  code: GuidanceCode;
  trust: GuidanceTrust;
  /** Plain words for the learner (second person, no jargon). */
  message: string;
  /** The measurements behind it (NaN when not measured). */
  measures: {
    /** Mean luminance 0..255 of the frame. */
    brightness: number;
    /** Share of clipped (near-white) pixels. */
    clipped: number;
    /** Estimated sensor noise, gray levels (sigma). */
    noise: number;
    /** Distance between neighbouring strings at the middle of the visible board, frame pixels. */
    stringSpacingPx: number;
    /** Estimated angle between the board normal and the camera axis, degrees. */
    offNormalDeg: number;
    /** Fret wires in the frame. */
    visibleFrets: number;
    /** The nut is in the frame. */
    nutInView: boolean;
  };
}

/**
 * Operating limits of automatic lock (see README.md, "Operating limits", for the sweeps they come
 * from). Outside them the tracker may still lock, but `trust` says 'wait' and the coaching asks for
 * the change that brings the view back inside.
 */
export const OPERATING_LIMITS = {
  /** Strings closer than this (frame pixels at the working size) are not resolved reliably. */
  minStringSpacingPx: 4.5,
  /** Views more oblique than this lose the strings and bend the fret comb. */
  maxOffNormalDeg: 52,
  /** Sensor noise (gray levels) above which the picture is too dark to track. */
  maxNoise: 14,
  /** Mean brightness below which the picture is too dark even without visible noise. */
  minBrightness: 28,
  /** Share of clipped pixels above which the camera is blinded (window or lamp behind the player). */
  maxClipped: 0.3,
} as const;

/** Brightness, clipping and noise of a frame. */
export interface FrameStats {
  brightness: number;
  clipped: number;
  noise: number;
}

const HIST = new Uint32Array(256);

/**
 * Brightness, clipping and noise on a sparse grid (every `step`-th row and column, about 1 ms at
 * 640x360). Noise is the robust Immerkaer estimate: the median absolute response of the 3x3
 * second-difference kernel over 4.05, which ignores edges and texture as long as most of the
 * picture is smooth at that scale.
 */
export function frameStats(frame: Frame, step = 3): FrameStats {
  const { data, width: w, height: h } = frame;
  if (!(w >= 8 && h >= 8) || data.length < w * h * 4) return { brightness: NaN, clipped: NaN, noise: NaN };
  HIST.fill(0);
  let sum = 0;
  let clipped = 0;
  let n = 0;
  const lum = (x: number, y: number): number => {
    const i = (y * w + x) * 4;
    return (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
  };
  for (let y = 1; y < h - 1; y += step) {
    for (let x = 1; x < w - 1; x += step) {
      const c = lum(x, y);
      sum += c;
      if (c >= 250) clipped++;
      const r =
        lum(x - 1, y - 1) + lum(x + 1, y - 1) + lum(x - 1, y + 1) + lum(x + 1, y + 1) - 2 * (lum(x, y - 1) + lum(x, y + 1) + lum(x - 1, y) + lum(x + 1, y)) + 4 * c;
      // Clipped pixels have no noise left to measure.
      if (c > 4 && c < 250) HIST[Math.min(255, Math.abs(r))]++;
      n++;
    }
  }
  let total = 0;
  for (let i = 0; i < 256; i++) total += HIST[i];
  let acc = 0;
  let median = 0;
  for (let i = 0; i < 256; i++) {
    acc += HIST[i];
    if (acc * 2 >= total) {
      median = i;
      break;
    }
  }
  return { brightness: n ? sum / n : NaN, clipped: n ? clipped / n : NaN, noise: total ? median / 4.05 : NaN };
}

/** How the board sits in the frame, from a pose. */
export interface ViewStats {
  stringSpacingPx: number;
  offNormalDeg: number;
  visibleFrets: number;
  nutInView: boolean;
}

/**
 * String spacing at the middle of the visible board, and the angle off the board normal from the
 * local foreshortening there (ratio of the two singular values of the plane-to-image Jacobian:
 * 1 front-on, cos(angle) when tilted). The model's widths enter the ratio, so a neck much wider or
 * narrower than its preset reads a few degrees off; it is meant for coarse coaching only.
 */
export function viewStats(pose: FretboardPose): ViewStats {
  const m = pose.model;
  const v = pose.visibleFrets;
  const visible = v.max >= v.min ? v.max - v.min + 1 : 0;
  const mid = visible > 0 ? Math.max(1, Math.round((v.min + v.max) / 2)) : 7;
  const x = fretX(m, mid - 0.5);
  const a = applyHomography(pose.H, x, stringY(m, 1, x));
  const b = applyHomography(pose.H, x, stringY(m, m.stringCount, x));
  const spacing = Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, m.stringCount - 1);
  // Jacobian by central differences over 1 mm.
  const yc = m.nutWidth / 2;
  const px = applyHomography(pose.H, x + 0.5, yc);
  const nx = applyHomography(pose.H, x - 0.5, yc);
  const py = applyHomography(pose.H, x, yc + 0.5);
  const ny = applyHomography(pose.H, x, yc - 0.5);
  const j00 = px.x - nx.x;
  const j10 = px.y - nx.y;
  const j01 = py.x - ny.x;
  const j11 = py.y - ny.y;
  // Singular values of the 2x2 Jacobian.
  const s1 = j00 * j00 + j01 * j01 + j10 * j10 + j11 * j11;
  const det = Math.abs(j00 * j11 - j01 * j10);
  const root = Math.sqrt(Math.max(0, s1 * s1 - 4 * det * det));
  const big = Math.sqrt((s1 + root) / 2);
  const small = Math.sqrt(Math.max(0, (s1 - root) / 2));
  const ratio = big > 0 ? Math.min(1, small / big) : NaN;
  return {
    stringSpacingPx: Number.isFinite(spacing) ? spacing : NaN,
    offNormalDeg: Number.isFinite(ratio) ? (Math.acos(ratio) * 180) / Math.PI : NaN,
    visibleFrets: visible,
    nutInView: v.min === 0 && visible > 0,
  };
}

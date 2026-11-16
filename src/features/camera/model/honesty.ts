/**
 * Are the dots on screen where the neck is? The overlay draws every video frame from the newest
 * tracker answer carried forward to that frame (the vision pipeline predicts it), so while the
 * neck moves the dots can trail it, more on a slow or busy device. Two checks, and the dots turn
 * into outlines when either fails:
 *
 *  - Expected: the neck's speed times how late the tracker's answers arrive. Catches a trail
 *    before it shows.
 *  - Measured: a moment after a frame is drawn, the tracker's answer for that very frame arrives;
 *    the dots drawn on it are compared with where the tracker found the neck. Catches what the
 *    guess misses (a prediction that overshot as the neck turned back, a device so slow or busy
 *    that its answers come few and far between: there the guess alone let 20-40% of the frames of
 *    a swaying neck show solid dots off their frets).
 *
 * Checked on independent rendered scenes of a swaying neck (`e2e/camera-alt.cjs`): at normal speed
 * the solid dots were right on 97-100% of the frames that showed them, on most frames; under a 4x
 * CPU slow-down most frames show outlines, and 70-95% of the few solid ones were right.
 */
import { fretX, projectMarker, projectPlanePoint, type FretboardPose } from '@/core/vision';

/** Measured this far off (in string spacings: half a string is the neighbouring string), the dots turn into outlines... */
export const OFF_GHOST = 0.5;
/** ...until `SOLID_AFTER` answers in a row are at most `OFF_SOLID` off. */
export const OFF_SOLID = 0.35;
export const SOLID_AFTER = 1;

/** Expected trail (string spacings) from which the dots turn into outlines; solid again below `TRAIL_SOLID`. */
export const TRAIL_GHOST = 0.45;
export const TRAIL_SOLID = 0.27;

/**
 * The expected trail of the dots behind a moving neck, in string spacings: speed (working-frame
 * pixels per second) times how late the answers arrive. A rough guess on purpose (the pipeline
 * predicts the pose forward, so the real trail is usually smaller); the measured check below
 * catches what it misses. 0 when it cannot be told.
 */
export function expectedTrail(speedPxPerSec: number, latencyMs: number, stringSpacingPx: number): number {
  if (!(speedPxPerSec > 0) || !(latencyMs > 0) || !(stringSpacingPx > 0)) return 0;
  return (speedPxPerSec * latencyMs) / 1000 / stringSpacingPx;
}

/** Whether the expected trail calls for outlines (with hysteresis, so they do not flicker at the edge). */
export function trailTooLong(wasTooLong: boolean, trail: number): boolean {
  return wasTooLong ? trail > TRAIL_SOLID : trail > TRAIL_GHOST;
}

/** The neck's speed between two answers, smoothed: the middle of the board, in working-frame pixels per second. */
export interface NeckMotion {
  x: number;
  y: number;
  t: number;
  speed: number;
}

/** Fold one more answer (`pose` for the frame at `t` ms; null without a board) into the motion. */
export function nextMotion(prev: NeckMotion | null, pose: FretboardPose | null, t: number): NeckMotion | null {
  if (!pose) return null;
  const m = pose.model;
  const p = projectPlanePoint(pose, fretX(m, 7), m.nutWidth / 2);
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  const dt = prev ? t - prev.t : 0;
  if (!prev || !(dt > 5)) return { x: p.x, y: p.y, t, speed: prev?.speed ?? 0 };
  const raw = Math.hypot(p.x - prev.x, p.y - prev.y) / (dt / 1000);
  return { x: p.x, y: p.y, t, speed: 0.6 * prev.speed + 0.4 * raw };
}

/** Where to compare: the corners and middle of the region the notes cover, else the outer strings at the first, middle and last fret in view. */
function samplePoints(p: FretboardPose, at: ReadonlyArray<{ string: number; fret: number }>): Array<{ string: number; fret: number }> {
  const n = p.model.stringCount;
  const ok = at.filter((q) => q.string >= 1 && q.string <= n && q.fret >= 0 && q.fret <= 24);
  let lo: number, hi: number, s1: number, s2: number;
  if (ok.length) {
    lo = Math.min(...ok.map((q) => q.fret));
    hi = Math.max(...ok.map((q) => q.fret));
    s1 = Math.min(...ok.map((q) => q.string));
    s2 = Math.max(...ok.map((q) => q.string));
  } else {
    // Wood frets 1-15, where dots go.
    lo = Math.max(1, Math.min(15, p.visibleFrets.min + 1));
    hi = Math.max(lo, Math.min(15, p.visibleFrets.max));
    s1 = 1;
    s2 = n;
  }
  const frets = [...new Set([lo, Math.round((lo + hi) / 2), hi])];
  const strings = [...new Set([s1, s2])];
  return frets.flatMap((fret) => strings.map((string) => ({ string, fret })));
}

/**
 * How far the dots drawn from `drawn` were from where `measured` puts them, in string spacings:
 * the largest offset over the corners and middle of the region `at` (the notes shown; the board in
 * view when empty). NaN when the poses cannot be compared.
 */
export function drawnOffset(drawn: FretboardPose, measured: FretboardPose, at: ReadonlyArray<{ string: number; fret: number }> = []): number {
  const n = measured.model.stringCount;
  if (n < 2 || drawn.model.stringCount !== n || !(drawn.frameWidth > 0) || !(measured.frameWidth > 0)) return NaN;
  // The tracker may change its working size between the two (adaptive quality).
  const k = measured.frameWidth / drawn.frameWidth;
  let worst = 0;
  for (const q of samplePoints(measured, at)) {
    // The local string spacing, measured across the whole neck at this fret.
    const f = Math.max(1, q.fret);
    const top = projectMarker(measured, 1, f);
    const bottom = projectMarker(measured, n, f);
    const spacing = Math.hypot(top.x - bottom.x, top.y - bottom.y) / (n - 1);
    if (!(spacing > 0.5)) return NaN;
    const m = projectMarker(measured, q.string, q.fret);
    const d = projectMarker(drawn, q.string, q.fret);
    const off = Math.hypot(d.x * k - m.x, d.y * k - m.y) / spacing;
    if (!Number.isFinite(off)) return NaN;
    worst = Math.max(worst, off);
  }
  return worst;
}

/** Whether the dots are trusted now, and how many good answers in a row since they were not. */
export interface DrawnTrust {
  /** The dots were found off: draw outlines. */
  behind: boolean;
  good: number;
}

/** Trusted, nothing measured yet. */
export const TRUSTED: DrawnTrust = { behind: false, good: 0 };

/** The trust after one more comparison (`offset` from `drawnOffset`; NaN changes nothing). */
export function nextDrawnTrust(t: DrawnTrust, offset: number): DrawnTrust {
  if (!Number.isFinite(offset)) return t;
  if (offset >= OFF_GHOST) return { behind: true, good: 0 };
  if (!t.behind) return t;
  const good = offset <= OFF_SOLID ? t.good + 1 : 0;
  return good >= SOLID_AFTER ? TRUSTED : { behind: true, good };
}

/** Poses drawn on recent video frames, looked up by the frame's time when its answer arrives. */
export class DrawnPoses {
  private readonly items: Array<{ t: number; pose: FretboardPose }> = [];
  constructor(private readonly keep = 45) {}
  /** Remember the pose drawn on the frame at `t`. */
  push(t: number, pose: FretboardPose): void {
    this.items.push({ t, pose });
    if (this.items.length > this.keep) this.items.splice(0, this.items.length - this.keep);
  }
  /** The pose drawn on the frame at `t` (the pipeline uses the same time for the frame it draws and sends). */
  at(t: number): FretboardPose | null {
    for (let i = this.items.length - 1; i >= 0; i--) if (Math.abs(this.items[i].t - t) < 0.5) return this.items[i].pose;
    return null;
  }
  clear(): void {
    this.items.length = 0;
  }
}

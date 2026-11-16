/**
 * Are the dots on screen where the neck is? The overlay draws every video frame from the newest
 * tracker answer carried forward to that frame (the vision pipeline predicts it). A moment later
 * the answer for that very frame arrives: comparing what was drawn with what the tracker found
 * measures how far off the dots were, whatever the cause (a slow or busy device, a fast move, a
 * prediction that overshot). When they were off by close to half a string, the screen draws
 * outlines until the dots have been on target again for a few answers.
 *
 * This replaces guessing the error from the neck's speed and the answer delay: it is measured,
 * so a fast device that keeps up stays solid while the neck moves, and a slow one turns to
 * outlines as soon as its dots trail.
 */
import { projectMarker, type FretboardPose } from '@/core/vision';

/** Drawn this far off (in string spacings) or more, the dots turn into outlines. */
export const OFF_GHOST = 0.4;
/** Back to solid dots only after this many answers in a row at most `OFF_SOLID` off. */
export const OFF_SOLID = 0.25;
export const SOLID_AFTER = 3;

/** The frets compared: the first, middle and last fret in view (wood frets 1-15, where dots go). */
function sampleFrets(p: FretboardPose): number[] {
  const lo = Math.max(1, Math.min(15, p.visibleFrets.min + 1));
  const hi = Math.max(lo, Math.min(15, p.visibleFrets.max));
  return [...new Set([lo, Math.round((lo + hi) / 2), hi])];
}

/**
 * How far the dots drawn from `drawn` were from where `measured` puts them, in string spacings
 * (the largest over the outer strings at the first, middle and last fret in view). NaN when the
 * poses cannot be compared.
 */
export function drawnOffset(drawn: FretboardPose, measured: FretboardPose): number {
  const n = measured.model.stringCount;
  if (n < 2 || drawn.model.stringCount !== n || !(drawn.frameWidth > 0) || !(measured.frameWidth > 0)) return NaN;
  // The tracker may change its working size between the two (adaptive quality).
  const k = measured.frameWidth / drawn.frameWidth;
  let worst = 0;
  for (const f of sampleFrets(measured)) {
    const top = projectMarker(measured, 1, f);
    const bottom = projectMarker(measured, n, f);
    const spacing = Math.hypot(top.x - bottom.x, top.y - bottom.y) / (n - 1);
    if (!(spacing > 0.5)) return NaN;
    for (const s of [1, n]) {
      const m = s === 1 ? top : bottom;
      const d = projectMarker(drawn, s, f);
      const off = Math.hypot(d.x * k - m.x, d.y * k - m.y) / spacing;
      if (!Number.isFinite(off)) return NaN;
      worst = Math.max(worst, off);
    }
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

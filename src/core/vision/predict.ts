/**
 * Pose extrapolation for the overlay: the tracker answers for a frame that was captured a few tens
 * of milliseconds before the frame now on screen (grab, transfer, detection), so drawing its pose as
 * it is makes the markers trail a moving guitar. `PosePredictor` keeps the velocity of the pose's
 * four control points (board corners at the nut and the 12th fret) and carries the last pose forward
 * to the display time.
 *
 * Built to do no harm: a still guitar is not extrapolated at all (a dead band on the speed, measured
 * in string spacings per second like the tracker's filter), a jump (re-detection, renumbering, a new
 * board) restarts the estimate instead of flinging the overlay, and the lead is capped.
 */
import { computeVisibleFrets, controlPlanePoints, homographyFromPoints, poseControlPoints, poseDistancePx, projectMarker } from './geometry';
import type { FretboardPose, NeckModel, Point } from './types';

/** Settings of `PosePredictor`. */
export interface PredictorOptions {
  /** Never extrapolate further ahead than this, in ms (default 100). */
  maxLeadMs?: number;
  /** A gap between two poses longer than this restarts the velocity estimate, in ms (default 250). */
  maxGapMs?: number;
  /** Smoothing of the velocity estimate per new pose, 0..1 (default 0.6: mostly the newest step). */
  velocityRate?: number;
  /** Speeds below this many string spacings per second are treated as still (default 0.4). */
  stillSpeed?: number;
  /** From this speed on the full velocity is used (default 1.5 string spacings per second). */
  fullSpeed?: number;
  /** A pose this many fret cells away from where the prediction put it is a jump (default 0.6). */
  jumpCells?: number;
}

const DEFAULTS: Required<PredictorOptions> = { maxLeadMs: 100, maxGapMs: 250, velocityRate: 0.6, stillSpeed: 0.4, fullSpeed: 1.5, jumpCells: 0.6 };

/** Distance in pixels between neighbouring strings in the middle of the visible board (at least 1). */
function stringUnit(pose: FretboardPose): number {
  const v = pose.visibleFrets;
  const mid = v.max >= v.min ? Math.max(1, Math.round((v.min + v.max) / 2)) : 6;
  const a = projectMarker(pose, 1, mid);
  const b = projectMarker(pose, pose.model.stringCount, mid);
  const d = Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pose.model.stringCount - 1);
  return Number.isFinite(d) ? Math.max(1, d) : 1;
}

/** Distance in pixels between wire `fret - 1` and wire `fret` in the middle of the board (at least 1). */
function cellUnit(pose: FretboardPose): number {
  const v = pose.visibleFrets;
  const mid = v.max >= v.min ? Math.max(1, Math.round((v.min + v.max) / 2)) : 6;
  const s = Math.max(1, Math.round(pose.model.stringCount / 2));
  const a = projectMarker(pose, s, mid);
  const b = projectMarker(pose, s, mid + 1);
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  return Number.isFinite(d) ? Math.max(1, d) : 1;
}

/** Same neck (poses that crossed a worker boundary carry copies of the model, not the same object). */
function sameModel(a: NeckModel, b: NeckModel): boolean {
  return a === b || (a.scaleLength === b.scaleLength && a.nutWidth === b.nutWidth && a.width12 === b.width12 && a.stringSpanNut === b.stringSpanNut && a.stringSpanBridge === b.stringSpanBridge && a.stringCount === b.stringCount && a.fretCount === b.fretCount);
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / Math.max(1e-9, e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * Carries the latest pose forward in time. Feed every pose the tracker hands out with its frame
 * time (`push`), ask for the pose at the display time (`predict`).
 */
export class PosePredictor {
  private readonly o: Required<PredictorOptions>;
  private last: FretboardPose | null = null;
  private lastTime = 0;
  private points: Point[] = [];
  private velocity: Point[] = [];
  private hasVelocity = false;
  private unit = 1;

  /** Create a predictor; see `PredictorOptions`. */
  constructor(options: PredictorOptions = {}) {
    this.o = { ...DEFAULTS, ...options };
  }

  /** Forget everything. */
  reset(): void {
    this.last = null;
    this.points = [];
    this.velocity = [];
    this.hasVelocity = false;
  }

  /** The newest pose fed in (null after `reset` or a null push). */
  get latest(): FretboardPose | null {
    return this.last;
  }

  /** Current speed of the fastest control point in pixels per second (0 when unknown). */
  get speedPxPerSecond(): number {
    if (!this.hasVelocity) return 0;
    let s = 0;
    for (const v of this.velocity) s = Math.max(s, Math.hypot(v.x, v.y));
    return s;
  }

  /**
   * Feed a pose and the time of the frame it describes. `continuous: false` (or a null pose) says
   * the new pose does not continue the previous one (a new board, a renumbering, a hand-over).
   */
  push(pose: FretboardPose | null, timeMs: number, continuous = true): void {
    if (!pose) {
      this.reset();
      return;
    }
    const pts = poseControlPoints(pose);
    if (pts.some((p) => !Number.isFinite(p.x + p.y))) {
      this.reset();
      return;
    }
    const prev = this.last;
    const dt = (timeMs - this.lastTime) / 1000;
    const sameBoard =
      continuous &&
      prev !== null &&
      sameModel(prev.model, pose.model) &&
      prev.frameWidth === pose.frameWidth &&
      prev.frameHeight === pose.frameHeight &&
      dt > 0 &&
      dt * 1000 <= this.o.maxGapMs;
    let jump = !sameBoard;
    if (!jump) {
      // Where the old estimate expected the board now; far from it means a jump, not motion.
      const expected = this.points.map((p, i) => ({ x: p.x + (this.hasVelocity ? this.velocity[i].x : 0) * dt, y: p.y + (this.hasVelocity ? this.velocity[i].y : 0) * dt }));
      const He = homographyFromPoints(controlPlanePoints(pose.model), expected);
      if (!He || poseDistancePx({ H: He, model: pose.model }, pose) > this.o.jumpCells * cellUnit(pose)) jump = true;
    }
    if (jump) {
      this.velocity = pts.map(() => ({ x: 0, y: 0 }));
      this.hasVelocity = false;
    } else {
      const k = this.hasVelocity ? this.o.velocityRate : 1;
      for (let i = 0; i < 4; i++) {
        const v = this.velocity[i];
        v.x += k * ((pts[i].x - this.points[i].x) / dt - v.x);
        v.y += k * ((pts[i].y - this.points[i].y) / dt - v.y);
      }
      this.hasVelocity = true;
    }
    this.last = pose;
    this.lastTime = timeMs;
    this.points = pts;
    this.unit = stringUnit(pose);
  }

  /** The pose carried forward to `timeMs` (the last pose itself when still, unknown or asked for the past). */
  predict(timeMs: number): FretboardPose | null {
    const pose = this.last;
    if (!pose || !this.hasVelocity) return pose;
    const lead = Math.min(this.o.maxLeadMs, timeMs - this.lastTime) / 1000;
    if (!(lead > 0)) return pose;
    const speed = this.speedPxPerSecond / this.unit;
    const gain = smoothstep(this.o.stillSpeed, this.o.fullSpeed, speed);
    if (gain <= 0) return pose;
    const moved = this.points.map((p, i) => ({ x: p.x + this.velocity[i].x * gain * lead, y: p.y + this.velocity[i].y * gain * lead }));
    const H = homographyFromPoints(controlPlanePoints(pose.model), moved);
    if (!H) return pose;
    return { ...pose, H, visibleFrets: computeVisibleFrets(H, pose.model, pose.frameWidth, pose.frameHeight) };
  }

  /** Time of the newest pose. */
  get time(): number {
    return this.lastTime;
  }
}

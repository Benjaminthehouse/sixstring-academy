/**
 * The live fretboard tracker: what the camera screen runs on every frame.
 *
 * `FretboardTracker` owns the state machine around the production detector (`detector.ts`):
 *
 *   searching --pose found--> candidate --held, confident, numbers confirmed--> locked
 *       ^                        |  ^                                              |
 *       |                        |  +------ confidence below the unlock level ------+
 *       +---- lost too long ---- lost <---------------- pose lost ------------------+
 *
 *  - searching: full detection on every frame (biased by the last board, if one was seen recently).
 *  - candidate: a board is tracked, but it is new (not yet held for `lockFrames` frames with
 *    confidence), or its fret numbers are a guess. After `askAfterMs` of guessing the update
 *    carries `question`: the UI asks for one tap ("Is this fret 5?").
 *  - locked: geometry and numbering are trusted; markers can be drawn. The numbering is carried
 *    frame to frame by the detector, so it survives the nut leaving the frame.
 *  - lost: the board vanished (occlusion, the guitar left the frame). The last pose is held for
 *    `lostGraceMs` (the overlay can fade it) while detection looks for the board near where it
 *    was; it comes back with its old numbers.
 *
 * The pose the overlay draws is smoothed by a One-Euro filter on the four board corners at the
 * nut and the 12th fret: steady when the guitar is still, without lag when it moves. Confidence is
 * smoothed too and the lock has hysteresis (enter at `lockConfidence`, leave below
 * `unlockConfidence`), so the overlay does not flicker at the threshold.
 *
 * Plain data in and out (structured-clone safe): run it inside a Web Worker on downscaled frames.
 */
import { MarkerAnchor } from './color-markers';
import { createFretboardDetector, type FretboardDetector } from './detector';
import {
  confirmFretAt,
  controlPlanePoints,
  fretSpacingPx,
  homographyFromPoints,
  applyHomography,
  computeVisibleFrets,
  inlayPositions,
  NECK_PRESETS,
  neckModel,
  poseDistancePx,
  projectMarker,
  renumberPose,
  scalePose,
} from './geometry';
import type { DetectOptions, DetectionResult, Detector, Frame, FretboardPose, MarkerHint, NeckModel, NeckPresetId, Point, Rect } from './types';

/** Where the tracker is in its life cycle (see the module comment). */
export type TrackerState = 'searching' | 'candidate' | 'locked' | 'lost';

/**
 * One short reason the camera screen can turn into a hint:
 *  - 'point-camera'    no board in view: "Point the camera at the neck"
 *  - 'hold-steady'     the board was just lost or is being carried through motion blur
 *  - 'confirm-fret'    the fret numbers are a guess: ask the one-tap question
 *  - 'low-confidence'  a board is followed but not trusted enough to draw notes on
 */
export type TrackerHint = 'point-camera' | 'hold-steady' | 'confirm-fret' | 'low-confidence';

/** One-Euro filter settings for the overlay pose. */
export interface SmoothingOptions {
  /** Cutoff in Hz while the guitar is still: lower = steadier markers (default 1.0). */
  minCutoff?: number;
  /** How fast the cutoff opens with speed, Hz per (string spacings per second) (default 2). */
  beta?: number;
  /** Cutoff in Hz of the speed estimate (default 4). */
  speedCutoff?: number;
  /** A jump of the raw pose by more than this many fret cells restarts the filter instead of gliding (default 0.6). */
  jumpCells?: number;
}

/** Options of `FretboardTracker`. Everything has a default for the common webcam case. */
export interface FretboardTrackerOptions {
  /** Guitar type or exact neck dimensions (default 'steel'). */
  model?: NeckPresetId | NeckModel;
  /** The low E string is the upper edge of the neck in the image (default true: camera facing the player). */
  bassSideUp?: boolean;
  /** The frames passed to `update` are mirrored (a selfie preview drawn into the frame) (default false). */
  mirrored?: boolean;
  /** Left-handed player: the neck points the other way (default false). */
  leftHanded?: boolean;
  /** Marker mode: stickers at known frets. */
  markers?: MarkerHint;
  /** Only search this part of the frame (a rectangle or a quadrilateral, frame pixels). */
  region?: Rect | Point[];
  /** Overlay smoothing, or false for the raw detector poses. */
  smoothing?: SmoothingOptions | false;
  /** Smoothed confidence needed to enter `locked` (default 0.6). */
  lockConfidence?: number;
  /** Below this smoothed confidence a locked board drops back to `candidate` (default 0.3). */
  unlockConfidence?: number;
  /** Consecutive frames a new board must be held before it can lock (default 3). */
  lockFrames?: number;
  /** How long the last pose is held after the board is lost, in ms (default 1000). */
  lostGraceMs?: number;
  /** How long a lost board still lends its fret numbers to the next detection, in ms (default 8000). */
  numberingMemoryMs?: number;
  /** A candidate whose numbers are still a guess after this long asks for one tap, in ms (default 1200). */
  askAfterMs?: number;
  /** Offer assisted calibration after searching this long, or after a board was followed this long without locking, in ms (default 6000). */
  suggestCalibrationAfterMs?: number;
  /** ... or when the board was lost this many times within `unstableWindowMs` (default 3 within 20000). */
  unstableLosses?: number;
  unstableWindowMs?: number;
  /** The detector to drive (default: `createFretboardDetector()`). */
  detector?: Detector;
}

/** "Is this fret N?": a visible cell the UI can highlight while asking for one tap. */
export interface FretQuestion {
  /** Frame pixel in the middle of the cell (between the outer strings). */
  point: Point;
  /** The number the tracker currently gives that cell. */
  fret: number;
}

/** What one `update` produced. Plain data. */
export interface TrackerUpdate {
  state: TrackerState;
  /** The state before this update differs from `state`. */
  changed: boolean;
  /** The pose to draw: smoothed; the held last pose while `lost`; null while `searching`. */
  pose: FretboardPose | null;
  /** The detector's own pose for this frame, unsmoothed (null when it found nothing). */
  measured: FretboardPose | null;
  /** Smoothed 0..1 confidence (falls while the board is lost: fade the overlay with it). */
  confidence: number;
  /** The fret numbers rest on something (nut, inlays, stickers, the user, or a track from those). */
  numberingConfirmed: boolean;
  /** Set while the numbering is a guess and has been for a while: ask the learner to confirm a fret. */
  question: FretQuestion | null;
  /** Which detector call ran. */
  ran: 'track' | 'detect' | 'track+detect' | 'none';
  /** Detector reason tag when it found nothing or was unsure. */
  reason?: string;
  /** Milliseconds spent in this update. */
  ms: number;
  /** Capture time used for this frame. */
  timeMs: number;
  /** How long no board has been shown, in ms (0 while one is shown). */
  searchingMs: number;
  /**
   * Automatic detection is struggling (nothing found for a while, the board keeps getting lost, or
   * it is followed but never trusted): offer assisted calibration (four taps or a dragged outline).
   */
  suggestCalibration: boolean;
  /** Why the overlay is not (fully) drawn, or null when it is locked and confident. */
  hint: TrackerHint | null;
  /** Marker mode with sampled colours: where each marker was seen in this frame (null = not seen), else null. */
  markers: (Point | null)[] | null;
}

const DEFAULTS = {
  lockConfidence: 0.6,
  unlockConfidence: 0.3,
  lockFrames: 3,
  lostGraceMs: 1000,
  numberingMemoryMs: 8000,
  askAfterMs: 1200,
  suggestCalibrationAfterMs: 6000,
  unstableLosses: 3,
  unstableWindowMs: 20000,
};

/** Confidence smoothing per measured frame (and decay per lost frame). */
const CONFIDENCE_RATE = 0.35;

/** Options as the detector needs them: an unknown guitar id (from stored settings, say) means the default steel-string neck. */
function sanitize(options: FretboardTrackerOptions): FretboardTrackerOptions {
  const m = options.model;
  if (typeof m === 'string' && !Object.prototype.hasOwnProperty.call(NECK_PRESETS, m)) return { ...options, model: 'steel' };
  if (m !== undefined && typeof m === 'object' && !(m.scaleLength > 0 && m.nutWidth > 0 && m.stringCount >= 2)) return { ...options, model: 'steel' };
  return options;
}

function confirmed(pose: FretboardPose): boolean {
  return pose.numbering !== 'assumed' && pose.numberingConfidence >= 0.5;
}

/** Bring a pose to the size of `frame` (detectors may answer for a downscaled working frame). */
function fitToFrame(pose: FretboardPose, frame: Frame): FretboardPose {
  if (pose.frameWidth === frame.width && pose.frameHeight === frame.height) return pose;
  return scalePose(pose, frame.width / pose.frameWidth, frame.height / pose.frameHeight);
}

/**
 * One-Euro filter on the four control corners of a pose (board edges at the nut and the 12th fret).
 * The speed that opens the cutoff is measured in string spacings per second at the middle of the
 * visible board (the finest thing a marker must hit), so the filter behaves the same whether the neck
 * fills the frame or a third of it.
 */
export class PoseFilter {
  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly speedCutoff: number;
  private readonly jumpCells: number;
  private points: Point[] | null = null;
  private velocity: Point[] = [];
  private lastTime = 0;

  /** Create a filter; see `SmoothingOptions` for the settings. */
  constructor(options: SmoothingOptions = {}) {
    this.minCutoff = options.minCutoff ?? 1.0;
    this.beta = options.beta ?? 2;
    this.speedCutoff = options.speedCutoff ?? 4;
    this.jumpCells = options.jumpCells ?? 0.6;
  }

  /** Forget the history: the next pose is passed through as it is. */
  reset(): void {
    this.points = null;
    this.velocity = [];
  }

  /** Feed the newest raw pose with its capture time; returns the smoothed pose (same flags and numbering). */
  update(pose: FretboardPose, timeMs: number): FretboardPose {
    const plane = controlPlanePoints(pose.model);
    const raw = plane.map((p) => applyHomography(pose.H, p.x, p.y));
    if (raw.some((p) => !Number.isFinite(p.x + p.y))) {
      this.reset();
      return pose;
    }
    const prev = this.points;
    const dt = Math.max(1e-3, Math.min(0.5, (timeMs - this.lastTime) / 1000));
    this.lastTime = timeMs;
    if (!prev) return this.restart(raw, pose);
    const previous = homographyFromPoints(plane, prev);
    const mid = pose.visibleFrets.max >= pose.visibleFrets.min ? Math.max(1, Math.round((pose.visibleFrets.min + pose.visibleFrets.max) / 2)) : 6;
    const unit = stringSpacingPx(pose, mid);
    // A jump (re-detection somewhere else, a renumbering) is not smoothed into a glide.
    if (!previous || poseDistancePx({ H: previous, model: pose.model }, pose) > this.jumpCells * fretSpacingPx(pose, mid)) return this.restart(raw, pose);
    const aSpeed = alpha(dt, this.speedCutoff);
    let speed = 0;
    for (let i = 0; i < 4; i++) {
      const v = this.velocity[i];
      v.x += aSpeed * ((raw[i].x - prev[i].x) / dt - v.x);
      v.y += aSpeed * ((raw[i].y - prev[i].y) / dt - v.y);
      speed = Math.max(speed, Math.hypot(v.x, v.y));
    }
    const a = alpha(dt, this.minCutoff + this.beta * (speed / unit));
    const next = raw.map((p, i) => ({ x: prev[i].x + a * (p.x - prev[i].x), y: prev[i].y + a * (p.y - prev[i].y) }));
    const H = homographyFromPoints(plane, next);
    if (!H) return this.restart(raw, pose);
    this.points = next;
    return { ...pose, H, visibleFrets: computeVisibleFrets(H, pose.model, pose.frameWidth, pose.frameHeight) };
  }

  private restart(raw: Point[], pose: FretboardPose): FretboardPose {
    this.points = raw;
    this.velocity = raw.map(() => ({ x: 0, y: 0 }));
    return pose;
  }
}

/** Distance in pixels between neighbouring strings at the middle of a fret cell (at least 1). */
function stringSpacingPx(pose: FretboardPose, fret: number): number {
  const a = projectMarker(pose, 1, fret);
  const b = projectMarker(pose, pose.model.stringCount, fret);
  const d = Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pose.model.stringCount - 1);
  return Number.isFinite(d) ? Math.max(1, d) : 1;
}

function alpha(dt: number, cutoff: number): number {
  return 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
}

/**
 * The camera loop's single entry point: feed it frames, draw `update().pose`.
 *
 *   const tracker = new FretboardTracker({ model: 'steel', mirrored: false });
 *   const u = tracker.update(frame, performance.now());
 *   if (u.state === 'locked') drawMarkers(u.pose);
 */
export class FretboardTracker {
  private opts: FretboardTrackerOptions;
  private detector: Detector;
  private filter: PoseFilter | null;
  private current: TrackerState = 'searching';
  /** The detector's last pose (what tracking continues from). */
  private raw: FretboardPose | null = null;
  /** The last pose handed out for drawing. */
  private shown: FretboardPose | null = null;
  /** The last measured pose and when, for carrying fret numbers across a loss. */
  private lastSeen: { pose: FretboardPose; time: number } | null = null;
  private smoothConfidence = 0;
  private held = 0;
  private lockedBeforeLoss = false;
  private lostSince = 0;
  private guessingSince = -1;
  private clock = -33;
  /** When the overlay last had nothing to show (start, reset, or the end of a loss), or -1 while a board is shown. */
  private noBoardSince = NaN;
  /** When the current unlocked stretch of a followed board began (-1 while locked or searching). */
  private unlockedSince = -1;
  /** Times the board was lost recently. */
  private losses: number[] = [];
  /** Marker mode with sampled colours. */
  private readonly anchor = new MarkerAnchor();

  /** Create a tracker for one camera stream. */
  constructor(options: FretboardTrackerOptions = {}) {
    this.opts = sanitize({ ...options });
    this.detector = options.detector ?? createFretboardDetector();
    this.filter = options.smoothing === false ? null : new PoseFilter(options.smoothing ?? {});
  }

  /** Current state. */
  get state(): TrackerState {
    return this.current;
  }

  /** The pose last handed out for drawing (null while searching). */
  get pose(): FretboardPose | null {
    return this.shown;
  }

  /** The options in force (a copy). */
  get options(): FretboardTrackerOptions {
    return { ...this.opts };
  }

  /** The neck model the tracker searches for. */
  get model(): NeckModel {
    return this.raw?.model ?? neckModel(this.opts.model ?? 'steel');
  }

  /** Process one frame (RGBA, any size; 640x360 is the sweet spot). `timeMs` is its capture time. */
  update(frame: Frame, timeMs?: number): TrackerUpdate {
    const t0 = performance.now();
    const time = timeMs ?? this.clock + 33;
    this.clock = time;
    if (Number.isNaN(this.noBoardSince)) this.noBoardSince = time;
    // The caller may change the working size between frames (adaptive quality): follow it.
    const sized = this.raw ?? this.shown ?? this.lastSeen?.pose;
    if (sized && frame.width > 0 && frame.height > 0 && (sized.frameWidth !== frame.width || sized.frameHeight !== frame.height)) this.rescale(frame.width, frame.height);
    const before = this.current;
    const hints = this.hints(time);
    let result: DetectionResult;
    let ran: TrackerUpdate['ran'];
    if (this.raw) {
      const from = this.raw;
      result = this.safely(() => this.detector.track(frame, from, hints));
      ran = 'track';
      if (!result.pose) {
        result = this.safely(() => this.detector.detect(frame, { ...hints, previousPose: from }));
        ran = 'track+detect';
      }
    } else {
      const memory = this.lastSeen && time - this.lastSeen.time <= (this.opts.numberingMemoryMs ?? DEFAULTS.numberingMemoryMs) ? this.lastSeen.pose : undefined;
      result = this.safely(() => this.detector.detect(frame, memory ? { ...hints, previousPose: memory } : hints));
      ran = 'detect';
    }
    let measured = result.pose ? fitToFrame(result.pose, frame) : null;
    const colourMarkers = this.colourMarkers();
    this.anchor.lastBlobs = [];
    if (colourMarkers) {
      // Marker mode with sampled colours: the markers confirm or fix the numbers of what the
      // detector found, or, when it found nothing, propose the board themselves.
      if (measured) measured = this.anchor.check(frame, measured, colourMarkers);
      else {
        const fitter = (this.detector as Partial<FretboardDetector>).fit;
        if (fitter) {
          const model = typeof hints.model === 'object' ? neckModel(hints.model) : this.raw?.model ?? this.lastSeen?.pose.model ?? neckModel(hints.model ?? 'steel');
          const found = this.anchor.acquire(frame, colourMarkers, model, hints, (hs) => fitter.call(this.detector, frame, hs, hints));
          if (found) {
            measured = found;
            result = { pose: found, diagnostics: { ...result.diagnostics, reason: undefined } };
          }
        }
      }
    }
    if (measured) this.accept(measured, time);
    else this.miss(time);
    const numbersOf = this.raw ?? (this.current === 'lost' ? (this.lastSeen?.pose ?? null) : null);
    if (this.current === 'lost' && before !== 'lost') {
      this.losses.push(time);
    }
    const windowMs = this.opts.unstableWindowMs ?? DEFAULTS.unstableWindowMs;
    while (this.losses.length > 0 && time - this.losses[0] > windowMs) this.losses.shift();
    if (this.current === 'searching') {
      if (this.noBoardSince < 0) this.noBoardSince = time;
    } else this.noBoardSince = -1;
    if (this.current === 'candidate' || this.current === 'lost') {
      if (this.unlockedSince < 0) this.unlockedSince = time;
    } else this.unlockedSince = -1;
    const question = this.question(time);
    const numberingConfirmed = numbersOf ? confirmed(numbersOf) : false;
    const searchingMs = this.noBoardSince >= 0 ? Math.max(0, time - this.noBoardSince) : 0;
    const after = this.opts.suggestCalibrationAfterMs ?? DEFAULTS.suggestCalibrationAfterMs;
    const suggestCalibration =
      (this.current === 'searching' && searchingMs >= after) ||
      this.losses.length >= (this.opts.unstableLosses ?? DEFAULTS.unstableLosses) ||
      (this.unlockedSince >= 0 && time - this.unlockedSince >= after);
    let hint: TrackerHint | null = null;
    if (this.current === 'searching') hint = 'point-camera';
    else if (this.current === 'lost' || result.diagnostics.reason === 'coasting') hint = 'hold-steady';
    else if (question || (this.current === 'candidate' && !numberingConfirmed)) hint = 'confirm-fret';
    else if (this.current === 'candidate') hint = 'low-confidence';
    const out: TrackerUpdate = {
      state: this.current,
      changed: this.current !== before,
      pose: this.shown,
      measured,
      confidence: this.smoothConfidence,
      numberingConfirmed,
      question,
      ran,
      reason: result.diagnostics.reason,
      ms: performance.now() - t0,
      timeMs: time,
      searchingMs,
      suggestCalibration,
      hint,
      markers: colourMarkers ? colourMarkers.frets.map((_, k) => {
        const b = this.anchor.lastBlobs[k];
        return b ? { x: b.x, y: b.y } : null;
      }) : null,
    };
    return out;
  }

  /**
   * The frames now come at another size (the pipeline changed its working resolution): move every
   * pose the tracker holds onto the new frame. The detector treats the next frame as a hand-over.
   */
  rescale(width: number, height: number): void {
    const fit = (p: FretboardPose): FretboardPose => (p.frameWidth === width && p.frameHeight === height ? p : scalePose(p, width / p.frameWidth, height / p.frameHeight));
    if (this.raw) this.raw = fit(this.raw);
    if (this.lastSeen) this.lastSeen = { pose: fit(this.lastSeen.pose), time: this.lastSeen.time };
    if (this.shown) {
      this.shown = fit(this.shown);
      // Restart the filter from the moved pose: its history is in the old pixels.
      this.filter?.reset();
      this.filter?.update(this.shown, this.clock);
    }
  }

  /**
   * Hand over a pose from assisted calibration (four taps, a dragged quadrilateral, a nudge): the
   * tracker follows it from the next frame. A pose whose numbers rest on the user locks at once.
   */
  calibrate(pose: FretboardPose, timeMs?: number): void {
    const time = timeMs ?? this.clock;
    this.raw = pose;
    this.shown = pose;
    this.filter?.reset();
    this.filter?.update(pose, time);
    this.held = this.opts.lockFrames ?? DEFAULTS.lockFrames;
    this.smoothConfidence = Math.max(pose.confidence, this.opts.lockConfidence ?? DEFAULTS.lockConfidence);
    this.lastSeen = { pose, time };
    this.guessingSince = confirmed(pose) ? -1 : time;
    this.current = confirmed(pose) ? 'locked' : 'candidate';
    this.opts = { ...this.opts, mirrored: pose.mirrored, leftHanded: pose.leftHanded };
    this.noBoardSince = -1;
    this.unlockedSince = this.current === 'locked' ? -1 : time;
    this.losses = [];
    this.detector.reset?.();
  }

  /** One-tap confirmation: the cell under `point` (frame pixels) is fret `fret`. False when there is no board under it. */
  confirmFret(point: Point, fret: number): boolean {
    if (!this.raw) return false;
    const fixed = confirmFretAt(this.raw, point, fret);
    if (!fixed) return false;
    this.renumber(fixed);
    return true;
  }

  /** "It is two frets higher": shift every fret number by `delta`; the user's word fixes the numbering. */
  shiftNumbering(delta: number): boolean {
    if (!this.raw || !Number.isFinite(delta)) return false;
    this.renumber(renumberPose(this.raw, Math.round(delta), 'user', 1));
    return true;
  }

  /** Accept the current numbering as right (the learner pressed "yes, that is fret 5"). */
  confirmNumbering(): boolean {
    return this.shiftNumbering(0);
  }

  /**
   * Change orientation, guitar or marker settings. A change of orientation or neck forgets the
   * board (the old pose may be the wrong way round); other changes keep it.
   */
  setOptions(changes: Partial<Omit<FretboardTrackerOptions, 'detector'>>): void {
    const next = sanitize({ ...this.opts, ...changes });
    const orientation = (a: FretboardTrackerOptions): string => `${a.bassSideUp ?? true}|${a.mirrored ?? false}|${a.leftHanded ?? false}|${JSON.stringify(a.model ?? 'steel')}`;
    const restart = orientation(next) !== orientation(this.opts);
    if ('smoothing' in changes) this.filter = changes.smoothing === false ? null : new PoseFilter(changes.smoothing ?? {});
    this.opts = next;
    if (restart) this.reset();
  }

  /** Forget everything (the camera restarted or the learner picked up another guitar). */
  reset(): void {
    this.detector.reset?.();
    this.filter?.reset();
    this.current = 'searching';
    this.raw = null;
    this.shown = null;
    this.lastSeen = null;
    this.smoothConfidence = 0;
    this.held = 0;
    this.lockedBeforeLoss = false;
    this.lostSince = 0;
    this.guessingSince = -1;
    this.noBoardSince = NaN;
    this.unlockedSince = -1;
    this.losses = [];
    this.anchor.reset();
  }

  private hints(time: number): DetectOptions {
    const o = this.opts;
    // Sampled marker colours are handled here (`MarkerAnchor`), not by the detector's sticker reader.
    const markers = this.colourMarkers() ? undefined : o.markers;
    return { bassSideUp: o.bassSideUp, mirrored: o.mirrored, leftHanded: o.leftHanded, model: o.model, markers, region: o.region, timeMs: time };
  }

  /** The marker hint when it carries sampled colours for at least two known frets. */
  private colourMarkers(): MarkerHint | null {
    const m = this.opts.markers;
    return m && m.colors && m.colors.length > 0 && m.frets.length >= 2 ? m : null;
  }

  private safely(run: () => DetectionResult): DetectionResult {
    try {
      return run();
    } catch {
      return { pose: null, diagnostics: { timings: { total: 0 }, reason: 'detector-error' } };
    }
  }

  private renumber(pose: FretboardPose): void {
    this.raw = pose;
    this.filter?.reset();
    this.shown = this.filter ? this.filter.update(pose, this.clock) : pose;
    this.lastSeen = { pose, time: this.clock };
    this.guessingSince = -1;
    // The user vouched for the numbers; the geometry still has to hold to lock.
    if (this.current === 'candidate' && this.held >= (this.opts.lockFrames ?? DEFAULTS.lockFrames)) this.current = 'locked';
  }

  private accept(pose: FretboardPose, time: number): void {
    const lockFrames = this.opts.lockFrames ?? DEFAULTS.lockFrames;
    const resumed = this.current === 'lost' && time - this.lostSince <= (this.opts.lostGraceMs ?? DEFAULTS.lostGraceMs);
    if (this.current === 'searching' || (this.current === 'lost' && !resumed)) {
      // A new board: nothing of the old one carries over except (inside the detector) its numbers.
      this.filter?.reset();
      this.held = 0;
      this.smoothConfidence = pose.confidence;
      this.lockedBeforeLoss = false;
    }
    this.held++;
    this.smoothConfidence += CONFIDENCE_RATE * (pose.confidence - this.smoothConfidence);
    this.raw = pose;
    this.lastSeen = { pose, time };
    this.shown = this.filter ? this.filter.update(pose, time) : pose;
    const numbers = confirmed(pose);
    if (numbers) this.guessingSince = -1;
    else if (this.guessingSince < 0) this.guessingSince = time;
    const lockAt = this.opts.lockConfidence ?? DEFAULTS.lockConfidence;
    const unlockAt = this.opts.unlockConfidence ?? DEFAULTS.unlockConfidence;
    // Hysteresis: a lock (also one interrupted by a short loss) holds down to the lower threshold.
    const keepsLock = this.current === 'locked' || (resumed && this.lockedBeforeLoss);
    if (numbers && keepsLock && this.smoothConfidence >= unlockAt) this.current = 'locked';
    else if (numbers && this.held >= lockFrames && this.smoothConfidence >= lockAt) this.current = 'locked';
    else this.current = 'candidate';
  }

  private miss(time: number): void {
    this.held = 0;
    this.raw = null;
    this.smoothConfidence *= 1 - CONFIDENCE_RATE;
    if (this.current === 'candidate' || this.current === 'locked') {
      // The last pose stays on screen (fading with `confidence`) for the grace period.
      this.lockedBeforeLoss = this.current === 'locked';
      this.current = 'lost';
      this.lostSince = time;
      return;
    }
    if (this.current === 'lost' && time - this.lostSince > (this.opts.lostGraceMs ?? DEFAULTS.lostGraceMs)) {
      this.current = 'searching';
      this.filter?.reset();
      this.lockedBeforeLoss = false;
    }
    if (this.current === 'searching') this.shown = null;
  }

  private question(time: number): FretQuestion | null {
    const pose = this.raw;
    if (!pose || this.current !== 'candidate' || confirmed(pose) || this.guessingSince < 0) return null;
    if (time - this.guessingSince < (this.opts.askAfterMs ?? DEFAULTS.askAfterMs)) return null;
    return fretQuestion(pose);
  }
}

/**
 * The visible cell best suited to "Is this fret N?": an inlay cell near the middle of the view if
 * there is one (dots are easy to name), else the middle visible cell. Null when too little shows.
 */
export function fretQuestion(pose: FretboardPose): FretQuestion | null {
  const vis = pose.visibleFrets;
  if (vis.max - vis.min < 2) return null;
  const lo = Math.max(1, vis.min + 1);
  const hi = vis.max;
  const centre = (lo + hi) / 2;
  let fret = Math.round(centre);
  let best = Infinity;
  for (const inlay of inlayPositions(pose.model)) {
    if (inlay.fret < lo || inlay.fret > hi) continue;
    const d = Math.abs(inlay.fret - centre);
    if (d < best) {
      best = d;
      fret = inlay.fret;
    }
  }
  const a = projectMarker(pose, 1, fret);
  const b = projectMarker(pose, pose.model.stringCount, fret);
  const point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return Number.isFinite(point.x + point.y) ? { point, fret } : null;
}

/**
 * The production pipeline exactly as the app runs it (`FretboardTracker` around the detector),
 * behind the `Detector` interface so the benchmark can score it. A `track` call that starts from a
 * pose the tracker did not hand out (a calibration) is taken as a hand-over; the loop's second call
 * for the same frame (detect after a failed track) returns the answer already given.
 */
export function createSessionDetector(options: FretboardTrackerOptions = {}): Detector {
  const tracker = new FretboardTracker(options);
  let lastFrame: Frame | null = null;
  let lastResult: DetectionResult | null = null;
  let lastOut: FretboardPose | null = null;
  let hintKey = '';
  const configure = (o: DetectOptions | undefined): void => {
    const changes = { bassSideUp: o?.bassSideUp, mirrored: o?.mirrored, leftHanded: o?.leftHanded, model: o?.model, markers: o?.markers };
    const key = JSON.stringify(changes);
    if (key !== hintKey) {
      hintKey = key;
      tracker.setOptions(changes);
    }
  };
  const run = (frame: Frame, o: DetectOptions | undefined): DetectionResult => {
    if (frame === lastFrame && lastResult) return lastResult;
    const u = tracker.update(frame, o?.timeMs);
    const pose = u.state === 'candidate' || u.state === 'locked' ? u.pose : null;
    lastFrame = frame;
    lastOut = pose;
    lastResult = { pose, diagnostics: { timings: { total: u.ms }, reason: pose ? undefined : (u.reason ?? u.state), stats: { state: ['searching', 'candidate', 'locked', 'lost'].indexOf(u.state) } } };
    return lastResult;
  };
  return {
    name: 'session',
    detect: (frame, o) => {
      configure(o);
      return run(frame, o);
    },
    track: (frame, previousPose, o) => {
      configure({ ...o, mirrored: o?.mirrored ?? previousPose.mirrored, leftHanded: o?.leftHanded ?? previousPose.leftHanded });
      if (previousPose !== lastOut && !(frame === lastFrame && lastResult)) tracker.calibrate(fitToFrame(previousPose, frame), o?.timeMs !== undefined ? o.timeMs - 33 : undefined);
      return run(frame, o);
    },
    reset: () => {
      tracker.reset();
      lastFrame = null;
      lastResult = null;
      lastOut = null;
    },
  };
}

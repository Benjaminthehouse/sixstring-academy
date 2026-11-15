/**
 * The "model alignment" fretboard detector (approach B). See README.md in this directory.
 *
 * detect():  ridge field -> candidate axes (Radon-like vote) -> fret comb along each axis -> board
 *            edges -> homography -> continuous 8-parameter alignment -> score -> numbering.
 * track():   the same alignment started from the previous pose, with a motion-predicted start and
 *            a coarse rigid search when the board moved far; returns null when the score collapses.
 */
import { checkPlausibleView, computeVisibleFrets, confirmFretAt, fretX, makePose, neckModel, stringSpacingAt } from '../geometry';
import type { DetectOptions, DetectionDiagnostics, DetectionResult, Detector, DiagnosticFeature, Frame, FretboardPose, MarkerHint, Mat3, NeckModel, NumberingSource, Point } from '../types';
import { AxisSearch, computeRidgeField, type RidgeField } from './axis';
import type { PixelRect } from './image';
import { measureBoard, measurementHomography, type BoardMeasurement, type OrientationHints } from './hypothesis';
import { buildPyramid, toWorkingGray, type GrayImage, type Pyramid } from './image';
import { blendHomography, controlDistance, controlPointsOf, predictShift, searchShift, shiftRigidly } from './motion';
import { resolveMarkers, resolveNumbering } from './numbering';
import { refineHomography, refineRigid, visibleSpan, type FretSpan } from './refine';
import { renumberHomography, rigidity } from './rigidity';
import { lengthTrend, scorePose, type PoseScore } from './score';

/** Tunables of the alignment detector. The defaults are what the benchmark numbers in README.md were measured with. */
export interface AlignDetectorOptions {
  /** Name shown in benchmark tables (default 'align'). */
  name?: string;
  /** Candidate axes examined per frame (default 6). */
  maxCandidates?: number;
  /** A detection needs at least this fit quality, 0..1 (default 0.6). */
  minQuality?: number;
  /** ... and at least this many fret wires seen (default 7). */
  minFrets?: number;
  /** ... and a rigidity residual (see rigidity.ts) of at most this under the best numbering (default 0.22). */
  maxRigidity?: number;
  /** ... and wires whose length changes along the neck as the pose says, to within this relative amount over the seen span (see `lengthTrend`; default 0.35). */
  maxLengthTrend?: number;
  /** With fewer seen wires than this (default 12) and a fit below `excellentQuality` (default 0.85), a detection also needs string evidence of at least `minStringsWhenFew` (default 0.08) or a clear nut. */
  confidentFrets?: number;
  excellentQuality?: number;
  minStringsWhenFew?: number;
  /** Tracking gives up below this fit quality (default 0.4). */
  trackMinQuality?: number;
  /**
   * While tracking, a fit quality below this (or well below what this track has been getting) is
   * "doubtful": such a pose is checked against a fresh full detection, which replaces it when
   * clearly better (default 0.72).
   */
  doubtfulQuality?: number;
  /** The first check comes two frames into the doubt, later ones back off to every 2 x this many frames (default 8; 0 = never check). */
  verifyInterval?: number;
  /** Tracked poses that barely moved are blended with the previous pose by this much, 0..1 (default 0.5; 0 = off). */
  stillSmoothing?: number;
  /** Attach intermediate features to the diagnostics (default true; switch off in production). */
  debugFeatures?: boolean;
}

/** One fully evaluated board hypothesis, in working-frame pixels. */
export interface Hypothesis {
  H: Mat3;
  polarity: 1 | -1;
  score: PoseScore;
  span: FretSpan;
  measurement: BoardMeasurement | null;
  /** Residual of the final alignment in pixels. */
  rms: number;
}

/** The frame as the stages see it. */
interface WorkFrame {
  pyramid: Pyramid;
  width: number;
  height: number;
  /** Working pixels per frame pixel. */
  scaleX: number;
  scaleY: number;
}

/** What the tracker remembers between frames. */
interface MotionState {
  /** Control points (working pixels) and capture time of the last pose handed out. */
  points: Point[];
  timeMs: number;
  /** The same for the pose before it, when it was a tracking step. */
  before: { points: Point[]; timeMs: number } | null;
  /** Working size the points refer to. */
  width: number;
}

/** The search region of the options (a rectangle or a polygon, frame pixels) as a rectangle of working pixels. */
function regionOf(options: DetectOptions | undefined, wf: { scaleX: number; scaleY: number; width: number; height: number }): PixelRect | undefined {
  const region = options?.region;
  if (!region) return undefined;
  let x0: number;
  let y0: number;
  let x1: number;
  let y1: number;
  if (Array.isArray(region)) {
    if (region.length === 0) return undefined;
    x0 = Math.min(...region.map((p) => p.x));
    x1 = Math.max(...region.map((p) => p.x));
    y0 = Math.min(...region.map((p) => p.y));
    y1 = Math.max(...region.map((p) => p.y));
  } else {
    x0 = region.x;
    y0 = region.y;
    x1 = region.x + region.width;
    y1 = region.y + region.height;
  }
  const rect = { x0: Math.floor(x0 * wf.scaleX), y0: Math.floor(y0 * wf.scaleY), x1: Math.ceil(x1 * wf.scaleX), y1: Math.ceil(y1 * wf.scaleY) };
  return rect.x1 - rect.x0 >= 16 && rect.y1 - rect.y0 >= 16 ? rect : undefined;
}

function hintsOf(options: DetectOptions | undefined, pose?: FretboardPose): OrientationHints {
  return { bassSideUp: options?.bassSideUp ?? true, mirrored: options?.mirrored ?? pose?.mirrored ?? false, leftHanded: options?.leftHanded ?? pose?.leftHanded ?? false };
}

function scaleH(H: Mat3, sx: number, sy: number): Mat3 {
  return [H[0] * sx, H[1] * sx, H[2] * sx, H[3] * sy, H[4] * sy, H[5] * sy, H[6], H[7], H[8]];
}

/** Create the alignment detector. One instance per camera stream (it keeps buffers and motion state). */
export function createAlignDetector(options: AlignDetectorOptions = {}): Detector {
  const maxCandidates = options.maxCandidates ?? 6;
  const minQuality = options.minQuality ?? 0.6;
  const minFrets = options.minFrets ?? 7;
  const maxRigidity = options.maxRigidity ?? 0.22;
  const maxLengthTrend = options.maxLengthTrend ?? 0.35;
  const confidentFrets = options.confidentFrets ?? 12;
  const minStringsWhenFew = options.minStringsWhenFew ?? 0.08;
  const excellentQuality = options.excellentQuality ?? 0.85;
  const trackMinQuality = options.trackMinQuality ?? 0.4;
  const doubtfulQuality = options.doubtfulQuality ?? 0.72;
  const verifyInterval = options.verifyInterval ?? 8;
  const stillSmoothing = options.stillSmoothing ?? 0.5;
  const debugFeatures = options.debugFeatures ?? true;
  let gray: GrayImage | null = null;
  let pyramid: Pyramid | null = null;
  let field: RidgeField | null = null;
  let motion: MotionState | null = null;
  /** Board polarity of the stream being tracked (0 = not known yet). */
  let streamPolarity: 1 | -1 | 0 = 0;
  /** Focal length (working pixels) assumed for the stream being tracked (0 = not chosen yet). */
  let streamFocal = 0;
  let frameClock = 0;
  /** Smoothed fit quality of the current track, and frames since it was last checked against a full detection. */
  let trackQuality = 0;
  let sinceVerify = 0;
  let verifyGap = 2;

  const prepare = (frame: Frame): WorkFrame => {
    const work = toWorkingGray(frame, gray);
    gray = work.gray;
    pyramid = buildPyramid(gray, pyramid);
    return { pyramid, width: gray.width, height: gray.height, scaleX: work.scaleX, scaleY: work.scaleY };
  };

  /** Evaluate one measurement: homography, alignment, score. */
  const evaluate = (wf: WorkFrame, m: BoardMeasurement, model: NeckModel, hints: OrientationHints): Hypothesis | null => {
    const { fine, coarse } = wf.pyramid;
    const jMax = m.comb.frets[m.comb.frets.length - 1].j;
    // Keep the comb inside the model's fret range where possible.
    let offset = m.offsetGuess;
    if (offset + jMax > model.fretCount) offset = model.fretCount - jMax;
    if (offset < 0) offset = 0;
    const H0 = measurementHomography(m, model, offset);
    if (!H0) return null;
    // A few lines beyond the comb on both sides: the nut or the last frets may not have made it into the comb.
    const lo = offset - 5;
    const hi = offset + jMax + 3;
    let span = visibleSpan(H0, model, wf.width, wf.height, lo, hi);
    if (span.max - span.min < 3) return null;
    const refined = refineHomography(fine, coarse, H0, model, m.polarity, span);
    if (refined.matched < 12) return null;
    span = visibleSpan(refined.H, model, wf.width, wf.height, lo, hi);
    if (span.max - span.min < 3) return null;
    const report = checkPlausibleView(refined.H, model, wf.width, wf.height, { mirrored: hints.mirrored, leftHanded: hints.leftHanded, minSpan: 0.12, maxSpan: 6, maxTiltDeg: 75 });
    if (!report.plausible) return null;
    const score = scorePose(fine, coarse, refined.H, model, m.polarity, span);
    return hopStrings(wf, { H: refined.H, polarity: m.polarity, score, span, measurement: m, rms: refined.rms }, model);
  };

  /**
   * The strings look the same when the pose slips sideways by one string; the wire ends do not.
   * When the score says the board really lies one way (see `PoseScore.lateral`), try the pose one
   * string over and keep whichever fits better.
   */
  const hopStrings = (wf: WorkFrame, hyp: Hypothesis, model: NeckModel, rigidFocal = 0): Hypothesis => {
    if (Math.abs(hyp.score.lateral) < 0.5) return hyp;
    const { fine, coarse } = wf.pyramid;
    const seen = hyp.score.seenSpan;
    const shift = (hyp.score.lateral > 0 ? 1 : -1) * stringSpacingAt(model, fretX(model, (seen.min + seen.max) / 2));
    // Model point (x, y) takes the place of (x, y - shift): the whole pattern moves toward the bass side for a positive shift.
    const H = hyp.H;
    const moved: Mat3 = [H[0], H[1], H[2] - shift * H[1], H[3], H[4], H[5] - shift * H[4], H[6], H[7], H[8] - shift * H[7]];
    const refined = rigidFocal > 0 ? refineRigid(fine, coarse, moved, rigidFocal, model, hyp.polarity, hyp.span, { radii: [2, 1.5, 1], stringsFrom: 0 }) : refineHomography(fine, coarse, moved, model, hyp.polarity, hyp.span, { radii: [2, 1.5, 1], stringsFrom: 0 });
    if (refined.matched < 8) return hyp;
    const score = scorePose(fine, coarse, refined.H, model, hyp.polarity, hyp.span);
    return score.quality > hyp.score.quality + 0.02 && Math.abs(score.lateral) < Math.abs(hyp.score.lateral) ? { ...hyp, H: refined.H, score, rms: refined.rms } : hyp;
  };

  /** Ranking of competing hypotheses: fit quality first, and among similar fits the one that explains more frets. */
  const rank = (h: Hypothesis): number => h.score.quality + 0.015 * Math.min(24, h.score.seen);

  /** Remember a pose we are about to hand out, for motion prediction. */
  const remember = (H: Mat3, model: NeckModel, timeMs: number, width: number, continued: boolean): void => {
    const points = controlPointsOf(H, model);
    motion = { points, timeMs, before: continued && motion ? { points: motion.points, timeMs: motion.timeMs } : null, width };
  };

  /**
   * Follow a pose into the current frame. `Hprev` is the previous pose in working pixels. Returns
   * null when the board is not where the search can reach it.
   */
  const follow = (wf: WorkFrame, Hprev: Mat3, model: NeckModel, timeMs: number, wideSearch: boolean, stats: Record<string, number>): Hypothesis | null => {
    const { fine, coarse } = wf.pyramid;
    const prevPoints = controlPointsOf(Hprev, model);
    // The camera behind this stream: the focal length under which the pose is the most rigid view.
    // (Chosen afresh whenever the pose comes from somewhere else: a detection, a calibration, a tap.)
    if (!motion || motion.width !== wf.width || controlDistance(motion.points, prevPoints) >= 1.5) streamFocal = 0;
    if (streamFocal === 0) streamFocal = rigidity(Hprev, wf.width, wf.height)?.focalPx ?? 0.8 * wf.width;
    const focal = streamFocal;
    // Motion prediction: only when the pose we are given is the one we handed out last.
    let start: Mat3 = Hprev;
    let predicted = false;
    if (motion && motion.before && motion.width === wf.width && controlDistance(motion.points, prevPoints) < 1.5) {
      const dtPrev = motion.timeMs - motion.before.timeMs;
      const dt = timeMs - motion.timeMs;
      if (dtPrev > 0 && dt > 0 && dt < 4 * dtPrev) {
        const guess = predictShift(motion.before.points, motion.points, dt / dtPrev, 0.06 * wf.width);
        if (Math.hypot(guess.dx, guess.dy) > 0.5) {
          start = shiftRigidly(Hprev, focal, wf.width, wf.height, guess.dx, guess.dy);
          predicted = true;
        }
      }
    }
    const attempt = (H0: Mat3, polarity: 1 | -1): Hypothesis | null => {
      let span = visibleSpan(H0, model, wf.width, wf.height, 0, model.fretCount);
      if (span.max - span.min < 2) return null;
      // Slide onto the wires first: cheap, and it brings fast motion within reach of the fine alignment.
      const reach = wideSearch ? 0.05 * wf.width : 0.02 * wf.width;
      const shift = searchShift(fine, coarse, H0, model, polarity, span, reach, reach, 2);
      const H = shiftRigidly(H0, focal, wf.width, wf.height, shift.dx, shift.dy);
      // A neck does not change shape between frames: align it as a rigid body.
      const refined = refineRigid(fine, coarse, H, focal, model, polarity, span, { radii: [5, 3.5, 2.5, 1.5, 1], damping: 0.02, stringsFrom: wideSearch ? 3 : 0 });
      if (refined.matched < 8) return null;
      span = visibleSpan(refined.H, model, wf.width, wf.height, 0, model.fretCount);
      if (span.max - span.min < 2) return null;
      const score = scorePose(fine, coarse, refined.H, model, polarity, span);
      let hyp = hopStrings(wf, { H: refined.H, polarity, score, span, measurement: null, rms: refined.rms }, model, focal);
      if (hyp.score.quality < doubtfulQuality) {
        // The rigid fit is poor: perhaps the assumed shape or focal length is off. Let all eight parameters go.
        const free = refineHomography(fine, coarse, H, model, polarity, span, { radii: [5, 3.5, 2.5, 1.5, 1], damping: 0.05, stringsFrom: wideSearch ? 3 : 0 });
        if (free.matched >= 8) {
          const freeSpan = visibleSpan(free.H, model, wf.width, wf.height, 0, model.fretCount);
          if (freeSpan.max - freeSpan.min >= 2) {
            const freeScore = scorePose(fine, coarse, free.H, model, polarity, freeSpan);
            if (freeScore.quality > hyp.score.quality + 0.05) hyp = hopStrings(wf, { H: free.H, polarity, score: freeScore, span: freeSpan, measurement: null, rms: free.rms }, model);
          }
        }
      }
      return hyp;
    };
    const polarities: (1 | -1)[] = streamPolarity === 0 ? [1, -1] : [streamPolarity];
    let best: Hypothesis | null = null;
    for (const polarity of polarities) {
      let hyp = attempt(start, polarity);
      // A wrong prediction (the guitar stopped) must not cost the lock: fall back to "it did not move".
      if (predicted && (!hyp || hyp.score.quality < trackMinQuality)) {
        const still = attempt(Hprev, polarity);
        if (still && (!hyp || still.score.quality > hyp.score.quality)) hyp = still;
      }
      if (hyp && (!best || hyp.score.quality > best.score.quality)) best = hyp;
    }
    stats.predicted = predicted ? 1 : 0;
    if (!best) return null;
    // A tracked pose cannot change shape much in one frame: guard against sliding onto something else.
    const moved = controlDistance(controlPointsOf(best.H, model), prevPoints);
    stats.moved = moved;
    if (moved > 0.2 * wf.width) return null;
    return best;
  };

  /** What `resolveNumbering` needs to know about a pose, plus the rigidity of its best numbering. */
  const numberingContext = (H: Mat3, model: NeckModel, wf: WorkFrame, seen: FretSpan): { implausibility: (delta: number) => number; maxFret: number; minRigidity: number } => {
    const xRef = fretX(model, (seen.min + seen.max) / 2);
    const maxFret = model.fretCount + 2;
    const viewOf = (delta: number): { residual: number; tiltDeg: number } => {
      const r = rigidity(renumberHomography(H, model, delta, xRef), wf.width, wf.height);
      return r ? { residual: r.residual, tiltDeg: r.tiltDeg } : { residual: 9, tiltDeg: 90 };
    };
    let minRigidity = Infinity;
    for (let d = -seen.min; d <= Math.max(-seen.min, maxFret - seen.max); d++) {
      const v = viewOf(d);
      if (v.tiltDeg <= 68) minRigidity = Math.min(minRigidity, v.residual);
    }
    // Beyond about 45 degrees off the normal a view gets steadily less likely; beyond 68 it is not a playing posture.
    const implausibility = (delta: number): number => {
      const v = viewOf(delta);
      return v.tiltDeg > 68 ? 9 : v.residual + Math.max(0, v.tiltDeg - 45) * 0.012;
    };
    return { implausibility, maxFret, minRigidity };
  };

  /** Outcome of a full detection on a prepared frame. */
  interface FullDetection {
    H: Mat3;
    score: PoseScore;
    polarity: 1 | -1;
    source: NumberingSource;
    numberingConfidence: number;
    /** Why there is no pose, when there is none. */
    reason?: string;
    trace?: string;
  }

  /** Detect from scratch on a prepared frame. `stale` (working pixels) lends its numbering when the image offers none. */
  const fullDetect = (
    wf: WorkFrame,
    model: NeckModel,
    hints: OrientationHints,
    stale: { H: Mat3; numberingConfidence: number } | null,
    markers: { frame: Frame; hint: MarkerHint } | null,
    timings: Record<string, number>,
    stats: Record<string, number>,
    region?: PixelRect,
  ): FullDetection | { H: null; reason: string } => {
    const { fine, coarse } = wf.pyramid;
    let t1 = performance.now();
    field = computeRidgeField(fine, {}, field);
    let t2 = performance.now();
    timings.ridges = t2 - t1;
    const search = new AxisSearch(field, region);
    t1 = performance.now();
    timings.vote = t1 - t2;
    let best: Hypothesis | null = null;
    let examined = 0;
    let measureMs = 0;
    let alignMs = 0;
    for (let k = 0; k < maxCandidates; k++) {
      const cand = search.next(0.25);
      if (!cand) break;
      examined++;
      const tm = performance.now();
      const measurements = measureBoard(fine, coarse, field, cand, hints, model, { minFrets: Math.min(5, minFrets) });
      const te = performance.now();
      measureMs += te - tm;
      for (const m of measurements) {
        const hyp = evaluate(wf, m, model, hints);
        if (!hyp) continue;
        if (!best || rank(hyp) > rank(best)) best = hyp;
      }
      alignMs += performance.now() - te;
      if (best && best.score.quality > 0.75 && best.score.seen >= 8) break;
    }
    t2 = performance.now();
    timings.hypotheses = t2 - t1;
    timings.measure = measureMs;
    timings.align = alignMs;
    stats.candidates = examined;
    if (!best) return { H: null, reason: 'no-hypothesis' };
    stats.quality = best.score.quality;
    stats.seen = best.score.seen;
    stats.coverage = best.score.coverage;
    stats.cleanliness = best.score.cleanliness;
    stats.fill = best.score.fill;
    stats.contrast = best.score.contrast;
    stats.overrun = best.score.overrun;
    stats.strings = best.score.strings;
    stats.thickness = best.score.thickness;
    if (best.score.quality < minQuality || best.score.seen < minFrets) return { H: null, reason: 'low-score' };
    // Could a camera have seen a neck like this? Under the most favourable numbering, that is.
    const seen = best.score.seenSpan;
    const xRef = fretX(model, (seen.min + seen.max) / 2);
    const context = numberingContext(best.H, model, wf, seen);
    stats.rigid = context.minRigidity;
    if (context.minRigidity > maxRigidity) return { H: null, reason: 'not-rigid' };
    const trend = lengthTrend(fine, coarse, best.H, model, best.polarity, best.score);
    stats.lengthTrend = trend;
    if (Math.abs(trend) > maxLengthTrend) return { H: null, reason: 'wires-do-not-taper' };
    // Numbering, then one more alignment under the final numbering (the taper depends on it).
    const decision = resolveNumbering(fine, coarse, best.H, model, best.polarity, best.score, context);
    // A short run of evenly ruled thin lines (piano keys, a radiator, the edges of a row of books)
    // can pass for a few frets. A short run of real frets shows something more: its strings or a
    // clear nut. (Inlay dots do not count: alternating light and dark keys read as dots too.)
    const corroborated = best.score.strings >= minStringsWhenFew || (decision.source === 'nut' && decision.confidence >= 0.8);
    // (Stickers found below corroborate too, but they are looked for only once the board is accepted.)
    if (best.score.seen < confidentFrets && best.score.quality < excellentQuality && !corroborated) return { H: null, reason: 'few-frets-uncorroborated' };
    let delta = decision.delta;
    let source = decision.source;
    let numberingConfidence = decision.confidence;
    let trace = decision.trace;
    if (markers) {
      // Marker mode: stickers at known frets outrank everything read off the board itself.
      const byMarkers = resolveMarkers(markers.frame, scaleH(best.H, 1 / wf.scaleX, 1 / wf.scaleY), model, best.score, markers.hint, context.maxFret);
      if (byMarkers) {
        delta = byMarkers.delta;
        source = byMarkers.source;
        numberingConfidence = byMarkers.confidence;
        trace = `${byMarkers.trace} | ${trace}`;
      }
    }
    if (stale && stale.numberingConfidence >= numberingConfidence) {
      // The earlier pose knew its numbers at least as well as this frame shows them: keep them, provided
      // the board is still on the same frets (it moved by less than a third of a fret).
      const carried = carryNumbering(best.H, stale.H, model, seen);
      if (carried !== null) {
        delta = carried;
        source = 'tracked';
        numberingConfidence = stale.numberingConfidence;
      }
    }
    let finalH = best.H;
    let finalScore = best.score;
    if (delta !== 0) {
      const shifted = renumberHomography(best.H, model, delta, xRef);
      const span = visibleSpan(shifted, model, wf.width, wf.height, best.span.min + delta, best.span.max + delta);
      if (span.max - span.min >= 3) {
        const again = refineHomography(fine, coarse, shifted, model, best.polarity, span, { radii: [2, 1.5, 1] });
        finalH = again.matched >= 12 ? again.H : shifted;
        finalScore = scorePose(fine, coarse, finalH, model, best.polarity, span);
      } else {
        finalH = shifted;
      }
    }
    timings.numbering = performance.now() - t2;
    stats.numberingDelta = delta;
    return { H: finalH, score: finalScore, polarity: best.polarity, source, numberingConfidence, trace };
  };

  const poseFrom = (H: Mat3, model: NeckModel, frame: Frame, wf: WorkFrame, hints: OrientationHints, confidence: number, numbering: NumberingSource, numberingConfidence: number): FretboardPose => {
    const Hf = scaleH(H, 1 / wf.scaleX, 1 / wf.scaleY);
    return makePose(Hf, model, frame.width, frame.height, {
      confidence: Math.max(0, Math.min(1, confidence)),
      mirrored: hints.mirrored,
      leftHanded: hints.leftHanded,
      numbering,
      numberingConfidence,
      visibleFrets: computeVisibleFrets(Hf, model, frame.width, frame.height),
    });
  };

  const badFrame = (frame: Frame): boolean => !frame || !(frame.width >= 32) || !(frame.height >= 32) || !frame.data || frame.data.length < frame.width * frame.height * 4;

  const detect = (frame: Frame, opts?: DetectOptions): DetectionResult => {
    const t0 = performance.now();
    const timings: Record<string, number> = {};
    const features: DiagnosticFeature[] = [];
    const stats: Record<string, number> = {};
    const finish = (pose: FretboardPose | null, reason?: string): DetectionResult => {
      timings.total = performance.now() - t0;
      const diagnostics: DetectionDiagnostics = { timings, reason, stats };
      if (debugFeatures) diagnostics.features = features;
      return { pose, diagnostics };
    };
    if (badFrame(frame)) return finish(null, 'bad-frame');
    const previous = opts?.previousPose;
    const model = previous ? previous.model : neckModel(opts?.model ?? 'steel');
    const hints = hintsOf(opts, previous);
    const timeMs = opts?.timeMs ?? ++frameClock * 33;
    const wf = prepare(frame);
    const t1 = performance.now();
    timings.prepare = t1 - t0;

    // A stale pose is the cheapest hypothesis: if the board is still about there and fits well, we are done.
    let reacquired: Hypothesis | null = null;
    if (previous && previous.frameWidth > 0) {
      const Hprev = scaleH(previous.H, wf.width / previous.frameWidth, wf.height / previous.frameHeight);
      const hyp = follow(wf, Hprev, model, timeMs, true, stats);
      timings.reacquire = performance.now() - t1;
      if (hyp && hyp.score.quality >= minQuality && hyp.score.seen >= Math.min(5, minFrets)) {
        reacquired = hyp;
        if (hyp.score.quality >= Math.max(minQuality, doubtfulQuality + 0.06)) {
          streamPolarity = hyp.polarity;
          remember(hyp.H, model, timeMs, wf.width, false);
          trackQuality = hyp.score.quality;
          sinceVerify = 0;
          stats.quality = hyp.score.quality;
          stats.seen = hyp.score.seen;
          return finish(poseFrom(hyp.H, model, frame, wf, hints, hyp.score.quality * 1.1, 'tracked', carriedConfidence(previous.numberingConfidence, stats.moved ?? 0, hyp, model)), 'reacquired');
        }
      }
    }
    const stale = previous && previous.frameWidth > 0 ? { H: scaleH(previous.H, wf.width / previous.frameWidth, wf.height / previous.frameHeight), numberingConfidence: previous.numberingConfidence } : null;
    const full = fullDetect(wf, model, hints, stale, opts?.markers ? { frame, hint: opts.markers } : null, timings, stats, regionOf(opts, wf));
    // The better of a fresh detection and the re-acquired stale pose.
    if (full.H === null || (reacquired && reacquired.score.quality > full.score.quality)) {
      if (!reacquired || !previous) return finish(null, full.H === null ? full.reason : 'low-score');
      streamPolarity = reacquired.polarity;
      remember(reacquired.H, model, timeMs, wf.width, false);
      trackQuality = reacquired.score.quality;
      sinceVerify = 0;
      return finish(poseFrom(reacquired.H, model, frame, wf, hints, reacquired.score.quality * 1.1, 'tracked', carriedConfidence(previous.numberingConfidence, stats.moved ?? 0, reacquired, model)), 'reacquired');
    }
    if (debugFeatures && full.trace) features.push({ kind: 'numbering', points: [{ x: 4, y: frame.height - 4 }], label: full.trace });
    streamPolarity = full.polarity;
    streamFocal = 0;
    trackQuality = full.score.quality;
    sinceVerify = 0;
    let pose = poseFrom(full.H, model, frame, wf, hints, full.score.quality * 1.1, full.source, full.numberingConfidence);
    // One-tap confirmation: "this pixel is on fret N" settles the numbering whatever the image says.
    if (opts?.fretHint) pose = confirmFretAt(pose, opts.fretHint.point, opts.fretHint.fret) ?? pose;
    remember(scaleH(pose.H, wf.scaleX, wf.scaleY), model, timeMs, wf.width, false);
    return finish(pose);
  };

  const track = (frame: Frame, previousPose: FretboardPose, opts?: DetectOptions): DetectionResult => {
    const t0 = performance.now();
    const timings: Record<string, number> = {};
    const stats: Record<string, number> = {};
    const finish = (pose: FretboardPose | null, reason?: string): DetectionResult => {
      timings.total = performance.now() - t0;
      return { pose, diagnostics: { timings, reason, stats } };
    };
    if (badFrame(frame) || !previousPose || !previousPose.H || !(previousPose.frameWidth > 0)) return finish(null, 'bad-input');
    const model = previousPose.model;
    const hints = hintsOf(opts, previousPose);
    const timeMs = opts?.timeMs ?? ++frameClock * 33;
    const wf = prepare(frame);
    const t1 = performance.now();
    timings.prepare = t1 - t0;
    const Hprev = scaleH(previousPose.H, wf.width / previousPose.frameWidth, wf.height / previousPose.frameHeight);
    const hyp = follow(wf, Hprev, model, timeMs, false, stats);
    timings.align = performance.now() - t1;
    if (!hyp) return finish(null, 'lost');
    stats.quality = hyp.score.quality;
    stats.seen = hyp.score.seen;
    if (hyp.score.quality < trackMinQuality || hyp.score.seen < 4) return finish(null, 'low-score');
    streamPolarity = hyp.polarity;
    // A doubtful fit (a pose that settled a little wrong, or a board coming out from behind
    // something) is checked now and then against a detection from scratch.
    sinceVerify++;
    const doubtful = hyp.score.quality < doubtfulQuality || hyp.score.quality < 0.85 * trackQuality;
    trackQuality = trackQuality > 0 ? 0.8 * trackQuality + 0.2 * hyp.score.quality : hyp.score.quality;
    // First check soon after doubt sets in, then back off: a board that simply stays half hidden
    // must not cost a full detection every few frames.
    if (!doubtful) verifyGap = Math.min(2, verifyInterval);
    if (doubtful && verifyInterval > 0 && sinceVerify >= verifyGap) {
      sinceVerify = 0;
      verifyGap = Math.min(verifyInterval * 2, verifyGap * 2);
      const full = fullDetect(wf, model, hints, { H: hyp.H, numberingConfidence: previousPose.numberingConfidence }, opts?.markers ? { frame, hint: opts.markers } : null, timings, stats);
      stats.verified = 1;
      if (full.H !== null && full.score.quality > hyp.score.quality + 0.1) {
        // `fullDetect` kept the track's numbering if the fresh pose sits on the same frets; otherwise it used its own evidence.
        remember(full.H, model, timeMs, wf.width, false);
        trackQuality = full.score.quality;
        streamFocal = 0;
        verifyGap = Math.min(2, verifyInterval);
        return finish(poseFrom(full.H, model, frame, wf, hints, full.score.quality * 1.1, full.source, full.numberingConfidence), 'redetected');
      }
    }
    // Numbers that were only a guess are upgraded as soon as the image shows the nut or the inlays.
    let numbering: NumberingSource = 'tracked';
    let numberingConfidence = previousPose.numberingConfidence;
    let H = hyp.H;
    if (numberingConfidence < 0.5 && sinceVerify % 2 === 0 && hyp.score.seen >= 5) {
      const { fine, coarse } = wf.pyramid;
      const seen = hyp.score.seenSpan;
      const decision = resolveNumbering(fine, coarse, hyp.H, model, hyp.polarity, hyp.score, numberingContext(hyp.H, model, wf, seen));
      if (decision.confidence >= 0.6) {
        if (decision.delta !== 0) H = renumberHomography(hyp.H, model, decision.delta, fretX(model, (seen.min + seen.max) / 2));
        numbering = decision.source;
        numberingConfidence = decision.confidence;
        stats.renumbered = decision.delta;
      }
    }
    // Steadiness: a pose that moved less than a pixel is mostly measurement noise; blend it with the last one.
    if (stillSmoothing > 0 && H === hyp.H) {
      const now = controlPointsOf(H, model);
      const before = controlPointsOf(Hprev, model);
      const moved = controlDistance(now, before);
      if (moved < 1.5) {
        const keep = stillSmoothing * (1 - moved / 1.5);
        const blended = blendHomography(model, now, before, keep);
        if (blended) H = blended;
      }
    }
    // (A renumbered pose has its control points elsewhere: it starts a new motion history.)
    remember(H, model, timeMs, wf.width, !stats.renumbered);
    return finish(poseFrom(H, model, frame, wf, hints, hyp.score.quality * 1.1, numbering, numberingConfidence));
  };

  return {
    name: options.name ?? 'align',
    detect,
    track,
    reset(): void {
      motion = null;
      streamPolarity = 0;
      streamFocal = 0;
      frameClock = 0;
      trackQuality = 0;
      sinceVerify = 0;
      verifyGap = 2;
    },
  };
}

/**
 * Numbering shift that makes a freshly detected pose agree with a stale one: the whole-fret shift
 * under which the fret lines of the new pose lie nearest those of the old. Null when the two do
 * not overlap well enough to tell (the guitar moved by more than a fraction of a fret).
 */
function carryNumbering(H: Mat3, Hold: Mat3, model: NeckModel, seen: FretSpan): number | null {
  const yc = model.nutWidth / 2;
  const at = (M: Mat3, n: number): Point => {
    const x = fretX(model, n);
    const w = M[6] * x + M[7] * yc + M[8];
    return { x: (M[0] * x + M[1] * yc + M[2]) / w, y: (M[3] * x + M[4] * yc + M[5]) / w };
  };
  let best = Infinity;
  let second = Infinity;
  let bestD = 0;
  for (let d = -seen.min; d <= model.fretCount + 2 - seen.max; d++) {
    let sum = 0;
    let count = 0;
    for (let n = seen.min; n <= seen.max; n++) {
      const a = at(H, n);
      const b = at(Hold, n + d);
      const spacing = Math.hypot(at(H, n + 1).x - a.x, at(H, n + 1).y - a.y) + 1e-6;
      sum += Math.hypot(a.x - b.x, a.y - b.y) / spacing;
      count++;
    }
    const mean = sum / Math.max(1, count);
    if (mean < best) {
      second = best;
      best = mean;
      bestD = d;
    } else if (mean < second) second = mean;
  }
  // The stale pose must be within a third of a fret of the new one, and clearly better than its neighbours.
  return best < 0.35 && second > 1.5 * best ? bestD : null;
}

/**
 * Numbering confidence of a pose re-acquired from a stale one. The fret pattern looks the same one
 * fret along, so a pose found again after the board moved by a good part of a fret may have slipped:
 * its numbers are then no better than a guess, however sure the stale pose was.
 */
function carriedConfidence(previous: number, movedPx: number, hyp: Hypothesis, model: NeckModel): number {
  const yc = model.nutWidth / 2;
  const at = (n: number): Point => {
    const x = fretX(model, n);
    const w = hyp.H[6] * x + hyp.H[7] * yc + hyp.H[8];
    return { x: (hyp.H[0] * x + hyp.H[1] * yc + hyp.H[2]) / w, y: (hyp.H[3] * x + hyp.H[4] * yc + hyp.H[5]) / w };
  };
  // Typical spacing of the frets in view.
  const mid = Math.round((hyp.span.min + hyp.span.max) / 2);
  const a = at(mid);
  const b = at(mid + 1);
  const spacing = Math.hypot(a.x - b.x, a.y - b.y);
  return movedPx > 0.35 * spacing ? Math.min(previous, 0.4) : previous;
}

/** Factory the benchmark runner looks for. */
export function createDetector(): Detector {
  return createAlignDetector();
}

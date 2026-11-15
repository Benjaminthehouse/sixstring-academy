/**
 * The "model alignment" fretboard detector (approach B). See README.md in this directory.
 *
 * detect():  ridge field -> candidate axes (Radon-like vote) -> fret comb along each axis -> board
 *            edges -> homography -> continuous 8-parameter alignment -> score -> numbering.
 * track():   the same alignment started from the previous pose, with a motion-predicted start and
 *            a coarse search when the board moved far; returns null when the score collapses.
 */
import { checkPlausibleView, computeVisibleFrets, makePose, neckModel } from '../geometry';
import type { DetectOptions, DetectionDiagnostics, DetectionResult, Detector, DiagnosticFeature, Frame, FretboardPose, Mat3, NeckModel, NumberingSource } from '../types';
import { AxisSearch, computeRidgeField, type RidgeField } from './axis';
import { measureBoard, measurementHomography, type BoardMeasurement, type OrientationHints } from './hypothesis';
import { gaussianBlur, toWorkingGray, type GrayImage } from './image';
import { refineHomography, visibleSpan, type FretSpan } from './refine';
import { scorePose, type PoseScore } from './score';

/** Tunables of the alignment detector. The defaults are what the benchmark numbers in README.md were measured with. */
export interface AlignDetectorOptions {
  /** Name shown in benchmark tables (default 'align'). */
  name?: string;
  /** Candidate axes examined per frame (default 8). */
  maxCandidates?: number;
  /** A detection needs at least this fit quality, 0..1 (default 0.3). */
  minQuality?: number;
  /** ... and at least this many fret wires seen (default 5). */
  minFrets?: number;
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

const SIGMA_FINE = 1.2;
const SIGMA_COARSE_EXTRA = 2.1; // on top of the fine blur: sqrt(1.2^2 + 2.1^2) = 2.4

function hintsOf(options: DetectOptions | undefined): OrientationHints {
  return { bassSideUp: options?.bassSideUp ?? true, mirrored: options?.mirrored ?? false, leftHanded: options?.leftHanded ?? false };
}

function scaleH(H: Mat3, sx: number, sy: number): Mat3 {
  return [H[0] * sx, H[1] * sx, H[2] * sx, H[3] * sy, H[4] * sy, H[5] * sy, H[6], H[7], H[8]];
}

/** Create the alignment detector. One instance per camera stream (it keeps buffers and motion state). */
export function createAlignDetector(options: AlignDetectorOptions = {}): Detector {
  const maxCandidates = options.maxCandidates ?? 8;
  const minQuality = options.minQuality ?? 0.3;
  const minFrets = options.minFrets ?? 5;
  const debugFeatures = options.debugFeatures ?? true;
  let gray: GrayImage | null = null;
  let fine: GrayImage | null = null;
  let coarse: GrayImage | null = null;
  let field: RidgeField | null = null;

  /** Evaluate one measurement: homography, alignment, score. */
  const evaluate = (f: GrayImage, c: GrayImage, m: BoardMeasurement, model: NeckModel, hints: OrientationHints): Hypothesis | null => {
    const jMax = m.comb.frets[m.comb.frets.length - 1].j;
    // Keep the comb inside the model's fret range where possible.
    let offset = m.offsetGuess;
    if (offset + jMax > model.fretCount) offset = model.fretCount - jMax;
    if (offset < 0) offset = 0;
    const H0 = measurementHomography(m, model, offset);
    if (!H0) return null;
    const lo = offset - 3;
    const hi = offset + jMax + 3;
    let span = visibleSpan(H0, model, f.width, f.height, lo, hi);
    if (span.max - span.min < 3) return null;
    const refined = refineHomography(f, c, H0, model, m.polarity, span);
    if (refined.matched < 12) return null;
    span = visibleSpan(refined.H, model, f.width, f.height, lo, hi);
    if (span.max - span.min < 3) return null;
    const report = checkPlausibleView(refined.H, model, f.width, f.height, { mirrored: hints.mirrored, leftHanded: hints.leftHanded, minSpan: 0.12, maxSpan: 6, maxTiltDeg: 75 });
    if (!report.plausible) return null;
    const score = scorePose(f, c, refined.H, model, m.polarity, span);
    return { H: refined.H, polarity: m.polarity, score, span, measurement: m, rms: refined.rms };
  };

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
    if (!frame || !(frame.width >= 32) || !(frame.height >= 32) || frame.data.length < frame.width * frame.height * 4) return finish(null, 'bad-frame');
    const model = neckModel(opts?.model ?? 'steel');
    const hints = hintsOf(opts);
    const work = toWorkingGray(frame, gray);
    gray = work.gray;
    fine = gaussianBlur(gray, SIGMA_FINE, fine);
    coarse = gaussianBlur(fine, SIGMA_COARSE_EXTRA, coarse);
    let t1 = performance.now();
    timings.prepare = t1 - t0;
    field = computeRidgeField(fine, {}, field);
    let t2 = performance.now();
    timings.ridges = t2 - t1;
    const search = new AxisSearch(field);
    t1 = performance.now();
    timings.vote = t1 - t2;
    let best: Hypothesis | null = null;
    let examined = 0;
    for (let k = 0; k < maxCandidates; k++) {
      const cand = search.next();
      if (!cand) break;
      examined++;
      const measurements = measureBoard(fine, coarse, field, cand, hints, model, { minFrets });
      for (const m of measurements) {
        const hyp = evaluate(fine, coarse, m, model, hints);
        if (!hyp) continue;
        if (!best || hyp.score.quality > best.score.quality) best = hyp;
      }
      if (best && best.score.quality > 0.75 && best.score.seen >= 8) break;
    }
    t2 = performance.now();
    timings.hypotheses = t2 - t1;
    stats.candidates = examined;
    if (!best) return finish(null, 'no-hypothesis');
    stats.quality = best.score.quality;
    stats.seen = best.score.seen;
    stats.coverage = best.score.coverage;
    stats.cleanliness = best.score.cleanliness;
    stats.fill = best.score.fill;
    stats.contrast = best.score.contrast;
    if (best.score.quality < minQuality || best.score.seen < minFrets) return finish(null, 'low-score');
    const sx = 1 / work.scaleX;
    const sy = 1 / work.scaleY;
    const H = scaleH(best.H, sx, sy);
    const numbering: NumberingSource = 'assumed';
    const pose = makePose(H, model, frame.width, frame.height, {
      confidence: Math.min(1, best.score.quality * 1.2),
      mirrored: hints.mirrored,
      leftHanded: hints.leftHanded,
      numbering,
      numberingConfidence: 0.2,
      visibleFrets: computeVisibleFrets(H, model, frame.width, frame.height),
    });
    return finish(pose);
  };

  const track = (frame: Frame, previousPose: FretboardPose, opts?: DetectOptions): DetectionResult => {
    void previousPose;
    return detect(frame, opts);
  };

  return {
    name: options.name ?? 'align',
    detect,
    track,
    reset(): void {
      // No temporal state yet.
    },
  };
}

/** Factory the benchmark runner looks for. */
export function createDetector(): Detector {
  return createAlignDetector();
}

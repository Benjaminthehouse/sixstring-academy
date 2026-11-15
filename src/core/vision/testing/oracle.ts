/**
 * Reference detectors that prove the benchmark discriminates: an "oracle" that reads the ground
 * truth of rendered frames (optionally degraded by noise, bias, a numbering error, drop-outs or
 * false positives) and a "null" detector that never finds anything.
 */
import { boardEdgeY, controlPlanePoints, createRng, homographyFromPoints, makePose, multiply, neckModel, poseControlPoints, renumberPose, stringSpacingAt } from '../geometry';
import type { DetectOptions, DetectionResult, Detector, Frame, FretboardPose, Mat3 } from '../types';
import { truthOf } from './render';

/** Ways to make the oracle imperfect. Everything defaults to "perfect". */
export interface OracleOptions {
  /** Name shown in benchmark tables. */
  name?: string;
  /** Gaussian noise (sigma, pixels) on the four control points of every returned pose. */
  noisePx?: number;
  /** Systematic slide along the neck, in fractions of a fret cell (0.3 = every wire 30% of a cell toward the bridge). */
  fretShift?: number;
  /** Systematic shift across the neck, in string spacings. */
  stringShift?: number;
  /** Whole-fret numbering error (2 = calls fret 5 "fret 7"). */
  numberingOffset?: number;
  /** Claimed numbering confidence when `numberingOffset` is not 0 (default 1: confidently wrong). */
  numberingConfidence?: number;
  /** Probability of returning null on a frame that does contain a guitar. */
  dropRate?: number;
  /** Probability of inventing a pose on a frame without a guitar. */
  falsePositiveRate?: number;
  /** Report the neck reversed (nut and 12th fret swapped). */
  reversed?: boolean;
  /** Keep reporting a pose while the board is fully occluded (default false: return null). */
  seeThroughOcclusion?: boolean;
  /** Fit with the preset neck model given in the hints instead of the scene's true dimensions. */
  usePresetModel?: boolean;
  /** Seed of the oracle's own randomness. */
  seed?: number;
}

function gauss(rng: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

/** A detector that cheats: it looks up the ground truth of frames made by `renderScene`. */
export function createOracleDetector(options: OracleOptions = {}): Detector {
  const rng = createRng(options.seed ?? 12345);
  const perfect = !options.noisePx && !options.fretShift && !options.stringShift && !options.numberingOffset && !options.reversed;

  const answer = (frame: Frame, hints: DetectOptions | undefined, tracked: boolean): DetectionResult => {
    const t0 = performance.now();
    const done = (pose: FretboardPose | null, reason?: string): DetectionResult => ({ pose, diagnostics: { timings: { total: performance.now() - t0 }, reason } });
    const truth = truthOf(frame);
    if (!truth) return done(null, 'unknown-frame');
    if (!truth.pose) {
      if (options.falsePositiveRate && rng() < options.falsePositiveRate) {
        // A made-up pose somewhere in the frame.
        const model = neckModel('steel');
        const s = frame.width / 900;
        const H: Mat3 = [-s, 0, frame.width * 0.85, 0, s, frame.height * 0.45, 0, 0, 1];
        return done(makePose(H, model, frame.width, frame.height, { confidence: 0.6, numbering: 'assumed', numberingConfidence: 0.2 }), 'false-positive');
      }
      return done(null, 'no-guitar');
    }
    if (truth.occluded && !options.seeThroughOcclusion) return done(null, 'occluded');
    if (options.dropRate && rng() < options.dropRate) return done(null, 'dropped');
    let pose: FretboardPose = { ...truth.pose, numbering: tracked ? 'tracked' : truth.nutVisible ? 'nut' : 'inlays' };
    if (perfect && !options.usePresetModel) return done(pose);
    const m = pose.model;
    let H = pose.H;
    if (options.fretShift) {
      // Cells are proportional to (L - x), so a uniform stretch about the saddle slides every wire by the same fraction of its cell.
      const k = options.fretShift * (Math.pow(2, 1 / 12) - 1);
      H = multiply(H, [1 - k, 0, k * m.scaleLength, 0, 1, 0, 0, 0, 1]);
    }
    if (options.stringShift) H = multiply(H, [1, 0, 0, 0, 1, options.stringShift * stringSpacingAt(m, m.scaleLength / 4), 0, 0, 1]);
    if (options.reversed) H = multiply(H, [-1, 0, m.scaleLength / 2, 0, 1, 0, 0, 0, 1]);
    pose = { ...pose, H };
    if (options.usePresetModel && hints?.model !== undefined) {
      // Refit the same image corners (nut and 12th fret) with the preset dimensions.
      const preset = neckModel(hints.model);
      const x12 = m.scaleLength / 2;
      const corners = [
        { x: 0, y: boardEdgeY(m, 0, 'bass') },
        { x: 0, y: boardEdgeY(m, 0, 'treble') },
        { x: x12, y: boardEdgeY(m, x12, 'treble') },
        { x: x12, y: boardEdgeY(m, x12, 'bass') },
      ].map((p) => ({ x: (H[0] * p.x + H[1] * p.y + H[2]) / (H[6] * p.x + H[7] * p.y + H[8]), y: (H[3] * p.x + H[4] * p.y + H[5]) / (H[6] * p.x + H[7] * p.y + H[8]) }));
      const refit = homographyFromPoints(controlPlanePoints(preset), corners);
      if (refit) pose = makePose(refit, preset, frame.width, frame.height, { ...pose });
    }
    if (options.noisePx) {
      const pts = poseControlPoints(pose).map((p) => ({ x: p.x + (options.noisePx as number) * gauss(rng), y: p.y + (options.noisePx as number) * gauss(rng) }));
      const noisy = homographyFromPoints(controlPlanePoints(pose.model), pts);
      if (noisy) pose = { ...pose, H: noisy };
    }
    if (options.numberingOffset) {
      // Renumbering by +k makes the wire that was n read n + k: exactly the mistake we want to simulate.
      pose = renumberPose(pose, options.numberingOffset, 'assumed', options.numberingConfidence ?? 1);
    }
    return done(pose);
  };

  return {
    name: options.name ?? (perfect ? 'oracle' : 'oracle (degraded)'),
    detect: (frame, hints) => answer(frame, hints, false),
    track: (frame, _previous, hints) => answer(frame, hints, true),
  };
}

/** A detector that never finds a guitar. Scores 0 on every positive metric and 0% false positives. */
export function createNullDetector(): Detector {
  const result = (): DetectionResult => ({ pose: null, diagnostics: { timings: { total: 0 }, reason: 'null-detector' } });
  return { name: 'null', detect: result, track: result };
}

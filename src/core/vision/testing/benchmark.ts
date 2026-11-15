/**
 * The fretboard-detector benchmark: fixed, seeded scenes in four difficulty tiers, negative frames
 * with no guitar, and tracking sequences, all rendered by `render.ts` with exact ground truth.
 * `runBenchmark(detector, options)` returns structured metrics; `formatBenchmark` prints them.
 * See README.md in this directory for what every number means.
 */
import { comparePoses, percentile, projectMarker, scalePose, type PoseError, type PoseErrorSamples } from '../geometry';
import type { DetectOptions, DetectionResult, Detector, Frame, FretboardPose } from '../types';
import { createRenderCache, renderScene, type FrameStore, type RenderedScene, type SceneTruth } from './render';
import { sampleNegativeScene, sampleScene, type Tier } from './scene';
import { SEQUENCE_NAMES, buildSequence, type SequenceName } from './sequence';

/** The four tiers that make up the headline detection score. */
export const STANDARD_TIERS: readonly Tier[] = ['easy', 'medium', 'hard', 'extreme'];
/** Scenes per tier in a full run (seeds 0 .. n-1). */
export const SCENES_PER_TIER = 24;
/** Negative frames in a full run. */
export const NEGATIVE_FRAMES = 24;
/** A frame counts as correct when at least this fraction of its note markers land in the right cell. */
export const CORRECT_CELL_ACCURACY = 0.9;
/** A pose is "locked" only if its fret wires sit within this fraction of a cell of the true wires (numbering aside). */
export const LOCK_FRET_ERROR = 0.3;

/** What to run. Defaults give the full benchmark. */
export interface BenchmarkOptions {
  /** Tiers to run (default: easy, medium, hard, extreme). Add 'markers' for sticker-anchor mode. */
  tiers?: readonly Tier[];
  /** Scenes per tier (default 24, quick 8). Scene i of a tier is always the same scene. */
  scenesPerTier?: number;
  /** Negative frames (default 24, quick 12, 0 = skip). */
  negatives?: number;
  /** Tracking sequences: true = all, false = none, or a list of names (quick: still, sway, occlusion). */
  sequences?: boolean | readonly SequenceName[];
  /** Frames per sequence (default: the sequence's own length, 30-40). */
  sequenceFrames?: number;
  /** A smaller, faster run for inner-loop work. */
  quick?: boolean;
  /** Shift every scene seed (default 0 = the standard set). Use e.g. 1000 for held-out scenes a detector was not tuned on. */
  seedOffset?: number;
  /** Pass the legitimately known hints (bass side up, mirrored, left-handed, guitar type, stickers) to the detector. Default true. */
  hints?: boolean;
  /** How each sequence starts: 'truth' hands the tracker the true pose of frame 0 (as after calibration); 'detect' makes it find the board itself. Default 'truth'. */
  trackingInit?: 'truth' | 'detect';
  /** Persistent store for rendered frames (see `diskFrameStore`), so repeated runs skip rendering. */
  frames?: FrameStore;
  /** Called after every scored frame, e.g. to dump failures as PNGs. */
  onFrame?: (event: FrameEvent) => void;
}

/** One scored frame, as passed to `BenchmarkOptions.onFrame` and listed in `BenchmarkResult.frames`. */
export interface FrameResult {
  /** Tier name, 'negative', or the sequence name. */
  group: string;
  kind: 'detect' | 'negative' | 'track';
  /** Scene seed (tiers / negatives) or frame index (sequences). */
  index: number;
  description: string;
  /** A pose was returned. */
  detected: boolean;
  /** Pose error against the truth (null when there was no pose or no guitar). */
  error: PoseError | null;
  /** Fraction of markers in the right cell; absolute numbering where the frame allows it, else numbering-agnostic. */
  cellScore: number;
  /** cellScore >= CORRECT_CELL_ACCURACY (and locked, on frames whose numbering cannot be checked). */
  correct: boolean;
  /** Geometrically locked on: right cells up to a whole-fret numbering offset, wires on wires, right way round. */
  aligned: boolean;
  /** Milliseconds spent inside the detector for this frame. */
  ms: number;
  /** The detector threw; treated as "no pose". */
  crashed: boolean;
  /** Confidence fields of the returned pose. */
  confidence: number;
  numberingConfidence: number;
  /** `diagnostics.reason` of the detector, if any. */
  reason?: string;
}

/** A scored frame together with the scene and the raw detector output. */
export interface FrameEvent extends FrameResult {
  scene: RenderedScene;
  result: DetectionResult | null;
}

/** Median and 90th percentile. */
export interface Spread {
  median: number;
  p90: number;
}

/** Detection metrics of one tier. Rates are fractions 0..1. */
export interface TierResult {
  tier: Tier;
  frames: number;
  /** A pose was returned. */
  detectionRate: number;
  /** A pose was returned and is geometrically locked on (numbering aside). */
  lockRate: number;
  /** Markers would be drawn in the right cells (>= 90% of them). The number that matters to a learner. */
  correctRate: number;
  /** Mean fraction of markers in the right cell over ALL frames of the tier (a missed frame scores 0). */
  cellAccuracy: number;
  /** Fret-wire error in fractions of the local fret spacing, numbering offset removed, pooled over detected frames. */
  fretError: Spread;
  /** The same with absolute numbering (a pose one fret off scores about 1.0). */
  fretErrorAbsolute: Spread;
  /** String error in fractions of the local string spacing, pooled over detected frames. */
  stringError: Spread;
  /** Among locked frames whose numbering is observable: fret 5 is called fret 5. NaN when there are none. */
  numberingRate: number;
  /** Share of detected frames that are mis-numbered yet claim numberingConfidence >= 0.5 (dishonest). */
  confidentlyWrong: number;
  /** Among detected frames: nut and bridge the right way round. NaN when nothing was detected. */
  nutDirectionRate: number;
  /** Among detected frames: bass strings on the right side. */
  bassSideRate: number;
  /** Detector time per frame in ms over the 640x360 frames of the tier (all frames if there are none). */
  ms: { median: number; p95: number };
  crashes: number;
}

/** False-positive metrics on frames without a guitar. */
export interface NegativeResult {
  frames: number;
  falsePositives: number;
  falsePositiveRate: number;
  ms: { median: number; p95: number };
  /** Labels of the frames that fooled the detector. */
  fooledBy: string[];
}

/** Tracking metrics of one sequence. */
export interface SequenceResult {
  name: SequenceName;
  description: string;
  frames: number;
  /** Frames that were scored (frame 0 of a truth-initialised run and fully occluded frames are not). */
  evaluable: number;
  /** Fraction of evaluable frames with markers in the right cells. */
  trackingSuccess: number;
  /** Evaluable frames with no pose. */
  lostFrames: number;
  /** Evaluable frames with a pose that is wrong (worse than lost: the overlay lies). */
  driftFrames: number;
  /** Median frame-to-frame marker movement in pixels while the guitar is still. NaN unless the sequence has still frames. */
  jitterPx: number;
  /** Median frame-to-frame change of the marker error in pixels while the guitar moves (overlay wobble). */
  wobblePx: number;
  /** Frames after an occlusion ended until the pose was correct again; NaN if there was no occlusion, Infinity if it never recovered. */
  recoveryFrames: number;
  /** Fraction of fully occluded frames on which a pose was still reported. */
  heldThroughOcclusion: number;
  /** Times `track` gave up and `detect` was called again. */
  redetections: number;
  /** Among locked frames: numbering still right (it must survive the nut leaving the frame). */
  numberingKept: number;
  /** Time per `track` call in ms. */
  ms: { median: number; p95: number };
  crashes: number;
}

/** Everything a benchmark run measured. */
export interface BenchmarkResult {
  detector: string;
  quick: boolean;
  /** The seed offset the run used (0 = the standard scenes). */
  seedOffset: number;
  tiers: TierResult[];
  negatives: NegativeResult | null;
  sequences: SequenceResult[];
  /** 0..100: mean cell accuracy over the standard tiers that were run, scaled by (1 - false positive rate). */
  detectionScore: number;
  /** 0..100: mean tracking success over the sequences that were run. NaN when none were. */
  trackingScore: number;
  /** Milliseconds this machine needs for a fixed reference workload (3x3 Sobel on 640x360); compare runtimes across machines with it. */
  calibrationMs: number;
  /** Total time spent rendering or loading frames, and inside the detector, in ms. */
  renderMs: number;
  detectorMs: number;
  /** Mean milliseconds per call of each stage the detector reported in `diagnostics.timings`, for `detect` and `track`. */
  stageMs: { detect: Record<string, number>; track: Record<string, number> };
  /** Every scored frame. */
  frames: FrameResult[];
}

function spread(values: number[]): Spread {
  return { median: percentile(values, 0.5), p90: percentile(values, 0.9) };
}

function timing(values: number[]): { median: number; p95: number } {
  return { median: percentile(values, 0.5), p95: percentile(values, 0.95) };
}

function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

function validPose(pose: FretboardPose | null | undefined): pose is FretboardPose {
  if (!pose || !pose.H || pose.H.length !== 9 || !pose.model) return false;
  for (let i = 0; i < 9; i++) if (!Number.isFinite(pose.H[i])) return false;
  return true;
}

/** Time of a fixed workload on this machine: a 3x3 Sobel magnitude over a 640x360 byte image (median of 7 runs, ms). */
export function measureCalibration(): number {
  const W = 640;
  const H = 360;
  const src = new Uint8Array(W * H);
  let s = 12345;
  for (let i = 0; i < src.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    src[i] = s >>> 24;
  }
  const dst = new Uint16Array(W * H);
  const times: number[] = [];
  for (let run = 0; run < 9; run++) {
    const t0 = performance.now();
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const gx = src[i - W + 1] + 2 * src[i + 1] + src[i + W + 1] - src[i - W - 1] - 2 * src[i - 1] - src[i + W - 1];
        const gy = src[i + W - 1] + 2 * src[i + W] + src[i + W + 1] - src[i - W - 1] - 2 * src[i - W] - src[i - W + 1];
        dst[i] = (gx < 0 ? -gx : gx) + (gy < 0 ? -gy : gy);
      }
    }
    if (run >= 2) times.push(performance.now() - t0);
  }
  return dst[W + 1] >= 0 ? percentile(times, 0.5) : NaN;
}

interface Call {
  result: DetectionResult | null;
  pose: FretboardPose | null;
  ms: number;
  crashed: boolean;
}

function call(fn: () => DetectionResult, frame: Frame): Call {
  const t0 = performance.now();
  try {
    const result = fn();
    const ms = performance.now() - t0;
    let pose = validPose(result?.pose) ? result.pose : null;
    // A pose reported for a downscaled working frame is brought to the size of the frame under test.
    if (pose && pose.frameWidth > 0 && pose.frameHeight > 0 && (pose.frameWidth !== frame.width || pose.frameHeight !== frame.height)) {
      pose = scalePose(pose, frame.width / pose.frameWidth, frame.height / pose.frameHeight);
    }
    return { result, pose, ms, crashed: false };
  } catch {
    return { result: null, pose: null, ms: performance.now() - t0, crashed: true };
  }
}

function score(c: Call, truth: SceneTruth, absolute: boolean, samples?: PoseErrorSamples): Omit<FrameResult, 'group' | 'kind' | 'index' | 'description'> {
  const base = { ms: c.ms, crashed: c.crashed, confidence: c.pose?.confidence ?? 0, numberingConfidence: c.pose?.numberingConfidence ?? 0, reason: c.result?.diagnostics?.reason };
  if (!truth.pose) {
    // A negative frame: any pose is a false positive.
    return { ...base, detected: c.pose !== null, error: null, cellScore: c.pose ? 0 : 1, correct: c.pose === null, aligned: false };
  }
  if (!c.pose) return { ...base, detected: false, error: null, cellScore: 0, correct: false, aligned: false };
  const error = comparePoses(c.pose, truth.pose, samples);
  // Locked on: right cells up to a whole-fret offset, wires on wires, and the right way round.
  const aligned = error.cellAccuracyAligned >= CORRECT_CELL_ACCURACY && error.fretErrorAligned.median <= LOCK_FRET_ERROR && error.nutDirectionCorrect && error.bassSideCorrect;
  const cellScore = absolute ? error.cellAccuracy : error.cellAccuracyAligned;
  // Where the numbering cannot be checked, "correct" at least demands a proper lock.
  return { ...base, detected: true, error, cellScore, correct: cellScore >= CORRECT_CELL_ACCURACY && (absolute || aligned), aligned };
}

/** Run the benchmark on a detector. Synchronous; a full cold run renders about 400 frames. */
export function runBenchmark(detector: Detector, options: BenchmarkOptions = {}): BenchmarkResult {
  const quick = options.quick ?? false;
  const tiers = options.tiers ?? STANDARD_TIERS;
  const perTier = options.scenesPerTier ?? (quick ? 8 : SCENES_PER_TIER);
  const negativeCount = options.negatives ?? (quick ? 12 : NEGATIVE_FRAMES);
  const sequenceNames: readonly SequenceName[] =
    options.sequences === false ? [] : Array.isArray(options.sequences) ? options.sequences : quick && options.sequences !== true ? ['still', 'sway', 'occlusion'] : SEQUENCE_NAMES;
  const seedOffset = options.seedOffset ?? 0;
  const useHints = options.hints ?? true;
  const init = options.trackingInit ?? 'truth';
  const cache = createRenderCache(options.frames);
  const frames: FrameResult[] = [];
  let renderMs = 0;
  let detectorMs = 0;

  const stageSums = { detect: new Map<string, number>(), track: new Map<string, number>() };
  const stageCalls = { detect: 0, track: 0 };
  const noteStages = (kind: 'detect' | 'track', c: Call): void => {
    const timings = c.result?.diagnostics?.timings;
    if (!timings) return;
    stageCalls[kind]++;
    for (const [stage, ms] of Object.entries(timings)) {
      if (Number.isFinite(ms)) stageSums[kind].set(stage, (stageSums[kind].get(stage) ?? 0) + ms);
    }
  };
  const stageMeans = (kind: 'detect' | 'track'): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [stage, sum] of stageSums[kind]) out[stage] = sum / Math.max(1, stageCalls[kind]);
    return out;
  };
  const render = (spec: Parameters<typeof renderScene>[0]): RenderedScene => {
    const t0 = performance.now();
    const scene = renderScene(spec, cache);
    renderMs += performance.now() - t0;
    return scene;
  };
  const record = (group: string, kind: FrameResult['kind'], index: number, scene: RenderedScene, c: Call, absolute: boolean, samples?: PoseErrorSamples): FrameResult => {
    const fr: FrameResult = { group, kind, index, description: scene.truth.description, ...score(c, scene.truth, absolute, samples) };
    frames.push(fr);
    if (options.onFrame) options.onFrame({ ...fr, scene, result: c.result });
    return fr;
  };

  detector.reset?.();

  // ---- Detection tiers ------------------------------------------------------------------------
  const tierResults: TierResult[] = [];
  for (const tier of tiers) {
    const samples: PoseErrorSamples = { fret: [], fretAligned: [], string: [] };
    const rows: { fr: FrameResult; truth: SceneTruth; frame: Frame }[] = [];
    for (let seed = 0; seed < perTier; seed++) {
      const scene = render(sampleScene(tier, seedOffset + seed));
      detector.reset?.();
      const hints: DetectOptions | undefined = useHints ? scene.truth.hints : undefined;
      const c = call(() => detector.detect(scene.frame, hints), scene.frame);
      detectorMs += c.ms;
      noteStages('detect', c);
      rows.push({ fr: record(tier, 'detect', seed, scene, c, scene.truth.numberingObservable, samples), truth: scene.truth, frame: scene.frame });
    }
    const detected = rows.filter((r) => r.fr.detected);
    const locked = rows.filter((r) => r.fr.aligned);
    const observable = locked.filter((r) => r.truth.numberingObservable);
    const standard = rows.filter((r) => r.frame.width === 640 && r.frame.height === 360);
    tierResults.push({
      tier,
      frames: rows.length,
      detectionRate: detected.length / rows.length,
      lockRate: locked.length / rows.length,
      correctRate: rows.filter((r) => r.fr.correct).length / rows.length,
      cellAccuracy: mean(rows.map((r) => r.fr.cellScore)),
      fretError: spread(samples.fretAligned),
      fretErrorAbsolute: spread(samples.fret),
      stringError: spread(samples.string),
      numberingRate: observable.length > 0 ? observable.filter((r) => r.fr.error?.numberingOffset === 0).length / observable.length : NaN,
      confidentlyWrong: detected.length > 0 ? locked.filter((r) => r.fr.error?.numberingOffset !== 0 && r.fr.numberingConfidence >= 0.5).length / detected.length : 0,
      nutDirectionRate: detected.length > 0 ? detected.filter((r) => r.fr.error?.nutDirectionCorrect).length / detected.length : NaN,
      bassSideRate: detected.length > 0 ? detected.filter((r) => r.fr.error?.bassSideCorrect).length / detected.length : NaN,
      ms: timing((standard.length > 0 ? standard : rows).map((r) => r.fr.ms)),
      crashes: rows.filter((r) => r.fr.crashed).length,
    });
  }

  // ---- Negative frames ------------------------------------------------------------------------
  let negatives: NegativeResult | null = null;
  if (negativeCount > 0) {
    const rows: FrameResult[] = [];
    for (let seed = 0; seed < negativeCount; seed++) {
      const scene = render(sampleNegativeScene(seedOffset + seed));
      detector.reset?.();
      const c = call(() => detector.detect(scene.frame, useHints ? scene.truth.hints : undefined), scene.frame);
      detectorMs += c.ms;
      rows.push(record('negative', 'negative', seed, scene, c, true));
    }
    const fooled = rows.filter((r) => r.detected);
    negatives = { frames: rows.length, falsePositives: fooled.length, falsePositiveRate: fooled.length / rows.length, ms: timing(rows.map((r) => r.ms)), fooledBy: fooled.map((r) => r.description) };
  }

  // ---- Tracking sequences ---------------------------------------------------------------------
  const sequenceResults: SequenceResult[] = [];
  for (const name of sequenceNames) {
    const seq = buildSequence(name, { frames: options.sequenceFrames, seedOffset });
    detector.reset?.();
    let pose: FretboardPose | null = null;
    let lastGood: FretboardPose | null = null;
    let prevEstimate: FretboardPose | null = null;
    let prevTruth: FretboardPose | null = null;
    let redetections = 0;
    let crashes = 0;
    const trackMs: number[] = [];
    const jitter: number[] = [];
    const wobble: number[] = [];
    const rows: { fr: FrameResult; truth: SceneTruth }[] = [];
    let absolute = true;
    for (let i = 0; i < seq.frames.length; i++) {
      const scene = render(seq.frames[i]);
      const truth = scene.truth;
      const hints: DetectOptions = useHints ? { ...truth.hints, timeMs: (i * 1000) / seq.fps } : { timeMs: (i * 1000) / seq.fps };
      let c: Call;
      if (i === 0 && init === 'truth' && truth.pose) {
        // As after assisted calibration: the tracker starts from the true pose with user-confirmed numbering.
        pose = { ...truth.pose, numbering: 'user' };
        lastGood = pose;
        prevEstimate = pose;
        prevTruth = truth.pose;
        continue;
      }
      if (i === 0) absolute = truth.numberingObservable;
      if (pose) {
        const start: FretboardPose = pose;
        c = call(() => detector.track(scene.frame, start, hints), scene.frame);
        trackMs.push(c.ms);
        noteStages('track', c);
        if (!c.pose) {
          // The canonical loop: when tracking gives up, try to find the board again in the same frame.
          const again = call(() => detector.detect(scene.frame, { ...hints, previousPose: start }), scene.frame);
          redetections++;
          c = { ...again, ms: c.ms + again.ms, crashed: c.crashed || again.crashed };
        }
      } else {
        const stale = lastGood;
        c = call(() => detector.detect(scene.frame, stale ? { ...hints, previousPose: stale } : hints), scene.frame);
      }
      detectorMs += c.ms;
      if (c.crashed) crashes++;
      pose = c.pose;
      if (pose) lastGood = pose;
      const fr = record(name, 'track', i, scene, c, absolute);
      rows.push({ fr, truth });
      // Frame-to-frame steadiness of the overlay, measured on the note markers of the visible frets.
      if (pose && prevEstimate && truth.pose && prevTruth && !truth.occluded && fr.correct) {
        const moved = markerMotion(pose, prevEstimate, truth.pose, prevTruth);
        if (Number.isFinite(moved.raw)) {
          if (seq.still[i]) jitter.push(moved.raw);
          else wobble.push(moved.relative);
        }
      }
      prevEstimate = pose;
      prevTruth = truth.pose;
    }
    const evaluable = rows.filter((r) => !r.truth.occluded);
    const occludedRows = rows.filter((r) => r.truth.occluded);
    // Recovery: frames from the end of the last occluded frame to the first correct one.
    let recovery = NaN;
    let lastOccluded = -1;
    rows.forEach((r, k) => {
      if (r.truth.occluded) lastOccluded = k;
    });
    if (lastOccluded >= 0) {
      recovery = Infinity;
      for (let k = lastOccluded + 1; k < rows.length; k++) {
        if (rows[k].fr.correct) {
          recovery = k - lastOccluded - 1;
          break;
        }
      }
    }
    const lockedRows = evaluable.filter((r) => r.fr.aligned);
    sequenceResults.push({
      name,
      description: seq.description,
      frames: seq.frames.length,
      evaluable: evaluable.length,
      trackingSuccess: evaluable.length > 0 ? evaluable.filter((r) => r.fr.correct).length / evaluable.length : NaN,
      lostFrames: evaluable.filter((r) => !r.fr.detected).length,
      driftFrames: evaluable.filter((r) => r.fr.detected && !r.fr.correct).length,
      jitterPx: percentile(jitter, 0.5),
      wobblePx: percentile(wobble, 0.5),
      recoveryFrames: recovery,
      heldThroughOcclusion: occludedRows.length > 0 ? occludedRows.filter((r) => r.fr.detected).length / occludedRows.length : NaN,
      redetections,
      numberingKept: lockedRows.length > 0 ? lockedRows.filter((r) => r.fr.error?.numberingOffset === 0).length / lockedRows.length : NaN,
      ms: timing(trackMs),
      crashes,
    });
  }

  const standardRun = tierResults.filter((t) => STANDARD_TIERS.includes(t.tier));
  const scored = standardRun.length > 0 ? standardRun : tierResults;
  const fpr = negatives ? negatives.falsePositiveRate : 0;
  return {
    detector: detector.name,
    quick,
    seedOffset,
    tiers: tierResults,
    negatives,
    sequences: sequenceResults,
    detectionScore: scored.length > 0 ? 100 * mean(scored.map((t) => t.cellAccuracy)) * (1 - fpr) : NaN,
    trackingScore: sequenceResults.length > 0 ? 100 * mean(sequenceResults.map((s) => (Number.isFinite(s.trackingSuccess) ? s.trackingSuccess : 0))) : NaN,
    calibrationMs: measureCalibration(),
    renderMs,
    detectorMs,
    stageMs: { detect: stageMeans('detect'), track: stageMeans('track') },
    frames,
  };
}

/** RMS marker movement between two frames: raw, and relative to how the true markers moved. */
function markerMotion(now: FretboardPose, before: FretboardPose, truthNow: FretboardPose, truthBefore: FretboardPose): { raw: number; relative: number } {
  const vis = truthNow.visibleFrets;
  let raw = 0;
  let rel = 0;
  let n = 0;
  for (let f = Math.max(1, vis.min + 1); f <= vis.max; f++) {
    for (const s of [1, truthNow.model.stringCount]) {
      const a = projectMarker(now, s, f);
      const b = projectMarker(before, s, f);
      const ta = projectMarker(truthNow, s, f);
      const tb = projectMarker(truthBefore, s, f);
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const ex = dx - (ta.x - tb.x);
      const ey = dy - (ta.y - tb.y);
      if (!Number.isFinite(dx + dy + ex + ey)) continue;
      raw += dx * dx + dy * dy;
      rel += ex * ex + ey * ey;
      n++;
    }
  }
  return n > 0 ? { raw: Math.sqrt(raw / n), relative: Math.sqrt(rel / n) } : { raw: NaN, relative: NaN };
}

// ---------------------------------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------------------------------

function pct(v: number): string {
  return Number.isFinite(v) ? `${(v * 100).toFixed(0)}%` : '-';
}

function num(v: number, digits = 2): string {
  if (Number.isNaN(v)) return '-';
  if (!Number.isFinite(v)) return 'inf';
  return v.toFixed(digits);
}

function table(header: string[], rows: string[][]): string {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]): string => cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');
  return [line(header), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
}

/** A printable report of a benchmark result. */
export function formatBenchmark(result: BenchmarkResult): string {
  const out: string[] = [];
  out.push(`Fretboard detector benchmark: ${result.detector}${result.quick ? ' (quick run)' : ''}${result.seedOffset ? ` (held-out scenes, seed offset ${result.seedOffset})` : ''}`);
  out.push(`calibration ${num(result.calibrationMs)} ms (3x3 Sobel on 640x360) | render ${(result.renderMs / 1000).toFixed(1)} s | detector ${(result.detectorMs / 1000).toFixed(1)} s`);
  out.push('');
  if (result.tiers.length > 0) {
    out.push('DETECTION (single frames; errors in fractions of the local fret / string spacing)');
    out.push(
      table(
        ['tier', 'n', 'found', 'locked', 'correct', 'cells', 'fret med', 'fret p90', 'str med', 'str p90', 'numbering', 'conf.wrong', 'nut dir', 'ms med', 'ms p95'],
        result.tiers.map((t) => [
          t.tier,
          String(t.frames),
          pct(t.detectionRate),
          pct(t.lockRate),
          pct(t.correctRate),
          pct(t.cellAccuracy),
          num(t.fretError.median, 3),
          num(t.fretError.p90, 3),
          num(t.stringError.median, 3),
          num(t.stringError.p90, 3),
          pct(t.numberingRate),
          pct(t.confidentlyWrong),
          pct(t.nutDirectionRate),
          num(t.ms.median, 1),
          num(t.ms.p95, 1),
        ]),
      ),
    );
    out.push('');
  }
  if (result.negatives) {
    const neg = result.negatives;
    out.push(`NEGATIVES (no guitar): ${neg.falsePositives}/${neg.frames} false positives (${pct(neg.falsePositiveRate)}), ${num(neg.ms.median, 1)} ms median`);
    for (const d of neg.fooledBy.slice(0, 8)) out.push(`  fooled by: ${d}`);
    out.push('');
  }
  if (result.sequences.length > 0) {
    out.push('TRACKING (sequences at 30 fps; jitter / wobble in pixels at 640x360; recovery in frames)');
    out.push(
      table(
        ['sequence', 'n', 'success', 'lost', 'drift', 'jitter', 'wobble', 'recovery', 'held', 'redetect', 'numbering', 'ms med', 'ms p95'],
        result.sequences.map((s) => [
          s.name,
          String(s.evaluable),
          pct(s.trackingSuccess),
          String(s.lostFrames),
          String(s.driftFrames),
          num(s.jitterPx),
          num(s.wobblePx),
          num(s.recoveryFrames, 0),
          pct(s.heldThroughOcclusion),
          String(s.redetections),
          pct(s.numberingKept),
          num(s.ms.median, 1),
          num(s.ms.p95, 1),
        ]),
      ),
    );
    out.push('');
  }
  for (const kind of ['detect', 'track'] as const) {
    const stages = Object.entries(result.stageMs[kind]).sort((a, b) => b[1] - a[1]);
    if (stages.length > 1) out.push(`${kind} stages, mean ms per call: ${stages.map(([k, v]) => `${k} ${num(v, 1)}`).join(', ')}`);
  }
  const crashes = result.tiers.reduce((a, t) => a + t.crashes, 0) + result.sequences.reduce((a, s) => a + s.crashes, 0);
  if (crashes > 0) out.push(`WARNING: the detector threw ${crashes} time(s); each was counted as "no pose".`);
  out.push(`SCORE  detection ${num(result.detectionScore, 1)} / 100   tracking ${num(result.trackingScore, 1)} / 100`);
  return out.join('\n');
}

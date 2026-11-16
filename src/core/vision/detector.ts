/**
 * The production fretboard detector: both approaches behind one `Detector`.
 *
 *   lines/  proposes boards bottom-up (Hough lines -> band -> fret comb) and owns the precise
 *           refinement on fret and string ridges;
 *   align/  proposes boards top-down (ridge vote -> comb -> edges -> 8-parameter alignment) and owns
 *           an independent score of how well a pose explains the image.
 *
 * Every candidate, whoever proposed it, is polished by the line refinement and scored by the
 * alignment score, so candidates are compared on the same evidence (`boardEvidence`). A board is
 * reported when both searches agree, or when one candidate's evidence is strong on its own; the
 * two numbering readers vote on the fret numbers.
 *
 * Tracking runs both trackers from the previous pose. The line tracker's pose is kept unless the
 * other is clearly better backed, or the board's own coarse motion (`flow.ts`, independent of both)
 * shows that the line tracker slipped: by whole frets (motion blur; a slip stays on wires, so the
 * evidence cannot see it) or otherwise (perspective bent under a hand). When neither holds the
 * board, the flow carries the pose through motion blur for a while ("coasting"). Fret numbers that
 * are not certain are re-read off the image and voted on while tracking. README.md has the
 * measurements behind each rule.
 */
import { createAlignDetector, type AlignDetector, type AlignView } from './align/detector';
import type { NumberingDecision } from './align/numbering';
import type { PoseScore } from './align/score';
import { boardProfiles, boardShift, type BoardProfiles } from './flow';
import { applyHomography, boardOutline, comparePoses, computeVisibleFrets, confirmFretAt, fretAtX, fretSpacingPx, fretX, invertHomography, makePose, multiply, neckModel, poseDistancePx, renumberPose } from './geometry';
import { carryNumbering, createLineDetector, lineConfidence, type LineDetector, type LineLimits, type LineView } from './lines/detector';
import { resolveMarkers } from './lines/markers';
import { resolveNumbering as resolveLineNumbering, type NumberingResult } from './lines/numbering';
import { refinePose, type RefineResult } from './lines/refine';
import type { DetectOptions, DetectionResult, Detector, DiagnosticFeature, Frame, FretboardPose, Mat3, NeckModel, NumberingSource, Rect } from './types';

/** One board hypothesis with the evidence of both approaches. */
export interface BoardCandidate {
  /** Which search (or tracker) proposed it. */
  source: 'lines' | 'align';
  /** Homography neck mm -> frame pixels. */
  H: Mat3;
  /** Line evidence (fret comb, strings, edges) of the pose after the line refinement. */
  refine: RefineResult;
  /** Alignment score of the pose. */
  score: PoseScore;
  polarity: 1 | -1;
  /** Rigidity residual of the pose under its most favourable numbering, and the wire-length trend against it (see align/). */
  rigidity: number;
  lengthTrend: number;
  /** Log-odds that this is the board (see `boardEvidence`). */
  evidence: number;
  /** How far the line refinement moved an alignment candidate across the neck, in string spacings. */
  movedStrings: number;
}

/** Everything `inspect` found in a frame. */
export interface Inspection {
  model: NeckModel;
  /** At most one candidate per search, lines first. */
  candidates: BoardCandidate[];
  /** Numbering read by each approach off each candidate (same order). */
  numbering: { lines: NumberingResult; align: NumberingDecision }[];
  /** The two candidates put their markers in the same cells (numbering aside). */
  agree: boolean;
  /** Index of the candidate the detector would report, or -1. */
  chosen: number;
  reason?: string;
  timings: Record<string, number>;
  stats: Record<string, number>;
}

/** Tunables of the production detector. The defaults are what the benchmark numbers were measured with. */
export interface FretboardDetectorOptions {
  /** Log-odds a candidate needs when the other search found nothing or something else (default 1). */
  minEvidence?: number;
  /** ... when only the top-down search found anything at all (default 1.5: its false positives on striped clutter score up to about 1). */
  minAlignOnlyEvidence?: number;
  /** ... and its lead over the other candidate when the two disagree (default 1). */
  minMargin?: number;
  /** Log-odds the better of two agreeing candidates needs (default -1: agreement is evidence in itself). */
  minAgreedEvidence?: number;
  /** A line candidate at least this strong is reported without running the second search (default 3). */
  fastEvidence?: number;
  /** Tracking: log-odds below which a tracked pose counts as lost (default -1.5). */
  minTrackEvidence?: number;
  /** Tracking: how many frames in a row the pose may be carried through motion blur by the board's coarse motion alone (default 20; 0 = never). */
  maxCoastFrames?: number;
  /** Tracking: read the fret numbers off the image every this many frames (default 5; always while they are a guess). */
  readNumberingEvery?: number;
  /** How many board bands the line search examines (default 6) and how many hypotheses the alignment search measures (default 6): fewer is faster on frames without a guitar. */
  lineBands?: number;
  alignCandidates?: number;
  /** Fill `diagnostics.features` (default false). */
  debug?: boolean;
}

/** A board hypothesis from outside (marker mode) after fitting it to the image. */
export interface FittedBoard {
  /** The fitted pose (numbering as the hypothesis had it: 'assumed'). */
  pose: FretboardPose;
  /** Log-odds that this is the board (`boardEvidence`). */
  evidence: number;
  /** Which of the hypotheses it came from. */
  index: number;
}

/** The production detector plus a look at its candidates (for diagnostics and tuning). */
export interface FretboardDetector extends Detector {
  /** Both searches, every candidate polished and scored, and the decision, without building a pose. */
  inspect(frame: Frame, options?: DetectOptions): Inspection;
  /**
   * Fit outside board hypotheses (homographies neck mm -> frame pixels, e.g. from two colour
   * markers) to the wires and strings in the frame, and score them like any candidate. The best fit,
   * or null when none of them finds a board. Fret numbers stay those of the hypothesis.
   */
  fit(frame: Frame, hypotheses: readonly Mat3[], options?: DetectOptions): FittedBoard | null;
}

/** Limits under which the line search proposes: looser than its stand-alone thresholds, because a second opinion follows. */
const LINE_PROPOSAL_LIMITS: LineLimits = { minFrets: 5, minSupport: 0.4, minStringsLooked: 12, minStringSupport: 0.25, minJointSupport: 0.15, minConfidence: 0.2 };

/**
 * Weights of the evidence score: a logistic regression over twelve measurements of a candidate,
 * fitted on the candidates of 600 benchmark scenes (seed offsets 0-4000, good = geometrically
 * locked on) with strong regularisation; every sign is the physically sensible one.
 */
const EVIDENCE = {
  bias: -1.486,
  /** Line evidence: confidence of the fret comb, strings found (and how many were looked for), wires in the gaps, wire ends off the edges, fit residual. */
  lineConfidence: 2.373,
  stringSupport: 2.829,
  stringsLooked: 1.581,
  antiSupport: -5.869,
  edgeError: -5.182,
  residualPx: -1.359,
  /** Alignment evidence: fit quality, sideways imbalance of the wire ends, wires running on past the edges, fat wires. */
  quality: 2.065,
  lateral: -1.474,
  overrun: -4.232,
  thickness: -2.299,
  /** Could a camera have seen this: rigidity residual and wire-length trend. */
  rigidity: -4.429,
  lengthTrend: -2.698,
};

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Log-odds that a pose is the fretboard, from the evidence both approaches measure on it. About 0
 * is a coin toss, 3 is 95%. Positive terms: the fret comb, the strings, the alignment quality.
 * Negative terms: wires between wires, wire ends off the edges, a loose fit, lop-sided or
 * over-running or fat wires, a view no camera could have had.
 */
export function boardEvidence(refine: RefineResult, score: PoseScore, rigidity: number, lengthTrend: number): number {
  const w = EVIDENCE;
  return (
    w.bias +
    w.lineConfidence * lineConfidence(refine) +
    w.stringSupport * refine.stringSupport +
    w.stringsLooked * Math.min(1, refine.stringsLooked / 60) +
    w.antiSupport * refine.antiSupport +
    w.edgeError * finiteOr(refine.edgeError, 0.4) +
    w.residualPx * Math.min(3, finiteOr(refine.residualPx, 3)) +
    w.quality * score.quality +
    w.lateral * Math.min(1.5, Math.abs(finiteOr(score.lateral, 0))) +
    w.overrun * score.overrun +
    w.thickness * finiteOr(score.thickness, 0.15) +
    w.rigidity * Math.min(1, finiteOr(rigidity, 1)) +
    w.lengthTrend * Math.min(1, Math.abs(finiteOr(lengthTrend, 0.2)))
  );
}

/** A fret-numbering reading: add `delta` to every fret number, on the strength of `source`. */
export interface NumberingReading {
  delta: number;
  source: NumberingSource;
  confidence: number;
}

/**
 * Combine the two numbering readers. When they agree the reading is firmer than either; when they
 * disagree the surer one wins but is trusted less, by how sure the other was.
 */
export function fuseNumbering(a: NumberingReading, b: NumberingReading): NumberingReading {
  const hi = a.confidence >= b.confidence ? a : b;
  const lo = hi === a ? b : a;
  if (a.delta === b.delta) {
    const source = hi.source !== 'assumed' ? hi.source : lo.source;
    return { delta: hi.delta, source, confidence: Math.min(1, hi.confidence + (lo.confidence >= 0.3 ? 0.2 : 0)) };
  }
  const confidence = Math.max(0.1, hi.confidence - 0.6 * lo.confidence);
  return { delta: hi.delta, source: confidence >= 0.35 ? hi.source : 'assumed', confidence };
}

/** Tracking: frames for which a new or changed numbering is re-read on every frame, and after which it may become the anchor. */
const PROBATION_FRAMES = 8;
/** Tracking: evidence above which a pose both trackers agree on is taken without a second look. */
const SETTLED_EVIDENCE = 2.5;
/** Lowest correlation of the board's brightness profiles between two frames at which its motion is believed (an occluder sweeping past scores far lower). */
const COAST_MIN_PEAK = 0.8;
/** After this long without a pose, a numbering carried over by nearness alone is only a guess (ms). */
const NEAR_CARRY_MS = 150;
/** Tracking: the two trackers agree when this share of markers fall in the same cells (and no whole-fret shift). */
const TRACK_AGREEMENT = 0.95;
/** A tracker is overruled by the flow when its markers are this many times (plus this many pixels) farther from the flow's pose than the other's. */
const REFEREE_RATIO = 2;
const REFEREE_PX = 1.5;
/** Flow good enough to referee a whole-fret slip: correlation peak, and its lead over the best peak elsewhere. */
const SLIP_MIN_PEAK = 0.85;
const SLIP_MIN_MARGIN = 0.1;
/** A difference between two poses counts as a clean whole-fret slip when the wires coincide within this fraction of a fret. */
const SLIP_MAX_RESIDUAL = 0.3;
/** Confidence reported for a pose that is only being carried along (the overlay may want to fade). */
const COAST_CONFIDENCE = 0.3;
/** How long a trusted pose keeps lending its fret numbers after the board was lost, in milliseconds. */
const ANCHOR_LIFE_MS = 3000;
/**
 * A tracked pose that moved more than this many fret cells since the last frame, and more than
 * `JUMP_RATIO` times what the track's usual speed covers in that time, jumped (a cut, the camera
 * knocked, the trackers latching onto wires of another board): its numbers were carried by
 * nearness over more than half a fret, so they are a guess and are read off the image again. A
 * swaying neck moves 0.05-0.2 cells a frame at 30 fps; a cut on the alt bench measured 0.9.
 */
const JUMP_CELLS = 0.5;
const JUMP_RATIO = 4;
/** Smoothing of the track's usual speed (fret cells per ms), per frame. */
const MOTION_RATE = 0.2;
/** Confidence of numbers carried across a jump until the image confirms them (below 0.5: a guess). */
const JUMP_GUESS = 0.45;

function scaleH(H: Mat3, sx: number, sy: number): Mat3 {
  return [H[0] * sx, H[1] * sx, H[2] * sx, H[3] * sy, H[4] * sy, H[5] * sy, H[6], H[7], H[8]];
}

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** The fret numbers of a pose are a guess. */
function guessingNow(pose: FretboardPose): boolean {
  return pose.numberingConfidence < 0.5;
}

/** The fret numbers of a pose rest on something (the nut, inlays, stickers, the user), not on a guess. */
function numbered(pose: FretboardPose): boolean {
  return pose.numbering !== 'assumed' && pose.numberingConfidence >= 0.5;
}

/** The part of a frame a tracker reads when the board was at `pose` a frame ago: its outline with room for a fast move. */
function trackingRegion(pose: FretboardPose, frame: Frame): Rect | undefined {
  const sx = frame.width / pose.frameWidth;
  const sy = frame.height / pose.frameHeight;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of boardOutline(pose, { min: -1, max: pose.model.fretCount + 1 })) {
    if (!Number.isFinite(p.x + p.y)) return undefined;
    x0 = Math.min(x0, p.x * sx);
    x1 = Math.max(x1, p.x * sx);
    y0 = Math.min(y0, p.y * sy);
    y1 = Math.max(y1, p.y * sy);
  }
  const margin = 0.12 * frame.width;
  x0 = Math.max(0, x0 - margin);
  y0 = Math.max(0, y0 - margin);
  x1 = Math.min(frame.width, x1 + margin);
  y1 = Math.min(frame.height, y1 + margin);
  return x1 - x0 >= 32 && y1 - y0 >= 32 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : undefined;
}

/** The two poses would draw their markers in the same cells, whatever each calls the frets. */
function sameCells(a: Mat3, b: Mat3, model: NeckModel, width: number, height: number, min = 0.8): boolean {
  const pa = makePose(a, model, width, height);
  const pb = makePose(b, model, width, height);
  return Math.min(comparePoses(pa, pb).cellAccuracyAligned, comparePoses(pb, pa).cellAccuracyAligned) >= min;
}

/**
 * Whole-fret renumbering that makes pose `a` call the wires what pose `b` calls them (`renumberPose(a, delta)`),
 * and how far the wires of the two miss each other once it is applied (fraction of a fret; 0 = exactly
 * on whole frets). Measured on the centre line over the frets `b` shows. Null when they cannot be compared.
 */
export function wholeFretShift(a: Mat3, b: Mat3, model: NeckModel, width: number, height: number): { delta: number; residual: number } | null {
  const inv = invertHomography(b);
  if (!inv) return null;
  const vis = computeVisibleFrets(b, model, width, height);
  if (vis.max - vis.min < 2) return null;
  const yc = model.nutWidth / 2;
  const d: number[] = [];
  for (let n = Math.max(1, vis.min); n <= vis.max; n++) {
    const p = applyHomography(a, fretX(model, n), yc);
    const q = applyHomography(inv, p.x, p.y);
    const m = fretAtX(model, q.x);
    if (Number.isFinite(m)) d.push(m - n);
  }
  if (d.length < 2) return null;
  d.sort((x, y) => x - y);
  const median = d[d.length >> 1];
  const delta = Math.round(median);
  return { delta, residual: Math.abs(median - delta) };
}

/** Create the production fretboard detector. One instance per camera stream. */
export function createFretboardDetector(options: FretboardDetectorOptions = {}): FretboardDetector {
  const minEvidence = options.minEvidence ?? 1;
  const minAlignOnly = options.minAlignOnlyEvidence ?? 1.5;
  const minMargin = options.minMargin ?? 1;
  const minAgreedEvidence = options.minAgreedEvidence ?? -1;
  const fastEvidence = options.fastEvidence ?? 3;
  const minTrackEvidence = options.minTrackEvidence ?? -1.5;
  const debug = options.debug ?? false;
  const readEvery = Math.max(1, options.readNumberingEvery ?? 5);
  const maxCoastFrames = options.maxCoastFrames ?? 20;
  const lines: LineDetector = createLineDetector({ debug, maxBands: options.lineBands ?? 6 });
  // The alignment tracker's own periodic re-detection and still-frame blending are switched off:
  // cross-checking happens here and smoothing in `FretboardTracker`.
  const align: AlignDetector = createAlignDetector({ debugFeatures: false, verifyInterval: 0, stillSmoothing: 0, maxCandidates: options.alignCandidates ?? 6 });
  /** The most recent pose whose fret numbers could be trusted, for carrying them across a loss. */
  let anchor: { pose: FretboardPose; time: number } | null = null;
  let clock = 0;
  let tracked = 0;
  /** Homography of the pose handed out last: a `track` call that starts from it continues the same track. */
  let lastOut: Mat3 | null = null;
  /** Evidence gathered along the current track for whole-fret shifts of its numbering (0 = it is right as it stands). */
  const votes = new Map<number, number>();
  /** Consecutive frames the numbering of the current track has stood unchanged. */
  let settled = 0;
  /** When the current track began (a detection, or a pose handed in from outside). */
  let trackStart = 0;
  /** Brightness profiles of the board in the last frame, through the pose handed out for it (working pixels of the line view). */
  let flowFrom: { profiles: BoardProfiles; H: Mat3; width: number } | null = null;
  /** Consecutive frames the pose has been carried by the flow alone. */
  let coasting = 0;
  /** Usual speed of the tracked board, fret cells per ms (what a jump is measured against). */
  let motion = 0;
  /** The move `jumpOf` measured last: speed in fret cells per ms, and the fret cell in pixels. */
  let lastMove = { speed: 0, cell: 1 };

  /** Polished line pose (working pixels of the line view) -> candidate with the evidence of both approaches. */
  const describe = (source: 'lines' | 'align', Hline: Mat3, refine: RefineResult, lv: LineView, av: AlignView, model: NeckModel, polarity: 1 | -1, movedStrings = 0): BoardCandidate => {
    const H = scaleH(Hline, lv.factor, lv.factor);
    const Halign = scaleH(H, av.scaleX, av.scaleY);
    const scored = align.score(av, Halign, model, polarity);
    const plausible = align.plausibility(av, Halign, model, polarity, scored.score);
    return { source, H, refine, score: scored.score, polarity, rigidity: plausible.rigidity, lengthTrend: plausible.lengthTrend, evidence: boardEvidence(refine, scored.score, plausible.rigidity, plausible.lengthTrend), movedStrings };
  };

  /** An alignment hypothesis (working pixels of the alignment view), polished by the line refinement. */
  const polish = (Halign: Mat3, polarity: 1 | -1, lv: LineView, av: AlignView, model: NeckModel, tracking: boolean): BoardCandidate | null => {
    const Hline = scaleH(Halign, 1 / (av.scaleX * lv.factor), 1 / (av.scaleY * lv.factor));
    const polished = tracking
      ? refinePose(lv.img, Hline, model, { polarity, windows: [0.2, 0.14], priorWeight: 0.6 })
      : refinePose(lv.img, Hline, model, { polarity, windows: [0.2, 0.14], evidence: true, fromFret: -6 });
    if (!polished) return null;
    const moved = comparePoses({ H: polished.H, model }, makePose(Hline, model, lv.img.width, lv.img.height)).stringError.median;
    return describe('align', polished.H, polished, lv, av, model, polarity, moved);
  };

  const numberingOf = (c: BoardCandidate, av: AlignView, model: NeckModel): { lines: NumberingResult; align: NumberingDecision } => ({
    lines: resolveLineNumbering(c.refine.frets ?? [], c.refine.cells ?? [], { fretCount: model.fretCount, polarity: c.refine.polarity, strength: c.refine.strength }),
    align: align.numbering(av, scaleH(c.H, av.scaleX, av.scaleY), model, c.polarity, c.score),
  });

  /** What a search found; the numbering is read afterwards, only for the candidates that need it. */
  interface Search extends Omit<Inspection, 'numbering'> {
    lv: LineView;
    av: AlignView;
    features?: DiagnosticFeature[];
  }

  const search = (frame: Frame, opts: DetectOptions, model: NeckModel, exhaustive: boolean): Search => {
    const timings: Record<string, number> = {};
    const stats: Record<string, number> = {};
    const features: DiagnosticFeature[] | undefined = debug ? [] : undefined;
    const t0 = performance.now();
    const lv = lines.prepare(frame);
    const av = align.prepare(frame);
    let t1 = performance.now();
    timings.prepare = t1 - t0;
    const candidates: BoardCandidate[] = [];
    let reason: string | undefined;

    // Bottom-up first: it is the cheaper search and the more precise one across the neck.
    const a = lines.propose(lv, model, opts, LINE_PROPOSAL_LIMITS, { timings: {}, stats, features });
    if (a.best) candidates.push(describe('lines', a.best.H, a.best.refine, lv, av, model, a.best.refine.polarity));
    let t2 = performance.now();
    timings.lines = t2 - t1;
    t1 = t2;
    const first: BoardCandidate | undefined = candidates[0];
    if (first) stats.lineEvidence = first.evidence;
    let agree = false;
    let chosen = -1;
    if (first && first.evidence >= fastEvidence && !exhaustive) {
      chosen = 0;
      stats.fast = 1;
    } else {
      // Top-down second: a different route to the same board, or to the board the first search missed.
      const b = align.propose(av, model, opts, { timings: {}, stats: {} });
      t2 = performance.now();
      timings.align = t2 - t1;
      t1 = t2;
      const second = b.hypothesis ? polish(b.hypothesis.H, b.hypothesis.polarity, lv, av, model, false) : null;
      timings.polish = performance.now() - t1;
      if (second) {
        candidates.push(second);
        stats.alignEvidence = second.evidence;
      }
      if (first && second) {
        agree = sameCells(first.H, second.H, model, frame.width, frame.height);
        stats.agree = agree ? 1 : 0;
        const better = first.evidence >= second.evidence - (agree ? 0.5 : 0) ? 0 : 1;
        const lead = Math.abs(first.evidence - second.evidence);
        if (agree) {
          if (Math.max(first.evidence, second.evidence) >= minAgreedEvidence) chosen = better;
          else reason = 'agreed-but-weak';
        } else if (candidates[better].evidence >= minEvidence && lead >= minMargin) chosen = better;
        else reason = candidates[better].evidence >= minEvidence ? 'two-boards' : 'weak-evidence';
      } else if (candidates.length === 1) {
        if (candidates[0].evidence >= (candidates[0].source === 'align' ? minAlignOnly : minEvidence)) chosen = 0;
        else reason = 'weak-evidence';
      } else {
        reason = a.reason === 'no-lines' ? 'no-lines' : 'no-candidate';
      }
    }
    timings.total = performance.now() - t0;
    return { model, candidates, agree, chosen, reason, timings, stats, lv, av, features };
  };

  const resolveOptions = (input: DetectOptions): { opts: DetectOptions; model: NeckModel } => {
    const given = input.previousPose;
    // What the caller does not say is taken from the earlier pose, if there is one.
    const opts: DetectOptions = given ? { ...input, mirrored: input.mirrored ?? given.mirrored, leftHanded: input.leftHanded ?? given.leftHanded } : input;
    // Exact dimensions win; otherwise the neck of the earlier pose is still the neck in front of the camera; else the preset.
    const model = typeof opts.model === 'object' ? neckModel(opts.model) : given ? given.model : neckModel(opts.model ?? 'steel');
    return { opts, model };
  };

  const badFrame = (frame: Frame): boolean => !frame || !(frame.width >= 32) || !(frame.height >= 32) || !frame.data || frame.data.length < frame.width * frame.height * 4;

  const stringsLocked = (r: RefineResult): boolean => r.stringsLooked >= 18 && r.stringSupport >= 0.6;

  /** Note a pose that is about to be handed out. */
  const remember = (pose: FretboardPose, time: number, lv: LineView): void => {
    clock = time;
    lastOut = pose.H;
    const Hline = scaleH(pose.H, 1 / lv.factor, 1 / lv.factor);
    const profiles = boardProfiles(lv.img, Hline, pose.model, computeVisibleFrets(Hline, pose.model, lv.img.width, lv.img.height));
    flowFrom = profiles ? { profiles, H: Hline, width: lv.img.width } : null;
    // The anchor is the pose fret numbers are carried from after a loss. It follows the track, but
    // only once the numbering has stood unchallenged for a few frames; numbers that rest on
    // something are not given up for a guess while they are fresh.
    const fresh = anchor !== null && time - anchor.time < ANCHOR_LIFE_MS;
    if (!anchor || !fresh) anchor = { pose, time };
    else if (numbered(pose) && !numbered(anchor.pose)) anchor = { pose, time };
    else if (numbered(pose) === numbered(anchor.pose) && settled >= PROBATION_FRAMES && (!numbered(pose) || pose.numberingConfidence >= 0.9)) anchor = { pose, time };
  };

  /** After the numbering moved by `delta`, every vote refers to a shift that much smaller; old evidence counts for less. */
  const shiftVotes = (delta: number, keep: number): void => {
    const moved = new Map<number, number>();
    for (const [d, score] of votes) moved.set(d - delta, keep * score);
    votes.clear();
    for (const [d, score] of moved) votes.set(d, score);
  };

  const sameH = (a: Mat3, b: Mat3): boolean => {
    for (let i = 0; i < 9; i++) if (Math.abs(a[i] - b[i]) > 1e-9 * (1 + Math.abs(a[i]))) return false;
    return true;
  };

  /**
   * The board jumped between the pose handed out last and this one, `dtMs` earlier (see
   * `JUMP_CELLS`); otherwise the move counts toward the usual motion. The usual motion is a speed,
   * so a busy machine that skips frames (longer gaps, longer moves) does not see jumps in a sway.
   */
  const jumpOf = (before: FretboardPose, after: FretboardPose, dtMs: number): boolean => {
    const vis = after.visibleFrets;
    const mid = vis.max >= vis.min ? Math.max(1, Math.round((vis.min + vis.max) / 2)) : 6;
    const cell = Math.max(1e-6, fretSpacingPx(after, mid));
    const moved = poseDistancePx(before, after) / cell;
    if (!Number.isFinite(moved)) return false;
    const dt = Math.max(1, Math.min(500, Number.isFinite(dtMs) ? dtMs : 33));
    lastMove = { speed: moved / dt, cell };
    if (moved > Math.max(JUMP_CELLS, JUMP_RATIO * motion * dt)) return true;
    motion += MOTION_RATE * (moved / dt - motion);
    return false;
  };

  const detect = (frame: Frame, input: DetectOptions = {}): DetectionResult => {
    const t0 = performance.now();
    if (badFrame(frame)) return { pose: null, diagnostics: { timings: { total: 0 }, reason: 'bad-frame' } };
    const { opts, model } = resolveOptions(input);
    const found = search(frame, opts, model, false);
    const { timings, stats, lv } = found;
    const finish = (pose: FretboardPose | null, reason?: string): DetectionResult => {
      timings.total = performance.now() - t0;
      return { pose, diagnostics: { timings, reason, stats, features: found.features } };
    };
    if (found.chosen < 0) return finish(null, found.reason);
    const t1 = performance.now();
    const best = found.candidates[found.chosen];
    stats.evidence = best.evidence;
    stats.source = best.source === 'lines' ? 0 : 1;

    // Fret numbers: the two readers vote.
    const read = numberingOf(best, found.av, model);
    const reading = fuseNumbering(read.lines, read.align);
    stats.numberingDelta = reading.delta;
    const base = makePose(best.H, model, frame.width, frame.height, {
      confidence: logistic(best.evidence + (found.agree ? 2 : 0)),
      mirrored: opts.mirrored ?? false,
      leftHanded: opts.leftHanded ?? false,
    });
    let pose = renumberPose(base, reading.delta, reading.source, reading.confidence);
    let refined = best.refine;
    if (reading.delta !== 0) {
      // One more polish under the final numbering: the taper of the board (unlike the fret spacing) is not self-similar.
      const again = refinePose(lv.img, scaleH(pose.H, 1 / lv.factor, 1 / lv.factor), model, { polarity: best.refine.polarity, windows: [0.2, 0.15] });
      if (again && again.fretsFound >= 5 && again.support >= 0.9 * best.refine.support) {
        pose = makePose(scaleH(again.H, lv.factor, lv.factor), model, frame.width, frame.height, { confidence: pose.confidence, mirrored: pose.mirrored, leftHanded: pose.leftHanded, numbering: pose.numbering, numberingConfidence: pose.numberingConfidence });
        refined = again;
      }
    }
    // Marker mode: stickers at known frets beat every other cue.
    let marked = false;
    if (opts.markers) {
      const stickers = resolveMarkers(frame, pose.H, model, opts.markers);
      if (stickers) {
        marked = true;
        stats.markerDelta = stickers.delta;
        pose = renumberPose(pose, stickers.delta, 'markers', Math.min(1, 0.6 + stickers.margin));
      }
    }
    // Re-detection after a loss: the earlier numbering is carried over unless this frame itself shows
    // the nut or the inlays convincingly. Only a caller who passes an earlier pose vouches that this
    // is still the same neck in the same view.
    const given = input.previousPose;
    const now = opts.timeMs ?? clock + 33;
    const recent = anchor && now - anchor.time < ANCHOR_LIFE_MS ? anchor.pose : null;
    const earlier = !given ? null : numbered(given) ? given : (recent ?? given);
    if (earlier && !marked) {
      const carried = carryNumbering(pose, earlier, stringsLocked(refined));
      // "Nearest whole fret" is only right while the neck moved less than half a fret since the
      // earlier pose: after a gap (an occlusion) it is a guess, to be confirmed while tracking.
      if (carried && carried.how === 'near' && now - clock > NEAR_CARRY_MS) carried.confidence = Math.min(carried.confidence, 0.45);
      if (carried) {
        stats.carriedDelta = carried.delta;
        const firm = numbered(earlier);
        // Numbers carried by shape can be thrown by a fret when the guitar turned meanwhile, so a nut
        // or an inlay pattern read clearly off this very frame outranks them; when both say the same,
        // all the better. A pose that can only guess keeps whatever the earlier pose called the frets:
        // even a guess should not jump.
        if (carried.delta === 0) {
          if (firm) pose = { ...pose, numbering: pose.numbering === 'assumed' ? 'tracked' : pose.numbering, numberingConfidence: Math.max(pose.numberingConfidence, carried.confidence) };
        } else if (firm ? pose.numberingConfidence < 0.8 : pose.numberingConfidence < 0.5) {
          pose = renumberPose(pose, carried.delta, firm ? 'tracked' : 'assumed', firm ? carried.confidence : Math.min(0.45, earlier.numberingConfidence));
        }
      }
    }
    // A confirmation tap overrides whatever the image suggested.
    if (opts.fretHint) pose = confirmFretAt(pose, opts.fretHint.point, opts.fretHint.fret) ?? pose;
    timings.numbering = performance.now() - t1;
    votes.clear();
    settled = 0;
    coasting = 0;
    trackStart = now;
    remember(pose, now, lv);
    return finish(pose);
  };

  const track = (frame: Frame, previousPose: FretboardPose, input: DetectOptions = {}): DetectionResult => {
    const t0 = performance.now();
    const timings: Record<string, number> = {};
    const stats: Record<string, number> = {};
    const finish = (pose: FretboardPose | null, reason?: string): DetectionResult => {
      timings.total = performance.now() - t0;
      return { pose, diagnostics: { timings, reason, stats } };
    };
    if (badFrame(frame) || !previousPose || !previousPose.H || !(previousPose.frameWidth > 0)) return finish(null, 'bad-input');
    const model = previousPose.model;
    const lv = lines.prepare(frame);
    const av = align.prepare(frame, trackingRegion(previousPose, frame));
    let t1 = performance.now();
    timings.prepare = t1 - t0;
    const continues = lastOut !== null && sameH(lastOut, previousPose.H);

    // How the picture of the board moved since the last frame, wires or no wires (see flow.ts). It is
    // measured independently of both trackers, which makes it the referee when they slip a fret.
    let carried: Mat3 | null = null;
    let flowPose: FretboardPose | null = null;
    if (continues && flowFrom && flowFrom.width === lv.img.width && maxCoastFrames > 0) {
      const profiles = boardProfiles(lv.img, flowFrom.H, model, computeVisibleFrets(flowFrom.H, model, lv.img.width, lv.img.height));
      const shift = profiles ? boardShift(flowFrom.profiles, profiles) : null;
      if (shift) {
        stats.flowPeak = shift.peak;
        stats.flowPx = Math.hypot(shift.dx, shift.dy);
        if (shift.peak >= COAST_MIN_PEAK) carried = multiply(shift.map, flowFrom.H);
        if (carried && shift.peak >= SLIP_MIN_PEAK && shift.peak - shift.second >= SLIP_MIN_MARGIN) flowPose = makePose(scaleH(carried, lv.factor, lv.factor), model, frame.width, frame.height);
      }
    }
    let t2 = performance.now();
    timings.flow = t2 - t1;
    t1 = t2;

    // Both trackers follow the previous pose; each result becomes a candidate with the common evidence.
    const candidates: BoardCandidate[] = [];
    const byLines = lines.track(frame, previousPose, input, lv);
    const lineEvidence = lines.lastTrackEvidence();
    if (byLines.pose && lineEvidence) candidates.push(describe('lines', scaleH(byLines.pose.H, 1 / lv.factor, 1 / lv.factor), lineEvidence, lv, av, model, lineEvidence.polarity));
    t2 = performance.now();
    timings.lines = t2 - t1;
    t1 = t2;
    const byAlign = align.track(frame, previousPose, input, av);
    t2 = performance.now();
    timings.align = t2 - t1;
    t1 = t2;
    let agree = false;
    if (byAlign.pose) {
      // The usual case: both trackers arrive at the same well-backed pose, fret numbers included, and
      // the line tracker's (the more precise across the neck) is kept as it is. A dissenting pose, or
      // a weakly backed consensus (both can slip half a string together), is polished and weighed.
      const alignH = scaleH(byAlign.pose.H, frame.width / byAlign.pose.frameWidth, frame.height / byAlign.pose.frameHeight);
      agree = candidates.length === 1 && candidates[0].evidence >= SETTLED_EVIDENCE && sameCells(candidates[0].H, alignH, model, frame.width, frame.height, TRACK_AGREEMENT) && wholeFretShift(alignH, candidates[0].H, model, frame.width, frame.height)?.delta === 0;
      if (!agree) {
        const polished = polish(scaleH(byAlign.pose.H, av.scaleX, av.scaleY), (byAlign.diagnostics.stats?.polarity ?? 1) > 0 ? 1 : -1, lv, av, model, true);
        if (polished) candidates.push(polished);
      }
    }
    timings.polish = performance.now() - t1;
    // How many whole frets each candidate is off the board's measured motion (0 = no slip).
    const slips = candidates.map((c) => (flowPose ? wholeFretShift(c.H, flowPose.H, model, frame.width, frame.height) : null));
    let best: BoardCandidate | null = candidates[0] ?? null;
    let bestSlip = slips[0] ?? null;
    if (candidates.length === 2) {
      // After the polish the two may agree after all (the line refinement pulled the other onto the same strings).
      const apart = wholeFretShift(candidates[1].H, candidates[0].H, model, frame.width, frame.height);
      agree = sameCells(candidates[0].H, candidates[1].H, model, frame.width, frame.height, TRACK_AGREEMENT) && apart?.delta === 0;
      const fretApart = apart !== null && apart.delta !== 0 && apart.residual < SLIP_MAX_RESIDUAL;
      const clean = (k: number): boolean => slips[k]?.delta === 0 && (slips[k]?.residual ?? 1) < SLIP_MAX_RESIDUAL;
      if (fretApart && clean(1) && !clean(0)) {
        // The trackers are whole frets apart and the board's own motion sides with the second.
        best = candidates[1];
        stats.refereed = 1;
      } else if (candidates[1].evidence > candidates[0].evidence + (agree ? 1.5 : 0.75) && !(fretApart && clean(0))) {
        // The line tracker keeps the pose unless the other is clearly better backed (and did not slip).
        best = candidates[1];
      }
      if (!agree && flowPose && stats.refereed === undefined) {
        // The two disagree in some other way (one bent the perspective under a hand, one slid half a
        // string): the board's measured motion continues the last pose, so it sides with the tracker
        // that did the same.
        const d0 = poseDistancePx({ H: candidates[0].H, model }, flowPose);
        const d1 = poseDistancePx({ H: candidates[1].H, model }, flowPose);
        stats.flowDistLines = d0;
        stats.flowDistAlign = d1;
        if (best === candidates[0] && d0 > REFEREE_RATIO * d1 + REFEREE_PX && candidates[1].evidence >= minTrackEvidence) {
          best = candidates[1];
          stats.refereed = 2;
        } else if (best === candidates[1] && d1 > REFEREE_RATIO * d0 + REFEREE_PX && candidates[0].evidence >= minTrackEvidence) {
          best = candidates[0];
          stats.refereed = 3;
        }
      }
      bestSlip = best === candidates[1] ? slips[1] : slips[0];
    }
    stats.agree = agree ? 1 : 0;
    for (const c of candidates) stats[c.source === 'lines' ? 'lineEvidence' : 'alignEvidence'] = c.evidence;
    // Two trackers arriving at the same pose is evidence in itself; a pose only one of them backs
    // has to stand on its own, like a detection (a slip across the strings looks just like this).
    if (best && best.evidence < (agree ? minTrackEvidence : minEvidence)) {
      best = null;
      bestSlip = null;
    }
    let coasted = false;
    if (!best && carried && coasting < maxCoastFrames) {
      // Neither tracker holds the board, but its picture was followed here. Perhaps it only moved too
      // far for them: look once more from where it is now. Failing that, coast: report where it must be.
      const again = refinePose(lv.img, carried, model, { windows: [0.3, 0.2, 0.14], priorWeight: 0.6 });
      const retried = again ? describe('lines', again.H, again, lv, av, model, again.polarity) : null;
      if (retried && retried.evidence >= minEvidence) {
        best = retried;
        stats.reacquired = 1;
      } else {
        const refine = again ?? lines.lastTrackEvidence();
        if (refine) {
          best = describe('lines', carried, refine, lv, av, model, refine.polarity);
          coasted = true;
        }
      }
    }
    if (!best) return finish(null, candidates.length === 0 ? 'lost' : 'lost-weak-evidence');
    coasting = coasted ? coasting + 1 : 0;
    stats.coasting = coasting;
    stats.evidence = best.evidence;
    stats.source = best.source === 'lines' ? 0 : 1;
    const now = input.timeMs ?? clock + 33;
    if (!continues) {
      votes.clear();
      settled = 0;
      trackStart = now;
      // A pose from outside (a calibration, a tap, another detector) with numbers it is sure of is the new anchor.
      if (numbered(previousPose) && previousPose.numberingConfidence >= 0.9) anchor = { pose: previousPose, time: now };
    }
    let pose = makePose(best.H, model, frame.width, frame.height, {
      confidence: coasted ? Math.min(COAST_CONFIDENCE, logistic(best.evidence)) : logistic(best.evidence + (agree ? 2 : 0)),
      mirrored: input.mirrored ?? previousPose.mirrored,
      leftHanded: input.leftHanded ?? previousPose.leftHanded,
      numbering: previousPose.numbering === 'assumed' ? 'assumed' : 'tracked',
      // A pose carried by the flow may have drifted along the neck: its numbers are no longer beyond doubt.
      numberingConfidence: coasted ? Math.min(previousPose.numberingConfidence, 0.97) : previousPose.numberingConfidence,
    });
    // A tracker that slid the whole comb by a fret (motion blur, a fast move) still sits on wires, so
    // its evidence does not drop; but the board's own motion says where each wire went. Put the
    // numbers back where the flow says they are.
    if (!coasted && bestSlip && bestSlip.delta !== 0 && bestSlip.residual < SLIP_MAX_RESIDUAL) {
      pose = renumberPose(pose, bestSlip.delta);
      stats.slip = bestSlip.delta;
    }
    // Numbers that are not beyond doubt stay under review: every look at the nut and the inlays, and
    // every comparison with the last trusted pose, is a vote for a whole-fret shift (or for none).
    tracked++;
    settled++;
    const jumped = continues && !coasted ? jumpOf(previousPose, pose, now - clock) : false;
    if (jumped) {
      stats.jump = 1;
      // A cut or a knock: the trackers followed the last pose onto whatever wires are near it now,
      // with the old perspective and the old numbers. Look at the whole frame again, as on a first
      // detection (numbers read off this frame alone), and keep the tracked pose only when that
      // finds nothing better backed.
      const fresh = detect(frame, { ...input, previousPose: undefined });
      const freshStats = fresh.diagnostics.stats ?? {};
      // The fresh search found this board where the track put it, with the same numbers: the board
      // really moved that fast (or a busy machine skipped frames before the usual speed was known).
      // That is the speed to expect now; otherwise every later frame would be searched afresh too.
      if (fresh.pose && poseDistancePx(fresh.pose, pose) < JUMP_CELLS * lastMove.cell) motion = Math.max(motion, lastMove.speed);
      if (fresh.pose && (freshStats.evidence ?? -Infinity) >= best.evidence) {
        timings.redetect = fresh.diagnostics.timings.total;
        timings.total = performance.now() - t0;
        return { pose: fresh.pose, diagnostics: { ...fresh.diagnostics, timings: { ...fresh.diagnostics.timings, ...timings }, stats: { ...freshStats, jump: 1, redetected: 1 } } };
      }
      // Kept: the numbers came across the jump by nearness alone, a guess until the image says
      // otherwise. From here on this is a new track, so the trusted pose from before it has a say too.
      pose = { ...pose, numbering: pose.numbering === 'assumed' ? 'assumed' : 'tracked', numberingConfidence: Math.min(pose.numberingConfidence, JUMP_GUESS) };
      votes.clear();
      settled = 0;
      trackStart = now;
    }
    const sure = pose.numberingConfidence;
    if (sure < 0.99 && !coasted) {
      t1 = performance.now();
      const guessing = sure < 0.5;
      // A numbering that was just read, carried or shifted is checked on every frame of its probation.
      if (sure < 0.75 || settled <= PROBATION_FRAMES || tracked % readEvery === 0) {
        const measured = refinePose(lv.img, scaleH(pose.H, 1 / lv.factor, 1 / lv.factor), model, { polarity: best.refine.polarity, windows: [0.12], priorWeight: 2, stringLock: false, evidence: true, fromFret: -6 });
        if (measured) {
          const byLine = resolveLineNumbering(measured.frets ?? [], measured.cells ?? [], { fretCount: model.fretCount, polarity: measured.polarity, strength: measured.strength });
          const byAlign = align.numbering(av, scaleH(pose.H, av.scaleX, av.scaleY), model, best.polarity, best.score);
          const reading = fuseNumbering(byLine, byAlign);
          stats.readDelta = reading.delta;
          stats.readConfidence = reading.source === 'assumed' ? 0 : reading.confidence;
          if (reading.source !== 'assumed' && reading.confidence >= 0.6) {
            votes.set(reading.delta, (votes.get(reading.delta) ?? 0) + reading.confidence);
            // A pose that was only guessing takes the first clear reading at its word.
            if (guessing) {
              pose = renumberPose(pose, reading.delta, reading.source, reading.confidence);
              stats.renumbered = reading.delta;
              shiftVotes(reading.delta, 1);
            }
          } else if (guessing) {
            // No clear reading: the two readers' hunches still add up over the frames to a better guess.
            votes.set(byLine.delta, (votes.get(byLine.delta) ?? 0) + byLine.confidence);
            votes.set(byAlign.delta, (votes.get(byAlign.delta) ?? 0) + byAlign.confidence);
          }
        }
      }
      // While the anchor is still a pose from before this track began (before a loss), it has a say too.
      if (anchor && anchor.time < trackStart && now - anchor.time < ANCHOR_LIFE_MS && sure < 0.95 && stats.renumbered === undefined) {
        const carried = carryNumbering(pose, anchor.pose, stringsLocked(best.refine));
        if (carried) {
          stats.carryDelta = carried.delta;
          if (guessingNow(pose) && carried.how === 'aspect' && numbered(anchor.pose) && carried.confidence >= 0.85) {
            // The board's shape against the trusted pose from before the loss: as good as a reading.
            pose = renumberPose(pose, carried.delta, 'tracked', carried.confidence);
            stats.renumbered = carried.delta;
            shiftVotes(carried.delta, 1);
          } else votes.set(carried.delta, (votes.get(carried.delta) ?? 0) + (numbered(anchor.pose) ? 0.6 * carried.confidence : 0.3));
        }
      }
      if (stats.renumbered === undefined) {
        let top = 0;
        let topScore = votes.get(0) ?? 0;
        for (const [delta, score] of votes) {
          if (score > topScore) {
            top = delta;
            topScore = score;
          }
        }
        const standing = votes.get(0) ?? 0;
        if (top !== 0 && pose.numberingConfidence < 0.5 && topScore >= standing + 0.5) {
          // Still a guess, but a better one.
          pose = renumberPose(pose, top, pose.numbering, pose.numberingConfidence);
          stats.renumbered = top;
          shiftVotes(top, 1);
        } else if (top !== 0 && pose.numberingConfidence >= 0.5 && topScore >= 1.5 && topScore >= standing + 1) {
          // The evidence says every number is off by `top`: shift, and let the new numbering earn its trust afresh.
          pose = renumberPose(pose, top, 'tracked', Math.min(0.9, Math.max(0.6, topScore / (topScore + standing + 1))));
          stats.renumbered = top;
          shiftVotes(top, 0.5);
        } else if (top === 0 && standing >= 2 && pose.numberingConfidence >= 0.5 && pose.numberingConfidence < 0.92) {
          pose = { ...pose, numbering: 'tracked', numberingConfidence: 0.92 };
        }
      }
      if (stats.renumbered !== undefined) settled = 0;
      // Old votes fade: a neck that keeps moving must keep confirming.
      for (const [delta, score] of votes) votes.set(delta, 0.92 * score);
      timings.numbering = performance.now() - t1;
    }
    const out = input.fretHint ? (confirmFretAt(pose, input.fretHint.point, input.fretHint.fret) ?? pose) : pose;
    remember(out, now, lv);
    return finish(out, coasted ? 'coasting' : undefined);
  };

  const fit = (frame: Frame, hypotheses: readonly Mat3[], input: DetectOptions = {}): FittedBoard | null => {
    if (badFrame(frame) || hypotheses.length === 0) return null;
    const { opts, model } = resolveOptions(input);
    const lv = lines.prepare(frame);
    const av = align.prepare(frame);
    let best: { c: BoardCandidate; index: number } | null = null;
    hypotheses.forEach((H, index) => {
      const Hline = scaleH(H, 1 / lv.factor, 1 / lv.factor);
      // The hypothesis is right along the neck near the markers but knows nothing of perspective:
      // wide windows first, a light pull toward it.
      const refined = refinePose(lv.img, Hline, model, { windows: [0.3, 0.2, 0.14], priorWeight: 0.3, evidence: true });
      if (!refined || refined.fretsFound < 4) return;
      const c = describe('lines', refined.H, refined, lv, av, model, refined.polarity);
      if (!best || c.evidence > best.c.evidence) best = { c, index };
    });
    const found = best as { c: BoardCandidate; index: number } | null;
    if (!found) return null;
    const pose = makePose(found.c.H, model, frame.width, frame.height, { confidence: logistic(found.c.evidence), mirrored: opts.mirrored ?? false, leftHanded: opts.leftHanded ?? false });
    return { pose, evidence: found.c.evidence, index: found.index };
  };

  const inspect = (frame: Frame, input: DetectOptions = {}): Inspection => {
    const { opts, model } = resolveOptions(input);
    const found = search(frame, opts, model, true);
    const numbering = found.candidates.map((c) => numberingOf(c, found.av, found.model));
    return { model: found.model, candidates: found.candidates, numbering, agree: found.agree, chosen: found.chosen, reason: found.reason, timings: found.timings, stats: found.stats };
  };

  return {
    name: 'fretboard',
    detect,
    track,
    inspect,
    fit,
    reset: () => {
      lines.reset?.();
      align.reset?.();
      anchor = null;
      clock = 0;
      tracked = 0;
      lastOut = null;
      votes.clear();
      settled = 0;
      flowFrom = null;
      coasting = 0;
      trackStart = 0;
      motion = 0;
    },
  };
}

/** Factory the benchmark runner looks for. */
export function createDetector(): Detector {
  return createFretboardDetector();
}

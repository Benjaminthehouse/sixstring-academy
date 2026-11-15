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
 * two numbering readers vote on the fret numbers. Tracking follows the previous pose with both
 * trackers and keeps the one the evidence backs. README.md has the measurements behind each rule.
 */
import { createAlignDetector, type AlignDetector, type AlignView } from './align/detector';
import type { NumberingDecision } from './align/numbering';
import type { PoseScore } from './align/score';
import { boardProfiles, boardShift, type BoardProfiles } from './flow';
import { boardOutline, comparePoses, computeVisibleFrets, confirmFretAt, makePose, multiply, neckModel, renumberPose } from './geometry';
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
  /** Fill `diagnostics.features` (default false). */
  debug?: boolean;
}

/** The production detector plus a look at its candidates (for diagnostics and tuning). */
export interface FretboardDetector extends Detector {
  /** Both searches, every candidate polished and scored, and the decision, without building a pose. */
  inspect(frame: Frame, options?: DetectOptions): Inspection;
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
/** Confidence reported for a pose that is only being carried along (the overlay may want to fade). */
const COAST_CONFIDENCE = 0.3;
/** How long a trusted pose keeps lending its fret numbers after the board was lost, in milliseconds. */
const ANCHOR_LIFE_MS = 3000;

function scaleH(H: Mat3, sx: number, sy: number): Mat3 {
  return [H[0] * sx, H[1] * sx, H[2] * sx, H[3] * sy, H[4] * sy, H[5] * sy, H[6], H[7], H[8]];
}

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
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
function sameCells(a: Mat3, b: Mat3, model: NeckModel, width: number, height: number): boolean {
  const pa = makePose(a, model, width, height);
  const pb = makePose(b, model, width, height);
  return Math.min(comparePoses(pa, pb).cellAccuracyAligned, comparePoses(pb, pa).cellAccuracyAligned) >= 0.8;
}

/** Create the production fretboard detector. One instance per camera stream. */
export function createFretboardDetector(options: FretboardDetectorOptions = {}): FretboardDetector {
  const minEvidence = options.minEvidence ?? 1;
  const minMargin = options.minMargin ?? 1;
  const minAgreedEvidence = options.minAgreedEvidence ?? -1;
  const fastEvidence = options.fastEvidence ?? 3;
  const minTrackEvidence = options.minTrackEvidence ?? -1.5;
  const debug = options.debug ?? false;
  const readEvery = Math.max(1, options.readNumberingEvery ?? 5);
  const maxCoastFrames = options.maxCoastFrames ?? 20;
  const lines: LineDetector = createLineDetector({ debug });
  // The alignment tracker's own periodic re-detection and still-frame blending are switched off:
  // cross-checking happens here and smoothing in `FretboardTracker`.
  const align: AlignDetector = createAlignDetector({ debugFeatures: false, verifyInterval: 0, stillSmoothing: 0 });
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

  interface Search extends Inspection {
    lv: LineView;
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
        if (candidates[0].evidence >= minEvidence) chosen = 0;
        else reason = 'weak-evidence';
      } else {
        reason = a.reason === 'no-lines' ? 'no-lines' : 'no-candidate';
      }
    }
    const numbering = candidates.map((c) => numberingOf(c, av, model));
    timings.total = performance.now() - t0;
    return { model, candidates, numbering, agree, chosen, reason, timings, stats, lv, features };
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
    const reading = fuseNumbering(found.numbering[found.chosen].lines, found.numbering[found.chosen].align);
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

    // Both trackers follow the previous pose; each result becomes a candidate with the common evidence.
    const candidates: BoardCandidate[] = [];
    const byLines = lines.track(frame, previousPose, input, lv);
    const lineEvidence = lines.lastTrackEvidence();
    if (byLines.pose && lineEvidence) candidates.push(describe('lines', scaleH(byLines.pose.H, 1 / lv.factor, 1 / lv.factor), lineEvidence, lv, av, model, lineEvidence.polarity));
    let t2 = performance.now();
    timings.lines = t2 - t1;
    t1 = t2;
    const byAlign = align.track(frame, previousPose, input, av);
    t2 = performance.now();
    timings.align = t2 - t1;
    t1 = t2;
    let agree = false;
    if (byAlign.pose) {
      // The usual case: both trackers arrive at the same well-backed pose, and the line tracker's (the
      // more precise across the neck) is kept as it is. A dissenting pose, or a weakly backed
      // consensus (both can slip half a string together), is polished afresh and weighed.
      agree = candidates.length === 1 && candidates[0].evidence >= SETTLED_EVIDENCE && sameCells(candidates[0].H, scaleH(byAlign.pose.H, frame.width / byAlign.pose.frameWidth, frame.height / byAlign.pose.frameHeight), model, frame.width, frame.height);
      if (!agree) {
        const polished = polish(scaleH(byAlign.pose.H, av.scaleX, av.scaleY), (byAlign.diagnostics.stats?.polarity ?? 1) > 0 ? 1 : -1, lv, av, model, true);
        if (polished) candidates.push(polished);
      }
    }
    timings.polish = performance.now() - t1;
    const continues = lastOut !== null && sameH(lastOut, previousPose.H);
    // How the picture of the board moved since the last frame, wires or no wires (see flow.ts).
    let carried: Mat3 | null = null;
    if (continues && flowFrom && flowFrom.width === lv.img.width && maxCoastFrames > 0) {
      const profiles = boardProfiles(lv.img, flowFrom.H, model, computeVisibleFrets(flowFrom.H, model, lv.img.width, lv.img.height));
      const shift = profiles ? boardShift(flowFrom.profiles, profiles) : null;
      if (shift) {
        stats.flowPeak = shift.peak;
        stats.flowPx = Math.hypot(shift.dx, shift.dy);
        if (shift.peak >= COAST_MIN_PEAK) carried = multiply(shift.map, flowFrom.H);
      }
    }
    let best: BoardCandidate | null = candidates[0] ?? null;
    if (candidates.length === 2) {
      // After the polish the two may agree after all (the line refinement pulled the other onto the same strings).
      agree = sameCells(candidates[0].H, candidates[1].H, model, frame.width, frame.height);
      // The line tracker keeps the pose unless the other is clearly better backed.
      if (candidates[1].evidence > candidates[0].evidence + (agree ? 1.5 : 0.75)) best = candidates[1];
    }
    stats.agree = agree ? 1 : 0;
    for (const c of candidates) stats[c.source === 'lines' ? 'lineEvidence' : 'alignEvidence'] = c.evidence;
    // Two trackers arriving at the same pose is evidence in itself; a pose only one of them backs
    // has to stand on its own, like a detection (a slip across the strings looks just like this).
    if (best && best.evidence < (agree ? minTrackEvidence : minEvidence)) best = null;
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
    // Numbers that are not beyond doubt stay under review: every look at the nut and the inlays, and
    // every comparison with the last trusted pose, is a vote for a whole-fret shift (or for none).
    tracked++;
    settled++;
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
          votes.set(carried.delta, (votes.get(carried.delta) ?? 0) + (numbered(anchor.pose) ? 0.6 * carried.confidence : 0.3));
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

  const inspect = (frame: Frame, input: DetectOptions = {}): Inspection => {
    const { opts, model } = resolveOptions(input);
    const found = search(frame, opts, model, true);
    return { model: found.model, candidates: found.candidates, numbering: found.numbering, agree: found.agree, chosen: found.chosen, reason: found.reason, timings: found.timings, stats: found.stats };
  };

  return {
    name: 'fretboard',
    detect,
    track,
    inspect,
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
    },
  };
}

/** Factory the benchmark runner looks for. */
export function createDetector(): Detector {
  return createFretboardDetector();
}

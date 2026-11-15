/**
 * Detector A, "line structure": bottom-up features and geometric model fitting.
 *
 *   luminance -> Sobel -> oriented Hough lines -> candidate neck axes -> board band from fret ends
 *   -> fret candidates in the rectified band -> 1-D fret-spacing fit (relative indices)
 *   -> homography from fret end points -> refinement on ridge evidence -> nut / inlay numbering.
 *
 * Tracking skips everything up to the refinement and starts it from the previous pose.
 */
import {
  applyHomography,
  boardCenterY,
  boardEdgeY,
  boardWidthAt,
  checkPlausibleView,
  confirmFretAt,
  expectedOrientation,
  extrapolatePose,
  fretX,
  homographyFromPoints,
  homographyJacobian,
  invertHomography,
  makePose,
  neckModel,
  renumberPose,
  stringSpanAt,
  stringY,
} from '../geometry';
import type { DetectOptions, DetectionResult, Detector, DiagnosticFeature, Frame, FretboardPose, Mat3, NeckModel, NumberingSource, Point, Rect } from '../types';
import { clusterAxes, findBands, type BandQuad } from './band';
import { analyseBand, type Comb } from './comb';
import { fitFretPattern, type FretFit } from './fretfit';
import { detectLines, lineEndpoints } from './hough';
import { resolveMarkers } from './markers';
import { smooth3, sobel, toWorkingGray, workingFactor, type Gradients, type Image32 } from './image';
import { resolveNumbering } from './numbering';
import { applyAcross, refinePose, type RefineResult } from './refine';

/** Tunables of the line-structure detector. The defaults are what the benchmark numbers were measured with. */
export interface LineDetectorOptions {
  /** Width of the working image the frame is shrunk to (by an integer factor). Default 640. */
  workingWidth?: number;
  /** Candidate axes examined per frame (default 8) and bands analysed in full (default 6). */
  maxAxes?: number;
  maxBands?: number;
  /** Fewest fret candidates a comb needs (default 5); a detection needs one more wire than that confirmed by the refinement. */
  minFrets?: number;
  /** Lowest share of the predicted fret comb the image must support (default 0.5). */
  minSupport?: number;
  /** Lowest share of the predicted comb that must stay supported while tracking (default 0.42). */
  minTrackSupport?: number;
  /** String positions that must be measurable (default 18 = three cells) and the share of them that must show a string (default 0.4). */
  minStringsLooked?: number;
  minStringSupport?: number;
  /** Lowest product of fret support and string support (default 0.33): either may be weak, not both. */
  minJointSupport?: number;
  /** Lowest overall confidence of a detection (default 0.39). */
  minConfidence?: number;
  /** Fill `diagnostics.features` (lines, bands, fret candidates). Default false: no allocation in production. */
  debug?: boolean;
}

interface Workspace {
  gray?: Image32;
  smooth?: Image32;
  scratch?: Float32Array;
  grad?: Gradients;
}

/** One board hypothesis of the bottom-up search, in working-image pixels. */
export interface LineCandidate {
  H: Mat3;
  refine: RefineResult;
  comb: Comb;
  fit: FretFit;
  confidence: number;
}

type Candidate = LineCandidate;

/** Acceptance thresholds of the bottom-up search; see the fields of the same names in `LineDetectorOptions`. */
export type LineLimits = Pick<Required<LineDetectorOptions>, 'minFrets' | 'minSupport' | 'minStringsLooked' | 'minStringSupport' | 'minJointSupport' | 'minConfidence'>;

/** The working image of a frame as the line stages see it: smoothed luminance and frame pixels per working pixel. */
export interface LineView {
  img: Image32;
  factor: number;
}

/** Outcome of `LineDetector.propose`. */
export interface LineProposal {
  /** The best board candidate that passed the limits, or null. */
  best: LineCandidate | null;
  /** Why there is none (or why the last candidate examined was turned down). */
  reason: string;
}

/** The line-structure detector with its stages exposed, so the production pipeline can combine them with the alignment stages. */
export interface LineDetector extends Detector {
  /** Build the working image of a frame; valid until the next `prepare`, `detect` or `track`. */
  prepare(frame: Frame): LineView;
  /** `Detector.track`, optionally on a view already prepared for this frame. */
  track(frame: Frame, previousPose: FretboardPose, options?: DetectOptions, view?: LineView): DetectionResult;
  /** The line evidence behind the pose `track` returned last (null after a failed track or a reset). */
  lastTrackEvidence(): RefineResult | null;
  /** Bottom-up search on a prepared view under the given limits (default: the detector's own). */
  propose(view: LineView, model: NeckModel, options?: DetectOptions, limits?: Partial<LineLimits>, diagnostics?: { timings: Record<string, number>; stats: Record<string, number>; features?: DiagnosticFeature[] }): LineProposal;
}

/** Confidence (0..1) of a refined pose from how much of the predicted comb, its edges and its fit the image supports. */
export function lineConfidence(r: RefineResult): number {
  const frets = Math.min(1, r.fretsFound / 9);
  const edges = 0.5 + 0.5 * r.edgeSupport;
  const fit = Number.isFinite(r.residualPx) ? 1 / (1 + (r.residualPx / 2.5) * (r.residualPx / 2.5)) : 0.5;
  return Math.max(0, Math.min(1, r.support * (0.4 + 0.6 * frets) * edges * (0.5 + 0.5 * fit)));
}

/**
 * Why a refined pose is not a fretboard under the given limits, or null when it passes: enough of
 * the comb supported, six strings in the cells, no wires in the gaps, a convincing total.
 */
export function lineVerdict(refined: RefineResult, lim: LineLimits): string | null {
  if (refined.fretsFound < lim.minFrets + 1 || refined.support < lim.minSupport) return 'weak-support';
  // Six strings running through the cells are what a ladder, a keyboard or a shelf of books lack.
  if (refined.stringsLooked < lim.minStringsLooked || refined.stringSupport < lim.minStringSupport || refined.support * refined.stringSupport < lim.minJointSupport) return 'no-strings';
  // Wires in the gaps: the comb in the image is not the comb of the model (half a fret off, or twice as dense).
  if (refined.antiSupport > 0.3 && refined.antiSupport > 0.5 * refined.support) return 'wires-between-wires';
  // Every figure just above its own threshold is not a board: wrong poses cluster down here.
  if (lineConfidence(refined) < lim.minConfidence) return 'unconvincing';
  return null;
}

const DEFAULTS: Required<LineDetectorOptions> = { workingWidth: 640, maxAxes: 8, maxBands: 6, minFrets: 5, minSupport: 0.5, minTrackSupport: 0.42, minStringsLooked: 18, minStringSupport: 0.4, minJointSupport: 0.33, minConfidence: 0.39, debug: false };

function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

/** From the hints: which edge of the band is the bass side, and whether fret numbers grow along the band's axis. */
function layout(comb: Comb, options: DetectOptions): { direction: 1 | -1; bassEdge: 0 | 1 } {
  const b = comb.band;
  const mid0 = { x: (b.a0.x + b.b0.x) / 2, y: (b.a0.y + b.b0.y) / 2 };
  const mid1 = { x: (b.a1.x + b.b1.x) / 2, y: (b.a1.y + b.b1.y) / 2 };
  const e01 = { x: mid1.x - mid0.x, y: mid1.y - mid0.y };
  const expected = expectedOrientation(options.mirrored ?? false, options.leftHanded ?? false);
  const steep = Math.abs(comb.dir.y) > 0.866;
  if (steep) {
    // A neck standing upright in the frame: "upper edge" means nothing, but the headstock is up.
    const direction: 1 | -1 = comb.dir.y > 0 ? 1 : -1;
    const along = { x: comb.dir.x * direction, y: comb.dir.y * direction };
    return { direction, bassEdge: Math.sign(cross(along, e01)) === expected ? 0 : 1 };
  }
  const upper: 0 | 1 = mid0.y <= mid1.y ? 0 : 1;
  const bassEdge: 0 | 1 = (options.bassSideUp ?? true) ? upper : upper === 0 ? 1 : 0;
  const across = bassEdge === 0 ? e01 : { x: -e01.x, y: -e01.y };
  // The camera sees the face of the board, which fixes the handedness of (along, across).
  return { direction: Math.sign(cross(comb.dir, across)) === expected ? 1 : -1, bassEdge };
}

/** Allowed depth ratio between the last and the first candidate, from how the band's width changes between them. */
function depthRange(comb: Comb, model: NeckModel, direction: 1 | -1): [number, number] {
  const us = comb.frets.map((f) => f.u);
  const uLo = Math.min(...us);
  const uHi = Math.max(...us);
  const widthAt = (u: number): number => comb.widthStart + ((comb.widthEnd - comb.widthStart) * u) / comb.length;
  const q = widthAt(uHi) / widthAt(uLo);
  // True board width ratio between the bridge-side and the nut-side end of the comb: between "barely
  // any taper over a short comb high up the neck" and "nut to about the 14th fret".
  const maxTaper = boardWidthAt(model, fretX(model, 14)) / model.nutWidth;
  const taper: [number, number] = direction > 0 ? [1.02, maxTaper] : [1 / maxTaper, 1 / 1.02];
  // image width = true width / depth  ->  depth ratio = taper ratio / image width ratio.
  const slack = 1.08;
  return [Math.max(1 / 1.9, taper[0] / q / slack), Math.min(1.9, (taper[1] / q) * slack)];
}

/** Homography from the matched fret candidates: every wire end is a known point of the board outline. */
function composeHomography(comb: Comb, fit: FretFit, bassEdge: 0 | 1, model: NeckModel, lowFret: number): Mat3 | null {
  const src: Point[] = [];
  const dst: Point[] = [];
  const weights: number[] = [];
  comb.frets.forEach((f, i) => {
    const m = fit.indices[i];
    if (m === null) return;
    const x = fretX(model, m - fit.minIndex + lowFret);
    src.push({ x, y: boardEdgeY(model, x, 'bass') }, { x, y: boardEdgeY(model, x, 'treble') });
    dst.push(bassEdge === 0 ? f.p0 : f.p1, bassEdge === 0 ? f.p1 : f.p0);
    weights.push(f.weight, f.weight);
  });
  return homographyFromPoints(src, dst, weights);
}

/** Bounding box of a region hint (a rectangle or a polygon), grown by 5% so a neck touching its border still counts. */
function regionBounds(region: DetectOptions['region']): Rect | null {
  if (!region) return null;
  let x0: number;
  let y0: number;
  let x1: number;
  let y1: number;
  if (Array.isArray(region)) {
    if (region.length < 3) return null;
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
  const mx = 0.05 * (x1 - x0);
  const my = 0.05 * (y1 - y0);
  return { x: x0 - mx, y: y0 - my, width: x1 - x0 + 2 * mx, height: y1 - y0 + 2 * my };
}

/** Two fits label their common candidates alike (up to the arbitrary offset of relative indices). */
function sameLabels(a: FretFit, b: FretFit): boolean {
  let offset: number | null = null;
  let common = 0;
  for (let i = 0; i < a.indices.length; i++) {
    const p = a.indices[i];
    const q = b.indices[i];
    if (p === null || q === null) continue;
    common++;
    if (offset === null) offset = p - q;
    else if (p - q !== offset) return false;
  }
  return common >= 3;
}

/** Two bands cover the same quadrilateral to within a few pixels. */
function sameBand(a: BandQuad, b: BandQuad): boolean {
  const near = (p: Point, q: Point): boolean => Math.abs(p.x - q.x) + Math.abs(p.y - q.y) < 10;
  return near(a.a0, b.a0) && near(a.a1, b.a1) && near(a.b0, b.b0) && near(a.b1, b.b1);
}

function scaleH(H: Mat3, s: number): Mat3 {
  return [H[0] * s, H[1] * s, H[2] * s, H[3] * s, H[4] * s, H[5] * s, H[6], H[7], H[8]];
}

function quadFeature(kind: string, b: BandQuad, s: number, label?: string): DiagnosticFeature {
  return { kind, points: [b.a0, b.b0, b.b1, b.a1].map((p) => ({ x: p.x * s, y: p.y * s })), closed: true, label };
}

/** Ratio of the local image scale along the neck to that across it, at an image point. */
function localAspect(H: Mat3, at: Point): number {
  const inv = invertHomography(H);
  if (!inv) return NaN;
  const p = applyHomography(inv, at.x, at.y);
  const j = homographyJacobian(H, p.x, p.y);
  return Math.hypot(j[0], j[2]) / Math.hypot(j[1], j[3]);
}

/** Mean distance in pixels between the board corners of two poses. */
function poseShiftPx(a: FretboardPose, b: FretboardPose): number {
  const m = b.model;
  const x12 = m.scaleLength / 2;
  let sum = 0;
  for (const x of [0, x12]) {
    for (const side of ['bass', 'treble'] as const) {
      const y = boardEdgeY(m, x, side);
      const p = applyHomography(a.H, x, y);
      const q = applyHomography(b.H, x, y);
      sum += Math.hypot(p.x - q.x, p.y - q.y);
    }
  }
  return sum / 4;
}

/** Natural log of the ratio between consecutive fret spacings: one whole-fret slip changes the local aspect by this much. */
const LOG_FRET_STEP = Math.log(2) / 12;

/**
 * Carry fret numbers from an earlier pose of the same neck to a later one. Position cannot be
 * trusted (the neck may have slid along itself by any amount in between), but shape can: seen
 * through the earlier pose, a stretch of several frets of the later pose has a length in
 * millimetres, and the outer strings there a distance in millimetres. Unless the guitar turned or
 * came much closer these are what they were, and they tell which frets the stretch spans: calling
 * every wire one fret too high makes the stretch 5.6% shorter and the strings a little wider. Returns the whole-fret
 * correction for `pose`, how far off the best reading still is in fret steps (0 = clean), and how
 * far off the pose is without any correction.
 */
function numberingFromEarlier(pose: FretboardPose, earlier: FretboardPose, reach = 14, acrossWeight = 0.5): { delta: number; residual: number; unchanged: number } | null {
  const vis = pose.visibleFrets;
  const m = pose.model;
  const f1 = Math.max(0, vis.min);
  const f2 = Math.min(m.fretCount, vis.max);
  if (f2 - f1 < 3) return null;
  const inv = invertHomography(earlier.H);
  if (!inv) return null;
  const yc = boardCenterY(m);
  const xm = fretX(m, (f1 + f2) / 2);
  const through = (x: number, y: number): Point => {
    const p = applyHomography(pose.H, x, y);
    return applyHomography(inv, p.x, p.y);
  };
  const a = through(fretX(m, f1), yc);
  const b = through(fretX(m, f2), yc);
  const c = through(xm, stringY(m, 1, xm));
  const d = through(xm, stringY(m, m.stringCount, xm));
  const alongThen = b.x - a.x;
  const acrossThen = Math.abs(d.y - c.y);
  if (!(alongThen > 0) || !(acrossThen > 0)) return null;
  let best: { delta: number; residual: number; unchanged: number } | null = null;
  let unchanged = Infinity;
  for (let delta = -reach; delta <= reach; delta++) {
    if (f1 + delta < 0) continue;
    const along = fretX(m, f2 + delta) - fretX(m, f1 + delta);
    const across = stringSpanAt(m, fretX(m, (f1 + f2) / 2 + delta));
    // The length along the neck is measured over many frets and is precise; the width across it is
    // not, but it is what tells "came closer" from "other frets", so it gets a partial say (and none
    // between consecutive frames, where the distance to the camera cannot have changed).
    const residual = Math.abs(Math.log(alongThen / along) - acrossWeight * Math.log(acrossThen / across)) / LOG_FRET_STEP;
    if (delta === 0) unchanged = residual;
    if (!best || residual < best.residual) best = { delta, residual, unchanged: 0 };
  }
  if (!best) return null;
  best.unchanged = unchanged;
  return best;
}

/**
 * Fallback for `numberingFromEarlier` when the strings are not locked (so the scale across the neck
 * is unsure): the whole-fret shift that puts `pose` nearest to `earlier`, with the remaining
 * distance in fret spacings. Only meaningful if the neck moved by less than half a fret.
 */
function nearestNumbering(pose: FretboardPose, earlier: FretboardPose): { delta: number; distance: number } | null {
  const vis = pose.visibleFrets;
  if (vis.max < vis.min) return null;
  const m = pose.model;
  const yc = boardCenterY(m);
  const mid = Math.round((Math.max(0, vis.min) + Math.max(1, vis.max)) / 2);
  const inv = invertHomography(earlier.H);
  if (!inv) return null;
  // Which wire of the earlier pose is the wire this pose calls `mid` nearest to?
  const at = applyHomography(pose.H, fretX(m, mid), yc);
  const next = applyHomography(pose.H, fretX(m, mid + 1), yc);
  const spacing = Math.hypot(next.x - at.x, next.y - at.y);
  const then = applyHomography(inv, at.x, at.y);
  const rest = 1 - then.x / earlier.model.scaleLength;
  if (!(rest > 0) || !(spacing > 0)) return null;
  const fretThen = -12 * Math.log2(rest);
  const nearest = Math.round(fretThen);
  const where = applyHomography(earlier.H, fretX(earlier.model, nearest), yc);
  return { delta: nearest - mid, distance: Math.hypot(where.x - at.x, where.y - at.y) / spacing };
}

/**
 * Fret numbers for a pose whose own numbering is unsure, from an earlier trusted pose of the same
 * neck: by aspect when the strings are locked (any amount of sliding along the neck is fine), else
 * by nearness (only right if the neck moved less than half a fret in between). Returns the
 * whole-fret shift for `pose`, the confidence it deserves and which argument gave it, or null.
 */
export function carryNumbering(pose: FretboardPose, earlier: FretboardPose, stringsLocked: boolean): { delta: number; confidence: number; how: 'aspect' | 'near' } | null {
  const scaled = earlier.frameWidth === pose.frameWidth ? earlier : { ...earlier, H: scaleH(earlier.H, pose.frameWidth / earlier.frameWidth) };
  const near = nearestNumbering(pose, scaled);
  if (stringsLocked) {
    const byAspect = numberingFromEarlier(pose, scaled);
    if (byAspect && byAspect.residual < 0.25) {
      const agree = near !== null && near.delta === byAspect.delta && near.distance < 0.4;
      return { delta: byAspect.delta, confidence: earlier.numberingConfidence * (agree ? 0.98 : byAspect.residual < 0.12 ? 0.9 : 0.7), how: 'aspect' };
    }
  }
  if (near && near.distance < 0.3) return { delta: near.delta, confidence: earlier.numberingConfidence * 0.7, how: 'near' };
  return null;
}

interface TrackState {
  /** The last pose handed out (in frame pixels) and the one before it, with their capture times. */
  last: FretboardPose;
  lastTime: number;
  before: FretboardPose | null;
  beforeTime: number;
  polarity: 1 | -1;
  stringPolarity?: 1 | -1;
  /** Best string support seen so far on this neck: strings that were never visible are not missed. */
  stringsSeen: number;
}

/** The most recent pose whose fret numbers could be trusted: what a later, unsure detection is renumbered against. */
interface Anchor {
  pose: FretboardPose;
  time: number;
}

function sameH(a: Mat3, b: Mat3): boolean {
  for (let i = 0; i < 9; i++) if (Math.abs(a[i] - b[i]) > 1e-9 * (1 + Math.abs(a[i]))) return false;
  return true;
}

/** Create the line-structure detector. */
export function createLineDetector(options: LineDetectorOptions = {}): LineDetector {
  const cfg: Required<LineDetectorOptions> = { ...DEFAULTS, ...options };
  const ws: Workspace = {};
  let state: TrackState | null = null;
  let anchor: Anchor | null = null;
  let clock = 0;
  let tracked: RefineResult | null = null;
  const remember = (pose: FretboardPose, time: number | undefined, r: RefineResult, continues: boolean): void => {
    const t = time ?? clock + 33;
    clock = t;
    const earlier = continues ? state : null;
    state = {
      last: pose,
      lastTime: t,
      before: earlier ? earlier.last : null,
      beforeTime: earlier ? earlier.lastTime : 0,
      polarity: r.polarity,
      stringPolarity: r.stringPolarity ?? earlier?.stringPolarity,
      stringsSeen: Math.max(earlier ? earlier.stringsSeen : 0, r.stringsLooked >= cfg.minStringsLooked ? r.stringSupport : 0),
    };
    if (pose.numbering !== 'assumed' && pose.numberingConfidence >= 0.5) anchor = { pose, time: t };
  };

  const prepare = (frame: Frame): { img: Image32; factor: number } => {
    const factor = workingFactor(frame.width, cfg.workingWidth);
    ws.gray = toWorkingGray(frame, factor, ws.gray);
    const n = ws.gray.width * ws.gray.height;
    if (!ws.scratch || ws.scratch.length < n) ws.scratch = new Float32Array(n);
    ws.smooth = smooth3(ws.gray, ws.smooth && ws.smooth !== ws.gray ? ws.smooth : undefined, ws.scratch);
    return { img: ws.smooth, factor };
  };

  const confidenceOf = lineConfidence;

  /** The board is still there: enough of the comb is supported and, where they can be seen, the strings are too. */
  const trackOk = (r: RefineResult, stringsSeen = 1): boolean => {
    if (r.fretsFound < 4 || r.support < cfg.minTrackSupport) return false;
    if (r.antiSupport > 0.3 && r.antiSupport > 0.5 * r.support) return false;
    // Strings are only missed where this neck has shown them before (a calibrated start on a camera
    // too coarse for the strings must still track on the wires alone).
    if (stringsSeen >= 0.6 && r.stringsLooked >= cfg.minStringsLooked) return r.stringSupport >= 0.3 && r.support * r.stringSupport >= 0.25;
    return r.support >= cfg.minTrackSupport + 0.15;
  };

  /** The bottom-up search: lines -> axes -> bands -> comb -> fret pattern -> homography -> refinement, best candidate under `lim`. */
  const search = (img: Image32, factor: number, model: NeckModel, options: DetectOptions, lim: LineLimits, timings: Record<string, number>, stats: Record<string, number>, features: DiagnosticFeature[] | undefined): LineProposal => {
    let clock = performance.now();
    const lap = (stage: string): void => {
      const now = performance.now();
      timings[stage] = (timings[stage] ?? 0) + now - clock;
      clock = now;
    };
    ws.grad = sobel(img, ws.grad);
    lap('gradient');
    const { lines } = detectLines(ws.grad);
    lap('lines');
    stats.lines = lines.length;
    if (features) {
      for (const l of lines.slice(0, 40)) {
        const [a, b] = lineEndpoints(l);
        features.push({ kind: 'line', points: [{ x: a.x * factor, y: a.y * factor }, { x: b.x * factor, y: b.y * factor }] });
      }
    }
    if (lines.length === 0) return { best: null, reason: 'no-lines' };

    const region = regionBounds(options.region);
    const axes = clusterAxes(lines, 7, 0.25 * img.height, cfg.maxAxes);
    stats.axes = axes.length;
    stats.bands = 0;
    let best: Candidate | null = null;
    let reason = 'no-band';

    /** Full analysis of one band: comb -> fret pattern -> homography -> refinement. */
    const evaluate = (band: BandQuad): Candidate | null => {
      const comb = analyseBand(img, band);
      lap('comb');
      if (!comb || comb.frets.length < lim.minFrets) {
        reason = 'no-comb';
        return null;
      }
      if (features) features.push(quadFeature('band', comb.band, factor, `${comb.frets.length}`));
      if (region) {
        // A region hint: the comb must sit inside it (its candidates' centre of mass, in frame pixels).
        let cx = 0;
        let cy = 0;
        for (const f of comb.frets) {
          cx += (f.p0.x + f.p1.x) / 2;
          cy += (f.p0.y + f.p1.y) / 2;
        }
        cx = (cx / comb.frets.length) * factor;
        cy = (cy / comb.frets.length) * factor;
        if (cx < region.x || cx > region.x + region.width || cy < region.y || cy > region.y + region.height) {
          reason = 'outside-region';
          return null;
        }
      }
      const lay = layout(comb, options);
      const candidates = comb.frets.map((f) => ({ u: f.u, weight: f.weight }));
      // Hypotheses: the best comb any camera could have produced, and (when frets are hidden, so that
      // the number of hidden ones is in doubt) the best comb consistent with how the band tapers.
      const fits: FretFit[] = [];
      const wide = fitFretPattern(candidates, { direction: lay.direction, minInliers: lim.minFrets });
      if (wide) fits.push(wide);
      if (!wide || wide.missing >= 2 || wide.inliers <= 8) {
        // Few wires, or wires hidden: spacing alone leaves the perspective (and with it the number of
        // hidden wires) open, and the taper of the band has to settle it.
        const narrow = fitFretPattern(candidates, { direction: lay.direction, depthRatio: depthRange(comb, model, lay.direction), minInliers: lim.minFrets });
        if (narrow && !(wide && sameLabels(wide, narrow) && Math.abs(Math.log(wide.depthRatio / narrow.depthRatio)) < 0.08)) fits.unshift(narrow);
      }
      lap('fit');
      if (fits.length === 0) {
        reason = 'no-fret-pattern';
        return null;
      }
      let top: Candidate | null = null;
      for (const fit of fits) {
        // Provisional numbering: the lowest matched wire is called the nut. The numbering stage shifts it.
        const H0 = composeHomography(comb, fit, lay.bassEdge, model, 0);
        if (!H0) {
          reason = 'degenerate-fit';
          continue;
        }
        const view = checkPlausibleView(H0, model, img.width, img.height, { mirrored: options.mirrored ?? false, leftHanded: options.leftHanded ?? false, minSpan: 0.08, maxSpan: 6, maxLogAspect: Math.log(3.6), maxSkew: 0.5, maxTiltDeg: 80, maxScaleRatio: 4.5 });
        if (!view.plausible) {
          reason = `implausible-${view.reasons[0]}`;
          continue;
        }
        const refined = refinePose(img, H0, model, { polarity: band.polarity, windows: [0.3, 0.2], evidence: true, fromFret: -6 });
        lap('refine');
        if (!refined) {
          reason = 'refine-failed';
          continue;
        }
        const verdict = lineVerdict(refined, lim);
        if (verdict) {
          reason = verdict;
          continue;
        }
        const confidence = confidenceOf(refined);
        if (!top || confidence > top.confidence) top = { H: refined.H, refine: refined, comb, fit, confidence };
        // A reading that the image supports this well needs no second opinion.
        if (confidence > 0.6) break;
      }
      if (features && top) {
        const fit = top.fit;
        comb.frets.forEach((f, i) => {
          features.push({ kind: fit.indices[i] === null ? 'spurious' : 'fret', points: [{ x: f.p0.x * factor, y: f.p0.y * factor }, { x: f.p1.x * factor, y: f.p1.y * factor }] });
        });
      }
      return top;
    };

    // Axes are examined strongest first, and the search stops at the first convincing board.
    const seen: BandQuad[] = [];
    search: for (const axis of axes) {
      const bands = findBands(img, axis, { minFrets: lim.minFrets });
      lap('bands');
      for (const band of bands) {
        if (seen.some((other) => sameBand(other, band))) continue;
        seen.push(band);
        stats.bands++;
        const candidate = evaluate(band);
        if (candidate && (!best || candidate.confidence > best.confidence)) best = candidate;
        if (best && best.confidence > 0.7) break search;
        if (seen.length >= cfg.maxBands) break search;
      }
    }
    return { best, reason };
  };

  const detect = (frame: Frame, input: DetectOptions = {}): DetectionResult => {
    const t0 = performance.now();
    const given = input.previousPose;
    const timings: Record<string, number> = {};
    const stats: Record<string, number> = {};
    const features: DiagnosticFeature[] | undefined = cfg.debug ? [] : undefined;
    let clock = t0;
    const lap = (stage: string): void => {
      const now = performance.now();
      timings[stage] = (timings[stage] ?? 0) + now - clock;
      clock = now;
    };
    const finish = (pose: FretboardPose | null, reason?: string): DetectionResult => {
      timings.total = performance.now() - t0;
      return { pose, diagnostics: { timings, reason, features, stats } };
    };
    if (!frame || frame.width < 32 || frame.height < 32) return finish(null, 'frame-too-small');
    // What the caller does not say is taken from the earlier pose, if there is one.
    const options: DetectOptions = given ? { ...input, mirrored: input.mirrored ?? given.mirrored, leftHanded: input.leftHanded ?? given.leftHanded } : input;

    const { img, factor } = prepare(frame);
    // Exact dimensions win; otherwise the neck of the earlier pose (calibrated, or ours) is still the
    // neck in front of the camera, and keeping it makes old and new poses comparable; else the preset.
    const model = typeof options.model === 'object' ? neckModel(options.model) : options.previousPose ? options.previousPose.model : neckModel(options.model ?? 'steel');
    lap('gray');
    const { best, reason } = search(img, factor, model, options, cfg, timings, stats, features);
    clock = performance.now();
    if (!best) return finish(null, reason);
    stats.support = best.refine.support;
    stats.fretsFound = best.refine.fretsFound;
    stats.antiSupport = best.refine.antiSupport;
    stats.edgeSupport = best.refine.edgeSupport;
    stats.edgeError = best.refine.edgeError;
    stats.edgeShift = best.refine.edgeShift;
    stats.stringSupport = best.refine.stringSupport;
    stats.stringsLooked = best.refine.stringsLooked;
    stats.residualPx = best.refine.residualPx;

    // Absolute numbering from the nut and the inlays; then one more polish, because the board taper
    // (unlike the fret spacing) is not self-similar under a renumbering.
    let H = best.H;
    let source: NumberingSource = 'assumed';
    let numberingConfidence = 0.1;
    let refined = best.refine;
    const numbering = resolveNumbering(refined.frets ?? [], refined.cells ?? [], { fretCount: model.fretCount, polarity: refined.polarity, strength: refined.strength });
    source = numbering.source;
    numberingConfidence = numbering.confidence;
    stats.numberingDelta = numbering.delta;
    stats.nutScore = numbering.nut ? numbering.nut.score : -1;
    stats.nutDelta = numbering.nut ? numbering.nut.delta : NaN;
    stats.inlayScore = numbering.inlays ? numbering.inlays.score : -1;
    stats.inlayDelta = numbering.inlays ? numbering.inlays.delta : NaN;
    stats.inlayMatched = numbering.inlays ? numbering.inlays.matched : 0;
    stats.inlayDouble = numbering.inlays && numbering.inlays.double ? 1 : 0;
    if (numbering.delta !== 0) {
      const shifted = renumberPose(makePose(H, model, img.width, img.height), numbering.delta);
      const again = refinePose(img, shifted.H, model, { polarity: refined.polarity, windows: [0.2, 0.15] });
      if (again && again.fretsFound >= cfg.minFrets && again.support >= cfg.minSupport * 0.9) {
        H = again.H;
        refined = again;
      } else {
        H = shifted.H;
      }
    }
    lap('numbering');

    let pose = makePose(scaleH(H, factor), model, frame.width, frame.height, {
      confidence: best.confidence,
      mirrored: options.mirrored ?? false,
      leftHanded: options.leftHanded ?? false,
      numbering: source,
      numberingConfidence,
    });
    // Marker mode: stickers at known frets beat every other cue.
    let marked = false;
    if (options.markers) {
      const found = resolveMarkers(frame, pose.H, model, options.markers);
      if (found) {
        marked = true;
        stats.markerDelta = found.delta;
        stats.markerScore = found.score;
        pose = renumberPose(pose, found.delta, 'markers', Math.min(1, 0.6 + found.margin));
      }
    }
    // Re-detection after tracking was lost: the earlier numbering is carried over unless this frame
    // itself shows the nut or the inlays convincingly.
    const now = options.timeMs ?? clock + 33;
    // Only a caller who passes an earlier pose vouches that this is still the same neck in the same view.
    const earlier = !given ? null : given.numbering !== 'assumed' && given.numberingConfidence >= 0.5 ? given : anchor && now - anchor.time < 3000 ? anchor.pose : null;
    if (earlier && !marked && numberingConfidence < Math.max(0.85, earlier.numberingConfidence)) {
      const carried = carryNumbering(pose, earlier, refined.stringsLooked >= cfg.minStringsLooked && refined.stringSupport >= 0.6);
      if (carried) {
        stats.carriedDelta = carried.delta;
        pose = renumberPose(pose, carried.delta, 'tracked', carried.confidence);
      }
    }
    // A confirmation tap overrides whatever the image suggested.
    if (options.fretHint) pose = confirmFretAt(pose, options.fretHint.point, options.fretHint.fret) ?? pose;
    remember(pose, options.timeMs, refined, false);
    return finish(pose);
  };

  const track = (frame: Frame, previousPose: FretboardPose, options: DetectOptions = {}, view?: LineView): DetectionResult => {
    const t0 = performance.now();
    const timings: Record<string, number> = {};
    const done = (pose: FretboardPose | null, reason?: string, stats?: Record<string, number>): DetectionResult => {
      timings.total = performance.now() - t0;
      return { pose, diagnostics: { timings, reason, stats } };
    };
    tracked = null;
    if (!frame || frame.width < 32 || frame.height < 32 || !previousPose) return done(null, 'bad-input');
    const { img, factor } = view ?? prepare(frame);
    timings.gray = performance.now() - t0;
    // The previous pose may refer to a frame of another size (e.g. the display canvas).
    const toWork = (pose: FretboardPose): Mat3 => {
      const sx = img.width / pose.frameWidth;
      const sy = img.height / pose.frameHeight;
      const P = pose.H;
      return [P[0] * sx, P[1] * sx, P[2] * sx, P[3] * sy, P[4] * sy, P[5] * sy, P[6], P[7], P[8]];
    };
    const model = previousPose.model;
    const H0 = toWork(previousPose);
    // Our own memory only applies when the caller hands back the pose we returned last.
    const mine = state !== null && sameH(state.last.H, previousPose.H) ? state : null;
    const now = options.timeMs ?? (mine ? mine.lastTime + 33 : undefined);
    // On the first frame after a calibration nothing is known about the strings yet.
    const seen = mine ? mine.stringsSeen : 0;

    // Where to start: the previous pose, or (if the neck was moving) where it should be by now.
    const starts: Mat3[] = [];
    if (mine && mine.before && now !== undefined && mine.lastTime > mine.beforeTime) {
      const steps = Math.min(3, (now - mine.lastTime) / (mine.lastTime - mine.beforeTime));
      if (steps > 0) {
        const predicted = extrapolatePose(mine.before, mine.last, steps);
        const moved = poseShiftPx(predicted, mine.last);
        if (moved > 1.5 && moved < 0.2 * frame.width) starts.push(toWork(predicted));
      }
    }
    starts.push(H0);

    // How far the comb may slide along the neck between two frames: about one and a half of its widest cells.
    const yc = boardCenterY(model);
    const vis = previousPose.visibleFrets;
    const a = applyHomography(H0, fretX(model, Math.max(0, vis.min)), yc);
    const b = applyHomography(H0, fretX(model, Math.max(0, vis.min) + 1), yc);
    const along = Math.min(0.12 * img.width, 1.5 * Math.hypot(a.x - b.x, a.y - b.y));

    let refined: RefineResult | null = null;
    const stringsHeld = (r: RefineResult): boolean => r.stringsLooked < cfg.minStringsLooked || r.stringSupport >= 0.7;
    for (const start of starts) {
      let r = refinePose(img, start, model, { windows: [0.36, 0.22, 0.14], priorWeight: 0.6, alongSearch: along, polarity: mine?.polarity, stringPolarity: mine?.stringPolarity, stringLock: false });
      if (r && !stringsHeld(r)) {
        // The strings slipped out of reach of the one-by-one search: place the comb of six afresh.
        const relocked = refinePose(img, start, model, { windows: [0.36, 0.22, 0.14], priorWeight: 0.6, alongSearch: along, polarity: mine?.polarity, stringPolarity: mine?.stringPolarity });
        if (relocked && relocked.stringSupport * relocked.support > r.stringSupport * r.support) r = relocked;
      }
      if (r && (!refined || r.support * r.fretsFound > refined.support * refined.fretsFound)) refined = r;
      if (refined && trackOk(refined, seen)) break;
    }
    if (!refined || !trackOk(refined, seen)) {
      // One more try with a long reach along the neck: the comb is not periodic, so sliding it has a
      // single good position even several frets away (the slip check below keeps the numbers right).
      const r = refinePose(img, H0, model, { windows: [0.36, 0.22, 0.14], priorWeight: 0.3, alongSearch: Math.min(0.3 * img.width, 2.5 * along), polarity: mine?.polarity, stringPolarity: mine?.stringPolarity });
      if (r && trackOk(r, seen) && r.support >= cfg.minSupport) refined = r;
    }
    if (refined && trackOk(refined, seen) && refined.support < 0.72 && refined.fretsExpected - refined.fretsFound >= 3) {
      // A partial lock (after an occlusion, say): wires further along are predicted too far off to be
      // picked up by the narrow search. Reach for them once with wide windows; keep it only if more of
      // the comb is supported afterwards.
      const wider = refinePose(img, refined.H, model, { windows: [0.5, 0.3, 0.16], priorWeight: 0.3, polarity: refined.polarity, ridge: refined.ridgeScale, stringPolarity: refined.stringPolarity, stringLock: false });
      if (wider && trackOk(wider, seen) && wider.fretsFound > refined.fretsFound && wider.support >= refined.support + 0.06) refined = wider;
    }
    if (refined && trackOk(refined, seen) && refined.stringsLooked >= cfg.minStringsLooked && refined.edgeSupport < 0.75 && refined.stringSupport < 0.95) {
      // A fast move across the neck can leave the strings matched one string off: five of six are
      // found and the wires end early on one side. Try the pose one string up and one string down.
      const xm = fretX(model, (Math.max(0, vis.min) + Math.max(1, vis.max)) / 2);
      const oneString = (2 * stringSpanAt(model, xm)) / boardWidthAt(model, xm) / Math.max(1, model.stringCount - 1);
      let score = refined.stringSupport + refined.edgeSupport;
      for (const side of [-1, 1]) {
        const moved = refinePose(img, applyAcross(refined.H, model, { scale: 1, shift: side * oneString }), model, { windows: [0.2, 0.14], priorWeight: 0.6, polarity: refined.polarity, ridge: refined.ridgeScale, stringPolarity: refined.stringPolarity, stringLock: false });
        if (moved && trackOk(moved, seen) && moved.stringSupport + moved.edgeSupport > score + 0.2) {
          refined = moved;
          score = moved.stringSupport + moved.edgeSupport;
        }
      }
    }
    timings.refine = performance.now() - t0 - timings.gray;
    if (!refined) return done(null, 'lost-no-evidence');
    const stats: Record<string, number> = { support: refined.support, antiSupport: refined.antiSupport, fretsFound: refined.fretsFound, edgeSupport: refined.edgeSupport, edgeError: refined.edgeError, edgeShift: refined.edgeShift, stringSupport: refined.stringSupport, stringsLooked: refined.stringsLooked, residualPx: refined.residualPx, polarity: refined.polarity };
    if (!trackOk(refined, seen)) return done(null, refined.stringsLooked >= cfg.minStringsLooked && refined.stringSupport < 0.3 ? 'lost-no-strings' : 'lost-weak-support', stats);

    // A whole-fret slip keeps every wire on a wire but changes the scale along the neck by 5.9%
    // while the scale across it stays put: far more than any real motion does between two frames.
    let H = refined.H;
    const slipped = numberingFromEarlier(makePose(H, model, img.width, img.height), makePose(H0, model, img.width, img.height), 4, 0);
    if (slipped && slipped.delta !== 0 && slipped.residual < 0.3 && slipped.unchanged > 0.6) {
      const fixed = renumberPose(makePose(H, model, img.width, img.height), slipped.delta);
      const again = refinePose(img, fixed.H, model, { windows: [0.2, 0.14], priorWeight: 0.6, polarity: refined.polarity, stringPolarity: refined.stringPolarity });
      if (again && trackOk(again, seen)) {
        H = again.H;
        refined = again;
        stats.slipFixed = -slipped.delta;
      }
    }

    let pose = makePose(scaleH(H, factor), model, frame.width, frame.height, {
      confidence: confidenceOf(refined),
      mirrored: options.mirrored ?? previousPose.mirrored,
      leftHanded: options.leftHanded ?? previousPose.leftHanded,
      numbering: previousPose.numbering === 'assumed' ? 'assumed' : 'tracked',
      numberingConfidence: previousPose.numberingConfidence,
    });
    // Still unsure of the numbers (a re-detection that could not tell): keep trying to recover them
    // from the last trusted pose, now that tracking has the strings.
    if (pose.numberingConfidence < 0.5 && anchor && (now ?? clock + 33) - anchor.time < 3000) {
      const carried = carryNumbering(pose, anchor.pose, refined.stringsLooked >= cfg.minStringsLooked && refined.stringSupport >= 0.6);
      if (carried && carried.confidence >= 0.5) {
        stats.carriedDelta = carried.delta;
        pose = renumberPose(pose, carried.delta, 'tracked', carried.confidence);
      }
    }
    // A confirmation tap overrides the numbers being carried.
    if (options.fretHint) pose = confirmFretAt(pose, options.fretHint.point, options.fretHint.fret) ?? pose;
    remember(pose, now, refined, mine !== null);
    tracked = refined;
    return done(pose, undefined, stats);
  };

  return {
    name: 'lines',
    detect,
    track,
    prepare,
    lastTrackEvidence: () => tracked,
    propose: (view, model, options = {}, limits = {}, diagnostics) => search(view.img, view.factor, model, options, { ...cfg, ...limits }, diagnostics?.timings ?? {}, diagnostics?.stats ?? {}, diagnostics?.features),
    reset: () => {
      state = null;
      anchor = null;
      clock = 0;
      tracked = null;
    },
  };
}

/** Factory the benchmark runner looks for. */
export function createDetector(): Detector {
  return createLineDetector();
}

/** The same detector with `diagnostics.features` filled in, for failure dumps (VISION_EXPORT=createDebugDetector). */
export function createDebugDetector(): Detector {
  return createLineDetector({ debug: true });
}

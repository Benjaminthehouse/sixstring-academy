/**
 * Colour marker mode: two bits of coloured tape (or stickers) on the neck at known frets, whose
 * colours the learner sampled with one tap each. They are found by colour in every frame and serve
 * as anchors: the two blob centres pin the board's position, direction and scale along the neck
 * (a pose hypothesis the detector then fits to the wires and strings), and the cells they sit in fix
 * the fret numbers whatever else is in view.
 *
 * Everything here works on RGBA frames with typed scratch buffers; nothing allocates per pixel.
 */
import { applyHomography, boardEdgeY, expectedOrientation, fretAtX, fretX, invertHomography, markerHintPlanePoints, renumberPose, stringSpacingAt } from './geometry';
import type { DetectOptions, Frame, FretboardPose, MarkerColor, MarkerHint, Mat3, NeckModel, Point } from './types';

export type { MarkerColor } from './types';

/** Hue (degrees), saturation and value (0..1) of an 8-bit RGB triple. */
function hsv(r: number, g: number, b: number, out: Float32Array): void {
  const max = r > g ? (r > b ? r : b) : g > b ? g : b;
  const min = r < g ? (r < b ? r : b) : g < b ? g : b;
  const c = max - min;
  out[2] = max / 255;
  if (max <= 0 || c <= 0) {
    out[0] = 0;
    out[1] = 0;
    return;
  }
  let h: number;
  if (max === r) h = (g - b) / c;
  else if (max === g) h = (b - r) / c + 2;
  else h = (r - g) / c + 4;
  h *= 60;
  if (h < 0) h += 360;
  out[0] = h;
  out[1] = c / max;
}

function hueDistance(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

const HSV = new Float32Array(3);

/** The least saturated sample accepted as a marker (grey, white, black, skin and maple are not markers). */
export const MIN_MARKER_SATURATION = 0.55;
/** The least chroma (max - min channel, 0..1) accepted: dark saturated browns (rosewood, a shadow) are not markers. */
export const MIN_MARKER_CHROMA = 0.3;

function chromaOf(r: number, g: number, b: number): number {
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}

/**
 * The colour of the marker under a tap: the dominant hue among the most colourful pixels within
 * `radius` pixels of `point` (a tap a few pixels off still finds a small sticker). Null when nothing
 * there is colourful enough to follow (ask for brighter tape).
 */
export function sampleMarkerColor(frame: Frame, point: Point, radius?: number): MarkerColor | null {
  const r = Math.max(2, Math.round(radius ?? Math.max(4, Math.min(frame.width, frame.height) / 60)));
  const cx = Math.floor(point.x);
  const cy = Math.floor(point.y);
  const px: number[] = [];
  let best = 0;
  for (let y = cy - r; y <= cy + r; y++) {
    if (y < 0 || y >= frame.height) continue;
    for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || x >= frame.width || (x - cx) * (x - cx) + (y - cy) * (y - cy) > r * r) continue;
      const i = (y * frame.width + x) * 4;
      hsv(frame.data[i], frame.data[i + 1], frame.data[i + 2], HSV);
      const score = HSV[1] * Math.min(1, HSV[2] * 1.6);
      if (score > best) best = score;
      px.push(i, score);
    }
  }
  if (best < MIN_MARKER_SATURATION * 0.6) return null;
  // The colourful pixels vote for a hue (24 bins); the dominant hue and its neighbours make the colour.
  const bins = new Float64Array(24);
  for (let k = 0; k < px.length; k += 2) {
    if (px[k + 1] < 0.6 * best) continue;
    const i = px[k];
    hsv(frame.data[i], frame.data[i + 1], frame.data[i + 2], HSV);
    bins[Math.floor(HSV[0] / 15) % 24] += px[k + 1];
  }
  let peak = 0;
  for (let b = 1; b < 24; b++) if (bins[b] > bins[peak]) peak = b;
  const centre = peak * 15 + 7.5;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let n = 0;
  let sx = 0;
  let sy = 0;
  const hues: number[] = [];
  for (let k = 0; k < px.length; k += 2) {
    if (px[k + 1] < 0.6 * best) continue;
    const i = px[k];
    hsv(frame.data[i], frame.data[i + 1], frame.data[i + 2], HSV);
    if (hueDistance(HSV[0], centre) > 22.5) continue;
    sr += frame.data[i];
    sg += frame.data[i + 1];
    sb += frame.data[i + 2];
    const a = (HSV[0] * Math.PI) / 180;
    sx += Math.cos(a);
    sy += Math.sin(a);
    hues.push(HSV[0]);
    n++;
  }
  if (n === 0) return null;
  const rgb = [sr / n, sg / n, sb / n];
  hsv(rgb[0], rgb[1], rgb[2], HSV);
  if (HSV[1] < MIN_MARKER_SATURATION || chromaOf(rgb[0], rgb[1], rgb[2]) < MIN_MARKER_CHROMA) return null;
  let hue = (Math.atan2(sy, sx) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  let spread = 0;
  for (const h of hues) spread += hueDistance(h, hue) ** 2;
  spread = Math.sqrt(spread / hues.length);
  return { r: Math.round(rgb[0]), g: Math.round(rgb[1]), b: Math.round(rgb[2]), hue, saturation: HSV[1], value: HSV[2], spread };
}

/** A connected patch of marker-coloured pixels. */
export interface ColorBlob {
  /** Centre (frame pixels), weighted by how well each pixel matches. */
  x: number;
  y: number;
  /** Pixels in the patch. */
  area: number;
  /** Mean match 0..1 of its pixels. */
  score: number;
}

/** Reusable buffers for `findColorBlobs` (one per stream). */
export interface BlobScratch {
  match: Float32Array;
  labels: Int32Array;
  parent: Int32Array;
}

/** Fresh scratch buffers (they grow on demand). */
export function createBlobScratch(): BlobScratch {
  return { match: new Float32Array(0), labels: new Int32Array(0), parent: new Int32Array(0) };
}

/** Pixel rectangle [x0, x1) x [y0, y1). */
export interface PixelBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function findRoot(parent: Int32Array, a: number): number {
  let r = a;
  while (parent[r] !== r) r = parent[r];
  // Path compression, iteratively.
  while (parent[a] !== r) {
    const next = parent[a];
    parent[a] = r;
    a = next;
  }
  return r;
}

/** How well one pixel matches a sampled colour, 0..1 (0 = not the marker). `minChroma` in 0..255 units. */
function matchPixel(r: number, g: number, b: number, color: MarkerColor, hueTolerance: number, minChroma: number): number {
  const max = r > g ? (r > b ? r : b) : g > b ? g : b;
  const min = r < g ? (r < b ? r : b) : g < b ? g : b;
  // The tape in shadow keeps about half its chroma; wood of the same hue has far less.
  if (max - min < minChroma) return 0;
  hsv(r, g, b, HSV);
  const sat = HSV[1];
  if (sat < Math.max(0.2, 0.5 * color.saturation)) return 0;
  const d = hueDistance(HSV[0], color.hue);
  if (d >= hueTolerance) return 0;
  return (1 - d / hueTolerance) * Math.min(1, sat / color.saturation);
}

/**
 * Patches of `color` in `frame` (inside `box`, default the whole frame), largest first. Patches
 * smaller than `minArea` pixels or larger than `maxAreaFraction` of the frame are ignored.
 */
export function findColorBlobs(
  frame: Frame,
  color: MarkerColor,
  options: { box?: PixelBox; minArea?: number; maxAreaFraction?: number; maxBlobs?: number } = {},
  scratch: BlobScratch = createBlobScratch(),
): ColorBlob[] {
  const W = frame.width;
  const H = frame.height;
  const box = options.box ?? { x0: 0, y0: 0, x1: W, y1: H };
  const x0 = Math.max(0, Math.floor(box.x0));
  const y0 = Math.max(0, Math.floor(box.y0));
  const x1 = Math.min(W, Math.ceil(box.x1));
  const y1 = Math.min(H, Math.ceil(box.y1));
  const bw = x1 - x0;
  const bh = y1 - y0;
  if (bw <= 0 || bh <= 0) return [];
  const n = bw * bh;
  if (scratch.match.length < n) {
    scratch.match = new Float32Array(n);
    scratch.labels = new Int32Array(n);
    scratch.parent = new Int32Array(n + 1);
  }
  const match = scratch.match;
  const labels = scratch.labels;
  const parent = scratch.parent;
  const tol = Math.min(40, Math.max(14, 12 + 1.5 * color.spread));
  const minChroma = Math.max(0.12, 0.45 * chromaOf(color.r, color.g, color.b)) * 255;
  const data = frame.data;
  // Pass 1: match, and label with union-find over the left and upper neighbours.
  let next = 1;
  parent[0] = 0;
  for (let y = 0; y < bh; y++) {
    let i = ((y0 + y) * W + x0) * 4;
    const row = y * bw;
    for (let x = 0; x < bw; x++, i += 4) {
      const m = matchPixel(data[i], data[i + 1], data[i + 2], color, tol, minChroma);
      match[row + x] = m;
      if (m <= 0) {
        labels[row + x] = 0;
        continue;
      }
      const left = x > 0 ? labels[row + x - 1] : 0;
      const up = y > 0 ? labels[row - bw + x] : 0;
      if (left === 0 && up === 0) {
        parent[next] = next;
        labels[row + x] = next++;
      } else if (left !== 0 && up !== 0) {
        const a = findRoot(parent, left);
        const b = findRoot(parent, up);
        if (a !== b) parent[a < b ? b : a] = a < b ? a : b;
        labels[row + x] = a < b ? a : b;
      } else labels[row + x] = left !== 0 ? left : up;
    }
  }
  if (next === 1) return [];
  // Pass 2: accumulate per root.
  const count = new Float64Array(next);
  const weight = new Float64Array(next);
  const sumX = new Float64Array(next);
  const sumY = new Float64Array(next);
  for (let y = 0; y < bh; y++) {
    const row = y * bw;
    for (let x = 0; x < bw; x++) {
      const l = labels[row + x];
      if (l === 0) continue;
      const r = findRoot(parent, l);
      const m = match[row + x];
      count[r]++;
      weight[r] += m;
      sumX[r] += m * (x0 + x + 0.5);
      sumY[r] += m * (y0 + y + 0.5);
    }
  }
  const minArea = options.minArea ?? 3;
  const maxArea = (options.maxAreaFraction ?? 0.03) * W * H;
  const blobs: ColorBlob[] = [];
  for (let r = 1; r < next; r++) {
    if (count[r] < minArea || count[r] > maxArea || weight[r] <= 0) continue;
    blobs.push({ x: sumX[r] / weight[r], y: sumY[r] / weight[r], area: count[r], score: weight[r] / count[r] });
  }
  blobs.sort((a, b) => b.area * b.score - a.area * a.score);
  return blobs.slice(0, options.maxBlobs ?? 8);
}

/** Plane positions of the markers of `hint` (centres, neck-plane mm). */
export function markerPlanePoints(model: NeckModel, hint: MarkerHint): Point[] {
  return markerHintPlanePoints(model, hint);
}

/**
 * Board hypotheses from two blob centres: a similarity transform (position, direction, scale along
 * the neck; the board's own width for the scale across) that puts marker 0 on `a` and marker 1 on
 * `b`. The handedness flags fix which side the strings go, so a pair gives one hypothesis; with
 * `bothWays` (markers of the same colour) the swapped pair is returned too. Homographies map
 * neck-plane mm to frame pixels.
 */
export function markerHypotheses(a: Point, b: Point, model: NeckModel, hint: MarkerHint, flags: { mirrored?: boolean; leftHanded?: boolean }, bothWays = false, foreshortening: readonly number[] = [1]): Mat3[] {
  const plane = markerHintPlanePoints(model, hint);
  if (plane.length < 2) return [];
  const orientation = expectedOrientation(flags.mirrored ?? false, flags.leftHanded ?? false);
  const out: Mat3[] = [];
  const pairs: [Point, Point][] = bothWays ? [[a, b], [b, a]] : [[a, b]];
  for (const [p, q] of pairs) {
    const S = similarity(plane[0], plane[1], p, q, orientation);
    if (!S) continue;
    for (const r of foreshortening) {
      const T = alongNeckPerspective(plane[0].x, plane[1].x, r);
      out.push(T ? multiply3(S, T) : S);
    }
  }
  return out;
}

/**
 * A plane homography that keeps x = xa and x = xb where they are but makes the neck recede: the
 * local scale at xa is `ratio` times the one at xb (a guitar turned about the vertical axis). Null
 * for ratio 1 (no change).
 */
function alongNeckPerspective(xa: number, xb: number, ratio: number): Mat3 | null {
  if (Math.abs(ratio - 1) < 1e-6 || Math.abs(xa - ratio * xb) < 1e-9) return null;
  // x' = (a x + b) / (c x + 1) with xa, xb fixed; y' = y * k / (c x + 1), k keeps the scale across at the midpoint.
  const c = (ratio - 1) / (xa - ratio * xb);
  const a = 1 + c * (xa + xb);
  const b = -c * xa * xb;
  const k = c * 0.5 * (xa + xb) + 1;
  return [a, 0, b, 0, k, 0, c, 0, 1];
}

function multiply3(m: Mat3, n: Mat3): Mat3 {
  const o: number[] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o.push(m[i * 3] * n[j] + m[i * 3 + 1] * n[3 + j] + m[i * 3 + 2] * n[6 + j]);
  return o as unknown as Mat3;
}

/** Similarity (with the given orientation) taking plane points p0, p1 to image points q0, q1. */
function similarity(p0: Point, p1: Point, q0: Point, q1: Point, orientation: 1 | -1): Mat3 | null {
  const dpx = p1.x - p0.x;
  const dpy = (p1.y - p0.y) * orientation;
  const dqx = q1.x - q0.x;
  const dqy = q1.y - q0.y;
  const lp = Math.hypot(dpx, dpy);
  const lq = Math.hypot(dqx, dqy);
  if (lp < 1e-6 || lq < 1e-6) return null;
  const s = lq / lp;
  const theta = Math.atan2(dqy, dqx) - Math.atan2(dpy, dpx);
  const c = s * Math.cos(theta);
  const d = s * Math.sin(theta);
  // image = [c -d; d c] * [x; orientation * y] + t
  const m00 = c;
  const m01 = -d * orientation;
  const m10 = d;
  const m11 = c * orientation;
  const tx = q0.x - (m00 * p0.x + m01 * p0.y);
  const ty = q0.y - (m10 * p0.x + m11 * p0.y);
  return [m00, m01, tx, m10, m11, ty, 0, 0, 1];
}

/** Where a marker of `hint` should appear under a pose, and how far it may stray (pixels). */
export interface MarkerExpectation {
  /** Image position of the marker centre. */
  at: Point;
  /** Half a fret cell along the neck at the marker, in pixels. */
  alongPx: number;
  /** One string spacing at the marker, in pixels. */
  acrossPx: number;
}

/** Expected image positions of the markers under homography `H`. */
export function expectMarkers(H: Mat3, model: NeckModel, hint: MarkerHint): MarkerExpectation[] {
  return markerHintPlanePoints(model, hint).map((p, k) => {
    const fret = hint.frets[k];
    const at = applyHomography(H, p.x, p.y);
    const a = applyHomography(H, fretX(model, fret - 1), p.y);
    const b = applyHomography(H, fretX(model, fret), p.y);
    const s = applyHomography(H, p.x, p.y + stringSpacingAt(model, p.x));
    return { at, alongPx: 0.5 * Math.hypot(b.x - a.x, b.y - a.y), acrossPx: Math.hypot(s.x - at.x, s.y - at.y) };
  });
}

/** What the markers in view say about a pose's fret numbers. */
export interface MarkerReading {
  /** Add this to every fret number of the pose (0 = the numbering is right). */
  delta: number;
  /** Markers that were seen and agree with `delta`. */
  seen: number;
  /** Markers seen in the board's neighbourhood that disagree. */
  conflicts: number;
}

/**
 * Read the fret numbers off blob positions: for each marker, the cell its blob falls in under
 * homography `H` (the board must be right up to whole frets). A blob counts only near the board
 * edge the marker sits on. Null when no marker is seen.
 */
export function readMarkerNumbering(H: Mat3, model: NeckModel, hint: MarkerHint, blobsPerMarker: readonly (ColorBlob | null)[]): MarkerReading | null {
  const inv = invertHomography(H);
  if (!inv) return null;
  const plane = markerHintPlanePoints(model, hint);
  const deltas: number[] = [];
  for (let k = 0; k < plane.length && k < blobsPerMarker.length; k++) {
    const blob = blobsPerMarker[k];
    if (!blob) continue;
    const q = applyHomography(inv, blob.x, blob.y);
    if (!Number.isFinite(q.x + q.y)) continue;
    // Across the neck the blob must be where the marker was put (it straddles the edge or sits on
    // the centre line: within about a string spacing), and along the neck in the middle of a cell
    // (where the learner was asked to put it, like an inlay dot). Other things of the colour (a
    // book, a shirt stripe, the body) rarely pass both.
    const yTarget = hint.placement === 'board' ? model.nutWidth / 2 : boardEdgeY(model, Math.max(0, q.x), hint.placement === 'treble-edge' ? 'treble' : 'bass');
    const across = Math.abs(q.y - yTarget);
    if (across > 1.3 * stringSpacingAt(model, Math.max(0, q.x))) continue;
    const exact = fretAtX(model, q.x);
    if (!Number.isFinite(exact)) continue;
    const cell = Math.ceil(exact);
    const lo = fretX(model, cell - 1);
    const hi = fretX(model, cell);
    const within = (q.x - lo) / (hi - lo);
    if (!(within > 0.2 && within < 0.8)) continue;
    deltas.push(hint.frets[k] - cell);
  }
  if (deltas.length === 0) return null;
  const delta = deltas[0];
  const seen = deltas.filter((d) => d === delta).length;
  return { delta, seen, conflicts: deltas.length - seen };
}

/** Local scale at the first marker over the one at the second, for the perspective variants of a pair. */
const FORESHORTENING = [1, 0.8, 1.25];

/** Fits outside hypotheses to the image (the production detector's `fit`). */
export type HypothesisFitter = (hypotheses: readonly Mat3[]) => { pose: FretboardPose; evidence: number; index: number } | null;

/** Settings of `MarkerAnchor`. */
export interface MarkerAnchorOptions {
  /** Log-odds a board found from the markers needs (default -0.5: two markers of the sampled colours at a plausible distance are evidence in themselves). */
  minEvidence?: number;
  /** Frames a single visible marker must disagree in a row before it renumbers (default 0: one marker never renumbers). */
  singleMarkerFrames?: number;
  /** Most hypotheses fitted per frame (default 9: three blob pairs, three perspectives each). */
  maxHypotheses?: number;
}

/**
 * Marker mode in the tracker: per frame, the blobs of the sampled colours either confirm (or fix)
 * the fret numbers of the pose the detector found, or, when the detector found nothing, give board
 * hypotheses for the detector to fit. One per stream; it keeps scratch buffers.
 */
export class MarkerAnchor {
  private readonly scratch = createBlobScratch();
  private readonly o: Required<MarkerAnchorOptions>;
  private single = { delta: 0, count: 0 };
  /** Blob centres of the last frame (per marker; null = not seen), for overlays and tests. */
  lastBlobs: (ColorBlob | null)[] = [];

  /** Create an anchor; see `MarkerAnchorOptions`. */
  constructor(options: MarkerAnchorOptions = {}) {
    this.o = { minEvidence: 1, singleMarkerFrames: 0, maxHypotheses: 9, ...options };
  }

  /** Forget the history (a new board, a reset). */
  reset(): void {
    this.single = { delta: 0, count: 0 };
    this.lastBlobs = [];
  }

  private colorOf(hint: MarkerHint, k: number): MarkerColor | null {
    const colors = hint.colors ?? [];
    return colors[k] ?? colors[0] ?? null;
  }

  /** The blob of each marker nearest to where `pose` expects it (within a few cells). */
  private near(frame: Frame, pose: FretboardPose, hint: MarkerHint): (ColorBlob | null)[] {
    const expected = expectMarkers(pose.H, pose.model, hint);
    return expected.map((e, k) => {
      const color = this.colorOf(hint, k);
      if (!color || !Number.isFinite(e.at.x + e.at.y + e.alongPx + e.acrossPx)) return null;
      const r = Math.max(10, 7 * e.alongPx, 3 * e.acrossPx);
      const box = { x0: e.at.x - r, y0: e.at.y - r, x1: e.at.x + r, y1: e.at.y + r };
      const blobs = findColorBlobs(frame, color, { box, maxBlobs: 6 }, this.scratch);
      let best: ColorBlob | null = null;
      let bestD = Infinity;
      for (const b of blobs) {
        const d = Math.hypot(b.x - e.at.x, b.y - e.at.y);
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
      return best;
    });
  }

  /**
   * The detector found `pose`: let the markers in view confirm its fret numbers ('markers'), or
   * shift them (both markers at once; one marker after a few frames in a row).
   */
  check(frame: Frame, pose: FretboardPose, hint: MarkerHint): FretboardPose {
    const blobs = this.near(frame, pose, hint);
    this.lastBlobs = blobs;
    const reading = readMarkerNumbering(pose.H, pose.model, hint, blobs);
    if (!reading || reading.conflicts > 0) {
      this.single.count = 0;
      return pose;
    }
    const firm = pose.numbering !== 'assumed' && pose.numberingConfidence >= 0.5;
    if (reading.delta === 0) {
      this.single.count = 0;
      // One marker alone could be something else of its colour next to the board: it may back up
      // numbers that rest on something, never turn a guess into a certainty.
      if (reading.seen < 2 && !firm) return pose;
      const sure = reading.seen >= 2 ? 0.97 : 0.9;
      if (pose.numbering === 'user' || (pose.numbering === 'markers' && pose.numberingConfidence >= sure)) return pose;
      return { ...pose, numbering: 'markers', numberingConfidence: Math.max(sure, pose.numbering === 'assumed' ? 0 : pose.numberingConfidence) };
    }
    // Both markers say the numbers are off: a guess gives way at once; numbers the detector read off
    // the nut or the inlays when the markers keep saying it (two frames in a row). One marker alone
    // renumbers only if `singleMarkerFrames` allows it (off by default, see above).
    if (reading.seen < 2 && this.o.singleMarkerFrames <= 0) {
      this.single.count = 0;
      return pose;
    }
    const needed = reading.seen >= 2 ? (firm ? 2 : 1) : this.o.singleMarkerFrames;
    if (this.single.delta === reading.delta) this.single.count++;
    else this.single = { delta: reading.delta, count: 1 };
    if (this.single.count >= needed) {
      this.single.count = 0;
      return renumberPose(pose, reading.delta, 'markers', reading.seen >= 2 ? 0.97 : 0.9);
    }
    return pose;
  }

  /**
   * The detector found nothing: look for both markers anywhere in the frame and let `fit` try the
   * boards they imply. Returns a pose numbered by the markers, or null.
   */
  acquire(frame: Frame, hint: MarkerHint, model: NeckModel, flags: Pick<DetectOptions, 'mirrored' | 'leftHanded' | 'bassSideUp'>, fit: HypothesisFitter): FretboardPose | null {
    if (hint.frets.length < 2) return null;
    const c0 = this.colorOf(hint, 0);
    const c1 = this.colorOf(hint, 1);
    if (!c0 || !c1) return null;
    const same = hint.colors === undefined || hint.colors.length < 2 || hueDistance(c0.hue, c1.hue) < 20;
    const a = findColorBlobs(frame, c0, { maxBlobs: same ? 5 : 3 }, this.scratch);
    const b = same ? a : findColorBlobs(frame, c1, { maxBlobs: 3 }, this.scratch);
    this.lastBlobs = [a[0] ?? null, b[0] ?? null];
    if (a.length === 0 || b.length === 0) return null;
    const plane = markerHintPlanePoints(model, hint);
    const planeDist = Math.hypot(plane[1].x - plane[0].x, plane[1].y - plane[0].y);
    // A neck spanning 25-100% of the frame width: 0.2-2.5 px per mm at 640 px wide.
    const lo = 0.2 * (frame.width / 640) * planeDist;
    const hi = 2.5 * (frame.width / 640) * planeDist;
    const pairs: { p: ColorBlob; q: ColorBlob; strength: number }[] = [];
    for (let i = 0; i < a.length; i++) {
      for (let j = same ? i + 1 : 0; j < b.length; j++) {
        const p = a[i];
        const q = b[j];
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < lo || d > hi) continue;
        // Two stickers of one size at about one depth look alike: prefer pairs of similar blobs.
        const alike = Math.min(p.area, q.area) / Math.max(p.area, q.area);
        pairs.push({ p, q, strength: Math.sqrt(p.score * q.score) * alike * Math.log1p(Math.min(p.area, q.area)) });
      }
    }
    pairs.sort((x, y) => y.strength - x.strength);
    const hypotheses: Mat3[] = [];
    const owners: [ColorBlob, ColorBlob][] = [];
    for (const pair of pairs) {
      // Same-coloured markers could be either way round.
      const orders: [ColorBlob, ColorBlob][] = same ? [[pair.p, pair.q], [pair.q, pair.p]] : [[pair.p, pair.q]];
      for (const [m0, m1] of orders) {
        // A similarity, and the same with the neck receding either way (the perspective of a turned guitar).
        const variants = markerHypotheses(m0, m1, model, hint, flags, false, FORESHORTENING);
        // ... and the way round that puts the bass edge where the camera sees it is the one to try.
        if (variants.length === 0 || (same && !bassSideAsExpected(variants[0], model, flags.bassSideUp ?? true))) continue;
        for (const H of variants) {
          hypotheses.push(H);
          owners.push([m0, m1]);
        }
      }
      if (hypotheses.length >= this.o.maxHypotheses) break;
    }
    if (hypotheses.length === 0) return null;
    const best = fit(hypotheses.slice(0, this.o.maxHypotheses));
    if (!best || best.evidence < this.o.minEvidence) return null;
    // The fitted board must still put both markers in their cells.
    const reading = readMarkerNumbering(best.pose.H, model, hint, owners[best.index] ?? [null, null]);
    if (!reading || reading.seen < 2 || reading.conflicts > 0) return null;
    this.lastBlobs = owners[best.index];
    const pose = renumberPose(best.pose, reading.delta, 'markers', 0.95);
    return { ...pose, confidence: Math.max(pose.confidence, 1 / (1 + Math.exp(-(best.evidence + 1.5)))) };
  }
}

/** Is the bass edge of this hypothesis on the side `bassSideUp` says (above the treble edge for a level neck)? */
function bassSideAsExpected(H: Mat3, model: NeckModel, bassSideUp: boolean): boolean {
  const x = model.scaleLength / 4;
  const bass = applyHomography(H, x, boardEdgeY(model, x, 'bass'));
  const treble = applyHomography(H, x, boardEdgeY(model, x, 'treble'));
  const dy = treble.y - bass.y;
  const dx = treble.x - bass.x;
  // A neck standing nearly upright says nothing about up and down: accept both ways.
  if (Math.abs(dy) < 0.3 * Math.abs(dx)) return true;
  return bassSideUp ? dy > 0 : dy < 0;
}

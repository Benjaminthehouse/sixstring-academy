/**
 * Stage 1 of detection: where could a neck be?
 *
 * Fret wires are thin ridges, all (nearly) parallel, strung along the neck like the rungs of a
 * ladder. We measure a dense ridge field (strength, polarity and orientation of the thin-line
 * response at every pixel) and then take a Radon-like projection of it: every ridge pixel votes for
 * the lines that cross it roughly at right angles. A neck axis collects the votes of all its frets;
 * a long straight edge or a single line collects next to nothing, because lines along a ridge are
 * never voted for. The peaks of the accumulator are candidate neck axes for the later stages.
 */
import type { GrayImage } from './image';

/** Dense thin-line response of an image, plus the list of pixels that passed the threshold. */
export interface RidgeField {
  width: number;
  height: number;
  /** Signed strength: > 0 bright line on dark, < 0 dark line on bright, 0 below the noise threshold. */
  strength: Float32Array;
  /** Direction of the line's normal in degrees, 0..179 (0 = the line is vertical). */
  normalDeg: Uint8Array;
  /** The threshold that was applied (grey levels of second difference). */
  threshold: number;
  /** Number of ridge pixels; their pixel indices (row * width + column) are `index[0..count)`. */
  count: number;
  index: Int32Array;
}

/** Options of `computeRidgeField`. */
export interface RidgeFieldOptions {
  /** How strongly the first derivative suppresses the response, to reject step edges (default 1). */
  edgeSuppression?: number;
  /** Keep roughly this fraction of the pixels (default 0.14). */
  keepFraction?: number;
  /** Never keep a ridge weaker than this (default 0.7). */
  minStrength?: number;
}

const HIST = new Uint32Array(512);
let FLANK = new Uint8Array(0);

/**
 * Ridge field of a smoothed image (blur it with sigma about 1.2 first). The strength is the
 * dominant Hessian eigenvalue minus the other one (so blobs and corners score low) minus the
 * gradient magnitude (so the flanks of step edges score low).
 */
export function computeRidgeField(img: GrayImage, options: RidgeFieldOptions = {}, reuse?: RidgeField | null): RidgeField {
  const W = img.width;
  const Hh = img.height;
  const n = W * Hh;
  const field: RidgeField =
    reuse && reuse.strength.length === n ? reuse : { width: W, height: Hh, strength: new Float32Array(n), normalDeg: new Uint8Array(n), threshold: 0, count: 0, index: new Int32Array(n >> 2) };
  field.width = W;
  field.height = Hh;
  const s = field.strength;
  const ang = field.normalDeg;
  const d = img.data;
  const alpha = options.edgeSuppression ?? 1;
  s.fill(0);
  HIST.fill(0);
  const histScale = 16; // bins of 1/16 grey level, saturating at 32
  for (let y = 1; y < Hh - 1; y++) {
    for (let x = 1, i = y * W + 1; x < W - 1; x++, i++) {
      const c = d[i];
      const l = d[i - 1];
      const r = d[i + 1];
      const u = d[i - W];
      const b = d[i + W];
      const lxx = l + r - 2 * c;
      const lyy = u + b - 2 * c;
      const tr = lxx + lyy;
      const atr = tr < 0 ? -tr : tr;
      // Cheap bound: the strength never exceeds |trace|.
      if (atr < 0.5) continue;
      const lxy = 0.25 * (d[i + W + 1] + d[i - W - 1] - d[i + W - 1] - d[i - W + 1]);
      const hd = 0.5 * (lxx - lyy);
      const two = 2 * Math.sqrt(hd * hd + lxy * lxy);
      const gx = 0.5 * (r - l);
      const gy = 0.5 * (b - u);
      let v = (atr < two ? atr : two) - alpha * Math.sqrt(gx * gx + gy * gy);
      if (v <= 0) continue;
      s[i] = tr < 0 ? v : -v;
      if (v > 31.9) v = 31.9;
      HIST[(v * histScale) | 0]++;
    }
  }
  // Threshold at the requested quantile of all pixels.
  const keep = Math.min(field.index.length, Math.round((options.keepFraction ?? 0.14) * n));
  let acc = 0;
  let bin = 511;
  for (; bin > 0; bin--) {
    if (acc + HIST[bin] > keep) break;
    acc += HIST[bin];
  }
  const thr = Math.max(options.minStrength ?? 0.7, (bin + 1) / histScale);
  field.threshold = thr;
  let count = 0;
  const index = field.index;
  if (FLANK.length < (index.length >> 3) + 1) FLANK = new Uint8Array((index.length >> 3) + 1);
  for (let y = 1; y < Hh - 1; y++) {
    for (let x = 1, i = y * W + 1; x < W - 1; x++, i++) {
      const v = s[i];
      if (v === 0) continue;
      if ((v < 0 ? -v : v) < thr || count >= index.length) {
        s[i] = 0;
        continue;
      }
      const lxx = d[i - 1] + d[i + 1] - 2 * d[i];
      const lyy = d[i - W] + d[i + W] - 2 * d[i];
      const lxy = 0.25 * (d[i + W + 1] + d[i - W - 1] - d[i + W - 1] - d[i - W + 1]);
      // Direction of the eigenvector of the larger eigenvalue; a bright ridge's normal is the other one.
      let a = (0.5 * Math.atan2(2 * lxy, lxx - lyy) * 180) / Math.PI;
      if (v > 0) a += 90;
      if (a < 0) a += 180;
      if (a >= 180) a -= 180;
      ang[i] = a | 0;
      index[count++] = i;
    }
  }
  // A strong line has weak "lines" of the opposite polarity along both flanks (the image dips
  // beside a bright wire). Drop those: they would vote as a second, phantom ladder.
  let kept = 0;
  for (let p = 0; p < count; p++) {
    const i = index[p];
    const v = s[i];
    const a = (ang[i] * Math.PI) / 180;
    const cx = Math.cos(a);
    const cy = Math.sin(a);
    const x = i % W;
    const y = (i - x) / W;
    let flank = false;
    for (let step = 2; step <= 5 && !flank; step++) {
      for (let sign = -1; sign <= 1; sign += 2) {
        const xx = x + Math.round(sign * step * cx);
        const yy = y + Math.round(sign * step * cy);
        if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= Hh - 1) continue;
        const o = s[yy * W + xx];
        if (o * v < 0 && (o < 0 ? -o : o) > 3 * (v < 0 ? -v : v)) flank = true;
      }
    }
    if (flank) FLANK[p >> 3] |= 1 << (p & 7);
    else FLANK[p >> 3] &= ~(1 << (p & 7));
  }
  for (let p = 0; p < count; p++) {
    const i = index[p];
    if (FLANK[p >> 3] & (1 << (p & 7))) s[i] = 0;
    else index[kept++] = i;
  }
  field.count = kept;
  return field;
}

/** A candidate neck axis: a line in the working frame crossed by many parallel ridges. */
export interface AxisCandidate {
  /** Direction of the line in degrees, 0..179 (0 = horizontal, 90 = straight down). */
  thetaDeg: number;
  /** The point of the line nearest the image centre. */
  cx: number;
  cy: number;
  /** +1 when the crossing ridges are bright lines, -1 when they are dark. */
  polarity: 1 | -1;
  /** Typical normal direction of the crossing ridges in degrees (the axis is within 30 degrees of it). */
  ridgeNormalDeg: number;
  /** Accumulated ridge strength (relative units; larger = more or stronger crossings). */
  votes: number;
}

/** Number of orientation classes ridges are grouped into. */
export const CLASS_COUNT = 12;
/** Width of an orientation class in degrees. */
export const CLASS_STEP = 180 / CLASS_COUNT;
const THETA_STEP = 3;
const THETA_HALF = 10; // lines within +-30 degrees of the ridge normal
const THETA_COUNT = 2 * THETA_HALF + 1;
const RHO_STEP = 4;
const SMOOTH_HALF = 2;
const COS = new Float32Array(360);
const SIN = new Float32Array(360);
for (let a = 0; a < 360; a++) {
  COS[a] = Math.cos((a * Math.PI) / 180);
  SIN[a] = Math.sin((a * Math.PI) / 180);
}

let ACC_SCRATCH = new Float32Array(0);
let SMOOTH_SCRATCH = new Float32Array(0);
let USED_SCRATCH = new Uint8Array(0);

/** Smallest absolute difference between two undirected angles in degrees (0..90). */
export function angleDiffDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % 180;
  if (d > 90) d = 180 - d;
  return d;
}

/**
 * Radon-like vote of a ridge field for neck axes. Ridges are grouped by polarity and by orientation
 * (12 classes of 15 degrees, overlapping), so one accumulator slice only ever sees lines that could
 * be the frets of one neck. `next()` returns the strongest remaining candidate and then removes the
 * votes of every ridge pixel near it ("explaining away"), so the following candidates are different
 * structures rather than near-copies of the same one. Only one search may be in use at a time: the
 * accumulators are shared scratch buffers.
 */
export class AxisSearch {
  private readonly field: RidgeField;
  private readonly rhoMax: number;
  private readonly rhoBins: number;
  private readonly sliceSize: number;
  private readonly acc: Float32Array;
  private readonly smooth: Float32Array;
  private readonly used: Uint8Array;
  private readonly cap: number;
  private first = 0;

  constructor(field: RidgeField, region?: { x0: number; y0: number; x1: number; y1: number }) {
    this.field = field;
    const W = field.width;
    const Hh = field.height;
    // Offsets are measured from the image centre, so lines through the same region at slightly
    // different angles land in neighbouring bins.
    this.rhoMax = Math.ceil(Math.hypot(W, Hh) / 2) + 2;
    this.rhoBins = Math.ceil((2 * this.rhoMax) / RHO_STEP) + 1;
    this.sliceSize = THETA_COUNT * this.rhoBins;
    const total = 2 * CLASS_COUNT * this.sliceSize;
    // One search is alive at a time (per frame): reuse the big buffers instead of feeding the garbage collector.
    if (ACC_SCRATCH.length !== total) {
      ACC_SCRATCH = new Float32Array(total);
      SMOOTH_SCRATCH = new Float32Array(total);
    } else {
      ACC_SCRATCH.fill(0);
    }
    if (USED_SCRATCH.length < field.count) USED_SCRATCH = new Uint8Array(field.index.length);
    else USED_SCRATCH.fill(0, 0, field.count);
    this.acc = ACC_SCRATCH;
    this.smooth = SMOOTH_SCRATCH;
    this.used = USED_SCRATCH;
    this.cap = field.threshold * 4;
    const index = field.index;
    for (let p = 0; p < field.count; p++) {
      if (region) {
        const i = index[p];
        const x = i % W;
        const y = (i - x) / W;
        if (x < region.x0 || x > region.x1 || y < region.y0 || y > region.y1) {
          this.used[p] = 1;
          continue;
        }
      }
      this.vote(p, 1);
    }
    for (let slice = 0; slice < 2 * CLASS_COUNT; slice++) this.smoothSlice(slice);
  }

  private vote(p: number, sign: number): void {
    const f = this.field;
    const W = f.width;
    const i = f.index[p];
    const v = f.strength[i];
    const x = i % W;
    const px = x + 0.5 - W / 2;
    const py = (i - x) / W + 0.5 - f.height / 2;
    const pol = v > 0 ? 0 : 1;
    let w = v > 0 ? v : -v;
    if (w > this.cap) w = this.cap;
    w *= sign;
    const kf = f.normalDeg[i] / CLASS_STEP;
    const k0 = Math.round(kf);
    const frac = kf - k0;
    const kEnd = frac > 0.27 ? k0 + 1 : k0;
    const rhoBins = this.rhoBins;
    const rhoMax = this.rhoMax;
    const acc = this.acc;
    for (let kk = frac < -0.27 ? k0 - 1 : k0; kk <= kEnd; kk++) {
      const k = ((kk % CLASS_COUNT) + CLASS_COUNT) % CLASS_COUNT;
      const base = (pol * CLASS_COUNT + k) * this.sliceSize;
      const centre = k * CLASS_STEP;
      for (let t = 0; t < THETA_COUNT; t++) {
        let th = centre + (t - THETA_HALF) * THETA_STEP;
        if (th < 0) th += 360;
        const rho = -px * SIN[th] + py * COS[th];
        acc[base + t * rhoBins + (((rho + rhoMax) / RHO_STEP) | 0)] += w;
      }
    }
  }

  /** A neck is a band, not a line: sum over a window of offsets so the centre of the band peaks. */
  private smoothSlice(slice: number): void {
    const rhoBins = this.rhoBins;
    const acc = this.acc;
    const sm = this.smooth;
    for (let t = 0; t < THETA_COUNT; t++) {
      const o = slice * this.sliceSize + t * rhoBins;
      let run = 0;
      for (let b = 0; b < SMOOTH_HALF; b++) run += acc[o + b];
      for (let b = 0; b < rhoBins; b++) {
        if (b + SMOOTH_HALF < rhoBins) run += acc[o + b + SMOOTH_HALF];
        if (b - SMOOTH_HALF - 1 >= 0) run -= acc[o + b - SMOOTH_HALF - 1];
        sm[o + b] = run;
      }
    }
  }

  /**
   * The strongest remaining candidate, or null when nothing above `minRelative` of the first one is
   * left. Ridge pixels within `consumeBand` pixels of the returned line stop voting.
   */
  next(minRelative = 0.12, consumeBand = 36): AxisCandidate | null {
    const sm = this.smooth;
    let best = 0;
    let arg = -1;
    for (let i = 0; i < sm.length; i++) {
      if (sm[i] > best) {
        best = sm[i];
        arg = i;
      }
    }
    if (arg < 0) return null;
    if (this.first === 0) this.first = best;
    else if (best < minRelative * this.first) return null;
    const f = this.field;
    const W = f.width;
    const slice = Math.floor(arg / this.sliceSize);
    const pol = slice >= CLASS_COUNT ? 1 : 0;
    const k = slice - pol * CLASS_COUNT;
    const t = Math.floor((arg - slice * this.sliceSize) / this.rhoBins);
    const b = arg - slice * this.sliceSize - t * this.rhoBins;
    const thetaRaw = k * CLASS_STEP + (t - THETA_HALF) * THETA_STEP;
    const rho = (b + 0.5) * RHO_STEP - this.rhoMax;
    const th = thetaRaw < 0 ? thetaRaw + 360 : thetaRaw;
    const sinT = SIN[th];
    const cosT = COS[th];
    const candidate: AxisCandidate = {
      thetaDeg: ((thetaRaw % 180) + 180) % 180,
      cx: W / 2 - rho * sinT,
      cy: f.height / 2 + rho * cosT,
      polarity: pol === 0 ? 1 : -1,
      ridgeNormalDeg: k * CLASS_STEP,
      votes: best,
    };
    // Explain away: every ridge of this polarity and roughly this orientation near the line.
    const index = f.index;
    const classDeg = k * CLASS_STEP;
    for (let p = 0; p < f.count; p++) {
      if (this.used[p]) continue;
      const i = index[p];
      const v = f.strength[i];
      if (v > 0 !== (pol === 0)) continue;
      if (angleDiffDeg(f.normalDeg[i], classDeg) > 24) continue;
      const x = i % W;
      const dist = -(x + 0.5 - W / 2) * sinT + ((i - x) / W + 0.5 - f.height / 2) * cosT - rho;
      if (dist > consumeBand || dist < -consumeBand) continue;
      this.vote(p, -1);
      this.used[p] = 1;
    }
    for (let dk = -2; dk <= 2; dk++) this.smoothSlice(pol * CLASS_COUNT + ((((k + dk) % CLASS_COUNT) + CLASS_COUNT) % CLASS_COUNT));
    return candidate;
  }
}

/** The strongest `maxCandidates` neck-axis candidates of a ridge field. */
export function findAxisCandidates(field: RidgeField, maxCandidates = 8, minRelative = 0.12): AxisCandidate[] {
  const search = new AxisSearch(field);
  const out: AxisCandidate[] = [];
  for (let k = 0; k < maxCandidates; k++) {
    const c = search.next(minRelative);
    if (!c) break;
    out.push(c);
  }
  return out;
}

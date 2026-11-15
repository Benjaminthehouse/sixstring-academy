/**
 * Stage 3 of detection: from frets along a line to a board.
 *
 * The frets of a comb are extended sideways as straight lines, and the board edges are found as
 * the two lines where the fret pattern as a whole stops (`measureStrip`). The midline between the
 * edges is a better axis for a second pass, and frets plus edges give a homography for any numbering.
 */
import { boardEdgePlaneLine, boardWidthAt, fretPlaneLine, fretX, homographyFromPointsOnLines, type PointOnLine } from '../geometry';
import type { Mat3, NeckModel } from '../types';
import { angleDiffDeg, type RidgeField } from './axis';
import { combPosition, type Comb, type LineProfile, type NormalModel } from './comb';
import type { GrayImage } from './image';
import { wireResponse } from './refine';

/** A fret wire followed across the board. */
export interface FretTrace {
  /** Relative fret index of the comb it came from. */
  j: number;
  /** Ends of the traced ridge: `plus` on the side of the axis normal (-uy, ux), `minus` on the other. */
  plusX: number;
  plusY: number;
  minusX: number;
  minusY: number;
  /** Where the fret crosses the axis. */
  midX: number;
  midY: number;
  /** Mean thin-line response along the trace. */
  strength: number;
  /** Traced length in pixels. */
  length: number;
}

/** A straight image line as a point and a unit direction. */
export interface ImageLine {
  px: number;
  py: number;
  dx: number;
  dy: number;
}

/** A measured strip of board. */
export interface Strip {
  frets: FretTrace[];
  /** Board edges on the plus / minus side of the profile line. */
  edgePlus: ImageLine | null;
  edgeMinus: ImageLine | null;
  /** Fraction of samples with fret wire inside each edge (1 = every fret reaches it) and just outside it (0 = every fret stops there). */
  edgePlusInside: number;
  edgePlusOutside: number;
  edgeMinusInside: number;
  edgeMinusOutside: number;
}

/** Lateral sampling step (pixels) and reach of the per-fret presence profiles. */
const LAT_STEP = 1.5;
const LAT_REACH = 76; // samples to either side: 114 pixels
const LAT_N = 2 * LAT_REACH + 1;
/** After this many consecutive samples without wire (30 pixels) a fret is not followed any further. */
const GONE_FOR_GOOD = 20;

const response = wireResponse;

/** Best response within a small tube around a point (the fret may be a pixel off the straight line we assume). */
function tube(fine: GrayImage, coarse: GrayImage, x: number, y: number, nx: number, ny: number, polarity: number): number {
  const a = response(fine, coarse, x, y, nx, ny, polarity);
  const b = response(fine, coarse, x + nx * 1.2, y + ny * 1.2, nx, ny, polarity);
  const c = response(fine, coarse, x - nx * 1.2, y - ny * 1.2, nx, ny, polarity);
  return a > b ? (a > c ? a : c) : b > c ? b : c;
}

/** Robust straight-line fit y = a + b t by iterated reweighting (Tukey-like cut at `cut`). */
function robustLine(ts: number[], ys: number[], ws: number[], cut: number): { a: number; b: number } {
  let a = 0;
  let b = 0;
  const n = ts.length;
  const w = ws.slice();
  for (let it = 0; it < 4; it++) {
    let sw = 0;
    let st = 0;
    let sy = 0;
    let stt = 0;
    let sty = 0;
    for (let i = 0; i < n; i++) {
      sw += w[i];
      st += w[i] * ts[i];
      sy += w[i] * ys[i];
      stt += w[i] * ts[i] * ts[i];
      sty += w[i] * ts[i] * ys[i];
    }
    if (!(sw > 0)) break;
    const den = sw * stt - st * st;
    if (n < 3 || Math.abs(den) < 1e-9 * sw * sw) {
      a = sy / sw;
      b = 0;
    } else {
      b = (sw * sty - st * sy) / den;
      a = (sy - b * st) / sw;
    }
    for (let i = 0; i < n; i++) {
      const r = Math.abs(ys[i] - a - b * ts[i]) / cut;
      w[i] = r >= 1 ? 0 : ws[i] * (1 - r * r) * (1 - r * r);
    }
  }
  return { a, b };
}

const PRESENT = new Uint8Array(64 * LAT_N);
const CUM = new Float32Array(64 * (LAT_N + 1));

/**
 * Measure a strip of board from a comb: the direction of every fret, and the two board edges as
 * the lines where the fret pattern as a whole stops.
 *
 * Each fret is sampled along its own straight line, far to both sides of the profile line, and
 * every sample is classed as "wire present" or "absent". An edge is a line across all the frets
 * with wire inside it and none outside; it is found by exhaustive search over its two parameters
 * (offset and slope along the neck) on per-fret cumulative sums. A fret cut short by a hand costs
 * a little; wire continuing beyond the edge costs a lot.
 */
export function measureStrip(fine: GrayImage, coarse: GrayImage, profile: LineProfile, comb: Comb, normal: NormalModel, polarity: number): Strip | null {
  const frets = comb.frets.slice(0, 64);
  const n = frets.length;
  if (n < 3) return null;
  const W = fine.width;
  const Hh = fine.height;
  // 1. Each fret's direction: the angle near the model's that gathers the most response.
  const px: number[] = [];
  const py: number[] = [];
  const pos: number[] = [];
  const ang: number[] = [];
  const wgt: number[] = [];
  for (const f of frets) {
    const base = normal.deg0 + normal.slope * f.pos;
    let x = profile.x0 + f.pos * profile.ux;
    let y = profile.y0 + f.pos * profile.uy;
    {
      // Centre on the ridge along the model normal.
      const a = (base * Math.PI) / 180;
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      let best = -1;
      let bestO = 0;
      for (let o = -2; o <= 2; o += 0.5) {
        const r = response(fine, coarse, x + nx * o, y + ny * o, nx, ny, polarity);
        if (r > best) {
          best = r;
          bestO = o;
        }
      }
      x += nx * bestO;
      y += ny * bestO;
    }
    let bestScore = -1;
    let bestAngle = base;
    let prevScore = 0;
    let scoreAfterBest = 0;
    let scoreBeforeBest = 0;
    for (let da = -8; da <= 8; da += 2) {
      const a = ((base + da) * Math.PI) / 180;
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      let sum = 0;
      for (let k = -8; k <= 8; k++) {
        if (k === 0) continue;
        const r = response(fine, coarse, x - ny * k * 3, y + nx * k * 3, nx, ny, polarity);
        if (r > 0) sum += r;
      }
      if (sum > bestScore) {
        bestScore = sum;
        bestAngle = base + da;
        scoreBeforeBest = prevScore;
        scoreAfterBest = -1;
      } else if (scoreAfterBest < 0) scoreAfterBest = sum;
      prevScore = sum;
    }
    if (scoreAfterBest >= 0 && scoreBeforeBest > 0) {
      const den = scoreBeforeBest - 2 * bestScore + scoreAfterBest;
      if (den < -1e-9) bestAngle += Math.max(-1, Math.min(1, (scoreBeforeBest - scoreAfterBest) / den));
    }
    px.push(x);
    py.push(y);
    pos.push(f.pos);
    ang.push(bestAngle);
    wgt.push(bestScore);
  }
  // 2. Frets of one board turn smoothly along the neck: fit angle against position and use the fit.
  const fit = robustLine(pos, ang, wgt, 5);
  const dirX: number[] = [];
  const dirY: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((fit.a + fit.b * pos[i]) * Math.PI) / 180;
    // Fret direction on the plus side: perpendicular to the normal, pointing toward (-uy, ux).
    let dx = -Math.sin(a);
    let dy = Math.cos(a);
    if (dx * -profile.uy + dy * profile.ux < 0) {
      dx = -dx;
      dy = -dy;
    }
    dirX.push(dx);
    dirY.push(dy);
  }
  // 3. Presence of the wire along each fret line.
  const strengths: number[] = [];
  for (let i = 0; i < n; i++) {
    const dx = dirX[i];
    const dy = dirY[i];
    const nx = dy;
    const ny = -dx;
    // Reference level from the middle of the fret.
    let ref = 0;
    let cnt = 0;
    for (let k = -4; k <= 4; k++) {
      const r = tube(fine, coarse, px[i] + dx * k * LAT_STEP, py[i] + dy * k * LAT_STEP, nx, ny, polarity);
      ref += r;
      cnt++;
    }
    ref /= cnt;
    strengths.push(ref);
    const thr = Math.max(0.3, 0.35 * ref);
    const row = i * LAT_N;
    PRESENT[row + LAT_REACH] = 1;
    // Walk outward on each side; once the wire has been gone for a good stretch there is no need to look further.
    for (let sign = -1; sign <= 1; sign += 2) {
      let gone = 0;
      for (let k = 1; k <= LAT_REACH; k++) {
        const slot = row + LAT_REACH + sign * k;
        if (gone >= GONE_FOR_GOOD) {
          PRESENT[slot] = 0;
          continue;
        }
        const x = px[i] + dx * sign * k * LAT_STEP;
        const y = py[i] + dy * sign * k * LAT_STEP;
        if (x < 3 || y < 3 || x > W - 3 || y > Hh - 3) {
          PRESENT[slot] = 2; // outside the image: says nothing
          continue;
        }
        // The centre of the tube first; its sides only if that misses.
        const present = response(fine, coarse, x, y, nx, ny, polarity) >= thr || tube(fine, coarse, x, y, nx, ny, polarity) >= thr;
        PRESENT[slot] = present ? 1 : 0;
        gone = present ? 0 : gone + 1;
      }
    }
  }
  // 4. Edges by exhaustive search. On the plus side an edge at offset e (in samples) scores, per fret,
  //    +1 for wire inside, -0.25 for no wire inside, -1 for wire outside, +0.25 for no wire outside.
  const mid = (pos[0] + pos[n - 1]) / 2;
  const searchEdge = (sign: 1 | -1): { a: number; b: number; inside: number; outside: number } | null => {
    for (let i = 0; i < n; i++) {
      const row = i * LAT_N;
      const crow = i * (LAT_N + 1);
      // CUM[e] = score of the samples 0..e-1 counted as inside, minus their score as outside.
      let c = 0;
      CUM[crow] = 0;
      for (let k = 0; k < LAT_REACH; k++) {
        const v = PRESENT[row + LAT_REACH + sign * (k + 1)];
        if (v === 1) c += 2;
        else if (v === 0) c -= 0.5;
        CUM[crow + k + 1] = c;
      }
    }
    let best = -Infinity;
    let bestA = 0;
    let bestB = 0;
    for (let bi = -25; bi <= 25; bi++) {
      const b = bi * 0.02;
      for (let a = 2; a < LAT_REACH; a++) {
        let score = 0;
        for (let i = 0; i < n; i++) {
          let e = Math.round(a + (b * (pos[i] - mid)) / LAT_STEP);
          if (e < 0) e = 0;
          if (e > LAT_REACH) e = LAT_REACH;
          score += CUM[i * (LAT_N + 1) + e];
        }
        if (score > best) {
          best = score;
          bestA = a;
          bestB = b;
        }
      }
    }
    if (best === -Infinity) return null;
    // How clean is the winner: wire fraction just inside and just outside the edge.
    let inside = 0;
    let insideN = 0;
    let outside = 0;
    let outsideN = 0;
    for (let i = 0; i < n; i++) {
      const e = Math.max(0, Math.min(LAT_REACH, Math.round(bestA + (bestB * (pos[i] - mid)) / LAT_STEP)));
      const row = i * LAT_N;
      for (let k = 1; k <= e; k++) {
        const v = PRESENT[row + LAT_REACH + sign * k];
        if (v === 2) continue;
        insideN++;
        inside += v;
      }
      for (let k = e + 2; k <= Math.min(LAT_REACH, e + 9); k++) {
        const v = PRESENT[row + LAT_REACH + sign * k];
        if (v === 2) continue;
        outsideN++;
        outside += v;
      }
    }
    return { a: bestA, b: bestB, inside: insideN > 0 ? inside / insideN : 0, outside: outsideN > 0 ? outside / outsideN : 0 };
  };
  const plus = searchEdge(1);
  const minus = searchEdge(-1);
  if (!plus || !minus) return null;
  const traces: FretTrace[] = [];
  const exs: number[] = [];
  const eys: number[] = [];
  const mxs: number[] = [];
  const mys: number[] = [];
  for (let i = 0; i < n; i++) {
    const ep = Math.max(0, plus.a + (plus.b * (pos[i] - mid)) / LAT_STEP) * LAT_STEP;
    const em = Math.max(0, minus.a + (minus.b * (pos[i] - mid)) / LAT_STEP) * LAT_STEP;
    const t: FretTrace = {
      j: frets[i].j,
      plusX: px[i] + dirX[i] * ep,
      plusY: py[i] + dirY[i] * ep,
      minusX: px[i] - dirX[i] * em,
      minusY: py[i] - dirY[i] * em,
      midX: px[i],
      midY: py[i],
      strength: strengths[i],
      length: ep + em,
    };
    traces.push(t);
    exs.push(t.plusX);
    eys.push(t.plusY);
    mxs.push(t.minusX);
    mys.push(t.minusY);
  }
  return {
    frets: traces,
    edgePlus: lineThroughPoints(exs, eys),
    edgeMinus: lineThroughPoints(mxs, mys),
    edgePlusInside: plus.inside,
    edgePlusOutside: plus.outside,
    edgeMinusInside: minus.inside,
    edgeMinusOutside: minus.outside,
  };
}

/** Total-least-squares line through points; null when they do not define one. */
function lineThroughPoints(xs: number[], ys: number[]): ImageLine | null {
  const n = xs.length;
  if (n < 2) return null;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i];
    my += ys[i];
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) * (xs[i] - mx);
    sxy += (xs[i] - mx) * (ys[i] - my);
    syy += (ys[i] - my) * (ys[i] - my);
  }
  if (!(sxx + syy > 1e-6)) return null;
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { px: mx, py: my, dx: Math.cos(theta), dy: Math.sin(theta) };
}

/** Intersection of two image lines; null when parallel. */
export function intersect(a: ImageLine, b: ImageLine): { x: number; y: number } | null {
  const den = a.dx * b.dy - a.dy * b.dx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((b.px - a.px) * b.dy - (b.py - a.py) * b.dx) / den;
  return { x: a.px + t * a.dx, y: a.py + t * a.dy };
}

/** The image line of a traced fret. */
export function fretLine(f: FretTrace): ImageLine {
  const dx = f.plusX - f.minusX;
  const dy = f.plusY - f.minusY;
  const len = Math.hypot(dx, dy) || 1;
  return { px: f.midX, py: f.midY, dx: dx / len, dy: dy / len };
}

/** The line half-way between the two edges (through the fret mid points), directed like (ux, uy). Null without both edges. */
export function stripMidline(strip: Strip, ux: number, uy: number): ImageLine | null {
  if (!strip.edgePlus || !strip.edgeMinus || strip.frets.length < 2) return null;
  const first = strip.frets[0];
  const last = strip.frets[strip.frets.length - 1];
  const mid = (f: FretTrace): { x: number; y: number } | null => {
    const line = fretLine(f);
    const a = intersect(line, strip.edgePlus as ImageLine);
    const b = intersect(line, strip.edgeMinus as ImageLine);
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
  };
  const m0 = mid(first);
  const m1 = mid(last);
  if (!m0 || !m1) return null;
  let dx = m1.x - m0.x;
  let dy = m1.y - m0.y;
  const len = Math.hypot(dx, dy);
  if (len < 10) return null;
  dx /= len;
  dy /= len;
  if (dx * ux + dy * uy < 0) {
    dx = -dx;
    dy = -dy;
  }
  return { px: (m0.x + m1.x) / 2, py: (m0.y + m1.y) / 2, dx, dy };
}

/**
 * How the fret normal turns along a line, estimated from the ridge pixels near it (weighted
 * double-angle means in bins along the line, then a straight-line fit). Falls back to `classDeg`.
 */
export function estimateNormalModel(field: RidgeField, x0: number, y0: number, ux: number, uy: number, length: number, polarity: number, classDeg: number, band = 14): NormalModel {
  const BIN = 40;
  const bins = Math.max(1, Math.ceil(length / BIN));
  const cs = new Float64Array(bins);
  const sn = new Float64Array(bins);
  const wt = new Float64Array(bins);
  const W = field.width;
  const index = field.index;
  for (let p = 0; p < field.count; p++) {
    const i = index[p];
    const v = field.strength[i];
    if (v > 0 !== polarity > 0) continue;
    const a = field.normalDeg[i];
    if (angleDiffDeg(a, classDeg) > 26) continue;
    const x = (i % W) + 0.5 - x0;
    const y = Math.floor(i / W) + 0.5 - y0;
    const lat = -x * uy + y * ux;
    if (lat > band || lat < -band) continue;
    const t = x * ux + y * uy;
    if (t < 0 || t >= length) continue;
    const b = Math.min(bins - 1, (t / BIN) | 0);
    const w = Math.abs(v);
    cs[b] += w * Math.cos((a * Math.PI) / 90);
    sn[b] += w * Math.sin((a * Math.PI) / 90);
    wt[b] += w;
  }
  // Weighted line fit of the unwrapped angle against position.
  let sw = 0;
  let st = 0;
  let sa = 0;
  let stt = 0;
  let sta = 0;
  let used = 0;
  let total = 0;
  for (let b = 0; b < bins; b++) total += wt[b];
  for (let b = 0; b < bins; b++) {
    if (wt[b] < 0.03 * total || wt[b] <= 0) continue;
    let a = (Math.atan2(sn[b], cs[b]) * 90) / Math.PI;
    while (a - classDeg > 90) a -= 180;
    while (a - classDeg < -90) a += 180;
    const t = (b + 0.5) * BIN;
    const w = wt[b];
    sw += w;
    st += w * t;
    sa += w * a;
    stt += w * t * t;
    sta += w * t * a;
    used++;
  }
  if (used === 0) return { deg0: classDeg, slope: 0 };
  const mean = sa / sw;
  if (used < 3) return { deg0: mean, slope: 0 };
  const den = sw * stt - st * st;
  if (Math.abs(den) < 1e-6) return { deg0: mean, slope: 0 };
  let slope = (sw * sta - st * sa) / den;
  // Perspective turns frets by a few tens of degrees over a whole frame at most.
  const limit = 40 / Math.max(200, length);
  if (slope > limit) slope = limit;
  if (slope < -limit) slope = -limit;
  return { deg0: mean - slope * (st / sw), slope };
}

/** Normal model along a new line from already traced frets (their directions are measured, not guessed). */
export function normalModelFromTraces(frets: FretTrace[], x0: number, y0: number, ux: number, uy: number, fallback: NormalModel): NormalModel {
  if (frets.length < 2) return fallback;
  let sw = 0;
  let st = 0;
  let sa = 0;
  let stt = 0;
  let sta = 0;
  let ref = NaN;
  for (const f of frets) {
    const line = fretLine(f);
    let a = (Math.atan2(line.dx, -line.dy) * 180) / Math.PI; // normal = fret direction turned by -90 degrees
    if (Number.isNaN(ref)) ref = a;
    while (a - ref > 90) a -= 180;
    while (a - ref < -90) a += 180;
    const t = (f.midX - x0) * ux + (f.midY - y0) * uy;
    const w = f.length;
    sw += w;
    st += w * t;
    sa += w * a;
    stt += w * t * t;
    sta += w * t * a;
  }
  const den = sw * stt - st * st;
  if (frets.length < 4 || Math.abs(den) < 1e-6) return { deg0: sa / sw, slope: 0 };
  const slope = (sw * sta - st * sa) / den;
  return { deg0: sa / sw - slope * (st / sw), slope };
}

/**
 * Homography (neck mm -> working pixels) from a strip for one numbering: comb fret j is model fret
 * j + offset. Frets constrain the position along the neck, the two edges the position across it.
 * `plusIsBass` says which traced side is the bass edge. Null when the strip does not determine a pose.
 */
export function homographyFromStrip(strip: Strip, model: NeckModel, offset: number, plusIsBass: boolean): Mat3 | null {
  if (!strip.edgePlus || !strip.edgeMinus) return null;
  const obs: PointOnLine[] = [];
  let used = 0;
  for (const f of strip.frets) {
    const n = f.j + offset;
    if (n < 0 || n > model.fretCount + 4) continue;
    const line = fretPlaneLine(model, n);
    const fl = fretLine(f);
    const a = intersect(fl, strip.edgePlus);
    const b = intersect(fl, strip.edgeMinus);
    if (!a || !b) continue;
    // Points on the fret between the edges; where along the wire they fall is free.
    obs.push({ point: { x: a.x + (b.x - a.x) * 0.15, y: a.y + (b.y - a.y) * 0.15 }, line }, { point: { x: a.x + (b.x - a.x) * 0.85, y: a.y + (b.y - a.y) * 0.85 }, line });
    // The same intersections lie on the board edges.
    obs.push({ point: a, line: boardEdgePlaneLine(model, plusIsBass ? 'bass' : 'treble'), weight: 1 }, { point: b, line: boardEdgePlaneLine(model, plusIsBass ? 'treble' : 'bass'), weight: 1 });
    used++;
  }
  if (used < 3) return null;
  return homographyFromPointsOnLines(obs);
}

/**
 * Rough numbering offset (model fret = comb index + offset) from how long each fret looks compared
 * with the gap to the next one. Foreshortening across the neck biases it, so it is only a starting point.
 */
export function guessNumberingOffset(strip: Strip, comb: Comb, model: NeckModel): number {
  const frets = strip.frets;
  if (frets.length < 2 || !strip.edgePlus || !strip.edgeMinus) return 3;
  const votes: number[] = [];
  for (const f of frets) {
    const fl = fretLine(f);
    const a = intersect(fl, strip.edgePlus);
    const b = intersect(fl, strip.edgeMinus);
    if (!a || !b) continue;
    const width = Math.hypot(a.x - b.x, a.y - b.y);
    const gap = Math.abs(combPosition(comb, f.j + 1) - combPosition(comb, f.j));
    if (!(gap > 1)) continue;
    const ratio = width / gap;
    let best = 0;
    let bestD = Infinity;
    for (let n = 0; n <= model.fretCount; n++) {
      const x = fretX(model, n);
      const r = boardWidthAt(model, x) / (fretX(model, n + 1) - x);
      const d = Math.abs(Math.log(r / ratio));
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    votes.push(best - f.j);
  }
  if (votes.length === 0) return 3;
  votes.sort((p, q) => p - q);
  return votes[votes.length >> 1];
}

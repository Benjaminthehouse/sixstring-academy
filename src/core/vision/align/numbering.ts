/**
 * Stage 5: which fret is which?
 *
 * Fret spacing is self-similar, so a pose that sits perfectly on the wires may still call fret 7
 * "fret 5". Three kinds of evidence can fix the numbers, strongest first:
 *
 *  - the NUT: the outermost line of the fret sequence, wider than a wire and of a different
 *    brightness from both the board in front of it and the headstock behind it, with no further
 *    fret-like lines behind it;
 *  - the INLAY pattern: dots (or blocks) in cells 3, 5, 7, 9, a double at 12, then 15, 17, 19, 21;
 *  - geometry alone (how wide the board looks for its fret spacing, i.e. which numbering makes the
 *    pose a rigid view): only a guess, because tipping the neck changes the same ratio.
 *
 * The result says which evidence was used and how sure it is; below 0.5 the UI should ask for a tap.
 */
import { inlayPolarity } from '../inlay-polarity';
import { DOUBLE_INLAY_FRETS, INLAY_FRETS, boardEdgeY, fretX, stringSpanAt } from '../geometry';
import type { Frame, MarkerHint, Mat3, NeckModel, NumberingSource } from '../types';
import { bil } from './features';
import type { GrayImage } from './image';
import { linePresence, type PoseScore } from './score';

/** Outcome of `resolveNumbering`. */
export interface NumberingDecision {
  /** Add this to every fret number of the provisional pose. */
  delta: number;
  source: NumberingSource;
  /** 0..1. */
  confidence: number;
  /** Human-readable trace of the evidence, for debugging. */
  trace: string;
}

function sampleAt(img: GrayImage, H: Mat3, x: number, y: number): number {
  const w = H[6] * x + H[7] * y + H[8];
  if (!(w > 1e-9)) return NaN;
  const u = (H[0] * x + H[1] * y + H[2]) / w;
  const v = (H[3] * x + H[4] * y + H[5]) / w;
  if (u < 2 || v < 2 || u > img.width - 2 || v > img.height - 2) return NaN;
  return bil(img.data, img.width, img.height, u, v);
}

/** Nut-bar evidence at provisional line n. */
export interface NutBar {
  n: number;
  /**
   * How clearly a 5.5 mm bar of its own brightness sits just behind the line: the smallest, over
   * five positions across the board, of the step between the strip and BOTH the board in front and
   * whatever lies behind (grey levels; 0 when the steps disagree in sign anywhere). NaN out of view.
   */
  bar: number;
  /** True when the region behind the strip was out of view and only the board side was tested. */
  partial: boolean;
}

/** Positions across the board (fractions of the width from the bass edge) where the nut bar is tested: between the strings. */
const NUT_FRACTIONS = [0.18, 0.34, 0.5, 0.66, 0.82];

/**
 * Does a nut-like bar sit just behind provisional line n? Physical millimetres shrink by
 * 2^(-k/12) in provisional coordinates when line k is the true nut, which is what `rho` undoes;
 * pass `nutLine` to test an ordinary fret at the scale of a nut hypothesis (for comparison).
 */
export function nutBarAt(img: GrayImage, H: Mat3, model: NeckModel, n: number, nutLine: number = n): NutBar {
  const x0 = fretX(model, n);
  const rho = Math.pow(2, -nutLine / 12);
  const y0 = boardEdgeY(model, Math.max(0, x0), 'bass');
  const y1 = boardEdgeY(model, Math.max(0, x0), 'treble');
  let worst = Infinity;
  let sign = 0;
  let count = 0;
  let partial = false;
  let disagreements = 0;
  for (const f of NUT_FRACTIONS) {
    const y = y0 + (y1 - y0) * f;
    const strip = sampleAt(img, H, x0 - 2.75 * rho, y);
    const board = sampleAt(img, H, x0 + 7 * rho, y);
    const head = sampleAt(img, H, x0 - 12 * rho, y);
    if (Number.isNaN(strip) || Number.isNaN(board)) continue;
    const a = strip - board;
    let step = Math.abs(a);
    if (Number.isNaN(head)) partial = true;
    else {
      const b = strip - head;
      if (a * b <= 0) {
        disagreements++;
        continue;
      }
      step = Math.min(step, Math.abs(b));
    }
    const sgn = a > 0 ? 1 : -1;
    if (sign === 0) sign = sgn;
    else if (sgn !== sign) {
      disagreements++;
      continue;
    }
    if (step < worst) worst = step;
    count++;
  }
  if (count + disagreements < 4) return { n, bar: NaN, partial };
  // One position may disagree (a string, a glint); more and it is not a bar.
  if (disagreements > 1 || count < 3) return { n, bar: 0, partial };
  return { n, bar: worst, partial };
}

/**
 * Does the board END at provisional line n? A dark nut on a dark board shows no bar at all: the
 * only sign is that the board's brightness gives way to the headstock's exactly at a fret line.
 * Returns the smallest step (grey levels) over the positions across the board between the board
 * just in front of the line and the region 9..14 mm behind it, 0 unless both regions are flat and
 * the steps agree in sign, NaN when out of view. Scale as in `nutBarAt`.
 */
export function boardEndAt(img: GrayImage, H: Mat3, model: NeckModel, n: number): number {
  const x0 = fretX(model, n);
  const rho = Math.pow(2, -n / 12);
  const y0 = boardEdgeY(model, Math.max(0, x0), 'bass');
  const y1 = boardEdgeY(model, Math.max(0, x0), 'treble');
  let worst = Infinity;
  let sign = 0;
  let count = 0;
  let bad = 0;
  for (const f of NUT_FRACTIONS) {
    const y = y0 + (y1 - y0) * f;
    const b1 = sampleAt(img, H, x0 + 3 * rho, y);
    const b2 = sampleAt(img, H, x0 + 8 * rho, y);
    const h1 = sampleAt(img, H, x0 - 9 * rho, y);
    const h2 = sampleAt(img, H, x0 - 14 * rho, y);
    if (Number.isNaN(b1 + b2 + h1 + h2)) continue;
    const step = (b1 + b2) / 2 - (h1 + h2) / 2;
    const flat = Math.max(Math.abs(b1 - b2), Math.abs(h1 - h2));
    const sgn = step > 0 ? 1 : -1;
    if (sign === 0) sign = sgn;
    if (sgn !== sign || flat > 0.5 * Math.abs(step)) {
      bad++;
      continue;
    }
    if (Math.abs(step) < worst) worst = Math.abs(step);
    count++;
  }
  if (count + bad < 4) return NaN;
  return bad > 1 || count < 3 ? 0 : worst;
}

/** Inlay evidence of one fret cell (the cell between provisional lines cell - 1 and cell). */
export interface CellInlay {
  cell: number;
  /** A centre dot: brightness at the cell centre against the board on both sides of it, signed so an inlay is positive, relative to the typical cell. */
  single: number;
  /** Double dots: the same at the two double-dot positions. */
  double: number;
  /** Block inlay: brightness of the whole cell against its two neighbours, signed so an inlay is positive. */
  block: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = values.slice().sort((a, b) => a - b);
  return s[s.length >> 1];
}

/**
 * Measure inlay evidence for cells lo..hi. `polarity` is the board polarity (+1 = dark board with
 * light inlays), used only when the cells do not show the inlays' own (`inlayPolarity`). Samples sit between the strings (the strings are at 0.1, 0.3 and 0.5 of the
 * string span either side of the centre line; the double dots, as drawn on most necks, at 0.3).
 */
export function measureInlays(img: GrayImage, H: Mat3, model: NeckModel, polarity: number, lo: number, hi: number): CellInlay[] {
  const yc = model.nutWidth / 2;
  const raw: { cell: number; single: number; dbl: number; level: number; centre: number; a1: number; a2: number; b1: number; b2: number; d1: number; d2: number }[] = [];
  for (let c = lo; c <= hi; c++) {
    const x = (fretX(model, c - 1) + fretX(model, c)) / 2;
    const span = stringSpanAt(model, Math.max(0, x));
    const centre = sampleAt(img, H, x, yc);
    const a1 = sampleAt(img, H, x, yc - 0.2 * span);
    const a2 = sampleAt(img, H, x, yc + 0.2 * span);
    const b1 = sampleAt(img, H, x, yc - 0.4 * span);
    const b2 = sampleAt(img, H, x, yc + 0.4 * span);
    const d1 = sampleAt(img, H, x, yc - 0.3 * span);
    const d2 = sampleAt(img, H, x, yc + 0.3 * span);
    if (Number.isNaN(centre + a1 + a2 + b1 + b2 + d1 + d2)) continue;
    raw.push({ cell: c, single: 0, dbl: 0, level: (centre + a1 + a2 + b1 + b2) / 5, centre, a1, a2, b1, b2, d1, d2 });
  }
  // The inlays' own polarity (black dots on a maple board with bright wires), from the cells that
  // stand out; the board polarity only when they say nothing.
  const pol = inlayPolarity(
    raw.flatMap((r) => [r.centre - (r.a1 + r.a2) / 2, (r.d1 + r.d2) / 2 - (r.a1 + r.b1 + r.a2 + r.b2) / 4]),
    polarity >= 0 ? 1 : -1,
  );
  for (const r of raw) {
    // A dot is small: it must stand out from the board on BOTH sides (take the smaller step).
    r.single = pol * Math.min(r.centre - r.a1, r.centre - r.a2);
    r.dbl = pol * Math.min(r.d1 - (r.a1 + r.b1) / 2, r.d2 - (r.a2 + r.b2) / 2);
  }
  // Strings, grain and lighting bias every cell alike: measure against the typical cell.
  const mSingle = median(raw.map((r) => r.single));
  const mDouble = median(raw.map((r) => r.dbl));
  const out: CellInlay[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const prev = i > 0 && raw[i - 1].cell === r.cell - 1 ? raw[i - 1].level : NaN;
    const next = i + 1 < raw.length && raw[i + 1].cell === r.cell + 1 ? raw[i + 1].level : NaN;
    const neighbours = Number.isNaN(prev) ? next : Number.isNaN(next) ? prev : (prev + next) / 2;
    out.push({ cell: r.cell, single: r.single - mSingle, double: r.dbl - mDouble, block: Number.isNaN(neighbours) ? 0 : pol * (r.level - neighbours) });
  }
  return out;
}

/** What the caller knows that numbering can use. */
export interface NumberingContext {
  /**
   * How plausible the pose is as a view of a real neck after shifting the numbering by delta:
   * the rigidity residual plus a penalty for extreme tilt (smaller = more plausible; see rigidity.ts).
   */
  implausibility: (delta: number) => number;
  /** Largest fret number the instrument can have (the preset's count plus a couple). */
  maxFret: number;
}

/** Smallest brightness step (grey levels) that can pass for a nut bar. */
const NUT_BAR_STRONG = 12;
/** Smallest brightness step (grey levels) between board and headstock that marks the end of the board. */
const BOARD_END_STEP = 30;

/**
 * Decide the absolute numbering of a scored pose. `H` and `score` are in a provisional numbering;
 * the returned `delta` is added to it.
 */
export function resolveNumbering(img: GrayImage, coarse: GrayImage, H: Mat3, model: NeckModel, polarity: number, score: PoseScore, context: NumberingContext): NumberingDecision {
  const first = score.seenSpan.min;
  const last = score.seenSpan.max;
  const trace: string[] = [];
  if (last < first) return { delta: 0, source: 'assumed', confidence: 0, trace: 'nothing seen' };
  // Frets of the instrument: the first seen line cannot come before the nut, the last not after the last fret.
  const dMin = -first;
  const dMax = context.maxFret - last;
  const clamp = (d: number): number => Math.max(dMin, Math.min(Math.max(dMin, dMax), d));
  const presentAt = (n: number): number => {
    for (const f of score.frets) if (f.n === n) return f.inView >= 3 ? f.present : NaN;
    return NaN;
  };

  // ---- Geometry ---------------------------------------------------------------------------
  // How wide the board looks for its fret spacing says roughly where on the neck we are. Too rough
  // to number frets by, but good enough to veto a "nut" a hand's width up the neck.
  let geometryDelta = clamp(0);
  let geometryBest = Infinity;
  for (let d = dMin; d <= Math.max(dMin, dMax); d++) {
    const r = context.implausibility(d);
    if (r < geometryBest) {
      geometryBest = r;
      geometryDelta = d;
    }
  }
  const plausible = (delta: number): boolean => context.implausibility(delta) <= geometryBest + 0.2 && Math.abs(delta - geometryDelta) <= 6;

  // ---- Nut --------------------------------------------------------------------------------
  // The nut is the last line of the sequence. A bone nut shows as a bar clearly stronger than
  // what the same test gives at ordinary frets; a dark nut on a dark board shows only as a thin
  // line of the opposite polarity. Either way nothing line-like may lie behind it.
  let nutLine: number | null = null;
  let nutConfidence = 0;
  {
    const thr = Math.max(0.5, 0.35 * score.contrast);
    // A line of either polarity across the board at provisional line n (NaN when out of view).
    // A nut's body lies just behind its line, so look there as well.
    const anyLine = (n: number): number => {
      const back = -2.75 * Math.pow(2, -n / 12);
      let best = NaN;
      for (const pol of [polarity, -polarity]) {
        for (const off of [0, back]) {
          const p = linePresence(img, coarse, H, model, n, pol, thr, off);
          if (!Number.isNaN(p) && !(best >= p)) best = p;
        }
      }
      return best;
    };
    const clearBehind = (n: number): { clear: boolean; seen: boolean } => {
      const b1 = anyLine(n - 1);
      const b2 = anyLine(n - 2);
      return { clear: (Number.isNaN(b1) || b1 < 0.5) && (Number.isNaN(b2) || b2 < 0.5), seen: !Number.isNaN(b1) };
    };
    const typical: number[] = [];
    for (let n = first + 1; n <= last; n++) {
      if (!(presentAt(n) >= 0.5)) continue;
      // The same test at ordinary frets, at the physical scale of a nut near `first`.
      const nb = nutBarAt(img, H, model, n, first);
      if (!Number.isNaN(nb.bar)) typical.push(nb.bar);
    }
    const base = median(typical);
    const strong = Math.max(NUT_BAR_STRONG, 2.5 * base);
    const bars: string[] = [];
    let bestBar = 0;
    // Outermost first: evidence further out wins over evidence nearer the body.
    for (let n = first - 5; n <= first && nutLine === null; n++) {
      const nb = nutBarAt(img, H, model, n);
      // The board ending at a line that is not itself a wire: a dark nut against a lighter headstock (or the reverse).
      const end = n < first ? boardEndAt(img, H, model, n) : NaN;
      bars.push(`${n}:${Number.isNaN(nb.bar) ? 'x' : nb.bar.toFixed(0)}${end >= BOARD_END_STEP ? `/end${end.toFixed(0)}` : ''}`);
      const behind = clearBehind(n);
      if (!behind.clear || !plausible(clamp(-n))) continue;
      if (!Number.isNaN(nb.bar) && nb.bar >= strong) {
        bestBar = nb.bar;
        nutLine = n;
        nutConfidence = nb.partial ? 0.6 : behind.seen ? 0.9 : 0.8;
      } else if (end >= BOARD_END_STEP && n >= first - 2) {
        nutLine = n;
        nutConfidence = 0.5;
      }
    }
    trace.push(`first ${first} last ${last} base ${base.toFixed(0)} bars ${bars.join(' ')}`);
    if (nutLine === null) {
      // No bar. The outermost line of either polarity, with two empty positions in view behind it,
      // is probably the nut (or the first fret beyond a hand): a guess worth making, not worth trusting.
      let outer = first;
      for (let n = first - 1; n >= first - 2; n--) {
        const p = anyLine(n);
        if (!Number.isNaN(p) && p >= 0.67) outer = n;
      }
      const b1 = anyLine(outer - 1);
      const b2 = anyLine(outer - 2);
      if (!Number.isNaN(b1) && !Number.isNaN(b2) && b1 < 0.34 && b2 < 0.34 && Math.abs(clamp(-outer) - geometryDelta) <= 3) {
        nutLine = outer;
        nutConfidence = 0.4;
      }
      trace.push(`end-of-pattern ${nutLine ?? '-'} (outer ${outer} behind ${Number.isNaN(b1) ? 'x' : b1.toFixed(2)}/${Number.isNaN(b2) ? 'x' : b2.toFixed(2)})`);
    } else {
      trace.push(`nut ${nutLine} bar ${bestBar.toFixed(0)}`);
    }
  }

  // ---- Inlays -----------------------------------------------------------------------------
  let inlayDelta: number | null = null;
  let inlayConfidence = 0;
  {
    const cells = measureInlays(img, H, model, polarity, first + 1, last);
    if (cells.length >= 4) {
      // Scale: what counts as "an inlay is there" in grey levels. Relative to the wires, and to the
      // inlays themselves once four stand out: next to pearl dots 150 levels above the board, a
      // string catching the light by 20 is not a contradiction worth a whole cell (it used to be,
      // and clear dot patterns on close-up necks then lost to the geometry guess).
      const strengths = cells.map((c) => Math.max(c.single, c.double, c.block)).sort((a, b) => b - a);
      const tau = Math.max(6, 0.25 * score.contrast, 0.3 * (strengths[3] ?? 0));
      const sat = (v: number): number => Math.max(-1, Math.min(1, v / tau));
      const byCell = new Map<number, CellInlay>();
      let any = 0;
      for (const c of cells) {
        byCell.set(c.cell, c);
        if (Math.max(c.single, c.double, c.block) > tau) any++;
      }
      let best = -Infinity;
      let second = -Infinity;
      let bestD = 0;
      const scores: string[] = [];
      for (let d = dMin; d <= Math.max(dMin, dMax); d++) {
        let s = 0;
        let expected = 0;
        for (const c of cells) {
          const fret = c.cell + d;
          const isInlay = INLAY_FRETS.includes(fret);
          const isDouble = DOUBLE_INLAY_FRETS.includes(fret);
          const anyInlay = Math.max(c.single, c.block);
          if (isDouble) {
            // Double dots: the two side dots are there, or a block.
            s += Math.max(sat(c.double), sat(c.block));
            // ... and no single centre dot, unless it is a block.
            if (c.block < tau) s -= Math.max(0, sat(c.single)) * 0.5;
            expected++;
          } else if (isInlay) {
            s += sat(anyInlay);
            s -= Math.max(0, sat(c.double)) * 0.5;
            expected++;
          } else {
            s -= Math.max(0, sat(Math.max(anyInlay, c.double)));
          }
        }
        scores.push(`${d}:${s.toFixed(1)}`);
        if (s > best) {
          second = best;
          best = s;
          bestD = d;
        } else if (s > second) second = s;
        void expected;
      }
      trace.push(`inlays any ${any} tau ${tau.toFixed(0)} ${scores.join(' ')}`);
      if (any >= 2 && best >= 1.5 && best - second >= 1 && plausible(bestD)) {
        inlayDelta = bestD;
        inlayConfidence = Math.min(0.85, 0.35 + 0.15 * (best - second) + 0.05 * best);
      }
    }
  }

  // ---- Decide -----------------------------------------------------------------------------
  if (nutLine !== null) {
    const delta = clamp(-nutLine);
    // Inlays that disagree with a weak nut win; ones that agree make it firmer.
    if (inlayDelta !== null && inlayDelta !== delta && inlayConfidence > nutConfidence) {
      return { delta: inlayDelta, source: 'inlays', confidence: inlayConfidence * 0.8, trace: trace.join(' | ') };
    }
    const agree = inlayDelta === delta;
    return { delta, source: 'nut', confidence: Math.min(1, nutConfidence + (agree ? 0.1 : 0)), trace: trace.join(' | ') };
  }
  if (inlayDelta !== null) return { delta: inlayDelta, source: 'inlays', confidence: inlayConfidence, trace: trace.join(' | ') };
  // Geometry only.
  trace.push(`geometry delta ${geometryDelta} implausibility ${geometryBest.toFixed(2)}`);
  return { delta: geometryDelta, source: 'assumed', confidence: 0.15, trace: trace.join(' | ') };
}

/**
 * Marker mode: two bright stickers at known frets. For every allowed numbering shift, look at
 * where the stickers would then be (mid-cell, on the hinted edge of the board or its centre line)
 * and measure how colourful the frame is there, in the hinted hue if one was given, against the
 * same spots in the other cells. Returns the shift whose spots are clearly the most colourful, or
 * null. `H` maps neck mm to pixels of `frame` (not of the working frame).
 */
export function resolveMarkers(frame: Frame, H: Mat3, model: NeckModel, score: PoseScore, hint: MarkerHint, maxFret: number): NumberingDecision | null {
  const first = score.seenSpan.min;
  const last = score.seenSpan.max;
  if (last < first || hint.frets.length === 0) return null;
  const side = hint.placement === 'treble-edge' ? 'treble' : 'bass';
  const hue = hint.hue === undefined ? null : (hint.hue * Math.PI) / 180;
  /** Colourfulness (chroma, weighted by closeness to the hinted hue) around the edge spot of provisional cell c; NaN out of view. */
  const spot = (c: number): number => {
    const x = (fretX(model, c - 1) + fretX(model, c)) / 2;
    const y = hint.placement === 'board' ? model.nutWidth / 2 : boardEdgeY(model, Math.max(0, x), side);
    const w = H[6] * x + H[7] * y + H[8];
    if (!(w > 1e-9)) return NaN;
    const u = Math.round((H[0] * x + H[1] * y + H[2]) / w - 0.5);
    const v = Math.round((H[3] * x + H[4] * y + H[5]) / w - 0.5);
    // The sticker may sit a little off the predicted spot: take the most colourful 3x3 patch nearby.
    const reach = Math.max(2, Math.round(frame.width / 213));
    if (u < reach + 1 || v < reach + 1 || u >= frame.width - reach - 1 || v >= frame.height - reach - 1) return NaN;
    let best = 0;
    for (let dv = -reach; dv <= reach; dv += reach) {
      for (let du = -reach; du <= reach; du += reach) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (let yy = -1; yy <= 1; yy++) {
          for (let xx = -1; xx <= 1; xx++) {
            const i = ((v + dv + yy) * frame.width + u + du + xx) * 4;
            r += frame.data[i];
            g += frame.data[i + 1];
            b += frame.data[i + 2];
          }
        }
        r /= 9;
        g /= 9;
        b /= 9;
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        let value = mx - mn;
        if (hue !== null && value > 0) {
          // Hue angle of the patch against the hint.
          const h = Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b);
          value *= Math.max(0, Math.cos(h - hue));
        }
        if (value > best) best = value;
      }
    }
    return best;
  };
  const spots = new Map<number, number>();
  const all: number[] = [];
  for (let c = first - 2; c <= last + 3; c++) {
    const v = spot(c);
    if (!Number.isNaN(v)) {
      spots.set(c, v);
      all.push(v);
    }
  }
  if (all.length < 4) return null;
  const typical = median(all);
  let best = -Infinity;
  let second = -Infinity;
  let bestD = 0;
  for (let d = -first; d <= Math.max(-first, maxFret - last); d++) {
    let sum = 0;
    let seen = 0;
    for (const f of hint.frets) {
      const v = spots.get(f - d);
      if (v === undefined) continue;
      sum += v - typical;
      seen++;
    }
    // At least one sticker must be in view; a numbering that hides one is judged on the other alone.
    if (seen === 0) continue;
    const value = sum / hint.frets.length;
    if (value > best) {
      second = best;
      best = value;
      bestD = d;
    } else if (value > second) second = value;
  }
  // A sticker is far more colourful than wood, strings or skin.
  if (!(best >= 35) || !(best - Math.max(0, second) >= 15)) return null;
  return { delta: bestD, source: 'markers', confidence: Math.min(0.95, 0.6 + (best - Math.max(0, second)) / 200), trace: `markers delta ${bestD} colour ${best.toFixed(0)} next ${second.toFixed(0)}` };
}

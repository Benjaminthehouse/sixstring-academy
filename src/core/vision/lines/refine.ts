/**
 * Pose refinement against ridge evidence, shared by detection (polish an initial fit) and tracking
 * (follow the board from the previous pose).
 *
 * The board is resampled through the current pose (`rectify`), so every predicted fret wire is a
 * column and every string a row. Around each predicted wire the fret ridge is located separately in
 * four bands across the board (giving the wire's true position and slant), the rows where the wire
 * stops give the board edges, and string ridges are located between the wires. All of these are
 * "this image point lies on that neck-plane line" constraints, from which the homography is solved
 * again (robustly, with a weak pull toward the starting pose where the hand hides the evidence).
 */
import { boardCenterY, boardEdgePlaneLine, boardEdgeY, boardWidthAt, fretX, homographyFromPointsOnLines, multiply, stringPlaneLine, stringSpanAt, type PointOnLine, type PointPair } from '../geometry';
import type { Line, Mat3, NeckModel, Point } from '../types';
import type { Image32 } from './image';
import { cellToImage, colOfX, etaOfRow, rectify, rowOfEta, visibleRange, xOfCol, type Rectified } from './rectify';
import { ridgeAlongRows, ridgeScale } from './strip';

/** What was seen at one (predicted) fret wire. */
export interface FretEvidence {
  /** Fret number under the pose that was refined (may be negative: where a wire would be beyond the nut). */
  fret: number;
  /** The wire's position is inside the frame, so "not found" means something. */
  inFrame: boolean;
  /** Bands (of 4 across the board) in which a ridge was found near the prediction. */
  bands: number;
  /** Mean ridge strength over all four bands, relative to a typical fret of this board. */
  strength: number;
  /** Width of the ridge at half height, in millimetres of the neck (NaN when not found). */
  widthMm: number;
  /**
   * Nut test: how much the 5 mm just behind this wire differs in brightness from both the board in
   * front of it and whatever lies further behind, relative to a typical fret ridge (signed: positive
   * = brighter bar). A bone nut scores well above 1, a fret wire about 0. NaN when it cannot be sampled.
   */
  bar: number;
}

/** Brightness samples of one fret cell (between wire `fret - 1` and wire `fret`), in gray levels. */
export interface CellEvidence {
  fret: number;
  /** Every sample of the cell lies inside the frame. */
  inFrame: boolean;
  /** Mean of the small patch at the cell centre (where a single dot sits). */
  centre: number;
  /** Mean of the two patches where a double dot sits. */
  pair: number;
  /** Mean of two patches of plain board between the strings. */
  board: number;
  /** Mean over the whole cell (between the outer strings), to tell board from headstock or hand. */
  mean: number;
}

/** Options of `refinePose`. */
export interface RefineOptions {
  /** Half-width of the search for each wire, as a fraction of the local fret spacing, per iteration (default [0.3, 0.2]). */
  windows?: readonly number[];
  /** Fret polarity if known: +1 bright wires on a dark board, -1 dark wires on a light board. */
  polarity?: 1 | -1;
  /** Half-width of the ridge filter in pixels if known (default: chosen from two scales by what shows the wires best). */
  ridge?: number;
  /** Weight of the pull toward the starting pose (default 0.5; raise it for tracking through occlusion). */
  priorWeight?: number;
  /** Also lock onto the strings (default true). */
  strings?: boolean;
  /** Sign of the string ridges if known (+1 brighter than the board); both signs are accepted otherwise. */
  stringPolarity?: 1 | -1;
  /**
   * Place the six strings as one comb before matching them one by one (default true). Detection
   * needs it (the wire ends misjudge the width of bound necks); tracking starts from strings that
   * are already in place and only asks for it when they have been lost.
   */
  stringLock?: boolean;
  /**
   * Tracking: before matching wires one by one, slide the whole predicted comb along the neck by up
   * to this many pixels and keep the best position. Fret spacing is not periodic, so a pure slide
   * has one clear optimum even when the neck moved by more than a fret between frames.
   */
  alongSearch?: number;
  /** Collect per-fret and per-cell evidence for the numbering stage (default false). */
  evidence?: boolean;
  /** First and last fret wire to look at (defaults -3 and the model's fret count + 2). */
  fromFret?: number;
  toFret?: number;
}

/** Result of `refinePose`. */
export interface RefineResult {
  /** Refined homography (plane mm to pixels of the image passed in). */
  H: Mat3;
  polarity: 1 | -1;
  /** Half-width of the ridge filter that showed the wires best, in pixels. */
  ridgeScale: number;
  /** Typical fret ridge strength in gray levels. */
  strength: number;
  /** Real frets (0..fretCount) whose wire lies in the frame, and how many of them were found. */
  fretsExpected: number;
  fretsFound: number;
  /** Found band measurements over expected ones (0..1): how much of the predicted comb the image supports. */
  support: number;
  /**
   * Share of the gaps between predicted wires that hold a full-width ridge of their own (0..1). A
   * correct pose has almost none; a pose half a fret off, or one that reads every other wire, has many.
   */
  antiSupport: number;
  /** Edge points found over those looked for (0..1). */
  edgeSupport: number;
  /**
   * How far the wires' ends are from the model's board edges, RMS in half board widths (0 = the
   * wires stop exactly at the edges; wires that stop nowhere near count as 0.4). A comb of bars that
   * is not a tapered fretboard cannot keep this small along its whole length.
   */
  edgeError: number;
  /**
   * Where the wires are centred relative to the pose's board, in half board widths (0 = the strings
   * sit in the middle between the wire ends; one string spacing is about 0.34). NaN unless wire ends
   * were found on both sides.
   */
  edgeShift: number;
  /** String points found over those looked for (0..1; 0 when strings are too close to resolve). */
  stringSupport: number;
  /** String positions that were looked for (6 per cell between two found wires, when the strings are far enough apart). */
  stringsLooked: number;
  /** Root-mean-square distance in pixels between the measurements used and the refined model. */
  residualPx: number;
  /** Lowest and highest real fret found. */
  minFret: number;
  maxFret: number;
  /** Sign of the string ridges when the comb of strings was locked (undefined otherwise). */
  stringPolarity?: 1 | -1;
  frets?: FretEvidence[];
  cells?: CellEvidence[];
}

const BANDS = 4;
const BAND_ETA: readonly (readonly [number, number])[] = [[-0.88, -0.44], [-0.44, 0], [0, 0.44], [0.44, 0.88]];
const ETA_MAX = 1.45;

let RECT: Rectified | undefined;
let RIDGE = new Float32Array(0);
let RIDGE2 = new Float32Array(0);

interface Measured {
  obs: PointOnLine[];
  /** Kind of each observation: 0 fret, 1 edge, 2 string. */
  kinds: number[];
  polarity: 1 | -1;
  ridgeScale: number;
  strength: number;
  fretsExpected: number;
  fretsFound: number;
  bandsExpected: number;
  bandsFound: number;
  edgesExpected: number;
  edgesFound: number;
  edgeSqSum: number;
  /** Mean offset of the wire ends from the model's two edges, in eta, averaged over both sides (NaN unless both were seen). */
  edgeShift: number;
  gapsExpected: number;
  gapsFilled: number;
  stringsExpected: number;
  stringsFound: number;
  minFret: number;
  maxFret: number;
  frets: FretEvidence[];
  cells: CellEvidence[];
  rect: Rectified;
  /** Brightness across the board averaged over every cell between two found wires, and how many cells went in. */
  across: Float32Array;
  acrossCells: number;
  /** Tracking: where the comb of wires is centred across the strip, in eta (0 when it is where the pose says). */
  acrossShift: number;
}

function planeToImage(H: Mat3, x: number, y: number): Point {
  const w = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}

/** Mean of the valid samples of a rectangular patch of a strip; NaN when fewer than `minValid` of them lie inside the frame. */
function patchMean(r: Rectified, rowA: number, rowB: number, colA: number, colB: number, minValid = 1): number {
  const i0 = Math.max(0, Math.round(rowA));
  const i1 = Math.min(r.rows - 1, Math.round(rowB));
  const j0 = Math.round(Math.min(colA, colB));
  const j1 = Math.round(Math.max(colA, colB));
  if (j0 < 0 || j1 >= r.cols || i1 < i0) return NaN;
  let sum = 0;
  let n = 0;
  for (let i = i0; i <= i1; i++) {
    const o = i * r.cols;
    for (let j = j0; j <= j1; j++) {
      if (!r.strip.valid[o + j]) continue;
      sum += r.strip.data[o + j];
      n++;
    }
  }
  const total = (i1 - i0 + 1) * (j1 - j0 + 1);
  return n > 0 && n >= minValid * total ? sum / n : NaN;
}

/** Locate frets, edges and strings under a pose. */
function measure(img: Image32, H: Mat3, model: NeckModel, window: number, o: RefineOptions, wantEvidence: boolean): Measured | null {
  const fromFret = o.fromFret ?? -3;
  const toFret = o.toFret ?? model.fretCount + 2;
  const range = visibleRange(H, model, img.width, img.height, fromFret - 0.5, toFret + 0.5);
  if (!range) return null;
  const rect = rectify(img, H, model, range[0], range[1], ETA_MAX, 900, 48, RECT);
  if (!rect) return null;
  RECT = rect;
  const { rows, cols, strip } = rect;
  // Ridge maps at the scale a sharp wire has on a board this wide and at a coarser one: defocus
  // and motion blur along the neck turn wires into wide bars the fine filter cannot see.
  const fine = ridgeScale(rect.widthPx);
  const scales = o.ridge ? [o.ridge] : [fine, Math.min(8, Math.max(fine + 2, Math.round(1.8 * fine)))];
  if (RIDGE.length < rows * cols) RIDGE = new Float32Array(rows * cols);
  if (scales.length > 1 && RIDGE2.length < rows * cols) RIDGE2 = new Float32Array(rows * cols);
  const bandRows: [number, number][] = [];
  for (let b = 0; b < BANDS; b++) {
    bandRows.push([Math.max(0, Math.ceil(rowOfEta(rect, BAND_ETA[b][0]))), Math.min(rows - 1, Math.floor(rowOfEta(rect, BAND_ETA[b][1])))]);
  }
  const profiles = scales.map((d, idx) => {
    const map = ridgeAlongRows(strip, d, idx === 0 ? RIDGE : RIDGE2);
    // Band-summed ridge profiles for both polarities.
    const pos = new Float32Array(BANDS * cols);
    const neg = new Float32Array(BANDS * cols);
    for (let b = 0; b < BANDS; b++) {
      const [i0, i1] = bandRows[b];
      const k = 1 / Math.max(1, i1 - i0 + 1);
      const ob = b * cols;
      for (let i = i0; i <= i1; i++) {
        const oi = i * cols;
        for (let j = 0; j < cols; j++) {
          const v = map[oi + j];
          if (v > 0) pos[ob + j] += v * k;
          else if (v < 0) neg[ob + j] -= v * k;
        }
      }
    }
    return { d, map, pos, neg };
  });

  // Predicted wire columns.
  const first = Math.ceil(fromFret);
  const count = Math.floor(toFret) - first + 1;
  const fretCol = new Float64Array(count);
  for (let k = 0; k < count; k++) fretCol[k] = colOfX(rect, fretX(model, first + k));

  // Peak of a band profile near a column; returns [offset, value] or null.
  const peak = (band: Float32Array, b: number, c: number, win: number): [number, number] | null => {
    const lo = Math.max(1, Math.ceil(c - win));
    const hi = Math.min(cols - 2, Math.floor(c + win));
    if (hi < lo) return null;
    const ob = b * cols;
    let best = -1;
    let bj = -1;
    for (let j = lo; j <= hi; j++) {
      if (band[ob + j] > best) {
        best = band[ob + j];
        bj = j;
      }
    }
    if (bj < 0 || !(best > 0)) return null;
    const l = band[ob + bj - 1];
    const r = band[ob + bj + 1];
    // A maximum on the rim of the window belongs to something outside it.
    if ((bj === lo && l > best) || (bj === hi && r > best)) return null;
    const den = l - 2 * best + r;
    const sub = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (l - r)) / den)) : 0;
    return [bj + sub - c, best];
  };
  const windowOf = (k: number): number => {
    const left = k > 0 ? fretCol[k] - fretCol[k - 1] : fretCol[k + 1] - fretCol[k];
    const right = k < count - 1 ? fretCol[k + 1] - fretCol[k] : left;
    return Math.max(1.5, window * Math.min(left, right));
  };

  // Which ridge scale and which sign the predicted wires carry: whatever shows most of them. The
  // fine scale locates better, so the coarse one must be clearly ahead to be chosen.
  let polarity = o.polarity;
  let chosen = profiles[0];
  if (!polarity || profiles.length > 1) {
    let bestScore = -1;
    for (let idx = 0; idx < profiles.length; idx++) {
      for (const pol of polarity ? ([polarity] as const) : ([1, -1] as const)) {
        const band = pol > 0 ? profiles[idx].pos : profiles[idx].neg;
        let sum = 0;
        for (let k = 0; k < count; k++) {
          const c = fretCol[k];
          if (!(c > 2 && c < cols - 3) || first + k < 0 || first + k > model.fretCount) continue;
          for (let b = 0; b < BANDS; b++) {
            const p = peak(band, b, c, windowOf(k));
            if (p) sum += Math.min(p[1], 40);
          }
        }
        const score = sum * (idx === 0 ? 1.2 : 1);
        if (score > bestScore) {
          bestScore = score;
          chosen = profiles[idx];
          if (!o.polarity) polarity = pol;
        }
      }
    }
  }
  if (!polarity) polarity = 1;
  const ridge = chosen.map;
  const band = polarity > 0 ? chosen.pos : chosen.neg;

  // Tracking only: is the comb of wires still centred on the rows where the pose puts the board?
  let acrossShift = 0;
  if (o.alongSearch && o.alongSearch >= 1) {
    const energy = new Float32Array(rows);
    let top = 0;
    let at = 0;
    for (let i = 0; i < rows; i++) {
      let e = 0;
      const oi = i * cols;
      for (let j = 0; j < cols; j++) {
        const v = ridge[oi + j] * polarity;
        if (v > 2) e += v < 40 ? v : 40;
      }
      energy[i] = e;
    }
    for (let i = 1; i < rows - 1; i++) {
      const e = 0.25 * energy[i - 1] + 0.5 * energy[i] + 0.25 * energy[i + 1];
      if (e > top) {
        top = e;
        at = i;
      }
    }
    if (top > 0) {
      let lo = at;
      let hi = at;
      while (lo > 0 && energy[lo - 1] >= 0.4 * top) lo--;
      while (hi < rows - 1 && energy[hi + 1] >= 0.4 * top) hi++;
      const centre = etaOfRow(rect, (lo + hi) / 2);
      // Wires span about 1.8 of the 2 eta units of the board; a much shorter run is not the comb.
      if (etaOfRow(rect, hi) - etaOfRow(rect, lo) > 0.9 && Math.abs(centre) > 0.12) acrossShift = centre;
    }
  }

  // Coarse slide of the whole comb along the neck (tracking only).
  let slide = 0;
  if (o.alongSearch && o.alongSearch >= 1) {
    const total = new Float32Array(cols);
    let top = 0;
    for (let j = 0; j < cols; j++) {
      let v = 0;
      for (let b = 0; b < BANDS; b++) v += band[b * cols + j];
      total[j] = v;
      if (v > top) top = v;
    }
    const cap = 0.6 * top;
    const reach = Math.min(Math.round(o.alongSearch / rect.colStep), Math.floor(cols / 3));
    const scoreAt = (shift: number): number => {
      let sum = 0;
      for (let k = 0; k < count; k++) {
        const n = first + k;
        if (n < 1 || n > model.fretCount) continue;
        const j = Math.round(fretCol[k] + shift);
        if (j < 1 || j >= cols - 1) continue;
        const v = Math.max(total[j - 1], total[j], total[j + 1]);
        sum += v < cap ? v : cap;
      }
      return sum;
    };
    const stay = scoreAt(0);
    let best = stay;
    for (let shift = -reach; shift <= reach; shift++) {
      // Nearer positions win ties: the neck usually moved little.
      const sc = scoreAt(shift) * (1 - 0.1 * (Math.abs(shift) / Math.max(1, reach)));
      if (sc > best) {
        best = sc;
        slide = shift;
      }
    }
    if (best < 1.15 * stay) slide = 0;
  }

  // All band peaks, then a robust "typical fret" level to threshold them.
  const offs = new Float64Array(count * BANDS).fill(NaN);
  const vals = new Float64Array(count * BANDS);
  const strong: number[] = [];
  for (let k = 0; k < count; k++) {
    const c = fretCol[k];
    if (!(c + slide > 2 && c + slide < cols - 3)) continue;
    const win = windowOf(k);
    for (let b = 0; b < BANDS; b++) {
      const p = peak(band, b, c + slide, win);
      if (!p) continue;
      offs[k * BANDS + b] = p[0] + slide;
      vals[k * BANDS + b] = p[1];
      if (first + k >= 0 && first + k <= model.fretCount) strong.push(p[1]);
    }
  }
  if (strong.length < 4) return null;
  strong.sort((a, b) => b - a);
  const strength = strong[Math.floor(strong.length * 0.3)];
  const floor = Math.max(1.2, 0.3 * strength);

  const yc = boardCenterY(model);
  const obs: PointOnLine[] = [];
  const kinds: number[] = [];
  const frets: FretEvidence[] = [];
  let fretsExpected = 0;
  let fretsFound = 0;
  let bandsExpected = 0;
  let bandsFound = 0;
  let edgesExpected = 0;
  let edgesFound = 0;
  let edgeSqSum = 0;
  let bassSum = 0;
  let bassCount = 0;
  let trebleSum = 0;
  let trebleCount = 0;
  let gapsExpected = 0;
  let gapsFilled = 0;
  let minFret = Infinity;
  let maxFret = -Infinity;
  const bassLine = boardEdgePlaneLine(model, 'bass');
  const trebleLine = boardEdgePlaneLine(model, 'treble');
  const foundCol = new Float64Array(count).fill(NaN);
  const present = new Float32Array(rows);

  for (let k = 0; k < count; k++) {
    const n = first + k;
    const c = fretCol[k];
    const inStrip = c + slide > 2 && c + slide < cols - 3;
    // "In frame": the wire's two ends (a little inside the edges) are valid samples.
    let inFrame = inStrip;
    if (inStrip) {
      const j = Math.round(c + slide);
      const ia = Math.round(rowOfEta(rect, -0.85));
      const ib = Math.round(rowOfEta(rect, 0.85));
      inFrame = strip.valid[ia * cols + j] === 1 && strip.valid[ib * cols + j] === 1;
    }
    let found = 0;
    let sum = 0;
    let sumOff = 0;
    const real = n >= 0 && n <= model.fretCount;
    if (inStrip) {
      const line: Line = [1, 0, -fretX(model, n)];
      for (let b = 0; b < BANDS; b++) {
        const v = vals[k * BANDS + b];
        sum += Math.min(v, 2 * strength);
        if (!(v >= floor) || Number.isNaN(offs[k * BANDS + b])) continue;
        found++;
        sumOff += offs[k * BANDS + b];
        if (!real) continue;
        const row = (bandRows[b][0] + bandRows[b][1]) / 2;
        // The nut is a wide bar whose centre sits behind fret 0: keep it, but lightly.
        obs.push({ point: cellToImage(rect, row, c + offs[k * BANDS + b]), line, weight: (n === 0 ? 0.3 : 1) * Math.min(1, v / strength) });
        kinds.push(0);
      }
    }
    if (real && inFrame) {
      fretsExpected++;
      bandsExpected += BANDS;
      bandsFound += found;
      if (found >= 2) {
        fretsFound++;
        if (n < minFret) minFret = n;
        if (n > maxFret) maxFret = n;
      }
    }
    const wireCol = found > 0 ? c + sumOff / found : NaN;
    foundCol[k] = found >= 2 ? wireCol : NaN;
    // The opposite question: is there a full-width ridge half-way to the next wire, where a correct
    // pose has bare board (an inlay dot crosses one band at most)?
    if (real && inFrame && k + 1 < count && n + 1 <= model.fretCount) {
      const half = (c + fretCol[k + 1]) / 2 + slide;
      const win = Math.max(1.5, 0.12 * (fretCol[k + 1] - c));
      if (half > 2 && half < cols - 3) {
        let between = 0;
        for (let b = 0; b < BANDS; b++) {
          const p = peak(band, b, half, win);
          if (p && p[1] >= floor) between++;
        }
        gapsExpected++;
        if (between >= 3) gapsFilled++;
      }
    }

    // Ridge width at half height (the nut is about twice as wide as a fret wire).
    let widthMm = NaN;
    if (found >= 2) {
      let wsum = 0;
      let wn = 0;
      for (let b = 0; b < BANDS; b++) {
        const v = vals[k * BANDS + b];
        if (!(v >= floor)) continue;
        const centre = c + offs[k * BANDS + b];
        const ob = b * cols;
        const halfLevel = 0.5 * v;
        let l = centre;
        let r = centre;
        for (let j = Math.round(centre); j > 0 && centre - j < 12; j--) {
          if (band[ob + j] < halfLevel) {
            l = j + (halfLevel - band[ob + j]) / Math.max(1e-6, band[ob + j + 1] - band[ob + j]);
            break;
          }
          l = j;
        }
        for (let j = Math.round(centre); j < cols - 1 && j - centre < 12; j++) {
          if (band[ob + j] < halfLevel) {
            r = j - (halfLevel - band[ob + j]) / Math.max(1e-6, band[ob + j - 1] - band[ob + j]);
            break;
          }
          r = j;
        }
        wsum += xOfCol(rect, r) - xOfCol(rect, l);
        wn++;
      }
      if (wn > 0) widthMm = wsum / wn;
    }
    if (wantEvidence) {
      // Nut test around the predicted wire: bar = [x - 5, x - 1.5] mm, board = [x + 2.5, x + 8], behind = [x - 14, x - 8].
      const x = fretX(model, n);
      const ia = rowOfEta(rect, -0.8);
      const ib = rowOfEta(rect, 0.8);
      // Half of each patch inside the frame is enough: a nut cut by the frame border is still a nut.
      const mBar = patchMean(rect, ia, ib, colOfX(rect, x - 5), colOfX(rect, x - 1.5), 0.5);
      const mBoard = patchMean(rect, ia, ib, colOfX(rect, x + 2.5), colOfX(rect, x + 8), 0.5);
      const mBehind = patchMean(rect, ia, ib, colOfX(rect, x - 14), colOfX(rect, x - 8), 0.5);
      let bar = NaN;
      if (Number.isFinite(mBar) && Number.isFinite(mBoard) && Number.isFinite(mBehind)) {
        const a = mBar - mBoard;
        const b = mBar - mBehind;
        bar = a * b > 0 ? (Math.sign(a) * Math.min(Math.abs(a), Math.abs(b))) / strength : 0;
      }
      frets.push({ fret: n, inFrame, bands: found, strength: sum / (BANDS * strength), widthMm, bar });
    }

    // Where the wire stops: the two board edges.
    if (real && found >= 3) {
      const j = Math.round(wireCol);
      if (j >= 1 && j < cols - 1) {
        let inside = 0;
        let cnt = 0;
        for (let i = 0; i < rows; i++) {
          const oi = i * cols + j;
          const a = ridge[oi] * polarity;
          const l = ridge[oi - 1] * polarity;
          const r = ridge[oi + 1] * polarity;
          present[i] = Math.max(a, l, r, 0);
          const eta = etaOfRow(rect, i);
          if (eta > -0.8 && eta < 0.8) {
            inside += present[i];
            cnt++;
          }
        }
        const level = 0.4 * (inside / Math.max(1, cnt));
        if (level > 0.5) {
          for (const side of [-1, 1] as const) {
            const start = Math.round(rowOfEta(rect, side * 0.55));
            let last = -1;
            for (let i = start; i >= 0 && i < rows; i += side) {
              if (present[i] >= level) {
                last = i;
                continue;
              }
              const next = i + side;
              if (next < 0 || next >= rows || present[next] < level) break;
            }
            const out = last + side;
            // The wire runs out of the frame before it ends: nothing to learn here.
            if (last >= 0 && (out < 0 || out >= rows || !strip.valid[out * cols + j])) continue;
            edgesExpected++;
            if (last < 0) {
              edgeSqSum += 0.16;
              continue;
            }
            const a = present[last];
            const b = present[out];
            const t = a > b ? Math.max(0, Math.min(1, (a - level) / (a - b))) : 0.5;
            const edgeRow = last + side * t;
            const eta = etaOfRow(rect, edgeRow);
            // An "edge" far inside the board is a finger, far outside is background clutter.
            if (Math.abs(eta) < 0.72 || Math.abs(eta) > 1.38) {
              edgeSqSum += 0.16;
              continue;
            }
            edgesFound++;
            edgeSqSum += (Math.abs(eta) - 1) * (Math.abs(eta) - 1);
            if (side < 0) {
              bassSum += eta + 1;
              bassCount++;
            } else {
              trebleSum += eta - 1;
              trebleCount++;
            }
            obs.push({ point: cellToImage(rect, edgeRow, wireCol), line: side < 0 ? bassLine : trebleLine, weight: 0.7 });
            kinds.push(1);
          }
        }
      }
    }
  }

  // Strings: ridges across the rows inside each cell whose two wires were found.
  let stringsExpected = 0;
  let stringsFound = 0;
  const cells: CellEvidence[] = [];
  const rowsPerEta = (rows - 1) / (2 * ETA_MAX);
  const stringSign: 1 | -1 = o.stringPolarity ?? polarity;
  const column = new Float32Array(rows);
  const across = new Float32Array(rows);
  let acrossCells = 0;
  for (let k = 1; k < count; k++) {
    const n = first + k;
    const cA = Number.isNaN(foundCol[k - 1]) ? fretCol[k - 1] : foundCol[k - 1];
    const cB = Number.isNaN(foundCol[k]) ? fretCol[k] : foundCol[k];
    if (wantEvidence && cA > 0 && cB < cols - 1 && cB - cA > 3) {
      const xm = (xOfCol(rect, cA) + xOfCol(rect, cB)) / 2;
      const cm = colOfX(rect, xm);
      // Patch half-size: about 2.5 mm along the neck (at least a column).
      const mmPerCol = Math.max(1e-6, xOfCol(rect, cm + 0.5) - xOfCol(rect, cm - 0.5));
      const hc = Math.max(1, Math.min((cB - cA) * 0.25, 2.5 / mmPerCol));
      const hr = Math.max(0.6, 0.09 * rowsPerEta);
      const sample = (eta: number): number => {
        const row = rowOfEta(rect, eta);
        return patchMean(rect, row - hr, row + hr, cm - hc, cm + hc);
      };
      // A double dot sits 0.3 string spans either side of the centre.
      const pairEta = (0.6 * stringSpanAt(model, xm)) / boardWidthAt(model, xm);
      const centre = sample(0);
      const pair = (sample(-pairEta) + sample(pairEta)) / 2;
      const board = (sample(-0.6 * pairEta) + sample(0.6 * pairEta)) / 2;
      const mean = patchMean(rect, rowOfEta(rect, -0.8), rowOfEta(rect, 0.8), cA + 2, cB - 2);
      const ok = Number.isFinite(centre) && Number.isFinite(pair) && Number.isFinite(board) && Number.isFinite(mean);
      cells.push({ fret: n, inFrame: ok, centre: ok ? centre : 0, pair: ok ? pair : 0, board: ok ? board : 0, mean: ok ? mean : 0 });
    }
    if (o.strings === false || n < 1 || n > model.fretCount) continue;
    if (Number.isNaN(foundCol[k - 1]) || Number.isNaN(foundCol[k])) continue;
    const j0 = Math.ceil(cA + 2.5);
    const j1 = Math.floor(cB - 2.5);
    if (j1 - j0 < 2) continue;
    const xm = (xOfCol(rect, cA) + xOfCol(rect, cB)) / 2;
    const spacingRows = ((2 * stringSpanAt(model, xm)) / boardWidthAt(model, xm) / (model.stringCount - 1)) * rowsPerEta;
    if (spacingRows < 3.2) continue;
    // Average along the cell, leaving out its middle where an inlay dot would sit between two strings.
    const skipA = j1 - j0 >= 8 ? Math.round(j0 + 0.3 * (j1 - j0)) : j1 + 1;
    const skipB = j1 - j0 >= 8 ? Math.round(j1 - 0.3 * (j1 - j0)) : j1 + 1;
    let allValid = true;
    for (let i = 0; i < rows; i++) {
      let s = 0;
      let cnt = 0;
      const oi = i * cols;
      for (let j = j0; j <= j1; j++) {
        if (j > skipA && j < skipB) continue;
        s += strip.data[oi + j];
        cnt++;
        if (!strip.valid[oi + j]) allValid = false;
      }
      column[i] = s / cnt;
    }
    if (!allValid) continue;
    for (let i = 0; i < rows; i++) across[i] += column[i];
    acrossCells++;
    const d = spacingRows >= 7 ? 2 : 1;
    const win = 0.34 * spacingRows;
    const cm = (j0 + j1) / 2;
    for (let s = 1; s <= model.stringCount; s++) {
      stringsExpected++;
      const t = model.stringCount > 1 ? (model.stringCount - s) / (model.stringCount - 1) : 0.5;
      const eta = ((2 * t - 1) * stringSpanAt(model, xm)) / boardWidthAt(model, xm);
      const r0 = rowOfEta(rect, eta);
      let best = 0;
      let bi = -1;
      for (let i = Math.max(d, Math.ceil(r0 - win)); i <= Math.min(rows - 1 - d, Math.floor(r0 + win)); i++) {
        const a = column[i] - column[i - d];
        const b = column[i] - column[i + d];
        // Strings have the sign the comb lock found, or else that of the fret wires (both are metal);
        // the other sign is the gap between two strings.
        const v = a > 0 && b > 0 ? (stringSign === -1 ? 0 : Math.min(a, b)) : a < 0 && b < 0 ? (stringSign === 1 ? 0 : Math.min(-a, -b)) : 0;
        if (v > best) {
          best = v;
          bi = i;
        }
      }
      if (bi < 0 || best < 1.5) continue;
      stringsFound++;
      // Sub-row position from the parabola through the brightness itself.
      const l = Math.abs(column[bi - 1] - column[bi]);
      const r = Math.abs(column[bi + 1] - column[bi]);
      const sub = l + r > 1e-6 ? Math.max(-0.5, Math.min(0.5, (0.5 * (l - r)) / (l + r))) : 0;
      obs.push({ point: cellToImage(rect, bi + sub, cm), line: stringPlaneLine(model, s), weight: 0.5 * Math.min(1, best / 6) });
      kinds.push(2);
    }
  }
  return { obs, kinds, polarity, ridgeScale: chosen.d, strength, fretsExpected, fretsFound, bandsExpected, bandsFound, edgesExpected, edgesFound, edgeSqSum, edgeShift: bassCount >= 3 && trebleCount >= 3 ? (bassSum / bassCount + trebleSum / trebleCount) / 2 : NaN, gapsExpected, gapsFilled, stringsExpected, stringsFound, minFret, maxFret, frets, cells, rect, across, acrossCells, acrossShift };
}

/**
 * Lock the six strings as a comb. The wire ends put the board edges a little inside the true ones
 * on bound necks, enough for the outer strings to be looked for in the wrong place; but six evenly
 * spaced ridges in the neck-wide across profile are unmistakable. Returns the correction in eta
 * (true eta = shift + scale * model eta) and the sign of the string ridges, or null when no comb of
 * at least four strings is found.
 */
function lockStrings(m: Measured, model: NeckModel, known?: 1 | -1): { scale: number; shift: number; polarity: 1 | -1 } | null {
  // Strings and fret wires are both metal: on a dark board both are brighter than it, on a light
  // board both darker. The gaps between strings have the other sign, so that sign has to earn it.
  const preferred = m.polarity;
  const { rect, across, acrossCells } = m;
  const rows = rect.rows;
  const nStr = model.stringCount;
  if (acrossCells < 3 || nStr < 4) return null;
  const xm = (rect.xStart + rect.xEnd) / 2;
  const ratio = stringSpanAt(model, xm) / boardWidthAt(model, xm);
  const rowsPerEta = (rows - 1) / (2 * rect.etaMax);
  const spacing = ((2 * ratio) / (nStr - 1)) * rowsPerEta;
  if (spacing < 3.2) return null;
  const d = spacing >= 7 ? 2 : 1;
  const centre = (rows - 1) / 2;
  const modelRow = (i: number): number => centre + (i - (nStr - 1) / 2) * spacing;
  const rLo = Math.max(1, Math.ceil(rowOfEta(rect, -1.25)));
  const rHi = Math.min(rows - 2, Math.floor(rowOfEta(rect, 1.25)));
  const v = new Float32Array(rows);
  let best = -Infinity;
  let bestScale = 1;
  let bestShift = 0;
  let bestPolarity: 1 | -1 = 1;
  // Bright strings leave dark gaps between them (and dark strings bright gaps), which are ridges of
  // the other sign half a spacing off: each sign is tried as a whole and the fuller comb wins.
  for (const pol of known ? ([known] as const) : ([1, -1] as const)) {
    let top = 0;
    v.fill(0);
    for (let i = d; i < rows - d; i++) {
      const a = (across[i] - across[i - d]) * pol;
      const b = (across[i] - across[i + d]) * pol;
      v[i] = a > 0 && b > 0 ? Math.min(a, b) / acrossCells : 0;
      if (v[i] > top) top = v[i];
    }
    const floor = Math.max(0.8, 0.2 * top);
    const peaks: number[] = [];
    for (let i = rLo; i <= rHi; i++) {
      if (v[i] < floor || v[i] < v[i - 1] || v[i] <= v[i + 1]) continue;
      const den = v[i - 1] - 2 * v[i] + v[i + 1];
      peaks.push(i + (den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (v[i - 1] - v[i + 1])) / den)) : 0));
    }
    if (peaks.length < 4) continue;
    for (let p = 0; p < peaks.length - 1; p++) {
      for (let q = p + 1; q < peaks.length; q++) {
        for (let a = 0; a < nStr - 1; a++) {
          for (let b = a + 1; b < nStr; b++) {
            const scale = (peaks[q] - peaks[p]) / ((b - a) * spacing);
            // Wire ends stop short of the binding (strings up to 13% wider than they suggest), never far beyond the board.
            if (scale < 0.9 || scale > 1.2) continue;
            // row = centre + shiftRows + scale * (modelRow - centre)
            const shiftRows = peaks[p] - centre - scale * (modelRow(a) - centre);
            // The wire ends put the board's centre line right even where they miss its width, so a
            // comb half a spacing off (the gaps between the strings, read as strings) is ruled out.
            if (Math.abs(shiftRows) > 0.3 * spacing) continue;
            let score = 0;
            for (let i = 0; i < nStr; i++) {
              const r = centre + shiftRows + scale * (modelRow(i) - centre);
              let near = Infinity;
              for (let k = 0; k < peaks.length; k++) {
                const e = Math.abs(peaks[k] - r);
                if (e < near) near = e;
              }
              if (near <= 0.2 * scale * spacing) score += 1 - near / (scale * spacing);
            }
            score -= (1.5 * Math.abs(shiftRows)) / spacing + 2 * Math.abs(Math.log(scale)) + (pol === preferred ? 0 : 1.5);
            if (score > best) {
              best = score;
              bestScale = scale;
              bestShift = shiftRows;
              bestPolarity = pol;
            }
          }
        }
      }
    }
  }
  if (!(best >= 3.4)) return null;
  return { scale: bestScale, shift: bestShift / rowsPerEta, polarity: bestPolarity };
}

/** The pose whose strings sit at eta' = shift + scale * eta of the given pose (eta: -1 bass edge, +1 treble edge). */
export function applyAcross(H: Mat3, model: NeckModel, lock: { scale: number; shift: number }): Mat3 {
  const yc = boardCenterY(model);
  const taper = (model.width12 - model.nutWidth) / (model.scaleLength / 2);
  // y' = yc + shift * W(x) / 2 + scale * (y - yc), an affine map of the plane.
  const A: Mat3 = [1, 0, 0, (lock.shift * taper) / 2, lock.scale, yc + (lock.shift * model.nutWidth) / 2 - lock.scale * yc, 0, 0, 1];
  return multiply(H, A);
}

/** Distance in pixels from an image point to the image of a plane line under H. */
function lineResidual(H: Mat3, line: Line, p: Point): number {
  // Two points of the plane line, projected.
  const nx = line[0];
  const ny = line[1];
  const px = -nx * line[2];
  const py = -ny * line[2];
  const a = planeToImage(H, px - ny * 40, py + nx * 40);
  const b = planeToImage(H, px + ny * 40, py - nx * 40);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (!(len > 1e-9)) return Infinity;
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

/**
 * Refine a pose against the image. Returns null when the board cannot be measured at all (off the
 * frame, or no fret evidence anywhere); otherwise the caller judges `support`.
 */
export function refinePose(img: Image32, H0: Mat3, model: NeckModel, options: RefineOptions = {}): RefineResult | null {
  const windows = options.windows ?? [0.3, 0.2];
  const priorWeight = options.priorWeight ?? 0.5;
  let H = H0;
  let polarity = options.polarity;
  let last: Measured | null = null;
  let residual = NaN;
  let locked = false;
  let stringPolarity = options.stringPolarity;
  let ridge = options.ridge;
  for (let it = 0; it < windows.length; it++) {
    const finalRound = it === windows.length - 1;
    const withStrings = options.strings !== false && it > 0;
    let m = measure(img, H, model, windows[it], { ...options, polarity, ridge, strings: withStrings, stringPolarity, alongSearch: it === 0 ? options.alongSearch : 0 }, false);
    if (!m) break;
    if (it === 0 && m.acrossShift !== 0) {
      // The neck moved across itself: re-centre the strip on the comb before measuring anything.
      const moved = applyAcross(H, model, { scale: 1, shift: m.acrossShift });
      const again = measure(img, moved, model, windows[it], { ...options, polarity, ridge: m.ridgeScale, strings: false, alongSearch: options.alongSearch }, false);
      if (again) {
        H = moved;
        m = again;
      }
    }
    if (withStrings && !locked && options.stringLock !== false) {
      // First look at the strings: put the whole comb of six in place before matching them one by one.
      locked = true;
      const lock = lockStrings(m, model, stringPolarity);
      if (lock) {
        stringPolarity = lock.polarity;
        const moved = applyAcross(H, model, lock);
        const again = measure(img, moved, model, windows[it], { ...options, polarity: m.polarity, ridge: m.ridgeScale, strings: true, stringPolarity, alongSearch: 0 }, false);
        if (again) {
          H = moved;
          m = again;
        }
      }
    }
    polarity = m.polarity;
    ridge = m.ridgeScale;
    last = m;
    if (m.obs.length < 8) break;
    // Weak pull toward the current pose at the corners of the visible board.
    const xs = [m.rect.xStart, m.rect.xEnd];
    const prior: PointPair[] = [];
    for (const x of xs) {
      for (const side of ['bass', 'treble'] as const) {
        const y = boardEdgeY(model, x, side);
        prior.push({ plane: { x, y }, image: planeToImage(H, x, y), weight: priorWeight });
      }
    }
    // Once the strings are locked they define the geometry across the neck: note markers go on
    // strings, and the wire ends (binding, bevels, the true width of this neck) only got us here.
    if (m.stringsExpected >= 12 && m.stringsFound >= 0.6 * m.stringsExpected) {
      for (let q = 0; q < m.obs.length; q++) if (m.kinds[q] === 1) m.obs[q] = { ...m.obs[q], weight: 0.12 * (m.obs[q].weight ?? 1) };
    }
    let solved: Mat3 | null = homographyFromPointsOnLines(m.obs, prior);
    if (!solved) break;
    // Two rounds of reweighting: measurements that disagree with the consensus lose their say.
    for (let round = 0; round < 2 && solved; round++) {
      const cur: Mat3 = solved;
      const weighted = m.obs.map((ob) => {
        const r = lineResidual(cur, ob.line, ob.point);
        return { point: ob.point, line: ob.line, weight: (ob.weight ?? 1) / (1 + (r / 1.5) * (r / 1.5)) };
      });
      solved = homographyFromPointsOnLines(weighted, prior) ?? solved;
      if (round === 1 || !solved) break;
    }
    if (!solved) break;
    H = solved;
    if (finalRound) {
      let sum = 0;
      let wsum = 0;
      for (const ob of m.obs) {
        const r = lineResidual(H, ob.line, ob.point);
        if (!(r < 4)) continue;
        sum += r * r;
        wsum++;
      }
      residual = wsum > 0 ? Math.sqrt(sum / wsum) : NaN;
    }
  }
  if (!last) return null;
  // A last look through the final pose: support and evidence must describe what is returned.
  const check = measure(img, H, model, 0.12, { ...options, polarity, ridge, strings: options.strings !== false, stringPolarity, alongSearch: 0 }, options.evidence === true);
  if (!check) return null;
  return {
    H,
    polarity: check.polarity,
    ridgeScale: check.ridgeScale,
    strength: check.strength,
    fretsExpected: check.fretsExpected,
    fretsFound: check.fretsFound,
    support: check.bandsExpected > 0 ? check.bandsFound / check.bandsExpected : 0,
    antiSupport: check.gapsExpected > 0 ? check.gapsFilled / check.gapsExpected : 0,
    edgeSupport: check.edgesExpected > 0 ? check.edgesFound / check.edgesExpected : 0,
    edgeError: check.edgesExpected > 0 ? Math.sqrt(check.edgeSqSum / check.edgesExpected) : 0.4,
    edgeShift: check.edgeShift,
    stringSupport: check.stringsExpected > 0 ? check.stringsFound / check.stringsExpected : 0,
    stringsLooked: check.stringsExpected,
    residualPx: residual,
    minFret: check.minFret,
    maxFret: check.maxFret,
    stringPolarity,
    frets: options.evidence ? check.frets : undefined,
    cells: options.evidence ? check.cells : undefined,
  };
}

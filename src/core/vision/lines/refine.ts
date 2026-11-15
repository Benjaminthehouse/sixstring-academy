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
import { boardCenterY, boardEdgePlaneLine, boardEdgeY, boardWidthAt, fretX, homographyFromPointsOnLines, stringPlaneLine, stringSpanAt, type PointOnLine, type PointPair } from '../geometry';
import type { Line, Mat3, NeckModel, Point } from '../types';
import type { Image32 } from './image';
import { cellToImage, colOfX, etaOfRow, rectify, rowOfEta, visibleRange, xOfCol, type Rectified } from './rectify';
import { ridgeAlongRows } from './strip';

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
}

/** Options of `refinePose`. */
export interface RefineOptions {
  /** Half-width of the search for each wire, as a fraction of the local fret spacing, per iteration (default [0.3, 0.2]). */
  windows?: readonly number[];
  /** Fret polarity if known: +1 bright wires on a dark board, -1 dark wires on a light board. */
  polarity?: 1 | -1;
  /** Weight of the pull toward the starting pose (default 0.5; raise it for tracking through occlusion). */
  priorWeight?: number;
  /** Also lock onto the strings (default true). */
  strings?: boolean;
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
  /** Typical fret ridge strength in gray levels. */
  strength: number;
  /** Real frets (0..fretCount) whose wire lies in the frame, and how many of them were found. */
  fretsExpected: number;
  fretsFound: number;
  /** Found band measurements over expected ones (0..1): how much of the predicted comb the image supports. */
  support: number;
  /** Edge points found over those looked for (0..1). */
  edgeSupport: number;
  /** String points found over those looked for (0..1; 0 when strings are too close to resolve). */
  stringSupport: number;
  /** Root-mean-square distance in pixels between the measurements used and the refined model. */
  residualPx: number;
  /** Lowest and highest real fret found. */
  minFret: number;
  maxFret: number;
  frets?: FretEvidence[];
  cells?: CellEvidence[];
}

const BANDS = 4;
const BAND_ETA: readonly (readonly [number, number])[] = [[-0.88, -0.44], [-0.44, 0], [0, 0.44], [0.44, 0.88]];
const ETA_MAX = 1.45;

let RECT: Rectified | undefined;
let RIDGE = new Float32Array(0);

interface Measured {
  obs: PointOnLine[];
  /** Kind of each observation: 0 fret, 1 edge, 2 string. */
  kinds: number[];
  polarity: 1 | -1;
  strength: number;
  fretsExpected: number;
  fretsFound: number;
  bandsExpected: number;
  bandsFound: number;
  edgesExpected: number;
  edgesFound: number;
  stringsExpected: number;
  stringsFound: number;
  minFret: number;
  maxFret: number;
  frets: FretEvidence[];
  cells: CellEvidence[];
  rect: Rectified;
}

function planeToImage(H: Mat3, x: number, y: number): Point {
  const w = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}

/** Mean of a rectangular patch of a strip; NaN when any sample is invalid or outside. */
function patchMean(r: Rectified, rowA: number, rowB: number, colA: number, colB: number): number {
  const i0 = Math.max(0, Math.round(rowA));
  const i1 = Math.min(r.rows - 1, Math.round(rowB));
  const j0 = Math.round(colA);
  const j1 = Math.round(colB);
  if (j0 < 0 || j1 >= r.cols || i1 < i0 || j1 < j0) return NaN;
  let sum = 0;
  let n = 0;
  for (let i = i0; i <= i1; i++) {
    const o = i * r.cols;
    for (let j = j0; j <= j1; j++) {
      if (!r.strip.valid[o + j]) return NaN;
      sum += r.strip.data[o + j];
      n++;
    }
  }
  return n > 0 ? sum / n : NaN;
}

/** Locate frets, edges and strings under a pose. */
function measure(img: Image32, H: Mat3, model: NeckModel, window: number, o: RefineOptions, wantEvidence: boolean): Measured | null {
  const fromFret = o.fromFret ?? -3;
  const toFret = o.toFret ?? model.fretCount + 2;
  const range = visibleRange(H, model, img.width, img.height, fromFret - 0.5, toFret + 0.5);
  if (!range) return null;
  const rect = rectify(img, H, model, range[0], range[1], ETA_MAX, 900, 64, RECT);
  if (!rect) return null;
  RECT = rect;
  const { rows, cols, strip } = rect;
  if (RIDGE.length < rows * cols) RIDGE = new Float32Array(rows * cols);
  const ridge = ridgeAlongRows(strip, 2, RIDGE);

  // Band-summed ridge profiles for both polarities.
  const bandPos = new Float32Array(BANDS * cols);
  const bandNeg = new Float32Array(BANDS * cols);
  const bandRows: [number, number][] = [];
  for (let b = 0; b < BANDS; b++) {
    const i0 = Math.max(0, Math.ceil(rowOfEta(rect, BAND_ETA[b][0])));
    const i1 = Math.min(rows - 1, Math.floor(rowOfEta(rect, BAND_ETA[b][1])));
    bandRows.push([i0, i1]);
    const k = 1 / Math.max(1, i1 - i0 + 1);
    for (let i = i0; i <= i1; i++) {
      const oi = i * cols;
      const ob = b * cols;
      for (let j = 0; j < cols; j++) {
        const v = ridge[oi + j];
        if (v > 0) bandPos[ob + j] += v * k;
        else if (v < 0) bandNeg[ob + j] -= v * k;
      }
    }
  }

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

  // Polarity: which sign of ridge the predicted wires carry.
  let polarity = o.polarity;
  if (!polarity) {
    let sp = 0;
    let sn = 0;
    for (let k = 0; k < count; k++) {
      const c = fretCol[k];
      if (!(c > 2 && c < cols - 3) || first + k < 0 || first + k > model.fretCount) continue;
      for (let b = 0; b < BANDS; b++) {
        const p = peak(bandPos, b, c, windowOf(k));
        const q = peak(bandNeg, b, c, windowOf(k));
        if (p) sp += Math.min(p[1], 40);
        if (q) sn += Math.min(q[1], 40);
      }
    }
    polarity = sn > sp ? -1 : 1;
  }
  const band = polarity > 0 ? bandPos : bandNeg;

  // All band peaks, then a robust "typical fret" level to threshold them.
  const offs = new Float64Array(count * BANDS).fill(NaN);
  const vals = new Float64Array(count * BANDS);
  const strong: number[] = [];
  for (let k = 0; k < count; k++) {
    const c = fretCol[k];
    if (!(c > 2 && c < cols - 3)) continue;
    const win = windowOf(k);
    for (let b = 0; b < BANDS; b++) {
      const p = peak(band, b, c, win);
      if (!p) continue;
      offs[k * BANDS + b] = p[0];
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
  let minFret = Infinity;
  let maxFret = -Infinity;
  const bassLine = boardEdgePlaneLine(model, 'bass');
  const trebleLine = boardEdgePlaneLine(model, 'treble');
  const foundCol = new Float64Array(count).fill(NaN);
  const present = new Float32Array(rows);

  for (let k = 0; k < count; k++) {
    const n = first + k;
    const c = fretCol[k];
    const inStrip = c > 2 && c < cols - 3;
    // "In frame": the wire's two ends (a little inside the edges) are valid samples.
    let inFrame = inStrip;
    if (inStrip) {
      const j = Math.round(c);
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
    if (wantEvidence) frets.push({ fret: n, inFrame, bands: found, strength: sum / (BANDS * strength), widthMm });

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
            edgesExpected++;
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
            if (last < 0) continue;
            const out = last + side;
            if (out < 0 || out >= rows || !strip.valid[out * cols + j]) continue;
            const a = present[last];
            const b = present[out];
            const t = a > b ? Math.max(0, Math.min(1, (a - level) / (a - b))) : 0.5;
            const edgeRow = last + side * t;
            const eta = etaOfRow(rect, edgeRow);
            // An "edge" far inside the board is a finger, far outside is background clutter.
            if (Math.abs(eta) < 0.72 || Math.abs(eta) > 1.38) continue;
            edgesFound++;
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
  const column = new Float32Array(rows);
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
      const ok = Number.isFinite(centre) && Number.isFinite(pair) && Number.isFinite(board);
      cells.push({ fret: n, inFrame: ok, centre: ok ? centre : 0, pair: ok ? pair : 0, board: ok ? board : 0 });
    }
    if (o.strings === false || n < 1 || n > model.fretCount) continue;
    if (Number.isNaN(foundCol[k - 1]) || Number.isNaN(foundCol[k])) continue;
    const j0 = Math.ceil(cA + 2.5);
    const j1 = Math.floor(cB - 2.5);
    if (j1 - j0 < 2) continue;
    const xm = (xOfCol(rect, cA) + xOfCol(rect, cB)) / 2;
    const spacingRows = ((2 * stringSpanAt(model, xm)) / boardWidthAt(model, xm) / (model.stringCount - 1)) * rowsPerEta;
    if (spacingRows < 3.2) continue;
    let allValid = true;
    for (let i = 0; i < rows; i++) {
      let s = 0;
      const oi = i * cols;
      for (let j = j0; j <= j1; j++) {
        s += strip.data[oi + j];
        if (!strip.valid[oi + j]) allValid = false;
      }
      column[i] = s / (j1 - j0 + 1);
    }
    if (!allValid) continue;
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
        // A string is a ridge of either sign (bright steel, dark wound strings on maple).
        const v = a > 0 && b > 0 ? Math.min(a, b) : a < 0 && b < 0 ? Math.min(-a, -b) : 0;
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
  void yc;
  return { obs, kinds, polarity, strength, fretsExpected, fretsFound, bandsExpected, bandsFound, edgesExpected, edgesFound, stringsExpected, stringsFound, minFret, maxFret, frets, cells, rect };
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
  for (let it = 0; it < windows.length; it++) {
    const finalRound = it === windows.length - 1;
    const m = measure(img, H, model, windows[it], { ...options, polarity, strings: options.strings !== false && it > 0 }, false);
    if (!m) break;
    polarity = m.polarity;
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
  const check = measure(img, H, model, 0.12, { ...options, polarity, strings: options.strings !== false }, options.evidence === true);
  if (!check) return null;
  return {
    H,
    polarity: check.polarity,
    strength: check.strength,
    fretsExpected: check.fretsExpected,
    fretsFound: check.fretsFound,
    support: check.bandsExpected > 0 ? check.bandsFound / check.bandsExpected : 0,
    edgeSupport: check.edgesExpected > 0 ? check.edgesFound / check.edgesExpected : 0,
    stringSupport: check.stringsExpected > 0 ? check.stringsFound / check.stringsExpected : 0,
    residualPx: residual,
    minFret: check.minFret,
    maxFret: check.maxFret,
    frets: options.evidence ? check.frets : undefined,
    cells: options.evidence ? check.cells : undefined,
  };
}

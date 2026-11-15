/**
 * Absolute fret numbers. Fret spacing is self-similar, so geometry alone never says whether the
 * lowest visible wire is fret 2 or fret 5. Two things do: the nut (the board ends there, at a bar
 * unlike a fret wire, and no wire follows) and the inlay pattern (single markers at 3 5 7 9 15 17
 * 19 21, a double dot at 12). Both are read from evidence sampled through the current pose
 * (`refinePose(..., { evidence: true })`); the answer is a shift of the current numbering with a
 * confidence, and an honest "assumed" when neither cue is in view.
 */
import { DOUBLE_INLAY_FRETS, INLAY_FRETS } from '../geometry';
import type { NumberingSource } from '../types';
import type { CellEvidence, FretEvidence } from './refine';

/** What `resolveNumbering` needs to know besides the evidence. */
export interface NumberingOptions {
  /** Number of fret wires of the neck model. */
  fretCount: number;
  /** +1 bright wires / bright inlays on a dark board, -1 the opposite (maple). */
  polarity: 1 | -1;
  /** Typical fret ridge strength in gray levels (scales the inlay threshold). */
  strength: number;
}

/** Outcome of the numbering stage. */
export interface NumberingResult {
  /** Add this to every current fret number. */
  delta: number;
  source: NumberingSource;
  /** 0..1; below 0.5 the UI should ask for a confirmation tap. */
  confidence: number;
  /** What the nut and the inlay pattern each proposed (null = no opinion), with a 0..1 score. */
  nut: { delta: number; score: number } | null;
  inlays: { delta: number; score: number; matched: number; double: boolean } | null;
}

/** Classification of one fret cell. */
export type InlayKind = 'none' | 'single' | 'double' | 'unknown';

/** No guitar has more frets than this. */
const MAX_FRETS = 24;

function medianOf(values: number[]): number {
  if (values.length === 0) return NaN;
  const v = [...values].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Cells that certainly show the board: sampled inside the frame and bounded by two found wires. */
function boundedCells(cells: readonly CellEvidence[], frets: readonly FretEvidence[]): Map<number, CellEvidence> {
  const found = new Set<number>();
  for (const f of frets) if (f.bands >= 2) found.add(f.fret);
  const out = new Map<number, CellEvidence>();
  for (const c of cells) if (c.inFrame && found.has(c.fret) && found.has(c.fret - 1)) out.set(c.fret, c);
  return out;
}

/**
 * Decide for every observable cell whether it carries an inlay. Lighting changes along a neck, so
 * every comparison is local: a dot is a centre patch unlike the plain board beside it in the same
 * cell; a double dot is a pair of off-centre patches unlike the same patches of the neighbouring
 * cells; a block covers the whole cell, so its "plain board" is unlike that of its neighbours
 * (no two neighbouring frets both carry an inlay).
 */
export function classifyCells(cells: readonly CellEvidence[], frets: readonly FretEvidence[], options: NumberingOptions): Map<number, InlayKind> {
  const out = new Map<number, InlayKind>();
  const board = boundedCells(cells, frets);
  const pol = options.polarity;
  const threshold = Math.max(9, 0.3 * options.strength);
  for (const c of cells) {
    if (!board.has(c.fret)) {
      out.set(c.fret, 'unknown');
      continue;
    }
    // Nearest bounded neighbours on either side (at most two cells away).
    const near: CellEvidence[] = [];
    for (const side of [-1, 1]) {
      const q = board.get(c.fret + side) ?? board.get(c.fret + 2 * side);
      if (q) near.push(q);
    }
    const dot = (c.centre - c.board) * pol;
    if (dot > threshold) {
      out.set(c.fret, 'single');
      continue;
    }
    if (near.length === 0) {
      out.set(c.fret, 'unknown');
      continue;
    }
    // "Unlike the neighbours" means beyond the least marked of them: a block's neighbours are plain.
    const plainBoard = Math.min(...near.map((q) => q.board * pol));
    const plainPair = Math.min(...near.map((q) => q.pair * pol));
    const block = c.board * pol - plainBoard;
    const pair = c.pair * pol - plainPair;
    // The double-dot patches lie under two strings, whose glints vary from cell to cell: only a
    // pair that clearly outshines both its own board and its neighbours' pairs counts.
    const strong = Math.max(2 * threshold, 0.8 * options.strength);
    if (block > threshold && c.centre * pol - plainBoard > threshold) out.set(c.fret, 'single');
    else if (pair > strong && (c.pair - c.board) * pol > strong && dot < 0.5 * threshold) out.set(c.fret, 'double');
    else out.set(c.fret, 'none');
  }
  return out;
}

interface InlayMatch {
  delta: number;
  score: number;
  margin: number;
  matched: number;
  double: boolean;
}

/** Score the inlay pattern for every shift; the best shift with its margin over the runner-up. */
function matchInlays(kinds: Map<number, InlayKind>, minDelta: number, maxDelta: number): InlayMatch | null {
  const entries = [...kinds.entries()].filter(([, k]) => k !== 'unknown');
  const marked = entries.filter(([, k]) => k !== 'none').length;
  if (entries.length < 3 || marked < 2) return null;
  let best: InlayMatch | null = null;
  let second = -Infinity;
  for (let delta = minDelta; delta <= maxDelta; delta++) {
    let score = 0;
    let matched = 0;
    let double = false;
    for (const [cell, kind] of entries) {
      const n = cell + delta;
      // Fret 1 carries a block on some guitars and nothing on most: no evidence either way.
      if (n === 1) continue;
      const expected: InlayKind = n < 1 || n > MAX_FRETS ? 'none' : DOUBLE_INLAY_FRETS.includes(n) ? 'double' : INLAY_FRETS.includes(n) ? 'single' : 'none';
      if (kind === expected) {
        if (kind === 'double') {
          score += 2.5;
          matched++;
          double = true;
        } else if (kind === 'single') {
          score += 1;
          matched++;
        } else score += 0.25;
      } else if (kind === 'none' || expected === 'none') score -= 1;
      // A single marker where a double is expected (block inlays have no double) or the reverse.
      else {
        score += 0.4;
        matched++;
      }
    }
    if (!best || score > best.score) {
      if (best) second = Math.max(second, best.score);
      best = { delta, score, margin: 0, matched, double };
    } else if (score > second) second = score;
  }
  if (!best || !(best.score > 0)) return null;
  best.margin = best.score - Math.max(0, second);
  return best;
}

/**
 * Resolve the whole-fret offset from fret and cell evidence gathered under the current numbering.
 */
export function resolveNumbering(frets: readonly FretEvidence[], cells: readonly CellEvidence[], options: NumberingOptions): NumberingResult {
  const byFret = new Map<number, FretEvidence>();
  for (const f of frets) byFret.set(f.fret, f);
  const byCell = new Map<number, CellEvidence>();
  for (const c of cells) byCell.set(c.fret, c);
  const foundFrets = frets.filter((f) => f.bands >= 2).map((f) => f.fret);
  if (foundFrets.length === 0) return { delta: 0, source: 'assumed', confidence: 0, nut: null, inlays: null };
  const lo = Math.min(...foundFrets);
  const hi = Math.max(...foundFrets);
  // Shifts that keep every found wire on a neck. Real necks have up to 24 frets whatever the preset
  // says, and the end of the board often reads as one more wire.
  const minDelta = -lo;
  const maxDelta = Math.max(options.fretCount, MAX_FRETS) + 1 - hi;
  const board = boundedCells(cells, frets);

  // --- Nut. Either the lowest found wire is the nut itself (a thin nut reads as a wire) or the nut
  //     is the bar one position below it (a wide nut is no thin ridge). Evidence, strongest first:
  //     a bar behind the position that stands out from what fret wires leave there; the board
  //     ending (the cell beyond looks unlike the cells of the board); no wires where the next two
  //     would be. Without the bar the claim stays below 0.5: a hand hides wires and board alike.
  let nut: NumberingResult['nut'] = null;
  {
    const bars = frets.filter((f) => f.bands >= 3 && f.fret > lo && Number.isFinite(f.bar)).map((f) => Math.abs(f.bar));
    const typicalBar = bars.length > 0 ? medianOf(bars) : 0;
    const refCells = [board.get(lo + 1), board.get(lo + 2), board.get(lo + 3)].filter((c): c is CellEvidence => c !== undefined);
    const refMean = medianOf(refCells.map((c) => c.mean));
    const boardLike = (c: CellEvidence | undefined): boolean | null => {
      if (!c || !c.inFrame || !Number.isFinite(refMean)) return null;
      return Math.abs(c.mean - refMean) <= Math.max(14, 0.14 * refMean);
    };
    let bestScore = -Infinity;
    let bestAt = lo;
    let bestBar = 0;
    // A slotted headstock's rollers (or a tuner) can read as a weak wire or two beyond the real nut;
    // the board then seems to start there. A strong bar right after a gap of two or more missing
    // wires is a nut candidate too: fret wires have no bar, and a bone nut has a strong one (wires
    // hidden by a hand leave a gap, but the wire after them has no bar).
    const candidates = [lo, lo - 1];
    const missing = (f: FretEvidence | undefined): boolean => f !== undefined && f.inFrame && f.bands <= 1 && f.strength < 0.35;
    for (let m = lo + 2; m <= lo + 6; m++) {
      const at = byFret.get(m);
      if (!at || !Number.isFinite(at.bar) || Math.abs(at.bar) < typicalBar + 0.5) continue;
      // The nut reads as a wire itself, or (a wide bone nut) is the bar right before the first wire.
      const starts = at.bands >= 3 || (byFret.get(m + 1)?.bands ?? 0) >= 3;
      if (starts && missing(byFret.get(m - 1)) && missing(byFret.get(m - 2))) {
        candidates.push(m);
        break;
      }
    }
    for (const j of candidates) {
      const at = byFret.get(j);
      if (!at || (!at.inFrame && !Number.isFinite(at.bar))) continue;
      let clear = 0;
      for (let k = 1; k <= 2; k++) {
        const beyond = byFret.get(j - k);
        if (beyond && beyond.inFrame && beyond.bands <= 1 && beyond.strength < 0.35) clear++;
        else break;
      }
      const bar = Number.isFinite(at.bar) ? Math.max(0, Math.min(1, (Math.abs(at.bar) - typicalBar - 0.1) / 0.5)) : 0;
      let score = 0.6 * bar + 0.15 * clear;
      // The cell beyond the nut is headstock, the cell before it is board.
      const beyondCell = boardLike(byCell.get(j));
      if (beyondCell === false) score += 0.2;
      else if (beyondCell === true) score -= 0.25;
      if (j === lo - 1 && boardLike(byCell.get(lo)) === false) score -= 0.3;
      if (score > bestScore) {
        bestScore = score;
        bestAt = j;
        bestBar = bar;
      }
    }
    if (bestScore >= 0.28) nut = { delta: 0 - bestAt, score: Math.min(1, bestBar >= 0.3 ? bestScore + 0.1 : Math.min(0.45, bestScore)) };
  }

  // --- Inlays.
  const kinds = classifyCells(cells, frets, options);
  const match = minDelta - 1 <= maxDelta ? matchInlays(kinds, minDelta - 1, maxDelta) : null;
  let inlays: NumberingResult['inlays'] = null;
  if (match) {
    // A matched double dot settles it; single markers repeat every two frets, so they need a clear
    // margin over the next best shift (which the gaps 9-12-15 provide when they are in view).
    const score = Math.max(0, Math.min(1, (match.double ? 0.45 : 0) + 0.12 * match.matched + 0.15 * Math.min(3, match.margin)));
    inlays = { delta: match.delta, score, matched: match.matched, double: match.double };
  }

  if (nut && inlays) {
    if (nut.delta === inlays.delta) return { delta: nut.delta, source: 'nut', confidence: Math.min(1, Math.max(nut.score, inlays.score) + 0.3), nut, inlays };
    // They disagree. A nut with its bar in view stands: nothing else on a neck looks like it, while
    // tuners, glints and fingers can pass for inlays. A nut merely inferred from the board ending
    // yields to a double dot or to a clearly better inlay match.
    const overruled = nut.score < 0.75 && (inlays.double || inlays.score > nut.score + 0.1);
    const pick = overruled ? inlays : nut;
    const other = pick === nut ? inlays : nut;
    return { delta: pick.delta, source: pick === nut ? 'nut' : 'inlays', confidence: Math.max(0.1, Math.min(0.8, pick.score - 0.5 * other.score)), nut, inlays };
  }
  if (nut) return { delta: nut.delta, source: 'nut', confidence: nut.score, nut, inlays };
  if (inlays && inlays.score >= 0.35) return { delta: inlays.delta, source: 'inlays', confidence: inlays.score, nut, inlays };
  return { delta: 0, source: 'assumed', confidence: inlays ? Math.min(0.3, inlays.score) : 0.1, nut, inlays };
}

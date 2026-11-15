/**
 * Absolute fret numbers. Fret spacing is self-similar, so geometry alone never says whether the
 * lowest visible wire is fret 2 or fret 5. Two things do: the nut (the comb of wires ends there, at
 * a bar wider than a fret wire, with no wire where the next ones would be) and the inlay pattern
 * (single dots at 3 5 7 9 15 17 19 21, a double dot at 12). Both are read from evidence sampled
 * through the current pose; the answer is a shift of the current numbering with a confidence, and
 * an honest "assumed" when neither cue is in view.
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
  /** Diagnostic scores: how convincing the nut and the inlay pattern were (0..1 each) and the shift each proposed. */
  nut: { delta: number; score: number } | null;
  inlays: { delta: number; score: number; matched: number } | null;
}

/** Classification of one fret cell. */
export type InlayKind = 'none' | 'single' | 'double' | 'unknown';

function medianOf(values: number[]): number {
  if (values.length === 0) return NaN;
  const v = [...values].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * Decide for every observable cell whether it carries an inlay. A dot is a patch at the cell centre
 * that differs from the plain board beside it; a double dot is two such patches off centre with a
 * plain centre; a block inlay covers all three, so it is compared with the board level of the neck.
 */
export function classifyCells(cells: readonly CellEvidence[], frets: readonly FretEvidence[], options: NumberingOptions): Map<number, InlayKind> {
  const out = new Map<number, InlayKind>();
  const found = new Map<number, boolean>();
  for (const f of frets) found.set(f.fret, f.bands >= 2);
  // Cells bounded by two found wires are certainly board (not hand, not headstock).
  const usable = cells.filter((c) => c.inFrame && found.get(c.fret) === true && found.get(c.fret - 1) === true);
  if (usable.length < 3) {
    for (const c of cells) out.set(c.fret, 'unknown');
    return out;
  }
  const pol = options.polarity;
  // Board level: the dark end of the plain-board samples for bright inlays, the bright end for dark ones.
  const boards = usable.map((c) => c.board * pol).sort((a, b) => a - b);
  const boardLevel = boards[Math.floor(boards.length * 0.3)];
  // The string under each double-dot patch brightens every cell alike: reference it per neck.
  const pairs = usable.map((c) => c.pair * pol).sort((a, b) => a - b);
  const pairLevel = pairs[Math.floor(pairs.length * 0.3)];
  const threshold = Math.max(10, 0.3 * options.strength);
  for (const c of cells) {
    if (!c.inFrame || found.get(c.fret) !== true || found.get(c.fret - 1) !== true) {
      out.set(c.fret, 'unknown');
      continue;
    }
    const centre = c.centre * pol - Math.min(boardLevel, c.board * pol);
    const pair = c.pair * pol - pairLevel;
    const block = c.board * pol - boardLevel;
    if (centre > threshold && !(block > threshold && pair > threshold)) out.set(c.fret, 'single');
    else if (centre > threshold) out.set(c.fret, 'single');
    else if (pair > threshold && centre < 0.5 * threshold) out.set(c.fret, 'double');
    else out.set(c.fret, 'none');
  }
  return out;
}

/** Score the inlay pattern for every shift; returns the best shift, its normalised score and the runner-up margin. */
function matchInlays(kinds: Map<number, InlayKind>, minDelta: number, maxDelta: number, fretCount: number): { delta: number; score: number; margin: number; matched: number } | null {
  const entries = [...kinds.entries()].filter(([, k]) => k !== 'unknown');
  const marked = entries.filter(([, k]) => k !== 'none').length;
  if (entries.length < 3 || marked < 2) return null;
  let best = -Infinity;
  let second = -Infinity;
  let bestDelta = 0;
  let bestMatched = 0;
  for (let delta = minDelta; delta <= maxDelta; delta++) {
    let score = 0;
    let matched = 0;
    for (const [cell, kind] of entries) {
      const n = cell + delta;
      const expected: InlayKind = n < 1 || n > fretCount + 1 ? 'none' : DOUBLE_INLAY_FRETS.includes(n) ? 'double' : INLAY_FRETS.includes(n) ? 'single' : 'none';
      // Fret 1 carries a block on some guitars and nothing on most: no evidence either way.
      if (n === 1) continue;
      if (kind === expected) {
        if (kind === 'double') {
          score += 2.5;
          matched++;
        } else if (kind === 'single') {
          score += 1;
          matched++;
        } else score += 0.25;
      } else if (kind === 'none' || expected === 'none') score -= 1;
      // single seen where a double is expected (a block inlay at 12) or the reverse: half credit.
      else score += 0.3;
    }
    if (score > best) {
      second = best;
      best = score;
      bestDelta = delta;
      bestMatched = matched;
    } else if (score > second) second = score;
  }
  if (!(best > 0)) return null;
  return { delta: bestDelta, score: best, margin: best - Math.max(0, second), matched: bestMatched };
}

/**
 * Resolve the whole-fret offset from fret and cell evidence gathered under the current numbering.
 * `current` describes what the current numbering rests on (kept when nothing better is found).
 */
export function resolveNumbering(frets: readonly FretEvidence[], cells: readonly CellEvidence[], options: NumberingOptions): NumberingResult {
  const byFret = new Map<number, FretEvidence>();
  for (const f of frets) byFret.set(f.fret, f);
  const foundFrets = frets.filter((f) => f.bands >= 2).map((f) => f.fret);
  if (foundFrets.length === 0) return { delta: 0, source: 'assumed', confidence: 0, nut: null, inlays: null };
  const lo = Math.min(...foundFrets);
  const hi = Math.max(...foundFrets);
  // Shifts that keep every found wire on the neck.
  const minDelta = -lo;
  const maxDelta = options.fretCount + 1 - hi;

  // --- Nut: the comb ends at `lo` although the frame continues beyond it.
  let nut: NumberingResult['nut'] = null;
  {
    let clear = 0;
    for (let k = 1; k <= 2; k++) {
      const beyond = byFret.get(lo - k);
      if (beyond && beyond.inFrame && beyond.bands <= 1 && beyond.strength < 0.35) clear++;
      else break;
    }
    if (clear >= 1) {
      const widths = frets.filter((f) => f.bands >= 3 && f.fret !== lo && Number.isFinite(f.widthMm)).map((f) => f.widthMm);
      const typical = medianOf(widths);
      const mine = byFret.get(lo);
      const ratio = mine && Number.isFinite(mine.widthMm) && typical > 0 ? mine.widthMm / typical : 1;
      let score = clear >= 2 ? 0.7 : 0.45;
      if (ratio > 1.3) score += 0.25;
      else if (ratio < 1.1) score -= 0.15;
      nut = { delta: -lo, score: Math.max(0, Math.min(1, score)) };
    }
  }

  // --- Inlays.
  const kinds = classifyCells(cells, frets, options);
  const match = minDelta <= maxDelta ? matchInlays(kinds, minDelta, maxDelta, options.fretCount) : null;
  let inlays: NumberingResult['inlays'] = null;
  if (match) {
    // Two matched markers with a clear margin are decent; a matched double dot or four markers are strong.
    const score = Math.max(0, Math.min(1, 0.2 * match.matched + 0.2 * Math.min(2.5, match.margin)));
    inlays = { delta: match.delta, score, matched: match.matched };
  }

  if (nut && inlays) {
    if (nut.delta === inlays.delta) return { delta: nut.delta, source: 'nut', confidence: Math.min(1, Math.max(nut.score, inlays.score) + 0.2), nut, inlays };
    // They disagree: believe the stronger, but say so.
    const pick = inlays.score > nut.score + 0.15 ? inlays : nut;
    return { delta: pick.delta, source: pick === nut ? 'nut' : 'inlays', confidence: Math.max(0.1, pick.score - 0.3), nut, inlays };
  }
  if (nut) return { delta: nut.delta, source: 'nut', confidence: nut.score, nut, inlays };
  if (inlays && inlays.score >= 0.4) return { delta: inlays.delta, source: 'inlays', confidence: inlays.score, nut, inlays };
  return { delta: inlays ? inlays.delta : 0, source: 'assumed', confidence: inlays ? Math.min(0.4, inlays.score) : 0.1, nut, inlays };
}

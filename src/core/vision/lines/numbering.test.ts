import { describe, expect, it } from 'vitest';
import { classifyCells, resolveNumbering, type NumberingOptions } from './numbering';
import type { CellEvidence, FretEvidence } from './refine';

const OPTIONS: NumberingOptions = { fretCount: 20, polarity: 1, strength: 60 };

interface Synthetic {
  /** True fret number of the wire the evidence calls 0. */
  base: number;
  /** True frets in the frame, lowest to highest (may start below 0: where wires would be beyond the nut). */
  from: number;
  to: number;
  /** True frets hidden by the hand. */
  hidden?: number[];
  inlays?: 'dots' | 'blocks' | 'none';
  /** 'bone': a bright bar that is no thin ridge; 'thin': reads as a wire; 'black': nothing to see but the board ending. */
  nut?: 'bone' | 'thin' | 'black';
  /** Brightness ramp along the neck in gray levels per fret. */
  ramp?: number;
}

const SINGLE = [3, 5, 7, 9, 15, 17, 19, 21];

/** Evidence as `refinePose` would report it for a neck whose wire `base` is currently called fret 0. */
function evidence(s: Synthetic): { frets: FretEvidence[]; cells: CellEvidence[] } {
  const frets: FretEvidence[] = [];
  const cells: CellEvidence[] = [];
  const hidden = new Set(s.hidden ?? []);
  const boardAt = (n: number): number => 50 + (s.ramp ?? 0) * n;
  for (let n = s.from; n <= s.to; n++) {
    const label = n - s.base;
    const isWire = n >= 1 && n <= 20 && !hidden.has(n);
    const nutSeen = n === 0 && s.nut === 'thin';
    const found = isWire || nutSeen;
    frets.push({
      fret: label,
      inFrame: true,
      bands: found ? 4 : 0,
      strength: found ? 1 : 0.05,
      widthMm: found ? (nutSeen ? 3 : 2) : NaN,
      bar: n === 0 && s.nut === 'bone' ? 2.2 : n === 0 && s.nut === 'thin' ? 0.9 : 0.05,
    });
    // The cell between wire n - 1 and wire n.
    const onBoard = n >= 1 && n <= 20;
    const covered = hidden.has(n) || hidden.has(n - 1);
    const board = onBoard ? boardAt(n) : 140;
    let centre = board;
    let pair = board + 30;
    let plain = board;
    if (onBoard && !covered && s.inlays !== 'none') {
      if (s.inlays === 'blocks' && (SINGLE.includes(n) || n === 12 || n === 1)) {
        centre = 210;
        pair = 215;
        plain = 210;
      } else if (n === 12) pair = 200;
      else if (SINGLE.includes(n)) centre = 205;
    }
    if (covered) {
      centre = 170;
      pair = 170;
      plain = 170;
    }
    cells.push({ fret: label, inFrame: true, centre, pair, board: plain, mean: onBoard && !covered ? board + 12 : covered ? 170 : 140 });
  }
  return { frets, cells };
}

describe('classifyCells', () => {
  it('reads dots, the double dot and plain cells, under a brightness ramp', () => {
    const { frets, cells } = evidence({ base: 0, from: 0, to: 17, inlays: 'dots', nut: 'thin', ramp: 3 });
    const kinds = classifyCells(cells, frets, OPTIONS);
    for (let n = 2; n <= 17; n++) {
      const expected = n === 12 ? 'double' : SINGLE.includes(n) ? 'single' : 'none';
      expect(kinds.get(n), `cell ${n}`).toBe(expected);
    }
  });

  it('reads block inlays as markers and leaves cells under the hand unknown', () => {
    const { frets, cells } = evidence({ base: 0, from: 0, to: 14, inlays: 'blocks', nut: 'thin', hidden: [6, 7] });
    const kinds = classifyCells(cells, frets, OPTIONS);
    expect(kinds.get(3)).toBe('single');
    expect(kinds.get(4)).toBe('none');
    expect(kinds.get(5)).toBe('single');
    expect(kinds.get(6)).toBe('unknown');
    expect(kinds.get(7)).toBe('unknown');
    expect(kinds.get(8)).toBe('unknown');
    expect(kinds.get(9)).toBe('single');
    expect(kinds.get(12)).toBe('single');
  });

  it('handles dark inlays on a light board', () => {
    const { frets, cells } = evidence({ base: 0, from: 0, to: 13, inlays: 'dots', nut: 'thin' });
    // Invert the brightness: a maple board with dark dots and dark wires.
    const inv = cells.map((c) => ({ ...c, centre: 255 - c.centre, pair: 255 - c.pair, board: 255 - c.board, mean: 255 - c.mean }));
    const kinds = classifyCells(inv, frets, { ...OPTIONS, polarity: -1 });
    expect(kinds.get(5)).toBe('single');
    expect(kinds.get(6)).toBe('none');
    expect(kinds.get(12)).toBe('double');
  });
});

describe('resolveNumbering', () => {
  it('finds a bone nut one position below the lowest wire and agrees with the dots', () => {
    // The pose calls true fret 1 "fret 0": everything must shift by +1.
    const { frets, cells } = evidence({ base: 1, from: -2, to: 15, inlays: 'dots', nut: 'bone' });
    const r = resolveNumbering(frets, cells, OPTIONS);
    expect(r.delta).toBe(1);
    expect(r.source).toBe('nut');
    expect(r.confidence).toBeGreaterThan(0.85);
    expect(r.nut?.delta).toBe(1);
    expect(r.inlays?.delta).toBe(1);
  });

  it('accepts a nut that reads as the lowest wire', () => {
    const { frets, cells } = evidence({ base: 0, from: -2, to: 10, inlays: 'none', nut: 'thin' });
    const r = resolveNumbering(frets, cells, OPTIONS);
    expect(r.delta).toBe(0);
    expect(r.source).toBe('nut');
    expect(r.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('numbers from the inlays when the nut is out of view', () => {
    // True frets 4..17 in view; the pose calls fret 4 "fret 0".
    const { frets, cells } = evidence({ base: 4, from: 4, to: 17, inlays: 'dots', hidden: [8, 9] });
    const r = resolveNumbering(frets, cells, OPTIONS);
    expect(r.delta).toBe(4);
    expect(r.source).toBe('inlays');
    expect(r.confidence).toBeGreaterThan(0.6);
    expect(r.inlays?.double).toBe(true);
  });

  it('does not take a hand for a nut with any confidence', () => {
    // True frets 5..14 found; frets 3 and 4 are under the hand, in the frame, with no bar anywhere.
    const { frets, cells } = evidence({ base: 5, from: 3, to: 14, inlays: 'none', hidden: [3, 4] });
    const r = resolveNumbering(frets, cells, OPTIONS);
    expect(r.confidence).toBeLessThan(0.5);
  });

  it('says "assumed" when neither cue is in view', () => {
    const { frets, cells } = evidence({ base: 6, from: 6, to: 11, inlays: 'none' });
    const r = resolveNumbering(frets, cells, OPTIONS);
    expect(r.source).toBe('assumed');
    expect(r.delta).toBe(0);
    expect(r.confidence).toBeLessThan(0.5);
  });

  it('is unsure about a short run of single dots', () => {
    // Dots at 5 and 7 only (true frets 4..8): could as well be 3 and 5, 7 and 9, 15 and 17 ...
    const { frets, cells } = evidence({ base: 4, from: 4, to: 8, inlays: 'dots' });
    const r = resolveNumbering(frets, cells, OPTIONS);
    expect(r.confidence).toBeLessThan(0.5);
  });

  it('lets a double dot overrule a doubtful nut', () => {
    // Frets 7..16 in view with dots; frets 5 and 6 hidden by the hand look like "the board ends here".
    const { frets, cells } = evidence({ base: 7, from: 5, to: 16, inlays: 'dots', hidden: [5, 6] });
    const r = resolveNumbering(frets, cells, OPTIONS);
    expect(r.delta).toBe(7);
    expect(r.source).toBe('inlays');
  });

  it('returns zero confidence without any wire', () => {
    const r = resolveNumbering([], [], OPTIONS);
    expect(r.source).toBe('assumed');
    expect(r.confidence).toBe(0);
  });
});

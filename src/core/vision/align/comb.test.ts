import { describe, expect, it } from 'vitest';
import { clipLine, combIndexAt, combPosition, combX, findCombs, findPeaks, FRET_RATIO, type LineProfile, type ProfilePeak } from './comb';

/** Peak positions of frets j0..j1 under s = (A + B x_j) / (1 + C x_j). */
function frets(A: number, B: number, C: number, j0: number, j1: number): number[] {
  const out: number[] = [];
  for (let j = j0; j <= j1; j++) out.push((A + B * combX(j)) / (1 + C * combX(j)));
  return out;
}

const peaksOf = (positions: number[], strength = 10): ProfilePeak[] => positions.slice().sort((a, b) => a - b).map((pos) => ({ pos, strength }));

describe('comb model', () => {
  it('uses the 12-tone ratio', () => {
    expect(FRET_RATIO).toBeCloseTo(Math.pow(2, -1 / 12), 12);
    expect(combX(12)).toBeCloseTo(0.5, 12);
    expect(combX(0)).toBe(0);
  });

  it('inverts positions to indices', () => {
    const comb = { dir: 1 as const, A: 40, B: 900, C: 0.3 };
    for (const j of [0, 3, 7.5, 15]) expect(combIndexAt(comb, combPosition(comb, j))).toBeCloseTo(j, 8);
    const back = { dir: -1 as const, A: -600, B: 900, C: -0.2 };
    for (const j of [1, 6, 11]) expect(combIndexAt(back, combPosition(back, j))).toBeCloseTo(j, 8);
  });
});

describe('findPeaks', () => {
  it('finds local maxima with sub-sample positions and drops weak ones', () => {
    const values = new Float32Array(200);
    const add = (centre: number, height: number): void => {
      for (let i = 0; i < 200; i++) values[i] += height * Math.exp(-((i - centre) * (i - centre)) / 4.5);
    };
    for (const c of [20.3, 55.7, 90.0, 130.4, 170.6]) add(c, 20);
    add(110, 1.5); // far below the others
    const profile: LineProfile = { values, count: 200, x0: 0, y0: 0, ux: 1, uy: 0 };
    const peaks = findPeaks(profile);
    expect(peaks.map((p) => Math.round(p.pos))).toEqual([20, 56, 90, 130, 171]);
    expect(Math.abs(peaks[0].pos - 20.3)).toBeLessThan(0.2);
    expect(Math.abs(peaks[1].pos - 55.7)).toBeLessThan(0.2);
  });
});

describe('findCombs', () => {
  it('recovers a clean comb, perspective included', () => {
    for (const C of [0, 0.5, -0.4, 0.9]) {
      const truth = frets(30, 900, C, 0, 14);
      const [comb] = findCombs(peaksOf(truth), 640, { directions: [1] });
      expect(comb).toBeDefined();
      expect(comb.frets).toHaveLength(15);
      expect(comb.misses).toBe(0);
      expect(comb.rms).toBeLessThan(0.1);
      expect(comb.C).toBeCloseTo(C, 1);
      // Consecutive relative indices starting at 0.
      expect(comb.frets.map((f) => f.j)).toEqual(Array.from({ length: 15 }, (_, k) => k));
    }
  });

  it('works when the fret numbers grow against the profile direction', () => {
    const truth = frets(30, 900, 0.2, 0, 12).map((s) => 620 - s);
    const [comb] = findCombs(peaksOf(truth), 640, { directions: [1, -1] });
    expect(comb.dir).toBe(-1);
    expect(comb.frets).toHaveLength(13);
    // Spacing shrinks toward the bridge: j = 0 is the fret at the largest position.
    expect(comb.frets[0].pos).toBeCloseTo(590, 0);
  });

  it('bridges a run of hidden frets (a hand) by merging the two sides with the right index gap', () => {
    const all = frets(20, 1000, 0.3, 0, 16);
    const visible = all.filter((_, j) => j < 5 || j > 8); // frets 5..8 hidden
    const [comb] = findCombs(peaksOf(visible), 640, { directions: [1] });
    expect(comb.frets).toHaveLength(13);
    expect(comb.misses).toBe(4);
    expect(comb.longestGap).toBe(4);
    const js = comb.frets.map((f) => f.j);
    expect(js.slice(0, 5)).toEqual([0, 1, 2, 3, 4]);
    expect(js[5]).toBe(9);
  });

  it('ignores a stray peak between two frets and noise on the positions', () => {
    const truth = frets(25, 950, 0.1, 0, 13).map((s, k) => s + 0.25 * Math.sin(k * 2.1));
    const withStray = [...truth, (truth[4] + truth[5]) / 2 + 1];
    const [comb] = findCombs(peaksOf(withStray), 640, { directions: [1] });
    expect(comb.frets).toHaveLength(14);
    expect(comb.extras).toBe(1);
    expect(comb.rms).toBeLessThan(0.5);
  });

  it('prefers the true spacing over half and double spacing', () => {
    const truth = frets(30, 900, 0, 0, 14);
    const [comb] = findCombs(peaksOf(truth), 640, { directions: [1], maxCombs: 1 });
    // A double-spaced comb would match 8 frets and leave 7 strong peaks unexplained; a half-spaced one would miss every other fret.
    expect(comb.frets).toHaveLength(15);
    expect(comb.extras).toBe(0);
    expect(comb.misses).toBe(0);
  });

  it('returns nothing for too few or evenly scattered peaks', () => {
    expect(findCombs(peaksOf([10, 50, 90]), 640)).toHaveLength(0);
    // Peaks at random-looking positions: no comb of five.
    expect(findCombs(peaksOf([12, 31, 77, 140, 149, 260, 390, 401, 577]), 640, { minFrets: 6 })).toHaveLength(0);
  });
});

describe('clipLine', () => {
  it('clips to the frame minus a margin', () => {
    const c = clipLine(640, 360, 320, 180, 1, 0, 4);
    expect(c).toEqual({ t0: -316, t1: 316 });
    expect(clipLine(640, 360, 320, 500, 1, 0, 4)).toBeNull();
    const d = clipLine(640, 360, 320, 180, Math.SQRT1_2, Math.SQRT1_2, 0);
    expect(d && d.t1).toBeCloseTo(180 * Math.SQRT2, 6);
  });
});

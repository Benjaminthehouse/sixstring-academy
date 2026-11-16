import { describe, expect, it } from 'vitest';
import { inlayPolarity } from './inlay-polarity';
import { classifyCells, resolveNumbering } from './lines/numbering';
import type { CellEvidence, FretEvidence } from './lines/refine';

describe('inlayPolarity', () => {
  const plain = [1, -2, 0.5, 2, -1, 0, 1.5, -0.5, 0.8, -1.2];
  it('reads bright dots as +1 and dark dots as -1, whatever the wires say', () => {
    const bright = plain.map((v, i) => (i === 2 || i === 5 ? v + 40 : v));
    const dark = plain.map((v, i) => (i === 2 || i === 5 || i === 7 ? v - 35 : v));
    expect(inlayPolarity(bright, -1)).toBe(1);
    expect(inlayPolarity(dark, 1)).toBe(-1);
  });
  it('keeps the fallback when nothing stands out, when everything does, or when the outliers disagree', () => {
    expect(inlayPolarity(plain, -1)).toBe(-1);
    expect(inlayPolarity(plain.map((v, i) => v + (i % 2 ? 40 : -40)), 1)).toBe(1);
    expect(inlayPolarity(plain.map((v, i) => (i === 1 ? v + 40 : i === 4 ? v - 38 : v)), -1)).toBe(-1);
    expect(inlayPolarity([1, 2], 1)).toBe(1);
  });
});

describe('line numbering with bright wires and black dots (a real maple neck)', () => {
  // Wires read bright (polarity +1, specular nickel), dots are black on a light board.
  function maple(base: number): { frets: FretEvidence[]; cells: CellEvidence[] } {
    const frets: FretEvidence[] = [];
    const cells: CellEvidence[] = [];
    for (let n = 1; n <= 16; n++) {
      frets.push({ fret: n - base, inFrame: true, bands: 4, strength: 1, widthMm: 2, bar: 0 });
      if (n >= 2) {
        const board = 170 + ((n * 7) % 5);
        const single = [3, 5, 7, 9, 15].includes(n);
        const double = n === 12;
        cells.push({ fret: n - base, inFrame: true, centre: single ? board - 90 : board + 1, pair: double ? board - 80 : board - 1, board, mean: board - (single || double ? 6 : 0) });
      }
    }
    return { frets, cells };
  }
  it('classifies the black dots as inlays and numbers the board from them', () => {
    const { frets, cells } = maple(0);
    const kinds = classifyCells(cells, frets, { fretCount: 20, polarity: 1, strength: 60 });
    for (const f of [3, 5, 7, 9, 15]) expect(kinds.get(f)).toBe('single');
    expect(kinds.get(12)).toBe('double');
    expect(kinds.get(4)).toBe('none');
    // Read under a numbering two frets off, the inlays put it back.
    const off = maple(2);
    const r = resolveNumbering(off.frets, off.cells, { fretCount: 20, polarity: 1, strength: 60 });
    expect(r.inlays?.delta).toBe(2);
    expect(r.delta).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import { chordVoicings } from '@/core/guitar';
import { chordBoxGrid, chordBoxLayout } from './layout';

describe('chordBoxLayout', () => {
  it('draws open G from the nut with the low string on the left', () => {
    const g = chordVoicings('G')[0];
    const b = chordBoxLayout({ frets: g.frets, fingers: g.fingers, barres: g.barres });
    expect(b.baseFret).toBe(1);
    expect(b.showNut).toBe(true);
    expect(b.rows).toBe(4);
    expect(b.openCols.sort()).toEqual([2, 3, 4]);
    expect(b.mutedCols).toEqual([]);
    expect(b.dots.map((d) => `${d.col}:${d.row}:${d.finger}`).sort()).toEqual(['0:2:2', '1:1:1', '5:2:3'].sort());
  });

  it('marks muted strings and mirrors for left-handed players', () => {
    const c = chordVoicings('C')[0];
    const right = chordBoxLayout({ frets: c.frets });
    const left = chordBoxLayout({ frets: c.frets, leftHanded: true });
    expect(right.mutedCols).toEqual([0]);
    expect(left.mutedCols).toEqual([5]);
    expect(left.colOf(1)).toBe(0);
    expect(right.colOf(1)).toBe(5);
  });

  it('starts a high shape at its lowest fret and places the barre', () => {
    const b = chordBoxLayout({ frets: [null, 5, 7, 7, 7, 5], barres: [{ fret: 5, finger: 1, fromString: 5, toString: 1 }] });
    expect(b.baseFret).toBe(5);
    expect(b.showNut).toBe(false);
    expect(b.barres[0]).toMatchObject({ row: 0, fromCol: 1, toCol: 5 });
    expect(b.dots.filter((d) => d.fret === 7).every((d) => d.row === 2)).toBe(true);
  });

  it('keeps a shape that reaches fret 4 under the nut', () => {
    const bm = chordVoicings('Bm')[0];
    expect(chordBoxLayout({ frets: bm.frets }).baseFret).toBe(1);
  });

  it('grows rows for wide stretches', () => {
    expect(chordBoxLayout({ frets: [null, 3, 5, 5, 3, 8] }).rows).toBe(6);
  });
});

describe('chordBoxGrid', () => {
  it('makes room for a title, labels and a capo line only when asked', () => {
    const layout = chordBoxLayout({ frets: [null, 3, 2, 0, 1, 0] });
    const bare = chordBoxGrid(layout, { title: false, footer: false });
    const full = chordBoxGrid(layout, { title: true, footer: true, capo: true });
    expect(full.height).toBeGreaterThan(bare.height);
    expect(full.titleY).not.toBeNull();
    expect(bare.titleY).toBeNull();
    expect(full.capoY!).toBeGreaterThan(full.footerY!);
    expect(full.width).toBe(bare.width);
  });
});

import { describe, expect, it } from 'vitest';
import { boardLayout, fitFrets, fretFractions, fretNumbersFor, inlaysInRange, moveOnBoard, stringLook } from './layout';

describe('fretFractions', () => {
  it('runs from 0 to 1 and shrinks up the neck with real spacing', () => {
    const f = fretFractions(1, 12, 1);
    expect(f).toHaveLength(13);
    expect(f[0]).toBe(0);
    expect(f[12]).toBeCloseTo(1, 10);
    const widths = f.slice(1).map((x, i) => x - f[i]);
    for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeLessThan(widths[i - 1]);
    // Fret 12 is half the width of fret 1 (an octave).
    expect(widths[11] / widths[0]).toBeCloseTo(Math.pow(2, -11 / 12), 6);
  });

  it('is even at blend 0', () => {
    const f = fretFractions(5, 9, 0);
    expect(f.map((x) => +x.toFixed(6))).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });
});

describe('fitFrets', () => {
  it('keeps real spacing when there is room', () => {
    const r = fitFrets({ available: 1000, fromFret: 1, toFret: 12, proportional: true, minFret: 21, maxFret: 200 });
    expect(r.blend).toBe(1);
    expect(r.overflow).toBe(false);
    expect(r.length).toBe(1000);
  });

  it('blends toward even spacing just enough for the narrowest fret', () => {
    const r = fitFrets({ available: 280, fromFret: 1, toFret: 12, proportional: true, minFret: 21, maxFret: 200 });
    expect(r.blend).toBeGreaterThan(0);
    expect(r.blend).toBeLessThan(1);
    expect(r.overflow).toBe(false);
    const f = fretFractions(1, 12, r.blend);
    expect((f[12] - f[11]) * r.length).toBeGreaterThanOrEqual(21 - 1e-6);
  });

  it('overflows (scrolls) only when even spacing cannot fit', () => {
    const r = fitFrets({ available: 200, fromFret: 1, toFret: 24, proportional: true, minFret: 21, maxFret: 200 });
    expect(r.blend).toBe(0);
    expect(r.overflow).toBe(true);
    expect(r.length).toBe(24 * 21);
  });

  it('caps the widest fret on a wide screen', () => {
    const r = fitFrets({ available: 2000, fromFret: 5, toFret: 8, proportional: false, minFret: 21, maxFret: 100 });
    expect(r.length).toBeCloseTo(400, 6);
  });
});

describe('boardLayout', () => {
  const base = { stringCount: 6, frets: [0, 12] as const, width: 720, stringGap: 28 };

  it('puts frets left to right and string 1 on top', () => {
    const b = boardLayout(base);
    expect(b.hasNut).toBe(true);
    expect(b.openColumn).toBe(true);
    for (let f = 1; f <= 12; f++) expect(b.point(1, f).x).toBeGreaterThan(b.point(1, f - 1).x);
    expect(b.point(1, 5).y).toBeLessThan(b.point(6, 5).y);
    expect(b.wires.map((w) => w.fret)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(b.width).toBeLessThanOrEqual(720);
    expect(b.overflow).toBe(false);
  });

  it('places markers inside their fret space and cells around them', () => {
    const b = boardLayout(base);
    for (const fret of [1, 5, 12]) {
      const p = b.point(3, fret);
      const c = b.cell(3, fret);
      expect(p.x).toBeGreaterThan(c.x);
      expect(p.x).toBeLessThan(c.x + c.w);
      expect(p.y).toBeGreaterThan(c.y);
      expect(p.y).toBeLessThan(c.y + c.h);
    }
    // The open column is left of the nut.
    expect(b.point(1, 0).x).toBeLessThan(b.nut!.x);
  });

  it('mirrors a left-handed board without moving strings', () => {
    const r = boardLayout(base);
    const l = boardLayout({ ...base, leftHanded: true });
    expect(l.width).toBeCloseTo(r.width, 6);
    for (const [s, f] of [[1, 0], [6, 7], [3, 12]]) {
      expect(l.point(s, f).x).toBeCloseTo(r.width - r.point(s, f).x, 6);
      expect(l.point(s, f).y).toBeCloseTo(r.point(s, f).y, 6);
    }
  });

  it('draws a vertical board with the nut on top and the low string on the left', () => {
    const v = boardLayout({ ...base, frets: [0, 4], orientation: 'vertical' });
    expect(v.point(1, 3).y).toBeGreaterThan(v.point(1, 1).y);
    expect(v.point(6, 2).x).toBeLessThan(v.point(1, 2).x);
    const lv = boardLayout({ ...base, frets: [0, 4], orientation: 'vertical', leftHanded: true });
    expect(lv.point(6, 2).x).toBeGreaterThan(lv.point(1, 2).x);
  });

  it('starts mid-neck without a nut or open column', () => {
    const b = boardLayout({ ...base, frets: [5, 9] });
    expect(b.hasNut).toBe(false);
    expect(b.openColumn).toBe(false);
    expect(b.nut).toBeNull();
    expect(b.wires[0].fret).toBe(4);
    expect(b.fretSize(5)).toBeGreaterThan(b.fretSize(9));
    expect(b.fretSize(3)).toBe(0);
  });

  it('fits frets 0-12 on a 390 px phone (358 px of content) without scrolling', () => {
    const b = boardLayout({ ...base, width: 358 });
    expect(b.overflow).toBe(false);
    expect(b.width).toBeLessThanOrEqual(358);
    expect(b.fretSize(12)).toBeGreaterThanOrEqual(21 - 1e-6);
    expect(b.markerRadius).toBeGreaterThanOrEqual(8.5);
  });

  it('scrolls a 24-fret neck on a phone, and touch cells are at least 44 px', () => {
    const b = boardLayout({ ...base, frets: [0, 24], width: 358 });
    expect(b.overflow).toBe(true);
    const touch = boardLayout({ ...base, frets: [0, 12], width: 358, stringGap: 44, minFret: 44 });
    expect(touch.overflow).toBe(true);
    expect(touch.cell(1, 12).w).toBeGreaterThanOrEqual(44 - 1e-6);
    expect(touch.cell(1, 12).h).toBeGreaterThanOrEqual(44 - 1e-6);
  });

  it('puts the capo just behind its fret wire and open notes on it', () => {
    const b = boardLayout({ ...base, frets: [0, 7], capo: 2 });
    expect(b.capoBar).not.toBeNull();
    const wire2 = b.wires.find((w) => w.fret === 2)!.line.x1;
    expect(b.capoBar!.x + b.capoBar!.w).toBeLessThan(wire2);
    expect(b.capoBar!.x).toBeGreaterThan(b.wires.find((w) => w.fret === 1)!.line.x1);
    const open = b.point(3, 0);
    expect(open.x).toBeGreaterThan(b.capoBar!.x);
    expect(open.x).toBeLessThan(b.capoBar!.x + b.capoBar!.w);
  });

  it('gives a double inlay two points and a span box the right frets', () => {
    const b = boardLayout(base);
    expect(b.inlays(12).points).toHaveLength(2);
    expect(b.inlays(5).points).toHaveLength(1);
    const s = b.span(5, 8);
    expect(s.x).toBeLessThan(b.point(1, 5).x);
    expect(s.x + s.w).toBeGreaterThan(b.point(1, 8).x);
  });
});

describe('strings, numbers, inlays, keys', () => {
  it('makes low strings thicker and wound', () => {
    const [e2, a2, d3, g3, b3, e4] = [40, 45, 50, 55, 59, 64].map(stringLook);
    expect(e2.width).toBeGreaterThan(a2.width);
    expect(b3.width).toBeGreaterThan(e4.width);
    expect([e2, a2, d3].every((s) => s.wound)).toBe(true);
    expect([g3, b3, e4].some((s) => s.wound)).toBe(false);
  });

  it('numbers the marker frets, plus the first fret up the neck', () => {
    expect(fretNumbersFor(0, 12, 'inlays')).toEqual([3, 5, 7, 9, 12]);
    expect(fretNumbersFor(4, 9, 'inlays')).toEqual([4, 5, 7, 9]);
    expect(fretNumbersFor(5, 8, 'all')).toEqual([5, 6, 7, 8]);
    expect(fretNumbersFor(0, 12, 'none')).toEqual([]);
  });

  it('lists inlays with doubles at 12 and 24', () => {
    expect(inlaysInRange(10, 24)).toEqual([
      { fret: 12, double: true },
      { fret: 15, double: false },
      { fret: 17, double: false },
      { fret: 19, double: false },
      { fret: 21, double: false },
      { fret: 24, double: true },
    ]);
  });

  it('moves the keyboard focus the way the board looks', () => {
    const board = { stringCount: 6, minFret: 0, maxFret: 12, orientation: 'horizontal' as const, leftHanded: false };
    expect(moveOnBoard({ string: 3, fret: 5 }, 'right', board)).toEqual({ string: 3, fret: 6 });
    expect(moveOnBoard({ string: 3, fret: 5 }, 'up', board)).toEqual({ string: 2, fret: 5 });
    expect(moveOnBoard({ string: 3, fret: 5 }, 'right', { ...board, leftHanded: true })).toEqual({ string: 3, fret: 4 });
    expect(moveOnBoard({ string: 3, fret: 5 }, 'down', { ...board, orientation: 'vertical' })).toEqual({ string: 3, fret: 6 });
    expect(moveOnBoard({ string: 3, fret: 5 }, 'left', { ...board, orientation: 'vertical' })).toEqual({ string: 4, fret: 5 });
    expect(moveOnBoard({ string: 1, fret: 0 }, 'up', board)).toEqual({ string: 1, fret: 0 });
    expect(moveOnBoard({ string: 6, fret: 12 }, 'right', board)).toEqual({ string: 6, fret: 12 });
  });
});

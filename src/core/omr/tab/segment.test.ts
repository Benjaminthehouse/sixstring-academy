/**
 * Segmentation pieces of the tab reader: blobs on string lines, cutting, grouping, bar lines.
 */
import { describe, expect, it } from 'vitest';
import { labelComponents } from '../image/cc';
import { createBinary, createGray } from '../image/gray';
import { synthStaff } from './dev/synth';
import {
  type StripGeometry, barlineSolidity, columnProfile, digitMetrics, estimateDigitHeight, findLineBlobs, findWeldedBlobs, groupAdjacent, groupColumns, nearBarline,
  nearestLine, offLineExtent, profileValleys, tightBox,
} from './segment';

const geometry = (bars: { x: number; x0: number; x1: number }[] = []): StripGeometry => ({ space: 24, lineThickness: 3, lineYs: [84, 108, 132, 156, 180, 204], x0: 24, x1: 876, barlines: bars });

describe('geometry helpers', () => {
  it('find the nearest line and bar line', () => {
    const g = geometry([{ x: 300, x0: 298, x1: 302 }]);
    expect(nearestLine(g, 110)).toEqual({ line: 1, offset: 2 / 24 });
    expect(nearestLine(g, 0).line).toBe(0);
    expect(nearestLine(g, 999).line).toBe(5);
    expect(nearBarline(g, 290, 297, 0)).toBe(false);
    expect(nearBarline(g, 290, 299, 0)).toBe(true);
    expect(nearBarline(g, 304, 310, 3)).toBe(true);
  });

  it('shrink boxes to ink and to the ink off the line', () => {
    const bin = createBinary(40, 30);
    for (let y = 8; y < 22; y++) for (let x = 12; x < 20; x++) bin.data[y * 40 + x] = 1;
    // A leftover of staff line sticking out to the right at the line's height.
    for (let x = 20; x < 30; x++) bin.data[15 * 40 + x] = 1;
    expect(tightBox(bin, { x0: 0, y0: 0, x1: 40, y1: 30 })).toEqual({ x0: 12, y0: 8, x1: 30, y1: 22 });
    expect(tightBox(bin, { x0: 0, y0: 0, x1: 10, y1: 30 })).toBeNull();
    expect(offLineExtent(bin, { x0: 0, y0: 0, x1: 40, y1: 30 }, 15.5, 2)).toEqual({ x0: 12, x1: 20 });
  });
});

describe('profileValleys', () => {
  it('finds the gap between two digits and ranks the deepest cut first', () => {
    // Two humps with a clear valley at column 10, and a shallow dip inside the second hump.
    const p = Float32Array.from([2, 6, 8, 8, 8, 8, 7, 6, 4, 1, 0, 1, 5, 8, 8, 6, 5, 6, 8, 8, 7, 3]);
    const cuts = profileValleys(p, 4, 3);
    expect(cuts[0]).toBe(10);
    expect(cuts).toContain(16);
    expect(cuts.every((c) => c >= 4 && c <= p.length - 4)).toBe(true);
  });

  it('returns nothing for a blob too narrow to cut', () => {
    expect(profileValleys(Float32Array.from([3, 5, 5, 3]), 4)).toEqual([]);
  });

  it('skips the rows under a staff line when asked', () => {
    const gray = createGray(20, 10);
    for (let x = 0; x < 20; x++) gray.data[5 * 20 + x] = 0; // the line
    for (let y = 0; y < 10; y++) gray.data[y * 20 + 3] = 0; // a stroke
    const all = columnProfile(gray, { x0: 0, y0: 0, x1: 20, y1: 10 });
    const off = columnProfile(gray, { x0: 0, y0: 0, x1: 20, y1: 10 }, { lineY: 5.5, band: 1 });
    expect(all[10]).toBeCloseTo(1, 5);
    expect(off[10]).toBeCloseTo(0, 5);
    expect(off[3]).toBeGreaterThan(6);
  });
});

describe('grouping', () => {
  it('joins neighbouring glyphs into numbers by their gap', () => {
    const spans = [{ x0: 0, x1: 10 }, { x0: 12, x1: 22 }, { x0: 40, x1: 50 }, { x0: 53, x1: 60 }, { x0: 62, x1: 70 }];
    expect(groupAdjacent(spans, 4)).toEqual([[0, 1], [2, 3, 4]]);
    expect(groupAdjacent(spans, 1)).toEqual([[0], [1], [2], [3], [4]]);
    expect(groupAdjacent([], 4)).toEqual([]);
  });

  it('puts numbers printed above one another into one column and never two of one string', () => {
    const items = [
      { line: 0, x0: 100, x1: 110 }, { line: 1, x0: 98, x1: 120 }, { line: 2, x0: 101, x1: 111 }, // a chord, the middle number two digits wide
      { line: 2, x0: 130, x1: 140 }, // next note, same string as the chord's last
      { line: 4, x0: 60, x1: 70 },
    ];
    const cols = groupColumns(items, 8);
    expect(cols.map((c) => c.map((i) => i.line))).toEqual([[4], [0, 1, 2], [2]]);
    // Two numbers of the same line never share a column, however close.
    const close = groupColumns([{ line: 3, x0: 10, x1: 20 }, { line: 3, x0: 22, x1: 32 }], 20);
    expect(close.length).toBe(2);
  });
});

describe('blobs on string lines', () => {
  it('takes free-standing numbers whole and marks the struck-through ones as fused', () => {
    const blanked = synthStaff({ items: [{ line: 1, x: 150, text: '4' }, { line: 3, x: 300, text: '10' }] });
    const through = synthStaff({ lineThrough: true, items: [{ line: 1, x: 150, text: '4' }, { line: 3, x: 300, text: '10' }] });
    for (const [staff, fused] of [[blanked, false], [through, true]] as const) {
      const { input, boxes } = staff;
      const blobs = findLineBlobs(labelComponents(input.noLines), input, labelComponents(input.binary)).filter((b) => b.box.x0 > 100);
      expect(blobs.map((b) => b.line)).toEqual([1, 3, 3]);
      expect(blobs.every((b) => b.fused === fused)).toBe(true);
      // The 4 keeps its full width although its crossbar lies on the line.
      const four = blobs[0];
      expect(four.box.x1 - four.box.x0).toBeGreaterThanOrEqual(boxes[0].box[2] - boxes[0].box[0] - (fused ? 3 : 1));
      expect(Math.abs(four.offset)).toBeLessThan(0.15);
      expect(estimateDigitHeight(blobs, input)).toBeGreaterThanOrEqual(18);
      expect(estimateDigitHeight(blobs, input)).toBeLessThanOrEqual(21);
      expect(Math.abs(digitMetrics(blobs, input).centreOffset)).toBeLessThan(3);
    }
  });

  it('leaves out dots between the lines, bar lines and stretches of line between two numbers', () => {
    const { input } = synthStaff({
      items: [{ line: 2, x: 200, text: '5' }, { line: 2, x: 236, text: '7' }],
      draw: (ink, g) => {
        for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) ink(400 + x, (g.lineYs[2] + g.lineYs[3]) / 2 - 3 + y); // a repeat dot in a space
      },
    });
    const blobs = findLineBlobs(labelComponents(input.noLines), input, labelComponents(input.binary));
    expect(blobs.filter((b) => b.box.x0 > 100).map((b) => [b.line, b.box.x1 - b.box.x0 > 6])).toEqual([[2, true], [2, true]]);
  });

  it('cuts chord numbers welded together back into one piece per string', () => {
    const { input } = synthStaff({
      weight: 700,
      digitHeight: 21,
      items: [{ line: 1, x: 300, text: '12' }, { line: 2, x: 300, text: '13' }, { line: 3, x: 300, text: '14' }],
      // Faint bridges between the stacked numbers, as blur makes them.
      draw: (ink, g) => {
        for (const l of [1, 2]) for (let y = g.lineYs[l] + 9; y <= g.lineYs[l + 1] - 9; y++) for (let x = 299; x < 327; x++) ink(x, y, 0.55);
      },
    });
    const cc = labelComponents(input.noLines);
    const plain = findLineBlobs(cc, input, labelComponents(input.binary)).filter((b) => b.box.x0 > 100);
    expect(plain.length).toBe(0); // one tall component: not a number
    const welded = findWeldedBlobs(cc, 0, input, input.gray, 21, 0, () => false);
    expect(welded.map((b) => b.line)).toEqual([1, 2, 3]);
    expect(welded.every((b) => b.welded && b.box.y1 - b.box.y0 >= 15 && b.box.y1 - b.box.y0 <= 26)).toBe(true);
    // A solid upright stroke through the same lines is not cut into numbers.
    const stroke = synthStaff({
      items: [{ line: 0, x: 600, text: '5' }],
      draw: (ink, g) => {
        for (let y = g.lineYs[1] - 10; y <= g.lineYs[4] + 10; y++) for (let x = 300; x < 312; x++) ink(x, y);
      },
    });
    expect(findWeldedBlobs(labelComponents(stroke.input.noLines), 0, stroke.input, stroke.input.gray, 19, 0, () => false).filter((b) => b.line === 2 || b.line === 3)).toEqual([]);
  });
});

describe('barlineSolidity', () => {
  it('is 1 for a bar line and clearly less for a column of numbers', () => {
    const { input } = synthStaff({ bars: [450], weight: 700, items: [1, 2, 3, 4].map((line) => ({ line, x: 300, text: '12' })) });
    expect(barlineSolidity(input.binary, input, { x0: 449, x1: 453 })).toBeGreaterThan(0.97);
    expect(barlineSolidity(input.binary, input, { x0: 300, x1: 322 })).toBeLessThan(0.9);
  });
});

/**
 * Rhythm from stems, beams and flags, and the arithmetic that fills in what stems do not show.
 */
import { describe, expect, it } from 'vitest';
import { createBinary } from '../image/gray';
import { synthStaff } from './dev/synth';
import { readTabStaff } from './recognize';
import { type MeasureEvent, assignDurations, countBeams, findStems, solveMeasure } from './rhythm';

const SP = 24;
const G = { space: SP, lineYs: [84, 108, 132, 156, 180, 204], x0: 24, x1: 876 };

/** A strip with stems under the staff at the given columns; `beams` joins neighbours, `flags` hangs flags. */
function stems(xs: number[], opts: { beams?: [number, number, number][]; flags?: [number, number][] } = {}): ReturnType<typeof createBinary> {
  const bin = createBinary(900, 372);
  const top = 204 + 16;
  const bottom = top + 60;
  for (const x of xs) for (let y = top; y < bottom; y++) for (let d = 0; d < 3; d++) bin.data[y * 900 + x + d] = 1;
  for (const [a, b, count] of opts.beams ?? []) {
    for (let k = 0; k < count; k++) for (let y = bottom - 9 - k * 14; y < bottom - k * 14; y++) for (let x = xs[a]; x < xs[b] + 3; x++) bin.data[y * 900 + x] = 1;
  }
  for (const [i, count] of opts.flags ?? []) {
    // A flag: a short slanted stroke leaving the stem's tip to the right and upwards.
    for (let k = 0; k < count; k++) for (let t = 0; t < 14; t++) for (let d = 0; d < 6; d++) bin.data[(bottom - 2 - k * 13 - t - d) * 900 + xs[i] + 3 + t] = 1;
  }
  return bin;
}

describe('findStems', () => {
  it('finds stems under the staff and none above', () => {
    const bin = stems([100, 200, 300]);
    const found = findStems(bin, G, 1);
    expect(found.map((s) => Math.round(s.x))).toEqual([102, 202, 302]);
    expect(found.every((s) => s.beams === 0 && s.y1 - s.y0 >= 58)).toBe(true);
    expect(findStems(bin, G, -1)).toEqual([]);
  });

  it('counts beams, also when blur has welded two into one, and flags', () => {
    const bin = stems([100, 150, 200, 250, 400, 450, 600, 700], { beams: [[0, 1, 1], [2, 3, 2]], flags: [[6, 1], [7, 2]] });
    const found = findStems(bin, G, 1);
    expect(found.map((s) => s.beams)).toEqual([1, 1, 2, 2, 0, 0, 1, 2]);
    // Two beams run together into one thick bar.
    const welded = stems([100, 150]);
    for (let y = 280 - 26; y < 280; y++) for (let x = 100; x < 153; x++) welded.data[y * 900 + x] = 1;
    expect(findStems(welded, G, 1).map((s) => s.beams)).toEqual([2, 2]);
    expect(countBeams(bin, found[4], SP, 1)).toBe(0);
  });

  it('ignores wide blocks and strokes far from the staff', () => {
    const bin = createBinary(900, 372);
    for (let y = 230; y < 300; y++) for (let x = 100; x < 130; x++) bin.data[y * 900 + x] = 1; // a block
    for (let y = 300; y < 360; y++) for (let x = 300; x < 303; x++) bin.data[y * 900 + x] = 1; // starts four spaces under the staff
    expect(findStems(bin, G, 1)).toEqual([]);
  });
});

describe('solveMeasure', () => {
  const ev = (x: number, stem: boolean, beams = 0): MeasureEvent => ({ x, stem, beams });

  it('leaves a measure that already adds up as it is', () => {
    const r = solveMeasure([ev(0, true), ev(100, true), ev(200, true), ev(300, true)], 3840, 400);
    expect(r?.options.map((o) => o.value)).toEqual(['quarter', 'quarter', 'quarter', 'quarter']);
  });

  it('turns bare stems into halves, and finds the dotted note by the spacing', () => {
    expect(solveMeasure([ev(0, true), ev(200, true)], 3840, 400)?.options.map((o) => o.value)).toEqual(['half', 'half']);
    // Stem, flagged eighth, stem in 4/4: dotted quarter + eighth + half, or half + eighth + dotted quarter.
    const wideLast = solveMeasure([ev(0, true), ev(170, true, 1), ev(270, true)], 3840, 510);
    expect(wideLast?.options.map((o) => `${o.value}${'.'.repeat(o.dots)}`)).toEqual(['quarter.', 'eighth', 'half']);
    const wideFirst = solveMeasure([ev(0, true), ev(240, true, 1), ev(340, true)], 3840, 510);
    expect(wideFirst?.options.map((o) => `${o.value}${'.'.repeat(o.dots)}`)).toEqual(['half', 'eighth', 'quarter.']);
  });

  it('counts printed rests and gives up on a measure that cannot add up', () => {
    const withRest = solveMeasure([ev(0, true), { x: 220, stem: false, beams: 0, rest: 'quarter' }, ev(320, true)], 3840, 420);
    expect(withRest?.options.map((o) => o.value)).toEqual(['half', 'quarter', 'quarter']);
    expect(solveMeasure([ev(0, true, 2)], 3840, 400)).toBeNull();
    expect(solveMeasure([], 3840, 400)).toBeNull();
  });
});

describe('assignDurations', () => {
  const ev = (x: number, stem: boolean, beams = 0): MeasureEvent => ({ x, stem, beams });

  it('reports no rhythm for a staff without stems', () => {
    const r = assignDurations([ev(0, false), ev(100, false)], [{ events: [0, 1], xEnd: 200 }], null);
    expect(r.durations).toEqual([null, null]);
  });

  it('finds the measure length from the measures that show it, and is surer of what it saw than of what it inferred', () => {
    // Two measures of six beamed eighths (3/4), one of a bare stem and two eighths... and a quarter.
    const events = [
      ...[0, 1, 2, 3, 4, 5].map((i) => ev(i * 40, true, 1)),
      ...[0, 1, 2, 3, 4, 5].map((i) => ev(300 + i * 40, true, 1)),
      ev(600, true), ev(760, true),
    ];
    const measures = [{ events: [0, 1, 2, 3, 4, 5], xEnd: 280 }, { events: [6, 7, 8, 9, 10, 11], xEnd: 580 }, { events: [12, 13], xEnd: 860 }];
    const r = assignDurations(events, measures, null);
    expect(r.measureTicks).toBe(2880);
    expect(r.assumed).toBe(true);
    expect(r.support).toBe(2);
    expect(r.durations.slice(0, 12).every((d) => d?.value === 'eighth' && d.confidence > 0.85)).toBe(true);
    const last = r.durations.slice(12);
    expect(last.map((d) => d?.ticks).reduce((a, b) => (a ?? 0) + (b ?? 0), 0)).toBe(2880);
    expect(last.some((d) => d?.value === 'half')).toBe(true);
    for (const d of last) if (d?.value !== 'quarter') expect(d?.confidence).toBeLessThan(0.5);
    for (const d of last) expect(d?.alternatives?.length).toBeGreaterThan(0);
  });

  it('uses a given time signature and treats a stemless number as a whole note', () => {
    const r = assignDurations([ev(0, false), ev(300, true), ev(500, true)], [{ events: [0], xEnd: 250 }, { events: [1, 2], xEnd: 700 }], 3840);
    expect(r.durations.map((d) => d?.value)).toEqual(['whole', 'half', 'half']);
    expect(r.assumed).toBe(false);
  });
});

describe('rhythm in a strip', () => {
  it('reads beamed eighths, quarters and a whole note, and leaves a stemless staff without durations', () => {
    const xs = [150, 220, 290, 360, 470, 560, 650, 740];
    const items = xs.map((x, i) => ({ line: i % 3, x: x - 5, text: String(i % 10) }));
    const draw = (ink: (x: number, y: number) => void, g: { lineYs: number[] }): void => {
      const top = g.lineYs[5] + 16;
      xs.forEach((x) => {
        for (let y = top; y < top + 60; y++) for (let d = -1; d <= 1; d++) ink(x + d, y);
      });
      for (const [a, b] of [[0, 1], [2, 3]]) for (let y = top + 51; y < top + 60; y++) for (let x = xs[a]; x <= xs[b]; x++) ink(x, y);
    };
    const { reading, debug } = readTabStaff(synthStaff({ items, draw }).input);
    expect(debug.stems.length).toBe(8);
    expect(reading.events.map((e) => e.duration?.value)).toEqual(['eighth', 'eighth', 'eighth', 'eighth', 'quarter', 'quarter', 'quarter', 'quarter']);
    expect(readTabStaff(synthStaff({ items }).input).reading.events.every((e) => e.duration === undefined)).toBe(true);
  });
});

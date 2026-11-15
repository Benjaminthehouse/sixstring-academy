import { describe, expect, it } from 'vitest';
import { METER_RANGE, centsAtPosition, centsAttribute, formatCents, formatHz, meterPosition, meterTicks, offScale, offsetWords } from './scale';

describe('meterPosition', () => {
  it('puts in tune at the centre and the ends at plus and minus fifty cents', () => {
    expect(meterPosition(0)).toBe(0);
    expect(meterPosition(METER_RANGE)).toBe(1);
    expect(meterPosition(-METER_RANGE)).toBe(-1);
    expect(meterPosition(400)).toBe(1);
    expect(meterPosition(-400)).toBe(-1);
    expect(meterPosition(Number.NaN)).toBe(0);
  });

  it('is symmetric, rises steadily and never jumps', () => {
    let previous = -Infinity;
    for (let c = -60; c <= 60; c += 0.5) {
      const p = meterPosition(c);
      expect(p).toBeGreaterThanOrEqual(previous);
      expect(p).toBeCloseTo(-meterPosition(-c), 12);
      previous = p;
    }
  });

  it('stretches the middle: the last cents get the most room', () => {
    // One cent near the centre moves the marker further than one cent near the end.
    expect(meterPosition(3) - meterPosition(2)).toBeGreaterThan(meterPosition(40) - meterPosition(39));
    expect(meterPosition(3)).toBeGreaterThan(0.12);
    expect(meterPosition(10)).toBeGreaterThan(0.3);
    expect(meterPosition(25)).toBeLessThan(0.7);
  });

  it('can be undone', () => {
    for (const c of [-50, -31, -8, -1, 0, 0.5, 3, 12, 47]) expect(centsAtPosition(meterPosition(c))).toBeCloseTo(c, 9);
  });

  it('knows when a reading is past the end', () => {
    expect([offScale(50), offScale(50.1), offScale(-300)]).toEqual([false, true, true]);
  });
});

describe('meterTicks', () => {
  it('marks every five cents, with the centre and the ends labelled', () => {
    const ticks = meterTicks();
    expect(ticks).toHaveLength(21);
    expect(ticks[0]).toMatchObject({ cents: -50, position: -1, major: true, label: '−50' });
    expect(ticks[10]).toMatchObject({ cents: 0, position: 0, label: '0' });
    expect(ticks[20]).toMatchObject({ cents: 50, position: 1, label: '+50' });
    expect(ticks.filter((t) => t.label).map((t) => t.cents)).toEqual([-50, -30, -10, 0, 10, 30, 50]);
    expect(ticks.filter((t) => !t.major).every((t) => Math.abs(t.cents) % 10 === 5)).toBe(true);
    ticks.forEach((t) => expect(t.position).toBeCloseTo(meterPosition(t.cents), 12));
  });
});

describe('numbers as text', () => {
  it('writes cents with a true minus sign and no sign on zero', () => {
    expect([formatCents(-12.4), formatCents(5.5), formatCents(0.3), formatCents(-0.4)]).toEqual(['−12', '+6', '0', '0']);
    expect([formatCents(1.44, 1), formatCents(-0.04, 1), formatCents(-7.26, 1)]).toEqual(['+1.4', '0.0', '−7.3']);
    expect(formatCents(Number.NaN)).toBe('0');
  });

  it('says an offset in plain words', () => {
    expect(offsetWords(-12.4)).toEqual({ amount: '12', unit: 'cents', side: 'low' });
    expect(offsetWords(1.2)).toEqual({ amount: '1', unit: 'cent', side: 'high' });
    expect(offsetWords(0.3)).toEqual({ amount: '0', unit: 'cents', side: '' });
    expect(offsetWords(-0.04, 1)).toEqual({ amount: '0.0', unit: 'cents', side: '' });
    expect(offsetWords(-1.44, 1)).toEqual({ amount: '1.4', unit: 'cents', side: 'low' });
    expect(offsetWords(1, 1)).toEqual({ amount: '1.0', unit: 'cent', side: 'high' });
    expect(offsetWords(Number.NaN)).toEqual({ amount: '0', unit: 'cents', side: '' });
  });

  it('writes frequencies with the precision a tuner needs', () => {
    expect([formatHz(82.407), formatHz(329.628), formatHz(0), formatHz(Number.NaN)]).toEqual(['82.41 Hz', '329.6 Hz', '', '']);
  });

  it('writes the data attribute with one decimal and never "-0.0"', () => {
    expect([centsAttribute(-12.34), centsAttribute(0.04), centsAttribute(-0.04), centsAttribute(30)]).toEqual(['-12.3', '0.0', '0.0', '30.0']);
    expect(centsAttribute(Number.NaN)).toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import { type Biquad, BUTTERWORTH4_Q, filterCascade, highpass, lowpass } from './filters';

const SR = 48000;

/** Steady-state gain of a filter chain for a sine at `freq`, measured on the second half of 0.2 s. */
function gainAt(stages: Biquad[], freq: number): number {
  const n = Math.round(0.2 * SR);
  const x = Float64Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * freq * i) / SR));
  const y = new Float64Array(n);
  filterCascade(stages, x, 0, n, y);
  let peak = 0;
  for (let i = n >> 1; i < n; i++) peak = Math.max(peak, Math.abs(y[i]));
  return peak;
}

describe('filters', () => {
  it('low-pass and high-pass have Butterworth responses', () => {
    const lp = lowpass(1000, SR);
    expect(gainAt([lp], 100)).toBeCloseTo(1, 2);
    expect(gainAt([lp], 1000)).toBeCloseTo(Math.SQRT1_2, 2);
    expect(gainAt([lp], 4000)).toBeLessThan(0.07);
    const hp = highpass(1000, SR);
    expect(gainAt([hp], 10000)).toBeCloseTo(1, 1);
    expect(gainAt([hp], 1000)).toBeCloseTo(Math.SQRT1_2, 2);
    expect(gainAt([hp], 250)).toBeLessThan(0.07);
    // Two sections with the tabulated Q values make a fourth-order filter: -3 dB at the corner, 24 dB per octave.
    const lp4 = [lowpass(1000, SR, BUTTERWORTH4_Q[0]), lowpass(1000, SR, BUTTERWORTH4_Q[1])];
    expect(gainAt(lp4, 1000)).toBeCloseTo(Math.SQRT1_2, 2);
    expect(gainAt(lp4, 2000)).toBeLessThan(0.07);
    expect(gainAt(lp4, 2000)).toBeGreaterThan(0.05);
  });

  it('starts in the steady state of its first sample, so a cut-out frame does not ring', () => {
    const x = new Float64Array(2000).fill(0.7);
    const y = new Float64Array(2000);
    filterCascade([lowpass(300, SR)], x, 0, 2000, y);
    for (const v of y) expect(v).toBeCloseTo(0.7, 9);
    filterCascade([highpass(300, SR), lowpass(3000, SR)], x, 0, 2000, y);
    for (const v of y) expect(Math.abs(v)).toBeLessThan(1e-9);
  });

  it('keeps only the newest outputs when asked, using the rest as warm-up', () => {
    const n = 3000;
    const x = Float64Array.from({ length: n }, (_, i) => Math.sin(i * 0.05) + 0.3 * Math.sin(i * 0.71));
    const full = new Float64Array(n);
    const stages = [lowpass(2000, SR), lowpass(900, SR, 1.2)];
    filterCascade(stages, x, 0, n, full);
    const tail = new Float64Array(500);
    filterCascade(stages, x, 0, n, tail, 500);
    for (let i = 0; i < 500; i++) expect(tail[i]).toBe(full[n - 500 + i]);
    // An offset start reads the right part of the input.
    const part = new Float64Array(1000);
    filterCascade([], x, 1000, 1000, part);
    expect(part[0]).toBe(x[1000]);
    expect(part[999]).toBe(x[1999]);
  });

  it('a cascade of any length equals its sections applied one after another', () => {
    const n = 2500;
    const x = Float64Array.from({ length: n }, (_, i) => Math.sin(i * 0.03) + Math.cos(i * 0.4));
    const sections = [highpass(80, SR), lowpass(4000, SR), lowpass(1500, SR, 0.9), highpass(200, SR, 1.1)];
    for (let count = 1; count <= sections.length; count++) {
      const together = new Float64Array(n);
      filterCascade(sections.slice(0, count), x, 0, n, together);
      let stepwise: Float64Array = x;
      for (let k = 0; k < count; k++) {
        const next = new Float64Array(n);
        filterCascade([sections[k]], stepwise, 0, n, next);
        stepwise = next;
      }
      let worst = 0;
      for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(together[i] - stepwise[i]));
      expect(worst, `${count} sections`).toBeLessThan(1e-9);
    }
  });
});

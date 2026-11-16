import { describe, expect, it } from 'vitest';
import { CLIP_LEVEL, PEAK_COUNT, blockLevel, computePeaks, levelVerdict, meterShare, recordStartTime, resamplePeaks, rmsOf, seekForKey, seekFraction, takeAdvice } from './signal';

function sine(n: number, amp: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * i) / 50);
  return out;
}

describe('waveform overview', () => {
  it('takes the loudest sample of each slice', () => {
    const x = new Float32Array(400);
    x[10] = 0.5;
    x[150] = -0.8;
    x[399] = 0.25;
    expect(computePeaks([x], 4)).toEqual([0.5, 0.8, 0, 0.25]);
  });

  it('combines channels and copes with nothing or with fewer samples than points', () => {
    const left = new Float32Array([0.1, 0.1, 0.1, 0.1]);
    const right = new Float32Array([0, 0, 0.9, 0]);
    expect(computePeaks([left, right], 2)).toEqual([0.1, 0.9]);
    expect(computePeaks([], 3)).toEqual([0, 0, 0]);
    expect(computePeaks([new Float32Array([0.5])], 4)).toHaveLength(4);
    expect(computePeaks([sine(48_000, 0.5)])).toHaveLength(PEAK_COUNT);
  });

  it('brings a meter envelope to the overview length', () => {
    expect(resamplePeaks([0.1, 0.9, 0.2, 0.4], 2)).toEqual([0.9, 0.4]);
    expect(resamplePeaks([0.3, 0.6], 4)).toEqual([0.3, 0.3, 0.6, 0.6]);
    expect(resamplePeaks([], 3)).toEqual([0, 0, 0]);
    expect(resamplePeaks([2, Number.NaN], 2)).toEqual([1, 0]);
  });

  it('measures loudness', () => {
    expect(rmsOf([sine(5000, 1)])).toBeCloseTo(Math.SQRT1_2, 2);
    expect(rmsOf([])).toBe(0);
    const level = blockLevel(sine(1000, 0.1));
    expect(level.peak).toBeCloseTo(0.1, 2);
    expect(level.db).toBeCloseTo(20 * Math.log10(0.1 / Math.SQRT2), 0);
    expect(blockLevel(new Float32Array(10)).db).toBe(-Infinity);
  });
});

describe('the live meter', () => {
  it('maps decibels onto the bar', () => {
    expect(meterShare(0)).toBe(1);
    expect(meterShare(-60)).toBe(0);
    expect(meterShare(-30)).toBeCloseTo(0.5);
    expect(meterShare(-Infinity)).toBe(0);
    expect(meterShare(6)).toBe(1);
  });

  it('calls a clip loud at once and keeps saying so for a moment', () => {
    const start = { verdict: 'good' as const, at: 0 };
    expect(levelVerdict(-10, CLIP_LEVEL, start, 100)).toBe('loud');
    expect(levelVerdict(-20, 0.5, { verdict: 'loud', at: 100 }, 900)).toBe('loud');
    expect(levelVerdict(-20, 0.5, { verdict: 'loud', at: 100 }, 2000)).toBe('good');
  });

  it('does not call a short pause silent or a soft note quiet', () => {
    expect(levelVerdict(-80, 0.001, { verdict: 'good', at: 1000 }, 1500)).toBe('good');
    expect(levelVerdict(-80, 0.001, { verdict: 'good', at: 1000 }, 4000)).toBe('silent');
    expect(levelVerdict(-45, 0.01, { verdict: 'good', at: 1000 }, 1500)).toBe('good');
    expect(levelVerdict(-45, 0.01, { verdict: 'silent', at: 1000 }, 1500)).toBe('quiet');
    expect(levelVerdict(-30, 0.1, { verdict: 'silent', at: 0 }, 10)).toBe('good');
  });
});

describe('advice after a take', () => {
  it('flags a take that clipped, one that is nearly silent and one that is quiet', () => {
    const clipped = new Array(100).fill(0.5);
    clipped[3] = 1;
    clipped[40] = 0.99;
    expect(takeAdvice(clipped)?.tone).toBe('warn');
    expect(takeAdvice(clipped)?.text).toMatch(/distorted/);
    expect(takeAdvice(new Array(100).fill(0.01))?.text).toMatch(/almost silent/);
    expect(takeAdvice(new Array(100).fill(0.05))?.tone).toBe('info');
    expect(takeAdvice(new Array(100).fill(0.5))).toBeNull();
    expect(takeAdvice([])).toBeNull();
  });
});

describe('seeking', () => {
  it('turns a tap into a share of the take', () => {
    expect(seekFraction(50, 200)).toBe(0.25);
    expect(seekFraction(-5, 200)).toBe(0);
    expect(seekFraction(500, 200)).toBe(1);
    expect(seekFraction(10, 0)).toBe(0);
  });

  it('steps with the keyboard and stays inside the take', () => {
    expect(seekForKey('ArrowRight', false, 10, 60)).toBe(15);
    expect(seekForKey('ArrowLeft', true, 10, 60)).toBe(9);
    expect(seekForKey('ArrowLeft', false, 2, 60)).toBe(0);
    expect(seekForKey('PageUp', false, 50, 60)).toBe(60);
    expect(seekForKey('End', false, 5, 60)).toBe(60);
    expect(seekForKey('Home', false, 5, 60)).toBe(0);
    expect(seekForKey('a', false, 5, 60)).toBeNull();
  });
});

describe('count-in', () => {
  it('starts recording after the last count-in click and before the downbeat', () => {
    // 80 BPM: a beat is 0.75 s; the last click is at 9.25 and the downbeat at 10.
    const start = recordStartTime(10, 0.75);
    expect(start).toBeLessThan(10);
    expect(start).toBeGreaterThan(10 - 0.75 + 0.05);
    // At 240 BPM (0.25 s a beat) it still waits half a beat after the last click.
    expect(recordStartTime(10, 0.25)).toBeCloseTo(9.88);
    expect(recordStartTime(10, 0.2)).toBeCloseTo(9.9);
  });
});

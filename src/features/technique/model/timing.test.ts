import { describe, expect, it } from 'vitest';
import { alignTimes, fitLine, medianGap, smallestGap } from './timing';

/** Eighth notes at 60 BPM: one every half second. */
const EIGHTHS = Array.from({ length: 16 }, (_, i) => i * 0.5);

/** A deterministic jitter in [-1, 1]. */
const jitter = (i: number): number => Math.sin(i * 12.9898) * 0.5 + Math.sin(i * 78.233) * 0.5;

describe('fitLine', () => {
  it('fits a straight line and clamps the slope', () => {
    expect(fitLine([0, 1, 2], [5, 6, 7])).toEqual({ slope: 1, offset: 5 });
    expect(fitLine([0, 1, 2], [0, 3, 6]).slope).toBe(1.33);
    expect(fitLine([3], [10])).toEqual({ slope: 1, offset: 7 });
  });
});

describe('gaps', () => {
  it('finds the smallest and median gaps, ignoring notes struck together', () => {
    expect(smallestGap([0, 0, 0.25, 0.5, 1])).toBe(0.25);
    expect(medianGap([0, 0.5, 1, 1.5, 2.5])).toBe(0.5);
  });
});

describe('alignTimes', () => {
  it('matches a perfectly even take whatever the clock offset', () => {
    const fit = alignTimes(EIGHTHS, EIGHTHS.map((t) => t + 12.345));
    expect(fit.matches.length).toBe(16);
    expect(fit.rmsMs).toBeLessThan(0.01);
    expect(fit.slope).toBeCloseTo(1, 6);
    expect(fit.offset).toBeCloseTo(12.345, 6);
    expect(fit.missed).toEqual([]);
    expect(fit.extra).toEqual([]);
  });

  it('measures uneven timing as the spread around the line', () => {
    const played = EIGHTHS.map((t, i) => 3 + t + 0.06 * jitter(i));
    const fit = alignTimes(EIGHTHS, played);
    expect(fit.matches.length).toBe(16);
    expect(fit.rmsMs).toBeGreaterThan(20);
    expect(fit.rmsMs).toBeLessThan(60);
    expect(fit.maxMs).toBeGreaterThanOrEqual(fit.rmsMs);
    expect(fit.worst).toBeGreaterThanOrEqual(0);
  });

  it('reads rushing and dragging from the slope', () => {
    const rushed = alignTimes(EIGHTHS, EIGHTHS.map((t) => 1 + t / 1.1));
    expect(1 / rushed.slope).toBeCloseTo(1.1, 3);
    expect(rushed.rmsMs).toBeLessThan(1);
    const dragged = alignTimes(EIGHTHS, EIGHTHS.map((t) => 1 + t / 0.9));
    expect(1 / dragged.slope).toBeCloseTo(0.9, 3);
  });

  it('keeps its place when notes are missing or extra', () => {
    const played = EIGHTHS.filter((_, i) => i !== 3 && i !== 9).map((t) => t + 2);
    played.push(2 + 5.25); // an extra note between two eighths
    played.sort((a, b) => a - b);
    const fit = alignTimes(EIGHTHS, played);
    expect(fit.missed).toEqual([3, 9]);
    expect(fit.extra.length).toBe(1);
    expect(fit.matches.length).toBe(14);
    expect(fit.rmsMs).toBeLessThan(0.01);
  });

  it('copes with a late start or a stray note first', () => {
    // Even notes cannot say which ones were left out (that is the pitch comparison's job): 14 of 16 match.
    const late = alignTimes(EIGHTHS, EIGHTHS.slice(2).map((t) => t + 4));
    expect(late.matches.length).toBe(14);
    expect(late.missed.length).toBe(2);
    expect(late.rmsMs).toBeLessThan(0.01);
    // With an uneven rhythm the position is unambiguous.
    const rhythm = [0, 0.5, 0.75, 1, 2, 2.25, 2.5, 3.5, 4, 4.25];
    const lateRhythm = alignTimes(rhythm, rhythm.slice(2).map((t) => t + 9));
    expect(lateRhythm.matches[0].expected).toBe(2);
    expect(lateRhythm.missed).toEqual([0, 1]);
    const stray = alignTimes(EIGHTHS, [1.1, ...EIGHTHS.map((t) => t + 2)]);
    expect(stray.extra).toEqual([0]);
    expect(stray.matches.length).toBe(16);
  });

  it('copes with nothing played', () => {
    const fit = alignTimes(EIGHTHS, []);
    expect(fit.matches).toEqual([]);
    expect(fit.missed.length).toBe(16);
  });
});

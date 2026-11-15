import { describe, expect, it } from 'vitest';
import { parseStepperInput, stepValue } from './Stepper';
import { DEFAULT_HOLD, holdDelay } from '../hooks/usePressHold';

describe('stepValue', () => {
  it('steps up and down and stays on the grid', () => {
    expect(stepValue(120, 1, 1, 30, 260, 1)).toBe(121);
    expect(stepValue(120, -1, 1, 30, 260, 1)).toBe(119);
    expect(stepValue(120, 1, 10, 30, 260, 1)).toBe(130);
    expect(stepValue(0.5, 1, 0.5, -2, 2, 0.5)).toBe(1);
    expect(stepValue(0.1, 1, 0.1, 0, 1, 0.1)).toBe(0.2);
  });
  it('clamps at the limits', () => {
    expect(stepValue(260, 1, 1, 30, 260, 1)).toBe(260);
    expect(stepValue(30, -1, 10, 30, 260, 1)).toBe(30);
    expect(stepValue(255, 1, 10, 30, 260, 1)).toBe(260);
  });
  it('re-snaps an off-grid value', () => {
    expect(stepValue(121, 1, 5, 30, 260, 5)).toBe(125);
  });
});

describe('parseStepperInput', () => {
  it('reads numbers people actually type', () => {
    expect(parseStepperInput('120')).toBe(120);
    expect(parseStepperInput(' 72 bpm')).toBe(72);
    expect(parseStepperInput('0,5')).toBe(0.5);
    expect(parseStepperInput('-1.5')).toBe(-1.5);
    expect(parseStepperInput('.25')).toBe(0.25);
  });
  it('returns null for text without a number', () => {
    expect(parseStepperInput('')).toBeNull();
    expect(parseStepperInput('fast')).toBeNull();
    expect(parseStepperInput('-')).toBeNull();
  });
});

describe('holdDelay', () => {
  it('waits, then repeats faster and faster down to a floor', () => {
    expect(holdDelay(0)).toBe(DEFAULT_HOLD.initialDelayMs);
    expect(holdDelay(1)).toBe(DEFAULT_HOLD.intervalMs);
    expect(holdDelay(2)).toBeLessThan(holdDelay(1));
    expect(holdDelay(10)).toBeLessThan(holdDelay(5));
    expect(holdDelay(500)).toBe(DEFAULT_HOLD.minIntervalMs);
  });
  it('never drops below the minimum interval', () => {
    for (let n = 0; n < 200; n++) expect(holdDelay(n)).toBeGreaterThanOrEqual(DEFAULT_HOLD.minIntervalMs);
  });
  it('respects custom timing', () => {
    const timing = { initialDelayMs: 100, intervalMs: 50, minIntervalMs: 50, acceleration: 1 };
    expect(holdDelay(0, timing)).toBe(100);
    expect(holdDelay(7, timing)).toBe(50);
  });
});

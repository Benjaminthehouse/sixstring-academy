import { describe, expect, it } from 'vitest';
import { clearanceFor } from './useToastClearance';

describe('toast clearance', () => {
  it('keeps toasts above the tempo buttons and Start (review fix: they used to cover Start)', () => {
    // A 390 x 844 phone: controls start at 652 px, the tab bar is 60 px tall.
    expect(clearanceFor(844, 60, 652)).toBe(132);
    // A wide window with no tab bar: measured from the bottom of the screen.
    expect(clearanceFor(768, 0, 636)).toBe(132);
  });

  it('never goes below zero or above 60% of the screen', () => {
    expect(clearanceFor(664, 60, 900)).toBe(0); // controls scrolled out below (very large text)
    expect(clearanceFor(664, 60, -200)).toBe(398); // controls scrolled to the top
    expect(clearanceFor(0, 60, 10)).toBe(0);
    expect(clearanceFor(Number.NaN, 60, 10)).toBe(0);
  });
});

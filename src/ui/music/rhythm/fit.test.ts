import { describe, expect, it } from 'vitest';
import { rhythmStep, stepWidth, strumStep } from './fit';

/** The px a CSS `max(Arem, min(Brem, Cpx))` resolves to at 16 px per rem. */
const resolve = (css: string): number => {
  const rem = (v: string) => Number(v) * 16;
  const m = /^max\(([\d.]+)rem, min\(([\d.]+)rem, ([\d.]+)px\)\)$/.exec(css);
  if (m) return Math.max(rem(m[1]), Math.min(rem(m[2]), Number(m[3])));
  const plain = /^([\d.]+)rem$/.exec(css);
  if (plain) return rem(plain[1]);
  throw new Error(`unexpected ${css}`);
};

describe('step widths', () => {
  it('keep the comfortable width until it is measured or when the bar fits', () => {
    expect(stepWidth(12, 0, 1.55, 1.3)).toBe('1.55rem');
    expect(resolve(stepWidth(12, 600, 1.55, 1.3))).toBe(1.55 * 16);
  });

  it('narrow the steps so a bar fits a lesson card on a 360 px phone (294 px)', () => {
    // Before, 12 steps of 1.55rem (298 px) and 16 of 1.3rem (333 px) scrolled sideways in that card.
    for (const steps of [8, 12, 16, 24]) {
      const { base, floor } = rhythmStep(steps);
      expect(resolve(stepWidth(steps, 294, base, floor)) * steps + 10, `${steps} steps`).toBeLessThanOrEqual(294);
    }
    for (const slots of [8, 12, 16]) {
      const { base, floor } = strumStep(slots);
      expect(resolve(stepWidth(slots, 294, base, floor)) * slots + 10, `${slots} slots`).toBeLessThanOrEqual(294);
    }
  });

  it('never go below the floor where glyphs would collide: a narrower box scrolls instead', () => {
    const { base, floor } = rhythmStep(16);
    expect(resolve(stepWidth(16, 120, base, floor))).toBe(floor * 16);
  });
});

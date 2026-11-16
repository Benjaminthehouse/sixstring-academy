import { describe, expect, it } from 'vitest';
import { topBarFit, type TopBarMeasure } from './topbarFit';

// Measured in the browser: the four chips of a learner with a 12 day streak and 360 gems.
const at100: TopBarMeasure = { available: 366, gap: 8, brand: 44, titleMin: 80, title: false, chips: [33, 24, 30, 41], pad: 8, tightPad: 4, tap: 44 };
const at200: TopBarMeasure = { available: 366, gap: 16, brand: 44, titleMin: 160, title: false, chips: [62, 24, 58, 81], pad: 16, tightPad: 8, tap: 44 };

describe('topBarFit', () => {
  it('shows everything at the normal text size, title included', () => {
    expect(topBarFit(at100)).toBe('all');
    expect(topBarFit({ ...at100, title: true })).toBe('all');
  });

  it('drops the repeated title first when it would squeeze the chips', () => {
    expect(topBarFit({ ...at100, available: 300, title: true })).toBe('no-title');
  });

  it('at 200 % text on a 390 px phone, lets the brand go so the four chips fit whole', () => {
    expect(topBarFit(at200)).toBe('no-brand');
    expect(topBarFit({ ...at200, title: true })).toBe('no-brand');
  });

  it('tightens the chips, then keeps the three that matter most, on narrower phones', () => {
    expect(topBarFit({ ...at200, available: 300 })).toBe('compact');
    expect(topBarFit({ ...at200, available: 240 })).toBe('core');
  });
});

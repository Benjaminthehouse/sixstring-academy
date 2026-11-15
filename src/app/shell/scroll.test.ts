import { describe, expect, it } from 'vitest';
import { scrollPlan } from './scroll';

describe('scrollPlan', () => {
  it('starts a new history entry at the top with the next index', () => {
    expect(scrollPlan(null, new Map(), 0)).toEqual({ index: 1, top: 0, revisit: false });
    expect(scrollPlan(null, new Map([[3, 400]]), 3)).toEqual({ index: 4, top: 0, revisit: false });
  });

  it('returns a revisited entry to where it was left', () => {
    expect(scrollPlan(2, new Map([[2, 640]]), 5)).toEqual({ index: 2, top: 640, revisit: true });
  });

  it('falls back to the top for an entry it has no position for (after a reload)', () => {
    expect(scrollPlan(7, new Map(), 0)).toEqual({ index: 7, top: 0, revisit: true });
  });
});

import { describe, expect, it } from 'vitest';
import { followTarget, lineAt, scrollBehavior, shouldFollow } from './scroll';

// Five lines of 150 px with 20 px between them; a 400 px view.
const LINES = [0, 1, 2, 3, 4].map((i) => ({ y: i * 170, height: 150 }));
const CONTENT = 4 * 170 + 150;

describe('auto-scroll', () => {
  it('stays put while the current and the next line are both in view', () => {
    expect(followTarget(LINES, 0, { top: 0, height: 400 }, CONTENT)).toBeNull();
  });

  it('moves the current line to the top when the next one would be cut off', () => {
    // On line 1 the next line (340–490) ends below the view (0–400).
    expect(followTarget(LINES, 1, { top: 0, height: 400 }, CONTENT)).toBe(170 - 12);
    // There it stays until line 2.
    expect(followTarget(LINES, 1, { top: 158, height: 400 }, CONTENT)).toBeNull();
    expect(followTarget(LINES, 2, { top: 158, height: 400 }, CONTENT)).toBe(340 - 12);
  });

  it('brings the current line back after a jump backwards (a loop going round)', () => {
    expect(followTarget(LINES, 0, { top: 500, height: 400 }, CONTENT)).toBe(0);
  });

  it('never scrolls past the end, and the last line counts as its own next one', () => {
    expect(followTarget(LINES, 4, { top: 0, height: 400 }, CONTENT)).toBe(CONTENT - 400);
    expect(followTarget(LINES, 4, { top: CONTENT - 400, height: 400 }, CONTENT)).toBeNull();
  });

  it('keeps at least the current line in a view too short for two', () => {
    const t = followTarget(LINES, 2, { top: 0, height: 200 }, CONTENT);
    expect(t).toBe(328);
    expect(followTarget(LINES, 2, { top: 328, height: 200 }, CONTENT)).toBeNull();
  });

  it('finds the line at a height, waits after the learner scrolls, and glides only short moves', () => {
    expect(lineAt(LINES, 0)).toBe(0);
    expect(lineAt(LINES, 345)).toBe(2);
    expect(shouldFollow(10_000, 8_000)).toBe(false);
    expect(shouldFollow(10_600, 8_000)).toBe(true);
    expect(scrollBehavior(170, 400, false)).toBe('smooth');
    expect(scrollBehavior(900, 400, false)).toBe('auto');
    expect(scrollBehavior(170, 400, true)).toBe('auto');
  });
});

/**
 * A cut while locked: the picture jumps to another guitar (or the camera is knocked) and the
 * trackers latch onto the wires that happen to lie near the old pose. Before the fix the old fret
 * numbers came along ('tracked', confidence 1.0) and stayed a fret off until the learner fixed them
 * (alt bench, 'typical' seeds 21 and 24: every locked frame after the cut a fret off). Now a move
 * much larger than the track's usual motion counts as a jump: the frame is searched afresh and its
 * numbers read off the nut, the inlays or the markers (`detector.ts`, `JUMP_CELLS`).
 *
 * Scenes from the independent renderer (`testing/alt-scenes.ts`), as `e2e/camera-alt.cjs` plays
 * them ('jump'): the scene of `seed` until the cut, then the scene of `seed + 1000`.
 */
import { describe, expect, it } from 'vitest';
import { createFretboardDetector } from './detector';
import { scoreAlt } from './testing/alt-bench';
import { altCondition, createAltCache, renderAlt } from './testing/alt-scenes';
import { FretboardTracker } from './tracker';
import type { DetectionResult, Detector } from './types';

function runCut(seed: number, cut: number, after: number) {
  const cond = altCondition('typical');
  const a = cond.build(seed);
  const b = cond.build(seed + 1000);
  const ca = createAltCache();
  const cb = createAltCache();
  const inner = createFretboardDetector();
  let last: DetectionResult | null = null;
  const detector: Detector = {
    name: 'watched',
    detect: (f, o) => (last = inner.detect(f, o)),
    track: (f, p, o) => (last = inner.track(f, p, o)),
    reset: () => inner.reset?.(),
  };
  const tracker = new FretboardTracker({ model: a.hints.model, detector });
  const frames: { index: number; state: string; right: boolean | null; offset: number; jump: boolean }[] = [];
  for (let i = 0; i < cut + after; i++) {
    const next = i >= cut;
    const { frame, truth } = renderAlt(next ? b : a, i, next ? cb : ca);
    last = null;
    const u = tracker.update(frame, i * (1000 / 30));
    const score = u.state === 'locked' && u.pose ? scoreAlt(u.pose, truth) : null;
    const stats = (last as DetectionResult | null)?.diagnostics.stats ?? {};
    frames.push({ index: i, state: u.state, right: score && score.cells > 0 ? score.accuracy >= 0.9 : null, offset: score?.offset ?? 0, jump: stats.jump === 1 });
  }
  return frames;
}

describe('a jump to another guitar while locked', () => {
  it.each([
    [21, 12],
    [24, 12],
  ])('alt scene typical %i, cut at frame %i: the numbers are read again, not carried a fret off', (seed, cut) => {
    const frames = runCut(seed, cut, 12);
    const before = frames.slice(0, cut);
    const after = frames.slice(cut);
    // Locked and right before the cut, and no jump seen in ordinary motion.
    expect(before.filter((f) => f.state === 'locked').length).toBeGreaterThan(cut / 2);
    expect(before.every((f) => f.right !== false)).toBe(true);
    expect(before.some((f) => f.jump)).toBe(false);
    // After it: never locked with every number a fret off, and locked right at the end.
    const misnumbered = after.filter((f) => f.state === 'locked' && f.offset !== 0);
    expect(misnumbered.map((f) => f.index)).toEqual([]);
    const tail = after.slice(-6);
    expect(tail.every((f) => f.state === 'locked' && f.right === true)).toBe(true);
  }, 120_000);
});

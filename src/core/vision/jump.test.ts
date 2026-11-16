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

function runCut(seed: number, cut: number, after: number, knockFrets = 0) {
  const cond = altCondition('typical');
  const a = cond.build(seed);
  // A cut to another guitar, or (knockFrets) the same guitar with the camera knocked along the neck:
  // the same picture moved by whole frets, so every wire lands where another wire was.
  const b = knockFrets ? { ...a, view: { ...a.view, anchorFret: a.view.anchorFret + knockFrets } } : cond.build(seed + 1000);
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

describe('a swaying neck on a busy machine', () => {
  it('is never taken for a jump when frames are skipped (the usual motion is a speed, not a step)', () => {
    // The same neck throughout, swaying, processed with gaps of 1 to 8 video frames as a loaded
    // machine does (a gap of 8 frames moves a swaying neck almost a fret cell).
    const spec = altCondition('typical').build(12);
    const cache = createAltCache();
    const inner = createFretboardDetector();
    let last: DetectionResult | null = null;
    const detector: Detector = { name: 'watched', detect: (f, o) => (last = inner.detect(f, o)), track: (f, p, o) => (last = inner.track(f, p, o)), reset: () => inner.reset?.() };
    const tracker = new FretboardTracker({ model: spec.hints.model, detector });
    const gaps = [1, 1, 1, 1, 1, 1, 8, 1, 1, 7, 1, 2, 8, 1, 1, 6, 1, 8, 1, 1, 7];
    let i = 0;
    let jumps = 0;
    let wrong = 0;
    let locked = 0;
    for (const gap of gaps) {
      i += gap;
      const { frame, truth } = renderAlt(spec, i, cache);
      last = null;
      const u = tracker.update(frame, i * (1000 / 30));
      if ((last as DetectionResult | null)?.diagnostics.stats?.jump === 1) jumps++;
      if (u.state === 'locked' && u.pose) {
        const score = scoreAlt(u.pose, truth);
        locked++;
        if (score.cells > 0 && score.accuracy < 0.9) wrong++;
      }
    }
    expect(jumps).toBe(0);
    expect(locked).toBeGreaterThan(gaps.length / 2);
    expect(wrong).toBe(0);
  }, 120_000);

  it('learns the speed from a fresh look that agrees, so a slow machine does not search frame after frame afresh', () => {
    // Every 15th video frame from the very first one (a machine managing 2 frames a second): the
    // track has no usual speed yet, so a big move is checked against a fresh search. That search
    // finds the same board with the same numbers, so the move was motion, not a cut. Before the
    // speed was learned from it, the next frames were taken for jumps too (4 of 16 frames here),
    // each a full search at several times the cost of tracking: under load the gaps then grew and
    // a live pipeline could stall at a frame or two a second.
    const spec = altCondition('typical').build(12);
    const cache = createAltCache();
    const inner = createFretboardDetector();
    let last: DetectionResult | null = null;
    const detector: Detector = { name: 'watched', detect: (f, o) => (last = inner.detect(f, o)), track: (f, p, o) => (last = inner.track(f, p, o)), reset: () => inner.reset?.() };
    const tracker = new FretboardTracker({ model: spec.hints.model, detector });
    let jumps = 0;
    let locked = 0;
    const misnumbered: number[] = [];
    for (let i = 0; i < 15 * 16; i += 15) {
      const { frame, truth } = renderAlt(spec, i, cache);
      last = null;
      const u = tracker.update(frame, i * (1000 / 30));
      if ((last as DetectionResult | null)?.diagnostics.stats?.jump === 1) jumps++;
      if (u.state === 'locked' && u.pose) {
        locked++;
        const score = scoreAlt(u.pose, truth);
        if (score.cells > 0 && score.offset !== 0) misnumbered.push(i);
      }
    }
    expect(jumps).toBeLessThanOrEqual(1);
    expect(locked).toBeGreaterThanOrEqual(12);
    expect(misnumbered).toEqual([]);
  }, 120_000);
});

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

describe('the camera knocked along the same neck while locked', () => {
  // Review: the same guitar, the picture moved two frets along the neck between two frames. Every
  // wire lands where another wire was, so the trackers hold on and only the numbers are wrong.
  // Without the jump check every locked frame after the knock was a fret off to the end (seeds
  // 102 +2 and 100 -2 here); knocked +1, +2 and -2 frets on seeds 100-109: 117 locked frames wrong
  // and 7 scenes ending a fret off without it, 1 frame wrong (half a string) and none off with it.
  it.each([
    [102, 2],
    [100, -2],
  ])('alt scene typical %i, knocked %i frets: the numbers are read again', (seed, frets) => {
    const cut = 14;
    const frames = runCut(seed, cut, 14, frets);
    const before = frames.slice(0, cut);
    const after = frames.slice(cut);
    expect(before.filter((f) => f.state === 'locked').length).toBeGreaterThan(cut / 2);
    expect(before.some((f) => f.jump)).toBe(false);
    expect(after.some((f) => f.jump)).toBe(true);
    expect(after.filter((f) => f.state === 'locked' && f.offset !== 0).map((f) => f.index)).toEqual([]);
    expect(after.slice(-4).every((f) => f.state === 'locked' && f.right === true)).toBe(true);
  }, 120_000);
});

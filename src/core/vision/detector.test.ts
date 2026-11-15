import { describe, expect, it } from 'vitest';
import { createFretboardDetector, fuseNumbering, wholeFretShift } from './detector';
import { comparePoses, renumberPose } from './geometry';
import { renderScene } from './testing/render';
import { sampleNegativeScene, sampleScene } from './testing/scene';
import { buildSequence } from './testing/sequence';
import type { Frame, FretboardPose } from './types';

/** Rendering costs about 0.15 s per frame: a handful of fixed scenes only. */
describe('production fretboard detector', () => {
  it('finds a clean board, numbers it, and says which search found it', () => {
    const scene = renderScene(sampleScene('easy', 0));
    const out = createFretboardDetector().detect(scene.frame, scene.truth.hints);
    expect(out.pose).not.toBeNull();
    const err = comparePoses(out.pose!, scene.truth.pose!);
    expect(err.cellAccuracy).toBeGreaterThanOrEqual(0.95);
    expect(err.numberingOffset).toBe(0);
    expect(out.pose!.numberingConfidence).toBeGreaterThanOrEqual(0.5);
    expect(out.pose!.frameWidth).toBe(scene.frame.width);
    expect(typeof out.diagnostics.stats?.evidence).toBe('number');
    expect(out.diagnostics.timings.total).toBeGreaterThan(0);
  });

  it('finds what one search alone misses (a hand on the neck, a mirrored frame)', () => {
    for (const seed of [4, 12]) {
      const scene = renderScene(sampleScene('medium', seed));
      const out = createFretboardDetector().detect(scene.frame, scene.truth.hints);
      expect(out.pose, `medium ${seed}`).not.toBeNull();
      expect(comparePoses(out.pose!, scene.truth.pose!).cellAccuracyAligned, `medium ${seed}`).toBeGreaterThanOrEqual(0.9);
      expect(out.pose!.mirrored).toBe(scene.spec.mirrored);
    }
  });

  it('returns null with a reason on rooms without a guitar and on unusable input', () => {
    const detector = createFretboardDetector();
    for (const seed of [0, 5, 6, 9]) {
      const scene = renderScene(sampleNegativeScene(seed));
      const out = detector.detect(scene.frame, scene.truth.hints);
      expect(out.pose, scene.truth.description).toBeNull();
      expect(typeof out.diagnostics.reason).toBe('string');
    }
    const tiny: Frame = { data: new Uint8ClampedArray(16 * 16 * 4), width: 16, height: 16 };
    expect(detector.detect(tiny).diagnostics.reason).toBe('bad-frame');
    const black: Frame = { data: new Uint8ClampedArray(320 * 180 * 4), width: 320, height: 180 };
    expect(detector.detect(black).pose).toBeNull();
    const scene = renderScene(sampleScene('easy', 0));
    expect(detector.track(black, scene.truth.pose!).pose).toBeNull();
  });

  it('tracks from a calibrated pose and keeps the fret numbers', () => {
    const seq = buildSequence('sway', { frames: 6 });
    const detector = createFretboardDetector();
    let pose: FretboardPose | null = null;
    for (let i = 0; i < seq.frames.length; i++) {
      const scene = renderScene(seq.frames[i]);
      if (i === 0) {
        pose = { ...scene.truth.pose!, numbering: 'user', numberingConfidence: 1 };
        continue;
      }
      const out = detector.track(scene.frame, pose!, { ...scene.truth.hints, timeMs: i * 33 });
      expect(out.pose, `frame ${i}`).not.toBeNull();
      const err = comparePoses(out.pose!, scene.truth.pose!);
      expect(err.cellAccuracy, `frame ${i}`).toBeGreaterThanOrEqual(0.95);
      expect(out.pose!.numbering).toBe('tracked');
      pose = out.pose;
    }
  });
});

describe('detector helpers', () => {
  it('measures whole-fret shifts between poses', () => {
    const truth = renderScene(sampleScene('easy', 0)).truth.pose!;
    const { width, height } = { width: truth.frameWidth, height: truth.frameHeight };
    expect(wholeFretShift(truth.H, truth.H, truth.model, width, height)).toEqual({ delta: 0, residual: 0 });
    // A pose whose numbers were shifted by +2 must be shifted by -2 to agree again.
    const up = renumberPose(truth, 2);
    const shift = wholeFretShift(up.H, truth.H, truth.model, width, height)!;
    expect(shift.delta).toBe(-2);
    expect(shift.residual).toBeLessThan(0.05);
  });

  it('fuses the two numbering readers', () => {
    const agree = fuseNumbering({ delta: 2, source: 'nut', confidence: 0.7 }, { delta: 2, source: 'inlays', confidence: 0.5 });
    expect(agree).toMatchObject({ delta: 2, source: 'nut' });
    expect(agree.confidence).toBeCloseTo(0.9, 9);
    const disagree = fuseNumbering({ delta: 2, source: 'nut', confidence: 0.8 }, { delta: 0, source: 'inlays', confidence: 0.7 });
    expect(disagree.delta).toBe(2);
    // Contradicted numbers are no longer trusted (below 0.5 the UI asks), and lose their source when the dissent is strong.
    expect(disagree.confidence).toBeLessThan(0.5);
    expect(fuseNumbering({ delta: 2, source: 'nut', confidence: 0.8 }, { delta: 0, source: 'inlays', confidence: 0.8 }).source).toBe('assumed');
    const guess = fuseNumbering({ delta: 1, source: 'assumed', confidence: 0.1 }, { delta: 1, source: 'nut', confidence: 0.6 });
    expect(guess.source).toBe('nut');
  });
});

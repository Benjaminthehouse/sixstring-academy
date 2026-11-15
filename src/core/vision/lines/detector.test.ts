import { describe, expect, it } from 'vitest';
import { comparePoses, confirmFretAt, poseFromCalibrationTaps, projectFretWire, projectMarker } from '../geometry';
import { renderScene } from '../testing/render';
import { sampleNegativeScene, sampleScene } from '../testing/scene';
import { buildSequence } from '../testing/sequence';
import type { Frame } from '../types';
import { createLineDetector } from './detector';
import { createDetector } from './index';

/** Rendering costs about 0.15 s per frame: these tests look at a handful of fixed scenes only. */
describe('line-structure detector', () => {
  it('finds a clean fretboard, numbers it from the nut and the inlays, and reports its stages', () => {
    const scene = renderScene(sampleScene('easy', 0));
    const out = createLineDetector().detect(scene.frame, scene.truth.hints);
    expect(out.pose).not.toBeNull();
    const err = comparePoses(out.pose!, scene.truth.pose!);
    expect(err.cellAccuracy).toBeGreaterThanOrEqual(0.95);
    expect(err.numberingOffset).toBe(0);
    expect(err.fretErrorAligned.median).toBeLessThan(0.05);
    expect(err.stringError.median).toBeLessThan(0.15);
    expect(err.nutDirectionCorrect && err.bassSideCorrect).toBe(true);
    expect(out.pose!.numberingConfidence).toBeGreaterThanOrEqual(0.5);
    expect(['nut', 'inlays']).toContain(out.pose!.numbering);
    expect(out.pose!.frameWidth).toBe(scene.frame.width);
    expect(out.diagnostics.timings.total).toBeGreaterThan(0);
    expect(out.diagnostics.features).toBeUndefined();
  });

  it('handles a hand on the neck, a mirrored frame and a bigger frame', () => {
    for (const seed of [4, 12]) {
      const scene = renderScene(sampleScene('medium', seed));
      const out = createLineDetector().detect(scene.frame, scene.truth.hints);
      expect(out.pose, `medium ${seed}`).not.toBeNull();
      const err = comparePoses(out.pose!, scene.truth.pose!);
      expect(err.cellAccuracyAligned, `medium ${seed}`).toBeGreaterThanOrEqual(0.9);
      expect(out.pose!.mirrored).toBe(scene.spec.mirrored);
      expect(out.pose!.frameWidth).toBe(scene.frame.width);
    }
  });

  it('returns null with a reason on frames without a guitar, and never throws', () => {
    const detector = createLineDetector({ debug: true });
    for (const seed of [0, 5, 6]) {
      const scene = renderScene(sampleNegativeScene(seed));
      const out = detector.detect(scene.frame, scene.truth.hints);
      expect(out.pose, scene.truth.description).toBeNull();
      expect(typeof out.diagnostics.reason).toBe('string');
      expect(Array.isArray(out.diagnostics.features)).toBe(true);
    }
    const tiny: Frame = { data: new Uint8ClampedArray(16 * 16 * 4), width: 16, height: 16 };
    expect(detector.detect(tiny).pose).toBeNull();
    const black: Frame = { data: new Uint8ClampedArray(320 * 180 * 4), width: 320, height: 180 };
    expect(detector.detect(black).pose).toBeNull();
    const pose = poseFromCalibrationTaps({ nut: [{ x: 280, y: 60 }, { x: 282, y: 90 }], fret: [{ x: 80, y: 70 }, { x: 82, y: 110 }] }, 320, 180)!;
    expect(detector.track(black, pose).pose).toBeNull();
  });

  it('tracks from a calibrated pose, keeps the numbering and stays steady', () => {
    const seq = buildSequence('sway', { frames: 6 });
    const detector = createDetector();
    const first = renderScene(seq.frames[0]);
    let pose = { ...first.truth.pose!, numbering: 'user' as const };
    let last = pose;
    for (let i = 1; i < seq.frames.length; i++) {
      const scene = renderScene(seq.frames[i]);
      const out = detector.track(scene.frame, pose, { ...scene.truth.hints, timeMs: (i * 1000) / seq.fps });
      expect(out.pose, `frame ${i}`).not.toBeNull();
      const err = comparePoses(out.pose!, scene.truth.pose!);
      expect(err.cellAccuracy, `frame ${i}`).toBeGreaterThanOrEqual(0.9);
      expect(err.numberingOffset).toBe(0);
      expect(out.pose!.numbering).toBe('tracked');
      last = pose;
      pose = out.pose! as typeof pose;
    }
    // Consecutive poses of a gently swaying guitar are a few pixels apart, not a fret.
    const a = projectMarker(pose, 3, 5);
    const b = projectMarker(last, 3, 5);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(8);
  });

  it('honours a region hint', () => {
    const scene = renderScene(sampleScene('easy', 0));
    const detector = createLineDetector();
    const inside = detector.detect(scene.frame, { ...scene.truth.hints, region: { x: 0, y: 60, width: 640, height: 240 } });
    expect(inside.pose).not.toBeNull();
    const outside = detector.detect(scene.frame, { ...scene.truth.hints, region: { x: 0, y: 0, width: 200, height: 60 } });
    expect(outside.pose).toBeNull();
    expect(outside.diagnostics.reason).toBe('outside-region');
  });

  it('honours a confirmation tap and the previous pose of a re-detection', () => {
    const scene = renderScene(sampleScene('easy', 3));
    const detector = createLineDetector();
    const plain = detector.detect(scene.frame, scene.truth.hints).pose!;
    // Tap on the cell the detector calls fret 5 and say it is fret 7.
    const point = projectMarker(plain, 3, 5);
    const tapped = detector.detect(scene.frame, { ...scene.truth.hints, fretHint: { point, fret: 7 } }).pose!;
    expect(tapped.numbering).toBe('user');
    expect(tapped.numberingConfidence).toBe(1);
    const [p] = projectFretWire(tapped, 7);
    const [q] = projectFretWire(plain, 5);
    expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeLessThan(2.5);
    // A re-detection that is handed a user-numbered earlier pose of the same view keeps those numbers
    // only where this frame does not itself show the nut: here it does, so the image wins.
    const shifted = confirmFretAt(plain, point, 7)!;
    detector.reset?.();
    const again = detector.detect(scene.frame, { ...scene.truth.hints, previousPose: shifted }).pose!;
    expect(comparePoses(again, scene.truth.pose!).numberingOffset).toBe(0);
  });
});

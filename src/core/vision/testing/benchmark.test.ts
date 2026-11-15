import { describe, expect, it } from 'vitest';
import { scalePose } from '../geometry';
import type { Detector } from '../types';
import { CORRECT_CELL_ACCURACY, STANDARD_TIERS, formatBenchmark, measureCalibration, runBenchmark, type BenchmarkOptions, type BenchmarkResult, type FrameEvent } from './benchmark';
import { expectMinimums } from './detector-benchmark';
import { createNullDetector, createOracleDetector } from './oracle';
import { diskFrameStore, rendererFingerprint } from './store';

// A small fixed slice of the benchmark. Frames come from the on-disk cache when it is warm
// (the cache is keyed by a hash of the renderer sources, so it can never serve stale pixels).
const SMALL: BenchmarkOptions = { scenesPerTier: 3, negatives: 4, sequences: ['still', 'occlusion'], sequenceFrames: 24, frames: diskFrameStore() };
const TIMEOUT = 300_000;

function tierOf(result: BenchmarkResult, name: string): BenchmarkResult['tiers'][number] {
  const t = result.tiers.find((x) => x.tier === name);
  if (!t) throw new Error(`no tier ${name}`);
  return t;
}

describe('benchmark harness', () => {
  let perfect: BenchmarkResult;

  it('gives the oracle full marks', () => {
    const events: FrameEvent[] = [];
    perfect = runBenchmark(createOracleDetector(), { ...SMALL, onFrame: (e) => events.push(e) });
    expect(perfect.detector).toBe('oracle');
    expect(perfect.tiers.map((t) => t.tier)).toEqual([...STANDARD_TIERS]);
    for (const t of perfect.tiers) {
      expect(t.frames).toBe(3);
      expect(t.detectionRate).toBe(1);
      expect(t.lockRate).toBe(1);
      expect(t.correctRate).toBe(1);
      expect(t.cellAccuracy).toBe(1);
      expect(t.fretError.p90).toBeLessThan(1e-6);
      expect(t.fretErrorAbsolute.p90).toBeLessThan(1e-6);
      expect(t.stringError.p90).toBeLessThan(1e-6);
      expect(t.confidentlyWrong).toBe(0);
      expect(t.nutDirectionRate).toBe(1);
      expect(t.bassSideRate).toBe(1);
      expect(t.crashes).toBe(0);
    }
    expect(perfect.negatives).toMatchObject({ frames: 4, falsePositives: 0, falsePositiveRate: 0 });
    expect(perfect.detectionScore).toBeCloseTo(100, 6);
    expect(perfect.trackingScore).toBeCloseTo(100, 6);
    const still = perfect.sequences[0];
    expect(still.name).toBe('still');
    expect(still.evaluable).toBe(23);
    expect(still.trackingSuccess).toBe(1);
    expect(still.jitterPx).toBe(0);
    expect(still.lostFrames + still.driftFrames).toBe(0);
    const occ = perfect.sequences[1];
    expect(occ.evaluable).toBeLessThan(23);
    expect(occ.evaluable).toBeGreaterThan(12);
    expect(occ.trackingSuccess).toBe(1);
    expect(occ.recoveryFrames).toBe(0);
    expect(occ.heldThroughOcclusion).toBe(0);
    expect(occ.redetections).toBe(1);
    expect(occ.numberingKept).toBe(1);
    // One event per scored frame, each carrying the scene and the raw detector output.
    expect(events).toHaveLength(perfect.frames.length);
    expect(events.length).toBe(12 + 4 + 23 + 23);
    expect(events[0].scene.frame.data.length).toBeGreaterThan(0);
    expect(events[0].result?.diagnostics.timings.total).toBeGreaterThanOrEqual(0);
    expect(events.filter((e) => e.kind === 'negative').every((e) => e.correct && !e.detected)).toBe(true);
    expect(perfect.calibrationMs).toBeGreaterThan(0);
    expect(perfect.renderMs).toBeGreaterThan(0);
  }, TIMEOUT);

  it('gives the null detector zero, and no false positives', () => {
    const none = runBenchmark(createNullDetector(), SMALL);
    for (const t of none.tiers) {
      expect(t.detectionRate).toBe(0);
      expect(t.correctRate).toBe(0);
      expect(t.cellAccuracy).toBe(0);
      expect(t.numberingRate).toBeNaN();
    }
    expect(none.negatives?.falsePositiveRate).toBe(0);
    expect(none.detectionScore).toBe(0);
    expect(none.trackingScore).toBe(0);
    expect(none.sequences[1].recoveryFrames).toBe(Infinity);
    expect(none.sequences[0].lostFrames).toBe(none.sequences[0].evaluable);
    expect(none.sequences[0].jitterPx).toBeNaN();
  }, TIMEOUT);

  it('is reproducible', () => {
    const again = runBenchmark(createOracleDetector(), SMALL);
    const strip = (r: BenchmarkResult): unknown => ({ tiers: r.tiers.map((t) => ({ ...t, ms: 0 })), negatives: { ...r.negatives, ms: 0 }, sequences: r.sequences.map((s) => ({ ...s, ms: 0 })), score: [r.detectionScore, r.trackingScore] });
    expect(strip(again)).toEqual(strip(perfect));
    expect(rendererFingerprint()).toMatch(/^[0-9a-f]{12}$/);
  }, TIMEOUT);

  it('measures a slide along the neck in fret spacings', () => {
    const slight = runBenchmark(createOracleDetector({ fretShift: 0.2 }), { ...SMALL, sequences: false });
    for (const t of slight.tiers) {
      expect(t.fretError.median).toBeCloseTo(0.2, 2);
      expect(t.fretErrorAbsolute.median).toBeCloseTo(0.2, 2);
      expect(t.stringError.median).toBeLessThan(0.01);
      // Markers sit 68% into the cell, so a 20% slide still lands in the right cell.
      expect(t.correctRate).toBe(1);
    }
    const bad = runBenchmark(createOracleDetector({ fretShift: 0.5 }), { ...SMALL, sequences: false });
    for (const t of bad.tiers) {
      expect(t.fretError.median).toBeGreaterThan(0.35);
      expect(t.detectionRate).toBe(1);
      expect(t.lockRate).toBe(0);
      expect(t.correctRate).toBe(0);
    }
    // With the nut in view every marker is checked against its true fret number.
    expect(tierOf(bad, 'easy').cellAccuracy).toBeLessThan(0.2);
    expect(bad.detectionScore).toBeLessThan(slight.detectionScore - 20);
  }, TIMEOUT);

  it('measures a shift across the neck in string spacings', () => {
    const r = runBenchmark(createOracleDetector({ stringShift: 0.7 }), { ...SMALL, sequences: false, negatives: 0 });
    for (const t of r.tiers) {
      expect(t.stringError.median).toBeGreaterThan(0.4);
      expect(t.stringError.median).toBeLessThan(1);
      expect(t.fretError.median).toBeLessThan(0.02);
      expect(t.correctRate).toBe(0);
    }
    expect(r.negatives).toBeNull();
  }, TIMEOUT);

  it('separates a wrong fret number from a bad fit, and rewards honesty about it', () => {
    const off = runBenchmark(createOracleDetector({ numberingOffset: 2 }), { ...SMALL, sequences: false });
    for (const t of off.tiers) {
      // Geometrically perfect...
      expect(t.lockRate).toBe(1);
      expect(t.fretError.median).toBeLessThan(1e-6);
      // ...but fret 5 is called fret 7.
      expect(t.fretErrorAbsolute.median).toBeGreaterThan(1.5);
      if (!Number.isNaN(t.numberingRate)) expect(t.numberingRate).toBe(0);
      expect(t.confidentlyWrong).toBe(1);
    }
    // Wherever the frame shows the nut or the 12th-fret inlays, a wrong number is a wrong marker.
    expect(tierOf(off, 'easy').correctRate).toBe(0);
    expect(tierOf(off, 'easy').numberingRate).toBe(0);
    expect(off.detectionScore).toBeLessThan(60);
    const humble = runBenchmark(createOracleDetector({ numberingOffset: 2, numberingConfidence: 0.2 }), { ...SMALL, sequences: false });
    for (const t of humble.tiers) expect(t.confidentlyWrong).toBe(0);
  }, TIMEOUT);

  it('penalises noise, misses, false alarms and a reversed neck', () => {
    const noisy = runBenchmark(createOracleDetector({ noisePx: 1.5 }), SMALL);
    expect(tierOf(noisy, 'medium').fretError.median).toBeGreaterThan(0.005);
    expect(tierOf(noisy, 'medium').fretError.median).toBeLessThan(0.3);
    expect(noisy.sequences[0].jitterPx).toBeGreaterThan(0.5);
    expect(noisy.sequences[0].jitterPx).toBeLessThan(6);
    expect(noisy.sequences[1].wobblePx).toBeGreaterThan(0.5);

    const flaky = runBenchmark(createOracleDetector({ dropRate: 0.5, seed: 3 }), { ...SMALL, scenesPerTier: 8 });
    const found = flaky.tiers.reduce((a, t) => a + t.detectionRate * t.frames, 0);
    expect(found).toBeGreaterThan(8);
    expect(found).toBeLessThan(24);
    for (const t of flaky.tiers) expect(t.cellAccuracy).toBeCloseTo(t.detectionRate, 6);
    expect(flaky.sequences[0].lostFrames).toBeGreaterThan(3);
    expect(flaky.sequences[0].trackingSuccess).toBeLessThan(0.9);

    const jumpy = runBenchmark(createOracleDetector({ falsePositiveRate: 1 }), { ...SMALL, sequences: false });
    expect(jumpy.negatives?.falsePositiveRate).toBe(1);
    expect(jumpy.negatives?.fooledBy).toHaveLength(4);
    expect(tierOf(jumpy, 'easy').correctRate).toBe(1);
    expect(jumpy.detectionScore).toBe(0);

    const backwards = runBenchmark(createOracleDetector({ reversed: true }), { ...SMALL, sequences: false });
    for (const t of backwards.tiers) {
      expect(t.nutDirectionRate).toBe(0);
      expect(t.bassSideRate).toBe(1);
      expect(t.lockRate).toBe(0);
      expect(t.correctRate).toBe(0);
    }
  }, TIMEOUT);

  it('stays fair to a detector that only knows the preset neck dimensions', () => {
    const preset = runBenchmark(createOracleDetector({ usePresetModel: true }), { ...SMALL, sequences: false });
    for (const t of preset.tiers) {
      expect(t.correctRate).toBeGreaterThanOrEqual(2 / 3);
      expect(t.fretError.median).toBeLessThan(0.08);
      expect(t.stringError.median).toBeLessThan(0.2);
    }
    expect(preset.detectionScore).toBeGreaterThan(90);
  }, TIMEOUT);

  it('reports a pose held through an occlusion and survives a detector that throws', () => {
    const xray = runBenchmark(createOracleDetector({ seeThroughOcclusion: true }), { ...SMALL, tiers: [], negatives: 0, sequences: ['occlusion'] });
    expect(xray.sequences[0].heldThroughOcclusion).toBe(1);
    expect(xray.sequences[0].redetections).toBe(0);
    expect(xray.tiers).toHaveLength(0);
    expect(xray.detectionScore).toBeNaN();

    const oracle = createOracleDetector();
    let calls = 0;
    const broken: Detector = {
      name: 'broken',
      detect: (frame, o) => {
        if (calls++ % 2 === 0) throw new Error('boom');
        return oracle.detect(frame, o);
      },
      track: () => {
        throw new Error('boom');
      },
    };
    const r = runBenchmark(broken, { ...SMALL, sequences: ['still'] });
    expect(r.tiers.reduce((a, t) => a + t.crashes, 0)).toBe(6);
    expect(r.sequences[0].crashes).toBeGreaterThan(0);
    expect(formatBenchmark(r)).toContain('WARNING: the detector threw');
    // A detector that returns garbage instead of null is treated as "no pose".
    const garbage: Detector = {
      name: 'garbage',
      detect: (frame) => ({ pose: { ...(oracle.detect(frame).pose as NonNullable<ReturnType<Detector['detect']>['pose']>), H: [NaN, 0, 0, 0, 1, 0, 0, 0, 1] }, diagnostics: { timings: { total: 0 } } }),
      track: oracle.track,
    };
    const g = runBenchmark(garbage, { ...SMALL, tiers: ['easy'], negatives: 0, sequences: false });
    expect(tierOf(g, 'easy').detectionRate).toBe(0);
  }, TIMEOUT);

  it('accepts poses reported for a downscaled working frame', () => {
    const oracle = createOracleDetector();
    const half: Detector = {
      name: 'half-size',
      detect: (frame, o) => {
        const r = oracle.detect(frame, o);
        return { ...r, pose: r.pose ? scalePose(r.pose, 0.5) : null };
      },
      track: oracle.track,
    };
    const r = runBenchmark(half, { ...SMALL, sequences: false });
    expect(r.detectionScore).toBeCloseTo(100, 6);
    for (const t of r.tiers) expect(t.fretError.p90).toBeLessThan(1e-6);
  }, TIMEOUT);

  it('runs held-out scenes with a seed offset', () => {
    const seen: string[] = [];
    const held = runBenchmark(createOracleDetector(), { ...SMALL, scenesPerTier: 2, negatives: 2, sequences: ['still'], sequenceFrames: 6, seedOffset: 1000, onFrame: (e) => seen.push(e.description) });
    expect(held.seedOffset).toBe(1000);
    expect(held.detectionScore).toBeCloseTo(100, 6);
    expect(held.trackingScore).toBeCloseTo(100, 6);
    expect(seen[0]).toContain('easy#1000');
    expect(seen).toContain(seen.find((d) => d.startsWith('negative#1000')) ?? 'missing');
    expect(formatBenchmark(held)).toContain('held-out scenes, seed offset 1000');
    expect(perfect.seedOffset).toBe(0);
  }, TIMEOUT);

  it('honours the options and prints a readable report', () => {
    const markers = runBenchmark(createOracleDetector(), { tiers: ['markers'], scenesPerTier: 2, negatives: 0, sequences: false, frames: SMALL.frames });
    expect(markers.tiers).toHaveLength(1);
    expect(tierOf(markers, 'markers').numberingRate).toBe(1);
    // With no standard tier in the run, the score falls back to the tiers that were run.
    expect(markers.detectionScore).toBeCloseTo(100, 6);
    expect(markers.trackingScore).toBeNaN();
    const text = formatBenchmark(perfect);
    for (const word of ['oracle', 'DETECTION', 'easy', 'extreme', 'NEGATIVES', 'TRACKING', 'occlusion', 'SCORE  detection 100.0 / 100   tracking 100.0 / 100', 'calibration']) expect(text).toContain(word);
    expect(text.split('\n').length).toBeLessThan(30);
    expect(() => expectMinimums(perfect, { tiers: { easy: { correctRate: 1 }, hard: { cellAccuracy: 0.99 } }, maxFalsePositiveRate: 0, trackingSuccess: 1, detectionScore: 99 })).not.toThrow();
    const none = runBenchmark(createNullDetector(), { ...SMALL, sequences: false });
    expect(() => expectMinimums(none, { tiers: { easy: { correctRate: 0.5 } } })).toThrow();
    expect(CORRECT_CELL_ACCURACY).toBe(0.9);
    expect(measureCalibration()).toBeGreaterThan(0);
  }, TIMEOUT);
});

/**
 * The full fretboard benchmark for the alignment detector, with floors a regression would break.
 * Skipped in a normal test run (it takes about half a minute warm, several minutes with a cold
 * frame cache). From `guitar/`:
 *
 *   ALIGN_BENCH=1 npx vitest run src/core/vision/align/benchmark.test.ts
 *   ALIGN_BENCH=1 VISION_SEED_OFFSET=1000 npx vitest run src/core/vision/align/benchmark.test.ts   # held-out scenes (also 2000)
 *
 * The report and failure images land in e2e/out/vision/align/.
 */
import { describe, it } from 'vitest';
import { defineDetectorBenchmark } from '../testing/detector-benchmark';
import { createAlignDetector } from './detector';

if (process.env.ALIGN_BENCH === '1') {
  const seedOffset = process.env.VISION_SEED_OFFSET ? Number(process.env.VISION_SEED_OFFSET) : undefined;
  defineDetectorBenchmark('align', () => createAlignDetector({ debugFeatures: process.env.ALIGN_FEATURES !== '0' }), {
    seedOffset,
    // Floors sit a little under the worst of the three scene sets measured (offsets 0, 1000, 2000;
    // see README.md). The hard and extreme tiers vary a lot between sets (hard: 58%, 71%, 38%).
    minimums: {
      tiers: { easy: { correctRate: 0.95 }, medium: { correctRate: 0.75 }, hard: { correctRate: 0.33 }, extreme: { correctRate: 0.2 } },
      maxFalsePositiveRate: 0.05,
      trackingSuccess: 0.9,
      detectionScore: 65,
    },
  });
} else {
  describe.skip('fretboard benchmark: align (set ALIGN_BENCH=1 to run)', () => {
    it('is skipped', () => undefined);
  });
}

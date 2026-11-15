/**
 * Point the benchmark at any detector module without writing a test file. From `guitar/`:
 *
 *   VISION_DETECTOR=src/core/vision/my-detector.ts npx vitest run src/core/vision/testing/detector-benchmark.test.ts
 *
 * The module must export a factory `createDetector()` (or name another export with VISION_EXPORT),
 * or default-export a Detector. Optional switches:
 *   VISION_QUICK=1                 smaller run (8 scenes per tier, 12 negatives, 3 sequences)
 *   VISION_TIERS=easy,medium       only these tiers (add `markers` for sticker mode)
 *   VISION_SEQUENCES=0             skip tracking sequences (or a comma list of sequence names)
 *   VISION_NEGATIVES=0             skip negative frames
 *   VISION_TRACK_INIT=detect       sequences start with detect() instead of the true pose
 *   VISION_NO_CACHE=1              re-render instead of using e2e/out/vision/cache
 *   VISION_SEED_OFFSET=1000        held-out scenes: the same tiers and sequences from different seeds
 * Without VISION_DETECTOR this file is skipped. `VISION_DETECTOR=oracle` or `null` run the built-in
 * references; degrade the oracle with e.g. VISION_ORACLE='{"noisePx":2,"dropRate":0.2}' to see how the metrics react.
 */
import { describe, it } from 'vitest';
import { defineDetectorBenchmark, loadDetector } from './detector-benchmark';
import type { Tier } from './scene';
import type { SequenceName } from './sequence';

const target = process.env.VISION_DETECTOR ?? '';
const load = (): ReturnType<typeof loadDetector> => loadDetector(target, process.env.VISION_EXPORT, process.env.VISION_ORACLE);

if (target === '') {
  describe.skip('fretboard benchmark (set VISION_DETECTOR to run)', () => {
    it('is skipped', () => undefined);
  });
} else {
  const seq = process.env.VISION_SEQUENCES;
  defineDetectorBenchmark(target, load, {
    quick: process.env.VISION_QUICK === '1',
    tiers: process.env.VISION_TIERS ? (process.env.VISION_TIERS.split(',') as Tier[]) : undefined,
    sequences: seq === undefined ? undefined : seq === '0' ? false : seq === '1' ? true : (seq.split(',') as SequenceName[]),
    negatives: process.env.VISION_NEGATIVES !== undefined ? Number(process.env.VISION_NEGATIVES) : undefined,
    trackingInit: process.env.VISION_TRACK_INIT === 'detect' ? 'detect' : 'truth',
    noCache: process.env.VISION_NO_CACHE === '1',
    seedOffset: process.env.VISION_SEED_OFFSET ? Number(process.env.VISION_SEED_OFFSET) : undefined,
  });
}

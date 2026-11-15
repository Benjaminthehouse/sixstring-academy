/**
 * The smallest module the benchmark runner can load: it exports `createDetector()`. This one cheats
 * (a slightly noisy oracle), so it only demonstrates the plumbing:
 *
 *   VISION_DETECTOR=src/core/vision/testing/example-detector.ts VISION_QUICK=1 \
 *     npx vitest run src/core/vision/testing/detector-benchmark.test.ts
 */
import type { Detector } from '../types';
import { createOracleDetector } from './oracle';

/** Factory the benchmark runner looks for by default. */
export function createDetector(): Detector {
  return createOracleDetector({ name: 'example (noisy oracle)', noisePx: 0.8, usePresetModel: true });
}

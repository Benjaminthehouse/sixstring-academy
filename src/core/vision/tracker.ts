/** Placeholder while the tracker is being written. */
import { createFretboardDetector } from './detector';
import type { Detector } from './types';

/** The production pipeline as the app runs it, behind the `Detector` interface (for the benchmark). */
export function createSessionDetector(): Detector {
  return createFretboardDetector();
}

/**
 * Test tooling for fretboard detectors: the procedural scene renderer, tracking sequences, the
 * benchmark harness and the reference detectors. Everything exported here is pure TypeScript.
 *
 * Node-only helpers are imported from their own files so they never reach a browser bundle:
 *   './debug'               PNG dumps and contact sheets (node:fs, pngjs)
 *   './store'               on-disk cache of rendered frames
 *   './detector-benchmark'  vitest glue: defineDetectorBenchmark()
 */
export * from './benchmark';
export * from './camera';
export * from './oracle';
export * from './render';
export * from './scene';
export * from './sequence';

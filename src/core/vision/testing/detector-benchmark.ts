/**
 * Vitest glue for detector authors (Node only). In your own test file:
 *
 *   import { defineDetectorBenchmark } from '@/core/vision/testing/detector-benchmark';
 *   import { createMyDetector } from './my-detector';
 *   defineDetectorBenchmark('my detector', () => createMyDetector(), { minimums: { easy: { correctRate: 0.9 } } });
 *
 * It runs the benchmark with the on-disk frame cache, prints the table, writes the report and
 * failure PNGs under e2e/out/vision/<slug>/, and asserts any minimums you set.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Detector } from '../types';
import { formatBenchmark, runBenchmark, type BenchmarkOptions, type BenchmarkResult, type FrameEvent, type TierResult } from './benchmark';
import { writeFramePng } from './debug';
import { createNullDetector, createOracleDetector, type OracleOptions } from './oracle';
import type { Tier } from './scene';
import { diskFrameStore } from './store';

/**
 * Load a detector named on the command line: a module path (its `createDetector` export, the export
 * named by `exportName`, or a default-exported Detector), or the built-in references 'oracle'
 * (optionally degraded by JSON `oracleOptions`) and 'null'.
 */
export async function loadDetector(target: string, exportName = 'createDetector', oracleOptions?: string): Promise<Detector> {
  if (target === 'oracle') return createOracleDetector(oracleOptions ? (JSON.parse(oracleOptions) as OracleOptions) : {});
  if (target === 'null') return createNullDetector();
  const mod = (await import(/* @vite-ignore */ pathToFileURL(resolve(target)).href)) as Record<string, unknown>;
  const candidate = mod[exportName] ?? mod.default;
  if (typeof candidate === 'function') return (candidate as () => Detector)();
  if (candidate && typeof (candidate as Detector).detect === 'function') return candidate as Detector;
  throw new Error(`${target} has no export "${exportName}" (a factory returning a Detector) and no default-exported Detector`);
}

/** Thresholds a detector must meet for its benchmark test to pass. All optional. */
export interface BenchmarkMinimums {
  /** Per tier: lower bounds on rates (0..1) of `TierResult`. */
  tiers?: Partial<Record<Tier, Partial<Pick<TierResult, 'detectionRate' | 'lockRate' | 'correctRate' | 'cellAccuracy' | 'numberingRate'>>>>;
  /** Upper bound on the false-positive rate over negative frames. */
  maxFalsePositiveRate?: number;
  /** Lower bound on the mean tracking success (0..1) over the sequences run. */
  trackingSuccess?: number;
  /** Lower bound on the headline detection score (0..100). */
  detectionScore?: number;
}

/** Options of `defineDetectorBenchmark`: everything `runBenchmark` takes, plus reporting. */
export interface DetectorBenchmarkOptions extends BenchmarkOptions {
  minimums?: BenchmarkMinimums;
  /** Where reports and failure images go (default e2e/out/vision/<slug>). */
  outDir?: string;
  /** How many failing frames per group to dump as PNG (default 4; 0 = none). */
  dumpFailures?: number;
  /** Skip the on-disk frame cache and render everything again. */
  noCache?: boolean;
  /** Vitest timeout in ms (default 30 minutes). */
  timeoutMs?: number;
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'detector';
}

/** Run the benchmark on a detector, write the report and failure dumps, and return the result. */
export function runDetectorBenchmark(detector: Detector, options: DetectorBenchmarkOptions = {}): BenchmarkResult {
  const outDir = options.outDir ?? `e2e/out/vision/${slug(detector.name)}`;
  const maxDumps = options.dumpFailures ?? 4;
  const dumped = new Map<string, number>();
  const onFrame = (event: FrameEvent): void => {
    options.onFrame?.(event);
    if (maxDumps <= 0 || event.correct) return;
    const count = dumped.get(event.group) ?? 0;
    if (count >= maxDumps) return;
    dumped.set(event.group, count + 1);
    const why = event.kind === 'negative' ? 'false positive' : !event.detected ? `missed${event.reason ? ` (${event.reason})` : ''}` : `cells ${(event.cellScore * 100).toFixed(0)}% offset ${event.error?.numberingOffset ?? '?'}`;
    writeFramePng(`${outDir}/fail-${event.group}-${event.index}.png`, event.scene.frame, {
      truth: event.scene.truth.pose,
      pose: event.result?.pose ?? null,
      features: event.result?.diagnostics?.features,
      label: `${event.description} | ${why}`,
      scale: event.scene.frame.width <= 640 ? 2 : 1,
    });
  };
  const result = runBenchmark(detector, { ...options, frames: options.frames ?? (options.noCache ? undefined : diskFrameStore()), onFrame });
  const report = formatBenchmark(result);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/benchmark.txt`, `${report}\n`);
  writeFileSync(`${outDir}/benchmark.json`, JSON.stringify(result, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v), 1));
  // Vitest hides console output of passing tests by default; write straight to the terminal.
  process.stdout.write(`\n${report}\n(report and failure images: ${outDir}/)\n\n`);
  return result;
}

/** Assert the minimums of a benchmark result with vitest's `expect`. */
export function expectMinimums(result: BenchmarkResult, minimums: BenchmarkMinimums): void {
  for (const [tier, mins] of Object.entries(minimums.tiers ?? {})) {
    const row = result.tiers.find((t) => t.tier === tier);
    if (!row || !mins) continue;
    for (const [key, min] of Object.entries(mins)) {
      expect(row[key as keyof typeof mins], `${tier}.${key}`).toBeGreaterThanOrEqual(min as number);
    }
  }
  if (minimums.maxFalsePositiveRate !== undefined && result.negatives) expect(result.negatives.falsePositiveRate, 'falsePositiveRate').toBeLessThanOrEqual(minimums.maxFalsePositiveRate);
  if (minimums.trackingSuccess !== undefined && result.sequences.length > 0) expect(result.trackingScore / 100, 'trackingSuccess').toBeGreaterThanOrEqual(minimums.trackingSuccess);
  if (minimums.detectionScore !== undefined) expect(result.detectionScore, 'detectionScore').toBeGreaterThanOrEqual(minimums.detectionScore);
}

/** Define a vitest suite that benchmarks a detector. `factory` may be async (e.g. a dynamic import). */
export function defineDetectorBenchmark(name: string, factory: () => Detector | Promise<Detector>, options: DetectorBenchmarkOptions = {}): void {
  describe(`fretboard benchmark: ${name}`, () => {
    it('runs the benchmark', async () => {
      const detector = await factory();
      const result = runDetectorBenchmark(detector, options);
      expect(result.frames.length).toBeGreaterThan(0);
      if (options.minimums) expectMinimums(result, options.minimums);
    }, options.timeoutMs ?? 30 * 60_000);
  });
}

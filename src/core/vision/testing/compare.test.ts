/**
 * Side-by-side evaluation of fretboard detectors on several scene sets (Node only, skipped unless
 * asked for). From `guitar/`:
 *
 *   CMP_DETECTORS=fretboard CMP_OFFSETS=0,1000,3000 npx vitest run src/core/vision/testing/compare.test.ts
 *
 * Switches:
 *   CMP_DETECTORS  comma list of: fretboard (the production detector), session (the same behind
 *                  FretboardTracker, as the app runs it), oracle, null
 *   CMP_OFFSETS    seed offsets (0 = the standard scenes; anything else is a held-out set)
 *   CMP_TIERS      tiers to run (default: the four standard tiers; add `markers`), `0` = none
 *   CMP_SEQ        `0` = no sequences, or a comma list of sequence names
 *   CMP_NEG        number of negative frames (default 24; 0 = none)
 *   CMP_INIT       `detect` = sequences start with detect() instead of the true pose
 *   CMP_TAG        suffix for the output directory
 *
 * Every run writes its report, JSON and failure PNGs to e2e/out/vision/compare/<detector>-<offset>[-tag]/
 * and one line per run to e2e/out/vision/compare/summary.jsonl; the combined table is printed at the end.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAlignDetector } from '../align/detector';
import { createFretboardDetector } from '../detector';
import { createLineDetector } from '../lines/detector';
import type { Detector } from '../types';
import type { BenchmarkResult } from './benchmark';
import { runDetectorBenchmark } from './detector-benchmark';
import { createNullDetector, createOracleDetector } from './oracle';
import type { Tier } from './scene';
import type { SequenceName } from './sequence';

const FACTORIES: Record<string, () => Detector> = {
  fretboard: () => createFretboardDetector({ debug: process.env.CMP_DEBUG === '1' }),
  lines: () => createLineDetector({ debug: process.env.CMP_DEBUG === '1' }),
  align: () => createAlignDetector({ debugFeatures: process.env.CMP_DEBUG === '1' }),
  oracle: () => createOracleDetector(),
  null: () => createNullDetector(),
};

const names = (process.env.CMP_DETECTORS ?? '').split(',').filter((n) => n !== '');
const offsets = (process.env.CMP_OFFSETS ?? '0').split(',').map(Number);
const tag = process.env.CMP_TAG ? `-${process.env.CMP_TAG}` : '';
const OUT = 'e2e/out/vision/compare';

function pct(v: number): string {
  return Number.isFinite(v) ? `${Math.round(v * 100)}%` : '-';
}

/** One line of the combined table. */
export function summaryLine(name: string, offset: number, r: BenchmarkResult): string {
  const tiers = r.tiers.map((t) => `${t.tier} ${pct(t.correctRate)}/${pct(t.lockRate)}/${pct(t.numberingRate)}/cw${pct(t.confidentlyWrong)}`).join('  ');
  const neg = r.negatives ? `FP ${r.negatives.falsePositives}/${r.negatives.frames}` : '';
  const seq = r.sequences.map((s) => `${s.name} ${pct(s.trackingSuccess)}(l${s.lostFrames} d${s.driftFrames} j${Number.isFinite(s.jitterPx) ? s.jitterPx.toFixed(2) : '-'})`).join(' ');
  return `${name.padEnd(10)} @${String(offset).padEnd(5)} det ${r.detectionScore.toFixed(1).padStart(5)} trk ${Number.isFinite(r.trackingScore) ? r.trackingScore.toFixed(1).padStart(5) : '    -'} | ${tiers} | ${neg} | ${seq}`;
}

if (names.length === 0) {
  describe.skip('fretboard detector comparison (set CMP_DETECTORS to run)', () => {
    it('is skipped', () => undefined);
  });
} else {
  describe('fretboard detector comparison', () => {
    it('runs every detector on every scene set', () => {
      const lines: string[] = [];
      const seq = process.env.CMP_SEQ;
      const tiers = process.env.CMP_TIERS;
      mkdirSync(OUT, { recursive: true });
      for (const offset of offsets) {
        for (const name of names) {
          const factory = FACTORIES[name];
          expect(factory, `unknown detector "${name}"`).toBeTypeOf('function');
          const result = runDetectorBenchmark(factory(), {
            seedOffset: offset,
            tiers: tiers === undefined ? undefined : tiers === '0' ? [] : (tiers.split(',') as Tier[]),
            sequences: seq === undefined ? undefined : seq === '0' ? false : (seq.split(',') as SequenceName[]),
            negatives: process.env.CMP_NEG !== undefined ? Number(process.env.CMP_NEG) : undefined,
            trackingInit: process.env.CMP_INIT === 'detect' ? 'detect' : 'truth',
            outDir: `${OUT}/${name}-${offset}${tag}`,
            dumpFailures: process.env.CMP_DUMPS !== undefined ? Number(process.env.CMP_DUMPS) : 24,
          });
          const line = summaryLine(name, offset, result);
          lines.push(line);
          appendFileSync(`${OUT}/summary.jsonl`, `${JSON.stringify({ name, offset, tag, init: process.env.CMP_INIT ?? 'truth', line, detection: result.detectionScore, tracking: result.trackingScore, tiers: result.tiers, negatives: result.negatives, sequences: result.sequences, calibrationMs: result.calibrationMs })}\n`);
        }
      }
      process.stdout.write(`\n${lines.join('\n')}\n\n`);
    }, 4 * 60 * 60_000);
  });
}

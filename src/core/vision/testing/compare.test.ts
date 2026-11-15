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
 *   CMP_TIMING     instead of the benchmark: time detect (8 scenes per tier + 8 negatives, 640x360 only)
 *                  and track (two sequences) this many times each and report the best run per frame
 *   CMP_LOCKS      instead of the benchmark: run FretboardTracker for this many frames on each of the
 *                  CMP_NEG negative scenes of every offset and count false candidates and false locks
 *
 * Every run writes its report, JSON and failure PNGs to e2e/out/vision/compare/<detector>-<offset>[-tag]/
 * and one line per run to e2e/out/vision/compare/summary.jsonl; the combined table is printed at the end.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAlignDetector } from '../align/detector';
import { createFretboardDetector } from '../detector';
import { createLineDetector } from '../lines/detector';
import { FretboardTracker, createSessionDetector } from '../tracker';
import type { Detector, FretboardPose } from '../types';
import type { BenchmarkResult } from './benchmark';
import { createRenderCache, renderScene } from './render';
import { sampleNegativeScene, sampleScene } from './scene';
import { buildSequence } from './sequence';
import { percentile } from '../geometry';
import { measureCalibration } from './benchmark';
import { diskFrameStore } from './store';
import { runDetectorBenchmark } from './detector-benchmark';
import { createNullDetector, createOracleDetector } from './oracle';
import type { Tier } from './scene';
import type { SequenceName } from './sequence';

const FACTORIES: Record<string, () => Detector> = {
  fretboard: () => createFretboardDetector({ debug: process.env.CMP_DEBUG === '1' }),
  session: () => createSessionDetector(),
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

if (process.env.CMP_TIMING) {
  describe('runtime of the detectors (best of several runs per frame)', () => {
    it('times detect and track', () => {
      const repeats = Math.max(1, Number(process.env.CMP_TIMING));
      const cache = createRenderCache(diskFrameStore());
      const lines: string[] = [`calibration (3x3 Sobel, 640x360): ${measureCalibration().toFixed(2)} ms`];
      const fmt = (v: number[]): string => `median ${percentile(v, 0.5).toFixed(1)} p95 ${percentile(v, 0.95).toFixed(1)} max ${Math.max(...v).toFixed(1)} ms`;
      for (const name of names.length > 0 ? names : ['fretboard']) {
        const groups: [string, ReturnType<typeof sampleScene>[]][] = [];
        for (const tier of ['easy', 'medium', 'hard', 'extreme'] as Tier[]) {
          const specs: ReturnType<typeof sampleScene>[] = [];
          for (let seed = 0; specs.length < 8 && seed < 200; seed++) {
            const spec = sampleScene(tier, (offsets[0] ?? 0) + seed);
            if (spec.width === 640 && spec.height === 360) specs.push(spec);
          }
          groups.push([tier, specs]);
        }
        groups.push(['negative', Array.from({ length: 8 }, (_, i) => sampleNegativeScene((offsets[0] ?? 0) + i))]);
        for (const [group, specs] of groups) {
          const best: number[] = [];
          // One instance, warmed up: its scratch buffers are allocated once, as in the app.
          const det = FACTORIES[name]();
          det.detect(renderScene(specs[0], cache).frame);
          for (const spec of specs) {
            const scene = renderScene(spec, cache);
            let min = Infinity;
            for (let r = 0; r < repeats; r++) {
              det.reset?.();
              const t0 = performance.now();
              det.detect(scene.frame, scene.truth.hints);
              min = Math.min(min, performance.now() - t0);
            }
            best.push(min);
          }
          lines.push(`${name} detect ${group.padEnd(8)} ${fmt(best)}`);
        }
        for (const seqName of ['sway', 'clutter'] as const) {
          const seq = buildSequence(seqName, { seedOffset: offsets[0] ?? 0 });
          const scenes = seq.frames.map((f) => renderScene(f, cache));
          const per: number[] = scenes.map(() => Infinity);
          for (let r = 0; r < repeats; r++) {
            const det = FACTORIES[name]();
            let pose: FretboardPose | null = scenes[0].truth.pose ? { ...scenes[0].truth.pose, numbering: 'user' } : null;
            for (let i = 1; i < scenes.length && pose; i++) {
              const t0 = performance.now();
              const out = det.track(scenes[i].frame, pose, { ...scenes[i].truth.hints, timeMs: (i * 1000) / seq.fps });
              per[i] = Math.min(per[i], performance.now() - t0);
              pose = out.pose ?? det.detect(scenes[i].frame, { ...scenes[i].truth.hints, previousPose: pose }).pose;
            }
          }
          lines.push(`${name} track  ${seqName.padEnd(8)} ${fmt(per.filter((v) => Number.isFinite(v)))}`);
        }
      }
      appendFileSync(`${OUT}/timing.txt`, `${lines.join('\n')}\n`);
      process.stdout.write(`\n${lines.join('\n')}\n\n`);
    }, 4 * 60 * 60_000);
  });
} else if (process.env.CMP_LOCKS) {
  describe('false locks of the tracker on scenes without a guitar', () => {
    it('counts frames shown as a board and frames locked', () => {
      const frames = Number(process.env.CMP_LOCKS);
      const count = Number(process.env.CMP_NEG ?? 24);
      const cache = createRenderCache(diskFrameStore());
      const lines: string[] = [];
      for (const offset of offsets) {
        let shown = 0;
        let locked = 0;
        let scenes = 0;
        const fooled: string[] = [];
        for (let seed = 0; seed < count; seed++) {
          const scene = renderScene(sampleNegativeScene(offset + seed), cache);
          const tracker = new FretboardTracker({ ...scene.truth.hints });
          let worst = 'searching';
          for (let i = 0; i < frames; i++) {
            const u = tracker.update(scene.frame, i * 33);
            if (u.state === 'candidate' || u.state === 'locked') shown++;
            if (u.state === 'locked') locked++;
            if (u.state === 'locked' || (u.state === 'candidate' && worst !== 'locked')) worst = u.state;
          }
          scenes++;
          if (worst !== 'searching') fooled.push(`${scene.truth.description} -> ${worst}`);
        }
        lines.push(`negatives @${offset}: ${scenes} scenes x ${frames} frames | shown ${shown} | locked ${locked} | ${fooled.join('; ')}`);
      }
      appendFileSync(`${OUT}/locks.txt`, `${lines.join('\n')}\n`);
      process.stdout.write(`\n${lines.join('\n')}\n\n`);
    }, 4 * 60 * 60_000);
  });
} else if (names.length === 0) {
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

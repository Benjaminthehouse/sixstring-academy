/**
 * Debug dumps on demand (skipped in a normal test run). From `guitar/`:
 *
 *   VISION_DUMP=sheets npx vitest run src/core/vision/testing/dump.test.ts
 *       -> e2e/out/vision/sheet-<tier>.png (first 9 scenes of each tier) and sheet-negative.png
 *   VISION_DUMP=frames VISION_TIER=hard VISION_SEEDS=0,3,7 npx vitest run src/core/vision/testing/dump.test.ts
 *       -> e2e/out/vision/<tier>-<seed>.png and <tier>-<seed>-truth.png (2x, ground-truth overlay)
 *       add VISION_DETECTOR=path/to/detector.ts (as for the benchmark) to also get <tier>-<seed>-detect.png:
 *       your pose in yellow over the truth in cyan, with your diagnostics features, and the errors printed
 *   VISION_DUMP=sequence VISION_SEQUENCE=occlusion npx vitest run src/core/vision/testing/dump.test.ts
 *       -> e2e/out/vision/seq-<name>.png (every 4th frame)
 */
import { describe, expect, it } from 'vitest';
import { comparePoses } from '../geometry';
import { writeContactSheet, writeFramePng, type SheetCell } from './debug';
import { loadDetector } from './detector-benchmark';
import { createRenderCache, renderProfile, renderScene, resetRenderProfile } from './render';
import { sampleNegativeScene, sampleScene, type Tier } from './scene';
import { SEQUENCE_NAMES, buildSequence, type SequenceName } from './sequence';

const mode = process.env.VISION_DUMP ?? '';
const OUT = 'e2e/out/vision';
const TIERS: Tier[] = ['easy', 'medium', 'hard', 'extreme', 'markers'];

describe.skipIf(mode === '')('vision debug dumps', () => {
  it.skipIf(mode !== 'sheets')('writes a contact sheet per tier', () => {
    const offset = Number(process.env.VISION_OFFSET ?? 0);
    for (const tier of TIERS) {
      const cells: SheetCell[] = [];
      let ms = 0;
      resetRenderProfile();
      for (let seed = offset; seed < offset + 9; seed++) {
        const t0 = performance.now();
        const scene = renderScene(sampleScene(tier, seed));
        ms += performance.now() - t0;
        cells.push({ frame: scene.frame, label: scene.truth.description });
      }
      writeContactSheet(`${OUT}/sheet-${tier}.png`, cells, { columns: 3, cellWidth: 640 });
      process.stdout.write(`${tier}: ${(ms / 9).toFixed(1)} ms per frame | ${Object.entries(renderProfile).map(([k, v]) => `${k} ${(v / 9).toFixed(1)}`).join(', ')}\n`);
    }
    const negatives: SheetCell[] = [];
    for (let seed = offset; seed < offset + 12; seed++) {
      const scene = renderScene(sampleNegativeScene(seed));
      negatives.push({ frame: scene.frame, label: scene.truth.description });
    }
    writeContactSheet(`${OUT}/sheet-negative.png`, negatives, { columns: 3, cellWidth: 640 });
    expect(negatives).toHaveLength(12);
  }, 300_000);

  it.skipIf(mode !== 'frames')('writes single frames with and without the truth overlay', async () => {
    const tier = (process.env.VISION_TIER ?? 'medium') as Tier | 'negative';
    const seeds = (process.env.VISION_SEEDS ?? '0').split(',').map(Number);
    const detector = process.env.VISION_DETECTOR ? await loadDetector(process.env.VISION_DETECTOR, process.env.VISION_EXPORT, process.env.VISION_ORACLE) : null;
    for (const seed of seeds) {
      const scene = renderScene(tier === 'negative' ? sampleNegativeScene(seed) : sampleScene(tier, seed));
      writeFramePng(`${OUT}/${tier}-${seed}.png`, scene.frame);
      writeFramePng(`${OUT}/${tier}-${seed}-truth.png`, scene.frame, { pose: scene.truth.pose, scale: 2, label: scene.truth.description });
      process.stdout.write(`${scene.truth.description} | visible ${JSON.stringify(scene.truth.pose?.visibleFrets)} nut ${scene.truth.nutVisible} numbering ${scene.truth.numberingObservable} residual ${scene.truth.distortionResidualPx.toFixed(2)}\n`);
      if (!detector) continue;
      detector.reset?.();
      const out = detector.detect(scene.frame, scene.truth.hints);
      const err = out.pose && scene.truth.pose ? comparePoses(out.pose, scene.truth.pose) : null;
      const verdict = !out.pose ? `no pose (${out.diagnostics.reason ?? 'no reason given'})` : err ? `cells ${(err.cellAccuracy * 100).toFixed(0)}% fret ${err.fretErrorAligned.median.toFixed(3)} string ${err.stringError.median.toFixed(3)} offset ${err.numberingOffset}` : 'pose on a frame without guitar';
      writeFramePng(`${OUT}/${tier}-${seed}-detect.png`, scene.frame, { pose: out.pose, truth: scene.truth.pose, features: out.diagnostics.features, scale: 2, label: `${detector.name}: ${verdict}` });
      process.stdout.write(`  ${detector.name}: ${verdict} | ${Object.entries(out.diagnostics.timings).map(([k, v]) => `${k} ${v.toFixed(1)}ms`).join(' ')}\n`);
    }
    expect(seeds.length).toBeGreaterThan(0);
  }, 300_000);

  it.skipIf(mode !== 'sequence')('writes a strip of sequence frames', () => {
    const names = (process.env.VISION_SEQUENCE ? [process.env.VISION_SEQUENCE] : [...SEQUENCE_NAMES]) as SequenceName[];
    for (const name of names) {
      const seq = buildSequence(name);
      const cache = createRenderCache();
      const cells: SheetCell[] = [];
      const step = Number(process.env.VISION_STEP ?? 4);
      let ms = 0;
      seq.frames.forEach((spec, i) => {
        const t0 = performance.now();
        const scene = renderScene(spec, cache);
        ms += performance.now() - t0;
        if (i % step === 0) cells.push({ frame: scene.frame, label: `${name} ${i}${scene.truth.occluded ? ' OCCLUDED' : ''}`, overlay: { truth: scene.truth.pose } });
      });
      writeContactSheet(`${OUT}/seq-${name}.png`, cells, { columns: 4, cellWidth: 480 });
      process.stdout.write(`${name}: ${seq.frames.length} frames, ${(ms / seq.frames.length).toFixed(1)} ms per frame\n`);
    }
    expect(names.length).toBeGreaterThan(0);
  }, 300_000);
});

/**
 * Developer scratch pad (skipped in a normal run). From `guitar/`:
 *   LINES_DEV=lines LINES_TIER=medium LINES_SEEDS=0,1 npx vitest run src/core/vision/lines/dev.test.ts
 * Writes PNGs to e2e/out/vision/lines-dev/.
 */
import { describe, expect, it } from 'vitest';
import type { DiagnosticFeature, Point } from '../types';
import { writeFramePng } from '../testing/debug';
import { createRenderCache, renderScene } from '../testing/render';
import { sampleNegativeScene, sampleScene, type Tier } from '../testing/scene';
import { diskFrameStore } from '../testing/store';
import { clusterAxes, findBands } from './band';
import { analyseBand } from './comb';
import { fitFretPattern } from './fretfit';
import { detectLines, lineEndpoints } from './hough';
import { smooth3, sobel, toWorkingGray, workingFactor } from './image';

const mode = process.env.LINES_DEV ?? '';
const OUT = 'e2e/out/vision/lines-dev';
const tier = (process.env.LINES_TIER ?? 'medium') as Tier | 'negative';
const seeds = (process.env.LINES_SEEDS ?? '0').split(',').map(Number);

describe.skipIf(mode === '')('lines dev', () => {
  it.skipIf(mode !== 'lines')('dumps Hough lines', () => {
    const cache = createRenderCache(diskFrameStore());
    for (const seed of seeds) {
      const scene = renderScene(tier === 'negative' ? sampleNegativeScene(seed) : sampleScene(tier, seed), cache);
      const f = workingFactor(scene.frame.width);
      const t0 = performance.now();
      const gray = smooth3(toWorkingGray(scene.frame, f));
      const grad = sobel(gray);
      const t1 = performance.now();
      const { lines, edges } = detectLines(grad);
      const t2 = performance.now();
      const features: DiagnosticFeature[] = lines.map((l, i) => {
        const [a, b] = lineEndpoints(l);
        return { kind: i < 12 ? 'strong' : 'line', points: [{ x: a.x * f, y: a.y * f }, { x: b.x * f, y: b.y * f }] };
      });
      writeFramePng(`${OUT}/${tier}-${seed}-lines.png`, scene.frame, { features, scale: scene.frame.width <= 640 ? 2 : 1, label: `${scene.truth.description} | ${lines.length} lines ${edges.count} edges thr ${edges.threshold.toFixed(1)}` });
      process.stdout.write(`${tier}#${seed}: gray+sobel ${(t1 - t0).toFixed(1)} ms, hough ${(t2 - t1).toFixed(1)} ms, ${edges.count} edges (thr ${edges.threshold.toFixed(2)}), ${lines.length} lines\n`);
    }
    expect(seeds.length).toBeGreaterThan(0);
  }, 300_000);
  it.skipIf(mode !== 'bands')('dumps axis candidates and bands', () => {
    const cache = createRenderCache(diskFrameStore());
    for (const seed of seeds) {
      const scene = renderScene(tier === 'negative' ? sampleNegativeScene(seed) : sampleScene(tier, seed), cache);
      const f = workingFactor(scene.frame.width);
      const gray = smooth3(toWorkingGray(scene.frame, f));
      const grad = sobel(gray);
      const { lines } = detectLines(grad);
      const t0 = performance.now();
      const axes = clusterAxes(lines, 7, 0.25 * gray.height, 8);
      const features: DiagnosticFeature[] = [];
      const up = (p: Point): Point => ({ x: p.x * f, y: p.y * f });
      let n = 0;
      axes.forEach((axis, ai) => {
        const diag: Point[][] = [];
        const bands = findBands(gray, axis, {}, diag);
        const px = axis.nx * axis.rho;
        const py = axis.ny * axis.rho;
        features.push({ kind: 'axis', points: [up({ x: px + axis.ny * 1000, y: py - axis.nx * 1000 }), up({ x: px - axis.ny * 1000, y: py + axis.nx * 1000 })], label: `${ai}` });
        for (const seg of diag) features.push({ kind: 'trace', points: seg.map(up) });
        for (const b of bands) {
          features.push({ kind: 'band', points: [b.a0, b.b0, b.b1, b.a1].map(up), closed: true, label: `a${ai} f${b.frets} s${b.strength.toFixed(0)} p${b.polarity}` });
          n++;
        }
      });
      const t1 = performance.now();
      writeFramePng(`${OUT}/${tier}-${seed}-bands.png`, scene.frame, { features, truth: scene.truth.pose, scale: scene.frame.width <= 640 ? 2 : 1, label: `${scene.truth.description} | ${axes.length} axes ${n} bands` });
      process.stdout.write(`${tier}#${seed}: ${axes.length} axes, ${n} bands, ${(t1 - t0).toFixed(1)} ms\n`);
    }
    expect(seeds.length).toBeGreaterThan(0);
  }, 300_000);
  it.skipIf(mode !== 'comb')('dumps fret candidates of the best band with their relative indices', () => {
    const cache = createRenderCache(diskFrameStore());
    for (const seed of seeds) {
      const scene = renderScene(tier === 'negative' ? sampleNegativeScene(seed) : sampleScene(tier, seed), cache);
      const f = workingFactor(scene.frame.width);
      const gray = smooth3(toWorkingGray(scene.frame, f));
      const grad = sobel(gray);
      const { lines } = detectLines(grad);
      const axes = clusterAxes(lines, 7, 0.25 * gray.height, 8);
      const up = (p: Point): Point => ({ x: p.x * f, y: p.y * f });
      const t0 = performance.now();
      const bands = axes.flatMap((axis) => findBands(gray, axis));
      bands.sort((a, b) => b.score - a.score);
      const t1 = performance.now();
      const features: DiagnosticFeature[] = [];
      let text = '';
      for (const band of bands.slice(0, 3)) {
        const comb = analyseBand(gray, band);
        if (!comb) continue;
        const fit = fitFretPattern(comb.frets.map((c) => ({ u: c.u, weight: c.weight })), { direction: 0 });
        features.push({ kind: 'band', points: [comb.band.a0, comb.band.b0, comb.band.b1, comb.band.a1].map(up), closed: true });
        comb.frets.forEach((c, i) => features.push({ kind: fit && fit.indices[i] !== null ? 'fret' : 'spurious', points: [up(c.p0), up(c.p1)], label: fit && fit.indices[i] !== null ? String(fit.indices[i]) : `x${c.coverage.toFixed(1)}` }));
        text += ` | ${comb.frets.length} cands, fit ${fit ? `${fit.inliers} in, ${fit.missing} miss, rms ${fit.rms.toFixed(3)}, dir ${fit.direction}, depth ${fit.depthRatio.toFixed(2)}, score ${fit.score.toFixed(1)}` : 'none'}`;
      }
      const t2 = performance.now();
      writeFramePng(`${OUT}/${tier}-${seed}-comb.png`, scene.frame, { features, truth: scene.truth.pose, scale: scene.frame.width <= 640 ? 2 : 1, label: `${scene.truth.description}` });
      process.stdout.write(`${tier}#${seed}: bands ${(t1 - t0).toFixed(1)} ms, comb+fit ${(t2 - t1).toFixed(1)} ms${text}\n`);
    }
    expect(seeds.length).toBeGreaterThan(0);
  }, 300_000);
});

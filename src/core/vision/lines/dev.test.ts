/**
 * Developer scratch pad (skipped in a normal run). From `guitar/`:
 *   LINES_DEV=lines LINES_TIER=medium LINES_SEEDS=0,1 npx vitest run src/core/vision/lines/dev.test.ts
 * Writes PNGs to e2e/out/vision/lines-dev/.
 */
import { describe, expect, it } from 'vitest';
import type { DetectionResult, DiagnosticFeature, FretboardPose, Point } from '../types';
import { writeFramePng } from '../testing/debug';
import { createRenderCache, renderScene } from '../testing/render';
import { sampleNegativeScene, sampleScene, type SceneSpec, type Tier } from '../testing/scene';
import { buildSequence, type SequenceName } from '../testing/sequence';
import { diskFrameStore } from '../testing/store';
import { clusterAxes, findBands } from './band';
import { analyseBand } from './comb';
import { createLineDetector } from './detector';
import { classifyCells, resolveNumbering } from './numbering';
import { refinePose } from './refine';
import { comparePoses } from '../geometry';
import { fitFretPattern } from './fretfit';
import { detectLines, lineEndpoints } from './hough';
import { smooth3, sobel, toWorkingGray, workingFactor } from './image';

const mode = process.env.LINES_DEV ?? '';
const OUT = 'e2e/out/vision/lines-dev';
const tier = (process.env.LINES_TIER ?? 'medium') as Tier | 'negative';
const seeds = (process.env.LINES_SEEDS ?? '0').split(',').map(Number);
/** LINES_SEQ=jerk makes the "seeds" frame indices of that tracking sequence. */
const seedOffset = Number(process.env.LINES_OFFSET ?? 0);
const sequence = process.env.LINES_SEQ ? buildSequence(process.env.LINES_SEQ as SequenceName, { seedOffset }) : null;
const specOf = (seed: number): SceneSpec => (sequence ? sequence.frames[seed] : tier === 'negative' ? sampleNegativeScene(seed + seedOffset) : sampleScene(tier, seed + seedOffset));

describe.skipIf(mode === '')('lines dev', () => {
  it.skipIf(mode !== 'lines')('dumps Hough lines', () => {
    const cache = createRenderCache(diskFrameStore());
    for (const seed of seeds) {
      const scene = renderScene(specOf(seed), cache);
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
      const scene = renderScene(specOf(seed), cache);
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
      const scene = renderScene(specOf(seed), cache);
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
  it.skipIf(mode !== 'evidence')('prints numbering evidence under the detected pose', () => {
    const cache = createRenderCache(diskFrameStore());
    const detector = createLineDetector({ debug: true });
    for (const seed of seeds) {
      const scene = renderScene(specOf(seed), cache);
      detector.reset?.();
      const out = detector.detect(scene.frame, scene.truth.hints);
      process.stdout.write(`\n${scene.truth.description} | nut ${scene.truth.nutVisible} hand ${JSON.stringify(scene.truth.handFrets)}\n`);
      writeFramePng(`${OUT}/${sequence ? sequence.name : tier}-${seed}-evidence.png`, scene.frame, { pose: out.pose, truth: scene.truth.pose, features: out.diagnostics.features, scale: scene.frame.width <= 640 ? 2 : 1, label: scene.truth.description });
      if (!out.pose) {
        process.stdout.write(`  no pose: ${out.diagnostics.reason}\n`);
        continue;
      }
      const err = scene.truth.pose ? comparePoses(out.pose, scene.truth.pose) : null;
      process.stdout.write(`  numbering ${out.pose.numbering} conf ${out.pose.numberingConfidence.toFixed(2)} offset ${err?.numberingOffset} cells ${err?.cellAccuracy.toFixed(2)} stats ${JSON.stringify(out.diagnostics.stats)}\n`);
      const f = workingFactor(scene.frame.width);
      const gray = smooth3(toWorkingGray(scene.frame, f));
      const H = out.pose.H.map((v, i) => (i < 6 ? v / f : v)) as unknown as typeof out.pose.H;
      const r = refinePose(gray, H, out.pose.model, { evidence: true, windows: [0.12] });
      if (!r || !r.frets || !r.cells) continue;
      const off = err?.numberingOffset ?? 0;
      const kinds = classifyCells(r.cells, r.frets, { fretCount: out.pose.model.fretCount, polarity: r.polarity, strength: r.strength });
      process.stdout.write(`  strength ${r.strength.toFixed(1)} polarity ${r.polarity}\n`);
      for (const fr of r.frets) {
        const c = r.cells.find((q) => q.fret === fr.fret);
        process.stdout.write(`  est ${String(fr.fret).padStart(3)} true ${String(fr.fret - off).padStart(3)} ${fr.inFrame ? 'in ' : 'out'} bands ${fr.bands} str ${fr.strength.toFixed(2)} w ${fr.widthMm.toFixed(1)} bar ${fr.bar.toFixed(2)}${c ? ` | cell ${c.inFrame ? 'in ' : 'out'} centre ${c.centre.toFixed(0)} pair ${c.pair.toFixed(0)} board ${c.board.toFixed(0)} mean ${c.mean.toFixed(0)} -> ${kinds.get(fr.fret)}` : ''}\n`);
      }
      const num = resolveNumbering(r.frets, r.cells, { fretCount: out.pose.model.fretCount, polarity: r.polarity, strength: r.strength });
      process.stdout.write(`  re-resolved: ${JSON.stringify(num)}\n`);
    }
    expect(seeds.length).toBeGreaterThan(0);
  }, 300_000);
  it.skipIf(mode !== 'stats')('prints detection statistics for a whole tier (positives and negatives)', () => {
    const cache = createRenderCache(diskFrameStore());
    const detector = createLineDetector({ minSupport: 0.35, minStringSupport: 0.25, minStringsLooked: 12, minJointSupport: 0.1, minConfidence: 0 });
    const count = Number(process.env.LINES_COUNT ?? 24);
    for (let seed = 0; seed < count; seed++) {
      const scene = renderScene(specOf(seed), cache);
      detector.reset?.();
      const out = detector.detect(scene.frame, scene.truth.hints);
      const err = out.pose && scene.truth.pose ? comparePoses(out.pose, scene.truth.pose) : null;
      const st = out.diagnostics.stats ?? {};
      const fmt = (v: number | undefined): string => (v === undefined ? '-' : v.toFixed(2));
      process.stdout.write(
        `${tier}#${String(seed).padEnd(2)} ${out.pose ? 'POSE' : 'none'} ${err ? `cells ${err.cellAccuracyAligned.toFixed(2)} fret ${err.fretErrorAligned.median.toFixed(2)} str ${err.stringError.median.toFixed(2)}` : ''} conf ${fmt(out.pose?.confidence)} sup ${fmt(st.support)} anti ${fmt(st.antiSupport)} frets ${st.fretsFound ?? '-'} edge ${fmt(st.edgeSupport)} eerr ${fmt(st.edgeError)} eshift ${Number.isFinite(st.edgeShift) ? st.edgeShift.toFixed(2) : 'nan'} strg ${fmt(st.stringSupport)}/${st.stringsLooked ?? '-'} res ${fmt(st.residualPx)} ${out.diagnostics.reason ?? ''} | ${scene.truth.description.slice(0, 60)}\n`,
      );
    }
    expect(count).toBeGreaterThan(0);
  }, 300_000);
  it.skipIf(mode !== 'seqtrace')('replays a tracking sequence with the canonical loop and prints what happened', () => {
    if (!sequence) throw new Error('set LINES_SEQ');
    const cache = createRenderCache(diskFrameStore());
    const detector = createLineDetector();
    let pose: FretboardPose | null = null;
    let lastGood: FretboardPose | null = null;
    const from = Number(process.env.LINES_FROM ?? 0);
    const to = Number(process.env.LINES_TO ?? sequence.frames.length - 1);
    sequence.frames.forEach((spec, i) => {
      const scene = renderScene(spec, cache);
      const hints = { ...scene.truth.hints, timeMs: (i * 1000) / sequence.fps };
      let how = 'init';
      let out: DetectionResult | null = null;
      if (i === 0 && scene.truth.pose) {
        pose = { ...scene.truth.pose, numbering: 'user' };
      } else if (pose) {
        how = 'track';
        out = detector.track(scene.frame, pose, hints);
        if (!out.pose) {
          const first = out;
          how = `track(${first.diagnostics.reason})+detect`;
          out = detector.detect(scene.frame, { ...hints, previousPose: pose });
        }
        pose = out.pose;
      } else {
        how = 'detect';
        out = detector.detect(scene.frame, lastGood ? { ...hints, previousPose: lastGood } : hints);
        pose = out.pose;
      }
      if (pose) lastGood = pose;
      if (i < from || i > to) return;
      const err = pose && scene.truth.pose ? comparePoses(pose, scene.truth.pose) : null;
      process.stdout.write(`${String(i).padStart(3)} ${how.padEnd(34)} ${pose ? `cells ${err?.cellAccuracy.toFixed(2)} off ${err?.numberingOffset} fret ${err?.fretErrorAligned.median.toFixed(2)} str ${err?.stringError.median.toFixed(2)} num ${pose.numbering}/${pose.numberingConfidence.toFixed(2)}` : `none (${out?.diagnostics.reason})`} ${scene.truth.occluded ? 'OCCLUDED ' : ''}${JSON.stringify(out?.diagnostics.stats ?? {})}\n`);
    });
    expect(sequence.frames.length).toBeGreaterThan(0);
  }, 300_000);
});

/**
 * Debug dumps for the alignment detector (skipped in a normal test run). From `guitar/`:
 *
 *   ALIGN_DEBUG=axis ALIGN_TIER=hard ALIGN_SEEDS=0,1,2 npx vitest run src/core/vision/align/debug.test.ts
 *
 * PNGs land in e2e/out/vision/align/. Node only.
 */
import { describe, expect, it } from 'vitest';
import type { DetectionResult, DiagnosticFeature, Frame } from '../types';
import { measureCalibration } from '../testing/benchmark';
import { writeFramePng } from '../testing/debug';
import { createRenderCache, renderScene } from '../testing/render';
import { sampleNegativeScene, sampleScene, type Tier } from '../testing/scene';
import { buildSequence, type SequenceName } from '../testing/sequence';
import { diskFrameStore } from '../testing/store';
import { computeRidgeField, findAxisCandidates, type RidgeField } from './axis';
import { comparePoses, makePose, neckModel } from '../geometry';
import type { FretboardPose } from '../types';
import { AxisSearch } from './axis';
import { measureBoard, measurementHomography } from './hypothesis';
import { createAlignDetector } from './detector';
import { SIGMA_FINE, buildPyramid, gaussianBlur, toWorkingGray } from './image';

const mode = process.env.ALIGN_DEBUG ?? '';
const OUT = 'e2e/out/vision/align';
const tier = (process.env.ALIGN_TIER ?? 'medium') as Tier | 'negative';
const seedOffset = Number(process.env.ALIGN_OFFSET ?? 0);
const seeds = (process.env.ALIGN_SEEDS ?? '0').split(',').map((v) => Number(v) + seedOffset);

function ridgeFrame(field: RidgeField): Frame {
  const data = new Uint8ClampedArray(field.width * field.height * 4);
  for (let i = 0; i < field.strength.length; i++) {
    const v = field.strength[i];
    const a = Math.min(255, (Math.abs(v) / (field.threshold * 3)) * 255);
    // Hue by orientation, so parallel ridges share a colour; dark ridges are dimmer.
    const h = (field.normalDeg[i] / 180) * 6;
    const k = v > 0 ? 1 : 0.55;
    const r = Math.max(0, Math.min(1, Math.abs(h - 3) - 1));
    const g = Math.max(0, Math.min(1, 2 - Math.abs(h - 2)));
    const b = Math.max(0, Math.min(1, 2 - Math.abs(h - 4)));
    data[i * 4] = v === 0 ? 0 : a * r * k;
    data[i * 4 + 1] = v === 0 ? 0 : a * g * k;
    data[i * 4 + 2] = v === 0 ? 0 : a * b * k;
    data[i * 4 + 3] = 255;
  }
  return { data, width: field.width, height: field.height };
}

describe.skipIf(mode === '')('align debug dumps', () => {
  it.skipIf(mode !== 'axis')('ridge field and axis candidates', () => {
    const cache = createRenderCache(diskFrameStore());
    for (const seed of seeds) {
      const scene = renderScene(tier === 'negative' ? sampleNegativeScene(seed) : sampleScene(tier, seed), cache);
      const t0 = performance.now();
      const { gray, scaleX } = toWorkingGray(scene.frame);
      const t1 = performance.now();
      const smooth = gaussianBlur(gray, SIGMA_FINE);
      const t2 = performance.now();
      const field = computeRidgeField(smooth);
      const t3 = performance.now();
      const candidates = findAxisCandidates(field);
      const t4 = performance.now();
      const features: DiagnosticFeature[] = candidates.map((c, k) => {
        const dx = Math.cos((c.thetaDeg * Math.PI) / 180);
        const dy = Math.sin((c.thetaDeg * Math.PI) / 180);
        return {
          kind: c.polarity > 0 ? 'axis-bright' : 'axis-dark',
          points: [
            { x: c.cx - dx * 400, y: c.cy - dy * 400 },
            { x: c.cx + dx * 400, y: c.cy + dy * 400 },
          ],
          label: undefined,
          score: c.votes,
          ...(k < 6 ? { label: `${k}` } : {}),
        };
      });
      // Label near the centre point rather than off-screen.
      const dots: DiagnosticFeature[] = candidates.map((c, k) => ({ kind: 'axis-centre', points: [{ x: c.cx, y: c.cy }], label: `${k}:${c.votes.toFixed(0)}` }));
      const truthWork = scene.truth.pose ? { ...scene.truth.pose, H: scene.truth.pose.H.map((v, i) => (i < 6 ? v * scaleX : v)) as never, frameWidth: gray.width, frameHeight: gray.height } : null;
      writeFramePng(`${OUT}/axis-${tier}-${seed}.png`, ridgeFrame(field), { truth: truthWork, features: [...features, ...dots], scale: 2, label: scene.truth.description });
      process.stdout.write(
        `${scene.truth.description}: gray ${(t1 - t0).toFixed(1)} blur ${(t2 - t1).toFixed(1)} ridge ${(t3 - t2).toFixed(1)} hough ${(t4 - t3).toFixed(1)} ms, thr ${field.threshold.toFixed(2)}, ${candidates.length} candidates\n`,
      );
    }
    expect(seeds.length).toBeGreaterThan(0);
  }, 300_000);

  it.skipIf(mode !== 'strip')('combs, traced frets, edges and the first homography', () => {
    const cache = createRenderCache(diskFrameStore());
    for (const seed of seeds) {
      const scene = renderScene(tier === 'negative' ? sampleNegativeScene(seed) : sampleScene(tier, seed), cache);
      const { gray, scaleX } = toWorkingGray(scene.frame);
      const { fine, coarse } = buildPyramid(gray);
      const field = computeRidgeField(fine);
      const search = new AxisSearch(field);
      const hints = { bassSideUp: scene.truth.hints.bassSideUp ?? true, mirrored: scene.truth.hints.mirrored ?? false, leftHanded: scene.truth.hints.leftHanded ?? false };
      const model = neckModel(scene.truth.hints.model ?? 'steel');
      const truthWork: FretboardPose | null = scene.truth.pose ? { ...scene.truth.pose, H: scene.truth.pose.H.map((v, i) => (i < 6 ? v * scaleX : v)) as never, frameWidth: gray.width, frameHeight: gray.height } : null;
      const features: DiagnosticFeature[] = [];
      let bestPose: FretboardPose | null = null;
      let bestCells = -1;
      const lines: string[] = [];
      for (let k = 0; k < 8; k++) {
        const cand = search.next();
        if (!cand) break;
        const ms = measureBoard(fine, coarse, field, cand, hints, model);
        lines.push(`  cand ${k} theta ${cand.thetaDeg} votes ${cand.votes.toFixed(0)} pol ${cand.polarity}: ${ms.length} measurement(s)`);
        for (const m of ms) {
          const H = measurementHomography(m, model, m.offsetGuess);
          const pose = H ? makePose(H, model, gray.width, gray.height) : null;
          const err = pose && truthWork ? comparePoses(pose, truthWork) : null;
          lines.push(
            `    comb ${m.comb.frets.length} frets score ${m.comb.score.toFixed(1)} misses ${m.comb.misses} extras ${m.comb.extras} C ${m.comb.C.toFixed(2)} edges in ${m.strip.edgePlusInside.toFixed(2)}/${m.strip.edgeMinusInside.toFixed(2)} out ${m.strip.edgePlusOutside.toFixed(2)}/${m.strip.edgeMinusOutside.toFixed(2)} offset ${m.offsetGuess}` +
              (err ? ` | aligned cells ${(err.cellAccuracyAligned * 100).toFixed(0)}% fret ${err.fretErrorAligned.median.toFixed(3)} str ${err.stringError.median.toFixed(3)} k ${err.numberingOffset}` : ' | no H'),
          );
          if (err && err.cellAccuracyAligned > bestCells) {
            bestCells = err.cellAccuracyAligned;
            bestPose = pose;
          }
          if (k < 3) {
            for (const f of m.strip.frets) features.push({ kind: `trace${k}`, points: [{ x: f.minusX, y: f.minusY }, { x: f.midX, y: f.midY }, { x: f.plusX, y: f.plusY }], label: `${f.j}` });
          }
        }
      }
      writeFramePng(`${OUT}/strip-${tier}-${seed}.png`, { data: scene.frame.data, width: scene.frame.width, height: scene.frame.height }, {
        truth: scene.truth.pose,
        pose: bestPose ? { ...bestPose, H: bestPose.H.map((v, i) => (i < 6 ? v / scaleX : v)) as never, frameWidth: scene.frame.width, frameHeight: scene.frame.height } : null,
        features: features.map((f) => ({ ...f, points: f.points.map((p) => ({ x: p.x / scaleX, y: p.y / scaleX })) })),
        scale: scene.frame.width <= 640 ? 2 : 1,
        label: `${scene.truth.description} | best aligned ${(bestCells * 100).toFixed(0)}%`,
      });
      process.stdout.write(`${scene.truth.description}: best aligned cells ${(bestCells * 100).toFixed(0)}%\n${lines.join('\n')}\n`);
    }
    expect(seeds.length).toBeGreaterThan(0);
  }, 300_000);

  it.skipIf(mode !== 'eval')('one line per scene: what the detector did and why', () => {
    const cache = createRenderCache(diskFrameStore());
    const detector = createAlignDetector({ minQuality: Number(process.env.ALIGN_MINQ ?? 0) });
    const dump = process.env.ALIGN_PNG === '1';
    let locked = 0;
    let correct = 0;
    for (const seed of seeds) {
      const scene = renderScene(tier === 'negative' ? sampleNegativeScene(seed) : sampleScene(tier, seed), cache);
      detector.reset?.();
      const out = detector.detect(scene.frame, scene.truth.hints);
      const st = out.diagnostics.stats ?? {};
      const err = out.pose && scene.truth.pose ? comparePoses(out.pose, scene.truth.pose) : null;
      const isLocked = !!err && err.cellAccuracyAligned >= 0.9 && err.fretErrorAligned.median <= 0.3 && err.nutDirectionCorrect && err.bassSideCorrect;
      const cells = err ? (scene.truth.numberingObservable ? err.cellAccuracy : err.cellAccuracyAligned) : 0;
      if (isLocked) locked++;
      if (cells >= 0.9 && (scene.truth.numberingObservable || isLocked)) correct++;
      const f = (v: number | undefined, d = 2): string => (v === undefined ? '-' : v.toFixed(d));
      process.stdout.write(
        `${scene.truth.description.slice(0, 44).padEnd(44)} | ${out.pose ? (isLocked ? 'LOCK' : 'miss') : 'null'} q ${f(st.quality)} seen ${f(st.seen, 0)} cov ${f(st.coverage)} cl ${f(st.cleanliness)} fill ${f(st.fill)} con ${f(st.contrast, 0)} ovr ${f(st.overrun)} rig ${f(st.rigid)} thick ${f(st.thickness)} str ${f(st.strings)} trend ${f(st.lengthTrend)} ` +
          (err ? `| al ${(err.cellAccuracyAligned * 100).toFixed(0)}% abs ${(err.cellAccuracy * 100).toFixed(0)}% fret ${err.fretErrorAligned.median.toFixed(3)} str ${err.stringError.median.toFixed(2)} k ${err.numberingOffset} ${scene.truth.numberingObservable ? (scene.truth.nutVisible ? 'NUT' : 'INL') : 'n/a'} num ${out.pose?.numbering}/${out.pose?.numberingConfidence.toFixed(2)}` : `| ${out.diagnostics.reason ?? ''}`) +
          ` | ${out.diagnostics.timings.total.toFixed(0)} ms\n` +
          (process.env.ALIGN_NUM === '1' ? `      ${out.diagnostics.features?.find((x) => x.kind === 'numbering')?.label ?? ''}\n` : ''),
      );
      if (dump) writeFramePng(`${OUT}/eval-${tier}-${seed}.png`, scene.frame, { truth: scene.truth.pose, pose: out.pose, features: out.diagnostics.features, scale: scene.frame.width <= 640 ? 2 : 1, label: scene.truth.description });
    }
    process.stdout.write(`${tier}: locked ${locked}/${seeds.length} correct ${correct}/${seeds.length}\n`);
    expect(seeds.length).toBeGreaterThan(0);
  }, 300_000);

  it.skipIf(mode !== 'seq')('one line per frame of a tracking sequence', () => {
    const name = (process.env.ALIGN_SEQ ?? 'jerk') as SequenceName;
    const seq = buildSequence(name, { seedOffset });
    const cache = createRenderCache(diskFrameStore());
    const detector = createAlignDetector();
    const dumpAt = (process.env.ALIGN_FRAMES ?? '').split(',').filter((x) => x !== '').map(Number);
    let pose: FretboardPose | null = null;
    let last: FretboardPose | null = null;
    for (let i = 0; i < seq.frames.length; i++) {
      const scene = renderScene(seq.frames[i], cache);
      const hints = { ...scene.truth.hints, timeMs: (i * 1000) / seq.fps };
      // ALIGN_INIT=detect starts cold, as the benchmark does with VISION_TRACK_INIT=detect.
      if (i === 0 && scene.truth.pose && process.env.ALIGN_INIT !== 'detect') {
        pose = { ...scene.truth.pose, numbering: 'user' };
        last = pose;
        continue;
      }
      let how = 'track';
      let out: DetectionResult = pose ? detector.track(scene.frame, pose, hints) : detector.detect(scene.frame, last ? { ...hints, previousPose: last } : hints);
      if (!pose) how = 'detect';
      const trackStats = out.diagnostics.stats ?? {};
      const trackReason = out.diagnostics.reason;
      if (pose && !out.pose) {
        out = detector.detect(scene.frame, { ...hints, previousPose: pose });
        how = 'track>detect';
      }
      pose = out.pose;
      if (pose) last = pose;
      const err = pose && scene.truth.pose ? comparePoses(pose, scene.truth.pose) : null;
      const f = (v: number | undefined, d = 2): string => (v === undefined ? '-' : v.toFixed(d));
      process.stdout.write(
        `${name} ${String(i).padStart(2)} ${scene.truth.occluded ? 'OCC' : '   '} ${how.padEnd(12)} track(q ${f(trackStats.quality)} seen ${f(trackStats.seen, 0)} moved ${f(trackStats.moved, 1)} pred ${f(trackStats.predicted, 0)} ${trackReason ?? ''}) -> ${pose ? 'pose' : 'null'} ${out.diagnostics.reason ?? ''} ` +
          (err ? `cells ${(err.cellAccuracy * 100).toFixed(0)}% al ${(err.cellAccuracyAligned * 100).toFixed(0)}% fret ${err.fretErrorAligned.median.toFixed(3)} str ${err.stringError.median.toFixed(2)} k ${err.numberingOffset}` : '') +
          ` | ${out.diagnostics.timings.total.toFixed(0)} ms\n` +
          (process.env.ALIGN_NUM === '1' && how !== 'track' ? `      ${out.pose?.numbering}/${out.pose?.numberingConfidence.toFixed(2)} ${out.diagnostics.features?.find((x) => x.kind === 'numbering')?.label ?? ''}\n` : ''),
      );
      if (dumpAt.includes(i)) writeFramePng(`${OUT}/seq-${name}-${i}.png`, scene.frame, { truth: scene.truth.pose, pose, scale: 2, label: `${name} ${i}` });
    }
    expect(seq.frames.length).toBeGreaterThan(0);
  }, 300_000);

  it.skipIf(mode !== 'time')('time per frame, best of 5 (factors out a busy machine)', () => {
    const cache = createRenderCache(diskFrameStore());
    const detector = createAlignDetector({ debugFeatures: false });
    const median = (v: number[]): number => v.slice().sort((a, b) => a - b)[v.length >> 1];
    const p95 = (v: number[]): number => v.slice().sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(v.length * 0.95))];
    const lines: string[] = [];
    for (const which of ['easy', 'medium', 'hard', 'extreme', 'negative'] as const) {
      const times: number[] = [];
      for (let seed = seedOffset; seed < seedOffset + 24; seed++) {
        const scene = renderScene(which === 'negative' ? sampleNegativeScene(seed) : sampleScene(which, seed), cache);
        if (scene.frame.width !== 640) continue;
        let best = Infinity;
        for (let rep = 0; rep < 5; rep++) {
          detector.reset?.();
          const t0 = performance.now();
          detector.detect(scene.frame, scene.truth.hints);
          best = Math.min(best, performance.now() - t0);
        }
        times.push(best);
      }
      lines.push(`detect ${which}: n ${times.length} median ${median(times).toFixed(1)} ms p95 ${p95(times).toFixed(1)} ms max ${Math.max(...times).toFixed(1)} ms`);
    }
    for (const name of ['sway', 'hand-slide', 'jerk'] as const) {
      const seq = buildSequence(name, { seedOffset });
      const frames = seq.frames.map((f) => renderScene(f, cache));
      const per: number[][] = frames.map(() => []);
      for (let rep = 0; rep < 5; rep++) {
        detector.reset?.();
        let pose: FretboardPose | null = { ...(frames[0].truth.pose as FretboardPose), numbering: 'user' };
        for (let i = 1; i < frames.length && pose; i++) {
          const t0 = performance.now();
          const out: DetectionResult = detector.track(frames[i].frame, pose, { ...frames[i].truth.hints, timeMs: (i * 1000) / seq.fps });
          per[i].push(performance.now() - t0);
          pose = out.pose ?? pose;
        }
      }
      const best = per.filter((p) => p.length > 0).map((p) => Math.min(...p));
      lines.push(`track ${name}: n ${best.length} median ${median(best).toFixed(1)} ms p95 ${p95(best).toFixed(1)} ms max ${Math.max(...best).toFixed(1)} ms`);
    }
    const calibration: number[] = [];
    for (let k = 0; k < 5; k++) calibration.push(measureCalibration());
    lines.push(`calibration (best of 5): ${Math.min(...calibration).toFixed(2)} ms`);
    process.stdout.write(`${lines.join('\n')}\n`);
    expect(lines.length).toBeGreaterThan(0);
  }, 600_000);
});

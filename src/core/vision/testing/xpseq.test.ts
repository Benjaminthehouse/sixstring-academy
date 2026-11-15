/**
 * Scratch (not part of the product): per-frame trace of a detector on tracking sequences.
 * XPS=1 XPS_OFFSETS=0 XPS_SEQ=occlusion XPS_DET=fretboard [XPS_INIT=detect] [XPS_PNG=1] npx vitest run src/core/vision/testing/xpseq.test.ts
 */
import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { createAlignDetector } from '../align/detector';
import { createFretboardDetector } from '../detector';
import { comparePoses, scalePose } from '../geometry';
import { createLineDetector } from '../lines/detector';
import { createSessionDetector } from '../tracker';
import type { DetectOptions, Detector, FretboardPose } from '../types';
import { writeFramePng } from './debug';
import { createRenderCache, renderScene } from './render';
import { SEQUENCE_NAMES, buildSequence, type SequenceName } from './sequence';
import { diskFrameStore } from './store';

const offsets = (process.env.XPS_OFFSETS ?? '0').split(',').map(Number);
const names = (process.env.XPS_SEQ ? process.env.XPS_SEQ.split(',') : [...SEQUENCE_NAMES]) as SequenceName[];
const detName = process.env.XPS_DET ?? 'fretboard';
const verbose = process.env.XPS_VERBOSE !== '0';

function make(): Detector {
  if (detName === 'lines') return createLineDetector();
  if (detName === 'align') return createAlignDetector({ debugFeatures: false });
  if (detName === 'session') return createSessionDetector();
  return createFretboardDetector();
}

const f2 = (v: number | undefined): string => (v === undefined || !Number.isFinite(v) ? '  -  ' : v.toFixed(2).padStart(5));

if (process.env.XPS !== '1') {
  describe.skip('xpseq', () => {
    it('is skipped', () => undefined);
  });
} else {
  describe('xpseq', () => {
    it('traces sequences', () => {
      const lines: string[] = [];
      const json: Record<string, unknown>[] = [];
      for (const offset of offsets) {
        const cache = createRenderCache(diskFrameStore());
        for (const name of names) {
          const seq = buildSequence(name, { seedOffset: offset });
          const det = make();
          det.reset?.();
          let pose: FretboardPose | null = null;
          let lastGood: FretboardPose | null = null;
          let summary = '';
          const detail: string[] = [];
          for (let i = 0; i < seq.frames.length; i++) {
            const scene = renderScene(seq.frames[i], cache);
            const truth = scene.truth;
            const hints: DetectOptions = { ...truth.hints, timeMs: (i * 1000) / seq.fps };
            if (i === 0 && truth.pose && process.env.XPS_INIT !== 'detect') {
              pose = { ...truth.pose, numbering: 'user' };
              lastGood = pose;
              continue;
            }
            let res;
            let how = 'T';
            if (pose) {
              const start: FretboardPose = pose;
              res = det.track(scene.frame, start, hints);
              if (!res.pose) {
                const why = `${res.diagnostics.reason} fp=${f2(res.diagnostics.stats?.flowPeak)} fpx=${f2(res.diagnostics.stats?.flowPx)} L=${f2(res.diagnostics.stats?.lineEvidence)} A=${f2(res.diagnostics.stats?.alignEvidence)}`;
                res = det.detect(scene.frame, { ...hints, previousPose: start });
                how = `R(${why})`;
              }
            } else {
              res = det.detect(scene.frame, lastGood ? { ...hints, previousPose: lastGood } : hints);
              how = 'D';
            }
            let p = res.pose;
            if (p && p.frameWidth !== scene.frame.width) p = scalePose(p, scene.frame.width / p.frameWidth, scene.frame.height / p.frameHeight);
            let c = truth.occluded ? 'o' : 'L';
            let info = '';
            if (p && truth.pose) {
              const e = comparePoses(p, truth.pose);
              const aligned = e.cellAccuracyAligned >= 0.9 && e.fretErrorAligned.median <= 0.3 && e.nutDirectionCorrect && e.bassSideCorrect;
              c = e.cellAccuracy >= 0.9 ? '.' : aligned ? 'N' : e.stringError.median > 0.3 && e.fretErrorAligned.median < 0.3 ? 'S' : 'X';
              if (res.diagnostics.reason === 'coasting') c = c === '.' ? 'c' : 'C';
              if (truth.occluded) c = 'O';
              info = `cell ${e.cellAccuracy.toFixed(2)} off ${String(e.numberingOffset).padStart(2)} str ${e.stringError.median.toFixed(2)} fret ${e.fretErrorAligned.median.toFixed(2)}`;
            }
            summary += c;
            const s = res.diagnostics.stats ?? {};
            json.push({ offset, name, i, c, how, stats: s, conf: p?.confidence, numConf: p?.numberingConfidence, ms: res.diagnostics.timings.total });
            detail.push(`  ${String(i).padStart(2)} ${c} ${how.padEnd(22).slice(0, 80)} ${info.padEnd(42)} conf ${f2(p?.confidence)} num ${(p?.numbering ?? '-').padEnd(8)} ${f2(p?.numberingConfidence)} | ev ${f2(s.evidence)} L ${f2(s.lineEvidence)} A ${f2(s.alignEvidence)} agree ${s.agree ?? '-'} src ${s.source ?? '-'} flow ${f2(s.flowPeak)} ${f2(s.flowPx)} coast ${s.coasting ?? '-'} read ${s.readDelta ?? '-'}/${f2(s.readConfidence)} carry ${s.carryDelta ?? '-'} ren ${s.renumbered ?? '-'} | ${res.diagnostics.reason ?? ''} ${res.diagnostics.timings.total.toFixed(0)}ms${how !== 'T' ? ` nd ${s.numberingDelta ?? '-'} carried ${s.carriedDelta ?? '-'} fast ${s.fast ?? 0}` : ''}`);
            if (process.env.XPS_PNG === '1' && c !== '.' && c !== 'o') writeFramePng(`e2e/out/vision/compare/seq-${detName}-${offset}-${name}-${i}.png`, scene.frame, { truth: truth.pose, pose: p, scale: 2, label: `${name}#${i} ${c} ${info}` });
            pose = p;
            if (p) lastGood = p;
          }
          lines.push(`${String(offset).padStart(4)} ${name.padEnd(10)} ${summary}`);
          if (verbose && /[^.oOc]/.test(summary)) lines.push(...detail);
        }
      }
      process.stdout.write(`\n${lines.join('\n')}\n\n`);
      if (process.env.XPS_JSON) writeFileSync(process.env.XPS_JSON, JSON.stringify(json));
    }, 60 * 60_000);
  });
}

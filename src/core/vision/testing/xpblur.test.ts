/** Scratch: coast a pose through motion blur with the board profiles. */
import { describe, it } from 'vitest';
import { boardProfiles, boardShift, type BoardProfiles } from '../flow';
import { applyHomography, comparePoses, computeVisibleFrets, makePose, multiply } from '../geometry';
import { smooth3, toWorkingGray, workingFactor, type Image32 } from '../lines/image';
import type { Mat3 } from '../types';
import { createRenderCache, renderScene } from './render';
import { buildSequence, type SequenceName } from './sequence';
import { diskFrameStore } from './store';

if (process.env.XPB !== '1') {
  describe.skip('xpblur', () => {
    it('is skipped', () => undefined);
  });
} else {
  describe('xpblur', () => {
    it('follows blur', () => {
      const out: string[] = [];
      for (const spec of (process.env.XPB_RUNS ?? '4000:nut-exit:11:24').split(',')) {
        const [o, name, a, b] = spec.split(':');
        const offset = Number(o);
        const from = Number(a);
        const to = Number(b);
        const cache = createRenderCache(diskFrameStore());
        const seq = buildSequence(name as SequenceName, { seedOffset: offset });
        let H: Mat3 | null = null;
        let gray: Image32 | undefined;
        let smooth: Image32 | undefined;
        let prev: BoardProfiles | null = null;
        let line = `${spec}: `;
        let prevTruth: Mat3 | null = null;
        for (let i = from; i <= to; i++) {
          const scene = renderScene(seq.frames[i], cache);
          const truth = scene.truth.pose;
          if (!truth) continue;
          const factor = workingFactor(scene.frame.width, 640);
          gray = toWorkingGray(scene.frame, factor, gray);
          smooth = smooth3(gray, smooth && smooth !== gray ? smooth : undefined);
          const vis = (h: Mat3) => computeVisibleFrets(h, truth.model, scene.frame.width, scene.frame.height);
          if (H === null) {
            H = truth.H;
            prevTruth = truth.H;
            prev = boardProfiles(smooth, H, truth.model, vis(H));
            continue;
          }
          const t0 = performance.now();
          const cur = prev ? boardProfiles(smooth, H, truth.model, vis(H)) : null;
          const flow = prev && cur ? boardShift(prev, cur) : null;
          if (flow) H = multiply(flow.map, H);
          prev = boardProfiles(smooth, H, truth.model, vis(H));
          const ms = performance.now() - t0;
          if (!flow) {
            line += ' null';
            continue;
          }
          const e = comparePoses(makePose(H, truth.model, scene.frame.width, scene.frame.height), truth);
          const c0 = applyHomography(truth.H, 300, 20);
          const a0 = applyHomography(prevTruth as Mat3, 300, 20);
          line += ` ${i}:${e.cellAccuracy.toFixed(1)}/f${e.fretError.median.toFixed(2)}/s${e.stringError.median.toFixed(2)}/d${Math.hypot(flow.dx, flow.dy).toFixed(1)}(true ${Math.hypot(c0.x - a0.x, c0.y - a0.y).toFixed(1)}px)/${ms.toFixed(1)}ms`;
          prevTruth = truth.H;
        }
        out.push(line);
      }
      process.stdout.write(`\n${out.join('\n')}\n\n`);
    }, 600_000);
  });
}

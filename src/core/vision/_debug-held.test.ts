import { it } from 'vitest';
import { comparePoses, locatePixel, projectMarker } from './geometry';
import { createRenderCache, renderScene } from './testing/render';
import { sampleScene, describeScene } from './testing/scene';
import { diskFrameStore } from './testing/store';
import { FretboardTracker } from './tracker';
import type { Frame, FretboardPose } from './types';
const cache = createRenderCache(diskFrameStore());
function cells(pose: FretboardPose | null, truth: FretboardPose): number {
  if (!pose) return 0; let ok = 0, n = 0; const v = truth.visibleFrets;
  for (const s of [6, 4, 3, 1]) for (let f = Math.max(1, v.min + 1); f <= v.max; f++) { const l = locatePixel(truth, projectMarker(pose, s, f)); n++; if (l && l.onBoard && l.string === s && l.fret === f) ok++; }
  return n ? ok / n : 0;
}
function jiggle(base: Frame, out: Frame, seed: number) { let r = seed >>> 0; for (let i = 0; i < base.data.length; i += 4) { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; const n = ((r >>> 24) - 128) / 32; out.data[i] = base.data[i] + n; out.data[i + 1] = base.data[i + 1] + n; out.data[i + 2] = base.data[i + 2] + n; out.data[i + 3] = 255; } }
it('held wrong', () => {
  for (const tier of ['hard', 'extreme'] as const) for (let k = 0; k < 24; k++) {
    const scene = renderScene(sampleScene(tier, 13000 + k), cache);
    const truth = scene.truth.pose as FretboardPose;
    const work: Frame = { data: new Uint8ClampedArray(scene.frame.data.length), width: scene.frame.width, height: scene.frame.height };
    const tr = new FretboardTracker({ ...scene.truth.hints });
    const wrong: string[] = [];
    for (let i = 0; i < 45; i++) {
      jiggle(scene.frame, work, k * 7919 + i);
      const u = tr.update(work, i * 33.3);
      if (u.state === 'locked' && cells(u.pose, truth) < 0.9) {
        const e = comparePoses(u.pose!, truth);
        wrong.push(`${i}:${u.pose!.numbering}/${u.pose!.numberingConfidence.toFixed(2)} off${e.numberingOffset} str${e.stringError.median.toFixed(2)} c${cells(u.pose, truth).toFixed(2)} conf${u.confidence.toFixed(2)}`);
      }
    }
    if (wrong.length) console.log(tier, k, describeScene(scene.spec), '\n   ', wrong.length, 'wrong frames; first', wrong[0], 'last', wrong[wrong.length - 1]);
  }
}, 1200000);

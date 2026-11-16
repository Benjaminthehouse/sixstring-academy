import { it } from 'vitest';
import { createFretboardDetector } from '../detector';
import { readStringCount, stringCountDoubt } from '../string-count';
import { FretboardTracker } from '../tracker';
import type { FretboardPose } from '../types';
import { ALT_CONDITIONS, createAltCache, renderAlt } from './alt-scenes';
import { createRenderCache, renderScene } from './render';
import { sampleScene, type Tier } from './scene';
import { diskFrameStore } from './store';

it('string-count false alarms on the original bench at the final threshold', () => {
  const cache = createRenderCache(diskFrameStore());
  const det = createFretboardDetector();
  let alarms = 0;
  let maxLead = 0;
  let n = 0;
  for (const offset of [0, 3000]) {
    for (const tier of ['easy', 'medium', 'hard', 'extreme'] as Tier[]) {
      for (let seed = 0; seed < 24; seed++) {
        const { frame, truth } = renderScene(sampleScene(tier, offset + seed), cache);
        const d = det.detect(frame, truth.hints);
        for (const pose of [d.pose, truth.pose as FretboardPose]) {
          if (!pose) continue;
          const r = readStringCount(frame, pose);
          n++;
          if (stringCountDoubt(r) > 0) alarms++;
          if (r && r.best !== r.model) maxLead = Math.max(maxLead, r.bestScore - Math.max(0, r.modelScore));
        }
      }
    }
  }
  console.log(`original bench (sets 0, 3000; detector and true poses): ${alarms}/${n} doubted, largest lead of another count ${maxLead.toFixed(2)}`);
}, 1_200_000);

it('which alt scenes are never found', () => {
  const rows: string[] = [];
  for (const c of ALT_CONDITIONS) {
    if (c.group === 'negative') continue;
    for (const seed of [1, 2, 3, 4]) {
      const spec = c.build(seed);
      const tr = new FretboardTracker({ model: spec.hints.model, mirrored: spec.hints.mirrored, leftHanded: spec.hints.leftHanded });
      const cache = createAltCache();
      let found = false;
      for (let i = 0; i < 5 && !found; i++) found = tr.update(renderAlt(spec, i, cache).frame, i * 33).state !== 'searching';
      if (!found) rows.push(`${c.id}#${seed}: board ${spec.look.board}, frets ${spec.look.fretTone}, spacing ${renderAlt(spec, 0, cache).truth.stringSpacingPx.toFixed(1)}`);
    }
  }
  console.log(`never found in 5 frames:\n${rows.join('\n')}`);
}, 1_200_000);

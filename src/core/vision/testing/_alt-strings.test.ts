import { it } from 'vitest';
import { createFretboardDetector } from '../detector';
import { readStringCount, stringCountDoubt } from '../string-count';
import { FretboardTracker } from '../tracker';
import type { FretboardPose } from '../types';
import { altCondition, createAltCache, renderAlt } from './alt-scenes';
import { createRenderCache, renderScene } from './render';
import { sampleScene, type Tier } from './scene';
import { diskFrameStore } from './store';

it('string count on the original bench', () => {
  const cache = createRenderCache(diskFrameStore());
  const det = createFretboardDetector();
  const rows: string[] = [];
  let alarms = 0;
  let total = 0;
  for (const tier of ['easy', 'medium', 'hard', 'extreme'] as Tier[]) {
    for (let seed = 0; seed < 24; seed++) {
      const { frame, truth } = renderScene(sampleScene(tier, seed), cache);
      const t = readStringCount(frame, truth.pose as FretboardPose);
      const d = det.detect(frame, truth.hints);
      const e = d.pose ? readStringCount(frame, d.pose) : null;
      const dt = stringCountDoubt(t);
      const de = stringCountDoubt(e);
      total++;
      if (de > 0) alarms++;
      if (dt > 0 || de > 0) rows.push(`${tier}#${seed}: truth best ${t?.best} (${t?.bestScore.toFixed(1)} vs ${t?.modelScore.toFixed(1)}, noise ${t?.noise.toFixed(1)}) doubt ${dt.toFixed(2)}; det best ${e?.best} doubt ${de.toFixed(2)}`);
    }
  }
  console.log(`original bench: ${alarms}/${total} detector poses doubted\n${rows.join('\n')}`);
}, 600_000);

it('string count on alt scenes', () => {
  const rows: string[] = [];
  for (const id of (process.env.ALT_IDS ?? 'typical,seven-preset,seven-model,bass-model,nylon,plain,dim,grain-wear,sleeve').split(',')) {
    for (const seed of [0, 1, 2]) {
      const spec = altCondition(id).build(seed);
      const tr = new FretboardTracker({ model: spec.hints.model, mirrored: spec.hints.mirrored, leftHanded: spec.hints.leftHanded });
      const cache = createAltCache();
      let line = `${id}#${seed}:`;
      for (let i = 0; i < 6; i++) {
        const { frame } = renderAlt(spec, i, cache);
        const u = tr.update(frame, i * 33);
        if (i >= 2 && u.pose) {
          const r = readStringCount(frame, u.pose);
          line += ` [${u.state[0]} best ${r?.best} ${r?.bestScore.toFixed(1)}/${r?.modelScore.toFixed(1)} n${r?.noise.toFixed(1)} d${stringCountDoubt(r).toFixed(2)}]`;
        }
      }
      rows.push(line);
    }
  }
  console.log(rows.join('\n'));
}, 600_000);

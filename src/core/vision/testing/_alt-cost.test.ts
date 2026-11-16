import { it } from 'vitest';
import { cameraCentre, projectMarkerSeen } from '../geometry';
import { frameStats } from '../guidance';
import { readStringCount } from '../string-count';
import { FretboardTracker } from '../tracker';
import { altCondition, createAltCache, renderAlt } from './alt-scenes';

it('cost of the added per-frame work', () => {
  const spec = altCondition('typical').build(0);
  const cache = createAltCache();
  const tr = new FretboardTracker({ model: spec.hints.model });
  let pose = null;
  let frame = renderAlt(spec, 0, cache).frame;
  for (let i = 0; i < 5; i++) {
    frame = renderAlt(spec, i, cache).frame;
    pose = tr.update(frame, i * 33).pose;
  }
  const time = (f: () => void, n: number): number => {
    for (let i = 0; i < 5; i++) f();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) f();
    return (performance.now() - t0) / n;
  };
  const p = pose!;
  console.log(`frameStats step 4: ${time(() => frameStats(frame, 4), 50).toFixed(2)} ms; readStringCount: ${time(() => readStringCount(frame, p), 50).toFixed(2)} ms; cameraCentre + 120 seen markers: ${time(() => { const c = cameraCentre(p); for (let f = 1; f <= 20; f++) for (let s = 1; s <= 6; s++) projectMarkerSeen(p, s, f, c); }, 200).toFixed(3)} ms`);
}, 300_000);

import { it } from 'vitest';
import { ALT_CONDITIONS, createAltCache, renderAlt, altCondition } from './alt-scenes';
import { writeContactSheet, writeFramePng } from './debug';
import { dumpAltFrame } from './alt-bench';

const OUT = 'e2e/out/vision/alt';

it('sheet', () => {
  const ids = (process.env.ALT_IDS ?? '').split(',').filter(Boolean);
  const seed = Number(process.env.ALT_SEED ?? 0);
  const list = ids.length ? ids.map(altCondition) : ALT_CONDITIONS;
  const cells = [];
  const times: string[] = [];
  for (const c of list) {
    const spec = c.build(seed);
    const cache = createAltCache();
    const t0 = performance.now();
    const { frame, truth } = renderAlt(spec, Number(process.env.ALT_FRAME ?? 0), cache);
    const t1 = performance.now();
    renderAlt(spec, 20, cache);
    const t2 = performance.now();
    times.push(`${c.id}: first ${(t1 - t0).toFixed(0)} ms, next ${(t2 - t1).toFixed(0)} ms, nut ${truth.nutInFrame} vis ${truth.visible.min}-${truth.visible.max} sp ${truth.stringSpacingPx.toFixed(1)} off ${truth.offNormalDeg.toFixed(0)}`);
    cells.push({ frame, label: c.id });
    if (process.env.ALT_EACH) {
      writeFramePng(`${OUT}/scene-${c.id}-${seed}.png`, frame);
      dumpAltFrame(`${OUT}/truth-${c.id}-${seed}.png`, frame, truth, null, c.id);
    }
  }
  writeContactSheet(`${OUT}/sheet-${seed}.png`, cells, { columns: 4, cellWidth: 480 });
  console.log(times.join('\n'));
}, 300_000);

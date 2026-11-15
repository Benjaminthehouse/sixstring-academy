/**
 * The alt bench: the production tracker on scenes from an independent generator (`alt-scenes.ts`).
 *
 * Default (part of the regular suite): every condition, one seed, 16 frames from a cold start.
 * Longer runs print the full table (and write PNGs of the worst locked frames to e2e/out/vision/alt/):
 *   ALT_SEEDS=0,1,2,3 ALT_FRAMES=24 npx vitest run src/core/vision/testing/alt-scenes.test.ts --silent=false
 *   ALT_ONLY=capo-2,capo-4 ALT_DUMP=all ...      one condition, every frame dumped
 */
import { describe, expect, it } from 'vitest';
import { formatAltRun, formatAltTable, runAltSuite, type AltRow } from './alt-bench';
import { ALT_CONDITIONS, altCondition } from './alt-scenes';

const SEEDS = (process.env.ALT_SEEDS ?? '0').split(',').map(Number);
const FRAMES = Number(process.env.ALT_FRAMES ?? 16);
const ONLY = (process.env.ALT_ONLY ?? '').split(',').filter(Boolean);
const DUMP = (process.env.ALT_DUMP ?? 'worst') as 'none' | 'worst' | 'all';
const OUT = 'e2e/out/vision/alt';

describe('alt bench: the production tracker on independently generated scenes', () => {
  it('reports detection, cells, numbering, false locks and jitter per condition', () => {
    const conditions = ONLY.length ? ONLY.map(altCondition) : ALT_CONDITIONS;
    const t0 = performance.now();
    const { rows, runs } = runAltSuite(conditions, SEEDS, { frames: FRAMES, dump: DUMP, dumpDir: OUT });
    if (process.env.ALT_LOG) for (const list of runs.values()) for (const r of list) console.log(formatAltRun(r));
    console.log(`alt bench, seeds ${SEEDS.join(',')}, ${FRAMES} frames per scene, ${((performance.now() - t0) / 1000).toFixed(1)} s\n${formatAltTable(rows)}`);
    const byId = new Map<string, AltRow>(rows.map((r) => [r.condition, r]));
    expect(byId.size).toBe(conditions.length);
  }, 600_000);
});

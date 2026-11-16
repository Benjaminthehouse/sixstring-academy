/**
 * The alt bench: the production tracker on scenes from an independent generator (`alt-scenes.ts`).
 *
 * Default (part of the regular suite): every condition, one seed, 16 frames from a cold start.
 * Longer runs print the full table (and write PNGs of the worst locked frames to e2e/out/vision/alt/):
 *   ALT_SEEDS=0,1,2,3 ALT_FRAMES=24 npx vitest run src/core/vision/testing/alt-scenes.test.ts --silent=false
 *   ALT_ONLY=capo-2,capo-4 ALT_DUMP=all ALT_LOG=1 ...      chosen conditions, every frame dumped and logged
 * Operating-limits sweep (one knob at a time; prints a table):
 *   ALT_SWEEP=span,tilt,light ALT_SEEDS=0,1,2,3 npx vitest run src/core/vision/testing/alt-scenes.test.ts -t sweep --silent=false
 */
import { describe, expect, it } from 'vitest';
import { formatAltRun, formatAltTable, runAlt, runAltSuite, summariseAlt, type AltRow } from './alt-bench';
import { ALT_CONDITIONS, altCondition, altSweepScene, createAltCache, type AltSweepKnob } from './alt-scenes';

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
  }, 3_600_000);
});

const SWEEP = (process.env.ALT_SWEEP ?? '').split(',').filter(Boolean) as AltSweepKnob[];
const SWEEP_VALUES: Record<AltSweepKnob, number[]> = {
  span: [0.16, 0.2, 0.25, 0.3, 0.38, 0.48],
  tilt: [0, 25, 40, 48, 55, 62],
  light: [1, 0.15, 0.04, 0.02, 0.01, 0.005, 0.0025],
  capo: [1, 2, 3, 4, 5, 6, 7],
  'capo-far': [1, 2, 3, 4, 5, 6, 7],
};

describe.runIf(SWEEP.length > 0)('alt bench: operating limits sweep', () => {
  it('sweeps one knob at a time', () => {
    const lines: string[] = [];
    for (const knob of SWEEP) {
      const rows: AltRow[] = [];
      for (const value of SWEEP_VALUES[knob]) {
        const runs = SEEDS.map((seed) => runAlt(altSweepScene(knob, value, seed), { frames: Math.min(FRAMES, 16), cache: createAltCache(), dump: DUMP, dumpDir: `${OUT}/sweep` }));
        rows.push({ ...summariseAlt({ id: `${knob}=${value}`, group: 'control', what: '', build: () => runs[0].spec }, runs) });
      }
      lines.push(`${knob}:\n${formatAltTable(rows)}`);
    }
    console.log(`operating-limits sweep, seeds ${SEEDS.join(',')}\n${lines.join('\n\n')}`);
  }, 3_600_000);
});

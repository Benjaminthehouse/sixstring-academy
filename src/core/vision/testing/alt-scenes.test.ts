/**
 * The alt bench: the production tracker on scenes from an independent generator (`alt-scenes.ts`),
 * scored against that generator's own truth (`alt-bench.ts`).
 *
 * Default (part of the regular suite, well under a minute): 22 conditions, seed 0, 12 frames of a
 * still guitar with fresh sensor noise each frame, from a cold start, with assertions on what must
 * hold: no board shown without a guitar, supported conditions lock right, a capo never shifts the
 * numbering, a wrong guitar type never locks wrongly, the coaching says the right thing.
 *
 * Longer runs print the full table and write PNGs of the worst locked frames to e2e/out/vision/alt/
 * (every condition; only the no-false-lock rule is asserted there):
 *   ALT_SEEDS=1,2,3,4 ALT_FRAMES=24 npx vitest run src/core/vision/testing/alt-scenes.test.ts -t reports --silent=false
 *   ALT_ONLY=capo-2,capo-4 ALT_DUMP=all ALT_LOG=1 ...      chosen conditions, every frame dumped and logged
 * Operating-limits sweeps (one knob at a time; prints a table):
 *   ALT_SWEEP=span,tilt,light,capo,capo-far ALT_SEEDS=0,1,2 npx vitest run src/core/vision/testing/alt-scenes.test.ts -t sweep --silent=false
 */
import { describe, expect, it } from 'vitest';
import { formatAltRun, formatAltTable, runAlt, runAltSuite, summariseAlt, type AltRow, type AltRun } from './alt-bench';
import { ALT_CONDITIONS, altCondition, altSweepScene, createAltCache, type AltSweepKnob } from './alt-scenes';

const REPORT = Boolean(process.env.ALT_SEEDS || process.env.ALT_ONLY || process.env.ALT_FRAMES || process.env.ALT_FULL);
const SEEDS = (process.env.ALT_SEEDS ?? '0').split(',').map(Number);
const FRAMES = Number(process.env.ALT_FRAMES ?? (REPORT ? 24 : 12));
const ONLY = (process.env.ALT_ONLY ?? '').split(',').filter(Boolean);
const DUMP = (process.env.ALT_DUMP ?? (REPORT ? 'worst' : 'none')) as 'none' | 'worst' | 'all';
const OUT = 'e2e/out/vision/alt';

/** The regular suite's conditions: controls, the capo, wrong and right neck models, occluders, light, orientation, distractors. */
const DEFAULT_SET = [
  'plain', 'typical', 'no-nut', 'nylon', 'capo-2', 'capo-4', 'capo-nonut', 'seven-preset', 'seven-model', 'bass-preset', 'bass-model',
  'sleeve', 'dim', 'stage-light', 'mirrored', 'lefty', 'wall-guitar', 'neg-keyboard', 'neg-bookshelf', 'neg-blinds', 'neg-radiator', 'neg-shirt',
];
/** Conditions that must lock and draw right on the default seed. */
const MUST_LOCK = ['plain', 'typical', 'nylon', 'capo-2', 'capo-4', 'seven-model', 'bass-model', 'sleeve', 'dim', 'stage-light', 'mirrored', 'lefty'];

function lockedRight(run: AltRun): number {
  const locked = run.frames.filter((f) => f.state === 'locked' && f.score && f.score.cells > 0);
  return locked.length ? locked.filter((f) => (f.score?.accuracy ?? 0) >= 0.9).length / locked.length : NaN;
}

describe('alt bench: the production tracker on independently generated scenes', () => {
  it('reports detection, cells, numbering, false locks and jitter per condition', () => {
    const conditions = ONLY.length ? ONLY.map(altCondition) : REPORT ? ALT_CONDITIONS : DEFAULT_SET.map(altCondition);
    const t0 = performance.now();
    const { rows, runs } = runAltSuite(conditions, SEEDS, { frames: FRAMES, dump: DUMP, dumpDir: OUT });
    if (process.env.ALT_LOG) for (const list of runs.values()) for (const r of list) console.log(formatAltRun(r));
    console.log(`alt bench, seeds ${SEEDS.join(',')}, ${FRAMES} frames per scene, ${((performance.now() - t0) / 1000).toFixed(1)} s\n${formatAltTable(rows)}`);
    const byId = new Map<string, AltRow>(rows.map((r) => [r.condition, r]));
    expect(byId.size).toBe(conditions.length);
    // Without a guitar nothing is ever shown, on any seed.
    for (const r of rows) if (!r.guitar) expect(r.shown, r.condition).toBe(0);
    if (REPORT) return;

    const run = (id: string): AltRun => (runs.get(id) as AltRun[])[0];
    for (const id of MUST_LOCK) {
      const r = run(id);
      expect(r.firstLock, `${id} locks`).toBeGreaterThanOrEqual(0);
      expect(r.firstLock, `${id} locks within 4 frames`).toBeLessThanOrEqual(4);
      expect(lockedRight(r), `${id}: locked frames with >= 90% of the cells right`).toBeGreaterThanOrEqual(0.9);
      // Once locked inside the limits, the coaching says so.
      expect(r.frames.at(-1)?.guidance, `${id} guidance`).toBe('ok');
    }
    // A capo never shifts the numbering of a locked board, nut in view or not.
    for (const id of ['capo-2', 'capo-4', 'capo-nonut']) {
      expect(run(id).misnumbered, `${id} mis-numbered`).toBe(false);
      expect(run(id).wrongLock, `${id} wrong lock`).toBe(false);
    }
    // The wrong neck model (a 7-string or a bass read as a guitar) never locks wrongly; when a board is
    // followed the coaching asks for the guitar type.
    for (const id of ['seven-preset', 'bass-preset']) {
      expect(run(id).wrongLock, `${id} wrong lock`).toBe(false);
      const last = run(id).frames.at(-1);
      if (last && last.state !== 'searching') expect(last.guidance, `${id} guidance`).toBe('check-guitar-type');
    }
    // A second guitar on the wall and a nut out of view do not produce a wrong lock.
    for (const id of ['wall-guitar', 'no-nut']) expect(run(id).wrongLock, `${id} wrong lock`).toBe(false);
    // A still guitar: drawn markers move less than half a pixel per frame.
    for (const id of MUST_LOCK) expect(byId.get(id)?.jitterPx ?? 0, `${id} jitter`).toBeLessThan(0.5);
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

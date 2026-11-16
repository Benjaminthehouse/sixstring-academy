// TEMPORARY (generators lane): dumps the output of every generated step the content uses, so the
// output before and after a change can be compared. Deleted before the lane finishes.
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import type { GeneratedStep } from '../types';
import { generateExercise } from './index';

const OUT = process.env.GEN_SNAPSHOT_OUT;

function collect(value: unknown, out: Map<string, GeneratedStep>, seen = new Set<unknown>()): void {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (!Array.isArray(value) && 'generate' in (value as Record<string, unknown>) && typeof (value as { generate: unknown }).generate === 'string') {
    const step = value as GeneratedStep;
    out.set(JSON.stringify({ generate: step.generate, params: step.params ?? {}, seed: step.seed ?? null }), step);
  }
  for (const child of Array.isArray(value) ? value : Object.values(value as Record<string, unknown>)) collect(child, out, seen);
}

it.runIf(!!OUT)('dumps generated content steps', async () => {
  const modules = {
    ...import.meta.glob(['/src/content/theory/units/*.ts', '!/src/content/theory/units/*.test.ts']),
    ...import.meta.glob(['/src/content/teachers/{mia,dev,elena}/*.ts', '!/src/content/teachers/**/*.test.ts']),
  };
  const steps = new Map<string, GeneratedStep>();
  for (const load of Object.values(modules)) collect(await load(), steps);
  const dump: Record<string, unknown> = {};
  for (const [key, step] of steps) {
    const runs: unknown[] = [];
    for (const difficulty of [0, 0.3, 0.6, 1]) {
      for (let seed = 0; seed < 12; seed++) runs.push(generateExercise({ ...step, id: undefined, fact: undefined } as GeneratedStep, { seed, difficulty }));
    }
    dump[key] = runs;
  }
  writeFileSync(OUT!, JSON.stringify(dump));
  console.log(`steps: ${steps.size}`);
}, 600_000);

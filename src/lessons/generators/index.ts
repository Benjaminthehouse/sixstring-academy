/**
 * The generator registry. A generated step (`{ generate: kind, params, seed }`) is turned into a
 * literal exercise by `generateExercise`, deterministically for a seed, so drills never run out
 * and are always right: every fact in them is computed by the theory and guitar engines.
 */
import { createRng } from '../rng';
import type { CourseLevel, Exercise, GeneratedStep, GeneratorKind } from '../types';
import type { GeneratorDef } from './core';
import { EAR_GENERATORS } from './ear';
import { FRETWORK_GENERATORS } from './fretwork';
import { NASHVILLE_GENERATORS } from './nashville';
import { NECK_GENERATORS } from './neck';
import { READING_GENERATORS } from './reading';
import { STAFF_GENERATORS } from './staff';
import { THEORY_GENERATORS } from './theory';
import { TIME_GENERATORS } from './time';

export type { GenContext, GeneratorDef, ParamDoc } from './core';
export type * from './params';

const ALL: ReadonlyArray<GeneratorDef<GeneratorKind>> = [
  ...THEORY_GENERATORS,
  ...NASHVILLE_GENERATORS,
  ...NECK_GENERATORS,
  ...FRETWORK_GENERATORS,
  ...TIME_GENERATORS,
  ...EAR_GENERATORS,
  ...STAFF_GENERATORS,
  ...READING_GENERATORS,
] as unknown as ReadonlyArray<GeneratorDef<GeneratorKind>>;

/** Every generator by kind. */
export const GENERATORS: Readonly<Record<string, GeneratorDef<GeneratorKind>>> = Object.fromEntries(ALL.map((g) => [g.kind, g]));

/** The generator kinds, in the order the authoring guide lists them. */
export const GENERATOR_KINDS: readonly GeneratorKind[] = ALL.map((g) => g.kind);

/** The definition of a generator, or null for an unknown kind. */
export function getGenerator(kind: string): GeneratorDef<GeneratorKind> | null {
  return Object.prototype.hasOwnProperty.call(GENERATORS, kind) ? GENERATORS[kind] : null;
}

/** True for a step written as `{ generate: ... }`. */
export function isGenerated(step: unknown): step is GeneratedStep {
  return typeof step === 'object' && step !== null && 'generate' in step;
}

/** Everything that is wrong with a generated step (empty when fine). Each entry says how to fix it. */
export function generatorProblems(step: GeneratedStep): string[] {
  const def = getGenerator(String(step.generate));
  if (!def) return [`"${String(step.generate)}" is not a generator. Use one of: ${GENERATOR_KINDS.join(', ')}.`];
  const problems: string[] = [];
  const params = (step.params ?? {}) as Record<string, unknown>;
  if (typeof params !== 'object' || params === null || Array.isArray(params)) return ['"params" must be an object, like { intervals: [\'m3\', \'M3\'] }.'];
  const known = new Set(def.params.map((p) => p.name));
  for (const name of Object.keys(params)) {
    if (!known.has(name)) problems.push(`"${name}" is not a parameter of the ${def.kind} generator. Its parameters are: ${[...known].join(', ') || 'none'}.`);
  }
  if (step.seed !== undefined && (!Number.isInteger(step.seed) || step.seed < 0)) problems.push(`"seed" is ${JSON.stringify(step.seed)}; it must be a whole number of 0 or more.`);
  try {
    problems.push(...def.check(params as never));
  } catch (error) {
    problems.push(`The parameters could not be checked (${error instanceof Error ? error.message : String(error)}). Compare them with the ${def.kind} entry in the authoring guide.`);
  }
  return problems;
}

/** Options for generating. */
export interface GenerateOptions {
  /** Seed used when the step has none of its own. */
  seed?: number;
  /** 0 (easiest) to 1 (hardest). Default 0.3. */
  difficulty?: number;
  /** Course level. Default `beginner`. */
  level?: CourseLevel;
}

/** A plain exercise that can stand in for a generated one that failed (so a lesson never crashes). */
function fallbackExercise(kind: string): Exercise {
  return {
    type: 'true-false',
    statement: 'One fret on the guitar is one half step.',
    answer: true,
    explain: `Every fret raises a string by one half step. (This question replaced a "${kind}" question that could not be made.)`,
  };
}

/**
 * Make the literal exercise of a generated step. The same step, seed and difficulty always give
 * the same exercise. The step's own `seed` wins over `opts.seed`. Never throws: a step that
 * cannot be generated (bad params that validation would have reported) yields a stand-in question.
 */
export function generateExercise(step: GeneratedStep, opts: GenerateOptions = {}): Exercise {
  const def = getGenerator(String(step.generate));
  if (!def) return fallbackExercise(String(step.generate));
  const seed = step.seed ?? opts.seed ?? 0;
  const difficulty = Math.min(1, Math.max(0, opts.difficulty ?? 0.3));
  let exercise: Exercise;
  try {
    exercise = def.make((step.params ?? {}) as never, { rng: createRng(seed), difficulty, level: opts.level ?? 'beginner' });
  } catch {
    return fallbackExercise(def.kind);
  }
  if (step.id !== undefined) exercise.id = step.id;
  if (step.fact !== undefined) exercise.fact = step.fact;
  return exercise;
}

/** `generateExercise` without the safety net: throws when the generator does. For tests and validation. */
export function generateStrict(step: GeneratedStep, opts: GenerateOptions = {}): Exercise {
  const def = getGenerator(String(step.generate));
  if (!def) throw new RangeError(`Unknown generator "${String(step.generate)}"`);
  const exercise = def.make((step.params ?? {}) as never, { rng: createRng(step.seed ?? opts.seed ?? 0), difficulty: Math.min(1, Math.max(0, opts.difficulty ?? 0.3)), level: opts.level ?? 'beginner' });
  if (step.id !== undefined) exercise.id = step.id;
  if (step.fact !== undefined) exercise.fact = step.fact;
  return exercise;
}

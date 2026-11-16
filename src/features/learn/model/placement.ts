/**
 * "Find my level": a short adaptive quiz for learners who already know some theory. It assumes
 * knowledge runs in path order (whoever knows unit 7 knows unit 3) and searches for the first unit
 * the learner does not know: probes at units 1, 2, 4, 8, 16 ... while they pass, then halves the
 * gap after the first miss. A beginner is done after two or three questions; someone who knows half
 * the path, after about eight probes. Each probe is two questions from one unit (a third decides a
 * split). Passing the quiz marks the units below the level done, as a checkpoint pass does.
 */
import { createRng, isGenerated, type ExerciseStep, type Step, type Unit } from '@/lessons';
import { adaptUnit, type Conditions } from './conditions';

/** Questions per probe; one more when they split. */
export const PROBE_QUESTIONS = 2;
/** The most probes one quiz asks (a cap; the search needs at most seven for 43 units). */
export const MAX_PROBES = 9;

/** The search over the units, in path order. */
export interface PlacementSearch {
  /** Units probed, in path order. */
  count: number;
  /** Units [0, known) are known. */
  known: number;
  /** Units [limit, count) are not (limit = count until a probe fails). */
  limit: number;
  /** Still doubling the step (no probe has failed yet). */
  galloping: boolean;
  /** Probes so far: the unit index and whether it was passed. */
  probes: Array<{ index: number; passed: boolean }>;
}

/** A new search over `count` units. */
export function startPlacement(count: number): PlacementSearch {
  return { count: Math.max(0, Math.floor(count)), known: 0, limit: Math.max(0, Math.floor(count)), galloping: true, probes: [] };
}

/** The index of the unit to probe next, or null when the level is found (or the probe budget is spent). */
export function nextProbe(s: PlacementSearch): number | null {
  if (s.known >= s.limit || s.probes.length >= MAX_PROBES) return null;
  if (s.galloping) return Math.min(s.limit - 1, s.known === 0 ? 0 : 2 * s.known - 1);
  return Math.floor((s.known + s.limit - 1) / 2);
}

/** The search after a probe of unit `index`. */
export function recordProbe(s: PlacementSearch, index: number, passed: boolean): PlacementSearch {
  const probes = [...s.probes, { index, passed }];
  if (passed) return { ...s, probes, known: Math.max(s.known, index + 1) };
  return { ...s, probes, limit: Math.min(s.limit, index), galloping: false };
}

/** How many units, from the start of the path, the learner knows (so far). */
export function unitsKnown(s: PlacementSearch): number {
  return s.known;
}

/**
 * Whether a probe is decided by its answers so far: true (passed), false (failed) or null (ask
 * another). Two right passes, two wrong fails, so a split is settled by a third question.
 */
export function probeVerdict(results: readonly boolean[]): boolean | null {
  const right = results.filter(Boolean).length;
  const wrong = results.length - right;
  if (right >= PROBE_QUESTIONS) return true;
  if (wrong >= PROBE_QUESTIONS) return false;
  return null;
}

/**
 * The questions a probe of this unit may ask, in a seeded order: the unit's checkpoint steps (a
 * test-out quiz is the best placement question), else its lessons' questions. Never a play step
 * (they are swapped for their tapping versions) and, without sound, never a listening question.
 */
export function probePool(unit: Unit, conditions: Pick<Conditions, 'sound'>, seed: number): ExerciseStep[] {
  const adapted = adaptUnit(unit, { guitar: false, sound: conditions.sound });
  const fromCheckpoint = adapted.checkpoint?.steps ?? [];
  const fromLessons: ExerciseStep[] = adapted.lessons.flatMap((l) => l.steps.filter(isQuestion));
  const pool = (fromCheckpoint.length >= PROBE_QUESTIONS + 1 ? fromCheckpoint : fromLessons).filter(isQuestion);
  return createRng(seed).shuffle([...pool]);
}

function isQuestion(step: Step): step is ExerciseStep {
  if (isGenerated(step)) return true;
  return step.type !== 'card' && step.type !== 'flashcard';
}

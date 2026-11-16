/**
 * Routines: saved plans the learner can start again. A block of a routine is one of three things:
 *  - an authored exercise (`itemId`),
 *  - text of the learner's own (`title`, `goal`),
 *  - or "planner's choice" for an area (neither): filled fresh each time from what is rusty,
 *    weak or due, so a maintenance routine keeps aiming at the right things.
 * A few good routines ship built in; those can be started and duplicated, not changed.
 */
import type { ExperienceLevel } from '@/core/progress';
import { AREA_INFO, type Area } from './areas';
import { CONTENT_BY_ID } from './content';
import { PRACTICE_LIBRARY } from './library';
import { blockFromItem, chooseForArea, findItem, type PlanBlock, type PlannerInput } from './planner';
import { makeId } from './random';
import { MAX_ROUTINE_NAME, cleanRoutineName, type Routine, type RoutineBlock } from './routine-data';

export { MAX_ROUTINES, MAX_ROUTINE_NAME, parseRoutine, type Routine, type RoutineBlock } from './routine-data';

const choice = (area: Area, minutes: number): RoutineBlock => ({ area, minutes });
const item = (itemId: string, minutes: number): RoutineBlock => ({ area: CONTENT_BY_ID[itemId]?.area ?? 'free', minutes, itemId });

function builtIn(id: string, name: string, level: Routine['level'], description: string, blocks: RoutineBlock[]): Routine {
  return { id, name, description, level, blocks, builtIn: true, createdAt: 0, updatedAt: 0 };
}

/** The routines every learner starts with. */
export const BUILT_IN_ROUTINES: readonly Routine[] = [
  builtIn('builtin-daily-maintenance', '10-minute daily maintenance', 'any', 'A little of everything, aimed at whatever is getting rusty.', [
    choice('warmup', 2),
    choice('chords', 3),
    choice('scales', 3),
    choice('repertoire', 2),
  ]),
  builtIn('builtin-streak-saver', 'Five-minute streak saver', 'any', 'The shortest session that still counts: tune up and play.', [item('tune-and-loosen', 1), choice('repertoire', 4)]),
  builtIn('builtin-chord-bootcamp', 'Chord change bootcamp', 'beginner', 'One-minute changes until G, C, E minor and A minor land without thinking.', [
    item('tune-and-loosen', 2),
    item('first-chords-ring', 3),
    item('change-g-c', 4),
    item('change-em-am', 3),
    item('d-du-udu', 3),
  ]),
  builtIn('builtin-first-month', 'First-month foundations', 'beginner', 'Clean notes, your first chords, steady strumming and a song.', [
    item('finger-walk', 2),
    item('clean-fretting', 3),
    choice('chords', 6),
    item('down-strums', 4),
    item('two-chord-song', 5),
  ]),
  builtIn('builtin-lead-warmup', 'Lead guitar warm-up', 'intermediate', 'Fingers, picking, a pentatonic box, then bends and vibrato in tune.', [
    item('spider-1234', 3),
    item('picking-ladder', 4),
    item('am-pentatonic-box-1', 4),
    item('bends-in-tune', 2),
    item('vibrato', 2),
  ]),
  builtIn('builtin-rhythm-groove', 'Rhythm and groove', 'intermediate', 'Strumming patterns, muted chucks and sixteenths, then a jam.', [
    choice('warmup', 2),
    item('d-du-udu', 5),
    item('chucks', 4),
    item('sixteenths-accents', 4),
    item('jam-progression', 5),
  ]),
  builtIn('builtin-ear-theory', 'Ear and theory', 'any', 'Train your ear, learn one idea, then find a melody by ear.', [
    item('tune-and-loosen', 2),
    choice('ear', 5),
    choice('theory', 5),
    item('find-a-melody', 3),
  ]),
  builtIn('builtin-deep-work', 'Deep work hour', 'expert', 'A full hour: technique, scales, voice leading, ear and a hard passage.', [
    item('spider-permutations', 5),
    choice('technique', 12),
    choice('scales', 10),
    item('ii-v-i', 10),
    choice('ear', 8),
    item('hard-passage', 10),
    item('free-play', 5),
  ]),
];

/** Total minutes of a routine. */
export function routineMinutes(r: Pick<Routine, 'blocks'>): number {
  return r.blocks.reduce((s, b) => s + b.minutes, 0);
}

/** Built-ins that suit a level (and the ones for everyone), the level's own first. */
export function builtInsFor(level: ExperienceLevel): Routine[] {
  const own = BUILT_IN_ROUTINES.filter((r) => r.level === level);
  const any = BUILT_IN_ROUTINES.filter((r) => r.level === 'any');
  const others = BUILT_IN_ROUTINES.filter((r) => r.level !== level && r.level !== 'any');
  return [...own, ...any, ...others];
}

/**
 * Turn the blocks of a plan (or of a finished session) into routine blocks. Authored exercises
 * stay as they are; whatever the planner made for that day (a rusty skill, a goal, "Review 7
 * cards", "Continue <song>", the teacher's next lesson) becomes "planner's choice", since what is
 * due changes. Only blocks the learner wrote keep their text.
 */
export function routineBlocksFromPlan(blocks: ReadonlyArray<Pick<PlanBlock, 'area' | 'title' | 'goal' | 'itemId' | 'skillId' | 'goalId' | 'reasonKind'> & { minutes: number }>): RoutineBlock[] {
  return blocks.map((b) => {
    if (b.itemId && findItem(b.itemId, PRACTICE_LIBRARY)) return { area: b.area, minutes: b.minutes, itemId: b.itemId };
    if (b.itemId || b.skillId || b.goalId || b.reasonKind === 'due' || b.reasonKind === 'continue') return { area: b.area, minutes: b.minutes };
    return { area: b.area, minutes: b.minutes, title: b.title, goal: b.goal };
  });
}

/** A new routine saved from a plan. */
export function createRoutine(name: string, blocks: readonly PlanBlock[], now: number, id = makeId('r')): Routine {
  return {
    id,
    name: cleanRoutineName(name) || 'My routine',
    description: '',
    level: 'any',
    blocks: routineBlocksFromPlan(blocks),
    builtIn: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** A name for a copy that is not taken yet: "Lead guitar warm-up (copy)", "(copy 2)" ... */
export function copyName(name: string, taken: readonly string[]): string {
  const base = cleanRoutineName(name).replace(/ \(copy(?: \d+)?\)$/, '');
  const names = new Set(taken);
  let candidate = `${base} (copy)`;
  for (let n = 2; names.has(candidate); n++) candidate = `${base} (copy ${n})`;
  return candidate.slice(0, MAX_ROUTINE_NAME);
}

/** An editable copy of any routine (built-ins included). */
export function duplicateRoutine(r: Routine, taken: readonly string[], now: number, id = makeId('r')): Routine {
  return { ...r, id, name: copyName(r.name, taken), builtIn: false, blocks: r.blocks.map((b) => ({ ...b })), createdAt: now, updatedAt: now };
}

/** Rename (an empty name keeps the old one). */
export function renameRoutine(r: Routine, name: string, now: number): Routine {
  const clean = cleanRoutineName(name);
  return clean ? { ...r, name: clean, updatedAt: now } : r;
}

/** Replace a routine's blocks from an edited plan. */
export function updateRoutineBlocks(r: Routine, blocks: readonly PlanBlock[], now: number): Routine {
  return { ...r, blocks: routineBlocksFromPlan(blocks), updatedAt: now };
}

/**
 * The plan a routine runs as today: exercises as written, the learner's own text as written, and
 * "planner's choice" blocks filled from today's signals. An exercise that no longer exists (a
 * routine saved by an older version, or synced from one) becomes planner's choice for its area.
 */
export function planFromRoutine(r: Pick<Routine, 'blocks' | 'name'>, input: PlannerInput): PlanBlock[] {
  const out: PlanBlock[] = [];
  const library = input.library ?? PRACTICE_LIBRARY;
  for (const b of r.blocks) {
    const minutes = Math.max(1, Math.round(b.minutes));
    let block: PlanBlock | null = null;
    if (b.itemId) block = blockFromItem(b.itemId, minutes, library) ?? chooseForArea(b.area, minutes, input, out);
    else if (b.title) {
      block = { id: makeId('b'), area: b.area, minutes, title: b.title, goal: b.goal ?? '', target: AREA_INFO[b.area].target };
    } else {
      block = chooseForArea(b.area, minutes, input, out);
    }
    out.push(
      block ? { ...block, id: makeId('b') } : { id: makeId('b'), area: b.area, minutes, title: AREA_INFO[b.area].label, goal: '', target: AREA_INFO[b.area].target },
    );
  }
  return out;
}

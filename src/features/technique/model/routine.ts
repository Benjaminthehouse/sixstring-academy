/**
 * A timed routine (warm-up, cool-down) as plain state: which step, seconds left, running or not,
 * finished or not. The screen ticks it once a second and plays a sound on the events. Pure.
 */

/** Where a routine is. */
export interface RoutineState {
  index: number;
  left: number;
  running: boolean;
  finished: boolean;
}

/** What a tick did, for the screen's sounds. */
export type RoutineEvent = 'next' | 'done' | null;

type Steps = ReadonlyArray<{ seconds: number }>;

/** The routine at its first step, not running. */
export function routineStart(steps: Steps): RoutineState {
  return { index: 0, left: steps[0]?.seconds ?? 0, running: false, finished: false };
}

/** One second passes: count down, move to the next step at zero, finish after the last one. */
export function routineTick(s: RoutineState, steps: Steps): { state: RoutineState; event: RoutineEvent } {
  if (!s.running || s.finished) return { state: s, event: null };
  if (s.left > 1) return { state: { ...s, left: s.left - 1 }, event: null };
  if (s.index + 1 < steps.length) return { state: { ...s, index: s.index + 1, left: steps[s.index + 1].seconds }, event: 'next' };
  return { state: { ...s, left: 0, running: false, finished: true }, event: 'done' };
}

/** The main button and Space: start or pause; once finished, start again from the top. */
export function routineToggle(s: RoutineState, steps: Steps): RoutineState {
  if (s.finished) return { ...routineStart(steps), running: true };
  return { ...s, running: !s.running };
}

/** Jump to a step (back, skip); keeps running if it was. */
export function routineGoTo(s: RoutineState, steps: Steps, index: number): RoutineState {
  const k = Math.max(0, Math.min(steps.length - 1, index));
  return { ...s, index: k, left: steps[k]?.seconds ?? 0, finished: false };
}

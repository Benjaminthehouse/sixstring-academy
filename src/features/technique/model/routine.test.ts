import { describe, expect, it } from 'vitest';
import { getExercise } from '@/content/technique';
import { routineGoTo, routineStart, routineTick, routineToggle, type RoutineState } from './routine';

const STEPS = [{ seconds: 3 }, { seconds: 2 }];

/** Tick `n` seconds, collecting the events. */
function run(s: RoutineState, n: number): { state: RoutineState; events: string[] } {
  const events: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = routineTick(s, STEPS);
    s = r.state;
    if (r.event) events.push(r.event);
  }
  return { state: s, events };
}

describe('routine', () => {
  it('counts each step down for its full length, then moves on, then finishes', () => {
    const started = routineToggle(routineStart(STEPS), STEPS);
    expect(started).toEqual({ index: 0, left: 3, running: true, finished: false });
    const a = run(started, 3);
    expect(a.events).toEqual(['next']);
    expect(a.state).toMatchObject({ index: 1, left: 2, running: true });
    const b = run(a.state, 2);
    expect(b.events).toEqual(['done']);
    expect(b.state).toEqual({ index: 1, left: 0, running: false, finished: true });
    // Nothing happens while paused or finished.
    expect(run(b.state, 5).events).toEqual([]);
  });

  it('starts again from the top after the end (it used to finish again at once)', () => {
    const done = run(routineToggle(routineStart(STEPS), STEPS), 5).state;
    expect(done.finished).toBe(true);
    const again = routineToggle(done, STEPS);
    expect(again).toEqual({ index: 0, left: 3, running: true, finished: false });
    expect(run(again, 1).events).toEqual([]);
  });

  it('pauses and carries on where it was', () => {
    const s = run(routineToggle(routineStart(STEPS), STEPS), 1).state;
    const paused = routineToggle(s, STEPS);
    expect(paused).toMatchObject({ index: 0, left: 2, running: false });
    expect(routineToggle(paused, STEPS)).toMatchObject({ index: 0, left: 2, running: true });
  });

  it('jumps between steps within the routine and resets the step time', () => {
    const s = routineToggle(routineStart(STEPS), STEPS);
    expect(routineGoTo(s, STEPS, 1)).toMatchObject({ index: 1, left: 2, running: true });
    expect(routineGoTo(s, STEPS, 9).index).toBe(1);
    expect(routineGoTo(s, STEPS, -1).index).toBe(0);
  });

  it('runs the real warm-up in five minutes', () => {
    const steps = getExercise('tech-warm-up')!.routine!;
    const r = run(routineToggle(routineStart(steps), steps), 0);
    let s = r.state;
    let seconds = 0;
    while (!s.finished && seconds < 1000) {
      s = routineTick(s, steps).state;
      seconds++;
    }
    expect(seconds).toBe(300);
  });
});

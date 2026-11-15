/**
 * Test helpers for the progress module (not exported from the barrel): a controllable clock,
 * manual timers, and a store wired to in-memory storage.
 */
import { createActions, type ProgressActions } from './actions';
import type { ProgressEvent } from './events';
import { memoryStorage, type StorageAdapter } from './persist';
import { createProgressStore, type ProgressStore, type Timers } from './store';
import type { Clock } from './time';

/** A clock whose time and zone the test sets. */
export interface TestClock extends Clock {
  /** Current time in epoch ms. */
  t: number;
  timeZone: string | undefined;
  /** Jump to an ISO instant (`2026-03-01T08:00:00Z`) or epoch ms. */
  set(when: string | number): void;
  /** Move forward by milliseconds. */
  advance(ms: number): void;
  /** Move forward by minutes. */
  minutes(n: number): void;
  /** Move forward by whole 24-hour periods. */
  days(n: number): void;
}

/** Parse an ISO instant. */
export function at(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`bad date: ${iso}`);
  return ms;
}

/** A clock starting at `start` in `timeZone` (default UTC, so tests do not depend on the machine). */
export function testClock(start: string | number = '2026-03-02T09:00:00Z', timeZone: string | undefined = 'UTC'): TestClock {
  const clock: TestClock = {
    t: typeof start === 'number' ? start : at(start),
    timeZone,
    now() {
      return this.t;
    },
    set(when) {
      this.t = typeof when === 'number' ? when : at(when);
    },
    advance(ms) {
      this.t += ms;
    },
    minutes(n) {
      this.t += n * 60_000;
    },
    days(n) {
      this.t += n * 86_400_000;
    },
  };
  return clock;
}

/** Timers that only fire when the test says so. */
export interface ManualTimers extends Timers {
  /** Timers waiting to fire. */
  pending(): number;
  /** Fire every waiting timer. */
  run(): void;
  /** Delays requested so far. */
  delays: number[];
}

/** Timers under test control. */
export function manualTimers(): ManualTimers {
  let next = 1;
  const waiting = new Map<number, () => void>();
  const delays: number[] = [];
  return {
    delays,
    set(fn, ms) {
      const id = next++;
      waiting.set(id, fn);
      delays.push(ms);
      return id;
    },
    clear(handle) {
      waiting.delete(handle as number);
    },
    pending: () => waiting.size,
    run() {
      for (const [id, fn] of [...waiting]) {
        waiting.delete(id);
        fn();
      }
    },
  };
}

/** Everything a store test needs. */
export interface TestRig {
  store: ProgressStore;
  actions: ProgressActions;
  clock: TestClock;
  storage: StorageAdapter & { data: Map<string, string> };
  timers: ManualTimers;
  /** Every event emitted so far. */
  events: ProgressEvent[];
  /** Events of one type. */
  eventsOf<T extends ProgressEvent['type']>(type: T): Array<Extract<ProgressEvent, { type: T }>>;
}

/** A store on a test clock, in-memory storage and manual timers. */
export function makeRig(options: { start?: string | number; timeZone?: string; storage?: StorageAdapter & { data: Map<string, string> }; clock?: TestClock; deviceId?: string } = {}): TestRig {
  const clock = options.clock ?? testClock(options.start, options.timeZone ?? 'UTC');
  const storage = options.storage ?? memoryStorage();
  const timers = manualTimers();
  const store = createProgressStore({ clock, storage, timers, deviceId: options.deviceId ?? 'testdevice' });
  const events: ProgressEvent[] = [];
  store.onAny((event) => events.push(event));
  return {
    store,
    actions: createActions(() => store),
    clock,
    storage,
    timers,
    events,
    eventsOf: (type) => events.filter((e): e is Extract<ProgressEvent, { type: typeof type }> => e.type === type),
  };
}

/** Freeze an object graph so any mutation throws (tests run in strict mode). */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

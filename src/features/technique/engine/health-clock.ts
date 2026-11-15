/**
 * The health clock shared by every technique screen in this visit to the app: it keeps counting
 * playing time as the learner moves between exercises, so the break prompt comes after a long
 * stretch of technique work, not after a long time on one screen.
 */
import { useSyncExternalStore } from 'react';
import { newHealth, reminderDue, snoozeBreak, tensionSeen, tickHealth, tookBreak, type HealthState } from '../model/health';

let state: HealthState = newHealth();
/** What screens see: only replaced when something shown changes. */
let snapshot: HealthState = state;
let tensionCount = 0;
const listeners = new Set<() => void>();

function notify(): void {
  snapshot = state;
  for (const fn of listeners) fn();
}

function set(next: HealthState): void {
  if (next === state) return;
  state = next;
  // Re-render only when a reminder appears or goes, or a new minute of playing starts.
  if (reminderDue(state) !== reminderDue(snapshot) || Math.floor(state.playedSec / 60) !== Math.floor(snapshot.playedSec / 60)) notify();
}

/** Count `dtSec` of time; `playing` when the click, a take or a routine is running. */
export function tickHealthClock(dtSec: number, playing: boolean): void {
  set(tickHealth(state, Date.now(), dtSec, playing));
}

/** The learner chose to keep going. */
export function keepGoing(): void {
  state = snoozeBreak(state);
  notify();
}

/** The learner is taking a break. */
export function takeBreak(): void {
  state = tookBreak(state);
  notify();
}

/** A tension check was dismissed. */
export function dismissTension(): void {
  tensionCount++;
  state = tensionSeen(state);
  notify();
}

/** Which tension line to show next. */
export function tensionIndex(): number {
  return tensionCount;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const getSnapshot = (): HealthState => snapshot;

/** The clock, re-rendering when a reminder appears or a minute passes. */
export function useHealthClock(): HealthState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Tests: start again. */
export function resetHealthClock(): void {
  state = newHealth();
  tensionCount = 0;
  notify();
}

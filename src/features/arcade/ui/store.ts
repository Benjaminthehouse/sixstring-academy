/**
 * The arcade's records in the browser: read once from platform storage (key `arcade`), kept in
 * memory, written back on every change, and shared with React through `useSyncExternalStore`.
 */
import { useSyncExternalStore } from 'react';
import { readJSON, writeJSON } from '@/core/platform';
import { learnerTuning } from '@/core/settings';
import { normalizeFocus, type Focus } from '../core/focus';
import { sanitizeRecords, type ArcadeRecords } from '../core/records';

/** Storage key of the arcade's records (platform storage adds its own prefix). */
export const ARCADE_KEY = 'arcade';

let state: ArcadeRecords | null = null;
const listeners = new Set<() => void>();

function load(): ArcadeRecords {
  if (!state) {
    const raw = sanitizeRecords(readJSON<unknown>(ARCADE_KEY, null));
    state = { ...raw, focus: normalizeFocus(raw.focus, safeTuning()) };
  }
  return state;
}

function safeTuning() {
  try {
    return learnerTuning();
  } catch {
    return undefined;
  }
}

/** The current records. */
export function getRecords(): ArcadeRecords {
  return load();
}

/** Change the records (the function gets the current value and returns the next). */
export function updateRecords(fn: (r: ArcadeRecords) => ArcadeRecords): ArcadeRecords {
  const next = fn(load());
  if (next === state) return next;
  state = next;
  writeJSON(ARCADE_KEY, next);
  for (const l of [...listeners]) l();
  return next;
}

/** Set what is being practised (validated against the engine first). */
export function setFocus(focus: Partial<Focus>): Focus {
  const current = load().focus;
  const next = normalizeFocus({ ...current, ...focus }, safeTuning());
  if (next.tonic !== current.tonic || next.scale !== current.scale || next.shape !== current.shape) updateRecords((r) => ({ ...r, focus: next }));
  return next;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** The records in a component (re-renders on every change; the records are small). */
export function useRecords(): ArcadeRecords {
  return useSyncExternalStore(subscribe, load, load);
}

/** Forget the in-memory copy (tests). */
export function resetRecordsCache(): void {
  state = null;
}

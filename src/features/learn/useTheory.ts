/**
 * The Theory Path as the screens see it: drawn at once from the outline, then filled in as each
 * written unit's chunk arrives (in the background, the unit on screen first). One load per app
 * session, shared by the map and every lesson route.
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { Unit } from '@/lessons';
import { useLocalState } from '@/ui';
import { assembleTheory, isUnitWritten, loadUnit, writtenUnitIds, type TheoryCourse } from '@/content/theory';
import { AT_THE_GUITAR, type Conditions } from './model/conditions';

interface LoadState {
  units: ReadonlyMap<string, Unit>;
  failed: ReadonlySet<string>;
  /** Changes with every arrival, for memo keys. */
  version: number;
}

let state: LoadState = { units: new Map(), failed: new Set(), version: 0 };
const listeners = new Set<() => void>();
let started = false;

function emit(next: LoadState): void {
  state = next;
  for (const l of listeners) l();
}

function fetchUnit(id: string): void {
  if (state.units.has(id)) return;
  loadUnit(id).then(
    (unit) => {
      if (!unit || state.units.has(id)) return;
      const units = new Map(state.units);
      units.set(id, unit);
      const failed = new Set(state.failed);
      failed.delete(id);
      emit({ units, failed, version: state.version + 1 });
    },
    () => {
      const failed = new Set(state.failed);
      failed.add(id);
      emit({ ...state, failed, version: state.version + 1 });
    },
  );
}

/** Start loading every written unit, `first` before the others. */
function ensureLoading(first?: string | null): void {
  if (first && isUnitWritten(first)) fetchUnit(first);
  if (started) return;
  started = true;
  for (const id of writtenUnitIds()) fetchUnit(id);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const snapshot = (): LoadState => state;

/** The path as loaded so far. */
export interface TheoryHandle {
  theory: TheoryCourse;
  /** Units whose chunk failed to load (offline on first visit, say). */
  failed: ReadonlySet<string>;
  /** Try the failed units again. */
  retry: () => void;
}

/** The Theory Path, filling in as units load. `priority` loads first (the unit on screen). */
export function useTheory(priority?: string | null): TheoryHandle {
  ensureLoading(priority);
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  const theory = useMemo(() => assembleTheory(s.units.values()), [s.units]);
  const retry = useCallback(() => {
    for (const id of state.failed) fetchUnit(id);
  }, []);
  return { theory, failed: s.failed, retry };
}

/** Guitar at hand, sound allowed: the learner's "on the go" switches (kept on this device). */
export function useConditions(): [Conditions, (next: Conditions) => void] {
  const [value, setValue] = useLocalState<Conditions>('learn.conditions', AT_THE_GUITAR);
  // Damaged storage must not break the screen.
  const safe: Conditions = { guitar: value?.guitar !== false, sound: value?.sound !== false };
  return [safe, setValue];
}

/**
 * React access to the practice data (routines, journal, goals) and to the plan being edited.
 */
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { readJSON, writeJSON } from '@/core/platform';
import { getProgress, getProgressStore, useProgress, type DayKey, type ProgressState } from '@/core/progress';
import { isArea } from './model/areas';
import { buildPlan, type PlanBlock, type PlannerInput } from './model/planner';
import { planFromRoutine, type Routine } from './model/routines';
import { plannerInputFrom } from './model/signals';
import { getPracticeData, subscribePracticeData, type PracticeData } from './model/store';

/** Subscribe to a slice of the practice data (return slices, not new objects). */
export function usePracticeData<T>(select: (d: PracticeData) => T): T {
  const selectRef = useRef(select);
  selectRef.current = select;
  const get = useCallback(() => selectRef.current(getPracticeData()), []);
  return useSyncExternalStore(subscribePracticeData, get, get);
}

/** Where the plan being edited came from. */
export type DraftSource = { kind: 'auto' } | { kind: 'routine'; routineId: string; name: string; builtIn: boolean };

/** The plan on the Plan tab, kept across reloads for the day. */
export interface PlanDraft {
  day: DayKey;
  /** The duration chosen (the blocks may add up to something else once edited). */
  minutes: number;
  seed: number;
  source: DraftSource;
  /** Changed by hand since it was built. */
  edited: boolean;
  blocks: PlanBlock[];
}

const DRAFT_KEY = 'practice.draft';

function parseDraft(value: unknown): PlanDraft | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.day !== 'string' || typeof v.minutes !== 'number' || !Array.isArray(v.blocks)) return null;
  const blocks = v.blocks.filter(
    (b): b is PlanBlock =>
      typeof b === 'object' && b !== null && typeof (b as PlanBlock).id === 'string' && isArea((b as PlanBlock).area) && typeof (b as PlanBlock).minutes === 'number' && typeof (b as PlanBlock).title === 'string',
  );
  if (blocks.length === 0) return null;
  const source = v.source as DraftSource | undefined;
  return {
    day: v.day,
    minutes: v.minutes,
    seed: typeof v.seed === 'number' ? v.seed : 0,
    source: source && source.kind === 'routine' && typeof source.routineId === 'string' ? source : { kind: 'auto' },
    edited: v.edited === true,
    blocks: blocks.map((b) => ({ ...b, minutes: Math.min(60, Math.max(1, Math.round(b.minutes))), target: b.target ?? null })),
  };
}

let draft: PlanDraft | null = null;
let draftLoaded = false;
const draftListeners = new Set<() => void>();

function getDraft(): PlanDraft | null {
  if (!draftLoaded) {
    draftLoaded = true;
    draft = parseDraft(readJSON<unknown>(DRAFT_KEY, null));
  }
  return draft;
}

/** Replace the draft (and save it). */
export function setDraft(next: PlanDraft): void {
  draft = next;
  draftLoaded = true;
  writeJSON(DRAFT_KEY, next);
  for (const l of [...draftListeners]) l();
}

function subscribeDraft(listener: () => void): () => void {
  draftListeners.add(listener);
  return () => {
    draftListeners.delete(listener);
  };
}

/** The planner input for now, from the progress store and the practice data. */
export function currentPlannerInput(minutes: number, seed = 0, state: ProgressState = getProgress()): PlannerInput {
  const data = getPracticeData();
  return plannerInputFrom(state, getProgressStore().now(), { journal: data.journal, goals: data.goals }, minutes, seed);
}

/** A fresh automatic plan. */
export function autoDraft(minutes: number, seed = 0): PlanDraft {
  const input = currentPlannerInput(minutes, seed);
  return { day: input.day, minutes, seed, source: { kind: 'auto' }, edited: false, blocks: buildPlan(input) };
}

/** A draft loaded from a routine. */
export function routineDraft(routine: Routine): PlanDraft {
  const total = routine.blocks.reduce((s, b) => s + b.minutes, 0);
  const input = currentPlannerInput(total);
  return {
    day: input.day,
    minutes: total,
    seed: 0,
    source: { kind: 'routine', routineId: routine.id, name: routine.name, builtIn: routine.builtIn },
    edited: false,
    blocks: planFromRoutine(routine, input),
  };
}

/**
 * The plan on the Plan tab, one per day. An automatic plan nobody edited is rebuilt when the goals
 * change or a session is logged (so the next plan reflects it); an edited plan or a loaded routine
 * is kept for the day. The first paint already shows a real plan.
 */
export function usePlanDraft(defaultMinutes: number): PlanDraft {
  const current = useSyncExternalStore(subscribeDraft, getDraft, getDraft);
  const today = useProgress((s) => s.meta.today);
  const goals = usePracticeData((d) => d.goals);
  const sessions = usePracticeData((d) => d.journal.length);
  const valid = current && current.day === today ? current : null;
  const fallback = useMemo(() => (valid ? null : autoDraft(current?.minutes ?? defaultMinutes)), [valid, current, defaultMinutes]);

  useEffect(() => {
    if (fallback) setDraft(fallback);
  }, [fallback]);

  const seen = useRef({ goals, sessions });
  useEffect(() => {
    if (seen.current.goals === goals && seen.current.sessions === sessions) return;
    const newSession = seen.current.sessions !== sessions;
    seen.current = { goals, sessions };
    const d = getDraft();
    if (d && d.source.kind === 'auto' && !d.edited) setDraft(autoDraft(d.minutes, newSession ? d.seed + 1 : d.seed));
  }, [goals, sessions]);

  return valid ?? (fallback as PlanDraft);
}

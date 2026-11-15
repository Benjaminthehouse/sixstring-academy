/**
 * A progress port that keeps nothing: a fresh in-memory progress store (full hearts, no history).
 * Galleries and try-outs run real sessions on it without touching the learner's progress.
 */
import { createProgressStore } from '@/core/progress';
import { progressPort, type ProgressPort } from '../effects';

/** A port onto a new, throwaway progress store. */
export function memoryPort(): ProgressPort {
  return progressPort(createProgressStore({ storage: null }));
}

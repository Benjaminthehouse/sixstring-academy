/**
 * Saving an unfinished session so a learner who closes the app mid-lesson can pick it up again.
 * One slot per session mode, in platform storage (which falls back to memory when the browser
 * cannot store anything, so this never throws).
 *
 *   saveSession(state)                      after every reducer step
 *   loadSession({ mode: 'lesson', lessonId }, { now })   when the screen opens
 *   then dispatch { type: 'resume', at: now, hearts }    so time away is not counted
 */
import { readRaw, remove, writeRaw } from '@/core/platform/storage';
import { isResumable, restoreSession, serializeSession, type SessionMode, type SessionState } from './session';

/** Storage key of a mode's slot. */
export function sessionStorageKey(mode: SessionMode): string {
  return `lesson-session.${mode}`;
}

/** A saved session is offered for this long; after that the learner starts afresh. */
export const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Save the session (or clear its slot once it has ended or has nothing worth keeping).
 * Returns true when something resumable is now stored.
 */
export function saveSession(state: SessionState): boolean {
  if (!isResumable(state)) {
    remove(sessionStorageKey(state.mode));
    return false;
  }
  writeRaw(sessionStorageKey(state.mode), serializeSession(state));
  return true;
}

/** What a saved session must match to be offered. */
export interface SessionMatch {
  mode: SessionMode;
  courseId?: string;
  unitId?: string;
  lessonId?: string;
}

/**
 * The unfinished session of a mode, when it matches (same course, unit, lesson when given) and is
 * not older than `maxAgeMs`. Anything else (nothing saved, another lesson, damaged data, too old)
 * gives null.
 */
export function loadSession(match: SessionMatch, opts: { now?: number; maxAgeMs?: number } = {}): SessionState | null {
  const state = restoreSession(readRaw(sessionStorageKey(match.mode)));
  if (state === null || !isResumable(state) || state.mode !== match.mode) return null;
  if (match.courseId !== undefined && state.courseId !== match.courseId) return null;
  if (match.unitId !== undefined && state.unitId !== match.unitId) return null;
  if (match.lessonId !== undefined && state.lessonId !== match.lessonId) return null;
  if (opts.now !== undefined && opts.now - state.stepStartedAt > (opts.maxAgeMs ?? SESSION_MAX_AGE_MS)) return null;
  return state;
}

/** Forget the saved session of a mode. */
export function clearSession(mode: SessionMode): void {
  remove(sessionStorageKey(mode));
}

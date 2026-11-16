/**
 * The running practice session, shared by the session runner and the small global bar: one
 * instance per tab that owns the state, ticks the clock, saves after every change (so a reload
 * resumes), chimes between blocks and, when the session ends, logs it once to the progress store
 * and the journal.
 *
 * The clock is `Date.now` unless a test sets another with `setSessionClock`; browser checks fake
 * time with Playwright's clock instead, which drives these timers too.
 */
import { useSyncExternalStore } from 'react';
import { getProgress, markSkill, recordActivity } from '@/core/progress';
import { readJSON, remove, writeJSON } from '@/core/platform/storage';
import { entryFromSession, MIN_SAVED_SEC, overlapSeconds } from '../model/journal';
import type { PlanBlock } from '../model/planner';
import { makeId } from '../model/random';
import {
  advance,
  blockRemainingMs,
  currentBlock,
  endSession,
  extendBlock,
  nextBlock,
  parseSession,
  pauseSession,
  plannedMs,
  practisedMs,
  resumeSession,
  sessionRemainingMs,
  startSession,
  togglePause,
  withResult,
  type SessionBlock,
  type SessionEvent,
  type SessionResult,
  type SessionState,
  type SessionStep,
} from '../model/session';
import { addJournalEntry } from '../model/store';

/** Storage key of the running session. */
export const SESSION_KEY = 'practice.session';
/** How often the clock is read while running. */
export const TICK_MS = 250;

/** What screens render: the state plus the numbers they show. */
export interface SessionView {
  state: SessionState;
  block: SessionBlock | null;
  /** Whole seconds left in the current block (rounded up, so 0 only when it is over). */
  remainingSec: number;
  /** Planned seconds of the current block. */
  blockSec: number;
  /** Whole seconds practised so far. */
  practisedSec: number;
  plannedSec: number;
  /** Seconds left in the whole session. */
  sessionLeftSec: number;
}

/** The last thing that happened, for announcements ("Next: Chords and changes"). */
export interface SessionNews {
  events: SessionEvent[];
  at: number;
}

let now: () => number = () => Date.now();
let state: SessionState | null = null;
let view: SessionView | null = null;
let loaded = false;
let timer: ReturnType<typeof setInterval> | null = null;
let lastSavedSecond = -1;
let news: SessionNews = { events: [], at: 0 };
const listeners = new Set<() => void>();

/** Tests: use another clock. */
export function setSessionClock(clock: () => number): void {
  now = clock;
}

// ---------------------------------------------------------------------------------------------
// Sounds (the engine is a lazy chunk; without it the session is simply silent)
// ---------------------------------------------------------------------------------------------

function chime(name: 'correct' | 'lessonComplete'): void {
  void import('@/core/audio')
    .then((audio) => {
      try {
        audio.playUi(name);
      } catch {
        // Sounds are optional.
      }
    })
    .catch(() => undefined);
}

function unlockSound(): void {
  void import('@/core/audio').then((audio) => audio.unlockAudio()).catch(() => undefined);
}

// ---------------------------------------------------------------------------------------------
// State plumbing
// ---------------------------------------------------------------------------------------------

function makeView(s: SessionState | null): SessionView | null {
  if (!s) return null;
  const block = currentBlock(s);
  return {
    state: s,
    block,
    remainingSec: Math.ceil(blockRemainingMs(s) / 1000),
    blockSec: block?.plannedSec ?? 0,
    practisedSec: Math.floor(practisedMs(s) / 1000),
    plannedSec: Math.round(plannedMs(s) / 1000),
    sessionLeftSec: Math.ceil(sessionRemainingMs(s) / 1000),
  };
}

function sameView(a: SessionView | null, b: SessionView | null): boolean {
  if (!a || !b) return a === b;
  return a.state.id === b.state.id && a.state.status === b.state.status && a.state.index === b.state.index && a.remainingSec === b.remainingSec && a.blockSec === b.blockSec && a.state.result === b.state.result && a.state.pausedBy === b.state.pausedBy && a.state.blocks.length === b.state.blocks.length;
}

function emit(force = false): void {
  const next = makeView(state);
  if (!force && sameView(view, next)) return;
  view = next;
  for (const l of [...listeners]) l();
}

function save(force = false): void {
  if (!state) {
    remove(SESSION_KEY);
    return;
  }
  const second = Math.floor(practisedMs(state) / 1000);
  if (!force && second === lastSavedSecond) return;
  lastSavedSecond = second;
  writeJSON(SESSION_KEY, state);
}

function syncTimer(): void {
  const running = state?.status === 'running';
  if (running && !timer) timer = setInterval(tick, TICK_MS);
  if (!running && timer) {
    clearInterval(timer);
    timer = null;
  }
}

function tick(): void {
  if (!state || state.status !== 'running') {
    syncTimer();
    return;
  }
  apply(advance(state, now()), { sound: true, force: false });
}

/** Take a step's result: finish and log if it ended, chime between blocks, save, tell the screens. */
function apply(step: SessionStep, opts: { sound: boolean; force: boolean }): void {
  const before = state;
  state = step.state;
  const finished = step.events.some((e) => e.type === 'finished');
  if (step.events.length > 0) news = { events: step.events, at: now() };
  if (finished && !state.result) state = finalize(state, opts.sound);
  else if (opts.sound && step.events.some((e) => e.type === 'block-done')) chime('correct');
  // Ticks change `rev` every time; only structural changes force a save and a render.
  const changed = opts.force || finished || before?.status !== state.status || before?.index !== state.index;
  save(changed);
  syncTimer();
  emit(changed);
}

function load(): void {
  if (loaded) return;
  loaded = true;
  state = parseSession(readJSON<unknown>(SESSION_KEY, null));
  if (state) {
    // Catch up with the time that passed while the page was gone (a reload, a closed tab).
    apply(advance(state, now()), { sound: false, force: true });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key !== null && !event.key.endsWith(SESSION_KEY)) return;
      const theirs = parseSession(readJSON<unknown>(SESSION_KEY, null));
      if (!theirs) state = null;
      else if (!state || theirs.id !== state.id || theirs.rev > state.rev) state = theirs;
      else return;
      syncTimer();
      emit(true);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') tick();
      else if (state) save(true);
    });
    window.addEventListener('pagehide', () => {
      if (state) save(true);
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------------------------

/** Log a finished session once: the progress store (XP, streak, minutes), refreshed skills, the journal. */
function finalize(s: SessionState, sound: boolean): SessionState {
  if (s.result) return s;
  // Another tab may have logged this very session a moment ago.
  const stored = parseSession(readJSON<unknown>(SESSION_KEY, null));
  if (stored && stored.id === s.id && stored.result) return stored;

  const practisedSec = Math.round(practisedMs(s) / 1000);
  if (practisedSec < MIN_SAVED_SEC) {
    return withResult(s, { saved: false, xp: 0, loggedSec: 0, goalMet: false, goalMetNow: false, streak: 0, streakExtended: false, leveledUp: false, level: 0 });
  }
  // Time spent in activities that other screens recorded while the session's clock ran (a scale
  // game the learner opened from a block) is already in the log: do not count it twice. One done
  // during a pause was never on the session's clock, so it takes nothing off.
  const overlap = overlapSeconds(getProgress().log, s.runs);
  const loggedSec = Math.max(0, practisedSec - overlap);
  const planned = Math.max(1, Math.round(plannedMs(s) / 1000));
  const done = s.outcome.filter((o) => o === 'done').length;
  const r = recordActivity({
    kind: 'practice',
    title: s.title,
    durationSec: loggedSec,
    startedAt: s.startedAt,
    route: 'practice',
    params: [],
    progress: Math.min(1, practisedSec / planned),
    meta: { blocks: s.blocks.length, done, plannedMin: Math.round(planned / 60) },
  });
  // A refresh block that was worked through brings that skill back to full strength.
  const skills = getProgress().skills;
  s.blocks.forEach((b, i) => {
    if (b.skillId && skills[b.skillId] && s.spentMs[i] >= b.plannedSec * 500) markSkill(b.skillId, {});
  });
  const result: SessionResult = {
    saved: true,
    entryId: s.id,
    xp: r.xp,
    loggedSec,
    goalMet: r.goal.met,
    goalMetNow: r.goal.metNow,
    streak: r.streak.current,
    streakExtended: r.streak.extended,
    leveledUp: r.leveledUp,
    level: r.level,
  };
  addJournalEntry(entryFromSession(s, result, getProgress().meta.today));
  // The shell plays its own sound for goals, streaks, levels, quests and achievements.
  const shellCelebrates = r.leveledUp || r.achievements.length > 0 || r.goal.metNow || r.streak.extended || r.quests.length > 0;
  if (sound && !shellCelebrates) chime('lessonComplete');
  else if (sound) chime('correct');
  return withResult(s, result);
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

/** The session as screens see it, or null when none is running. */
export function getSessionView(): SessionView | null {
  load();
  if (!view && state) view = makeView(state);
  return view;
}

/** The last events (block finished, session finished ...). */
export function getSessionNews(): SessionNews {
  return news;
}

/** Listen for changes (at most once per displayed second while running). */
export function subscribeSession(listener: () => void): () => void {
  load();
  listeners.add(listener);
  syncTimer();
  return () => {
    listeners.delete(listener);
  };
}

/** Start a session (replacing any finished one). Call from the Start button's handler. */
export function startPracticeSession(blocks: readonly PlanBlock[], meta: { title: string; routineId?: string }): SessionState {
  load();
  unlockSound();
  state = startSession(blocks, now(), { id: makeId('s'), title: meta.title, routineId: meta.routineId });
  news = { events: [{ type: 'block-start', index: 0 }], at: now() };
  lastSavedSecond = -1;
  save(true);
  syncTimer();
  emit(true);
  return state;
}

function act(fn: (s: SessionState, t: number) => SessionStep): void {
  load();
  if (!state) return;
  apply(fn(state, now()), { sound: true, force: true });
}

/** Pause the clock. */
export const pausePractice = (): void => act(pauseSession);
/** Resume. */
export const resumePractice = (): void => act(resumeSession);
/** Pause or resume. */
export const togglePractice = (): void => act(togglePause);
/** Move on to the next block (finishes the session after the last one). */
export const nextPracticeBlock = (): void => act(nextBlock);
/** End now, keeping what was practised. */
export const endPractice = (): void => act(endSession);
/** Add (or with a negative number take away) seconds on the current block. */
export function extendPracticeBlock(seconds: number): void {
  act((s, t) => extendBlock(s, t, seconds));
}

/** Forget the finished session (after its summary). */
export function dismissPractice(): void {
  load();
  state = null;
  view = null;
  save(true);
  syncTimer();
  emit(true);
}

/** Bring the session up to date now (after the clock was changed by a test or the page woke up). */
export function refreshPractice(): void {
  load();
  tick();
}

/** React: the session view, re-rendering once per displayed second while it runs. */
export function useSession(): SessionView | null {
  return useSyncExternalStore(subscribeSession, getSessionView, () => null);
}

/** Whether a session exists and where it is: changes far less often than the view. */
export type SessionStatusSummary = 'none' | 'live' | 'finished';

function getStatusSummary(): SessionStatusSummary {
  const v = getSessionView();
  return !v ? 'none' : v.state.status === 'finished' ? 'finished' : 'live';
}

/** React: only whether a session is live or finished (no re-render per second). */
export function useSessionStatus(): SessionStatusSummary {
  return useSyncExternalStore(subscribeSession, getStatusSummary, () => 'none');
}

/** Tests: forget everything in memory. */
export function resetSessionForTests(): void {
  if (timer) clearInterval(timer);
  timer = null;
  state = null;
  view = null;
  loaded = false;
  lastSavedSecond = -1;
  news = { events: [], at: 0 };
  listeners.clear();
}

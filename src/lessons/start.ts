/**
 * Starting sessions from the learner's real progress: the glue between `ProgressState` and the
 * pure session. Screens call these instead of working out hearts, difficulty and due cards
 * themselves.
 */
import { dueReviews, heartsOf, type ProgressState, type ReviewItem, type SkillRecord } from '@/core/progress';
import { startingDifficulty } from './adaptive';
import { hashSeed } from './rng';
import {
  FACT_CARD_KIND, createSession, factIndex, findLesson, findUnit, type SessionOptions, type SessionSource, type SessionState,
} from './session';
import type { Course } from './types';

/** Extras a screen may add when starting. */
export interface StartExtras {
  /** Seed; default: derived from the time and the progress revision, so every session differs. */
  seed?: number;
  /** False when the microphone is unavailable or the learner turned listening off. */
  mic?: boolean;
  /** Route and params that reopen the session (stored with the activity). */
  route?: string;
  params?: string[];
}

/** The skill records a source draws on: the lesson's, or those of the unit's lessons. */
function recordsFor(source: SessionSource, progress: ProgressState): Array<SkillRecord | undefined> {
  if (source.mode === 'lesson') {
    const found = findLesson(source.course, source.lessonId);
    return found ? [progress.skills[found.lesson.skill]] : [];
  }
  if (source.mode === 'review') return [];
  const unit = findUnit(source.course, source.unitId);
  return unit ? unit.lessons.map((l) => progress.skills[l.skill]) : [];
}

/**
 * The options for a session, read from the learner's progress: hearts (null when switched off),
 * the lesson's skill record for the crown prediction, the starting difficulty from recent results,
 * and the note-naming preference.
 */
export function sessionOptionsFor(source: SessionSource, progress: ProgressState, now: number, extras: StartExtras = {}): SessionOptions {
  const hearts = heartsOf(progress, now);
  const level = source.mode === 'review' ? (source.courses[0]?.level ?? 'beginner') : source.course.level;
  const options: SessionOptions = {
    seed: extras.seed ?? hashSeed(now, progress.meta.rev, source.mode),
    now,
    hearts: hearts.unlimited ? null : hearts.count,
    difficulty: startingDifficulty(level, recordsFor(source, progress)),
    naming: progress.prefs.noteNaming,
  };
  if (extras.mic !== undefined) options.mic = extras.mic;
  if (extras.route !== undefined) options.route = extras.route;
  if (extras.params !== undefined) options.params = extras.params;
  if (source.mode === 'lesson') {
    const found = findLesson(source.course, source.lessonId);
    if (found) options.skill = progress.skills[found.lesson.skill] ?? null;
  }
  return options;
}

/** Start a session for the learner as they are right now. */
export function startSession(source: SessionSource, progress: ProgressState, now: number, extras: StartExtras = {}): SessionState {
  return createSession(source, sessionOptionsFor(source, progress, now, extras));
}

/** The fact cards of these courses that are due now, in study order (daily caps applied). */
export function dueFactCards(courses: readonly Course[], progress: ProgressState, now: number, limit?: number): ReviewItem[] {
  const known = factIndex(courses);
  const due = dueReviews(progress, now, { kinds: [FACT_CARD_KIND] }).filter((card) => known.has(card.id));
  return limit === undefined ? due : due.slice(0, Math.max(0, limit));
}

/** A review of everything due in these courses. `cards` is empty when nothing is due. */
export function reviewSource(courses: readonly Course[], progress: ProgressState, now: number, size?: number): Extract<SessionSource, { mode: 'review' }> {
  const source: Extract<SessionSource, { mode: 'review' }> = { mode: 'review', courses: [...courses], cards: dueFactCards(courses, progress, now, size) };
  if (size !== undefined) source.size = size;
  return source;
}

/**
 * A practice drill on a unit, drawn from the lessons the learner has already finished (all of the
 * unit's lessons when none is finished yet).
 */
export function practiceSource(course: Course, unitId: string, progress: ProgressState, size?: number): Extract<SessionSource, { mode: 'practice' }> {
  const unit = findUnit(course, unitId);
  const done = unit ? unit.lessons.filter((l) => progress.skills[l.skill]?.completed).map((l) => l.id) : [];
  const source: Extract<SessionSource, { mode: 'practice' }> = { mode: 'practice', course, unitId };
  if (done.length > 0) source.lessonIds = done;
  if (size !== undefined) source.size = size;
  return source;
}

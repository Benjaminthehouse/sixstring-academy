/**
 * The course map: for a course and the learner's progress, the state of every unit and lesson
 * (locked, available, current, done), crowns, what is due for review, the next lesson to start,
 * and what passing a checkpoint would unlock. Pure: a function of its arguments.
 *
 * A lesson is DONE when its skill is completed in the progress store. It is AVAILABLE when every
 * prerequisite is done; prerequisites are the lesson's `requires`, or simply the lesson before it
 * when `requires` is omitted. The CURRENT lesson is the first available one that is not done.
 */
import { skillView, type MasteryLevel, type ProgressState } from '@/core/progress';
import { factCardId } from './session';
import type { Course, Lesson, Unit, UnitTheme } from './types';

/** Where a lesson or unit stands. */
export type NodeState = 'locked' | 'available' | 'current' | 'done';

/** One lesson on the map. */
export interface LessonNode {
  id: string;
  title: string;
  unitId: string;
  skill: string;
  minutes: number;
  state: NodeState;
  /** Crowns earned, 0 to 5. */
  crown: MasteryLevel;
  /** Finished attempts so far. */
  completions: number;
  /** Best accuracy of a finished attempt, 0 to 1. */
  bestAccuracy: number;
  /** 0 to 1: fades without practice. */
  strength: number;
  /** Learned, but faded below half strength. */
  rusty: boolean;
  /** Fact cards of this lesson that are due now. */
  dueCards: number;
  /** Worth revisiting: rusty, or it has due cards. */
  dueForReview: boolean;
  /** The prerequisites as resolved (the lesson before it when none were authored). */
  requires: string[];
  /** Prerequisites still to finish (empty unless locked). */
  missing: string[];
}

/**
 * The checkpoint of a unit. Testing out is the point of a checkpoint, so it is open even on a
 * unit the learner has not reached yet (a learner who already knows the basics jumps ahead).
 */
export interface CheckpointNode {
  /** `passed` when every lesson of the unit is done; `available` otherwise. */
  state: 'available' | 'passed';
  /** True when the unit is not reached yet: passing would jump ahead ("Jump here" rather than "Test out"). */
  ahead: boolean;
  /** Lesson ids passing it would mark as done. */
  completes: string[];
}

/** One unit on the map. */
export interface UnitNode {
  id: string;
  title: string;
  theme: UnitTheme;
  description: string;
  state: NodeState;
  lessons: LessonNode[];
  /** Lessons done, and lessons in total. */
  done: number;
  total: number;
  fraction: number;
  /** Crowns earned over the unit, and the most it can hold (five per lesson). */
  crowns: number;
  maxCrowns: number;
  dueForReview: boolean;
  checkpoint: CheckpointNode | null;
}

/** The whole map. */
export interface CourseMap {
  courseId: string;
  units: UnitNode[];
  /** The lesson to start next, or null when everything is done. */
  next: { unitId: string; lessonId: string } | null;
  done: number;
  total: number;
  fraction: number;
  crowns: number;
  maxCrowns: number;
  /** Every lesson is done. */
  finished: boolean;
  /** Due fact cards over the whole course. */
  dueCards: number;
}

/** Every lesson of a course in path order, with its unit. */
export function lessonsInOrder(course: Course): Array<{ unit: Unit; lesson: Lesson }> {
  return course.units.flatMap((unit) => unit.lessons.map((lesson) => ({ unit, lesson })));
}

/** The prerequisites of every lesson: its `requires`, or the lesson before it when omitted. */
export function prerequisites(course: Course): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let previous: string | null = null;
  for (const { lesson } of lessonsInOrder(course)) {
    out.set(lesson.id, lesson.requires !== undefined ? [...lesson.requires] : previous === null ? [] : [previous]);
    previous = lesson.id;
  }
  return out;
}

function isDue(progress: ProgressState, cardId: string, now: number): boolean {
  const card = progress.srs.items[cardId];
  if (!card) return false;
  if (card.state === 'review') return card.dueDay <= progress.meta.today;
  if (card.state === 'learning') return card.dueAt <= now;
  return false;
}

function build(course: Course, progress: ProgressState, now: number, alsoDone: ReadonlySet<string>): CourseMap {
  const requires = prerequisites(course);
  const ordered = lessonsInOrder(course);
  const doneIds = new Set<string>();
  for (const { lesson } of ordered) {
    if (alsoDone.has(lesson.id) || progress.skills[lesson.skill]?.completed === true) doneIds.add(lesson.id);
  }
  let next: CourseMap['next'] = null;
  const nodes = new Map<string, LessonNode>();
  for (const { unit, lesson } of ordered) {
    const view = skillView(progress, lesson.skill, now);
    const needs = requires.get(lesson.id) ?? [];
    const missing = needs.filter((id) => !doneIds.has(id));
    const done = doneIds.has(lesson.id);
    let state: NodeState = done ? 'done' : missing.length === 0 ? 'available' : 'locked';
    if (state === 'available' && next === null) {
      next = { unitId: unit.id, lessonId: lesson.id };
      state = 'current';
    }
    const dueCards = (lesson.facts ?? []).filter((fact) => isDue(progress, factCardId(course.id, fact.id), now)).length;
    nodes.set(lesson.id, {
      id: lesson.id,
      title: lesson.title,
      unitId: unit.id,
      skill: lesson.skill,
      minutes: lesson.minutes,
      state,
      crown: view.mastery,
      completions: view.record?.completions ?? 0,
      bestAccuracy: view.record?.bestAccuracy ?? 0,
      strength: view.strength,
      rusty: view.rusty,
      dueCards,
      dueForReview: done && (view.rusty || dueCards > 0),
      requires: needs,
      missing: done ? [] : missing,
    });
  }

  const units: UnitNode[] = course.units.map((unit) => {
    const lessons = unit.lessons.map((l) => nodes.get(l.id)!);
    const done = lessons.filter((l) => l.state === 'done').length;
    const total = lessons.length;
    const allDone = total > 0 && done === total;
    const reachable = lessons.some((l) => l.state !== 'locked');
    const state: NodeState = allDone ? 'done' : lessons.some((l) => l.state === 'current') ? 'current' : reachable ? 'available' : 'locked';
    const checkpoint: CheckpointNode | null = unit.checkpoint
      ? { state: allDone ? 'passed' : 'available', ahead: !reachable, completes: lessons.filter((l) => l.state !== 'done').map((l) => l.id) }
      : null;
    return {
      id: unit.id,
      title: unit.title,
      theme: unit.theme,
      description: unit.description,
      state,
      lessons,
      done,
      total,
      fraction: total === 0 ? 1 : done / total,
      crowns: lessons.reduce((sum, l) => sum + l.crown, 0),
      maxCrowns: total * 5,
      dueForReview: lessons.some((l) => l.dueForReview),
      checkpoint,
    };
  });

  const total = ordered.length;
  const done = doneIds.size;
  return {
    courseId: course.id,
    units,
    next,
    done,
    total,
    fraction: total === 0 ? 1 : done / total,
    crowns: units.reduce((sum, u) => sum + u.crowns, 0),
    maxCrowns: total * 5,
    finished: total > 0 && done === total,
    dueCards: units.reduce((sum, u) => sum + u.lessons.reduce((n, l) => n + l.dueCards, 0), 0),
  };
}

/** The map of a course for a learner at time `now`. */
export function courseMap(course: Course, progress: ProgressState, now: number): CourseMap {
  return build(course, progress, now, new Set());
}

/** The lesson to start next (the first available one that is not done), or null when the course is finished. */
export function nextLesson(course: Course, progress: ProgressState, now: number): { unitId: string; lessonId: string } | null {
  return courseMap(course, progress, now).next;
}

/** A lesson's node on the map, or null. */
export function lessonNode(map: CourseMap, lessonId: string): LessonNode | null {
  for (const unit of map.units) {
    const found = unit.lessons.find((l) => l.id === lessonId);
    if (found) return found;
  }
  return null;
}

/** What passing a unit's checkpoint would change. */
export interface CheckpointUnlocks {
  /** Lessons of the unit it marks as done. */
  completes: string[];
  /** Lessons elsewhere that become available because of it. */
  unlocks: string[];
  /** The lesson that would be next afterwards, or null when the course would be finished. */
  next: { unitId: string; lessonId: string } | null;
}

/**
 * What a passed checkpoint unlocks: every lesson of the unit counts as done (one crown each), and
 * whatever was waiting on them opens. The session's `mark-skill` effects make it so.
 */
export function checkpointUnlocks(course: Course, unitId: string, progress: ProgressState, now: number): CheckpointUnlocks {
  const before = courseMap(course, progress, now);
  const unit = before.units.find((u) => u.id === unitId);
  if (!unit) return { completes: [], unlocks: [], next: before.next };
  const completes = unit.lessons.filter((l) => l.state !== 'done').map((l) => l.id);
  const after = build(course, progress, now, new Set(completes));
  const unlocks: string[] = [];
  for (const u of after.units) {
    for (const lesson of u.lessons) {
      if (completes.includes(lesson.id)) continue;
      if (lesson.state !== 'locked' && lessonNode(before, lesson.id)?.state === 'locked') unlocks.push(lesson.id);
    }
  }
  return { completes, unlocks, next: after.next };
}

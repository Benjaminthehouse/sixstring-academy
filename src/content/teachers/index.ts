/**
 * The teachers' courses: one file per unit, `src/content/teachers/<teacher>/<unit id>.ts`, each
 * default-exporting a `TeacherUnit`. Units are loaded lazily (a course's units load when its map or
 * a lesson is opened, never with the app), assembled in the plan's order, and units not written yet
 * are simply absent: the outline (`OUTLINE`) still knows them, so screens can show the whole journey.
 *
 *   const tc = await loadTeacherCourse('mia');
 *   tc.course            // the engine Course of the written units (CourseMap, LessonPlayer, sessions)
 *   tc.lesson('tune-up') // the authored lesson, tasks and drawings included
 *   tc.upcoming          // outline units not written yet
 *
 * Writing a unit: README.md beside this file.
 */
import type { Course } from '@/lessons';
import { compileCourse, teacherStepOf, type CourseMeta } from './compile';
import { OUTLINE, THEORY_LINKS } from './outline';
import { PROFILES } from './profiles';
import type { CourseOutline, OutlineUnit, TeacherKey, TeacherLesson, TeacherStep, TeacherUnit } from './types';

export * from './types';
export * from './tasks';
export { compileCourse, compileLesson, compileStep, compileUnit, hasArt, isTaskStep, teacherStepOf, type CourseMeta } from './compile';
export { OUTLINE, THEORY_LINKS } from './outline';
export { PROFILES, echoes, pickLine, profileOf, type TeacherProfile } from './profiles';

/** The teachers, beginner to expert. */
export const TEACHER_KEYS: readonly TeacherKey[] = ['mia', 'dev', 'elena'];

const LOADERS = import.meta.glob<{ default: TeacherUnit }>(['./mia/*.ts', './dev/*.ts', './elena/*.ts', '!./**/*.test.ts']);

/** `./mia/mia-hello-guitar.ts` -> `['mia', 'mia-hello-guitar']`. */
function partsOf(path: string): [string, string] {
  const m = /^\.\/([a-z]+)\/([a-z0-9-]+)\.ts$/.exec(path);
  return m ? [m[1], m[2]] : ['', ''];
}

const LOADER_BY_UNIT = new Map<string, () => Promise<{ default: TeacherUnit }>>();
for (const [path, load] of Object.entries(LOADERS)) {
  const [teacher, unit] = partsOf(path);
  if (teacher) LOADER_BY_UNIT.set(`${teacher}/${unit}`, load);
}

/**
 * The Theory Path lessons the plan links to a teacher lesson, in the plan's order, as the parts of
 * their address (`#learn--<unitId>--<lessonId>`). Empty when it has none.
 */
export function theoryLinksOf(lessonId: string): Array<{ unitId: string; lessonId: string }> {
  return (THEORY_LINKS[lessonId] ?? []).map((link) => {
    const [unitId, lesson] = link.split('/');
    return { unitId, lessonId: lesson };
  });
}

/** True for one of the three teacher ids. */
export function isTeacherKey(id: string): id is TeacherKey {
  return (TEACHER_KEYS as readonly string[]).includes(id);
}

/** A course's outline from the plan. */
export function outlineOf(teacher: TeacherKey): CourseOutline {
  return OUTLINE.find((c) => c.id === teacher) ?? OUTLINE[0];
}

/** Ids of the units written so far for a teacher, in plan order (known without loading anything). */
export function writtenUnitIds(teacher: TeacherKey): string[] {
  return outlineOf(teacher).units.map((u) => u.id).filter((id) => LOADER_BY_UNIT.has(`${teacher}/${id}`));
}

/** Unit files whose name is not a unit of the plan (a test reports them; the app ignores them). */
export function strayUnitFiles(): string[] {
  const known = new Set(OUTLINE.flatMap((c) => c.units.map((u) => `${c.id}/${u.id}`)));
  return [...LOADER_BY_UNIT.keys()].filter((k) => !known.has(k)).sort();
}

/** The course facts the engine needs: title, description, level. */
export function courseMeta(teacher: TeacherKey): CourseMeta {
  const p = PROFILES[teacher];
  return { id: teacher, title: p.courseTitle, description: p.courseDescription, level: p.level };
}

/** A teacher's course: the written units, the engine course built from them, and what is still to come. */
export interface TeacherCourse {
  teacher: TeacherKey;
  outline: CourseOutline;
  /** Written units in plan order. */
  units: TeacherUnit[];
  /** The engine course of the written units (empty `units` when none is written yet). */
  course: Course;
  /** Outline units not written yet (or that failed to load), in plan order. */
  upcoming: OutlineUnit[];
  /** Unit ids whose file failed to load (a broken file never breaks the course). */
  failed: string[];
  /** The authored lesson by id, or null. */
  lesson(id: string): TeacherLesson | null;
  /** The unit a lesson belongs to, or null. */
  unitOf(lessonId: string): TeacherUnit | null;
  /** The authored step behind an engine step id (a task, a card with a drawing), or null. */
  step(lessonId: string, stepId: string | undefined): TeacherStep | null;
  /** Lessons in the whole plan (written or not), for "12 of 74 lessons". */
  plannedLessons: number;
}

/** Put loaded units together in the plan's order (pure; exported for tests). */
export function assembleCourse(teacher: TeacherKey, loaded: ReadonlyMap<string, TeacherUnit>, failed: readonly string[] = []): TeacherCourse {
  const outline = outlineOf(teacher);
  const units: TeacherUnit[] = [];
  const upcoming: OutlineUnit[] = [];
  for (const o of outline.units) {
    const u = loaded.get(o.id);
    if (u && u.id === o.id) units.push(u);
    else upcoming.push(o);
  }
  const lessons = new Map<string, { lesson: TeacherLesson; unit: TeacherUnit }>();
  for (const u of units) for (const l of u.lessons) lessons.set(l.id, { lesson: l, unit: u });
  return {
    teacher,
    outline,
    units,
    course: compileCourse(courseMeta(teacher), units),
    upcoming,
    failed: [...failed],
    lesson: (id) => lessons.get(id)?.lesson ?? null,
    unitOf: (id) => lessons.get(id)?.unit ?? null,
    step: (lessonId, stepId) => teacherStepOf(lessons.get(lessonId)?.lesson, stepId),
    plannedLessons: outline.units.reduce((n, u) => n + u.lessons.length, 0),
  };
}

const cache = new Map<TeacherKey, Promise<TeacherCourse>>();

/** Load a teacher's written units (each its own chunk) and assemble the course. Never rejects. */
export function loadTeacherCourse(teacher: TeacherKey): Promise<TeacherCourse> {
  const hit = cache.get(teacher);
  if (hit) return hit;
  const ids = writtenUnitIds(teacher);
  const promise = Promise.all(
    ids.map(async (id) => {
      try {
        const mod = await LOADER_BY_UNIT.get(`${teacher}/${id}`)!();
        return { id, unit: mod.default, ok: true as const };
      } catch {
        return { id, unit: null, ok: false as const };
      }
    }),
  ).then((results) => {
    const loaded = new Map<string, TeacherUnit>();
    const failed: string[] = [];
    for (const r of results) {
      if (r.ok && r.unit) loaded.set(r.id, r.unit);
      else failed.push(r.id);
    }
    // A failed load is not remembered: the next visit tries again.
    if (failed.length) cache.delete(teacher);
    return assembleCourse(teacher, loaded, failed);
  });
  cache.set(teacher, promise);
  return promise;
}

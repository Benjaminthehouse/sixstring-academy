/**
 * The Theory Path registry: the outline of all 43 units (generated from the reviewed syllabus), the
 * units written so far (one file each in `units/`, loaded lazily so the path opens fast), and the
 * assembly of both into the lesson engine's `Course`.
 *
 *   const theory = assembleTheory([]);                 // instant: every written unit as a stand-in
 *   const full = assembleTheory(await loadWrittenUnits());   // the real lessons
 *   <LessonPlayer source={{ mode: 'lesson', course: courseForUnit(full, unitId), lessonId }} ... />
 *
 * Units that are not written yet are "coming soon": they are left out of the engine's course, and
 * a prerequisite on one of their lessons is replaced by that lesson's own prerequisites, so the
 * path past a gap stays open in the order the syllabus intends. See README.md for authors.
 */
import type { Course, CourseLevel, Lesson, Unit } from '@/lessons';
import { THEORY_GLOSSARY } from './glossary';
import { OUTLINE } from './outline';
import type { OutlineLesson, OutlineUnit, PathUnit, StageId, TheoryCourse } from './types';

export type * from './types';
export { OUTLINE } from './outline';
export { THEORY_GLOSSARY } from './glossary';

/** The course id (fact cards are stored as `theory-path:<fact id>`). */
export const THEORY_COURSE_ID = 'theory-path';

/** Unit files, keyed by unit id (`./units/sound-and-pitch.ts` -> `sound-and-pitch`). */
const FILES = import.meta.glob<{ default: Unit }>(['./units/*.ts', '!./units/*.test.ts']);
const loaders = new Map<string, () => Promise<{ default: Unit }>>();
for (const [path, load] of Object.entries(FILES)) loaders.set(path.replace(/^\.\/units\//, '').replace(/\.ts$/, ''), load);

interface Placed {
  unit: OutlineUnit;
  stage: StageId;
  number: number;
}

const PLACED: readonly Placed[] = OUTLINE.stages.flatMap((s) => s.units.map((unit) => ({ unit, stage: s.id }))).map((p, i) => ({ ...p, number: i + 1 }));
const BY_UNIT = new Map(PLACED.map((p) => [p.unit.id, p]));
const BY_LESSON = new Map<string, { lesson: OutlineLesson; placed: Placed }>();
for (const placed of PLACED) for (const lesson of placed.unit.lessons) BY_LESSON.set(lesson.id, { lesson, placed });

/** Every unit of the syllabus in order, with its stage and its number on the whole path. */
export function outlineUnits(): readonly Placed[] {
  return PLACED;
}

/** A unit of the syllabus by id, with its stage and number, or null. */
export function outlineUnit(unitId: string): Placed | null {
  return BY_UNIT.get(unitId) ?? null;
}

/** A lesson of the syllabus by slug, with its unit, or null. */
export function outlineLesson(lessonId: string): { lesson: OutlineLesson; unitId: string; stage: StageId } | null {
  const hit = BY_LESSON.get(lessonId);
  return hit ? { lesson: hit.lesson, unitId: hit.placed.unit.id, stage: hit.placed.stage } : null;
}

/** True when the unit has a file in `units/` and is part of the syllabus. */
export function isUnitWritten(unitId: string): boolean {
  return loaders.has(unitId) && BY_UNIT.has(unitId);
}

/** The written units, in syllabus order. */
export function writtenUnitIds(): string[] {
  return PLACED.filter((p) => loaders.has(p.unit.id)).map((p) => p.unit.id);
}

/** Every file in `units/` by its id, in or out of the syllabus (the registry test reports strays). */
export function unitFileIds(): string[] {
  return [...loaders.keys()].sort();
}

const pending = new Map<string, Promise<Unit | null>>();

/**
 * Load one written unit (each is its own chunk). Resolves null for a unit with no file; rejects
 * when the chunk cannot be fetched, and a later call tries again.
 */
export function loadUnit(unitId: string): Promise<Unit | null> {
  const load = loaders.get(unitId);
  if (!load) return Promise.resolve(null);
  let p = pending.get(unitId);
  if (!p) {
    p = load().then(
      (m) => m.default,
      (e: unknown) => {
        pending.delete(unitId);
        throw e;
      },
    );
    pending.set(unitId, p);
  }
  return p;
}

/** Load every written unit at once (in parallel). */
export async function loadWrittenUnits(): Promise<Unit[]> {
  const units = await Promise.all(writtenUnitIds().map((id) => loadUnit(id)));
  return units.filter((u): u is Unit => u !== null);
}

/** The lesson engine level of a stage: it sets timing tolerances and the starting difficulty. */
export function stageLevel(stage: StageId): CourseLevel {
  return stage;
}

/** The skill id of a Theory Path lesson. */
export function theorySkill(unitId: string, lessonId: string): string {
  return `theory:${unitId}:${lessonId}`;
}

/**
 * Prerequisites as the engine should see them: lessons that are present stay; a lesson that is not
 * written yet is replaced by its own prerequisites, recursively; unknown ids are dropped.
 */
function resolver(present: ReadonlySet<string>): (ids: readonly string[]) => string[] {
  const memo = new Map<string, string[]>();
  const through = (id: string, seen: Set<string>): string[] => {
    if (present.has(id)) return [id];
    const hit = memo.get(id);
    if (hit) return hit;
    const planned = BY_LESSON.get(id);
    if (!planned || seen.has(id)) return [];
    seen.add(id);
    const out = resolveList(planned.lesson.requires, seen);
    memo.set(id, out);
    return out;
  };
  const resolveList = (ids: readonly string[], seen: Set<string>): string[] => {
    const out: string[] = [];
    for (const id of ids) for (const r of through(id, seen)) if (!out.includes(r)) out.push(r);
    return out;
  };
  return (ids) => resolveList(ids, new Set());
}

/**
 * Prerequisites past the gaps: `ids` with every lesson that is not in `present` replaced by its own
 * syllabus prerequisites (recursively), without duplicates. Pure.
 */
export function resolveRequires(ids: readonly string[], present: ReadonlySet<string>): string[] {
  return resolver(present)(ids);
}

/** A written unit that is still loading, drawn from the outline: right ids, titles and prerequisites, no steps yet. */
function standIn(placed: Placed): Unit {
  const u = placed.unit;
  return {
    id: u.id,
    title: u.title,
    theme: u.theme,
    description: u.summary,
    lessons: u.lessons.map((l) => ({ id: l.id, title: l.title, teaches: '', minutes: l.minutes, skill: theorySkill(u.id, l.id), steps: [] })),
    // Every unit of the syllabus has a checkpoint; the real one arrives with the unit.
    checkpoint: {},
  };
}

/**
 * The Theory Path from the units loaded so far. Written units that are not in `loaded` appear as
 * stand-ins drawn from the outline; units without a file are "coming soon". Pure.
 */
export function assembleTheory(loaded: Iterable<Unit>): TheoryCourse {
  const byId = new Map<string, Unit>();
  for (const u of loaded) if (BY_UNIT.has(u.id) && loaders.has(u.id)) byId.set(u.id, u);
  const written = PLACED.filter((p) => loaders.has(p.unit.id));
  const raw = written.map((p) => byId.get(p.unit.id) ?? standIn(p));
  const present = new Set(raw.flatMap((u) => u.lessons.map((l) => l.id)));
  const resolve = resolver(present);
  const units: Unit[] = raw.map((u) => ({
    ...u,
    lessons: u.lessons.map((l): Lesson => {
      const planned = BY_LESSON.get(l.id)?.lesson.requires;
      const wanted = l.requires ?? planned;
      return wanted === undefined ? l : { ...l, requires: resolve(wanted) };
    }),
  }));
  const course: Course = {
    id: THEORY_COURSE_ID,
    title: OUTLINE.title,
    teacher: 'none',
    level: 'beginner',
    description: 'Bite-sized theory, from what a note is to advanced harmony, always tied to the guitar neck.',
    units,
    glossary: [...THEORY_GLOSSARY],
  };
  const path: PathUnit[] = PLACED.map((p) => {
    const isWritten = loaders.has(p.unit.id);
    const unit = byId.get(p.unit.id) ?? null;
    return { outline: p.unit, stage: p.stage, number: p.number, status: !isWritten ? 'coming-soon' : unit ? 'ready' : 'loading', unit };
  });
  return { course, units: path, complete: written.every((p) => byId.has(p.unit.id)) };
}

/**
 * The course as a session in this unit should run it: the same course, at the level of the unit's
 * stage (tap timing and the starting difficulty tighten as the path goes on).
 */
export function courseForUnit(theory: TheoryCourse, unitId: string): Course {
  const stage = BY_UNIT.get(unitId)?.stage ?? 'beginner';
  const level = stageLevel(stage);
  return level === theory.course.level ? theory.course : { ...theory.course, level };
}

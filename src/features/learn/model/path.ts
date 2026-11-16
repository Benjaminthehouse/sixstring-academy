/**
 * What the Theory Path map draws: the lesson engine's course map (states, crowns, what is due)
 * laid over the syllabus, so every unit appears in its stage with its real number, written or
 * not, and every lesson says whether it needs the guitar or sound.
 */
import { courseMap, type CourseMap, type LessonNode, type UnitNode } from '@/lessons';
import type { ProgressState } from '@/core/progress';
import { OUTLINE, type OutlineLesson, type PathUnit, type StageId, type TheoryCourse } from '@/content/theory';
import { lessonNeeds } from './conditions';

/** A lesson on the map. */
export interface PathLesson {
  node: LessonNode;
  /** What it teaches (empty while its unit loads). */
  teaches: string;
  /** It has steps that listen to the guitar. */
  play: boolean;
  /** It has listening questions. */
  listening: boolean;
  /** Its unit is loaded, so it can run. */
  ready: boolean;
}

/** A unit on the map: written (with its engine node) or coming soon. */
export interface PathUnitView {
  path: PathUnit;
  /** The engine's unit node; null for a unit that is not written yet. */
  node: UnitNode | null;
  lessons: PathLesson[];
  /** Coming-soon units list their planned lessons by title. */
  planned: OutlineLesson[];
}

/** A stage of the path. */
export interface PathStage {
  id: StageId;
  /** 1, 2 or 3. */
  number: number;
  title: string;
  subtitle: string;
  units: PathUnitView[];
  /** Lessons done, and lessons written, in this stage. */
  done: number;
  total: number;
  /** Lessons the syllabus plans for this stage. */
  planned: number;
}

/** The whole map. */
export interface PathView {
  map: CourseMap;
  stages: PathStage[];
  /** The lesson to do next, or null when every written lesson is done. */
  next: { unit: PathUnitView; lesson: PathLesson } | null;
  /** Something was already done on the path. */
  started: boolean;
  byUnit: Map<string, PathUnitView>;
  byLesson: Map<string, { unit: PathUnitView; lesson: PathLesson }>;
}

/** The map for a learner at `now`. Pure. */
export function pathView(theory: TheoryCourse, progress: ProgressState, now: number): PathView {
  const map = courseMap(theory.course, progress, now);
  const nodes = new Map(map.units.map((u) => [u.id, u]));
  const byUnit = new Map<string, PathUnitView>();
  const byLesson = new Map<string, { unit: PathUnitView; lesson: PathLesson }>();

  const units = theory.units.map((path): PathUnitView => {
    const node = path.status === 'coming-soon' ? null : (nodes.get(path.outline.id) ?? null);
    const written = path.unit;
    const view: PathUnitView = { path, node, lessons: [], planned: path.outline.lessons };
    view.lessons = (node?.lessons ?? []).map((n): PathLesson => {
      const real = written?.lessons.find((l) => l.id === n.id);
      const outline = path.outline.lessons.find((l) => l.id === n.id);
      const needs = real ? lessonNeeds(real) : null;
      return {
        node: n,
        teaches: real?.teaches ?? '',
        play: needs ? needs.play > 0 : !!outline?.play,
        listening: needs ? needs.listening > 0 : !!outline?.listen,
        ready: !!real,
      };
    });
    byUnit.set(path.outline.id, view);
    for (const lesson of view.lessons) byLesson.set(lesson.node.id, { unit: view, lesson });
    return view;
  });

  const stages = OUTLINE.stages.map((s, i): PathStage => {
    const mine = units.filter((u) => u.path.stage === s.id);
    const lessons = mine.flatMap((u) => u.lessons);
    return {
      id: s.id,
      number: i + 1,
      title: s.title,
      subtitle: s.subtitle,
      units: mine,
      done: lessons.filter((l) => l.node.state === 'done').length,
      total: lessons.length,
      planned: s.units.reduce((n, u) => n + u.lessons.length, 0),
    };
  });

  const next = map.next ? (byLesson.get(map.next.lessonId) ?? null) : null;
  return { map, stages, next, started: map.done > 0, byUnit, byLesson };
}

/** Units whose every lesson is done. */
export function completedUnits(map: CourseMap): Set<string> {
  return new Set(map.units.filter((u) => u.total > 0 && u.done === u.total).map((u) => u.id));
}

/** The unit to show first: the one asked for, else the unit of the next lesson, else the first written one. */
export function focusUnit(view: PathView, asked: string | null): PathUnitView | null {
  if (asked) {
    const hit = view.byUnit.get(asked);
    if (hit) return hit;
  }
  if (view.next) return view.next.unit;
  for (const stage of view.stages) for (const u of stage.units) if (u.node) return u;
  return null;
}

/**
 * The unit whose practice drill refills the hearts: `preferred` when it has finished lessons, else
 * the latest unit that has some. A learner who has finished nothing yet (out of hearts in the very
 * first lesson) practises the unit they are in, as the lesson player's own "Practise to refill
 * hearts" does: a drill runs on a whole unit before any of its lessons is done. Null only when
 * nothing is written.
 */
export function refillUnit(view: PathView, preferred: string | null): string | null {
  const written = view.stages.flatMap((s) => s.units).filter((u) => u.node);
  const started = written.filter((u) => (u.node?.done ?? 0) > 0);
  if (preferred && started.some((u) => u.path.outline.id === preferred)) return preferred;
  if (started.length > 0) return started[started.length - 1].path.outline.id;
  return view.next?.unit.path.outline.id ?? written[0]?.path.outline.id ?? null;
}

/** The next written unit after this one, or null. */
export function unitAfter(view: PathView, unitId: string): PathUnitView | null {
  const all = view.stages.flatMap((s) => s.units).filter((u) => u.node);
  const i = all.findIndex((u) => u.path.outline.id === unitId);
  return i >= 0 ? (all[i + 1] ?? null) : null;
}

/** "Unit 4 · Pulse and beat", the way the map names a unit. */
export function unitLabel(unit: PathUnit): string {
  return `Unit ${unit.number}`;
}

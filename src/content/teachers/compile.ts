/**
 * From the teachers' format to the lesson engine's: a task becomes a teaching card with the same id
 * (its title and instructions), a card's drawing is dropped. The engine then runs, saves, grades
 * and maps the course as it does the Theory Path; the screen looks the task or drawing up again by
 * lesson and step id (`teacherStepOf`).
 */
import type { CardStep, Course, CourseLevel, GlossaryTerm, Lesson, Step, Unit } from '@/lessons';
import type { CardArt, TaskStep, TeacherCardStep, TeacherKey, TeacherLesson, TeacherStep, TeacherUnit } from './types';

/** True for a task step. */
export function isTaskStep(step: TeacherStep | Step): step is TaskStep {
  return (step as { type?: string }).type === 'task';
}

/** True for a teaching card that carries a drawing. */
export function hasArt(step: TeacherStep | Step): step is TeacherCardStep & { art: CardArt } {
  return (step as { type?: string }).type === 'card' && typeof (step as TeacherCardStep).art === 'string';
}

/** One step as the engine sees it. */
export function compileStep(step: TeacherStep): Step {
  if (isTaskStep(step)) {
    const card: CardStep = { type: 'card', id: step.id, title: step.title, body: step.body };
    if (step.tip !== undefined) card.tip = step.tip;
    return card;
  }
  if (hasArt(step)) {
    const { art: _art, ...card } = step;
    return card;
  }
  return step as Step;
}

/** A lesson as the engine sees it. */
export function compileLesson(lesson: TeacherLesson): Lesson {
  const out: Lesson = { id: lesson.id, title: lesson.title, teaches: lesson.teaches, minutes: lesson.minutes, skill: lesson.skill, steps: lesson.steps.map(compileStep) };
  if (lesson.requires) out.requires = [...lesson.requires];
  if (lesson.facts) out.facts = lesson.facts;
  return out;
}

/** A unit as the engine sees it. */
export function compileUnit(unit: TeacherUnit): Unit {
  const out: Unit = { id: unit.id, title: unit.title, theme: unit.theme, description: unit.description, lessons: unit.lessons.map(compileLesson) };
  if (unit.checkpoint) out.checkpoint = unit.checkpoint;
  return out;
}

/** What a course needs besides its units. */
export interface CourseMeta {
  id: TeacherKey;
  title: string;
  description: string;
  level: CourseLevel;
}

/** The engine course of the units written so far (in the order given), with their glossaries merged. */
export function compileCourse(meta: CourseMeta, units: readonly TeacherUnit[]): Course {
  const glossary = new Map<string, GlossaryTerm>();
  for (const u of units) for (const g of u.glossary ?? []) if (!glossary.has(g.id)) glossary.set(g.id, g);
  const course: Course = { id: meta.id, title: meta.title, description: meta.description, teacher: meta.id, level: meta.level, units: units.map(compileUnit) };
  if (glossary.size > 0) course.glossary = [...glossary.values()];
  return course;
}

/** The authored step behind an engine step id in a lesson (a task, a card with a drawing ...), or null. */
export function teacherStepOf(lesson: TeacherLesson | null | undefined, stepId: string | undefined): TeacherStep | null {
  if (!lesson || !stepId) return null;
  return lesson.steps.find((s) => (s as { id?: string }).id === stepId) ?? null;
}

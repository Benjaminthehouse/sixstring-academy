/**
 * What a `#learn` session address runs: a lesson, a unit's checkpoint or practice drill, or the
 * review, on the course adapted to where the learner is, or why it cannot run (still loading,
 * coming soon, not on the path, nothing due). Pure.
 */
import { findLesson, practiceSource, reviewSource, type SessionSource } from '@/lessons';
import type { ProgressState } from '@/core/progress';
import { courseForUnit, outlineLesson, outlineUnit, type TheoryCourse } from '@/content/theory';
import { adaptCourse, type Conditions } from './conditions';
import type { LearnView } from './route';

/** The addresses that run a session. */
export type SessionView = Extract<LearnView, { kind: 'lesson' | 'checkpoint' | 'practice' | 'review' }>;

/** What an address resolves to. */
export type ResolvedSession =
  | { status: 'loading' }
  | { status: 'missing'; title: string; text: string }
  | { status: 'nothing-due' }
  | { status: 'ready'; source: SessionSource; unitId: string | null; params: string[] };

/** The unit an address is about (a lesson's own unit, whatever the link says), or null for the review. */
export function sessionUnit(view: SessionView): string | null {
  if (view.kind === 'review') return null;
  if (view.kind === 'lesson') return outlineLesson(view.lessonId)?.unitId ?? view.unitId;
  return view.unitId;
}

/** What to run for the address with the units loaded so far. */
export function resolveSession(view: SessionView, theory: TheoryCourse, conditions: Conditions, progress: ProgressState, now: number): ResolvedSession {
  if (view.kind === 'review') {
    if (!theory.complete) return { status: 'loading' };
    const course = adaptCourse(theory.course, conditions);
    const source = reviewSource([course], progress, now);
    return source.cards.length === 0 ? { status: 'nothing-due' } : { status: 'ready', source, unitId: null, params: ['review'] };
  }
  // A lesson is found by its id wherever it lives, so an old link naming another unit still works.
  const planned = view.kind === 'lesson' ? outlineLesson(view.lessonId) : null;
  const unitId = sessionUnit(view) ?? view.unitId;
  const placed = outlineUnit(unitId);
  const path = theory.units.find((u) => u.outline.id === unitId);
  if (!placed || !path || (view.kind === 'lesson' && !planned)) {
    return { status: 'missing', title: 'That lesson is not on the path', text: 'The link may be old. Pick a lesson from the path instead.' };
  }
  if (path.status === 'coming-soon') {
    return { status: 'missing', title: `Unit ${placed.number} is coming soon`, text: `“${placed.unit.title}” is still being written. The lessons before it are ready for you.` };
  }
  if (path.status === 'loading') return { status: 'loading' };
  const course = adaptCourse(courseForUnit(theory, unitId), conditions);
  if (view.kind === 'lesson') {
    if (!findLesson(course, view.lessonId)) return { status: 'missing', title: 'That lesson is not on the path', text: 'Pick a lesson from the path instead.' };
    return { status: 'ready', source: { mode: 'lesson', course, lessonId: view.lessonId }, unitId, params: [unitId, view.lessonId] };
  }
  if (view.kind === 'checkpoint') return { status: 'ready', source: { mode: 'checkpoint', course, unitId }, unitId, params: [unitId, 'checkpoint'] };
  return { status: 'ready', source: practiceSource(course, unitId, progress), unitId, params: [unitId, 'practice'] };
}

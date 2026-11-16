/**
 * The teachers' addresses:
 *
 *   #teachers                              the three teachers, a recommendation, where you left off
 *   #teachers--mia                         Mia's page: who she is and her course map
 *   #teachers--mia--<lesson>               a lesson, full screen
 *   #teachers--mia--checkpoint--<unit>     test out of a unit
 *   #teachers--mia--practice--<unit>       a practice drill of a unit
 *   #teachers--mia--review                 the course's review cards
 *
 * Pure: unit-tested. Unknown teachers fall back to the overview; never throws.
 */
import { isTeacherKey, type TeacherKey } from '@/content/teachers';

/** What an address asks for. */
export type TeachersView =
  | { view: 'overview' }
  | { view: 'teacher'; teacher: TeacherKey }
  | { view: 'lesson'; teacher: TeacherKey; lessonId: string }
  | { view: 'checkpoint' | 'practice'; teacher: TeacherKey; unitId: string }
  | { view: 'review'; teacher: TeacherKey };

/** Read the params of `#teachers--…`. */
export function parseTeachersParams(params: readonly string[]): TeachersView {
  const [t, a, b] = params;
  if (!t || !isTeacherKey(t)) return { view: 'overview' };
  if (!a) return { view: 'teacher', teacher: t };
  if (a === 'review') return { view: 'review', teacher: t };
  if ((a === 'checkpoint' || a === 'practice') && b) return { view: a, teacher: t, unitId: b };
  if (a === 'checkpoint' || a === 'practice') return { view: 'teacher', teacher: t };
  return { view: 'lesson', teacher: t, lessonId: a };
}

/** Route params for a view (the inverse of `parseTeachersParams`). */
export function teachersParams(v: TeachersView): string[] {
  switch (v.view) {
    case 'overview':
      return [];
    case 'teacher':
      return [v.teacher];
    case 'lesson':
      return [v.teacher, v.lessonId];
    case 'review':
      return [v.teacher, 'review'];
    default:
      return [v.teacher, v.view, v.unitId];
  }
}

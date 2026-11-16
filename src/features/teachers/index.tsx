/**
 * Teachers (`#teachers`): three guided courses that teach playing, the way weekly lessons with a
 * good teacher go. Addresses (see `model/route.ts`):
 *
 *   #teachers                            the three teachers, a recommendation, where you left off
 *   #teachers--<id>                      a teacher's page and course map
 *   #teachers--<id>--<lesson>            a lesson, full screen (immersive by the shell's registry)
 *   #teachers--<id>--checkpoint--<unit>  test out of a unit;  --practice--<unit>  a practice drill
 *   #teachers--<id>--review              the course's review cards
 *
 * Content: `src/content/teachers` (one lazily loaded file per unit, assembled in plan order). The
 * lesson screen is the lesson engine's session with the teacher present (portrait, name and voice
 * on teaching cards and feedback), task steps that send the learner to a tool (the Player, Tuner,
 * Metronome, Technique, Scan & Import, the Recorder, a Theory Path lesson ...) and pick up where
 * they left off on return, the plan's Theory Path links on each lesson's summary, and a unit's
 * milestone performance celebrated by the teacher. While a lesson's steps are on screen the shell's
 * rewards wait for its summary (`useRewardHold`). Browser check: `node e2e/teachers.cjs`.
 */
import { useMemo } from 'react';
import type { RouteProps } from '@/app/routes';
import { parseTeachersParams } from './model/route';
import { Overview } from './ui/Overview';
import { TeacherPage } from './ui/TeacherPage';
import { LessonRoute } from './ui/LessonRoute';

/** The teachers route. */
export default function Teachers({ params }: RouteProps) {
  const view = useMemo(() => parseTeachersParams(params), [params]);
  if (view.view === 'overview') return <Overview />;
  if (view.view === 'teacher') return <TeacherPage key={view.teacher} teacher={view.teacher} />;
  return <LessonRoute key={params.join('--')} view={view} />;
}

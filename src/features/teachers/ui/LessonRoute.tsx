/**
 * A session with a teacher: a lesson (`#teachers--mia--tune-up`), a unit checkpoint or practice
 * drill, or the course's review. Loads the course, finds what was asked for, and runs it in the
 * teacher's player. A lesson that is not written yet (or a broken address) explains itself and
 * leads back to the course; it never dead-ends.
 */
import { useEffect, useMemo } from 'react';
import { navigate } from '@/app/router';
import { useImmersive, useScreenTitle } from '@/app/shell';
import { teacherById } from '@/app/teachers';
import { getProgress, setProfile } from '@/core/progress';
import { findUnit, practiceSource, reviewSource, type SessionSource } from '@/lessons';
import { EmptyState, LinkButton, Page, Skeleton } from '@/ui';
import type { TeachersView } from '../model/route';
import { teachersParams } from '../model/route';
import { useTeacherCourse } from './useTeacherCourse';
import { TeacherPlayer } from './lesson/TeacherPlayer';
import styles from './lesson/Lesson.module.css';

type SessionView = Exclude<TeachersView, { view: 'overview' } | { view: 'teacher' }>;

/** The session route. */
export function LessonRoute({ view }: { view: SessionView }) {
  const tc = useTeacherCourse(view.teacher);
  const card = teacherById(view.teacher);
  const params = teachersParams(view);

  const source = useMemo((): SessionSource | null => {
    if (!tc || tc.course.units.length === 0) return null;
    const course = tc.course;
    switch (view.view) {
      case 'lesson':
        return tc.lesson(view.lessonId) ? { mode: 'lesson', course, lessonId: view.lessonId } : null;
      case 'checkpoint':
        return findUnit(course, view.unitId) ? { mode: 'checkpoint', course, unitId: view.unitId } : null;
      case 'practice':
        return findUnit(course, view.unitId) ? practiceSource(course, view.unitId, getProgress()) : null;
      case 'review':
        return reviewSource([course], getProgress(), Date.now());
    }
    // A new source only when the course or the address changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tc, params.join('--')]);

  // Learning with this teacher now: they become the learner's teacher (progress in every course is kept).
  useEffect(() => {
    if (source && view.view === 'lesson') setProfile({ teacher: view.teacher });
  }, [source, view]);

  if (!tc) return <Loading />;
  if (!source) return <Missing view={view} first={card.first} written={tc.course.units.length > 0} />;
  return <TeacherPlayer key={params.join('--')} tc={tc} source={source} params={params} onExit={() => navigate('teachers', view.teacher)} />;
}

function Loading() {
  useImmersive(true, 'focus');
  useScreenTitle(null);
  return (
    <Page title="Lesson" hideHeader className={styles.page}>
      <div className={styles.player} aria-busy="true" data-lesson-loading="">
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="block" height="16rem" />
        <Skeleton variant="block" height="4rem" />
      </div>
    </Page>
  );
}

function Missing({ view, first, written }: { view: SessionView; first: string; written: boolean }) {
  useImmersive(false);
  return (
    <Page title={`${first}'s course`} back={{ to: 'teachers', params: [view.teacher], label: `${first}'s course` }}>
      <EmptyState
        icon="BookOpen"
        title={written ? 'That lesson is not here yet' : `${first}'s lessons are being written`}
        actions={
          <LinkButton to="teachers" params={[view.teacher]} variant="primary" iconRight="ArrowRight">
            {`Open ${first}'s course`}
          </LinkButton>
        }
      >
        {written ? 'It may be in a unit that is still being written, or the link was mistyped. Your course has everything that is ready, in order.' : 'Until they are ready, the course page shows what is coming and where to start meanwhile.'}
      </EmptyState>
    </Page>
  );
}

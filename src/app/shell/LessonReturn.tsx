/**
 * "Back to your lesson": while the learner is out doing a task a teacher's lesson sent them to (the
 * Tuner, the Metronome, a song in the Player ...), every other screen shows one small bar that
 * takes them straight back. An app installed on a phone's home screen has no Back button of its
 * own, so without it the only way back was through Today.
 *
 * The lesson saves the task it opened under `teachers.task` (src/features/teachers/model/tasks.ts)
 * and forgets it when the learner returns, finishes or skips it, or after a day.
 */
import { useEffect, useState } from 'react';
import { readJSON } from '@/core/platform';
import { Icon, cx } from '@/ui';
import { href } from '../router';
import { TEACHERS } from '../teachers';
import styles from './Shell.module.css';

/** The storage key the teachers feature keeps its pending task under. */
export const PENDING_TASK_KEY = 'teachers.task';
/** Same limit as the teachers feature: a task opened more than a day ago is forgotten. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** What the bar needs from a pending task. */
export interface LessonReturnTarget {
  teacher: string;
  teacherName: string;
  lessonId: string;
  taskId: string;
}

/** The lesson to go back to, or null when there is none (or the learner is already there). Pure, for tests. */
export function lessonReturnFor(stored: unknown, route: string, now: number): LessonReturnTarget | null {
  if (route === 'teachers') return null;
  if (typeof stored !== 'object' || stored === null) return null;
  const t = stored as { teacher?: unknown; lessonId?: unknown; taskId?: unknown; openedAt?: unknown };
  if (typeof t.teacher !== 'string' || typeof t.lessonId !== 'string' || typeof t.taskId !== 'string') return null;
  if (typeof t.openedAt !== 'number' || !Number.isFinite(t.openedAt) || now - t.openedAt > MAX_AGE_MS) return null;
  const teacher = TEACHERS.find((x) => x.id === t.teacher);
  if (!teacher) return null;
  return { teacher: teacher.id, teacherName: teacher.first, lessonId: t.lessonId, taskId: t.taskId };
}

/** The bar itself, placed by the shell at the top of the screen's content. */
export function LessonReturn({ route, params }: { route: string; params: readonly string[] }) {
  const [target, setTarget] = useState<LessonReturnTarget | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const where = `${route}--${params.join('--')}`;

  useEffect(() => {
    const read = () => setTarget(lessonReturnFor(readJSON<unknown>(PENDING_TASK_KEY, null), route, Date.now()));
    read();
    // The task can be saved or cleared from another tab, and is cleared when a lesson ends.
    window.addEventListener('storage', read);
    window.addEventListener('focus', read);
    return () => {
      window.removeEventListener('storage', read);
      window.removeEventListener('focus', read);
    };
  }, [route, where]);

  if (!target || dismissed === target.taskId) return null;
  return (
    <nav className={styles.lessonReturn} aria-label="Your lesson" data-lesson-return="">
      <a className={styles.lessonReturnLink} href={href('teachers', target.teacher, target.lessonId)}>
        <Icon name="ArrowLeft" size="sm" />
        <span>Back to your lesson with {target.teacherName}</span>
      </a>
      <button type="button" className={cx(styles.lessonReturnClose)} onClick={() => setDismissed(target.taskId)} aria-label="Hide this">
        <Icon name="X" size="sm" />
      </button>
    </nav>
  );
}

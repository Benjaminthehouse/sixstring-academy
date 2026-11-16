/**
 * The learner's standing with each teacher, live from progress, and the saved lesson to pick up.
 */
import { useMemo } from 'react';
import { shallowEqual, useProfile, useProgress } from '@/core/progress';
import { loadSession, type SessionState } from '@/lessons';
import { OUTLINE, TEACHER_KEYS, isTeacherKey, type TeacherKey } from '@/content/teachers';
import { courseStanding, recommendTeacher, type CourseStanding, type Recommendation } from '../model/standing';

/** Standings of the three courses and the recommendation. */
export function useStandings(): { standings: Record<TeacherKey, CourseStanding>; recommendation: Recommendation } {
  const skills = useProgress((s) => s.skills, shallowEqual);
  const profile = useProfile();
  return useMemo(() => {
    const list = OUTLINE.map((o) => courseStanding({ skills }, o));
    const standings = Object.fromEntries(list.map((s) => [s.teacher, s])) as Record<TeacherKey, CourseStanding>;
    return { standings, recommendation: recommendTeacher(profile.experience, TEACHER_KEYS.map((t) => standings[t]), profile.onboarded) };
  }, [skills, profile.experience, profile.onboarded]);
}

/** An unfinished teacher lesson saved on this device (the lesson slot is shared with the Theory Path). */
export function savedTeacherLesson(teacher?: TeacherKey): (SessionState & { teacher: TeacherKey; lessonId: string }) | null {
  const s = loadSession({ mode: 'lesson', ...(teacher ? { courseId: teacher } : {}) }, { now: Date.now() });
  if (!s || !s.courseId || !isTeacherKey(s.courseId) || !s.lessonId) return null;
  return { ...s, teacher: s.courseId, lessonId: s.lessonId };
}

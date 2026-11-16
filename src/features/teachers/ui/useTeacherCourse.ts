/**
 * Load a teacher's course (its written units, each a lazy chunk) for a screen.
 */
import { useEffect, useState } from 'react';
import { loadTeacherCourse, type TeacherCourse, type TeacherKey } from '@/content/teachers';

/** The course once loaded (null while loading). Loading never fails: broken units are left out. */
export function useTeacherCourse(teacher: TeacherKey): TeacherCourse | null {
  const [tc, setTc] = useState<TeacherCourse | null>(null);
  useEffect(() => {
    let live = true;
    setTc((prev) => (prev && prev.teacher === teacher ? prev : null));
    void loadTeacherCourse(teacher).then((c) => live && setTc(c));
    return () => {
      live = false;
    };
  }, [teacher]);
  return tc && tc.teacher === teacher ? tc : null;
}

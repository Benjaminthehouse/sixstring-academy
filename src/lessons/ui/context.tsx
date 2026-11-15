/**
 * What every lesson component may need to know about the course being run: its glossary (for
 * tappable terms), its teacher (for the avatar and the reading voice) and its level (timing).
 * Provided once by the player, the map and the gallery; components fall back to sensible
 * defaults without it.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { glossaryFor, type GlossaryLookup } from '../glossary';
import type { Course, CourseLevel, CourseTeacher } from '../types';

/** The lesson context. */
export interface LessonContextValue {
  course: Course | null;
  glossary: GlossaryLookup;
  teacher: CourseTeacher;
  level: CourseLevel;
}

const DEFAULT: LessonContextValue = { course: null, glossary: glossaryFor(null), teacher: 'none', level: 'beginner' };

const Ctx = createContext<LessonContextValue>(DEFAULT);

/** Provide the course to everything inside (glossary terms, teacher, level). */
export function LessonProvider({ course, children }: { course: Course | null; children: ReactNode }) {
  const value = useMemo<LessonContextValue>(
    () => (course ? { course, glossary: glossaryFor(course), teacher: course.teacher, level: course.level } : DEFAULT),
    [course],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The course in effect (defaults when none was provided). */
export function useLessonContext(): LessonContextValue {
  return useContext(Ctx);
}

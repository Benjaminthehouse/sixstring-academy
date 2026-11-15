/**
 * The demo course: two units, eight lessons, every exercise type and many generators. It is real,
 * musically correct content (it will be seen in the lesson gallery), and it is the worked example
 * of the authoring guide. `validateCourse(DEMO_COURSE)` returns no problems.
 */
import type { Course } from '../types';
import { BUILDING_BLOCKS } from './building-blocks';
import { FIRST_NOTES } from './first-notes';

/** The demo course. */
export const DEMO_COURSE: Course = {
  id: 'demo',
  title: 'Guitar foundations',
  teacher: 'none',
  level: 'beginner',
  description: 'A short tour of the basics: notes, strings, the staff, steps, the major scale, chords and rhythm.',
  units: [FIRST_NOTES, BUILDING_BLOCKS],
};

export { BUILDING_BLOCKS, FIRST_NOTES };

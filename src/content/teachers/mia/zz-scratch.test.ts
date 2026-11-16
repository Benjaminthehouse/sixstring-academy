import { it } from 'vitest';
import { estimateLessonSeconds, validateCourse, formatProblems } from '@/lessons';
import { loadTeacherCourse } from '../index';
const MINE = ['mia-first-chords', 'mia-melodies-from-tab'];
it('report', async () => {
  const tc = await loadTeacherCourse('mia');
  const problems = validateCourse(tc.course).filter((p) => p.unit && MINE.includes(p.unit));
  console.log(formatProblems(problems) || 'NO PROBLEMS');
  for (const u of tc.course.units) if (MINE.includes(u.id)) for (const l of u.lessons) console.log(u.id, l.id, 'est', estimateLessonSeconds(l));
});

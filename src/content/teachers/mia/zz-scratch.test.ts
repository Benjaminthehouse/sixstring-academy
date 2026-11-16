import { it } from 'vitest';
import { estimateLessonSeconds, validateCourse, formatProblems } from '@/lessons';
import { loadTeacherCourse } from '../index';
const MINE = (process.env.UNITS ?? 'mia-first-chords,mia-melodies-from-tab').split(',');
it('report', async () => {
  const tc = await loadTeacherCourse('mia');
  console.log('failed', tc.failed);
  const problems = validateCourse(tc.course).filter((p) => p.unit && MINE.includes(p.unit));
  console.log(formatProblems(problems) || 'NO PROBLEMS');
  for (const u of tc.course.units) if (MINE.includes(u.id)) for (const l of u.lessons) {
    const types = new Set(l.steps.map((s: any) => s.generate ? 'gen:' + s.generate : s.type));
    console.log(u.id, l.id, 'est', estimateLessonSeconds(l), 's', 'steps', l.steps.length, 'minutes', l.minutes);
  }
});

import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { formatProblems, validateCourse, estimateLessonSeconds } from '@/lessons';
import { loadTeacherCourse } from '../index';
it('validate', async () => {
  const tc = await loadTeacherCourse('elena');
  const mine = ['elena-voice-leading', 'elena-playing-the-changes', 'elena-minor-harmony'];
  const problems = validateCourse(tc.course).filter((p) => !p.unit || mine.includes(p.unit));
  const est = tc.course.units.filter((u) => mine.includes(u.id)).flatMap((u) => u.lessons).map((l) => `${l.id}: ${estimateLessonSeconds(l)} s, minutes ${l.minutes}, steps ${l.steps.length}`);
  writeFileSync('/tmp/claude-0/-home-user-context-frontend/0b0936e9-a44d-5458-b711-cf2957d3d9cc/scratchpad/val.txt', `failed: ${tc.failed}\n` + formatProblems(problems) + '\n---\n' + est.join('\n'));
});

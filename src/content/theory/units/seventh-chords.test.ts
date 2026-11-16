import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { validateCourse, formatProblems, estimateLessonSeconds, type Course } from '@/lessons';
import { THEORY_GLOSSARY } from '../glossary';
import unit from './seventh-chords';

it('probe', () => {
  const course: Course = { id: 'theory-path', title: 'T', teacher: 'none', level: 'beginner', units: [unit], glossary: [...THEORY_GLOSSARY] };
  const p = validateCourse(course);
  const times = unit.lessons.map((l) => `${l.id}: ${l.minutes} min planned, est ${(estimateLessonSeconds(l) / 60).toFixed(2)} min (${estimateLessonSeconds(l)}s), ${l.steps.length} steps`);
  writeFileSync('/tmp/claude-0/-home-user-context-frontend/0b0936e9-a44d-5458-b711-cf2957d3d9cc/scratchpad/probe.txt', times.join('\n') + '\n\n' + formatProblems(p));
});

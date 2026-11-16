import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { estimateLessonSeconds, formatProblems, validateCourse } from '@/lessons';
import { THEORY_GLOSSARY } from '../glossary';
import unit from './triads-and-inversions';
import caged from './caged';

it('probe', () => {
  const problems = validateCourse({ id: 'theory-path', title: 'Theory Path', teacher: 'none', level: 'intermediate', units: [unit, caged], glossary: [...THEORY_GLOSSARY] });
  const times = [unit, caged].flatMap((u) => u.lessons.map((l) => `${l.id}: ${l.minutes} min, est ${(estimateLessonSeconds(l) / 60).toFixed(2)}`));
  writeFileSync('/tmp/claude-0/-home-user-context-frontend/0b0936e9-a44d-5458-b711-cf2957d3d9cc/scratchpad/probe.txt', `${formatProblems(problems)}\n${times.join('\n')}`);
});

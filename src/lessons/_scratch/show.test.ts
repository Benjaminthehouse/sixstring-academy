import { it } from 'vitest';
import { loadWrittenUnits, assembleTheory } from '@/content/theory';
import { loadTeacherCourse } from '@/content/teachers';

it('show', async () => {
  const theory = assembleTheory(await loadWrittenUnits());
  const courses = [theory.course, ...(await Promise.all((['mia', 'dev', 'elena'] as const).map(loadTeacherCourse))).map((c) => c.course)];
  const want: Record<string, number[]> = {
    'the-major-blues-scale': [3, 4], 'target-notes': [3, 4], 'dim7-symmetry': [1], 'pentatonic-superimposition': [5], 'outside-and-back': [0, 2], 'minor-key-repertoire': [0, 4],
    'spanish-masterpiece': [3, 6], 'transcribing-a-solo': [2, 3], 'memorising': [8], 'blues-scale-solo': [5], 'bends-that-land': [3],
  };
  for (const course of courses) for (const unit of course.units) for (const lesson of unit.lessons) {
    const idx = want[lesson.id];
    if (!idx) continue;
    for (const i of idx) {
      const s = lesson.steps[i] as Record<string, unknown>;
      const strip = (v: unknown) => JSON.stringify(v, (k, val) => (k === 'notes' && Array.isArray(val) ? `[${val.length} notes]` : val));
      console.log(`${course.id}/${lesson.id}[${i}]`, strip(s).slice(0, 900));
    }
  }
}, 120000);

import { it } from 'vitest';
import { validateCourse, formatProblems } from '@/lessons';
import { loadTeacherCourse } from '../index';
it('dups', async () => {
  const tc = await loadTeacherCourse('mia');
  const p = validateCourse(tc.course).filter((x) => /duplicate|shadow|glossary/.test(x.code));
  console.log(formatProblems(p) || 'NO DUPLICATES');
  const ids = new Map<string, string[]>();
  for (const u of tc.units) for (const g of u.glossary ?? []) ids.set(g.id, [...(ids.get(g.id) ?? []), u.id]);
  for (const [k, v] of ids) if (v.length > 1) console.log('glossary shared', k, v.join(','));
});

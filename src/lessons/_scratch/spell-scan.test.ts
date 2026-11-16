import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { loadWrittenUnits, assembleTheory } from '@/content/theory';
import { loadTeacherCourse } from '@/content/teachers';
import { midiToNote } from '@/core/theory';
import { exerciseSpelling, spellPitch, tabMidi, inferSpelling, keySpelling } from '../spelling';
import { phraseMidi } from '../grade';

function walk(node: unknown, path: string, visit: (o: Record<string, unknown>, path: string) => void): void {
  if (Array.isArray(node)) node.forEach((n, i) => walk(n, `${path}[${i}]`, visit));
  else if (node && typeof node === 'object') {
    visit(node as Record<string, unknown>, path);
    for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`, visit);
  }
}

it('scan spellings', async () => {
  const theory = assembleTheory(await loadWrittenUnits());
  const courses = [theory.course, ...(await Promise.all((['mia', 'dev', 'elena'] as const).map(loadTeacherCourse))).map((c) => c.course)];
  const out: string[] = [];
  for (const course of courses) {
    for (const unit of course.units) for (const lesson of unit.lessons) {
      walk(lesson.steps, `${course.id}/${lesson.id}`, (o, path) => {
        let midis: number[] = [];
        let ctx: ReturnType<typeof exerciseSpelling> | null | undefined;
        let what = '';
        if (o.type === 'play-phrase') {
          midis = phraseMidi(o as never);
          ctx = exerciseSpelling(o as never);
          what = 'play-phrase';
        } else if (o.kind === 'tab' && Array.isArray(o.notes) && !('type' in o)) {
          midis = tabMidi(o.notes as never, o as never);
          ctx = keySpelling(o.key as string) ?? inferSpelling(midis);
          what = 'tab';
        } else return;
        const changed = midis.filter((m) => midiToNote(m) !== spellPitch(m, ctx));
        if (changed.length > 0) out.push(`${path} ${what} ctx=${JSON.stringify(ctx)} old=${[...new Set(changed.map((m) => midiToNote(m)))].join(',')} new=${[...new Set(changed.map((m) => spellPitch(m, ctx)))].join(',')} all=${midis.map((m) => spellPitch(m, ctx)).join(' ')}`);
      });
    }
  }
  writeFileSync('/tmp/claude-0/-home-user-context-frontend/0b0936e9-a44d-5458-b711-cf2957d3d9cc/scratchpad/spell-scan.txt', out.join('\n'));
}, 120000);

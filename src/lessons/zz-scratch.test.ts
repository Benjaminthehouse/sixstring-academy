import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import * as L from './index';

test('dump', () => {
  const out: string[] = [];
  out.push('EXPORTS: ' + Object.keys(L).sort().join(' '));
  for (const kind of L.GENERATOR_KINDS) {
    const g = L.getGenerator(kind)!;
    out.push(`#### \`${kind}\`${g.mic ? ' (microphone)' : ''}`);
    out.push(`${g.summary} Produces: ${g.produces.map((p) => `\`${p}\``).join(', ')}.`);
    out.push('');
    out.push('| param | type | default | meaning |');
    out.push('|---|---|---|---|');
    for (const p of g.params) out.push(`| \`${p.name}\` | \`${p.type.replace(/\|/g, '\\|')}\` | ${p.default} | ${p.description} |`);
    out.push('');
  }
  const sample = (kind: string, params: object, seed: number): string => {
    const e = L.generateStrict({ generate: kind, params } as L.GeneratedStep, { seed, difficulty: 0.3 });
    return `${'prompt' in e && e.prompt ? L.plainText(e.prompt as string) : ''} -> ${L.answerText(e)}`;
  };
  out.push(sample('interval-name', {}, 3), sample('key-signature', { ask: 'accidentals' }, 3), sample('chord-tones', {}, 4));
  out.push('TEXT_LIMITS ' + JSON.stringify(L.TEXT_LIMITS));
  out.push('COUNT ' + JSON.stringify(L.COUNT_LIMITS) + JSON.stringify(L.LESSON_LIMITS) + JSON.stringify(L.COURSE_LIMITS));
  out.push('GLOSSARY ' + L.GLOSSARY.map((t) => t.id).join(' '));
  writeFileSync('/tmp/claude-0/-home-user-context-frontend/0b0936e9-a44d-5458-b711-cf2957d3d9cc/scratchpad/docs.txt', out.join('\n'));
});

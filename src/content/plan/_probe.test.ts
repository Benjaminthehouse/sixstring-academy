import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { SCALES, CHORD_TYPES } from '@/core/theory';
it('probe', () => {
  const a = SCALES.map((s) => `${s.id} [${s.family}] ${s.degrees.join(' ')} | ${s.name}${s.parent ? ` | mode ${s.mode} of ${s.parent}` : ''}`).join('\n');
  const b = CHORD_TYPES.map((c) => `${c.id} '${c.symbol}' ${c.degrees.join(' ')} | ${c.name} [${c.category}/${c.quality}]`).join('\n');
  writeFileSync('/tmp/claude-0/-home-user-context-frontend/0b0936e9-a44d-5458-b711-cf2957d3d9cc/scratchpad/probe.txt', a + '\n\n' + b);
});

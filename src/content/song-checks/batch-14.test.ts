import { it } from 'vitest';
import { scalePatterns } from '@/core/guitar';
import { parseKey } from '@/core/theory';

const out: string[] = [];
const log = (...a: unknown[]) => out.push(a.join(' '));
it('explore', () => {
  for (const p of scalePatterns('C', 'major')) {
    log(p.id, p.name, p.positionName, p.shape, p.position, p.minFret, p.maxFret);
    log('  ', p.notes.map((n) => `${n.string}:${n.fret}${n.note}f${n.finger}${n.stretch ? 's' : ''}${n.shift ? '!' : ''}`).join(' '));
  }
  for (const k of ['A phrygian', 'A lydian', 'Am', 'A', 'C']) log(k, JSON.stringify(parseKey(k)));
  require('node:fs').writeFileSync('/tmp/claude-0/-home-user-context-frontend/0b0936e9-a44d-5458-b711-cf2957d3d9cc/scratchpad/explore.txt', out.join('\n'));
});

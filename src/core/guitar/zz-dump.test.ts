import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { CHORD_TYPES } from '@/core/theory';
import * as g from './index';
test('dbg', () => {
  const out: string[] = [];
  for (const [t, o] of [['standard', {}], ['standard-7', {}], ['standard-7', { allowOpen: 'always', rootInBass: false, maxFret: 22, maxSpan: 5 }], [[28, 33, 40, 45, 50, 55, 59, 64], {}]] as Array<[g.TuningInput, g.VoicingSearchOptions]>) {
    let worst = 0; let worstName = ''; let worstMs = 0;
    for (const type of CHORD_TYPES) for (const root of ['C', 'E', 'G']) {
      const t0 = Date.now();
      g.chordVoicings(root + type.symbol, { tuning: t, ...o });
      const ms = Date.now() - t0;
      const n = (globalThis as Record<string, unknown>).__leaves as number;
      if (n > worst) { worst = n; worstName = root + type.symbol; worstMs = ms; }
    }
    out.push(g.tuning(t).id + ' ' + JSON.stringify(o) + ' worst leaves ' + worst + ' (' + worstName + ', ' + worstMs + ' ms)');
  }
  writeFileSync('/tmp/claude-0/-home-user-context-frontend/0b0936e9-a44d-5458-b711-cf2957d3d9cc/scratchpad/dbg.txt', out.join('\n'));
}, 600000);

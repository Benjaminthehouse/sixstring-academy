import { it } from 'vitest';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { sixTab } from '@/core/song';
import { buildTabModel } from '../model';
it('pm bridging across library', () => {
  const out: string[] = [];
  for (const dir of readdirSync('src/content/songs')) {
    const f = `src/content/songs/${dir}/song.sixtab`;
    if (!existsSync(f)) continue;
    const text = readFileSync(f, 'utf8');
    if (!/\{[^}]*\bpm\b/.test(text)) continue;
    const m = buildTabModel(sixTab(text));
    out.push(`== ${dir}`);
    for (const me of m.measures) {
      const line = me.columns.map((c) => `${c.rest ? 'r' : c.notes.map((n) => `${n.string}:${n.text}${n.note.palmMute ? 'm' : ''}`).join('+')}${c.flags.muted && !c.flags.palmMute ? '[BRIDGE]' : c.flags.palmMute ? '[PM]' : ''}`).join(' ');
      if (/BRIDGE/.test(line)) out.push(`${me.index}: ${line}`);
    }
  }
  writeFileSync('/tmp/claude-0/-home-user-context-frontend/0b0936e9-a44d-5458-b711-cf2957d3d9cc/scratchpad/pm.txt', out.join('\n'));
});

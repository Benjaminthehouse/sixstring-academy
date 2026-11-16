import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { estimateDifficulty, parseSixTab } from '@/core/song';
import { SONG_ENTRIES } from '@/content/songs';

it('estimates', () => {
  const dir = new URL('../songs/', import.meta.url);
  const rows: string[] = [];
  for (const id of readdirSync(dir).filter((x) => !x.includes('.')).sort()) {
    const song = parseSixTab(readFileSync(new URL(`${id}/song.sixtab`, dir), 'utf8')).song!;
    const level = SONG_ENTRIES.find((e) => e.id === id)!.level;
    const t0 = estimateDifficulty(song, { track: 0 });
    const all = estimateDifficulty(song);
    const f = Object.entries(t0.factors).map(([k, v]) => `${k}=${v}`).join(' ');
    rows.push(`${id}\tL${level}\tt0=${t0.level}\tall=${all.level}\t${f}\t${t0.reasons.join(' | ')}`);
  }
  writeFileSync(process.env.EST_OUT ?? '/dev/null', rows.join('\n') + '\n');
});

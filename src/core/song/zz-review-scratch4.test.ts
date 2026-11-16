// TEMPORARY review scratch (deleted after the review).
import { it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { buildVoicing } from '@/core/guitar';
import { SONG_ENTRIES, loadSongText } from '@/content/songs';
import { sixTab } from './sixtab-parse';
import { flattenSong } from './timeline';
const log = (...a: unknown[]) => appendFileSync(process.env.OUT!, a.join(' ') + '\n');

it('strict labels across the library', async () => {
  const seen = new Map<string, Set<string>>();
  for (const e of SONG_ENTRIES) {
    const song = sixTab(await loadSongText(e.id));
    for (const c of song.chords) {
      if (!c.voicing) continue;
      let name: string;
      try { name = buildVoicing(c.symbol, [...c.voicing], { tuning: [...song.tuning], capo: song.capo }).chord; } catch (err) { name = 'THROWS ' + (err as Error).message.slice(0, 80); }
      if (name === c.symbol) continue;
      const k = `${c.symbol}=${c.voicing.map((f) => f ?? 'x').join(',')} -> ${name}`;
      if (!seen.has(k)) seen.set(k, new Set());
      seen.get(k)!.add(e.id);
    }
  }
  for (const [k, ids] of seen) log(k, '|', [...ids].join(' '));
}, 300_000);

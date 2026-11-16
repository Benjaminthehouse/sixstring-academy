// TEMPORARY review scratch (deleted after the review).
import { it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { SONG_ENTRIES, loadSongText } from '@/content/songs';
import { sixTab } from './sixtab-parse';
import { estimateDifficulty } from './stats';
import { estimateDifficulty as builderEstimate } from './zz-review-builder-stats';
const log = (...a: unknown[]) => appendFileSync(process.env.OUT!, a.join(' ') + '\n');
it('per track', async () => {
  for (const e of SONG_ENTRIES) {
    const song = sixTab(await loadSongText(e.id));
    const opts: Array<{ track?: string }> = [{}, ...song.tracks.map((t) => ({ track: t.id }))];
    for (const o of opts) {
      const a = builderEstimate(song, o);
      const b = estimateDifficulty(song, o);
      if (a.level !== b.level || a.reasons.join() !== b.reasons.join()) log(e.id, '|', o.track ?? '(all)', '| builder', a.level, '-> mine', b.level, '|', a.reasons.join(' / ') === b.reasons.join(' / ') ? 'same reasons' : `reasons now: ${b.reasons.join(' / ')} || were: ${a.reasons.join(' / ')}`);
    }
  }
}, 300000);

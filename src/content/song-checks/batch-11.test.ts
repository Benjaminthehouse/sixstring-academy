import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { estimateDifficulty, parseSixTab, songStats } from '@/core/song';
const IDS = ['st-read-second-position', 'st-arpeggio-triads'];
it('explore', () => {
  for (const id of IDS) {
    const song = parseSixTab(readFileSync(new URL(`../songs/${id}/song.sixtab`, import.meta.url), 'utf8')).song!;
    const y = estimateDifficulty(song, { track: 0 });
    const a = estimateDifficulty(song);
    const t = songStats(song).tracks[0];
    console.log(id, 'yours', y.level, y.score, JSON.stringify(y.factors), y.reasons.join(' | '), '| all', a.level, '| span', t.maxSpan, 'shifts', t.shifts, 'nps', t.notesPerSecond.toFixed(2));
  }
});

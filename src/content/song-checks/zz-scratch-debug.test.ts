import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { getTrackStats, parseSixTab } from '@/core/song';
it('debug', () => {
  for (const id of ['st-bossa-groove', 'st-ragtime-blues-c', 'st-caged-scale']) {
    const song = parseSixTab(readFileSync(new URL(`../songs/${id}/song.sixtab`, import.meta.url), 'utf8')).song!;
    const t = getTrackStats(song, 0)!;
    console.log(id, JSON.stringify({ sync: t.syncopation, held: t.heldVoices, thumb: t.thumbVoices, shapes: t.shapes.map((s) => `${s.frets.map((f) => f ?? 'x').join('')}:${s.difficulty.toFixed(1)}${s.barre ? 'B' : ''}x${s.count}`), span: t.maxSpan, shifts: t.shifts }));
  }
});

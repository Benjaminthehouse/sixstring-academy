import { it } from 'vitest';
import { SONG_ENTRIES, loadSongText } from '@/content/songs';
import { parseSixTab } from '@/core/song';
import { scalePcs } from '@/core/theory';

it('explore', async () => {
  const out: string[] = [];
  const list = SONG_ENTRIES;
  for (const s of list) {
    const { song } = parseSixTab(await loadSongText(s.id));
    if (!song) continue;
    for (const t of song.tracks) {
      const pcs = new Set<number>();
      for (const m of t.measures) for (const b of m.beats) for (const n of b.notes) pcs.add(n.midi % 12);
      if (pcs.size === 0 || pcs.size > 6) continue;
      for (let tonic = 0; tonic < 12; tonic++) {
        const mp = new Set(scalePcs(tonic, 'major-pentatonic'));
        if ([...pcs].every((p) => mp.has(p))) out.push(`${s.id} [${t.name} ${t.role}] subset of major pent on pc ${tonic} (${pcs.size} pcs)`);
      }
    }
  }
  require('fs').writeFileSync('/tmp/claude-0/-home-user-context-frontend/0b0936e9-a44d-5458-b711-cf2957d3d9cc/scratchpad/explore.txt', out.join('\n'));
});

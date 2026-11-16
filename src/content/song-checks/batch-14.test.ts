import { it } from 'vitest';
import { estimateDifficulty, flattenSong, parseSixTab, songStats } from '@/core/song';
import { midiToNote } from '@/core/theory';
import { loadSongText, songEntry } from '@/content/songs';

const IDS = (process.env.IDS ?? '').split(',').filter(Boolean);
const out: string[] = [];
const log = (...a: unknown[]) => out.push(a.join(' '));
it('explore', async () => {
  for (const id of IDS) {
    if (!songEntry(id)) { log(id, 'not registered'); continue; }
    const r = parseSixTab(await loadSongText(id));
    log('=====', id, 'errors', JSON.stringify(r.errors), 'warnings', JSON.stringify(r.warnings));
    const song = r.song!;
    const tl = flattenSong(song);
    for (const t of song.tracks) {
      log('-- track', t.name, t.role, 'bars', t.measures.length);
      const rows: string[][] = Array.from({ length: song.bars.length }, () => []);
      for (const b of tl.trackBeats(t.id)) {
        const start = tl.barAt(b.tick).start;
        const struck = b.notes.filter((n) => !n.tie).map((n) => n.midi).sort((x, y) => x - y);
        rows[b.bar].push(`${(b.tick - start) / 480}:${b.source.slash ? 'S' : struck.length ? struck.map((m) => midiToNote(m, { prefer: 'sharps' })).join('+') : b.notes.length ? '~' : 'r'}`);
      }
      rows.forEach((r2, i) => log(`  b${i + 1} [${tl.chordAt(tl.bars.find((x) => x.index === i)!.start)?.symbol}]`, r2.join(' ')));
      try {
        const est = estimateDifficulty(song, { track: t.id });
        log('  estimate', JSON.stringify(est));
      } catch (e) { log('  estimate error', String(e)); }
    }
    const st = songStats(song);
    log('  stats', JSON.stringify(st.tracks.map((x) => ({ track: x.track, range: x.range, frets: x.frets, positions: x.positions, shifts: x.shifts, maxSpan: x.maxSpan, nps: x.notesPerSecond.toFixed(2), sync: x.syncopation.toFixed(2), tech: x.techniques }))));
    log('  seconds', tl.totalSeconds.toFixed(1));
  }
  require('node:fs').writeFileSync('/tmp/claude-0/-home-user-context-frontend/0b0936e9-a44d-5458-b711-cf2957d3d9cc/scratchpad/explore.txt', out.join('\n'));
});

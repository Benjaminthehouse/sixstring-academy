import { it } from 'vitest';
import { parseSixTab, estimateDifficulty, flattenSong, songStats } from '@/core/song';
import { midiToNote } from '@/core/theory';
import { loadSongText } from '@/content/songs';
const IDS = ['st-pent-connect', 'st-barre-progression', 'st-caged-chords', 'st-mode-ionian', 'st-mode-dorian', 'st-mode-mixolydian', 'st-mode-aeolian', 'st-chord-melody-1', 'st-read-fifth-position'];
it('explore', async () => {
  for (const id of IDS) {
    const song = parseSixTab(await loadSongText(id)).song!;
    const t0 = song.tracks[0];
    const est = estimateDifficulty(song, { track: t0.id });
    const all = estimateDifficulty(song);
    const st = songStats(song).tracks[0];
    console.log(id, 'first-track level', est.level, est.score, JSON.stringify(est.factors), '| all', all.level, '| shifts', st.shifts, 'maxSpan', st.maxSpan, 'frets', JSON.stringify(st.frets), 'positions', st.positions.join(','));
    console.log('  chords', song.chords.map((c) => `${c.bar}:${c.tick}:${c.symbol}`).join(' '));
    const tl = flattenSong(song);
    const bars: string[][] = [];
    for (const b of tl.trackBeats(t0.id)) { const bar = b.bar; (bars[bar] ??= []).push(b.notes.length ? b.notes.filter((n) => !n.tie).map((n) => midiToNote(n.midi, { prefer: id.includes('fifth') ? 'auto' : 'sharps' })).join('+') : 'r'); }
    console.log('  ' + bars.map((b, i) => `${i + 1}[${b.join(' ')}]`).join(' '));
  }
});

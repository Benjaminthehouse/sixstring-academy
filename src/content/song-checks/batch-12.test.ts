import { it } from 'vitest';
import { estimateDifficulty, flattenSong, parseSixTab, soundingPitch, songStats } from '@/core/song';
import { midiToNote } from '@/core/theory';
import { loadSongText } from '@/content/songs';
const ids = ['st-duet-baroque', 'st-andalusian-cadence', 'st-bluegrass-g-run', 'st-strum-funk', 'st-delta-blues-e', 'rondo-alla-turca'];
it('explore', async () => {
  for (const id of ids) {
    const song = parseSixTab(await loadSongText(id)).song!;
    for (const t of song.tracks) {
      const est = estimateDifficulty(song, { track: t.id });
      console.log(id, t.name, 'level', est.level, est.score, JSON.stringify(est.factors), est.reasons.join(' | '));
    }
    const tl = flattenSong(song);
    console.log(id, 'bars', song.bars.length, 'played', tl.bars.length, 'sec', Math.round(tl.totalSeconds));
    const t0 = song.tracks[0];
    const line = tl.trackBeats(t0.id).filter((b) => b.notes.length).map((b) => b.notes.filter((n) => !n.tie).map((n) => midiToNote(soundingPitch(n)!, { prefer: 'sharps' })).join('+'));
    console.log(line.slice(0, 80).join(' '));
  }
});

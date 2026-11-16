import { it } from 'vitest';
import { buildVoicing, chordDifficulty, getTuning } from '@/core/guitar';
import { parseSixTab, validateSong, soundingPitch } from '@/core/song';
import { chordPcs, scalePcs, midiToNote } from '@/core/theory';

const out: string[] = [];
const log = (...a: unknown[]) => out.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
it('explore', () => {
  for (const [c, s] of [['Dm7', 'xx3535'], ['G7', 'xx3433'], ['Cmaj7', 'xx2413'], ['Gm7', 'x-x-8-10-8-10'], ['C7', 'x-x-8-9-8-8'], ['Fmaj7', 'x-x-7-9-6-8'], ['Bm7b5', 'x2323x'], ['E7', 'xx2434'], ['Am7', 'xx2213'], ['Am7', 'x02213'], ['Am7b5', 'x0101x'], ['Bbmaj7', 'x1323x'], ['E', '022100'], ['F', 'xx3211'], ['B7', 'x21202'], ['Em', '022000'], ['G', '320003'], ['C', 'x32010'], ['Am', 'x02210'], ['D', 'xx0232']]) {
    try {
      const v = buildVoicing(c, s);
      log(c, s, v.chord, v.fingers, v.barres, v.label, v.difficulty);
    } catch (e) {
      log(c, s, 'ERR', String(e));
    }
  }
  for (const c of ['Dm7', 'G7', 'Cmaj7', 'Gm7', 'C7', 'Fmaj7', 'Bm7b5', 'E7', 'Am7', 'Am7b5', 'Bbmaj7', 'E', 'F', 'G7', 'C7', 'D7']) log('diff', c, chordDifficulty(c));
  log('dadgad', getTuning('dadgad')?.midi, 'openg', getTuning('open-g')?.midi);
  for (const s of ['locrian', 'phrygian', 'harmonic-minor', 'minor', 'major', 'minor-pentatonic', 'minor-blues']) log(s, scalePcs('A', s));
  log(chordPcs('Am7b5'), chordPcs('Bbmaj7'), chordPcs('Bm7b5'));
  const t = `title: X
tempo: 80
time: 4/4
key: Am
track: A
role: rhythm
| "Am7=xx2213" q (4:2 3:2 2:1 1:3) D D D | "Dm7=xx3535" q D D "G7=xx3433" D D |
| "Cmaj7=xx2413" q (/3:12 /2:12 /1:12){vib} 1:<12> e3 1:12 1:17h q3 1:-~ q3 r |
| "Gm7=x-x-8-10-8-10" q D D "C7=x-x-8-9-8-8" D D | "Fmaj7=x-x-7-9-6-8" w D |`;
  const r = parseSixTab(t);
  log('errors', r.errors, r.warnings);
  if (r.song) {
    log('issues', validateSong(r.song));
    for (const b of r.song.tracks[0].measures[2].beats) log(b.notes.map((n) => [n.string, n.fret, n.midi, soundingPitch(n), midiToNote(n.midi), n.slideIn, n.vibrato, n.harmonic, n.tie, n.legato]));
  }
  require('node:fs').writeFileSync('/tmp/claude-0/-home-user-context-frontend/0b0936e9-a44d-5458-b711-cf2957d3d9cc/scratchpad/explore15.txt', out.join('\n'));
});

import { it } from 'vitest';
import { chordSlug, chordNotes, scaleNotes } from '@/core/theory';
import { identifyFretted, noteAt, chordVoicings } from '@/core/guitar';
import { chordFromParam } from '@/features/chords/model/symbols';

it('explore', () => {
  for (const c of ['Em', 'D', 'A7', 'A', 'E7', 'G', 'C', 'D7', 'Am', 'Dm', 'E', 'B7']) {
    const s = chordSlug(c);
    console.log(c, s, chordFromParam(s), chordNotes(c).join(' '), chordVoicings(c)[0].frets.join(','), chordVoicings(c)[0].fingers.join(','));
  }
  for (const sh of ['xx0232', 'x02020', '320003', '320033', 'x32010', 'xx0212', 'x02210', 'xx0231', '022100', '020100', 'x21202', '022000', 'x02220']) {
    const r = identifyFretted(sh);
    console.log(sh, r.symbol, r.notes.map((n) => `${n.string}:${n.fret}=${n.note}`).join(' '));
  }
  console.log(scaleNotes('D', 'major').join(' '), scaleNotes('G', 'major').join(' '), scaleNotes('E', 'minor').join(' '), scaleNotes('A', 'minor').join(' '));
  console.log(noteAt({ string: 3, fret: 1 }, { context: { chord: 'E7' } }));
});

import { it } from 'vitest';
import { chordVoicings, buildVoicing, identifyFretted, midiAt } from '@/core/guitar';
import { chordNotes, intervalBetween } from '@/core/theory';

it('explore', () => {
  for (const c of ['Em', 'C', 'E', 'A', 'Am', 'D', 'Dm', 'G5', 'A5', 'E5', 'G', 'F']) {
    const v = chordVoicings(c)[0];
    console.log(c, v.frets.map((f) => (f === null ? 'x' : f)).join(''), v.fingers.map((f) => (f === null ? 'x' : f)).join(''), v.chord, v.notes.map((n) => `${n.string}:${n.fret}=${n.note}(${n.degree})`).join(' '));
  }
  for (const [c, f] of [['C', '032010'], ['G5', '355xxx'], ['E5', '022xxx'], ['A5', '577xxx'], ['Em', '022000']] as const) {
    const v = buildVoicing(c, f);
    console.log(c, f, v.chord, identifyFretted(f).symbol);
  }
  console.log(chordNotes('C'), chordNotes('Am'), chordNotes('E'), chordNotes('Em'), chordNotes('G5'), intervalBetween('C', 'E'), intervalBetween('E', 'G'));
  console.log(midiAt({ string: 2, fret: 2 }), midiAt({ string: 5, fret: 4 }));
});

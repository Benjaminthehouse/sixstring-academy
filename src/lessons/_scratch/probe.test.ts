import { it } from 'vitest';
import { chordWaitArgs } from '../listen';
import { normalizeText } from '../answers';
import { inferSpelling, spellPitch, exerciseSpelling } from '../spelling';
import { grade, solve } from '../grade';
import { exerciseProblems } from '../check';
import { voicingFor } from '../figures';
import { chordPcs } from '@/core/theory';
import { matchChord } from '@/core/pitch';

it('probe', () => {
  const base = { type: 'play-chord' as const, prompt: 'p', explain: 'e', alternative: { type: 'true-false' as const, statement: 's', answer: true, explain: 'e' } };
  for (const [chord, frets] of [['G13', '3x345x'], ['G7', '3x34xx'], ['Cmaj7', 'x3545x'], ['Am7', 'x0201x'], ['E5', '022xxx'], ['C', undefined], ['D', undefined], ['A', '320003']] as const) {
    const ex = { ...base, chord, frets, capo: chord === 'A' ? 2 : undefined };
    const v = voicingFor(chord, frets, { capo: ex.capo });
    console.log(chord, frets, 'voicing', v ? v.midi : null, 'problems', exerciseProblems(ex).map((p) => p.message), 'args', JSON.stringify(chordWaitArgs(ex).chord), 'old pcs', chordPcs(chord));
  }
  for (const s of ['6-', '6 -', '2 - 5 - 1', '2-5-1', '1 6- 4 5', '6m', 'C - G', 'I-IV-V', 'b3', '#4', '-3', '6−', '10-8-8', 'x32010', 'A7(b9)']) console.log(JSON.stringify(s), '->', JSON.stringify(normalizeText(s)));
  const blues = [57, 60, 62, 63, 64, 67, 69];
  console.log('A blues', JSON.stringify(inferSpelling(blues)), blues.map((m) => spellPitch(m, inferSpelling(blues))));
  const dmaj = [62, 64, 66, 67, 69, 71, 73, 74];
  console.log('D major', JSON.stringify(inferSpelling(dmaj)), dmaj.map((m) => spellPitch(m, inferSpelling(dmaj))));
  const bb = [58, 60, 62, 63, 65, 67, 69, 70];
  console.log('Bb major', JSON.stringify(inferSpelling(bb)), bb.map((m) => spellPitch(m, inferSpelling(bb))));
  const chrom = [52, 53, 54, 55, 56, 57];
  console.log('chromatic', JSON.stringify(inferSpelling(chrom)), chrom.map((m) => spellPitch(m, inferSpelling(chrom))));
  const em = [64, 66, 67, 69, 71, 72, 74, 76];
  console.log('E minor', JSON.stringify(inferSpelling(em)), em.map((m) => spellPitch(m, inferSpelling(em))));
  const twoNotes = [64, 66];
  console.log('E F#', JSON.stringify(inferSpelling(twoNotes)), twoNotes.map((m) => spellPitch(m, inferSpelling(twoNotes))));
  const pn = { ...base, type: 'play-note' as const, note: 'Bb2', octave: 'exact' as const } as never;
  console.log('play-note Bb2', JSON.stringify(exerciseSpelling(pn)), spellPitch(46, exerciseSpelling(pn)), spellPitch(47, exerciseSpelling(pn)));
  const am = { type: 'chord-build' as const, task: 'fingers' as const, chord: 'C', prompt: 'p', explain: 'e' };
  for (const frets of [[0, 3, 2, 0, 1, 0], [null, 3, 2, 0, 0, 0], [null, 3, 2, 2, 1, 0], [null, 3, 3, 0, 1, 0], [null, 0, 2, 2, 1, 0], [3, 2, 0, 0, 0, 3], [null, null, null, null, null, 0]] as Array<Array<number | null>>) {
    const r = grade(am, { type: 'chord-build', frets }, { chordsTaught: ['C', 'G', 'Am', 'Em', 'D'] });
    console.log('C build', frets.map((f) => f ?? 'x').join(''), r.correct, r.feedback.note, '|', r.feedback.answer);
  }
});

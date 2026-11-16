import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { chordNotes, getChordType, parseChord, transposeChord, progressionToChords, identifyChord, romanToChord } from '@/core/theory';
import { tryBuildVoicing, identifyFretted, chordVoicings, voicingProblem, suggestCapo } from '@/core/guitar';

it('explore', () => {
  const log: string[] = [];
  const p = (...a: unknown[]) => log.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  for (const s of ['Csus2', 'Csus4', 'Gsus4', 'Dsus4', 'Dsus2', 'Asus2', 'Asus4', 'A7sus4', 'Cadd9', 'Gadd9', 'C9', 'Cadd4', 'Cadd11', 'C6', 'Am7', 'Am6', 'C6/9', 'G6', 'D/F#', 'G/B', 'D/C', 'C/B', 'Am/G', 'Cmaj7/B', 'E7sus4', 'D7sus4', 'Esus4', 'Esus2', 'Fadd9', 'Dadd9', 'Aadd9', 'Em6', 'Dm6', 'A6', 'D6', 'E6', 'Em7', 'G6/9', 'D6/9']) {
    const c = parseChord(s);
    p(s, c ? c.type.id : null, c ? chordNotes(s, { withBass: true }) : null, c?.type.degrees, c?.type.custom);
  }
  for (const [s, f] of [['Dsus2', 'xx0230'], ['D', 'xx0232'], ['Dsus4', 'xx0233'], ['Asus2', 'x02200'], ['A', 'x02220'], ['Asus4', 'x02230'], ['A7sus4', 'x02030'], ['C', 'x32010'], ['Cadd9', 'x32030'], ['C9', 'x32333'], ['C6', 'x35555'], ['Am7', 'x02010'], ['Am6', 'x02212'], ['C6/9', 'x32233'], ['D/F#', '2x0232'], ['G/B', 'x20003'], ['D/C', 'x30232'], ['C/B', 'x22010'], ['Am', 'x02210'], ['Am/G', '3x2210'], ['F', 'xx3211'], ['G', '320003'], ['Bm', 'x24432'], ['Em', '022000'], ['Gsus4', '330013'], ['Esus4', '022200'], ['Esus2', '024400'], ['Gadd9', '320203'], ['Gadd9', '300203'], ['Fmaj7', 'xx3210'], ['Dsus2', 'xx0230'], ['C/E', '032010'], ['G/D', 'xx0003'], ['Em7', '022030'], ['A/C#', 'x4222x'], ['Cadd9/E', '032030'], ['E7sus4', '020200'], ['Dadd9', 'xx0230'], ['G6', '320000'], ['D6', 'xx0202'], ['Am/F#', '2x2210'], ['Fmaj7/C', 'x33210'], ['Am/G', '302210']]) {
    const v = tryBuildVoicing(s, f);
    p('voicing', s, f, v?.chord ?? voicingProblem(s, f), 'identify:', identifyFretted(f).symbol, v?.notes.map((n) => `${n.note}:${n.degree}`));
  }
  p('lib Asus4', chordVoicings('Asus4').slice(0, 3).map((v) => v.frets));
  p('lib Cadd9', chordVoicings('Cadd9').slice(0, 3).map((v) => v.frets));
  p('lib Gsus4', chordVoicings('Gsus4').slice(0, 3).map((v) => v.frets));
  p('lib G/B', chordVoicings('G/B').slice(0, 3).map((v) => v.frets));
  p('lib C/B', chordVoicings('C/B').slice(0, 3).map((v) => v.frets));
  p('lib Am/G', chordVoicings('Am/G').slice(0, 3).map((v) => v.frets));
  p('lib D/F#', chordVoicings('D/F#').slice(0, 3).map((v) => v.frets));
  p('lib D/C', chordVoicings('D/C').slice(0, 3).map((v) => v.frets));
  p('lib C6', chordVoicings('C6').slice(0, 3).map((v) => v.frets));
  p('lib Am6', chordVoicings('Am6').slice(0, 3).map((v) => v.frets));
  p('lib C6/9', chordVoicings('C6/9').slice(0, 3).map((v) => v.frets));
  p('lib A7sus4', chordVoicings('A7sus4').slice(0, 3).map((v) => v.frets));
  p('lib Dsus2', chordVoicings('Dsus2').slice(0, 3).map((v) => v.frets));
  p('lib Dsus4', chordVoicings('Dsus4').slice(0, 3).map((v) => v.frets));
  p('identify CEGA', identifyChord(['C', 'E', 'G', 'A']), identifyChord(['A', 'C', 'E', 'G']));
  p('transpose', transposeChord('Em7', 'P4'), ['C', 'Am', 'F', 'G'].map((c) => transposeChord(c, 'M2')), ['G', 'C', 'D'].map((c) => transposeChord(c, 'M2')));
  p('prog', progressionToChords('I V vi IV', 'G'), progressionToChords('I V vi IV', 'A'), progressionToChords('I vi IV V', 'D'), progressionToChords('I IV vi V', 'D'));
  p('capo', suggestCapo(['Bb', 'Eb', 'F', 'Gm']).slice(0, 2).map((s) => [s.capo, s.shapes.map((x) => x.shape)]));
  p('roman', romanToChord('V/vii', 'C'));
  writeFileSync('/tmp/claude-0/-home-user-context-frontend/0b0936e9-a44d-5458-b711-cf2957d3d9cc/scratchpad/explore.txt', log.join('\n'));
  void getChordType;
});

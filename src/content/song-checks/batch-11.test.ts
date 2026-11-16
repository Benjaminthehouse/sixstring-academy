import { it } from 'vitest';
import { scalePatterns, chordVoicings, identifyFretted } from '@/core/guitar';
it('explore', () => {
  for (const up of [false, true]) {
    for (const p of scalePatterns('A', 'minor-pentatonic', { upTheNeck: up })) {
      console.log(up, p.id, p.name, p.positionName, p.position, p.minFret, p.maxFret, p.notes.map((n) => `${n.string}:${n.fret}${n.note}{${n.finger}}${n.stretch ? 'S' : ''}${n.shift ? 'H' : ''}`).join(' '));
    }
  }
  for (const s of ['133211', '355433', '577655', '133111', '355333', '577555', 'x13331', 'x24442', 'x35553', 'x24432', 'x35543', 'xx3210', 'x02010', '320001', 'xx3211']) {
    console.log(s, identifyFretted(s)?.symbol);
  }
  console.log(chordVoicings('F').slice(0, 3).map((v) => `${v.label} ${v.frets.join(',')} ${v.fingers.join(',')}`));
  console.log(chordVoicings('Bb').slice(0, 3).map((v) => `${v.label} ${v.frets.join(',')} ${v.fingers.join(',')}`));
  console.log(chordVoicings('Bm').slice(0, 3).map((v) => `${v.label} ${v.frets.join(',')} ${v.fingers.join(',')}`));
});

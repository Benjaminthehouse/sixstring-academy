import { it } from 'vitest';
import { scalePatterns, chordVoicings, buildVoicing, midiAt } from '@/core/guitar';
import { scaleNotes, getScale, chordNotes, chordTones } from '@/core/theory';

it('probe', () => {
  const out: string[] = [];
  for (const [t, s, opts] of [['A', 'minor-pentatonic', { upTheNeck: true }], ['A', 'minor-pentatonic', {}], ['C', 'major-pentatonic', {}], ['A', 'major-pentatonic', {}], ['A', 'minor-blues', {}], ['A', 'major-blues', {}]] as const) {
    out.push(`== ${t} ${s} ${JSON.stringify(opts)}`);
    for (const p of scalePatterns(t, s, opts as object)) {
      out.push(`${p.id} ${p.name} pos ${p.position} ${p.minFret}-${p.maxFret} span ${p.span} roots ${p.roots.map((r) => `${r.string}:${r.fret}`).join(',')}`);
      out.push('  ' + p.notes.map((n) => `${n.string}:${n.fret}${n.note}(${n.degree})f${n.finger}${n.stretch ? 'S' : ''}${n.shift ? 'H' : ''}`).join(' '));
    }
  }
  for (const s of ['minor-pentatonic', 'major-pentatonic', 'minor-blues', 'major-blues', 'minor', 'major']) out.push(`${s}: ${getScale(s)!.degrees.join(' ')} | A ${scaleNotes('A', s).join(' ')} | E ${scaleNotes('E', s).join(' ')} | D ${scaleNotes('D', s).join(' ')} | C ${scaleNotes('C', s).join(' ')} | G ${scaleNotes('G', s).join(' ')}`);
  for (const c of ['A7', 'D7', 'E7', 'B7', 'Am7', 'Dm7', 'Em7', 'A', 'D', 'E', 'Am', 'Dm', 'G7', 'C7']) {
    const v = chordVoicings(c).slice(0, 3).map((x) => `${x.frets.map((f) => (f === null ? 'x' : f)).join('')} ${x.label} d${x.difficulty}`);
    out.push(`${c}: ${chordNotes(c).join(' ')} | ${chordTones(c).map((t) => t.degree).join(' ')} | ${v.join(' ; ')}`);
  }
  for (const [c, f] of [['A7', 'x02020'], ['D7', 'xx0212'], ['E7', '020100'], ['B7', 'x21202'], ['Am7', 'x02010'], ['Dm7', 'xx0211'], ['A', 'x02220'], ['D', 'xx0232'], ['E', '022100']]) {
    const v = buildVoicing(c, f);
    out.push(`${c} ${f}: ${v.chord} ${v.notes.map((n) => `${n.string}:${n.fret}${n.note}(${n.degree})`).join(' ')}`);
  }
  out.push(`3:7 ${midiAt({ string: 3, fret: 7 })} 3:9 ${midiAt({ string: 3, fret: 9 })} 2:8 ${midiAt({ string: 2, fret: 8 })} 2:10 ${midiAt({ string: 2, fret: 10 })}`);
  require('node:fs').writeFileSync('/tmp/claude-0/-home-user-context-frontend/0b0936e9-a44d-5458-b711-cf2957d3d9cc/scratchpad/probe.txt', out.join('\n'));
});

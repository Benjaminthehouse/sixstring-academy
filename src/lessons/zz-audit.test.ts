import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import * as L from './index';

const P = (t: unknown): string => (t === undefined || t === null ? '' : L.plainText(t as L.RichText));

function describe(e: L.Exercise): string[] {
  const lines: string[] = [];
  lines.push(`[${e.type}] ${P('prompt' in e ? e.prompt : '')}${'statement' in e ? ' :: ' + P(e.statement) : ''}${'front' in e ? ' :: ' + P(e.front) + ' / ' + P(e.back) : ''}`);
  if (e.type === 'choice' || e.type === 'listen-choice') {
    lines.push('   opts: ' + e.options.map((o) => `${o.correct ? '*' : ''}${o.text ? P(o.text) : ''}${o.figure ? '<' + o.figure.kind + ':' + JSON.stringify(o.figure).slice(0, 80) + '>' : ''}`).join(' | '));
  }
  if (e.type === 'listen-choice') lines.push('   sound: ' + JSON.stringify(e.sound));
  if (e.type === 'match-pairs') lines.push('   pairs: ' + e.pairs.map((p) => `${P(p.left)}=${P(p.right)}`).join(' ; '));
  if (e.type === 'order') lines.push('   tiles: ' + e.tiles.map(P).join(' ') + (e.distractors ? ' || ' + e.distractors.map(P).join(' ') : ''));
  if (e.type === 'fill-blanks') lines.push(`   text: ${P(e.text)} blanks: ${e.blanks.join(',')} bank: ${(e.bank ?? []).join(',')}`);
  if (e.type === 'type-answer') lines.push('   spec: ' + JSON.stringify(e.answer));
  if (e.type === 'fretboard-find') lines.push(`   find: ${JSON.stringify(e.find)} ${e.mode} oct=${e.octave} frets=${e.frets} strings=${e.strings ?? ''} shown=${JSON.stringify(e.shown ?? [])} targets=${L.findTargets(e).map((t) => `${t.string}:${t.fret}=${t.note}${t.midi}`).join(',')}`);
  if (e.type === 'fretboard-name') lines.push(`   pos=${JSON.stringify(e.position)} root=${JSON.stringify(e.root)} ask=${e.ask} sp=${e.spelling} key=${e.key ?? ''} options=${(e.options ?? []).join(',')}`);
  if (e.type === 'chord-build') lines.push(`   chord=${e.chord} task=${e.task} frets=${JSON.stringify(e.frets)} given=${e.given ?? ''} options=${e.options ?? ''}`);
  if (e.type === 'staff-read' || e.type === 'staff-place') lines.push(`   note=${e.note} key=${e.key ?? ''} ${'options' in e ? 'options=' + (e.options ?? []).join(',') : ''} ${'octave' in e ? 'oct=' + e.octave : ''}`);
  if (e.type === 'tap-rhythm') lines.push(`   rhythm=${JSON.stringify(e.rhythm)} tempo=${e.tempo} show=${e.show}`);
  if (e.type === 'play-note' || e.type === 'play-chord' || e.type === 'play-phrase') {
    lines.push('   play: ' + JSON.stringify({ ...e, alternative: undefined, explain: undefined, prompt: undefined }));
    lines.push('   ALT -> ' + describe(e.alternative && 'generate' in e.alternative ? L.generateStrict(e.alternative, { seed: 1 }) : (e.alternative as L.Exercise)).join('\n      '));
  }
  if (e.figure) lines.push('   figure: ' + JSON.stringify(e.figure).slice(0, 200));
  if (e.hint) lines.push('   hint: ' + P(e.hint));
  lines.push('   answer: ' + L.answerText(e));
  if ('explain' in e) lines.push('   explain: ' + P(e.explain));
  return lines;
}

test('audit dump', () => {
  const out: string[] = [];
  for (const kind of L.GENERATOR_KINDS) {
    out.push(`== ${kind}`);
    const seen = new Set<string>();
    let n = 0;
    for (const difficulty of [0, 0.5, 1]) {
      for (let seed = 1; seed <= 40 && n < 9; seed++) {
        const e = L.generateStrict({ generate: kind } as L.GeneratedStep, { seed: seed * 7919 + difficulty * 13, difficulty });
        const d = describe(e);
        const key = d[0];
        if (seen.has(key)) continue;
        seen.add(key);
        if (seed % 3 !== 0 && n >= 3 && difficulty < 1) continue;
        n++;
        out.push(`  (d=${difficulty})`, ...d.map((l) => '  ' + l));
      }
    }
  }
  writeFileSync('/tmp/claude-0/-home-user-context-frontend/0b0936e9-a44d-5458-b711-cf2957d3d9cc/scratchpad/lessons-audit.txt', out.join('\n'));
});

test('audit variants', () => {
  const V: Array<[string, object]> = [
    ['interval-name', {}], ['interval-note', { direction: 'down' }], ['semitones-match', { pairs: 5 }],
    ['interval-on-neck', { ask: 'name' }], ['interval-on-neck', { ask: 'degree' }], ['interval-on-neck', {}],
    ['note-on-string', { strings: [5, 4, 3, 2], frets: [0, 12] }], ['note-on-string', { ask: 'find', strings: [5] }], ['note-on-string', { ask: 'fret', strings: [3, 2] }],
    ['open-strings', { ask: 'name' }], ['open-strings', { ask: 'number' }], ['open-strings', { ask: 'order', tuning: 'drop-d' }],
    ['step-up', { steps: [1, 2, 3, 5] }], ['enharmonic', { notes: ['E#', 'Cb', 'B#', 'Fb', 'Db'] }],
    ['scale-notes', { scales: ['minor', 'minor-pentatonic', 'major-pentatonic', 'harmonic-minor', 'dorian'], form: 'fill' }],
    ['scale-notes', { form: 'odd-one-out', scales: ['major', 'minor'] }], ['scale-notes', { tonics: ['F#', 'C#', 'Gb', 'Cb'] }],
    ['scale-formula', { scales: ['major', 'minor', 'harmonic-minor', 'dorian', 'mixolydian', 'major-pentatonic'] }],
    ['key-signature', { ask: 'key', modes: ['major', 'minor'], maxAccidentals: 7 }], ['key-signature', { ask: 'accidentals', maxAccidentals: 7 }],
    ['key-signature', { ask: 'count', modes: ['minor'], maxAccidentals: 7 }],
    ['relative-key', { direction: 'both', maxAccidentals: 7 }],
    ['degree-in-key', { ask: 'degree', modes: ['major', 'minor'], maxAccidentals: 7 }], ['degree-in-key', { ask: 'note', modes: ['minor'], maxAccidentals: 7 }],
    ['fifths-order', { ask: 'sharps', count: 7 }], ['fifths-order', { ask: 'flats', count: 5 }], ['fifths-order', { ask: 'keys', count: 6 }],
    ['chord-tones', { types: ['major', 'minor', 'dim', 'aug', '7', 'maj7', 'm7', 'm7b5', 'sus4'], ask: 'notes' }],
    ['chord-tones', { types: ['major', 'minor', '7', 'maj7', 'm7', 'dim'], ask: 'tone' }],
    ['chord-tones', { types: ['major', 'minor', '7', 'maj7', 'm7'], ask: 'missing' }],
    ['chord-tones', { types: ['major', 'minor', 'dim', 'aug', '7', 'maj7', 'm7'], ask: 'name' }],
    ['diatonic-chord', { ask: 'quality', modes: ['major', 'minor'], maxAccidentals: 6 }], ['diatonic-chord', { sevenths: true, modes: ['major', 'minor'], maxAccidentals: 6 }],
    ['diatonic-chord', { sevenths: true, ask: 'quality', modes: ['minor'] }],
    ['roman-chord', { direction: 'to-roman', modes: ['major', 'minor'], maxAccidentals: 6 }], ['roman-chord', { modes: ['minor'], maxAccidentals: 6 }],
    ['chord-shape', { chords: ['Em', 'Am', 'E', 'A', 'D', 'G', 'C', 'Dm', 'E7', 'A7', 'D7', 'G7', 'C7', 'B7', 'F'] }],
    ['neck-tones', { what: 'scale' }], ['neck-tones', { what: 'chord', chords: ['F', 'Bb', 'C#m', 'F#'] }],
    ['note-value-math', { ask: 'beats', dotted: true }], ['note-value-math', { ask: 'sum', dotted: true }], ['note-value-math', { ask: 'fit', dotted: true }],
    ['meter', { ask: 'unit', signatures: ['4/4', '3/4', '2/4', '6/8', '2/2', '3/8', '12/8'] }], ['meter', { ask: 'fill', signatures: ['4/4', '3/4', '6/8', '2/2', '9/8'] }],
    ['meter', { ask: 'beats', signatures: ['6/8', '2/2', '12/8', '9/8', '5/4', '7/8'] }],
    ['rhythm-tap', { values: ['half', 'quarter', 'eighth', 'sixteenth'], bars: 2, rests: true, tempo: 70 }], ['rhythm-ear', { values: ['quarter', 'eighth', 'sixteenth', 'half'] }],
    ['higher-lower', {}], ['interval-ear', { play: 'together' }], ['interval-ear', { play: 'down' }],
    ['chord-quality-ear', { types: ['major', 'minor', 'dim', 'aug', '7', 'maj7', 'm7'] }], ['scale-ear', { scales: ['major', 'minor', 'minor-pentatonic', 'dorian', 'mixolydian', 'harmonic-minor'] }],
    ['cadence-ear', { types: ['authentic', 'half', 'plagal', 'deceptive'] }],
    ['staff-note', { ask: 'place' }], ['staff-note', { accidentals: true, low: 'E2', high: 'A4' }], ['staff-note', { ask: 'place', accidentals: true, low: 'E2', high: 'C5' }],
    ['play-note', { naturals: false, frets: [0, 5] }],
  ];
  const out: string[] = [];
  for (const [kind, params] of V) {
    out.push(`== ${kind} ${JSON.stringify(params)}`);
    const seen = new Set<string>();
    let n = 0;
    for (let seed = 1; seed <= 60 && n < 5; seed++) {
      const difficulty = seed % 3 === 0 ? 0.5 : 1;
      const e = L.generateStrict({ generate: kind, params } as L.GeneratedStep, { seed: seed * 104729, difficulty });
      const d = describe(e);
      const key = d.join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      n++;
      out.push(...d.map((l) => '  ' + l));
    }
  }
  writeFileSync('/tmp/claude-0/-home-user-context-frontend/0b0936e9-a44d-5458-b711-cf2957d3d9cc/scratchpad/lessons-audit2.txt', out.join('\n'));
});

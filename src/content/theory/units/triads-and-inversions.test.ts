import { it } from 'vitest';
import { chordNotes, getChordType, parseChord, diatonicChords, intervalBetween } from '@/core/theory';
import { buildVoicing, chordVoicings, identifyFretted, tryBuildVoicing, voicingProblem, midiAt, noteAt, scalePatterns, libraryVoicings } from '@/core/guitar';
import { getGenerator, generateExercise, validateCourse, formatProblems } from '@/lessons';

it("probe", async () => {
  const out: string[] = [];
  const log = (...a: unknown[]) => out.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  for (const t of ['major', 'minor', 'dim', 'aug']) log(t, getChordType(t)?.symbol, getChordType(t)?.degrees, getChordType(t)?.name);
  log('Cdim', chordNotes('Cdim'), 'Caug', chordNotes('Caug'), 'C+', parseChord('C+')?.symbol, parseChord('C°')?.symbol);
  for (const [s, f] of [['C', [null, null, 10, 9, 8, null]], ['Cm', [null, null, 10, 8, 8, null]], ['Cdim', [null, null, 10, 8, 7, null]], ['Caug', [null, null, 10, 9, 9, null]]] as const) {
    const v = tryBuildVoicing(s, [...f]);
    log(s, v?.chord, v?.notes.map((n) => `${n.note}${n.degree}`), voicingProblem(s, [...f]));
  }
  for (const [s, f] of [['C', 'x32010'], ['C/E', '032010'], ['C/G', '332010'], ['C', '032010'], ['C', '332010']] as const) {
    const v = tryBuildVoicing(s, f);
    log('inv', s, f, v?.chord, v?.inversion, voicingProblem(s, f), identifyFretted(f).symbol);
  }
  const tri = (name: string, frets: Array<number | null>) => {
    const r = identifyFretted(frets);
    log('tri', name, frets.join(','), r.symbol, r.notes.map((n) => `${n.note}${n.midi}`));
  };
  tri('G 1st', [null, null, null, 4, 3, 3]);
  tri('G 2nd', [null, null, null, 7, 8, 7]);
  tri('G root', [null, null, null, 12, 12, 10]);
  tri('A 1st', [null, null, null, 6, 5, 5]);
  tri('Gm 1st', [null, null, null, 3, 3, 3]);
  tri('Gm 2nd', [null, null, null, 7, 8, 6]);
  tri('Gm root', [null, null, null, 12, 11, 10]);
  tri('F root 432', [null, null, 3, 2, 1, null]);
  tri('F 1st 432', [null, null, 7, 5, 6, null]);
  tri('F 2nd 432', [null, null, 10, 10, 10, null]);
  tri('small F', [null, null, 3, 2, 1, 1]);
  for (const [s, f] of [['G/D', [null, null, null, 7, 8, 7]], ['G', [null, null, null, 7, 8, 7]], ['G/B', [null, null, null, 4, 3, 3]], ['G', [null, null, null, 12, 12, 10]]] as const) {
    log('slash', s, voicingProblem(s, [...f]), tryBuildVoicing(s, [...f])?.chord);
  }
  // CAGED shapes and barres
  for (const c of ['F', 'Fm', 'F#', 'F#m', 'G', 'Gm', 'G#', 'Ab', 'G#m', 'A', 'Am', 'Bb', 'B', 'Bm', 'Bbm', 'C', 'Cm', 'C#', 'C#m', 'Db', 'D', 'Dm', 'Eb', 'Ebm', 'E', 'Em']) {
    const vs = chordVoicings(c).slice(0, 4);
    log('voicings', c, vs.map((v) => `${v.frets.map((f) => (f === null ? 'x' : f)).join(',')} ${v.label} ${v.category} ${v.shape}`));
  }
  for (const [s, f] of [['F', '133211'], ['G', '355433'], ['A', '577655'], ['Fm', '133111'], ['Gm', '355333'], ['C', '8-10-10-9-8-8'], ['Bb', 'x13331'], ['B', 'x24442'], ['C', 'x35553'], ['Bm', 'x24432'], ['D', 'x57775'], ['Em', 'x79987'], ['Cm', 'x35543'], ['G', 'x-10-9-7-8-7'], ['D', 'xx0232'], ['A', 'x02220'], ['G', '320003'], ['E', '022100']] as const) {
    const v = tryBuildVoicing(s, f);
    log('shape', s, f, v?.chord, v?.barres, v?.fingers, voicingProblem(s, f));
  }
  // G major CAGED positions
  for (const p of scalePatterns('G', 'major')) log('Gpos', p.name, p.shape, p.positionName, p.minFret, p.maxFret, p.position, p.notes.map((n) => `${n.string}:${n.fret}`).join(' '));
  for (const p of scalePatterns('G', 'major', { system: '3nps' }).slice(0, 2)) log('G3nps', p.name, p.notes.map((n) => `${n.string}:${n.fret}`).join(' '));
  for (const p of libraryVoicings('C', { categories: ['caged'] } as never)) log('Ccaged', p.label, p.frets.join(','), p.shape);
  for (const p of libraryVoicings('G', { categories: ['caged', 'barre', 'open'] } as never)) log('Gcaged', p.label, p.frets.join(','), p.shape);
  log(diatonicChords('C major').map((c) => c.symbol + ' ' + c.roman));
  log(getGenerator('chord-tones')?.produces, getGenerator('neck-tones')?.produces, getGenerator('chord-shape')?.produces);
  for (let seed = 1; seed < 4; seed++) {
    const e = generateExercise({ generate: 'neck-tones', params: { chords: ['G', 'C', 'D'], strings: [3, 2, 1], span: 3 } }, { seed, difficulty: 0.5, level: 'intermediate' });
    log('neck', JSON.stringify(e).slice(0, 300));
  }
  // eslint-disable-next-line no-console
  (await import("node:fs")).writeFileSync("/tmp/claude-0/-home-user-context-frontend/0b0936e9-a44d-5458-b711-cf2957d3d9cc/scratchpad/probe.txt", out.join("\n"));
  void midiAt; void noteAt; void intervalBetween; void buildVoicing; void validateCourse; void formatProblems;
});

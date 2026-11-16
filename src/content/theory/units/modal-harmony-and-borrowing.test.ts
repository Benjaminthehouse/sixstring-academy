/**
 * Unit 33 of the Theory Path, cross-checked against the engines: every shape written beside a
 * chord, each mode's characteristic chord (built from the mode itself), every vamp, the drone and
 * the fourths shapes on the neck, every borrowed chord and numeral (`modalInterchange`,
 * `romanToChord`, `chordToRoman`), the voice that falls through F, Fm and C, the Neapolitan and
 * the half-diminished ii, what each listening question plays, and that every lesson still teaches
 * with the guitar or the sound off.
 */
import { describe, expect, it } from 'vitest';
import {
  chordInKey, chordNotes, chordPcs, chordTones, chordToRoman, harmonizeScale, intervalBetween, modalInterchange, parseChord,
  romanToChord, scaleNotes, scalePcs, transpose,
} from '@/core/theory';
import { buildVoicing, identifyFretted, midiAt, tryBuildVoicing } from '@/core/guitar';
import {
  formatProblems, isGenerated, plainText, soundPlan, tokenize, validateCourse,
  type ChoiceExercise, type ChordBuildExercise, type Exercise, type FillBlanksExercise, type FretboardFindExercise, type Lesson,
  type ListenChoiceExercise, type MatchPairsExercise, type OrderExercise, type PlayChordExercise, type PlayPhraseExercise, type RichText,
  type Step, type TypeAnswerExercise,
} from '@/lessons';
import { adaptUnit, isListeningStep, MIN_QUIET_EXERCISES } from '@/features/learn/model/conditions';
import { THEORY_GLOSSARY } from '../glossary';
import unit from './modal-harmony-and-borrowing';

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const exercises = (steps: readonly unknown[]): Exercise[] =>
  (steps as Step[]).filter((s): s is Exercise => !!s && typeof s === 'object' && !isGenerated(s) && s.type !== 'card');
/** Every literal exercise: lesson steps, play alternatives, fact asks and the checkpoint. */
const allExercises = (): Exercise[] => {
  const top = [
    ...unit.lessons.flatMap((l) => [...exercises(l.steps), ...exercises((l.facts ?? []).map((f) => f.ask))]),
    ...exercises(unit.checkpoint?.steps ?? []),
  ];
  return [...top, ...exercises(top.flatMap((e) => ('alternative' in e ? [e.alternative] : [])))];
};
const ofType = <T extends Exercise>(type: T['type']): T[] => allExercises().filter((e): e is T => e.type === type);
const correctOption = (e: { options: Array<{ text?: RichText; correct?: boolean }> }): RichText => e.options.find((o) => o.correct)?.text ?? '';
const listens = (l: Lesson): ListenChoiceExercise[] => exercises(l.steps).filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');
const find = <T extends Exercise>(l: Lesson | null, type: T['type'], text: RegExp): T => {
  const pool = l ? [...exercises(l.steps), ...exercises((l.facts ?? []).map((f) => f.ask))] : exercises(unit.checkpoint!.steps!);
  const found = pool.find((e) => e.type === type && text.test(plainText(('prompt' in e ? e.prompt : undefined) ?? '')));
  if (!found) throw new Error(`no ${type} matching ${text}`);
  return found as T;
};

/** Every string in the unit (texts, captions, options, facts). */
function texts(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) texts(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) texts(v, out);
  return out;
}
/** The values of the tags of one kind in a text: `{c:Am7}` -> 'Am7'. */
function tagged(text: RichText, type: 'chord' | 'roman' | 'note' | 'key'): string[] {
  return tokenize(text).flatMap((t) => (t.type === type && 'value' in t ? [String(t.value)] : []));
}
/** Every chord figure in the unit that names both a symbol and a shape. */
function chordFigures(value: unknown, out: Array<{ symbol: string; frets: string }> = []): Array<{ symbol: string; frets: string }> {
  if (Array.isArray(value)) for (const v of value) chordFigures(v, out);
  else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (o.kind === 'chord' && typeof o.symbol === 'string' && typeof o.frets === 'string') out.push({ symbol: o.symbol, frets: o.frets });
    for (const v of Object.values(o)) chordFigures(v, out);
  }
  return out;
}
const pcOf = (note: string): number => scalePcs(note, 'major')[0];
const rootOf = (symbol: string): string => parseChord(symbol)!.root;
const chordsOf = (q: ListenChoiceExercise): string[] => {
  if (q.sound.kind !== 'progression') throw new Error('expected a progression');
  return q.sound.chords;
};

describe('modal-harmony-and-borrowing: the unit on its own', () => {
  it('is valid for the lesson engine, with no warnings', () => {
    const problems = validateCourse({ id: 'theory-path', title: 'Theory Path', teacher: 'none', level: 'expert', units: [unit], glossary: [...THEORY_GLOSSARY] });
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with the unit word', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^modal-/);
  });
});

describe('modal-harmony-and-borrowing: every shape written in the text', () => {
  // "{c:Fm} (133111)" in prose and captions.
  const pairs: Array<[string, string]> = [];
  for (const text of texts(unit)) for (const m of text.matchAll(/\{c:([^}]+)\}\s*\(([x0-9]{6})\)/g)) pairs.push([m[1], m[2]]);

  it('finds the shapes', () => {
    expect(pairs.length).toBeGreaterThan(20);
  });

  it('sounds exactly the chord it is written beside', () => {
    for (const [symbol, shape] of pairs) {
      const v = tryBuildVoicing(symbol, shape);
      expect(v, `${symbol} ${shape}`).not.toBeNull();
      expect(v!.chord, `${symbol} ${shape}`).toBe(symbol);
    }
  });

  it('builds every chord figure, chord-build and play-chord shape as its chord', () => {
    const figures = chordFigures(unit);
    expect(figures.length).toBeGreaterThanOrEqual(6);
    for (const f of figures) expect(buildVoicing(f.symbol, f.frets).chord, `${f.symbol} ${f.frets}`).toBe(f.symbol);
    const shaped: Array<ChordBuildExercise | PlayChordExercise> = [
      ...ofType<ChordBuildExercise>('chord-build').filter((e) => e.task === 'fingers'),
      ...ofType<PlayChordExercise>('play-chord'),
    ];
    expect(shaped.length).toBe(11); // five play-chord steps, their five alternatives, and the fourths shape
    for (const e of shaped) expect(buildVoicing(e.chord, e.frets!).chord, `${e.chord} ${String(e.frets)}`).toBe(e.chord);
  });
});

describe('modal-harmony-and-borrowing: modes and their characteristic chords', () => {
  /** The characteristic chord of each mode: its degree, its numeral, and the colour note it holds. */
  const MODES = [
    { mode: 'Dorian', id: 'dorian', degree: 4, roman: 'IV', colour: 6 },
    { mode: 'Mixolydian', id: 'mixolydian', degree: 7, roman: 'bVII', colour: 7 },
    { mode: 'Lydian', id: 'lydian', degree: 2, roman: 'II', colour: 4 },
    { mode: 'Phrygian', id: 'phrygian', degree: 2, roman: 'bII', colour: 2 },
    { mode: 'Aeolian', id: 'minor', degree: 6, roman: 'bVI', colour: 6 },
  ];
  const characteristic = (tonic: string, id: string): string => harmonizeScale(tonic, id)[MODES.find((m) => m.id === id)!.degree - 1].symbol;

  it('builds each characteristic chord from the mode itself: a major chord holding the colour note', () => {
    for (const m of MODES) {
      const chords = harmonizeScale('D', m.id);
      const chord = chords[m.degree - 1];
      expect(chord.type.id, m.mode).toBe('major');
      const colourNote = scaleNotes('D', m.id)[m.colour - 1];
      expect(chord.notes, m.mode).toContain(colourNote);
      // The numeral, measured against D major as the app does: bII is Eb, bVI is Bb, bVII is C.
      expect(romanToChord(m.roman, 'D'), m.mode).toBe(chord.symbol);
    }
    // The colour notes really are what sets each mode apart from major or natural minor.
    expect(scaleNotes('D', 'dorian')[5]).toBe('B');
    expect(scaleNotes('D', 'minor')[5]).toBe('Bb');
    expect(scaleNotes('D', 'lydian')[3]).toBe('G#');
    expect(scaleNotes('D', 'phrygian')[1]).toBe('Eb');
    expect(scaleNotes('D', 'mixolydian')[6]).toBe('C');
  });

  it('matches every mode with its characteristic chord in the pairs', () => {
    const matches = ofType<MatchPairsExercise>('match-pairs').filter((e) => /characteristic chord/.test(plainText(e.prompt)));
    expect(matches.length).toBe(3);
    for (const p of matches.flatMap((e) => e.pairs)) {
      const m = MODES.find((x) => x.mode === plainText(p.left));
      expect(m, plainText(p.left)).toBeDefined();
      expect(tagged(p.right, 'roman')[0]).toBe(m!.roman);
    }
  });

  it('shows the G chord over D with its Bs as the 6th', () => {
    const card = lesson('modal-progressions').steps[0];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'fretboard') throw new Error('expected a fretboard card');
    const shape = buildVoicing('G', '320003');
    expect(card.figure.dots!.map((d) => `${d.string}:${d.fret}`)).toEqual(shape.notes.map((n) => `${n.string}:${n.fret}`));
    for (const d of card.figure.dots!) if (d.role === 'target') expect(d.note).toBe(scaleNotes('D', 'dorian')[5]);
    expect(characteristic('D', 'dorian')).toBe('G');
  });

  it('answers the vamp and colour-chord questions from the modes', () => {
    expect(tagged(correctOption(find<ChoiceExercise>(lesson('modal-progressions'), 'choice', /A Mixolydian its colour/)), 'chord')).toEqual([characteristic('A', 'mixolydian')]);
    // E7 holds G#, which A Mixolydian does not; D and Bm are shared with A major.
    expect(chordNotes('E7')).toContain('G#');
    expect(scaleNotes('A', 'mixolydian')).not.toContain('G#');
    for (const c of ['D', 'Bm']) expect(chordInKey(c, 'A major'), c).toBe(true);

    const lydian = find<ChoiceExercise>(lesson('modal-progressions'), 'choice', /F Lydian/);
    expect(tagged(correctOption(lydian), 'chord')[1]).toBe(characteristic('F', 'lydian'));
    for (const o of lydian.options.filter((x) => !x.correct)) expect(chordNotes(tagged(o.text!, 'chord')[1]), plainText(o.text!)).not.toContain('B');

    const typed = find<TypeAnswerExercise>(lesson('modal-progressions'), 'type-answer', /G Lydian/);
    expect(typed.answer.value).toBe(characteristic('G', 'lydian'));
    expect(chordNotes('A')).toContain(scaleNotes('G', 'lydian')[3]);

    const phrygian = find<ChoiceExercise>(lesson('modal-progressions'), 'choice', /E Phrygian/);
    expect(tagged(correctOption(phrygian), 'chord')[1]).toBe(characteristic('E', 'phrygian'));
    expect(characteristic('E', 'dorian')).toBe('A');
    expect(characteristic('E', 'minor')).toBe('C');

    const vamp = find<ChoiceExercise>(null, 'choice', /D Dorian/);
    expect(tagged(correctOption(vamp), 'chord')).toEqual(['Dm', characteristic('D', 'dorian')]);
  });

  it('names the pull that modal music avoids: D Dorian has the notes of C major, and G7 to C is its V7 to I', () => {
    expect([...scaleNotes('D', 'dorian')].sort()).toEqual([...scaleNotes('C', 'major')].sort());
    expect(romanToChord('V7', 'C')).toBe('G7');
    expect(chordToRoman('G7', 'C').roman).toBe('V7');
  });
});

describe('modal-harmony-and-borrowing: the drone and the fourths', () => {
  const at = (string: number, fret: number): number => midiAt({ string, fret });

  it('puts the drone and the shapes where the text says', () => {
    expect(at(6, 0)).toBe(40); // open string 6 is E2
    expect(at(4, 0)).toBe(50); // open string 4 is D3
    expect(at(5, 0)).toBe(45); // open string 5 is A2
    const five = [at(5, 5), at(4, 5), at(3, 5)];
    const seven = [at(5, 7), at(4, 7), at(3, 7)];
    expect(five).toEqual([50, 55, 60]); // D3 G3 C4
    expect(seven).toEqual([52, 57, 62]); // E3 A3 D4
    for (const shape of [five, seven]) expect([shape[1] - shape[0], shape[2] - shape[1]]).toEqual([5, 5]);
    // Every note sits in E Phrygian, the notes of C major.
    const phrygian = scalePcs('E', 'phrygian');
    for (const m of [40, ...five, ...seven]) expect(phrygian, String(m)).toContain(m % 12);
    expect([...scaleNotes('E', 'phrygian')].sort()).toEqual([...scaleNotes('C', 'major')].sort());
  });

  it('plays what the card and the listening question say', () => {
    const card = lesson('drones-and-quartal-chords').steps[1];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'audio') throw new Error('expected an audio card');
    expect(soundPlan(card.figure.sound).events.flatMap((e) => e.midi)).toEqual([at(6, 0), at(5, 5), at(4, 5), at(3, 5)]);
    const [q] = listens(lesson('drones-and-quartal-chords'));
    const heard = soundPlan(q.sound).events.flatMap((e) => e.midi);
    expect(heard).toEqual(buildVoicing('Gsus4/D', 'x555xx').midi);
    // Neither major nor minor: no third of either size above the bass.
    for (const m of heard.slice(1)) expect([3, 4]).not.toContain((m - heard[0]) % 12);
    expect(plainText(correctOption(q))).toMatch(/^Neither/);
  });

  it('tells the fourths shape from the major and minor shapes beside it', () => {
    expect(identifyFretted('x554xx').symbol).toBe('G/D');
    expect(identifyFretted('x553xx').symbol).toBe('Gm/D');
    const quartal = buildVoicing('Gsus4/D', 'x555xx');
    expect(quartal.notes.map((n) => n.note)).toEqual(['D', 'G', 'C']);
    expect(intervalBetween('D', 'G')).toBe('P4');
    expect(intervalBetween('G', 'C')).toBe('P4');
  });

  it('finds the fourth above E on the neck, and orders the fret 7 shape', () => {
    const q = exercises(lesson('drones-and-quartal-chords').steps).find((e): e is FretboardFindExercise => e.type === 'fretboard-find')!;
    if (!('interval' in q.find)) throw new Error('expected an interval question');
    expect(q.find.interval).toBe('P4');
    expect(at(q.find.from.string, q.find.from.fret)).toBe(52); // E3
    expect(at(4, 7)).toBe(52 + 5); // A3, the same fret on the next string
    const phrase = exercises(lesson('drones-and-quartal-chords').steps).find((e): e is PlayPhraseExercise => e.type === 'play-phrase')!;
    expect(phrase.notes.map((n) => ('fret' in n ? at(n.string, n.fret) : 0))).toEqual([40, 50, 55, 60, 52, 57, 62]);
    const order = phrase.alternative as OrderExercise;
    expect(order.tiles.map((t) => tagged(t, 'note')[0])).toEqual(['E', 'A', 'D']);
  });
});

describe('modal-harmony-and-borrowing: borrowed chords', () => {
  const borrowed = modalInterchange('C');
  const fromMinor = (symbol: string): boolean => borrowed.some((b) => b.symbol === symbol && b.sources.includes('minor'));

  it('lists the four usual borrowings from C minor, each with its numeral', () => {
    const map: Record<string, string> = { Fm: 'iv', Ab: 'bVI', Bb: 'bVII', Eb: 'bIII' };
    for (const [chord, roman] of Object.entries(map)) {
      expect(fromMinor(chord), chord).toBe(true);
      expect(romanToChord(roman, 'C'), roman).toBe(chord);
      expect(chordToRoman(chord, 'C').relation, chord).toBe('borrowed');
    }
    const fact = lesson('modal-interchange').facts!.find((f) => f.id === 'modal-borrowed-from-c-minor')!;
    expect(tagged(fact.back, 'chord')).toEqual(Object.keys(map));
    expect(tagged(fact.back, 'roman')).toEqual(Object.values(map));
    for (const e of ofType<MatchPairsExercise>('match-pairs').filter((x) => /borrowed chord with its numeral/.test(plainText(x.prompt)))) {
      for (const p of e.pairs) expect(romanToChord(tagged(p.right, 'roman')[0], 'C')).toBe(tagged(p.left, 'chord')[0]);
    }
  });

  it('marks only the borrowed chord as borrowed in the choices', () => {
    for (const e of ofType<ChoiceExercise>('choice').filter((x) => /borrowed from \{k:C minor\}\?$/.test(String(x.prompt)))) {
      for (const o of e.options) {
        const chord = tagged(o.text!, 'chord')[0];
        expect(chordInKey(chord, 'C major') === false && fromMinor(chord), chord).toBe(!!o.correct);
      }
    }
    // The checkpoint's A major is a secondary dominant, not a borrowing.
    expect(chordToRoman('A', 'C').relation).toBe('secondary-dominant');
  });

  it('types and fills the borrowed chords the engine gives', () => {
    for (const e of ofType<TypeAnswerExercise>('type-answer').filter((x) => /borrowed/.test(plainText(x.prompt)))) {
      const key = tagged(e.prompt, 'key')[0];
      expect(e.answer.value, plainText(e.prompt)).toBe(romanToChord(tagged(e.prompt, 'roman')[0], key));
    }
    expect(romanToChord('bVII', 'G')).toBe('F');
    expect(romanToChord('bVI', 'G')).toBe('Eb');
    expect(romanToChord('bVI', 'D')).toBe('Bb');
    expect(chordToRoman('F', 'G').relation).toBe('borrowed');
  });

  it('shows the borrowed notes on the shapes the captions point at', () => {
    expect(buildVoicing('Fm', '133111').notes.find((n) => n.string === 3)!.note).toBe('Ab');
    expect(buildVoicing('Ab', '466544').notes.map((n) => n.note)).toEqual(['Ab', 'Eb', 'Ab', 'C', 'Eb', 'Ab']);
    expect(chordNotes('Bb').filter((n) => !scaleNotes('C', 'major').includes(n))).toEqual(['Bb']);
  });
});

describe('modal-harmony-and-borrowing: the minor four', () => {
  it('moves only string 3 from F to Fm, then string 3 opens for C', () => {
    const f = buildVoicing('F', '133211');
    const fm = buildVoicing('Fm', '133111');
    const c = buildVoicing('C', 'x32010');
    const changed = f.frets.map((fret, i) => (fret === fm.frets[i] ? null : 6 - i)).filter((s) => s !== null);
    expect(changed).toEqual([3]);
    const s3 = [f, fm, c].map((v) => v.notes.find((n) => n.string === 3)!);
    expect(s3.map((n) => n.note)).toEqual(['A', 'Ab', 'G']);
    expect(s3.map((n) => n.midi)).toEqual([57, 56, 55]);
    const card = lesson('the-minor-four').steps[0];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'fretboard') throw new Error('expected a fretboard card');
    expect(card.figure.dots!.map((d) => d.note)).toEqual(['A3', 'Ab3', 'G3']);
  });

  it('falls from the flat 6th to the 5th of the tonic chord in every key it names', () => {
    for (const key of ['C', 'G', 'D']) {
      const iv = romanToChord('iv', key);
      const b6 = chordTones(iv).find((t) => t.role === 'third')!.note;
      const fifth = chordTones(key).find((t) => t.role === 'fifth')!.note;
      expect(intervalBetween(fifth, b6), `${iv} in ${key}`).toBe('m2');
      expect(transpose(scaleNotes(key, 'major')[5], '-A1'), key).toBe(b6);
    }
    expect(romanToChord('iv', 'G')).toBe('Cm');
    expect(romanToChord('iv', 'D')).toBe('Gm');
    const q = find<ChoiceExercise>(lesson('the-minor-four'), 'choice', /Which note of/);
    expect(tagged(correctOption(q), 'note')[0]).toBe('G');
    const ask = find<ChoiceExercise>(lesson('the-minor-four'), 'choice', /is Cm\. Where/);
    expect(tagged(correctOption(ask), 'note')[0]).toBe('D');
  });

  it('fills IV-iv-I and finds the one new note of Fm', () => {
    for (const e of ofType<FillBlanksExercise>('fill-blanks').filter((x) => /\{r:IV\}–\{r:iv\}–\{r:I\}/.test(String(x.prompt)))) {
      const key = tagged(e.prompt, 'key')[0].split(' ')[0];
      expect([...tagged(e.text, 'chord').slice(0, 1), ...e.blanks.map((b) => tagged(b, 'chord')[0]), ...tagged(e.text, 'chord').slice(1)])
        .toEqual(['IV', 'iv', 'I'].map((r) => romanToChord(r, key)));
    }
    const q = find<FretboardFindExercise>(lesson('the-minor-four'), 'fretboard-find', /Fm/);
    expect(q.shown!.map((d) => d.fret)).toEqual(buildVoicing('F', '133211').frets);
    if (!('note' in q.find)) throw new Error('expected a note');
    // Only one Ab3 between the nut and fret 4: string 3, fret 1.
    const places = [1, 2, 3, 4, 5, 6].flatMap((s) => [0, 1, 2, 3, 4].filter((f) => midiAt({ string: s, fret: f }) === 56).map((f) => `${s}:${f}`));
    expect(places).toEqual(['3:1']);
  });
});

describe('modal-harmony-and-borrowing: flat seven, flat six and flat three', () => {
  it('builds the progressions in A major and C major from the numerals', () => {
    expect(['I', 'bVII', 'IV'].map((r) => romanToChord(r, 'A'))).toEqual(['A', 'G', 'D']);
    expect(['bVI', 'bVII', 'I'].map((r) => romanToChord(r, 'A'))).toEqual(['F', 'G', 'A']);
    expect(['I', 'bVII', 'IV'].map((r) => romanToChord(r, 'C'))).toEqual(['C', 'Bb', 'F']);
    expect(['I', 'bVII', 'IV'].map((r) => romanToChord(r, 'G'))).toEqual(['G', 'F', 'C']);
    expect(['bVI', 'bVII', 'I'].map((r) => romanToChord(r, 'C'))).toEqual(['Ab', 'Bb', 'C']);
    expect(romanToChord('bIII', 'C')).toBe('Eb');
    expect(['I', 'bVII', 'IV'].map((r) => romanToChord(r, 'D'))).toEqual(['D', 'C', 'G']);
    // G has G natural where A major has G#.
    expect(scaleNotes('A', 'major')).toContain('G#');
    expect(chordNotes('G')).toContain('G');
  });

  it('matches the numerals of A major with their chords', () => {
    const e = find<MatchPairsExercise>(lesson('flat-seven-and-flat-six'), 'match-pairs', /A major/);
    for (const p of e.pairs) expect(romanToChord(tagged(p.left, 'roman')[0], 'A')).toBe(tagged(p.right, 'chord')[0]);
  });

  it('answers the I-bVII-IV and bIII choices', () => {
    for (const e of ofType<ChoiceExercise>('choice').filter((x) => /is \{r:I\}–\{r:bVII\}–\{r:IV\}/.test(String(x.prompt)))) {
      const key = tagged(e.prompt, 'key')[0].split(' ')[0];
      expect(tagged(correctOption(e), 'chord'), key).toEqual(['I', 'bVII', 'IV'].map((r) => romanToChord(r, key)));
    }
    const q = find<ChoiceExercise>(lesson('flat-seven-and-flat-six'), 'choice', /III of C major/);
    expect(tagged(correctOption(q), 'chord')[0]).toBe(romanToChord('bIII', 'C'));
    expect(chordNotes('E')).toContain('G#');
  });

  it('fills the endings with the right chords', () => {
    const fills = ofType<FillBlanksExercise>('fill-blanks').filter((x) => /bVII/.test(String(x.prompt)));
    expect(fills.length).toBe(3);
    for (const e of fills) {
      const key = tagged(e.prompt, 'key')[0].split(' ')[0];
      const romans = tagged(e.prompt, 'roman');
      const given = tagged(e.text, 'chord');
      const blanks = e.blanks.map((b) => tagged(b, 'chord')[0]);
      const expected = romans.map((r) => romanToChord(r, key));
      const filled = String(e.text).startsWith('___') ? [...blanks, ...given] : [given[0], ...blanks, ...given.slice(1)];
      expect(filled, plainText(e.prompt)).toEqual(expected);
    }
  });
});

describe('modal-harmony-and-borrowing: the Neapolitan and the half-diminished ii', () => {
  it('names the Neapolitan of each minor key as the engine does', () => {
    expect(chordToRoman('Bb/D', 'A minor').relation).toBe('neapolitan');
    expect(romanToChord('bII', 'A minor')).toBe('Bb');
    expect(romanToChord('bII', 'E minor')).toBe('F');
    expect(romanToChord('bII', 'C minor')).toBe('Db');
    expect(romanToChord('bII', 'D minor')).toBe('Eb');
    for (const e of ofType<TypeAnswerExercise>('type-answer').filter((x) => /Neapolitan/.test(plainText(x.prompt)))) {
      expect(e.answer.value, plainText(e.prompt)).toBe(romanToChord('bII', tagged(e.prompt, 'key')[0]));
    }
    // First inversion: the 3rd in the bass.
    expect(chordTones('Db').find((t) => t.role === 'third')!.note).toBe('F');
    expect(buildVoicing('Bb/D', 'xx0331').notes[0].note).toBe('D');
  });

  it('walks the bass A D E A and moves Bb to G# to A on string 3', () => {
    const card = lesson('neapolitan-and-dark-ii').steps[1];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'audio') throw new Error('expected an audio card');
    const bass = soundPlan(card.figure.sound).events.map((e) => Math.min(...e.midi) % 12);
    expect(bass).toEqual(['A', 'D', 'E', 'A'].map(pcOf));
    const s3 = [buildVoicing('Bb/D', 'xx0331'), buildVoicing('E7', '020100'), buildVoicing('Am', 'x02210')].map((v) => v.notes.find((n) => n.string === 3)!);
    expect(s3.map((n) => n.note)).toEqual(['Bb', 'G#', 'A']);
    // The dominant then resolves home.
    expect(romanToChord('V7', 'A minor')).toBe('E7');
  });

  it('darkens the two-five-one with a ii borrowed from C minor', () => {
    expect(romanToChord('iiø7', 'C')).toBe('Dm7b5');
    expect(chordToRoman('Dm7b5', 'C').relation).toBe('borrowed');
    expect(chordNotes('Dm7b5')).toEqual(['D', 'F', 'Ab', 'C']);
    expect(scaleNotes('C', 'minor')).toContain('Ab');
    expect(chordNotes('Dm7')).toEqual(['D', 'F', 'A', 'C']);
    expect(buildVoicing('Dm7b5', 'xx0111').notes.find((n) => n.string === 3)!.note).toBe('Ab');
    const fill = find<FillBlanksExercise>(lesson('neapolitan-and-dark-ii'), 'fill-blanks', /darker/);
    expect(tagged(fill.blanks[0], 'chord')[0]).toBe(romanToChord('iiø7', 'C'));
  });
});

describe('modal-harmony-and-borrowing: what each listening question plays', () => {
  it('modal-progressions: Em to F is E Phrygian', () => {
    const [q] = listens(lesson('modal-progressions'));
    expect(chordsOf(q)).toEqual(['Em', 'F', 'Em', 'F']);
    expect(harmonizeScale('E', 'phrygian')[1].symbol).toBe('F');
    expect(plainText(correctOption(q))).toBe('E Phrygian');
  });

  it('modal-interchange: the IV chord was Fm', () => {
    const [q] = listens(lesson('modal-interchange'));
    expect(chordsOf(q)).toEqual(['C', romanToChord('iv', 'C'), 'C']);
    expect(plainText(correctOption(q))).toMatch(/^Minor/);
  });

  it('the-minor-four: IV-iv-I in the lesson, IV-I in the checkpoint', () => {
    const [q] = listens(lesson('the-minor-four'));
    expect(chordsOf(q)).toEqual(['IV', 'iv', 'I'].map((r) => romanToChord(r, 'C')));
    expect(tagged(correctOption(q), 'roman')).toEqual(['IV', 'iv', 'I']);
    const cp = exercises(unit.checkpoint!.steps!).find((e): e is ListenChoiceExercise => e.type === 'listen-choice')!;
    expect(chordsOf(cp)).toEqual(['IV', 'I'].map((r) => romanToChord(r, 'C')));
    expect(tagged(correctOption(cp), 'roman')).toEqual(['IV', 'I']);
  });

  it('flat-seven-and-flat-six: the ending was bVI-bVII-I', () => {
    const [q] = listens(lesson('flat-seven-and-flat-six'));
    expect(chordsOf(q).slice(1)).toEqual(['bVI', 'bVII', 'I'].map((r) => romanToChord(r, 'C')));
    expect(chordsOf(q)).not.toContain('G');
    expect(tagged(correctOption(q), 'roman')).toEqual(['bVI', 'bVII', 'I']);
  });

  it('neapolitan-and-dark-ii: the two-five-one began on Dm7b5', () => {
    const [q] = listens(lesson('neapolitan-and-dark-ii'));
    expect(chordsOf(q)).toEqual(['iiø7', 'V7', 'I'].map((r) => romanToChord(r, 'C')));
    expect(tagged(correctOption(q), 'chord')).toEqual(['Dm7b5']);
  });

  it('every audio card plays chords whose roots the text names', () => {
    const card = lesson('flat-seven-and-flat-six').steps[1];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'audio' || card.figure.sound.kind !== 'progression') throw new Error('expected a progression card');
    expect(card.figure.sound.chords.map(rootOf)).toEqual(['A', 'G', 'D', 'A', 'F', 'G', 'A']);
    for (const c of card.figure.sound.chords) expect(chordPcs(c).length).toBe(3);
  });
});

describe('modal-harmony-and-borrowing: on the go', () => {
  it('still teaches with the sound off and with the guitar away', () => {
    for (const c of [{ guitar: false, sound: true }, { guitar: false, sound: false }, { guitar: true, sound: false }]) {
      const adapted = adaptUnit(unit, c);
      for (const l of adapted.lessons) {
        const asked = l.steps.filter((s) => isGenerated(s) || s.type !== 'card');
        expect(asked.length, `${l.id} ${JSON.stringify(c)}`).toBeGreaterThanOrEqual(MIN_QUIET_EXERCISES + 2);
        expect(asked.some((s) => !isGenerated(s) && s.type.startsWith('play-')), `${l.id}: a play step is left`).toBe(false);
        if (!c.sound) expect(asked.some((s) => isListeningStep(s)), `${l.id}: a listening step is left`).toBe(false);
      }
      expect(adapted.checkpoint?.steps?.length ?? 0, JSON.stringify(c)).toBeGreaterThanOrEqual(12);
    }
  });
});

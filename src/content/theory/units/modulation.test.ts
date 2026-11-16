/**
 * Unit 39 of the Theory Path, cross-checked against the engines: every shape written beside a
 * chord, the keys of every chord chart (what visits, what moves, where the F natural returns),
 * closely related keys, dominant and relative keys, pivot chords and their numerals in both keys,
 * the transposed choruses, every shared note, the augmented sixth chords and their half-step
 * resolutions, what each listening question plays, and that every lesson still teaches with the
 * guitar or the sound off.
 */
import { describe, expect, it } from 'vitest';
import {
  chordNotes, chordPcs, chordToRoman, closelyRelatedKeys, diatonicChords, intervalBetween, neighborKeys, noteAtDegree, parseChord,
  relativeKey, transposeChord, tritoneSubstitute,
} from '@/core/theory';
import { buildVoicing, chordVoicings, midiAt, tryBuildVoicing } from '@/core/guitar';
import {
  formatProblems, isGenerated, plainText, soundPlan, tokenize, validateCourse,
  type ChoiceExercise, type ChordBuildExercise, type Exercise, type FillBlanksExercise, type Lesson, type ListenChoiceExercise, type MatchPairsExercise,
  type PlayChordExercise, type RichText, type Step, type TypeAnswerExercise,
} from '@/lessons';
import { adaptUnit, isListeningStep, MIN_QUIET_EXERCISES } from '@/features/learn/model/conditions';
import { THEORY_GLOSSARY } from '../glossary';
import unit from './modulation';

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
const inLesson = (id: string): Exercise[] => [...exercises(lesson(id).steps), ...exercises((lesson(id).facts ?? []).map((f) => f.ask))];
const listens = (l: Lesson): ListenChoiceExercise[] => exercises(l.steps).filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');
/** Plain text with ASCII accidentals, as the data writes them. */
const plain = (t: RichText): string => plainText(t, { format: { ascii: true } });
const correct = (e: { options: Array<{ text?: RichText; correct?: boolean }> }): string => plain(e.options.find((o) => o.correct)?.text ?? '');
const findIn = <T extends Exercise>(pool: Exercise[], type: T['type'], text: RegExp): T => {
  const found = pool.find((e) => e.type === type && text.test(plain(('prompt' in e ? e.prompt : undefined) ?? '')));
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
function tagged(text: RichText, type: 'chord' | 'roman' | 'note' | 'key' | 'degree' | 'interval'): string[] {
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
const chordsOf = (e: ListenChoiceExercise): string[] => (e.sound.kind === 'progression' ? e.sound.chords : []);
const keyChords = (k: string): string[] => diatonicChords(k).map((c) => c.symbol);
const inKeyChords = (chord: string, k: string): boolean => keyChords(k).includes(chord) || chordToRoman(chord, k).relation === 'diatonic';
const shared = (a: string, b: string): string[] => chordNotes(a).filter((n) => chordPcs(b).includes(chordPcs(n)[0]));
const keyNames = (k: string): string[] => closelyRelatedKeys(k).map((x) => x.name).sort();
/** The shape string (low to high) of a voicing as MIDI numbers. */
const midiOf = (shape: string): number[] =>
  [...shape].flatMap((f, i) => (f === 'x' ? [] : [midiAt({ string: 6 - i, fret: Number(f) })]));

describe('modulation: the unit on its own', () => {
  it('is valid for the lesson engine, with no warnings', () => {
    const problems = validateCourse({ id: 'theory-path', title: 'Theory Path', teacher: 'none', level: 'expert', units: [unit], glossary: [...THEORY_GLOSSARY] });
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with the unit word', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^modulation-/);
  });
});

describe('modulation: every shape written in the text', () => {
  const pairs: Array<[string, string]> = [];
  for (const text of texts(unit)) for (const m of text.matchAll(/\{c:([^}]+)\}\s*\(([x0-9]{6})\)/g)) pairs.push([m[1], m[2]]);

  it('finds the shapes', () => {
    expect(pairs.length).toBeGreaterThan(15);
  });

  it('sounds exactly the chord it is written beside', () => {
    for (const [symbol, shape] of pairs) {
      const v = tryBuildVoicing(symbol, shape);
      expect(v, `${symbol} ${shape}`).not.toBeNull();
      expect(v!.chord, `${symbol} ${shape}`).toBe(symbol);
    }
  });

  it('builds every chord figure, play-chord and chord-build shape as its chord', () => {
    const figures = chordFigures(unit);
    expect(figures.length).toBeGreaterThanOrEqual(5);
    for (const f of figures) expect(buildVoicing(f.symbol, f.frets).chord, `${f.symbol} ${f.frets}`).toBe(f.symbol);
    const shaped: Array<ChordBuildExercise | PlayChordExercise> = [
      ...ofType<PlayChordExercise>('play-chord'),
      ...ofType<ChordBuildExercise>('chord-build').filter((e) => e.task === 'fingers'),
    ];
    expect(shaped.length).toBe(8); // four play-chord steps and their four alternatives
    for (const e of shaped) {
      if (e.type === 'chord-build' && e.task === 'missing-note') continue;
      const v = buildVoicing(e.chord, e.frets!);
      expect([...chordPcs(v.chord)].sort(), `${e.chord} ${String(e.frets)}`).toEqual([...chordPcs(e.chord)].sort());
    }
  });
});

describe('modulation: visiting or moving', () => {
  const [visitCard, moveCard] = lesson('tonicization-or-modulation').steps;
  const chartOf = (step: Step): string[] => {
    if (isGenerated(step) || step.type !== 'card' || step.figure?.kind !== 'audio' || step.figure.sound.kind !== 'progression') throw new Error('expected a chart card');
    return step.figure.sound.chords;
  };
  const textChart = (step: Step): string[] => {
    if (isGenerated(step) || step.type !== 'card') throw new Error('expected a card');
    return tagged(String(step.body).split('\n').pop()!, 'chord');
  };

  it('writes each chart exactly as it plays', () => {
    expect(textChart(visitCard)).toEqual(chartOf(visitCard));
    expect(textChart(moveCard)).toEqual(chartOf(moveCard));
  });

  it('visits G with V7/V and returns to C through F natural', () => {
    const visit = chartOf(visitCard);
    expect(chordToRoman('D7', 'C').roman).toBe('V7/V');
    expect(chordNotes('D7')).toContain('F#');
    const after = visit.slice(visit.indexOf('G') + 1);
    expect(after[0]).toBe('F');
    expect(keyChords('G major')).not.toContain('F');
    expect(visit.slice(-2)).toEqual(['G', 'C']);
    for (const c of visit.filter((x) => x !== 'D7')) expect(keyChords('C major'), c).toContain(c);
  });

  it('moves to G: D7 G twice, no F natural after the pivot, ending on G', () => {
    for (const chords of [chartOf(moveCard), chordsOf(listens(lesson('tonicization-or-modulation'))[0])]) {
      expect(chords.at(-1)).toBe('G');
      const pairs = chords.slice(0, -1).filter((c, i) => c === 'D7' && chords[i + 1] === 'G').length;
      expect(pairs).toBe(2);
      const fromPivot = chords.slice(chords.indexOf('Am'));
      for (const c of fromPivot) {
        expect(inKeyChords(c, 'G major') || c === 'D7', c).toBe(true);
        expect(chordNotes(c), c).not.toContain('F');
      }
    }
  });

  it('answers each listening question by what it plays', () => {
    const [move, visit] = listens(lesson('tonicization-or-modulation'));
    expect(correct(move)).toMatch(/move/);
    expect(chordsOf(move).at(-1)).toBe('G');
    expect(correct(visit)).toMatch(/visit/);
    const v = chordsOf(visit);
    expect(v.filter((c) => c === 'D7')).toHaveLength(1);
    expect(v.slice(-2)).toEqual(['G', 'C']);
  });

  it('names F as the chord that ends the visit in chart 1', () => {
    const q = findIn<ChoiceExercise>(inLesson('tonicization-or-modulation'), 'choice', /visit to G is over/);
    expect(correct(q)).toBe('F');
    expect(chordNotes('F')).toContain('F');
    expect(keyChords('G major')).not.toContain('F');
    expect(keyChords('C major')).toContain('Am');
    expect(keyChords('G major')).toContain('Am');
  });
});

describe('modulation: closely related keys', () => {
  it('lists the five keys of C, as the card and the circle show', () => {
    expect(keyNames('C major')).toEqual(['A minor', 'D minor', 'E minor', 'F major', 'G major']);
    const card = lesson('closely-related-keys').steps[0];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'circle') throw new Error('expected the circle');
    expect([...card.figure.highlight!].sort()).toEqual(keyNames('C major'));
  });

  it('marks exactly the closely related key correct in each choice', () => {
    const cases: Array<[RegExp, string]> = [[/related to G major/, 'G major'], [/related to F major/, 'F major'], [/related to D major/, 'D major']];
    for (const [prompt, home] of cases) {
      const q = findIn<ChoiceExercise>(allExercises(), 'choice', prompt);
      for (const o of q.options) {
        const k = tagged(o.text!, 'key')[0];
        expect(keyNames(home).includes(k), `${home}: ${k}`).toBe(!!o.correct);
      }
    }
    const not = findIn<ChoiceExercise>(allExercises(), 'choice', /not closely related to C major/);
    for (const o of not.options) expect(keyNames('C major').includes(tagged(o.text!, 'key')[0])).toBe(!o.correct);
    expect(keyNames('C major')).toContain('E minor');
  });

  it('places the six tonics where the card says', () => {
    const card = lesson('closely-related-keys').steps[2];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'fretboard') throw new Error('expected the neck');
    const where = Object.fromEntries(card.figure.dots!.map((d) => [d.note!.replace(/\d/, ''), midiAt(d)]));
    expect(Object.keys(where).sort()).toEqual(['A', 'C', 'D', 'E', 'F', 'G']);
    expect(where).toEqual({ C: 48, G: 43, F: 41, A: 45, E: 40, D: 50 });
    expect(midiAt({ string: 6, fret: 3 })).toBe(43); // the tonic of G the learner taps
  });

  it('gives the dominant and relative keys the questions ask for', () => {
    expect(neighborKeys('F major').dominant.tonic).toBe('C');
    expect(neighborKeys('D major').dominant.tonic).toBe('A');
    expect(relativeKey('E minor').tonic).toBe('G');
    const match = findIn<MatchPairsExercise>(inLesson('closely-related-keys'), 'match-pairs', /most often modulates/);
    for (const p of match.pairs) {
      const from = tagged(p.left, 'key')[0];
      const to = tagged(p.right, 'key')[0];
      const expected = from.endsWith('minor') ? relativeKey(from).name : neighborKeys(from).dominant.name;
      expect(to, from).toBe(expected);
    }
  });
});

describe('modulation: pivot chords', () => {
  const both = (a: string, b: string): string[] => keyChords(a).filter((c) => keyChords(b).includes(c));

  it('finds the chords C and G share, and G and D', () => {
    expect(both('C major', 'G major').sort()).toEqual(['Am', 'C', 'Em', 'G']);
    expect(both('G major', 'D major').sort()).toEqual(['Bm', 'D', 'Em', 'G']);
  });

  it('marks only a shared chord as the pivot', () => {
    const cases: Array<[RegExp, string, string]> = [[/From C major to G major, which chord can pivot/, 'C major', 'G major'], [/From G major to D major/, 'G major', 'D major'], [/pivot from C major to G major/, 'C major', 'G major']];
    for (const [prompt, a, b] of cases) {
      const q = findIn<ChoiceExercise>(allExercises(), 'choice', prompt);
      for (const o of q.options) {
        const c = tagged(o.text!, 'chord')[0];
        expect(both(a, b).includes(c), `${a} > ${b}: ${c}`).toBe(!!o.correct);
      }
    }
  });

  it('gives each pivot its numeral in both keys', () => {
    expect(chordToRoman('Am', 'C').roman).toBe('vi');
    expect(chordToRoman('Am', 'G').roman).toBe('ii');
    expect(chordToRoman('Em', 'C').roman).toBe('iii');
    expect(chordToRoman('Em', 'G').roman).toBe('vi');
    expect(chordToRoman('Em', 'D').roman).toBe('ii');
    expect(chordToRoman('D7', 'G').roman).toBe('V7');
    const fill = findIn<FillBlanksExercise>(inLesson('pivot-chords'), 'fill-blanks', /Complete the pivot\.$/);
    expect(tagged(fill.blanks[0], 'roman')[0]).toBe(chordToRoman('Em', 'G').roman);
  });

  it('jumps from C to D with no pivot in the abrupt passage', () => {
    const q = listens(lesson('pivot-chords'))[0];
    const chords = chordsOf(q);
    const at = chords.indexOf('D');
    for (const c of chords.slice(0, at)) expect(keyChords('C major'), c).toContain(c);
    for (const c of chords.slice(at)) expect(keyChords('D major'), c).toContain(c);
    expect(keyChords('C major')).not.toContain('D');
    expect(keyChords('D major')).not.toContain(chords[at - 1]);
    expect(correct(q)).toMatch(/no pivot/);
  });
});

describe('modulation: direct and common-tone modulation', () => {
  const G = ['G', 'D', 'Em', 'C'];

  it('moves the chorus up a whole step and a half step', () => {
    expect(G.map((c) => transposeChord(c, 'M2'))).toEqual(['A', 'E', 'F#m', 'D']);
    expect(G.map((c) => transposeChord(c, 'm2'))).toEqual(['Ab', 'Eb', 'Fm', 'Db']);
    const card = lesson('direct-modulation').steps[0];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'audio' || card.figure.sound.kind !== 'progression') throw new Error('expected the chorus');
    expect(card.figure.sound.chords).toEqual([...G, ...G.map((c) => transposeChord(c, 'M2'))]);
    expect(tagged(card.figure.caption!, 'chord')).toEqual(card.figure.sound.chords);
    const [q] = listens(lesson('direct-modulation'));
    expect(chordsOf(q)).toEqual([...G, ...G.map((c) => transposeChord(c, 'm2'))]);
    expect(correct(q)).toBe('A half step');
  });

  it('types the new tonics a half step and a whole step up', () => {
    const half = findIn<TypeAnswerExercise>(allExercises(), 'type-answer', /E major moves up a half step/);
    expect(half.answer.value).toBe(transposeChord('E', 'm2'));
    const whole = findIn<TypeAnswerExercise>(allExercises(), 'type-answer', /A major moves up a whole step/);
    expect(whole.answer.value).toBe(transposeChord('A', 'M2'));
    const last = findIn<TypeAnswerExercise>(allExercises(), 'type-answer', /G major moves up a whole step/);
    expect(last.answer.value).toBe(transposeChord('G', 'M2'));
    expect(correct(findIn<ChoiceExercise>(allExercises(), 'choice', /takes the place of Em/))).toBe(transposeChord('Em', 'M2'));
  });

  it('holds the open E string from C to A', () => {
    expect(shared('C', 'A')).toEqual(['E']);
    expect(buildVoicing('C', 'x32010').midi.at(-1)).toBe(64);
    expect(buildVoicing('A', 'x02220').midi.at(-1)).toBe(64);
    expect(correct(findIn<ChoiceExercise>(allExercises(), 'choice', /From C to A/))).toBe('E');
  });
});

describe('modulation: chromatic mediants', () => {
  it('shares one note in each chromatic mediant and two in the diatonic changes', () => {
    expect(shared('C', 'E')).toEqual(['E']);
    expect(shared('C', 'Ab')).toEqual(['C']);
    expect(shared('C', 'Eb')).toEqual(['G']);
    expect(shared('G', 'B')).toEqual(['B']);
    for (const [a, b] of [['C', 'Em'], ['C', 'Am'], ['G', 'Em']]) expect(shared(a, b), `${a} ${b}`).toHaveLength(2);
    for (const [a, b] of [['C', 'E'], ['C', 'Ab'], ['C', 'Eb'], ['G', 'B']]) {
      expect(['M3', 'm3', 'M6', 'm6']).toContain(intervalBetween(parseChord(a)!.root, parseChord(b)!.root));
      expect(parseChord(a)!.type.id).toBe(parseChord(b)!.type.id);
    }
    const match = findIn<MatchPairsExercise>(inLesson('chromatic-mediants'), 'match-pairs', /one note its chords share/);
    for (const p of match.pairs) {
      const [a, b] = tagged(p.left, 'chord');
      expect(shared(a, b), `${a} ${b}`).toEqual(tagged(p.right, 'note'));
    }
  });

  it('marks the only chromatic mediant correct', () => {
    const isMediant = (a: string, b: string): boolean =>
      shared(a, b).length === 1 && parseChord(a)!.type.id === parseChord(b)!.type.id && ['M3', 'm3', 'M6', 'm6'].includes(intervalBetween(parseChord(a)!.root, parseChord(b)!.root));
    for (const q of [findIn<ChoiceExercise>(allExercises(), 'choice', /^Which pair is a chromatic mediant/), findIn<ChoiceExercise>(allExercises(), 'choice', /^Which change is a chromatic mediant/)]) {
      for (const o of q.options) {
        const [a, b] = tagged(o.text!, 'chord');
        expect(isMediant(a, b), `${a} ${b}`).toBe(!!o.correct);
      }
    }
    const g = findIn<ChoiceExercise>(allExercises(), 'choice', /chromatic mediant of G/);
    for (const o of g.options) expect(isMediant('G', tagged(o.text!, 'chord')[0]), plainText(o.text!)).toBe(!!o.correct);
  });

  it('rings the E notes of 022100 and keeps C4 from x32010 into 466544', () => {
    const card = lesson('chromatic-mediants').steps[0];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'fretboard') throw new Error('expected the neck');
    const e = buildVoicing('E', '022100');
    expect(card.figure.dots!.map((d) => midiAt(d))).toEqual(e.midi);
    for (const d of card.figure.dots!) expect(d.role === 'target', `${d.string}`).toBe(d.note!.startsWith('E'));
    const ab = buildVoicing('Ab', '466544').notes.find((n) => n.note === 'C')!;
    expect([ab.string, ab.fret, ab.midi]).toEqual([3, 5, 60]);
    expect(buildVoicing('C', 'x32010').notes.find((n) => n.string === 2)!.midi).toBe(60);
  });

  it('plays a mediant, then a diatonic change, as the answers say', () => {
    const [mediant, diatonic] = listens(lesson('chromatic-mediants'));
    expect(chordsOf(mediant)).toEqual(['C', 'E']);
    expect(correct(mediant)).toBe('A chromatic mediant');
    expect(chordsOf(diatonic)).toEqual(['C', 'Am']);
    expect(correct(diatonic)).toBe('An ordinary diatonic change');
  });
});

describe('modulation: augmented sixth chords', () => {
  const b6 = noteAtDegree('C major', 'b6');
  const s4 = noteAtDegree('C major', '#4');
  const SIXTHS = { Italian: [b6, 'C', s4], French: [b6, 'C', 'D', s4], German: [b6, 'C', 'Eb', s4] };

  it('builds the three sixths of C on the flat 6th and sharp 4th', () => {
    expect([b6, s4]).toEqual(['Ab', 'F#']);
    expect(intervalBetween('Ab', 'F#')).toBe('A6');
    expect(intervalBetween('Ab3', 'F#4')).toBe('A6');
    expect(noteAtDegree('C major', 'b3')).toBe('Eb');
    expect(noteAtDegree('C major', '2')).toBe('D');
    const match = findIn<MatchPairsExercise>(inLesson('augmented-sixth-chords'), 'match-pairs', /augmented sixth chord of C major/);
    for (const p of match.pairs) {
      const name = plainText(p.left).split(' ')[0] as keyof typeof SIXTHS;
      expect(tagged(p.right, 'note'), name).toEqual(SIXTHS[name]);
    }
    const fill = findIn<FillBlanksExercise>(inLesson('augmented-sixth-chords'), 'fill-blanks', /German sixth/);
    expect([...tagged(fill.text, 'note'), ...fill.blanks.flatMap((b) => tagged(b, 'note'))]).toEqual(SIXTHS.German);
    const french = findIn<FillBlanksExercise>(allExercises(), 'fill-blanks', /French sixth/);
    expect(tagged(french.text, 'note').length + french.blanks.length).toBe(4);
    expect(tagged(french.blanks[0], 'note')).toEqual(['D']);
  });

  it('sounds the German sixth as Ab7, the tritone substitute of V7/V', () => {
    expect(chordPcs('Ab7').sort()).toEqual([...new Set(SIXTHS.German.map((n) => chordPcs(n)[0]))].sort());
    expect(tritoneSubstitute('D7')).toBe('Ab7');
    expect(tritoneSubstitute('G7')).toBe('Db7');
    expect(chordToRoman('D7', 'C').roman).toBe('V7/V');
    const q = findIn<ChoiceExercise>(inLesson('augmented-sixth-chords'), 'choice', /tritone substitute of which chord/);
    for (const o of q.options) expect(tritoneSubstitute(tagged(o.text!, 'chord')[0]) === 'Ab7', plainText(o.text!)).toBe(!!o.correct);
  });

  it('puts the shapes xx657x, xx6532 and xx6542 on the notes they name, and resolves by half steps', () => {
    expect(midiOf('xx657x')).toEqual([56, 60, 66]); // Ab3 C4 F#4
    expect(midiOf('xx6532')).toEqual([56, 60, 62, 66]); // Ab3 C4 D4 F#4
    const german = midiOf('xx6542');
    expect(german).toEqual([56, 60, 63, 66]); // Ab3 C4 Eb4 F#4
    const g = buildVoicing('G', 'xx5433');
    expect(g.chord).toBe('G');
    expect(g.midi.map((m, i) => m - german[i])).toEqual([-1, -1, -1, 1]);
    const cg = buildVoicing('C/G', 'xx5553');
    expect(cg.chord).toBe('C/G');
    expect(cg.midi.map((m, i) => m - german[i])).toEqual([-1, 0, 1, 1]);
    expect(buildVoicing('Ab7', 'xx6542').midi).toEqual(german);
    const card = lesson('augmented-sixth-chords').steps[1];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'fretboard') throw new Error('expected the German sixth');
    expect(card.figure.dots!.map((d) => midiAt(d))).toEqual(german);
    // The card's sound: the German sixth picked, then G, from the same frets.
    const tab = lesson('augmented-sixth-chords').steps[4];
    if (isGenerated(tab) || tab.type !== 'card' || tab.figure?.kind !== 'audio') throw new Error('expected the sound');
    const picked = soundPlan(tab.figure.sound).events.map((e) => e.midi[0]);
    expect(picked).toEqual([...german, ...g.midi]);
  });

  it('opens the library Ab7 out to G, and drops it a fifth to Db', () => {
    const [toG, toDb] = listens(lesson('augmented-sixth-chords'));
    expect(chordsOf(toG)).toEqual(['C', 'Ab7', 'G']);
    expect(correct(toG)).toMatch(/^Yes/);
    const ab7 = chordVoicings('Ab7')[0].midi;
    const gChord = chordVoicings('G')[0].midi;
    expect(gChord[0] - ab7[0]).toBe(-1); // the bass falls Ab to G
    const gb = ab7.find((m) => m % 12 === 6)!; // the F# (as Gb) inside the chord
    expect(gChord).toContain(gb + 1); // rises to G
    expect(chordsOf(toDb)).toEqual(['C', 'Ab7', 'Db']);
    expect(intervalBetween('Ab', 'Db')).toBe('P4'); // down a fifth = up a fourth
    expect(correct(toDb)).toMatch(/Db/);
  });

  it('types A6 for Ab up to F#', () => {
    const q = findIn<TypeAnswerExercise>(allExercises(), 'type-answer', /interval from Ab up to F#/);
    expect(q.answer.value).toBe(intervalBetween('Ab', 'F#'));
  });
});

describe('modulation: the checkpoint', () => {
  it('names the pivot and the shared note the engines give', () => {
    const steps = exercises(unit.checkpoint!.steps!);
    const fill = findIn<FillBlanksExercise>(steps, 'fill-blanks', /Name the pivot/);
    expect(fill.blanks.map((b) => tagged(b, 'roman')[0])).toEqual([chordToRoman('Am', 'C').roman, chordToRoman('Am', 'G').roman]);
    expect(findIn<TypeAnswerExercise>(steps, 'type-answer', /relative major/).answer.value).toBe(relativeKey('E minor').tonic);
    expect(findIn<TypeAnswerExercise>(steps, 'type-answer', /shared by C and E/).answer.value).toBe(shared('C', 'E')[0]);
  });
});

describe('modulation: on the go', () => {
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

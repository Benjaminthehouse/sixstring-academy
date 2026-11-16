/**
 * Unit 25 of the Theory Path, cross-checked against the engines: every chord shape written next
 * to a chord name, every formula, spelling and numeral, the diatonic sevenths of the keys it
 * quotes, the barre-shape moves, the notes it says a string plays, what each listening question
 * plays, and that every lesson still teaches with the guitar or the sound off.
 */
import { describe, expect, it } from 'vitest';
import { chordNotes, chordPcs, diatonicChords, getChordType, intervalBetween, parseChord, romanToChord, semitones } from '@/core/theory';
import { buildVoicing, identifyFretted, moveVoicing, noteAt, tryBuildVoicing } from '@/core/guitar';
import {
  formatProblems, isGenerated, plainText, soundPlan, tokenize, validateCourse,
  type ChoiceExercise, type ChordBuildExercise, type Exercise, type FillBlanksExercise, type Lesson, type ListenChoiceExercise, type MatchPairsExercise,
  type PlayChordExercise, type RichText, type Step, type TypeAnswerExercise,
} from '@/lessons';
import { adaptUnit, isListeningStep, MIN_QUIET_EXERCISES } from '@/features/learn/model/conditions';
import { THEORY_GLOSSARY } from '../glossary';
import unit from './seventh-chords';

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
const correctText = (e: { options: Array<{ text?: RichText; correct?: boolean }> }): string => plainText(e.options.find((o) => o.correct)?.text ?? '');
const listens = (l: Lesson): ListenChoiceExercise[] => exercises(l.steps).filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');

/** Every string in the unit (texts, captions, options, facts), with the {text, say} form unwrapped. */
function texts(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) texts(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) texts(v, out);
  return out;
}

/** The values of the tags of one kind in a text: `{c:Am7}` -> 'Am7'. */
function tagged(text: RichText, type: 'chord' | 'roman' | 'degree' | 'note' | 'key'): string[] {
  return tokenize(text).flatMap((t) => (t.type === type && 'value' in t ? [String(t.value)] : []));
}

const sortedPcs = (pcs: Iterable<number>): number[] => [...new Set(pcs)].sort((a, b) => a - b);

describe('seventh-chords: the unit on its own', () => {
  it('is valid for the lesson engine, with no warnings', () => {
    const problems = validateCourse({ id: 'theory-path', title: 'Theory Path', teacher: 'none', level: 'intermediate', units: [unit], glossary: [...THEORY_GLOSSARY] });
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with the unit word', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^sevenths-/);
  });
});

describe('seventh-chords: every shape written in the text', () => {
  // "{c:Am7} x02010", "{c:F7}, 131211", "{c:Am} (x02210)", and "x13121 is {c:Bbm7}".
  const pairs: Array<[string, string]> = [];
  for (const text of texts(unit)) {
    for (const m of text.matchAll(/\{c:([^}]+)\},?\s*\(?([x0-9]{6})\b/g)) pairs.push([m[1], m[2]]);
    for (const m of text.matchAll(/\b([x0-9]{6})\)? is \{c:([^}]+)\}/g)) pairs.push([m[2], m[1]]);
  }

  it('finds the shapes', () => {
    expect(pairs.length).toBeGreaterThan(40);
  });

  it('sounds exactly the chord it is written beside, in root position', () => {
    for (const [symbol, shape] of pairs) {
      const v = tryBuildVoicing(symbol, shape);
      expect(v, `${symbol} ${shape}`).not.toBeNull();
      expect(v!.chord, `${symbol} ${shape}`).toBe(symbol);
    }
  });

  it('matches every shape in a match-pairs question with its chord', () => {
    const matched = ofType<MatchPairsExercise>('match-pairs').flatMap((e) => e.pairs).filter((p) => /^[x0-9]{6}$/.test(plainText(p.left)));
    expect(matched.length).toBe(10);
    for (const p of matched) {
      const symbol = tagged(p.right, 'chord')[0];
      expect(buildVoicing(symbol, plainText(p.left)).chord, `${plainText(p.left)} ${symbol}`).toBe(symbol);
    }
  });

  it('builds every chord-build and play-chord shape as the chord it names', () => {
    const shaped: Array<ChordBuildExercise | PlayChordExercise> = [
      ...ofType<ChordBuildExercise>('chord-build').filter((e) => e.task === 'fingers'),
      ...ofType<PlayChordExercise>('play-chord'),
    ];
    expect(shaped.length).toBeGreaterThanOrEqual(10);
    for (const e of shaped) expect(buildVoicing(e.chord, e.frets!).chord, `${e.chord} ${String(e.frets)}`).toBe(e.chord);
  });
});

describe('seventh-chords: formulas, spellings and sizes', () => {
  it('gives each type its catalogue formula', () => {
    const formulas = ofType<MatchPairsExercise>('match-pairs').filter((e) => /formula/.test(plainText(e.prompt)));
    expect(formulas.length).toBe(3);
    for (const p of formulas.flatMap((e) => e.pairs)) {
      const symbol = tagged(p.left, 'chord')[0];
      expect(tagged(p.right, 'degree'), symbol).toEqual(parseChord(symbol)!.type.degrees);
    }
    expect(getChordType('maj7')!.degrees).toEqual(['1', '3', '5', '7']);
    expect(getChordType('dim7')!.degrees).toEqual(['1', 'b3', 'b5', 'bb7']);
    expect(getChordType('mmaj7')!.degrees).toEqual(['1', 'b3', '5', '7']);
  });

  it('names the five types the way the match-pairs say', () => {
    const want: Record<string, string> = { maj7: 'Major 7', '7': 'Dominant 7', m7: 'Minor 7', m7b5: 'Half-diminished', dim7: 'Diminished 7' };
    const named = ofType<MatchPairsExercise>('match-pairs').filter((e) => /with its name/.test(plainText(e.prompt)));
    expect(named.length).toBe(2);
    for (const p of named.flatMap((e) => e.pairs)) expect(plainText(p.right)).toBe(want[parseChord(tagged(p.left, 'chord')[0])!.type.id]);
  });

  it('quotes the right interval sizes', () => {
    expect(semitones('M7')).toBe(11);
    expect(semitones('m7')).toBe(10);
    expect(semitones('d7')).toBe(9);
    expect(semitones('M6')).toBe(9);
    expect(intervalBetween('C', 'Bbb')).toBe('d7');
    expect(intervalBetween('C', 'A')).toBe('M6');
    const sizes = exercises(lesson('what-a-seventh-chord-is').steps).find((e) => e.type === 'choice' && /half steps/.test(plainText(e.prompt)))!;
    expect(correctText(sizes as never)).toBe('11');
    const minor7 = exercises(unit.checkpoint!.steps!).find((e) => e.type === 'choice' && /minor 7th/.test(plainText(e.prompt)))!;
    expect(correctText(minor7 as never)).toBe('10');
  });

  it('spells the chords it quotes', () => {
    expect(chordNotes('Cdim7')).toEqual(['C', 'Eb', 'Gb', 'Bbb']);
    expect(chordNotes('Cm7')).toEqual(['C', 'Eb', 'G', 'Bb']);
    expect(chordNotes('Gm7b5')).toEqual(['G', 'Bb', 'Db', 'F']);
    expect(chordNotes('F#m7b5')).toEqual(['F#', 'A', 'C', 'E']);
    expect(chordNotes('Dm7b5')).toEqual(['D', 'F', 'Ab', 'C']);
    expect(chordNotes('G#dim7')).toEqual(['G#', 'B', 'D', 'F']);
    expect(chordNotes('AmMaj7')).toEqual(['A', 'C', 'E', 'G#']);
    expect(chordNotes('Bm7b5')).toEqual(['B', 'D', 'F', 'A']);
    expect(chordNotes('D7')).toEqual(['D', 'F#', 'A', 'C']);
    expect(chordNotes('Bm7')).toEqual(['B', 'D', 'F#', 'A']);
    expect(chordNotes('E7')).toEqual(['E', 'G#', 'B', 'D']);
    // Every typed answer is the 7th of the chord in its prompt, spelled exactly.
    const typed = ofType<TypeAnswerExercise>('type-answer');
    expect(typed.length).toBe(2);
    for (const e of typed) {
      const symbol = tagged(e.prompt, 'chord')[0];
      expect(e.answer.kind === 'note' && e.answer.spelling).toBe('exact');
      expect(e.answer.value, symbol).toBe(chordNotes(symbol)[3]);
    }
  });

  it('shows the right dots on the formula cards', () => {
    // Cmaj7 x3545x and Cdim7 x3424x are what the fretboard figures draw.
    expect(buildVoicing('Cmaj7', 'x3545x').notes.map((n) => n.degree)).toEqual(['1', '5', '7', '3']);
    expect(buildVoicing('Cdim7', 'x3424x').notes.map((n) => n.degree)).toEqual(['1', 'b5', 'bb7', 'b3']);
    // In that shape each change moves one dot back one fret: C7 x3535x, Cm7 x3534x, Cm7b5 x3434x.
    expect(buildVoicing('C7', 'x3535x').chord).toBe('C7');
    expect(buildVoicing('Cm7', 'x3534x').chord).toBe('Cm7');
    expect(buildVoicing('Cm7b5', 'x3434x').chord).toBe('Cm7b5');
  });
});

describe('seventh-chords: the sevenths of a key', () => {
  const symbols = (k: string, minor?: 'harmonic'): string[] => diatonicChords(k, { sevenths: true, ...(minor ? { minor } : {}) }).map((c) => c.symbol);
  const romans = (k: string): string[] => diatonicChords(k, { sevenths: true }).map((c) => c.roman);

  it('lists C major and its numerals as the cards do', () => {
    const [chords, numerals] = lesson('sevenths-in-a-key').steps.slice(0, 2) as Array<{ body: RichText }>;
    expect(tagged(chords.body, 'chord')).toEqual(symbols('C major'));
    expect(tagged(numerals.body, 'roman')).toEqual(romans('C major'));
    expect(romans('C major')).toEqual(['Imaj7', 'ii7', 'iii7', 'IVmaj7', 'V7', 'vi7', 'viiø7']);
    // Only one dominant seventh, on degree 5.
    expect(diatonicChords('C major', { sevenths: true }).filter((c) => c.type.id === '7').map((c) => c.degree)).toEqual([5]);
    // The roots on string 5 in the first card: frets 3 5 7 8 10 12 14 are C D E F G A B.
    const roots = (chords as unknown as { figure: { dots: Array<{ string: number; fret: number }> } }).figure.dots;
    expect(roots.map((d) => noteAt(d, { octave: false, context: { key: 'C major' } }))).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
  });

  it('lists A minor (natural) and its numerals as the cards do', () => {
    const [chords, numerals] = lesson('sevenths-in-a-minor-key').steps.slice(0, 2) as Array<{ body: RichText }>;
    expect(tagged(chords.body, 'chord')).toEqual(symbols('A minor'));
    expect(tagged(numerals.body, 'roman').slice(0, 7)).toEqual(romans('A minor'));
    expect(romans('A minor')).toEqual(['i7', 'iiø7', 'bIIImaj7', 'iv7', 'v7', 'bVImaj7', 'bVII7']);
    // The relative major has the same seven chords.
    expect([...symbols('A minor')].sort()).toEqual([...symbols('C major')].sort());
  });

  it('takes the raised 7th from harmonic minor', () => {
    const harmonic = symbols('A minor', 'harmonic');
    expect(harmonic[0]).toBe('AmMaj7');
    expect(harmonic[4]).toBe('E7');
    expect(harmonic[6]).toBe('G#dim7');
    expect(symbols('A minor')[4]).toBe('Em7');
  });

  it('says truthfully which chords the raised 7th changes', () => {
    // Raising G to G# changes every chord that holds a G (i, bIII, v and bVII), not just two.
    const natural = symbols('A minor');
    const harmonic = symbols('A minor', 'harmonic');
    const changed = natural.filter((c, i) => c !== harmonic[i]);
    expect(changed).toEqual(natural.filter((c) => chordNotes(c).includes('G')));
    expect(changed).toEqual(['Am7', 'Cmaj7', 'Em7', 'G7']);
    const card = lesson('sevenths-in-a-minor-key').steps.find((s) => !isGenerated(s) && s.type === 'card' && s.title === 'The raised 7th') as { body: RichText };
    const said = plainText(card.body);
    expect(said).not.toMatch(/two chords change/);
    expect(said).toMatch(/every chord that holds a G changes/);
  });

  it('answers every raised-7th question from harmonic minor', () => {
    const raised = ofType<ChoiceExercise>('choice').filter((e) => /raise/.test(plainText(e.prompt)));
    expect(raised.length).toBe(4);
    for (const e of raised) {
      const key = tagged(e.prompt, 'key')[0];
      const harmonic = symbols(key, 'harmonic');
      const prompt = plainText(e.prompt);
      const numeral = tagged(e.prompt, 'roman')[0];
      const degree = /degree (\d)/.exec(prompt)?.[1];
      const root = /built on/.test(prompt) ? tagged(e.prompt, 'note')[0] : undefined;
      const want = numeral ? romanToChord(numeral, key)! : degree ? harmonic[Number(degree) - 1] : harmonic.find((c) => parseChord(c)!.root === root)!;
      expect(harmonic, prompt).toContain(want);
      expect(tagged(e.options.find((o) => o.correct)!.text!, 'chord')[0], prompt).toBe(want);
      // Every wrong option is some other chord: never the one asked for.
      for (const o of e.options.filter((x) => !x.correct)) expect(tagged(o.text!, 'chord')[0], prompt).not.toBe(want);
    }
    // The review card of the raised 7th asks D minor: A7 on degree 5, C#dim7 on degree 7.
    expect(symbols('D minor', 'harmonic')[4]).toBe('A7');
    expect(symbols('D minor', 'harmonic')[6]).toBe('C#dim7');
    expect(symbols('D minor')[4]).toBe('Am7');
    expect(chordNotes('Amaj7')).toContain('G#');
    // The checkpoint's vii°7 in E minor, and why its wrong options are wrong.
    expect(symbols('E minor', 'harmonic')[6]).toBe('D#dim7');
    expect(chordNotes('D#dim7')).toEqual(['D#', 'F#', 'A', 'C']);
    expect(romanToChord('bVII7', 'E minor')).toBe('D7');
    expect(chordNotes('D#m7b5')).toContain('C#');
    expect(romanToChord('iiø7', 'E minor')).toBe('F#m7b5');
  });

  it('asks the raised 7th in review, not the natural-minor drill', () => {
    const fact = lesson('sevenths-in-a-minor-key').facts!.find((f) => f.id === 'sevenths-harmonic-v7')!;
    expect(fact.ask && isGenerated(fact.ask)).toBe(false);
  });

  it('fills every key blank with the chord of that degree, and banks only outsiders', () => {
    const fills = ofType<FillBlanksExercise>('fill-blanks').filter((x) => /seventh chords of/.test(plainText(x.prompt)));
    expect(fills.length).toBe(4);
    for (const e of fills) {
      const key = tagged(e.prompt, 'key')[0];
      const all = symbols(key);
      const blanks = e.blanks.map((b) => tagged(b, 'chord')[0]);
      let b = 0;
      const shown = tokenize(e.text).filter((t) => t.type === 'chord' || t.type === 'blank');
      expect(shown.length, key).toBe(7);
      shown.forEach((t, i) => {
        const symbol = t.type === 'blank' ? blanks[b++] : String((t as { value: string }).value);
        expect(symbol, `${key} degree ${i + 1}`).toBe(all[i]);
      });
      for (const w of e.bank ?? []) expect(all, key).not.toContain(tagged(w, 'chord')[0]);
    }
  });

  it('answers the numeral questions', () => {
    expect(romanToChord('IVmaj7', 'F major')).toBe('Bbmaj7');
    expect(romanToChord('bVImaj7', 'A minor')).toBe('Fmaj7');
    expect(romanToChord('bIIImaj7', 'A minor')).toBe('Cmaj7');
    expect(romanToChord('iv7', 'A minor')).toBe('Dm7');
    expect(romanToChord('bVImaj7', 'E minor')).toBe('Cmaj7');
    expect(romanToChord('bIIImaj7', 'E minor')).toBe('Gmaj7');
    expect(romanToChord('bVII7', 'E minor')).toBe('D7');
    expect(romanToChord('V7', 'A minor')).toBe('E7');
    expect(romanToChord('iiø7', 'A minor')).toBe('Bm7b5');
    expect(romanToChord('viiø7', 'C major')).toBe('Bm7b5');
    expect(romanToChord('vii°7', 'A minor')).toBe('G#dim7');
    expect(romanToChord('bVII7', 'A minor')).toBe('G7');
    // The tempting wrong answers really need a note from outside the key.
    expect(chordNotes('Bb7')).toContain('Ab');
    expect(chordNotes('F7')).toContain('Eb');
    expect(chordNotes('C7')).toContain('Bb');
    expect(chordNotes('Bbm7')).toContain('Db');
    expect(chordNotes('G#m7b5')).toContain('F#');
  });
});

describe('seventh-chords: taught before asked', () => {
  it('shows every shape a match asks for earlier in the same lesson', () => {
    for (const l of unit.lessons) {
      l.steps.forEach((s, i) => {
        if (isGenerated(s) || s.type !== 'match-pairs') return;
        const before = texts(l.steps.slice(0, i)).join(' ');
        for (const p of s.pairs) {
          const shape = plainText(p.left);
          if (/^[x0-9]{6}$/.test(shape)) expect(before, `${l.id}: ${shape} is asked before it is shown`).toContain(shape);
        }
      });
    }
  });

  it('spells the glossary examples in words (definitions are plain text) and as the engine does', () => {
    const def = (id: string): string => THEORY_GLOSSARY.find((t) => t.id === id)!.definition;
    for (const id of ['half-diminished', 'diminished-seventh', 'minor-major-seventh']) expect(def(id), id).not.toMatch(/\b[A-G](#|bb?)(?![a-z])|m7b5|dim7|mMaj7/);
    expect(def('half-diminished')).toContain(chordNotes('Bm7b5').join(' '));
    expect(chordNotes('Cdim7')).toEqual(['C', 'Eb', 'Gb', 'Bbb']);
    expect(def('diminished-seventh')).toContain('C, E flat, G flat and B double flat');
    expect(chordNotes('AmMaj7')).toEqual(['A', 'C', 'E', 'G#']);
    expect(def('minor-major-seventh')).toContain('A, C, E and G sharp');
  });

  it('writes every lesson summary in words, since the map shows it as plain text', () => {
    for (const l of unit.lessons) expect(l.teaches, l.id).not.toMatch(/\b(maj7|dim7|m7b5|m7)\b/);
  });

  it('covers the planned checkpoint: V7, vii°7 and the minor-major 7th from harmonic minor', () => {
    const asked = exercises(unit.checkpoint!.steps!).map((e) => JSON.stringify(e));
    expect(asked.some((t) => t.includes('{r:V7}') && t.includes('E7'))).toBe(true);
    expect(asked.some((t) => t.includes('{r:vii°7}') && t.includes('D#dim7'))).toBe(true);
    expect(asked.some((t) => t.includes('AmMaj7'))).toBe(true);
  });
});

describe('seventh-chords: what each string plays', () => {
  const at = (string: number, fret: number, chord: string): string => noteAt({ string, fret }, { context: { chord }, octave: false });

  it('names the notes the text points at', () => {
    expect(at(2, 0, 'Cmaj7')).toBe('B');
    expect(at(3, 0, 'Am7')).toBe('G');
    expect(at(3, 2, 'Am')).toBe('A');
    expect(at(1, 0, 'Fmaj7')).toBe('E');
    expect(at(1, 1, 'F')).toBe('F');
    expect(at(2, 1, 'F')).toBe('C');
    expect(at(3, 2, 'F')).toBe('A');
    expect(at(1, 1, 'G7')).toBe('F');
    expect(at(1, 3, 'G')).toBe('G');
    expect(at(2, 3, 'Dm')).toBe('D');
    expect(at(2, 1, 'Dm7')).toBe('C');
    expect(at(3, 3, 'C7')).toBe('Bb');
    expect(at(3, 2, 'B7')).toBe('A');
    expect(at(4, 1, 'B7')).toBe('D#');
    expect(at(3, 1, 'E7')).toBe('G#');
    expect(at(3, 1, 'AmMaj7')).toBe('G#');
    expect(at(4, 1, 'F7')).toBe('Eb');
    expect(at(3, 1, 'Fm7')).toBe('Ab');
    expect(at(3, 2, 'F7')).toBe('A');
    expect(at(3, 1, 'Bb7')).toBe('Ab');
    expect(at(2, 2, 'Bbm7')).toBe('Db');
    expect(at(3, 2, 'Bbmaj7')).toBe('A');
    expect(at(4, 5, 'A7')).toBe('G');
    expect(at(2, 2, 'A7')).toBe('C#');
    expect(at(2, 1, 'Am7')).toBe('C');
    expect(at(3, 1, 'Amaj7')).toBe('G#');
    expect(at(4, 1, 'Am7b5')).toBe('Eb');
    // Fmaj7 1x221x: "the major 7th, E, on string 4".
    expect(at(4, 2, 'Fmaj7')).toBe('E');
    expect(identifyFretted('1x221x').symbol).toBe('Fmaj7');
    // "The small F shape is xx3211."
    expect(identifyFretted('xx3211').symbol).toBe('F');
    // The wrong moves of the Fmaj7 question really break the chord.
    expect(identifyFretted('xx3201').symbol).not.toBe('Fmaj7');
    expect(identifyFretted('xx3011').symbol).not.toBe('Fmaj7');
    expect(identifyFretted('xx3210').symbol).toBe('Fmaj7');
  });

  it('moves the barre shapes to the roots it says', () => {
    const slide = (chord: string, frets: string, by: number) => moveVoicing(buildVoicing(chord, frets), by)!;
    expect(slide('F7', '131211', 2).chord).toBe('G7');
    expect(slide('F7', '131211', 2).frets).toEqual([3, 5, 3, 4, 3, 3]);
    expect(slide('F7', '131211', 4).chord).toBe('A7');
    expect(slide('F7', '131211', 4).frets).toEqual([5, 7, 5, 6, 5, 5]);
    expect(slide('Bbm7', 'x13121', 2).chord).toBe('Cm7');
    expect(slide('Bbm7', 'x13121', 2).frets).toEqual([null, 3, 5, 3, 4, 3]);
    expect(slide('Bbm7', 'x13121', 4).chord).toBe('Dm7');
    expect(slide('Bbm7', 'x13121', 4).frets).toEqual([null, 5, 7, 5, 6, 5]);
    expect(slide('Bbm7b5', 'x1212x', 1).chord).toBe('Bm7b5');
    expect(slide('Bbm7b5', 'x1212x', 4).chord).toBe('Dm7b5');
    // The engine may name this one D#m7b5: the same chord, so compare the sounds.
    expect(sortedPcs(chordPcs(slide('Bbm7b5', 'x1212x', 5).chord))).toEqual(sortedPcs(chordPcs('Ebm7b5')));
    expect(slide('Bbm7b5', 'x1212x', 6).chord).toBe('Em7b5');
    expect(slide('Bbm7b5', 'x1212x', 2).chord).toBe('Cm7b5');
    expect(buildVoicing('C7', 'x35353').chord).toBe('C7');
  });
});

describe('seventh-chords: what each listening question plays', () => {
  it('what-a-seventh-chord-is: C7, four notes', () => {
    const [q] = listens(lesson('what-a-seventh-chord-is'));
    const plan = soundPlan(q.sound);
    expect(plan.events[0].midi.length).toBe(4);
    expect(sortedPcs(plan.events.flatMap((e) => e.midi.map((m) => m % 12)))).toEqual(sortedPcs(chordPcs('C7')));
    expect(correctText(q)).toMatch(/seventh chord/);
  });

  it('sevenths-in-a-minor-key: E7 (with G sharp) before Am7', () => {
    const [q] = listens(lesson('sevenths-in-a-minor-key'));
    const first = soundPlan(q.sound).events[0].midi.map((m) => m % 12);
    expect(first).toContain(8); // G#
    expect(first).not.toContain(7); // no G
    expect(correctText(q)).toMatch(/^E7/);
  });

  it('hearing-sevenths: each voicing is the chord the answer names', () => {
    const names: Record<string, string> = { maj7: 'Major 7', '7': 'Dominant 7', m7b5: 'Half-diminished' };
    const qs = listens(lesson('hearing-sevenths'));
    expect(qs.length).toBe(3);
    for (const q of qs) {
      if (q.sound.kind !== 'chord') throw new Error('expected a chord sound');
      expect(identifyFretted(q.sound.frets as string).symbol).toBe(q.sound.chord);
      expect(correctText(q)).toBe(names[parseChord(q.sound.chord)!.type.id]);
    }
    // The five open voicings named on the first card.
    for (const [chord, shape] of [['Amaj7', 'x02120'], ['A7', 'x02020'], ['Am7', 'x02010'], ['Am7b5', 'x0101x'], ['Adim7', 'x01212']]) expect(identifyFretted(shape).symbol).toBe(chord);
  });

  it('sevenths-and-function: the phrase ends on the dominant', () => {
    const [q] = listens(lesson('sevenths-and-function'));
    if (q.sound.kind !== 'progression') throw new Error('expected a progression');
    expect(q.sound.chords.at(-1)).toBe('G7');
    expect(correctText(q)).toMatch(/pulls/);
  });
});

describe('seventh-chords: what the chords do', () => {
  it('resolves each dominant down a fifth', () => {
    for (const [from, to] of [['G', 'C'], ['D', 'G'], ['E', 'A'], ['A', 'D'], ['C', 'F']]) expect(intervalBetween(from, to)).toBe('P4');
    // The tritone of G7 and where it goes; the same in D7.
    expect(intervalBetween('B', 'F')).toBe('d5');
    expect(intervalBetween('B', 'C')).toBe('m2');
    expect(intervalBetween('E', 'F')).toBe('m2');
    expect(intervalBetween('F#', 'G')).toBe('m2');
    expect(intervalBetween('B', 'C')).toBe('m2');
  });

  it('shares three notes between Bm7b5 and G7', () => {
    expect(chordNotes('Bm7b5').filter((n) => chordNotes('G7').includes(n))).toEqual(['B', 'D', 'F']);
  });
});

describe('seventh-chords: on the go', () => {
  it('still teaches with the sound off and with the guitar away', () => {
    for (const c of [{ guitar: false, sound: true }, { guitar: false, sound: false }, { guitar: true, sound: false }]) {
      const adapted = adaptUnit(unit, c);
      for (const l of adapted.lessons) {
        const asked = l.steps.filter((s) => isGenerated(s) || s.type !== 'card');
        expect(asked.length, `${l.id} ${JSON.stringify(c)}`).toBeGreaterThanOrEqual(MIN_QUIET_EXERCISES + 2);
        expect(asked.some((s) => !isGenerated(s) && s.type.startsWith('play-')), `${l.id}: a play step is left`).toBe(false);
        if (!c.sound) expect(asked.some((s) => isListeningStep(s)), `${l.id}: a listening step is left`).toBe(false);
      }
      // The checkpoint keeps its own questions.
      expect(adapted.checkpoint?.steps?.length ?? 0, JSON.stringify(c)).toBeGreaterThanOrEqual(12);
    }
  });
});

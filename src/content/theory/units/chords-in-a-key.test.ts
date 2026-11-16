/**
 * Unit 12 of the Theory Path, cross-checked against the engines: every chord of a key the text or
 * an answer names is the theory engine's diatonic chord (`harmonizeScale`, `romanToChord`,
 * `progressionToChords`), the major-key pattern holds in all fifteen major keys, every chord shape is
 * the chord it is called (`identifyFretted`), every progression played is the one its answer names,
 * and the shared notes and stacked thirds are the engine's chord tones. Each lesson also still
 * teaches "on the go", with Sound and Guitar off.
 */
import { describe, expect, it } from 'vitest';
import { identifyFretted } from '@/core/guitar';
import { MAJOR_KEYS, chordNotes, harmonizeScale, intervalBetween, progressionToChords, romanToChord, scaleNotes } from '@/core/theory';
import {
  START_DIFFICULTY, formatProblems, generateStrict, plainText, validateCourse,
  type AudioFigure, type CardStep, type ChoiceExercise, type Exercise, type FillBlanksExercise, type Lesson, type ListenChoiceExercise,
  type MatchPairsExercise, type Step,
} from '@/lessons';
import { adaptLesson } from '@/features/learn/model/conditions';
import { assembleTheory } from '../index';
import unit, { SHAPES } from './chords-in-a-key';

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const cards = (l: { steps: readonly Step[] }): CardStep[] => l.steps.filter((s): s is CardStep => !('generate' in s) && s.type === 'card');
const exercisesOf = (steps: readonly Step[]): Exercise[] => steps.filter((s): s is Exercise => !('generate' in s) && s.type !== 'card');
const allExercises = (): Exercise[] => [...unit.lessons.flatMap((l) => exercisesOf(l.steps)), ...exercisesOf(unit.checkpoint?.steps ?? [])];
const ascii = (t: unknown): string => plainText(t as string, { format: { ascii: true } });
const correctOption = (e: ChoiceExercise | ListenChoiceExercise) => e.options.find((o) => o.correct)!;
/** The values of the tags of one kind in a text, in order: tags(text, 'c') -> ['G', 'C', 'D']. */
const tags = (text: unknown, kind: 'c' | 'r' | 'k' | 'n'): string[] => [...String(text).matchAll(new RegExp(`\\{${kind}:([^}|]+)\\}`, 'g'))].map((m) => m[1]);
const chordsOf = (key: string): string[] => harmonizeScale(key.replace(/ major$/, ''), 'major').map((c) => c.symbol);
const QUALITIES = ['major', 'minor', 'minor', 'major', 'major', 'minor', 'dim'];

/** This unit alone, as the registry assembles it; prerequisites outside it are theory.test.ts's to check. */
function unitCourse() {
  const course = assembleTheory([unit]).course;
  const ids = new Set(unit.lessons.map((l) => l.id));
  const units = course.units
    .filter((u) => u.id === unit.id)
    .map((u) => ({ ...u, lessons: u.lessons.map((l) => ({ ...l, requires: (l.requires ?? []).filter((r) => ids.has(r)) })) }));
  return { ...course, units };
}

describe('chords-in-a-key: the engine accepts the unit on its own', () => {
  it('has no errors and no warnings', () => {
    const problems = validateCourse(unitCourse());
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with "chords-key-"', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^chords-key-/);
  });
});

describe('chords-in-a-key: shapes', () => {
  it('every shape is the chord it is called', () => {
    for (const [symbol, frets] of Object.entries(SHAPES)) expect(identifyFretted(frets).symbol, `${symbol} ${frets}`).toBe(symbol);
  });

  it('every chord box drawn in the unit is its symbol', () => {
    const figures = [
      ...unit.lessons.flatMap((l) => cards(l)).map((c) => c.figure),
      ...allExercises().flatMap((e) => (e.type === 'choice' ? e.options.map((o) => o.figure) : [])),
    ].filter((f) => f?.kind === 'chord');
    expect(figures.length).toBeGreaterThanOrEqual(15);
    for (const f of figures) if (f?.kind === 'chord') expect(identifyFretted(f.frets!).symbol).toBe(f.symbol);
  });

  it('the shapes the text spells out are the ones drawn', () => {
    const text = JSON.stringify(unit);
    for (const [symbol, frets] of Object.entries(SHAPES)) {
      for (const m of text.matchAll(new RegExp(`\\{c:${symbol.replace('#', '#')}\\} \\(([x0-9]{6})\\)`, 'g'))) expect(m[1]).toBe(frets);
    }
    expect(text).toContain('{c:A} (x02220), {c:D} (xx0232), {c:E} (022100)');
  });
});

describe('chords-in-a-key: the chords of a key', () => {
  it('stacking thirds in C, G and D major gives the chords the text lists', () => {
    expect(chordsOf('C')).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
    expect(tags(cards(lesson('triads-from-the-scale'))[1].body, 'c')).toEqual(chordsOf('C'));
    expect(tags(cards(lesson('the-major-key-pattern'))[0].body, 'c')).toEqual(chordsOf('G'));
    const facts = unit.lessons.flatMap((l) => l.facts ?? []);
    expect(tags(facts.find((f) => f.id === 'chords-key-c-triads')!.back, 'c')).toEqual(chordsOf('C'));
    expect(tags(facts.find((f) => f.id === 'chords-key-g-chords')!.back, 'c')).toEqual(chordsOf('G'));
    const fillD = exercisesOf(lesson('the-major-key-pattern').steps).find((e): e is FillBlanksExercise => e.type === 'fill-blanks')!;
    let b = 0;
    const filled = ascii(fillD.text).split(/\s+/).map((t) => (t.startsWith('_') ? ascii(fillD.blanks[b++]) : t));
    expect(filled).toEqual(chordsOf('D'));
    for (const w of fillD.bank ?? []) expect(chordsOf('D')).not.toContain(ascii(w));
  });

  it('every major key has the pattern major, minor, minor, major, major, minor, diminished', () => {
    expect(MAJOR_KEYS.length).toBe(15);
    for (const k of MAJOR_KEYS) expect(harmonizeScale(k.tonic, 'major').map((c) => c.type.id), k.name).toEqual(QUALITIES);
  });

  it('the diminished triads are two minor thirds: B D F and F# A C', () => {
    for (const [chord, notes] of [['Bdim', ['B', 'D', 'F']], ['F#dim', ['F#', 'A', 'C']], ['C#dim', ['C#', 'E', 'G']]] as const) {
      expect(chordNotes(chord)).toEqual(notes);
      expect(intervalBetween(notes[0], notes[1])).toBe('m3');
      expect(intervalBetween(notes[1], notes[2])).toBe('m3');
    }
  });

  it('the stacked-thirds fill-ins are the engine\'s chord tones', () => {
    const stacks = allExercises().filter((e): e is FillBlanksExercise => e.type === 'fill-blanks' && /Stack thirds/.test(String(e.prompt)));
    expect(stacks).toHaveLength(2);
    for (const f of stacks) {
      const root = tags(f.prompt, 'n')[0];
      const triad = harmonizeScale('C', 'major').find((c) => c.root === root)!;
      expect(ascii(f.text).replace('___', ascii(f.blanks[0])).split(/\s+/)).toEqual(triad.notes);
    }
  });

  it('the key question lists the G major scale', () => {
    const q = exercisesOf(lesson('what-a-key-is').steps).find((e): e is ChoiceExercise => e.type === 'choice' && /mainly the notes/.test(String(e.prompt)))!;
    expect(tags(q.prompt, 'n').slice(0, 7)).toEqual(scaleNotes('G', 'major'));
    expect(tags(correctOption(q).text, 'k')).toEqual(['G major']);
  });
});

describe('chords-in-a-key: answers about a key', () => {
  it('"which chord is <numeral> in <key>" answers are the engine\'s chords', () => {
    const asked = allExercises().filter(
      (e): e is ChoiceExercise => e.type === 'choice' && tags(e.prompt, 'r').length === 1 && tags(e.prompt, 'k').length === 1 && e.options.every((o) => tags(o.text, 'c').length === 1),
    );
    expect(asked.length).toBe(4);
    for (const q of asked) {
      const [numeral] = tags(q.prompt, 'r');
      const [key] = tags(q.prompt, 'k');
      expect(tags(correctOption(q).text, 'c')[0], `${numeral} in ${key}`).toBe(romanToChord(numeral, key));
    }
  });

  it('"which chord is built on degree N of <key>" answers are the engine\'s chords', () => {
    const asked = allExercises().filter((e): e is ChoiceExercise => e.type === 'choice' && /built on degree \d of \{k:/.test(String(e.prompt)));
    expect(asked.length).toBe(4);
    for (const q of asked) {
      const degree = Number(/degree (\d)/.exec(String(q.prompt))![1]);
      const [key] = tags(q.prompt, 'k');
      expect(tags(correctOption(q).text, 'c')[0], `${degree} of ${key}`).toBe(chordsOf(key)[degree - 1]);
    }
  });

  it('every progression choice is the engine\'s progression in that key', () => {
    const asked = allExercises().filter((e): e is ChoiceExercise => e.type === 'choice' && /^Which is \{r:/.test(String(e.prompt)));
    expect(asked.length).toBe(3);
    for (const q of asked) {
      const numerals = tags(q.prompt, 'r').join(' ');
      const [key] = tags(q.prompt, 'k');
      expect(tags(correctOption(q).text, 'c'), `${numerals} in ${key}`).toEqual(progressionToChords(numerals, key));
    }
  });

  it('every match of numerals or keys with chords is the engine\'s', () => {
    const matches = allExercises().filter((e): e is MatchPairsExercise => e.type === 'match-pairs' && tags(e.pairs[0].right, 'c').length > 0);
    expect(matches).toHaveLength(3);
    for (const m of matches) {
      const key = tags(m.prompt, 'k')[0];
      for (const p of m.pairs) {
        const numeral = tags(p.left, 'r')[0];
        if (numeral) expect(tags(p.right, 'c'), `${numeral} in ${key}`).toEqual([romanToChord(numeral, key)]);
        else expect(tags(p.right, 'c'), tags(p.left, 'k')[0]).toEqual(progressionToChords('I IV V', tags(p.left, 'k')[0]));
      }
    }
  });

  it('the numeral fill-ins: G major and I-IV-V in D and E', () => {
    const fills = allExercises().filter((e): e is FillBlanksExercise => e.type === 'fill-blanks' && tags(e.text, 'c').length > 0 && !/Complete the chords/.test(String(e.prompt)));
    expect(fills).toHaveLength(3);
    for (const f of fills) {
      const key = tags(f.prompt, 'k')[0];
      const numerals = tags(f.text, 'r').length > 0 ? tags(f.text, 'r') : ['I', 'IV', 'V'];
      let b = 0;
      const filled = String(f.text).split('___').flatMap((part, i, all) => [...tags(part, 'c'), ...(i < all.length - 1 ? tags(f.blanks[b++], 'c') : [])]);
      expect(filled, key).toEqual(numerals.map((n) => romanToChord(n, key)));
      for (const w of f.bank ?? []) expect(numerals.map((n) => romanToChord(n, key))).not.toContain(tags(w, 'c')[0]);
    }
  });

  it('the chord-quality and numeral facts', () => {
    expect(['I', 'IV', 'V'].map((n) => romanToChord(n, 'G'))).toEqual(['G', 'C', 'D']);
    expect(['I', 'IV', 'V'].map((n) => romanToChord(n, 'C'))).toEqual(['C', 'F', 'G']);
    expect(harmonizeScale('C', 'major').map((c) => c.roman)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
    expect(romanToChord('vi', 'C')).toBe('Am');
    expect(romanToChord('vi', 'G')).toBe('Em');
    expect(progressionToChords('I V vi IV', 'G')).toEqual(['G', 'D', 'Em', 'C']);
  });
});

describe('chords-in-a-key: what is played', () => {
  const audio = (): AudioFigure[] => unit.lessons.flatMap((l) => cards(l)).map((c) => c.figure).filter((f): f is AudioFigure => f?.kind === 'audio');

  it('every progression a card plays is the one its label or text names', () => {
    for (const a of audio()) {
      if (a.sound.kind !== 'progression') continue;
      const numerals = tags(a.label, 'r');
      const keyNote = tags(a.label, 'n')[0];
      if (numerals.length > 0 && keyNote) expect(a.sound.chords, String(a.label)).toEqual(progressionToChords(numerals.join(' '), keyNote));
      else if (tags(a.label, 'c').length > 0) expect(a.sound.chords).toEqual(tags(a.label, 'c'));
    }
    const loops = audio().find((a) => /both loops/.test(String(a.label)))!;
    if (loops.sound.kind !== 'progression') throw new Error('a progression');
    expect(loops.sound.chords).toEqual([...progressionToChords('I V vi IV', 'G'), ...progressionToChords('I vi IV V', 'G')]);
    const seven = audio().filter((a) => a.sound.kind === 'progression' && a.sound.chords.length === 8 && a.sound.chords.includes(chordsOf(a.sound.chords[0])[6]));
    expect(seven).toHaveLength(2);
    for (const a of seven) if (a.sound.kind === 'progression') expect(a.sound.chords).toEqual([...chordsOf(a.sound.chords[0]), a.sound.chords[0]]);
  });

  it('every listening question plays what its right answer says', () => {
    const listens = allExercises().filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');
    expect(listens).toHaveLength(3);
    for (const q of listens) {
      if (q.sound.kind !== 'progression') throw new Error('progressions only');
      const chords = q.sound.chords;
      const answer = correctOption(q).text;
      const numerals = tags(answer, 'r');
      if (numerals.length > 0) expect(chords).toEqual(progressionToChords(numerals.join(' '), chords[0]));
      else expect(ascii(answer).startsWith('Yes')).toBe(chords[chords.length - 1] === chords[0]);
    }
  });
});

describe('chords-in-a-key: shared notes', () => {
  it('I and vi share two notes: C-Am share C and E, G-Em share G and B', () => {
    const shared = (a: string, b: string): string[] => chordNotes(a).filter((n) => chordNotes(b).includes(n));
    expect(shared('C', 'Am')).toEqual(['C', 'E']);
    expect(shared('G', 'Em')).toEqual(['G', 'B']);
    const q = exercisesOf(lesson('the-six-chord').steps).find((e): e is ChoiceExercise => e.type === 'choice' && /share/.test(String(e.prompt)))!;
    expect(tags(correctOption(q).text, 'n')).toEqual(shared('G', 'Em'));
    for (const o of q.options.filter((x) => !x.correct)) expect(tags(o.text, 'n')).not.toEqual(shared('G', 'Em'));
  });
});

describe('chords-in-a-key: review fixes', () => {
  /** The keys a drill step asks about, over many seeds, at one difficulty. */
  const keysAsked = (step: Step, difficulty: number): Set<string> => {
    const keys = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const e = generateStrict(step as Extract<Step, { generate: unknown }>, { seed, difficulty, level: 'beginner' });
      const m = /([A-G][#b]?) major/.exec(ascii('prompt' in e ? e.prompt : ''));
      if (m) keys.add(m[1]);
    }
    return keys;
  };

  it('key drills stay in keys the path has spelled (C G F D) from the start until well past it', () => {
    // A beginner starts at START_DIFFICULTY and moves up 0.04 per right answer: check up to 0.6.
    const drills = unit.lessons.flatMap((l) => l.steps).filter((s) => 'generate' in s && ['roman-chord', 'diatonic-chord'].includes(String(s.generate)));
    expect(drills.length).toBeGreaterThanOrEqual(8);
    for (const d of drills) {
      for (const difficulty of [START_DIFFICULTY.beginner, 0.4, 0.6]) {
        for (const k of keysAsked(d, difficulty)) expect(['C', 'G', 'F', 'D'], `${JSON.stringify(d)} at ${difficulty}`).toContain(k);
      }
    }
    // The I-IV-V drills and their fact include D, whose I-IV-V the lesson teaches.
    const oneFourFive = lesson('one-four-five').steps.filter((s) => 'generate' in s);
    expect([...keysAsked(oneFourFive[0], START_DIFFICULTY.beginner)]).toContain('D');
  });

  it('no choice gives its answer away: options with pictures all have one, and none has a caption of its own', () => {
    const withFigures = allExercises().filter((e): e is ChoiceExercise => e.type === 'choice' && e.options.some((o) => o.figure));
    expect(withFigures.length).toBeGreaterThanOrEqual(5);
    for (const q of withFigures) {
      expect(q.options.every((o) => o.figure), ascii(q.prompt)).toBe(true);
      expect(q.options.some((o) => o.figure && 'caption' in o.figure && o.figure.caption), ascii(q.prompt)).toBe(false);
    }
  });

  it('the diminished triad is two stacked minor thirds; the wrong stacks are major and minor', () => {
    const q = exercisesOf(lesson('the-major-key-pattern').steps).find((e): e is ChoiceExercise => e.type === 'choice' && /Which thirds are stacked/.test(String(e.prompt)))!;
    expect(q.fact).toBe('chords-key-diminished');
    expect(chordNotes('Bdim')).toEqual(['B', 'D', 'F']);
    const stack = (notes: string[]): string[] => [intervalBetween(notes[0], notes[1]), intervalBetween(notes[1], notes[2])];
    expect(stack(chordNotes('Bdim'))).toEqual(['m3', 'm3']);
    expect(ascii(correctOption(q).text)).toBe('A minor third, then another minor third');
    expect(stack(chordNotes('G'))).toEqual(['M3', 'm3']); // "a major third, then a minor third": G B D, major
    expect(stack(chordNotes('Dm'))).toEqual(['m3', 'M3']); // "a minor third, then a major third": D F A, minor
  });
});

describe('chords-in-a-key: on the go', () => {
  it('every lesson still teaches with Sound and Guitar off', () => {
    for (const l of unit.lessons) {
      const quiet = adaptLesson(l, { guitar: false, sound: false });
      expect(quiet.needsSound, l.id).toBe(false);
      const left = quiet.lesson.steps.filter((s) => 'generate' in s || s.type !== 'card');
      expect(left.length, `${l.id}: questions left without sound`).toBeGreaterThanOrEqual(4);
    }
  });
});

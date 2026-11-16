/**
 * Unit 10 of the Theory Path, cross-checked against the engines: every interval the text names
 * (between two named notes, on the drawn neck, in a match, in a listening question) has the size and
 * name the theory engine gives it; every fret quoted is where the guitar engine puts that note; the
 * traditional tunes open with the intervals the facts claim; the open strings are fourths but for
 * G-B; the tritone's two spellings; the chord shapes and their formula numbers. Each lesson also
 * still teaches "on the go", with Sound and Guitar off.
 */
import { describe, expect, it } from 'vitest';
import { identifyFretted, midiAt, noteAt, tuningIntervals } from '@/core/guitar';
import {
  chordNotes, degreeInScale, getChordType, interval, intervalBetween, intervalName, parseNote, semitones, semitonesToDegree, transpose,
} from '@/core/theory';
import {
  findTargets, formatProblems, plainText, soundPlan, validateCourse,
  type CardStep, type ChoiceExercise, type Exercise, type FretboardFigure, type FretboardFindExercise, type FretboardNameExercise,
  type Lesson, type ListenChoiceExercise, type MatchPairsExercise, type Step, type TabNote,
} from '@/lessons';
import { adaptLesson } from '@/features/learn/model/conditions';
import { assembleTheory } from '../index';
import unit, { TUNES } from './intervals-1';

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const cards = (l: { steps: readonly Step[] }): CardStep[] => l.steps.filter((s): s is CardStep => !('generate' in s) && s.type === 'card');
const exercisesOf = (steps: readonly Step[]): Exercise[] => steps.filter((s): s is Exercise => !('generate' in s) && s.type !== 'card');
const allExercises = (): Exercise[] => [...unit.lessons.flatMap((l) => exercisesOf(l.steps)), ...exercisesOf(unit.checkpoint?.steps ?? [])];
const ascii = (t: unknown): string => plainText(t as string, { format: { ascii: true } });
const correct = (e: ChoiceExercise | ListenChoiceExercise): string => ascii(e.options.find((o) => o.correct)!.text);
const at = (string: number, fret: number): number => midiAt({ string, fret });
const NUMBER_WORDS = ['unison', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'octave'];

/** "A major second" / "An octave" / "Perfect fourth" -> the interval words, lower case, without the article. */
const words = (text: string): string => text.replace(/^(an?|the) /i, '').replace(/ up$/, '').toLowerCase();
/** The engine's name for an interval, "octave" for P8 (how the lessons say it). */
const nameOf = (ivl: string): string => (interval(ivl).semitones === 12 ? 'octave' : intervalName(ivl).toLowerCase());

/** This unit alone, as the registry assembles it; prerequisites outside it are theory.test.ts's to check. */
function unitCourse() {
  const course = assembleTheory([unit]).course;
  const ids = new Set(unit.lessons.map((l) => l.id));
  const units = course.units
    .filter((u) => u.id === unit.id)
    .map((u) => ({ ...u, lessons: u.lessons.map((l) => ({ ...l, requires: (l.requires ?? []).filter((r) => ids.has(r)) })) }));
  return { ...course, units };
}

describe('intervals-1: the engine accepts the unit on its own', () => {
  it('has no errors and no warnings', () => {
    const problems = validateCourse(unitCourse());
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with "intervals-"', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^intervals-/);
  });
});

describe('intervals-1: intervals between two named notes', () => {
  const UP = /\{n:([A-G][#b]*)\} up to \{n:([A-G][#b]*)\}/;

  it('every "X up to Y" question has the engine\'s interval as its answer', () => {
    const asked = allExercises().filter((e): e is ChoiceExercise => e.type === 'choice' && UP.test(String(e.prompt)));
    expect(asked.length).toBeGreaterThanOrEqual(7);
    for (const q of asked) {
      const [, from, to] = UP.exec(String(q.prompt))!;
      const ivl = intervalBetween(from, to);
      const answer = words(correct(q));
      // Either the full name ("minor third") or only the number ("a fifth") is asked.
      if (NUMBER_WORDS.includes(answer)) expect(answer, `${from}-${to}`).toBe(NUMBER_WORDS[interval(ivl).number - 1]);
      else expect(answer, `${from}-${to}`).toBe(nameOf(ivl));
    }
  });

  it('the true-false statements about named notes are right', () => {
    expect(interval(intervalBetween('C', 'E')).number).toBe(3); // "C up to E is a second": false
    expect(intervalBetween('F', 'A')).toBe('M3'); // "F up to A is a third": true
    expect(semitones('M3') - semitones('m3')).toBe(1); // "a minor third is one half step smaller"
    expect(semitones('P8') - semitones('M7')).toBe(1); // "a major seventh is one half step below the octave"
  });

  it('the counting card and the third above C on string 5', () => {
    const fig = cards(lesson('what-an-interval-is'))[0].figure as FretboardFigure;
    for (const d of fig.dots!) {
      const letters = (parseNote(d.note!)!.step - parseNote('C')!.step + 7) % 7;
      expect(d.label).toBe(String(letters + 1));
      expect(noteAt(d, { octave: false })).toBe(d.note);
    }
    const third = exercisesOf(lesson('what-an-interval-is').steps).find((e): e is FretboardFindExercise => e.type === 'fretboard-find')!;
    expect(findTargets(third).map(({ string, fret }) => ({ string, fret }))).toEqual([{ string: 5, fret: 7 }]);
    expect(interval(intervalBetween('C', 'E')).number).toBe(3);
  });
});

describe('intervals-1: sizes in half steps', () => {
  it('every match of an interval with its size is the engine\'s size', () => {
    const NAMES = new Map(['m2', 'M2', 'm3', 'M3', 'P4', 'A4', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8'].map((i) => [nameOf(i), i]));
    NAMES.set('tritone', 'A4');
    const matches = allExercises().filter((e): e is MatchPairsExercise => e.type === 'match-pairs' && /half step/.test(ascii(e.pairs[0].right)));
    expect(matches.length).toBe(5);
    for (const m of matches) {
      for (const p of m.pairs) {
        const ivl = NAMES.get(ascii(p.left).toLowerCase());
        expect(ivl, ascii(p.left)).toBeDefined();
        expect(ascii(p.right)).toBe(`${semitones(ivl!)} half step${semitones(ivl!) === 1 ? '' : 's'}`);
      }
    }
  });

  it('every interval label drawn on the neck is the interval from the root dot', () => {
    const figures = unit.lessons.flatMap((l) => cards(l)).map((c) => c.figure).filter((f): f is FretboardFigure => f?.kind === 'fretboard' && !!f.dots?.some((d) => /^[mMPAd]\d$/.test(d.label ?? '')));
    expect(figures.length).toBe(4);
    for (const fig of figures) {
      const root = fig.dots!.find((d) => d.label === 'R')!;
      for (const d of fig.dots!.filter((x) => /^[mMPAd]\d$/.test(x.label ?? ''))) {
        const span = at(d.string, d.fret) - at(root.string, root.fret);
        expect(span, `${d.label} at ${d.string}:${d.fret}`).toBe(semitones(d.label!));
        expect(noteAt(d, { octave: false, context: { prefer: d.note!.includes('b') ? 'flats' : 'sharps' } })).toBe(d.note);
      }
    }
  });

  it('the frets the "find" questions and their explanations name', () => {
    const finds = allExercises().filter((e): e is FretboardFindExercise => e.type === 'fretboard-find' && 'interval' in e.find);
    expect(finds.length).toBe(6);
    for (const f of finds) {
      const targets = findTargets(f);
      expect(targets, String(f.prompt)).toHaveLength(1);
      const [t] = targets;
      if (!('interval' in f.find)) continue;
      expect(at(t.string, t.fret) - at(f.find.from.string, f.find.from.fret)).toBe(semitones(f.find.interval));
      const said = ascii(f.explain);
      expect(t.fret === 0 ? /open string 3/.test(said) : said.includes(`fret ${t.fret}`), said).toBe(true);
    }
  });
});

describe('intervals-1: the open strings and the perfect intervals', () => {
  it('neighbouring open strings are perfect fourths, except G to B, a major third', () => {
    expect(tuningIntervals('standard')).toEqual([5, 5, 5, 4, 5]);
    expect(intervalBetween('G', 'B')).toBe('M3');
    const q = exercisesOf(lesson('fourths-fifths-octaves').steps).find((e): e is ChoiceExercise => e.type === 'choice' && /not a perfect fourth/.test(String(e.prompt)))!;
    expect(correct(q)).toMatch(/Strings 3 and 2/);
    // Fret 5 of string 6 is open string 5: a perfect fourth up.
    expect(at(6, 5)).toBe(at(5, 0));
    expect(at(5, 0) - at(6, 0)).toBe(semitones('P4'));
  });

  it('the fourth, fifth and octave from A on string 6', () => {
    expect(noteAt({ string: 5, fret: 5 }, { octave: false })).toBe('D');
    expect(noteAt({ string: 5, fret: 7 }, { octave: false })).toBe('E');
    expect(at(4, 7) - at(6, 5)).toBe(12);
  });

  it('the perfect intervals are the unison, fourth, fifth and octave', () => {
    for (const p of ['P1', 'P4', 'P5', 'P8']) expect(interval(p).quality).toBe('P');
    for (const n of ['M2', 'm3', 'M3', 'm6', 'M6', 'm7', 'M7']) expect(interval(n).quality).not.toBe('P');
  });
});

describe('intervals-1: the tritone', () => {
  it('is six half steps, half an octave, three whole steps', () => {
    expect(semitones('A4')).toBe(6);
    expect(semitones('d5')).toBe(6);
    expect(semitones('P5') - semitones('A4')).toBe(1);
    expect(at(5, 6) - at(5, 0)).toBe(6);
    expect(at(5, 6) - at(6, 5)).toBe(6); // the two-string shape
    expect(noteAt({ string: 5, fret: 6 }, { octave: false, context: { prefer: 'sharps' } })).toBe('D#');
  });

  it('is spelled C-F# as an augmented fourth and C-Gb as a diminished fifth', () => {
    expect(transpose('C', 'A4')).toBe('F#');
    expect(transpose('C', 'd5')).toBe('Gb');
    expect(intervalName(intervalBetween('C', 'Gb'))).toBe('diminished fifth');
    expect(intervalName(intervalBetween('C', 'F#'))).toBe('augmented fourth');
  });
});

describe('intervals-1: listening questions', () => {
  it('each plays what its right answer says', () => {
    const listens = allExercises().filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');
    expect(listens.length).toBe(5);
    for (const q of listens) {
      const s = q.sound;
      if (s.kind !== 'interval') throw new Error('only interval sounds here');
      const answer = correct(q);
      const name = nameOf(s.interval);
      if (/harmonic|melodic/.test(answer)) expect(answer.includes('harmonic')).toBe(s.play === 'together');
      else if (/Saints/.test(answer)) expect(s.interval).toBe('M3');
      else if (answer === 'A tritone') expect(semitones(s.interval)).toBe(6);
      else expect(words(answer)).toBe(name);
      // What the synth plays really is that interval.
      const midi = soundPlan(s).events.flatMap((e) => e.midi);
      expect(Math.abs(midi[1] - midi[0])).toBe(semitones(s.interval));
    }
  });
});

describe('intervals-1: tunes you know', () => {
  const pitches = (notes: readonly TabNote[]): number[] => notes.flatMap((n) => ('rest' in n ? [] : [at(n.string, n.fret)]));
  const degrees = (notes: readonly TabNote[], tonic: string): string[] => pitches(notes).map((m) => degreeInScale(tonic, 'major', m % 12) ?? '?');

  it('are the traditional openings, in the right key', () => {
    expect(degrees(TUNES.frereJacques, 'A')).toEqual(['1', '2', '3', '1']);
    expect(degrees(TUNES.saints, 'A')).toEqual(['1', '3', '4', '5']);
    expect(degrees(TUNES.twinkle, 'A')).toEqual(['1', '1', '5', '5', '6', '6', '5']);
    // The Bridal Chorus and My Bonnie start on their 5th, below the tonic D.
    expect(degrees(TUNES.bridal, 'D')).toEqual(['5', '1', '1', '1']);
    expect(degrees(TUNES.bonnie, 'D')).toEqual(['5', '3', '2', '1']);
  });

  it('open with the interval each fact names', () => {
    const leap = (notes: readonly TabNote[], from = 0): number => pitches(notes)[from + 1] - pitches(notes)[from];
    expect(leap(TUNES.frereJacques)).toBe(semitones('M2'));
    expect(leap(TUNES.saints)).toBe(semitones('M3'));
    expect(leap(TUNES.bridal)).toBe(semitones('P4'));
    expect(leap(TUNES.twinkle, 0)).toBe(0); // "Twin-kle": the same note twice
    expect(leap(TUNES.twinkle, 1)).toBe(semitones('P5')); // then the leap, from the 2nd note to the 3rd
    expect(leap(TUNES.bonnie)).toBe(semitones('M6'));
    const facts = Object.fromEntries(lesson('intervals-by-ear').facts!.map((f) => [f.id, ascii(f.back)]));
    expect(facts['intervals-tune-twinkle']).toMatch(/perfect fifth/);
    expect(facts['intervals-tune-frere-jacques']).toMatch(/major second/);
    expect(facts['intervals-tune-saints']).toMatch(/major third/);
    expect(facts['intervals-tune-bridal']).toMatch(/perfect fourth/);
    expect(facts['intervals-tune-bonnie']).toMatch(/major sixth/);
  });

  it('the match pairs each tune with that interval', () => {
    const match = exercisesOf(lesson('intervals-by-ear').steps).find((e): e is MatchPairsExercise => e.type === 'match-pairs')!;
    const want: Record<string, string> = { 'Frère Jacques': 'M2', 'When the Saints': 'M3', 'Here Comes the Bride': 'P4', 'Twinkle Twinkle': 'P5', 'My Bonnie': 'M6' };
    for (const p of match.pairs) expect(ascii(p.right).toLowerCase()).toBe(nameOf(want[ascii(p.left)]));
  });

  it('the overview figure puts each first leap at the right fret of string 5', () => {
    const fig = cards(lesson('intervals-by-ear'))[0].figure as FretboardFigure;
    for (const d of fig.dots!.filter((x) => x.label !== 'R')) expect(at(5, d.fret) - at(5, 0)).toBe(semitones(d.label!));
  });
});

describe('intervals-1: intervals inside chords', () => {
  it('A is 1 3 5, Am is 1 b3 5 and a power chord is 1 5', () => {
    expect(chordNotes('A')).toEqual(['A', 'C#', 'E']);
    expect(chordNotes('Am')).toEqual(['A', 'C', 'E']);
    expect(getChordType('major')!.degrees).toEqual(['1', '3', '5']);
    expect(getChordType('minor')!.degrees).toEqual(['1', 'b3', '5']);
    expect(getChordType('5')!.degrees).toEqual(['1', '5']);
    expect(identifyFretted('x02220').symbol).toBe('A');
    expect(identifyFretted('x02210').symbol).toBe('Am');
    expect(identifyFretted('577xxx').symbol).toBe('A5');
  });

  it('the drawn open A and Am are those shapes, with the right formula numbers', () => {
    const [a, am] = cards(lesson('intervals-in-chords')).map((c) => c.figure as FretboardFigure);
    const shapeOf = (fig: FretboardFigure): string => [6, 5, 4, 3, 2, 1].map((s) => fig.dots!.find((d) => d.string === s)?.fret ?? 'x').join('');
    expect(shapeOf(a)).toBe('x02220');
    expect(shapeOf(am)).toBe('x02210');
    for (const fig of [a, am]) {
      for (const d of fig.dots!) expect(semitonesToDegree((((at(d.string, d.fret) - at(5, 0)) % 12) + 12) % 12), `${d.string}:${d.fret}`).toBe(d.degree);
    }
  });

  it('the formula-number questions', () => {
    const named = [...allExercises()].filter((e): e is FretboardNameExercise => e.type === 'fretboard-name');
    expect(named).toHaveLength(2);
    // Open A: string 4 fret 2 (E) over the open A is a perfect fifth, the 5.
    expect(at(4, 2) - at(5, 0)).toBe(7);
    // Open E: string 3 fret 1 (G#) over string 4 fret 2 (E) is a major third, the 3.
    expect(at(3, 1) - at(4, 2)).toBe(4);
    expect(chordNotes('E')).toEqual(['E', 'G#', 'B']);
  });
});

describe('intervals-1: on the go', () => {
  it('every lesson still teaches with Sound and Guitar off', () => {
    for (const l of unit.lessons) {
      const quiet = adaptLesson(l, { guitar: false, sound: false });
      expect(quiet.needsSound, l.id).toBe(false);
      const left = quiet.lesson.steps.filter((s) => 'generate' in s || s.type !== 'card');
      expect(left.length, `${l.id}: questions left without sound`).toBeGreaterThanOrEqual(4);
    }
  });

  it('every tune is still asked about without sound', () => {
    const quiet = adaptLesson(lesson('intervals-by-ear'), { guitar: false, sound: false }).lesson;
    const text = exercisesOf(quiet.steps).map((e) => JSON.stringify(e)).join(' ');
    for (const tune of ['Frère Jacques', 'When the Saints', 'Here Comes the Bride', 'Twinkle Twinkle', 'My Bonnie']) expect(text).toContain(tune);
  });
});

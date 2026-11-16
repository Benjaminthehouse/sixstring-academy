/**
 * Unit 14 of the Theory Path, cross-checked against the engines: every interval label on the neck
 * (size and spelling), the qualities, the spellings the text insists on, the inversions, the
 * compound sizes, the consonance categories, every fretboard answer and the listening questions.
 */
import { describe, expect, it } from 'vitest';
import {
  consonance, intervalBetween, interval, invertInterval, parseInterval, semitones, simplifyInterval, transpose,
} from '@/core/theory';
import { midiAt, noteAt } from '@/core/guitar';
import {
  estimateLessonSeconds, findTargets, fretboardNameSpec, formatProblems, plainText, soundPlan, validateCourse,
  type Exercise, type Figure, type FretboardFindExercise, type FretDot, type Lesson, type ListenChoiceExercise, type Step, type Unit,
} from '@/lessons';
import { assembleTheory } from '../index';
import unit from './intervals-2';

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const isExercise = (s: Step): s is Exercise => !('generate' in s) && s.type !== 'card';
/** Every literal exercise of the unit: lesson steps, play alternatives, fact asks and the checkpoint. */
function allExercises(u: Unit): Exercise[] {
  const out: Exercise[] = [];
  const add = (s: Step | undefined): void => {
    if (!s || !isExercise(s)) return;
    out.push(s);
    if ('alternative' in s && s.alternative) add(s.alternative as Step);
  };
  for (const l of u.lessons) {
    l.steps.forEach(add);
    for (const f of l.facts ?? []) add(f.ask as Step | undefined);
  }
  u.checkpoint?.steps?.forEach(add);
  return out;
}
/** Every figure on a card, an exercise or an option, in the unit. */
function allFigures(u: Unit): Figure[] {
  const out: Figure[] = [];
  for (const l of u.lessons) for (const s of l.steps) if (!('generate' in s) && s.figure) out.push(s.figure);
  for (const e of allExercises(u)) if (e.type === 'choice' || e.type === 'listen-choice') for (const o of e.options) if (o.figure) out.push(o.figure);
  return out;
}
const correctText = (e: Exercise): string => (e.type === 'choice' || e.type === 'listen-choice' ? plainText(e.options.find((o) => o.correct)?.text ?? '') : '');
const at = (string: number, fret: number) => midiAt({ string, fret });

/** This unit alone as a course, with prerequisites outside it dropped. */
function unitCourse() {
  const course = assembleTheory([unit]).course;
  const ids = new Set(unit.lessons.map((l) => l.id));
  const units = course.units
    .filter((u) => u.id === unit.id)
    .map((u) => ({ ...u, lessons: u.lessons.map((l) => ({ ...l, requires: (l.requires ?? []).filter((r) => ids.has(r)) })) }));
  return { ...course, units };
}

describe('intervals-2: the lesson engine accepts it', () => {
  it('has no problems on its own', () => {
    const problems = validateCourse(unitCourse());
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('plans about as long as each lesson takes', () => {
    for (const l of unit.lessons) expect(Math.abs(estimateLessonSeconds(l) / 60 - l.minutes), l.id).toBeLessThan(1.5);
  });

  it('starts every fact id with "interval-"', () => {
    const ids = unit.lessons.flatMap((l) => (l.facts ?? []).map((f) => f.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^interval-/);
  });
});

describe('intervals-2: the neck figures', () => {
  /** The root an interval dot is measured from: the nearest root on the same or a thicker string. */
  const rootFor = (d: FretDot, dots: readonly FretDot[]): FretDot | undefined =>
    dots.filter((r) => r.role === 'root' && r !== d && r.string >= d.string).sort((a, b) => a.string - b.string)[0];

  it('labels every dot with the interval it really makes above its root, spelled from the root', () => {
    let checked = 0;
    for (const f of allFigures(unit)) {
      if (f.kind !== 'fretboard') continue;
      const dots = f.dots ?? [];
      for (const d of dots) {
        if (!d.label || !parseInterval(d.label)) continue;
        const r = rootFor(d, dots)!;
        expect(r, `root for ${d.label}`).toBeDefined();
        expect(at(d.string, d.fret) - at(r.string, r.fret), `${d.label} at ${d.string}/${d.fret}`).toBe(semitones(d.label));
        expect(intervalBetween(r.note!, d.note!), `${r.note} to ${d.note}`).toBe(d.label);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(30);
  });

  it('names every pair of neighbouring strings that shares the shapes, and only those', () => {
    // Pairs a fourth apart (thicker string first): every pair but 3 and 2.
    const fourths = [[6, 5], [5, 4], [4, 3], [3, 2], [2, 1]].filter(([lo, hi]) => at(hi, 0) - at(lo, 0) === semitones('P4'));
    expect(fourths).toEqual([[6, 5], [5, 4], [4, 3], [2, 1]]);
    const card = lesson('adjacent-string-shapes').steps[0];
    if (isExercise(card) || 'generate' in card) throw new Error('expected the opening card');
    const tip = plainText(card.tip ?? '');
    const named = [...tip.matchAll(/(\d) and (\d)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    // The tip lists the other pairs (the card shows 6 and 5), then the exception.
    expect(named.slice(0, -1)).toEqual(fourths.slice(1));
    expect(named[named.length - 1]).toEqual([3, 2]);
    expect(at(2, 0) - at(3, 0)).toBe(semitones('M3'));
  });

  it('draws the shapes the text describes', () => {
    // Neighbouring strings from A on string 6 fret 5: frets 3..7 of string 5 are m3 M3 P4 A4 P5.
    expect([3, 4, 5, 6, 7].map((f) => at(5, f) - at(6, 5))).toEqual(['m3', 'M3', 'P4', 'A4', 'P5'].map(semitones));
    // One string between, from G on string 6 fret 3: frets 1..5 of string 4 are m6 M6 m7 M7 P8.
    expect([1, 2, 3, 4, 5].map((f) => at(4, f) - at(6, 3))).toEqual(['m6', 'M6', 'm7', 'M7', 'P8'].map(semitones));
    // The same holds from string 5 to string 3.
    expect([1, 2, 3, 4, 5].map((f) => at(3, f) - at(5, 3))).toEqual(['m6', 'M6', 'm7', 'M7', 'P8'].map(semitones));
    // Across G and B the same fret is a major third, so every shape gains a fret.
    for (const f of [0, 2, 5, 7]) expect(at(2, f) - at(3, f)).toBe(semitones('M3'));
    expect(at(2, 3) - at(3, 2)).toBe(semitones('P4'));
    expect(at(2, 5) - at(3, 2)).toBe(semitones('P5'));
    expect(at(2, 2) - at(3, 2)).toBe(semitones('M3')); // "string 2 at fret 2 is C#, a major third"
    expect(noteAt({ string: 2, fret: 2 }, { octave: false, context: { tonic: 'A', scale: 'major' } })).toBe(transpose('A', 'M3'));
    expect(transpose('A', 'M3')).toBe('C#');
    expect(at(2, 4) - at(3, 2)).toBe(semitones('A4')); // "two frets higher ... gives a tritone"
    expect(at(2, 8) - at(4, 5)).toBe(12); // the octave from string 4 to 2 is three frets up
    // Compound intervals from C on string 5 fret 3.
    expect(at(2, 3) - at(5, 3)).toBe(semitones('M9'));
    expect(at(1, 1) - at(5, 3)).toBe(semitones('P11'));
    expect(at(1, 5) - at(5, 3)).toBe(semitones('M13'));
  });
});

describe('intervals-2: names, spellings and rules', () => {
  it('names the intervals of the text as the engine does', () => {
    expect(intervalBetween('C', 'G')).toBe('P5');
    expect(intervalBetween('C', 'G#')).toBe('A5');
    expect(intervalBetween('C', 'Gb')).toBe('d5');
    expect(intervalBetween('C', 'Ab')).toBe('m6'); // "the minor sixth above C is Ab"
    expect(intervalBetween('E', 'Bb')).toBe('d5');
    expect(transpose('E', 'A4')).toBe('A#'); // "the augmented fourth above E is A#"
    expect(intervalBetween('D', 'Ab')).toBe('d5');
    expect(transpose('D', 'A4')).toBe('G#');
    expect(intervalBetween('C', 'D#')).toBe('A2');
    expect(intervalBetween('C', 'Eb')).toBe('m3');
    expect(semitones('A2')).toBe(semitones('m3'));
    expect(intervalBetween('E', 'G#')).toBe('M3');
    expect(intervalBetween('E', 'Ab')).toBe('d4');
    expect(intervalBetween('B', 'Eb')).toBe('d4'); // "B to Eb would be a diminished fourth"
    expect(intervalBetween('C', 'F#')).toBe('A4');
    expect(semitones('A4')).toBe(semitones('d5'));
    expect(semitones('M3')).toBe(semitones('d4'));
  });

  it('spells the typed answers by letter count', () => {
    const typed = allExercises(unit).filter((e) => e.type === 'type-answer');
    const expected: Record<string, string> = {
      'Type the note a major third above B.': transpose('B', 'M3'),
      'Type the note a minor third above F♯.': transpose('F#', 'm3'),
      'Type the note a major third above F♯.': transpose('F#', 'M3'),
    };
    expect(expected).toEqual({
      'Type the note a major third above B.': 'D#',
      'Type the note a minor third above F♯.': 'A',
      'Type the note a major third above F♯.': 'A#',
    });
    expect(typed.length).toBeGreaterThanOrEqual(4);
    for (const t of typed) {
      if (t.type !== 'type-answer') continue;
      expect(t.answer).toMatchObject({ kind: 'note', spelling: 'exact', value: expected[plainText(t.prompt)] });
    }
  });

  it('inverts as the rule says: nine, with qualities swapped', () => {
    const pairs: Array<[string, string]> = [['M3', 'm6'], ['P4', 'P5'], ['m2', 'M7'], ['A4', 'd5'], ['M2', 'm7'], ['m3', 'M6'], ['P5', 'P4'], ['d5', 'A4']];
    for (const [a, b] of pairs) {
      expect(invertInterval(a)).toBe(b);
      expect(interval(a).number + interval(b).number).toBe(9);
    }
    // Every match-pairs that pairs two interval symbols pairs inversions.
    for (const e of allExercises(unit)) {
      if (e.type !== 'match-pairs') continue;
      for (const p of e.pairs) {
        const l = /^\{i:([^}]+)\}$/.exec(String(p.left));
        const r = /^\{i:([^}]+)\}$/.exec(String(p.right));
        if (l && r) expect(invertInterval(l[1]), `${l[1]} / ${r[1]}`).toBe(r[1]);
      }
    }
    expect(intervalBetween('C', 'E')).toBe('M3');
    expect(intervalBetween('E3', 'C4')).toBe('m6');
  });

  it('gives compound intervals the sizes and simple intervals the text quotes', () => {
    expect(['M9', 'P11', 'M13'].map(semitones)).toEqual([14, 17, 21]);
    expect(['M9', 'P11', 'M13'].map(simplifyInterval)).toEqual(['M2', 'P4', 'M6']);
    expect(semitones('P8')).toBe(12);
    for (const e of allExercises(unit)) {
      if (e.type !== 'match-pairs') continue;
      for (const p of e.pairs) {
        const l = /^\{i:([^}]+)\}$/.exec(String(p.left));
        const r = /^(\d+) half steps$/.exec(String(p.right));
        if (l && r) expect(semitones(l[1]), l[1]).toBe(Number(r[1]));
      }
    }
    expect(transpose('C3', 'M13')).toBe('A4');
    expect(transpose('C3', 'P11')).toBe('F4');
    expect(transpose('C3', 'M9')).toBe('D4');
  });

  it('sorts consonances and dissonances as the engine does (the fourth aside)', () => {
    for (const i of ['P1', 'P8', 'P5']) expect(consonance(i), i).toBe('perfect');
    for (const i of ['M3', 'm3', 'M6', 'm6']) expect(consonance(i), i).toBe('imperfect');
    for (const i of ['m2', 'M2', 'm7', 'M7', 'A4', 'd5']) expect(consonance(i), i).toBe('dissonant');
    // The unit never files the fourth as consonant or dissonant in a question: it is the
    // classical exception, a consonance on its own but a dissonance above the bass.
    const q = lesson('consonance-and-dissonance').steps.find((s) => isExercise(s) && s.type === 'choice' && s.multiple);
    if (!q || !isExercise(q) || q.type !== 'choice') throw new Error('no multiple choice');
    for (const o of q.options) {
      const name = /\{i:([^}]+)\}/.exec(String(o.text))![1];
      expect(o.correct === true, name).toBe(consonance(name) === 'dissonant');
    }
  });
});

describe('intervals-2: the answers', () => {
  const exercises = allExercises(unit);

  it('has the right fret for every fretboard-find, and the one the text names when it names one', () => {
    const finds = exercises.filter((e): e is FretboardFindExercise => e.type === 'fretboard-find');
    expect(finds.length).toBeGreaterThanOrEqual(15);
    for (const f of finds) {
      const targets = findTargets(f);
      expect(targets.length, plainText(f.prompt)).toBeGreaterThan(0);
      if (!('interval' in f.find)) continue;
      for (const t of targets) expect(t.midi - at(f.find.from.string, f.find.from.fret)).toBe(semitones(f.find.interval));
      // "fret N" with "string N" in the explanation names the place to tap.
      const named = /string (\d), fret (\d+)/.exec(plainText(f.explain));
      if (named && f.strings) expect(targets.map((t) => `${t.string}/${t.fret}`)).toContain(`${named[1]}/${named[2]}`);
      if (f.strings) expect(targets, plainText(f.prompt)).toHaveLength(1);
    }
  });

  it('has the right interval for every fretboard-name, among its buttons', () => {
    const names = exercises.filter((e) => e.type === 'fretboard-name');
    expect(names.length).toBeGreaterThanOrEqual(5);
    for (const n of names) {
      if (n.type !== 'fretboard-name') continue;
      const spec = fretboardNameSpec(n)!;
      const size = at(n.position.string, n.position.fret) - at(n.root!.string, n.root!.fret);
      expect(semitones(String(spec.value))).toBe(size);
      expect(n.options).toContain(spec.value);
    }
  });

  it('plays in each listening question the interval its answer names', () => {
    const listens = exercises.filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');
    expect(listens.length).toBeGreaterThanOrEqual(5);
    for (const q of listens) {
      if (q.sound.kind !== 'interval') throw new Error('expected an interval sound');
      const midi = soundPlan(q.sound).events.flatMap((e) => e.midi);
      expect(midi[1] - midi[0]).toBe(semitones(q.sound.interval));
      const answer = correctText(q);
      if (answer.startsWith('Consonant')) expect(consonance(q.sound.interval)).not.toBe('dissonant');
      else if (answer.startsWith('Dissonant')) expect(consonance(q.sound.interval)).toBe('dissonant');
      else expect(answer).toBe(q.sound.interval);
    }
  });

  it('plays the phrases the prompts describe', () => {
    for (const l of unit.lessons) {
      for (const s of l.steps) {
        if (!isExercise(s) || s.type !== 'play-phrase') continue;
        const [a, b] = s.notes.map((n) => ('fret' in n ? at(n.string, n.fret) : -1));
        const alt = s.alternative as FretboardFindExercise;
        if (!('interval' in alt.find)) throw new Error('expected an interval alternative');
        expect(b - a, l.id).toBe(semitones(alt.find.interval));
        const first = s.notes[0];
        if (!('fret' in first)) throw new Error('a phrase starts with a note');
        expect(alt.find.from).toEqual({ string: first.string, fret: first.fret });
      }
    }
  });
});

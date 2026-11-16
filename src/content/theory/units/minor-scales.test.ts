/**
 * Unit 16 of the Theory Path, cross-checked against the engines: the spelling, steps and degrees
 * of the three minor scales, relative and parallel keys, minor key signatures, the chords the
 * raised 7th makes, every fret of the fifth-position figures and phrases, and what each listening
 * question plays.
 */
import { describe, expect, it } from 'vitest';
import { diatonicChords, getKey, getScale, intervalBetween, keySignature, keysWithSignature, parseNote, scaleMidi, scaleNotes, scalePcs, semitones } from '@/core/theory';
import { midiAt } from '@/core/guitar';
import {
  findTargets, formatProblems, plainText, resolveFigure, soundPlan, validateCourse, type CardStep, type ChoiceExercise, type Figure, type Exercise, type FillBlanksExercise,
  type FretboardFindExercise, type FretboardFigure, type Lesson, type ListenChoiceExercise, type MatchPairsExercise, type PlayPhraseExercise, type Step,
  type TabNote, type TrueFalseExercise, type TypeAnswerExercise,
} from '@/lessons';
import { THEORY_GLOSSARY } from '../glossary';
import unit from './minor-scales';

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const isExercise = (s: Step): s is Exercise => !('generate' in s) && s.type !== 'card';
const isCard = (s: Step): s is CardStep => !('generate' in s) && s.type === 'card';
const exercisesOf = (l: Lesson): Exercise[] => [
  ...l.steps.filter(isExercise),
  ...l.steps.filter(isExercise).flatMap((e) => ('alternative' in e && e.alternative && !('generate' in e.alternative) ? [e.alternative] : [])),
  ...(l.facts ?? []).map((f) => f.ask).filter((a): a is Exercise => !!a && !('generate' in a)),
];
const checkpoint = (): Exercise[] => (unit.checkpoint?.steps ?? []).filter(isExercise);
const all = (): Exercise[] => [...unit.lessons.flatMap(exercisesOf), ...checkpoint()];
const prompt = (e: Exercise): string => plainText('prompt' in e && e.prompt ? e.prompt : 'statement' in e ? e.statement : '');
function find<T extends Exercise>(list: Exercise[], type: T['type'], text: string): T {
  const hit = list.find((e) => e.type === type && prompt(e).includes(text));
  if (!hit) throw new Error(`no ${type} exercise with "${text}"`);
  return hit as T;
}
const right = (e: ChoiceExercise | ListenChoiceExercise): string => plainText(e.options.find((o) => o.correct)?.text ?? '');
const tags = (text: string): string[] => [...text.matchAll(/\{[nk]:([^}]+)\}/g)].map((m) => m[1]);
const keyName = (tag: string): string => /\{k:([^}]+)\}/.exec(tag)![1];
/** Frets of a string where a figure's derived (or hand-placed) dots sit. */
function fretsOn(figure: FretboardFigure, string: number): number[] {
  const resolved = resolveFigure(figure);
  if (!resolved || resolved.kind !== 'fretboard') throw new Error('not a fretboard');
  return resolved.dots.filter((d) => d.string === string).map((d) => d.fret).sort((a, b) => a - b);
}
const cardFigure = (l: string, title: string): Figure => {
  const c = lesson(l).steps.filter(isCard).find((s) => s.title === title);
  if (!c || !c.figure) throw new Error(`no card "${title}"`);
  return c.figure;
};
const tabMidi = (notes: TabNote[]): number[] => notes.flatMap((n) => ('string' in n ? [midiAt(n)] : []));
const pc = (n: string): number => parseNote(n)!.chroma;

describe('minor-scales: the unit on its own', () => {
  it('passes the lesson validator with no problems', () => {
    const problems = validateCourse({ id: 'theory-path', title: 'Theory Path', teacher: 'none', level: 'intermediate', units: [unit], glossary: [...THEORY_GLOSSARY] });
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('still asks at least four questions per lesson with Sound off (no listening, tapping along or ear drills)', () => {
    const heard = new Set(['listen-choice', 'tap-rhythm']);
    const earDrills = new Set(['higher-lower', 'interval-ear', 'chord-quality-ear', 'scale-ear', 'cadence-ear', 'rhythm-ear', 'rhythm-tap']);
    for (const l of unit.lessons) {
      const quiet = l.steps.filter((s) => ('generate' in s ? !earDrills.has(String(s.generate)) : s.type !== 'card' && !heard.has(s.type)));
      expect(quiet.length, l.id).toBeGreaterThanOrEqual(4);
    }
    const quietCheckpoint = (unit.checkpoint?.steps ?? []).filter((s) => ('generate' in s ? !earDrills.has(String(s.generate)) : !heard.has(s.type)));
    expect(quietCheckpoint.length).toBeGreaterThanOrEqual(6);
  });

  it('starts every fact id with "minor-scales"', () => {
    for (const f of unit.lessons.flatMap((l) => l.facts ?? [])) expect(f.id).toMatch(/^minor-scales-/);
  });
});

describe('minor-scales: natural minor', () => {
  it('has the steps, degrees and notes the lesson gives', () => {
    const minor = getScale('minor')!;
    expect(minor.stepPattern).toEqual(['W', 'H', 'W', 'W', 'H', 'W', 'W']);
    expect(minor.degrees).toEqual(['1', '2', 'b3', '4', '5', 'b6', 'b7']);
    expect(scaleNotes('A', 'minor')).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    const blank = find<FillBlanksExercise>(exercisesOf(lesson('natural-minor')), 'fill-blanks', 'step pattern');
    expect(plainText(blank.text).replace('___', blank.blanks[0] as string).split(/\s+/)).toEqual(minor.stepPattern);
    // Lowered against major: exactly the 3rd, 6th and 7th.
    const major = getScale('major')!;
    const lowered = minor.semitones.map((s, i) => (s < major.semitones[i] ? i + 1 : 0)).filter(Boolean);
    expect(lowered).toEqual([3, 6, 7]);
    expect(right(find<ChoiceExercise>(exercisesOf(lesson('natural-minor')), 'choice', 'lowered'))).toBe('The 3rd, 6th and 7th');
  });

  it('puts A natural minor at frets 0 2 3 5 7 8 10 12 of string 5', () => {
    const fig = cardFigure('natural-minor', 'Whole, half, whole, whole ...') as FretboardFigure;
    expect(fretsOn(fig, 5)).toEqual([0, 2, 3, 5, 7, 8, 10, 12]);
    const e = find<FretboardFindExercise>(exercisesOf(lesson('natural-minor')), 'fretboard-find', 'string 5');
    expect(findTargets(e).map((p) => p.fret).sort((a, b) => a - b)).toEqual([0, 2, 3, 5, 7, 8, 10, 12]);
    // The half steps are frets 2 to 3 and 7 to 8.
    expect(midiAt({ string: 5, fret: 3 }) - midiAt({ string: 5, fret: 2 })).toBe(1);
    expect(midiAt({ string: 5, fret: 8 }) - midiAt({ string: 5, fret: 7 })).toBe(1);
  });

  it('answers degree b6 of E natural minor with C, where E major has C sharp', () => {
    expect(scaleNotes('E', 'minor')).toEqual(['E', 'F#', 'G', 'A', 'B', 'C', 'D']);
    expect(scaleNotes('E', 'major')[5]).toBe('C#');
    expect(find<TypeAnswerExercise>(exercisesOf(lesson('natural-minor')), 'type-answer', 'E natural minor').answer.value).toBe(scaleNotes('E', 'minor')[5]);
    expect(find<TrueFalseExercise>(exercisesOf(lesson('natural-minor')), 'true-false', 'no sharps or flats').answer).toBe(true);
  });
});

describe('minor-scales: relative and parallel keys', () => {
  it('finds each relative minor on degree 6, three half steps below', () => {
    for (const t of ['C', 'G', 'D', 'F', 'A', 'Bb', 'E']) {
      const k = getKey(`${t} major`)!;
      expect(k.relative).toBe(`${k.scale[5]} minor`);
      expect((pc(t) - pc(k.scale[5]) + 12) % 12).toBe(3);
      expect([...scalePcs(t, 'major')].sort()).toEqual([...scalePcs(k.scale[5], 'minor')].sort());
      expect(getKey(k.relative)!.fifths).toBe(k.fifths);
    }
    expect(right(find<ChoiceExercise>(exercisesOf(lesson('relative-minor')), 'choice', 'relative minor of D major'))).toBe('B minor');
    expect(find<TypeAnswerExercise>(exercisesOf(lesson('relative-minor')), 'type-answer', 'F♯ minor').answer.value).toBe(getKey('F# minor')!.relative.split(' ')[0]);
    let pairs = 0;
    for (const e of all().filter((x): x is MatchPairsExercise => x.type === 'match-pairs' && prompt(x).includes('with its relative minor'))) {
      for (const p of e.pairs) {
        expect(getKey(keyName(String(p.left)))!.relative, String(p.left)).toBe(keyName(String(p.right)));
        pairs++;
      }
    }
    expect(pairs).toBe(7);
    expect(find<TrueFalseExercise>(exercisesOf(lesson('relative-minor')), 'true-false', 'G major and E minor').answer).toBe(true);
  });

  it('puts C at string 5 fret 3 and its relative A three frets lower; lights the A notes of the C major figure', () => {
    expect(midiAt({ string: 5, fret: 3 }) % 12).toBe(pc('C'));
    expect(findTargets(find<FretboardFindExercise>(exercisesOf(lesson('relative-minor')), 'fretboard-find', 'relative minor'))).toEqual([
      expect.objectContaining({ string: 5, fret: 0 }),
    ]);
    const fig = cardFigure('relative-minor', 'Same notes, new home') as FretboardFigure;
    const resolved = resolveFigure(fig);
    if (!resolved || resolved.kind !== 'fretboard') throw new Error('not drawn');
    expect(resolved.dots.every((d) => scalePcs('C', 'major').includes(d.midi % 12))).toBe(true);
    expect(resolved.dots.filter((d) => d.role === 'target').every((d) => d.note === 'A')).toBe(true);
    expect(midiAt({ string: 6, fret: 5 }) % 12).toBe(pc('A'));
  });

  it('spells C natural minor with three flats, the lowered notes where the figure lights them', () => {
    expect(scaleNotes('C', 'minor')).toEqual(['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb']);
    expect(getKey('C minor')!.signature.accidentals).toEqual(['Bb', 'Eb', 'Ab']);
    expect(find<FillBlanksExercise>(exercisesOf(lesson('parallel-minor')), 'fill-blanks', 'C natural minor').blanks.map((b) => tags(String(b))[0])).toEqual(['Eb', 'Ab', 'Bb']);
    const fig = cardFigure('parallel-minor', 'Same tonic, other notes') as FretboardFigure;
    const resolved = resolveFigure(fig);
    if (!resolved || resolved.kind !== 'fretboard') throw new Error('not drawn');
    expect(resolved.dots.map((d) => d.midi).sort((a, b) => a - b)).toEqual(scaleMidi(48, 'minor', 1));
    expect(resolved.dots.filter((d) => d.role === 'target').map((d) => d.note).sort()).toEqual(['Ab', 'Bb', 'Eb']);
    expect(getKey('G major')!.parallel).toBe('G minor');
    expect(right(find<ChoiceExercise>(exercisesOf(lesson('parallel-minor')), 'choice', 'parallel minor of G major'))).toBe('G minor');
    expect(right(find<ChoiceExercise>(checkpoint(), 'choice', 'parallel minor of D major'))).toBe('D minor');
  });

  it('matches relative and parallel minors of C and G', () => {
    const m = find<MatchPairsExercise>(exercisesOf(lesson('parallel-minor')), 'match-pairs', 'description');
    for (const p of m.pairs) {
      const [, kind, tonic] = /^(Relative|Parallel) minor of ([A-G])$/.exec(plainText(p.left))!;
      const k = getKey(`${tonic} major`)!;
      expect(keyName(String(p.right))).toBe(kind === 'Relative' ? k.relative : k.parallel);
    }
  });

  it('plays D natural minor, then D major, in the parallel listening question', () => {
    const q = exercisesOf(lesson('parallel-minor')).find((e): e is ListenChoiceExercise => e.type === 'listen-choice')!;
    const notes = soundPlan(q.sound).events.map((e) => e.midi[0]);
    expect(notes.slice(0, 8)).toEqual(scaleMidi(50, 'minor', 1));
    expect(notes.slice(8)).toEqual(scaleMidi(50, 'major', 1));
    expect(right(q)).toBe('The first');
    const card = cardFigure('parallel-minor', 'Hear the difference');
    const heard = card.kind === 'audio' ? soundPlan(card.sound).events.map((e) => e.midi[0]) : [];
    expect(heard).toEqual([...scaleMidi(48, 'major', 1), ...scaleMidi(48, 'minor', 1)]);
  });
});

describe('minor-scales: minor key signatures', () => {
  it('gives each minor key the signature the lesson claims', () => {
    const quoted: Record<string, number> = { A: 0, E: 1, B: 2, 'F#': 3, 'C#': 4, D: -1, G: -2, C: -3, F: -4, Eb: -6 };
    for (const [t, n] of Object.entries(quoted)) expect(getKey(`${t} minor`)!.fifths, t).toBe(n);
    let pairs = 0;
    for (const e of all().filter((x): x is MatchPairsExercise => x.type === 'match-pairs' && prompt(x).includes('signature'))) {
      for (const p of e.pairs) {
        const [, count, kind] = /^(\d) (sharp|flat)s?$/.exec(plainText(p.left))!;
        expect(getKey(keyName(String(p.right)))!.fifths, String(p.right)).toBe(Number(count) * (kind === 'sharp' ? 1 : -1));
        pairs++;
      }
    }
    expect(pairs).toBe(4);
    const sig = exercisesOf(lesson('minor-key-signatures'));
    expect(right(find<ChoiceExercise>(sig, 'choice', 'two sharps'))).toBe('B minor');
    expect(right(find<ChoiceExercise>(sig, 'choice', 'three flats'))).toBe('C minor');
    expect(right(find<ChoiceExercise>(checkpoint(), 'choice', 'three sharps'))).toBe('F♯ minor');
    // The method: find the major key of the signature, go down a minor third; it works for all 15 signatures.
    for (let f = -7; f <= 7; f++) {
      const { major, minor } = keysWithSignature(f);
      expect(minor.fifths).toBe(f);
      expect((pc(major.tonic) - pc(minor.tonic) + 12) % 12, `${f}`).toBe(3);
      expect(minor.signature.accidentals).toEqual(keySignature(f).accidentals);
    }
    expect(getKey('G major')!.relative).toBe('E minor');
    expect(getKey('Bb major')!.relative).toBe('G minor');
    expect(getKey('Eb major')!.relative).toBe('C minor');
    expect(getKey('D major')!.relative).toBe('B minor');
  });

  it('plays a one-sharp melody that comes to rest on E', () => {
    const q = exercisesOf(lesson('minor-key-signatures')).find((e): e is ListenChoiceExercise => e.type === 'listen-choice')!;
    const notes = soundPlan(q.sound).events.map((e) => e.midi[0]);
    expect(notes.every((m) => scalePcs('E', 'minor').includes(m % 12))).toBe(true);
    expect(notes.some((m) => m % 12 === pc('F#'))).toBe(true);
    expect(notes.at(-1)).toBe(parseNote('E3')!.midi);
    expect(right(q)).toBe('On E: E minor');
    expect(midiAt({ string: 6, fret: 0 }) % 12).toBe(pc('E'));
    expect(midiAt({ string: 6, fret: 3 }) % 12).toBe(pc('G'));
  });
});

describe('minor-scales: harmonic and melodic minor', () => {
  it('spells harmonic minor with a raised 7th and an augmented second from b6 to 7', () => {
    expect(getScale('harmonic-minor')!.degrees).toEqual(['1', '2', 'b3', '4', '5', 'b6', '7']);
    expect(scaleNotes('A', 'harmonic-minor')).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G#']);
    expect(intervalBetween('F', 'G#')).toBe('A2');
    expect(semitones('A2')).toBe(3);
    const fig = cardFigure('harmonic-minor', 'Raise the 7th') as FretboardFigure;
    expect(fretsOn(fig, 5)).toEqual([0, 2, 3, 5, 7, 8, 11, 12]);
    expect(right(find<ChoiceExercise>(exercisesOf(lesson('harmonic-minor')), 'choice', 'half steps'))).toBe('3');
    expect(find<TypeAnswerExercise>(exercisesOf(lesson('harmonic-minor')), 'type-answer', 'D harmonic minor').answer.value).toBe(scaleNotes('D', 'harmonic-minor')[6]);
    expect(scaleNotes('D', 'minor')).toEqual(['D', 'E', 'F', 'G', 'A', 'Bb', 'C']);
    expect(find<TypeAnswerExercise>(checkpoint(), 'type-answer', 'E harmonic minor').answer.value).toBe(scaleNotes('E', 'harmonic-minor')[6]);
    expect(find<FillBlanksExercise>(exercisesOf(lesson('harmonic-minor')), 'fill-blanks', 'A harmonic minor').blanks.map((b) => tags(String(b))[0])).toEqual(['F', 'G#']);
  });

  it('turns the chord on degree 5 from Em into E, drawn as 022100 against 022000', () => {
    expect(diatonicChords('A minor')[4].symbol).toBe('Em');
    expect(diatonicChords('A minor', { minor: 'harmonic' })[4].symbol).toBe('E');
    const box = cardFigure('harmonic-minor', 'A leading tone and a major V');
    if (box.kind !== 'chord') throw new Error('not a chord box');
    const e = resolveFigure(box);
    if (!e) throw new Error('not drawn');
    expect(e.notes.map((n) => n.note)).toEqual(['E', 'B', 'E', 'G#', 'B', 'E']);
    expect(midiAt({ string: 3, fret: 1 }) % 12).toBe(pc('G#'));
    expect(midiAt({ string: 3, fret: 0 }) % 12).toBe(pc('G'));
    expect(right(find<ChoiceExercise>(exercisesOf(lesson('harmonic-minor')), 'choice', 'degree 5'))).toBe('Turns Em into E');
  });

  it('plays D harmonic minor in the listening question, with Bb up to C# near the top', () => {
    const q = exercisesOf(lesson('harmonic-minor')).find((e): e is ListenChoiceExercise => e.type === 'listen-choice')!;
    const notes = soundPlan(q.sound).events.map((e) => e.midi[0]);
    expect(notes).toEqual(scaleMidi(parseNote('D3')!.midi!, 'harmonic-minor', 1));
    expect(notes[6] - notes[5]).toBe(3);
    expect(notes[7] - notes[6]).toBe(1);
    expect(right(q)).toBe('Harmonic minor');
  });

  it('spells melodic minor as major with a flat 3rd, on string 5 with no gap wider than two frets', () => {
    const melodic = getScale('melodic-minor')!;
    expect(melodic.degrees).toEqual(['1', '2', 'b3', '4', '5', '6', '7']);
    expect(scaleNotes('A', 'melodic-minor')).toEqual(['A', 'B', 'C', 'D', 'E', 'F#', 'G#']);
    const major = getScale('major')!;
    expect(melodic.degrees.filter((d, i) => d !== major.degrees[i])).toEqual(['b3']);
    expect(right(find<ChoiceExercise>(exercisesOf(lesson('melodic-minor')), 'choice', 'differs from the major scale'))).toBe('The 3rd');
    const frets = fretsOn(cardFigure('melodic-minor', 'Raise the 6th as well') as FretboardFigure, 5);
    expect(frets).toEqual([0, 2, 3, 5, 7, 9, 11, 12]);
    expect(Math.max(...frets.slice(1).map((f, i) => f - frets[i]))).toBe(2);
    const melodicBlanks = all().filter((x): x is FillBlanksExercise => x.type === 'fill-blanks' && prompt(x).includes('A melodic minor'));
    expect(melodicBlanks).toHaveLength(2);
    for (const e of melodicBlanks) expect(e.blanks.map((b) => tags(String(b))[0])).toEqual(['F#', 'G#']);
  });

  it('plays melodic minor up and natural minor down on the classical card', () => {
    const card = cardFigure('melodic-minor', 'Up one way, down another');
    const notes = card.kind === 'audio' ? soundPlan(card.sound).events.map((e) => e.midi[0]) : [];
    expect(notes.slice(0, 8)).toEqual(scaleMidi(45, 'melodic-minor', 1));
    expect(notes.slice(7)).toEqual([...scaleMidi(45, 'minor', 1)].reverse());
  });

  it('matches each minor with its top three degrees, and plays melodic minor when that is the answer', () => {
    const m = find<MatchPairsExercise>(exercisesOf(lesson('melodic-minor')), 'match-pairs', 'top three');
    const ids: Record<string, string> = { 'Natural minor': 'minor', 'Harmonic minor': 'harmonic-minor', 'Melodic minor': 'melodic-minor' };
    for (const p of m.pairs) {
      const degrees = [...String(p.right).matchAll(/\{d:([^}]+)\}/g)].map((x) => x[1]);
      expect(degrees).toEqual(getScale(ids[plainText(p.left)])!.degrees.slice(4));
    }
    const q = exercisesOf(lesson('melodic-minor')).find((e): e is ListenChoiceExercise => e.type === 'listen-choice')!;
    expect(soundPlan(q.sound).events.map((e) => e.midi[0])).toEqual(scaleMidi(45, 'melodic-minor', 1));
    expect(right(q)).toBe('Melodic minor');
    // The checkpoint's formula question.
    const formula = find<ChoiceExercise>(checkpoint(), 'choice', 'degrees make up natural minor');
    const degreesOf = (text: string) => [...text.matchAll(/\{d:([^}]+)\}/g)].map((x) => x[1]);
    expect(degreesOf(String(formula.options.find((o) => o.correct)!.text))).toEqual(getScale('minor')!.degrees);
  });
});

describe('minor-scales: A minor in fifth position', () => {
  const position: [number, number] = [4, 8];
  const naturalPcs = scalePcs('A', 'minor');

  it('is box 1 of A minor pentatonic plus B and F', () => {
    expect(scaleNotes('A', 'minor-pentatonic')).toEqual(['A', 'C', 'D', 'E', 'G']);
    expect(scaleNotes('A', 'minor').filter((n) => !scaleNotes('A', 'minor-pentatonic').includes(n))).toEqual(['B', 'F']);
    expect(getScale('minor')!.degrees[1]).toBe('2');
    expect(getScale('minor')!.degrees[5]).toBe('b6');
    const fig = cardFigure('minor-in-fifth-position', 'Fifth position') as FretboardFigure;
    const resolved = resolveFigure(fig);
    if (!resolved || resolved.kind !== 'fretboard') throw new Error('not drawn');
    const added = resolved.dots.filter((d) => d.role === 'target').map((d) => `${d.string}:${d.fret}:${d.note}`).sort();
    expect(added).toEqual(['1:7:B', '2:6:F', '3:4:B', '5:8:F', '6:7:B']);
    // Every A natural minor note in frets 4 to 8 is on the figure, and nothing else.
    const drawn = resolved.dots.map((d) => `${d.string}:${d.fret}`).sort();
    const expected: string[] = [];
    for (let s = 1; s <= 6; s++) for (let f = position[0]; f <= position[1]; f++) if (naturalPcs.includes(midiAt({ string: s, fret: f }) % 12)) expected.push(`${s}:${f}`);
    expect(drawn).toEqual(expected.sort());
    expect(right(find<ChoiceExercise>(exercisesOf(lesson('minor-in-fifth-position')), 'choice', 'two notes'))).toBe('B and F');
  });

  it('finds the added Fs and Bs where the text says', () => {
    const where = (text: string) =>
      findTargets(find<FretboardFindExercise>(exercisesOf(lesson('minor-in-fifth-position')), 'fretboard-find', text)).map((p) => `${p.string}:${p.fret}`).sort();
    expect(where('every F')).toEqual(['2:6', '5:8']);
    expect(where('every B')).toEqual(['1:7', '3:4', '6:7']);
    expect(findTargets(find<FretboardFindExercise>(checkpoint(), 'fretboard-find', 'every F')).map((p) => `${p.string}:${p.fret}`).sort()).toEqual(['2:6', '5:8']);
  });

  it('climbs from string 6 fret 5 to string 1 fret 8 in the tab, one finger per fret, every note in A minor', () => {
    const fig = cardFigure('minor-in-fifth-position', 'Two strings at a time');
    if (fig.kind !== 'tab') throw new Error('not tab');
    const midi = tabMidi(fig.notes);
    expect(midi).toHaveLength(17);
    expect(midi[0]).toBe(parseNote('A2')!.midi);
    expect(midi.at(-1)).toBe(parseNote('C5')!.midi);
    expect(midi.every((m, i) => i === 0 || m > midi[i - 1])).toBe(true);
    expect(midi.every((m) => naturalPcs.includes(m % 12))).toBe(true);
    expect(new Set(midi.map((m) => m % 12)).size).toBe(7);
    expect(fig.notes.every((n) => 'string' in n && n.fret >= position[0] && n.fret <= position[1])).toBe(true);
    // Only the B on string 3 leaves the four frets 5 to 8.
    expect(fig.notes.filter((n) => 'string' in n && n.fret === 4).map((n) => ('string' in n ? n.string : 0))).toEqual([3]);
  });

  it('plays the climb in three parts, two strings at a time, each part matched by its tapping alternative', () => {
    const phrases = lesson('minor-in-fifth-position').steps.filter(isExercise).filter((s): s is PlayPhraseExercise => s.type === 'play-phrase');
    expect(phrases.map((p) => [...new Set(p.notes.map((n) => ('string' in n ? n.string : 0)))])).toEqual([[6, 5], [4, 3], [2, 1]]);
    const fig = cardFigure('minor-in-fifth-position', 'Two strings at a time');
    if (fig.kind !== 'tab') throw new Error('not tab');
    expect(phrases.flatMap((p) => tabMidi(p.notes))).toEqual(tabMidi(fig.notes));
    for (const p of phrases) {
      // A play step draws its phrase as tab; six notes or fewer fit a 360 px phone.
      expect(p.notes.length).toBeLessThanOrEqual(6);
      const alt = p.alternative as FretboardFindExercise;
      const targets = findTargets(alt).map((t) => `${t.string}:${t.fret}`).sort();
      expect(targets).toEqual(p.notes.map((n) => ('string' in n ? `${n.string}:${n.fret}` : '')).sort());
    }
  });
});

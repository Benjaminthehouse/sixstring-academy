/**
 * Unit 11 of the Theory Path, cross-checked against the engines: the step pattern is the major
 * scale's own (`getScale`), every spelled scale is `scaleNotes`', every line along one string lands
 * on that scale's frets, the one-octave shape and its fingering are the guitar engine's E-shape
 * pattern from root to root (moved, it names the scale its root names), the degrees and the leading
 * tone sit where the text says, the phrases end where the questions say, and major pentatonic is
 * the major scale without 4 and 7, with the notes of the relative minor pentatonic. Each lesson also
 * still teaches "on the go", with Sound and Guitar off.
 */
import { describe, expect, it } from 'vitest';
import { midiAt, noteAt, rootToRoot, scalePatterns } from '@/core/guitar';
import { degreeInScale, getScale, pcName, scaleNotes, scalePcs, semitonesToDegree } from '@/core/theory';
import {
  findTargets, formatProblems, plainText, soundPlan, validateCourse,
  type CardStep, type ChoiceExercise, type Exercise, type FillBlanksExercise, type FretboardFigure, type FretboardFindExercise,
  type FretboardNameExercise, type Lesson, type ListenChoiceExercise, type PlayPhraseExercise, type Step, type TabNote, type TypeAnswerExercise,
} from '@/lessons';
import { adaptLesson } from '@/features/learn/model/conditions';
import { assembleTheory } from '../index';
import unit, { A_SHAPE, C_ON_5, C_PENTATONIC_ON_5, G_ON_6, G_SHAPE, PHRASE_HANGING, PHRASE_ON_A, PHRASE_ON_C } from './major-scale';

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
const pitches = (notes: readonly TabNote[]): number[] => notes.flatMap((n) => ('rest' in n ? [] : [at(n.string, n.fret)]));
const key = (p: { string: number; fret: number }): string => `${p.string}:${p.fret}`;
const STEP_LETTER: Record<number, string> = { 1: 'H', 2: 'W' };

/** This unit alone, as the registry assembles it; prerequisites outside it are theory.test.ts's to check. */
function unitCourse() {
  const course = assembleTheory([unit]).course;
  const ids = new Set(unit.lessons.map((l) => l.id));
  const units = course.units
    .filter((u) => u.id === unit.id)
    .map((u) => ({ ...u, lessons: u.lessons.map((l) => ({ ...l, requires: (l.requires ?? []).filter((r) => ids.has(r)) })) }));
  return { ...course, units };
}

describe('major-scale: the engine accepts the unit on its own', () => {
  it('has no errors and no warnings', () => {
    const problems = validateCourse(unitCourse());
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with "major-scale-"', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^major-scale-/);
  });
});

describe('major-scale: the step pattern', () => {
  const PATTERN = getScale('major')!.steps.map((s) => STEP_LETTER[s]).join(' ');

  it('is W W H W W W H, with half steps after notes 3 and 7', () => {
    expect(PATTERN).toBe('W W H W W W H');
    expect(lesson('the-step-pattern').facts![0].back).toContain(PATTERN);
    const fill = exercisesOf(lesson('the-step-pattern').steps).find((e): e is FillBlanksExercise => e.type === 'fill-blanks')!;
    let b = 0;
    expect(ascii(fill.text).split(/\s+/).map((t) => (t.startsWith('_') ? ascii(fill.blanks[b++]) : t)).join(' ')).toBe(PATTERN);
    expect(getScale('major')!.steps.flatMap((s, i) => (s === 1 ? [i + 1] : []))).toEqual([3, 7]);
  });

  it('puts C major on string 5 and G major on string 6 at frets 3 5 7 8 10 12 14 15', () => {
    const climb = (start: number) => getScale('major')!.steps.reduce((frets, s) => [...frets, frets[frets.length - 1] + s], [start]);
    expect([...C_ON_5]).toEqual(climb(3));
    expect([...G_ON_6]).toEqual(climb(3));
    expect(C_ON_5.map((f) => pcName(noteAt({ string: 5, fret: f }, { context: { tonic: 'C', scale: 'major' } })))).toEqual([...scaleNotes('C', 'major'), 'C']);
    expect(G_ON_6.map((f) => pcName(noteAt({ string: 6, fret: f }, { context: { tonic: 'G', scale: 'major' } })))).toEqual([...scaleNotes('G', 'major'), 'G']);
    expect(C_ON_5.join(', ')).toBe('3, 5, 7, 8, 10, 12, 14, 15');
  });

  it('plays exactly those lines, and the tapping versions find exactly those frets', () => {
    const phrases = allExercises().filter((e): e is PlayPhraseExercise => e.type === 'play-phrase');
    const [onC, onG] = phrases;
    expect(pitches(onC.notes)).toEqual(C_ON_5.map((f) => at(5, f)));
    expect(pitches(onG.notes)).toEqual(G_ON_6.map((f) => at(6, f)));
    for (const [p, frets] of [[onC, C_ON_5], [onG, G_ON_6]] as const) {
      const alt = p.alternative as FretboardFindExercise;
      expect(findTargets(alt).map((t) => t.fret).sort((a, b) => a - b)).toEqual([...frets]);
    }
  });

  it('the half step from E is fret 8 on string 5', () => {
    expect(noteAt({ string: 5, fret: 7 }, { octave: false })).toBe('E');
    expect(noteAt({ string: 5, fret: 8 }, { octave: false })).toBe('F');
  });
});

describe('major-scale: degrees', () => {
  it('the degree figure, the degree questions and do re mi', () => {
    const fig = cards(lesson('scale-degrees'))[0].figure as FretboardFigure;
    for (const d of fig.dots!) expect(degreeInScale('C', 'major', pcName(d.note!))).toBe(d.degree);
    expect(scaleNotes('C', 'major')[4]).toBe('G'); // degree 5 of C major
    expect(degreeInScale('C', 'major', 'F')).toBe('4');
    expect(scaleNotes('G', 'major')[5]).toBe('E'); // the checkpoint: degree 6 of G major
    const named = exercisesOf(lesson('scale-degrees').steps).find((e): e is FretboardNameExercise => e.type === 'fretboard-name')!;
    expect(semitonesToDegree(at(named.position.string, named.position.fret) - at(named.root!.string, named.root!.fret))).toBe('6');
    const SOLFEGE = ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti'];
    for (const m of allExercises().filter((e) => e.type === 'match-pairs' && /syllable/.test(String(e.prompt)))) {
      if (m.type !== 'match-pairs') continue;
      for (const p of m.pairs) expect(SOLFEGE[Number(ascii(p.left).replace('Degree ', '')) - 1]).toBe(ascii(p.right));
    }
  });
});

describe('major-scale: spelling major scales', () => {
  it('C, G, D, F and A major as the text spells them', () => {
    expect(scaleNotes('C', 'major')).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
    expect(scaleNotes('G', 'major')).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F#']);
    expect(scaleNotes('D', 'major')).toEqual(['D', 'E', 'F#', 'G', 'A', 'B', 'C#']);
    expect(scaleNotes('F', 'major')).toEqual(['F', 'G', 'A', 'Bb', 'C', 'D', 'E']);
    expect(scaleNotes('A', 'major')).toEqual(['A', 'B', 'C#', 'D', 'E', 'F#', 'G#']);
    const facts = unit.lessons.flatMap((l) => l.facts ?? []);
    const back = (id: string) => ascii(facts.find((f) => f.id === id)!.back);
    expect(back('major-scale-g-notes')).toBe('G A B C D E F# G');
    expect(back('major-scale-d-notes')).toMatch(/^D E F# G A B C# D/);
    expect(back('major-scale-f-notes')).toMatch(/^F G A Bb C D E F/);
  });

  it('every fill-in of a major scale completes it exactly, and its bank holds only wrong names', () => {
    const fills = allExercises().filter((e): e is FillBlanksExercise => e.type === 'fill-blanks' && /Complete \{n:[A-G]#?b?\} major\./.test(String(e.prompt)));
    expect(fills.length).toBe(3);
    for (const f of fills) {
      const tonic = /\{n:([A-G][#b]?)\}/.exec(String(f.prompt))![1];
      const scale = [...scaleNotes(tonic, 'major'), tonic];
      let b = 0;
      const filled = ascii(f.text).split(/\s+/).map((t) => (t.startsWith('_') ? ascii(f.blanks[b++]) : t));
      expect(filled, tonic).toEqual(scale.slice(0, filled.length));
      for (const w of f.bank ?? []) expect(scale).not.toContain(ascii(w));
    }
  });

  it('the typed answers: the 7th of A major and the 4th of F major', () => {
    const typed = allExercises().filter((e): e is TypeAnswerExercise => e.type === 'type-answer');
    expect(typed.map((t) => t.answer.value)).toEqual([scaleNotes('A', 'major')[6], scaleNotes('F', 'major')[3]]);
  });

  it('the D major choices: one right spelling, one enharmonic look-alike, one wrong', () => {
    const qs = allExercises().filter((e): e is ChoiceExercise => e.type === 'choice' && /Which of these is \{n:D\} major/.test(String(e.prompt)));
    expect(qs).toHaveLength(2);
    for (const q of qs) expect(correct(q).split(' ')).toEqual(scaleNotes('D', 'major'));
  });
});

describe('major-scale: the one-octave shape', () => {
  const eShape = (tonic: string) => scalePatterns(tonic, 'major').find((p) => p.shape === 'E')!;

  it('is the engine\'s E-shape pattern of G major from root to root, with its fingers', () => {
    const line = rootToRoot(eShape('G'), { octaves: 1 });
    expect(line.map(key)).toEqual(G_SHAPE.map(([s, f]) => `${s}:${f}`));
    expect(line.map((n) => n.finger)).toEqual(G_SHAPE.map(([, , , , finger]) => finger));
    expect(line.map((n) => n.note)).toEqual(G_SHAPE.map(([, , n]) => n));
    expect(line.map((n) => n.degree)).toEqual(G_SHAPE.map(([, , , d]) => d));
    // The middle finger plays the root; the hand covers frets 2 to 5.
    expect(G_SHAPE[0][4]).toBe(2);
    expect(Math.min(...G_SHAPE.map(([, f]) => f))).toBe(2);
    expect(Math.max(...G_SHAPE.map(([, f]) => f))).toBe(5);
    expect(lesson('one-octave-shape').facts![0].back).toBe('String 6 frets 3 and 5; string 5 frets 2, 3 and 5; string 4 frets 2, 4 and 5.');
  });

  it('moved two frets up it is A major, the engine\'s own shape there', () => {
    const line = rootToRoot(eShape('A'), { octaves: 1 });
    expect(line.map(key)).toEqual(A_SHAPE.map(([s, f]) => `${s}:${f}`));
    expect(line.map((n) => n.note)).toEqual(A_SHAPE.map(([, , n]) => n));
    expect(A_SHAPE.map(([s, f]) => `${s}:${f - 2}`)).toEqual(G_SHAPE.map(([s, f]) => `${s}:${f}`));
  });

  it('the root on string 6 names the scale: fret 5 A, 7 B, 8 C, 10 D', () => {
    expect([5, 7, 8, 10].map((f) => noteAt({ string: 6, fret: f }, { octave: false }))).toEqual(['A', 'B', 'C', 'D']);
  });

  it('plays up and back down the shape, and the tapping versions find the shape (plus degree 7 below)', () => {
    const play = exercisesOf(lesson('one-octave-shape').steps).find((e): e is PlayPhraseExercise => e.type === 'play-phrase')!;
    const up = G_SHAPE.map(([s, f]) => at(s, f));
    expect(pitches(play.notes)).toEqual([...up, ...up.slice(0, -1).reverse()]);
    const findG = play.alternative as FretboardFindExercise;
    expect(findTargets(findG).map(key).sort()).toEqual([...G_SHAPE.map(([s, f]) => `${s}:${f}`), '6:2'].sort());
    expect(noteAt({ string: 6, fret: 2 }, { octave: false })).toBe('F#');
    const findA = exercisesOf(lesson('one-octave-shape').steps).find((e): e is FretboardFindExercise => e.type === 'fretboard-find')!;
    expect(findTargets(findA).map(key).sort()).toEqual([...A_SHAPE.map(([s, f]) => `${s}:${f}`), '6:4'].sort());
    expect(noteAt({ string: 6, fret: 4 }, { octave: false, context: { tonic: 'A', scale: 'major' } })).toBe('G#');
  });
});

describe('major-scale: the major sound', () => {
  it('the leading tone of G major is F# at string 4, fret 4, a half step below G', () => {
    expect(scaleNotes('G', 'major')[6]).toBe('F#');
    expect(noteAt({ string: 4, fret: 4 }, { octave: false })).toBe('F#');
    expect(at(4, 5) - at(4, 4)).toBe(1);
    const find = exercisesOf(lesson('the-major-sound').steps).find((e): e is FretboardFindExercise => e.type === 'fretboard-find')!;
    expect(findTargets(find).map(key)).toEqual(['4:4']);
    expect(scaleNotes('C', 'major')[6]).toBe('B');
  });

  it('the "hanging" melody stays in G major and stops on the leading tone', () => {
    const p = pitches(PHRASE_HANGING);
    expect(p.every((m) => scalePcs('G', 'major').includes(m % 12))).toBe(true);
    expect(degreeInScale('G', 'major', p[p.length - 1] % 12)).toBe('7');
  });

  it('the "Stop on 7, then go home" sound stops on F# and then resolves to G', () => {
    const sound = cards(lesson('the-major-sound'))[1].figure;
    if (sound?.kind !== 'audio') throw new Error('audio card expected');
    const played = soundPlan(sound.sound).events.flatMap((e) => e.midi);
    expect(played.slice(0, 7)).toEqual(G_SHAPE.slice(0, 7).map(([s, f]) => at(s, f)));
    expect(played.slice(-2)).toEqual([at(4, 4), at(4, 5)]);
  });

  it('Twinkle Twinkle and Frere Jacques use only notes of the major scale', () => {
    const twinkle = ['C', 'C', 'G', 'G', 'A', 'A', 'G', 'F', 'F', 'E', 'E', 'D', 'D', 'C'];
    const frere = ['C', 'D', 'E', 'C', 'E', 'F', 'G', 'G', 'A', 'G', 'F', 'E', 'C'];
    const c = scaleNotes('C', 'major');
    expect([...twinkle, ...frere].every((n) => c.includes(n))).toBe(true);
  });

  it('the listening questions play what their right answers say', () => {
    const [hang, scale] = exercisesOf(lesson('the-major-sound').steps).filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');
    expect(correct(hang)).toMatch(/hanging/);
    expect(scale.sound.kind === 'scale' && scale.sound.scale).toBe('major');
    expect(correct(scale)).toBe('The major scale');
  });
});

describe('major-scale: major pentatonic', () => {
  it('is the major scale without degrees 4 and 7: C D E G A', () => {
    expect(getScale('major-pentatonic')!.degrees).toEqual(['1', '2', '3', '5', '6']);
    expect(scaleNotes('C', 'major-pentatonic')).toEqual(scaleNotes('C', 'major').filter((_n, i) => i !== 3 && i !== 6));
    expect(scaleNotes('C', 'major-pentatonic')).toEqual(['C', 'D', 'E', 'G', 'A']);
    expect([...scalePcs('C', 'major-pentatonic')].sort()).toEqual([...scalePcs('A', 'minor-pentatonic')].sort());
    const fill = exercisesOf(lesson('major-pentatonic').steps).find((e): e is FillBlanksExercise => e.type === 'fill-blanks')!;
    let b = 0;
    expect(ascii(fill.text).split(/\s+/).map((t) => (t.startsWith('_') ? ascii(fill.blanks[b++]) : t))).toEqual(scaleNotes('C', 'major-pentatonic'));
  });

  it('sits at frets 3, 5, 7, 10 and 12 on string 5, as the card says', () => {
    for (const [f, n, d] of C_PENTATONIC_ON_5) {
      expect(noteAt({ string: 5, fret: f }, { octave: false })).toBe(n);
      expect(degreeInScale('C', 'major', n)).toBe(d);
    }
    expect(plainText(cards(lesson('major-pentatonic'))[0].body)).toContain(`frets ${C_PENTATONIC_ON_5.slice(0, -1).map(([f]) => f).join(', ')} and 12`);
  });

  it('the Cs of box 1 are at 6:8, 3:5 and 1:8', () => {
    const find = exercisesOf(lesson('major-pentatonic').steps).find((e): e is FretboardFindExercise => e.type === 'fretboard-find')!;
    expect(findTargets(find).map(key).sort()).toEqual(['1:8', '3:5', '6:8']);
    const box = scalePatterns('A', 'minor-pentatonic')[0];
    const boxCs = box.notes.filter((n) => n.note === 'C').map(key).sort();
    expect(boxCs).toEqual(['1:8', '3:5', '6:8']);
  });

  it('the two phrases use only C D E G A; the first ends on A, the second on C', () => {
    const pent = scalePcs('C', 'major-pentatonic');
    for (const p of [PHRASE_ON_A, PHRASE_ON_C]) expect(pitches(p).every((m) => pent.includes(m % 12))).toBe(true);
    expect(pitches(PHRASE_ON_A).at(-1)! % 12).toBe(9);
    expect(pitches(PHRASE_ON_C).at(-1)! % 12).toBe(0);
    const q = exercisesOf(lesson('major-pentatonic').steps).find((e): e is ListenChoiceExercise => e.type === 'listen-choice')!;
    expect(correct(q)).toBe('The second phrase');
  });
});

describe('major-scale: on the go', () => {
  it('every lesson still teaches with Sound and Guitar off', () => {
    for (const l of unit.lessons) {
      const quiet = adaptLesson(l, { guitar: false, sound: false });
      expect(quiet.needsSound, l.id).toBe(false);
      const left = quiet.lesson.steps.filter((s) => 'generate' in s || s.type !== 'card');
      expect(left.length, `${l.id}: questions left without sound`).toBeGreaterThanOrEqual(4);
    }
  });
});

/**
 * Unit 2 of the Theory Path, cross-checked against the engines: the open strings and their octave
 * numbers, every fret the fifth-fret rule names, the places each fretboard question accepts, what
 * each listening question plays, and the answers the planned exercises expect.
 */
import { describe, expect, it } from 'vitest';
import { midiAt, noteAt, openStringMidi, tuning } from '@/core/guitar';
import { midiToFreq } from '@/core/math/pitch-math';
import { noteToMidi, pcName } from '@/core/theory';
import {
  findTargets, plainText, soundPlan, solve, grade,
  type Exercise, type ExerciseStep, type FretboardFindExercise, type Lesson, type ListenChoiceExercise, type Step,
} from '@/lessons';
import unit from './the-six-strings';

const STANDARD = tuning('standard');
/** Sounding open strings, string 6 first, as the engine knows them. */
const OPEN = STANDARD.notes;

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const literal = (s: Step | ExerciseStep): s is Exercise => !('generate' in s) && s.type !== 'card';
/** Every literal exercise of a lesson: its steps, the tapping alternatives, the facts' review questions. */
function exercisesOf(l: Lesson): Exercise[] {
  const out: Exercise[] = [];
  const add = (s: Step | ExerciseStep | undefined): void => {
    if (!s || !literal(s)) return;
    out.push(s);
    if ('alternative' in s) add(s.alternative);
  };
  l.steps.forEach(add);
  (l.facts ?? []).forEach((f) => add(f.ask));
  return out;
}
const checkpoint = (): Exercise[] => (unit.checkpoint?.steps ?? []).filter(literal);
const everything = (): Exercise[] => [...unit.lessons.flatMap(exercisesOf), ...checkpoint()];
const promptIs = (re: RegExp) => (e: Exercise): boolean => 'prompt' in e && re.test(plainText(e.prompt ?? ''));
const byPrompt = <T extends Exercise>(list: Exercise[], re: RegExp): T => {
  const hit = list.find(promptIs(re));
  if (!hit) throw new Error(`no exercise asks ${re}`);
  return hit as T;
};
const rightText = (e: { options: Array<{ text?: unknown; correct?: boolean }> }): string => plainText((e.options.find((o) => o.correct)?.text ?? '') as string);
const pos = (string: number, fret: number) => ({ string, fret });
const targets = (e: FretboardFindExercise): string[] => findTargets(e).map((p) => `${p.string}:${p.fret}`).sort();

describe('the-six-strings: the open strings', () => {
  it('quotes standard tuning as the engine has it', () => {
    expect(OPEN).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
    expect(STANDARD.midi).toEqual([40, 45, 50, 55, 59, 64]);
    expect(OPEN.map((n) => pcName(n)).join(' ')).toBe('E A D G B E');
    // String 1 the highest, string 6 the lowest: the pitches rise from string 6 to string 1.
    for (let s = 6; s > 1; s--) expect(openStringMidi(s - 1)).toBeGreaterThan(openStringMidi(s));
    // Strings 6 and 1 are both E, two octaves apart.
    expect(openStringMidi(1) - openStringMidi(6)).toBe(24);
  });

  it('labels every dot of the string-number picture with its own string', () => {
    const card = lesson('string-numbers').steps[0];
    if (!('type' in card) || card.type !== 'card' || card.figure?.kind !== 'fretboard') throw new Error('expected the fretboard card first');
    for (const dot of card.figure.dots ?? []) {
      expect(dot.label).toBe(String(dot.string));
      expect(noteToMidi(dot.note!)).toBe(midiAt(dot));
    }
  });

  it('orders the strings and names them as the engine does', () => {
    const order = exercisesOf(lesson('string-names')).find((e) => e.type === 'order')!;
    if (order.type !== 'order') throw new Error('order');
    expect(order.tiles.map((t) => plainText(t))).toEqual(OPEN.map((n) => pcName(n)));
    const ranked = exercisesOf(lesson('string-numbers')).find((e) => e.type === 'order')!;
    if (ranked.type !== 'order') throw new Error('order');
    // "From the highest-sounding to the lowest": string 1 first.
    const pitches = ranked.tiles.map((t) => openStringMidi(Number(plainText(t).replace('String ', ''))));
    expect([...pitches].sort((a, b) => b - a)).toEqual(pitches);
    const third = byPrompt<Exercise & { options: [] }>(exercisesOf(lesson('string-names')), /open string 3\?/);
    expect(rightText(third)).toBe(pcName(noteAt(pos(3, 0))));
    const fill = exercisesOf(lesson('string-names')).find((e) => e.type === 'fill-blanks')!;
    if (fill.type !== 'fill-blanks') throw new Error('fill');
    expect(fill.blanks.map((b) => plainText(b))).toEqual([pcName(noteAt(pos(4, 0))), pcName(noteAt(pos(2, 0)))]);
  });

  it('matches each string with its sounding pitch and octave number', () => {
    for (const e of everything()) {
      if (e.type !== 'match-pairs') continue;
      for (const p of e.pairs) {
        const n = Number(plainText(p.left).replace('String ', ''));
        expect(plainText(p.right)).toBe(OPEN[6 - n]);
      }
    }
    // The octave number goes up at C: B3 is followed by C4.
    expect(noteToMidi('C4') - noteToMidi('B3')).toBe(1);
    const next = byPrompt<Exercise & { options: [] }>(exercisesOf(lesson('using-a-tuner')), /just above/);
    expect(rightText(next)).toBe('C4');
  });

  it('plays the reference tone of the string being tuned', () => {
    const play = exercisesOf(lesson('using-a-tuner')).find((e) => e.type === 'play-note')!;
    if (play.type !== 'play-note' || play.figure?.kind !== 'audio') throw new Error('play-note with a reference');
    expect(soundPlan(play.figure.sound).events.flatMap((e) => e.midi)).toEqual([openStringMidi(5)]);
    expect(noteToMidi(play.note)).toBe(midiAt(play.where!));
  });
});

describe('the-six-strings: the fifth-fret rule', () => {
  it('holds on strings 6, 5, 4 and 2, and needs fret 4 on string 3', () => {
    for (const s of [6, 5, 4, 2]) expect(midiAt(pos(s, 5))).toBe(openStringMidi(s - 1));
    expect(midiAt(pos(3, 5))).not.toBe(openStringMidi(2));
    expect(midiAt(pos(3, 4))).toBe(openStringMidi(2));
    expect(pcName(noteAt(pos(6, 5)))).toBe('A');
    // The wrong options' reasons: string 3 at fret 5 is C, at fret 3 A sharp.
    expect(pcName(noteAt(pos(3, 5)))).toBe('C');
    expect(noteAt(pos(3, 3), { context: { prefer: 'sharps' }, octave: false })).toBe('A#');
  });

  it('draws each fretted dot on the note of the next open string', () => {
    const card = lesson('the-fifth-fret-rule').steps[0];
    if (!('type' in card) || card.type !== 'card' || card.figure?.kind !== 'fretboard') throw new Error('expected the fretboard card first');
    const fretted = (card.figure.dots ?? []).filter((d) => d.fret > 0);
    expect(fretted.map((d) => `${d.string}:${d.fret}`)).toEqual(['6:5', '5:5', '4:5', '3:4', '2:5']);
    for (const d of fretted) expect(midiAt(d)).toBe(openStringMidi(d.string - 1));
  });

  it('accepts only the matching fret in each tapping question', () => {
    const all = everything().filter((e): e is FretboardFindExercise => e.type === 'fretboard-find');
    expect(targets(byPrompt(all, /string 4 that matches open string 3/))).toEqual(['4:5']);
    expect(targets(byPrompt(all, /string 6 that matches open string 5/))).toEqual(['6:5']);
    expect(targets(byPrompt(all, /string 5 that matches open string 4/))).toEqual(['5:5']);
    expect(targets(byPrompt(all, /^Tap open string 4/))).toEqual(['4:0']);
    expect(targets(byPrompt(all, /^Tap open string 1/))).toEqual(['1:0']);
    expect(targets(byPrompt(all, /open D string/))).toEqual(['4:0']);
    const fret4 = byPrompt<Exercise & { options: [] }>(exercisesOf(lesson('the-fifth-fret-rule')), /string 3 matches open string 2/);
    expect(rightText(fret4)).toBe('Fret 4');
  });

  it('plays a unison, then two notes a fret apart that beat fast', () => {
    const [same, off] = exercisesOf(lesson('the-fifth-fret-rule')).filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');
    const heard = (e: ListenChoiceExercise) => soundPlan(e.sound).events.flatMap((ev) => ev.midi);
    expect(heard(same)).toEqual([midiAt(pos(6, 5)), openStringMidi(5)]);
    expect(rightText(same)).toMatch(/^Steady/);
    expect(heard(off)).toEqual([midiAt(pos(6, 4)), openStringMidi(5)]);
    expect(rightText(off)).toMatch(/^Wobbling/);
    // Played together they beat at the difference of their frequencies: about 6 times a second.
    expect(midiToFreq(45) - midiToFreq(44)).toBeGreaterThan(6);
    // Both sounds are plucked at once.
    for (const e of [same, off]) expect(soundPlan(e.sound).events).toHaveLength(1);
  });
});

describe('the-six-strings: up the neck', () => {
  it('names the high E and puts higher frets higher in pitch', () => {
    const name = exercisesOf(lesson('up-and-down-the-neck')).find((e) => e.type === 'fretboard-name')!;
    if (name.type !== 'fretboard-name') throw new Error('fretboard-name');
    expect(pcName(noteAt(name.position))).toBe('E');
    expect(grade(name, solve(name)).correct).toBe(true);
    expect(noteAt(pos(1, 12))).toBe('E5');
    expect(noteAt(pos(1, 5))).toBe('A4');
    for (let f = 1; f <= 12; f++) expect(midiAt(pos(1, f))).toBeGreaterThan(midiAt(pos(1, f - 1)));
  });
});

describe('the-six-strings: every exercise', () => {
  it('accepts its own answer, and play steps play where they say', () => {
    for (const e of everything()) {
      if (e.type === 'play-note') expect(noteToMidi(e.note), plainText(e.prompt)).toBe(midiAt(e.where!));
      if (e.type === 'play-note' || e.type === 'play-chord' || e.type === 'play-phrase' || e.type === 'flashcard') continue;
      expect(grade(e, solve(e)).correct, 'prompt' in e ? plainText(e.prompt ?? '') : '').toBe(true);
    }
  });

  it('names every fact after the unit', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^six-strings-/);
  });
});

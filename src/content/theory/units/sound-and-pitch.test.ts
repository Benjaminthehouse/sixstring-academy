/**
 * Unit 1 of the Theory Path, cross-checked against the engines: every frequency the text quotes,
 * the notes of each listening question, the octave shapes and the traditional tune's frets.
 */
import { describe, expect, it } from 'vitest';
import { midiToFreq } from '@/core/math/pitch-math';
import { readFileSync } from 'node:fs';
import { plainText, soundPlan, type Exercise, type Lesson, type ListenChoiceExercise, type PlayPhraseExercise, type Step } from '@/lessons';
import unit from './sound-and-pitch';

const OPEN = [64, 59, 55, 50, 45, 40]; // sounding MIDI of strings 1..6
const at = (string: number, fret: number): number => OPEN[string - 1] + fret;
const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const exercises = (l: Lesson): Exercise[] => l.steps.filter((s: Step): s is Exercise => !('generate' in s) && s.type !== 'card');
const listens = (l: Lesson): ListenChoiceExercise[] => exercises(l).filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');
const heard = (e: ListenChoiceExercise): number[] => soundPlan(e.sound).events.flatMap((ev) => ev.midi);
const answer = (e: ListenChoiceExercise): string => plainText(e.options.find((o) => o.correct)?.text ?? '');
const hz = (midi: number): number => Math.round(midiToFreq(midi) * 10) / 10;

describe('sound-and-pitch: the numbers it quotes', () => {
  it('gives the right frequencies', () => {
    expect(hz(40)).toBe(82.4); // open low E: "about 82 times a second (82.4 Hz)"
    expect(hz(45)).toBe(110); // open A string: "110 times a second"
    expect(hz(57)).toBe(220); // the A an octave above: "220 times"
    expect(Math.round(midiToFreq(64))).toBe(330); // open high E: "about 330"
    expect(Math.round(midiToFreq(52))).toBe(165); // E an octave above the low E: "about 165"
    expect(midiToFreq(64) / midiToFreq(40)).toBeCloseTo(4, 6); // string 1 "about four times as fast" as string 6
    expect(Math.round(midiToFreq(40) / 2)).toBe(41); // the checkpoint's octave below: "about 41"
  });

  it('says what the frets of string 1 sound', () => {
    expect(at(1, 3)).toBe(67); // fret 3 of string 1 is G4
    expect(at(5, 12)).toBe(57); // the octave above open string 5 is A3
    expect(at(4, 12)).toBe(62); // the octave above open string 4 is D4
    expect(at(6, 12)).toBe(52); // fret 12 of string 6 is E3
    // Fret 12 sits halfway: a string of length L stopped at fret 12 vibrates over L / 2.
    expect(2 ** (-12 / 12)).toBe(0.5);
  });
});

describe('sound-and-pitch: what each listening question plays', () => {
  it('pitch-high-and-low: low E then high E, so "Higher"', () => {
    const [q] = listens(lesson('pitch-high-and-low'));
    expect(heard(q)).toEqual([40, 64]);
    expect(answer(q)).toBe('Higher');
  });

  it('loud-is-not-high: the same A twice, then A to B', () => {
    const [same, changed] = listens(lesson('loud-is-not-high'));
    expect(heard(same)).toEqual([45, 45]);
    expect(answer(same)).toMatch(/^No: the same note/);
    expect(heard(changed)).toEqual([45, 47]);
    expect(answer(changed)).toBe('Yes: the second was higher');
  });

  it('the-octave: E to E an octave up is an octave; A to F sharp is not', () => {
    const [octave, sixth] = listens(lesson('the-octave'));
    const [a, b] = heard(octave);
    expect(b - a).toBe(12);
    expect(answer(octave)).toMatch(/^Yes/);
    const [c, d] = heard(sixth);
    expect([c, d]).toEqual([45, 54]); // A2 and F#3
    expect(answer(sixth)).toMatch(/^No/);
  });

  it('tone-colour: the same A3 on string 3 fret 2 and string 5 fret 12', () => {
    const [q] = listens(lesson('tone-colour'));
    expect(heard(q)).toEqual([57, 57]);
    expect(at(3, 2)).toBe(57);
    expect(at(5, 12)).toBe(57);
    expect(answer(q)).toMatch(/^Yes: the same note/);
  });
});

describe('sound-and-pitch: Hot Cross Buns', () => {
  const phrases = exercises(lesson('frets-shorten-the-string')).filter((e): e is PlayPhraseExercise => e.type === 'play-phrase');
  const notes = phrases.flatMap((p) => p.notes);

  it('plays the frets the syllabus gives, on string 1 only', () => {
    const plan = JSON.parse(readFileSync(new URL('../../plan/theory-path.json', import.meta.url), 'utf8')) as {
      course: { stages: Array<{ units: Array<{ id: string; lessons: Array<{ id: string; exercises: Array<{ type: string; idea: string }> }> }> }> };
    };
    const entry = plan.course.stages[0].units.find((u) => u.id === 'sound-and-pitch')!.lessons.find((l) => l.id.endsWith('/frets-shorten-the-string'))!;
    const idea = entry.exercises.find((e) => e.type === 'play-phrase')!.idea;
    const planned = idea.match(/frets ([\d ,]+)\./)![1].split(/[ ,]+/).filter(Boolean).map(Number);
    expect(planned).toEqual([4, 2, 0, 4, 2, 0, 0, 0, 0, 0, 2, 2, 2, 2, 4, 2, 0]);
    expect(notes.map((n) => ('fret' in n ? n.fret : -1))).toEqual(planned);
    expect(notes.every((n) => 'string' in n && n.string === 1)).toBe(true);
  });

  it('is in E major, stepping down mi re do, in four full bars of 4/4', () => {
    const pitches = notes.map((n) => ('fret' in n ? at(n.string, n.fret) : 0));
    expect([...new Set(pitches)].sort()).toEqual([64, 66, 68]); // E4, F#4, G#4
    const beats: Record<string, number> = { q: 1, h: 2, e: 0.5 };
    const lengths = notes.map((n) => beats[n.duration]);
    const bars: number[] = [];
    let sum = 0;
    for (const l of lengths) {
      sum += l;
      if (sum >= 4) {
        bars.push(sum);
        sum = 0;
      }
    }
    expect(bars).toEqual([4, 4, 4, 4]);
    expect(sum).toBe(0);
  });
});

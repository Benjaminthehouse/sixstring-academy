/**
 * Small courses and helpers shared by the lesson engine's own tests (not exported from the barrel).
 */
import { grade, solve, wrongAnswers } from './grade';
import { currentStep, reduceSession, type SessionAction, type SessionEffect, type SessionState } from './session';
import type { Answer, Course, Exercise, Lesson } from './types';

const explain = 'Because the engine says so.';

function lesson(id: string, unit: string, extra: Partial<Lesson> = {}): Lesson {
  return {
    id,
    title: `Lesson ${id}`,
    teaches: 'One idea.',
    minutes: 3,
    skill: `theory:${unit}:${id}`,
    steps: [
      { type: 'card', title: 'Idea', body: 'Each fret is one half step.' },
      { type: 'choice', id: 'q-choice', prompt: 'How many frets is a whole step?', options: [{ text: '1' }, { text: '2', correct: true }, { text: '3' }], shuffle: false, explain },
      { type: 'true-false', id: 'q-tf', statement: '{n:E} to {n:F} is one fret.', answer: true, explain },
      { generate: 'interval-name', id: 'q-gen' },
      { type: 'type-answer', id: 'q-type', prompt: 'How many half steps in an octave?', answer: { kind: 'number', value: 12 }, explain },
      { generate: 'step-up', id: 'q-gen2' },
    ],
    facts: [
      { id: `${id}-fact-a`, front: 'How far is one fret?', back: 'One half step.' },
      { id: `${id}-fact-b`, front: 'Half steps in an octave?', back: 'Twelve.', ask: { type: 'type-answer', prompt: 'How many half steps in an octave?', answer: { kind: 'number', value: 12 }, explain } },
    ],
    ...extra,
  };
}

/** A two-unit theory course with predictable steps. */
export const FIXTURE: Course = {
  id: 'fixture',
  title: 'Fixture',
  teacher: 'none',
  level: 'beginner',
  units: [
    {
      id: 'u1',
      title: 'Unit one',
      theme: 'basics',
      description: 'First things.',
      lessons: [lesson('a', 'u1'), lesson('b', 'u1'), lesson('c', 'u1')],
      checkpoint: {
        maxMistakes: 1,
        steps: [
          { type: 'true-false', statement: 'One fret is one half step.', answer: true, explain },
          { type: 'choice', prompt: 'Frets in a whole step?', options: [{ text: '2', correct: true }, { text: '4' }], explain },
          { generate: 'step-up' },
          { type: 'type-answer', prompt: 'Half steps in an octave?', answer: { kind: 'number', value: 12 }, explain },
        ],
      },
    },
    {
      id: 'u2',
      title: 'Unit two',
      theme: 'chords',
      description: 'Next things.',
      lessons: [lesson('d', 'u2'), lesson('e', 'u2', { requires: ['a'] })],
      checkpoint: { sample: 6 },
    },
  ],
};

/** The same lesson shape taught by a teacher: no hearts. */
export const TEACHER_FIXTURE: Course = {
  id: 'mia-fixture',
  title: 'Mia fixture',
  teacher: 'mia',
  level: 'beginner',
  units: [{ id: 'm1', title: 'Mia one', theme: 'basics', description: 'Hello.', lessons: [lesson('ma', 'm1', { skill: 'teacher:mia:ma' }), lesson('mb', 'm1', { skill: 'teacher:mia:mb' })] }],
};

/** A lesson with microphone exercises and a flashcard, for the swap and self-rating rules. */
export const PLAY_FIXTURE: Course = {
  id: 'play-fixture',
  title: 'Play fixture',
  teacher: 'none',
  level: 'beginner',
  units: [
    {
      id: 'p1',
      title: 'Play one',
      theme: 'fretboard',
      description: 'Make a sound.',
      lessons: [
        lesson('pa', 'p1', {
          steps: [
            { type: 'card', body: 'The open 5th string is {n:A}.' },
            {
              type: 'play-note', prompt: 'Play the open {n:A} string.', note: 'A2', octave: 'exact', explain,
              alternative: { type: 'fretboard-find', prompt: 'Tap the open {n:A} string.', find: { note: 'A2' }, mode: 'one', octave: 'exact', frets: [0, 3], explain },
            },
            { type: 'flashcard', front: 'Open 5th string?', back: '{n:A}' },
            { type: 'play-chord', prompt: 'Strum {c:Em}.', chord: 'Em', explain, alternative: { generate: 'chord-shape', params: { chords: ['Em'] } } },
            { generate: 'play-note', params: { strings: [6], frets: [0, 3] } },
            { type: 'true-false', statement: 'String 6 is the thickest.', answer: true, explain },
          ],
          facts: [],
        }),
        lesson('pb', 'p1'),
      ],
    },
  ],
};

/** A wrong answer for any exercise: one of its own distractors when it has any, else an answer of the right shape that is wrong. */
export function wrongFor(exercise: Exercise): Answer {
  const offered = wrongAnswers(exercise);
  if (offered.length > 0) return offered[0];
  switch (exercise.type) {
    case 'choice':
    case 'listen-choice':
      return { type: exercise.type, selected: [] };
    case 'true-false':
      return { type: 'true-false', value: !exercise.answer };
    case 'match-pairs':
      return { type: 'match-pairs', pairs: [] };
    case 'order':
      return { type: 'order', order: [] };
    case 'fill-blanks':
      return { type: 'fill-blanks', blanks: [] };
    case 'type-answer':
      return { type: 'type-answer', text: exercise.answer.kind === 'number' ? '987' : 'zzz' };
    case 'tap-rhythm':
      return { type: 'tap-rhythm', taps: [] };
    case 'fretboard-find':
      return { type: 'fretboard-find', positions: [] };
    case 'fretboard-name':
      return { type: 'fretboard-name', text: '?' };
    case 'chord-build':
      return exercise.task === 'missing-note' ? { type: 'chord-build', text: '?' } : { type: 'chord-build', frets: [null, null, null, null, null, null] };
    case 'staff-read':
      return { type: 'staff-read', text: '?' };
    case 'staff-place':
      return { type: 'staff-place', position: 99 };
    case 'play-note':
      return { type: 'play-note', midi: null };
    case 'play-chord':
      return { type: 'play-chord', matched: false, score: 0 };
    case 'play-phrase':
      return { type: 'play-phrase', played: [] };
    case 'flashcard':
      return { type: 'flashcard', rating: 'again' };
  }
}

/** A session being driven by a test: it keeps the state, the clock and every effect emitted. */
export class Driver {
  effects: SessionEffect[] = [];
  /** Effects of the most recent action only. */
  last: SessionEffect[] = [];

  constructor(
    public state: SessionState,
    public at: number,
  ) {}

  dispatch(action: SessionAction): this {
    const step = reduceSession(this.state, action);
    this.state = step.state;
    this.last = step.effects;
    this.effects.push(...step.effects);
    return this;
  }

  /** Move the clock forward. */
  wait(ms: number): this {
    this.at += ms;
    return this;
  }

  exercise(): Exercise {
    const step = currentStep(this.state);
    if (!step || step.kind !== 'exercise') throw new Error(`no exercise to answer (phase ${this.state.phase})`);
    return step.exercise;
  }

  /** Answer the current exercise right (or wrong) after `ms`. */
  answer(right: boolean, ms = 4000): this {
    const exercise = this.exercise();
    const answer = right ? solve(exercise) : wrongFor(exercise);
    if (grade(exercise, answer).correct !== right) throw new Error(`fixture answer for ${exercise.type} is not ${right ? 'right' : 'wrong'}`);
    return this.wait(ms).dispatch({ type: 'answer', answer, at: this.at });
  }

  next(ms = 1500): this {
    return this.wait(ms).dispatch({ type: 'continue', at: this.at });
  }

  /** Read a card or answer an exercise right, then continue. */
  pass(): this {
    const step = currentStep(this.state);
    if (step?.kind === 'exercise') this.answer(true);
    return this.next();
  }

  /** Answer everything right until the session ends. */
  finish(limit = 200): this {
    for (let i = 0; i < limit && this.state.phase !== 'done'; i++) this.pass();
    if (this.state.phase !== 'done') throw new Error('the session did not end');
    return this;
  }

  of<T extends SessionEffect['type']>(type: T): Array<Extract<SessionEffect, { type: T }>> {
    return this.effects.filter((e): e is Extract<SessionEffect, { type: T }> => e.type === type);
  }
}

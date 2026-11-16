import { describe, expect, it } from 'vitest';
import { xpFor } from '@/core/progress';
import { STEP_DOWN, STEP_UP } from './adaptive';
import { DEMO_COURSE } from './demo';
import { grade, solve } from './grade';
import {
  CHECKPOINT_MISTAKES, DEFAULT_DRILL_SIZE, FACT_CARD_KIND, MAX_REQUEUES, MAX_RETRIES, MAX_STEP_MS, REQUEUE_GAP, activityKindOf, createSession,
  currentStep, factCardId, factIndex, findLesson, findUnit, flashcardOf, isFinished, isResumable, mistakesLeft, reduceSession, restoreSession,
  serializeSession, sessionAccuracy, sessionProgress, sessionSeconds, type SessionOptions, type SessionSource, type SessionState,
} from './session';
import { Driver, FIXTURE, PLAY_FIXTURE, TEACHER_FIXTURE, wrongFor } from './test-fixtures';
import type { Course } from './types';

const T0 = 1_750_000_000_000;
const opts = (extra: Partial<SessionOptions> = {}): SessionOptions => ({ seed: 42, now: T0, hearts: 5, ...extra });
const lessonOf = (course: Course, lessonId: string, extra: Partial<SessionOptions> = {}): Driver => new Driver(createSession({ mode: 'lesson', course, lessonId }, opts(extra)), T0);

describe('a lesson, start to finish', () => {
  it('walks the steps in order and ends with a summary and the right effects', () => {
    const d = lessonOf(FIXTURE, 'a', { skill: null, route: 'learn', params: ['u1', 'a'] });
    expect(d.state).toMatchObject({ mode: 'lesson', courseId: 'fixture', unitId: 'u1', lessonId: 'a', title: 'Lesson a', kind: 'theory-lesson', skill: 'theory:u1:a', total: 6, hearts: 5, phase: 'step' });
    expect(currentStep(d.state)).toMatchObject({ kind: 'card', key: 's0' });
    expect(sessionProgress(d.state)).toEqual({ done: 0, total: 6, fraction: 0, remaining: 6 });

    d.next();
    const first = currentStep(d.state);
    if (first?.kind !== 'exercise') throw new Error('expected an exercise');
    expect(first).toMatchObject({ key: 's1', attempt: 0, alternative: false, usesMic: false });
    expect(first.exercise.type).toBe('choice');
    expect(first.presentation.options).toEqual([0, 1, 2]);

    d.answer(true);
    expect(d.state.phase).toBe('feedback');
    expect(d.state.feedback).toMatchObject({ skipped: false, heartLost: false, willRetry: false, result: { correct: true } });
    expect(d.last).toEqual([]);
    d.next();
    expect(sessionProgress(d.state)).toMatchObject({ done: 2, fraction: 2 / 6 });

    d.finish();
    expect(isFinished(d.state)).toBe(true);
    expect(currentStep(d.state)).toBeNull();
    expect(d.state.outcome).toBe('completed');
    const summary = d.state.summary!;
    expect(summary).toMatchObject({
      mode: 'lesson', outcome: 'completed', title: 'Lesson a', exercises: 5, firstTry: 5, mistakes: 0, accuracy: 1, perfect: true, bestCombo: 5,
      factsAdded: 2, cardsReviewed: 0, heartsLeft: 5, missed: [], unlocked: [], next: 'continue',
      crown: { before: 0, after: 1, gained: true },
    });
    expect(summary.xp).toBe(xpFor('theory-lesson', { perfect: true }));
    expect(summary.durationSec).toBe(Math.round((5 * 4000 + 6 * 1500) / 1000));

    expect(d.effects.map((e) => e.type)).toEqual(['record-activity', 'add-cards']);
    expect(d.of('record-activity')[0].input).toEqual({
      kind: 'theory-lesson', id: 'theory:u1:a', title: 'Lesson a', accuracy: 1, mistakes: 0, combo: 5, count: 5, durationSec: summary.durationSec, completed: true,
      route: 'learn', params: ['u1', 'a'], data: { d: Number((0.2 + 2 * STEP_UP).toFixed(2)) },
    });
    expect(d.of('add-cards')[0].items).toEqual([
      { id: 'fixture:a-fact-a', kind: FACT_CARD_KIND, ref: 'a' },
      { id: 'fixture:a-fact-b', kind: FACT_CARD_KIND, ref: 'a' },
    ]);
  });

  it('is deterministic for a seed and draws different generated exercises for different seeds', () => {
    const run = (seed: number): SessionState => lessonOf(FIXTURE, 'a', { seed }).finish().state;
    expect(run(7)).toEqual(run(7));
    const generated = (seed: number): string => {
      const d = lessonOf(FIXTURE, 'a', { seed });
      d.pass().pass().pass();
      return JSON.stringify(d.exercise());
    };
    expect(new Set([1, 2, 3, 4, 5, 6].map(generated)).size).toBeGreaterThan(2);
  });

  it('ignores actions that make no sense in the current phase', () => {
    const d = lessonOf(FIXTURE, 'a');
    const onCard = d.state;
    d.dispatch({ type: 'answer', answer: { type: 'true-false', value: true }, at: T0 });
    d.dispatch({ type: 'skip', at: T0 });
    expect(d.state).toBe(onCard);
    d.next();
    const onExercise = d.state;
    d.dispatch({ type: 'continue', at: d.at });
    expect(d.state).toBe(onExercise);
    d.answer(true);
    const inFeedback = d.state;
    d.dispatch({ type: 'answer', answer: solve(d.state.queue[0].exercise!), at: d.at });
    d.dispatch({ type: 'skip', at: d.at });
    expect(d.state).toBe(inFeedback);
    d.finish();
    const done = d.state;
    d.dispatch({ type: 'continue', at: d.at }).dispatch({ type: 'quit', at: d.at });
    expect(d.state).toBe(done);
    expect(d.effects.filter((e) => e.type === 'record-activity')).toHaveLength(1);
  });

  it('an unknown lesson gives an empty, finished session with no effects', () => {
    const state = createSession({ mode: 'lesson', course: FIXTURE, lessonId: 'nope' }, opts());
    expect(state).toMatchObject({ phase: 'done', outcome: 'completed', total: 0 });
    expect(state.summary).toMatchObject({ exercises: 0, xp: 0, accuracy: 1 });
    expect(reduceSession(state, { type: 'continue', at: T0 }).effects).toEqual([]);
  });
});

describe('wrong answers come back', () => {
  it('a wrong exercise returns after a few other steps, unchanged, until it is answered right', () => {
    const d = lessonOf(FIXTURE, 'a').next();
    const missed = d.exercise();
    d.answer(false);
    expect(d.state.feedback).toMatchObject({ willRetry: true, heartLost: true });
    expect(d.state.feedback!.result.feedback.answer).toBe('2');
    d.next();
    expect(d.state.queue.map((q) => q.key)).toEqual(['s2', 's3', 's4', 's1', 's5']);
    expect(d.state.queue[REQUEUE_GAP]).toMatchObject({ key: 's1', attempt: 1 });
    expect(sessionProgress(d.state)).toMatchObject({ done: 1, remaining: 5 });
    d.pass().pass().pass();
    const again = currentStep(d.state);
    if (again?.kind !== 'exercise') throw new Error('expected the exercise again');
    expect(again.key).toBe('s1');
    expect(again.attempt).toBe(1);
    expect(again.exercise).toEqual(missed);
    d.answer(true).next().finish();
    expect(d.state.summary).toMatchObject({ outcome: 'completed', exercises: 5, firstTry: 4, mistakes: 1, perfect: false, missed: [] });
    expect(d.state.summary!.accuracy).toBeCloseTo(0.8);
    expect(d.state.stats).toMatchObject({ answers: 6, right: 5, requeued: 1, dropped: 0 });
    expect(d.state.summary!.xp).toBe(xpFor('theory-lesson', { perfect: false }));
  });

  it('a generated exercise that comes back is the same question', () => {
    const d = lessonOf(FIXTURE, 'a').pass().pass().pass();
    const question = d.exercise();
    expect(d.state.queue[0].generated).toBe(true);
    d.answer(false).next().pass().pass();
    expect(d.exercise()).toEqual(question);
  });

  it('comes back at the end when fewer steps are left', () => {
    const d = lessonOf(FIXTURE, 'a').pass().pass().pass().pass().pass();
    expect(d.state.queue.map((q) => q.key)).toEqual(['s5']);
    d.answer(false).next();
    expect(d.state.queue.map((q) => [q.key, q.attempt])).toEqual([['s5', 1]]);
    d.answer(true).next();
    expect(d.state.outcome).toBe('completed');
  });

  it('never traps a struggling learner: an exercise returns at most MAX_RETRIES times', () => {
    const d = lessonOf(FIXTURE, 'a', { hearts: null }).next();
    for (let i = 0; i < 40 && d.state.phase !== 'done'; i++) {
      const step = currentStep(d.state);
      if (step?.kind === 'exercise') d.answer(step.key !== 's1');
      d.next();
    }
    expect(d.state.outcome).toBe('completed');
    expect(d.state.results.s1).toMatchObject({ attempts: MAX_RETRIES + 1, solved: false, firstTry: false });
    expect(d.state.stats).toMatchObject({ requeued: MAX_RETRIES, dropped: 1 });
    expect(d.state.summary!.missed).toEqual(['How many frets is a whole step?']);
    expect(d.of('lose-heart')).toEqual([]);
  });

  it('and a session allows at most MAX_REQUEUES come-backs in total', () => {
    const d = lessonOf(FIXTURE, 'a', { hearts: null });
    let turns = 0;
    while (d.state.phase !== 'done' && turns++ < 100) {
      if (currentStep(d.state)?.kind === 'exercise') d.answer(false);
      d.next();
    }
    expect(d.state.outcome).toBe('completed');
    expect(d.state.stats.requeued).toBeLessThanOrEqual(MAX_REQUEUES);
    expect(d.state.stats.requeued).toBe(Math.min(MAX_REQUEUES, 5 * MAX_RETRIES));
    expect(d.state.summary).toMatchObject({ accuracy: 0, firstTry: 0, exercises: 5 });
    expect(d.state.summary!.missed).toHaveLength(5);
  });

  it('skip shows the answer, costs no heart and brings the exercise back', () => {
    const d = lessonOf(FIXTURE, 'a').next();
    d.dispatch({ type: 'skip', at: d.at });
    expect(d.state.feedback).toMatchObject({ skipped: true, answer: null, heartLost: false, willRetry: true });
    expect(d.state.feedback!.result).toMatchObject({ correct: false, feedback: { answer: '2' } });
    expect(d.last).toEqual([]);
    expect(d.state.hearts).toBe(5);
    expect(d.state.stats).toMatchObject({ skipped: 1, mistakes: 1, asked: 1, firstTry: 0 });
    d.next();
    expect(d.state.queue[REQUEUE_GAP].key).toBe('s1');
  });

  it('counts combos', () => {
    const d = lessonOf(FIXTURE, 'a', { hearts: null }).next();
    d.answer(true).next().answer(true).next();
    expect(d.state.stats).toMatchObject({ combo: 2, bestCombo: 2 });
    d.answer(false).next();
    expect(d.state.stats).toMatchObject({ combo: 0, bestCombo: 2 });
    d.answer(true).next();
    expect(d.state.stats).toMatchObject({ combo: 1, bestCombo: 2 });
    expect(sessionAccuracy(d.state)).toBeCloseTo(3 / 4);
  });
});

describe('hearts', () => {
  it('a wrong answer in a theory lesson costs one heart and says so with an effect', () => {
    const d = lessonOf(FIXTURE, 'a', { hearts: 3 }).next().answer(false);
    expect(d.last).toEqual([{ type: 'lose-heart' }]);
    expect(d.state.hearts).toBe(2);
    expect(d.state.feedback!.heartLost).toBe(true);
  });

  it('running out ends the lesson kindly and offers practice', () => {
    const d = lessonOf(FIXTURE, 'a', { hearts: 2 }).next();
    d.answer(false).next().answer(false);
    expect(d.state.hearts).toBe(0);
    expect(d.state.phase).toBe('feedback');
    d.next();
    expect(d.state).toMatchObject({ phase: 'done', outcome: 'out-of-hearts' });
    expect(d.state.summary).toMatchObject({ outcome: 'out-of-hearts', next: 'practice', heartsLeft: 0, crown: null, factsAdded: 0 });
    expect(d.of('lose-heart')).toHaveLength(2);
    const recorded = d.of('record-activity');
    expect(recorded).toHaveLength(1);
    expect(recorded[0].input).toMatchObject({ kind: 'theory-lesson', id: 'theory:u1:a', completed: false, accuracy: 0, mistakes: 2 });
    // Half XP for an unfinished attempt, scaled by how far the learner got (1 of 6 steps).
    expect(recorded[0].input.xp).toBe(Math.floor(xpFor('theory-lesson', { completed: false }) * (1 / 6)));
    expect(recorded[0].input.progress).toBeCloseTo(1 / 6);
    expect(d.of('add-cards')).toEqual([]);
  });

  it('the last heart lost on the last exercise ends the lesson out of hearts, because that exercise would have come back', () => {
    const d = lessonOf(FIXTURE, 'a', { hearts: 1, seed: 3 });
    d.pass().pass().pass().pass().pass();
    d.answer(false);
    expect(d.state.hearts).toBe(0);
    d.next();
    expect(d.state.outcome).toBe('out-of-hearts');
  });

  it('with hearts switched off nothing is lost and nothing ends early', () => {
    const d = lessonOf(FIXTURE, 'a', { hearts: null }).next();
    d.answer(false).next().answer(false).next().answer(false).next();
    expect(d.state.hearts).toBeNull();
    expect(d.effects).toEqual([]);
    expect(d.state.phase).toBe('step');
    expect(d.state.feedback).toBeNull();
  });

  it('a teacher lesson never uses hearts, and reports as a teacher lesson', () => {
    const d = lessonOf(TEACHER_FIXTURE, 'ma', { hearts: 2 }).next();
    expect(d.state.hearts).toBeNull();
    expect(d.state.kind).toBe('teacher-lesson');
    expect(activityKindOf(TEACHER_FIXTURE)).toBe('teacher-lesson');
    d.answer(false).next().answer(false).next().answer(false);
    expect(d.of('lose-heart')).toEqual([]);
    d.next().finish();
    expect(d.of('record-activity')[0].input).toMatchObject({ kind: 'teacher-lesson', id: 'teacher:mia:ma', completed: true });
    expect(d.state.summary!.xp).toBe(xpFor('teacher-lesson', {}));
  });

  it('a lesson cannot start without a heart', () => {
    const state = createSession({ mode: 'lesson', course: FIXTURE, lessonId: 'a' }, opts({ hearts: 0 }));
    expect(state).toMatchObject({ phase: 'done', outcome: 'out-of-hearts' });
    expect(state.summary).toMatchObject({ next: 'practice', exercises: 0, xp: 0 });
  });

  it('a self-rated flashcard never costs a heart', () => {
    const d = lessonOf(PLAY_FIXTURE, 'pa', { hearts: 3, mic: false }).pass().pass();
    expect(d.exercise().type).toBe('flashcard');
    d.wait(1000).dispatch({ type: 'answer', answer: { type: 'flashcard', rating: 'again' }, at: d.at });
    expect(d.last).toEqual([]);
    expect(d.state.hearts).toBe(3);
    expect(d.state.feedback).toMatchObject({ willRetry: true, heartLost: false });
  });
});

describe('microphone exercises', () => {
  it('"I can\'t play right now" swaps the step for its alternative', () => {
    const d = lessonOf(PLAY_FIXTURE, 'pa').next();
    const before = currentStep(d.state);
    if (before?.kind !== 'exercise') throw new Error('exercise');
    expect(before).toMatchObject({ usesMic: true, alternative: false });
    expect(before.exercise.type).toBe('play-note');
    d.dispatch({ type: 'cant-play', scope: 'step', at: d.at });
    const after = currentStep(d.state);
    if (after?.kind !== 'exercise') throw new Error('exercise');
    expect(after).toMatchObject({ usesMic: false, alternative: true, key: before.key });
    expect(after.exercise.type).toBe('fretboard-find');
    expect(d.state.micOff).toBe(false);
    d.answer(true).next().pass();
    // Only that step was swapped: the next play exercise still listens.
    expect(d.exercise().type).toBe('play-chord');
  });

  it('for the whole session when asked, generated alternatives included', () => {
    const d = lessonOf(PLAY_FIXTURE, 'pa').next();
    d.dispatch({ type: 'cant-play', scope: 'session', at: d.at });
    expect(d.state.micOff).toBe(true);
    d.answer(true).next().pass();
    expect(d.exercise().type).toBe('chord-build');
    expect(currentStep(d.state)).toMatchObject({ alternative: true, usesMic: false });
    d.pass();
    // A generated play-note carries its own tapping alternative.
    expect(d.exercise().type).toBe('fretboard-find');
    d.finish();
    expect(d.state.outcome).toBe('completed');
    expect(Object.values(d.state.results).map((r) => r.type)).not.toContain('play-note');
  });

  it('starts without the microphone when it is unavailable', () => {
    const d = lessonOf(PLAY_FIXTURE, 'pa', { mic: false }).next();
    expect(d.exercise().type).toBe('fretboard-find');
    expect(d.finish().state.outcome).toBe('completed');
  });

  it('the microphone can go away and come back mid-session', () => {
    const d = lessonOf(PLAY_FIXTURE, 'pa').next();
    d.dispatch({ type: 'mic', available: false, at: d.at });
    expect(d.exercise().type).toBe('fretboard-find');
    d.dispatch({ type: 'mic', available: true, at: d.at });
    expect(d.state.micOff).toBe(false);
    d.pass().pass();
    expect(d.exercise().type).toBe('play-chord');
  });

  it('a played answer is graded like any other', () => {
    const d = lessonOf(PLAY_FIXTURE, 'pa').next();
    d.dispatch({ type: 'answer', answer: { type: 'play-note', midi: 45, cents: -3 }, at: d.at + 3000 });
    expect(d.state.feedback!.result.correct).toBe(true);
    d.next(1000).pass();
    d.dispatch({ type: 'answer', answer: { type: 'play-chord', matched: false, score: 0.2, missing: [7] }, at: d.at });
    expect(d.state.feedback).toMatchObject({ result: { correct: false, near: 'incomplete' }, heartLost: true, willRetry: true });
  });

  it('cant-play does nothing for an exercise that does not listen', () => {
    const d = lessonOf(FIXTURE, 'a').next();
    const before = d.state;
    d.dispatch({ type: 'cant-play', scope: 'step', at: d.at });
    expect(d.state).toBe(before);
  });
});

describe('checkpoints', () => {
  const checkpoint = (course: Course, unitId: string, extra: Partial<SessionOptions> = {}): Driver => new Driver(createSession({ mode: 'checkpoint', course, unitId }, opts(extra)), T0);

  it('passing marks every lesson of the unit as done', () => {
    const d = checkpoint(FIXTURE, 'u1');
    expect(d.state).toMatchObject({ mode: 'checkpoint', title: 'Checkpoint: Unit one', total: 4, hearts: null, maxMistakes: 1, skill: null });
    expect(mistakesLeft(d.state)).toBe(1);
    d.finish();
    expect(d.state.summary).toMatchObject({ outcome: 'completed', unlocked: ['a', 'b', 'c'], next: 'continue', crown: null, factsAdded: 0 });
    expect(d.of('mark-skill')).toEqual([
      { type: 'mark-skill', id: 'theory:u1:a', completed: true, masteryAtLeast: 1 },
      { type: 'mark-skill', id: 'theory:u1:b', completed: true, masteryAtLeast: 1 },
      { type: 'mark-skill', id: 'theory:u1:c', completed: true, masteryAtLeast: 1 },
    ]);
    const recorded = d.of('record-activity')[0].input;
    expect(recorded).toMatchObject({ kind: 'theory-lesson', title: 'Checkpoint: Unit one', completed: true, accuracy: 1 });
    expect(recorded.id).toBeUndefined();
    expect(d.of('lose-heart')).toEqual([]);
  });

  it('is a test: no second tries, and one mistake too many fails it at once', () => {
    const d = checkpoint(FIXTURE, 'u1');
    d.answer(false);
    expect(d.state.feedback).toMatchObject({ willRetry: false, heartLost: false });
    d.next();
    expect(d.state.queue.map((q) => q.key)).toEqual(['s1', 's2', 's3']);
    expect(mistakesLeft(d.state)).toBe(0);
    d.answer(false).next();
    expect(d.state).toMatchObject({ phase: 'done', outcome: 'failed' });
    expect(d.state.summary).toMatchObject({ next: 'lessons', unlocked: [], mistakes: 2 });
    expect(d.of('mark-skill')).toEqual([]);
    expect(d.of('record-activity')[0].input).toMatchObject({ completed: false });
  });

  it('fails even when the mistake too many is on the last question', () => {
    const d = checkpoint(FIXTURE, 'u1');
    d.answer(false).next().pass().pass().answer(false).next();
    expect(d.state.outcome).toBe('failed');
    expect(d.of('mark-skill')).toEqual([]);
  });

  it('passes with mistakes inside the allowance', () => {
    const d = checkpoint(FIXTURE, 'u1');
    d.answer(false).next().finish();
    expect(d.state.outcome).toBe('completed');
    expect(d.state.summary!.accuracy).toBeCloseTo(0.75);
    expect(d.of('mark-skill')).toHaveLength(3);
  });

  it('without authored steps it draws questions evenly from the unit\'s lessons', () => {
    const d = checkpoint(FIXTURE, 'u2');
    expect(d.state.total).toBe(6);
    expect(d.state.maxMistakes).toBe(CHECKPOINT_MISTAKES);
    const fromLessons = d.state.queue.map((q) => q.lessonId);
    expect(fromLessons.filter((id) => id === 'd')).toHaveLength(3);
    expect(fromLessons.filter((id) => id === 'e')).toHaveLength(3);
    expect(d.state.queue.every((q) => 'generate' in q.step || q.step.type !== 'card')).toBe(true);
    expect(d.finish().state.outcome).toBe('completed');
  });
});

describe('practice drills', () => {
  const practice = (source: Partial<Extract<SessionSource, { mode: 'practice' }>> = {}, extra: Partial<SessionOptions> = {}): Driver =>
    new Driver(createSession({ mode: 'practice', course: FIXTURE, unitId: 'u1', ...source }, opts(extra)), T0);

  it('draws exercises from the unit, uses no hearts and reports as practice', () => {
    const d = practice();
    expect(d.state).toMatchObject({ mode: 'practice', title: 'Practice: Unit one', kind: 'practice', hearts: null, total: DEFAULT_DRILL_SIZE, skill: null });
    expect(new Set(d.state.queue.map((q) => q.lessonId))).toEqual(new Set(['a', 'b', 'c']));
    d.answer(false);
    expect(d.last).toEqual([]);
    expect(d.state.feedback!.willRetry).toBe(true);
    d.next().finish();
    const recorded = d.of('record-activity')[0].input;
    expect(recorded).toMatchObject({ kind: 'practice', title: 'Practice: Unit one', completed: true, count: DEFAULT_DRILL_SIZE });
    expect(recorded.id).toBeUndefined();
    expect(d.state.summary!.xp).toBe(xpFor('practice', { durationSec: d.state.summary!.durationSec }));
    expect(d.of('skill-data').map((e) => e.id)).toEqual(['theory:u1:a', 'theory:u1:b', 'theory:u1:c']);
    expect(d.of('add-cards')).toEqual([]);
    expect(d.of('lose-heart')).toEqual([]);
  });

  it('can be limited to some lessons and sized', () => {
    const d = practice({ lessonIds: ['b'], size: 4 });
    expect(d.state.total).toBe(4);
    expect(d.state.queue.every((q) => q.lessonId === 'b')).toBe(true);
    expect(d.state.practiced).toEqual(['theory:u1:b']);
  });

  it('never runs dry: generated steps are asked again, afresh', () => {
    const d = practice({ lessonIds: ['b'], size: 12 });
    expect(d.state.total).toBe(12);
    d.finish();
    const prompts = Object.values(d.state.results).map((r) => r.prompt);
    expect(prompts).toHaveLength(12);
    expect(new Set(prompts).size).toBeGreaterThan(5);
  });

  it('draws differently for different seeds', () => {
    const order = (seed: number): string => practice({}, { seed }).state.queue.map((q) => `${q.lessonId}:${JSON.stringify(q.step).length}`).join(',');
    expect(new Set([1, 2, 3, 4, 5].map(order)).size).toBeGreaterThan(1);
    expect(order(9)).toBe(order(9));
  });
});

describe('reviews', () => {
  const cards = [{ id: 'fixture:a-fact-a' }, { id: 'fixture:a-fact-b' }, { id: 'unknown:card' }, { id: 'fixture:b-fact-a' }, { id: 'fixture:a-fact-a' }];
  const review = (extra: Partial<SessionOptions> = {}, size?: number): Driver => new Driver(createSession({ mode: 'review', courses: [FIXTURE], cards, size }, opts(extra)), T0);

  it('turns due cards into steps: the fact\'s own exercise, or a flashcard', () => {
    const d = review();
    expect(d.state).toMatchObject({ mode: 'review', kind: 'review', title: 'Review', hearts: null, total: 3, courseId: null });
    expect(d.state.queue.map((q) => q.cardId)).toEqual(['fixture:a-fact-a', 'fixture:a-fact-b', 'fixture:b-fact-a']);
    expect(d.exercise()).toEqual(flashcardOf(findLesson(FIXTURE, 'a')!.lesson.facts![0]));
    d.wait(2000).dispatch({ type: 'answer', answer: { type: 'flashcard', rating: 'easy' }, at: d.at });
    expect(d.last).toEqual([{ type: 'grade-review', id: 'fixture:a-fact-a', grade: 'easy' }]);
    d.next();
    expect(d.exercise().type).toBe('type-answer');
    d.answer(true);
    expect(d.last).toEqual([{ type: 'grade-review', id: 'fixture:a-fact-b', grade: 'good' }]);
  });

  it('a forgotten card is graded again, comes back, and is graded once more', () => {
    const d = review();
    d.wait(2000).dispatch({ type: 'answer', answer: { type: 'flashcard', rating: 'again' }, at: d.at });
    expect(d.last).toEqual([{ type: 'grade-review', id: 'fixture:a-fact-a', grade: 'again' }]);
    d.next().answer(false);
    expect(d.last).toEqual([{ type: 'grade-review', id: 'fixture:a-fact-b', grade: 'again' }]);
    d.next().pass();
    d.wait(1000).dispatch({ type: 'answer', answer: { type: 'flashcard', rating: 'good' }, at: d.at }).next().finish();
    expect(d.of('grade-review').map((e) => `${e.id.split(':')[1]}=${e.grade}`)).toEqual([
      'a-fact-a=again', 'a-fact-b=again', 'b-fact-a=good', 'a-fact-a=good', 'a-fact-b=good',
    ]);
    expect(d.state.summary).toMatchObject({ outcome: 'completed', cardsReviewed: 3, exercises: 3, firstTry: 1 });
    const recorded = d.of('record-activity')[0].input;
    expect(recorded).toMatchObject({ kind: 'review', count: 3, completed: true });
    expect(d.state.summary!.xp).toBe(xpFor('review', { count: 3 }));
    expect(d.of('lose-heart')).toEqual([]);
  });

  it('respects the size and survives having nothing to review', () => {
    expect(review({}, 2).state.total).toBe(2);
    const empty = createSession({ mode: 'review', courses: [FIXTURE], cards: [] }, opts());
    expect(empty).toMatchObject({ phase: 'done', outcome: 'completed', total: 0 });
    expect(empty.summary).toMatchObject({ cardsReviewed: 0, xp: 0 });
  });

  it('leaving a review early records what was done, as unfinished', () => {
    const d = review().answer(true).next();
    d.dispatch({ type: 'quit', at: d.at });
    expect(d.state.outcome).toBe('quit');
    expect(d.of('record-activity')[0].input).toMatchObject({ kind: 'review', count: 1, completed: false });
    expect(d.of('grade-review')).toHaveLength(1);
  });

  it('indexes every fact of the given courses by card id', () => {
    const index = factIndex([FIXTURE, DEMO_COURSE]);
    expect(index.get('fixture:a-fact-b')!.lesson.id).toBe('a');
    expect(index.get(factCardId('demo', 'open-strings'))!.unit.id).toBe('first-notes');
    expect(index.size).toBe(10 + DEMO_COURSE.units.flatMap((u) => u.lessons).reduce((n, l) => n + (l.facts?.length ?? 0), 0));
  });
});

describe('adaptive difficulty inside a session', () => {
  it('moves only on generated exercises: up a little when right, down more when wrong', () => {
    const d = lessonOf(FIXTURE, 'a', { hearts: null, difficulty: 0.5 });
    d.pass().pass().pass();
    expect(d.state.difficulty).toBe(0.5);
    d.answer(true);
    expect(d.state.difficulty).toBeCloseTo(0.5 + STEP_UP);
    d.next().pass();
    d.answer(false);
    expect(d.state.difficulty).toBeCloseTo(0.5 + STEP_UP - STEP_DOWN);
  });

  it('starts from the level when no difficulty is given, and is clamped', () => {
    expect(lessonOf(FIXTURE, 'a').state.difficulty).toBe(0.2);
    expect(lessonOf(FIXTURE, 'a', { difficulty: 7 }).state.difficulty).toBe(1);
    expect(lessonOf(FIXTURE, 'a', { difficulty: -1 }).state.difficulty).toBe(0);
  });
});

describe('time', () => {
  it('counts time per step up to a cap, so a walk to the kettle is not practice', () => {
    const d = lessonOf(FIXTURE, 'a');
    d.next(10_000);
    expect(d.state.activeMs).toBe(10_000);
    d.next(0);
    d.wait(10 * 60_000).dispatch({ type: 'answer', answer: solve(d.exercise()), at: d.at }).next(0);
    expect(d.state.activeMs).toBe(10_000 + MAX_STEP_MS);
    expect(sessionSeconds(d.state, d.at + 5000)).toBe(Math.round((10_000 + MAX_STEP_MS + 5000) / 1000));
  });

  it('pause and resume leave the time away out', () => {
    const d = lessonOf(FIXTURE, 'a');
    d.wait(4000).dispatch({ type: 'pause', at: d.at });
    expect(d.state).toMatchObject({ paused: true, activeMs: 4000 });
    d.wait(3_600_000).dispatch({ type: 'resume', at: d.at });
    expect(d.state.paused).toBe(false);
    d.next(2000);
    expect(d.state.activeMs).toBe(6000);
    // Pausing twice changes nothing; acting while paused resumes by itself.
    d.dispatch({ type: 'pause', at: d.at }).dispatch({ type: 'pause', at: d.at + 999_999 });
    d.wait(50_000).dispatch({ type: 'answer', answer: solve(d.exercise()), at: d.at });
    expect(d.state.paused).toBe(false);
    d.next(1000);
    expect(d.state.activeMs).toBe(7000);
  });

  it('resume re-syncs the hearts, and ends the lesson if none are left', () => {
    const d = lessonOf(FIXTURE, 'a', { hearts: 2 }).next();
    d.dispatch({ type: 'pause', at: d.at }).wait(3_600_000).dispatch({ type: 'resume', at: d.at, hearts: 5 });
    expect(d.state.hearts).toBe(5);
    d.dispatch({ type: 'resume', at: d.at, hearts: null });
    expect(d.state.hearts).toBeNull();
    const out = lessonOf(FIXTURE, 'a', { hearts: 2 }).next();
    out.dispatch({ type: 'resume', at: out.at, hearts: 0 });
    expect(out.state.outcome).toBe('out-of-hearts');
  });
});

describe('quitting', () => {
  it('records an unfinished attempt with partial XP', () => {
    const d = lessonOf(FIXTURE, 'a').pass().pass().pass();
    d.dispatch({ type: 'quit', at: d.at });
    expect(d.state).toMatchObject({ phase: 'done', outcome: 'quit' });
    expect(d.state.summary).toMatchObject({ next: 'resume', exercises: 2, crown: null, factsAdded: 0 });
    const input = d.of('record-activity')[0].input;
    expect(input).toMatchObject({ completed: false, id: 'theory:u1:a', accuracy: 1 });
    expect(input.xp).toBe(Math.floor(xpFor('theory-lesson', { completed: false, perfect: false }) * 0.5));
    expect(input.progress).toBeCloseTo(0.5);
    expect(d.of('add-cards')).toEqual([]);
  });

  it('records nothing when nothing was answered', () => {
    const d = lessonOf(FIXTURE, 'a').next();
    d.dispatch({ type: 'quit', at: d.at });
    expect(d.state.outcome).toBe('quit');
    expect(d.effects).toEqual([]);
    expect(d.state.summary!.xp).toBe(0);
  });
});

describe('saving and restoring', () => {
  it('a restored session continues exactly as the original would have', () => {
    const original = lessonOf(FIXTURE, 'a', { skill: null }).pass().pass();
    original.answer(false).next();
    const saved = serializeSession(original.state);
    expect(typeof saved).toBe('string');
    const restored = restoreSession(saved)!;
    expect(restored).toEqual(original.state);
    const resumed = new Driver(restored, original.at);
    const before = original.effects.length;
    original.finish();
    resumed.finish();
    expect(resumed.state).toEqual(original.state);
    expect(resumed.effects).toEqual(original.effects.slice(before));
    expect(resumed.effects.map((e) => e.type)).toEqual(['record-activity', 'add-cards']);
  });

  it('restores in the middle of feedback too', () => {
    const d = lessonOf(FIXTURE, 'a').next().answer(false);
    const restored = restoreSession(JSON.parse(serializeSession(d.state)))!;
    expect(restored.phase).toBe('feedback');
    expect(restored.feedback!.willRetry).toBe(true);
    expect(reduceSession(restored, { type: 'continue', at: d.at + 1 }).state.queue[REQUEUE_GAP].key).toBe('s1');
  });

  it('refuses anything that is not a session of this version', () => {
    const good = JSON.parse(serializeSession(lessonOf(FIXTURE, 'a').next().state));
    for (const bad of [null, undefined, 42, 'not json', '{}', '[]', { ...good, v: 0 }, { ...good, mode: 'party' }, { ...good, queue: 'x' }, { ...good, queue: [] }, { ...good, phase: 'nap' }, { ...good, stats: null }, { ...good, seed: 'x' }, { ...good, queue: [{ key: 1 }] }, { ...good, phase: 'feedback', feedback: null }]) {
      expect(restoreSession(bad), JSON.stringify(bad)?.slice(0, 60)).toBeNull();
    }
    expect(restoreSession(good)).not.toBeNull();
  });

  it('knows what is worth resuming', () => {
    const fresh = lessonOf(FIXTURE, 'a');
    expect(isResumable(fresh.state)).toBe(false);
    expect(isResumable(fresh.next().state)).toBe(true);
    expect(isResumable(fresh.finish().state)).toBe(false);
    expect(isResumable(null)).toBe(false);
  });
});

describe('the demo course runs end to end', () => {
  const lessons = DEMO_COURSE.units.flatMap((u) => u.lessons);

  it.each(lessons.map((l) => [l.id]))('lesson %s can be completed, with and without the microphone', (lessonId) => {
    for (const mic of [true, false]) {
      for (const seed of [1, 2, 3]) {
        const d = lessonOf(DEMO_COURSE, lessonId, { seed, mic, skill: null }).finish();
        expect(d.state.summary).toMatchObject({ outcome: 'completed', perfect: true, accuracy: 1 });
        expect(d.of('record-activity')[0].input).toMatchObject({ kind: 'theory-lesson', id: findLesson(DEMO_COURSE, lessonId)!.lesson.skill, completed: true });
        expect(d.of('add-cards')[0].items).toHaveLength(findLesson(DEMO_COURSE, lessonId)!.lesson.facts!.length);
        if (!mic) expect(Object.values(d.state.results).some((r) => r.type.startsWith('play-'))).toBe(false);
      }
    }
  });

  it('every exercise of every lesson rejects a wrong answer and then accepts the right one', () => {
    for (const lesson of lessons) {
      const d = lessonOf(DEMO_COURSE, lesson.id, { hearts: null, seed: 5 });
      let guard = 0;
      while (d.state.phase !== 'done' && guard++ < 200) {
        const step = currentStep(d.state);
        if (step?.kind === 'exercise') {
          const first = step.attempt === 0;
          const wrong = wrongFor(step.exercise);
          expect(grade(step.exercise, wrong).correct, `${lesson.id} ${step.key} ${step.exercise.type}`).toBe(false);
          d.answer(!first);
        }
        d.next();
      }
      expect(d.state.outcome, lesson.id).toBe('completed');
      expect(d.state.summary!.accuracy, lesson.id).toBe(0);
      expect(d.state.summary!.missed, lesson.id).toEqual([]);
    }
  });

  it('both checkpoints, a practice drill and a review of every fact run to the end', () => {
    for (const unit of DEMO_COURSE.units) {
      const checkpoint = new Driver(createSession({ mode: 'checkpoint', course: DEMO_COURSE, unitId: unit.id }, opts({ mic: false })), T0).finish();
      expect(checkpoint.state.summary).toMatchObject({ outcome: 'completed', unlocked: unit.lessons.map((l) => l.id) });
      expect(checkpoint.state.total).toBe(8);
      const practice = new Driver(createSession({ mode: 'practice', course: DEMO_COURSE, unitId: unit.id }, opts()), T0).finish();
      expect(practice.state.summary).toMatchObject({ outcome: 'completed', exercises: DEFAULT_DRILL_SIZE });
      expect(findUnit(DEMO_COURSE, unit.id)).toBe(unit);
    }
    const all = [...factIndex([DEMO_COURSE]).keys()].map((id) => ({ id }));
    const review = new Driver(createSession({ mode: 'review', courses: [DEMO_COURSE], cards: all, size: 100 }, opts()), T0);
    expect(review.state.total).toBe(all.length);
    let guard = 0;
    while (review.state.phase !== 'done' && guard++ < 100) review.pass();
    expect(review.state.summary).toMatchObject({ outcome: 'completed', cardsReviewed: all.length });
    expect(review.of('grade-review')).toHaveLength(all.length);
  });
});

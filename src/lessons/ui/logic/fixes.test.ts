/**
 * The lesson UI's words and layout rules from the second integration pass: feedback wording, the
 * summary of a lesson below the pass mark, where text may break, and keys for long match lists.
 */
import { describe, expect, it } from 'vitest';
import { grade, tokenize, type SessionFeedback } from '../../index';
import type { Exercise, FillBlanksExercise, OrderExercise, PlayNoteExercise } from '../../types';
import { feedbackCopy, wrongLine } from './feedback';
import { matchLetter, matchLetterIndex } from './layout';
import { nextLabel, summaryHeadline, teacherLine } from './summary';
import { textRuns } from './textRuns';

const explain = 'Because.';
const fb = (exercise: Exercise, answer: Parameters<typeof grade>[1]): SessionFeedback => ({ result: grade(exercise, answer), answer, skipped: false, heartLost: false, willRetry: false });

describe('feedback words', () => {
  it('fill-blanks agrees in number', () => {
    const one: FillBlanksExercise = { type: 'fill-blanks', prompt: 'p', text: '{n:C} ___', blanks: ['{n:E}'], bank: ['{n:F}'], explain };
    expect(wrongLine(one, grade(one, { type: 'fill-blanks', blanks: ['{n:F}'] }))).toBe('That word does not fit the blank.');
    const two: FillBlanksExercise = { ...one, text: '{n:C} ___ ___', blanks: ['{n:E}', '{n:G}'], bank: ['{n:F}', '{n:A}'] };
    expect(wrongLine(two, grade(two, { type: 'fill-blanks', blanks: ['{n:F}', '{n:A}'] }))).toBe('None of the 2 blanks is right yet.');
    expect(wrongLine(two, grade(two, { type: 'fill-blanks', blanks: ['{n:E}', '{n:A}'] }))).toBe('1 of the 2 blanks is right.');
  });

  it('order tiles agree in number', () => {
    const ex: OrderExercise = { type: 'order', prompt: 'p', tiles: ['{n:C}', '{n:D}', '{n:E}', '{n:F}'], explain };
    expect(wrongLine(ex, grade(ex, { type: 'order', order: [0, 2, 1, 3].map((i, k) => (k === 0 ? 1 : k === 1 ? 0 : i)) }))).toMatch(/^2 of the 4 tiles are in the right place\.$/);
  });

  it('names a heard note in the key of the exercise, and without an octave where targets are named by place', () => {
    const ex: PlayNoteExercise = { type: 'play-note', prompt: 'p', note: 'A2', octave: 'exact', key: 'A major', where: { string: 5, fret: 0 }, explain, alternative: { type: 'true-false', statement: 's', answer: true, explain } };
    expect(feedbackCopy(ex, fb(ex, { type: 'play-note', midi: 49 })).note).toBe('I heard {n:C#3}.');
    expect(feedbackCopy({ ...ex, labels: 'place' }, fb({ ...ex, labels: 'place' }, { type: 'play-note', midi: 49 })).note).toBe('I heard {n:C#}.');
  });
});

describe('a lesson below the pass mark', () => {
  it('is practice, kindly, with a retry, and the teachers say so in their own words', () => {
    const h = summaryHeadline({ mode: 'lesson', outcome: 'failed', perfect: false, exercises: 8, mistakes: 8, heartsLeft: null });
    expect(h).toMatchObject({ title: 'Good practice', celebrate: false, tone: 'info' });
    expect(summaryHeadline({ mode: 'checkpoint', outcome: 'failed', perfect: false, exercises: 8, mistakes: 8, heartsLeft: null }).title).toBe('Not this time');
    expect(teacherLine('mia', 'failed', false, 'lesson')).toMatch(/once more/);
    expect(teacherLine('mia', 'failed', false, 'checkpoint')).toMatch(/lessons will get you there/);
    expect(nextLabel({ kind: 'retry' }, 'lesson')).toBe('Try again');
  });
});

describe('where text may break', () => {
  const runs = (markup: string) => textRuns(tokenize(markup));
  const kept = (markup: string) => runs(markup).filter((r) => r.kind === 'keep').map((r) => (r.kind === 'keep' ? r.tokens.map((t) => ('text' in t ? t.text : '')).join('') : ''));

  it('keeps punctuation with the term or symbol before it', () => {
    expect(kept('Play a {t:barre}, then lift.')).toEqual(['barre,']);
    expect(kept('The notes are {n:C}, {n:E} and {n:G}.')).toEqual(['C,', 'G.']);
    expect(kept('(see {t:capo})')).toEqual(['capo)']);
  });

  it('keeps hyphenated number runs on one line', () => {
    expect(kept('Fret it 10-8-8 on strings 3-2-1.')).toEqual(['10-8-8', '3-2-1']);
    expect(kept('The shape x-3-2-0-1-0 is C.')).toEqual(['x-3-2-0-1-0']);
    expect(kept('A well-known tune.')).toEqual([]);
  });

  it('loses no text', () => {
    const markup = 'Play {c:Am}, then {t:barre}: frets 5-7-7 (and {n:C}).';
    const visible = runs(markup).flatMap((r) => (r.kind === 'keep' ? r.tokens : [r.token])).map((t) => ('text' in t ? t.text : '')).join('');
    expect(visible).toBe(tokenize(markup).map((t) => ('text' in t ? t.text : '')).join(''));
  });
});

describe('six pairs need more than nine keys', () => {
  it('the right column answers to letters A–F', () => {
    expect([0, 1, 5].map(matchLetter)).toEqual(['A', 'B', 'F']);
    expect(matchLetter(6)).toBeNull();
    expect(matchLetterIndex('c')).toBe(2);
    expect(matchLetterIndex('F')).toBe(5);
    expect(matchLetterIndex('g')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { cardProblems, exerciseProblems, figureProblems } from '@/lessons';
import { OPTION_CARD, OPTION_EXERCISES, OPTION_FIGURES } from './options';

describe('the gallery samples of the lesson options are valid lesson data', () => {
  it.each(Object.entries(OPTION_EXERCISES))('exercise %s', (_id, exercise) => {
    expect(exerciseProblems(exercise).filter((p) => p.severity === 'error').map((p) => p.message)).toEqual([]);
  });

  it.each(Object.entries(OPTION_FIGURES))('figure %s', (_id, figure) => {
    expect(figureProblems(figure)).toEqual([]);
  });

  it('the card', () => {
    expect(cardProblems(OPTION_CARD).filter((p) => p.severity === 'error')).toEqual([]);
  });

  it('ids are slug-safe, so each can be opened at #kit-lessons--try--opt-<id>', () => {
    for (const id of [...Object.keys(OPTION_EXERCISES), ...Object.keys(OPTION_FIGURES)]) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

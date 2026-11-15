import { describe, expect, it } from 'vitest';
import { emptySkill } from '@/core/progress';
import {
  START_DIFFICULTY, STEP_DOWN, STEP_UP, TARGET_SUCCESS, difficultyAfter, nextDifficulty, startingDifficulty, storedDifficulty, successRate,
} from './adaptive';
import { generateStrict } from './generators';
import { createRng } from './rng';

describe('the staircase', () => {
  it('steps up a little when right and four times as far down when wrong', () => {
    expect(STEP_DOWN).toBeCloseTo(STEP_UP * 4);
    expect(nextDifficulty(0.5, true)).toBeCloseTo(0.54);
    expect(nextDifficulty(0.5, false)).toBeCloseTo(0.34);
    expect(nextDifficulty(0.99, true)).toBe(1);
    expect(nextDifficulty(0.05, false)).toBe(0);
    expect(nextDifficulty(Number.NaN, true)).toBeCloseTo(STEP_UP);
    expect(difficultyAfter(0.5, [true, true, false])).toBeCloseTo(0.5 + 2 * STEP_UP - STEP_DOWN);
  });

  it('balances exactly at the target: four right and one wrong leave it where it was', () => {
    expect(difficultyAfter(0.5, [true, true, true, true, false])).toBeCloseTo(0.5);
    expect((STEP_UP * TARGET_SUCCESS) / (STEP_UP * TARGET_SUCCESS + STEP_DOWN * (1 - TARGET_SUCCESS))).toBeCloseTo(0.5);
  });

  /** A learner whose chance of a right answer falls as the difficulty rises. */
  function simulate(skill: number, answers: number, seed: number): { rate: number; difficulty: number } {
    const rng = createRng(seed);
    const chance = (d: number): number => Math.min(0.99, Math.max(0.05, 1 - (d - skill + 0.2) * 1.4));
    let d = 0.2;
    const results: boolean[] = [];
    for (let i = 0; i < answers; i++) {
      const correct = rng.next() < chance(d);
      d = nextDifficulty(d, correct);
      if (i >= answers / 4) results.push(correct);
    }
    return { rate: successRate(results)!, difficulty: d };
  }

  it('settles where the learner succeeds about 80 % of the time, whatever their level', () => {
    for (const skill of [0.25, 0.45, 0.65]) {
      const rates = [1, 2, 3, 4, 5].map((seed) => simulate(skill, 2000, seed).rate);
      const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
      expect(mean, `skill ${skill}`).toBeGreaterThan(0.76);
      expect(mean, `skill ${skill}`).toBeLessThan(0.84);
    }
  });

  it('a stronger learner ends up at a higher difficulty', () => {
    const weak = [1, 2, 3].map((seed) => simulate(0.2, 1500, seed).difficulty).reduce((a, b) => a + b, 0) / 3;
    const strong = [1, 2, 3].map((seed) => simulate(0.7, 1500, seed).difficulty).reduce((a, b) => a + b, 0) / 3;
    expect(strong).toBeGreaterThan(weak + 0.25);
  });

  it('someone who gets everything right reaches the top, and everything wrong the bottom', () => {
    expect(difficultyAfter(0.2, Array(30).fill(true))).toBe(1);
    expect(difficultyAfter(0.9, Array(10).fill(false))).toBe(0);
    expect(successRate([])).toBeNull();
    expect(successRate([true, false, true, true])).toBe(0.75);
  });
});

describe('where a learner starts', () => {
  const record = (history: number[], data?: { d: number }) => ({ ...emptySkill(0), history, ...(data ? { data } : {}) });

  it('without history: by level', () => {
    expect(startingDifficulty('beginner')).toBe(START_DIFFICULTY.beginner);
    expect(startingDifficulty('expert', [null, undefined])).toBe(START_DIFFICULTY.expert);
    expect(START_DIFFICULTY.beginner).toBeLessThan(START_DIFFICULTY.intermediate);
    expect(START_DIFFICULTY.intermediate).toBeLessThan(START_DIFFICULTY.expert);
  });

  it('uses the difficulty the last session on the skill ended at', () => {
    expect(startingDifficulty('beginner', [record([90, 100], { d: 0.62 })])).toBe(0.62);
    expect(storedDifficulty(record([], { d: 0.4 }))).toBe(0.4);
    expect(storedDifficulty(record([], { d: 7 }))).toBe(1);
    expect(storedDifficulty(record([]))).toBeNull();
    expect(storedDifficulty({ data: 'x' })).toBeNull();
    expect(storedDifficulty({ data: [1] })).toBeNull();
    expect(storedDifficulty(null)).toBeNull();
  });

  it('otherwise shifts the level\'s start by how far recent accuracy sits from 80 %', () => {
    expect(startingDifficulty('beginner', [record([80, 80, 80])])).toBeCloseTo(0.2);
    expect(startingDifficulty('beginner', [record([100, 100, 100])])).toBeCloseTo(0.4);
    expect(startingDifficulty('intermediate', [record([60, 60])])).toBeCloseTo(0.25);
    expect(startingDifficulty('beginner', [record([20])])).toBe(0);
    // Only the last five results count.
    expect(startingDifficulty('beginner', [record([0, 0, 0, 100, 100, 100, 100, 100])])).toBeCloseTo(0.4);
  });

  it('averages several skills (a unit drill)', () => {
    expect(startingDifficulty('beginner', [record([], { d: 0.2 }), record([], { d: 0.6 }), null])).toBeCloseTo(0.4);
  });
});

describe('difficulty reaches the generators', () => {
  it('harder drills draw from more of each pool', () => {
    const keys = (difficulty: number): Set<string> => {
      const seen = new Set<string>();
      for (let seed = 0; seed < 200; seed++) {
        const exercise = generateStrict({ generate: 'key-signature', params: { ask: 'key', maxAccidentals: 7 } }, { seed, difficulty });
        if (exercise.type === 'choice') seen.add(String(exercise.options.find((o) => o.correct)!.text));
      }
      return seen;
    };
    const easy = keys(0);
    const hard = keys(1);
    expect(easy.size).toBeLessThan(hard.size);
    expect([...easy].every((k) => hard.has(k))).toBe(true);
    expect(hard.size).toBe(15);
  });
});

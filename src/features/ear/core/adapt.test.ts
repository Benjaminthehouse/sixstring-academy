import { describe, expect, it } from 'vitest';
import { TARGET_SUCCESS, difficultyFor, emptyRecord, pickWeights, readRecord, recentSuccess, recordAnswer, strengths, weakSpots, type EarRecord } from './adapt';
import { DRILLS } from './drills';
import { makeRng } from './rng';
import { answerQuestion, createRound, nextQuestion, scoreRound, starsFor } from './round';
import { DEFAULT_SETTINGS } from './settings';
import { continueStep, currentLevel, levelSkillId, levelStatuses, stepAfter, type SkillMap } from './progress';
import { melodic, slower, spread, together, planNotes } from './sound';

describe('confusion record', () => {
  it('counts answers and confusions', () => {
    let r = emptyRecord();
    r = recordAnswer(r, 'm6', 'M6');
    r = recordAnswer(r, 'm6', 'm6');
    r = recordAnswer(r, 'P5', 'P5');
    expect(r.items).toEqual({ m6: [2, 1], P5: [1, 1] });
    expect(r.mix).toEqual({ 'm6>M6': 1 });
    expect(r.recent).toBe('011');
  });

  it('stays small however long the learner practises', () => {
    let r = emptyRecord();
    const rng = makeRng(3);
    const pool = ['m2', 'M2', 'm3', 'M3', 'P4', 'A4', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8'];
    for (let i = 0; i < 5000; i++) r = recordAnswer(r, rng.pick(pool), rng.pick(pool));
    expect(JSON.stringify(r).length).toBeLessThan(4000);
    expect(r.recent.length).toBeLessThanOrEqual(24);
  });

  it('reads stored data defensively', () => {
    expect(readRecord(null)).toEqual(emptyRecord());
    expect(readRecord({ items: { a: [3, 9], b: 'x' }, mix: { 'a>b': 2, bad: 4, 'c>d': -1 }, recent: '10x1' })).toEqual({ v: 1, items: { a: [3, 3] }, mix: { 'a>b': 2 }, recent: '101' });
  });

  it('puts weak spots into plain words', () => {
    let r = emptyRecord();
    for (let i = 0; i < 3; i++) r = recordAnswer(r, 'm6', 'M6');
    r = recordAnswer(r, 'P5', 'P4');
    const spots = weakSpots(DRILLS['intervals-up'], r);
    expect(spots).toHaveLength(1);
    expect(spots[0].sentence).toBe('You often hear a minor 6th as a major 6th.');
    expect(weakSpots(DRILLS.chords, recordAnswer(recordAnswer(emptyRecord(), 'm7', '7'), 'm7', '7'))[0].sentence).toBe('You often hear a minor 7th chord as a dominant 7th chord.');
    expect(weakSpots(DRILLS['intervals-up'], recordAnswer(recordAnswer(emptyRecord(), 'P8', 'm9'), 'P8', 'm9'))[0].sentence).toBe('You often hear an octave as a minor 9th.');
  });

  it('names the answers the learner is sure of', () => {
    let r = emptyRecord();
    for (let i = 0; i < 8; i++) r = recordAnswer(r, 'P5', 'P5');
    for (let i = 0; i < 8; i++) r = recordAnswer(r, 'm6', i % 2 ? 'm6' : 'M6');
    expect(strengths(r, ['P5', 'm6'])).toEqual(['P5']);
  });
});

describe('adaptive picking', () => {
  it('asks more of what is confused, and of what it is confused with', () => {
    let r = emptyRecord();
    const pool = ['m3', 'M3', 'P4', 'P5', 'm6', 'M6', 'P8'];
    for (const id of pool) for (let i = 0; i < 6; i++) r = recordAnswer(r, id, id);
    for (let i = 0; i < 4; i++) r = recordAnswer(r, 'm6', 'M6');
    const w = pickWeights(pool, r, 0.85);
    const mean = w.reduce((a, b) => a + b, 0) / w.length;
    expect(w[pool.indexOf('m6')]).toBeGreaterThan(mean * 1.4);
    expect(w[pool.indexOf('M6')]).toBeGreaterThan(w[pool.indexOf('P5')]);
  });

  it('never asks the same answer three times running', () => {
    const w = pickWeights(['a', 'b'], emptyRecord(), 0.8, ['a', 'a']);
    expect(w[0]).toBe(0);
  });

  it('moves difficulty to hold success near 80 %', () => {
    expect(difficultyFor(TARGET_SUCCESS)).toBeCloseTo(0.5);
    expect(difficultyFor(1)).toBe(1);
    expect(difficultyFor(0.5)).toBe(0);
    expect(recentSuccess({ ...emptyRecord(), recent: '1111111111' })).toBeGreaterThan(0.9);
  });

  it('a simulated learner who confuses minor and major sixths gets them asked more, and the round still scores honestly', () => {
    const drill = DRILLS['intervals-up'];
    const level = drill.levels.find((l) => l.pool.includes('m6') && l.pool.includes('M6'))!;
    const rng = makeRng(42);
    let record: EarRecord = emptyRecord();
    const asked: Record<string, number> = {};
    let total = 0;
    for (let round = 0; round < 30; round++) {
      let r = createRound(drill, level, { seed: 1000 + round, settings: DEFAULT_SETTINGS, record });
      for (let i = 0; i < r.total; i++) {
        const next = nextQuestion(r);
        r = next.round;
        const q = next.question;
        if (q.kind !== 'choice') throw new Error('choice expected');
        asked[q.answer] = (asked[q.answer] ?? 0) + 1;
        total++;
        const sixth = q.answer === 'm6' || q.answer === 'M6';
        const right = rng.chance(sixth ? 0.45 : 0.97);
        r = answerQuestion(r, right ? q.answer : q.answer === 'm6' ? 'M6' : q.answer === 'M6' ? 'm6' : level.pool.find((p) => p !== q.answer)!).round;
      }
      record = r.record;
      const s = scoreRound(r);
      expect(s.answered).toBe(r.total);
    }
    const fair = total / level.pool.length;
    expect(asked.m6 + asked.M6).toBeGreaterThan(fair * 2 * 1.3);
    expect(weakSpots(drill, record)[0].sentence).toMatch(/6th as a (major|minor) 6th/);
  });
});

describe('rounds', () => {
  it('are reproducible from their seed', () => {
    const drill = DRILLS.chords;
    const level = drill.levels[2];
    const run = () => {
      let r = createRound(drill, level, { seed: 7, settings: DEFAULT_SETTINGS, record: emptyRecord() });
      const ids: string[] = [];
      for (let i = 0; i < r.total; i++) {
        const n = nextQuestion(r);
        r = answerQuestion(n.round, 'major').round;
        ids.push(n.question.id + (n.question.kind === 'choice' ? n.question.answer : ''));
      }
      return { ids, score: scoreRound(r) };
    };
    expect(run()).toEqual(run());
  });

  it('score stars at 60 / 80 / 90 % and pass at 80 %', () => {
    expect([0.5, 0.6, 0.79, 0.8, 0.89, 0.9, 1].map(starsFor)).toEqual([0, 1, 1, 2, 2, 3, 3]);
    const drill = DRILLS.pitch;
    let r = createRound(drill, drill.levels[1], { seed: 1, settings: DEFAULT_SETTINGS, record: emptyRecord() });
    for (let i = 0; i < r.total; i++) {
      const n = nextQuestion(r);
      const q = n.question;
      if (q.kind !== 'choice') throw new Error();
      r = answerQuestion(n.round, i < 8 ? q.answer : q.options.find((o) => o.id !== q.answer)!.id).round;
    }
    expect(scoreRound(r)).toMatchObject({ correct: 8, total: 10, accuracy: 0.8, stars: 2, passed: true, perfect: false, mistakes: 2 });
  });

  it('mark a melody note by note', () => {
    const drill = DRILLS.melody;
    let r = createRound(drill, drill.levels[2], { seed: 3, settings: DEFAULT_SETTINGS, record: emptyRecord() });
    const n = nextQuestion(r);
    const q = n.question;
    if (q.kind !== 'sequence') throw new Error();
    const wrong = [...q.target];
    wrong[2] = q.keys.find((k) => k.id !== q.target[2])!.id;
    const res = answerQuestion(n.round, wrong);
    expect(res.correct).toBe(false);
    expect(res.round.record.mix[`${q.target[2]}>${wrong[2]}`]).toBe(1);
    r = res.round;
    expect(scoreRound(r).mistakes).toBe(1);
  });
});

describe('progress', () => {
  const drill = DRILLS['intervals-up'];
  it('opens a level when the one before it is passed, and a passed later level opens everything below', () => {
    const none: SkillMap = {};
    expect(levelStatuses(drill, none).map((s) => s.unlocked)).toEqual([true, false, false, false, false, false, false, false]);
    expect(currentLevel(drill, none)).toBe(1);
    const some: SkillMap = { [levelSkillId('intervals-up', 1)]: { bestAccuracy: 0.8, stars: 2 }, [levelSkillId('intervals-up', 2)]: { bestAccuracy: 0.7, stars: 1 } };
    expect(levelStatuses(drill, some).map((s) => s.unlocked)).toEqual([true, true, false, false, false, false, false, false]);
    expect(currentLevel(drill, some)).toBe(2);
    const jumped: SkillMap = { [levelSkillId('intervals-up', 5)]: { bestAccuracy: 0.9, stars: 3 } };
    expect(levelStatuses(drill, jumped).map((s) => s.passed)).toEqual([true, true, true, true, true, false, false, false]);
    expect(currentLevel(drill, jumped)).toBe(6);
  });

  it('continue follows the course and skips what is passed', () => {
    expect(continueStep({})).toMatchObject({ drill: 'pitch', level: 1, done: false });
    const skills: Record<string, { bestAccuracy: number }> = { [levelSkillId('pitch', 1)]: { bestAccuracy: 1 } };
    expect(continueStep(skills)).toMatchObject({ drill: 'pitch', level: 2 });
    expect(stepAfter('pitch', 1, skills)).toEqual({ drill: 'pitch', level: 2 });
    expect(stepAfter('pitch', 6, skills)).toEqual({ drill: 'pitch', level: 2 });
  });
});

describe('sound plans', () => {
  it('slower stretches time and keeps the pitches', () => {
    const p = melodic([60, 64, 67], { gap: 0.5 });
    const s = slower(p, 2);
    expect(planNotes(s)).toEqual([60, 64, 67]);
    expect(s.events[2].at).toBeCloseTo(2);
    expect(s.length).toBeCloseTo(p.length * 2);
  });

  it('one at a time plays the notes low to high, then together', () => {
    const p = spread(together([64, 52], { dur: 2 }), 0.4);
    expect(p.events.map((e) => e.midis)).toEqual([[52], [64], [64, 52]]);
    expect(p.events[1].at).toBeCloseTo(0.4);
  });
});

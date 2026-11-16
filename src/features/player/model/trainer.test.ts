import { describe, expect, it } from 'vitest';
import { DEFAULT_TRAINER, isCleanPass, passesToTarget, sanitizeTrainer, trainerNext, trainerSummary } from './trainer';

const counts = (p: Partial<Record<'perfect' | 'good' | 'early' | 'late' | 'missed' | 'wrong', number>>) => ({ perfect: 0, good: 0, early: 0, late: 0, missed: 0, wrong: 0, ...p });

describe('speed trainer', () => {
  it('counts a pass as clean when every note was played and most were on time', () => {
    expect(isCleanPass(counts({ perfect: 6, good: 2 }))).toBe(true);
    expect(isCleanPass(counts({ perfect: 6, good: 0, early: 2 }))).toBe(true); // 75 % on time
    expect(isCleanPass(counts({ perfect: 5, early: 3 }))).toBe(false);
    expect(isCleanPass(counts({ perfect: 9, missed: 1 }))).toBe(false);
    expect(isCleanPass(counts({ perfect: 9, wrong: 1 }))).toBe(false);
    expect(isCleanPass(counts({}))).toBe(false); // nothing played
    expect(isCleanPass(null)).toBe(true); // nothing judged (no microphone): every pass counts
  });

  it('adds a step after a clean pass, up to the target, and waits after a messy one', () => {
    const s = { ...DEFAULT_TRAINER, on: true };
    let p = 70;
    const seen: number[] = [];
    for (const clean of [true, false, true, true, true, true, true, true]) {
      const r = trainerNext(p, s, clean);
      p = r.percent;
      seen.push(p);
    }
    expect(seen).toEqual([75, 75, 80, 85, 90, 95, 100, 100]);
    expect(trainerNext(95, s, true)).toEqual({ percent: 100, changed: true, reached: true });
    expect(trainerNext(100, s, true)).toEqual({ percent: 100, changed: false, reached: true });
    expect(trainerNext(97, { ...s, step: 5 }, true).percent).toBe(100);
  });

  it('does nothing while switched off', () => {
    expect(trainerNext(70, DEFAULT_TRAINER, true)).toEqual({ percent: 70, changed: false, reached: false });
  });

  it('reads stored settings safely', () => {
    expect(sanitizeTrainer(null)).toEqual(DEFAULT_TRAINER);
    expect(sanitizeTrainer({ on: true, start: 10, step: 99, target: 500 })).toEqual({ on: true, start: 25, step: 25, target: 150 });
    expect(sanitizeTrainer({ start: 90, target: 60 })).toMatchObject({ start: 90, target: 90 });
  });

  it('says how it works and how long it takes', () => {
    expect(trainerSummary(DEFAULT_TRAINER, true)).toBe('From 70 % to 100 %, 5 % faster after each clean loop');
    expect(trainerSummary(DEFAULT_TRAINER, false)).toBe('From 70 % to 100 %, 5 % faster each time round');
    expect(passesToTarget(DEFAULT_TRAINER)).toBe(6);
    expect(passesToTarget({ ...DEFAULT_TRAINER, start: 100 })).toBe(0);
  });
});

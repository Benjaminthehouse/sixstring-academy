import { describe, expect, it } from 'vitest';
import {
  ACCURACY_HISTORY,
  HALF_LIFE_DAYS,
  MASTERY_RULES,
  MAX_SKILL_DATA_CHARS,
  applyAttempt,
  isRusty,
  nextCrown,
  skillStrength,
  starsForAccuracy,
  strengthLabel,
} from './skills';
import { masterySummary, rustySkills, skillView, skillsWithPrefix } from './selectors';
import { makeRig } from './testkit';
import type { SkillRecord } from './types';

const DAY = 86_400_000;

function attempts(n: number, accuracy: number | undefined, start?: SkillRecord): SkillRecord {
  let record = start;
  for (let i = 0; i < n; i++) record = applyAttempt(record, { accuracy, completed: true }, 1000 + i).record;
  return record as SkillRecord;
}

describe('mastery rules', () => {
  it('lists five crowns with rising demands', () => {
    expect(MASTERY_RULES.map((r) => r.level)).toEqual([1, 2, 3, 4, 5]);
    for (let i = 1; i < MASTERY_RULES.length; i++) {
      expect(MASTERY_RULES[i].minAccuracy).toBeGreaterThan(MASTERY_RULES[i - 1].minAccuracy);
      expect(MASTERY_RULES[i].reps).toBeGreaterThanOrEqual(MASTERY_RULES[i - 1].reps);
    }
  });

  it('gives the first crown for one finished attempt at 60 %', () => {
    expect(attempts(1, 0.59).mastery).toBe(0);
    expect(attempts(1, 0.6).mastery).toBe(1);
  });

  it('gives the first crown, and only the first, for finished attempts without measured accuracy', () => {
    expect(attempts(1, undefined).mastery).toBe(1);
    expect(attempts(30, undefined).mastery).toBe(1);
  });

  it('needs the listed number of qualifying attempts for each further crown', () => {
    let record = attempts(1, 1); // crown 1
    expect(record.mastery).toBe(1);
    record = attempts(1, 1, record);
    expect(record).toMatchObject({ mastery: 1, reps: 1 });
    record = attempts(1, 1, record);
    expect(record).toMatchObject({ mastery: 2, reps: 0 });
    record = attempts(2, 1, record);
    expect(record.mastery).toBe(3);
    record = attempts(3, 1, record);
    expect(record.mastery).toBe(4);
    record = attempts(2, 1, record);
    expect(record.mastery).toBe(4);
    record = attempts(1, 1, record);
    expect(record.mastery).toBe(5);
    // 1 + 2 + 2 + 3 + 3 attempts in total, and it stops there.
    expect(record.attempts).toBe(11);
    expect(attempts(5, 1, record).mastery).toBe(5);
  });

  it('only counts attempts that are accurate enough for the next crown', () => {
    // 75 % is enough for crown 2 (70 %) but never for crown 3 (80 %).
    const record = attempts(40, 0.75);
    expect(record.mastery).toBe(2);
    expect(record.reps).toBe(0);
    expect(attempts(2, 0.8, record).mastery).toBe(3);
  });

  it('never earns more than one crown per attempt, and failed attempts earn nothing', () => {
    expect(applyAttempt(undefined, { accuracy: 1, completed: true }, 1).record.mastery).toBe(1);
    const failed = applyAttempt(undefined, { accuracy: 1, completed: false }, 1).record;
    expect(failed).toMatchObject({ mastery: 0, attempts: 1, completions: 0, completed: false });
  });

  it('never takes crowns away', () => {
    const strong = attempts(11, 1);
    expect(attempts(20, 0.1, strong).mastery).toBe(5);
  });

  it('lets a screen set a floor with masteryAtLeast', () => {
    const { record } = applyAttempt(undefined, { completed: true, masteryAtLeast: 3 }, 1);
    expect(record.mastery).toBe(3);
    expect(applyAttempt(record, { completed: true, masteryAtLeast: 1 }, 2).record.mastery).toBe(3);
  });

  it('tells what the next crown takes', () => {
    expect(nextCrown(undefined)).toEqual({ level: 1, repsLeft: 1, minAccuracy: 0.6 });
    expect(nextCrown(attempts(2, 1))).toEqual({ level: 2, repsLeft: 1, minAccuracy: 0.7 });
    expect(nextCrown(attempts(11, 1))).toBeNull();
  });
});

describe('scores, stars and history', () => {
  it('tracks best and last score and accuracy', () => {
    let out = applyAttempt(undefined, { score: 120, accuracy: 0.7, completed: true, durationSec: 30 }, 1);
    expect(out).toMatchObject({ newBest: true, firstCompletion: true });
    out = applyAttempt(out.record, { score: 90, accuracy: 0.9, completed: true, durationSec: 45 }, 2);
    expect(out.newBest).toBe(false);
    expect(out.firstCompletion).toBe(false);
    expect(out.record).toMatchObject({ bestScore: 120, lastScore: 90, bestAccuracy: 0.9, lastAccuracy: 0.9, attempts: 2, completions: 2, timeSec: 75 });
    out = applyAttempt(out.record, { score: 300, accuracy: 0.2, completed: false }, 3);
    expect(out.record).toMatchObject({ bestScore: 120, lastScore: 300, bestAccuracy: 0.9, lastAccuracy: 0.2, attempts: 3, completions: 2 });
  });

  it('keeps a bounded accuracy history in percent, oldest first', () => {
    let record: SkillRecord | undefined;
    for (let i = 0; i < ACCURACY_HISTORY + 15; i++) record = applyAttempt(record, { accuracy: (i % 100) / 100, completed: true }, i).record;
    expect(record?.history).toHaveLength(ACCURACY_HISTORY);
    expect(record?.history[ACCURACY_HISTORY - 1]).toBe(ACCURACY_HISTORY + 14);
    expect(record?.history[0]).toBe(15);
  });

  it('keeps the best stars', () => {
    let record = applyAttempt(undefined, { stars: 2, completed: true }, 1).record;
    record = applyAttempt(record, { stars: 1, completed: true }, 2).record;
    expect(record.stars).toBe(2);
    record = applyAttempt(record, { stars: 3, completed: false }, 3).record;
    expect(record.stars).toBe(2); // a failed attempt earns no stars
    record = applyAttempt(record, { stars: 3, completed: true }, 4).record;
    expect(record.stars).toBe(3);
  });

  it('maps accuracy to stars', () => {
    expect([0.2, 0.6, 0.79, 0.8, 0.94, 0.95, 1].map(starsForAccuracy)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });

  it('counts perfect runs', () => {
    let record = applyAttempt(undefined, { completed: true, perfect: true }, 1).record;
    record = applyAttempt(record, { completed: true }, 2).record;
    record = applyAttempt(record, { completed: true, perfect: true }, 3).record;
    expect(record.perfects).toBe(2);
  });

  it('does not mutate the previous record', () => {
    const first = Object.freeze({ ...applyAttempt(undefined, { accuracy: 0.9, completed: true }, 1).record, history: Object.freeze([90]) as unknown as number[] });
    const second = applyAttempt(first, { accuracy: 0.5, completed: true }, 2).record;
    expect(first.history).toEqual([90]);
    expect(second.history).toEqual([90, 50]);
  });
});

describe('strength and rust', () => {
  it('is full right after practice and halves every half-life', () => {
    const record = attempts(1, 1); // crown 1, half-life 4 days
    const t = record.lastAt;
    expect(skillStrength(record, t)).toBe(1);
    expect(skillStrength(record, t + HALF_LIFE_DAYS[1] * DAY)).toBeCloseTo(0.5);
    expect(skillStrength(record, t + 2 * HALF_LIFE_DAYS[1] * DAY)).toBeCloseTo(0.25);
    expect(skillStrength(undefined, t)).toBe(0);
  });

  it('fades more slowly the more crowns a skill has', () => {
    for (let i = 1; i < HALF_LIFE_DAYS.length; i++) expect(HALF_LIFE_DAYS[i]).toBeGreaterThan(HALF_LIFE_DAYS[i - 1]);
    const weak = attempts(1, 1);
    const strong = attempts(11, 1);
    const later = strong.lastAt + 10 * DAY;
    expect(skillStrength(strong, later)).toBeGreaterThan(skillStrength(weak, later));
  });

  it('calls a learned skill rusty below half strength, and fresh again after practice', () => {
    const record = attempts(3, 1); // crown 2, half-life 7 days
    const t = record.lastAt;
    expect(strengthLabel(record, t + DAY)).toBe('fresh');
    expect(strengthLabel(record, t + 5 * DAY)).toBe('fading');
    expect(isRusty(record, t + 6.9 * DAY)).toBe(false);
    expect(isRusty(record, t + 7.1 * DAY)).toBe(true);
    expect(strengthLabel(record, t + 8 * DAY)).toBe('rusty');
    const again = applyAttempt(record, { accuracy: 0.9, completed: true }, t + 8 * DAY).record;
    expect(isRusty(again, t + 8 * DAY)).toBe(false);
    expect(skillStrength(again, t + 8 * DAY)).toBe(1);
  });

  it('never calls an unlearned skill rusty', () => {
    const tried = applyAttempt(undefined, { accuracy: 0.2, completed: true }, 0).record;
    expect(tried.mastery).toBe(0);
    expect(isRusty(tried, 100 * DAY)).toBe(false);
    expect(strengthLabel(undefined, 0)).toBe('new');
  });
});

describe('skills in the store', () => {
  it('updates the registry from recordActivity and announces crowns', () => {
    const rig = makeRig();
    const id = 'scale:a-minor-pentatonic:box-1';
    const result = rig.actions.recordActivity({ kind: 'scale-practice', id, title: 'A minor pentatonic, box 1', accuracy: 0.9, score: 42, durationSec: 90 });
    expect(result.skill).toEqual({ id, mastery: 1, masteryBefore: 0, stars: 0, starsBefore: 0, bestScore: 42, newBest: true, firstCompletion: true, attempts: 1 });
    expect(rig.eventsOf('skill-levelled-up')).toEqual([{ type: 'skill-levelled-up', at: rig.clock.t, id, from: 0, to: 1, title: 'A minor pentatonic, box 1' }]);
    expect(rig.store.getState().skills[id]).toMatchObject({ attempts: 1, bestScore: 42, timeSec: 90, completed: true, history: [90] });

    rig.actions.recordActivity({ kind: 'scale-practice', id, accuracy: 0.9 });
    rig.actions.recordActivity({ kind: 'scale-practice', id, accuracy: 0.9 });
    expect(rig.store.getState().skills[id].mastery).toBe(2);
    expect(rig.eventsOf('skill-levelled-up').map((e) => e.to)).toEqual([1, 2]);
  });

  it('derives stars from accuracy for scale games and takes explicit stars elsewhere', () => {
    const rig = makeRig();
    expect(rig.actions.recordActivity({ kind: 'scale-game', id: 'arcade:fret-rush:1', accuracy: 0.85 }).skill).toMatchObject({ stars: 2, starsBefore: 0 });
    expect(rig.actions.recordActivity({ kind: 'scale-game', id: 'arcade:fret-rush:1', accuracy: 0.97 }).skill).toMatchObject({ stars: 3, starsBefore: 2 });
    expect(rig.actions.recordActivity({ kind: 'song', id: 'song:greensleeves', accuracy: 0.97 }).skill?.stars).toBe(0);
    expect(rig.actions.recordActivity({ kind: 'song', id: 'song:greensleeves', accuracy: 0.97, stars: 3 }).skill?.stars).toBe(3);
  });

  it('reports rusty skills weakest first and lets practice fix them', () => {
    const rig = makeRig();
    rig.actions.recordActivity({ kind: 'scale-practice', id: 'scale:c-major:pos-1', accuracy: 0.9 });
    rig.clock.days(3);
    rig.actions.recordActivity({ kind: 'chord-practice', id: 'chord:g', accuracy: 0.9 });
    rig.clock.days(3);
    const state = rig.store.getState();
    // Crown 1 halves in 4 days: the scale (6 days old) is rusty, the chord (3 days old) is not.
    expect(rustySkills(state, rig.clock.t).map((s) => s.id)).toEqual(['scale:c-major:pos-1']);
    expect(skillView(state, 'chord:g', rig.clock.t)).toMatchObject({ rusty: false, label: 'fading', mastery: 1 });
    rig.clock.days(3);
    expect(rustySkills(rig.store.getState(), rig.clock.t).map((s) => s.id)).toEqual(['scale:c-major:pos-1', 'chord:g']);
    expect(rustySkills(rig.store.getState(), rig.clock.t, { prefix: 'chord:' }).map((s) => s.id)).toEqual(['chord:g']);
    expect(rustySkills(rig.store.getState(), rig.clock.t, { limit: 1 })).toHaveLength(1);

    rig.actions.recordActivity({ kind: 'scale-practice', id: 'scale:c-major:pos-1', accuracy: 0.9 });
    expect(rustySkills(rig.store.getState(), rig.clock.t).map((s) => s.id)).toEqual(['chord:g']);
  });

  it('stores small JSON for the owning screen and rejects oversized or unserialisable data', () => {
    const rig = makeRig();
    rig.actions.setSkillData('song:greensleeves', { tempo: 80, loop: [4, 8], hands: 'both' });
    expect(rig.store.getState().skills['song:greensleeves'].data).toEqual({ tempo: 80, loop: [4, 8], hands: 'both' });
    expect(rig.store.getState().skills['song:greensleeves'].attempts).toBe(0);

    rig.actions.recordActivity({ kind: 'song', id: 'song:greensleeves', data: { tempo: 96 } });
    expect(rig.store.getState().skills['song:greensleeves'].data).toEqual({ tempo: 96 });

    rig.actions.recordActivity({ kind: 'song', id: 'song:greensleeves', data: 'x'.repeat(MAX_SKILL_DATA_CHARS + 10) });
    expect(rig.store.getState().skills['song:greensleeves'].data).toEqual({ tempo: 96 });

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    rig.actions.setSkillData('song:greensleeves', circular as never);
    expect(rig.store.getState().skills['song:greensleeves'].data).toBeUndefined();
  });

  it('marks flags without recording an attempt', () => {
    const rig = makeRig();
    rig.actions.markSkill('fretboard:string-6', { completed: true });
    rig.actions.markSkill('teacher:mia:course', { completed: true, masteryAtLeast: 1 });
    const state = rig.store.getState();
    expect(state.skills['fretboard:string-6']).toMatchObject({ completed: true, attempts: 0, mastery: 0 });
    expect(state.skills['teacher:mia:course']).toMatchObject({ completed: true, mastery: 1 });
    expect(state.days[state.meta.today]).toBeUndefined(); // no XP, no log, no active day
    expect(state.achievements['string-1']).toBeDefined();
    expect(state.achievements['mia-course']).toBeDefined();
    expect(skillView(state, 'teacher:mia:course', rig.clock.t).strength).toBe(1);
  });

  it('summarises by prefix', () => {
    const rig = makeRig();
    rig.actions.recordActivity({ kind: 'scale-game', id: 'scale:a-minor-pentatonic:box-1', accuracy: 1 });
    rig.actions.recordActivity({ kind: 'scale-game', id: 'scale:a-minor-pentatonic:box-2', accuracy: 0.3 });
    rig.actions.recordActivity({ kind: 'song', id: 'song:greensleeves' });
    const state = rig.store.getState();
    expect(skillsWithPrefix(state, 'scale:').map(([id]) => id)).toEqual(['scale:a-minor-pentatonic:box-1', 'scale:a-minor-pentatonic:box-2']);
    expect(masterySummary(state, 'scale:')).toEqual({ skills: 2, completed: 2, crowns: 1, stars: 3, mastered: 0 });
    expect(masterySummary(state)).toMatchObject({ skills: 3, crowns: 2 });
  });

  it('ignores unusable ids', () => {
    const rig = makeRig();
    rig.actions.recordActivity({ kind: 'song', id: '', xp: 5 });
    rig.actions.recordActivity({ kind: 'song', id: '__proto__', xp: 5 });
    rig.actions.recordActivity({ kind: 'song', id: 'x'.repeat(500), xp: 5 });
    expect(Object.keys(rig.store.getState().skills)).toEqual([]);
    expect(rig.store.getState().xp.total).toBe(15);
    expect(({} as Record<string, unknown>).attempts).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, achievementCtx, achievementViews, newlyEarned, summariseSkills } from './achievements';
import { ACHIEVEMENT_GEMS, ACTIVITY_KINDS, AVATARS, CONSUMABLES } from './catalog';
import { createInitialState } from './defaults';
import { DAILY_QUESTS, WEEKLY_QUESTS } from './quests';
import { selectAchievements } from './selectors';
import { at, makeRig, type TestRig } from './testkit';
import type { ActivityInput, TeacherId } from './types';

describe('achievement catalog', () => {
  it('has at least 50 achievements with unique ids and names', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(50);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    expect(new Set(ACHIEVEMENTS.map((a) => a.name)).size).toBe(ACHIEVEMENTS.length);
  });

  it('is well formed', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(a.name.length).toBeGreaterThan(2);
      expect(a.description.length).toBeGreaterThan(8);
      expect(a.description.endsWith('.')).toBe(true);
      expect(a.name + a.description).not.toMatch(/!/);
      expect(['bronze', 'silver', 'gold', 'platinum']).toContain(a.tier);
      expect(a.target).toBeGreaterThan(0);
      expect(typeof a.secret).toBe('boolean');
      expect(a.icon).toMatch(/^[A-Z][A-Za-z0-9]+$/);
    }
    expect(ACHIEVEMENTS.some((a) => a.secret)).toBe(true);
    for (const tier of ['bronze', 'silver', 'gold', 'platinum'] as const) expect(ACHIEVEMENTS.some((a) => a.tier === tier)).toBe(true);
  });

  it('covers the required themes', () => {
    const has = (id: string) => expect(ACHIEVEMENT_BY_ID[id], id).toBeDefined();
    ['first-tune', 'first-camera', 'first-scan', 'night-owl', 'early-bird', 'pentatonic-boxes', 'string-1', 'strings-6'].forEach(has);
    [3, 7, 14, 30, 50, 100, 200, 365].forEach((n) => has(`streak-${n}`));
    ['xp-100', 'xp-1000', 'xp-10000', 'scales-solid-5', 'chords-5', 'chords-15', 'songs-5', 'perfect-1', 'time-1h', 'time-100h'].forEach(has);
    for (const teacher of ['mia', 'dev', 'elena']) [`${teacher}-1`, `${teacher}-10`, `${teacher}-course`].forEach(has);
  });

  it('uses icon names that exist in lucide-react', async () => {
    const lucide = (await import('lucide-react')) as unknown as Record<string, unknown>;
    const names = new Set<string>([
      ...ACHIEVEMENTS.map((a) => a.icon),
      ...DAILY_QUESTS.map((q) => q.icon),
      ...WEEKLY_QUESTS.map((q) => q.icon),
      ...AVATARS.map((a) => a.icon),
      ...CONSUMABLES.map((c) => c.icon),
      ...Object.values(ACTIVITY_KINDS).map((k) => k.icon),
      'Flag',
    ]);
    const missing = [...names].filter((name) => lucide[name] === undefined);
    expect(missing).toEqual([]);
  });

  it('starts with nothing unlocked and no progress', () => {
    const state = createInitialState({ now: at('2026-01-05T10:00:00Z'), timeZone: 'UTC' });
    expect(newlyEarned(state)).toEqual([]);
    for (const view of achievementViews(state)) {
      expect(view.unlocked).toBe(false);
      expect(view.at).toBeNull();
      expect(view.fraction, view.id).toBeGreaterThanOrEqual(0);
      expect(view.fraction, view.id).toBeLessThan(1);
      expect(view.hidden).toBe(ACHIEVEMENT_BY_ID[view.id].secret);
      expect(view.gems).toBe(ACHIEVEMENT_GEMS[view.tier]);
    }
  });
});

describe('skill summary', () => {
  const skill = (mastery: number, extra: object = {}) => ({ ...createSkill(), mastery, ...extra });
  const createSkill = () => ({ attempts: 1, completions: 1, perfects: 0, bestScore: 0, lastScore: 0, bestAccuracy: 0, lastAccuracy: 0, history: [], timeSec: 0, mastery: 0, reps: 0, stars: 0, completed: true, firstAt: 0, lastAt: 0, completedAt: 0 });

  it('needs all five boxes of ONE pentatonic scale', () => {
    const spread = summariseSkills({
      'scale:a-minor-pentatonic:box-1': skill(1),
      'scale:a-minor-pentatonic:box-2': skill(1),
      'scale:a-minor-pentatonic:box-3': skill(1),
      'scale:e-minor-pentatonic:box-4': skill(1),
      'scale:e-minor-pentatonic:box-5': skill(1),
    } as never);
    expect(spread.pentatonicBoxes).toBe(3);
    const whole = summariseSkills(Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`scale:g-major-pentatonic:box-${n}`, skill(n === 5 ? 1 : 3)])) as never);
    expect(whole.pentatonicBoxes).toBe(5);
    expect(whole.pentatonicBoxesSolid).toBe(4);
    // Other scales and positions do not count as pentatonic boxes.
    expect(summariseSkills({ 'scale:c-major:box-1': skill(5), 'scale:a-minor-pentatonic:box-6': skill(5), 'scale:a-minor-pentatonic:full': skill(5) } as never).pentatonicBoxes).toBe(0);
  });

  it('counts by id prefix', () => {
    const summary = summariseSkills({
      'scale:c-major:pos-1': skill(3),
      'scale:d-dorian:pos-2': skill(0),
      'chord:g': skill(1),
      'chord:c': skill(0, { completed: false }),
      'chord-change:g-c': skill(2),
      'chord-change:c-d': skill(1),
      'song:greensleeves': skill(1, { stars: 3 }),
      'song:scarborough-fair': skill(0, { completed: false, stars: 1 }),
      'theory:unit-1:lesson-1': skill(1),
      'fretboard:string-6': skill(0),
      'fretboard:notes': skill(4),
      'teacher:dev:course': skill(0),
      'teacher:dev:lesson-1': skill(1),
    } as never);
    expect(summary).toMatchObject({
      scalesLearned: 1,
      scalesSolid: 1,
      chordsLearned: 1,
      chordChangesSolid: 1,
      songsCompleted: 1,
      songsThreeStars: 1,
      theoryLessons: 1,
      stringsLearned: 1,
      stars: 4,
      threeStarSkills: 1,
      maxMastery: 4,
      teacherCourse: { mia: false, dev: true, elena: false },
    });
    expect(summary.crowns).toBe(3 + 1 + 2 + 1 + 1 + 1 + 4 + 1);
  });
});

describe('achievement conditions', () => {
  const unlocked = (rig: TestRig) => Object.keys(rig.store.getState().achievements);

  it('unlocks first-use achievements on the first completed activity of a kind, with event and gems', () => {
    const rig = makeRig();
    const result = rig.actions.recordActivity({ kind: 'tuner', durationSec: 45 });
    expect(result.achievements).toEqual(['first-tune']);
    expect(rig.eventsOf('achievement-unlocked')).toEqual([
      { type: 'achievement-unlocked', at: rig.clock.t, id: 'first-tune', name: 'In Tune', tier: 'bronze', icon: 'Gauge', gems: ACHIEVEMENT_GEMS.bronze },
    ]);
    expect(rig.store.getState().achievements['first-tune']).toEqual({ at: rig.clock.t });
    expect(rig.store.getState().gems.balance).toBeGreaterThanOrEqual(ACHIEVEMENT_GEMS.bronze);
    // Once only.
    rig.actions.recordActivity({ kind: 'tuner' });
    expect(rig.eventsOf('achievement-unlocked').filter((e) => e.id === 'first-tune')).toHaveLength(1);

    const firsts: Array<[ActivityInput['kind'], string]> = [
      ['camera', 'first-camera'],
      ['scan', 'first-scan'],
      ['metronome', 'first-metronome'],
      ['review', 'first-review'],
      ['ear', 'first-ear'],
      ['rhythm', 'first-rhythm'],
      ['technique', 'first-technique'],
      ['progression', 'first-progression'],
      ['scale-game', 'first-game'],
      ['song', 'first-song'],
      ['theory-lesson', 'first-lesson'],
    ];
    for (const [kind, id] of firsts) {
      expect(unlocked(rig)).not.toContain(id);
      rig.actions.recordActivity({ kind, completed: false });
      expect(unlocked(rig), `${id} must need a completed activity`).not.toContain(id);
      rig.actions.recordActivity({ kind });
      expect(unlocked(rig)).toContain(id);
    }
  });

  it('unlocks time-of-day secrets by local hour', () => {
    const cases: Array<[string, string, string[]]> = [
      ['2026-03-02T21:59:00Z', 'UTC', []],
      ['2026-03-02T22:00:00Z', 'UTC', ['night-owl']],
      ['2026-03-02T03:59:00Z', 'UTC', ['night-owl']],
      ['2026-03-02T04:30:00Z', 'UTC', []],
      ['2026-03-02T05:00:00Z', 'UTC', ['early-bird']],
      ['2026-03-02T07:59:00Z', 'UTC', ['early-bird']],
      ['2026-03-02T08:00:00Z', 'UTC', []],
      // 21:30 UTC is 22:30 in Berlin and 06:30 the next morning in Tokyo.
      ['2026-03-02T21:30:00Z', 'Europe/Berlin', ['night-owl']],
      ['2026-03-02T21:30:00Z', 'Asia/Tokyo', ['early-bird']],
    ];
    for (const [start, timeZone, expected] of cases) {
      const rig = makeRig({ start, timeZone });
      rig.actions.recordActivity({ kind: 'other' });
      expect(unlocked(rig).filter((id) => id === 'night-owl' || id === 'early-bird'), `${start} ${timeZone}`).toEqual(expected);
    }
  });

  it('unlocks the weekend secret for a Saturday followed by its Sunday', () => {
    const rig = makeRig({ start: '2026-03-06T12:00:00Z' }); // Friday
    rig.actions.recordActivity({ kind: 'other' });
    rig.clock.days(2); // Sunday, Saturday skipped
    rig.actions.recordActivity({ kind: 'other' });
    expect(unlocked(rig)).not.toContain('weekend');
    rig.clock.days(6); // next Saturday
    rig.actions.recordActivity({ kind: 'other' });
    expect(unlocked(rig)).not.toContain('weekend');
    rig.clock.days(1); // Sunday
    rig.actions.recordActivity({ kind: 'other' });
    rig.actions.recordActivity({ kind: 'other' });
    expect(unlocked(rig)).toContain('weekend');
    expect(rig.store.getState().stats.weekends).toBe(1);
  });

  it('unlocks the comeback secret after a week away, not after six days', () => {
    const rig = makeRig();
    rig.actions.recordActivity({ kind: 'other' });
    rig.clock.days(6);
    rig.actions.recordActivity({ kind: 'other' });
    expect(unlocked(rig)).not.toContain('comeback');
    rig.clock.days(7);
    rig.actions.recordActivity({ kind: 'other' });
    expect(unlocked(rig)).toContain('comeback');
  });

  it('unlocks streak achievements on the day the streak reaches them', () => {
    const rig = makeRig();
    for (let day = 1; day <= 14; day++) {
      rig.actions.recordActivity({ kind: 'other', xp: 20 });
      for (const n of [3, 7, 14]) expect(unlocked(rig).includes(`streak-${n}`), `streak-${n} on day ${day}`).toBe(day >= n);
      rig.clock.days(1);
    }
    expect(unlocked(rig)).toContain('goal-1');
    expect(unlocked(rig)).not.toContain('streak-30');
  });

  it('unlocks the overachiever at twice the goal', () => {
    const rig = makeRig();
    rig.actions.recordActivity({ kind: 'other', xp: 39 });
    expect(unlocked(rig)).not.toContain('overachiever');
    rig.actions.recordActivity({ kind: 'other', xp: 1 });
    expect(unlocked(rig)).toContain('overachiever');
  });

  it('counts teacher lessons per teacher, from the skill id or the chosen teacher', () => {
    const rig = makeRig();
    rig.actions.recordActivity({ kind: 'teacher-lesson', id: 'teacher:dev:lesson-1' });
    expect(unlocked(rig)).toContain('dev-1');
    expect(unlocked(rig)).not.toContain('mia-1');
    rig.actions.recordActivity({ kind: 'teacher-lesson' }); // no id: the profile's teacher (Mia by default)
    expect(unlocked(rig)).toContain('mia-1');
    rig.actions.markSkill('teacher:elena:course', { completed: true });
    expect(unlocked(rig)).toContain('elena-course');
    expect(unlocked(rig)).not.toContain('elena-1');
  });

  it('pays perfect-lesson gems once per lesson and counts every perfect lesson', () => {
    const rig = makeRig();
    const first = rig.actions.recordActivity({ kind: 'theory-lesson', id: 'theory:unit-1:lesson-1', mistakes: 0 });
    expect(first.achievements).toContain('perfect-1');
    const reasons = () => rig.eventsOf('gems-changed').filter((e) => e.reason === 'perfect-lesson');
    expect(reasons()).toHaveLength(1);
    rig.actions.recordActivity({ kind: 'theory-lesson', id: 'theory:unit-1:lesson-1', mistakes: 0 });
    expect(reasons()).toHaveLength(1);
    rig.actions.recordActivity({ kind: 'theory-lesson', id: 'theory:unit-1:lesson-2', accuracy: 1 });
    expect(reasons()).toHaveLength(2);
    rig.actions.recordActivity({ kind: 'theory-lesson', id: 'theory:unit-1:lesson-3', mistakes: 2 });
    expect(rig.store.getState().stats['lessons.perfect']).toBe(3);
  });

  it('shows progress toward locked achievements and hides secrets until earned', () => {
    const rig = makeRig({ start: '2026-03-02T12:00:00Z' });
    for (let i = 0; i < 4; i++) rig.actions.recordActivity({ kind: 'theory-lesson', xp: 10 });
    const view = selectAchievements(rig.store.getState());
    const byId = Object.fromEntries(view.list.map((a) => [a.id, a]));
    expect(byId['theory-10']).toMatchObject({ unlocked: false, value: 4, target: 10, fraction: 0.4, hidden: false });
    expect(byId['xp-100']).toMatchObject({ value: 40, target: 100, fraction: 0.4 });
    expect(byId['first-lesson']).toMatchObject({ unlocked: true, value: 1, fraction: 1, at: rig.clock.t });
    expect(byId['night-owl']).toMatchObject({ unlocked: false, hidden: true });
    expect(view.unlocked).toBe(view.list.filter((a) => a.unlocked).length);
    expect(view.total).toBe(ACHIEVEMENTS.length);
    // The memoised selector reads only some slices; it must agree with the view over the full state.
    rig.actions.recordActivity({ kind: 'scale-game', id: 'scale:a-minor-pentatonic:box-1', accuracy: 0.97, combo: 7 });
    rig.actions.recordActivity({ kind: 'chord-practice', id: 'chord:g' });
    rig.actions.grantGems(40, 'test');
    expect(selectAchievements(rig.store.getState()).list).toEqual(achievementViews(rig.store.getState()));
    const view2 = selectAchievements(rig.store.getState());
    expect(view2).not.toBe(view);
    // Memoised: the same object until something it reads changes.
    expect(selectAchievements(rig.store.getState())).toBe(view2);
    rig.actions.setPrefs({ a4: 441 });
    expect(selectAchievements(rig.store.getState())).toBe(view2);
  });
});

// ---------------------------------------------------------------------------------------------
// A simulated learner: about fourteen months of varied daily practice.
// ---------------------------------------------------------------------------------------------

const SCALES = [
  ...[1, 2, 3, 4, 5].map((n) => `scale:a-minor-pentatonic:box-${n}`),
  ...['c-major', 'g-major', 'd-dorian', 'e-phrygian', 'a-natural-minor'].flatMap((s) => [1, 2, 3].map((n) => `scale:${s}:pos-${n}`)),
];
const CHORDS = Array.from({ length: 32 }, (_, i) => `chord:shape-${i + 1}`);
const CHANGES = ['g-c', 'c-d', 'd-g', 'em-am', 'am-f', 'f-c'].map((c) => `chord-change:${c}`);
const SONGS = Array.from({ length: 16 }, (_, i) => `song:trad-${i + 1}`);
const LEVELS = Array.from({ length: 36 }, (_, i) => `arcade:fret-rush:${i + 1}`);
const TEACHERS: TeacherId[] = ['mia', 'dev', 'elena'];

/** One ordinary day of practice, around six in the evening. */
function practiceDay(rig: TestRig, n: number): void {
  const act = (input: ActivityInput) => rig.actions.recordActivity(input);
  act({ kind: 'tuner', durationSec: 40, route: 'tuner' });
  act({ kind: 'theory-lesson', id: `theory:unit-${1 + Math.floor(n / 10)}:lesson-${n % 10}`, accuracy: n % 3 === 0 ? 1 : 0.85, mistakes: n % 3 === 0 ? 0 : 2, durationSec: 240 });
  const teacher = TEACHERS[n % 3];
  act({ kind: 'teacher-lesson', id: `teacher:${teacher}:lesson-${Math.floor(n / 3) % 14}`, accuracy: 0.9, durationSec: 420 });
  act({ kind: 'scale-practice', id: SCALES[n % SCALES.length], accuracy: 0.95, durationSec: 180 });
  act({ kind: 'scale-game', id: LEVELS[n % LEVELS.length], accuracy: 1, combo: 12 + (n % 50), score: 1000 + n, durationSec: 120 });
  act({ kind: 'chord-practice', id: CHORDS[n % CHORDS.length], accuracy: 0.9, durationSec: 120 });
  act({ kind: 'chord-change', id: CHANGES[n % CHANGES.length], accuracy: 0.9, count: 12, durationSec: 90 });
  act({ kind: 'song', id: SONGS[n % SONGS.length], accuracy: 0.96, stars: 3, durationSec: 200, route: 'play', params: [`trad-${(n % SONGS.length) + 1}`], title: `Traditional ${(n % SONGS.length) + 1}` });
  act({ kind: 'fretboard', id: 'fretboard:notes', accuracy: 0.9, count: 8, durationSec: 60 });
  if (n % 2 === 0) act({ kind: 'ear', accuracy: 0.92, durationSec: 120 });
  if (n % 2 === 1) act({ kind: 'rhythm', accuracy: 0.9, durationSec: 120 });
  if (n % 3 === 0) act({ kind: 'technique', durationSec: 180 });
  if (n % 4 === 0) act({ kind: 'progression', durationSec: 240 });
  if (n % 5 === 0) act({ kind: 'metronome', durationSec: 300 });
  if (n % 20 === 0) act({ kind: 'camera', durationSec: 120 });
  if (n % 20 === 1) act({ kind: 'scan', title: 'Scanned sheet' });
  act({ kind: 'practice', durationSec: 15 * 60, title: 'Daily routine' });
  // A review session: grade whatever is due, then top up with any cards so volume is steady.
  const cards = Object.keys(rig.store.getState().srs.items);
  for (let i = 0; i < 16; i++) rig.actions.gradeReview(cards[(n * 16 + i) % cards.length], i % 9 === 0 ? 'again' : 'good');
  act({ kind: 'review', count: 16, accuracy: 0.9, durationSec: 150 });
}

function simulate(): TestRig {
  const rig = makeRig({ start: '2026-01-05T18:00:00Z' }); // a Monday evening
  rig.actions.completeOnboarding({ name: 'Sim', experience: 'beginner' });
  rig.actions.addReviewItems(Array.from({ length: 60 }, (_, i) => ({ id: `fact:${i}`, kind: 'theory-fact' })));
  let n = 0;
  const day = () => {
    practiceDay(rig, n++);
    rig.clock.days(1);
  };

  // Ten days in a row, then a missed day covered by a freeze.
  for (let i = 0; i < 10; i++) day();
  expect(rig.actions.buy('streak-freeze').ok).toBe(true);
  rig.clock.days(1);
  // Two more days, then eight days away (the streak ends), then back for good.
  for (let i = 0; i < 2; i++) day();
  rig.clock.days(8);

  // One night-owl session and one early-bird session along the way.
  rig.clock.set(rig.clock.t + 5 * 3_600_000); // 23:00
  day();
  rig.clock.set(rig.clock.t - 17 * 3_600_000); // 06:00 the next morning
  day();
  rig.clock.set(rig.clock.t + 12 * 3_600_000); // back to 18:00

  // A marathon day.
  rig.actions.recordActivity({ kind: 'practice', durationSec: 70 * 60, title: 'Long session' });
  for (let i = 0; i < 370; i++) day();

  // One-off milestones the screens flag.
  for (let s = 1; s <= 6; s++) rig.actions.markSkill(`fretboard:string-${s}`, { completed: true });
  for (const teacher of TEACHERS) rig.actions.markSkill(`teacher:${teacher}:course`, { completed: true });
  const cosmetic = rig.actions.buy('inlay-blocks');
  expect(cosmetic.ok).toBe(true);
  expect(rig.actions.equipCosmetic('inlay-blocks')).toBe(true);
  return rig;
}

describe('a simulated history', () => {
  const rig = simulate();
  const state = rig.store.getState();

  it('unlocks every achievement in the catalog', () => {
    const missing = ACHIEVEMENTS.filter((a) => !state.achievements[a.id]).map((a) => {
      const ctx = achievementCtx(state);
      return `${a.id} (${a.value(ctx)}/${a.target})`;
    });
    expect(missing).toEqual([]);
    expect(Object.keys(state.achievements).sort()).toEqual(ACHIEVEMENTS.map((a) => a.id).sort());
  });

  it('announced each unlock exactly once, with a timestamp inside the simulation', () => {
    const events = rig.eventsOf('achievement-unlocked');
    expect(events.map((e) => e.id).sort()).toEqual(ACHIEVEMENTS.map((a) => a.id).sort());
    const start = at('2026-01-05T18:00:00Z');
    for (const a of ACHIEVEMENTS) {
      const unlock = state.achievements[a.id];
      expect(unlock.at).toBeGreaterThanOrEqual(start);
      expect(unlock.at).toBeLessThanOrEqual(rig.clock.t);
    }
  });

  it('unlocked tiers of the same ladder in order', () => {
    const order = (ids: string[]) => ids.map((id) => state.achievements[id].at);
    for (const ladder of [
      ['streak-3', 'streak-7', 'streak-14', 'streak-30', 'streak-50', 'streak-100', 'streak-200', 'streak-365'],
      ['xp-100', 'xp-500', 'xp-1000', 'xp-5000', 'xp-10000', 'xp-25000'],
      ['level-5', 'level-10', 'level-25', 'level-50'],
      ['time-1h', 'time-10h', 'time-50h', 'time-100h'],
      ['chords-1', 'chords-5', 'chords-15', 'chords-30'],
      ['theory-10', 'theory-50', 'theory-100'],
      ['quests-10', 'quests-50', 'quests-200'],
    ]) {
      const times = order(ladder);
      for (let i = 1; i < times.length; i++) expect(times[i], ladder[i]).toBeGreaterThanOrEqual(times[i - 1]);
    }
  });

  it('paid the tier gems for every unlock', () => {
    const paid = rig.eventsOf('achievement-unlocked').reduce((sum, e) => sum + e.gems, 0);
    const expected = ACHIEVEMENTS.reduce((sum, a) => sum + ACHIEVEMENT_GEMS[a.tier], 0);
    expect(paid).toBe(expected);
    const fromAchievements = rig.eventsOf('gems-changed').filter((e) => e.reason === 'achievement').reduce((sum, e) => sum + e.delta, 0);
    expect(fromAchievements).toBe(expected);
  });

  it('ends in a consistent state', () => {
    expect(state.streak.current).toBeGreaterThanOrEqual(365);
    expect(state.streak.longest).toBe(state.streak.current);
    expect(state.streak.milestones).toEqual([3, 7, 14, 30, 50, 100, 200, 365]);
    expect(state.gems.balance).toBe(state.gems.earned - state.gems.spent);
    expect(state.gems.balance).toBeGreaterThanOrEqual(0);
    expect(state.hearts.count).toBe(5);
    const dayXp = Object.values(state.days).reduce((sum, d) => sum + d.xp, 0);
    expect(dayXp).toBe(state.xp.total);
    const tagXp = Object.values(state.xp.byTag).reduce((sum, v) => sum + (v ?? 0), 0);
    expect(tagXp).toBe(state.xp.total);
    const daySec = Object.values(state.days).reduce((sum, d) => sum + d.sec, 0);
    expect(daySec).toBe(state.stats['time.total']);
    expect(Object.values(state.days).filter((d) => d.n > 0)).toHaveLength(state.stats['active.days']);
    expect(Object.values(state.days).filter((d) => d.met)).toHaveLength(state.stats['goal.days']);
    expect(Object.values(state.days).filter((d) => d.frozen)).toHaveLength(1);
    expect(state.log.length).toBeLessThanOrEqual(300);
    expect(state.recents.length).toBeLessThanOrEqual(12);
    expect(state.prefs.fretboard.inlay).toBe('inlay-blocks');
  });

  it('agrees between the memoised selector and the plain view', () => {
    expect(selectAchievements(state).list).toEqual(achievementViews(state));
    expect(selectAchievements(state).unlocked).toBe(ACHIEVEMENTS.length);
    expect(achievementViews(state).every((a) => a.unlocked && !a.hidden && a.fraction === 1)).toBe(true);
  });

  it('stays small enough to save comfortably', () => {
    const bytes = JSON.stringify(state).length;
    expect(bytes).toBeLessThan(400_000);
  });
});

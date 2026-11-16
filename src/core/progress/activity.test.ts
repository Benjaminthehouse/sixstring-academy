import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from './achievements';
import { HALF_LIFE_DAYS, MASTERY_RULES } from './skills';
import { HEART_REGEN_MINUTES, STREAK_MILESTONES } from './catalog';
import { ACTIVITY_KINDS, ACTIVITY_KIND_IDS, AVATARS, CONSUMABLES, COSMETICS, DAILY_GOALS, DEFAULT_COSMETICS, FREE_COSMETICS, MAX_XP_PER_ACTIVITY, SKILL_TAGS, XP_RULES, levelUpGems, priceOf, xpFor } from './catalog';
import { teacherFor } from './defaults';
import { MAX_LOG, MAX_RECENTS } from './limits';
import { favouritesOf, isFavourite, minutesByKind, practiceHeatmap, selectContinue, selectDailyGoal, selectLevel, selectPracticeTotals, shopOf, xpBoostOf } from './selectors';
import { makeRig } from './testkit';
import type { ActivityKind } from './types';

describe('XP guideline', () => {
  it('has a rule, a label, a tag and an icon for every activity kind', () => {
    for (const kind of ACTIVITY_KIND_IDS) {
      expect(XP_RULES[kind], kind).toBeDefined();
      expect(ACTIVITY_KINDS[kind].label.length).toBeGreaterThan(2);
      expect(SKILL_TAGS).toContain(ACTIVITY_KINDS[kind].tag);
      expect(XP_RULES[kind].min).toBeLessThanOrEqual(XP_RULES[kind].max);
      expect(XP_RULES[kind].max).toBeLessThanOrEqual(MAX_XP_PER_ACTIVITY);
    }
  });

  it('gives the documented amounts', () => {
    expect(xpFor('theory-lesson')).toBe(10);
    expect(xpFor('theory-lesson', { perfect: true })).toBe(15);
    expect(xpFor('theory-lesson', { completed: false })).toBe(5);
    expect(xpFor('teacher-lesson')).toBe(15);
    expect(xpFor('teacher-lesson', { perfect: true })).toBe(20);
    expect(xpFor('review', { count: 3 })).toBe(5);
    expect(xpFor('review', { count: 10 })).toBe(12);
    expect(xpFor('review', { count: 80 })).toBe(20);
    expect(xpFor('scale-game', { accuracy: 0 })).toBe(4);
    expect(xpFor('scale-game', { accuracy: 0.8 })).toBe(9);
    expect(xpFor('scale-game', { accuracy: 1, perfect: true })).toBe(12);
    expect(xpFor('song', { durationSec: 180, accuracy: 0.9 })).toBe(18);
    expect(xpFor('song', { durationSec: 600, accuracy: 1, perfect: true })).toBe(30);
    expect(xpFor('song', {})).toBe(8);
    expect(xpFor('scale-practice', { durationSec: 300 })).toBe(10);
    expect(xpFor('practice', { durationSec: 20 * 60 })).toBe(40);
    expect(xpFor('practice', { durationSec: 3 * 3600 })).toBe(120);
    expect(xpFor('tuner')).toBe(5);
    expect(xpFor('scan')).toBe(10);
    expect(xpFor('metronome', { durationSec: 240 })).toBe(4);
    expect(xpFor('other', { durationSec: 9999, accuracy: 1 })).toBe(0);
  });

  it('stays inside each rule’s range whatever the inputs', () => {
    for (const kind of ACTIVITY_KIND_IDS) {
      for (const durationSec of [0, 30, 600, 1e7]) {
        for (const accuracy of [undefined, -1, 0, 0.5, 1, 9]) {
          for (const perfect of [false, true]) {
            const xp = xpFor(kind, { durationSec, accuracy, perfect, count: 1000 });
            expect(Number.isInteger(xp)).toBe(true);
            expect(xp).toBeGreaterThanOrEqual(XP_RULES[kind].min);
            expect(xp).toBeLessThanOrEqual(XP_RULES[kind].max);
          }
        }
      }
    }
  });

  it('keeps kinds comparable: about 2 XP per focused minute, never more than 30 per short activity', () => {
    // Five minutes of each main activity should land in the same ballpark.
    const fiveMinutes = (['theory-lesson', 'scale-practice', 'chord-practice', 'song', 'technique', 'progression', 'practice'] as ActivityKind[]).map((kind) => xpFor(kind, { durationSec: 300, accuracy: 0.85 }));
    for (const xp of fiveMinutes) {
      expect(xp).toBeGreaterThanOrEqual(8);
      expect(xp).toBeLessThanOrEqual(20);
    }
  });

  it('daily goals are the four documented levels', () => {
    expect(DAILY_GOALS.map((g) => [g.xp, g.id])).toEqual([[10, 'casual'], [20, 'regular'], [30, 'serious'], [50, 'intense']]);
  });

  it('a planned session as long as a goal says meets that goal, the Intense one included', () => {
    for (const g of DAILY_GOALS) {
      expect(g.blurb, g.id).toBe(`About ${g.minutes} minutes a day.`);
      // "About 10 minutes" means 10 minutes is enough, and a minute less is not quite.
      expect(xpFor('practice', { durationSec: g.minutes * 60 }), g.id).toBeGreaterThanOrEqual(g.xp);
      expect(xpFor('practice', { durationSec: (g.minutes - 1) * 60 }), g.id).toBeLessThan(g.xp);
    }
    // One session can meet the highest goal: the cap is above it.
    expect(XP_RULES.practice.max).toBeGreaterThanOrEqual(Math.max(...DAILY_GOALS.map((g) => g.xp)));
    // An hour, the longest duration the Practice screen offers, counts in full.
    expect(xpFor('practice', { durationSec: 3600 })).toBe(120);
  });
});

describe('API.md', () => {
  const doc = readFileSync(fileURLToPath(new URL('./API.md', import.meta.url)), 'utf8');

  it('documents the XP table exactly as the rules are', () => {
    const start = doc.indexOf('### XP guideline');
    const rows = doc
      .slice(start, doc.indexOf('Not completed = half', start))
      .split('\n')
      .filter((line) => line.startsWith('|') && !line.startsWith('| kind') && !line.startsWith('|---'))
      .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
    const documented = new Set<string>();
    for (const [kinds, , range, cap] of rows) {
      const [min, max] = range.includes('\u2013') ? range.split('\u2013').map(Number) : [Number(range), Number(range)];
      for (const name of kinds.split(',').map((k) => k.replace(/\(.*\)/, '').trim())) {
        const rule = XP_RULES[name as ActivityKind];
        expect(rule, name).toBeDefined();
        expect([rule.min, rule.max], name).toEqual([min, max]);
        expect(rule.dailyCap, name).toBe(cap === '' ? undefined : Number(cap));
        documented.add(name);
      }
    }
    expect([...documented].sort()).toEqual(ACTIVITY_KIND_IDS.filter((k) => k !== 'other').sort());
  });

  it('states the real numbers', () => {
    expect(doc).toContain(`${ACHIEVEMENTS.length} in \`ACHIEVEMENTS\``);
    expect(doc).toContain('one returns every 20 minutes');
    expect(HEART_REGEN_MINUTES).toBe(20);
    expect(doc).toContain('streak-freeze 60, heart-refill 20, xp-boost 40');
    expect([priceOf('streak-freeze'), priceOf('heart-refill'), priceOf('xp-boost')]).toEqual([60, 20, 40]);
    expect(doc).toContain('Milestones: 3, 7, 14, 30, 50, 100, 200, 365.');
    expect(STREAK_MILESTONES).toEqual([3, 7, 14, 30, 50, 100, 200, 365]);
    expect(doc).toContain('needing 1 / 2 / 2 / 3 / 3');
    expect(MASTERY_RULES.map((r) => r.reps)).toEqual([1, 2, 2, 3, 3]);
    expect(MASTERY_RULES.map((r) => r.minAccuracy * 100)).toEqual([60, 70, 80, 85, 90]);
    expect(HALF_LIFE_DAYS).toEqual([2, 4, 7, 14, 30, 60]);
    expect(doc.split('\n').length).toBeLessThanOrEqual(215);
  });

  it('documents the skill ids the screens really record (an ear round is `ear:<drill>:<level>`)', async () => {
    const { levelSkillId, drillSkillId } = await import('@/features/ear/core/progress');
    const { progressionSkillId } = await import('@/content/progressions');
    expect(doc).toContain('`ear:<drill>:<level>`');
    expect(levelSkillId('intervals-up', 2)).toBe('ear:intervals-up:2');
    expect(drillSkillId('intervals-up')).toBe('ear:intervals-up');
    expect(doc).toContain('`progression:<id>`');
    expect(progressionSkillId('i-v-vi-iv')).toBe('progression:i-v-vi-iv');
  });

  it('names only hooks, selectors and actions that exist', async () => {
    const api = (await import('./index')) as unknown as Record<string, unknown>;
    const names = new Set<string>();
    for (const match of doc.matchAll(/\b((?:use|select)[A-Z][A-Za-z]+|[a-z][A-Za-z]+(?=\())/g)) names.add(match[1]);
    // Words that look like calls but are prose or belong to other modules.
    for (const skip of ['toast', 'celebrate', 'reduce', 'subscribe', 'now']) names.delete(skip);
    const missing = [...names].filter((name) => api[name] === undefined);
    expect(missing).toEqual([]);
    expect(names.size).toBeGreaterThan(50);
  });
});

describe('recordActivity', () => {
  it('needs only a kind and uses the guideline XP', () => {
    const rig = makeRig();
    const result = rig.actions.recordActivity({ kind: 'theory-lesson' });
    expect(result).toMatchObject({ xp: 10, baseXp: 10, multiplier: 1, totalXp: 10, level: 1, leveledUp: false, skill: null, hearts: 5 });
    expect(rig.eventsOf('xp-gained')).toEqual([{ type: 'xp-gained', at: rig.clock.t, amount: 10, base: 10, multiplier: 1, source: 'theory-lesson', tag: 'theory', total: 10 }]);
    expect(rig.store.getState().xp.byTag).toEqual({ theory: 10 });
  });

  it('lets a screen pass its own XP, source and tag, within the cap', () => {
    const rig = makeRig();
    expect(rig.actions.recordActivity({ kind: 'song', xp: 22, source: 'play-along', tag: 'rhythm' }).xp).toBe(22);
    expect(rig.eventsOf('xp-gained')[0]).toMatchObject({ source: 'play-along', tag: 'rhythm' });
    expect(rig.actions.recordActivity({ kind: 'song', xp: 99_999 }).xp).toBe(MAX_XP_PER_ACTIVITY);
    expect(rig.actions.recordActivity({ kind: 'song', xp: -5 }).xp).toBe(0);
    expect(rig.actions.recordActivity({ kind: 'song', xp: 0 }).xp).toBe(0);
  });

  it('caps tool XP per day and lifts the cap the next day', () => {
    const rig = makeRig();
    expect(rig.actions.recordActivity({ kind: 'tuner' }).xp).toBe(5);
    expect(rig.actions.recordActivity({ kind: 'tuner' }).xp).toBe(0);
    expect(rig.actions.recordActivity({ kind: 'tuner', xp: 50 }).xp).toBe(0);
    expect(rig.actions.recordActivity({ kind: 'scan' }).xp).toBe(10);
    expect(rig.actions.recordActivity({ kind: 'scan' }).xp).toBe(10);
    expect(rig.actions.recordActivity({ kind: 'scan' }).xp).toBe(0);
    expect(rig.actions.recordActivity({ kind: 'metronome', durationSec: 15 * 60 }).xp).toBe(10);
    expect(rig.actions.recordActivity({ kind: 'metronome', durationSec: 15 * 60 }).xp).toBe(10);
    expect(rig.actions.recordActivity({ kind: 'metronome', durationSec: 15 * 60 }).xp).toBe(0);
    // Uncapped kinds are not affected.
    expect(rig.actions.recordActivity({ kind: 'song' }).xp).toBe(8);
    expect(rig.actions.recordActivity({ kind: 'song' }).xp).toBe(8);
    // The tuner still counts as used every time.
    expect(rig.store.getState().stats['count.tuner']).toBe(3);

    rig.clock.days(1);
    expect(rig.actions.recordActivity({ kind: 'tuner' }).xp).toBe(5);
  });

  it('levels up with gems and a single event, even across several levels', () => {
    const rig = makeRig();
    const result = rig.actions.recordActivity({ kind: 'other', xp: 130 }); // 0 -> level 4 (120)
    expect(result).toMatchObject({ level: 4, leveledUp: true });
    expect(rig.eventsOf('level-up')).toEqual([{ type: 'level-up', at: rig.clock.t, from: 1, to: 4, title: 'Clean Change', gems: levelUpGems(2) + levelUpGems(3) + levelUpGems(4) }]);
    expect(selectLevel(rig.store.getState())).toMatchObject({ level: 4, xpIntoLevel: 10 });
    rig.actions.recordActivity({ kind: 'other', xp: 70 }); // level 5 at 200
    expect(rig.eventsOf('level-up')[1]).toMatchObject({ from: 4, to: 5, title: 'Campfire Strummer', gems: 25 });
  });

  it('adds up the gems an activity earned', () => {
    const rig = makeRig();
    const result = rig.actions.recordActivity({ kind: 'theory-lesson', id: 'theory:unit-1:lesson-1', mistakes: 0, xp: 25 });
    const earned = rig.eventsOf('gems-changed').reduce((sum, e) => sum + e.delta, 0);
    expect(result.gems).toBe(earned);
    expect(result.gems).toBe(rig.store.getState().gems.balance);
    expect(result.gems).toBeGreaterThanOrEqual(2 + 10 + 5); // perfect lesson + level-up + first lesson
    expect(rig.store.getState().gems).toMatchObject({ earned, spent: 0 });
  });

  it('treats an abandoned attempt as time spent but not as an achievement', () => {
    const rig = makeRig();
    const result = rig.actions.recordActivity({ kind: 'song', id: 'song:greensleeves', title: 'Greensleeves', completed: false, durationSec: 60, progress: 0.4, route: 'play', params: ['greensleeves'] });
    const state = rig.store.getState();
    expect(result.xp).toBe(4); // half of the guideline
    expect(result.skill).toMatchObject({ mastery: 0, firstCompletion: false, attempts: 1 });
    expect(state.skills['song:greensleeves']).toMatchObject({ attempts: 1, completions: 0, completed: false });
    expect(state.stats['count.song']).toBeUndefined();
    expect(state.stats['time.song']).toBe(60);
    expect(state.achievements['first-song']).toBeUndefined();
    expect(state.recents[0]).toMatchObject({ fraction: 0.4, title: 'Greensleeves' });
  });

  it('recognises a perfect attempt from the flag, the mistake count or the accuracy', () => {
    const rig = makeRig();
    const perfects = () => rig.store.getState().stats['perfect.total'] ?? 0;
    rig.actions.recordActivity({ kind: 'ear', accuracy: 0.99 });
    expect(perfects()).toBe(0);
    rig.actions.recordActivity({ kind: 'ear', accuracy: 1 });
    expect(perfects()).toBe(1);
    rig.actions.recordActivity({ kind: 'ear', mistakes: 0 });
    expect(perfects()).toBe(2);
    rig.actions.recordActivity({ kind: 'ear', mistakes: 1, accuracy: 1 });
    expect(perfects()).toBe(2);
    rig.actions.recordActivity({ kind: 'ear', perfect: true, mistakes: 3 });
    expect(perfects()).toBe(3);
    rig.actions.recordActivity({ kind: 'ear', perfect: true, completed: false });
    expect(perfects()).toBe(3);
    rig.actions.recordActivity({ kind: 'tuner' }); // nothing measured: not "perfect"
    expect(perfects()).toBe(3);
  });

  it('updates everything in one transaction: one state change, one revision', () => {
    const rig = makeRig();
    let notifications = 0;
    rig.store.subscribe(() => notifications++);
    const before = rig.store.getState();
    rig.actions.recordActivity({ kind: 'scale-game', id: 'scale:a-minor-pentatonic:box-1', title: 'Box 1', accuracy: 0.97, combo: 22, durationSec: 150, route: 'arcade', params: ['fret-rush'], xp: 30 });
    const after = rig.store.getState();
    expect(notifications).toBe(1);
    expect(after.meta.rev).toBe(before.meta.rev + 1);
    // XP, level, goal, streak, skill, stats, log, recents, quests and achievements all moved together.
    expect(after.xp.total).toBe(30);
    expect(selectLevel(after).level).toBe(2);
    expect(selectDailyGoal(after).met).toBe(true);
    expect(after.streak.current).toBe(1);
    expect(after.skills['scale:a-minor-pentatonic:box-1']).toMatchObject({ mastery: 1, stars: 3 });
    expect(after.stats).toMatchObject({ 'count.scale-game': 1, 'max.combo': 22, 'time.total': 150, sessions: 1, 'active.days': 1, 'goal.days': 1 });
    expect(after.log).toHaveLength(1);
    expect(after.recents).toHaveLength(1);
    expect(Object.keys(after.achievements)).toEqual(expect.arrayContaining(['first-game', 'scale-first', 'three-stars', 'combo-10', 'goal-1']));
    expect(after.meta.lastActiveDay).toBe(after.meta.today);
  });
});

describe('XP boost', () => {
  it('multiplies XP while it runs and ends on time', () => {
    const rig = makeRig();
    const boost = rig.actions.startXpBoost(2, 15, 'test');
    expect(boost).toEqual({ multiplier: 2, until: rig.clock.t + 15 * 60_000, source: 'test' });
    expect(rig.eventsOf('xp-boost-started')).toHaveLength(1);
    expect(xpBoostOf(rig.store.getState(), rig.clock.t)).toMatchObject({ active: true, multiplier: 2, msLeft: 15 * 60_000 });

    const boosted = rig.actions.recordActivity({ kind: 'theory-lesson' });
    expect(boosted).toMatchObject({ xp: 20, baseXp: 10, multiplier: 2 });
    expect(rig.actions.awardXp(7, 'bonus')).toBe(14);

    rig.clock.minutes(15);
    expect(xpBoostOf(rig.store.getState(), rig.clock.t).active).toBe(false);
    expect(rig.actions.recordActivity({ kind: 'theory-lesson' })).toMatchObject({ xp: 10, multiplier: 1 });
    expect(rig.store.getState().xp.boost).toBeNull(); // cleaned up
  });

  it('extends a running boost of the same strength and never weakens a stronger one', () => {
    const rig = makeRig();
    const first = rig.actions.startXpBoost(2, 15);
    rig.clock.minutes(5);
    expect(rig.actions.startXpBoost(2, 15).until).toBe(first.until + 15 * 60_000);
    const strong = rig.actions.startXpBoost(3, 10);
    expect(strong).toMatchObject({ multiplier: 3, until: rig.clock.t + 10 * 60_000 });
    expect(rig.actions.startXpBoost(2, 60)).toEqual(strong);
  });

  it('can be bought in the shop', () => {
    const rig = makeRig();
    rig.actions.grantGems(100, 'test');
    expect(rig.actions.buy('xp-boost')).toMatchObject({ ok: true, price: 40, balance: 60 });
    expect(xpBoostOf(rig.store.getState(), rig.clock.t)).toMatchObject({ active: true, multiplier: 2, msLeft: 15 * 60_000 });
    // A boost does not let a daily-capped tool pay out more often, but it does double what it pays.
    expect(rig.actions.recordActivity({ kind: 'tuner' }).xp).toBe(10);
    expect(rig.actions.recordActivity({ kind: 'tuner' }).xp).toBe(0);
  });
});

describe('practice log', () => {
  it('logs sessions newest first with a few metrics', () => {
    const rig = makeRig({ start: '2026-03-02T09:00:00Z' });
    rig.actions.recordActivity({ kind: 'song', id: 'song:greensleeves', title: 'Greensleeves', accuracy: 0.876, score: 4200, stars: 2, combo: 31, durationSec: 185, meta: { tempo: 96, bars: 32 } });
    rig.clock.minutes(10);
    rig.actions.recordActivity({ kind: 'tuner', durationSec: 40 });
    const [tuner, song] = rig.store.getState().log;
    expect(song).toEqual({
      id: expect.any(String),
      kind: 'song',
      title: 'Greensleeves',
      startedAt: Date.parse('2026-03-02T09:00:00Z') - 185_000,
      durationSec: 185,
      xp: 18,
      skillId: 'song:greensleeves',
      metrics: { tempo: 96, bars: 32, accuracy: 0.876, score: 4200, stars: 2, combo: 31 },
    });
    expect(tuner).toMatchObject({ kind: 'tuner', title: 'Tuner', durationSec: 40, xp: 5 });
    expect(tuner.id).not.toBe(song.id);
  });

  it('skips entries with neither time nor XP, and stays bounded', () => {
    const rig = makeRig();
    rig.actions.recordActivity({ kind: 'other' });
    expect(rig.store.getState().log).toHaveLength(0);
    for (let i = 0; i < MAX_LOG + 25; i++) rig.actions.recordActivity({ kind: 'other', durationSec: 10, title: `s${i}` });
    const log = rig.store.getState().log;
    expect(log).toHaveLength(MAX_LOG);
    expect(log[0].title).toBe(`s${MAX_LOG + 24}`);
    expect(new Set(log.map((s) => s.id)).size).toBe(MAX_LOG);
    expect(rig.store.getState().stats.sessions).toBe(MAX_LOG + 25); // lifetime count survives the cut
  });

  it('adds up time and XP per day, week and all time', () => {
    const rig = makeRig({ start: '2026-03-01T10:00:00Z' }); // a Sunday: last day of the Monday week
    rig.actions.recordActivity({ kind: 'song', durationSec: 600, xp: 10 });
    rig.clock.days(1); // Monday
    rig.actions.recordActivity({ kind: 'song', durationSec: 300, xp: 10 });
    rig.actions.recordActivity({ kind: 'technique', durationSec: 420, xp: 5 });
    rig.clock.days(2); // Wednesday
    rig.actions.recordActivity({ kind: 'ear', durationSec: 120, xp: 5 });
    rig.actions.recordActivity({ kind: 'tuner' });
    const state = rig.store.getState();
    expect(selectPracticeTotals(state)).toEqual({
      today: { sec: 120, minutes: 2, xp: 10, activities: 2, days: 1 },
      week: { sec: 840, minutes: 14, xp: 25, activities: 4, days: 2 },
      allTime: { sec: 1440, minutes: 24, xp: 35, activities: 5, days: 3 },
    });
    expect(minutesByKind(state, 'today').map((k) => [k.kind, k.sec])).toEqual([['ear', 120]]);
    expect(minutesByKind(state, 'week').map((k) => [k.kind, k.minutes])).toEqual([['technique', 7], ['song', 5], ['ear', 2]]);
    expect(minutesByKind(state, 'all').map((k) => [k.kind, k.label, k.sec])).toEqual([['song', 'Song', 900], ['technique', 'Technique', 420], ['ear', 'Ear training', 120]]);
    expect(selectPracticeTotals(state)).toBe(selectPracticeTotals(state));
  });

  it('follows the preferred first day of the week', () => {
    const rig = makeRig({ start: '2026-03-01T10:00:00Z' }); // Sunday
    rig.actions.recordActivity({ kind: 'song', durationSec: 600 });
    rig.clock.days(1);
    rig.actions.recordActivity({ kind: 'song', durationSec: 300 });
    expect(selectPracticeTotals(rig.store.getState()).week.sec).toBe(300);
    rig.actions.setPrefs({ weekStart: 'sunday' });
    expect(selectPracticeTotals(rig.store.getState()).week.sec).toBe(900);
  });

  it('builds the calendar heat map', () => {
    const rig = makeRig({ start: '2026-03-04T10:00:00Z' }); // Wednesday
    rig.actions.recordActivity({ kind: 'other', xp: 5 }); // under half the goal
    rig.clock.days(1);
    rig.actions.recordActivity({ kind: 'other', xp: 12 });
    rig.clock.days(1);
    rig.actions.recordActivity({ kind: 'other', xp: 20, durationSec: 300 });
    rig.clock.days(1);
    rig.actions.recordActivity({ kind: 'other', xp: 45 });
    rig.clock.days(2); // Monday the 9th, nothing yet
    rig.store.tick();
    const cells = practiceHeatmap(rig.store.getState(), 2);
    expect(cells.map((c) => c.day)).toEqual(['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09']);
    expect(cells.map((c) => c.level)).toEqual([0, 0, 1, 2, 3, 4, 0, 0]);
    expect(cells[0].weekday).toBe(1);
    expect(cells[4]).toMatchObject({ xp: 20, met: true, sec: 300, active: true, frozen: false });
    // 26 weeks by default, always starting on the first day of a week.
    const half = practiceHeatmap(rig.store.getState());
    expect(half).toHaveLength(25 * 7 + 1);
    expect(half[0].weekday).toBe(1);
    expect(half.at(-1)?.day).toBe('2026-03-09');
  });
});

describe('recently used and favourites', () => {
  it('keeps one entry per route and params, newest first, with progress', () => {
    const rig = makeRig();
    rig.actions.touchRecent({ route: 'play', params: ['greensleeves'], title: 'Greensleeves', kind: 'song', fraction: 0.25 });
    rig.clock.minutes(1);
    rig.actions.touchRecent({ route: 'scales', params: ['a-minor-pentatonic'], title: 'A minor pentatonic' });
    rig.clock.minutes(1);
    rig.actions.recordActivity({ kind: 'song', id: 'song:greensleeves', route: 'play', params: ['greensleeves'], completed: false, progress: 0.6 });
    const recents = rig.store.getState().recents;
    expect(recents.map((r) => r.key)).toEqual(['play--greensleeves', 'scales--a-minor-pentatonic']);
    expect(recents[0]).toEqual({ key: 'play--greensleeves', route: 'play', params: ['greensleeves'], title: 'Greensleeves', kind: 'song', fraction: 0.6, at: rig.clock.t, skillId: 'song:greensleeves' });
    expect(recents[1]).toMatchObject({ kind: 'other', fraction: 0 });
  });

  it('offers the latest unfinished item to continue, else the latest item', () => {
    const rig = makeRig();
    expect(selectContinue(rig.store.getState())).toBeNull();
    rig.actions.recordActivity({ kind: 'theory-lesson', route: 'learn', params: ['unit-1', 'lesson-1'], title: 'Lesson 1' });
    expect(selectContinue(rig.store.getState())).toMatchObject({ title: 'Lesson 1', fraction: 1 });
    rig.actions.touchRecent({ route: 'play', params: ['greensleeves'], title: 'Greensleeves', fraction: 0.3 });
    rig.actions.recordActivity({ kind: 'tuner', route: 'tuner' });
    expect(selectContinue(rig.store.getState())).toMatchObject({ route: 'play', title: 'Greensleeves', fraction: 0.3 });
    rig.actions.recordActivity({ kind: 'song', route: 'play', params: ['greensleeves'] }); // finished it
    expect(selectContinue(rig.store.getState())).toMatchObject({ route: 'play', fraction: 1 });
  });

  it('is bounded and entries can be removed', () => {
    const rig = makeRig();
    for (let i = 0; i < MAX_RECENTS + 6; i++) rig.actions.touchRecent({ route: 'play', params: [`song-${i}`], title: `Song ${i}` });
    const recents = rig.store.getState().recents;
    expect(recents).toHaveLength(MAX_RECENTS);
    expect(recents[0].title).toBe(`Song ${MAX_RECENTS + 5}`);
    rig.actions.removeRecent(recents[0].key);
    expect(rig.store.getState().recents).toHaveLength(MAX_RECENTS - 1);
    expect(rig.store.getState().recents[0].title).toBe(`Song ${MAX_RECENTS + 4}`);
  });

  it('rejects routes and params the router could not open', () => {
    const rig = makeRig();
    rig.actions.touchRecent({ route: 'Play Song', title: 'x' });
    rig.actions.touchRecent({ route: 'play', params: ['ok', 'Not OK', 'also--bad'], title: 'x' });
    expect(rig.store.getState().recents.map((r) => r.key)).toEqual(['play--ok']);
  });

  it('bookmarks items of any kind', () => {
    const rig = makeRig();
    expect(rig.actions.toggleFavourite({ kind: 'song', id: 'greensleeves', title: 'Greensleeves', route: 'play', params: ['greensleeves'] })).toBe(true);
    rig.clock.minutes(1);
    expect(rig.actions.toggleFavourite({ kind: 'scale', id: 'a-minor-pentatonic', title: 'A minor pentatonic' })).toBe(true);
    rig.clock.minutes(1);
    expect(rig.actions.setFavourite({ kind: 'chord', id: 'g' }, true)).toBe(true);
    expect(rig.actions.setFavourite({ kind: 'chord', id: 'g' }, true)).toBe(true); // already on
    const state = rig.store.getState();
    expect(isFavourite(state, 'song', 'greensleeves')).toBe(true);
    expect(isFavourite(state, 'song', 'scarborough-fair')).toBe(false);
    expect(favouritesOf(state).map((f) => f.id)).toEqual(['g', 'a-minor-pentatonic', 'greensleeves']);
    expect(favouritesOf(state, 'song')).toEqual([{ kind: 'song', id: 'greensleeves', title: 'Greensleeves', route: 'play', params: ['greensleeves'], at: expect.any(Number) }]);
    expect(favouritesOf(state, 'chord')[0]).toMatchObject({ title: 'g' });

    expect(rig.actions.toggleFavourite({ kind: 'song', id: 'greensleeves' })).toBe(false);
    expect(isFavourite(rig.store.getState(), 'song', 'greensleeves')).toBe(false);
    expect(rig.actions.toggleFavourite({ kind: '', id: 'x' })).toBe(false);
  });
});

describe('shop and cosmetics', () => {
  it('has a small catalog with free defaults in every slot', () => {
    for (const category of ['wood', 'inlay', 'accent'] as const) {
      const items = COSMETICS.filter((c) => c.category === category);
      expect(items.length).toBeGreaterThanOrEqual(4);
      expect(items.some((c) => c.price === 0)).toBe(true);
      expect(FREE_COSMETICS).toContain(DEFAULT_COSMETICS[category]);
    }
    expect(new Set(COSMETICS.map((c) => c.id)).size).toBe(COSMETICS.length);
    expect(CONSUMABLES.map((c) => c.id)).toEqual(['streak-freeze', 'heart-refill', 'xp-boost']);
    expect(priceOf('wood-ebony')).toBe(150);
    expect(priceOf('streak-freeze')).toBe(60);
    expect(priceOf('nope')).toBeNull();
  });

  it('sells a cosmetic once and equips owned ones', () => {
    const rig = makeRig();
    expect(rig.actions.buy('wood-ebony')).toEqual({ ok: false, item: 'wood-ebony', reason: 'insufficient-gems' });
    expect(rig.actions.equipCosmetic('wood-ebony')).toBe(false);
    rig.actions.grantGems(400, 'test');
    // Buying unlocks the "New Look" achievement, whose gems are already in the returned balance.
    expect(rig.actions.buy('wood-ebony')).toEqual({ ok: true, item: 'wood-ebony', price: 150, balance: 255 });
    expect(rig.eventsOf('cosmetic-unlocked')).toEqual([{ type: 'cosmetic-unlocked', at: rig.clock.t, id: 'wood-ebony' }]);
    expect(rig.actions.buy('wood-ebony')).toEqual({ ok: false, item: 'wood-ebony', reason: 'already-owned' });
    expect(rig.actions.buy('wood-rosewood')).toEqual({ ok: false, item: 'wood-rosewood', reason: 'already-owned' });
    expect(rig.actions.buy('nope')).toEqual({ ok: false, item: 'nope', reason: 'unknown-item' });

    expect(rig.store.getState().prefs.fretboard.wood).toBe('wood-rosewood'); // buying does not equip
    expect(rig.actions.equipCosmetic('wood-ebony')).toBe(true);
    expect(rig.store.getState().prefs.fretboard.wood).toBe('wood-ebony');
    expect(rig.actions.equipCosmetic('wood-maple')).toBe(true); // a free one
    expect(rig.actions.equipCosmetic('accent-cherry')).toBe(false);

    rig.actions.buy('accent-ocean');
    rig.actions.equipCosmetic('accent-ocean');
    const shop = shopOf(rig.store.getState(), rig.clock.t);
    expect(shop.gems).toBe(55);
    expect(shop.cosmetics.find((c) => c.id === 'wood-ebony')).toMatchObject({ owned: true, equipped: false });
    expect(shop.cosmetics.find((c) => c.id === 'wood-maple')).toMatchObject({ owned: true, equipped: true });
    expect(shop.cosmetics.find((c) => c.id === 'accent-ocean')).toMatchObject({ owned: true, equipped: true });
    expect(shop.cosmetics.find((c) => c.id === 'wood-koa')).toMatchObject({ owned: false, affordable: false });
    expect(shop.consumables.find((c) => c.id === 'streak-freeze')).toMatchObject({ affordable: false, available: true, held: 0 });
  });

  it('does not let preferences select a cosmetic that is not owned', () => {
    const rig = makeRig();
    rig.actions.setPrefs({ fretboard: { wood: 'wood-koa', inlay: 'inlay-vine' }, accent: 'accent-violet' });
    expect(rig.store.getState().prefs.fretboard).toMatchObject({ wood: 'wood-rosewood', inlay: 'inlay-dots' });
    expect(rig.store.getState().prefs.accent).toBe('accent-sunburst');
    rig.actions.setPrefs({ fretboard: { wood: 'wood-maple' } });
    expect(rig.store.getState().prefs.fretboard.wood).toBe('wood-maple');
  });
});

describe('profile and preferences', () => {
  it('starts with sensible defaults', () => {
    const { profile, prefs } = makeRig().store.getState();
    expect(profile).toMatchObject({ name: '', avatar: 'guitar', experience: 'beginner', teacher: 'mia', onboarded: false });
    expect(prefs).toMatchObject({ dailyGoalXp: 20, handedness: 'right', tuningId: 'standard', a4: 440, theme: 'system', noteNaming: 'letters', accidentals: 'auto', motion: 'system', notation: 'tab', unlimitedHearts: false });
    expect(prefs.ai).toEqual({ enabled: false }); // opt-in only, and no key is ever stored here
    expect(JSON.stringify(prefs)).not.toMatch(/key|token|secret/i);
  });

  it('onboarding sets the profile, picks the matching teacher and marks it done', () => {
    expect([teacherFor('beginner'), teacherFor('intermediate'), teacherFor('expert')]).toEqual(['mia', 'dev', 'elena']);
    const rig = makeRig();
    rig.actions.completeOnboarding({ name: '  Robin \n', avatar: 'flame', experience: 'expert', dailyGoalXp: 50, handedness: 'left' });
    const state = rig.store.getState();
    expect(state.profile).toMatchObject({ name: 'Robin', avatar: 'flame', experience: 'expert', teacher: 'elena', onboarded: true });
    expect(state.prefs).toMatchObject({ dailyGoalXp: 50, handedness: 'left' });
    // An explicit teacher wins over the default for the level.
    const other = makeRig();
    other.actions.completeOnboarding({ experience: 'expert', teacher: 'mia' });
    expect(other.store.getState().profile.teacher).toBe('mia');
  });

  it('validates profile changes', () => {
    const rig = makeRig();
    rig.actions.setProfile({ name: 'x'.repeat(100), avatar: 'dragon', teacher: 'dev' });
    const { profile } = rig.store.getState();
    expect(profile.name).toHaveLength(40);
    expect(profile.avatar).toBe('guitar');
    expect(profile.teacher).toBe('dev');
    expect(AVATARS.map((a) => a.id)).toContain(profile.avatar);
  });

  it('merges preference patches deeply and keeps the rest', () => {
    const rig = makeRig();
    rig.actions.setPrefs({ sound: { volume: 0.3 }, camera: { mirrored: false }, a4: 432 });
    rig.actions.setPrefs({ sound: { uiSounds: false }, mic: { deviceId: 'usb-interface', sensitivity: 0.9 }, ai: { enabled: true } });
    const { prefs } = rig.store.getState();
    expect(prefs.sound).toEqual({ volume: 0.3, guitarTone: 'acoustic', clickSound: 'wood', uiSounds: false });
    expect(prefs.camera).toEqual({ deviceId: null, mirrored: false });
    expect(prefs.mic).toEqual({ deviceId: 'usb-interface', sensitivity: 0.9 });
    expect(prefs.a4).toBe(432);
    expect(prefs.ai.enabled).toBe(true);
    rig.actions.setPrefs({ mic: { deviceId: null } });
    expect(rig.store.getState().prefs.mic).toEqual({ deviceId: null, sensitivity: 0.9 });
  });

  it('ignores invalid preference values and keeps the old ones', () => {
    const rig = makeRig();
    rig.actions.setPrefs({ a4: 442, theme: 'dark' });
    const before = rig.store.getState();
    rig.actions.setPrefs({ theme: 'sepia' as never, dailyGoalXp: 25 as never, noteNaming: 'numbers' as never });
    expect(rig.store.getState()).toBe(before);
    rig.actions.setPrefs({ a4: 9999 });
    expect(rig.store.getState().prefs.a4).toBe(466);
  });
});

import { describe, expect, it } from 'vitest';
import { ROUTE_BY_NAME } from '@/app/routes';
import { ACHIEVEMENTS, selectAchievements, type AchievementView } from '@/core/progress';
import { emptyFixture, richFixture } from '../testing/fixtures';
import { FILTERS, GROUPS, TIERS, TIER_NAMES, closestGoals, filterCounts, gemsFromTrophies, groupAchievements, isInProgress, nextStepFor, progressFraction, progressText, recentTrophies, spokenLabel, tierCounts } from './model';

const NOW = Date.parse('2026-11-15T19:10:00Z');
const rich = selectAchievements(richFixture(NOW, 'UTC').store.getState());
const empty = selectAchievements(emptyFixture(NOW, 'UTC').store.getState());

function view(patch: Partial<AchievementView>): AchievementView {
  return { id: 'x', name: 'X', description: 'Do x.', icon: 'Star', tier: 'bronze', group: 'growth', gems: 5, unlocked: false, at: null, hidden: false, value: 0, target: 10, fraction: 0, ...patch };
}

describe('achievement groups', () => {
  it('has a heading for every group in the catalog, and no heading without achievements', () => {
    const inCatalog = new Set(ACHIEVEMENTS.map((a) => a.group));
    expect(new Set(GROUPS.map((g) => g.id))).toEqual(inCatalog);
    expect(new Set(GROUPS.map((g) => g.title)).size).toBe(GROUPS.length);
    expect(GROUPS[GROUPS.length - 1].id).toBe('secret');
  });

  it('shows every achievement exactly once under "All"', () => {
    const sections = groupAchievements(rich.list, 'all');
    const ids = sections.flatMap((s) => s.items.map((a) => a.id));
    expect(ids).toHaveLength(ACHIEVEMENTS.length);
    expect(new Set(ids).size).toBe(ACHIEVEMENTS.length);
    expect(sections.reduce((sum, s) => sum + s.total, 0)).toBe(rich.total);
    expect(sections.reduce((sum, s) => sum + s.earned, 0)).toBe(rich.unlocked);
    // Inside a group the catalog's own order is kept (3 days before 7 days before 14 days).
    const habit = sections.find((s) => s.id === 'habit');
    expect(habit?.items.slice(0, 3).map((a) => a.id)).toEqual(['streak-3', 'streak-7', 'streak-14']);
  });

  it('filters to earned and to in progress, dropping empty groups', () => {
    const earned = groupAchievements(rich.list, 'earned');
    expect(earned.flatMap((s) => s.items).every((a) => a.unlocked)).toBe(true);
    expect(earned.flatMap((s) => s.items)).toHaveLength(rich.unlocked);
    const progress = groupAchievements(rich.list, 'progress');
    expect(progress.flatMap((s) => s.items).every(isInProgress)).toBe(true);
    expect(progress.every((s) => s.items.length > 0)).toBe(true);
    // The counts on the filter chips match what each filter shows.
    const counts = filterCounts(rich.list);
    expect(counts).toEqual({ all: rich.total, earned: rich.unlocked, progress: progress.flatMap((s) => s.items).length });
    expect(FILTERS.map((f) => f.value)).toEqual(['all', 'earned', 'progress']);
    // A new learner has nothing earned: no sections at all, which the screen turns into an empty state.
    expect(groupAchievements(empty.list, 'earned')).toEqual([]);
  });

  it('keeps secrets secret until they are earned', () => {
    const secret = groupAchievements(empty.list, 'all').find((s) => s.id === 'secret');
    expect(secret?.items.length).toBeGreaterThan(0);
    for (const a of secret?.items ?? []) {
      expect(a.hidden).toBe(true);
      expect(spokenLabel(a)).toBe('Secret achievement, not found yet');
      expect(progressText(a)).toBe('Keep playing to find it');
      expect(nextStepFor(a)).toBeNull();
      expect(isInProgress(a)).toBe(false);
    }
    // Nothing about a hidden achievement leaks into the lists that suggest what to do next.
    expect(closestGoals(empty.list, 200).some((a) => a.hidden)).toBe(false);
  });
});

describe('counts and trophies', () => {
  it('counts earned and total per tier', () => {
    const tiers = tierCounts(rich.list);
    expect(TIERS.reduce((sum, t) => sum + tiers[t].total, 0)).toBe(rich.total);
    expect(TIERS.reduce((sum, t) => sum + tiers[t].earned, 0)).toBe(rich.unlocked);
    expect(Object.keys(TIER_NAMES)).toEqual([...TIERS]);
    expect(tierCounts(empty.list).bronze.earned).toBe(0);
  });

  it('adds up the gems the earned ones paid', () => {
    expect(gemsFromTrophies(empty.list)).toBe(0);
    expect(gemsFromTrophies(rich.list)).toBe(rich.list.filter((a) => a.unlocked).reduce((sum, a) => sum + a.gems, 0));
    expect(gemsFromTrophies(rich.list)).toBeGreaterThan(0);
  });

  it('shows the newest trophies first', () => {
    const recent = recentTrophies(rich.list, 4);
    expect(recent).toHaveLength(4);
    for (let i = 1; i < recent.length; i++) expect(recent[i].at ?? 0).toBeLessThanOrEqual(recent[i - 1].at ?? 0);
    expect(recentTrophies(empty.list)).toEqual([]);
  });

  it('suggests the locked ones closest to done, and the first steps to a new learner', () => {
    const close = closestGoals(rich.list, 3);
    expect(close).toHaveLength(3);
    expect(close.every((a) => !a.unlocked && !a.hidden)).toBe(true);
    for (let i = 1; i < close.length; i++) expect(progressFraction(close[i])).toBeLessThanOrEqual(progressFraction(close[i - 1]));
    expect(closestGoals(empty.list, 3).map((a) => a.id)).toEqual(['first-tune', 'first-lesson', 'first-song']);
    // Equal progress: the easier tier comes first.
    const tie = closestGoals([view({ id: 'gold', tier: 'gold', fraction: 0.5 }), view({ id: 'bronze', tier: 'bronze', fraction: 0.5 })], 2);
    expect(tie.map((a) => a.id)).toEqual(['bronze', 'gold']);
  });
});

describe('progress in words', () => {
  it('uses the unit the achievement is counted in', () => {
    expect(progressText(view({ value: 3, target: 10 }))).toBe('3 of 10');
    expect(progressText(view({ value: 1500, target: 25000 }))).toBe('1,500 of 25,000');
    expect(progressText(view({ id: 'time-10h', value: 2520, target: 36000 }))).toBe('42 min of 10 h');
    expect(progressText(view({ id: 'marathon', value: 1200, target: 3600 }))).toBe('20 min of 1 h');
    expect(progressText(view({ id: 'overachiever', value: 150, target: 200 }))).toBe('Best day so far: 150% of your goal');
    expect(progressText(view({ value: 0, target: 1 }))).toBe('Not yet');
    expect(progressText(view({ unlocked: true }))).toBe('Earned');
  });

  it('every time-based achievement in the catalog is shown as time', () => {
    for (const a of empty.list.filter((x) => /^time-|^marathon$/.test(x.id))) expect(progressText(a)).toMatch(/min of \d+ h$/);
  });

  it('counts a level achievement from level 1, where every learner starts', () => {
    const fresh = view({ id: 'level-5', value: 1, target: 5, fraction: 0.2 });
    expect(progressFraction(fresh)).toBe(0);
    expect(isInProgress(fresh)).toBe(false);
    expect(progressFraction(view({ id: 'level-5', value: 3, target: 5, fraction: 0.6 }))).toBe(0.5);
    expect(progressText(view({ id: 'level-10', value: 3, target: 10 }))).toBe('Level 3 of 10');
    expect(progressFraction(view({ value: 3, target: 10, fraction: 0.3 }))).toBe(0.3);
    expect(progressFraction(view({ unlocked: true, fraction: 1 }))).toBe(1);
    // A learner who has done nothing is "in progress" on nothing at all.
    expect(filterCounts(empty.list).progress).toBe(0);
  });

  it('says a tile aloud', () => {
    expect(spokenLabel(view({ name: 'Fortnight', tier: 'silver', value: 12, target: 14, fraction: 12 / 14 }))).toBe('Fortnight, Silver, in progress, 12 of 14');
    expect(spokenLabel(view({ name: 'In Tune', unlocked: true }))).toBe('In Tune, Bronze, earned');
    expect(spokenLabel(view({ name: 'Galaxy', tier: 'gold' }))).toBe('Galaxy, Gold, locked');
  });
});

describe('where to go for a locked achievement', () => {
  it('every locked, visible achievement leads to a screen that exists', () => {
    for (const a of empty.list.filter((x) => !x.hidden)) {
      const step = nextStepFor(a);
      expect(step, a.id).not.toBeNull();
      expect(ROUTE_BY_NAME[step?.route ?? ''], `${a.id} -> ${step?.route}`).toBeDefined();
      expect(step?.label.length).toBeGreaterThan(3);
    }
  });

  it('sends the obvious ones to the obvious place, and earned ones nowhere', () => {
    expect(nextStepFor(view({ id: 'first-tune', group: 'first-steps' }))?.route).toBe('tuner');
    expect(nextStepFor(view({ id: 'cosmetic-1', group: 'growth' }))).toMatchObject({ route: 'profile', params: ['shop'] });
    expect(nextStepFor(view({ id: 'streak-30', group: 'habit' }))?.route).toBe('home');
    expect(nextStepFor(view({ id: 'songs-5', group: 'songs' }))?.route).toBe('songs');
    expect(nextStepFor(view({ unlocked: true }))).toBeNull();
  });
});

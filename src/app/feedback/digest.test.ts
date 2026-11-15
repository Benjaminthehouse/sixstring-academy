import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, type ProgressEvent } from '@/core/progress';
import { MAX_TOASTS_PER_BURST, XpTally, digest, xpToastDetail } from './digest';

const at = 1_000_000;
const xp = (amount: number): ProgressEvent => ({ type: 'xp-gained', at, amount, base: amount, multiplier: 1, source: 'theory-lesson', tag: 'theory', total: 100 + amount });
const goal: ProgressEvent = { type: 'goal-met', at, day: '2026-03-02', xp: 25, goal: 20 };
const extended = (current: number): ProgressEvent => ({ type: 'streak-extended', at, day: '2026-03-02', current, longest: current });
const quest = (id: string, gems = 5): ProgressEvent => ({ type: 'quest-completed', at, id, scope: 'daily', title: `Quest ${id}`, gems });
const achievement = (tier: 'bronze' | 'silver' | 'gold' | 'platinum', id = `a-${tier}`): ProgressEvent => ({ type: 'achievement-unlocked', at, id, name: `Name ${id}`, tier, icon: 'Award', gems: 5 });

describe('digest', () => {
  it('does nothing for nothing', () => {
    expect(digest([])).toEqual({ xp: 0, xpInToast: false, toasts: [], modals: [], confetti: null, sound: null, heartsLeft: null });
  });

  it('adds up the XP of a burst and leaves the toast to the shell', () => {
    const plan = digest([xp(10), xp(5)]);
    expect(plan.xp).toBe(15);
    expect(plan.xpInToast).toBe(false);
    expect(plan.toasts).toEqual([]);
    expect(plan.sound).toBeNull();
  });

  it('celebrates a met goal with one toast that also names the XP and the streak', () => {
    const plan = digest([xp(15), goal, extended(4)]);
    expect(plan.toasts).toHaveLength(1);
    expect(plan.toasts[0].title).toBe('Daily goal met');
    expect(plan.toasts[0].description).toContain('+15 XP');
    expect(plan.toasts[0].description).toContain('4 day streak');
    expect(plan.xpInToast).toBe(true);
    expect(plan.confetti).toBe('medium');
    expect(plan.sound).toBe('streak');
    expect(plan.modals).toEqual([]);
  });

  it('gives a streak milestone a dialog instead of the goal toast', () => {
    const plan = digest([xp(10), goal, extended(7), { type: 'streak-milestone', at, days: 7, gems: 20 }]);
    expect(plan.modals).toEqual([{ kind: 'streak', days: 7, gems: 20 }]);
    expect(plan.toasts.find((t) => t.id === 'shell-goal')).toBeUndefined();
    expect(plan.xpInToast).toBe(false);
    expect(plan.confetti).toBe('high');
  });

  it('gives a level-up a dialog, the last level reached and all the gems', () => {
    const plan = digest([xp(60), { type: 'level-up', at, from: 2, to: 3, title: 'First Chord', gems: 10 }, { type: 'level-up', at, from: 3, to: 4, title: 'Clean Change', gems: 10 }]);
    expect(plan.modals).toEqual([{ kind: 'level', level: 4, title: 'Clean Change', gems: 20 }]);
    expect(plan.sound).toBe('levelUp');
    expect(plan.confetti).toBe('high');
  });

  it('shows small achievements as a toast and rare ones as dialogs', () => {
    const real = ACHIEVEMENTS[0];
    const one = digest([{ type: 'achievement-unlocked', at, id: real.id, name: real.name, tier: 'bronze', icon: real.icon, gems: 5 }]);
    expect(one.toasts).toHaveLength(1);
    expect(one.toasts[0].title).toBe(`Achievement: ${real.name}`);
    expect(one.toasts[0].description).toContain(real.description);
    expect(one.toasts[0].description).toContain('+5 gems');
    expect(one.sound).toBe('achievement');

    const many = digest([achievement('bronze', 'x'), achievement('silver', 'y'), achievement('gold', 'z')]);
    expect(many.toasts.map((t) => t.title)).toEqual(['2 achievements unlocked']);
    expect(many.toasts[0].description).toContain('+10 gems');
    expect(many.modals).toHaveLength(1);
    expect(many.modals[0]).toMatchObject({ kind: 'achievement', id: 'z', tier: 'gold' });
    expect(many.confetti).toBe('high');
  });

  it('folds quests into one toast and adds up their gems', () => {
    expect(digest([quest('tune')]).toasts[0]).toMatchObject({ title: 'Quest done: Quest tune', description: '+5 gems' });
    const two = digest([quest('a'), quest('b', 10)]).toasts[0];
    expect(two).toMatchObject({ title: '2 quests done', description: '+15 gems' });
    const sweep = digest([quest('a'), { type: 'quests-all-completed', at, day: '2026-03-02', gems: 10 }]);
    expect(sweep.toasts[0].title).toBe('All three daily quests done');
    expect(sweep.toasts[0].description).toContain('+15 gems');
    expect(sweep.sound).toBe('gem');
    expect(sweep.confetti).toBe('low');
  });

  it('flashes a lost heart quietly and only speaks up when none are left', () => {
    const some = digest([{ type: 'heart-lost', at, remaining: 3, empty: false }]);
    expect(some.heartsLeft).toBe(3);
    expect(some.toasts).toEqual([]);
    expect(some.sound).toBe('heartLost');
    const none = digest([{ type: 'heart-lost', at, remaining: 0, empty: true }]);
    expect(none.heartsLeft).toBe(0);
    expect(none.toasts[0]).toMatchObject({ id: 'shell-hearts', tone: 'warn', action: 'hearts' });
  });

  it('says so kindly when a streak ends, and not at all for a one-day streak', () => {
    expect(digest([{ type: 'streak-broken', at, previous: 1 }]).toasts).toEqual([]);
    const plan = digest([{ type: 'streak-broken', at, previous: 12 }]);
    expect(plan.toasts[0].title).toContain('12 day streak');
    expect(plan.toasts[0].tone).toBe('neutral');
    expect(plan.confetti).toBeNull();
  });

  it('reports a freeze, a boost and refilled hearts', () => {
    expect(digest([{ type: 'streak-freeze-used', at, day: '2026-03-01', remaining: 1 }]).toasts[0].description).toContain('1 freeze left');
    expect(digest([{ type: 'xp-boost-started', at, multiplier: 2, until: at + 15 * 60_000, source: 'shop' }]).toasts[0].title).toBe('2× XP for 15 minutes');
    expect(digest([{ type: 'hearts-refilled', at, count: 5, via: 'gems' }]).toasts[0].title).toBe('Hearts are full again');
  });

  it('warns once, and for good, when progress cannot be saved', () => {
    const plan = digest([{ type: 'save-failed', at }]);
    expect(plan.toasts[0]).toMatchObject({ id: 'shell-save', tone: 'warn', duration: 0 });
  });

  it('never shows more than the limit, and keeps the most important', () => {
    const plan = digest([
      xp(15),
      goal,
      extended(2),
      achievement('bronze'),
      quest('a'),
      { type: 'skill-levelled-up', at, id: 'scale:x', from: 0, to: 1, title: 'A minor pentatonic' },
      { type: 'xp-boost-started', at, multiplier: 2, until: at + 60_000, source: 'shop' },
    ]);
    expect(plan.toasts).toHaveLength(MAX_TOASTS_PER_BURST);
    expect(plan.toasts.map((t) => t.id)).toEqual(['shell-goal', 'shell-ach-a-bronze', 'shell-quest']);
  });

  it('stays silent when everything was reset or imported', () => {
    expect(digest([{ type: 'data-reset', at }, xp(10)])).toMatchObject({ xp: 0, toasts: [], modals: [] });
    expect(digest([{ type: 'data-imported', at, strategy: 'replace' }, achievement('gold')]).modals).toEqual([]);
  });

  it('ignores crowns without a title (marked by a screen, not earned in an attempt)', () => {
    expect(digest([{ type: 'skill-levelled-up', at, id: 'x', from: 0, to: 1, title: '' }]).toasts).toEqual([]);
  });
});

describe('XpTally', () => {
  it('keeps counting while gains come close together', () => {
    const tally = new XpTally(4000);
    expect(tally.add(5, 0)).toBe(5);
    expect(tally.add(10, 3000)).toBe(15);
    expect(tally.add(2, 6500)).toBe(17);
  });
  it('starts over after a pause', () => {
    const tally = new XpTally(4000);
    tally.add(5, 0);
    expect(tally.add(10, 4001)).toBe(10);
    tally.reset();
    expect(tally.add(3, 4002)).toBe(3);
  });
  it('ignores zero and negative amounts', () => {
    const tally = new XpTally();
    tally.add(5, 0);
    expect(tally.add(0, 10)).toBe(5);
    expect(tally.add(-3, 20)).toBe(5);
  });
});

describe('xpToastDetail', () => {
  it('says what is left, or that the goal is met', () => {
    expect(xpToastDetail({ xp: 12, goal: 20, met: false, remaining: 8 }, false)).toBe("8 XP to go for today's goal.");
    expect(xpToastDetail({ xp: 25, goal: 20, met: true, remaining: 0 }, false)).toBe('25 XP today. Goal met.');
    expect(xpToastDetail({ xp: 25, goal: 20, met: true, remaining: 0 }, true)).toContain('boost');
  });
});

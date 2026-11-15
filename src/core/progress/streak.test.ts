import { describe, expect, it } from 'vitest';
import { STREAK_MILESTONE_GEMS } from './catalog';
import { selectDailyGoal, selectStreak, selectWeek, xpHistory } from './selectors';
import { makeRig, type TestRig } from './testkit';

/** Earn exactly `xp` XP with one activity (an explicit amount, so tests do not depend on the XP table). */
function earn(rig: TestRig, xp: number): void {
  rig.actions.recordActivity({ kind: 'other', xp, durationSec: 60 });
}

/** Meet the default goal (20 XP) at the rig's current time. */
function meetGoal(rig: TestRig): void {
  earn(rig, 20);
}

describe('daily goal', () => {
  it('is met when the day reaches the goal, exactly once', () => {
    const rig = makeRig({ start: '2026-03-02T09:00:00Z' });
    earn(rig, 10);
    expect(selectDailyGoal(rig.store.getState())).toMatchObject({ day: '2026-03-02', xp: 10, goal: 20, met: false, remaining: 10, fraction: 0.5 });
    expect(rig.eventsOf('goal-met')).toHaveLength(0);

    earn(rig, 10);
    expect(selectDailyGoal(rig.store.getState())).toMatchObject({ xp: 20, met: true, remaining: 0, fraction: 1 });
    expect(rig.eventsOf('goal-met')).toEqual([{ type: 'goal-met', at: rig.clock.t, day: '2026-03-02', xp: 20, goal: 20 }]);

    earn(rig, 40);
    expect(rig.eventsOf('goal-met')).toHaveLength(1);
    expect(rig.store.getState().streak.current).toBe(1);
    expect(selectDailyGoal(rig.store.getState()).fraction).toBe(1);
  });

  it('reports what happened in the activity result', () => {
    const rig = makeRig();
    const first = rig.actions.recordActivity({ kind: 'other', xp: 12 });
    expect(first.goal).toEqual({ xp: 12, goal: 20, met: false, metNow: false });
    expect(first.streak).toEqual({ current: 0, extended: false });
    const second = rig.actions.recordActivity({ kind: 'other', xp: 12 });
    expect(second.goal).toEqual({ xp: 24, goal: 20, met: true, metNow: true });
    expect(second.streak).toEqual({ current: 1, extended: true });
    const third = rig.actions.recordActivity({ kind: 'other', xp: 12 });
    expect(third.goal.metNow).toBe(false);
    expect(third.streak.extended).toBe(false);
  });

  it('applies a lowered goal to today at once, and latches a met goal', () => {
    const rig = makeRig();
    rig.actions.setDailyGoal(50);
    earn(rig, 30);
    expect(selectDailyGoal(rig.store.getState())).toMatchObject({ goal: 50, met: false });

    rig.actions.setDailyGoal(20);
    expect(selectDailyGoal(rig.store.getState())).toMatchObject({ goal: 20, met: true });
    expect(rig.store.getState().streak.current).toBe(1);
    expect(rig.eventsOf('goal-met')).toHaveLength(1);

    // Raising the goal later does not take today's success away; it applies from tomorrow.
    rig.actions.setDailyGoal(50);
    expect(selectDailyGoal(rig.store.getState())).toMatchObject({ goal: 20, met: true });
    rig.clock.days(1);
    earn(rig, 30);
    expect(selectDailyGoal(rig.store.getState())).toMatchObject({ goal: 50, met: false });
    expect(rig.store.getState().streak.current).toBe(1);
  });

  it('keeps XP per local day for charts', () => {
    const rig = makeRig({ start: '2026-03-02T09:00:00Z' });
    earn(rig, 15);
    rig.clock.days(1);
    earn(rig, 25);
    rig.clock.days(2);
    earn(rig, 5);
    const history = xpHistory(rig.store.getState(), 5);
    expect(history.map((d) => [d.day, d.xp, d.met])).toEqual([
      ['2026-03-01', 0, false],
      ['2026-03-02', 15, false],
      ['2026-03-03', 25, true],
      ['2026-03-04', 0, false],
      ['2026-03-05', 5, false],
    ]);
  });
});

describe('streak', () => {
  it('counts consecutive days on which the goal was met', () => {
    const rig = makeRig({ start: '2026-03-02T09:00:00Z' });
    meetGoal(rig);
    rig.clock.days(1);
    meetGoal(rig);
    rig.clock.days(1);
    meetGoal(rig);
    const streak = selectStreak(rig.store.getState());
    expect(streak).toMatchObject({ current: 3, longest: 3, todayMet: true, pending: false, startedOn: '2026-03-02', lastGoalDay: '2026-03-04' });
    expect(rig.eventsOf('streak-extended').map((e) => e.current)).toEqual([1, 2, 3]);
  });

  it('does not count a day with practice below the goal, but tracks it as a practice day', () => {
    const rig = makeRig();
    for (let i = 0; i < 3; i++) {
      earn(rig, 5);
      rig.clock.days(1);
    }
    rig.store.tick();
    const streak = selectStreak(rig.store.getState());
    expect(streak.current).toBe(0);
    expect(streak.practiceDays).toBe(3); // three days in a row with any practice, ending yesterday
    expect(rig.store.getState().stats['active.days']).toBe(3);
    expect(rig.store.getState().stats['goal.days']).toBeUndefined();
  });

  it('is pending on a new day until the goal is met again', () => {
    const rig = makeRig();
    meetGoal(rig);
    rig.clock.days(1);
    rig.store.tick();
    expect(selectStreak(rig.store.getState())).toMatchObject({ current: 1, todayMet: false, pending: true });
    meetGoal(rig);
    expect(selectStreak(rig.store.getState())).toMatchObject({ current: 2, todayMet: true, pending: false });
  });

  it('breaks after a missed day and keeps the longest streak', () => {
    const rig = makeRig({ start: '2026-03-02T09:00:00Z' });
    for (let i = 0; i < 4; i++) {
      meetGoal(rig);
      rig.clock.days(1);
    }
    // Now on day 5 (2026-03-06) without practice on it yet; skip it entirely.
    rig.clock.days(1);
    rig.store.tick(); // 2026-03-07: 03-06 was missed
    expect(rig.eventsOf('streak-broken')).toEqual([{ type: 'streak-broken', at: rig.clock.t, previous: 4 }]);
    expect(selectStreak(rig.store.getState())).toMatchObject({ current: 0, longest: 4, startedOn: null });

    meetGoal(rig);
    expect(selectStreak(rig.store.getState())).toMatchObject({ current: 1, longest: 4, startedOn: '2026-03-07' });
    // The break is announced once, not on every later action.
    rig.store.tick();
    expect(rig.eventsOf('streak-broken')).toHaveLength(1);
  });

  it('treats 23:59 and 00:00 local time as different days', () => {
    const rig = makeRig({ start: '2026-03-02T22:59:30Z', timeZone: 'Europe/Berlin' }); // 23:59:30 local
    meetGoal(rig);
    rig.clock.advance(60_000); // 00:00:30 local on the 3rd
    meetGoal(rig);
    const state = rig.store.getState();
    expect(Object.keys(state.days)).toEqual(['2026-03-02', '2026-03-03']);
    expect(state.streak.current).toBe(2);
  });

  it('gives the same instants different days in different zones', () => {
    const instants = ['2026-03-02T23:30:00Z', '2026-03-03T00:30:00Z'];
    const run = (timeZone: string) => {
      const rig = makeRig({ start: instants[0], timeZone });
      meetGoal(rig);
      rig.clock.set(instants[1]);
      meetGoal(rig);
      return rig.store.getState();
    };
    expect(run('UTC').streak.current).toBe(2);
    const la = run('America/Los_Angeles'); // both instants are the afternoon of March 2nd
    expect(la.streak.current).toBe(1);
    expect(la.days['2026-03-02'].xp).toBe(40);
  });

  it('survives the spring-forward change (a 23-hour day)', () => {
    // Berlin, 2026-03-29: clocks jump from 02:00 to 03:00. Practise at 20:00 local every day.
    const rig = makeRig({ start: '2026-03-27T19:00:00Z', timeZone: 'Europe/Berlin' }); // 20:00 CET
    meetGoal(rig);
    rig.clock.set('2026-03-28T19:00:00Z'); // 20:00 CET
    meetGoal(rig);
    rig.clock.set('2026-03-29T18:00:00Z'); // 20:00 CEST, only 23 hours later
    meetGoal(rig);
    rig.clock.set('2026-03-30T18:00:00Z');
    meetGoal(rig);
    const state = rig.store.getState();
    expect(Object.keys(state.days)).toEqual(['2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30']);
    expect(state.streak.current).toBe(4);
    expect(rig.eventsOf('streak-broken')).toHaveLength(0);
  });

  it('survives the fall-back change (a 25-hour day), even at the edges of the long day', () => {
    // New York, 2026-11-01: 01:00-02:00 happens twice.
    const rig = makeRig({ start: '2026-10-31T03:30:00Z', timeZone: 'America/New_York' }); // Oct 30, 23:30 EDT
    meetGoal(rig);
    rig.clock.set('2026-11-01T03:30:00Z'); // Oct 31, 23:30 EDT
    meetGoal(rig);
    rig.clock.set('2026-11-01T04:10:00Z'); // Nov 1, 00:10 EDT (start of the long day)
    meetGoal(rig);
    rig.clock.set('2026-11-02T04:50:00Z'); // Nov 1, 23:50 EST (still the long day, 24h40m later)
    meetGoal(rig);
    rig.clock.set('2026-11-02T05:10:00Z'); // Nov 2, 00:10 EST
    meetGoal(rig);
    const state = rig.store.getState();
    expect(Object.keys(state.days)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(state.days['2026-11-01'].xp).toBe(40);
    expect(state.streak.current).toBe(4);
  });

  it('does not break when a flight east skips a calendar day', () => {
    // Goal met in Los Angeles on the evening of March 2nd ...
    const rig = makeRig({ start: '2026-03-03T04:00:00Z', timeZone: 'America/Los_Angeles' }); // Mar 2, 20:00 PST
    meetGoal(rig);
    expect(rig.store.getState().streak.lastGoalDay).toBe('2026-03-02');
    // ... then 20 hours later in Tokyo it is already the morning of March 4th.
    rig.clock.timeZone = 'Asia/Tokyo';
    rig.clock.set('2026-03-04T00:00:00Z'); // Mar 4, 09:00 JST
    rig.store.tick();
    expect(rig.eventsOf('streak-broken')).toHaveLength(0);
    meetGoal(rig);
    expect(rig.store.getState().streak).toMatchObject({ current: 2, lastGoalDay: '2026-03-04' });
  });

  it('does not double count or break when a flight west repeats a calendar day', () => {
    // Goal met in Tokyo on the morning of March 3rd ...
    const rig = makeRig({ start: '2026-03-03T00:00:00Z', timeZone: 'Asia/Tokyo' }); // Mar 3, 09:00 JST
    meetGoal(rig);
    // ... then in Los Angeles it is the evening of March 2nd again.
    rig.clock.timeZone = 'America/Los_Angeles';
    rig.clock.set('2026-03-03T04:00:00Z'); // Mar 2, 20:00 PST
    meetGoal(rig);
    let state = rig.store.getState();
    expect(state.meta.today).toBe('2026-03-03'); // the calendar does not run backwards
    expect(state.streak.current).toBe(1);
    expect(state.days['2026-03-03'].xp).toBe(40);
    // Next local day in Los Angeles (March 3rd there) is still "the 3rd": no extra streak day.
    rig.clock.set('2026-03-04T04:00:00Z'); // Mar 3, 20:00 PST
    meetGoal(rig);
    state = rig.store.getState();
    expect(state.streak.current).toBe(1);
    // The day after, the streak continues normally.
    rig.clock.set('2026-03-05T04:00:00Z'); // Mar 4, 20:00 PST
    meetGoal(rig);
    expect(rig.store.getState().streak.current).toBe(2);
    expect(rig.eventsOf('streak-broken')).toHaveLength(0);
  });

  it('copes with a device clock that jumps', () => {
    const rig = makeRig({ start: '2026-03-10T12:00:00Z' });
    meetGoal(rig);
    // Clock set back by a day: stay on the later day.
    rig.clock.set('2026-03-09T12:00:00Z');
    earn(rig, 5);
    expect(rig.store.getState().meta.today).toBe('2026-03-10');
    expect(rig.store.getState().days['2026-03-10'].xp).toBe(25);
    // Clock set back by weeks: the earlier date was wrong, trust the clock again.
    rig.clock.set('2026-02-01T12:00:00Z');
    earn(rig, 20);
    const state = rig.store.getState();
    expect(state.meta.today).toBe('2026-02-01');
    expect(state.streak.current).toBe(1); // never negative, never double counted
    expect(state.streak.lastGoalDay).toBe('2026-03-10');
    // And forward again to a normal date.
    rig.clock.set('2026-03-11T12:00:00Z');
    meetGoal(rig);
    expect(rig.store.getState().streak.current).toBe(2);
  });
});

describe('streak milestones', () => {
  it('celebrates 3 and 7 days and pays each milestone once', () => {
    const rig = makeRig();
    for (let i = 0; i < 7; i++) {
      meetGoal(rig);
      rig.clock.days(1);
    }
    expect(rig.eventsOf('streak-milestone').map((e) => [e.days, e.gems])).toEqual([
      [3, STREAK_MILESTONE_GEMS[3]],
      [7, STREAK_MILESTONE_GEMS[7]],
    ]);
    expect(rig.store.getState().streak.milestones).toEqual([3, 7]);
    expect(selectStreak(rig.store.getState())).toMatchObject({ nextMilestone: 14, daysToMilestone: 7 });

    // Break the streak and reach three days again: celebrated, but no second payout.
    rig.clock.days(3);
    for (let i = 0; i < 3; i++) {
      meetGoal(rig);
      rig.clock.days(1);
    }
    const again = rig.eventsOf('streak-milestone').slice(2);
    expect(again.map((e) => [e.days, e.gems])).toEqual([[3, 0]]);
  });
});

describe('streak freezes', () => {
  function rigWithStreak(freezes: number): TestRig {
    const rig = makeRig({ start: '2026-03-02T09:00:00Z' });
    rig.actions.grantGems(300, 'test');
    for (let i = 0; i < freezes; i++) expect(rig.actions.buy('streak-freeze').ok).toBe(true);
    for (let i = 0; i < 3; i++) {
      meetGoal(rig); // 03-02, 03-03, 03-04
      rig.clock.days(1);
    }
    return rig; // now 2026-03-05, streak 3, nothing done today
  }

  it('can be bought with gems, two at most', () => {
    const rig = makeRig();
    expect(rig.actions.grantGems(400, 'test')).toBe(400);
    expect(rig.actions.buy('streak-freeze')).toMatchObject({ ok: true, price: 60, balance: 340 });
    expect(rig.actions.buy('streak-freeze')).toMatchObject({ ok: true, balance: 280 });
    expect(rig.actions.buy('streak-freeze')).toEqual({ ok: false, item: 'streak-freeze', reason: 'max-held' });
    expect(rig.store.getState().streak.freezes).toBe(2);
    expect(rig.store.getState().gems).toMatchObject({ balance: 280, earned: 400, spent: 120 });
  });

  it('cannot be bought without enough gems', () => {
    const rig = makeRig();
    rig.actions.grantGems(59, 'test');
    expect(rig.actions.buy('streak-freeze')).toEqual({ ok: false, item: 'streak-freeze', reason: 'insufficient-gems' });
    expect(rig.store.getState().gems.balance).toBe(59);
  });

  it('covers one missed day automatically and keeps the streak', () => {
    const rig = rigWithStreak(1);
    rig.clock.days(1); // 03-05 passes without practice; now 03-06
    rig.store.tick();
    const state = rig.store.getState();
    expect(rig.eventsOf('streak-freeze-used')).toEqual([{ type: 'streak-freeze-used', at: rig.clock.t, day: '2026-03-05', remaining: 0 }]);
    expect(rig.eventsOf('streak-broken')).toHaveLength(0);
    expect(state.streak).toMatchObject({ current: 3, freezes: 0, coveredThrough: '2026-03-05', lastGoalDay: '2026-03-04' });
    expect(state.days['2026-03-05']).toMatchObject({ frozen: true, met: false, xp: 0 });
    expect(state.achievements['freeze-used']).toBeDefined();

    meetGoal(rig);
    expect(rig.store.getState().streak.current).toBe(4); // a frozen day keeps the streak but does not add to it
    const week = selectWeek(rig.store.getState());
    expect(week.find((d) => d.day === '2026-03-05')).toMatchObject({ frozen: true, met: false });
  });

  it('covers two missed days with two freezes', () => {
    const rig = rigWithStreak(2);
    rig.clock.days(2); // 03-05 and 03-06 missed; now 03-07
    rig.store.tick();
    const state = rig.store.getState();
    expect(rig.eventsOf('streak-freeze-used').map((e) => e.day)).toEqual(['2026-03-05', '2026-03-06']);
    expect(state.streak).toMatchObject({ current: 3, freezes: 0, coveredThrough: '2026-03-06' });
  });

  it('is kept when it could not save the streak anyway', () => {
    const rig = rigWithStreak(1);
    rig.clock.days(2); // two days missed, one freeze held
    rig.store.tick();
    const state = rig.store.getState();
    expect(rig.eventsOf('streak-freeze-used')).toHaveLength(0);
    expect(rig.eventsOf('streak-broken')).toHaveLength(1);
    expect(state.streak).toMatchObject({ current: 0, freezes: 1, longest: 3 });
  });

  it('is spent day by day when the app is opened daily without practising', () => {
    const rig = rigWithStreak(2);
    rig.clock.days(1); // 03-06: 03-05 missed
    rig.store.tick();
    expect(rig.store.getState().streak).toMatchObject({ current: 3, freezes: 1 });
    rig.clock.days(1); // 03-07: 03-06 missed
    rig.store.tick();
    expect(rig.store.getState().streak).toMatchObject({ current: 3, freezes: 0 });
    rig.clock.days(1); // 03-08: 03-07 missed, nothing left
    rig.store.tick();
    expect(rig.store.getState().streak).toMatchObject({ current: 0, freezes: 0 });
    expect(rig.eventsOf('streak-broken')).toHaveLength(1);
  });

  it('is not touched when there is no streak to protect, or no day was missed', () => {
    const rig = makeRig();
    rig.actions.grantGems(100, 'test');
    rig.actions.buy('streak-freeze');
    rig.clock.days(5);
    rig.store.tick();
    expect(rig.store.getState().streak.freezes).toBe(1);

    meetGoal(rig);
    rig.clock.days(1);
    meetGoal(rig);
    expect(rig.store.getState().streak).toMatchObject({ current: 2, freezes: 1 });
    expect(rig.eventsOf('streak-freeze-used')).toHaveLength(0);
  });
});

describe('weekly view', () => {
  it('shows the seven days of the current week with today and future flags', () => {
    const rig = makeRig({ start: '2026-03-04T09:00:00Z' }); // a Wednesday
    meetGoal(rig);
    const week = selectWeek(rig.store.getState());
    expect(week.map((d) => d.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(week.map((d) => d.day)).toEqual(['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08']);
    expect(week[2]).toMatchObject({ isToday: true, isFuture: false, met: true, xp: 20, active: true });
    expect(week[1]).toMatchObject({ isToday: false, isFuture: false, met: false, active: false });
    expect(week[3]).toMatchObject({ isFuture: true });
  });

  it('can start on Sunday', () => {
    const rig = makeRig({ start: '2026-03-04T09:00:00Z' });
    rig.actions.setPrefs({ weekStart: 'sunday' });
    const week = selectWeek(rig.store.getState());
    expect(week[0]).toMatchObject({ day: '2026-03-01', label: 'Sun' });
    expect(week[6]).toMatchObject({ day: '2026-03-07', label: 'Sat' });
  });

  it('returns the same array until something relevant changes', () => {
    const rig = makeRig();
    const a = selectWeek(rig.store.getState());
    rig.actions.setPrefs({ a4: 442 });
    expect(selectWeek(rig.store.getState())).toBe(a);
    meetGoal(rig);
    expect(selectWeek(rig.store.getState())).not.toBe(a);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createInitialState } from './defaults';
import { STORAGE_KEY, memoryStorage } from './persist';
import { reduce, type ProgressAction } from './reducer';
import { selectDailyGoal, selectLevel, selectQuests, selectStreak } from './selectors';
import { createProgressStore, shallowEqual, subscribeSelector } from './store';
import { at, deepFreeze, makeRig, manualTimers, testClock } from './testkit';
import type { ProgressState } from './types';

describe('reduce is pure', () => {
  const env = { now: at('2026-03-02T09:00:00Z'), timeZone: 'UTC' };
  const actions: ProgressAction[] = [
    { type: 'tick' },
    { type: 'activity', input: { kind: 'theory-lesson', id: 'theory:unit-1:lesson-1', accuracy: 1, mistakes: 0, durationSec: 200, route: 'learn', params: ['unit-1'], title: 'Lesson', combo: 8, data: { a: [1, 2] }, meta: { tempo: 80 } } },
    { type: 'activity', input: { kind: 'scale-game', id: 'scale:a-minor-pentatonic:box-1', accuracy: 0.97, combo: 30 } },
    { type: 'activity', input: { kind: 'review', count: 10, durationSec: 100 } },
    { type: 'xp/award', amount: 60, source: 'bonus', tag: 'songs' },
    { type: 'hearts/lose' },
    { type: 'hearts/refill', via: 'gift' },
    { type: 'gems/grant', amount: 600, reason: 'test' },
    { type: 'shop/buy', item: 'streak-freeze' },
    { type: 'shop/buy', item: 'wood-ebony' },
    { type: 'cosmetic/equip', id: 'wood-ebony' },
    { type: 'shop/buy', item: 'xp-boost' },
    { type: 'boost/start', multiplier: 2, minutes: 10, source: 'test' },
    { type: 'profile/set', patch: { name: 'Ana', avatar: 'flame' } },
    { type: 'prefs/set', patch: { theme: 'dark', sound: { volume: 0.2 }, dailyGoalXp: 10 } },
    { type: 'onboarding/complete', input: { name: 'Ana', experience: 'expert' } },
    { type: 'skill/data', id: 'song:greensleeves', data: { tempo: 90 } },
    { type: 'skill/mark', id: 'fretboard:string-6', mark: { completed: true, masteryAtLeast: 2 } },
    { type: 'srs/add', items: [{ id: 'c1', kind: 'interval' }, { id: 'c2', kind: 'interval' }] },
    { type: 'srs/grade', id: 'c1', grade: 'good' },
    { type: 'srs/remove', ids: ['c2'] },
    { type: 'favourite/set', item: { kind: 'song', id: 'greensleeves', title: 'Greensleeves', route: 'play', params: ['greensleeves'] } },
    { type: 'recent/touch', item: { route: 'scales', params: ['a-minor'], title: 'A minor', fraction: 0.3 } },
    { type: 'recent/remove', key: 'scales--a-minor' },
    { type: 'reset', keepPrefs: true },
  ];

  it('never mutates its input, for any action', () => {
    let state = deepFreeze(createInitialState({ ...env, deviceId: 'dev' }));
    let now = env.now;
    for (const action of actions) {
      now += 61_000;
      const before = JSON.stringify(state);
      const out = reduce(state, action, { now, timeZone: 'UTC' });
      expect(JSON.stringify(state), action.type).toBe(before);
      state = deepFreeze(out.state);
    }
    // And on a later day, where the rollover has work to do.
    const out = reduce(state, { type: 'activity', input: { kind: 'song', xp: 30 } }, { now: now + 3 * 86_400_000, timeZone: 'UTC' });
    expect(out.state.meta.today).toBe('2026-03-05');
  });

  it('never mutates the states handed to an import', () => {
    const make = (deviceId: string, days: number) => {
      const rig = makeRig({ deviceId });
      for (let d = 0; d < days; d++) {
        rig.actions.recordActivity({ kind: 'song', id: `song:${deviceId}-${d}`, accuracy: 0.9, xp: 25, durationSec: 60 });
        rig.clock.days(1);
      }
      return { state: deepFreeze(rig.store.getState()), now: rig.clock.t };
    };
    const local = make('dev-a', 2);
    const incoming = make('dev-b', 5);
    for (const strategy of ['replace', 'newest-wins'] as const) {
      const out = reduce(local.state, { type: 'import', state: incoming.state, strategy }, { now: incoming.now + 3 * 86_400_000, timeZone: 'UTC' });
      expect(out.state.skills['song:dev-b-4']).toBeDefined();
      expect(out.state.streak.current).toBe(0); // rolled forward: the imported streak has lapsed
      expect(out.events.map((e) => e.type)).toEqual(['data-imported']);
    }
  });

  it('is deterministic', () => {
    const start = createInitialState({ ...env, deviceId: 'dev' });
    const run = () => {
      let state = start;
      const events = [];
      let now = env.now;
      for (const action of actions) {
        now += 61_000;
        const out = reduce(state, action, { now, timeZone: 'UTC' });
        state = out.state;
        events.push(...out.events);
      }
      return JSON.stringify({ state, events });
    };
    expect(run()).toBe(run());
  });

  it('returns the very same state when nothing changes', () => {
    const state = createInitialState({ ...env, deviceId: 'dev' });
    const noops: ProgressAction[] = [
      { type: 'tick' },
      { type: 'prefs/set', patch: {} },
      { type: 'prefs/set', patch: { theme: 'system', sound: { volume: 0.8 } } },
      { type: 'profile/set', patch: {} },
      { type: 'hearts/refill', via: 'gift' },
      { type: 'srs/grade', id: 'missing', grade: 'good' },
      { type: 'srs/remove', ids: ['missing'] },
      { type: 'srs/add', items: [] },
      { type: 'recent/remove', key: 'missing' },
      { type: 'favourite/set', item: { kind: 'song', id: 'x' }, on: false },
      { type: 'cosmetic/equip', id: 'wood-koa' },
      { type: 'shop/buy', item: 'no-such-item' },
      { type: 'gems/grant', amount: 0, reason: 'x' },
      { type: 'xp/award', amount: 0, source: 'x' },
      { type: 'skill/data', id: 'never-seen', data: undefined },
    ];
    for (const action of noops) {
      const out = reduce(state, action, env);
      expect(out.state, action.type).toBe(state);
      expect(out.events, action.type).toEqual([]);
    }
  });

  it('shares untouched slices between the old and the new state', () => {
    const state = createInitialState({ ...env, deviceId: 'dev' });
    const { state: next } = reduce(state, { type: 'prefs/set', patch: { theme: 'dark' } }, env);
    expect(next).not.toBe(state);
    expect(next.prefs).not.toBe(state.prefs);
    for (const key of ['profile', 'xp', 'days', 'streak', 'hearts', 'gems', 'skills', 'srs', 'log', 'recents', 'favourites', 'quests', 'achievements', 'stats'] as const) {
      expect(next[key], key).toBe(state[key]);
    }
    // Inside the preferences, groups that did not change keep their identity too.
    expect(next.prefs.sound).toBe(state.prefs.sound);
    expect(next.prefs.review).toBe(state.prefs.review);
    const { state: louder } = reduce(next, { type: 'prefs/set', patch: { sound: { volume: 0.1 } } }, env);
    expect(louder.prefs.sound).not.toBe(next.prefs.sound);
    expect(louder.prefs.fretboard).toBe(next.prefs.fretboard);
    const { state: after } = reduce(next, { type: 'favourite/set', item: { kind: 'song', id: 'x' } }, env);
    expect(after.prefs).toBe(next.prefs);
    expect(after.favourites).not.toBe(next.favourites);
  });

  it('survives hostile input', () => {
    const state = createInitialState({ ...env, deviceId: 'dev' });
    const hostile = [
      { type: 'activity', input: { kind: 'nonsense', xp: Number.NaN, durationSec: -5, accuracy: 7, stars: 99, combo: Number.POSITIVE_INFINITY, count: 'many', route: '../etc', params: ['A B', 5], progress: 3, tag: 'cheating', meta: { a: Number.NaN, ok: 1 }, title: 5 } },
      { type: 'activity', input: { kind: 'song', xp: 1e9, durationSec: 1e9 } },
      { type: 'xp/award', amount: -100, source: 5 },
      { type: 'xp/award', amount: 1e12, source: 'x'.repeat(500) },
      { type: 'gems/grant', amount: Number.NaN, reason: null },
      { type: 'prefs/set', patch: null },
      { type: 'prefs/set', patch: { __proto__: { polluted: true }, a4: 'x', fretboard: 7 } },
      { type: 'profile/set', patch: { name: { toString: () => 'x' }, avatar: 5 } },
      { type: 'srs/add', items: [null, 5, { id: 5 }, { id: 'ok', kind: '' }] },
      { type: 'srs/add', items: 'cards' },
      { type: 'srs/remove', ids: null },
      { type: 'favourite/set', item: null },
      { type: 'recent/touch', item: { route: 'Bad Route', title: 'x' } },
      { type: 'skill/mark', id: 'x', mark: null },
      { type: 'boost/start', multiplier: 1e6, minutes: -4, source: '' },
      { type: 'made-up-action' },
    ] as unknown as ProgressAction[];
    let s: ProgressState = state;
    for (const action of hostile) {
      expect(() => {
        s = reduce(s, action, env).state;
      }, JSON.stringify(action).slice(0, 60)).not.toThrow();
    }
    // Everything stayed finite and in range.
    expect(s.xp.total).toBe(250 + 250);
    expect(s.days['2026-03-02'].sec).toBe(4 * 3600);
    expect(Object.keys(s.srs.items)).toEqual([]);
    expect(s.recents).toEqual([]);
    expect(s.xp.boost?.multiplier).toBe(3);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    expect(JSON.stringify(s)).not.toMatch(/null,"at"|NaN|Infinity/);
  });
});

describe('store basics', () => {
  it('notifies subscribers after a change and not after a no-op', () => {
    const rig = makeRig();
    const seen: number[] = [];
    const off = rig.store.subscribe(() => seen.push(rig.store.getState().meta.rev));
    rig.actions.recordActivity({ kind: 'tuner' });
    rig.store.tick();
    rig.actions.setPrefs({});
    rig.actions.setPrefs({ theme: 'dark' });
    expect(seen).toEqual([1, 2]);
    off();
    rig.actions.recordActivity({ kind: 'tuner' });
    expect(seen).toHaveLength(2);
  });

  it('emits events in order, after the state is committed', () => {
    const rig = makeRig();
    const order: string[] = [];
    rig.store.subscribe(() => order.push('state'));
    rig.store.onAny((event) => {
      // Handlers already see the new state.
      if (event.type === 'xp-gained') expect(rig.store.getState().xp.total).toBe(event.total);
      order.push(event.type);
    });
    rig.actions.recordActivity({ kind: 'other', xp: 25 });
    expect(order[0]).toBe('state');
    expect(order.slice(1)).toEqual(expect.arrayContaining(['xp-gained', 'level-up', 'goal-met', 'streak-extended']));
    expect(order.indexOf('xp-gained')).toBeLessThan(order.indexOf('goal-met'));
    expect(order.indexOf('goal-met')).toBeLessThan(order.indexOf('streak-extended'));
  });

  it('delivers typed events to typed handlers and stops after unsubscribing', () => {
    const rig = makeRig();
    const levels: number[] = [];
    const off = rig.store.on('level-up', (event) => levels.push(event.to));
    rig.actions.awardXp(25, 'test');
    off();
    rig.actions.awardXp(250, 'test');
    expect(levels).toEqual([2]);
  });

  it('keeps going when a subscriber or an event handler throws', () => {
    const rig = makeRig();
    const good = vi.fn();
    rig.store.subscribe(() => {
      throw new Error('broken subscriber');
    });
    rig.store.subscribe(good);
    rig.store.on('xp-gained', () => {
      throw new Error('broken handler');
    });
    const heard = vi.fn();
    rig.store.on('xp-gained', heard);
    expect(() => rig.actions.recordActivity({ kind: 'tuner' })).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(rig.store.getState().xp.total).toBe(5);
  });

  it('exposes its clock', () => {
    const rig = makeRig({ start: '2026-05-05T05:05:05Z', timeZone: 'Asia/Tokyo' });
    expect(rig.store.now()).toBe(at('2026-05-05T05:05:05Z'));
    expect(rig.store.timeZone()).toBe('Asia/Tokyo');
    expect(rig.store.getState().meta.today).toBe('2026-05-05');
  });
});

describe('events nobody heard yet', () => {
  it('reach a listener that subscribes shortly after, once', () => {
    const store = createProgressStore({ clock: testClock(), storage: null, timers: manualTimers() });
    store.dispatch({ type: 'activity', input: { kind: 'other', xp: 25 } });

    const goals: string[] = [];
    store.on('goal-met', (e) => goals.push(e.day));
    expect(goals).toEqual(['2026-03-02']);
    // A second listener for the same type does not get it again.
    const again: string[] = [];
    store.on('goal-met', (e) => again.push(e.day));
    expect(again).toEqual([]);

    // A catch-all listener gets everything else that is still waiting, in order.
    const rest: string[] = [];
    store.onAny((e) => rest.push(e.type));
    expect(rest).toContain('xp-gained');
    expect(rest).toContain('level-up');
    expect(rest).not.toContain('goal-met');
    expect(rest.indexOf('xp-gained')).toBeLessThan(rest.indexOf('level-up'));
    const late: string[] = [];
    store.onAny((e) => late.push(e.type));
    expect(late).toEqual([]);
  });

  it('are not held for a type that has a listener, and expire after a minute', () => {
    const clock = testClock();
    const store = createProgressStore({ clock, storage: null, timers: manualTimers() });
    const xp: number[] = [];
    store.on('xp-gained', (e) => xp.push(e.amount));
    store.dispatch({ type: 'activity', input: { kind: 'other', xp: 25 } });
    expect(xp).toEqual([25]);
    const replayed: number[] = [];
    store.on('xp-gained', (e) => replayed.push(e.amount));
    expect(replayed).toEqual([]);

    // The goal-met event waits, but only for a minute.
    clock.minutes(2);
    const goals: string[] = [];
    store.on('goal-met', (e) => goals.push(e.day));
    expect(goals).toEqual([]);
  });

  it('let the shell hear about a streak that ended while the app was closed', () => {
    const first = makeRig({ start: '2026-03-02T09:00:00Z' });
    for (let i = 0; i < 4; i++) {
      first.actions.recordActivity({ kind: 'other', xp: 20 });
      first.clock.days(1);
    }
    first.store.flush();

    // The app is opened three days later: the store loads and rolls over before any UI exists.
    const clock = testClock(first.clock.t + 3 * 86_400_000);
    const store = createProgressStore({ clock, storage: first.storage, timers: manualTimers() });
    store.tick();
    expect(store.getState().streak.current).toBe(0);
    // Then the shell mounts and subscribes.
    const broken: number[] = [];
    store.on('streak-broken', (e) => broken.push(e.previous));
    expect(broken).toEqual([4]);
  });
});

describe('debounced saving', () => {
  it('writes once after a burst of changes', () => {
    const rig = makeRig();
    expect(rig.storage.read(STORAGE_KEY)).toBeNull();
    rig.actions.recordActivity({ kind: 'tuner' });
    rig.actions.recordActivity({ kind: 'song' });
    rig.actions.setPrefs({ theme: 'dark' });
    expect(rig.storage.read(STORAGE_KEY)).toBeNull();
    expect(rig.timers.pending()).toBe(1); // one timer for the whole burst
    expect(rig.timers.delays).toEqual([400]);
    expect(rig.store.hasPendingSave()).toBe(true);

    rig.timers.run();
    expect(rig.store.hasPendingSave()).toBe(false);
    const saved = JSON.parse(rig.storage.read(STORAGE_KEY) as string);
    expect(saved.state).toEqual(rig.store.getState());

    // The next change schedules a new write.
    rig.actions.recordActivity({ kind: 'ear' });
    expect(rig.timers.pending()).toBe(1);
    expect(JSON.parse(rig.storage.read(STORAGE_KEY) as string).state.stats['count.ear']).toBeUndefined();
    rig.timers.run();
    expect(JSON.parse(rig.storage.read(STORAGE_KEY) as string).state.stats['count.ear']).toBe(1);
  });

  it('does not write when nothing changed', () => {
    const rig = makeRig();
    rig.store.tick();
    rig.actions.setPrefs({});
    expect(rig.timers.pending()).toBe(0);
    rig.store.flush();
    expect(rig.storage.read(STORAGE_KEY)).toBeNull();
  });

  it('flush writes at once and cancels the timer', () => {
    const rig = makeRig();
    rig.actions.recordActivity({ kind: 'tuner' });
    rig.store.flush();
    expect(rig.timers.pending()).toBe(0);
    expect(JSON.parse(rig.storage.read(STORAGE_KEY) as string).state.xp.total).toBe(5);
  });

  it('honours a custom delay and key', () => {
    const storage = memoryStorage();
    const timers = manualTimers();
    const store = createProgressStore({ clock: testClock(), storage, timers, saveDelayMs: 50, key: 'profile-2' });
    store.dispatch({ type: 'activity', input: { kind: 'tuner' } });
    expect(timers.delays).toEqual([50]);
    timers.run();
    expect(storage.read('profile-2')).not.toBeNull();
    expect(storage.read(STORAGE_KEY)).toBeNull();
  });

  it('restores everything after a reload', () => {
    const rig = makeRig();
    rig.actions.completeOnboarding({ name: 'Ana' });
    rig.actions.recordActivity({ kind: 'song', id: 'song:greensleeves', accuracy: 0.9, durationSec: 120 });
    rig.actions.loseHeart();
    rig.store.flush();
    const reloaded = makeRig({ storage: rig.storage, start: rig.clock.t });
    expect(reloaded.store.loadReport.source).toBe('saved');
    expect(reloaded.store.getState()).toEqual(rig.store.getState());
  });

  it('keeps the previous day’s save as a backup', () => {
    const rig = makeRig();
    rig.actions.recordActivity({ kind: 'tuner' });
    rig.store.flush();
    expect(rig.storage.read(`${STORAGE_KEY}.bak`)).toBeNull();
    rig.actions.recordActivity({ kind: 'song' });
    rig.store.flush();
    expect(rig.storage.read(`${STORAGE_KEY}.bak`)).toBeNull(); // same day: no new backup
    const endOfDayOne = rig.storage.read(STORAGE_KEY);

    rig.clock.days(1);
    rig.actions.recordActivity({ kind: 'ear' });
    rig.store.flush();
    expect(rig.storage.read(`${STORAGE_KEY}.bak`)).toBe(endOfDayOne);

    // If today's save gets damaged, the backup brings back the end of day one.
    rig.storage.write(STORAGE_KEY, '{{{{');
    const recovered = makeRig({ storage: rig.storage, start: rig.clock.t });
    expect(recovered.store.loadReport).toMatchObject({ source: 'backup', corrupt: true });
    expect(recovered.store.getState().stats['count.song']).toBe(1);
    expect(recovered.store.getState().stats['count.ear']).toBeUndefined();
  });

  it('destroy flushes and silences the store', () => {
    const rig = makeRig();
    const listener = vi.fn();
    rig.store.subscribe(listener);
    rig.actions.recordActivity({ kind: 'tuner' });
    rig.store.destroy();
    expect(JSON.parse(rig.storage.read(STORAGE_KEY) as string).state.xp.total).toBe(5);
    listener.mockClear();
    rig.actions.recordActivity({ kind: 'tuner' });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('cross-tab updates', () => {
  /** Two stores ("tabs") on the same storage and clock. */
  function twoTabs() {
    const first = makeRig();
    first.actions.recordActivity({ kind: 'tuner' });
    first.store.flush();
    const second = makeRig({ storage: first.storage, clock: first.clock });
    return { a: first, b: second };
  }

  it('takes over what another tab saved when this tab has nothing unsaved', () => {
    const { a, b } = twoTabs();
    a.actions.recordActivity({ kind: 'song', id: 'song:greensleeves', durationSec: 60 });
    a.actions.setPrefs({ theme: 'dark' });
    a.store.flush();

    const notified = vi.fn();
    b.store.subscribe(notified);
    expect(b.store.syncFromStorage()).toBe(true);
    expect(b.store.getState()).toEqual(a.store.getState());
    expect(notified).toHaveBeenCalledTimes(1);
    expect(b.store.hasPendingSave()).toBe(false); // nothing to write back

    // Nothing new: nothing happens.
    expect(b.store.syncFromStorage()).toBe(false);
    expect(notified).toHaveBeenCalledTimes(1);
    // The tab that wrote ignores its own write.
    expect(a.store.syncFromStorage()).toBe(false);
  });

  it('merges when both tabs changed something, and both end up equal', () => {
    const { a, b } = twoTabs();
    a.actions.recordActivity({ kind: 'song', id: 'song:greensleeves', durationSec: 60 });
    a.store.flush();
    b.actions.recordActivity({ kind: 'ear', accuracy: 0.9 });
    b.actions.toggleFavourite({ kind: 'scale', id: 'c-major' });
    expect(b.store.hasPendingSave()).toBe(true);

    expect(b.store.syncFromStorage()).toBe(true);
    const merged = b.store.getState();
    expect(merged.skills['song:greensleeves']).toBeDefined();
    expect(merged.stats['count.song']).toBe(1);
    expect(merged.stats['count.ear']).toBe(1);
    expect(merged.favourites['scale:c-major']).toBeDefined();
    expect(b.store.hasPendingSave()).toBe(true);

    b.store.flush();
    expect(a.store.syncFromStorage()).toBe(true);
    expect(a.store.getState()).toEqual(b.store.getState());
    // And it settles: no ping-pong.
    expect(b.store.syncFromStorage()).toBe(false);
    expect(a.store.hasPendingSave()).toBe(false);
  });

  it('does not overwrite another tab\u2019s work when it never got the storage event', () => {
    const { a, b } = twoTabs();
    a.actions.recordActivity({ kind: 'song', id: 'song:greensleeves', durationSec: 60 });
    a.actions.grantGems(15, 'test');
    a.store.flush();
    // Tab B was frozen in the background: no storage event, no sync. It wakes up and saves.
    const notified = vi.fn();
    b.store.subscribe(notified);
    b.actions.recordActivity({ kind: 'ear', accuracy: 0.9 });
    notified.mockClear();
    b.store.flush();

    const saved = JSON.parse(b.storage.read(STORAGE_KEY) as string).state as ProgressState;
    expect(saved.skills['song:greensleeves']).toBeDefined(); // A's work is still there
    expect(saved.stats['count.ear']).toBe(1); // and so is B's
    expect(saved.gems.earned).toBeGreaterThanOrEqual(15);
    expect(b.store.getState()).toEqual(saved);
    expect(notified).toHaveBeenCalledTimes(1); // B's UI learns about the merged state
    // Tab A then simply follows.
    expect(a.store.syncFromStorage()).toBe(true);
    expect(a.store.getState()).toEqual(b.store.getState());
    // Saving again merges nothing further.
    b.actions.recordActivity({ kind: 'rhythm' });
    notified.mockClear();
    b.store.flush();
    expect(notified).not.toHaveBeenCalled();
  });

  it('ignores unreadable data from another tab', () => {
    const { a, b } = twoTabs();
    const before = b.store.getState();
    a.storage.write(STORAGE_KEY, 'not json');
    expect(b.store.syncFromStorage()).toBe(false);
    expect(b.store.getState()).toBe(before);
  });
});

describe('subscribing to a slice', () => {
  it('calls the listener only when the selected value changes', () => {
    const rig = makeRig();
    const gems = vi.fn();
    const theme = vi.fn();
    const level = vi.fn();
    subscribeSelector(rig.store, (s) => s.gems.balance, gems);
    subscribeSelector(rig.store, (s) => s.prefs.theme, theme);
    subscribeSelector(rig.store, selectLevel, level);

    rig.actions.setPrefs({ a4: 442 }); // none of the three
    expect(gems).not.toHaveBeenCalled();
    expect(theme).not.toHaveBeenCalled();
    expect(level).not.toHaveBeenCalled();

    rig.actions.setPrefs({ theme: 'dark' });
    expect(theme).toHaveBeenCalledTimes(1);
    expect(theme).toHaveBeenLastCalledWith('dark', 'system');

    rig.actions.toggleFavourite({ kind: 'song', id: 'x' });
    rig.actions.loseHeart();
    expect(gems).not.toHaveBeenCalled();
    expect(level).not.toHaveBeenCalled();

    rig.actions.grantGems(7, 'test');
    expect(gems).toHaveBeenCalledTimes(1);
    expect(gems).toHaveBeenLastCalledWith(7, 0);
    expect(level).not.toHaveBeenCalled();

    rig.actions.awardXp(5, 'test');
    expect(level).toHaveBeenCalledTimes(1);
    expect(theme).toHaveBeenCalledTimes(1);
  });

  it('supports custom equality for selectors that build objects', () => {
    const rig = makeRig();
    const plain = vi.fn();
    const shallow = vi.fn();
    const pick = (s: ProgressState) => ({ gems: s.gems.balance, streak: s.streak.current });
    subscribeSelector(rig.store, pick, plain);
    subscribeSelector(rig.store, pick, shallow, shallowEqual);
    rig.actions.setPrefs({ theme: 'dark' });
    rig.actions.toggleFavourite({ kind: 'song', id: 'x' });
    expect(plain).toHaveBeenCalledTimes(2); // a new object every time
    expect(shallow).not.toHaveBeenCalled();
    rig.actions.grantGems(3, 'test');
    expect(shallow).toHaveBeenCalledTimes(1);
  });

  it('stops when unsubscribed', () => {
    const rig = makeRig();
    const listener = vi.fn();
    const off = subscribeSelector(rig.store, (s) => s.xp.total, listener);
    rig.actions.awardXp(5, 'test');
    off();
    rig.actions.awardXp(5, 'test');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('memoised selectors return the same object until their inputs change', () => {
    const rig = makeRig();
    const s1 = rig.store.getState();
    const snapshot = { level: selectLevel(s1), goal: selectDailyGoal(s1), streak: selectStreak(s1), quests: selectQuests(s1) };
    rig.actions.setPrefs({ theme: 'dark' });
    rig.actions.toggleFavourite({ kind: 'song', id: 'x' });
    rig.actions.loseHeart();
    const s2 = rig.store.getState();
    expect(selectLevel(s2)).toBe(snapshot.level);
    expect(selectDailyGoal(s2)).toBe(snapshot.goal);
    expect(selectStreak(s2)).toBe(snapshot.streak);
    expect(selectQuests(s2)).toBe(snapshot.quests);
    rig.actions.awardXp(5, 'test');
    const s3 = rig.store.getState();
    expect(selectLevel(s3)).not.toBe(snapshot.level);
    expect(selectDailyGoal(s3)).not.toBe(snapshot.goal);
  });
});

describe('shallowEqual', () => {
  it('compares one level deep', () => {
    expect(shallowEqual({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(true);
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(shallowEqual([1, 2], [1, 2])).toBe(true);
    expect(shallowEqual([1, 2], [2, 1])).toBe(false);
    expect(shallowEqual({ a: {} }, { a: {} })).toBe(false);
    expect(shallowEqual(null, null)).toBe(true);
    expect(shallowEqual<unknown>(null, {})).toBe(false);
    expect(shallowEqual(Number.NaN, Number.NaN)).toBe(true);
    expect(shallowEqual<unknown>([], {})).toBe(false);
  });
});

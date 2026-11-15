// @vitest-environment jsdom
import { act, createElement, useState, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keys as platformKeys, remove as platformRemove } from '@/core/platform/storage';
import { getProgressStore, recordActivity, setProgressStore } from './actions';
import { STORAGE_KEY } from './persist';
import {
  createSelectionSnapshot,
  useContinue,
  useDailyGoal,
  useFavourites,
  useGems,
  useHearts,
  useHeatmap,
  useIsFavourite,
  useLevel,
  usePrefs,
  useProgress,
  useProgressEvent,
  useQuests,
  useRecents,
  useReviewCounts,
  useSkill,
  useStreak,
  useXpBoost,
  useXpHistory,
} from './react';
import { selectLevel } from './selectors';
import { createProgressStore, shallowEqual } from './store';
import { applyAppearance, shouldReduceMotion } from './theme';
import { makeRig, manualTimers, testClock, type TestRig } from './testkit';
import type { ProgressState } from './types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  setProgressStore(null);
  // The platform layer mirrors writes in memory, so clear through it rather than localStorage alone.
  for (const key of platformKeys()) platformRemove(key);
  window.localStorage.clear();
  vi.useRealTimers();
  for (const name of ['data-theme', 'data-motion', 'data-accent']) document.documentElement.removeAttribute(name);
});

function render(element: ReactElement): void {
  act(() => root.render(element));
}

/** A component that shows a selected value and counts its renders. */
function probe<T>(rig: TestRig, selector: (s: ProgressState) => T, isEqual?: (a: T, b: T) => boolean) {
  const renders = { count: 0 };
  function Probe(): ReactElement {
    renders.count++;
    const value = useProgress(selector, isEqual, rig.store);
    return createElement('output', null, JSON.stringify(value));
  }
  return { Probe, renders };
}

describe('createSelectionSnapshot', () => {
  it('returns the previous result while the selection is equal', () => {
    let state = { a: { n: 1 }, b: 1 };
    let selector = (s: typeof state) => s.a;
    const snapshot = createSelectionSnapshot(
      () => state as unknown as ProgressState,
      () => selector as unknown as (s: ProgressState) => { n: number },
    );
    const first = snapshot();
    expect(snapshot()).toBe(first);
    state = { ...state, b: 2 }; // unrelated change
    expect(snapshot()).toBe(first);
    state = { ...state, a: { n: 2 } };
    expect(snapshot()).not.toBe(first);
    expect(snapshot()).toEqual({ n: 2 });
    // A new selector function with an equal result keeps the old reference.
    const before = snapshot();
    selector = (s) => s.a;
    expect(snapshot()).toBe(before);
  });

  it('calls the selector once per state, not once per read', () => {
    const state = { a: 1 } as unknown as ProgressState;
    const selector = vi.fn((s: ProgressState) => (s as unknown as { a: number }).a);
    const snapshot = createSelectionSnapshot(() => state, () => selector);
    snapshot();
    snapshot();
    snapshot();
    expect(selector).toHaveBeenCalledTimes(1);
  });

  it('uses the custom equality', () => {
    let state = { list: [1, 2] };
    const snapshot = createSelectionSnapshot(
      () => state as unknown as ProgressState,
      () => ((s: typeof state) => ({ first: s.list[0] })) as unknown as (s: ProgressState) => { first: number },
      shallowEqual,
    );
    const first = snapshot();
    state = { list: [1, 3] };
    expect(snapshot()).toBe(first);
    state = { list: [9, 3] };
    expect(snapshot()).toEqual({ first: 9 });
  });
});

describe('useProgress', () => {
  it('re-renders only when the selected slice changes', () => {
    const rig = makeRig();
    const { Probe, renders } = probe(rig, (s) => s.gems.balance);
    render(createElement(Probe));
    expect(container.textContent).toBe('0');
    expect(renders.count).toBe(1);

    // Lots of unrelated changes: no re-render.
    act(() => {
      rig.actions.setPrefs({ theme: 'dark' });
      rig.actions.toggleFavourite({ kind: 'song', id: 'x' });
      rig.actions.loseHeart();
      rig.actions.touchRecent({ route: 'play', params: ['x'], title: 'X' });
      rig.actions.addReviewItems([{ id: 'c', kind: 'interval' }]);
      rig.actions.awardXp(3, 'test'); // XP below any gem reward
    });
    expect(renders.count).toBe(1);

    act(() => {
      rig.actions.grantGems(12, 'test');
    });
    expect(renders.count).toBe(2);
    expect(container.textContent).toBe('12');

    // Several changes in one batch still give the latest value.
    act(() => {
      rig.actions.grantGems(1, 'test');
      rig.actions.grantGems(1, 'test');
    });
    expect(container.textContent).toBe('14');
    expect(renders.count).toBeLessThanOrEqual(4);
  });

  it('works with memoised selectors that return objects', () => {
    const rig = makeRig();
    const { Probe, renders } = probe(rig, selectLevel);
    render(createElement(Probe));
    act(() => {
      rig.actions.setPrefs({ theme: 'dark' });
      rig.actions.grantGems(5, 'test');
      rig.actions.loseHeart();
    });
    expect(renders.count).toBe(1);
    act(() => {
      rig.actions.awardXp(25, 'test');
    });
    expect(renders.count).toBe(2);
    expect(JSON.parse(container.textContent ?? '{}')).toMatchObject({ level: 2, title: 'First Fret' });
  });

  it('needs shallowEqual for inline selectors that build objects', () => {
    const rig = makeRig();
    const pick = (s: ProgressState) => ({ gems: s.gems.balance, hearts: s.hearts.count });
    const careless = probe(rig, pick);
    const careful = probe(rig, pick, shallowEqual);
    render(createElement('div', null, createElement(careless.Probe), createElement(careful.Probe)));
    act(() => {
      rig.actions.setPrefs({ theme: 'dark' });
    });
    act(() => {
      rig.actions.toggleFavourite({ kind: 'song', id: 'x' });
    });
    expect(careless.renders.count).toBe(3); // a new object on every store change
    expect(careful.renders.count).toBe(1);
    act(() => {
      rig.actions.loseHeart();
    });
    expect(careful.renders.count).toBe(2);
  });

  it('lets components on different slices update independently', () => {
    const rig = makeRig();
    const theme = probe(rig, (s) => s.prefs.theme);
    const xp = probe(rig, (s) => s.xp.total);
    render(createElement('div', null, createElement(theme.Probe), createElement(xp.Probe)));
    act(() => {
      rig.actions.setPrefs({ theme: 'light' });
    });
    expect([theme.renders.count, xp.renders.count]).toEqual([2, 1]);
    act(() => {
      rig.actions.awardXp(4, 'test');
    });
    expect([theme.renders.count, xp.renders.count]).toEqual([2, 2]);
  });

  it('follows a selector that changes between renders', () => {
    const rig = makeRig();
    rig.actions.recordActivity({ kind: 'song', id: 'song:a', score: 10 });
    rig.actions.recordActivity({ kind: 'song', id: 'song:b', score: 20 });
    let setId: (id: string) => void = () => undefined;
    function Best(): ReactElement {
      const [id, set] = useState('song:a');
      setId = set;
      const best = useProgress((s) => s.skills[id]?.bestScore ?? -1, Object.is, rig.store);
      return createElement('output', null, String(best));
    }
    render(createElement(Best));
    expect(container.textContent).toBe('10');
    act(() => setId('song:b'));
    expect(container.textContent).toBe('20');
    act(() => setId('song:missing'));
    expect(container.textContent).toBe('-1');
  });

  it('stops listening when the component unmounts', () => {
    const rig = makeRig();
    const selector = vi.fn((s: ProgressState) => s.xp.total);
    function Total(): ReactElement {
      return createElement('output', null, String(useProgress(selector, Object.is, rig.store)));
    }
    render(createElement(Total));
    act(() => root.render(createElement('div')));
    selector.mockClear();
    rig.actions.awardXp(5, 'test');
    expect(selector).not.toHaveBeenCalled();
  });
});

describe('ready-made hooks on the app store', () => {
  it('read from the store set with setProgressStore and follow its changes', () => {
    const rig = makeRig({ start: '2026-03-02T09:00:00Z' });
    setProgressStore(rig.store);
    expect(getProgressStore()).toBe(rig.store);
    const heard: string[] = [];

    function Dashboard(): ReactElement {
      const level = useLevel();
      const goal = useDailyGoal();
      const streak = useStreak();
      const quests = useQuests();
      const gems = useGems();
      const prefs = usePrefs();
      const hearts = useHearts();
      const boost = useXpBoost();
      const skill = useSkill('song:greensleeves');
      const favourite = useIsFavourite('song', 'greensleeves');
      const next = useContinue();
      useProgressEvent('goal-met', (event) => heard.push(`goal ${event.day}`));
      return createElement(
        'output',
        null,
        JSON.stringify({ level: level.level, xp: goal.xp, met: goal.met, streak: streak.current, quests: quests.daily.length, gems, theme: prefs.theme, hearts: hearts.count, boost: boost.active, crowns: skill.mastery, favourite, next: next?.title ?? null }),
      );
    }
    render(createElement(Dashboard));
    expect(JSON.parse(container.textContent ?? '')).toEqual({ level: 1, xp: 0, met: false, streak: 0, quests: 3, gems: 0, theme: 'system', hearts: 5, boost: false, crowns: 0, favourite: false, next: null });

    act(() => {
      recordActivity({ kind: 'song', id: 'song:greensleeves', title: 'Greensleeves', xp: 25, accuracy: 0.9, route: 'play', params: ['greensleeves'], progress: 0.5 });
      rig.actions.toggleFavourite({ kind: 'song', id: 'greensleeves' });
      rig.actions.setPrefs({ theme: 'dark' });
      rig.actions.loseHeart();
      rig.actions.startXpBoost(2, 5);
    });
    const shown = JSON.parse(container.textContent ?? '');
    expect(shown).toMatchObject({ level: 2, xp: 25, met: true, streak: 1, theme: 'dark', hearts: 4, boost: true, crowns: 1, favourite: true, next: 'Greensleeves' });
    expect(shown.gems).toBe(rig.store.getState().gems.balance);
    expect(heard).toEqual(['goal 2026-03-02']);
  });

  it('list hooks follow their slice and keep their result between unrelated changes', () => {
    const rig = makeRig({ start: '2026-03-04T09:00:00Z' });
    setProgressStore(rig.store);
    const seen: Array<{ recents: unknown; favourites: unknown; counts: unknown; history: unknown; heat: unknown }> = [];
    function Lists(): ReactElement {
      const recents = useRecents();
      const favourites = useFavourites('song');
      const counts = useReviewCounts(['interval']);
      const history = useXpHistory(3);
      const heat = useHeatmap(1);
      const theme = usePrefs().theme; // re-render on a preference change
      seen.push({ recents, favourites, counts, history, heat });
      return createElement('output', null, JSON.stringify({ theme, recents: recents.length, favourites: favourites.map((f) => f.id), due: counts.due, xp: history.map((d) => d.xp), heat: heat.map((c) => c.level) }));
    }
    render(createElement(Lists));
    expect(JSON.parse(container.textContent ?? '')).toEqual({ theme: 'system', recents: 0, favourites: [], due: 0, xp: [0, 0, 0], heat: [0, 0, 0] });

    act(() => {
      rig.actions.setPrefs({ theme: 'dark' });
    });
    // Re-rendered for the theme, but every derived list is the very same object as before.
    const [first, second] = [seen[0], seen[seen.length - 1]];
    expect(seen.length).toBe(2);
    for (const key of ['recents', 'favourites', 'counts', 'history', 'heat'] as const) expect(second[key], key).toBe(first[key]);

    act(() => {
      rig.actions.recordActivity({ kind: 'song', id: 'song:greensleeves', title: 'Greensleeves', xp: 25, route: 'play', params: ['greensleeves'] });
      rig.actions.toggleFavourite({ kind: 'song', id: 'greensleeves' });
      rig.actions.toggleFavourite({ kind: 'scale', id: 'c-major' });
      rig.actions.addReviewItems([{ id: 'i1', kind: 'interval' }, { id: 'i2', kind: 'interval' }, { id: 'f1', kind: 'theory-fact' }]);
    });
    expect(JSON.parse(container.textContent ?? '')).toEqual({ theme: 'dark', recents: 1, favourites: ['greensleeves'], due: 2, xp: [0, 0, 25], heat: [0, 0, 3] });
  });

  it('useHearts wakes up when a heart regenerates', () => {
    vi.useFakeTimers();
    const rig = makeRig();
    setProgressStore(rig.store);
    let renders = 0;
    function Hearts(): ReactElement {
      renders++;
      const hearts = useHearts();
      return createElement('output', null, `${hearts.count}/${hearts.max}`);
    }
    render(createElement(Hearts));
    act(() => {
      rig.actions.loseHeart();
      rig.actions.loseHeart();
    });
    expect(container.textContent).toBe('3/5');
    const before = renders;

    // Nineteen minutes: nothing to show yet, and no needless re-render.
    rig.clock.minutes(19);
    act(() => {
      vi.advanceTimersByTime(19 * 60_000);
    });
    expect(container.textContent).toBe('3/5');
    expect(renders).toBe(before);

    rig.clock.minutes(1);
    act(() => {
      vi.advanceTimersByTime(60_000 + 100);
    });
    expect(container.textContent).toBe('4/5');

    rig.clock.minutes(20);
    act(() => {
      vi.advanceTimersByTime(20 * 60_000 + 100);
    });
    expect(container.textContent).toBe('5/5');
    expect(vi.getTimerCount()).toBe(0); // full: no timer left running
  });

  it('useXpBoost switches off when the boost runs out', () => {
    vi.useFakeTimers();
    const rig = makeRig();
    setProgressStore(rig.store);
    function Boost(): ReactElement {
      const boost = useXpBoost();
      return createElement('output', null, boost.active ? `x${boost.multiplier}` : 'off');
    }
    render(createElement(Boost));
    expect(container.textContent).toBe('off');
    act(() => {
      rig.actions.startXpBoost(2, 10);
    });
    expect(container.textContent).toBe('x2');
    rig.clock.minutes(10);
    act(() => {
      vi.advanceTimersByTime(10 * 60_000 + 100);
    });
    expect(container.textContent).toBe('off');
  });
});

describe('appearance', () => {
  it('sets data-theme for light and dark and removes it for system', () => {
    const el = document.documentElement;
    applyAppearance({ theme: 'dark', motion: 'system', accent: 'accent-sunburst' });
    expect(el.getAttribute('data-theme')).toBe('dark');
    applyAppearance({ theme: 'light', motion: 'reduce', accent: 'accent-ocean' });
    expect(el.getAttribute('data-theme')).toBe('light');
    expect(el.getAttribute('data-motion')).toBe('reduce');
    expect(el.getAttribute('data-accent')).toBe('ocean');
    applyAppearance({ theme: 'system', motion: 'system', accent: 'accent-sunburst' });
    expect(el.hasAttribute('data-theme')).toBe(false);
    expect(el.hasAttribute('data-motion')).toBe(false);
    expect(el.hasAttribute('data-accent')).toBe(false);
  });

  it('can target another element and tolerates a missing one', () => {
    const el = document.createElement('div');
    applyAppearance({ theme: 'dark', motion: 'full', accent: 'accent-cherry' }, el);
    expect(el.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(() => applyAppearance({ theme: 'dark', motion: 'full', accent: 'accent-cherry' }, null)).not.toThrow();
  });

  it('resolves the reduced-motion override', () => {
    expect(shouldReduceMotion({ motion: 'reduce' })).toBe(true);
    expect(shouldReduceMotion({ motion: 'full' })).toBe(false);
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query })) as unknown as typeof window.matchMedia;
    expect(shouldReduceMotion({ motion: 'system' })).toBe(true);
    window.matchMedia = original;
    expect(shouldReduceMotion({ motion: 'system' })).toBe(false); // jsdom has no matchMedia: treated as "no preference"
  });
});

describe('a connected store', () => {
  it('applies the theme at once and whenever it changes', () => {
    const rig = makeRig();
    rig.actions.setPrefs({ theme: 'dark' });
    const disconnect = rig.store.connect();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    rig.actions.setPrefs({ theme: 'light' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    rig.actions.setPrefs({ theme: 'system' });
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    disconnect();
    rig.actions.setPrefs({ theme: 'dark' });
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false); // no longer connected
  });

  it('follows another tab through the storage event', () => {
    const a = makeRig();
    const b = makeRig({ storage: a.storage, clock: a.clock });
    const disconnect = b.store.connect();
    a.actions.recordActivity({ kind: 'song', id: 'song:greensleeves' });
    a.actions.setPrefs({ theme: 'dark' });
    a.store.flush();

    // An unrelated key is ignored.
    window.dispatchEvent(new StorageEvent('storage', { key: 'ssa:something-else', newValue: 'x' }));
    expect(b.store.getState().skills['song:greensleeves']).toBeUndefined();

    window.dispatchEvent(new StorageEvent('storage', { key: `ssa:${STORAGE_KEY}`, newValue: 'x' }));
    expect(b.store.getState()).toEqual(a.store.getState());
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark'); // and the theme follows
    disconnect();
  });

  it('saves when the page is hidden and rolls over when it becomes visible again', () => {
    const rig = makeRig({ start: '2026-03-02T22:00:00Z' });
    const disconnect = rig.store.connect();
    rig.actions.recordActivity({ kind: 'other', xp: 20 });
    expect(rig.storage.read(STORAGE_KEY)).toBeNull();

    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(JSON.parse(rig.storage.read(STORAGE_KEY) as string).state.xp.total).toBe(20);

    // The phone sleeps for two days; on return the streak check runs without any other action.
    rig.clock.days(2);
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(rig.store.getState().meta.today).toBe('2026-03-04');
    expect(rig.eventsOf('streak-broken')).toHaveLength(1);

    rig.actions.recordActivity({ kind: 'tuner' });
    window.dispatchEvent(new Event('pagehide'));
    expect(JSON.parse(rig.storage.read(STORAGE_KEY) as string).state.stats['count.tuner']).toBe(1);
    visibility.mockRestore();
    disconnect();
  });

  it('ticks once a minute while connected', () => {
    vi.useFakeTimers();
    const rig = makeRig({ start: '2026-03-02T23:59:30Z' });
    const disconnect = rig.store.connect();
    expect(rig.store.getState().meta.today).toBe('2026-03-02');
    rig.clock.minutes(1);
    vi.advanceTimersByTime(60_000);
    expect(rig.store.getState().meta.today).toBe('2026-03-03');
    disconnect();
    rig.clock.days(1);
    vi.advanceTimersByTime(5 * 60_000);
    expect(rig.store.getState().meta.today).toBe('2026-03-03');
  });
});

describe('the default store', () => {
  it('persists through the platform storage layer', () => {
    const timers = manualTimers();
    const store = createProgressStore({ clock: testClock('2026-03-02T09:00:00Z'), timers });
    store.dispatch({ type: 'activity', input: { kind: 'tuner' } });
    store.flush();
    const raw = window.localStorage.getItem(`ssa:${STORAGE_KEY}`);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).state.xp.total).toBe(5);

    const again = createProgressStore({ clock: testClock('2026-03-02T09:05:00Z'), timers });
    expect(again.loadReport.source).toBe('saved');
    expect(again.getState().xp.total).toBe(5);
  });

  it('is created lazily, connected, and replaceable', () => {
    const first = getProgressStore();
    expect(getProgressStore()).toBe(first);
    recordActivity({ kind: 'tuner' });
    expect(first.getState().stats['count.tuner']).toBe(1);
    // Replacing it flushes the old one.
    const rig = makeRig();
    setProgressStore(rig.store);
    expect(window.localStorage.getItem(`ssa:${STORAGE_KEY}`)).not.toBeNull();
    recordActivity({ kind: 'tuner' });
    expect(rig.store.getState().stats['count.tuner']).toBe(1);
    expect(first.getState().stats['count.tuner']).toBe(1);
  });
});

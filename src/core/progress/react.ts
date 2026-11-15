/**
 * React bindings of the progress store.
 *
 *   const xp = useProgress((s) => s.xp.total);            // re-renders only when that number changes
 *   const level = useProgress(selectLevel);               // memoised selector: stable object
 *   const pair = useProgress((s) => ({ a: s.gems.balance, b: s.streak.current }), shallowEqual);
 *
 * A selector must be pure. If it builds a new object or array every time, pass `shallowEqual`
 * (or use one of the memoised `select*` selectors), otherwise the component re-renders on every
 * store change.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { getProgressStore } from './actions';
import type { ProgressEventOf, ProgressEventType } from './events';
import { heartsView, type HeartsView } from './hearts';
import type { LevelInfo } from './levels';
import {
  favouritesOf,
  isFavourite,
  practiceHeatmap,
  selectAchievements,
  selectContinue,
  selectDailyGoal,
  selectLevel,
  selectQuests,
  selectStreak,
  selectWeek,
  skillView,
  xpBoostOf,
  xpHistory,
  type AchievementsView,
  type DailyGoalView,
  type DayView,
  type HeatCell,
  type QuestsView,
  type SkillView,
  type StreakView,
  type WeekDayView,
  type XpBoostView,
} from './selectors';
import { reviewCounts, type ReviewCounts } from './srs';
import type { ProgressStore } from './store';
import type { Favourite, Preferences, Profile, ProgressState, RecentItem } from './types';

/**
 * Build the `getSnapshot` function `useSyncExternalStore` needs for a selected slice: it returns
 * the previous result object whenever the new result is equal to it, so React sees no change.
 * Exported so the logic can be tested without rendering anything.
 */
export function createSelectionSnapshot<T>(
  getState: () => ProgressState,
  getSelector: () => (state: ProgressState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): () => T {
  let has = false;
  let lastState: ProgressState | null = null;
  let lastSelector: ((state: ProgressState) => T) | null = null;
  let value: T;
  return () => {
    const state = getState();
    const selector = getSelector();
    if (has && state === lastState && selector === lastSelector) return value;
    const next = selector(state);
    if (!has || !isEqual(value, next)) value = next;
    has = true;
    lastState = state;
    lastSelector = selector;
    return value;
  };
}

/**
 * Subscribe a component to a slice of the progress state. The component re-renders only when the
 * selected value changes (compared with `isEqual`, default `Object.is`).
 */
export function useProgress<T>(selector: (state: ProgressState) => T, isEqual: (a: T, b: T) => boolean = Object.is, store: ProgressStore = getProgressStore()): T {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const equalRef = useRef(isEqual);
  equalRef.current = isEqual;
  const getSnapshot = useMemo(
    () => createSelectionSnapshot(store.getState, () => selectorRef.current, (a: T, b: T) => equalRef.current(a, b)),
    [store],
  );
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

/** The app's progress store (for dispatching from event handlers or reading `now()`). */
export function useProgressStore(): ProgressStore {
  return getProgressStore();
}

/** The learner's preferences. */
export function usePrefs(): Preferences {
  return useProgress(selectPrefs);
}
const selectPrefs = (s: ProgressState): Preferences => s.prefs;

/** The learner's profile. */
export function useProfile(): Profile {
  return useProgress(selectProfile);
}
const selectProfile = (s: ProgressState): Profile => s.profile;

/** Level, title and XP bar numbers. */
export function useLevel(): LevelInfo {
  return useProgress(selectLevel);
}

/** Today's XP against the daily goal. */
export function useDailyGoal(): DailyGoalView {
  return useProgress(selectDailyGoal);
}

/** The streak. */
export function useStreak(): StreakView {
  return useProgress(selectStreak);
}

/** The seven days of the current week. */
export function useWeek(): WeekDayView[] {
  return useProgress(selectWeek);
}

/** Today's quests and the weekly challenge. */
export function useQuests(): QuestsView {
  return useProgress(selectQuests);
}

/** The achievement catalog with unlock state. */
export function useAchievements(): AchievementsView {
  return useProgress(selectAchievements);
}

/** The gem balance. */
export function useGems(): number {
  return useProgress(selectGems);
}
const selectGems = (s: ProgressState): number => s.gems.balance;

/** The item to offer under "continue where you left off", or null. */
export function useContinue(): RecentItem | null {
  return useProgress(selectContinue);
}

/** Whether an item is bookmarked. */
export function useIsFavourite(kind: string, id: string): boolean {
  return useProgress((s) => isFavourite(s, kind, id));
}

/**
 * Re-render at a moment in the future (epoch ms), and whenever `at` changes. Returns a counter
 * that goes up on each wake-up. Used by the hooks below for things that change with time rather
 * than with the state.
 */
function useWakeAt(at: number | null, store: ProgressStore): number {
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    if (at === null) return undefined;
    // +50 ms so the clock has certainly passed the mark when we re-read it.
    const delay = Math.min(2_147_000_000, Math.max(0, at - store.now()) + 50);
    const handle = setTimeout(() => setBeat((n) => n + 1), delay);
    return () => clearTimeout(handle);
  }, [at, store]);
  return beat;
}

/** The hearts right now. Re-renders when a heart is lost, refilled or regenerates. */
export function useHearts(): HeartsView {
  const store = getProgressStore();
  const hearts = useProgress(selectHeartsSlice);
  const unlimited = useProgress(selectUnlimited);
  // When the next heart is due is a pure function of the slice, so it can schedule the wake-up.
  const nextAt = unlimited ? null : heartsView(hearts, store.now(), false).nextAt;
  const beat = useWakeAt(nextAt, store);
  // `beat` is a dependency on purpose: a wake-up must re-read the clock.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => heartsView(hearts, store.now(), unlimited), [hearts, unlimited, store, beat]);
}
const selectHeartsSlice = (s: ProgressState): ProgressState['hearts'] => s.hearts;
const selectUnlimited = (s: ProgressState): boolean => s.prefs.unlimitedHearts;

/** The running XP boost. Re-renders when one starts and when it runs out. */
export function useXpBoost(): XpBoostView {
  const store = getProgressStore();
  const boost = useProgress((s) => s.xp.boost);
  useWakeAt(boost ? boost.until : null, store);
  return xpBoostOf({ xp: { boost } } as ProgressState, store.now());
}

/** One skill with crowns, stars and strength. Re-renders when its record changes. */
export function useSkill(id: string): SkillView {
  const store = getProgressStore();
  const record = useProgress((s) => s.skills[id]);
  return useMemo(() => skillView({ skills: record ? { [id]: record } : {} } as ProgressState, id, store.now()), [record, id, store]);
}

/** The "recently used" list, newest first. */
export function useRecents(): RecentItem[] {
  return useProgress(selectRecents);
}
const selectRecents = (s: ProgressState): RecentItem[] => s.recents;

/** Bookmarks, newest first, optionally of one kind. */
export function useFavourites(kind?: string): Favourite[] {
  const favourites = useProgress(selectFavourites);
  return useMemo(() => favouritesOf({ favourites } as ProgressState, kind), [favourites, kind]);
}
const selectFavourites = (s: ProgressState): ProgressState['favourites'] => s.favourites;

/** Review card counts (new / learning / review / due) for a deck badge, optionally for some kinds only. */
export function useReviewCounts(kinds?: readonly string[]): ReviewCounts {
  const store = getProgressStore();
  const srs = useProgress(selectSrs);
  const caps = useProgress(selectReviewCaps);
  const today = useProgress(selectToday);
  const key = kinds ? kinds.join('|') : '';
  // `key` stands in for `kinds`, which is usually a fresh array on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => reviewCounts(srs, store.now(), today, caps, kinds ? { kinds } : {}), [srs, caps, today, key, store]);
}
const selectSrs = (s: ProgressState): ProgressState['srs'] => s.srs;
const selectReviewCaps = (s: ProgressState): Preferences['review'] => s.prefs.review;
const selectToday = (s: ProgressState): string => s.meta.today;

/** XP per local day for the last `days` days, oldest first (for a bar chart). */
export function useXpHistory(days = 30): DayView[] {
  const record = useProgress(selectDays);
  const today = useProgress(selectToday);
  const goal = useProgress(selectGoalPref);
  return useMemo(() => xpHistory({ days: record, meta: { today }, prefs: { dailyGoalXp: goal } } as ProgressState, days), [record, today, goal, days]);
}
const selectDays = (s: ProgressState): ProgressState['days'] => s.days;
const selectGoalPref = (s: ProgressState): number => s.prefs.dailyGoalXp;

/** The calendar heat map for the last `weeks` weeks, oldest first. */
export function useHeatmap(weeks = 26): HeatCell[] {
  const record = useProgress(selectDays);
  const today = useProgress(selectToday);
  const goal = useProgress(selectGoalPref);
  const weekStart = useProgress(selectWeekStart);
  return useMemo(
    () => practiceHeatmap({ days: record, meta: { today }, prefs: { dailyGoalXp: goal, weekStart } } as ProgressState, weeks),
    [record, today, goal, weekStart, weeks],
  );
}
const selectWeekStart = (s: ProgressState): Preferences['weekStart'] => s.prefs.weekStart;

/** Call `handler` for every progress event of a type while the component is mounted. */
export function useProgressEvent<T extends ProgressEventType>(type: T, handler: (event: ProgressEventOf<T>) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => getProgressStore().on(type, (event) => handlerRef.current(event)), [type]);
}

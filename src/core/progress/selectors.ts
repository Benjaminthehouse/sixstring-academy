/**
 * Read-side helpers: pure functions from the state (and, where time matters, `now`) to what a
 * screen wants to show. Selectors named `select*` are memoised on the slices they read, so they
 * return the same object until those slices change and can be passed straight to `useProgress`.
 *
 * "Today" is `state.meta.today`: the store rolls the state over when the local day changes.
 */
import { achievementViews, type AchievementView } from './achievements';
import { ACTIVITY_KINDS, CONSUMABLES, COSMETICS, MAX_HEARTS, MAX_STREAK_FREEZES, QUEST_SWEEP_GEMS, STREAK_MILESTONES, type ConsumableDef, type CosmeticDef } from './catalog';
import { heartsView, type HeartsView } from './hearts';
import { levelInfo, type LevelInfo } from './levels';
import { describeQuest, type QuestView } from './quests';
import { isRusty, nextCrown, skillStrength, strengthLabel, type StrengthLabel } from './skills';
import { dueQueue, reviewCounts, type ReviewCounts, type ReviewQuery } from './srs';
import { addDays, dayRange, weekStartOf, weekday } from './time';
import type { ActivityKind, DayKey, Favourite, MasteryLevel, ProgressState, RecentItem, ReviewItem, SkillRecord, Stars } from './types';

/** Memoise a state selector on the inputs it picks (compared with `Object.is`). */
function cached<I extends unknown[], R>(pick: (state: ProgressState) => readonly [...I], compute: (...inputs: I) => R): (state: ProgressState) => R {
  let last: readonly unknown[] | null = null;
  let value: R;
  return (state) => {
    const inputs = pick(state);
    const previous = last;
    if (previous && previous.length === inputs.length && inputs.every((v, i) => Object.is(v, previous[i]))) return value;
    last = inputs;
    value = compute(...(inputs as unknown as I));
    return value;
  };
}

// ---------------------------------------------------------------------------------------------
// XP, level, daily goal
// ---------------------------------------------------------------------------------------------

/** Level, title and progress to the next level. */
export const selectLevel: (state: ProgressState) => LevelInfo = cached(
  (s) => [s.xp.total] as const,
  (total) => levelInfo(total),
);

/** Today's progress toward the daily goal. */
export interface DailyGoalView {
  day: DayKey;
  xp: number;
  goal: number;
  met: boolean;
  /** 0 to 1. */
  fraction: number;
  /** XP still missing today. */
  remaining: number;
}

/** Today's XP against the daily goal. */
export const selectDailyGoal: (state: ProgressState) => DailyGoalView = cached(
  (s) => [s.meta.today, s.days[s.meta.today], s.prefs.dailyGoalXp] as const,
  (day, record, prefGoal) => {
    const xp = record?.xp ?? 0;
    const goal = record?.goal ?? prefGoal;
    return { day, xp, goal, met: record?.met ?? false, fraction: Math.min(1, xp / goal), remaining: Math.max(0, goal - xp) };
  },
);

/** An XP boost as it is at `now`. */
export interface XpBoostView {
  active: boolean;
  multiplier: number;
  until: number;
  msLeft: number;
}

/** The running XP boost, if any. */
export function xpBoostOf(state: ProgressState, now: number): XpBoostView {
  const boost = state.xp.boost;
  if (!boost || boost.until <= now) return { active: false, multiplier: 1, until: 0, msLeft: 0 };
  return { active: true, multiplier: boost.multiplier, until: boost.until, msLeft: boost.until - now };
}

/** One day of an XP chart. */
export interface DayView {
  day: DayKey;
  xp: number;
  goal: number;
  met: boolean;
  frozen: boolean;
  /** Seconds practised. */
  sec: number;
  /** Any activity was recorded. */
  active: boolean;
}

function dayView(state: ProgressState, day: DayKey): DayView {
  const record = state.days[day];
  return {
    day,
    xp: record?.xp ?? 0,
    goal: record?.goal ?? state.prefs.dailyGoalXp,
    met: record?.met ?? false,
    frozen: record?.frozen === true,
    sec: record?.sec ?? 0,
    active: (record?.n ?? 0) > 0,
  };
}

/** XP per local day for the last `days` days, oldest first, ending today. */
export function xpHistory(state: ProgressState, days = 30): DayView[] {
  const today = state.meta.today;
  return dayRange(addDays(today, -(Math.max(1, days) - 1)), today).map((day) => dayView(state, day));
}

// ---------------------------------------------------------------------------------------------
// Streak, week, heat map
// ---------------------------------------------------------------------------------------------

/** The streak, ready to show. */
export interface StreakView {
  /** Consecutive days with the daily goal met. */
  current: number;
  longest: number;
  /** Today's goal is already met. */
  todayMet: boolean;
  /** The streak is alive but today's goal is still open. */
  pending: boolean;
  freezes: number;
  maxFreezes: number;
  startedOn: DayKey | null;
  lastGoalDay: DayKey | null;
  /** Consecutive days with any practice at all (ending today, or yesterday if today is still empty). */
  practiceDays: number;
  /** The next streak length that is celebrated, or null past the last one. */
  nextMilestone: number | null;
  daysToMilestone: number;
}

function practiceRun(days: ProgressState['days'], today: DayKey): number {
  let day = (days[today]?.n ?? 0) > 0 ? today : addDays(today, -1);
  let run = 0;
  while ((days[day]?.n ?? 0) > 0 && run < 10_000) {
    run++;
    day = addDays(day, -1);
  }
  return run;
}

/** The streak with everything a streak widget shows. */
export const selectStreak: (state: ProgressState) => StreakView = cached(
  (s) => [s.streak, s.days, s.meta.today] as const,
  (streak, days, today) => {
    const todayMet = days[today]?.met === true;
    const nextMilestone = STREAK_MILESTONES.find((n) => n > streak.current) ?? null;
    return {
      current: streak.current,
      longest: streak.longest,
      todayMet,
      pending: streak.current > 0 && !todayMet,
      freezes: streak.freezes,
      maxFreezes: MAX_STREAK_FREEZES,
      startedOn: streak.startedOn,
      lastGoalDay: streak.lastGoalDay,
      practiceDays: practiceRun(days, today),
      nextMilestone,
      daysToMilestone: nextMilestone === null ? 0 : nextMilestone - streak.current,
    };
  },
);

/** One day of the weekly strip. */
export interface WeekDayView extends DayView {
  /** 0 = Sunday ... 6 = Saturday. */
  weekday: number;
  /** Mon, Tue ... */
  label: string;
  isToday: boolean;
  isFuture: boolean;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** The seven days of the current week (starting on the preferred weekday). */
export const selectWeek: (state: ProgressState) => WeekDayView[] = cached(
  (s) => [s.days, s.meta.today, s.prefs.weekStart, s.prefs.dailyGoalXp] as const,
  (days, today, weekStart, goal) => {
    const start = weekStartOf(today, weekStart === 'sunday' ? 0 : 1);
    const shell = { days, prefs: { dailyGoalXp: goal } } as ProgressState;
    return dayRange(start, addDays(start, 6)).map((day) => {
      const wd = weekday(day);
      return { ...dayView(shell, day), weekday: wd, label: WEEKDAY_LABELS[wd], isToday: day === today, isFuture: day > today };
    });
  },
);

/** One cell of the calendar heat map. */
export interface HeatCell extends DayView {
  weekday: number;
  /** Intensity bucket: 0 nothing, 1 under half the goal, 2 under the goal, 3 goal met, 4 double the goal. */
  level: 0 | 1 | 2 | 3 | 4;
}

/**
 * The calendar heat map: one cell per day, oldest first, from the start of the week `weeks - 1`
 * weeks ago up to today (so the first cell is always the first day of a week).
 */
export function practiceHeatmap(state: ProgressState, weeks = 26): HeatCell[] {
  const today = state.meta.today;
  const start = addDays(weekStartOf(today, state.prefs.weekStart === 'sunday' ? 0 : 1), -7 * (Math.max(1, weeks) - 1));
  return dayRange(start, today).map((day) => {
    const view = dayView(state, day);
    const ratio = view.xp / view.goal;
    const level: HeatCell['level'] = view.xp <= 0 && !view.active ? 0 : ratio >= 2 ? 4 : view.met || ratio >= 1 ? 3 : ratio >= 0.5 ? 2 : 1;
    return { ...view, weekday: weekday(day), level };
  });
}

// ---------------------------------------------------------------------------------------------
// Hearts
// ---------------------------------------------------------------------------------------------

/** The hearts as they are at `now` (regeneration applied, unlimited mode respected). */
export function heartsOf(state: ProgressState, now: number): HeartsView {
  return heartsView(state.hearts, now, state.prefs.unlimitedHearts);
}

/** True when a theory lesson may be started: a heart is left, or hearts are switched off. */
export function canStartLesson(state: ProgressState, now: number): boolean {
  return !heartsOf(state, now).empty;
}

// ---------------------------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------------------------

/** A skill with its derived freshness. */
export interface SkillView {
  id: string;
  /** Null when the skill was never touched. */
  record: SkillRecord | null;
  mastery: MasteryLevel;
  stars: Stars;
  completed: boolean;
  /** 0 to 1; halves over time without practice. */
  strength: number;
  label: StrengthLabel;
  rusty: boolean;
  /** What the next crown takes, or null at five crowns. */
  next: { level: MasteryLevel; repsLeft: number; minAccuracy: number } | null;
}

/** One skill with strength and next-crown info at `now`. */
export function skillView(state: ProgressState, id: string, now: number): SkillView {
  const record = state.skills[id];
  return {
    id,
    record: record ?? null,
    mastery: record?.mastery ?? 0,
    stars: record?.stars ?? 0,
    completed: record?.completed ?? false,
    strength: skillStrength(record, now),
    label: strengthLabel(record, now),
    rusty: isRusty(record, now),
    next: nextCrown(record),
  };
}

/** Every skill whose id starts with `prefix` (`scale:`, `song:` ...), as `[id, record]` pairs. */
export function skillsWithPrefix(state: ProgressState, prefix: string): Array<[string, SkillRecord]> {
  const out: Array<[string, SkillRecord]> = [];
  for (const id in state.skills) if (id.startsWith(prefix)) out.push([id, state.skills[id]]);
  return out;
}

/** Learned skills that are getting rusty at `now`, weakest first. */
export function rustySkills(state: ProgressState, now: number, options: { prefix?: string; limit?: number } = {}): SkillView[] {
  const out: SkillView[] = [];
  for (const id in state.skills) {
    if (options.prefix && !id.startsWith(options.prefix)) continue;
    if (isRusty(state.skills[id], now)) out.push(skillView(state, id, now));
  }
  out.sort((a, b) => a.strength - b.strength);
  return options.limit !== undefined ? out.slice(0, options.limit) : out;
}

/** Crowns and stars added up over the skills with a prefix (or all skills). */
export function masterySummary(state: ProgressState, prefix = ''): { skills: number; completed: number; crowns: number; stars: number; mastered: number } {
  const out = { skills: 0, completed: 0, crowns: 0, stars: 0, mastered: 0 };
  for (const id in state.skills) {
    if (prefix && !id.startsWith(prefix)) continue;
    const record = state.skills[id];
    out.skills++;
    if (record.completed) out.completed++;
    out.crowns += record.mastery;
    out.stars += record.stars;
    if (record.mastery >= 5) out.mastered++;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Spaced repetition
// ---------------------------------------------------------------------------------------------

/** The cards to study now, in order, with the learner's daily caps applied. */
export function dueReviews(state: ProgressState, now: number, query: ReviewQuery = {}): ReviewItem[] {
  return dueQueue(state.srs, now, state.meta.today, state.prefs.review, query);
}

/** Card counts by state, with the learner's daily caps applied. */
export function reviewCountsOf(state: ProgressState, now: number, query: ReviewQuery = {}): ReviewCounts {
  return reviewCounts(state.srs, now, state.meta.today, state.prefs.review, query);
}

// ---------------------------------------------------------------------------------------------
// Practice log
// ---------------------------------------------------------------------------------------------

/** Practice added up over a period. */
export interface PracticeBucket {
  sec: number;
  minutes: number;
  xp: number;
  /** Activities recorded. */
  activities: number;
  /** Days with any practice. */
  days: number;
}

/** Practice totals for today, this week and all time. */
export interface PracticeTotals {
  today: PracticeBucket;
  week: PracticeBucket;
  allTime: PracticeBucket;
}

function bucketOf(state: ProgressState, days: readonly DayKey[]): PracticeBucket {
  const out: PracticeBucket = { sec: 0, minutes: 0, xp: 0, activities: 0, days: 0 };
  for (const day of days) {
    const record = state.days[day];
    if (!record) continue;
    out.sec += record.sec;
    out.xp += record.xp;
    out.activities += record.n;
    if (record.n > 0) out.days++;
  }
  out.minutes = Math.round(out.sec / 60);
  return out;
}

/** Practice totals per day, week and all time. */
export const selectPracticeTotals: (state: ProgressState) => PracticeTotals = cached(
  (s) => [s.days, s.stats, s.xp.total, s.meta.today, s.prefs.weekStart] as const,
  (days, stats, totalXp, today, weekStart) => {
    const shell = { days } as ProgressState;
    const start = weekStartOf(today, weekStart === 'sunday' ? 0 : 1);
    const sec = stats['time.total'] ?? 0;
    let activities = 0;
    for (const key in stats) if (key.startsWith('count.')) activities += stats[key];
    return {
      today: bucketOf(shell, [today]),
      week: bucketOf(shell, dayRange(start, today)),
      allTime: { sec, minutes: Math.round(sec / 60), xp: totalXp, activities, days: stats['active.days'] ?? 0 },
    };
  },
);

/** Time spent on one kind of activity. */
export interface KindTime {
  kind: ActivityKind;
  label: string;
  icon: string;
  sec: number;
  minutes: number;
}

/** Minutes per activity kind for today, this week or all time, longest first (zero kinds left out). */
export function minutesByKind(state: ProgressState, range: 'today' | 'week' | 'all' = 'week'): KindTime[] {
  const sec: Partial<Record<ActivityKind, number>> = {};
  if (range === 'all') {
    for (const kind of Object.keys(ACTIVITY_KINDS) as ActivityKind[]) {
      const v = state.stats[`time.${kind}`] ?? 0;
      if (v > 0) sec[kind] = v;
    }
  } else {
    const today = state.meta.today;
    const start = range === 'today' ? today : weekStartOf(today, state.prefs.weekStart === 'sunday' ? 0 : 1);
    for (const day of dayRange(start, today)) {
      const kinds = state.days[day]?.kinds;
      if (!kinds) continue;
      for (const kind of Object.keys(kinds) as ActivityKind[]) sec[kind] = (sec[kind] ?? 0) + (kinds[kind] ?? 0);
    }
  }
  return (Object.keys(sec) as ActivityKind[])
    .filter((kind) => (sec[kind] ?? 0) > 0)
    .map((kind) => ({ kind, label: ACTIVITY_KINDS[kind].label, icon: ACTIVITY_KINDS[kind].icon, sec: sec[kind] ?? 0, minutes: Math.round((sec[kind] ?? 0) / 60) }))
    .sort((a, b) => b.sec - a.sec);
}

/** The thing to offer under "continue where you left off": the latest unfinished item, else the latest item. */
export const selectContinue: (state: ProgressState) => RecentItem | null = cached(
  (s) => [s.recents] as const,
  (recents) => recents.find((r) => r.fraction < 1) ?? recents[0] ?? null,
);

/** Favourites, newest first, optionally of one kind (`song`, `scale`, `chord`, `progression`, `lesson` ...). */
export function favouritesOf(state: ProgressState, kind?: string): Favourite[] {
  const out: Favourite[] = [];
  for (const key in state.favourites) {
    const favourite = state.favourites[key];
    if (!kind || favourite.kind === kind) out.push(favourite);
  }
  return out.sort((a, b) => b.at - a.at);
}

/** True when the item is bookmarked. */
export function isFavourite(state: ProgressState, kind: string, id: string): boolean {
  return state.favourites[`${kind}:${id}`] !== undefined;
}

// ---------------------------------------------------------------------------------------------
// Quests, achievements, shop
// ---------------------------------------------------------------------------------------------

/** Today's quests and this week's challenge with their texts. */
export interface QuestsView {
  day: DayKey;
  daily: QuestView[];
  weekly: QuestView | null;
  /** Daily quests finished so far. */
  done: number;
  /** All three daily quests are finished. */
  allDone: boolean;
  /** Bonus gems for finishing all three. */
  sweepGems: number;
  /** Last day of the weekly challenge. */
  weekEnds: DayKey;
}

/** The quests, ready to render. */
export const selectQuests: (state: ProgressState) => QuestsView = cached(
  (s) => [s.quests] as const,
  (quests) => {
    const daily = quests.daily.map((q) => describeQuest(q, 'daily'));
    const done = daily.filter((q) => q.done).length;
    return {
      day: quests.day,
      daily,
      weekly: quests.weekly ? describeQuest(quests.weekly, 'weekly') : null,
      done,
      allDone: daily.length > 0 && done === daily.length,
      sweepGems: QUEST_SWEEP_GEMS,
      weekEnds: addDays(quests.week, 6),
    };
  },
);

/** The achievement catalog with unlock state, plus the counts for a header. */
export interface AchievementsView {
  list: AchievementView[];
  unlocked: number;
  total: number;
}

/** Every achievement with unlock state and progress. */
export const selectAchievements: (state: ProgressState) => AchievementsView = cached(
  (s) => [s.achievements, s.stats, s.skills, s.streak, s.xp.total, s.gems.earned] as const,
  (achievements, stats, skills, streak, total, earned) => {
    const shell = { achievements, stats, skills, streak, xp: { total }, gems: { earned } } as ProgressState;
    const list = achievementViews(shell);
    return { list, unlocked: list.filter((a) => a.unlocked).length, total: list.length };
  },
);

/** A cosmetic as the shop shows it. */
export interface CosmeticView extends CosmeticDef {
  owned: boolean;
  equipped: boolean;
  affordable: boolean;
}

/** A consumable as the shop shows it. */
export interface ConsumableView extends ConsumableDef {
  affordable: boolean;
  /** False when buying it would do nothing (hearts full, two freezes held). */
  available: boolean;
  /** How many the learner holds (freezes), or 0. */
  held: number;
}

/** The shop: gem balance, consumables and cosmetics. */
export interface ShopView {
  gems: number;
  consumables: ConsumableView[];
  cosmetics: CosmeticView[];
}

/** Everything the shop screen shows, as it is at `now`. */
export function shopOf(state: ProgressState, now: number): ShopView {
  const gems = state.gems.balance;
  const equipped = new Set([state.prefs.fretboard.wood, state.prefs.fretboard.inlay, state.prefs.accent]);
  const hearts = heartsOf(state, now);
  return {
    gems,
    consumables: CONSUMABLES.map((item) => ({
      ...item,
      affordable: gems >= item.price,
      available: item.id === 'streak-freeze' ? state.streak.freezes < MAX_STREAK_FREEZES : item.id === 'heart-refill' ? !hearts.unlimited && hearts.count < MAX_HEARTS : true,
      held: item.id === 'streak-freeze' ? state.streak.freezes : 0,
    })),
    cosmetics: COSMETICS.map((item) => ({ ...item, owned: state.cosmetics.includes(item.id), equipped: equipped.has(item.id), affordable: gems >= item.price })),
  };
}

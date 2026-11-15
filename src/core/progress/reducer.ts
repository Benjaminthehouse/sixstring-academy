/**
 * The pure core of the progress store: `reduce(state, action, env)` returns the next state, the
 * events to announce and the action's result. It never reads a clock, storage or the DOM, and it
 * never mutates its input (unchanged slices are shared between the old and the new state, so
 * selectors on them stay referentially equal).
 *
 * Every action first rolls the state over to the current local day (streak check, fresh quests,
 * daily counters), then applies its own change, then unlocks any achievement that became true.
 */
import { newlyEarned } from './achievements';
import {
  ACHIEVEMENT_GEMS,
  ACTIVITY_KINDS,
  ACTIVITY_KIND_IDS,
  AVATARS,
  COSMETIC_BY_ID,
  FREE_COSMETICS,
  MAX_HEARTS,
  MAX_STREAK_FREEZES,
  MAX_XP_PER_ACTIVITY,
  PERFECT_GEMS,
  QUEST_SWEEP_GEMS,
  SHOP_BOOST,
  SKILL_TAGS,
  STREAK_MILESTONES,
  STREAK_MILESTONE_GEMS,
  XP_RULES,
  levelUpGems,
  priceOf,
  xpFor,
} from './catalog';
import { createInitialState, teacherFor } from './defaults';
import type { ProgressEvent, ProgressEventInput } from './events';
import { addHearts, heartsView, removeHeart, settleHearts } from './hearts';
import { levelForXp, levelTitle } from './levels';
import { MAX_ACTIVITY_SEC, MAX_DAYS, MAX_FAVOURITES, MAX_LOG, MAX_NAME_LENGTH, MAX_RECENTS, MAX_SKILLS, MAX_TITLE_LENGTH } from './limits';
import { mergeStates } from './merge';
import { QUEST_BY_ID, advanceQuest, pickDailyQuests, pickWeeklyQuest } from './quests';
import { cleanId, cleanJson, cleanMetrics, cleanParams, cleanRoute, cleanText, deepMerge, favouriteKey, recentKey, sanitizePrefs } from './sanitize';
import { applyAttempt, emptySkill, starsForAccuracy, type SkillAttemptOutcome } from './skills';
import { MAX_REVIEW_ITEMS, gradeItem, newReviewItem } from './srs';
import { addDays, dayKey, dayNumber, diffDays, localHour, weekStartOf, weekday } from './time';
import type {
  ActivityInput,
  ActivityKind,
  ActivityResult,
  DayKey,
  DayRecord,
  DeepPartial,
  FavouriteInput,
  HeartLossResult,
  JsonValue,
  MasteryLevel,
  MergeStrategy,
  OnboardingInput,
  PracticeSession,
  Preferences,
  Profile,
  ProgressState,
  PurchaseResult,
  QuestInstance,
  QuestMetric,
  RecentInput,
  RecentItem,
  ReviewGrade,
  ReviewItem,
  ReviewItemInput,
  SkillTag,
  Stars,
  TeacherId,
  XpBoost,
} from './types';

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

/** Fields of the profile a screen may change. */
export type ProfilePatch = Partial<Pick<Profile, 'name' | 'avatar' | 'experience' | 'teacher' | 'onboarded'>>;

/** What `markSkill` can set without recording an attempt. */
export interface SkillMark {
  completed?: boolean;
  masteryAtLeast?: MasteryLevel;
  stars?: Stars;
  data?: JsonValue;
}

/** Every change the store understands. */
export type ProgressAction =
  | { type: 'tick' }
  | { type: 'activity'; input: ActivityInput }
  | { type: 'xp/award'; amount: number; source: string; tag?: SkillTag }
  | { type: 'hearts/lose' }
  | { type: 'hearts/refill'; via: 'practice' | 'gift' }
  | { type: 'shop/buy'; item: string }
  | { type: 'cosmetic/equip'; id: string }
  | { type: 'gems/grant'; amount: number; reason: string }
  | { type: 'boost/start'; multiplier: number; minutes: number; source: string }
  | { type: 'profile/set'; patch: ProfilePatch }
  | { type: 'prefs/set'; patch: DeepPartial<Preferences> }
  | { type: 'onboarding/complete'; input: OnboardingInput }
  | { type: 'skill/data'; id: string; data: JsonValue | undefined }
  | { type: 'skill/mark'; id: string; mark: SkillMark }
  | { type: 'srs/add'; items: readonly ReviewItemInput[] }
  | { type: 'srs/grade'; id: string; grade: ReviewGrade }
  | { type: 'srs/remove'; ids: readonly string[] }
  | { type: 'favourite/set'; item: FavouriteInput; on?: boolean }
  | { type: 'recent/touch'; item: RecentInput }
  | { type: 'recent/remove'; key: string }
  | { type: 'import'; state: ProgressState; strategy: MergeStrategy }
  | { type: 'reset'; keepPrefs?: boolean };

/** What each action returns. */
export interface ActionResults {
  tick: void;
  activity: ActivityResult;
  /** XP actually awarded. */
  'xp/award': number;
  'hearts/lose': HeartLossResult;
  /** Hearts after the refill. */
  'hearts/refill': number;
  'shop/buy': PurchaseResult;
  /** False when the cosmetic is not owned. */
  'cosmetic/equip': boolean;
  /** Gem balance after the grant. */
  'gems/grant': number;
  /** The boost now in effect. */
  'boost/start': XpBoost;
  'profile/set': void;
  'prefs/set': void;
  'onboarding/complete': void;
  'skill/data': void;
  'skill/mark': void;
  /** Cards actually added (existing ids are skipped). */
  'srs/add': number;
  /** The card's new schedule, or null for an unknown id. */
  'srs/grade': ReviewItem | null;
  /** Cards removed. */
  'srs/remove': number;
  /** Whether the item is a favourite now. */
  'favourite/set': boolean;
  'recent/touch': void;
  'recent/remove': void;
  import: void;
  reset: void;
}

/** The result type of an action. */
export type ResultOf<A extends ProgressAction> = ActionResults[A['type']];

/** What the reducer needs from outside: the time, and the zone for calendar days. */
export interface ReduceEnv {
  now: number;
  timeZone?: string;
}

/** What a reduction produces. `state` is the input object itself when nothing changed. */
export interface ReduceOutput<R> {
  state: ProgressState;
  events: ProgressEvent[];
  result: R;
}

// ---------------------------------------------------------------------------------------------
// Transaction: copy-on-write access to the state
// ---------------------------------------------------------------------------------------------

class Tx {
  state: ProgressState;
  readonly events: ProgressEvent[] = [];
  readonly now: number;
  readonly tz: string | undefined;
  today: DayKey;
  /** Something changed that could satisfy an achievement. */
  evaluate = false;
  /** Drop events (used while importing, where a flood of toasts would be noise). */
  silent = false;
  private owned = false;
  private readonly touched = new Set<string>();

  constructor(base: ProgressState, env: ReduceEnv) {
    this.state = base;
    this.now = env.now;
    this.tz = env.timeZone;
    this.today = base.meta.today;
  }

  get dirty(): boolean {
    return this.owned;
  }

  private own(): void {
    if (!this.owned) {
      this.state = { ...this.state };
      this.owned = true;
    }
  }

  /** A slice that may be mutated: cloned (one level deep) the first time it is asked for. */
  mut<K extends keyof ProgressState>(key: K): ProgressState[K] {
    if (!this.touched.has(key)) {
      this.own();
      const value = this.state[key];
      this.state[key] = (Array.isArray(value) ? [...value] : { ...value }) as ProgressState[K];
      this.touched.add(key);
    }
    return this.state[key];
  }

  /** Swap a whole slice. */
  replace<K extends keyof ProgressState>(key: K, value: ProgressState[K]): void {
    this.own();
    this.state[key] = value;
    this.touched.add(key);
  }

  /** Swap the whole state (import, reset). */
  replaceAll(state: ProgressState): void {
    this.state = { ...state };
    this.owned = true;
    this.touched.clear();
  }

  /** A day record that may be mutated, created on first use. */
  mutDay(day: DayKey): DayRecord {
    const days = this.mut('days');
    const tag = `day:${day}`;
    if (!this.touched.has(tag)) {
      const prev = days[day];
      days[day] = prev ? { ...prev, kinds: { ...prev.kinds } } : { xp: 0, goal: this.state.prefs.dailyGoalXp, met: false, sec: 0, n: 0, kinds: {} };
      this.touched.add(tag);
    }
    return days[day];
  }

  /** The review items map, cloned on first use. */
  mutItems(): ProgressState['srs']['items'] {
    const srs = this.mut('srs');
    if (!this.touched.has('srs.items')) {
      srs.items = { ...srs.items };
      this.touched.add('srs.items');
    }
    return srs.items;
  }

  emit(event: ProgressEventInput): void {
    if (!this.silent) this.events.push({ ...event, at: this.now } as ProgressEvent);
  }

  /** Add to a lifetime counter. */
  bump(key: string, by = 1): void {
    if (!(by > 0)) return;
    const stats = this.mut('stats');
    stats[key] = (stats[key] ?? 0) + by;
  }

  /** Raise a lifetime maximum. */
  peak(key: string, value: number): void {
    if (value > (this.state.stats[key] ?? 0)) this.mut('stats')[key] = value;
  }

  gain(amount: number, reason: string): void {
    const delta = Math.floor(amount);
    if (!(delta > 0)) return;
    const gems = this.mut('gems');
    gems.balance += delta;
    gems.earned += delta;
    this.evaluate = true;
    this.emit({ type: 'gems-changed', delta, balance: gems.balance, reason });
  }

  spend(amount: number, reason: string): void {
    const gems = this.mut('gems');
    gems.balance -= amount;
    gems.spent += amount;
    this.emit({ type: 'gems-changed', delta: -amount, balance: gems.balance, reason });
  }
}

// ---------------------------------------------------------------------------------------------
// Day rollover, streak, quests
// ---------------------------------------------------------------------------------------------

function rollover(tx: Tx): void {
  const previous = tx.state.meta.today;
  const real = dayKey(tx.now, tx.tz);
  // Our calendar never runs backwards: a clock set back a little (or a flight west across
  // midnight) keeps the later day. A jump back of more than two days means the later date was
  // the mistake, so the clock is trusted again.
  const today = real < previous && diffDays(real, previous) <= 2 ? previous : real;
  tx.today = today;

  const boost = tx.state.xp.boost;
  if (boost && boost.until <= tx.now) tx.mut('xp').boost = null;

  if (today === previous) return;

  const before = tx.state.streak;
  if (before.current > 0 && before.coveredThrough) {
    // Judge the gap in the zone the learner is in now. After a flight east, the moment the goal
    // was last met can fall on a later local date than the one recorded at the time; without
    // this, a day that never existed for the traveller would count as missed.
    const seenFromHere = before.lastGoalAt !== null ? dayKey(before.lastGoalAt, tx.tz) : before.coveredThrough;
    const covered = seenFromHere > before.coveredThrough ? seenFromHere : before.coveredThrough;
    const missed = diffDays(covered, today) - 1;
    if (missed > 0) {
      const streak = tx.mut('streak');
      if (missed <= before.freezes) {
        // Freezes are spent only when they bridge every missed day; otherwise they are kept.
        for (let i = 1; i <= missed; i++) {
          const frozen = addDays(covered, i);
          tx.mutDay(frozen).frozen = true;
          streak.freezes -= 1;
          tx.bump('freezes.used');
          tx.emit({ type: 'streak-freeze-used', day: frozen, remaining: streak.freezes });
        }
        streak.coveredThrough = addDays(covered, missed);
        tx.evaluate = true;
      } else {
        tx.emit({ type: 'streak-broken', previous: before.current });
        streak.current = 0;
        streak.startedOn = null;
      }
    }
  }

  refreshQuests(tx, today);

  if (Object.keys(tx.state.xp.capped).length > 0) tx.mut('xp').capped = {};
  if (tx.state.srs.day !== today) {
    const srs = tx.mut('srs');
    srs.day = today;
    srs.newToday = 0;
    srs.reviewsToday = 0;
  }

  const keys = Object.keys(tx.state.days);
  if (keys.length > MAX_DAYS) {
    const days = tx.mut('days');
    for (const key of keys.sort().slice(0, keys.length - MAX_DAYS)) delete days[key];
  }

  tx.mut('meta').today = today;
}

function refreshQuests(tx: Tx, today: DayKey): void {
  const current = tx.state.quests;
  const week = weekStartOf(today, 1);
  if (current.day === today && current.week === week) return;
  const level = levelForXp(tx.state.xp.total);
  const quests = tx.mut('quests');
  if (current.day !== today) {
    quests.day = today;
    quests.daily = pickDailyQuests(today, level);
    quests.sweep = false;
  }
  if (current.week !== week) {
    quests.week = week;
    quests.weekly = pickWeeklyQuest(week, level);
  }
}

function questTitle(quest: QuestInstance): string {
  return QUEST_BY_ID[quest.id]?.title(quest.target) ?? 'Quest';
}

function questProgress(tx: Tx, metric: QuestMetric, amount: number): void {
  if (!(amount > 0)) return;
  const beforeDaily = tx.state.quests.daily;
  const beforeWeekly = tx.state.quests.weekly;
  let changed = false;
  const daily = beforeDaily.map((quest) => {
    const next = advanceQuest(quest, metric, amount, tx.now);
    if (next !== quest) changed = true;
    return next;
  });
  const weekly = beforeWeekly ? advanceQuest(beforeWeekly, metric, amount, tx.now) : null;
  if (!changed && weekly === beforeWeekly) return;

  const quests = tx.mut('quests');
  quests.daily = daily;
  quests.weekly = weekly;
  daily.forEach((quest, i) => {
    if (!quest.done || beforeDaily[i].done) return;
    tx.bump('quests.daily');
    tx.gain(quest.gems, 'quest');
    tx.emit({ type: 'quest-completed', id: quest.id, scope: 'daily', title: questTitle(quest), gems: quest.gems });
  });
  if (weekly && weekly.done && beforeWeekly && !beforeWeekly.done) {
    tx.bump('quests.weekly');
    tx.gain(weekly.gems, 'weekly-challenge');
    tx.emit({ type: 'quest-completed', id: weekly.id, scope: 'weekly', title: questTitle(weekly), gems: weekly.gems });
  }
  if (!quests.sweep && daily.length > 0 && daily.every((quest) => quest.done)) {
    quests.sweep = true;
    tx.bump('quests.sweeps');
    tx.gain(QUEST_SWEEP_GEMS, 'quest-sweep');
    tx.emit({ type: 'quests-all-completed', day: quests.day, gems: QUEST_SWEEP_GEMS });
  }
  tx.evaluate = true;
}

function extendStreak(tx: Tx, day: DayKey): void {
  const before = tx.state.streak;
  // Already counted, or the clock was set back behind a day that already counted.
  if (before.lastGoalDay !== null && before.lastGoalDay >= day) return;
  const streak = tx.mut('streak');
  streak.current = before.current + 1;
  if (streak.current === 1) streak.startedOn = day;
  streak.lastGoalDay = day;
  streak.lastGoalAt = tx.now;
  streak.coveredThrough = day;
  streak.longest = Math.max(before.longest, streak.current);
  tx.emit({ type: 'streak-extended', day, current: streak.current, longest: streak.longest });
  if (STREAK_MILESTONES.includes(streak.current)) {
    // The celebration happens every time; the gems are paid once per milestone.
    const first = !before.milestones.includes(streak.current);
    const gems = first ? (STREAK_MILESTONE_GEMS[streak.current] ?? 0) : 0;
    if (first) {
      streak.milestones = [...before.milestones, streak.current];
      tx.gain(gems, 'streak-milestone');
    }
    tx.emit({ type: 'streak-milestone', days: streak.current, gems });
  }
}

function meetGoal(tx: Tx, day: DayRecord): void {
  day.met = true;
  tx.bump('goal.days');
  tx.emit({ type: 'goal-met', day: tx.today, xp: day.xp, goal: day.goal });
  extendStreak(tx, tx.today);
  questProgress(tx, 'goal', 1);
  tx.evaluate = true;
}

// ---------------------------------------------------------------------------------------------
// XP
// ---------------------------------------------------------------------------------------------

function grantXp(tx: Tx, base: number, source: string, tag: SkillTag): { amount: number; multiplier: number } {
  const boost = tx.state.xp.boost;
  const multiplier = boost && boost.until > tx.now ? boost.multiplier : 1;
  if (!(base > 0)) return { amount: 0, multiplier };
  const amount = Math.round(base * multiplier);
  const xp = tx.mut('xp');
  const before = xp.total;
  xp.total = before + amount;
  xp.byTag = { ...xp.byTag, [tag]: (xp.byTag[tag] ?? 0) + amount };
  const day = tx.mutDay(tx.today);
  day.xp += amount;
  tx.evaluate = true;
  tx.emit({ type: 'xp-gained', amount, base, multiplier, source, tag, total: xp.total });

  const from = levelForXp(before);
  const to = levelForXp(xp.total);
  if (to > from) {
    let gems = 0;
    for (let level = from + 1; level <= to; level++) gems += levelUpGems(level);
    tx.gain(gems, 'level-up');
    tx.emit({ type: 'level-up', from, to, title: levelTitle(to), gems });
  }

  tx.peak('max.goalPct', Math.floor((day.xp / day.goal) * 100));
  if (!day.met && day.xp >= day.goal) meetGoal(tx, day);
  questProgress(tx, 'xp', amount);
  return { amount, multiplier };
}

function capForToday(tx: Tx, kind: ActivityKind, base: number): number {
  const cap = XP_RULES[kind].dailyCap;
  if (cap === undefined || !(base > 0)) return base;
  const used = tx.state.xp.capped[kind] ?? 0;
  const allowed = Math.max(0, Math.min(base, cap - used));
  if (allowed > 0) {
    const xp = tx.mut('xp');
    xp.capped = { ...xp.capped, [kind]: used + allowed };
  }
  return allowed;
}

function startBoost(tx: Tx, multiplier: number, minutes: number, source: string): XpBoost {
  const m = Math.min(3, Math.max(1.5, Number.isFinite(multiplier) ? multiplier : 2));
  const ms = Math.min(120, Math.max(1, Number.isFinite(minutes) ? minutes : 15)) * 60_000;
  const active = tx.state.xp.boost && tx.state.xp.boost.until > tx.now ? tx.state.xp.boost : null;
  // A weaker boost never replaces a stronger one that is still running.
  if (active && active.multiplier > m) return active;
  const boost: XpBoost = active && active.multiplier === m ? { ...active, until: active.until + ms } : { multiplier: m, until: tx.now + ms, source };
  tx.mut('xp').boost = boost;
  tx.emit({ type: 'xp-boost-started', multiplier: boost.multiplier, until: boost.until, source: boost.source });
  return boost;
}

// ---------------------------------------------------------------------------------------------
// recordActivity
// ---------------------------------------------------------------------------------------------

interface NormalActivity {
  kind: ActivityKind;
  id: string | null;
  title: string;
  xp: number | undefined;
  score: number | undefined;
  accuracy: number | undefined;
  stars: Stars | undefined;
  durationSec: number;
  completed: boolean;
  perfect: boolean;
  combo: number;
  count: number;
  route: string | null;
  params: string[];
  progress: number | undefined;
  source: string;
  tag: SkillTag;
  masteryAtLeast: MasteryLevel | undefined;
  data: JsonValue | undefined;
  meta: Record<string, number> | undefined;
  startedAt: number | undefined;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const whole = (v: unknown, max: number): number => (finite(v) ? Math.min(max, Math.max(0, Math.round(v))) : 0);

function normalize(input: ActivityInput): NormalActivity {
  const kind: ActivityKind = ACTIVITY_KIND_IDS.includes(input.kind) ? input.kind : 'other';
  const completed = input.completed !== false;
  const accuracy = finite(input.accuracy) ? Math.min(1, Math.max(0, input.accuracy)) : undefined;
  const mistakes = finite(input.mistakes) ? Math.max(0, Math.round(input.mistakes)) : undefined;
  const flawless = typeof input.perfect === 'boolean' ? input.perfect : mistakes !== undefined ? mistakes === 0 : accuracy !== undefined && accuracy >= 0.9995;
  const stars = finite(input.stars) ? (Math.min(3, Math.max(0, Math.round(input.stars))) as Stars) : undefined;
  const mastery = finite(input.masteryAtLeast) ? (Math.min(5, Math.max(0, Math.round(input.masteryAtLeast))) as MasteryLevel) : undefined;
  return {
    kind,
    id: cleanId(input.id),
    title: cleanText(input.title, '', MAX_TITLE_LENGTH),
    xp: finite(input.xp) ? Math.min(MAX_XP_PER_ACTIVITY, Math.max(0, Math.round(input.xp))) : undefined,
    score: finite(input.score) ? Math.max(0, input.score) : undefined,
    accuracy,
    stars,
    durationSec: whole(input.durationSec, MAX_ACTIVITY_SEC),
    completed,
    perfect: completed && flawless,
    combo: whole(input.combo, 1_000_000),
    count: whole(input.count, 1_000_000),
    route: cleanRoute(input.route),
    params: cleanParams(input.params),
    progress: finite(input.progress) ? Math.min(1, Math.max(0, input.progress)) : undefined,
    source: cleanText(input.source, kind, 40) || kind,
    tag: input.tag && SKILL_TAGS.includes(input.tag) ? input.tag : ACTIVITY_KINDS[kind].tag,
    masteryAtLeast: mastery,
    data: cleanJson(input.data),
    meta: cleanMetrics(input.meta),
    startedAt: finite(input.startedAt) ? input.startedAt : undefined,
  };
}

const TEACHER_LESSON = /^teacher:(mia|dev|elena):/;

function recordActivity(tx: Tx, input: ActivityInput): () => ActivityResult {
  const a = normalize(input);
  const info = ACTIVITY_KINDS[a.kind];
  const firstEvent = tx.events.length;

  const lastActive = tx.state.meta.lastActiveDay;
  if (lastActive && diffDays(lastActive, tx.today) >= 7) tx.bump('comebacks');

  // 1. The skill registry.
  let outcome: SkillAttemptOutcome | null = null;
  // Scale games are scored in stars by accuracy unless the game passes its own.
  const stars = a.stars ?? (a.kind === 'scale-game' && a.accuracy !== undefined ? starsForAccuracy(a.accuracy) : undefined);
  if (a.id && (tx.state.skills[a.id] || Object.keys(tx.state.skills).length < MAX_SKILLS)) {
    outcome = applyAttempt(
      tx.state.skills[a.id],
      { score: a.score, accuracy: a.accuracy, stars, durationSec: a.durationSec, completed: a.completed, perfect: a.perfect, masteryAtLeast: a.masteryAtLeast, data: a.data },
      tx.now,
    );
    tx.mut('skills')[a.id] = outcome.record;
    if (outcome.record.mastery > outcome.masteryBefore) {
      tx.emit({ type: 'skill-levelled-up', id: a.id, from: outcome.masteryBefore, to: outcome.record.mastery, title: a.title });
    }
  }
  const attemptStars: Stars = a.completed ? (stars ?? 0) : 0;

  // 2. XP, which also drives the level, the daily goal and the streak.
  const base = capForToday(tx, a.kind, a.xp ?? xpFor(a.kind, { accuracy: a.accuracy, durationSec: a.durationSec, perfect: a.perfect, count: a.count, completed: a.completed }));
  const granted = grantXp(tx, base, a.source, a.tag);

  // 3. The day, lifetime counters and time-of-day facts.
  const day = tx.mutDay(tx.today);
  if (day.n === 0) tx.bump('active.days');
  day.n += 1;
  day.sec += a.durationSec;
  day.kinds[a.kind] = (day.kinds[a.kind] ?? 0) + a.durationSec;
  if (tx.state.meta.lastActiveDay !== tx.today) tx.mut('meta').lastActiveDay = tx.today;

  if (a.completed) tx.bump(`count.${a.kind}`);
  tx.bump('time.total', a.durationSec);
  tx.bump(`time.${a.kind}`, a.durationSec);
  tx.peak('max.daySec', day.sec);
  tx.peak('max.dayKinds', Object.keys(day.kinds).length);
  tx.peak('max.combo', a.combo);
  if (a.kind === 'fretboard') tx.bump('fretboard.notes', a.count);
  if (a.kind === 'chord-change') tx.bump('chord.changes', a.count);

  const lesson = a.kind === 'theory-lesson' || a.kind === 'teacher-lesson';
  if (a.perfect) {
    tx.bump('perfect.total');
    if (lesson) tx.bump('lessons.perfect');
    // Paid once per lesson, so replaying an easy lesson is not a gem farm.
    if (lesson && outcome && outcome.record.perfects === 1) tx.gain(PERFECT_GEMS, 'perfect-lesson');
  }
  if (a.kind === 'teacher-lesson' && a.completed) {
    const teacher: TeacherId = (a.id ? (TEACHER_LESSON.exec(a.id)?.[1] as TeacherId | undefined) : undefined) ?? tx.state.profile.teacher;
    tx.bump(`teacher.${teacher}`);
  }

  const hour = localHour(tx.now, tx.tz);
  if (hour >= 22 || hour < 4) tx.bump('time.night');
  if (hour >= 5 && hour < 8) tx.bump('time.early');
  if (weekday(tx.today) === 0) {
    // A Sunday with practice the day before completes a weekend; count each weekend once.
    const saturday = tx.state.days[addDays(tx.today, -1)];
    const stamp = dayNumber(tx.today);
    if (saturday && saturday.n > 0 && tx.state.stats['weekend.last'] !== stamp) {
      tx.bump('weekends');
      tx.mut('stats')['weekend.last'] = stamp;
    }
  }

  // 4. Hearts come back when you play.
  if (a.completed && info.hearts !== 'none' && !tx.state.prefs.unlimitedHearts) {
    const settled = settleHearts(tx.state.hearts, tx.now);
    if (settled.count < MAX_HEARTS) {
      if (info.hearts === 'refill') {
        tx.replace('hearts', { count: MAX_HEARTS, regenFrom: null });
        tx.bump('hearts.refills');
        tx.emit({ type: 'hearts-refilled', count: MAX_HEARTS, via: 'practice' });
      } else {
        tx.replace('hearts', addHearts(settled, 1, tx.now));
      }
    }
  }

  // 5. The practice log and the recents list.
  if (a.durationSec > 0 || granted.amount > 0) {
    const session: PracticeSession = {
      id: `${tx.now.toString(36)}-${(tx.state.meta.rev + 1).toString(36)}-${tx.state.meta.deviceId.slice(0, 4)}`,
      kind: a.kind,
      title: a.title || info.label,
      startedAt: a.startedAt ?? tx.now - a.durationSec * 1000,
      durationSec: a.durationSec,
      xp: granted.amount,
    };
    if (a.id) session.skillId = a.id;
    const metrics: Record<string, number> = { ...a.meta };
    if (a.accuracy !== undefined) metrics.accuracy = Math.round(a.accuracy * 1000) / 1000;
    if (a.score !== undefined) metrics.score = a.score;
    if (attemptStars > 0) metrics.stars = attemptStars;
    if (a.combo > 0) metrics.combo = a.combo;
    const kept = cleanMetrics(metrics);
    if (kept) session.metrics = kept;
    const log = tx.mut('log');
    log.unshift(session);
    if (log.length > MAX_LOG) log.length = MAX_LOG;
    tx.bump('sessions');
  }
  if (a.route) {
    touchRecent(tx, { route: a.route, params: a.params, title: a.title, kind: a.kind, fraction: a.progress ?? (a.completed ? 1 : undefined), skillId: a.id ?? undefined });
  }

  // 6. Quests.
  questProgress(tx, 'minutes', a.durationSec / 60);
  questProgress(tx, 'variety', Object.keys(day.kinds).length);
  questProgress(tx, 'combo', a.combo);
  questProgress(tx, 'stars', attemptStars);
  if (a.completed) {
    if (a.perfect) questProgress(tx, 'perfect', 1);
    if (a.accuracy !== undefined && a.accuracy >= 0.9) questProgress(tx, 'accuracy-90', 1);
    if (lesson) questProgress(tx, 'lessons', 1);
    if (outcome?.firstCompletion && a.id?.startsWith('chord:')) questProgress(tx, 'new-chord', 1);
  }
  switch (a.kind) {
    case 'theory-lesson':
    case 'teacher-lesson':
    case 'song':
    case 'ear':
    case 'rhythm':
    case 'technique':
    case 'progression':
    case 'scale-practice':
      if (a.completed) questProgress(tx, a.kind, 1);
      break;
    case 'tuner':
      if (a.completed) questProgress(tx, 'tune', 1);
      break;
    case 'scale-game':
      // Playing a round counts even when it was lost.
      questProgress(tx, 'scale-game', 1);
      break;
    case 'chord-change':
      questProgress(tx, 'chord-changes', a.count);
      break;
    case 'fretboard':
      questProgress(tx, 'fretboard-notes', a.count);
      break;
    default:
      break;
  }
  tx.evaluate = true;

  // The result is assembled after achievements have been evaluated.
  return () => {
    const events = tx.events.slice(firstEvent);
    const state = tx.state;
    const today = state.days[tx.today];
    let gems = 0;
    const quests: string[] = [];
    const achievements: string[] = [];
    let leveledUp = false;
    let metNow = false;
    let extended = false;
    for (const event of events) {
      if (event.type === 'gems-changed' && event.delta > 0) gems += event.delta;
      else if (event.type === 'quest-completed') quests.push(event.id);
      else if (event.type === 'achievement-unlocked') achievements.push(event.id);
      else if (event.type === 'level-up') leveledUp = true;
      else if (event.type === 'goal-met') metNow = true;
      else if (event.type === 'streak-extended') extended = true;
    }
    return {
      xp: granted.amount,
      baseXp: base,
      multiplier: granted.multiplier,
      totalXp: state.xp.total,
      level: levelForXp(state.xp.total),
      leveledUp,
      goal: { xp: today?.xp ?? 0, goal: today?.goal ?? state.prefs.dailyGoalXp, met: today?.met ?? false, metNow },
      streak: { current: state.streak.current, extended },
      hearts: heartsView(state.hearts, tx.now, state.prefs.unlimitedHearts).count,
      gems,
      skill:
        outcome && a.id
          ? {
              id: a.id,
              mastery: outcome.record.mastery,
              masteryBefore: outcome.masteryBefore,
              stars: outcome.record.stars,
              starsBefore: outcome.starsBefore,
              bestScore: outcome.record.bestScore,
              newBest: outcome.newBest,
              firstCompletion: outcome.firstCompletion,
              attempts: outcome.record.attempts,
            }
          : null,
      quests,
      achievements,
    };
  };
}

// ---------------------------------------------------------------------------------------------
// Smaller actions
// ---------------------------------------------------------------------------------------------

function touchRecent(tx: Tx, input: RecentInput): void {
  const route = cleanRoute(input.route);
  if (!route) return;
  const params = cleanParams(input.params);
  const key = recentKey(route, params);
  const previous = tx.state.recents.find((r) => r.key === key);
  const kind: ActivityKind = input.kind && ACTIVITY_KIND_IDS.includes(input.kind) ? input.kind : (previous?.kind ?? 'other');
  const fraction = finite(input.fraction) ? Math.min(1, Math.max(0, input.fraction)) : (previous?.fraction ?? 0);
  const item: RecentItem = {
    key,
    route,
    params,
    title: cleanText(input.title, '', MAX_TITLE_LENGTH) || previous?.title || ACTIVITY_KINDS[kind].label,
    kind,
    fraction,
    at: tx.now,
  };
  const skillId = cleanId(input.skillId) ?? previous?.skillId;
  if (skillId) item.skillId = skillId;
  tx.replace('recents', [item, ...tx.state.recents.filter((r) => r.key !== key)].slice(0, MAX_RECENTS));
}

function loseHeart(tx: Tx): HeartLossResult {
  if (tx.state.prefs.unlimitedHearts) return { remaining: MAX_HEARTS, lost: false, empty: false };
  const settled = settleHearts(tx.state.hearts, tx.now);
  if (settled.count <= 0) {
    if (settled !== tx.state.hearts) tx.replace('hearts', settled);
    return { remaining: 0, lost: false, empty: true };
  }
  const next = removeHeart(settled, tx.now);
  tx.replace('hearts', next);
  tx.bump('hearts.lost');
  tx.emit({ type: 'heart-lost', remaining: next.count, empty: next.count === 0 });
  return { remaining: next.count, lost: true, empty: next.count === 0 };
}

function refillHearts(tx: Tx, via: 'practice' | 'gems' | 'gift'): number {
  const settled = settleHearts(tx.state.hearts, tx.now);
  if (settled.count >= MAX_HEARTS) {
    if (settled !== tx.state.hearts) tx.replace('hearts', settled);
    return MAX_HEARTS;
  }
  tx.replace('hearts', { count: MAX_HEARTS, regenFrom: null });
  tx.bump('hearts.refills');
  tx.emit({ type: 'hearts-refilled', count: MAX_HEARTS, via });
  return MAX_HEARTS;
}

function buy(tx: Tx, item: string): PurchaseResult | (() => PurchaseResult) {
  const price = priceOf(item);
  if (price === null) return { ok: false, item, reason: 'unknown-item' };
  const cosmetic = COSMETIC_BY_ID[item];
  if (cosmetic && tx.state.cosmetics.includes(item)) return { ok: false, item, reason: 'already-owned' };
  if (item === 'streak-freeze' && tx.state.streak.freezes >= MAX_STREAK_FREEZES) return { ok: false, item, reason: 'max-held' };
  if (item === 'heart-refill' && (tx.state.prefs.unlimitedHearts || settleHearts(tx.state.hearts, tx.now).count >= MAX_HEARTS)) {
    return { ok: false, item, reason: 'not-needed' };
  }
  if (tx.state.gems.balance < price) return { ok: false, item, reason: 'insufficient-gems' };

  tx.spend(price, `shop:${item}`);
  if (cosmetic) {
    tx.mut('cosmetics').push(item);
    tx.bump('cosmetics.bought');
    tx.emit({ type: 'cosmetic-unlocked', id: item });
  } else if (item === 'streak-freeze') {
    tx.mut('streak').freezes += 1;
    tx.bump('freezes.bought');
  } else if (item === 'heart-refill') {
    refillHearts(tx, 'gems');
  } else if (item === 'xp-boost') {
    startBoost(tx, SHOP_BOOST.multiplier, SHOP_BOOST.minutes, 'shop');
  }
  tx.evaluate = true;
  // Read the balance after achievements were evaluated: a purchase can unlock one that pays gems.
  return () => ({ ok: true, item, price, balance: tx.state.gems.balance });
}

function setPrefs(tx: Tx, patch: DeepPartial<Preferences>): void {
  const before = tx.state.prefs;
  const next = sanitizePrefs(deepMerge(before, patch), before, tx.state.cosmetics);
  if (JSON.stringify(next) === JSON.stringify(before)) return;
  // Groups that did not change keep their identity, so `useProgress((s) => s.prefs.sound)` and
  // friends do not re-render for an unrelated preference.
  for (const group of ['fretboard', 'sound', 'mic', 'camera', 'ai', 'review'] as const) {
    if (JSON.stringify(next[group]) === JSON.stringify(before[group])) (next as Record<typeof group, unknown>)[group] = before[group];
  }
  tx.replace('prefs', next);
  tx.mut('meta').prefsAt = tx.now;
  if (next.dailyGoalXp !== before.dailyGoalXp) {
    // A new goal applies to today unless today's goal was already met.
    const record = tx.state.days[tx.today];
    if (record && !record.met) {
      const day = tx.mutDay(tx.today);
      day.goal = next.dailyGoalXp;
      if (day.xp >= day.goal) meetGoal(tx, day);
    }
  }
}

function setProfile(tx: Tx, patch: ProfilePatch): void {
  const before = tx.state.profile;
  const next: Profile = { ...before };
  if (typeof patch.name === 'string') next.name = cleanText(patch.name, before.name, MAX_NAME_LENGTH);
  if (typeof patch.avatar === 'string' && AVATARS.some((a) => a.id === patch.avatar)) next.avatar = patch.avatar;
  if (patch.experience === 'beginner' || patch.experience === 'intermediate' || patch.experience === 'expert') next.experience = patch.experience;
  if (patch.teacher === 'mia' || patch.teacher === 'dev' || patch.teacher === 'elena') next.teacher = patch.teacher;
  if (typeof patch.onboarded === 'boolean') next.onboarded = patch.onboarded;
  if (JSON.stringify(next) === JSON.stringify(before)) return;
  tx.replace('profile', next);
  tx.mut('meta').prefsAt = tx.now;
}

function equip(tx: Tx, id: string): boolean {
  const cosmetic = COSMETIC_BY_ID[id];
  if (!cosmetic || !tx.state.cosmetics.includes(id)) return false;
  if (cosmetic.category === 'wood') setPrefs(tx, { fretboard: { wood: id } });
  else if (cosmetic.category === 'inlay') setPrefs(tx, { fretboard: { inlay: id } });
  else setPrefs(tx, { accent: id });
  return true;
}

function markSkill(tx: Tx, rawId: string, mark: SkillMark): void {
  const id = cleanId(rawId);
  if (!id) return;
  const previous = tx.state.skills[id];
  if (!previous && Object.keys(tx.state.skills).length >= MAX_SKILLS) return;
  const next = { ...(previous ?? emptySkill(tx.now)) };
  const before = next.mastery;
  if (mark.completed === true && !next.completed) {
    next.completed = true;
    next.completedAt = tx.now;
  }
  if (finite(mark.masteryAtLeast) && mark.masteryAtLeast > next.mastery) {
    next.mastery = Math.min(5, Math.round(mark.masteryAtLeast)) as MasteryLevel;
    next.reps = 0;
  }
  if (finite(mark.stars) && mark.stars > next.stars) next.stars = Math.min(3, Math.round(mark.stars)) as Stars;
  const data = cleanJson(mark.data);
  if (data !== undefined) next.data = data;
  next.lastAt = tx.now;
  tx.mut('skills')[id] = next;
  if (next.mastery > before) tx.emit({ type: 'skill-levelled-up', id, from: before, to: next.mastery, title: '' });
  tx.evaluate = true;
}

function setSkillData(tx: Tx, rawId: string, data: JsonValue | undefined): void {
  const id = cleanId(rawId);
  if (!id) return;
  const previous = tx.state.skills[id];
  if (!previous && (data === undefined || Object.keys(tx.state.skills).length >= MAX_SKILLS)) return;
  const next = { ...(previous ?? emptySkill(tx.now)) };
  const clean = cleanJson(data);
  if (clean === undefined) delete next.data;
  else next.data = clean;
  tx.mut('skills')[id] = next;
}

function addReviewItems(tx: Tx, inputs: readonly ReviewItemInput[]): number {
  let added = 0;
  let total = 0;
  // "Oldest first" must keep the order cards were handed in, also across calls within the same
  // millisecond, so every card gets a stamp later than any card already in the deck.
  let stamp = tx.now;
  for (const key in tx.state.srs.items) {
    total++;
    const addedAt = tx.state.srs.items[key].addedAt;
    if (addedAt >= stamp && addedAt < tx.now + 60_000) stamp = addedAt + 1;
  }
  for (const input of inputs) {
    const id = cleanId(input?.id);
    const kind = cleanText(input?.kind, '', 40);
    if (!id || !kind || tx.state.srs.items[id] || total >= MAX_REVIEW_ITEMS) continue;
    const ref = typeof input.ref === 'string' ? input.ref.slice(0, 200) : undefined;
    tx.mutItems()[id] = newReviewItem({ id, kind, ref }, stamp++, tx.today);
    added++;
    total++;
  }
  return added;
}

function gradeReview(tx: Tx, id: string, grade: ReviewGrade): ReviewItem | null {
  const item = tx.state.srs.items[id];
  if (!item || !['again', 'hard', 'good', 'easy'].includes(grade)) return null;
  const next = gradeItem(item, grade, tx.now, tx.today, tx.tz);
  tx.mutItems()[id] = next;
  const srs = tx.mut('srs');
  if (item.state === 'new') srs.newToday += 1;
  // Extra practice on a card that is not due yet does not use up the day's review allowance.
  if (item.state === 'review' && item.dueDay <= tx.today) srs.reviewsToday += 1;
  tx.bump('srs.reviews');
  if (grade !== 'again') tx.bump('srs.correct');
  questProgress(tx, 'reviews', 1);
  tx.evaluate = true;
  return next;
}

function removeReviewItems(tx: Tx, ids: readonly string[]): number {
  let removed = 0;
  for (const id of ids) {
    if (typeof id !== 'string' || !tx.state.srs.items[id]) continue;
    delete tx.mutItems()[id];
    removed++;
  }
  return removed;
}

function setFavourite(tx: Tx, input: FavouriteInput, on: boolean | undefined): boolean {
  const id = cleanId(input?.id);
  const kind = cleanText(input?.kind, '', 24);
  if (!id || !kind) return false;
  const key = favouriteKey(kind, id);
  const exists = !!tx.state.favourites[key];
  const want = on ?? !exists;
  if (want === exists) return exists;
  if (!want) {
    delete tx.mut('favourites')[key];
    return false;
  }
  if (Object.keys(tx.state.favourites).length >= MAX_FAVOURITES) return false;
  const route = cleanRoute(input.route);
  tx.mut('favourites')[key] = {
    kind,
    id,
    title: cleanText(input.title, id, MAX_TITLE_LENGTH) || id,
    at: tx.now,
    ...(route ? { route, params: cleanParams(input.params) } : {}),
  };
  return true;
}

function onboard(tx: Tx, input: OnboardingInput): void {
  const experience = input.experience ?? tx.state.profile.experience;
  setProfile(tx, { name: input.name, avatar: input.avatar, experience, teacher: input.teacher ?? teacherFor(experience), onboarded: true });
  const patch: DeepPartial<Preferences> = {};
  if (input.dailyGoalXp !== undefined) patch.dailyGoalXp = input.dailyGoalXp;
  if (input.handedness !== undefined) patch.handedness = input.handedness;
  setPrefs(tx, patch);
}

function unlockAchievements(tx: Tx): void {
  // An unlock pays gems, and gems can satisfy another achievement, so repeat until stable.
  for (let pass = 0; pass < 4; pass++) {
    const earned = newlyEarned(tx.state);
    if (earned.length === 0) return;
    for (const def of earned) {
      tx.mut('achievements')[def.id] = { at: tx.now };
      const gems = ACHIEVEMENT_GEMS[def.tier];
      tx.gain(gems, 'achievement');
      tx.emit({ type: 'achievement-unlocked', id: def.id, name: def.name, tier: def.tier, icon: def.icon, gems });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// reduce
// ---------------------------------------------------------------------------------------------

function apply(tx: Tx, action: ProgressAction): unknown {
  switch (action.type) {
    case 'tick':
      return undefined;
    case 'activity':
      return recordActivity(tx, action.input);
    case 'xp/award': {
      const base = finite(action.amount) ? Math.min(MAX_XP_PER_ACTIVITY, Math.max(0, Math.round(action.amount))) : 0;
      const tag = action.tag && SKILL_TAGS.includes(action.tag) ? action.tag : 'practice';
      return grantXp(tx, base, cleanText(action.source, 'bonus', 40) || 'bonus', tag).amount;
    }
    case 'hearts/lose':
      return loseHeart(tx);
    case 'hearts/refill':
      return refillHearts(tx, action.via === 'gift' ? 'gift' : 'practice');
    case 'shop/buy':
      return buy(tx, action.item);
    case 'cosmetic/equip':
      return equip(tx, action.id);
    case 'gems/grant':
      tx.gain(finite(action.amount) ? Math.min(10_000, action.amount) : 0, cleanText(action.reason, 'grant', 40) || 'grant');
      return () => tx.state.gems.balance;
    case 'boost/start':
      return startBoost(tx, action.multiplier, action.minutes, cleanText(action.source, 'boost', 40) || 'boost');
    case 'profile/set':
      return setProfile(tx, action.patch ?? {});
    case 'prefs/set':
      return setPrefs(tx, action.patch ?? {});
    case 'onboarding/complete':
      return onboard(tx, action.input ?? {});
    case 'skill/data':
      return setSkillData(tx, action.id, action.data);
    case 'skill/mark':
      return markSkill(tx, action.id, action.mark ?? {});
    case 'srs/add':
      return addReviewItems(tx, Array.isArray(action.items) ? action.items : []);
    case 'srs/grade':
      return gradeReview(tx, action.id, action.grade);
    case 'srs/remove':
      return removeReviewItems(tx, Array.isArray(action.ids) ? action.ids : []);
    case 'favourite/set':
      return setFavourite(tx, action.item, action.on);
    case 'recent/touch':
      return touchRecent(tx, action.item);
    case 'recent/remove':
      if (tx.state.recents.some((r) => r.key === action.key)) tx.replace('recents', tx.state.recents.filter((r) => r.key !== action.key));
      return undefined;
    default:
      return undefined;
  }
}

function importState(tx: Tx, incoming: ProgressState, strategy: MergeStrategy): void {
  const local = tx.state;
  if (strategy === 'newest-wins') {
    tx.replaceAll(mergeStates(local, incoming, tx.now));
  } else {
    // Replace everything, but stay this install and keep the revision moving forward.
    tx.replaceAll({ ...incoming, meta: { ...incoming.meta, deviceId: local.meta.deviceId, rev: Math.max(local.meta.rev, incoming.meta.rev) } });
  }
  // Imported data may satisfy achievements; unlock them quietly rather than with a burst of toasts.
  tx.silent = true;
  rollover(tx);
  unlockAchievements(tx);
  tx.silent = false;
  tx.emit({ type: 'data-imported', strategy });
}

function resetState(tx: Tx, keepPrefs: boolean): void {
  const old = tx.state;
  const fresh = createInitialState({ now: tx.now, timeZone: tx.tz, deviceId: old.meta.deviceId });
  fresh.meta.rev = old.meta.rev;
  if (keepPrefs) {
    // Paid cosmetics are gone with the rest, so equipped ones fall back to the free defaults.
    fresh.prefs = sanitizePrefs(old.prefs, fresh.prefs, FREE_COSMETICS);
    fresh.profile = { ...old.profile, createdAt: tx.now };
    fresh.meta.prefsAt = tx.now;
  }
  tx.replaceAll(fresh);
  tx.today = fresh.meta.today;
  tx.emit({ type: 'data-reset' });
}

/**
 * Apply an action. Pure: same state, action and env always give the same output, and the input
 * state is never modified.
 */
export function reduce<A extends ProgressAction>(state: ProgressState, action: A, env: ReduceEnv): ReduceOutput<ResultOf<A>> {
  const tx = new Tx(state, env);
  let result: unknown;
  if (action.type === 'import') {
    importState(tx, action.state, action.strategy === 'newest-wins' ? 'newest-wins' : 'replace');
  } else if (action.type === 'reset') {
    resetState(tx, action.keepPrefs === true);
  } else {
    rollover(tx);
    result = apply(tx, action);
    if (tx.evaluate) unlockAchievements(tx);
  }
  if (tx.dirty) {
    const meta = tx.mut('meta');
    meta.rev += 1;
    meta.updatedAt = tx.now;
  }
  if (typeof result === 'function') result = (result as () => unknown)();
  return { state: tx.state, events: tx.events, result: result as ResultOf<A> };
}

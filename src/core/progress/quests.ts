/**
 * Quests: three daily quests and one weekly challenge.
 *
 * The choice is a pure function of the date and the learner's level, so every device picks the
 * same quests for the same day. Each day gets one quest from each of three slots (a core habit,
 * something to study, something to play). Within a slot the catalog is walked in a shuffled order
 * that is reshuffled every cycle, so a quest does not repeat until the others have had their turn.
 * Targets grow with the learner's level band.
 */
import { dayNumber } from './time';
import type { DayKey, QuestInstance, QuestMetric } from './types';

/** Which third of a daily set a quest fills. */
export type QuestSlot = 'core' | 'study' | 'play';

/** A catalog entry. */
export interface QuestTemplate {
  id: string;
  scope: 'daily' | 'weekly';
  /** Daily quests only. */
  slot?: QuestSlot;
  metric: QuestMetric;
  /** Target per level band: levels 1-4, 5-14, 15 and up. */
  targets: readonly [number, number, number];
  gems: number;
  /** Lowest level at which this quest is offered. */
  minLevel: number;
  /** lucide icon name. */
  icon: string;
  title: (target: number) => string;
  /** Where to do it, in one short sentence. */
  hint: string;
  /** Route name to send the learner to. */
  route: string;
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many.replace('#', String(n)));

/** The daily quest catalog. */
export const DAILY_QUESTS: readonly QuestTemplate[] = [
  // Core habits
  { id: 'earn-xp', scope: 'daily', slot: 'core', metric: 'xp', targets: [15, 30, 50], gems: 5, minLevel: 1, icon: 'Zap', title: (n) => `Earn ${n} XP`, hint: 'Anything you do in the app counts.', route: 'home' },
  { id: 'daily-goal', scope: 'daily', slot: 'core', metric: 'goal', targets: [1, 1, 1], gems: 5, minLevel: 1, icon: 'Target', title: () => 'Meet your daily goal', hint: 'Fill today’s XP ring.', route: 'home' },
  { id: 'practice-minutes', scope: 'daily', slot: 'core', metric: 'minutes', targets: [5, 10, 15], gems: 5, minLevel: 1, icon: 'Clock', title: (n) => `Practise for ${n} minutes`, hint: 'Time spent in lessons, games, songs and drills adds up.', route: 'practice' },
  { id: 'variety', scope: 'daily', slot: 'core', metric: 'variety', targets: [2, 3, 4], gems: 5, minLevel: 2, icon: 'Shapes', title: (n) => `Do ${n} different kinds of practice`, hint: 'For example a lesson, a scale game and a song.', route: 'studio' },
  { id: 'accuracy', scope: 'daily', slot: 'core', metric: 'accuracy-90', targets: [1, 2, 3], gems: 5, minLevel: 3, icon: 'Crosshair', title: (n) => plural(n, 'Score 90% or better once', 'Score 90% or better # times'), hint: 'Slow down and aim for clean, not fast.', route: 'studio' },
  { id: 'perfect', scope: 'daily', slot: 'core', metric: 'perfect', targets: [1, 1, 2], gems: 10, minLevel: 2, icon: 'CircleCheck', title: (n) => plural(n, 'Finish something without a mistake', 'Finish # things without a mistake'), hint: 'A lesson, a game round or a song with no mistakes.', route: 'learn' },

  // Study
  { id: 'theory-lesson', scope: 'daily', slot: 'study', metric: 'theory-lesson', targets: [1, 2, 2], gems: 5, minLevel: 1, icon: 'Route', title: (n) => plural(n, 'Finish a theory lesson', 'Finish # theory lessons'), hint: 'Pick up the Theory Path where you left it.', route: 'learn' },
  { id: 'teacher-lesson', scope: 'daily', slot: 'study', metric: 'teacher-lesson', targets: [1, 1, 1], gems: 5, minLevel: 1, icon: 'GraduationCap', title: () => 'Take a lesson with your teacher', hint: 'Your teacher has the next lesson ready.', route: 'teachers' },
  { id: 'reviews', scope: 'daily', slot: 'study', metric: 'reviews', targets: [5, 10, 20], gems: 5, minLevel: 2, icon: 'Brain', title: (n) => `Review ${n} cards`, hint: 'Clear some of the cards that are due.', route: 'learn' },
  { id: 'fretboard-notes', scope: 'daily', slot: 'study', metric: 'fretboard-notes', targets: [10, 20, 30], gems: 5, minLevel: 2, icon: 'Rows4', title: (n) => `Name ${n} notes on the fretboard`, hint: 'The fretboard trainer counts every note you get right.', route: 'fretboard' },
  { id: 'ear', scope: 'daily', slot: 'study', metric: 'ear', targets: [1, 2, 3], gems: 5, minLevel: 3, icon: 'Ear', title: (n) => plural(n, 'Finish an ear training round', 'Finish # ear training rounds'), hint: 'Intervals, chords or melodies by ear.', route: 'ear' },
  { id: 'rhythm', scope: 'daily', slot: 'study', metric: 'rhythm', targets: [1, 2, 2], gems: 5, minLevel: 2, icon: 'Drum', title: (n) => plural(n, 'Finish a rhythm drill', 'Finish # rhythm drills'), hint: 'Strumming patterns and timing drills.', route: 'rhythm' },

  // Play
  { id: 'tune', scope: 'daily', slot: 'play', metric: 'tune', targets: [1, 1, 1], gems: 5, minLevel: 1, icon: 'Gauge', title: () => 'Tune your guitar', hint: 'Everything sounds better in tune.', route: 'tuner' },
  { id: 'new-chord', scope: 'daily', slot: 'play', metric: 'new-chord', targets: [1, 1, 1], gems: 10, minLevel: 1, icon: 'Grid3x3', title: () => 'Learn a new chord', hint: 'Pick one you have not played yet in the chord library.', route: 'chords' },
  { id: 'song', scope: 'daily', slot: 'play', metric: 'song', targets: [1, 1, 2], gems: 5, minLevel: 1, icon: 'Music', title: (n) => plural(n, 'Play along with a song', 'Play along with # songs'), hint: 'Play one through to the end.', route: 'songs' },
  { id: 'scale-game', scope: 'daily', slot: 'play', metric: 'scale-game', targets: [1, 2, 3], gems: 5, minLevel: 2, icon: 'Gamepad2', title: (n) => plural(n, 'Play a scale game', 'Play # scale game rounds'), hint: 'Any round in the Scale Arcade.', route: 'arcade' },
  { id: 'scale-practice', scope: 'daily', slot: 'play', metric: 'scale-practice', targets: [1, 1, 2], gems: 5, minLevel: 2, icon: 'Waypoints', title: (n) => plural(n, 'Practise a scale', 'Practise # scales'), hint: 'Up and down, slowly, with the metronome.', route: 'scales' },
  { id: 'combo', scope: 'daily', slot: 'play', metric: 'combo', targets: [5, 10, 20], gems: 5, minLevel: 2, icon: 'Flame', title: (n) => `Keep a combo of ${n}`, hint: 'That many right in a row, in any game or drill.', route: 'arcade' },
  { id: 'chord-changes', scope: 'daily', slot: 'play', metric: 'chord-changes', targets: [10, 20, 40], gems: 5, minLevel: 3, icon: 'Repeat', title: (n) => `Make ${n} chord changes`, hint: 'The chord-change trainer counts them for you.', route: 'chords' },
  { id: 'technique', scope: 'daily', slot: 'play', metric: 'technique', targets: [1, 1, 2], gems: 5, minLevel: 3, icon: 'Hand', title: (n) => plural(n, 'Do a technique exercise', 'Do # technique exercises'), hint: 'A few minutes for the fingers.', route: 'technique' },
  { id: 'stars', scope: 'daily', slot: 'play', metric: 'stars', targets: [2, 4, 6], gems: 5, minLevel: 3, icon: 'Star', title: (n) => `Earn ${n} stars`, hint: 'Stars from game rounds and songs count.', route: 'arcade' },
  { id: 'progression', scope: 'daily', slot: 'play', metric: 'progression', targets: [1, 1, 2], gems: 5, minLevel: 4, icon: 'ListMusic', title: (n) => plural(n, 'Jam over a chord progression', 'Jam over # chord progressions'), hint: 'Pick a progression and play along with the backing.', route: 'progressions' },
];

/** The weekly challenge catalog. */
export const WEEKLY_QUESTS: readonly QuestTemplate[] = [
  { id: 'week-xp', scope: 'weekly', metric: 'xp', targets: [120, 250, 400], gems: 30, minLevel: 1, icon: 'Zap', title: (n) => `Earn ${n} XP this week`, hint: 'A little every day gets you there.', route: 'home' },
  { id: 'week-goal-days', scope: 'weekly', metric: 'goal', targets: [4, 5, 6], gems: 40, minLevel: 1, icon: 'Target', title: (n) => `Meet your daily goal on ${n} days`, hint: 'Days this week on which you fill the XP ring.', route: 'home' },
  { id: 'week-minutes', scope: 'weekly', metric: 'minutes', targets: [45, 90, 150], gems: 30, minLevel: 1, icon: 'Clock', title: (n) => `Practise for ${n} minutes this week`, hint: 'All practice time counts.', route: 'practice' },
  { id: 'week-lessons', scope: 'weekly', metric: 'lessons', targets: [4, 7, 10], gems: 30, minLevel: 1, icon: 'BookOpen', title: (n) => `Finish ${n} lessons this week`, hint: 'Theory lessons and teacher lessons both count.', route: 'study' },
  { id: 'week-songs', scope: 'weekly', metric: 'song', targets: [3, 5, 7], gems: 30, minLevel: 2, icon: 'Music', title: (n) => `Play ${n} songs through this week`, hint: 'Repeats of the same song count.', route: 'songs' },
  { id: 'week-stars', scope: 'weekly', metric: 'stars', targets: [9, 15, 21], gems: 30, minLevel: 3, icon: 'Star', title: (n) => `Earn ${n} stars this week`, hint: 'Stars from game rounds and songs count.', route: 'arcade' },
  { id: 'week-reviews', scope: 'weekly', metric: 'reviews', targets: [30, 60, 100], gems: 30, minLevel: 3, icon: 'Brain', title: (n) => `Review ${n} cards this week`, hint: 'Keep the review queue clear.', route: 'learn' },
];

/** Every quest template by id. */
export const QUEST_BY_ID: Readonly<Record<string, QuestTemplate>> = Object.fromEntries([...DAILY_QUESTS, ...WEEKLY_QUESTS].map((q) => [q.id, q]));

/** The daily slots, in display order. */
export const QUEST_SLOTS: readonly QuestSlot[] = ['core', 'study', 'play'];

/** Metrics whose progress is the best single value rather than a running total. */
const MAX_METRICS: ReadonlySet<QuestMetric> = new Set<QuestMetric>(['combo', 'variety']);

/** Level band used for quest targets: 0 for levels 1-4, 1 for 5-14, 2 from 15. */
export function questBand(level: number): 0 | 1 | 2 {
  if (level >= 15) return 2;
  return level >= 5 ? 1 : 0;
}

/** Small deterministic PRNG (mulberry32) seeded from a string. */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  const rand = seeded(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The element of `pool` for position `n` of an endless, cycle-wise shuffled walk through it. */
function rotate<T>(pool: readonly T[], n: number, seed: string): T {
  const size = pool.length;
  if (size < 3) return pool[((n % size) + size) % size];
  const cycle = Math.floor(n / size);
  const order = shuffled(pool, `${seed}|${cycle}`);
  // Do not open a cycle with the quest that closed the previous one.
  const previousLast = shuffled(pool, `${seed}|${cycle - 1}`)[size - 1];
  if (order[0] === previousLast) [order[0], order[1]] = [order[1], order[0]];
  return order[((n % size) + size) % size];
}

function instantiate(template: QuestTemplate, band: 0 | 1 | 2): QuestInstance {
  return { id: template.id, metric: template.metric, target: template.targets[band], progress: 0, done: false, gems: template.gems, doneAt: null };
}

/** The three daily quests for a day and level. Pure and deterministic. */
export function pickDailyQuests(day: DayKey, level: number): QuestInstance[] {
  const band = questBand(level);
  const n = dayNumber(day);
  return QUEST_SLOTS.map((slot) => {
    const pool = DAILY_QUESTS.filter((q) => q.slot === slot && q.minLevel <= level);
    return instantiate(rotate(pool, n, `daily|${slot}|${pool.length}`), band);
  });
}

/** The weekly challenge for the week starting on `weekStart` (a Monday) and a level. Deterministic. */
export function pickWeeklyQuest(weekStart: DayKey, level: number): QuestInstance {
  const band = questBand(level);
  const pool = WEEKLY_QUESTS.filter((q) => q.minLevel <= level);
  // 1970-01-05 was a Monday, so this is a whole week number.
  const week = Math.floor((dayNumber(weekStart) - 4) / 7);
  return instantiate(rotate(pool, week, `weekly|${pool.length}`), band);
}

/** Fold a quest event into a quest. Returns the same object when nothing changed. */
export function advanceQuest(quest: QuestInstance, metric: QuestMetric, amount: number, now: number): QuestInstance {
  if (quest.done || quest.metric !== metric || !(amount > 0)) return quest;
  const raw = MAX_METRICS.has(metric) ? Math.max(quest.progress, amount) : quest.progress + amount;
  const progress = Math.min(quest.target, Math.round(raw * 100) / 100);
  if (progress === quest.progress) return quest;
  const done = progress >= quest.target;
  return { ...quest, progress, done, doneAt: done ? now : null };
}

/** A quest with its texts, ready to render. */
export interface QuestView {
  id: string;
  scope: 'daily' | 'weekly';
  title: string;
  hint: string;
  icon: string;
  route: string;
  /** Whole units done (minutes are rounded down). */
  progress: number;
  target: number;
  fraction: number;
  done: boolean;
  gems: number;
}

/** Attach the catalog texts to a stored quest. Unknown ids (from another app version) get plain texts. */
export function describeQuest(quest: QuestInstance, scope: 'daily' | 'weekly' = 'daily'): QuestView {
  const template = QUEST_BY_ID[quest.id];
  return {
    id: quest.id,
    scope: template?.scope ?? scope,
    title: template ? template.title(quest.target) : 'Quest',
    hint: template?.hint ?? '',
    icon: template?.icon ?? 'Flag',
    route: template?.route ?? 'home',
    progress: Math.min(quest.target, Math.floor(quest.progress + 1e-9)),
    target: quest.target,
    fraction: quest.target > 0 ? Math.min(1, quest.progress / quest.target) : 1,
    done: quest.done,
    gems: quest.gems,
  };
}

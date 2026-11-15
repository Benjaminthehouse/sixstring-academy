/**
 * The achievements screen as data: the catalog grouped under headings, progress in words, the
 * trophies to show off and the ones within reach. Pure functions over `selectAchievements`.
 */
import type { AchievementGroup, AchievementTier, AchievementView } from '@/core/progress';
import { durationText, thousands } from '../format';

/** Headings of the groups, in the order they are shown. */
export const GROUPS: ReadonlyArray<{ id: AchievementGroup; title: string; blurb: string }> = [
  { id: 'first-steps', title: 'First steps', blurb: 'One of everything the app can do.' },
  { id: 'habit', title: 'Habit', blurb: 'Streaks and daily goals.' },
  { id: 'growth', title: 'Growth', blurb: 'XP, levels and gems.' },
  { id: 'scales', title: 'Scales and crowns', blurb: 'Patterns you know by heart.' },
  { id: 'games', title: 'Games', blurb: 'Stars and combos.' },
  { id: 'fretboard', title: 'Fretboard', blurb: 'Knowing every note on the neck.' },
  { id: 'chords', title: 'Chords', blurb: 'Shapes and clean changes.' },
  { id: 'songs', title: 'Songs', blurb: 'Music played from start to finish.' },
  { id: 'theory', title: 'Theory and memory', blurb: 'Lessons and review cards.' },
  { id: 'teachers', title: 'Teachers', blurb: 'Lessons with Mia, Dev and Elena.' },
  { id: 'practice', title: 'Practice', blurb: 'Time on the instrument.' },
  { id: 'quests', title: 'Quests', blurb: 'Daily quests and weekly challenges.' },
  { id: 'secret', title: 'Secret', blurb: 'Found by living with the app. No hints.' },
];

/** Tier names in rising order. */
export const TIERS: readonly AchievementTier[] = ['bronze', 'silver', 'gold', 'platinum'];

/** How a tier is written. */
export const TIER_NAMES: Readonly<Record<AchievementTier, string>> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum' };

/** Which achievements the list shows. */
export type AchievementFilter = 'all' | 'earned' | 'progress';

/** The filter choices with their labels. */
export const FILTERS: ReadonlyArray<{ value: AchievementFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'earned', label: 'Earned' },
  { value: 'progress', label: 'In progress' },
];

/** One heading with its achievements. */
export interface AchievementSection {
  id: AchievementGroup;
  title: string;
  blurb: string;
  /** The achievements to show under the current filter, in catalog order. */
  items: AchievementView[];
  /** Earned in this group, whatever the filter. */
  earned: number;
  /** All in this group, whatever the filter. */
  total: number;
}

/**
 * How far along an achievement is, 0 to 1, as a learner would judge it. The store counts levels
 * from 1, so "reach level 5" reads one fifth done before anything has happened: here a level
 * achievement starts at zero.
 */
export function progressFraction(a: AchievementView): number {
  if (a.unlocked) return 1;
  if (a.id.startsWith('level-') && a.target > 1) return Math.max(0, Math.min(1, (a.value - 1) / (a.target - 1)));
  return Math.max(0, Math.min(1, a.fraction));
}

/** True for a locked achievement the learner has started on. */
export function isInProgress(a: AchievementView): boolean {
  return !a.unlocked && !a.hidden && progressFraction(a) > 0;
}

/** Group the catalog under its headings. Groups left empty by the filter are dropped. */
export function groupAchievements(list: readonly AchievementView[], filter: AchievementFilter = 'all'): AchievementSection[] {
  const keep = (a: AchievementView): boolean => (filter === 'earned' ? a.unlocked : filter === 'progress' ? isInProgress(a) : true);
  const sections: AchievementSection[] = [];
  for (const group of GROUPS) {
    const all = list.filter((a) => a.group === group.id);
    if (all.length === 0) continue;
    const items = all.filter(keep);
    if (items.length === 0) continue;
    sections.push({ ...group, items, earned: all.filter((a) => a.unlocked).length, total: all.length });
  }
  return sections;
}

/** How many achievements each filter would show. */
export function filterCounts(list: readonly AchievementView[]): Record<AchievementFilter, number> {
  return { all: list.length, earned: list.filter((a) => a.unlocked).length, progress: list.filter(isInProgress).length };
}

/** Earned and total per tier. */
export function tierCounts(list: readonly AchievementView[]): Record<AchievementTier, { earned: number; total: number }> {
  const out: Record<AchievementTier, { earned: number; total: number }> = {
    bronze: { earned: 0, total: 0 },
    silver: { earned: 0, total: 0 },
    gold: { earned: 0, total: 0 },
    platinum: { earned: 0, total: 0 },
  };
  for (const a of list) {
    out[a.tier].total++;
    if (a.unlocked) out[a.tier].earned++;
  }
  return out;
}

/** Gems the earned achievements have paid. */
export function gemsFromTrophies(list: readonly AchievementView[]): number {
  return list.reduce((sum, a) => sum + (a.unlocked ? a.gems : 0), 0);
}

/** The most recently earned achievements, newest first. */
export function recentTrophies(list: readonly AchievementView[], limit = 4): AchievementView[] {
  return list
    .filter((a) => a.unlocked)
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
    .slice(0, limit);
}

const TIER_RANK: Readonly<Record<AchievementTier, number>> = { bronze: 0, silver: 1, gold: 2, platinum: 3 };

/**
 * Locked achievements closest to being earned: furthest along first, and among equals the easier
 * tier first. A learner who has not started gets the first entries of the catalog (the first steps).
 */
export function closestGoals(list: readonly AchievementView[], limit = 3): AchievementView[] {
  return list
    .map((a, index) => ({ a, index }))
    .filter(({ a }) => !a.unlocked && !a.hidden)
    .sort((x, y) => progressFraction(y.a) - progressFraction(x.a) || TIER_RANK[x.a.tier] - TIER_RANK[y.a.tier] || x.index - y.index)
    .slice(0, limit)
    .map(({ a }) => a);
}

/** Achievements whose numbers are seconds of practice. */
const TIME_IDS = new Set(['time-1h', 'time-10h', 'time-50h', 'time-100h', 'marathon']);

/** Progress toward a locked achievement in words, with the right unit: "3 of 10", "42 min of 1 h". */
export function progressText(a: AchievementView): string {
  if (a.hidden) return 'Keep playing to find it';
  if (a.unlocked) return 'Earned';
  if (TIME_IDS.has(a.id)) return `${durationText(a.value)} of ${durationText(a.target)}`;
  if (a.id === 'overachiever') return `Best day so far: ${Math.round(a.value)}% of your goal`;
  if (a.target === 1) return 'Not yet';
  if (a.id.startsWith('level-')) return `Level ${thousands(a.value)} of ${thousands(a.target)}`;
  return `${thousands(a.value)} of ${thousands(a.target)}`;
}

/** What a screen reader hears for a tile. */
export function spokenLabel(a: AchievementView): string {
  if (a.hidden) return 'Secret achievement, not found yet';
  const state = a.unlocked ? 'earned' : progressFraction(a) > 0 ? `in progress, ${progressText(a)}` : 'locked';
  return `${a.name}, ${TIER_NAMES[a.tier]}, ${state}`;
}

/** Where to go to work on a locked achievement: a route (with params) and the words for the link. */
export interface NextStep {
  route: string;
  params: string[];
  label: string;
}

const BY_ID: Readonly<Record<string, NextStep>> = {
  'first-tune': { route: 'tuner', params: [], label: 'Open the tuner' },
  'tune-25': { route: 'tuner', params: [], label: 'Open the tuner' },
  'first-lesson': { route: 'learn', params: [], label: 'Open the Theory Path' },
  'first-song': { route: 'songs', params: [], label: 'Pick a song' },
  'first-game': { route: 'arcade', params: [], label: 'Open the Scale Arcade' },
  'first-camera': { route: 'camera', params: [], label: 'Open the live fretboard' },
  'first-scan': { route: 'scan', params: [], label: 'Scan or import a sheet' },
  'scan-10': { route: 'scan', params: [], label: 'Scan or import a sheet' },
  'first-metronome': { route: 'metronome', params: [], label: 'Open the metronome' },
  'first-review': { route: 'learn', params: [], label: 'Review your cards' },
  'reviews-100': { route: 'learn', params: [], label: 'Review your cards' },
  'reviews-1000': { route: 'learn', params: [], label: 'Review your cards' },
  'first-ear': { route: 'ear', params: [], label: 'Open ear training' },
  'ear-25': { route: 'ear', params: [], label: 'Open ear training' },
  'first-rhythm': { route: 'rhythm', params: [], label: 'Open the rhythm drills' },
  'rhythm-25': { route: 'rhythm', params: [], label: 'Open the rhythm drills' },
  'first-technique': { route: 'technique', params: [], label: 'Open the technique exercises' },
  'technique-25': { route: 'technique', params: [], label: 'Open the technique exercises' },
  'first-progression': { route: 'progressions', params: [], label: 'Pick a progression' },
  'cosmetic-1': { route: 'profile', params: ['shop'], label: 'Visit the shop' },
};

const BY_GROUP: Readonly<Partial<Record<AchievementGroup, NextStep>>> = {
  habit: { route: 'home', params: [], label: 'Go to Today' },
  growth: { route: 'home', params: [], label: 'Go to Today' },
  quests: { route: 'home', params: [], label: 'See today’s quests' },
  scales: { route: 'scales', params: [], label: 'Practise a scale' },
  games: { route: 'arcade', params: [], label: 'Open the Scale Arcade' },
  fretboard: { route: 'fretboard', params: [], label: 'Open the fretboard trainer' },
  chords: { route: 'chords', params: [], label: 'Open the chord library' },
  songs: { route: 'songs', params: [], label: 'Pick a song' },
  theory: { route: 'learn', params: [], label: 'Open the Theory Path' },
  teachers: { route: 'teachers', params: [], label: 'Meet the teachers' },
  practice: { route: 'practice', params: [], label: 'Open your practice plan' },
};

/** The one obvious place to go to work on an achievement, or null (earned and secret ones have none). */
export function nextStepFor(a: AchievementView): NextStep | null {
  if (a.unlocked || a.hidden) return null;
  return BY_ID[a.id] ?? BY_GROUP[a.group] ?? null;
}

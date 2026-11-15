/**
 * The practice journal: one entry per finished session (blocks, minutes, a note and how it felt),
 * grouped by day, plus the arithmetic behind the weekly goal and the streak nudge.
 */
import { xpFor, type DayKey, type PracticeSession } from '@/core/progress';
import { isArea, type Area } from './areas';
import type { BlockOutcome, SessionResult, SessionState } from './session';

/** How a session felt, 1 (rough) to 5 (flowing). */
export type Feel = 1 | 2 | 3 | 4 | 5;

/** The five answers to "How did it feel?", with an icon each (never colour alone). */
export const FEELS: ReadonlyArray<{ value: Feel; label: string; icon: string }> = [
  { value: 1, label: 'Rough', icon: 'Frown' },
  { value: 2, label: 'Hard work', icon: 'Dumbbell' },
  { value: 3, label: 'Okay', icon: 'Meh' },
  { value: 4, label: 'Good', icon: 'Smile' },
  { value: 5, label: 'Flowing', icon: 'Sparkles' },
];

/** One block of a journal entry. */
export interface JournalBlock {
  area: Area;
  title: string;
  plannedSec: number;
  spentSec: number;
  outcome: BlockOutcome;
  goalId?: string;
}

/** One practice session in the journal. */
export interface JournalEntry {
  id: string;
  startedAt: number;
  endedAt: number;
  /** Local day it ended on. */
  day: DayKey;
  title: string;
  routineId?: string;
  plannedSec: number;
  practisedSec: number;
  blocks: JournalBlock[];
  xp: number;
  feel: Feel | null;
  note: string;
  endedEarly: boolean;
}

/** Entries kept (newest first). */
export const MAX_JOURNAL = 400;
/** Longest note. */
export const MAX_NOTE = 1000;
/** Sessions shorter than this are not kept. */
export const MIN_SAVED_SEC = 30;

/** A journal entry for a finished session. */
export function entryFromSession(s: SessionState, result: Pick<SessionResult, 'xp' | 'entryId'>, day: DayKey): JournalEntry {
  const blocks: JournalBlock[] = s.blocks.map((b, i) => ({
    area: b.area,
    title: b.title,
    plannedSec: b.plannedSec,
    spentSec: Math.round(s.spentMs[i] / 1000),
    outcome: s.outcome[i] === 'pending' ? 'skipped' : s.outcome[i],
    goalId: b.goalId,
  }));
  return {
    id: result.entryId ?? s.id,
    startedAt: s.startedAt,
    endedAt: s.endedAt ?? s.seenAt,
    day,
    title: s.title,
    routineId: s.routineId,
    plannedSec: s.blocks.reduce((a, b) => a + b.plannedSec, 0),
    practisedSec: Math.round(s.spentMs.reduce((a, b) => a + b, 0) / 1000),
    blocks,
    xp: result.xp,
    feel: null,
    note: '',
    endedEarly: s.endedEarly,
  };
}

/** Seconds of other recorded activities (scale games, songs ...) that fall inside `[from, to]`. */
export function overlapSeconds(log: readonly PracticeSession[], from: number, to: number): number {
  let ms = 0;
  for (const e of log) {
    if (e.kind === 'practice' || !(e.durationSec > 0)) continue;
    const start = e.startedAt;
    const end = start + e.durationSec * 1000;
    ms += Math.max(0, Math.min(end, to) - Math.max(start, from));
  }
  return Math.round(ms / 1000);
}

/** Entries grouped by day, newest day first. */
export interface DayGroup {
  day: DayKey;
  entries: JournalEntry[];
  /** Minutes practised in planned sessions that day. */
  minutes: number;
}

/** Group entries by local day, newest first (entries inside a day newest first too). */
export function groupByDay(entries: readonly JournalEntry[]): DayGroup[] {
  const map = new Map<DayKey, JournalEntry[]>();
  for (const e of [...entries].sort((a, b) => b.endedAt - a.endedAt)) {
    const list = map.get(e.day);
    if (list) list.push(e);
    else map.set(e.day, [e]);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([day, list]) => ({ day, entries: list, minutes: Math.round(list.reduce((s, e) => s + e.practisedSec, 0) / 60) }));
}

/** Seconds per area in entries from `fromDay` to `toDay`, both included. */
export function areaSeconds(entries: readonly JournalEntry[], fromDay: DayKey, toDay: DayKey): Partial<Record<Area, number>> {
  const out: Partial<Record<Area, number>> = {};
  for (const e of entries) {
    if (e.day < fromDay || e.day > toDay) continue;
    for (const b of e.blocks) out[b.area] = (out[b.area] ?? 0) + b.spentSec;
  }
  return out;
}

/** Minutes of a planned practice session needed to earn `xp` (the "practice" XP rule). */
export function minutesForXp(xp: number): number {
  if (!(xp > 0)) return 0;
  for (let m = 1; m <= 60; m++) if (xpFor('practice', { durationSec: m * 60 }) >= xp) return m;
  return Math.ceil(xp / 1.5);
}

/** The smallest of the offered durations that covers `minutes` (the longest when none does). */
export function durationCovering(minutes: number, durations: readonly number[]): number {
  return durations.find((d) => d >= minutes) ?? durations[durations.length - 1];
}

/** A weekly minutes goal in line with the daily XP goal (about six days of the daily minutes). */
export function defaultWeeklyGoal(dailyGoalXp: number): number {
  if (dailyGoalXp <= 10) return 30;
  if (dailyGoalXp <= 20) return 60;
  if (dailyGoalXp <= 30) return 90;
  return 150;
}

/** The nudge under the week: what it takes to keep the streak today. */
export interface Nudge {
  tone: 'ok' | 'streak' | 'neutral';
  title: string;
  text: string;
  /** Minutes to practise, or null when nothing is needed. */
  minutes: number | null;
}

/** "3 more minutes to keep your streak today", or the reassurance that it is safe. */
export function streakNudge(goal: { goal: number; met: boolean; remaining: number }, streak: { current: number }): Nudge {
  const days = streak.current;
  if (goal.met) {
    return days > 0
      ? { tone: 'ok', title: `Your ${days}-day streak is safe today`, text: 'Today’s goal is met. Anything more is a bonus.', minutes: null }
      : { tone: 'ok', title: 'Today’s goal is met', text: 'Come back tomorrow and it becomes a streak.', minutes: null };
  }
  const minutes = Math.max(1, minutesForXp(goal.remaining));
  const unit = minutes === 1 ? 'minute' : 'minutes';
  if (days > 0) {
    return {
      tone: 'streak',
      title: `${minutes} more ${unit} to keep your streak today`,
      text: `A planned session earns the ${goal.remaining} XP left on your daily goal, and your ${days}-day streak carries on.`,
      minutes,
    };
  }
  return {
    tone: 'neutral',
    title: `${minutes} ${unit} meets today’s goal`,
    text: `A planned session earns the ${goal.remaining} XP ${goal.remaining >= goal.goal ? 'your daily goal asks for' : 'left on your daily goal'}, and starts a streak.`,
    minutes,
  };
}

const DAY_FORMAT = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "Today", "Yesterday" or "Mon 9 Nov". */
export function dayLabel(day: DayKey, today: DayKey, yesterday: DayKey): string {
  if (day === today) return 'Today';
  if (day === yesterday) return 'Yesterday';
  const [y, m, d] = day.split('-').map(Number);
  return DAY_FORMAT.format(new Date(Date.UTC(y, (m || 1) - 1, d || 1)));
}

/** "1:05" style minutes and seconds for a duration in seconds. */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/** A duration for a sentence: "40 seconds", "1 minute", "4 minutes and 10 seconds". */
export function spokenDuration(sec: number): string {
  const s = Math.max(0, Math.round(Number.isFinite(sec) ? sec : 0));
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (s < 60) return unit(s, 'second');
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? unit(m, 'minute') : `${unit(m, 'minute')} and ${unit(r, 'second')}`;
}

/** What "End the session now?" says about the time practised so far. */
export function endSessionText(practisedSec: number): string {
  const spent = `You have practised ${spokenDuration(practisedSec)}.`;
  return Math.round(practisedSec) < MIN_SAVED_SEC
    ? `${spent} Sessions under half a minute are not saved.`
    : `${spent} That is saved to your journal and counts toward today.`;
}

/** "12 min", or "45 s" under a minute. */
export function formatMinutes(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} s`;
  return `${Math.round(s / 60)} min`;
}

// ---------------------------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const OUTCOMES: readonly BlockOutcome[] = ['pending', 'done', 'partial', 'skipped'];

function parseBlock(v: unknown): JournalBlock | null {
  if (!isObj(v) || !isArea(v.area) || !isStr(v.title)) return null;
  return {
    area: v.area,
    title: v.title,
    plannedSec: isNum(v.plannedSec) ? Math.max(0, Math.round(v.plannedSec)) : 0,
    spentSec: isNum(v.spentSec) ? Math.max(0, Math.round(v.spentSec)) : 0,
    outcome: OUTCOMES.includes(v.outcome as BlockOutcome) ? (v.outcome as BlockOutcome) : 'done',
    goalId: isStr(v.goalId) ? v.goalId : undefined,
  };
}

/** A journal entry from saved data, or null when it is malformed. */
export function parseEntry(v: unknown): JournalEntry | null {
  if (!isObj(v) || !isStr(v.id) || !isNum(v.startedAt) || !isNum(v.endedAt) || !isStr(v.day) || !/^\d{4}-\d{2}-\d{2}$/.test(v.day)) return null;
  const blocks = Array.isArray(v.blocks) ? v.blocks.map(parseBlock).filter((b): b is JournalBlock => b !== null) : [];
  const feel = isNum(v.feel) && v.feel >= 1 && v.feel <= 5 ? (Math.round(v.feel) as Feel) : null;
  return {
    id: v.id,
    startedAt: v.startedAt,
    endedAt: v.endedAt,
    day: v.day,
    title: isStr(v.title) ? v.title.slice(0, 120) : 'Practice session',
    routineId: isStr(v.routineId) ? v.routineId : undefined,
    plannedSec: isNum(v.plannedSec) ? Math.max(0, Math.round(v.plannedSec)) : 0,
    practisedSec: isNum(v.practisedSec) ? Math.max(0, Math.round(v.practisedSec)) : 0,
    blocks,
    xp: isNum(v.xp) ? Math.max(0, Math.round(v.xp)) : 0,
    feel,
    note: isStr(v.note) ? v.note.slice(0, MAX_NOTE) : '',
    endedEarly: v.endedEarly === true,
  };
}

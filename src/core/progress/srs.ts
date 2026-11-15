/**
 * Spaced repetition: an SM-2 style scheduler (the variant with short learning steps) over review
 * items. Pure functions; the reducer stores the results.
 *
 * A card starts `new`. Grading it moves it through two short learning steps (1 minute, then
 * 10 minutes) and then into `review`, where the gap between reviews grows by the card's ease
 * factor each time it is recalled:
 *
 *   again  back to a learning step; in review this is a lapse: ease -0.20, interval quartered
 *   hard   review: interval x 1.2, ease -0.15 (learning: repeat the step)
 *   good   review: interval x ease (learning: next step, then graduate at 1 day)
 *   easy   review: interval x ease x 1.3, ease +0.15 (learning: graduate at once at 4 days)
 *
 * Ease stays within 1.3 to 3.0 and intervals within 1 to 365 days. Reviews are due per local
 * calendar day, so a card due "today" is due from the first minute of the day.
 */
import { addDays, dayKey } from './time';
import type { DayKey, ReviewGrade, ReviewItem, ReviewItemInput, SrsState } from './types';

/** Delays of the learning steps, in minutes. */
export const LEARNING_STEPS_MIN: readonly number[] = [1, 10];
/** Ease factor of a new card. */
export const START_EASE = 2.5;
/** Lowest ease factor. */
export const MIN_EASE = 1.3;
/** Highest ease factor. */
export const MAX_EASE = 3.0;
/** Longest interval in days. */
export const MAX_INTERVAL_DAYS = 365;
/** Interval of a card that graduates with "good". */
export const GRADUATE_DAYS = 1;
/** Interval of a new card answered "easy". */
export const EASY_DAYS = 4;
/** Default daily caps. */
export const DEFAULT_REVIEW_CAPS = { newPerDay: 10, reviewsPerDay: 100 } as const;
/** Most cards the scheduler holds. */
export const MAX_REVIEW_ITEMS = 5000;
/** Learning cards due within this many minutes are appended to the queue rather than hidden. */
export const LEARN_AHEAD_MIN = 20;

const clampEase = (ease: number): number => Math.min(MAX_EASE, Math.max(MIN_EASE, Math.round(ease * 100) / 100));
const clampInterval = (days: number): number => Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(days)));

/** A fresh card. */
export function newReviewItem(input: ReviewItemInput, now: number, today: DayKey): ReviewItem {
  const item: ReviewItem = {
    id: input.id,
    kind: input.kind,
    state: 'new',
    step: 0,
    ease: START_EASE,
    interval: 0,
    reps: 0,
    lapses: 0,
    dueAt: 0,
    dueDay: today,
    addedAt: now,
    lastAt: 0,
  };
  if (input.ref !== undefined) item.ref = input.ref;
  return item;
}

function toLearning(item: ReviewItem, step: number, now: number, timeZone?: string): ReviewItem {
  const dueAt = now + LEARNING_STEPS_MIN[Math.min(step, LEARNING_STEPS_MIN.length - 1)] * 60_000;
  return { ...item, state: 'learning', step, dueAt, dueDay: dayKey(dueAt, timeZone), lastAt: now };
}

function toReview(item: ReviewItem, interval: number, today: DayKey, now: number): ReviewItem {
  const days = clampInterval(interval);
  return { ...item, state: 'review', step: 0, interval: days, dueAt: 0, dueDay: addDays(today, days), lastAt: now };
}

/** Grade a card and return its next schedule. Never mutates `item`. */
export function gradeItem(item: ReviewItem, grade: ReviewGrade, now: number, today: DayKey, timeZone?: string): ReviewItem {
  if (item.state === 'review') {
    if (grade === 'again') {
      // A lapse: relearn with one short step, and come back at a quarter of the old interval.
      const lapsed: ReviewItem = { ...item, ease: clampEase(item.ease - 0.2), lapses: item.lapses + 1, reps: 0, interval: clampInterval(item.interval * 0.25) };
      return toLearning(lapsed, LEARNING_STEPS_MIN.length - 1, now, timeZone);
    }
    const grown = (factor: number): number => Math.max(item.interval + 1, item.interval * factor);
    if (grade === 'hard') return toReview({ ...item, ease: clampEase(item.ease - 0.15), reps: item.reps + 1 }, grown(1.2), today, now);
    if (grade === 'good') return toReview({ ...item, reps: item.reps + 1 }, grown(item.ease), today, now);
    const ease = clampEase(item.ease + 0.15);
    return toReview({ ...item, ease, reps: item.reps + 1 }, grown(ease * 1.3), today, now);
  }

  // New or learning.
  const step = item.state === 'new' ? 0 : item.step;
  if (grade === 'again') return toLearning({ ...item, reps: 0 }, 0, now, timeZone);
  if (grade === 'hard') return toLearning(item, step, now, timeZone);
  if (grade === 'easy') {
    // A relearned card keeps the interval it was given when it lapsed, plus a day.
    const interval = item.lapses > 0 && item.interval > 0 ? item.interval + 1 : EASY_DAYS;
    return toReview({ ...item, ease: clampEase(item.ease + (item.lapses > 0 ? 0 : 0.15)), reps: item.reps + 1 }, interval, today, now);
  }
  if (step + 1 < LEARNING_STEPS_MIN.length) return toLearning(item, step + 1, now, timeZone);
  const interval = item.lapses > 0 && item.interval > 0 ? item.interval : GRADUATE_DAYS;
  return toReview({ ...item, reps: item.reps + 1 }, interval, today, now);
}

/** Preview of the interval each grade would give, for the labels on the answer buttons. */
export function previewGrades(item: ReviewItem, now: number, today: DayKey, timeZone?: string): Record<ReviewGrade, { minutes: number; days: number }> {
  const one = (grade: ReviewGrade): { minutes: number; days: number } => {
    const next = gradeItem(item, grade, now, today, timeZone);
    return next.state === 'review' ? { minutes: 0, days: next.interval } : { minutes: Math.round((next.dueAt - now) / 60_000), days: 0 };
  };
  return { again: one('again'), hard: one('hard'), good: one('good'), easy: one('easy') };
}

/** Daily caps of the queue. */
export interface ReviewCaps {
  newPerDay: number;
  reviewsPerDay: number;
}

/** Options for queue and count queries. */
export interface ReviewQuery {
  /** Only cards of these kinds. */
  kinds?: readonly string[];
  /** Cut the queue to this many cards. */
  limit?: number;
  /** Leave new cards out (review only). */
  includeNew?: boolean;
}

interface Buckets {
  learningNow: ReviewItem[];
  learningSoon: ReviewItem[];
  learningLater: ReviewItem[];
  reviewDue: ReviewItem[];
  fresh: ReviewItem[];
  totals: { new: number; learning: number; review: number };
}

function bucket(srs: SrsState, now: number, today: DayKey, kinds?: readonly string[]): Buckets {
  const out: Buckets = { learningNow: [], learningSoon: [], learningLater: [], reviewDue: [], fresh: [], totals: { new: 0, learning: 0, review: 0 } };
  const soon = now + LEARN_AHEAD_MIN * 60_000;
  for (const id in srs.items) {
    const item = srs.items[id];
    if (kinds && !kinds.includes(item.kind)) continue;
    out.totals[item.state]++;
    if (item.state === 'learning') {
      if (item.dueAt <= now) out.learningNow.push(item);
      else if (item.dueAt <= soon) out.learningSoon.push(item);
      else out.learningLater.push(item);
    } else if (item.state === 'review') {
      if (item.dueDay <= today) out.reviewDue.push(item);
    } else {
      out.fresh.push(item);
    }
  }
  const byDueAt = (a: ReviewItem, b: ReviewItem): number => a.dueAt - b.dueAt || (a.id < b.id ? -1 : 1);
  out.learningNow.sort(byDueAt);
  out.learningSoon.sort(byDueAt);
  // Most overdue first; ties in a stable, content-independent order.
  out.reviewDue.sort((a, b) => (a.dueDay === b.dueDay ? (a.id < b.id ? -1 : 1) : a.dueDay < b.dueDay ? -1 : 1));
  out.fresh.sort((a, b) => a.addedAt - b.addedAt || (a.id < b.id ? -1 : 1));
  return out;
}

function remaining(srs: SrsState, today: DayKey, caps: ReviewCaps): { fresh: number; reviews: number } {
  const sameDay = srs.day === today;
  return {
    fresh: Math.max(0, caps.newPerDay - (sameDay ? srs.newToday : 0)),
    reviews: Math.max(0, caps.reviewsPerDay - (sameDay ? srs.reviewsToday : 0)),
  };
}

/**
 * The cards to study now, in order: learning cards that are due, reviews due today (most overdue
 * first, up to the review cap), new cards (oldest first, up to the new-card cap), then learning
 * cards that come due within the next 20 minutes.
 */
export function dueQueue(srs: SrsState, now: number, today: DayKey, caps: ReviewCaps, query: ReviewQuery = {}): ReviewItem[] {
  const b = bucket(srs, now, today, query.kinds);
  const left = remaining(srs, today, caps);
  const queue = [
    ...b.learningNow,
    ...b.reviewDue.slice(0, left.reviews),
    ...(query.includeNew === false ? [] : b.fresh.slice(0, left.fresh)),
    ...b.learningSoon,
  ];
  return query.limit !== undefined ? queue.slice(0, Math.max(0, query.limit)) : queue;
}

/** Card counts for a deck badge. */
export interface ReviewCounts {
  /** New cards that can still be introduced today (after the daily cap). */
  new: number;
  /** Learning cards due now or within the look-ahead window. */
  learning: number;
  /** Reviews due today (after the daily cap). */
  review: number;
  /** Cards in the queue right now: the three numbers above added up. */
  due: number;
  /** Learning cards that come due later today, after the look-ahead window. */
  later: number;
  /** All cards per state, ignoring caps and due dates. */
  totals: { new: number; learning: number; review: number; all: number };
}

/** Counts by state, with the daily caps applied to what is due. */
export function reviewCounts(srs: SrsState, now: number, today: DayKey, caps: ReviewCaps, query: ReviewQuery = {}): ReviewCounts {
  const b = bucket(srs, now, today, query.kinds);
  const left = remaining(srs, today, caps);
  const fresh = query.includeNew === false ? 0 : Math.min(left.fresh, b.fresh.length);
  const review = Math.min(left.reviews, b.reviewDue.length);
  const learning = b.learningNow.length + b.learningSoon.length;
  return {
    new: fresh,
    learning,
    review,
    due: fresh + learning + review,
    later: b.learningLater.length,
    totals: { ...b.totals, all: b.totals.new + b.totals.learning + b.totals.review },
  };
}

/** How many reviews fall due on each of the next `days` days (today first), for a forecast chart. */
export function reviewForecast(srs: SrsState, today: DayKey, days = 7): Array<{ day: DayKey; count: number }> {
  const out: Array<{ day: DayKey; count: number }> = [];
  const index = new Map<DayKey, number>();
  for (let i = 0; i < days; i++) {
    const day = addDays(today, i);
    index.set(day, i);
    out.push({ day, count: 0 });
  }
  for (const id in srs.items) {
    const item = srs.items[id];
    if (item.state === 'new') continue;
    // Anything overdue counts toward today.
    const slot = index.get(item.dueDay <= today ? today : item.dueDay);
    if (slot !== undefined) out[slot].count++;
  }
  return out;
}

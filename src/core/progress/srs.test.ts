import { describe, expect, it } from 'vitest';
import { dueReviews, reviewCountsOf } from './selectors';
import {
  EASY_DAYS,
  GRADUATE_DAYS,
  LEARNING_STEPS_MIN,
  MAX_EASE,
  MAX_INTERVAL_DAYS,
  MIN_EASE,
  START_EASE,
  dueQueue,
  gradeItem,
  newReviewItem,
  previewGrades,
  reviewCounts,
  reviewForecast,
} from './srs';
import { addDays } from './time';
import { at, makeRig } from './testkit';
import type { ReviewGrade, ReviewItem, SrsState } from './types';

const T0 = at('2026-03-02T09:00:00Z');
const TODAY = '2026-03-02';
const MIN = 60_000;

const fresh = (id = 'card-1'): ReviewItem => newReviewItem({ id, kind: 'theory-fact', ref: 'unit-1:fact-3' }, T0, TODAY);

/** Take a new card through both learning steps into review. */
function graduated(id = 'card-1'): ReviewItem {
  let card = gradeItem(fresh(id), 'good', T0, TODAY, 'UTC');
  card = gradeItem(card, 'good', T0 + MIN, TODAY, 'UTC');
  return card;
}

/** Review a card with `grade` on its due day, `times` times. */
function reviewOnTime(card: ReviewItem, grade: ReviewGrade, times: number): ReviewItem {
  let c = card;
  for (let i = 0; i < times; i++) c = gradeItem(c, grade, T0, c.dueDay, 'UTC');
  return c;
}

describe('SM-2 scheduling', () => {
  it('starts a card as new with the default ease', () => {
    expect(fresh()).toEqual({
      id: 'card-1',
      kind: 'theory-fact',
      ref: 'unit-1:fact-3',
      state: 'new',
      step: 0,
      ease: START_EASE,
      interval: 0,
      reps: 0,
      lapses: 0,
      dueAt: 0,
      dueDay: TODAY,
      addedAt: T0,
      lastAt: 0,
    });
  });

  it('walks a new card through the learning steps before it graduates', () => {
    const step1 = gradeItem(fresh(), 'good', T0, TODAY, 'UTC');
    expect(step1).toMatchObject({ state: 'learning', step: 1, dueAt: T0 + LEARNING_STEPS_MIN[1] * MIN, lastAt: T0 });
    const done = gradeItem(step1, 'good', T0 + 10 * MIN, TODAY, 'UTC');
    expect(done).toMatchObject({ state: 'review', interval: GRADUATE_DAYS, dueDay: addDays(TODAY, 1), dueAt: 0, reps: 1, ease: START_EASE });
  });

  it('sends "again" back to the first step and repeats the step on "hard"', () => {
    const step1 = gradeItem(fresh(), 'good', T0, TODAY, 'UTC');
    expect(gradeItem(step1, 'again', T0, TODAY, 'UTC')).toMatchObject({ state: 'learning', step: 0, dueAt: T0 + LEARNING_STEPS_MIN[0] * MIN });
    expect(gradeItem(step1, 'hard', T0, TODAY, 'UTC')).toMatchObject({ state: 'learning', step: 1, dueAt: T0 + LEARNING_STEPS_MIN[1] * MIN });
    expect(gradeItem(fresh(), 'again', T0, TODAY, 'UTC')).toMatchObject({ state: 'learning', step: 0 });
  });

  it('graduates a new card at once on "easy", with a longer interval and more ease', () => {
    expect(gradeItem(fresh(), 'easy', T0, TODAY, 'UTC')).toMatchObject({ state: 'review', interval: EASY_DAYS, dueDay: addDays(TODAY, EASY_DAYS), ease: START_EASE + 0.15 });
  });

  it('grows the interval by the ease factor on "good"', () => {
    let card = graduated();
    const intervals: number[] = [card.interval];
    for (let i = 0; i < 6; i++) {
      card = gradeItem(card, 'good', T0, card.dueDay, 'UTC');
      intervals.push(card.interval);
    }
    // 1 -> max(2, 2.5) -> ... each about 2.5 times the last
    expect(intervals).toEqual([1, 3, 8, 20, 50, 125, 313]);
    expect(card.ease).toBe(START_EASE);
    expect(card.reps).toBe(7);
  });

  it('orders the grades: again < hard < good < easy', () => {
    const card = reviewOnTime(graduated(), 'good', 3); // interval 20
    const preview = previewGrades(card, T0, card.dueDay, 'UTC');
    expect(preview.again).toEqual({ minutes: 10, days: 0 });
    expect(preview.hard.days).toBe(24);
    expect(preview.good.days).toBe(50);
    expect(preview.easy.days).toBe(69); // 20 * 2.65 * 1.3
    expect(preview.hard.days).toBeLessThan(preview.good.days);
    expect(preview.good.days).toBeLessThan(preview.easy.days);
  });

  it('always moves a review at least one day further', () => {
    const card = graduated(); // interval 1
    expect(gradeItem(card, 'hard', T0, card.dueDay, 'UTC').interval).toBe(2);
    expect(gradeItem(card, 'good', T0, card.dueDay, 'UTC').interval).toBe(3);
  });

  it('changes ease by grade and keeps it within bounds', () => {
    const card = graduated();
    expect(gradeItem(card, 'hard', T0, TODAY, 'UTC').ease).toBeCloseTo(2.35);
    expect(gradeItem(card, 'good', T0, TODAY, 'UTC').ease).toBe(2.5);
    expect(gradeItem(card, 'easy', T0, TODAY, 'UTC').ease).toBeCloseTo(2.65);
    expect(reviewOnTime(card, 'hard', 30).ease).toBe(MIN_EASE);
    expect(reviewOnTime(card, 'easy', 30).ease).toBe(MAX_EASE);
  });

  it('caps the interval at one year', () => {
    const card = reviewOnTime(graduated(), 'easy', 20);
    expect(card.interval).toBe(MAX_INTERVAL_DAYS);
    expect(card.dueDay).toBe(addDays(card.dueDay, 0));
  });

  it('treats "again" in review as a lapse: relearn, lower ease, shorter interval', () => {
    const card = reviewOnTime(graduated(), 'good', 3); // interval 20, ease 2.5
    const lapsed = gradeItem(card, 'again', T0, card.dueDay, 'UTC');
    expect(lapsed).toMatchObject({ state: 'learning', lapses: 1, reps: 0, ease: 2.3, interval: 5, step: LEARNING_STEPS_MIN.length - 1, dueAt: T0 + 10 * MIN });
    // Relearning it brings it back at the shortened interval, not at one day.
    const back = gradeItem(lapsed, 'good', T0 + 10 * MIN, card.dueDay, 'UTC');
    expect(back).toMatchObject({ state: 'review', interval: 5, dueDay: addDays(card.dueDay, 5), lapses: 1 });
  });

  it('does not inflate the interval of a card that is practised before it is due', () => {
    const card = reviewOnTime(graduated(), 'good', 3); // interval 20, last reviewed at T0, due on some day D
    const lastDay = '2026-03-02'; // the local day of T0
    const due = card.dueDay;
    // Crammed five times on the day it was last reviewed: the interval and due day stay put.
    let crammed = card;
    for (let i = 0; i < 5; i++) crammed = gradeItem(crammed, 'good', T0 + i * MIN, lastDay, 'UTC');
    expect(crammed.interval).toBe(20);
    expect(crammed.dueDay).toBe(addDays(lastDay, 20));
    expect(crammed.reps).toBe(card.reps + 5);
    // Practised twelve days in, eight days early: it has earned 12 x 2.5 = 30 days, not 20 x 2.5.
    const twelveDaysIn = addDays(lastDay, 12);
    expect(twelveDaysIn < due).toBe(true);
    const early = gradeItem({ ...card, dueDay: addDays(lastDay, 20) }, 'good', T0, twelveDaysIn, 'UTC');
    expect(early.interval).toBe(30);
    // Two days in it has earned less than it already had: unchanged.
    expect(gradeItem({ ...card, dueDay: addDays(lastDay, 20) }, 'easy', T0, addDays(lastDay, 2), 'UTC').interval).toBe(20);
    // Forgetting it early is still a lapse.
    expect(gradeItem({ ...card, dueDay: addDays(lastDay, 20) }, 'again', T0, addDays(lastDay, 2), 'UTC')).toMatchObject({ state: 'learning', lapses: 1, interval: 5 });
  });

  it('schedules reviews by local calendar day', () => {
    // Graded at 23:30 in Berlin: "tomorrow" is the next local date, whatever UTC says.
    const late = at('2026-03-02T22:30:00Z');
    const card = gradeItem(gradeItem(fresh(), 'good', late, '2026-03-02', 'Europe/Berlin'), 'good', late, '2026-03-02', 'Europe/Berlin');
    expect(card.dueDay).toBe('2026-03-03');
    // A learning step that crosses midnight is due on the next local day.
    const step = gradeItem(fresh(), 'good', at('2026-03-02T22:55:00Z'), '2026-03-02', 'Europe/Berlin'); // 23:55 + 10 min
    expect(step.dueDay).toBe('2026-03-03');
  });

  it('never mutates the card it is given', () => {
    const card = Object.freeze(graduated());
    for (const grade of ['again', 'hard', 'good', 'easy'] as const) expect(() => gradeItem(card, grade, T0, TODAY, 'UTC')).not.toThrow();
  });
});

describe('due queue and counts', () => {
  const caps = { newPerDay: 3, reviewsPerDay: 2 };

  function deck(): SrsState {
    const items: Record<string, ReviewItem> = {};
    // Five new cards, added in order.
    for (let i = 1; i <= 5; i++) items[`new-${i}`] = { ...fresh(`new-${i}`), addedAt: T0 + i };
    // Three reviews: one overdue by two days, one due today, one due tomorrow.
    items['rev-old'] = { ...graduated('rev-old'), dueDay: addDays(TODAY, -2) };
    items['rev-today'] = { ...graduated('rev-today'), dueDay: TODAY };
    items['rev-late'] = { ...graduated('rev-late'), dueDay: addDays(TODAY, -1) };
    items['rev-tomorrow'] = { ...graduated('rev-tomorrow'), dueDay: addDays(TODAY, 1) };
    // Learning cards: one due now, one in 5 minutes, one in 2 hours.
    items['learn-now'] = { ...fresh('learn-now'), state: 'learning', dueAt: T0 - MIN, dueDay: TODAY };
    items['learn-soon'] = { ...fresh('learn-soon'), state: 'learning', dueAt: T0 + 5 * MIN, dueDay: TODAY };
    items['learn-later'] = { ...fresh('learn-later'), state: 'learning', dueAt: T0 + 120 * MIN, dueDay: TODAY };
    return { items, day: TODAY, newToday: 0, reviewsToday: 0 };
  }

  it('orders: learning due now, reviews (most overdue first, capped), new (oldest first, capped), learning due soon', () => {
    expect(dueQueue(deck(), T0, TODAY, caps).map((c) => c.id)).toEqual(['learn-now', 'rev-old', 'rev-late', 'new-1', 'new-2', 'new-3', 'learn-soon']);
  });

  it('counts by state with the caps applied', () => {
    expect(reviewCounts(deck(), T0, TODAY, caps)).toEqual({
      new: 3,
      learning: 2,
      review: 2,
      due: 7,
      later: 1,
      totals: { new: 5, learning: 3, review: 4, all: 12 },
    });
  });

  it('shrinks the caps by what was already done today, and resets them on a new day', () => {
    const used: SrsState = { ...deck(), newToday: 2, reviewsToday: 2 };
    expect(dueQueue(used, T0, TODAY, caps).map((c) => c.id)).toEqual(['learn-now', 'new-1', 'learn-soon']);
    expect(reviewCounts(used, T0, TODAY, caps)).toMatchObject({ new: 1, review: 0 });
    // The counters belong to yesterday now.
    const tomorrow = addDays(TODAY, 1);
    expect(reviewCounts(used, T0 + 86_400_000, tomorrow, caps)).toMatchObject({ new: 3, review: 2 });
  });

  it('filters by kind, can leave new cards out and can be limited', () => {
    const d = deck();
    d.items['interval-1'] = { ...fresh('interval-1'), kind: 'interval', addedAt: T0 };
    expect(dueQueue(d, T0, TODAY, caps, { kinds: ['interval'] }).map((c) => c.id)).toEqual(['interval-1']);
    expect(dueQueue(d, T0, TODAY, caps, { includeNew: false }).map((c) => c.id)).toEqual(['learn-now', 'rev-old', 'rev-late', 'learn-soon']);
    expect(dueQueue(d, T0, TODAY, caps, { limit: 2 }).map((c) => c.id)).toEqual(['learn-now', 'rev-old']);
    expect(reviewCounts(d, T0, TODAY, caps, { kinds: ['interval'] }).totals).toEqual({ new: 1, learning: 0, review: 0, all: 1 });
  });

  it('forecasts the coming days, with overdue cards counted today', () => {
    const forecast = reviewForecast(deck(), TODAY, 3);
    expect(forecast).toEqual([
      { day: TODAY, count: 6 }, // 3 due or overdue reviews + 3 learning cards
      { day: addDays(TODAY, 1), count: 1 },
      { day: addDays(TODAY, 2), count: 0 },
    ]);
  });
});

describe('spaced repetition in the store', () => {
  function rigWithCards(n: number) {
    const rig = makeRig({ start: '2026-03-02T09:00:00Z' });
    const added = rig.actions.addReviewItems(Array.from({ length: n }, (_, i) => ({ id: `fret-note:6:${i}`, kind: 'fret-note', ref: `s6f${i}` })));
    return { rig, added };
  }

  it('adds cards once and keeps their order', () => {
    const { rig, added } = rigWithCards(4);
    expect(added).toBe(4);
    expect(rig.actions.addReviewItems([{ id: 'fret-note:6:0', kind: 'fret-note' }, { id: 'interval:m3', kind: 'interval' }, { id: '', kind: 'x' }])).toBe(1);
    const state = rig.store.getState();
    expect(Object.keys(state.srs.items)).toHaveLength(5);
    expect(dueReviews(state, rig.clock.t).map((c) => c.id)).toEqual(['fret-note:6:0', 'fret-note:6:1', 'fret-note:6:2', 'fret-note:6:3', 'interval:m3']);
  });

  it('introduces at most the daily number of new cards', () => {
    const { rig } = rigWithCards(25);
    expect(dueReviews(rig.store.getState(), rig.clock.t)).toHaveLength(10);
    expect(reviewCountsOf(rig.store.getState(), rig.clock.t)).toMatchObject({ new: 10, due: 10, totals: { new: 25, all: 25 } });

    for (const card of dueReviews(rig.store.getState(), rig.clock.t)) rig.actions.gradeReview(card.id, 'easy');
    expect(rig.store.getState().srs).toMatchObject({ newToday: 10, reviewsToday: 0 });
    expect(reviewCountsOf(rig.store.getState(), rig.clock.t)).toMatchObject({ new: 0, due: 0 });

    // Tomorrow: ten more new cards, nothing due yet (easy = 4 days).
    rig.clock.days(1);
    rig.store.tick();
    expect(reviewCountsOf(rig.store.getState(), rig.clock.t)).toMatchObject({ new: 10, review: 0 });
    // Four days after the first session the easy cards come back.
    rig.clock.days(3);
    rig.store.tick();
    expect(reviewCountsOf(rig.store.getState(), rig.clock.t)).toMatchObject({ new: 10, review: 10, due: 20 });
  });

  it('respects changed caps from preferences', () => {
    const { rig } = rigWithCards(25);
    rig.actions.setPrefs({ review: { newPerDay: 4 } });
    expect(dueReviews(rig.store.getState(), rig.clock.t)).toHaveLength(4);
    rig.actions.setPrefs({ review: { newPerDay: 999 } });
    expect(rig.store.getState().prefs.review.newPerDay).toBe(50); // clamped
  });

  it('runs a whole learning session through the store', () => {
    const { rig } = rigWithCards(2);
    const [a, b] = dueReviews(rig.store.getState(), rig.clock.t);
    expect(rig.actions.gradeReview(a.id, 'good')).toMatchObject({ state: 'learning', step: 1 });
    expect(rig.actions.gradeReview(b.id, 'again')).toMatchObject({ state: 'learning', step: 0 });
    // Both are learning and due within the look-ahead window: still in the queue.
    expect(dueReviews(rig.store.getState(), rig.clock.t).map((c) => c.id)).toEqual([b.id, a.id]);
    rig.clock.minutes(10);
    expect(rig.actions.gradeReview(a.id, 'good')).toMatchObject({ state: 'review', interval: 1, dueDay: '2026-03-03' });
    expect(rig.actions.gradeReview(b.id, 'good')).toMatchObject({ state: 'learning', step: 1 });
    rig.clock.minutes(10);
    expect(rig.actions.gradeReview(b.id, 'good')).toMatchObject({ state: 'review' });
    expect(dueReviews(rig.store.getState(), rig.clock.t)).toEqual([]);

    const state = rig.store.getState();
    expect(state.stats['srs.reviews']).toBe(5);
    expect(state.stats['srs.correct']).toBe(4);
    expect(state.srs.newToday).toBe(2);

    rig.clock.days(1);
    rig.store.tick();
    expect(dueReviews(rig.store.getState(), rig.clock.t).map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
    rig.actions.gradeReview(a.id, 'good');
    expect(rig.store.getState().srs).toMatchObject({ newToday: 0, reviewsToday: 1 });
  });

  it('does not count extra practice on cards that are not due against the daily review cap', () => {
    const { rig } = rigWithCards(1);
    rig.actions.gradeReview('fret-note:6:0', 'easy'); // new -> review, due in 4 days
    for (let i = 0; i < 3; i++) rig.actions.gradeReview('fret-note:6:0', 'good'); // practising it anyway
    expect(rig.store.getState().srs).toMatchObject({ newToday: 1, reviewsToday: 0 });
    expect(rig.store.getState().srs.items['fret-note:6:0']).toMatchObject({ interval: 4, dueDay: '2026-03-06' });
    expect(rig.store.getState().stats['srs.reviews']).toBe(4); // it still counts as practice
    rig.clock.days(4);
    rig.actions.gradeReview('fret-note:6:0', 'good'); // due today
    expect(rig.store.getState().srs.reviewsToday).toBe(1);
  });

  it('returns null for unknown cards and bad grades without changing anything', () => {
    const { rig } = rigWithCards(1);
    const before = rig.store.getState();
    expect(rig.actions.gradeReview('nope', 'good')).toBeNull();
    expect(rig.actions.gradeReview('fret-note:6:0', 'perfect' as ReviewGrade)).toBeNull();
    expect(rig.store.getState()).toBe(before);
  });

  it('removes cards', () => {
    const { rig } = rigWithCards(3);
    expect(rig.actions.removeReviewItems(['fret-note:6:1', 'missing'])).toBe(1);
    expect(Object.keys(rig.store.getState().srs.items)).toEqual(['fret-note:6:0', 'fret-note:6:2']);
  });
});

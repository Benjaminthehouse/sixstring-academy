import { describe, expect, it } from 'vitest';
import { HEART_REGEN_MINUTES, MAX_HEARTS } from './catalog';
import { FULL_HEARTS, HEART_REGEN_MS, addHearts, heartsView, removeHeart, settleHearts } from './hearts';
import { canStartLesson, heartsOf, shopOf } from './selectors';
import { makeRig, type TestRig } from './testkit';

const hearts = (rig: TestRig) => heartsOf(rig.store.getState(), rig.clock.t);

describe('hearts (pure)', () => {
  it('start full with nothing regenerating', () => {
    expect(heartsView(FULL_HEARTS, 1000)).toMatchObject({ count: 5, max: 5, full: true, empty: false, nextAt: null, msToNext: 0, msToFull: 0 });
  });

  it('lose one at a time, never below zero', () => {
    let h = FULL_HEARTS;
    for (let i = 0; i < 7; i++) h = removeHeart(h, 1000);
    expect(h.count).toBe(0);
    expect(heartsView(h, 1000).empty).toBe(true);
  });

  it('regenerate one every period, keeping the remainder', () => {
    const t0 = 1_000_000;
    let h = removeHeart(removeHeart(removeHeart(FULL_HEARTS, t0), t0), t0); // 2 left
    expect(heartsView(h, t0)).toMatchObject({ count: 2, nextAt: t0 + HEART_REGEN_MS, msToNext: HEART_REGEN_MS, msToFull: 3 * HEART_REGEN_MS });

    expect(heartsView(h, t0 + HEART_REGEN_MS - 1).count).toBe(2);
    expect(heartsView(h, t0 + HEART_REGEN_MS).count).toBe(3);

    // One and a half periods later: one heart back, half a period already counted toward the next.
    const later = t0 + HEART_REGEN_MS * 1.5;
    h = settleHearts(h, later);
    expect(h).toEqual({ count: 3, regenFrom: t0 + HEART_REGEN_MS });
    expect(heartsView(h, later).msToNext).toBe(HEART_REGEN_MS / 2);

    expect(settleHearts(h, t0 + HEART_REGEN_MS * 3)).toEqual({ count: 5, regenFrom: null });
    expect(settleHearts(h, t0 + HEART_REGEN_MS * 300)).toEqual({ count: 5, regenFrom: null });
  });

  it('does not restart the regeneration period when another heart is lost', () => {
    const t0 = 5_000_000;
    let h = removeHeart(FULL_HEARTS, t0);
    h = removeHeart(h, t0 + HEART_REGEN_MS / 2);
    expect(h).toEqual({ count: 3, regenFrom: t0 });
    expect(heartsView(h, t0 + HEART_REGEN_MS).count).toBe(4);
  });

  it('returns the same object when nothing changed', () => {
    expect(settleHearts(FULL_HEARTS, 123)).toBe(FULL_HEARTS);
    const h = removeHeart(FULL_HEARTS, 1000);
    expect(settleHearts(h, 1001)).toBe(h);
  });

  it('restarts the period when the clock jumped backwards, instead of stalling', () => {
    const h = removeHeart(FULL_HEARTS, 10_000_000);
    const settled = settleHearts(h, 5_000_000);
    expect(settled).toEqual({ count: 4, regenFrom: 5_000_000 });
    expect(heartsView(h, 5_000_000).msToNext).toBe(HEART_REGEN_MS);
  });

  it('adds hearts up to the maximum', () => {
    const h = { count: 1, regenFrom: 1000 };
    expect(addHearts(h, 1, 1000)).toEqual({ count: 2, regenFrom: 1000 });
    expect(addHearts(h, 10, 1000)).toEqual({ count: 5, regenFrom: null });
  });

  it('are always full in unlimited mode', () => {
    expect(heartsView({ count: 0, regenFrom: 1 }, 2, true)).toMatchObject({ count: 5, full: true, empty: false, unlimited: true });
  });
});

describe('hearts in the store', () => {
  it('uses a 20-minute period and a maximum of five', () => {
    expect(HEART_REGEN_MINUTES).toBe(20);
    expect(MAX_HEARTS).toBe(5);
  });

  it('loses one heart per mistake and reports when the learner is out', () => {
    const rig = makeRig();
    expect(rig.actions.loseHeart()).toEqual({ remaining: 4, lost: true, empty: false });
    rig.actions.loseHeart();
    rig.actions.loseHeart();
    rig.actions.loseHeart();
    expect(rig.actions.loseHeart()).toEqual({ remaining: 0, lost: true, empty: true });
    expect(rig.actions.loseHeart()).toEqual({ remaining: 0, lost: false, empty: true });
    expect(rig.eventsOf('heart-lost').map((e) => e.remaining)).toEqual([4, 3, 2, 1, 0]);
    expect(rig.eventsOf('heart-lost')[4].empty).toBe(true);
    expect(canStartLesson(rig.store.getState(), rig.clock.t)).toBe(false);
    expect(rig.store.getState().stats['hearts.lost']).toBe(5);
  });

  it('regenerates with time', () => {
    const rig = makeRig();
    for (let i = 0; i < 5; i++) rig.actions.loseHeart();
    rig.clock.minutes(19);
    expect(hearts(rig).count).toBe(0);
    rig.clock.minutes(1);
    expect(hearts(rig)).toMatchObject({ count: 1, empty: false });
    expect(canStartLesson(rig.store.getState(), rig.clock.t)).toBe(true);
    rig.clock.minutes(45);
    expect(hearts(rig).count).toBe(3);
    // Losing one now keeps the five minutes already waited for the next heart.
    expect(rig.actions.loseHeart().remaining).toBe(2);
    expect(hearts(rig).msToNext).toBe(15 * 60_000);
    rig.clock.minutes(15 + 40);
    expect(hearts(rig)).toMatchObject({ count: 5, full: true, nextAt: null });
  });

  it('refills completely after a review or practice session', () => {
    for (const kind of ['review', 'practice'] as const) {
      const rig = makeRig();
      for (let i = 0; i < 4; i++) rig.actions.loseHeart();
      const result = rig.actions.recordActivity({ kind, durationSec: 120, count: 8 });
      expect(result.hearts).toBe(5);
      expect(rig.store.getState().hearts).toEqual({ count: 5, regenFrom: null });
      expect(rig.eventsOf('hearts-refilled')).toEqual([{ type: 'hearts-refilled', at: rig.clock.t, count: 5, via: 'practice' }]);
    }
  });

  it('gives one heart back for any other playing activity, and none for an abandoned one', () => {
    const rig = makeRig();
    for (let i = 0; i < 3; i++) rig.actions.loseHeart();
    expect(rig.actions.recordActivity({ kind: 'song', id: 'song:greensleeves', completed: false, durationSec: 30 }).hearts).toBe(2);
    expect(rig.actions.recordActivity({ kind: 'song', id: 'song:greensleeves', durationSec: 120 }).hearts).toBe(3);
    expect(rig.actions.recordActivity({ kind: 'scale-game', accuracy: 0.9 }).hearts).toBe(4);
    // Theory lessons and tools do not give hearts back.
    expect(rig.actions.recordActivity({ kind: 'theory-lesson' }).hearts).toBe(4);
    expect(rig.actions.recordActivity({ kind: 'tuner' }).hearts).toBe(4);
    expect(rig.eventsOf('hearts-refilled')).toHaveLength(0);
  });

  it('can be refilled with gems, only when needed and affordable', () => {
    const rig = makeRig();
    expect(rig.actions.buy('heart-refill')).toEqual({ ok: false, item: 'heart-refill', reason: 'not-needed' });
    rig.actions.loseHeart();
    rig.actions.loseHeart();
    expect(rig.actions.buy('heart-refill')).toEqual({ ok: false, item: 'heart-refill', reason: 'insufficient-gems' });
    rig.actions.grantGems(50, 'test');
    expect(shopOf(rig.store.getState(), rig.clock.t).consumables.find((c) => c.id === 'heart-refill')).toMatchObject({ affordable: true, available: true });
    expect(rig.actions.buy('heart-refill')).toEqual({ ok: true, item: 'heart-refill', price: 20, balance: 30 });
    expect(hearts(rig).count).toBe(5);
    expect(rig.eventsOf('hearts-refilled')[0]).toMatchObject({ via: 'gems', count: 5 });
    expect(shopOf(rig.store.getState(), rig.clock.t).consumables.find((c) => c.id === 'heart-refill')).toMatchObject({ available: false });
  });

  it('can be refilled for free as a gift', () => {
    const rig = makeRig();
    rig.actions.loseHeart();
    expect(rig.actions.refillHearts('gift')).toBe(5);
    expect(rig.eventsOf('hearts-refilled')[0].via).toBe('gift');
    // Refilling full hearts changes nothing and announces nothing.
    const before = rig.store.getState();
    rig.actions.refillHearts('gift');
    expect(rig.store.getState()).toBe(before);
    expect(rig.eventsOf('hearts-refilled')).toHaveLength(1);
  });

  it('is switched off by the unlimited-hearts preference', () => {
    const rig = makeRig();
    rig.actions.loseHeart();
    rig.actions.setPrefs({ unlimitedHearts: true });
    expect(hearts(rig)).toMatchObject({ count: 5, unlimited: true, empty: false });
    const before = rig.store.getState();
    expect(rig.actions.loseHeart()).toEqual({ remaining: 5, lost: false, empty: false });
    expect(rig.store.getState()).toBe(before); // nothing recorded, nothing saved
    expect(rig.actions.buy('heart-refill')).toMatchObject({ ok: false, reason: 'not-needed' });
    expect(canStartLesson(rig.store.getState(), rig.clock.t)).toBe(true);

    // Switching it back on returns to the real count (regenerated meanwhile).
    rig.actions.setPrefs({ unlimitedHearts: false });
    expect(hearts(rig).count).toBe(4);
    rig.clock.minutes(20);
    expect(hearts(rig).count).toBe(5);
  });
});

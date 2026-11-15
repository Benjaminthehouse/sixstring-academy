import { describe, expect, it } from 'vitest';
import { cooldownFor, MIN_FOCUS, newPicker, notePick, pickItem, planPick, recentSuccess, TARGET_SUCCESS, type ItemEstimate, type PickerState } from './picker';
import { makeRng } from './rng';
import { accuracyOf, recordAnswer, slownessOf, type NeckStats } from './stats';
import { parsePosKey } from './neck';

/**
 * A simulated learner: each item has a chance of being answered right. With `learns`, the learner
 * behaves like a person: right after being shown a missed answer the next try is easier (+25 %),
 * and every question on an item teaches a little (`rate`, 1 % by default).
 */
function simulate(start: Record<string, number>, questions: number, seed: number, learns = false, rate = 0.01) {
  const truth = { ...start };
  const keys = Object.keys(truth);
  const rng = makeRng(seed);
  let stats: NeckStats = {};
  let picker: PickerState = newPicker();
  const asked: string[] = [];
  const outcomes: number[] = [];
  const justShown = new Set<string>();
  const est = (k: string): ItemEstimate => ({ accuracy: accuracyOf(stats[k]), slowness: slownessOf(stats[k]), seen: stats[k]?.n ?? 0 });
  for (let i = 0; i < questions; i++) {
    const key = pickItem(keys, est, picker, rng);
    const predicted = est(key).accuracy;
    const chance = Math.min(1, truth[key] + (learns && justShown.has(key) ? 0.25 : 0));
    const right = rng.next() < chance;
    justShown.delete(key);
    if (learns) {
      truth[key] = Math.min(0.98, truth[key] + rate);
      if (!right) justShown.add(key);
    }
    stats = recordAnswer(stats, parsePosKey(key)!, right, right ? 1200 : null);
    picker = notePick(picker, key, right ? 1 : 0, keys.length, predicted);
    asked.push(key);
    outcomes.push(right ? 1 : 0);
  }
  return { asked, outcomes, stats, truth };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const share = (asked: string[], set: string[]) => asked.filter((k) => set.includes(k)).length / asked.length;

const twelve = Array.from({ length: 12 }, (_, i) => `6:${i}`);

describe('adaptive picker', () => {
  const weak = ['6:1', '6:6', '6:10'];

  it('converges on weak spots: each place the learner misses is asked more than any place they know', () => {
    for (const low of [0.3, 0.55]) {
      const truth = Object.fromEntries(twelve.map((k) => [k, weak.includes(k) ? low : 0.95]));
      const counts: Record<string, number> = {};
      let weakShare = 0;
      for (const seed of SEEDS) {
        const { asked } = simulate(truth, 300, seed);
        const late = asked.slice(60);
        weakShare += share(late, weak) / SEEDS.length;
        for (const k of late) counts[k] = (counts[k] ?? 0) + 1;
      }
      // Uniform picking would give 25 %.
      expect(weakShare).toBeGreaterThan(0.29);
      const strongMax = Math.max(...twelve.filter((k) => !weak.includes(k)).map((k) => counts[k]));
      for (const k of weak) expect(counts[k]).toBeGreaterThan(strongMax);
    }
  });

  it('moves on once a weak spot is learned', () => {
    const truth = Object.fromEntries(twelve.map((k) => [k, weak.includes(k) ? 0.25 : 0.95]));
    let early = 0;
    let late = 0;
    let learned = 0;
    for (const seed of SEEDS) {
      const r = simulate(truth, 400, seed, true, 0.04);
      early += share(r.asked.slice(20, 120), weak) / SEEDS.length;
      late += share(r.asked.slice(300), weak) / SEEDS.length;
      learned += mean(weak.map((k) => accuracyOf(r.stats[k]))) / SEEDS.length;
    }
    expect(early).toBeGreaterThan(0.3);
    expect(late).toBeLessThan(early);
    expect(learned).toBeGreaterThan(0.7);
  });

  it('asks every item at least once early on (untried places are not ignored)', () => {
    const truth = Object.fromEntries(twelve.map((k) => [k, 0.9]));
    for (const seed of SEEDS) {
      const { asked } = simulate(truth, 40, seed);
      expect(new Set(asked).size).toBe(12);
    }
  });

  it('is never stuck on one item: no repeats inside the cooldown, and no item takes over a round', () => {
    // One place the learner always misses, the rest always right.
    const truth = Object.fromEntries(twelve.map((k) => [k, k === '6:4' ? 0 : 1]));
    for (const seed of SEEDS) {
      const { asked } = simulate(truth, 200, seed);
      const cool = cooldownFor(12);
      for (let i = 1; i < asked.length; i++) {
        expect(asked.slice(Math.max(0, i - cool), i)).not.toContain(asked[i]);
      }
      const s = share(asked, ['6:4']);
      expect(s).toBeLessThanOrEqual(1 / (cool + 1) + 1e-9);
      expect(s).toBeGreaterThan(1 / 12);
    }
  });

  it('holds success near 80 % for a learner with mixed knowledge who learns from feedback', () => {
    // Abilities spread evenly from 45 % to 100 %: picking at random would succeed 72.5 % of the time.
    const truth = Object.fromEntries(twelve.map((k, i) => [k, 0.45 + (0.55 * i) / 11]));
    const learner = mean(SEEDS.map((seed) => mean(simulate(truth, 150, seed, true).outcomes.slice(30))));
    expect(learner).toBeGreaterThan(0.75);
    expect(learner).toBeLessThan(0.86);
  });

  it('does better than random picking even for a learner who never improves', () => {
    const truth = Object.fromEntries(twelve.map((k, i) => [k, 0.45 + (0.55 * i) / 11]));
    const random = mean(Object.values(truth));
    const success = mean(SEEDS.map((seed) => mean(simulate(truth, 260, seed).outcomes.slice(60))));
    expect(success).toBeGreaterThan(random + 0.01);
    expect(success).toBeLessThan(0.86);
  });

  it('a strong learner is not held back: nearly everything goes to the few weaker places', () => {
    const truth = Object.fromEntries(twelve.map((k) => [k, weak.includes(k) ? 0.85 : 0.99]));
    const s = mean(SEEDS.map((seed) => share(simulate(truth, 300, seed).asked.slice(60), weak)));
    expect(s).toBeGreaterThan(0.3);
  });

  it('does not repeat an item twice in a row even with two candidates', () => {
    const truth = { '6:0': 0.1, '6:1': 1 };
    const { asked } = simulate(truth, 50, 3);
    for (let i = 1; i < asked.length; i++) expect(asked[i]).not.toBe(asked[i - 1]);
  });

  it('a single candidate is simply asked again', () => {
    const p = newPicker();
    expect(pickItem(['6:5'], () => ({ accuracy: 0.5, slowness: 0 }), p, makeRng(1))).toBe('6:5');
  });

  it('holds success near 80 % for a learner with mixed knowledge', () => {
    // Abilities spread from 45 % to 100 %: uniform picking would succeed about 72 % of the time.
    const truth = Object.fromEntries(twelve.map((k, i) => [k, 0.45 + (0.55 * i) / 11]));
    let success = 0;
    const seeds = [21, 22, 23, 24, 25, 26];
    for (const seed of seeds) {
      const { outcomes } = simulate(truth, 240, seed);
      success += outcomes.slice(40).reduce((a, b) => a + b, 0) / (outcomes.length - 40) / seeds.length;
    }
    expect(success).toBeGreaterThan(0.72);
    expect(success).toBeLessThan(0.88);
  });

  it('leans on known places when a round goes badly, and on weak ones when it goes well', () => {
    const keys = twelve;
    const est = (k: string): ItemEstimate => ({ accuracy: k === '6:0' || k === '6:1' ? 0.2 : 0.9, slowness: 0 });
    const struggling: PickerState = { history: [], retries: [], results: [0, 0, 0, 0, 0, 1, 0, 0], surprise: [] };
    const cruising: PickerState = { history: [], retries: [], results: [1, 1, 1, 1, 1, 1, 1, 1], surprise: [] };
    const bad = planPick(keys, est, struggling);
    const good = planPick(keys, est, cruising);
    expect(bad.focus).toBeLessThan(good.focus);
    expect(bad.expected).toBeGreaterThan(good.expected);
    expect(bad.focus).toBeGreaterThanOrEqual(MIN_FOCUS - 1e-9);
  });

  it('brings a missed item back once, a few questions later', () => {
    let p = newPicker();
    p = notePick(p, '6:3', 0, 12);
    expect(p.retries).toEqual([{ key: '6:3', due: 1 + cooldownFor(12) }]);
    const others = ['6:0', '6:1', '6:2', '6:4', '6:5'];
    const rng = makeRng(5);
    const est = (k: string): ItemEstimate => ({ accuracy: k === '6:3' ? 0.9 : 0.5, slowness: 0 });
    const asked: string[] = [];
    for (let i = 0; i < 6; i++) {
      const k = pickItem(['6:3', ...others, '6:6', '6:7', '6:8', '6:9', '6:10', '6:11'], est, p, rng);
      asked.push(k);
      p = notePick(p, k, k === '6:3' ? 0 : 1, 12);
      if (k === '6:3') break;
    }
    expect(asked.indexOf('6:3')).toBe(cooldownFor(12));
    // Missing the second try does not schedule a third.
    expect(p.retries.find((r) => r.key === '6:3')).toBeUndefined();
  });

  it('recent success starts at the target', () => {
    expect(recentSuccess([])).toBeCloseTo(TARGET_SUCCESS);
    expect(recentSuccess([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])).toBeGreaterThan(0.9);
  });
});

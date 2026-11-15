/**
 * The adaptive question picker. Every candidate (a position, or a note for "find every") has an
 * estimated chance of a right answer and a slowness. The picker blends two distributions:
 *
 *  - "weak":  leans hard on what the learner misses or answers slowly (and on what is untried);
 *  - "easy":  leans on what they know, for confidence.
 *
 * The blend is solved so that the expected success of the next question is about 80 %, nudged by
 * how the round is actually going: when answers keep failing, more known places come up; when the
 * learner is cruising, nearly every question goes to a weak spot. At least a third of the weight
 * always goes to weak spots, so the round converges on them.
 *
 * Two rules keep a round from getting stuck: an item is not asked again within a short cooldown
 * (so one stubborn place can never take over a round), and a missed item comes back once, a few
 * questions later, for a second try.
 */
import type { Rng } from './rng';

/** Success the picker aims for. */
export const TARGET_SUCCESS = 0.8;
/** The smallest share of weight that always goes to weak spots. */
export const MIN_FOCUS = 0.25;
const RECENT = 10;
const PRIOR = 3;

/** What the picker knows about one candidate. */
export interface ItemEstimate {
  /** Chance of a right answer, 0..1. */
  accuracy: number;
  /** 0 fluent … 1 slow. */
  slowness: number;
  /** Answers so far (0 = never asked: worth exploring). */
  seen?: number;
}

/** A missed item waiting for its second try. */
export interface Retry {
  key: string;
  /** Question index from which it may be asked. */
  due: number;
}

/** The picker's memory within one round. */
export interface PickerState {
  /** Items asked, oldest first. */
  history: string[];
  retries: Retry[];
  /** Scores of the answers so far (0..1), oldest first. */
  results: number[];
  /** Score minus the predicted chance, per answer: how far the estimates are off for this learner today. */
  surprise: number[];
}

/** A picker at the start of a round. */
export function newPicker(): PickerState {
  return { history: [], retries: [], results: [], surprise: [] };
}

/** How many questions an item sits out after being asked, for a pool of `n` candidates. */
export function cooldownFor(n: number): number {
  if (n <= 1) return 0;
  return Math.min(3, Math.max(1, Math.floor((n - 1) / 2)));
}

/** Success of the round so far, with a gentle prior at the target so two answers do not swing it. */
export function recentSuccess(results: readonly number[]): number {
  const last = results.slice(-RECENT);
  let sum = 0;
  for (const r of last) sum += r;
  return (sum + TARGET_SUCCESS * PRIOR) / (last.length + PRIOR);
}

/**
 * How much better (positive) or worse the learner is doing than the estimates predict. Early in a
 * learner's life every place is "50 %" and they may well know most of them; on a bad day they may
 * know less than their record says. Shrunk toward zero so a few answers cannot swing it.
 */
export function calibration(surprise: readonly number[]): number {
  const last = surprise.slice(-RECENT);
  let sum = 0;
  for (const x of last) sum += x;
  return sum / (last.length + PRIOR);
}

/** Weakness of an item: 0 = known and quick, 1 = always missed (or very slow). */
export function weaknessOf(e: ItemEstimate): number {
  return Math.max(0, Math.min(1, 1 - e.accuracy + 0.35 * e.slowness));
}

/** The blend and the success it expects, for inspection and tests. */
export interface PickPlan {
  weights: number[];
  /** Share of weight on the weak-spot distribution. */
  focus: number;
  /** Expected chance that the next question is answered right. */
  expected: number;
  /** The success the blend was solved for (target, corrected by the round so far). */
  aim: number;
}

/** Weights over `candidates` (zero for items in their cooldown). The blend is solved over the items that are open. */
export function planPick(candidates: readonly string[], estimate: (key: string) => ItemEstimate, state: PickerState): PickPlan {
  const n = candidates.length;
  const est = candidates.map(estimate);
  const cool = cooldownFor(n);
  const blocked = new Set(cool > 0 ? state.history.slice(-cool) : []);
  let open = candidates.map((c) => !blocked.has(c));
  if (!open.some(Boolean)) open = candidates.map(() => true);
  // Untried items get a push of their own, so a round explores before it drills.
  const weak = est.map((e, i) => (open[i] ? weaknessOf(e) ** 2 + 0.02 + (e.seen === 0 ? 0.3 : 0) : 0));
  const easy = est.map((e, i) => (open[i] ? e.accuracy ** 10 + 0.005 : 0));
  const norm = (xs: number[]) => {
    const t = xs.reduce((a, b) => a + b, 0);
    return xs.map((x) => x / t);
  };
  const pw = norm(weak);
  const pe = norm(easy);
  // Expected success of each distribution, corrected by how the estimates have done this round.
  const bias = calibration(state.surprise ?? []);
  const ew = pw.reduce((a, p, i) => a + p * est[i].accuracy, 0) + bias;
  const ee = pe.reduce((a, p, i) => a + p * est[i].accuracy, 0) + bias;
  // A round that keeps going wrong aims a little higher, one that is all right a little lower.
  const success = recentSuccess(state.results);
  const aim = Math.max(0.65, Math.min(0.95, TARGET_SUCCESS + 0.5 * (TARGET_SUCCESS - success)));
  const focus = Math.abs(ee - ew) < 0.02 ? (ee >= aim ? 1 : MIN_FOCUS) : Math.max(MIN_FOCUS, Math.min(1, (ee - aim) / (ee - ew)));
  const weights = pw.map((p, i) => focus * p + (1 - focus) * pe[i]);
  const expected = Math.max(0, Math.min(1, weights.reduce((a, w, i) => a + w * est[i].accuracy, 0) + bias));
  return { weights, focus, expected, aim };
}

/** Choose the next item. A due retry comes first (when it is not cooling down). */
export function pickItem(candidates: readonly string[], estimate: (key: string) => ItemEstimate, state: PickerState, rng: Rng): string {
  if (candidates.length === 0) throw new RangeError('pickItem: no candidates');
  if (candidates.length === 1) return candidates[0];
  const index = state.history.length;
  const cool = cooldownFor(candidates.length);
  const recent = new Set(state.history.slice(-cool));
  const retry = state.retries.find((r) => r.due <= index && candidates.includes(r.key) && !recent.has(r.key));
  if (retry) return retry.key;
  const plan = planPick(candidates, estimate, state);
  return rng.weighted(candidates, plan.weights);
}

/**
 * Remember what was asked and how it went. A miss (score below 1) schedules one second try, a
 * few questions on, unless the round is going badly; answering that second try clears it either way. `predicted` is the chance the
 * estimates gave the item when it was asked (it calibrates them for this learner).
 */
export function notePick(state: PickerState, key: string, score: number, poolSize: number, predicted?: number): PickerState {
  const index = state.history.length;
  const wasRetry = state.retries.some((r) => r.key === key && r.due <= index);
  let retries = state.retries.filter((r) => r.key !== key);
  const sc0 = Math.max(0, Math.min(1, score));
  // A second try is for a learner who is doing fine; one who is struggling gets easier questions instead.
  const coping = recentSuccess(state.results) >= TARGET_SUCCESS - 0.1;
  if (score < 1 && !wasRetry && poolSize > 1 && coping) retries = [...retries, { key, due: index + cooldownFor(poolSize) + 1 }];
  const sc = sc0;
  const surprise = predicted === undefined || !Number.isFinite(predicted) ? state.surprise ?? [] : [...(state.surprise ?? []), sc - predicted].slice(-RECENT * 2);
  return { history: [...state.history, key], retries, results: [...state.results, sc], surprise };
}

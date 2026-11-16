/**
 * Adaptive practice. Each drill keeps a small confusion record (kept on the progress store's skill
 * `ear:<drill>` as JSON): how often each answer was asked and got right, which answers were heard
 * as which, and the last few results. From it:
 *
 *  - the picker asks more of what the learner gets wrong and of what they mistake it for, and
 *  - a difficulty knob (0..1) moves within the level (closer notes, smaller detuning) to hold
 *    success near 80 %: up when the learner is cruising, down when they struggle.
 */
import type { Rng } from './rng';
import type { DrillDef, OptionInfo } from './types';

/** The record kept per drill. Small, plain JSON. */
export interface EarRecord {
  v: 1;
  /** Per answer id: [times asked, times right]. */
  items: Record<string, [number, number]>;
  /** `answer>chosen`: times `answer` was heard as `chosen`. */
  mix: Record<string, number>;
  /** Last results, oldest first: `1` right, `0` wrong. */
  recent: string;
}

/** Success the difficulty aims for. */
export const TARGET_SUCCESS = 0.8;
const RECENT = 24;
const MAX_MIX = 48;

/** A fresh record. */
export function emptyRecord(): EarRecord {
  return { v: 1, items: {}, mix: {}, recent: '' };
}

/** Read a record from stored JSON; anything malformed gives a fresh one. */
export function readRecord(data: unknown): EarRecord {
  const out = emptyRecord();
  if (!data || typeof data !== 'object') return out;
  const d = data as Partial<EarRecord>;
  if (d.items && typeof d.items === 'object') {
    for (const [k, v] of Object.entries(d.items)) {
      if (Array.isArray(v) && v.length === 2 && v.every((x) => Number.isFinite(x) && x >= 0)) out.items[k] = [Math.round(v[0]), Math.min(Math.round(v[0]), Math.round(v[1]))];
    }
  }
  if (d.mix && typeof d.mix === 'object') {
    for (const [k, v] of Object.entries(d.mix)) if (k.includes('>') && Number.isFinite(v) && (v as number) > 0) out.mix[k] = Math.round(v as number);
  }
  if (typeof d.recent === 'string') out.recent = d.recent.replace(/[^01]/g, '').slice(-RECENT);
  return out;
}

/** Fold one answer into a record (returns a new record). `chosen` equal to `answer` means right. */
export function recordAnswer(record: EarRecord, answer: string, chosen: string): EarRecord {
  const right = answer === chosen;
  const [asked, ok] = record.items[answer] ?? [0, 0];
  // Old evidence fades: past 40 answers an item keeps its ratio but weighs less, so progress shows.
  const scale = asked >= 40 ? 0.75 : 1;
  const items = { ...record.items, [answer]: [Math.round(asked * scale) + 1, Math.round(ok * scale) + (right ? 1 : 0)] as [number, number] };
  let mix = record.mix;
  if (!right) {
    const key = `${answer}>${chosen}`;
    mix = { ...record.mix, [key]: (record.mix[key] ?? 0) + 1 };
    const keys = Object.keys(mix);
    if (keys.length > MAX_MIX) {
      keys.sort((a, b) => mix[a] - mix[b]);
      mix = { ...mix };
      for (const k of keys.slice(0, keys.length - MAX_MIX)) delete mix[k];
    }
  }
  return { v: 1, items, mix, recent: (record.recent + (right ? '1' : '0')).slice(-RECENT) };
}

/** Share right among the recent answers (with a gentle prior at the target, so a few answers do not swing it). */
export function recentSuccess(record: EarRecord, extra = ''): number {
  const s = (record.recent + extra).slice(-12);
  let ok = 0;
  for (const c of s) if (c === '1') ok++;
  const prior = 3;
  return (ok + TARGET_SUCCESS * prior) / (s.length + prior);
}

/**
 * The difficulty knob from recent success: about 0.5 at 80 %, toward 1 when the learner gets
 * everything right, toward 0 when they get under two in three.
 */
export function difficultyFor(success: number): number {
  return Math.max(0, Math.min(1, 0.5 + (success - TARGET_SUCCESS) * 3));
}

/** Estimated chance the learner gets `id` right (Laplace-smoothed). */
export function itemSkill(record: EarRecord, id: string): number {
  const [asked, ok] = record.items[id] ?? [0, 0];
  return (ok + 1) / (asked + 2);
}

/**
 * Weights for picking the next answer from `pool`. Weak items weigh more, and so do the answers
 * they are mistaken for (a confusion is learned by hearing both sides). When the learner is below
 * the target, known items are mixed back in so success climbs again.
 */
export function pickWeights(pool: readonly string[], record: EarRecord, success: number, last: readonly string[] = []): number[] {
  // lean: 1 = all on weak spots (cruising), 0 = mostly consolidation (struggling).
  const lean = Math.max(0.15, Math.min(0.9, 0.55 + (success - TARGET_SUCCESS) * 2.5));
  const weights = pool.map((id) => {
    const p = itemSkill(record, id);
    return 0.2 + lean * (1 - p) * 1.6 + (1 - lean) * p;
  });
  for (const [key, count] of Object.entries(record.mix)) {
    const [a, b] = key.split('>');
    const boost = (0.5 * count) / (1 + count);
    const ia = pool.indexOf(a);
    const ib = pool.indexOf(b);
    if (ia >= 0 && ib >= 0) {
      weights[ia] += boost;
      weights[ib] += boost * 0.6;
    }
  }
  // Variety, without making the next answer guessable. With many choices: not the same answer
  // three times running, less likely twice. With two or three, any shaping of repeats is a free
  // point ("after A, A comes B"), so they stay independent and only a long run is broken.
  const prev = last[last.length - 1];
  let run = 0;
  while (run < last.length && last[last.length - 1 - run] === prev) run++;
  return weights.map((w, i) => {
    if (pool[i] !== prev) return w;
    if (pool.length <= 3) return run >= MAX_RUN_SMALL_POOL ? 0 : w;
    return run >= 2 ? 0 : w * 0.45;
  });
}

/**
 * Longest run of one answer in a pool of two or three. With two choices four in a row comes up
 * about once in eight rounds by chance; a fifth would feel stuck.
 */
export const MAX_RUN_SMALL_POOL = 4;

/**
 * Choose the answers of a round in advance would ignore what happens during it, so the picker is
 * called per question with everything known so far.
 */
export function pickAnswer(rng: Rng, pool: readonly string[], record: EarRecord, success: number, last: readonly string[] = []): string {
  const weights = pickWeights(pool, record, success, last);
  return rng.weighted(pool, weights);
}

/** One confusion in plain words. */
export interface WeakSpot {
  answer: string;
  chosen: string;
  count: number;
  /** Share of the times `answer` was asked that it was heard as `chosen`. */
  rate: number;
  sentence: string;
}

/**
 * The learner's weak spots in a drill, most telling first: confusions that happened at least twice
 * (or once when `min` is 1), limited to answers in `pool` when given.
 */
export function weakSpots(drill: DrillDef, record: EarRecord, opts: { pool?: readonly string[]; min?: number; limit?: number } = {}): WeakSpot[] {
  const min = opts.min ?? 2;
  const out: WeakSpot[] = [];
  for (const [key, count] of Object.entries(record.mix)) {
    const [answer, chosen] = key.split('>');
    if (count < min) continue;
    if (opts.pool && !(opts.pool.includes(answer) && opts.pool.includes(chosen))) continue;
    const asked = record.items[answer]?.[0] ?? count;
    const a: OptionInfo = drill.info(answer);
    const c: OptionInfo = drill.info(chosen);
    out.push({ answer, chosen, count, rate: count / Math.max(count, asked), sentence: drill.mixSentence(a, c) });
  }
  out.sort((x, y) => y.count * (0.5 + y.rate) - x.count * (0.5 + x.rate));
  return out.slice(0, opts.limit ?? 3);
}

/** Answers the learner hears surely (asked at least five times, nine in ten right), best first. */
export function strengths(record: EarRecord, pool: readonly string[]): string[] {
  return pool
    .filter((id) => (record.items[id]?.[0] ?? 0) >= 5 && itemSkill(record, id) >= 0.85)
    .sort((a, b) => itemSkill(record, b) - itemSkill(record, a));
}

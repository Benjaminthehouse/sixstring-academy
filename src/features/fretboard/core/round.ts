/**
 * A round: a short run of questions (or a timed sprint) over one scope. Pure: the screen holds a
 * `RoundState`, asks `nextQuestion`, and hands each finished question to `finishQuestion`, which
 * folds it into the stats, the picker and the results. `summarize` turns the results into the
 * numbers the summary shows and `recordActivity` stores.
 */
import { newPicker, notePick, pickItem, type PickerState } from './picker';
import { buildQuestion, candidatesFor, estimator, type Ask, type AskOptions } from './questions';
import { settle, type Attempt } from './grade';
import { makeRng } from './rng';
import type { NeckStats } from './stats';
import type { NeckContext, Pos, Question, QuestionResult, Scope } from './types';

/** What a round is. */
export interface RoundPlan {
  /** Skill id in the progress store (`fretboard:string-6-naturals`, `fretboard:name-the-note`). */
  skillId: string;
  title: string;
  asks: Ask[];
  scope: Scope;
  /** Questions in the round (null for a timed sprint). */
  length: number | null;
  /** Seconds for a timed sprint (null otherwise). */
  seconds: number | null;
  /** Accuracy that passes a step of the method. */
  passAt: number;
  options?: AskOptions;
}

/** A round in progress. */
export interface RoundState {
  plan: RoundPlan;
  ctx: NeckContext;
  /** The learner's stats, updated answer by answer. */
  stats: NeckStats;
  picker: PickerState;
  results: QuestionResult[];
  seed: number;
}

/** Start a round. */
export function startRound(plan: RoundPlan, ctx: NeckContext, stats: NeckStats, seed: number): RoundState {
  return { plan, ctx, stats, picker: newPicker(), results: [], seed };
}

/** True when a counted round has asked all its questions. */
export function roundDone(state: RoundState): boolean {
  return state.plan.length !== null && state.results.length >= state.plan.length;
}

/** The asks that have something to ask in this scope (an octave ask needs octave shapes). */
export function usableAsks(plan: RoundPlan, ctx: NeckContext): Ask[] {
  return plan.asks.filter((a) => candidatesFor(a.kind, plan.scope, ctx, plan.options).length > 0);
}

/** The next question, or null when the scope has nothing to ask. Deterministic for a seed and history. */
export function nextQuestion(state: RoundState): Question | null {
  const index = state.results.length;
  const rng = makeRng((state.seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);
  const asks = usableAsks(state.plan, state.ctx);
  if (asks.length === 0) return null;
  // Never three questions of the same kind in a row when the round mixes kinds.
  const last = state.results.slice(-2).map((r) => r.kind);
  const varied = asks.length > 1 && last.length === 2 && last[0] === last[1] ? asks.filter((a) => a.kind !== last[0]) : asks;
  const pool = varied.length ? varied : asks;
  const ask = rng.weighted(pool, pool.map((a) => a.weight));
  const candidates = candidatesFor(ask.kind, state.plan.scope, state.ctx, state.plan.options);
  const item = pickItem(candidates, estimator(state.stats, state.plan.scope, state.ctx), state.picker, rng);
  return buildQuestion(ask, item, index, state.plan.scope, state.ctx, rng, state.plan.options);
}

/** Fold a finished question into the round. */
export function finishQuestion(state: RoundState, q: Question, attempt: Attempt): { state: RoundState; result: QuestionResult } {
  const predicted = estimator(state.stats, state.plan.scope, state.ctx)(q.item).accuracy;
  const { result, stats } = settle(q, attempt, state.stats, state.ctx);
  const pool = candidatesFor(q.kind, state.plan.scope, state.ctx, state.plan.options).length;
  return {
    state: { ...state, stats, picker: notePick(state.picker, q.item, result.score, pool, predicted), results: [...state.results, result] },
    result,
  };
}

/** The numbers of a finished round. */
export interface RoundSummary {
  asked: number;
  /** Questions right at the first try. */
  right: number;
  /** Mean score, 0..1. */
  accuracy: number;
  /** Average time of the right answers, ms (null when none were timed). */
  avgMs: number | null;
  fastestMs: number | null;
  /** Longest run of right answers. */
  bestRun: number;
  perfect: boolean;
  passed: boolean;
  /** Stars: 60 % one, 80 % two, 95 % three (as the progress store counts them). */
  stars: number;
  /** Places missed in the round, most-missed first (no duplicates). */
  missed: Pos[];
  /** Places answered right in the round. */
  hits: Pos[];
}

/** What the progress store keeps about a step or drill (the fields a "best" needs). */
export interface SkillBest {
  completions: number;
  bestAccuracy: number;
  bestScore: number;
}

/**
 * The best result worth showing for a step or drill, or null. Only finished rounds set a best:
 * a round left part-way is kept as an attempt but would read as "Best 0%".
 */
export function bestResult(skill: SkillBest | undefined | null): { percent: number; score: number } | null {
  return skill && skill.completions > 0 ? { percent: Math.round(skill.bestAccuracy * 100), score: skill.bestScore } : null;
}

/** Summarise results against a plan. */
export function summarize(results: readonly QuestionResult[], passAt: number): RoundSummary {
  const asked = results.length;
  const right = results.filter((r) => r.right).length;
  const accuracy = asked ? results.reduce((a, r) => a + r.score, 0) / asked : 0;
  const times = results.map((r) => r.ms).filter((m): m is number => m !== null && m > 0);
  let run = 0;
  let bestRun = 0;
  for (const r of results) {
    run = r.right ? run + 1 : 0;
    bestRun = Math.max(bestRun, run);
  }
  const missCount = new Map<string, { pos: Pos; n: number }>();
  for (const r of results) {
    for (const m of r.missed) {
      const k = `${m.string}:${m.fret}`;
      const e = missCount.get(k);
      if (e) e.n++;
      else missCount.set(k, { pos: m, n: 1 });
    }
  }
  const missed = [...missCount.values()].sort((a, b) => b.n - a.n).map((e) => e.pos);
  const missedKeys = new Set(missCount.keys());
  const hitMap = new Map<string, Pos>();
  for (const r of results) if (r.score > 0) for (const p of r.positions) if (!missedKeys.has(`${p.string}:${p.fret}`)) hitMap.set(`${p.string}:${p.fret}`, p);
  return {
    asked,
    right,
    accuracy,
    avgMs: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
    fastestMs: times.length ? Math.min(...times) : null,
    bestRun,
    perfect: asked > 0 && right === asked,
    passed: asked > 0 && accuracy >= passAt,
    stars: accuracy >= 0.95 ? 3 : accuracy >= 0.8 ? 2 : accuracy >= 0.6 ? 1 : 0,
    missed,
    hits: [...hitMap.values()],
  };
}

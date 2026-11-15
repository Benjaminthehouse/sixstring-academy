/**
 * Rhythm: note values of the events and the musical consistency check.
 *
 * Every measure should add up to the time signature. When one does not, the cheapest set of
 * alternative readings that makes it add up is taken instead (a missed augmentation dot, one
 * beam / flag more or fewer, an open head read as filled, a triplet group), the changed events
 * are marked as uncertain, and a measure that still cannot be explained is reported.
 */
import { type DurationValue, DURATION_TICKS, durationTicks } from '../types';

/** A duration reading with the price of choosing it over the first reading. */
export interface DurationOption {
  value: DurationValue;
  dots: 0 | 1 | 2;
  tuplet?: { actual: number; normal: number };
  /** 0 for the primary reading; larger = less likely. */
  cost: number;
}

/** One event as the rhythm solver sees it. */
export interface RhythmEvent {
  /** Options, primary first. */
  options: DurationOption[];
  /** Index into `options` of the reading chosen. */
  chosen: number;
  /** Beam group id (events joined by a beam share it), or -1. */
  group: number;
  /** May be removed at this cost when it does not fit (a doubtful detection). Infinity = never. */
  dropCost: number;
  dropped: boolean;
  /** A whole rest alone in a measure fills it, whatever the metre. */
  measureRest?: boolean;
}

/** Outcome of {@link solveMeasure}. */
export interface MeasureSolution {
  /** The measure adds up after the solver ran. */
  consistent: boolean;
  /** Events whose reading was changed. */
  changed: number;
  /** Ticks before and after. */
  before: number;
  after: number;
  cost: number;
}

/** Ticks of an option. */
export function optionTicks(o: DurationOption): number {
  return durationTicks(o.value, o.dots, o.tuplet);
}

/** Ticks of a measure in a time signature. */
export function measureTicks(beats: number, beatValue: number): number {
  return Math.round((beats * 3840) / beatValue);
}

const VALUES: DurationValue[] = ['whole', 'half', 'quarter', 'eighth', '16th', '32nd'];

/** The value one step shorter (+1) or longer (-1), or null at the ends. */
export function stepValue(v: DurationValue, by: number): DurationValue | null {
  const i = VALUES.indexOf(v) + by;
  return i >= 0 && i < VALUES.length ? VALUES[i] : null;
}

/**
 * Choose readings so that the measure lasts `target` ticks, at the lowest total cost.
 * `maxCost` bounds how far the solver may stray from the primary readings.
 */
export function solveMeasure(events: RhythmEvent[], target: number, maxCost = 3.2): MeasureSolution {
  const live = events.filter((e) => !e.dropped);
  const sumOf = (): number => live.reduce((a, e) => a + (e.dropped ? 0 : optionTicks(e.options[e.chosen])), 0);
  const before = sumOf();
  if (live.length === 1 && live[0].measureRest) return { consistent: true, changed: 0, before, after: target, cost: 0 };
  if (before === target) return { consistent: true, changed: 0, before, after: before, cost: 0 };
  // Dynamic programme over the running sum: cheapest way to reach each total.
  interface State { cost: number; picks: number[] }
  let states = new Map<number, State>([[0, { cost: 0, picks: [] }]]);
  for (const e of live) {
    const next = new Map<number, State>();
    const push = (sum: number, cost: number, picks: number[], pick: number): void => {
      if (sum > target || cost > maxCost) return;
      const cur = next.get(sum);
      if (!cur || cost < cur.cost) next.set(sum, { cost, picks: picks.concat(pick) });
    };
    for (const [sum, st] of states) {
      e.options.forEach((o, k) => push(sum + optionTicks(o), st.cost + o.cost, st.picks, k));
      if (Number.isFinite(e.dropCost)) push(sum, st.cost + e.dropCost, st.picks, -1);
    }
    states = next;
    if (!states.size) break;
  }
  const hit = states.get(target);
  if (!hit) return { consistent: false, changed: 0, before, after: before, cost: Infinity };
  let changed = 0;
  live.forEach((e, i) => {
    const k = hit.picks[i];
    if (k < 0) {
      e.dropped = true;
      changed++;
    } else if (k !== e.chosen) {
      e.chosen = k;
      changed++;
    }
  });
  return { consistent: true, changed, before, after: target, cost: hit.cost };
}

/**
 * Guess the length of a measure when no time signature is known: the total that most measures of
 * the staff share, provided it is a plausible bar length. Returns 0 when there is no agreement.
 */
export function inferMeasureTicks(sums: number[]): number {
  const count = new Map<number, number>();
  for (const s of sums) if (s > 0) count.set(s, (count.get(s) ?? 0) + 1);
  let best = 0;
  let bestN = 0;
  for (const [s, n] of count) {
    if (n > bestN || (n === bestN && s > best)) {
      best = s;
      bestN = n;
    }
  }
  // Bar lengths are whole numbers of eighth notes (2/4, 3/4, 4/4, 3/8, 6/8, 9/8, 12/8 ...).
  if (bestN < 2 || bestN * 2 < sums.filter((s) => s > 0).length || best % DURATION_TICKS.eighth !== 0) return 0;
  return best;
}

/** The time signatures a bar length usually belongs to, most common first. */
export function metreOfTicks(ticks: number): { beats: number; beatValue: number } | null {
  const table: [number, number, number][] = [[3840, 4, 4], [2880, 3, 4], [1920, 2, 4], [1440, 3, 8], [2880 * 2, 6, 4], [4320, 9, 8], [5760, 12, 8]];
  for (const [t, b, v] of table) if (t === ticks) return { beats: b, beatValue: v };
  return null;
}

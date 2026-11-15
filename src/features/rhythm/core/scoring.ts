/**
 * Timing judgement: which expected note a tap belongs to, how close it was, and what a round adds
 * up to. Everything here works on plain numbers (seconds on one clock), so it is tested without
 * audio and behaves the same for taps, key presses and microphone onsets.
 *
 * A tap claims the nearest expected note that has not been claimed yet, as long as it falls inside
 * that note's window. The window shrinks with the distance to the neighbouring notes, so fast
 * sixteenths are never ambiguous, and it is capped so that a tap in the middle of a rest counts as
 * an extra tap rather than a very late note.
 */
import type { CountPart } from './counting';

/** Outcome for one expected note, or `extra` for a tap that matched nothing. */
export type Verdict = 'perfect' | 'good' | 'ok' | 'miss' | 'extra';

/** Window sizes. The caps are in milliseconds; `gapShare` is the part of the gap to a neighbour a tap may claim. */
export interface JudgeWindows {
  perfectMs: number;
  goodMs: number;
  okMs: number;
  gapShare: number;
}

/** Windows for taps on the screen or keyboard. */
export const TAP_WINDOWS: JudgeWindows = { perfectMs: 35, goodMs: 75, okMs: 130, gapShare: 0.45 };
/** Wider windows for microphone onsets: a strum is spread over a few milliseconds and the detector adds a little jitter. */
export const MIC_WINDOWS: JudgeWindows = { perfectMs: 45, goodMs: 90, okMs: 140, gapShare: 0.45 };

/** Points per verdict (1 = full marks). */
export const VERDICT_SCORE: Record<Verdict, number> = { perfect: 1, good: 0.75, ok: 0.45, miss: 0, extra: 0 };

/** What an extra tap costs, in notes. */
export const EXTRA_PENALTY = 0.25;

/** An expected note: an id and the moment it should sound. */
export interface JudgeTarget {
  id: number;
  time: number;
}

/** The result of one tap, or of one expected note going by untouched. */
export interface Judgement {
  /** The expected note this belongs to; null for an extra tap. */
  targetId: number | null;
  verdict: Verdict;
  /** Signed distance in milliseconds, negative = early. 0 for a miss or an extra tap. */
  errorMs: number;
  /** When it happened: the (corrected) tap time, or the note's own time for a miss. */
  time: number;
  /** Stroke direction given with the tap, when the input knows it. */
  dir?: 'D' | 'U';
}

interface Slot extends JudgeTarget {
  done: boolean;
}

/** Judges taps one at a time against a list of expected notes. */
export class LiveJudge {
  private readonly slots: Slot[];
  private readonly index = new Map<number, number>();
  private cursor = 0;
  /** Every judgement so far, in the order it was made. */
  readonly judgements: Judgement[] = [];

  constructor(targets: readonly JudgeTarget[], readonly windows: JudgeWindows = TAP_WINDOWS) {
    this.slots = targets.map((t) => ({ id: t.id, time: t.time, done: false })).sort((a, b) => a.time - b.time);
    this.slots.forEach((s, i) => this.index.set(s.id, i));
  }

  /** Correct a note's time once the audio scheduler has fixed it. The order of notes must not change. */
  setTime(id: number, time: number): void {
    const i = this.index.get(id);
    if (i !== undefined && Number.isFinite(time)) this.slots[i].time = time;
  }

  /** The time currently held for a note. */
  timeOf(id: number): number | null {
    const i = this.index.get(id);
    return i === undefined ? null : this.slots[i].time;
  }

  /** Half-width in seconds of the window around note `i`. */
  private windowAt(i: number): number {
    const t = this.slots[i].time;
    const prev = i > 0 ? t - this.slots[i - 1].time : Infinity;
    const next = i + 1 < this.slots.length ? this.slots[i + 1].time - t : Infinity;
    const gap = Math.min(prev, next);
    return Math.max(0.04, Math.min(this.windows.okMs / 1000, gap * this.windows.gapShare));
  }

  /** The window of a note in milliseconds: perfect, good and the outer edge. */
  windowsOf(id: number): { perfectMs: number; goodMs: number; okMs: number } | null {
    const i = this.index.get(id);
    if (i === undefined) return null;
    return this.thresholds(this.windowAt(i) * 1000);
  }

  private thresholds(okMs: number): { perfectMs: number; goodMs: number; okMs: number } {
    return { perfectMs: Math.min(this.windows.perfectMs, okMs * 0.4), goodMs: Math.min(this.windows.goodMs, okMs * 0.75), okMs };
  }

  /**
   * Judge a tap at `time` (already corrected for latency). With `countExtra` false, a tap that
   * matches nothing is reported but not kept: the caller is going to ignore it (a tap during the
   * count-in costs nothing).
   */
  tap(time: number, dir?: 'D' | 'U', countExtra = true): Judgement {
    const reach = this.windows.okMs / 1000;
    let best = -1;
    let bestDistance = Infinity;
    for (let i = this.cursor; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.time - time > reach) break;
      if (s.done) continue;
      const d = Math.abs(time - s.time);
      if (d <= this.windowAt(i) + 1e-9 && d < bestDistance) {
        best = i;
        bestDistance = d;
      }
    }
    let judgement: Judgement;
    if (best < 0) {
      judgement = { targetId: null, verdict: 'extra', errorMs: 0, time, dir };
      if (!countExtra) return judgement;
    } else {
      const s = this.slots[best];
      s.done = true;
      const errorMs = (time - s.time) * 1000;
      const w = this.thresholds(this.windowAt(best) * 1000);
      const a = Math.abs(errorMs);
      const verdict: Verdict = a <= w.perfectMs ? 'perfect' : a <= w.goodMs ? 'good' : 'ok';
      judgement = { targetId: s.id, verdict, errorMs, time, dir };
    }
    this.judgements.push(judgement);
    return judgement;
  }

  /** Declare every note whose window closed before `now` a miss. Returns the new misses. */
  advance(now: number): Judgement[] {
    const out: Judgement[] = [];
    while (this.cursor < this.slots.length) {
      const s = this.slots[this.cursor];
      if (!s.done) {
        if (s.time + this.windowAt(this.cursor) >= now) break;
        s.done = true;
        const j: Judgement = { targetId: s.id, verdict: 'miss', errorMs: 0, time: s.time };
        this.judgements.push(j);
        out.push(j);
      }
      this.cursor++;
    }
    return out;
  }

  /** The round is over: everything still open is a miss. */
  finish(): Judgement[] {
    return this.advance(Infinity);
  }

  /** Number of expected notes. */
  get size(): number {
    return this.slots.length;
  }
}

/** What the statistics need to know about an expected note. */
export interface TargetMeta {
  id: number;
  /** Part of the beat it falls on. */
  part: CountPart;
  /** Expected stroke direction, where the activity has one. */
  dir?: 'D' | 'U';
  /** The click was silent here (inner clock). */
  silent?: boolean;
}

/** Timing of a group of notes. */
export interface GroupStats {
  /** Notes in the group. */
  n: number;
  hits: number;
  misses: number;
  /** Mean signed error of the hits in ms (0 without hits). */
  meanMs: number;
  /** Standard deviation of the hits in ms. */
  sdMs: number;
}

/** A finished round in numbers. */
export interface RoundStats {
  total: number;
  perfect: number;
  good: number;
  ok: number;
  miss: number;
  extra: number;
  hits: number;
  /** Weighted score, 0 to 1. */
  accuracy: number;
  stars: 0 | 1 | 2 | 3;
  meanMs: number;
  sdMs: number;
  medianMs: number;
  /** Signed error of every hit, in the order the notes were written. */
  errors: number[];
  onBeat: GroupStats;
  offBeat: GroupStats;
  byPart: Partial<Record<CountPart, GroupStats>>;
  /** Notes played while the click was silent. */
  silent: GroupStats;
  /** Longest run of notes hit in a row. */
  bestRun: number;
  /** Mean error of the last third minus the first third: negative = speeding up. */
  driftMs: number;
  /** Hits made with the wrong stroke direction. */
  wrongDirection: number;
}

function mean(xs: readonly number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function sd(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
}

/** Middle value of a list (0 for an empty one). */
export function median(xs: readonly number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function group(errors: readonly number[], n: number, misses: number): GroupStats {
  return { n, hits: errors.length, misses, meanMs: mean(errors), sdMs: sd(errors) };
}

/** Stars for a score: one from 55 %, two from 78 %, three from 92 %. */
export function starsFor(accuracy: number): 0 | 1 | 2 | 3 {
  return accuracy >= 0.92 ? 3 : accuracy >= 0.78 ? 2 : accuracy >= 0.55 ? 1 : 0;
}

/**
 * Add a round up. `metas` lists the expected notes in written order; `judgements` is what the judge
 * produced. Notes without a judgement count as misses, so a round that was cut short is still scored.
 */
export function summarise(metas: readonly TargetMeta[], judgements: readonly Judgement[], opts: { extraPenalty?: number } = {}): RoundStats {
  const byTarget = new Map<number, Judgement>();
  let extra = 0;
  for (const j of judgements) {
    if (j.targetId === null) extra++;
    else byTarget.set(j.targetId, j);
  }
  const counts = { perfect: 0, good: 0, ok: 0, miss: 0 };
  const errors: number[] = [];
  const parts = new Map<CountPart, { e: number[]; n: number; miss: number }>();
  const on = { e: [] as number[], n: 0, miss: 0 };
  const off = { e: [] as number[], n: 0, miss: 0 };
  const silent = { e: [] as number[], n: 0, miss: 0 };
  let points = 0;
  let run = 0;
  let bestRun = 0;
  let wrongDirection = 0;
  for (const meta of metas) {
    const j = byTarget.get(meta.id);
    const verdict = j && j.verdict !== 'extra' ? j.verdict : 'miss';
    const hit = verdict !== 'miss';
    counts[verdict as keyof typeof counts]++;
    points += VERDICT_SCORE[verdict];
    let p = parts.get(meta.part);
    if (!p) parts.set(meta.part, (p = { e: [], n: 0, miss: 0 }));
    const side = meta.part === 'beat' ? on : off;
    for (const g of meta.silent ? [p, side, silent] : [p, side]) {
      g.n++;
      if (hit) g.e.push(j!.errorMs);
      else g.miss++;
    }
    if (hit) {
      errors.push(j!.errorMs);
      run++;
      if (run > bestRun) bestRun = run;
      if (meta.dir && j!.dir && meta.dir !== j!.dir) wrongDirection++;
    } else {
      run = 0;
    }
  }
  const total = metas.length;
  const penalty = (opts.extraPenalty ?? EXTRA_PENALTY) * extra;
  const accuracy = total ? Math.min(1, Math.max(0, (points - penalty) / total)) : 0;
  const third = Math.floor(errors.length / 3);
  const driftMs = third >= 2 ? mean(errors.slice(errors.length - third)) - mean(errors.slice(0, third)) : 0;
  const byPart: Partial<Record<CountPart, GroupStats>> = {};
  for (const [part, p] of parts) byPart[part] = group(p.e, p.n, p.miss);
  return {
    total,
    ...counts,
    extra,
    hits: errors.length,
    accuracy,
    stars: starsFor(accuracy),
    meanMs: mean(errors),
    sdMs: sd(errors),
    medianMs: median(errors),
    errors,
    onBeat: group(on.e, on.n, on.miss),
    offBeat: group(off.e, off.n, off.miss),
    byPart,
    silent: group(silent.e, silent.n, silent.miss),
    bestRun,
    driftMs,
    wrongDirection,
  };
}

/**
 * Score a whole list of taps against a list of expected times in one go (tests, the browser check).
 * `offsetMs` is the latency to take off every tap first, exactly as a live round does.
 */
export function scoreTaps(
  targetTimes: readonly number[],
  tapTimes: readonly number[],
  opts: { offsetMs?: number; windows?: JudgeWindows; parts?: readonly CountPart[]; extraPenalty?: number } = {},
): { judgements: Judgement[]; stats: RoundStats } {
  const judge = new LiveJudge(targetTimes.map((time, id) => ({ id, time })), opts.windows ?? TAP_WINDOWS);
  const offset = (opts.offsetMs ?? 0) / 1000;
  for (const tap of [...tapTimes].sort((a, b) => a - b)) {
    const t = tap - offset;
    // Close what is safely behind this tap first, as the live round does while the clock runs.
    judge.advance(t - (judge.windows.okMs / 1000) * 2);
    judge.tap(t);
  }
  judge.finish();
  const metas: TargetMeta[] = targetTimes.map((_, id) => ({ id, part: opts.parts?.[id] ?? 'beat' }));
  return { judgements: judge.judgements, stats: summarise(metas, judge.judgements, { extraPenalty: opts.extraPenalty }) };
}

/** The friendly word for a judgement. */
export function verdictLabel(j: Pick<Judgement, 'verdict' | 'errorMs'>): string {
  switch (j.verdict) {
    case 'perfect':
      return 'On it';
    case 'good':
      return j.errorMs < 0 ? 'A touch early' : 'A touch late';
    case 'ok':
      return j.errorMs < 0 ? 'Early' : 'Late';
    case 'miss':
      return 'Missed';
    default:
      return 'Extra tap';
  }
}

/** Signed milliseconds as text: `12 ms early`, `8 ms late`, `on the beat`. */
export function formatMs(ms: number): string {
  const r = Math.round(ms);
  if (r === 0) return 'on the beat';
  return `${Math.abs(r)} ms ${r < 0 ? 'early' : 'late'}`;
}

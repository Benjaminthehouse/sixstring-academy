/**
 * A scored run in flow mode or tap-along mode, over one or more passes of a loop. The song core's
 * `FlowMode` judges one pass; this keeps one per pass so a loop can speed up between passes, and
 * routes each heard note to the right pass even across the loop's wrap (a note played a little
 * early for the first note of the next pass, or a little late for the last one of this pass).
 *
 * Time: everything here is on the audio clock, compensated for latency by the caller (the moment
 * the learner meant, in the scheduling domain of `SongPlayer`). Within a pass, practice seconds
 * run at the speed of real seconds, so a pass is anchored once (audio time, practice time) and
 * re-anchored when the learner changes the tempo. Pure: unit-tested with synthetic notes.
 */
import { FlowMode, flowTargets, matchNote, weakBarRanges, type BarHeat, type FlowGrade, type FlowJudgement, type FlowResult, type FlowWindows, type PracticeTarget } from '@/core/song';
import type { PassCounts } from './trainer';

/** Options for a run. */
export interface FlowRunOptions {
  windows?: Partial<FlowWindows>;
  toleranceCents?: number;
  octaveLenient?: boolean;
  /** How far behind "now" `advance` judges, so a note-on still being detected is not called missed (s, default 0.12). */
  lag?: number;
}

/** A judgement with where it came from, for the score's colours, the live feedback and the debug log. */
export interface RunJudgement {
  grade: FlowGrade;
  /** Index into the run's targets, or -1 for a wrong note near nothing in particular. */
  target: number;
  bar: number;
  /** Heard minus expected (s), when it was heard. */
  offset?: number;
  pass: number;
  combo: number;
}

interface Pass {
  index: number;
  /** Audio time the pass starts (its first tick sounds). */
  startAudio: number;
  /** Mapping audio time -> practice time: time = anchor.time + (t - anchor.audio). */
  anchor: { audio: number; time: number };
  percent: number;
  flow: FlowMode;
  /** Practice time at the end of the pass, once the next one has started. */
  endTime: number | null;
  closed: boolean;
  judged: Set<number>;
}

const HIT: ReadonlySet<FlowGrade> = new Set(['perfect', 'good', 'early', 'late']);
const ACC: Record<FlowGrade, number> = { perfect: 1, good: 0.8, early: 0.5, late: 0.5, missed: 0, wrong: 0 };

/** Several passes of flow mode as one run. */
export class FlowRun {
  private readonly passes: Pass[] = [];
  private readonly o: Required<Omit<FlowRunOptions, 'windows'>> & { windows?: Partial<FlowWindows> };
  private readonly ok: number;
  private comboNow = 0;
  private maxComboNow = 0;
  private readonly logList: RunJudgement[] = [];
  private finished: FlowResult | null = null;

  /**
   * @param targets what the learner plays in one pass (the song core's `practiceTargets` over the range)
   * @param start the first pass: audio time its first tick sounds, written-tempo seconds of that tick, practice tempo
   */
  constructor(readonly targets: readonly PracticeTarget[], start: { audio: number; writtenSec: number; percent: number }, opts: FlowRunOptions = {}) {
    this.o = { toleranceCents: 50, octaveLenient: false, lag: 0.12, ...opts };
    this.ok = opts.windows?.ok ?? 0.17;
    this.addPass(start.audio, start.writtenSec, start.percent);
  }

  private addPass(audio: number, writtenSec: number, percent: number): Pass {
    const scale = Math.max(0.05, percent / 100);
    const flow = new FlowMode(flowTargets(this.targets, { tempoPercent: percent }), {
      ...(this.o.windows ? { windows: this.o.windows } : {}),
      toleranceCents: this.o.toleranceCents,
      octaveLenient: this.o.octaveLenient,
    });
    const pass: Pass = { index: this.passes.length, startAudio: audio, anchor: { audio, time: writtenSec / scale }, percent, flow, endTime: null, closed: false, judged: new Set() };
    this.passes.push(pass);
    return pass;
  }

  private timeIn(p: Pass, audio: number): number {
    return p.anchor.time + (audio - p.anchor.audio);
  }

  /** Passes so far (1 without a loop). */
  get passCount(): number {
    return this.passes.length;
  }

  /** The running combo (across passes) and the best one. */
  get combo(): number {
    return this.comboNow;
  }

  get maxCombo(): number {
    return this.maxComboNow;
  }

  /** Every judgement so far, in order. */
  get log(): readonly RunJudgement[] {
    return this.logList;
  }

  /** The current pass's practice tempo. */
  get percent(): number {
    return this.passes[this.passes.length - 1].percent;
  }

  private take(p: Pass, js: Array<FlowJudgement | null>): RunJudgement[] {
    const out: RunJudgement[] = [];
    for (const j of js) {
      if (!j) continue;
      if (HIT.has(j.grade)) {
        this.comboNow++;
        this.maxComboNow = Math.max(this.maxComboNow, this.comboNow);
      } else this.comboNow = 0;
      if (j.target) p.judged.add(j.target.index);
      const r: RunJudgement = { grade: j.grade, target: j.target ? j.target.index : -1, bar: j.bar, pass: p.index, combo: this.comboNow, ...(j.offset !== undefined ? { offset: j.offset } : {}) };
      this.logList.push(r);
      out.push(r);
    }
    return out;
  }

  /**
   * The loop wrapped: a new pass starts at `audio` (the loop start's first tick), `writtenSec` being
   * that tick's written-tempo seconds, at `percent`. Returns what the pass that ended scored so far
   * (its last notes may still be judged afterwards: late ones keep arriving for a moment).
   */
  newPass(audio: number, writtenSec: number, percent: number): PassCounts {
    const prev = this.passes[this.passes.length - 1];
    prev.endTime = this.timeIn(prev, audio);
    const counts = { ...prev.flow.result().counts };
    this.addPass(audio, writtenSec, percent);
    return counts;
  }

  /** The learner changed the tempo at `audio`, where the music is at `writtenSec` (written-tempo seconds). */
  setTempo(percent: number, audio: number, writtenSec: number): void {
    const p = this.passes[this.passes.length - 1];
    p.flow.setTempoPercent(percent);
    p.percent = percent;
    p.anchor = { audio, time: writtenSec / Math.max(0.05, percent / 100) };
  }

  /** Is there an unjudged target in pass `p` near `time` that this note could be? */
  private fits(p: Pass, time: number, midi: number, freq?: number, cents?: number): number {
    let best = Infinity;
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    for (const t of p.flow.targets) {
      if (p.judged.has(t.index)) continue;
      const d = Math.abs(time - t.time);
      if (d > this.ok) continue;
      const pitch = t.chord ? t.pcs.includes(pc) : t.midis.some((m) => matchNote(m, { time, midi, freq, cents }, this.o.toleranceCents, this.o.octaveLenient) !== null);
      if (pitch && d < best) best = d;
    }
    return best;
  }

  /** The pass a note at `audio` belongs to: the one it fits, else the one playing then. */
  private route(audio: number, midi: number, freq?: number, cents?: number): Pass {
    let k = 0;
    for (let i = 0; i < this.passes.length; i++) if (this.passes[i].startAudio <= audio) k = i;
    const here = this.passes[k];
    const candidates: Pass[] = [here];
    const prev = this.passes[k - 1];
    if (prev && !prev.closed && audio - here.startAudio <= this.ok) candidates.push(prev);
    const next = this.passes[k + 1];
    if (next && next.startAudio - audio <= this.ok) candidates.push(next);
    let chosen = here;
    let best = Infinity;
    for (const p of candidates) {
      const d = this.fits(p, this.timeIn(p, audio), midi, freq, cents);
      if (d < best) {
        best = d;
        chosen = p;
      }
    }
    return chosen;
  }

  /** A note was heard at audio time `audio` (latency already taken off). */
  hear(e: { audio: number; midi: number; freq?: number; cents?: number }): RunJudgement | null {
    if (this.finished) return null;
    const p = this.route(e.audio, e.midi, e.freq, e.cents);
    const j = p.flow.hear({ time: this.timeIn(p, e.audio), midi: e.midi, ...(e.freq !== undefined ? { freq: e.freq } : {}), ...(e.cents !== undefined ? { cents: e.cents } : {}) });
    return this.take(p, [j])[0] ?? null;
  }

  /** A chroma frame was heard (chord targets). */
  hearChroma(e: { audio: number; chroma: readonly number[]; bass?: number }): RunJudgement | null {
    if (this.finished) return null;
    let k = 0;
    for (let i = 0; i < this.passes.length; i++) if (this.passes[i].startAudio <= e.audio) k = i;
    const p = this.passes[k];
    const j = p.flow.hearChroma({ time: this.timeIn(p, e.audio), chroma: e.chroma, ...(e.bass !== undefined ? { bass: e.bass } : {}) });
    return this.take(p, [j])[0] ?? null;
  }

  /**
   * A tap in tap-along mode: it plays the nearest unjudged target within the timing window (its
   * pitches are taken as right; only the timing is judged). Returns null for a tap near nothing.
   */
  tap(audio: number): RunJudgement | null {
    if (this.finished) return null;
    let found: { p: Pass; index: number; d: number } | null = null;
    for (const p of this.passes) {
      if (p.closed) continue;
      const time = this.timeIn(p, audio);
      for (const t of p.flow.targets) {
        if (p.judged.has(t.index)) continue;
        const d = Math.abs(time - t.time);
        if (d <= this.ok && (!found || d < found.d)) found = { p, index: t.index, d };
      }
    }
    if (!found) return null;
    const t = found.p.flow.targets[found.index];
    const time = this.timeIn(found.p, audio);
    let last: RunJudgement | null = null;
    // A chord is judged once enough of its tones are in; feeding all of them at the tap's moment does that.
    for (const midi of t.midis.length ? t.midis : [60]) {
      const r = this.take(found.p, [found.p.flow.hear({ time, midi, cents: 0 })])[0];
      if (r) last = r;
      if (found.p.judged.has(t.index)) break;
    }
    return last;
  }

  /** Count as missed what has passed by `audio` (now, latency taken off); close passes that are over. */
  advance(audio: number): RunJudgement[] {
    if (this.finished) return [];
    const at = audio - this.o.lag;
    const out: RunJudgement[] = [];
    for (const p of this.passes) {
      if (p.closed || p.startAudio - this.ok > at) continue;
      const time = this.timeIn(p, at);
      out.push(...this.take(p, p.flow.advance(time)));
      if (p.endTime !== null && time > p.endTime + this.ok) {
        out.push(...this.take(p, p.flow.advance(Infinity)));
        p.closed = true;
      }
    }
    return out;
  }

  /** What one pass scored so far (the last one by default). */
  passCounts(index = this.passes.length - 1): PassCounts {
    return { ...this.passes[Math.max(0, Math.min(this.passes.length - 1, index))].flow.result().counts };
  }

  /** End the run: everything still open is missed. */
  finish(): FlowResult {
    if (this.finished) return this.finished;
    for (const p of this.passes) {
      if (!p.closed) this.take(p, p.flow.advance(Infinity));
      p.closed = true;
    }
    this.finished = this.result();
    return this.finished;
  }

  /** The whole run so far as one result (all passes added up). */
  result(): FlowResult {
    if (this.finished) return this.finished;
    return mergeResults(this.passes.map((p) => p.flow.result()), this.comboNow, this.maxComboNow);
  }

  /** End the run without judging what is still open (the learner stopped part-way): unplayed targets are left out. */
  stopEarly(): FlowResult {
    if (this.finished) return this.finished;
    for (const p of this.passes) p.closed = true;
    this.finished = this.result();
    return this.finished;
  }
}

/** Add several flow results into one (combo values come from the caller, who saw them in order). */
export function mergeResults(results: readonly FlowResult[], combo: number, maxCombo: number): FlowResult {
  const counts: Record<FlowGrade, number> = { perfect: 0, good: 0, early: 0, late: 0, missed: 0, wrong: 0 };
  const bars = new Map<number, BarHeat>();
  let score = 0;
  let maxScore = 0;
  let judged = 0;
  let total = 0;
  for (const r of results) {
    score += r.score;
    maxScore += r.maxScore;
    judged += r.judged;
    total += r.total;
    for (const g of Object.keys(counts) as FlowGrade[]) counts[g] += r.counts[g];
    for (const b of r.bars) {
      const h = bars.get(b.bar) ?? { bar: b.bar, targets: 0, perfect: 0, good: 0, early: 0, late: 0, missed: 0, wrong: 0, accuracy: 100, mistakes: 0 };
      h.targets += b.targets;
      h.perfect += b.perfect;
      h.good += b.good;
      h.early += b.early;
      h.late += b.late;
      h.missed += b.missed;
      h.wrong += b.wrong;
      bars.set(b.bar, h);
    }
  }
  const merged = [...bars.values()].sort((a, b) => a.bar - b.bar).map((h) => {
    const judgedHere = h.perfect + h.good + h.early + h.late + h.missed;
    const acc = judgedHere ? (100 * (h.perfect + 0.8 * h.good + 0.5 * (h.early + h.late))) / judgedHere : 100;
    return { ...h, accuracy: Math.round(acc * 10) / 10, mistakes: h.missed + h.wrong + h.early + h.late };
  });
  const graded = counts.perfect + counts.good + counts.early + counts.late + counts.missed;
  const accuracy = graded ? (100 * (Object.keys(ACC) as FlowGrade[]).reduce((s, g) => s + ACC[g] * (g === 'wrong' ? 0 : counts[g]), 0)) / graded : 100;
  const weakBars = merged.filter((b) => b.mistakes > 0).sort((a, b) => b.mistakes / Math.max(1, b.targets) - a.mistakes / Math.max(1, a.targets) || a.bar - b.bar).map((b) => b.bar);
  return { score, maxScore, combo, maxCombo, accuracy: Math.round(accuracy * 10) / 10, counts, bars: merged, weakBars, judged, total };
}

/** The weakest stretches of a run (re-exported for the results screen). */
export { weakBarRanges };

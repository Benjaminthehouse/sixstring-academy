/**
 * A round in progress: plays a chart on the audio clock and judges taps against it.
 *
 * The audio transport schedules every sound a little ahead and tells the session the exact
 * audio-clock time of each expected note; taps arrive as audio-clock times too (see `input.ts`),
 * have the device's latency taken off, and are handed to the judge. Nothing here depends on how
 * fast the main thread is running: a busy page delays feedback, never the scoring.
 */
import { Transport, engineClock, stopAll, type TransportClock } from '@/core/audio';
import type { Chart, ChartSound, Segment, Target } from '../core/charts';
import { meterInfo, quarterBpm, secondsPerTick } from '../core/meter';
import { LiveJudge, TAP_WINDOWS, summarise, type JudgeWindows, type Judgement, type RoundStats } from '../core/scoring';

/** What a finished (or stopped) round hands back. */
export interface SessionResult {
  stats: RoundStats;
  judgements: Judgement[];
  /** The chart was played to its end. */
  completed: boolean;
  /** Seconds from the first click to the end (or to the stop). */
  durationSec: number;
  /** Expected notes that were due before the round ended. */
  due: number;
}

/** Events a session emits. All fire on the main thread, in step with what is heard where that matters. */
export interface SessionEvents {
  /** A tap was judged, or a note went by untouched. */
  judge: { judgement: Judgement; target: Target | null };
  /** A new stretch of the round begins (fires when it is heard). */
  segment: Segment;
  /** A sound is being heard now. */
  sound: { sound: ChartSound; time: number };
  /** The round is over. */
  end: SessionResult;
}

/** Construction options. */
export interface SessionOptions {
  chart: Chart;
  /** Play one sound at an audio time; may return a function that takes it back. */
  play: (sound: ChartSound, time: number) => (() => void) | void;
  windows?: JudgeWindows;
  /** Milliseconds taken off every tap before it is judged (the calibrated latency of the input in use). */
  offsetMs?: number;
  /** How long a tap may take to reach the page before its note is called a miss (default 120 ms; more for the microphone). */
  graceMs?: number;
  /** Cost of an extra tap in notes (default: the scoring module's). */
  extraPenalty?: number;
  clock?: TransportClock;
}

type Handler<K extends keyof SessionEvents> = (event: SessionEvents[K]) => void;

/** Seconds between `start()` and the first click: time for the first sounds to be rendered and scheduled. */
const LEAD_IN = 0.18;

export class RhythmSession {
  readonly chart: Chart;
  readonly judge: LiveJudge;
  /** Seconds per tick at the chart's tempo. */
  readonly secondsPerTick: number;
  /** Raw audio-clock time of every tap received while running (before the offset): what calibration measures. */
  readonly rawTaps: number[] = [];
  /** Every sound handed to the audio engine with its audio-clock time, in order. */
  readonly soundLog: Array<{ time: number; sound: ChartSound }> = [];
  state: 'idle' | 'running' | 'ended' = 'idle';
  result: SessionResult | null = null;
  offsetMs: number;

  private readonly opts: SessionOptions;
  private readonly clock: TransportClock;
  private readonly transport: Transport;
  private readonly targetById = new Map<number, Target>();
  private readonly handlers: { [K in keyof SessionEvents]?: Set<Handler<K>> } = {};
  private pending: Array<{ time: number; cancel: () => void }> = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private start0 = 0;
  /** Seconds the transport has slipped since the start (a frozen page); added to every estimate. */
  private slip = 0;

  constructor(opts: SessionOptions) {
    this.opts = opts;
    this.chart = opts.chart;
    this.clock = opts.clock ?? engineClock;
    this.offsetMs = opts.offsetMs ?? 0;
    const meter = meterInfo(this.chart.meter);
    this.secondsPerTick = secondsPerTick(this.chart.bpm, meter);
    this.judge = new LiveJudge(this.chart.targets.map((t) => ({ id: t.id, time: t.tick * this.secondsPerTick })), opts.windows ?? TAP_WINDOWS);
    for (const t of this.chart.targets) this.targetById.set(t.id, t);
    this.transport = new Transport({ clock: this.clock, bpm: quarterBpm(this.chart.bpm, meter), timeSignature: '4/4' });
  }

  /** Subscribe to an event; returns the unsubscribe function. */
  on<K extends keyof SessionEvents>(type: K, fn: Handler<K>): () => void {
    const set = (this.handlers[type] ??= new Set() as never) as Set<Handler<K>>;
    set.add(fn);
    return () => set.delete(fn);
  }

  private emit<K extends keyof SessionEvents>(type: K, event: SessionEvents[K]): void {
    const set = this.handlers[type] as Set<Handler<K>> | undefined;
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(event);
      } catch (err) {
        // A broken listener must not stop the round.
        console.error(err);
      }
    }
  }

  /** Start the clock. Call from a click, tap or key handler, after `unlockAudio()`. */
  start(): void {
    if (this.state !== 'idle') return;
    const { chart } = this;
    const tr = this.transport;
    this.start0 = this.clock.now() + LEAD_IN;
    for (const t of chart.targets) this.judge.setTime(t.id, this.start0 + t.tick * this.secondsPerTick);

    tr.addPart(chart.sounds, (time, sound) => {
      this.noteTime(sound.tick, time);
      const cancel = this.opts.play(sound, time);
      if (cancel) this.pending.push({ time, cancel });
      this.soundLog.push({ time, sound });
      if (this.soundLog.length > 4096) this.soundLog.splice(0, 2048);
      tr.scheduleVisual(time, () => this.emit('sound', { sound, time }));
    });
    tr.addPart(chart.targets, (time, target) => {
      this.noteTime(target.tick, time);
      this.judge.setTime(target.id, time);
    });
    tr.addPart(chart.segments.map((seg) => ({ tick: seg.startTick, seg })), (time, e) => tr.scheduleVisual(time, () => this.emit('segment', e.seg)));
    if (chart.loop) tr.setLoop(chart.loop.start, chart.loop.end);
    else tr.setEnd(chart.lengthTicks);
    this.state = 'running';
    tr.start({ at: this.start0, from: 0 });
    this.timer = setInterval(() => this.poll(), 40);
  }

  /** Learn how far real scheduling has moved from the plan (only after the page was frozen). */
  private noteTime(tick: number, time: number): void {
    if (this.chart.loop) return;
    const planned = this.start0 + tick * this.secondsPerTick;
    if (Math.abs(time - planned - this.slip) > 0.002) this.slip = time - planned;
  }

  private get lateness(): number {
    return Math.max(0, this.offsetMs) / 1000 + (this.opts.graceMs ?? 120) / 1000;
  }

  private poll(): void {
    if (this.state !== 'running') return;
    const now = this.clock.soundingNow();
    for (const j of this.judge.advance(now - this.lateness)) this.emit('judge', { judgement: j, target: this.targetById.get(j.targetId ?? -1) ?? null });
    const cut = this.clock.now() - 0.5;
    if (this.pending.length > 64) this.pending = this.pending.filter((p) => p.time > cut);
    if (!this.chart.loop && now >= this.endTime + this.lateness) this.finish(true);
  }

  /** Audio-clock time at which the chart ends. */
  get endTime(): number {
    return this.timeOfTick(this.chart.lengthTicks);
  }

  /** Audio-clock time of the first click. */
  get startTime(): number {
    return this.start0 + this.slip;
  }

  /** Audio-clock time at which a chart tick sounds (on the first pass of a looping chart). */
  timeOfTick(tick: number): number {
    return this.start0 + this.slip + tick * this.secondsPerTick;
  }

  /** Audio-clock times of the last `count` sounds (the microphone gate asks whether an onset is the app's own click). */
  recentSoundTimes(count = 12): number[] {
    return this.soundLog.slice(-count).map((e) => e.time);
  }

  /** The time held for an expected note. */
  targetTime(id: number): number {
    return this.judge.timeOf(id) ?? 0;
  }

  /** Audio-clock time of what is being heard right now. */
  now(): number {
    return this.clock.soundingNow();
  }

  /**
   * The chart tick being heard right now. Negative during the lead-in; inside the loop region for
   * a looping chart.
   */
  tickNow(): number {
    if (this.state === 'idle') return 0;
    const now = this.clock.soundingNow();
    if (this.chart.loop && this.transport.state === 'playing' && now >= this.start0) return this.transport.tickAt(now);
    return (now - this.start0 - this.slip) / this.secondsPerTick;
  }

  /** The stretch of the round that contains a tick, or null outside the chart. */
  segmentAt(tick: number): Segment | null {
    for (const seg of this.chart.segments) if (tick >= seg.startTick && tick < seg.endTick) return seg;
    return null;
  }

  /**
   * A tap at raw audio-clock time `rawTime`. The stored offset is taken off, then the tap is
   * judged. Taps outside the stretches the learner plays in (during a count-in, say) that match no
   * note are ignored: they cost nothing and null is returned.
   */
  tap(rawTime: number, dir?: 'D' | 'U'): Judgement | null {
    if (this.state !== 'running' || !Number.isFinite(rawTime)) return null;
    this.rawTaps.push(rawTime);
    const time = rawTime - this.offsetMs / 1000;
    const seg = this.segmentAt((time - this.start0 - this.slip) / this.secondsPerTick);
    const inPlay = seg?.kind === 'play';
    const judgement = this.judge.tap(time, dir, inPlay);
    if (judgement.verdict === 'extra' && !inPlay) return null;
    this.emit('judge', { judgement, target: judgement.targetId === null ? null : this.targetById.get(judgement.targetId) ?? null });
    return judgement;
  }

  private finish(completed: boolean): SessionResult {
    if (this.result) return this.result;
    const now = this.clock.soundingNow();
    if (completed) for (const j of this.judge.finish()) this.emit('judge', { judgement: j, target: this.targetById.get(j.targetId ?? -1) ?? null });
    // A round that was stopped early is scored on the notes that had come due.
    const horizon = now - this.lateness;
    const due = completed ? this.chart.targets : this.chart.targets.filter((t) => this.targetTime(t.id) <= horizon);
    const stats = summarise(due, this.judge.judgements, { extraPenalty: this.opts.extraPenalty });
    this.result = { stats, judgements: [...this.judge.judgements], completed, durationSec: Math.max(0, Math.min(now, this.endTime) - this.startTime), due: due.length };
    this.halt();
    this.state = 'ended';
    this.emit('end', this.result);
    return this.result;
  }

  private halt(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const now = this.clock.now();
    // Take back what has been handed to the audio engine but not heard yet.
    for (const p of this.pending) if (p.time > now - 0.05) p.cancel();
    this.pending = [];
    this.transport.stop();
  }

  /** Stop now. Returns the result for what was played so far (null if the round never started). */
  stop(): SessionResult | null {
    if (this.state === 'idle') {
      this.state = 'ended';
      return null;
    }
    if (this.state === 'ended') return this.result;
    const result = this.finish(false);
    // Let ringing strings die quickly rather than hang over the summary.
    stopAll(undefined, 0.12);
    return result;
  }

  /** Stop and forget every listener. Safe to call at any time, more than once. */
  dispose(): void {
    if (this.state === 'running') {
      this.halt();
      stopAll(undefined, 0.08);
    }
    this.state = 'ended';
    for (const key of Object.keys(this.handlers) as Array<keyof SessionEvents>) delete this.handlers[key];
    this.transport.dispose();
  }
}

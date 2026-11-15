/**
 * The Transport: musical time running on the audio clock.
 *
 * A timer wakes up every few milliseconds and schedules everything that falls inside the next
 * look-ahead window, handing each callback the exact audio-clock time of its event. The timer only
 * decides *when we look*; the audio clock decides when things sound, so timing stays sample-accurate
 * however busy the main thread is.
 *
 * Musical time is described by an immutable {@link Timeline}. Every change while running (tempo,
 * swing, loop wrap, seek) starts a new "anchor" at the scheduling frontier, so nothing already
 * scheduled moves and nothing is played twice or skipped. Changes made from inside an event
 * callback take effect exactly at that event's tick: that is how the speed trainer changes tempo
 * precisely on a bar line.
 *
 * The class has no Web Audio dependency: it needs only a clock, so it is unit-tested with a fake
 * one and can drive an OfflineAudioContext (`advanceTo`).
 */
import { PPQ, Timeline, resolveMeter, type AccentLevel, type BarBeatTick, type Meter, type MeterChange, type MusicalPosition, type TempoPoint, type TimeSignature } from './timeline';
import { VisualQueue } from './visual-sync';

/** The two clocks the transport needs. */
export interface TransportClock {
  /** Audio-clock time used for scheduling (AudioContext.currentTime). */
  now(): number;
  /** Audio-clock time of what is being heard right now (output latency compensated). */
  soundingNow(): number;
  /**
   * Keep the clock running until the returned function is called. The engine's clock uses this so
   * the audio context is not suspended as "idle" while a transport plays through silent bars.
   */
  hold?(): () => void;
}

/** A position given as ticks or as bar/beat/tick (0-based). */
export type TickLike = number | BarBeatTick;

/** Transport run state. During a count-in the state is `playing` and `position().countIn` is set. */
export type TransportState = 'stopped' | 'playing' | 'paused';

/** Fired for every felt beat, including count-in beats. */
export interface BeatEvent {
  /** Audio-clock time of the beat. */
  time: number;
  /** Absolute tick (the start tick during a count-in). */
  tick: number;
  /** Bar index; negative during a count-in (-1 = the bar just before the start). */
  bar: number;
  beat: number;
  beatsInBar: number;
  /** Default accent of this beat in its meter. */
  accent: AccentLevel;
  downbeat: boolean;
  countIn: boolean;
  /** Effective tempo in quarter notes per minute at this beat. */
  bpm: number;
  /** Length of this beat in seconds at that tempo. */
  seconds: number;
  meter: Meter;
}

/** Fired at every bar line. */
export interface BarEvent {
  time: number;
  tick: number;
  bar: number;
  meter: Meter;
}

/** Events the transport emits. All carry the audio-clock time they refer to. */
export interface TransportEventMap {
  beat: BeatEvent;
  bar: BarEvent;
  /** The loop wrapped; `count` is how many times so far. */
  loop: { time: number; count: number };
  start: { time: number; tick: number };
  /** Stopped by the user, or the end tick was reached. */
  stop: { time: number };
  pause: { time: number; tick: number };
  seek: { time: number; tick: number };
  /** The end tick set with `setEnd` was reached (a `stop` follows when it has sounded). */
  end: { time: number };
  /** The tempo or the tempo scale changed. */
  tempo: { time: number; bpm: number };
}

type Handler<K extends keyof TransportEventMap> = (event: TransportEventMap[K]) => void;

/** Position of the transport at some moment, for display and animation. */
export interface TransportPosition extends MusicalPosition {
  state: TransportState;
  /** Set while the count-in is sounding. */
  countIn: null | { bar: number; bars: number; beat: number; beatsInBar: number; beatProgress: number; beatsLeft: number };
  /** Effective tempo in quarter notes per minute. */
  bpm: number;
  loopCount: number;
}

/** Callback of a scheduled event: `time` is when to make the sound, `tick` the event's tick. */
export type ScheduledCallback = (time: number, tick: number) => void;

/** A custom generator of events, asked for everything in [from, to) ticks. */
export interface EventSource {
  collect(from: number, to: number, add: (tick: number, fire: ScheduledCallback) => void): void;
}

/** Transport construction options. */
export interface TransportOptions {
  clock: TransportClock;
  /** Initial tempo in quarter notes per minute (default 120). */
  bpm?: number;
  timeSignature?: TimeSignature | string;
  /** Seconds scheduled ahead of the clock (default 0.16). */
  lookahead?: number;
  /** Seconds between scheduler wake-ups (default 0.025). */
  interval?: number;
  /** Delay between `start()` and the first event, so the first notes are never late (default 0.08). */
  startDelay?: number;
  /** `manual`: no timer; the caller drives `process()` / `advanceTo()` (tests, offline rendering). */
  timer?: 'interval' | 'manual';
}

interface Anchor {
  time: number;
  tick: number;
  sec: number;
  timeline: Timeline;
  rate: number;
}

interface CountIn {
  time0: number;
  endTime: number;
  meter: Meter;
  bars: number;
  totalTicks: number;
  secPerTick: number;
  frontier: number;
  startTick: number;
  bpm: number;
  done: boolean;
}

interface Pending {
  tick: number;
  order: number;
  fire: ScheduledCallback;
}

const NUDGE = 1e-6; // ticks; "just after" an event that has already fired
const MAX_LATE = 0.25; // seconds the scheduler may fall behind before time is slipped instead

function timeOf(a: Anchor, tick: number): number {
  return a.time + (a.timeline.ticksToSeconds(tick) - a.sec) / a.rate;
}

function tickOf(a: Anchor, time: number): number {
  return a.timeline.secondsToTicks(a.sec + (time - a.time) * a.rate);
}

/** Musical time on the audio clock: tempo, meter, swing, loop, count-in and event scheduling. */
export class Transport {
  private readonly clock: TransportClock;
  private readonly lookahead: number;
  private readonly interval: number;
  private readonly startDelay: number;
  private readonly manual: boolean;
  private tl: Timeline;
  private rate = 1;
  private _state: TransportState = 'stopped';
  private anchors: Anchor[] = [];
  private frontierTick = 0;
  private frontierTime = 0;
  private playhead = 0;
  private lastStart = 0;
  private loopRegion: { start: number; end: number } | null = null;
  private loops = 0;
  private endTick: number | null = null;
  private ending: number | null = null;
  private countInState: CountIn | null = null;
  private version = 0;
  private readonly sources = new Map<number, EventSource>();
  private nextId = 1;
  private readonly handlers = new Map<string, Set<(e: never) => void>>();
  private readonly visualHandlers = new Map<string, Set<(e: never) => void>>();
  private readonly visual: VisualQueue;
  private timer: ReturnType<typeof setInterval> | null = null;
  private releaseClock: (() => void) | null = null;
  private readonly onVisibility = (): void => this.process();

  /** Bars of count-in played before `start()` (default 0). */
  countInBars = 0;

  constructor(opts: TransportOptions) {
    this.clock = opts.clock;
    this.lookahead = opts.lookahead ?? 0.16;
    this.interval = opts.interval ?? 0.025;
    this.startDelay = opts.startDelay ?? 0.08;
    this.manual = opts.timer === 'manual';
    this.tl = new Timeline({ bpm: opts.bpm ?? 120, timeSignature: opts.timeSignature });
    this.visual = new VisualQueue(() => this.clock.soundingNow());
  }

  // --- listeners -------------------------------------------------------------------------------

  /**
   * Listen to an event at scheduling time: the handler runs a little before the event sounds and
   * gets its exact audio time. Use this to trigger sound. Returns an unsubscribe function.
   */
  on<K extends keyof TransportEventMap>(type: K, handler: Handler<K>): () => void {
    return this.listen(this.handlers, type, handler);
  }

  /**
   * Listen to an event at the moment it is heard (output latency compensated). Use this to move
   * things on screen. Returns an unsubscribe function.
   */
  onVisual<K extends keyof TransportEventMap>(type: K, handler: Handler<K>): () => void {
    return this.listen(this.visualHandlers, type, handler);
  }

  private listen<K extends keyof TransportEventMap>(map: Map<string, Set<(e: never) => void>>, type: K, handler: Handler<K>): () => void {
    let set = map.get(type);
    if (!set) map.set(type, (set = new Set()));
    set.add(handler as (e: never) => void);
    return () => {
      set.delete(handler as (e: never) => void);
    };
  }

  private emit<K extends keyof TransportEventMap>(type: K, event: TransportEventMap[K]): void {
    const set = this.handlers.get(type);
    if (set) for (const h of [...set]) (h as Handler<K>)(event);
    const vis = this.visualHandlers.get(type);
    if (vis && vis.size) {
      const targets = [...vis];
      this.visual.add(event.time, () => {
        for (const h of targets) if (vis.has(h)) (h as Handler<K>)(event);
      });
    }
  }

  /** Run `fn` when the sound scheduled at audio time `time` is heard (keeps visuals in step). */
  scheduleVisual(time: number, fn: () => void): void {
    this.visual.add(time, fn);
  }

  /** Run the visual callbacks due at `now` (default: the sounding time). Tests call this directly. */
  flushVisual(now?: number): void {
    this.visual.flush(now);
  }

  // --- settings --------------------------------------------------------------------------------

  /** The current map of musical time. */
  get timeline(): Timeline {
    return this.tl;
  }

  get state(): TransportState {
    return this._state;
  }

  /** Effective tempo in quarter notes per minute where the transport is now. */
  get bpm(): number {
    const tick = this._state === 'playing' ? this.frontierTick : this.playhead;
    return this.tl.bpmAt(tick) * this.rate;
  }

  /** Practice-speed multiplier applied on top of the tempo map (1 = as written). */
  get tempoScale(): number {
    return this.rate;
  }

  /** Time signature at the playhead. */
  get meter(): Meter {
    return this.tl.meterAt(this._state === 'playing' ? this.frontierTick : this.playhead);
  }

  /** Loop region in ticks, or null. */
  get loop(): { start: number; end: number } | null {
    return this.loopRegion ? { ...this.loopRegion } : null;
  }

  /** How many times the loop has wrapped since the last start. */
  get loopCount(): number {
    return this.loops;
  }

  /** Ticks for a bar/beat/tick position (or a tick passed through). */
  toTicks(at: TickLike): number {
    return typeof at === 'number' ? at : this.tl.tickOf(at);
  }

  private currentTick(): number {
    return this._state === 'playing' ? this.frontierTick : this.playhead;
  }

  /** Swap in a new timeline; when running it takes over exactly at the scheduling frontier. */
  private apply(tl: Timeline, rate: number = this.rate): void {
    this.tl = tl;
    this.rate = rate;
    this.version++;
    if (this._state === 'playing' && this.anchors.length) {
      this.anchors.push({ time: this.frontierTime, tick: this.frontierTick, sec: tl.ticksToSeconds(this.frontierTick), timeline: tl, rate });
    }
  }

  /**
   * Set a constant tempo in quarter notes per minute. While running it applies from the next
   * scheduled event (within the look-ahead), or exactly at the current event when called from a
   * transport callback. With `rampBeats` the tempo glides there over that many quarter notes.
   */
  setTempo(bpm: number, opts: { rampBeats?: number } = {}): void {
    const target = Math.max(5, Math.min(1000, bpm));
    const at = this.currentTick();
    if (opts.rampBeats && opts.rampBeats > 0) {
      const from = this.tl.bpmAt(at);
      this.apply(this.tl.with({ tempo: [{ tick: at, bpm: from, ramp: true }, { tick: at + opts.rampBeats * PPQ, bpm: target }] }));
    } else {
      this.apply(this.tl.with({ bpm: target }));
    }
    this.emit('tempo', { time: this._state === 'playing' ? this.frontierTime : this.clock.now(), bpm: target * this.rate });
  }

  /** Install a full tempo map (a song's tempo changes). */
  setTempoMap(points: TempoPoint[]): void {
    this.apply(this.tl.with({ tempo: points }));
    this.emit('tempo', { time: this._state === 'playing' ? this.frontierTime : this.clock.now(), bpm: this.bpm });
  }

  /** Play the tempo map faster or slower (0.5 = half speed) without changing it. */
  setTempoScale(scale: number): void {
    this.apply(this.tl, Math.max(0.05, Math.min(4, scale)));
    this.emit('tempo', { time: this._state === 'playing' ? this.frontierTime : this.clock.now(), bpm: this.bpm });
  }

  /** Set one time signature for the whole piece. Best done while stopped. */
  setTimeSignature(ts: TimeSignature | string): void {
    this.apply(this.tl.with({ timeSignature: ts }));
  }

  /** Install time-signature changes at bar lines. */
  setMeters(changes: MeterChange[]): void {
    this.apply(this.tl.with({ meters: changes }));
  }

  /** Swing ratio 0.5 (straight) .. 0.75 for pairs of eighths (default) or sixteenths. */
  setSwing(ratio: number, unit: 'eighth' | 'sixteenth' = 'eighth'): void {
    this.apply(this.tl.with({ swing: ratio > 0.5 ? { ratio, unitTicks: unit === 'eighth' ? PPQ / 2 : PPQ / 4 } : null }));
  }

  /** Repeat the region [start, end). */
  setLoop(start: TickLike, end: TickLike): void {
    const s = this.toTicks(start);
    const e = this.toTicks(end);
    this.loopRegion = e > s ? { start: s, end: e } : null;
    this.version++;
  }

  /** Stop looping (playback continues past the old loop end). */
  clearLoop(): void {
    this.loopRegion = null;
    this.version++;
  }

  /** Stop automatically when this position is reached (null = run for ever). */
  setEnd(at: TickLike | null): void {
    this.endTick = at === null ? null : this.toTicks(at);
    this.version++;
  }

  // --- scheduling API --------------------------------------------------------------------------

  /** Register a custom event source. Returns an id for `clear`. */
  addSource(source: EventSource): number {
    const id = this.nextId++;
    this.sources.set(id, source);
    return id;
  }

  /** Call `fn` every time playback passes a position (again on every loop pass). */
  schedule(at: TickLike, fn: ScheduledCallback): number {
    const tick = this.toTicks(at);
    return this.addSource({
      collect: (from, to, add) => {
        if (tick >= from && tick < to) add(tick, fn);
      },
    });
  }

  /** Call `fn` every `every` ticks, starting at `from` (default 0) and before `until`. */
  scheduleRepeat(fn: ScheduledCallback, every: number, from: TickLike = 0, until?: TickLike): number {
    const start = this.toTicks(from);
    const stop = until === undefined ? Infinity : this.toTicks(until);
    const step = Math.max(1, every);
    return this.addSource({
      collect: (a, b, add) => {
        let k = Math.max(0, Math.ceil((a - start) / step - 1e-9));
        for (let t = start + k * step; t < b && t < stop; t = start + ++k * step) if (t >= a) add(t, fn);
      },
    });
  }

  /**
   * Play a list of events (each with a `tick`); `fn` gets the audio time and the event.
   * The list is sorted once and searched by window, so a whole song is cheap.
   */
  addPart<T extends { tick: number }>(events: readonly T[], fn: (time: number, event: T) => void): number {
    const sorted = events.slice().sort((x, y) => x.tick - y.tick);
    return this.addSource({
      collect: (from, to, add) => {
        let lo = 0, hi = sorted.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (sorted[mid].tick < from) lo = mid + 1; else hi = mid;
        }
        for (let i = lo; i < sorted.length && sorted[i].tick < to; i++) {
          const ev = sorted[i];
          add(ev.tick, (time) => fn(time, ev));
        }
      },
    });
  }

  /** Remove something added with schedule / scheduleRepeat / addPart / addSource. */
  clear(id: number): void {
    this.sources.delete(id);
  }

  /** Remove everything that was scheduled (listeners stay). */
  clearAll(): void {
    this.sources.clear();
  }

  // --- control ---------------------------------------------------------------------------------

  /**
   * Start playing. `from` moves the playhead first; `at` is the audio time of the first event
   * (default: a moment from now); `countIn` overrides `countInBars` for this start.
   */
  start(opts: { at?: number; from?: TickLike; countIn?: number } = {}): void {
    if (this._state === 'playing') return;
    if (opts.from !== undefined) this.playhead = this.toTicks(opts.from);
    const tick = this.playhead;
    this.releaseClock = this.clock.hold?.() ?? null;
    const time = opts.at ?? this.clock.now() + this.startDelay;
    const bars = Math.max(0, Math.round(opts.countIn ?? this.countInBars));
    this.lastStart = tick;
    this.loops = 0;
    this.ending = null;
    this.anchors = [];
    this.frontierTick = tick;
    this.frontierTime = time;
    this._state = 'playing';
    this.version++;
    if (bars > 0) {
      const meter = this.tl.meterAt(tick);
      const bpm = this.tl.bpmAt(tick) * this.rate;
      const secPerTick = 60 / (bpm * PPQ);
      const totalTicks = bars * meter.barTicks;
      this.countInState = { time0: time, endTime: time + totalTicks * secPerTick, meter, bars, totalTicks, secPerTick, frontier: 0, startTick: tick, bpm, done: false };
    } else {
      this.countInState = null;
      this.anchors.push({ time, tick, sec: this.tl.ticksToSeconds(tick), timeline: this.tl, rate: this.rate });
    }
    this.emit('start', { time, tick });
    if (!this.manual) {
      this.timer = setInterval(() => this.process(), this.interval * 1000);
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
      this.process();
    }
  }

  /** Stop where we are; `start()` continues from here. */
  pause(): void {
    if (this._state !== 'playing') return;
    const now = this.clock.now();
    const tick = this.tickAt(now);
    this.halt('paused');
    this.playhead = tick;
    this.emit('pause', { time: now, tick });
  }

  /** Stop and return the playhead to where the last `start()` began. */
  stop(): void {
    if (this._state === 'stopped') return;
    const wasPlaying = this._state === 'playing';
    this.halt('stopped');
    this.playhead = this.lastStart;
    this.emit('stop', { time: wasPlaying ? this.clock.now() : 0 });
  }

  private halt(state: TransportState): void {
    this._state = state;
    this.anchors = [];
    this.countInState = null;
    this.ending = null;
    this.version++;
    this.visual.clear();
    this.releaseClock?.();
    this.releaseClock = null;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
  }

  /** Jump to a position. While playing, playback continues from there almost immediately. */
  seek(to: TickLike): void {
    const tick = this.toTicks(to);
    if (this._state === 'playing') {
      const time = this.clock.now() + this.startDelay / 2;
      this.countInState = null;
      this.ending = null;
      this.anchors = [{ time, tick, sec: this.tl.ticksToSeconds(tick), timeline: this.tl, rate: this.rate }];
      this.frontierTick = tick;
      this.frontierTime = time;
      this.version++;
      this.emit('seek', { time, tick });
    } else {
      this.playhead = tick;
      this.lastStart = tick;
      this.emit('seek', { time: 0, tick });
    }
  }

  /** Stop the timer and forget every listener and scheduled event. */
  dispose(): void {
    this.halt('stopped');
    this.sources.clear();
    this.handlers.clear();
    this.visualHandlers.clear();
  }

  // --- position --------------------------------------------------------------------------------

  /** The tick sounding at an audio-clock time (the playhead when not playing). */
  tickAt(time: number): number {
    if (this._state !== 'playing') return this.playhead;
    const c = this.countInState;
    if (c && time < c.endTime) return c.startTick;
    const a = this.anchorAt(time);
    if (!a) return this.frontierTick;
    return time <= a.time ? a.tick : tickOf(a, time);
  }

  /**
   * Audio-clock time at which a tick will sound on the current pass, or null when not playing.
   * Only meaningful for ticks at or after the scheduling frontier.
   */
  timeAt(at: TickLike): number | null {
    if (this._state !== 'playing') return null;
    const tick = this.toTicks(at);
    const c = this.countInState;
    if (c && !c.done) return c.endTime + (this.tl.ticksToSeconds(tick) - this.tl.ticksToSeconds(c.startTick)) / this.rate;
    const a = this.anchors[this.anchors.length - 1];
    return a ? timeOf(a, tick) : null;
  }

  private anchorAt(time: number): Anchor | null {
    const list = this.anchors;
    if (!list.length) return null;
    let i = list.length - 1;
    while (i > 0 && list[i].time > time) i--;
    return list[i];
  }

  /**
   * Where the music is at an audio-clock time. With no argument: what is being heard right now,
   * which is what an animation should draw.
   */
  position(time?: number): TransportPosition {
    const playing = this._state === 'playing';
    const t = playing ? time ?? this.clock.soundingNow() : 0;
    const tick = playing ? this.tickAt(t) : this.playhead;
    const base = this.tl.positionOf(tick);
    let countIn: TransportPosition['countIn'] = null;
    const c = this.countInState;
    if (playing && c && t < c.endTime) {
      const ticks = Math.max(0, Math.min(c.totalTicks - 1e-6, (t - c.time0) / c.secPerTick));
      const bar = Math.floor(ticks / c.meter.barTicks);
      const inBar = ticks - bar * c.meter.barTicks;
      let beat = c.meter.beats.length - 1;
      while (beat > 0 && c.meter.beats[beat].tick > inBar) beat--;
      const b = c.meter.beats[beat];
      const n = c.meter.beats.length;
      countIn = { bar, bars: c.bars, beat, beatsInBar: n, beatProgress: (inBar - b.tick) / b.length, beatsLeft: (c.bars - bar) * n - beat };
    }
    return { ...base, state: this._state, countIn, bpm: this.tl.bpmAt(tick) * this.rate, loopCount: this.loops };
  }

  // --- the scheduler ---------------------------------------------------------------------------

  /** Schedule everything inside the look-ahead window. Called by the timer; safe to call any time. */
  process(now: number = this.clock.now()): void {
    if (this._state !== 'playing') return;
    if (this.ending !== null) {
      if (now >= this.ending) this.finish();
      return;
    }
    const behind = now - this.frontierTime;
    if (behind > MAX_LATE) {
      // The page was frozen (background tab, debugger). Slip musical time rather than firing a
      // burst of late events.
      const shift = behind + 0.02;
      for (const a of this.anchors) a.time += shift;
      const c = this.countInState;
      if (c) {
        c.time0 += shift;
        c.endTime += shift;
      }
      this.frontierTime += shift;
    }
    const hidden = typeof document !== 'undefined' && document.hidden;
    this.advanceTo(now + (hidden ? Math.max(this.lookahead, 1.5) : this.lookahead));
    // Keep only the anchors an animation could still ask about.
    while (this.anchors.length > 1 && this.anchors[1].time < now - 1) this.anchors.shift();
  }

  /** Schedule every event up to an audio-clock time, ignoring the look-ahead (offline rendering). */
  advanceTo(horizon: number): void {
    let guard = 0;
    while (this._state === 'playing' && this.ending === null && this.frontierTime < horizon && guard++ < 100000) {
      const c = this.countInState;
      if (c && !c.done) {
        this.advanceCountIn(c, horizon);
        continue;
      }
      const a = this.anchors[this.anchors.length - 1];
      const target = tickOf(a, horizon);
      let boundary = Infinity;
      let kind: 'loop' | 'end' | null = null;
      if (this.loopRegion && this.frontierTick < this.loopRegion.end) {
        boundary = this.loopRegion.end;
        kind = 'loop';
      }
      if (this.endTick !== null && this.endTick < boundary && this.frontierTick <= this.endTick) {
        boundary = this.endTick;
        kind = 'end';
      }
      const limit = Math.min(target, boundary);
      // Rounding can leave the frontier a hair short of the horizon with no whole tick to gain.
      if (limit <= this.frontierTick && limit < boundary) break;
      if (limit > this.frontierTick) {
        const pending = this.collect(this.frontierTick, limit);
        const version = this.version;
        let replan = false;
        for (let i = 0; i < pending.length; i++) {
          const ev = pending[i];
          const time = timeOf(a, ev.tick);
          this.frontierTick = ev.tick;
          this.frontierTime = time;
          ev.fire(time, ev.tick);
          if (this.version !== version) {
            // A callback changed tempo / loop / position. Finish this instant, then re-plan.
            if (this._state === 'playing' && this.frontierTick === ev.tick) {
              let j = i + 1;
              while (j < pending.length && pending[j].tick === ev.tick) pending[j++].fire(time, ev.tick);
              this.frontierTick = ev.tick + NUDGE;
            }
            replan = true;
            break;
          }
        }
        if (replan) continue;
      }
      this.frontierTick = limit;
      this.frontierTime = timeOf(a, limit);
      if (limit >= boundary && kind === 'loop' && this.loopRegion) {
        this.loops++;
        const start = this.loopRegion.start;
        this.anchors.push({ time: this.frontierTime, tick: start, sec: this.tl.ticksToSeconds(start), timeline: this.tl, rate: this.rate });
        this.frontierTick = start;
        this.emit('loop', { time: this.frontierTime, count: this.loops });
      } else if (limit >= boundary && kind === 'end') {
        this.ending = this.frontierTime;
        this.emit('end', { time: this.frontierTime });
        if (this.manual) this.finish();
      }
    }
  }

  private finish(): void {
    const time = this.ending ?? this.clock.now();
    const tick = this.endTick ?? this.frontierTick;
    this.halt('stopped');
    this.playhead = tick;
    this.emit('stop', { time });
  }

  private advanceCountIn(c: CountIn, horizon: number): void {
    const target = Math.min(c.totalTicks, (horizon - c.time0) / c.secPerTick);
    const n = c.meter.beats.length;
    for (let bar = 0; bar < c.bars; bar++) {
      const barTick = bar * c.meter.barTicks;
      if (barTick >= target) break;
      for (let beat = 0; beat < n; beat++) {
        const t = barTick + c.meter.beats[beat].tick;
        if (t < c.frontier || t >= target) continue;
        const b = c.meter.beats[beat];
        this.emit('beat', {
          time: c.time0 + t * c.secPerTick,
          tick: c.startTick,
          bar: bar - c.bars,
          beat,
          beatsInBar: n,
          accent: b.accent,
          downbeat: beat === 0,
          countIn: true,
          bpm: c.bpm,
          seconds: b.length * c.secPerTick,
          meter: c.meter,
        });
        if (this._state !== 'playing' || this.countInState !== c) return;
      }
    }
    c.frontier = target;
    this.frontierTime = c.time0 + target * c.secPerTick;
    if (target >= c.totalTicks) {
      c.done = true;
      this.frontierTick = c.startTick;
      this.frontierTime = c.endTime;
      this.anchors.push({ time: c.endTime, tick: c.startTick, sec: this.tl.ticksToSeconds(c.startTick), timeline: this.tl, rate: this.rate });
    }
  }

  private collect(from: number, to: number): Pending[] {
    const pending: Pending[] = [];
    // Bar lines and beats first, so a listener can change the tempo before notes on that beat.
    const tl = this.tl;
    let bar = tl.positionOf(from).bar;
    for (let guard = 0; guard < 100000; guard++, bar++) {
      const start = tl.barStart(bar);
      if (start >= to) break;
      const meter = tl.meterOfBar(bar);
      const barIndex = bar;
      if (start >= from) {
        pending.push({ tick: start, order: -2, fire: (time) => this.emit('bar', { time, tick: start, bar: barIndex, meter }) });
      }
      for (let i = 0; i < meter.beats.length; i++) {
        const b = meter.beats[i];
        const tick = start + b.tick;
        if (tick < from || tick >= to) continue;
        const beatIndex = i;
        pending.push({
          tick,
          order: -1,
          fire: (time) => {
            const bpm = this.tl.bpmAt(tick) * this.rate;
            this.emit('beat', {
              time, tick, bar: barIndex, beat: beatIndex, beatsInBar: meter.beats.length, accent: b.accent, downbeat: beatIndex === 0,
              countIn: false, bpm, seconds: (b.length * 60) / (bpm * PPQ), meter,
            });
          },
        });
      }
    }
    let order = 0;
    for (const [id, source] of this.sources) {
      const base = id * 1e6;
      source.collect(from, to, (tick, fire) => {
        if (tick >= from && tick < to) pending.push({ tick, order: base + order++, fire });
      });
    }
    pending.sort((x, y) => x.tick - y.tick || x.order - y.order);
    return pending;
  }
}

/** Tempo of a meter's natural beat (e.g. dotted quarter in 6/8) for a tempo in quarter notes. */
export function beatTempo(qpm: number, ts: TimeSignature | string): number {
  return (qpm * PPQ) / resolveMeter(ts).tempoBeatTicks;
}

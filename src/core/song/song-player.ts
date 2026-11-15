/**
 * SongPlayer: plays a song through the audio engine (guitar synth for notes, strums for chord
 * tracks, bass synth for bass tracks, optional metronome click and count-in) on the engine's
 * Transport, so every sound is placed on the audio clock. Practice controls: tempo 25–150 % (the
 * synth renders each pitch, so a slower tempo never changes pitch), seek by tick or bar, A–B loop
 * by bars with an automatic tempo ramp per pass (speed trainer), mute and solo per track, and
 * `playRange` for wait mode. Screens follow it with `subscribe` (beats as they are heard) and
 * `position()` (read it in requestAnimationFrame for a smooth cursor).
 */
import {
  Transport, engineClock, getBass, getGuitar, playClick,
  type ClickSet, type ToneName, type TransportClock,
} from '@/core/audio';
import { barCapacity } from './model';
import { buildPlayEvents, type PlayEvent, type PlayNote, type PlayStrum, type ScheduleOptions } from './schedule';
import { flattenSong, type SongTimeline, type TimelineBeat } from './timeline';
import type { Song } from './types';
import { PPQ } from './types';

/** Where the sound goes. `liveOutput()` plays through the audio engine; tests pass a recorder. */
export interface SongPlayerOutput {
  /** Play a note heard at audio time `time`, lasting `seconds`. */
  note(e: PlayNote, time: number, seconds: number): void;
  strum(e: PlayStrum, time: number, seconds: number): void;
  click(level: 'accent' | 'medium' | 'beat', time: number): void;
  /** Silence everything (scheduled sounds that have not been heard yet included). */
  stopAll(time?: number): void;
  /** Render what will be needed before it is needed (optional). */
  preload?(events: readonly PlayEvent[]): Promise<void>;
}

/** Options for `liveOutput`. */
export interface LiveOutputOptions {
  /** Guitar tone (default steel). */
  tone?: ToneName;
  /** Bass tone (default bass-finger). */
  bassTone?: ToneName;
  /** Metronome sound (default woodblock). */
  clickSet?: ClickSet;
}

/** The real output: the shared guitar and bass synths and the engine's click. */
export function liveOutput(opts: LiveOutputOptions = {}): SongPlayerOutput {
  const takeBack = new Set<() => void>();
  return {
    note(e, time, seconds) {
      const synth = e.instrument === 'bass' ? getBass() : getGuitar();
      synth.pluck(e.midi, time, {
        string: e.string, duration: seconds, velocity: e.velocity, articulation: e.articulation, letRing: e.letRing,
        ...(e.cents ? { cents: e.cents } : {}), tone: e.instrument === 'bass' ? opts.bassTone ?? 'bass-finger' : opts.tone,
      });
    },
    strum(e, time, seconds) {
      const synth = e.instrument === 'bass' ? getBass() : getGuitar();
      synth.strum(e.midis, time, {
        direction: e.direction, strings: e.strings, velocity: e.velocity, duration: seconds,
        ...(e.muted ? { articulation: 'dead' as const } : {}), ...(opts.tone ? { tone: opts.tone } : {}),
      });
    },
    click(level, time) {
      const back = playClick(opts.clickSet ?? 'woodblock', level, time);
      takeBack.add(back);
      // Forget it once it has sounded; a take-back after that is harmless anyway.
      setTimeout(() => takeBack.delete(back), 4000);
    },
    stopAll(time) {
      getGuitar().stopAll(time);
      getBass().stopAll(time);
      for (const back of takeBack) back();
      takeBack.clear();
    },
    async preload(events) {
      const guitar: Array<{ midi: number; string?: number }> = [];
      const bass: Array<{ midi: number; string?: number }> = [];
      const seen = new Set<string>();
      for (const e of events) {
        const list = e.instrument === 'bass' ? bass : guitar;
        const notes = e.kind === 'note' ? [{ midi: e.midi, string: e.string }] : e.midis.map((midi, i) => ({ midi, string: e.strings[i] }));
        for (const n of notes) {
          const k = `${e.instrument}:${n.midi}:${n.string}`;
          if (!seen.has(k)) {
            seen.add(k);
            list.push(n);
          }
        }
      }
      await Promise.all([getGuitar().preload(guitar), getBass().preload(bass)]);
    },
  };
}

/** Player run state. */
export type PlayerState = 'stopped' | 'playing' | 'paused';

/** A speed trainer: start slower and speed up after every few passes of the loop. */
export interface TempoRamp {
  /** Tempo percent of the first pass. */
  start: number;
  /** Percent added after each step. */
  step: number;
  /** Highest percent. */
  target: number;
  /** Passes per step (default 1). */
  every?: number;
}

/** What subscribers hear about. Beats, bars and count-in beats arrive when they are heard. */
export type SongPlayerEvent =
  | { type: 'beat'; beat: TimelineBeat; time: number }
  | { type: 'bar'; index: number; bar: number; time: number }
  | { type: 'countin'; beat: number; beats: number; time: number }
  | { type: 'state'; state: PlayerState }
  | { type: 'loop'; count: number; tempoPercent: number }
  | { type: 'tempo'; percent: number }
  | { type: 'range-end'; tick: number }
  | { type: 'end' };

/** Where the player is, for a cursor or a fretboard. */
export interface PlayerPosition {
  state: PlayerState;
  /** Song tick (absolute, playback order) and seconds at the written tempo. */
  tick: number;
  sec: number;
  /** Playback-order bar, song bar, pass and quarter-note beat in the bar. */
  index: number;
  bar: number;
  pass: number;
  beat: number;
  barProgress: number;
  /** Set while the count-in is sounding. */
  countIn: { beat: number; beats: number } | null;
}

/** Options for `SongPlayer`. */
export interface SongPlayerOptions extends ScheduleOptions {
  output?: SongPlayerOutput;
  /** Audio clock (default the engine's). */
  clock?: TransportClock;
  /** `manual` for tests and offline rendering: drive `transport.advanceTo()` yourself. */
  timer?: 'interval' | 'manual';
  lookahead?: number;
  /** Metronome click on every beat (default false). */
  metronome?: boolean;
  /** Bars of count-in before playing from a stop (default 1). */
  countInBars?: number;
}

const MIN_PERCENT = 25;
const MAX_PERCENT = 150;

/** Plays a song on the audio clock. Always `dispose()` it when the screen goes away. */
export class SongPlayer {
  readonly timeline: SongTimeline;
  readonly transport: Transport;
  private readonly events: PlayEvent[];
  private readonly output: SongPlayerOutput;
  /** Ticks of silence before a pickup bar, so the transport's first bar is a whole bar. */
  private readonly offset: number;
  private readonly listeners = new Set<(e: SongPlayerEvent) => void>();
  private readonly muted = new Set<string>();
  private readonly solo = new Set<string>();
  private readonly offs: Array<() => void> = [];
  private percent = 100;
  private cursor = 0;
  private stateNow: PlayerState = 'stopped';
  private ramp: TempoRamp | null = null;
  private loopTicks: { start: number; end: number } | null = null;
  private passes = 0;
  private rangeEnd: number | null = null;
  /** Metronome click on every beat. */
  metronome: boolean;
  /** Bars of count-in before playing from a stop. */
  countInBars: number;

  constructor(readonly song: Song, opts: SongPlayerOptions = {}) {
    this.timeline = flattenSong(song);
    this.events = buildPlayEvents(this.timeline, opts);
    this.output = opts.output ?? liveOutput();
    this.metronome = opts.metronome ?? false;
    this.countInBars = opts.countInBars ?? 1;
    const first = this.timeline.bars[0];
    this.offset = first ? barCapacity(first.time) - first.length : 0;
    this.transport = new Transport({
      clock: opts.clock ?? engineClock, bpm: this.timeline.tempo.points[0]?.bpm ?? 120,
      timeSignature: first?.time ?? { numerator: 4, denominator: 4 }, timer: opts.timer, ...(opts.lookahead ? { lookahead: opts.lookahead } : {}),
    });
    const meters: Array<{ bar: number; timeSignature: { numerator: number; denominator: number } }> = [];
    for (const b of this.timeline.bars) {
      const prev = meters[meters.length - 1];
      if (!prev || prev.timeSignature.numerator !== b.time.numerator || prev.timeSignature.denominator !== b.time.denominator) meters.push({ bar: b.index, timeSignature: { ...b.time } });
    }
    this.transport.setMeters(meters);
    const points = this.timeline.tempo.points.map((p) => ({ tick: p.tick + (p.tick > 0 ? this.offset : 0), bpm: p.bpm, ramp: !!p.ramp }));
    this.transport.setTempoMap(points);
    this.transport.setEnd(this.timeline.totalTicks + this.offset);
    this.transport.addSource({ collect: (from, to, add) => this.collect(from, to, add) });
    this.offs.push(
      this.transport.on('beat', (e) => {
        if (e.countIn) {
          this.output.click(e.downbeat ? 'accent' : 'beat', e.time);
          this.transport.scheduleVisual(e.time, () => this.emit({ type: 'countin', beat: e.beat, beats: e.beatsInBar, time: e.time }));
        } else if (this.metronome) {
          this.output.click(e.accent >= 3 ? 'accent' : e.accent === 2 ? 'medium' : 'beat', e.time);
        }
      }),
      this.transport.onVisual('bar', (e) => {
        const b = this.timeline.bars[e.bar];
        if (b) this.emit({ type: 'bar', index: b.index, bar: b.bar, time: e.time });
      }),
      this.transport.on('loop', (e) => this.onLoop(e.count)),
      this.transport.on('end', () => this.onEnd()),
      this.transport.on('stop', () => {
        if (this.stateNow === 'playing' && this.rangeEnd === null) this.setState('stopped');
      }),
    );
  }

  // ── listeners ─────────────────────────────────────────────────────────────────────────────

  /** Listen to beats (as heard), bars, count-in, state, loop, tempo and the end. Returns the unsubscribe function. */
  subscribe(fn: (e: SongPlayerEvent) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(e: SongPlayerEvent): void {
    for (const fn of [...this.listeners]) {
      try {
        fn(e);
      } catch (err) {
        // One broken screen listener must not stop the music.
        if (typeof console !== 'undefined') console.error('[song] listener failed', err);
      }
    }
  }

  private setState(s: PlayerState): void {
    if (this.stateNow === s) return;
    this.stateNow = s;
    this.emit({ type: 'state', state: s });
  }

  // ── scheduling ────────────────────────────────────────────────────────────────────────────

  private collect(from: number, to: number, add: (tick: number, fire: (time: number, tick: number) => void) => void): void {
    const a = from - this.offset;
    const b = to - this.offset;
    for (let i = lowerBound(this.events, a); i < this.events.length && this.events[i].tick < b; i++) {
      const e = this.events[i];
      add(e.tick + this.offset, (time) => this.fire(e, time));
    }
    const beats = this.timeline.beats;
    for (let i = lowerBound(beats, a); i < beats.length && beats[i].tick < b; i++) {
      const beat = beats[i];
      add(beat.tick + this.offset, (time) => this.transport.scheduleVisual(time, () => this.emit({ type: 'beat', beat, time })));
    }
  }

  private fire(e: PlayEvent, time: number): void {
    if (!this.isAudible(e.track)) return;
    const seconds = (this.timeline.secondsAt(e.tick + e.ticks) - this.timeline.secondsAt(e.tick)) / (this.percent / 100);
    if (e.kind === 'note') this.output.note(e, time, seconds);
    else this.output.strum(e, time, seconds);
  }

  private onLoop(count: number): void {
    this.passes = count;
    if (this.ramp) {
      const every = Math.max(1, this.ramp.every ?? 1);
      if (count % every === 0) this.applyPercent(Math.min(this.ramp.target, this.percent + this.ramp.step));
    }
    this.emit({ type: 'loop', count, tempoPercent: this.percent });
  }

  private onEnd(): void {
    if (this.rangeEnd !== null) {
      const tick = this.rangeEnd;
      this.rangeEnd = null;
      this.transport.setEnd(this.timeline.totalTicks + this.offset);
      this.cursor = tick;
      this.setState('paused');
      this.emit({ type: 'range-end', tick });
      return;
    }
    this.cursor = this.loopTicks?.start ?? 0;
    this.setState('stopped');
    this.emit({ type: 'end' });
  }

  // ── controls ──────────────────────────────────────────────────────────────────────────────

  /** Current run state. */
  get state(): PlayerState {
    return this.stateNow;
  }

  /** Render the notes the song needs (call once after the first user gesture, before playing). */
  async prepare(): Promise<void> {
    await this.output.preload?.(this.events);
  }

  /** Play from where the cursor is (with the count-in from a stop), or carry on after a pause. */
  play(): void {
    if (this.stateNow === 'playing') return;
    if (this.stateNow === 'paused' && this.transport.state === 'paused') {
      this.transport.start();
    } else {
      // From a stop (or after a played range, where the transport has rewound itself): start at the cursor.
      const fromStop = this.stateNow === 'stopped';
      const from = this.loopTicks && (this.cursor < this.loopTicks.start || this.cursor >= this.loopTicks.end) ? this.loopTicks.start : this.cursor;
      this.transport.start({ from: from + this.offset, countIn: fromStop ? this.countInBars : 0 });
    }
    this.setState('playing');
  }

  /** Stop where we are; `play()` carries on from here. */
  pause(): void {
    if (this.stateNow !== 'playing') return;
    this.cursor = this.position().tick;
    this.transport.pause();
    this.output.stopAll();
    this.setState('paused');
  }

  /** Stop and go back to the start (or to the loop start). */
  stop(): void {
    this.transport.stop();
    this.output.stopAll();
    this.rangeEnd = null;
    this.transport.setEnd(this.timeline.totalTicks + this.offset);
    this.cursor = this.loopTicks?.start ?? 0;
    this.transport.seek(this.cursor + this.offset);
    this.setState('stopped');
  }

  /** Play or pause (the Space key). */
  toggle(): void {
    if (this.stateNow === 'playing') this.pause();
    else this.play();
  }

  /** Jump to a song tick (absolute, playback order). */
  seek(tick: number): void {
    const t = Math.max(0, Math.min(this.timeline.totalTicks, Math.round(tick)));
    this.cursor = t;
    if (this.stateNow === 'playing') this.output.stopAll();
    this.transport.seek(t + this.offset);
  }

  /** Jump to the start of a song bar (its first time through). */
  seekBar(bar: number): void {
    const i = this.timeline.firstIndexOf(bar);
    if (i >= 0) this.seek(this.timeline.bars[i].start);
  }

  /** Practice tempo, 25–150 % of the written tempo. */
  get tempoPercent(): number {
    return this.percent;
  }

  set tempoPercent(p: number) {
    this.ramp = null;
    this.applyPercent(p);
  }

  private applyPercent(p: number): void {
    if (!Number.isFinite(p)) return;
    const next = Math.max(MIN_PERCENT, Math.min(MAX_PERCENT, Math.round(p)));
    if (next === this.percent) return;
    this.percent = next;
    this.transport.setTempoScale(next / 100);
    this.emit({ type: 'tempo', percent: next });
  }

  /** The tempo in quarter notes per minute right now (practice percent included). */
  get bpm(): number {
    return this.timeline.tempo.bpmAt(this.position().tick) * (this.percent / 100);
  }

  /**
   * Loop song bars `fromBar` to `toBar` (inclusive): the first time `toBar` is played, from the last
   * time through `fromBar` before it (so a repeat in between is not looped twice). With `ramp`, the
   * first pass is at `ramp.start` % and every `ramp.every` passes the tempo goes up by `ramp.step`
   * until `ramp.target`.
   */
  setLoop(fromBar: number, toBar: number, opts: { ramp?: TempoRamp } = {}): void {
    const lo = Math.min(fromBar, toBar);
    const hi = Math.max(fromBar, toBar);
    const first = this.timeline.firstIndexOf(lo);
    if (first < 0) return;
    const bIndex = this.timeline.bars.find((b) => b.index >= first && b.bar === hi)?.index ?? first;
    // The shortest stretch as played: with repeats in between, start from the last time through `fromBar` before the end.
    let a = first;
    for (const b of this.timeline.bars) if (b.bar === lo && b.index <= bIndex) a = b.index;
    const start = this.timeline.bars[a].start;
    const endBar = this.timeline.bars[bIndex];
    this.setLoopTicks(start, endBar.start + endBar.length);
    if (opts.ramp) {
      this.applyPercent(opts.ramp.start);
      this.ramp = { ...opts.ramp };
    }
  }

  /** Loop an exact tick range [start, end). */
  setLoopTicks(start: number, end: number): void {
    const s = Math.max(0, Math.min(start, end));
    const e = Math.min(this.timeline.totalTicks, Math.max(start, end));
    if (e <= s) return;
    this.loopTicks = { start: s, end: e };
    this.passes = 0;
    this.transport.setLoop(s + this.offset, e + this.offset);
  }

  /** Stop looping. */
  clearLoop(): void {
    this.loopTicks = null;
    this.ramp = null;
    this.transport.clearLoop();
  }

  /** The loop region in song ticks, or null. */
  get loop(): { start: number; end: number; passes: number } | null {
    return this.loopTicks ? { ...this.loopTicks, passes: this.passes } : null;
  }

  /** Silence or unsilence a track (by id). */
  setTrackMuted(trackId: string, muted: boolean): void {
    if (muted) this.muted.add(trackId);
    else this.muted.delete(trackId);
  }

  /** Solo a track (several may be soloed). */
  setTrackSolo(trackId: string, solo: boolean): void {
    if (solo) this.solo.add(trackId);
    else this.solo.delete(trackId);
  }

  /** True when a track is heard with the current mute and solo settings. */
  isAudible(trackId: string): boolean {
    return this.solo.size ? this.solo.has(trackId) : !this.muted.has(trackId);
  }

  /**
   * Play from `fromTick` up to `toTick` and pause there (wait mode: play up to the next note the
   * learner has to play). A `range-end` event follows.
   */
  playRange(fromTick: number, toTick: number, opts: { countIn?: boolean } = {}): void {
    if (toTick <= fromTick) return;
    this.transport.stop();
    this.output.stopAll();
    this.rangeEnd = Math.min(this.timeline.totalTicks, toTick);
    this.transport.setEnd(this.rangeEnd + this.offset);
    this.cursor = fromTick;
    this.transport.start({ from: fromTick + this.offset, countIn: opts.countIn ? this.countInBars : 0 });
    this.setState('playing');
  }

  // ── where are we ──────────────────────────────────────────────────────────────────────────

  /** Where the music is right now, as heard (call from requestAnimationFrame for a cursor). */
  position(time?: number): PlayerPosition {
    const p = this.transport.position(time);
    const playing = this.stateNow === 'playing';
    const tick = playing && !p.countIn ? Math.max(0, Math.min(this.timeline.totalTicks, p.absTick - this.offset)) : this.cursor;
    const at = this.timeline.locate(tick);
    return {
      state: this.stateNow, tick, sec: this.timeline.secondsAt(tick), index: at.index, bar: at.bar, pass: at.pass, beat: at.beat, barProgress: at.barProgress,
      countIn: p.countIn ? { beat: p.countIn.beat, beats: p.countIn.beatsInBar } : null,
    };
  }

  /** The beat of a track sounding now (for the fretboard), or null in a gap. */
  beatNow(trackId: string, time?: number): TimelineBeat | null {
    return this.timeline.beatAt(trackId, this.position(time).tick);
  }

  /**
   * Song time in seconds at the practice tempo for an audio-clock time (what FlowMode judges in):
   * pass the `time` of a pitch event that runs on the same clock.
   */
  songTimeAt(audioTime: number): number {
    const tick = this.transport.tickAt(audioTime) - this.offset;
    // Before the first note (the silent start of a pickup bar) time runs at the first tempo.
    const sec = tick >= 0 ? this.timeline.secondsAt(tick) : (tick * 60) / (PPQ * (this.timeline.tempo.points[0]?.bpm ?? 120));
    return sec / (this.percent / 100);
  }

  /** Stop, silence and release everything. The player cannot be used afterwards. */
  dispose(): void {
    this.output.stopAll();
    for (const off of this.offs) off();
    this.transport.dispose();
    this.listeners.clear();
  }
}

function lowerBound(list: ReadonlyArray<{ tick: number }>, tick: number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].tick < tick) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The metronome: click patterns for any meter (simple, compound, odd with grouping), per-beat
 * accents, subdivisions, tap tempo, a speed trainer and "silent bars", all running on a Transport.
 *
 * The musical decisions are pure functions (`clickPattern`, `speedTrainerBpm`, `isSilentBar`,
 * `TapTempo`) so they are tested without audio; `Metronome` wires them to the clock and the clicks.
 */
import { engineClock } from './engine';
import type { ClickLevel, ClickSet } from './percussion';
import { PPQ, defaultAccents, resolveMeter, type AccentLevel, type Meter, type TimeSignature } from './timeline';
import { Transport, type TransportClock, type TransportPosition } from './transport';
import { playClick, preloadClicks } from './voices';

/** How each beat is divided by extra, softer clicks. */
export type Subdivision = 'none' | 'eighth' | 'triplet' | 'sixteenth' | 'swing' | 'quintuplet' | 'sextuplet';

/** All subdivisions, for a picker. */
export const SUBDIVISIONS: readonly Subdivision[] = ['none', 'eighth', 'triplet', 'sixteenth', 'swing', 'quintuplet', 'sextuplet'];

/** One click of a bar. */
export interface Click {
  /** Ticks from the start of the bar. */
  tick: number;
  /** Beat this click belongs to (0-based). */
  beat: number;
  /** 0 = on the beat, 1.. = subdivision index inside the beat. */
  sub: number;
  /** Sound to play; null = a silenced beat (still reported to the UI). */
  level: ClickLevel | null;
}

const NOTE_TICKS: Record<Exclude<Subdivision, 'none' | 'swing'>, number> = {
  eighth: PPQ / 2,
  triplet: PPQ / 3,
  sixteenth: PPQ / 4,
  quintuplet: PPQ / 5,
  sextuplet: PPQ / 6,
};

/** Offsets (ticks from the beat) of the subdivision clicks inside a beat of `length` ticks. */
export function subdivisionOffsets(length: number, subdivision: Subdivision, swingRatio = 2 / 3): number[] {
  if (subdivision === 'none') return [];
  if (subdivision === 'swing') {
    // Swing pairs up eighths inside each quarter note; beats that are not whole quarters fall back
    // to plain eighths (a dotted-quarter beat already swings by itself).
    if (length % PPQ !== 0) return subdivisionOffsets(length, 'eighth');
    const out: number[] = [];
    for (let q = 0; q * PPQ < length; q++) {
      if (q > 0) out.push(q * PPQ);
      out.push(q * PPQ + swingRatio * PPQ);
    }
    return out;
  }
  let parts = length / NOTE_TICKS[subdivision];
  if (Math.abs(parts - Math.round(parts)) > 1e-6) parts = length / NOTE_TICKS.eighth; // e.g. triplets in 6/8
  if (Math.abs(parts - Math.round(parts)) > 1e-6) return [];
  parts = Math.round(parts);
  if (parts < 2) return [];
  const out: number[] = [];
  for (let i = 1; i < parts; i++) out.push((i * length) / parts);
  return out;
}

const LEVEL_OF: Record<AccentLevel, ClickLevel | null> = { 0: null, 1: 'beat', 2: 'medium', 3: 'accent' };

/**
 * Every click of one bar. `accents` gives a level per beat (0 mute, 1 beat, 2 medium, 3 strong);
 * missing entries use the meter's defaults.
 */
export function clickPattern(meter: Meter, accents: readonly AccentLevel[] | undefined, subdivision: Subdivision, swingRatio = 2 / 3): Click[] {
  const clicks: Click[] = [];
  meter.beats.forEach((b, beat) => {
    const accent = accents && accents[beat] !== undefined ? accents[beat] : b.accent;
    clicks.push({ tick: b.tick, beat, sub: 0, level: LEVEL_OF[accent] });
    subdivisionOffsets(b.length, subdivision, swingRatio).forEach((offset, i) => {
      clicks.push({ tick: b.tick + offset, beat, sub: i + 1, level: 'sub' });
    });
  });
  return clicks;
}

/** Speed trainer: raise (or lower) the tempo by `stepBpm` every `everyBars` bars until `targetBpm`. */
export interface SpeedTrainerConfig {
  startBpm: number;
  targetBpm: number;
  stepBpm: number;
  everyBars: number;
}

/** Tempo the speed trainer asks for after `barsElapsed` complete bars. */
export function speedTrainerBpm(cfg: SpeedTrainerConfig, barsElapsed: number): number {
  const steps = Math.floor(Math.max(0, barsElapsed) / Math.max(1, Math.round(cfg.everyBars)));
  const step = Math.abs(cfg.stepBpm);
  if (cfg.targetBpm >= cfg.startBpm) return Math.min(cfg.targetBpm, cfg.startBpm + steps * step);
  return Math.max(cfg.targetBpm, cfg.startBpm - steps * step);
}

/** Bars after which the speed trainer has reached its target. */
export function speedTrainerLength(cfg: SpeedTrainerConfig): number {
  const step = Math.abs(cfg.stepBpm);
  if (step === 0) return 0;
  return Math.ceil(Math.abs(cfg.targetBpm - cfg.startBpm) / step) * Math.max(1, Math.round(cfg.everyBars));
}

/** Silent bars: click for `playBars`, then stay silent for `muteBars`, and repeat. */
export interface SilentBarsConfig {
  playBars: number;
  muteBars: number;
}

/** True when the click is muted in bar `barIndex` (0-based from the start). */
export function isSilentBar(cfg: SilentBarsConfig | null | undefined, barIndex: number): boolean {
  if (!cfg || cfg.muteBars <= 0 || cfg.playBars <= 0) return false;
  const cycle = cfg.playBars + cfg.muteBars;
  return ((barIndex % cycle) + cycle) % cycle >= cfg.playBars;
}

/** Tempo limits of the metronome, in beats per minute of its tempo beat. */
export const MIN_TEMPO = 20;
export const MAX_TEMPO = 400;

/** Tap tempo: feed it tap times, get the tempo. Forgets the run after a pause. */
export class TapTempo {
  private taps: number[] = [];
  /** `timeoutMs`: a gap this long starts a new run (default 2000). `window`: taps averaged (default 6). */
  constructor(private readonly timeoutMs = 2000, private readonly window = 6) {}

  /** Register a tap at `nowMs` (default: performance.now()). Returns the tempo, or null on the first tap. */
  tap(nowMs: number = typeof performance !== 'undefined' ? performance.now() : Date.now()): number | null {
    const last = this.taps[this.taps.length - 1];
    if (last !== undefined && nowMs - last > this.timeoutMs) this.taps = [];
    this.taps.push(nowMs);
    if (this.taps.length > this.window + 1) this.taps.shift();
    return this.bpm;
  }

  /** Current estimate, or null with fewer than two taps. */
  get bpm(): number | null {
    if (this.taps.length < 2) return null;
    const gaps: number[] = [];
    for (let i = 1; i < this.taps.length; i++) gaps.push(this.taps[i] - this.taps[i - 1]);
    // A fumbled tap should not wreck the reading: ignore gaps far from the median.
    const sorted = gaps.slice().sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    const good = gaps.filter((g) => g > median * 0.6 && g < median * 1.6);
    const mean = good.reduce((a, b) => a + b, 0) / good.length;
    return Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, 60000 / mean));
  }

  /** Number of taps in the current run. */
  get count(): number {
    return this.taps.length;
  }

  reset(): void {
    this.taps = [];
  }
}

/** What the UI is told about every beat. */
export interface MetronomeBeat {
  /** Audio-clock time of the beat. */
  time: number;
  /** Bars since the metronome started (negative during the count-in). */
  bar: number;
  beat: number;
  beatsInBar: number;
  accent: AccentLevel;
  /** The click that was played, or null when this beat is muted or the bar is a silent bar. */
  level: ClickLevel | null;
  /** True during a "silent bars" bar. */
  silent: boolean;
  countIn: boolean;
  /** Tempo at this beat, in the metronome's tempo beat. */
  tempo: number;
}

/** Where the metronome's clicks go; replaceable for tests or a custom sound. */
export interface MetronomeOutput {
  click(set: ClickSet, level: ClickLevel, time: number, gain: number): void;
}

/** Construction options for {@link Metronome}. */
export interface MetronomeOptions {
  /** Follow an existing transport (a song player) instead of owning one. */
  transport?: Transport;
  /** Clock for the metronome's own transport (default: the shared engine). */
  clock?: TransportClock;
  output?: MetronomeOutput;
  /** `manual` for tests: no timer, the caller drives the transport. */
  timer?: 'interval' | 'manual';
  tempo?: number;
  timeSignature?: TimeSignature | string;
}

/** A complete practice metronome. */
export class Metronome {
  /** The transport the metronome runs on. */
  readonly transport: Transport;
  /** Click sound set. */
  sound: ClickSet = 'woodblock';
  /** Click volume 0..1.5. */
  volume = 1;
  /** Swing ratio used by the `swing` subdivision (0.5 straight .. 0.75 hard; default triplet feel). */
  swingRatio = 2 / 3;
  /** Raise the tempo automatically; null = off. Takes effect at the next start. */
  speedTrainer: SpeedTrainerConfig | null = null;
  /** Mute the click for some bars to test your inner clock; null = off. */
  silentBars: SilentBarsConfig | null = null;

  private readonly owns: boolean;
  private readonly output: MetronomeOutput;
  private ts: TimeSignature;
  private meterInfo: Meter;
  private accentLevels: AccentLevel[];
  private division: Subdivision = 'none';
  private tempoBpm: number;
  private startBar = 0;
  private readonly tapper = new TapTempo();
  private readonly beatListeners = new Set<(b: MetronomeBeat) => void>();
  private readonly clickListeners = new Set<(b: MetronomeBeat) => void>();
  private readonly unsubscribe: Array<() => void> = [];
  private sourceId = 0;
  private active = false;

  constructor(opts: MetronomeOptions = {}) {
    this.owns = !opts.transport;
    this.ts = typeof opts.timeSignature === 'string' ? resolveMeterSignature(opts.timeSignature) : opts.timeSignature ?? { numerator: 4, denominator: 4 };
    this.meterInfo = resolveMeter(this.ts);
    this.accentLevels = defaultAccents(this.meterInfo);
    this.tempoBpm = clampTempo(opts.tempo ?? 100);
    this.output = opts.output ?? { click: (set, level, time, gain) => playClick(set, level, time, gain) };
    this.transport = opts.transport ?? new Transport({ clock: opts.clock ?? engineClock, timer: opts.timer, timeSignature: this.ts, bpm: this.quarterBpm() });
    if (!this.owns) {
      this.meterInfo = this.transport.meter;
      this.accentLevels = defaultAccents(this.meterInfo);
    }
  }

  // --- tempo -----------------------------------------------------------------------------------

  private quarterBpm(bpm: number = this.tempoBpm): number {
    return (bpm * this.meterInfo.tempoBeatTicks) / PPQ;
  }

  /** Tempo in beats per minute of the meter's tempo beat (a dotted quarter in 6/8). */
  get tempo(): number {
    return this.owns ? this.tempoBpm : (this.transport.bpm * PPQ) / this.transport.meter.tempoBeatTicks;
  }

  /** Set the tempo (20..400). Applies immediately, also while running. */
  setTempo(bpm: number): void {
    this.tempoBpm = clampTempo(bpm);
    if (this.owns) this.transport.setTempo(this.quarterBpm());
  }

  /** Length in ticks of the note the tempo counts (960 = quarter, 1440 = dotted quarter). */
  get tempoBeatTicks(): number {
    return this.meterInfo.tempoBeatTicks;
  }

  /** Register a tap; from the second tap on the tempo follows. Returns the tapped tempo or null. */
  tap(nowMs?: number): number | null {
    const bpm = this.tapper.tap(nowMs);
    if (bpm !== null) this.setTempo(Math.round(bpm));
    return bpm;
  }

  // --- meter and accents -----------------------------------------------------------------------

  get timeSignature(): TimeSignature {
    return { ...this.ts, grouping: this.meterInfo.grouping.slice() };
  }

  /** The resolved meter (beats, lengths, grouping). */
  get meter(): Meter {
    return this.meterInfo;
  }

  /**
   * Change the time signature ("7/8", or an object with a grouping). Accents return to the
   * meter's defaults. A running metronome restarts on a downbeat.
   */
  setTimeSignature(ts: TimeSignature | string): void {
    this.ts = typeof ts === 'string' ? resolveMeterSignature(ts) : { ...ts };
    this.meterInfo = resolveMeter(this.ts);
    this.accentLevels = defaultAccents(this.meterInfo);
    if (!this.owns) return;
    const wasRunning = this.running;
    if (wasRunning) this.stop();
    this.transport.setTimeSignature(this.ts);
    this.transport.setTempo(this.quarterBpm());
    if (wasRunning) this.start({ countIn: 0 });
  }

  /** Accent level of every beat (0 mute, 1 beat, 2 medium, 3 strong). */
  get accents(): AccentLevel[] {
    return this.accentLevels.slice();
  }

  setAccents(levels: readonly AccentLevel[]): void {
    this.accentLevels = this.meterInfo.beats.map((b, i) => levels[i] ?? b.accent);
  }

  setAccent(beat: number, level: AccentLevel): void {
    if (beat >= 0 && beat < this.accentLevels.length) this.accentLevels[beat] = level;
  }

  /** Step a beat's accent 1 -> 2 -> 3 -> 0 -> 1 (tap a beat dot in the UI). Returns the new level. */
  cycleAccent(beat: number): AccentLevel {
    const next = ((this.accentLevels[beat] ?? 1) + 1) % 4 as AccentLevel;
    this.setAccent(beat, next);
    return next;
  }

  get subdivision(): Subdivision {
    return this.division;
  }

  set subdivision(s: Subdivision) {
    this.division = s;
  }

  /** The clicks of one bar with the current settings (for drawing the pattern). */
  pattern(): Click[] {
    return clickPattern(this.meterInfo, this.accentLevels, this.division, this.swingRatio);
  }

  // --- running ---------------------------------------------------------------------------------

  get running(): boolean {
    return this.active && this.transport.state === 'playing';
  }

  /** Bars of count-in before the first bar (owned transport only). */
  get countInBars(): number {
    return this.transport.countInBars;
  }

  set countInBars(bars: number) {
    this.transport.countInBars = Math.max(0, Math.round(bars));
  }

  /** Start clicking. With a followed transport this only arms the click; the transport's owner starts it. */
  start(opts: { countIn?: number } = {}): void {
    if (this.active) return;
    this.active = true;
    this.attach();
    if (!this.owns) return;
    try {
      preloadClicks(this.sound);
    } catch {
      // No audio (tests with a stub output): nothing to preload.
    }
    if (this.speedTrainer) this.setTempo(this.speedTrainer.startBpm);
    this.transport.start({ from: 0, countIn: opts.countIn });
  }

  /** Stop clicking (and stop the transport when the metronome owns it). */
  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.detach();
    if (this.owns) this.transport.stop();
  }

  /** Start if stopped, stop if running. Returns the new running state. */
  toggle(): boolean {
    if (this.active) this.stop();
    else this.start();
    return this.active;
  }

  /** Where the click is right now, for a pendulum or a moving dot (`beatProgress` is 0..1). */
  position(): TransportPosition {
    return this.transport.position();
  }

  /** Called on every beat at the moment it is heard. Returns an unsubscribe function. */
  onBeat(fn: (beat: MetronomeBeat) => void): () => void {
    this.beatListeners.add(fn);
    return () => {
      this.beatListeners.delete(fn);
    };
  }

  /** Called for every beat ahead of time, with its audio-clock time (to trigger extra sound). */
  onSchedule(fn: (beat: MetronomeBeat) => void): () => void {
    this.clickListeners.add(fn);
    return () => {
      this.clickListeners.delete(fn);
    };
  }

  /** Stop and release the transport (when owned) and all listeners. */
  dispose(): void {
    this.stop();
    this.beatListeners.clear();
    this.clickListeners.clear();
    if (this.owns) this.transport.dispose();
  }

  private report(beat: MetronomeBeat): void {
    for (const fn of [...this.clickListeners]) fn(beat);
    if (this.beatListeners.size) {
      this.transport.scheduleVisual(beat.time, () => {
        for (const fn of [...this.beatListeners]) fn(beat);
      });
    }
  }

  private attach(): void {
    const tr = this.transport;
    this.unsubscribe.push(
      tr.on('start', (e) => {
        this.startBar = tr.timeline.positionOf(e.tick).bar;
      }),
      tr.on('bar', (e) => {
        if (!this.owns || !this.speedTrainer) return;
        const bpm = speedTrainerBpm(this.speedTrainer, e.bar - this.startBar);
        if (Math.abs(bpm - this.tempoBpm) > 1e-9) this.setTempo(bpm);
      }),
      tr.on('beat', (e) => {
        if (!e.countIn) return;
        const level: ClickLevel = e.downbeat ? 'accent' : 'beat';
        this.output.click(this.sound, level, e.time, this.volume);
        this.report({ time: e.time, bar: e.bar, beat: e.beat, beatsInBar: e.beatsInBar, accent: e.accent, level, silent: false, countIn: true, tempo: this.tempo });
      }),
    );
    this.startBar = tr.position().bar;
    this.sourceId = tr.addSource({
      collect: (from, to, add) => {
        const tl = tr.timeline;
        for (let bar = tl.positionOf(from).bar; ; bar++) {
          const start = tl.barStart(bar);
          if (start >= to) break;
          const meter = this.owns ? this.meterInfo : tl.meterOfBar(bar);
          const accents = this.accentLevels.length === meter.beats.length ? this.accentLevels : undefined;
          const barIndex = bar - this.startBar;
          for (const c of clickPattern(meter, accents, this.division, this.swingRatio)) {
            const tick = start + c.tick;
            if (tick < from || tick >= to) continue;
            add(tick, (time) => {
              const silent = isSilentBar(this.silentBars, barIndex);
              const level = silent ? null : c.level;
              if (level) this.output.click(this.sound, level, time, this.volume);
              if (c.sub === 0) {
                const accent = (accents ? accents[c.beat] : meter.beats[c.beat].accent) ?? 1;
                this.report({ time, bar: barIndex, beat: c.beat, beatsInBar: meter.beats.length, accent, level, silent, countIn: false, tempo: this.tempo });
              }
            });
          }
        }
      },
    });
  }

  private detach(): void {
    for (const off of this.unsubscribe.splice(0)) off();
    if (this.sourceId) this.transport.clear(this.sourceId);
    this.sourceId = 0;
  }
}

function clampTempo(bpm: number): number {
  return Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, bpm));
}

function resolveMeterSignature(text: string): TimeSignature {
  const m = resolveMeter(text);
  return { numerator: m.numerator, denominator: m.denominator, grouping: m.grouping };
}

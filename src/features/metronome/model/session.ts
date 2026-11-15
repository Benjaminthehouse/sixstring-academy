/**
 * The live metronome behind the screen: one engine `Metronome` (it does all the timing, accents,
 * subdivisions, speed trainer and silent bars), configured from the learner's settings, plus what
 * the screen adds around it: visual-only mode, vibration, practice time and the session timer.
 *
 * Framework-free so it can be driven without React. The screen creates one per visit and detaches
 * it on leaving (stopped, it holds no timer or listener outside itself, so nothing is left behind).
 * `currentSession()` hands it to the browser check (`e2e/metronome.cjs`), which imports this module
 * and listens to the clicks it sends to the speakers.
 */
import { Metronome, playClick, unlockAudio, type ClickLevel, type ClickSet, type MetronomeBeat, type TransportClock } from '@/core/audio';
import { meterOf, parseMeterKey, meterKey } from './meters';
import { accentsOf, type MetronomeSettings } from './settings';
import { gapConfig, trainerConfig } from './trainer';

/** One click handed to the output (for tests and for anyone who wants to see every click). */
export interface SessionClick {
  /** Audio-clock time the click is heard. */
  time: number;
  level: ClickLevel;
  /** False in visual-only mode: the click was not played. */
  audible: boolean;
}

/** How long the learner has run the metronome, and the session timer. */
export interface SessionTime {
  /** Seconds of running in this visit. */
  visitSec: number;
  /** Seconds counted by the session timer since it was last reset. */
  timerSec: number;
}

type Listener<T> = (value: T) => void;

/** Construction options; the defaults are the real thing, tests swap in a manual clock. */
export interface SessionOptions {
  /** Wall clock in milliseconds, for practice time. */
  now?: () => number;
  /** Audio clock for the metronome's transport (default: the shared engine). */
  clock?: TransportClock;
  /** `manual`: no timer, the test drives `metronome.transport`. */
  timer?: 'interval' | 'manual';
  /** Plays one click and may return a take-back function (default: the engine's `playClick`). */
  play?: (set: ClickSet, level: ClickLevel, time: number, gain: number) => unknown;
  /** Wake the audio inside the start gesture (default: `unlockAudio`). */
  unlock?: () => void;
}

let active: MetronomeSession | null = null;

/** The session the metronome screen is using right now, or null when the screen is not open. */
export function currentSession(): MetronomeSession | null {
  return active;
}

/** The metronome screen's engine room. */
export class MetronomeSession {
  /** The engine metronome. Read-only use outside this class (events, position). */
  readonly metronome: Metronome;
  private visual = false;
  private vibrateOn = false;
  private readonly clickListeners = new Set<Listener<SessionClick>>();
  private readonly runListeners = new Set<Listener<boolean>>();
  private appliedMeter = '';
  private appliedTrainer = '';
  private runStartedAt: number | null = null;
  private visitMs = 0;
  private timerMs = 0;
  private readonly offBeat: () => void;
  private disposed = false;
  private readonly now: () => number;
  private readonly unlock: () => void;

  constructor(opts: SessionOptions = {}) {
    this.now = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.unlock = opts.unlock ?? (() => void unlockAudio().catch(() => undefined));
    const play = opts.play ?? ((set: ClickSet, level: ClickLevel, time: number, gain: number) => playClick(set, level, time, gain));
    this.metronome = new Metronome({
      clock: opts.clock,
      timer: opts.timer,
      output: {
        click: (set: ClickSet, level: ClickLevel, time: number, gain: number) => {
          const audible = !this.visual;
          const takeBack = audible ? play(set, level, time, gain) : undefined;
          for (const fn of [...this.clickListeners]) fn({ time, level, audible });
          return takeBack;
        },
      },
    });
    this.offBeat = this.metronome.onBeat((b) => this.buzz(b));
  }

  /** The screen is showing this session (it becomes `currentSession()`). */
  attach(): void {
    if (!this.disposed) active = this;
  }

  /**
   * The screen is going away: stop clicking at once. The session stays usable, because React's
   * strict mode detaches and re-attaches the same session when a screen first mounts.
   */
  detach(): void {
    this.stop();
    if (active === this) active = null;
  }

  /** True while clicking. */
  get running(): boolean {
    return this.metronome.running;
  }

  /**
   * Make the metronome match the settings. Cheap to call on every change: the time signature and
   * the speed trainer are only touched when they really changed (both restart a running bar).
   */
  configure(settings: MetronomeSettings, sound: ClickSet): void {
    const m = this.metronome;
    const ts = parseMeterKey(settings.meter) ?? { numerator: 4, denominator: 4 };
    const key = meterKey(ts);
    if (key !== this.appliedMeter) {
      this.appliedMeter = key;
      // A running metronome restarts on a downbeat: say so to whoever shows the running state.
      m.setTimeSignature(ts);
    }
    m.setAccents(accentsOf(settings));
    m.subdivision = settings.subdivision;
    m.swingRatio = settings.swing;
    m.sound = sound;
    m.volume = settings.volume;
    m.countInBars = settings.countIn;
    m.silentBars = gapConfig(settings.gap);
    this.visual = settings.visualOnly;
    this.vibrateOn = settings.vibrate;

    const trainer = trainerConfig(settings.trainer);
    const trainerKey = trainer ? JSON.stringify(trainer) : '';
    if (trainerKey !== this.appliedTrainer) {
      this.appliedTrainer = trainerKey;
      m.speedTrainer = trainer;
      // The engine reads the trainer when it starts: a new climb while running starts from its first bar.
      // (Switching it off needs no restart: the tempo below simply takes over.)
      if (trainer && m.running) {
        m.stop();
        m.start({ countIn: 0 });
      }
    }
    // While the trainer runs it owns the tempo.
    if (!(trainer && m.running)) m.setTempo(settings.tempo);
  }

  /** Start clicking. Call inside a click, tap or key handler: it also wakes the audio. */
  start(): void {
    if (this.disposed || this.running) return;
    this.unlock();
    this.metronome.start();
    this.runStartedAt = this.now();
    this.emitRun();
  }

  /** Stop clicking; clicks not yet heard are taken back. */
  stop(): void {
    if (!this.metronome.running && this.runStartedAt === null) return;
    this.metronome.stop();
    this.settleTime();
    this.emitRun();
  }

  /** Start or stop. Returns the new running state. */
  toggle(): boolean {
    if (this.running) this.stop();
    else this.start();
    return this.running;
  }

  /** Register a tap (pass the event's timeStamp for accuracy). Returns the tapped tempo or null on the first tap. */
  tap(atMs?: number): number | null {
    return this.metronome.tap(atMs);
  }

  /** Practice time so far. */
  time(): SessionTime {
    const live = this.runStartedAt === null ? 0 : Math.max(0, this.now() - this.runStartedAt);
    return { visitSec: (this.visitMs + live) / 1000, timerSec: (this.timerMs + live) / 1000 };
  }

  /** Start the session timer from zero (practice time of the visit is kept). */
  resetTimer(): void {
    this.settleTime();
    if (this.metronome.running) this.runStartedAt = this.now();
    this.timerMs = 0;
  }

  /** Called with every click sent to the output, at scheduling time (ahead of when it is heard). */
  onClick(fn: Listener<SessionClick>): () => void {
    this.clickListeners.add(fn);
    return () => this.clickListeners.delete(fn);
  }

  /** Called on every beat when it is heard. */
  onBeat(fn: Listener<MetronomeBeat>): () => void {
    return this.metronome.onBeat(fn);
  }

  /** Called when the metronome starts or stops (also when the timer stops it). */
  onRunning(fn: Listener<boolean>): () => void {
    this.runListeners.add(fn);
    return () => this.runListeners.delete(fn);
  }

  /** The number of beats in the configured bar. */
  get beatsInBar(): number {
    return meterOf(this.appliedMeter || '4/4').beats.length;
  }

  /** Stop, release everything, and stop being the current session. */
  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.offBeat();
    this.metronome.dispose();
    this.clickListeners.clear();
    this.runListeners.clear();
    if (active === this) active = null;
  }

  private settleTime(): void {
    if (this.runStartedAt === null) return;
    const ran = Math.max(0, this.now() - this.runStartedAt);
    this.visitMs += ran;
    this.timerMs += ran;
    this.runStartedAt = this.metronome.running ? this.now() : null;
  }

  private emitRun(): void {
    const running = this.running;
    for (const fn of [...this.runListeners]) fn(running);
  }

  /** A short buzz on every beat that clicks, on phones that can (Android browsers; not iOS). */
  private buzz(b: MetronomeBeat): void {
    if (!this.vibrateOn || b.level === null || typeof navigator === 'undefined') return;
    const vibrate = (navigator as Navigator & { vibrate?: (pattern: number) => boolean }).vibrate;
    if (typeof vibrate !== 'function') return;
    try {
      vibrate.call(navigator, b.level === 'accent' ? 45 : 20);
    } catch {
      // Not allowed right now (no recent tap, a frame without permission): carry on silently.
    }
  }
}

/**
 * True where the browser can buzz the device: it has the Vibration API and a touch screen as its
 * main pointer (desktop Chrome has the API too, with nothing to vibrate; iPhones have neither).
 */
export function canVibrate(): boolean {
  if (typeof navigator === 'undefined' || typeof (navigator as Navigator & { vibrate?: unknown }).vibrate !== 'function') return false;
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

/** Least running time in a visit that counts as practice (seconds). */
export const MIN_PRACTICE_SEC = 60;

/** Longest visit credited, so a metronome left on overnight does not count as practice. */
export const MAX_PRACTICE_SEC = 3 * 60 * 60;

/** Seconds of a visit to report to progress, or null when it was too short to count. */
export function practiceSeconds(visitSec: number): number | null {
  if (!(visitSec >= MIN_PRACTICE_SEC)) return null;
  return Math.min(MAX_PRACTICE_SEC, Math.round(visitSec));
}

/**
 * Practice to report now, for a visit that may report more than once (a finished session timer,
 * the page going to the background, leaving the screen): the running time not reported yet, or
 * null when that is still too short to count. `creditedSec` is the visit time already reported.
 */
export function practiceToCredit(visitSec: number, creditedSec: number): number | null {
  return practiceSeconds(visitSec - Math.max(0, creditedSec));
}

/** Seconds left on a session timer of `minutes` after `elapsedSec`; null when there is no timer. */
export function timerRemaining(minutes: number, elapsedSec: number): number | null {
  if (!(minutes > 0)) return null;
  return Math.max(0, minutes * 60 - elapsedSec);
}

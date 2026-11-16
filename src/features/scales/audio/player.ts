/**
 * Plays a scale line on the audio transport, with an optional drone, backing vamp and click, and
 * tells the screen which note is being *heard* (through the transport's visual queue), so the lit
 * dot on the neck moves with the sound rather than with the scheduler.
 *
 *   const player = new ScalePlayer();
 *   player.onStep((i) => setLit(i));                 // -1 when it stops
 *   await player.play({ line, perBeat: 2, bpm: 80, loop: true, accompaniment: 'band', vamp, ... });
 *   player.stop();  player.dispose();
 *
 * Everything audible goes through `@/core/audio`; the dependencies can be swapped for a manual
 * clock in unit tests. `currentPlayer()` exposes the live instance to the browser check.
 */
import {
  BackingBand,
  Metronome,
  Transport,
  engineClock,
  getGuitar,
  normalizeClickSet,
  pluck as enginePluck,
  startDrone as engineDrone,
  type BackingStyleId,
  type ToneName,
  type TransportClock,
} from '@/core/audio';
import { vampBars, SWING_STYLES, type Accompaniment, type Vamp } from '../model/backing';
import { PPQ, timeLine, type LineNote, type NotesPerBeat, type TimedLine } from '../model/play';

/** A note handle the player can silence. */
interface Stoppable {
  stop(when?: number, release?: number): void;
}

/** The band as far as the player needs it. */
export interface BandLike {
  load: BackingBand['load'];
  prepare(): Promise<void>;
  start(opts?: { countIn?: number }): void;
  stop(): void;
  setTempo(bpm: number): void;
  setMuted: BackingBand['setMuted'];
  dispose(): void;
}

/** The click as far as the player needs it. */
export interface ClickLike {
  start(): void;
  stop(): void;
  dispose(): void;
  sound: Metronome['sound'];
}

/** What the player plays through. Defaults: the shared audio engine. */
export interface PlayerDeps {
  clock: TransportClock;
  timer?: 'interval' | 'manual';
  pluck: (midi: number, when: number, opts: { string: number; duration: number; tone: ToneName; velocity: number }) => Stoppable;
  drone: (opts: { root: number; fifth: boolean; volume: number }) => Stoppable;
  /** Make a band on the player's transport (null: no band, e.g. in tests). */
  band: ((transport: Transport) => BandLike) | null;
  click: ((transport: Transport) => ClickLike) | null;
  preload?: (line: readonly LineNote[], tone: ToneName) => Promise<void>;
}

const liveDeps: PlayerDeps = {
  clock: engineClock,
  pluck: (midi, when, opts) => enginePluck(midi, when, opts),
  drone: (opts) => engineDrone({ root: opts.root, fifth: opts.fifth, volume: opts.volume, fadeIn: 0.5 }),
  band: (transport) => new BackingBand({ transport }),
  click: (transport) => new Metronome({ transport }),
  preload: (line, tone) => getGuitar().preload(line.map((n) => ({ midi: n.midi, string: n.string })), { tone }),
};

/** What to play and how. */
export interface PlayRequest {
  line: readonly LineNote[];
  perBeat: NotesPerBeat;
  /** Quarter notes per minute. */
  bpm: number;
  loop: boolean;
  accompaniment: Accompaniment;
  /** The vamp for `band` (ignored otherwise). */
  vamp: Vamp | null;
  /** Backing style (default the vamp's own). */
  style?: BackingStyleId;
  /** The drone's root (MIDI) and whether it adds the fifth. */
  drone: { midi: number; fifth: boolean };
  click: boolean;
  clickSound?: string;
  tone: ToneName;
}

/** A note handed to the audio engine, for the browser check. */
export interface ScheduledNote {
  index: number;
  time: number;
  midi: number;
  string: number;
  fret: number;
}

let current: ScalePlayer | null = null;

/** The player the screen is using right now (for the browser check), or null. */
export function currentPlayer(): ScalePlayer | null {
  return current;
}

/** Plays scale lines; one per screen visit. */
export class ScalePlayer {
  readonly transport: Transport;
  private readonly deps: PlayerDeps;
  private band: BandLike | null = null;
  private click: ClickLike | null = null;
  private drone: Stoppable | null = null;
  private partId: number | null = null;
  private voices: Array<{ time: number; handle: Stoppable }> = [];
  private readonly stepListeners = new Set<(index: number) => void>();
  private readonly stateListeners = new Set<(playing: boolean) => void>();
  private readonly noteListeners = new Set<(n: ScheduledNote) => void>();
  private readonly offs: Array<() => void> = [];
  private active = false;
  private request: PlayRequest | null = null;
  private timed: TimedLine | null = null;
  private runId = 0;
  private startedAt = 0;
  /** Seconds of sound played in this visit (for the practice log). */
  private playedSec = 0;

  constructor(deps: Partial<PlayerDeps> = {}) {
    this.deps = { ...liveDeps, ...deps };
    this.transport = new Transport({ clock: this.deps.clock, timer: this.deps.timer, timeSignature: '4/4', bpm: 80 });
    this.offs.push(
      this.transport.on('stop', () => this.finish()),
    );
    current = this;
  }

  /** Called with the index of the note being heard; -1 when playback stops. */
  onStep(fn: (index: number) => void): () => void {
    this.stepListeners.add(fn);
    return () => this.stepListeners.delete(fn);
  }

  /** Called when playback starts or stops. */
  onState(fn: (playing: boolean) => void): () => void {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  /** Called for every note handed to the engine, with the audio time it will sound. */
  onNote(fn: (n: ScheduledNote) => void): () => void {
    this.noteListeners.add(fn);
    return () => this.noteListeners.delete(fn);
  }

  /** True from `play()` until the line ends or `stop()`. */
  get playing(): boolean {
    return this.active;
  }

  /** Seconds played so far in this visit, including the run in progress. */
  secondsPlayed(): number {
    return this.playedSec + (this.active ? Math.max(0, this.deps.clock.now() - this.startedAt) : 0);
  }

  /** Start playing (stops what was playing first). Resolves once the first note is scheduled. */
  async play(req: PlayRequest): Promise<void> {
    this.stop();
    if (!req.line.length) return;
    const run = ++this.runId;
    this.request = req;
    const useBand = req.accompaniment === 'band' && !!req.vamp && !!this.deps.band;
    const style = req.style ?? req.vamp?.style ?? 'pop-rock';
    const swing = useBand && SWING_STYLES.has(style);
    const timed = timeLine(req.line, req.perBeat, swing);
    this.timed = timed;
    const tr = this.transport;

    // Over a band the line repeats through the band's loop (one chorus of the vamp), so the scale
    // never drops out of the form (it used to play once per two choruses: 3 bars of 24 on the blues).
    let events = timed.events;
    if (useBand && req.vamp) {
      this.band ??= this.deps.band!(tr);
      const bars = vampBars(req.vamp, timed.bars);
      this.band.load(bars, { style, tempo: req.bpm, loop: req.loop, countInBars: 1, choruses: 1 });
      events = fillBars(timed, bars.length);
      try {
        await this.band.prepare();
      } catch {
        // Not prepared: the first bar may hitch, but it still plays.
      }
    } else {
      this.dropBand();
      tr.setTimeSignature('4/4');
      tr.setSwing(0.5);
      tr.setTempo(req.bpm);
      tr.countInBars = req.click ? 1 : 0;
      if (req.loop) {
        tr.setLoop(0, timed.loopTicks);
        tr.setEnd(null);
      } else {
        tr.clearLoop();
        tr.setEnd(timed.lineTicks + PPQ / 2);
      }
      tr.seek(0);
    }
    try {
      await this.deps.preload?.(req.line, req.tone);
    } catch {
      // A note that is not pre-rendered renders when it is played.
    }
    if (run !== this.runId) return;

    if (this.partId !== null) tr.clear(this.partId);
    this.partId = tr.addPart(timed.events, (time, ev) => {
      const secondsPerTick = 60 / (tr.bpm * PPQ);
      const handle = this.deps.pluck(ev.midi, time, { string: ev.string, duration: Math.max(0.25, ev.ticks * secondsPerTick * 1.6), tone: req.tone, velocity: ev.index === 0 || ev.degree === '1' ? 0.85 : 0.72 });
      this.voices.push({ time, handle });
      if (this.voices.length > 96) this.voices.splice(0, 32);
      for (const fn of [...this.noteListeners]) fn({ index: ev.index, time, midi: ev.midi, string: ev.string, fret: ev.fret });
      tr.scheduleVisual(time, () => {
        if (run === this.runId) this.emitStep(ev.index);
      });
    });

    if (req.click && this.deps.click) {
      this.click ??= this.deps.click(tr);
      this.click.sound = normalizeClickSet(req.clickSound ?? 'woodblock');
      this.click.start();
    }
    if (req.accompaniment === 'drone' || (req.accompaniment === 'band' && !useBand)) {
      this.drone = this.deps.drone({ root: req.drone.midi, fifth: req.drone.fifth, volume: 0.55 });
    }

    this.active = true;
    this.startedAt = this.deps.clock.now();
    for (const fn of [...this.stateListeners]) fn(true);
    if (useBand && this.band) this.band.start({ countIn: 1 });
    else tr.start({ from: 0 });
  }

  /** Change the tempo, also while playing. */
  setTempo(bpm: number): void {
    if (!Number.isFinite(bpm)) return;
    if (this.band && this.request?.accompaniment === 'band') this.band.setTempo(bpm);
    else this.transport.setTempo(bpm);
    if (this.request) this.request = { ...this.request, bpm };
  }

  /** Stop at once: nothing scheduled is heard afterwards. */
  stop(): void {
    this.runId++;
    if (this.transport.state !== 'stopped') this.transport.stop();
    this.finish();
  }

  private finish(): void {
    const now = this.deps.clock.now();
    for (const v of this.voices) {
      try {
        v.handle.stop(now, 0.08);
      } catch {
        // already gone
      }
    }
    this.voices = [];
    this.band?.stop();
    this.click?.stop();
    if (this.drone) {
      this.drone.stop(0.4);
      this.drone = null;
    }
    if (this.active) {
      this.playedSec += Math.max(0, now - this.startedAt);
      this.active = false;
      this.emitStep(-1);
      for (const fn of [...this.stateListeners]) fn(false);
    }
  }

  private dropBand(): void {
    if (!this.band) return;
    this.band.dispose();
    this.band = null;
  }

  private emitStep(index: number): void {
    for (const fn of [...this.stepListeners]) fn(index);
  }

  /** Stop and free everything (the screen unmounted). */
  dispose(): void {
    this.stop();
    this.dropBand();
    this.click?.dispose();
    this.click = null;
    for (const off of this.offs.splice(0)) off();
    this.stepListeners.clear();
    this.stateListeners.clear();
    this.noteListeners.clear();
    this.transport.dispose();
    if (current === this) current = null;
  }
}

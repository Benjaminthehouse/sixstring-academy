/**
 * The tuner screen's engine room, free of React: it owns the microphone pipeline and the tuner
 * logic from `@/core/pitch`, and turns their hundred updates a second into
 *
 *  - `frame`: a small mutable record the meter reads on every animation frame (never React state);
 *  - `view`: an immutable snapshot that only changes when something the learner reads changes
 *    (which string, which instruction, which strings are done), for `useSyncExternalStore`.
 *
 * It also runs the guided "tune all strings" flow, keeps the per-visit list of strings confirmed
 * in tune, and knows when to ignore the microphone: while the app itself is making sound, and
 * while the string that was just finished is still ringing.
 *
 * All timing comes from the audio clock of the events, so the session behaves identically on
 * replayed audio in tests.
 */
import {
  PitchTracker,
  Tuner,
  type EngineConfigPatch,
  type LevelEvent,
  type NoteOnEvent,
  type PitchReading,
  type PitchSource,
  type PitchTrackerOptions,
  type TrackerFault,
  type TrackerInfo,
  type TrackerStartResult,
  type TrackerStatus,
  type TunerState,
} from '@/core/pitch';
import type { MediaFailure } from '@/core/platform';
import { midiToNote } from '@/core/theory';
import { LevelWatch, TipWatch, nextInstruction, type InstructionCode, type LevelAdvice, type TipCode } from './advice';
import { centsAttribute } from './scale';
import { trackerRange, type StringTarget } from './targets';

/** The part of `PitchTracker` the session uses; tests supply a stand-in fed with analysed audio. */
export interface TrackerLike extends PitchSource {
  start(overrides?: Partial<PitchTrackerOptions>): Promise<TrackerStartResult>;
  stop(): void;
  configure(patch: EngineConfigPatch): void;
  onStatus(handler: (status: TrackerStatus, fault?: TrackerFault) => void): () => void;
  readonly audioContext: { readonly state: string } | null;
  readonly info: TrackerInfo | null;
}

/** How the target is chosen. `guide` is the step-by-step flow (the tuner is locked on one string at a time). */
export type TuneMode = 'guide' | 'auto' | 'locked' | 'chromatic';

/** What the readout mirrors as `data-state`. */
export type ReadoutState = 'idle' | 'listening' | 'hearing' | 'in-tune';

/** Why the microphone could not be started. */
export interface StartFailure {
  reason: MediaFailure | 'audio-failed';
  detail?: string;
}

/** Progress of the guided flow. */
export interface GuideView {
  /** Index of the string being tuned now (0 = the first target, the thickest string). */
  index: number;
  /** Strings the learner chose to leave. */
  skipped: readonly boolean[];
  /** Every string is confirmed or skipped. */
  finished: boolean;
  /** Wall-clock milliseconds. */
  startedAt: number;
  finishedAt: number;
}

/** Everything the screen renders from. A new object only when a field changed. */
export interface SessionView {
  source: 'off' | 'starting' | 'mic';
  failure: StartFailure | null;
  /** The microphone stopped by itself (unplugged, or the audio system failed). */
  fault: TrackerFault | null;
  /** Listening could not begin without a tap (the browser wants a gesture first). */
  needsTap: boolean;
  mode: TuneMode;
  /** Index of the locked or guided string, -1 when the tuner chooses. */
  target: number;
  guide: GuideView | null;
  state: ReadoutState;
  /** Index of the note on the readout among the targets, -1 for none or a chromatic note. */
  shownIndex: number;
  /** MIDI number of the note on the readout, -1 when there is none. */
  shownMidi: number;
  /** ASCII name of that note with octave (`E2`), or empty. */
  shownNote: string;
  /** The readout's note is sounding right now (false: it is a target waiting, or the last note lingering). */
  shownLive: boolean;
  /** The 12th-fret harmonic of the string is being read rather than the open string. */
  harmonic: boolean;
  instruction: InstructionCode;
  /**
   * For `other-string`: the string that seems to have been plucked. For `which-string`: the other
   * string the note could belong to (the readout shows the nearer one).
   */
  otherIndex: number;
  /** Per target: confirmed in tune in this visit and not heard out of tune since. */
  confirmed: readonly boolean[];
  allConfirmed: boolean;
  advice: LevelAdvice;
  tip: TipCode | null;
  /** The app is playing a reference note, so the microphone is being ignored. */
  paused: boolean;
  /** Counts confirmations worth celebrating; a change means "celebrate now". */
  confirmations: number;
  /** Index of the string confirmed last, -1 for none. */
  lastConfirmed: number;
  /** Label of the microphone in use, when the browser reveals it. */
  deviceLabel: string;
}

/** Live numbers for the meter. Mutated in place; read it inside requestAnimationFrame. */
export interface MeterFrame {
  /** A note is sounding and being read. */
  live: boolean;
  /** Steadied deviation in cents (positive = sharp). Keeps its last value when `live` turns false. */
  cents: number;
  within: boolean;
  inTune: boolean;
  /** 0..1: how much of the in-tune hold has passed. */
  hold: number;
  /** Measured frequency in Hz. */
  freq: number;
  /** Frequency of the target in Hz. */
  targetFreq: number;
  /** Input level in dBFS, and the level a note has to reach. */
  db: number;
  gateDb: number;
  floorDb: number;
  clipping: boolean;
  /** Mirrors of the readout's data attributes. */
  state: ReadoutState;
  note: string;
  centsText: string;
  string: string;
  /** Goes up by one with every change, so a reader can skip frames where nothing moved. */
  stamp: number;
}

/** Told to listeners when a string (or, in chromatic mode, a note) is confirmed in tune. */
export interface Confirmation {
  /** Target index, or -1 in chromatic mode. */
  index: number;
  midi: number;
  /** How many strings are confirmed now. */
  count: number;
  /** Every string of the tuning is now confirmed. */
  all: boolean;
  /** False when this string was already ticked: no need to celebrate again. */
  fresh: boolean;
  /** The guided flow is running. */
  guided: boolean;
}

/** Options for {@link TunerSession}. */
export interface SessionOptions {
  targets: readonly StringTarget[];
  a4: number;
  /** A string within this many cents is in tune (3 standard, 1 fine). */
  toleranceCents: number;
  /** Microphone to open; null or undefined for the system default. */
  deviceId?: string | null;
  /** Name chromatic notes with flats instead of sharps. */
  preferFlats?: boolean;
  /** How quiet a pluck may be and still count (the learner's microphone sensitivity, from `micOptions`). */
  onset?: PitchTrackerOptions['onset'];
  /** Builds the microphone pipeline (tests pass a stand-in). */
  createTracker?: (options: PitchTrackerOptions) => TrackerLike;
  /** Wall clock in milliseconds, for the duration of a guided run. */
  wallClock?: () => number;
  /** Lets `start` wait for the audio context without real timers in tests. */
  sleep?: (ms: number) => Promise<void>;
}

/** Settings that can change while the session lives. */
export interface SessionConfig {
  targets?: readonly StringTarget[];
  a4?: number;
  toleranceCents?: number;
  deviceId?: string | null;
  preferFlats?: boolean;
}

/** How long the success of a guided string stays on the readout before the next prompt, in seconds. */
const CELEBRATE_S = 1.1;
/** How long the last note stays readable (dimmed) after it stops, in seconds. */
const LINGER_S = 2.5;
/** A ticked string is only un-ticked by a clear, settled reading of that same string. */
const UNTICK_AGE_S = 0.45;
/**
 * …and only when it stays out of tune this long: the last moments of a string dying away into room
 * noise can read 15 to 20 cents off for a tenth of a second, and that must not cost a tick.
 */
const UNTICK_HOLD_S = 0.3;
/**
 * In automatic mode, a note further than this from the nearest string, with another string on its
 * far side, may just as well be that other string badly out of tune (a slack A reads as a sharp E).
 * Nearer than this, the other reading would need a string 350 cents or more out (strings are 400
 * or 500 cents apart), so a guitar left a little over a half step flat is simply told to tighten.
 */
const UNSURE_CENTS = 150;
const UNSURE_SLACK = 15;
const UNTICK_CLARITY = 0.7;
const SAME_STRING_CENTS = 150;

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function sameTargets(a: readonly StringTarget[], b: readonly StringTarget[]): boolean {
  return a.length === b.length && a.every((t, i) => t.midi === b[i].midi && t.note === b[i].note && Math.abs(t.freq - b[i].freq) < 1e-9);
}

function shallowEqualView(a: SessionView, b: SessionView): boolean {
  for (const key of Object.keys(a) as Array<keyof SessionView>) {
    const x = a[key];
    const y = b[key];
    if (x === y) continue;
    if (Array.isArray(x) && Array.isArray(y)) {
      if (x.length !== y.length || x.some((v, i) => v !== y[i])) return false;
      continue;
    }
    if (key === 'guide' && x && y) {
      const g = x as GuideView;
      const h = y as GuideView;
      if (g.index !== h.index || g.finished !== h.finished || g.startedAt !== h.startedAt || g.finishedAt !== h.finishedAt) return false;
      if (g.skipped.length !== h.skipped.length || g.skipped.some((v, i) => v !== h.skipped[i])) return false;
      continue;
    }
    if (key === 'failure' && x && y) {
      const f = x as StartFailure;
      const g = y as StartFailure;
      if (f.reason !== g.reason || f.detail !== g.detail) return false;
      continue;
    }
    return false;
  }
  return true;
}

/** The tuner's controller: microphone, tuner logic, guided flow, confirmations. */
export class TunerSession {
  /** Read by the meter on every animation frame. */
  readonly frame: MeterFrame = {
    live: false, cents: 0, within: false, inTune: false, hold: 0, freq: 0, targetFreq: 0,
    db: -120, gateDb: -62, floorDb: -120, clipping: false,
    state: 'idle', note: '', centsText: '', string: '', stamp: 0,
  };

  private targets: StringTarget[];
  private a4: number;
  private tolerance: number;
  private deviceId: string | null;
  private preferFlats: boolean;
  private readonly wall: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly tracker: TrackerLike;
  private readonly offs: Array<() => void> = [];
  private tuner: Tuner;

  private source: SessionView['source'] = 'off';
  private failure: StartFailure | null = null;
  private fault: TrackerFault | null = null;
  private needsTap = false;
  private tunerMode: 'auto' | 'locked' | 'chromatic' = 'auto';
  private locked = -1;
  private guide: { index: number; skipped: boolean[]; finished: boolean; startedAt: number; finishedAt: number } | null = null;
  private state: TunerState;
  private instruction: InstructionCode = 'pluck';
  /** While the instruction is `which-string`: the other candidate string. */
  private rival = -1;
  private confirmed: boolean[];
  private confirmations = 0;
  private lastConfirmed = -1;
  private lastChromatic = { midi: -1, time: -Infinity };
  /** A ticked string heard out of tune: which one, and since when (audio clock). */
  private outOfTune = { index: -1, since: 0, last: 0 };

  private now = 0;
  private noteActive = false;
  /** MIDI number of the note the tracker reports as sounding (kept even while the microphone is ignored). */
  private noteMidi = -1;
  /** While true, readings are dropped until a new pluck: the note still ringing belongs to the previous target. */
  private awaitFresh = false;
  /** The note that was ringing when `awaitFresh` was set. */
  private staleMidi = -1;
  private paused = false;
  private hushUntil = -Infinity;
  private celebrate: { index: number; midi: number; note: string; until: number } | null = null;
  private linger: { index: number; midi: number; note: string; until: number } | null = null;
  private readonly levels = new LevelWatch();
  private readonly tips = new TipWatch();
  private tip: TipCode | null = null;
  private advice: LevelAdvice = 'ok';
  private startToken = 0;
  private disposed = false;

  private snapshot: SessionView;
  private readonly listeners = new Set<() => void>();
  private readonly frameListeners = new Set<(frame: MeterFrame) => void>();
  private readonly confirmListeners = new Set<(c: Confirmation) => void>();

  constructor(options: SessionOptions) {
    this.targets = [...options.targets];
    this.a4 = options.a4;
    this.tolerance = options.toleranceCents;
    this.deviceId = options.deviceId ?? null;
    this.preferFlats = options.preferFlats ?? false;
    this.wall = options.wallClock ?? (() => Date.now());
    this.sleep = options.sleep ?? defaultSleep;
    this.confirmed = this.targets.map(() => false);
    this.tuner = this.makeTuner();
    this.state = this.tuner.state;
    const range = trackerRange(this.targets);
    const create = options.createTracker ?? ((o: PitchTrackerOptions): TrackerLike => new PitchTracker(o));
    this.tracker = create({ a4: this.a4, minFreq: range.minFreq, maxFreq: range.maxFreq, deviceId: this.deviceId ?? undefined, ...(options.onset ? { onset: options.onset } : {}) });
    this.offs.push(
      this.tracker.on('pitch', (r) => this.onPitch(r)),
      this.tracker.on('noteon', (e) => this.onNoteOn(e)),
      this.tracker.on('noteoff', (e) => this.onNoteEnd(e.time)),
      this.tracker.on('silence', (e) => this.onNoteEnd(e.time)),
      this.tracker.on('level', (e) => this.onLevel(e)),
      this.tracker.onStatus((status, fault) => this.onStatus(status, fault)),
    );
    this.snapshot = this.compute();
  }

  // --- reading ---------------------------------------------------------------------------------

  /** The current snapshot (stable until something changes). */
  getView = (): SessionView => this.snapshot;

  /** Be told when the snapshot changes. Returns the unsubscribe function. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Called after every change of `frame` (up to a hundred times a second): keep it cheap. */
  onFrame(listener: (frame: MeterFrame) => void): () => void {
    this.frameListeners.add(listener);
    return () => {
      this.frameListeners.delete(listener);
    };
  }

  /** Called when a string or note is confirmed in tune. */
  onConfirm(listener: (c: Confirmation) => void): () => void {
    this.confirmListeners.add(listener);
    return () => {
      this.confirmListeners.delete(listener);
    };
  }

  /** The targets in force. */
  get currentTargets(): readonly StringTarget[] {
    return this.targets;
  }

  /** Details of the running microphone pipeline, or null. */
  get trackerInfo(): TrackerInfo | null {
    return this.tracker.info;
  }

  // --- microphone ------------------------------------------------------------------------------

  /**
   * Open the microphone and start listening. `gesture: false` is the start made when the screen
   * opens with permission already granted: if the browser will not run audio without a tap, the
   * session quietly goes back to idle with `needsTap` set instead of reporting a failure.
   */
  async start(opts: { gesture?: boolean } = {}): Promise<boolean> {
    if (this.disposed) return false;
    if (this.source === 'mic') return true;
    const gesture = opts.gesture ?? true;
    const token = ++this.startToken;
    this.source = 'starting';
    this.failure = null;
    this.fault = null;
    this.needsTap = false;
    this.commit();

    const range = trackerRange(this.targets);
    const overrides: Partial<PitchTrackerOptions> = { a4: this.a4, minFreq: range.minFreq, maxFreq: range.maxFreq, deviceId: this.deviceId ?? undefined };
    let res = await this.tracker.start(overrides);
    if (token !== this.startToken || this.disposed) return false;
    if (!res.ok && res.reason === 'no-device' && this.deviceId) {
      // The remembered microphone is gone (unplugged headset): fall back to the default one.
      this.deviceId = null;
      res = await this.tracker.start({ ...overrides, deviceId: undefined });
      if (token !== this.startToken || this.disposed) return false;
    }
    if (!res.ok) {
      this.source = 'off';
      this.failure = { reason: res.reason, detail: res.detail };
      this.syncFrame();
      this.commit();
      return false;
    }
    // A context that will not run delivers no audio at all. Give it a moment, then say so.
    for (let waited = 0; waited < 800 && this.tracker.audioContext && this.tracker.audioContext.state !== 'running'; waited += 100) {
      await this.sleep(100);
      if (token !== this.startToken || this.disposed) return false;
    }
    const ctx = this.tracker.audioContext;
    if (ctx && ctx.state !== 'running') {
      this.tracker.stop();
      this.source = 'off';
      if (gesture) this.failure = { reason: 'audio-failed', detail: `audio context is ${ctx.state}` };
      else this.needsTap = true;
      this.syncFrame();
      this.commit();
      return false;
    }
    this.source = 'mic';
    this.resetHearing();
    this.syncFrame();
    this.commit();
    return true;
  }

  /** Stop listening and release the microphone. Confirmed strings and the guided flow are kept. */
  stop(): void {
    this.startToken++;
    if (this.source === 'off') return;
    this.source = 'off';
    this.tracker.stop();
    this.resetHearing();
    this.syncFrame();
    this.commit();
  }

  /** Switch to another microphone; restarts the pipeline when it is running. */
  async setDevice(deviceId: string | null): Promise<void> {
    this.deviceId = deviceId;
    if (this.source !== 'mic') return;
    this.stop();
    await this.start();
  }

  /** Release everything. The session cannot be used afterwards. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.startToken++;
    this.tracker.stop();
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.listeners.clear();
    this.frameListeners.clear();
    this.confirmListeners.clear();
  }

  // --- settings --------------------------------------------------------------------------------

  /** Change the tuning targets, reference pitch, tolerance or note spelling. */
  configure(config: SessionConfig): void {
    let rebuild = false;
    let retarget = false;
    if (config.preferFlats !== undefined) this.preferFlats = config.preferFlats;
    if (config.deviceId !== undefined) this.deviceId = config.deviceId;
    if (config.toleranceCents !== undefined && config.toleranceCents !== this.tolerance) {
      this.tolerance = config.toleranceCents;
      rebuild = true;
    }
    if (config.a4 !== undefined && config.a4 !== this.a4) {
      this.a4 = config.a4;
      retarget = true;
    }
    if (config.targets && !sameTargets(config.targets, this.targets)) {
      this.targets = [...config.targets];
      retarget = true;
    }
    if (retarget) {
      // New targets: nothing confirmed for the old ones still stands.
      this.confirmed = this.targets.map(() => false);
      this.lastConfirmed = -1;
      if (this.locked >= this.targets.length) {
        this.locked = -1;
        if (this.tunerMode === 'locked') this.tunerMode = 'auto';
      }
      if (this.guide) {
        if (this.guide.finished) this.guide = null;
        else {
          this.guide = { index: 0, skipped: this.targets.map(() => false), finished: false, startedAt: this.wall(), finishedAt: 0 };
          this.locked = 0;
        }
      }
      const range = trackerRange(this.targets);
      if (this.source === 'mic') this.tracker.configure({ a4: this.a4, minFreq: range.minFreq, maxFreq: range.maxFreq });
      rebuild = true;
    }
    if (rebuild) {
      this.tuner = this.makeTuner();
      this.state = this.tuner.state;
      this.resetHearing(false);
    }
    this.syncFrame();
    this.commit();
  }

  /** Let the tuner pick the string (`auto`) or follow any of the twelve notes (`chromatic`). Leaves the guided flow. */
  setMode(mode: 'auto' | 'chromatic'): void {
    this.guide = null;
    this.locked = -1;
    this.tunerMode = mode;
    this.state = this.tuner.setMode(mode);
    this.afterRetarget();
  }

  /** Lock onto one string, or pass null to release (back to automatic). In the guided flow this moves the guide instead. */
  lock(index: number | null): void {
    if (index !== null && (index < 0 || index >= this.targets.length)) return;
    if (this.guide && !this.guide.finished && index !== null) {
      this.guide.index = index;
      this.guide.skipped[index] = false;
      this.locked = index;
      this.state = this.tuner.lock(index);
      this.afterRetarget();
      return;
    }
    this.guide = null;
    if (index === null) {
      this.locked = -1;
      this.tunerMode = 'auto';
      this.state = this.tuner.lock(null);
    } else {
      this.locked = index;
      this.tunerMode = 'locked';
      this.state = this.tuner.lock(index);
    }
    this.afterRetarget();
  }

  /** Begin the guided flow: every string from the first target (the thickest) to the last, checked afresh. */
  startGuide(): void {
    if (this.targets.length === 0) return;
    this.confirmed = this.targets.map(() => false);
    this.lastConfirmed = -1;
    this.guide = { index: 0, skipped: this.targets.map(() => false), finished: false, startedAt: this.wall(), finishedAt: 0 };
    this.locked = 0;
    this.tunerMode = 'locked';
    this.tuner.resetTuned();
    this.state = this.tuner.lock(0);
    this.afterRetarget();
  }

  /** Leave the current guided string as it is and go to the next. */
  skipGuideString(): void {
    const g = this.guide;
    if (!g || g.finished) return;
    g.skipped[g.index] = true;
    this.advanceGuide();
    this.afterRetarget();
  }

  /** End the guided flow (or close its summary) and carry on in automatic mode. */
  leaveGuide(): void {
    if (!this.guide) return;
    this.guide = null;
    this.locked = -1;
    this.tunerMode = 'auto';
    this.state = this.tuner.lock(null);
    this.afterRetarget();
  }

  /** Forget which strings were confirmed. */
  resetConfirmed(): void {
    this.confirmed = this.targets.map(() => false);
    this.lastConfirmed = -1;
    this.tuner.resetTuned();
    this.commit();
  }

  /** Mark a string as done without the microphone (the by-ear flow's "this one sounds right"). */
  confirmByEar(index: number): void {
    if (index < 0 || index >= this.targets.length) return;
    const fresh = !this.confirmed[index];
    this.confirmed[index] = true;
    this.lastConfirmed = index;
    if (fresh) this.confirmations++;
    this.announce({ index, midi: this.targets[index].midi, fresh, guided: false });
    this.commit();
  }

  /** Ignore the microphone while the app plays a reference note (true) and listen again afterwards (false). */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    if (paused) {
      this.state = this.tuner.release();
      this.instruction = 'pluck';
    } else {
      // The speaker's sound takes a moment to die away, and whatever is ringing now began under it.
      this.hushUntil = this.now + 0.35;
      this.waitForFreshNote(this.noteActive);
    }
    this.syncFrame();
    this.commit();
  }

  /** Ignore the microphone for a moment because the app is about to make a short sound of its own. */
  hush(seconds: number): void {
    this.hushUntil = Math.max(this.hushUntil, this.now + Math.max(0, seconds));
  }

  // --- events from the microphone ----------------------------------------------------------------

  private onStatus(status: TrackerStatus, fault?: TrackerFault): void {
    if (status === 'stopped' && fault && this.source !== 'off') {
      this.source = 'off';
      this.fault = fault;
      this.resetHearing();
      this.syncFrame();
      this.commit();
    }
  }

  private muted(): boolean {
    return this.paused || this.now < this.hushUntil;
  }

  private onNoteOn(e: NoteOnEvent): void {
    this.tick(e.detectedAt ?? e.time);
    this.noteActive = true;
    this.noteMidi = e.midi;
    if (this.muted()) return;
    // A new pluck: whatever was being waited out is over.
    this.awaitFresh = false;
    this.levels.noteStarted(e.detectedAt ?? e.time, e.levelDb, this.frame.gateDb);
  }

  private onNoteEnd(time: number): void {
    this.tick(time);
    this.noteActive = false;
    this.noteMidi = -1;
    this.awaitFresh = false;
    if (this.muted()) return;
    this.releaseNote();
    this.syncFrame();
    this.commit();
  }

  private onLevel(e: LevelEvent): void {
    const f = this.frame;
    f.db = e.db;
    f.gateDb = e.gateDb;
    f.floorDb = e.noiseFloorDb;
    f.clipping = e.clipping;
    this.advice = this.paused ? 'ok' : this.levels.update(e, this.noteActive);
    const wasMuted = this.muted();
    this.tick(e.time);
    if (wasMuted && !this.muted()) {
      // The app's own sound has ended. If the string stopped under it, the readout must not stay
      // frozen; if a different note began under it, that was the learner's next pluck.
      if (!this.noteActive && this.state.active) this.releaseNote();
      if (this.awaitFresh && (!this.noteActive || this.noteMidi !== this.staleMidi)) this.awaitFresh = false;
    }
    this.syncFrame();
    this.commit();
  }

  private onPitch(r: PitchReading): void {
    this.tick(r.time);
    if (this.source !== 'mic' || this.muted() || this.awaitFresh) return;
    const s = this.tuner.update(r);
    this.state = s;
    this.instruction = nextInstruction(s, this.instruction === 'which-string' ? 'pluck' : this.instruction);
    this.rival = this.rivalString(s);
    // Halfway between two strings, automatic mode would only be guessing: ask instead of instructing.
    if (this.rival >= 0) this.instruction = 'which-string';
    this.linger = null;
    // A reading during the little pause after a guided string means the learner has moved on already.
    if (this.celebrate && s.active) this.celebrate = null;

    if (s.justTuned !== null) this.handleConfirmed(s, r.time);

    // Heard clearly out of tune, on this very string, for long enough: the tick no longer stands.
    const i = s.string;
    const outOfTune =
      i >= 0 && this.confirmed[i] && !s.withinTolerance && this.instruction !== 'other-string' && this.instruction !== 'which-string' &&
      r.noteAge >= UNTICK_AGE_S && r.clarity >= UNTICK_CLARITY &&
      Math.abs(s.cents) > this.tolerance * 2 + 2 && Math.abs(s.cents) < SAME_STRING_CENTS;
    const run = this.outOfTune;
    // A gap in the readings (the app's own sound, a new pluck) starts the count again.
    if (!outOfTune || i !== run.index || r.time - run.last > 0.1) this.outOfTune = { index: outOfTune ? i : -1, since: r.time, last: r.time };
    else {
      run.last = r.time;
      if (r.time - run.since >= UNTICK_HOLD_S) this.confirmed[i] = false;
    }

    this.tip = this.tips.update(r.time, r.noteAge, s.cents, s.rawCents);
    this.syncFrame();
    this.commit();
  }

  /** Advance every timer that runs on the audio clock. */
  private tick(time: number): void {
    if (time > this.now) this.now = time;
    if (this.celebrate && this.now >= this.celebrate.until) this.celebrate = null;
    if (this.linger && this.now >= this.linger.until) this.linger = null;
    if (this.tip && this.tips.current(this.now) === null) this.tip = null;
  }

  private releaseNote(): void {
    const s = this.state;
    if (s.active && !this.celebrate && this.tunerMode !== 'locked') {
      const shown = this.describe(s);
      if (shown) this.linger = { ...shown, until: this.now + LINGER_S };
    }
    this.state = this.tuner.release();
    this.instruction = 'pluck';
    this.rival = -1;
  }

  private handleConfirmed(s: TunerState, time: number): void {
    const index = s.string;
    let fresh: boolean;
    if (index >= 0) {
      fresh = !this.confirmed[index];
      this.confirmed[index] = true;
      this.lastConfirmed = index;
    } else {
      // Chromatic: the same note confirmed again within a few seconds is one success, not two.
      fresh = s.targetMidi !== this.lastChromatic.midi || time - this.lastChromatic.time > 4;
      this.lastChromatic = { midi: s.targetMidi, time };
    }
    if (fresh) this.confirmations++;
    const guided = !!this.guide && !this.guide.finished && index === this.guide.index;
    this.announce({ index, midi: s.targetMidi, fresh, guided });
    if (guided) {
      const shown = this.describe(s);
      if (shown) this.celebrate = { ...shown, until: time + CELEBRATE_S };
      this.advanceGuide();
      // The string that was just finished keeps ringing: wait for the next pluck before reading again.
      this.waitForFreshNote(true);
      this.instruction = 'pluck';
    }
  }

  private announce(c: Omit<Confirmation, 'count' | 'all'>): void {
    const count = this.confirmed.filter(Boolean).length;
    const all = this.targets.length > 0 && count === this.targets.length;
    for (const l of [...this.confirmListeners]) l({ ...c, count, all });
  }

  /** Move the guide to the next string that is neither confirmed nor skipped, or finish. */
  private advanceGuide(): void {
    const g = this.guide;
    if (!g) return;
    const n = this.targets.length;
    let next = -1;
    for (let step = 1; step <= n; step++) {
      const j = (g.index + step) % n;
      if (!this.confirmed[j] && !g.skipped[j]) {
        next = j;
        break;
      }
    }
    if (next < 0) {
      g.finished = true;
      g.finishedAt = this.wall();
      this.locked = -1;
      this.tunerMode = 'auto';
      this.state = this.tuner.lock(null);
      return;
    }
    g.index = next;
    this.locked = next;
    this.state = this.tuner.lock(next);
  }

  /**
   * Automatic mode: the string on the far side of a note that is a long way from the nearest one,
   * or -1 when the guess can be trusted (close enough, a harmonic, or nothing on that side: a note
   * below the lowest string can only be the lowest string).
   */
  private rivalString(s: TunerState): number {
    if (s.mode !== 'auto' || s.harmonic !== 1 || s.string < 0 || s.withinTolerance) return -1;
    const limit = this.rival >= 0 ? UNSURE_CENTS - UNSURE_SLACK : UNSURE_CENTS;
    if (Math.abs(s.cents) <= limit) return -1;
    let rival = -1;
    let nearest = Infinity;
    this.targets.forEach((t, i) => {
      if (i === s.string) return;
      const beyond = s.cents > 0 ? t.freq > s.freq : t.freq < s.freq;
      const distance = Math.abs(1200 * Math.log2(t.freq / s.freq));
      if (beyond && distance < nearest) {
        nearest = distance;
        rival = i;
      }
    });
    return rival;
  }

  // --- derived state ---------------------------------------------------------------------------

  private makeTuner(): Tuner {
    const lockedOn = this.tunerMode === 'locked' && this.locked >= 0 && this.locked < this.targets.length;
    return new Tuner({
      targets: this.targets.map((t) => t.freq),
      labels: this.targets.map((t) => t.note),
      a4: this.a4,
      mode: this.tunerMode === 'locked' && !lockedOn ? 'auto' : this.tunerMode,
      lockedString: lockedOn ? this.locked : 0,
      toleranceCents: this.tolerance,
    });
  }

  private waitForFreshNote(wait: boolean): void {
    this.awaitFresh = wait;
    this.staleMidi = wait ? this.noteMidi : -1;
  }

  /** After the target changed: nothing heard so far applies to it. */
  private afterRetarget(): void {
    this.instruction = 'pluck';
    this.celebrate = null;
    this.linger = null;
    this.waitForFreshNote(this.noteActive);
    this.tips.reset();
    this.tip = null;
    this.syncFrame();
    this.commit();
  }

  /** Clear everything derived from what was heard. `stopped`: the microphone itself was (re)started or stopped. */
  private resetHearing(stopped = true): void {
    this.state = this.tuner.release();
    this.instruction = 'pluck';
    if (stopped) {
      this.noteActive = false;
      this.noteMidi = -1;
    }
    this.waitForFreshNote(false);
    this.paused = false;
    this.hushUntil = -Infinity;
    this.celebrate = null;
    this.linger = null;
    this.levels.reset();
    this.tips.reset();
    this.tip = null;
    this.advice = 'ok';
  }

  /** The note a tuner state is about: a target string, or a chromatic note. */
  private describe(s: TunerState): { index: number; midi: number; note: string } | null {
    if (s.string >= 0 && s.string < this.targets.length) {
      const t = this.targets[s.string];
      return { index: s.string, midi: t.midi, note: t.note };
    }
    if (s.targetMidi < 0) return null;
    return { index: -1, midi: s.targetMidi, note: midiToNote(s.targetMidi, { prefer: this.preferFlats ? 'flats' : 'sharps' }) };
  }

  private readoutState(): ReadoutState {
    if (this.source !== 'mic') return 'idle';
    if (this.celebrate) return 'in-tune';
    if (this.paused) return 'listening';
    if (this.state.active) return this.state.inTune ? 'in-tune' : 'hearing';
    return 'listening';
  }

  /** Bring `frame` in line with the latest tuner state and tell its listeners. */
  private syncFrame(): void {
    const f = this.frame;
    const s = this.state;
    const state = this.readoutState();
    const live = this.source === 'mic' && s.active && !this.paused;
    f.live = live;
    f.state = state;
    if (live) {
      f.cents = s.cents;
      f.freq = s.freq;
      f.targetFreq = s.targetFreq;
    }
    f.within = live && s.withinTolerance;
    f.inTune = (live && s.inTune) || !!this.celebrate;
    f.hold = live ? s.holdProgress : this.celebrate ? 1 : 0;
    const shown = this.celebrate ?? (live ? this.describe(s) : null);
    f.note = shown ? shown.note : '';
    f.string = shown && shown.index >= 0 ? String(this.targets[shown.index].string) : '';
    f.centsText = shown ? centsAttribute(f.cents) : '';
    f.stamp++;
    for (const l of [...this.frameListeners]) l(f);
  }

  private compute(): SessionView {
    const s = this.state;
    const live = this.source === 'mic' && s.active && !this.paused;
    const mode: TuneMode = this.guide && !this.guide.finished ? 'guide' : this.tunerMode;
    const target = mode === 'guide' || mode === 'locked' ? this.locked : -1;
    let shown: { index: number; midi: number; note: string } | null = null;
    let shownLive = false;
    if (this.celebrate) shown = this.celebrate;
    else if (live) {
      shown = this.describe(s);
      shownLive = true;
    } else if (this.linger) shown = this.linger;
    else if (target >= 0 && target < this.targets.length) shown = { index: target, midi: this.targets[target].midi, note: this.targets[target].note };

    let otherIndex = live && this.instruction === 'which-string' ? this.rival : -1;
    if (live && this.instruction === 'other-string') {
      // The tuner names the other string in its hint; find it again by pitch.
      let best = Infinity;
      this.targets.forEach((t, i) => {
        const d = Math.abs(1200 * Math.log2(s.freq / t.freq));
        if (i !== s.string && d < best) {
          best = d;
          otherIndex = i;
        }
      });
    }

    return {
      source: this.source,
      failure: this.failure,
      fault: this.fault,
      needsTap: this.needsTap,
      mode,
      target,
      guide: this.guide ? { index: this.guide.index, skipped: [...this.guide.skipped], finished: this.guide.finished, startedAt: this.guide.startedAt, finishedAt: this.guide.finishedAt } : null,
      state: this.readoutState(),
      shownIndex: shown ? shown.index : -1,
      shownMidi: shown ? shown.midi : -1,
      shownNote: shown ? shown.note : '',
      shownLive: shownLive || !!this.celebrate,
      harmonic: live && s.harmonic === 2,
      instruction: this.celebrate ? 'in-tune' : live ? this.instruction : 'pluck',
      otherIndex,
      confirmed: [...this.confirmed],
      allConfirmed: this.confirmed.length > 0 && this.confirmed.every(Boolean),
      advice: this.source === 'mic' ? this.advice : 'ok',
      tip: this.source === 'mic' && live ? this.tip : null,
      paused: this.paused,
      confirmations: this.confirmations,
      lastConfirmed: this.lastConfirmed,
      deviceLabel: this.tracker.info?.deviceLabel ?? '',
    };
  }

  private commit(): void {
    const next = this.compute();
    if (shallowEqualView(this.snapshot, next)) return;
    this.snapshot = next;
    for (const l of [...this.listeners]) l();
  }
}

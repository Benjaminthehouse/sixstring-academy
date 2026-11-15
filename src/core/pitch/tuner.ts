/**
 * Tuner logic without any UI: feed it pitch readings, read back which string is being tuned, how
 * many cents off it is (smoothed for a calm needle), whether it is in tune, and what to tell the
 * learner. Pure and clock-free: time comes from the readings.
 */
import { centsBetween, DEFAULT_A4, freqToMidi, midiToFreq, midiToName } from '@/core/math/pitch-math';
import type { PitchReading, PitchSource } from './types';

/** How the target is chosen. */
export type TunerMode = 'auto' | 'locked' | 'chromatic';

/** Sounding standard tuning, low to high: E2 A2 D3 G3 B3 E4. */
export const STANDARD_TUNING_MIDI: readonly number[] = [40, 45, 50, 55, 59, 64];

/** Target frequency in Hz for each MIDI note of a tuning at a given A4. */
export function tuningFrequencies(midis: readonly number[], a4: number = DEFAULT_A4): number[] {
  return midis.map((m) => midiToFreq(m, a4));
}

/** Options for {@link Tuner}. */
export interface TunerOptions {
  /** Target frequency of each string in Hz, lowest string first. Default: standard tuning at `a4`. */
  targets?: readonly number[];
  /** Display name of each string (default: the note name of its target, e.g. "E2"). */
  labels?: readonly string[];
  /** Reference pitch in Hz: used for chromatic mode, note names and the default targets (default 440). */
  a4?: number;
  /** 'auto' picks the nearest string, 'locked' stays on `lockedString`, 'chromatic' targets the nearest note. Default 'auto'. */
  mode?: TunerMode;
  /** Index into `targets` for locked mode (default 0). */
  lockedString?: number;
  /** A string within this many cents of its target is in tune (default 3). */
  toleranceCents?: number;
  /** It must stay within tolerance this long before "in tune" is declared, in ms (default 450). */
  holdMs?: number;
  /** Beyond this many cents the learner is warned that the string is far off (default 200, a whole step). */
  farCents?: number;
  /** Also accept the octave harmonic (12th fret) of a string as that string (default true). */
  harmonics?: boolean;
}

/** What to tell the learner. */
export type TunerHintCode =
  | 'listen'
  | 'tune-up'
  | 'tune-down'
  | 'almost-up'
  | 'almost-down'
  | 'hold'
  | 'in-tune'
  | 'far-below'
  | 'far-above'
  | 'other-string';

/** A guidance message: a stable code for styling and logic, and ready-to-show copy. */
export interface TunerHint {
  code: TunerHintCode;
  text: string;
  severity: 'info' | 'warning' | 'success';
}

/** Snapshot of the tuner after an update. */
export interface TunerState {
  mode: TunerMode;
  /** True while a string is being heard. When false the other fields keep the last reading. */
  active: boolean;
  /** Index of the string being tuned (auto-detected or locked); -1 in chromatic mode or before any reading. */
  string: number;
  /** Display name of the target: the string label, or the note name in chromatic mode. */
  targetName: string;
  /** Target frequency in Hz (0 before any reading in auto/chromatic mode). */
  targetFreq: number;
  /** MIDI number nearest the target. */
  targetMidi: number;
  /** Detected frequency in Hz after the tuner's smoothing (0 before any reading). */
  freq: number;
  /** Smoothed deviation from the target in cents; positive = sharp. Drive the needle with this. */
  cents: number;
  /** Deviation of the latest reading before the tuner's smoothing. */
  rawCents: number;
  /** Within tolerance at this moment. */
  withinTolerance: boolean;
  /** Within tolerance for the whole hold time: show the "in tune" state. */
  inTune: boolean;
  /** 0..1: how much of the hold time has passed. */
  holdProgress: number;
  /** Which way to turn: 'up' = tighten (the string is flat), 'down' = loosen, 'ok', or null with no reading. */
  direction: 'up' | 'down' | 'ok' | null;
  /** 1 for the open string, 2 when the 12th-fret harmonic is being read. */
  harmonic: 1 | 2;
  /** Guidance for the learner. */
  hint: TunerHint;
  /** Per string: confirmed in tune (and not heard out of tune since). */
  tuned: boolean[];
  /** The string index (MIDI number in chromatic mode) confirmed in tune by THIS update, else null. */
  justTuned: number | null;
}

/** The fields of a pitch reading the tuner needs. */
export type TunerReading = Pick<PitchReading, 'time' | 'freq'> & Partial<Pick<PitchReading, 'noteAge'>>;

/** Readings this soon after the pluck are still settling and do not start the in-tune hold, in seconds. */
const SETTLE_S = 0.1;

/** Tuner state machine. Feed it `pitch` readings with `update` and call `release` on note-off / silence. */
export class Tuner {
  private targets: number[];
  private labels: string[] | null;
  private a4: number;
  private mode: TunerMode;
  private locked: number;
  private readonly tolerance: number;
  private readonly holdS: number;
  private readonly far: number;
  private readonly harmonics: boolean;

  private current = -1;
  private chromaticMidi = -1;
  private smoothed = Number.NaN;
  private lastTime = Number.NaN;
  private lastAge = -1;
  private withinSince = Number.NaN;
  private wasInTune = false;
  private tunedFlags: boolean[];
  private listeners = new Set<(index: number, state: TunerState) => void>();
  private snapshot: TunerState;

  constructor(opts: TunerOptions = {}) {
    this.a4 = opts.a4 ?? DEFAULT_A4;
    this.targets = opts.targets ? [...opts.targets] : tuningFrequencies(STANDARD_TUNING_MIDI, this.a4);
    this.labels = opts.labels ? [...opts.labels] : null;
    this.mode = opts.mode ?? 'auto';
    this.locked = opts.lockedString ?? 0;
    this.tolerance = opts.toleranceCents ?? 3;
    this.holdS = (opts.holdMs ?? 450) / 1000;
    this.far = opts.farCents ?? 200;
    this.harmonics = opts.harmonics ?? true;
    this.tunedFlags = this.targets.map(() => false);
    this.snapshot = this.idle();
  }

  /** The latest state. */
  get state(): TunerState {
    return this.snapshot;
  }

  /** Called whenever a string (or, in chromatic mode, a note) is confirmed in tune. Returns the unsubscribe function. */
  onTuned(listener: (index: number, state: TunerState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Replace the tuning. Clears the per-string "tuned" marks. */
  setTargets(targets: readonly number[], labels?: readonly string[]): TunerState {
    this.targets = [...targets];
    this.labels = labels ? [...labels] : null;
    this.tunedFlags = this.targets.map(() => false);
    this.locked = Math.min(this.locked, Math.max(0, this.targets.length - 1));
    return this.restart();
  }

  /** Change the reference pitch used by chromatic mode and note names. Targets given in Hz are not rescaled. */
  setA4(a4: number): TunerState {
    this.a4 = a4;
    return this.restart();
  }

  /** Switch mode; `lockedString` applies to 'locked'. */
  setMode(mode: TunerMode, lockedString?: number): TunerState {
    this.mode = mode;
    if (lockedString !== undefined) this.locked = Math.min(Math.max(0, lockedString), this.targets.length - 1);
    return this.restart();
  }

  /** Lock onto one string, or pass null to go back to automatic string detection. */
  lock(string: number | null): TunerState {
    return string === null ? this.setMode('auto') : this.setMode('locked', string);
  }

  /** Forget which strings were confirmed in tune. */
  resetTuned(): TunerState {
    this.tunedFlags = this.targets.map(() => false);
    this.snapshot = { ...this.snapshot, tuned: [...this.tunedFlags], justTuned: null };
    return this.snapshot;
  }

  /** The string stopped sounding: the needle is released, the last values stay readable. */
  release(): TunerState {
    this.smoothed = Number.NaN;
    this.lastTime = Number.NaN;
    this.lastAge = -1;
    this.withinSince = Number.NaN;
    this.wasInTune = false;
    const s = this.snapshot;
    this.snapshot = {
      ...s,
      active: false,
      withinTolerance: false,
      inTune: false,
      holdProgress: 0,
      direction: null,
      justTuned: null,
      hint: this.listenHint(),
    };
    return this.snapshot;
  }

  /** Feed one pitch reading (every `pitch` event while tuning). */
  update(reading: TunerReading): TunerState {
    const freq = reading.freq;
    if (!(freq > 0)) return this.release();
    const time = reading.time;
    const age = reading.noteAge ?? Number.POSITIVE_INFINITY;
    // A smaller note age than last time means a new pluck: start the smoothing afresh.
    const newNote = Number.isNaN(this.lastTime) || age < this.lastAge - 1e-6;
    this.lastAge = age;

    let targetFreq: number;
    let targetName: string;
    let string = -1;
    let harmonic: 1 | 2 = 1;
    let otherString = -1;

    if (this.mode === 'chromatic' || this.targets.length === 0) {
      const exact = freqToMidi(freq, this.a4);
      // Stay on the current note until the pitch is clearly nearer the next one.
      if (newNote || this.chromaticMidi < 0 || Math.abs(exact - this.chromaticMidi) > 0.6) {
        if (Math.round(exact) !== this.chromaticMidi) this.resetSmoothing();
        this.chromaticMidi = Math.round(exact);
      }
      targetFreq = midiToFreq(this.chromaticMidi, this.a4);
      targetName = midiToName(this.chromaticMidi);
    } else {
      const pick = this.pickString(freq, newNote);
      string = pick.string;
      harmonic = pick.harmonic;
      otherString = pick.other;
      if (string !== this.current) this.resetSmoothing();
      this.current = string;
      targetFreq = this.targets[string] * harmonic;
      targetName = this.labelOf(string);
    }

    const rawCents = centsBetween(freq, targetFreq);
    const dt = Number.isNaN(this.lastTime) ? 0 : Math.max(0, time - this.lastTime);
    this.lastTime = time;
    if (newNote || Number.isNaN(this.smoothed)) {
      this.smoothed = rawCents;
    } else {
      // Fast while far from the reading (the learner is turning the peg) and while the string is
      // still settling after the pluck (the pitch really is moving); slow when close (steady needle).
      const diff = Math.abs(rawCents - this.smoothed);
      const tau = age < SETTLE_S * 3 || diff > 12 ? 0.025 : diff > 4 ? 0.05 : 0.1;
      this.smoothed += (1 - Math.exp(-dt / tau)) * (rawCents - this.smoothed);
    }
    const cents = this.smoothed;
    const abs = Math.abs(cents);

    // In-tune decision with a little hysteresis so the light does not flicker at the edge.
    const within = abs <= (Number.isNaN(this.withinSince) ? this.tolerance : this.tolerance + 1);
    if (!within) {
      this.withinSince = Number.NaN;
    } else if (Number.isNaN(this.withinSince) && age >= SETTLE_S) {
      this.withinSince = time;
    }
    const held = Number.isNaN(this.withinSince) ? 0 : time - this.withinSince;
    const inTune = within && held >= this.holdS;
    let justTuned: number | null = null;
    const index = string >= 0 ? string : this.chromaticMidi;
    if (inTune && !this.wasInTune) {
      justTuned = index;
      if (string >= 0) this.tunedFlags[string] = true;
    }
    this.wasInTune = inTune;
    // Heard clearly out of tune after settling: the earlier confirmation no longer stands.
    if (string >= 0 && age >= SETTLE_S * 1.5 && abs > this.tolerance * 2 + 2) this.tunedFlags[string] = false;

    const state: TunerState = {
      mode: this.mode,
      active: true,
      string,
      targetName,
      targetFreq,
      targetMidi: Math.round(freqToMidi(targetFreq, this.a4)),
      freq: targetFreq * Math.pow(2, cents / 1200),
      cents,
      rawCents,
      withinTolerance: within,
      inTune,
      holdProgress: this.holdS > 0 ? Math.min(1, held / this.holdS) : within ? 1 : 0,
      direction: within ? 'ok' : cents < 0 ? 'up' : 'down',
      harmonic,
      hint: this.hintFor(cents, within, inTune, targetName, otherString),
      tuned: [...this.tunedFlags],
      justTuned,
    };
    this.snapshot = state;
    if (justTuned !== null) for (const l of [...this.listeners]) l(justTuned, state);
    return state;
  }

  private resetSmoothing(): void {
    this.smoothed = Number.NaN;
    this.withinSince = Number.NaN;
    this.wasInTune = false;
  }

  private restart(): TunerState {
    this.current = -1;
    this.chromaticMidi = -1;
    this.resetSmoothing();
    this.lastTime = Number.NaN;
    this.lastAge = -1;
    this.snapshot = this.idle();
    return this.snapshot;
  }

  private labelOf(string: number): string {
    return this.labels?.[string] ?? midiToName(Math.round(freqToMidi(this.targets[string], this.a4)));
  }

  private listenHint(): TunerHint {
    const text =
      this.mode === 'locked' && this.targets.length > 0
        ? `Pluck the ${this.labelOf(this.locked)} string and let it ring.`
        : 'Pluck one string and let it ring.';
    return { code: 'listen', text, severity: 'info' };
  }

  private idle(): TunerState {
    const lockedOn = this.mode === 'locked' && this.targets.length > 0;
    const targetFreq = lockedOn ? this.targets[this.locked] : 0;
    return {
      mode: this.mode,
      active: false,
      string: lockedOn ? this.locked : -1,
      targetName: lockedOn ? this.labelOf(this.locked) : '',
      targetFreq,
      targetMidi: targetFreq > 0 ? Math.round(freqToMidi(targetFreq, this.a4)) : -1,
      freq: 0,
      cents: 0,
      rawCents: 0,
      withinTolerance: false,
      inTune: false,
      holdProgress: 0,
      direction: null,
      harmonic: 1,
      hint: this.listenHint(),
      tuned: [...this.tunedFlags],
      justTuned: null,
    };
  }

  /** Which string a frequency belongs to, whether it is that string's octave harmonic, and (locked mode) which other string it sounds like. */
  private pickString(freq: number, newNote: boolean): { string: number; harmonic: 1 | 2; other: number } {
    const n = this.targets.length;
    let best = 0;
    let bestAbs = Infinity;
    let bestHarm = -1;
    let bestHarmAbs = Infinity;
    for (let i = 0; i < n; i++) {
      const c = Math.abs(centsBetween(freq, this.targets[i]));
      if (c < bestAbs) {
        bestAbs = c;
        best = i;
      }
      const c2 = Math.abs(centsBetween(freq, this.targets[i] * 2));
      if (c2 < bestHarmAbs) {
        bestHarmAbs = c2;
        bestHarm = i;
      }
    }

    if (this.mode === 'locked') {
      const s = this.locked;
      const c1 = Math.abs(centsBetween(freq, this.targets[s]));
      const c2 = Math.abs(centsBetween(freq, this.targets[s] * 2));
      const harmonic: 1 | 2 = this.harmonics && c2 <= 60 && c2 < c1 ? 2 : 1;
      const own = harmonic === 2 ? c2 : c1;
      // Far from the selected string but right on another one: probably the wrong string was plucked.
      const other = own > 150 && best !== s && bestAbs <= 50 ? best : -1;
      return { string: s, harmonic, other };
    }

    // The 12th-fret harmonic of a string: only when it is close and no open string is anywhere near
    // that pitch (a string that is simply far too sharp must not be mistaken for a harmonic).
    if (this.harmonics && bestHarmAbs <= 35 && bestAbs > 120) return { string: bestHarm, harmonic: 2, other: -1 };

    // Within one note, do not hop to a neighbouring string unless it is clearly closer.
    if (!newNote && this.current >= 0 && this.current < n && this.current !== best) {
      const cur = Math.abs(centsBetween(freq, this.targets[this.current]));
      if (bestAbs + 50 >= cur) best = this.current;
    }
    return { string: best, harmonic: 1, other: -1 };
  }

  private hintFor(cents: number, within: boolean, inTune: boolean, name: string, otherString: number): TunerHint {
    if (inTune) return { code: 'in-tune', text: `${name} is in tune.`, severity: 'success' };
    if (within) return { code: 'hold', text: 'That is it. Let it ring.', severity: 'success' };
    if (otherString >= 0) {
      return {
        code: 'other-string',
        text: `That sounds like the ${this.labelOf(otherString)} string. You have ${name} selected.`,
        severity: 'warning',
      };
    }
    if (cents < -this.far) {
      return {
        code: 'far-below',
        text: `This is more than a whole step below ${name}. Tighten slowly, and check you are turning the peg for this string.`,
        severity: 'warning',
      };
    }
    if (cents > this.far) {
      return {
        code: 'far-above',
        text: `This is more than a whole step above ${name}. Loosen the string now: wound this tight it can snap.`,
        severity: 'warning',
      };
    }
    const close = Math.abs(cents) <= 10;
    if (cents < 0) {
      return close
        ? { code: 'almost-up', text: 'A touch low. Tighten very slightly.', severity: 'info' }
        : { code: 'tune-up', text: 'Too low. Tighten the string.', severity: 'info' };
    }
    return close
      ? { code: 'almost-down', text: 'A touch high. Loosen very slightly.', severity: 'info' }
      : { code: 'tune-down', text: 'Too high. Loosen the string.', severity: 'info' };
  }
}

/**
 * Wire a tuner to a pitch source: readings update it, note-off and silence release it.
 * `onState` is called on every change; the returned function unsubscribes.
 */
export function attachTuner(source: PitchSource, tuner: Tuner, onState: (state: TunerState) => void): () => void {
  const offs = [
    source.on('pitch', (r) => onState(tuner.update(r))),
    source.on('noteoff', () => onState(tuner.release())),
    source.on('silence', () => onState(tuner.release())),
  ];
  return () => offs.forEach((off) => off());
}

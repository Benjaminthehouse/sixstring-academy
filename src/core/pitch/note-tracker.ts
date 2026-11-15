/**
 * Turns the raw frame-by-frame pitch estimates into what screens want: a steady pitch reading for
 * the sounding note, and note-on / note-off / silence events.
 *
 * A pure state machine (no audio, no timers): feed it one {@link TrackerFrame} per analysis hop.
 *  - A note starts only after a few consecutive clear frames agree, so the pick transient and the
 *    unsettled first milliseconds never produce a note (or move a tuner needle).
 *  - Within a note the reading is a short median, which drops single-frame outliers without lag.
 *  - Changing note needs the new pitch to persist (hysteresis); a jump of exactly an octave or a
 *    twelfth with no pluck needs longer still, because that is what a detector slip looks like.
 *  - A pluck heard while the same pitch is sounding restarts the note (repeated notes).
 *  - The gate follows the room noise, and a steady mains hum is recognised and ignored.
 */
import { DEFAULT_A4, freqToMidi, midiToFreq } from '@/core/math/pitch-math';
import { NoiseGate, type NoiseGateOptions, toDb } from './level';
import type { PitchEvent } from './types';

/** Options for {@link NoteTracker}. */
export interface NoteTrackerOptions extends NoiseGateOptions {
  /** Reference pitch for note names, in Hz (default 440). */
  a4?: number;
  /** Clarity a frame needs to count toward starting a note (default 0.7). */
  clarityOn?: number;
  /** Clarity down to which a sounding note is kept (default 0.5). */
  clarityOff?: number;
  /** Consecutive agreeing frames needed to start a note (default 3). */
  stableFrames?: number;
  /** How closely those frames must agree, in cents (default 35). */
  stableCents?: number;
  /** Consecutive frames on a new pitch needed to change note without a pluck (default 3). */
  changeFrames?: number;
  /** Same, when the new pitch is an octave or twelfth away and no pluck was heard (default 7). */
  harmonicChangeFrames?: number;
  /** A reading this many cents from the sounding note counts toward a change (default 60). */
  switchCents?: number;
  /** A sounding note survives unclear frames for this long, in ms (default 110). */
  holdMs?: number;
  /** A sounding note ends after this long below the gate, in ms (default 45). */
  releaseMs?: number;
  /** Readings in the median filter (default 5). */
  medianSize?: number;
  /** Readings this soon after a pluck are ignored, in ms (default 18). */
  attackHoldMs?: number;
  /** Quiet time before a `silence` event, in ms (default 250). */
  silenceMs?: number;
  /** Restart a note when it is plucked again while still sounding (default true). */
  retrigger?: boolean;
  /** Recognise and ignore steady mains hum (default true). */
  rejectHum?: boolean;
}

/** One analysis frame handed to the tracker. */
export interface TrackerFrame {
  /** Time of the newest audio in the frame, seconds. */
  time: number;
  /** Detected fundamental in Hz, or 0. */
  freq: number;
  /** Clarity of the detection, 0..1. */
  clarity: number;
  /** RMS level of the frame, linear. */
  rms: number;
  /** Seconds of audio the detection looked at (used to back-date note starts). */
  window?: number;
  /** Time of a pluck detected since the previous frame, if any. */
  onsetTime?: number;
}

interface ActiveNote {
  midi: number;
  start: number;
  lastValid: number;
  quiet: number;
  buf: number[];
  humT0: number;
  humDb0: number;
}

const HARMONIC_JUMPS = [12, 19, 24, 28, 31];

function isHarmonicJump(semitones: number): boolean {
  const d = Math.abs(semitones);
  for (const j of HARMONIC_JUMPS) if (Math.abs(d - j) <= 0.4) return true;
  return false;
}

function medianOf(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** True when `freq` sits on a low multiple of the 50 or 60 Hz mains frequency. */
export function isMainsPitch(freq: number): boolean {
  for (const base of [50, 60]) {
    const h = Math.round(freq / base);
    if (h >= 1 && h <= 6 && Math.abs(1200 * Math.log2(freq / (base * h))) <= 25) return true;
  }
  return false;
}

/** Note segmentation and pitch smoothing; see the file comment. */
export class NoteTracker {
  /** Adaptive noise gate (exposed for the level meter). */
  readonly gate: NoiseGate;
  private a4: number;
  private readonly clarityOn: number;
  private readonly clarityOff: number;
  private readonly stableFrames: number;
  private readonly stableSemis: number;
  private readonly changeFrames: number;
  private readonly harmonicChangeFrames: number;
  private readonly switchSemis: number;
  private readonly hold: number;
  private readonly release: number;
  private readonly medianSize: number;
  private readonly attackHold: number;
  private readonly silenceAfter: number;
  private readonly retrigger: boolean;
  private readonly rejectHum: boolean;
  private readonly maxGateDb: number;

  private note: ActiveNote | null = null;
  private pend: number[] = [];
  private pendTimes: number[] = [];
  private pendGap = 0;
  private onsetTime = -1e9;
  private onsetFresh = false;
  private lastTime = Number.NaN;
  private quietSince = Number.NaN;
  private silenceSent = false;
  private humLevel = Number.NaN;

  constructor(opts: NoteTrackerOptions = {}) {
    this.gate = new NoiseGate(opts);
    this.a4 = opts.a4 ?? DEFAULT_A4;
    this.clarityOn = opts.clarityOn ?? 0.7;
    this.clarityOff = opts.clarityOff ?? 0.5;
    this.stableFrames = Math.max(1, opts.stableFrames ?? 3);
    this.stableSemis = (opts.stableCents ?? 35) / 100;
    this.changeFrames = Math.max(1, opts.changeFrames ?? 3);
    this.harmonicChangeFrames = Math.max(1, opts.harmonicChangeFrames ?? 7);
    this.switchSemis = (opts.switchCents ?? 60) / 100;
    this.hold = (opts.holdMs ?? 110) / 1000;
    this.release = (opts.releaseMs ?? 45) / 1000;
    this.medianSize = Math.max(1, opts.medianSize ?? 5);
    this.attackHold = (opts.attackHoldMs ?? 18) / 1000;
    this.silenceAfter = (opts.silenceMs ?? 250) / 1000;
    this.retrigger = opts.retrigger ?? true;
    this.rejectHum = opts.rejectHum ?? true;
    this.maxGateDb = opts.maxGateDb ?? -38;
  }

  /** Change the reference pitch; takes effect from the next frame. */
  setA4(a4: number): void {
    this.a4 = a4;
  }

  /** MIDI number of the sounding note, or null. */
  get activeMidi(): number | null {
    return this.note ? this.note.midi : null;
  }

  /** True while a steady mains hum is being ignored. */
  get hum(): boolean {
    return !Number.isNaN(this.humLevel);
  }

  /**
   * Pitch to hand the detector as its hint for the next frame (0 = none). No hint is given right
   * after a pluck: the new note must be found on its own merits.
   */
  get hintFreq(): number {
    if (!this.note || this.onsetFresh) return 0;
    return midiToFreq(medianOf(this.note.buf), this.a4);
  }

  /**
   * Pitch of the note that was sounding when the latest pluck arrived, for a short while after
   * that pluck (0 otherwise). The detector uses it to prefer the new note over the old one's tail.
   */
  get staleFreq(): number {
    return this.note && this.onsetFresh && this.onsetTime > this.note.start + 0.04
      ? midiToFreq(medianOf(this.note.buf), this.a4)
      : 0;
  }

  /** Forget everything (new stream). If a note is sounding, its note-off is appended to `out`. */
  reset(out?: PitchEvent[]): void {
    if (this.note && out && !Number.isNaN(this.lastTime)) this.endNote(this.lastTime, out);
    this.note = null;
    this.pend.length = 0;
    this.pendTimes.length = 0;
    this.pendGap = 0;
    this.onsetTime = -1e9;
    this.onsetFresh = false;
    this.lastTime = Number.NaN;
    this.quietSince = Number.NaN;
    this.silenceSent = false;
    this.humLevel = Number.NaN;
    this.gate.reset();
  }

  /** Feed one frame; events are appended to `out` and returned. */
  push(frame: TrackerFrame, out: PitchEvent[] = []): PitchEvent[] {
    const time = frame.time;
    const dt = Number.isNaN(this.lastTime) ? 0 : Math.max(0, time - this.lastTime);
    this.lastTime = time;
    const levelDb = toDb(frame.rms);
    this.gate.update(levelDb, time, this.note !== null);
    if (this.hum && levelDb < this.humLevel - 6) this.humLevel = Number.NaN;
    const gateOn = this.gate.gateDb;

    if (frame.onsetTime !== undefined) {
      this.onsetTime = frame.onsetTime;
      this.onsetFresh = true;
    }
    if (this.onsetFresh && time - this.onsetTime > 0.3) this.onsetFresh = false;
    const inAttack = this.onsetFresh && time - this.onsetTime < this.attackHold;

    const pitch = frame.freq > 0 ? freqToMidi(frame.freq, this.a4) : Number.NaN;
    const note = this.note;
    const loud = levelDb >= (note ? gateOn - 6 : gateOn);
    const valid = !Number.isNaN(pitch) && loud && frame.clarity >= (note ? this.clarityOff : this.clarityOn);

    if (note) {
      if (valid && Math.abs(pitch - note.midi) <= this.switchSemis) {
        note.quiet = 0;
        note.lastValid = time;
        this.clearPending();
        const replucked = this.onsetFresh && this.retrigger && this.onsetTime > note.start + 0.04;
        if (replucked) {
          // Until the analysis window lies almost wholly after the pluck it still shows the old
          // note, whatever was plucked: wait before calling this "the same note again".
          const settled = time - this.onsetTime >= Math.max(this.attackHold, (frame.window ?? 0.03) * 0.9);
          if (settled && frame.clarity >= this.clarityOn) {
            const at = this.onsetTime;
            this.endNote(at, out);
            this.beginNote([pitch], at, frame, levelDb, true, out);
          }
        } else if (!inAttack) {
          note.buf.push(pitch);
          if (note.buf.length > this.medianSize) note.buf.shift();
          this.emitPitch(note, frame, levelDb, out);
          this.checkHum(note, time, levelDb, out);
        }
      } else if (valid && !inAttack) {
        note.quiet = 0;
        this.addPending(pitch, time);
        const harmonic = !this.onsetFresh && isHarmonicJump(pitch - note.midi);
        const agreed = this.agreement(harmonic ? this.harmonicChangeFrames : this.changeFrames, dt);
        if (agreed) {
          const at = this.startTimeFor(frame, note.start);
          this.endNote(at, out);
          this.beginNote(agreed, at, frame, levelDb, false, out);
        } else if (time - note.lastValid > this.hold) {
          this.endNote(note.lastValid, out);
        }
      } else {
        if (!valid) this.missPending();
        note.quiet = loud ? 0 : note.quiet + dt;
        if (note.quiet >= this.release || time - note.lastValid > this.hold) {
          this.endNote(Math.max(note.lastValid, note.start), out);
          this.quietSince = loud ? Number.NaN : time;
        }
      }
    } else {
      if (valid && !inAttack) {
        this.addPending(pitch, time);
        const agreed = this.agreement(this.stableFrames, dt);
        if (agreed) this.beginNote(agreed, this.startTimeFor(frame, -1e9), frame, levelDb, false, out);
      } else if (!valid) {
        this.missPending();
      }
      if (!this.note) {
        if (levelDb < gateOn) {
          if (Number.isNaN(this.quietSince)) this.quietSince = time;
          if (!this.silenceSent && time - this.quietSince >= this.silenceAfter) {
            this.silenceSent = true;
            out.push({ type: 'silence', time });
          }
        } else {
          this.quietSince = Number.NaN;
        }
      }
    }
    return out;
  }

  private addPending(pitch: number, time: number): void {
    this.pend.push(pitch);
    this.pendTimes.push(time);
    this.pendGap = 0;
    if (this.pend.length > 16) {
      this.pend.shift();
      this.pendTimes.shift();
    }
  }

  private missPending(): void {
    if (++this.pendGap >= 2) this.clearPending();
  }

  private clearPending(): void {
    this.pend.length = 0;
    this.pendTimes.length = 0;
    this.pendGap = 0;
  }

  /** The last `need` pending readings if they are recent and agree with each other, else null. */
  private agreement(need: number, dt: number): number[] | null {
    const n = this.pend.length;
    if (n < need) return null;
    const maxGap = Math.max(0.05, dt * 3);
    for (let i = n - need + 1; i < n; i++) {
      if (this.pendTimes[i] - this.pendTimes[i - 1] > maxGap) return null;
    }
    const last = this.pend.slice(n - need);
    const med = medianOf(last);
    for (const p of last) if (Math.abs(p - med) > this.stableSemis) return null;
    return last;
  }

  /** When the note that is about to be confirmed really began. */
  private startTimeFor(frame: TrackerFrame, notBefore: number): number {
    const firstHeard = this.pendTimes.length ? this.pendTimes[Math.max(0, this.pendTimes.length - this.stableFrames)] : frame.time;
    if (this.onsetFresh && this.onsetTime > notBefore && this.onsetTime <= firstHeard) return this.onsetTime;
    // No pluck was heard (legato, a slide): the pitch became readable about half a window after it began.
    const back = Math.min(0.06, (frame.window ?? 0.03) * 0.5);
    return Math.max(notBefore, firstHeard - back);
  }

  private beginNote(values: number[], start: number, frame: TrackerFrame, levelDb: number, retrigger: boolean, out: PitchEvent[]): void {
    const med = medianOf(values);
    const note: ActiveNote = {
      midi: Math.round(med),
      start,
      lastValid: frame.time,
      quiet: 0,
      buf: values.slice(-this.medianSize),
      humT0: frame.time + 0.5,
      humDb0: Number.NaN,
    };
    this.note = note;
    this.onsetFresh = false;
    this.clearPending();
    this.silenceSent = false;
    this.quietSince = Number.NaN;
    out.push({
      type: 'noteon',
      time: start,
      detectedAt: frame.time,
      midi: note.midi,
      freq: midiToFreq(med, this.a4),
      level: frame.rms,
      levelDb,
      retrigger,
    });
    this.emitPitch(note, frame, levelDb, out);
  }

  private endNote(time: number, out: PitchEvent[]): void {
    const note = this.note;
    if (!note) return;
    this.note = null;
    out.push({ type: 'noteoff', time, midi: note.midi, duration: Math.max(0, time - note.start) });
  }

  private emitPitch(note: ActiveNote, frame: TrackerFrame, levelDb: number, out: PitchEvent[]): void {
    const med = medianOf(note.buf);
    out.push({
      type: 'pitch',
      time: frame.time,
      freq: midiToFreq(med, this.a4),
      rawFreq: frame.freq,
      midi: note.midi,
      cents: (med - note.midi) * 100,
      clarity: frame.clarity,
      level: frame.rms,
      levelDb,
      noteAge: Math.max(0, frame.time - note.start),
    });
  }

  /** A quiet "note" on a mains multiple whose level does not decay is hum, not a string. */
  private checkHum(note: ActiveNote, time: number, levelDb: number, out: PitchEvent[]): void {
    if (!this.rejectHum || time < note.humT0) return;
    if (Number.isNaN(note.humDb0)) {
      note.humDb0 = levelDb;
      return;
    }
    if (time - note.humT0 < 2) return;
    const steady = Math.abs(levelDb - note.humDb0) < 1.5;
    if (steady && levelDb < this.maxGateDb && isMainsPitch(midiToFreq(medianOf(note.buf), this.a4))) {
      this.endNote(time, out);
      this.gate.adopt(levelDb);
      this.humLevel = levelDb;
      return;
    }
    note.humT0 = time;
    note.humDb0 = levelDb;
  }
}

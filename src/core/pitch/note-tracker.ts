/**
 * Turns the raw frame-by-frame pitch estimates into what screens want: a steady pitch reading for
 * the sounding note, and note-on / note-off / silence events.
 *
 * A pure state machine (no audio, no timers): feed it one {@link TrackerFrame} per analysis hop.
 *  - A note starts only after a few consecutive clear frames agree, so the pick transient and the
 *    unsettled first milliseconds never produce a note (or move a tuner needle). While the body of
 *    the guitar and the room are still answering the pluck (the first 50 ms or so), those frames
 *    can agree with each other and still be tens of cents off: a reading that falls between two
 *    notes is therefore not named until it has had time to settle.
 *  - Within a note the reading is a short median, which drops single-frame outliers without lag.
 *  - Changing note needs the new pitch to persist (hysteresis); a jump of exactly an octave or a
 *    twelfth with no pluck needs longer still, because that is what a detector slip looks like.
 *  - A pluck heard while the same pitch is sounding restarts the note (repeated notes).
 *  - The gate follows the room noise, and a steady mains hum is recognised and ignored: a sound
 *    at a multiple of 50 or 60 Hz that nobody plucked is watched instead of being called a note.
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
  /**
   * A note that starts within this many cents of a note centre is named at once (default 20).
   * Further out it could be either neighbour while the attack settles, so naming it waits for
   * `labelSettleMs`. A guitar that is in tune never waits.
   */
  centreCents?: number;
  /** Longest wait for an off-centre attack to settle before the note is named anyway, in ms after the pluck (default 70). */
  labelSettleMs?: number;
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

/** A mains-pitched sound whose level holds this long (seconds) is hum. A string decays in that time. */
const HUM_WATCH_S = 1;
/** Level drop (dB) that shows a watched mains-pitched sound to be a decaying string after all. */
const HUM_DECAY_DB = 2.5;
/**
 * How close to a mains multiple an unplucked tone must be to be watched as hum, in cents. Mains
 * frequency itself wanders by 3 cents at most; an open B string in tune is 21 cents from 250 Hz
 * and must not qualify.
 */
const HUM_WATCH_CENTS = 10;
/** A hum that was watched for a moment this recently (seconds) is still assumed to be there under the notes that followed. */
const HUM_MEMORY_S = 15;
/** A sounding note is given up once the level is within this many dB of a hum that was seen: from there on its pitch is the hum's. */
const HUM_HOLD_DB = 4;
/** With nothing plucked, a tone has to be this many dB above a hum that was seen to count as a note. */
const HUM_CLEAR_DB = 12;
/** After a pluck it has to be this many dB above that hum (a hum beating against a fading note can look like a pluck). */
const HUM_PLUCK_DB = 6;

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

/** True when `freq` sits within `toleranceCents` (default 25) of a low multiple of the 50 or 60 Hz mains frequency. */
export function isMainsPitch(freq: number, toleranceCents: number = 25): boolean {
  for (const base of [50, 60]) {
    const h = Math.round(freq / base);
    if (h >= 1 && h <= 6 && Math.abs(1200 * Math.log2(freq / (base * h))) <= toleranceCents) return true;
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
  private readonly centreSemis: number;
  private readonly labelSettle: number;
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

  private note: ActiveNote | null = null;
  private pend: number[] = [];
  private pendTimes: number[] = [];
  private pendGap = 0;
  private onsetTime = -1e9;
  private onsetFresh = false;
  private repluckSeen = 0;
  private lastTime = Number.NaN;
  private quietSince = Number.NaN;
  private silenceSent = false;
  private humLevel = Number.NaN;
  private humSince = Number.NaN;
  private humDb0 = Number.NaN;
  private humSeen = Number.NaN;
  private humKnownAt = Number.NaN;
  private humSeenDb = -120;
  private humFreq = 0;

  constructor(opts: NoteTrackerOptions = {}) {
    this.gate = new NoiseGate(opts);
    this.a4 = opts.a4 ?? DEFAULT_A4;
    this.clarityOn = opts.clarityOn ?? 0.7;
    this.clarityOff = opts.clarityOff ?? 0.5;
    this.stableFrames = Math.max(1, opts.stableFrames ?? 3);
    this.stableSemis = (opts.stableCents ?? 35) / 100;
    this.centreSemis = (opts.centreCents ?? 20) / 100;
    this.labelSettle = (opts.labelSettleMs ?? 70) / 1000;
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
    if (this.note) {
      return this.onsetFresh && this.onsetTime > this.note.start + 0.04 ? midiToFreq(medianOf(this.note.buf), this.a4) : 0;
    }
    // A hum under watch plays the same part as a note ringing on: what is plucked over it is the new note.
    return !Number.isNaN(this.humSeen) && this.lastTime - this.humSeen < 0.3 ? this.humFreq : 0;
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
    this.humSince = Number.NaN;
    this.humDb0 = Number.NaN;
    this.humSeen = Number.NaN;
    this.humKnownAt = Number.NaN;
    this.gate.reset();
  }

  /** Feed one frame; events are appended to `out` and returned. */
  push(frame: TrackerFrame, out: PitchEvent[] = []): PitchEvent[] {
    const time = frame.time;
    const dt = Number.isNaN(this.lastTime) ? 0 : Math.max(0, time - this.lastTime);
    this.lastTime = time;
    const levelDb = toDb(frame.rms);
    this.gate.update(levelDb, time, this.note !== null);
    if (this.hum && levelDb < this.humLevel - 6) {
      this.humLevel = Number.NaN;
      this.gate.forgetHum();
    }
    const gateOn = this.gate.gateDb;

    if (frame.onsetTime !== undefined) {
      this.onsetTime = frame.onsetTime;
      this.onsetFresh = true;
      this.repluckSeen = 0;
    }
    if (this.onsetFresh && time - this.onsetTime > 0.3) this.onsetFresh = false;
    const inAttack = this.onsetFresh && time - this.onsetTime < this.attackHold;

    const pitch = frame.freq > 0 ? freqToMidi(frame.freq, this.a4) : Number.NaN;
    // A clear tone on a mains multiple with no pluck before it: hum until it proves otherwise.
    const humLike =
      this.rejectHum &&
      !this.onsetFresh &&
      !Number.isNaN(pitch) &&
      frame.clarity >= this.clarityOn &&
      isMainsPitch(frame.freq, HUM_WATCH_CENTS);
    const note = this.note;
    const remembered = this.humRemembered(time);
    // Unplucked sound close to the level of a hum that was seen is that hum, whatever pitch the mix reads as.
    const nearHum = remembered && !this.onsetFresh && levelDb < this.humSeenDb + HUM_CLEAR_DB;
    const holdDb = remembered ? Math.max(gateOn - 6, this.humSeenDb + HUM_HOLD_DB) : gateOn - 6;
    const loud = levelDb >= (note ? holdDb : gateOn);
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
          // Two such frames in a row: one alone can be the last of the old note when the new one
          // comes in softly (a hammer-on that happened to click).
          if (settled && frame.clarity >= this.clarityOn && ++this.repluckSeen >= 2) {
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
      } else if (
        valid &&
        !inAttack &&
        levelDb >= gateOn &&
        frame.clarity >= this.clarityOn &&
        !nearHum &&
        !(remembered && humLike)
      ) {
        // (A different pitch only counts when it is as loud and as clear as a note has to be to
        // start from silence: what shows through a note that has almost faded is the room, not
        // a new note. Least of all a hum that was there before the note.)
        note.quiet = 0;
        this.repluckSeen = 0;
        this.addPending(pitch, time);
        const harmonic = !this.onsetFresh && isHarmonicJump(pitch - note.midi);
        const agreed = this.agreement(harmonic ? this.harmonicChangeFrames : this.changeFrames, dt);
        // A change with no pluck is a slide, a bend or a hammer-on: nothing to wait for. After a
        // pluck the new note's name has to settle like any other attack.
        if (agreed && (!this.onsetFresh || this.labelSettled(agreed, time))) {
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
      const isString = humLike ? this.watchHum(time, levelDb, frame.freq) : false;
      if (!humLike && !Number.isNaN(this.humSince) && time - this.humSeen > 0.3) this.humSince = Number.NaN;
      if (valid && !inAttack) {
        this.addPending(pitch, time);
        const agreed = this.agreement(this.stableFrames, dt);
        // With a hum about, a note needs a pluck: a tone that merely appears is the hum showing
        // through (and what decays under it is the tail of the last note, not a new string).
        // (`humLike` is never true right after a pluck.)
        const plausible = remembered
          ? !humLike && levelDb >= this.humSeenDb + (this.onsetFresh ? HUM_PLUCK_DB : HUM_CLEAR_DB)
          : !humLike || isString;
        if (agreed && plausible && this.labelSettled(agreed, time)) {
          this.beginNote(agreed, this.startTimeFor(frame, -1e9), frame, levelDb, false, out);
        }
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

  /** True when a hum is known, or was being watched not long ago. */
  private humRemembered(time: number): boolean {
    return this.hum || (!Number.isNaN(this.humKnownAt) && time - this.humKnownAt < HUM_MEMORY_S);
  }

  /**
   * Follow a mains-pitched sound that nobody plucked. If its level holds for {@link HUM_WATCH_S}
   * it is adopted as background hum; returns true once it has decayed enough to be a string after
   * all (a note whose pluck was missed, or that was already ringing when listening began).
   */
  private watchHum(time: number, levelDb: number, freq: number): boolean {
    this.humSeen = time;
    this.humFreq = freq;
    this.humSeenDb = levelDb;
    if (Number.isNaN(this.humSince) || levelDb > this.humDb0 + 2) {
      this.humSince = time;
      this.humDb0 = levelDb;
      return false;
    }
    if (levelDb < this.humDb0 - HUM_DECAY_DB) return true;
    // A few stray frames are not a hum; a steady 150 ms is worth remembering.
    if (time - this.humSince >= 0.15) this.humKnownAt = time;
    if (time - this.humSince >= HUM_WATCH_S && (!this.hum || Math.abs(levelDb - this.humLevel) > 1.5)) {
      this.humLevel = levelDb;
      this.gate.adopt(levelDb);
    }
    return false;
  }

  /**
   * True when the agreed readings can be given a note name: they sit near a note centre, or the
   * attack has had `labelSettleMs` to settle (see the option of that name).
   */
  private labelSettled(values: readonly number[], time: number): boolean {
    const med = medianOf(values);
    if (Math.abs(med - Math.round(med)) <= this.centreSemis) return true;
    const since = this.onsetFresh ? this.onsetTime : this.pendTimes.length ? this.pendTimes[0] : time;
    return time - since >= this.labelSettle;
  }

  /** When the note that is about to be confirmed really began. */
  private startTimeFor(frame: TrackerFrame, notBefore: number): number {
    // The first of the readings that agree on this note (more than `stableFrames` of them when
    // naming it had to wait for the attack to settle).
    let first = Math.max(0, this.pend.length - this.stableFrames);
    if (this.pend.length > 0) {
      const med = medianOf(this.pend.slice(first));
      while (first > 0 && Math.abs(this.pend[first - 1] - med) <= this.stableSemis) first--;
    }
    const firstHeard = this.pendTimes.length ? this.pendTimes[first] : frame.time;
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
    this.humSince = Number.NaN;
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
    if (time - note.humT0 < HUM_WATCH_S) return;
    const steady = Math.abs(levelDb - note.humDb0) < 1.5;
    if (steady && isMainsPitch(midiToFreq(medianOf(note.buf), this.a4), HUM_WATCH_CENTS)) {
      this.endNote(time, out);
      this.gate.adopt(levelDb);
      this.humLevel = levelDb;
      return;
    }
    note.humT0 = time;
    note.humDb0 = levelDb;
  }
}

/**
 * What the tuner says: the instruction in plain words for a reading, the warning to show about the
 * input level, and the short honest hints (a fresh pluck reads sharp; damp the other strings).
 * Pure: every decision takes the previous one, so wording never flickers at a threshold.
 */
import type { LevelEvent, TunerState } from '@/core/pitch';

/** What the learner should do right now. */
export type InstructionCode =
  | 'pluck'
  | 'tighten'
  | 'tighten-little'
  | 'loosen'
  | 'loosen-little'
  | 'hold'
  | 'in-tune'
  | 'far-below'
  | 'far-above'
  | 'other-string';

/** Within this many cents the wording turns to "a little". */
const NEAR_CENTS = 10;
/** A wording that is showing survives this many cents past its threshold. */
const NEAR_SLACK = 2;
/** More than a whole step: the string may snap (too high) or be the wrong peg (too low). */
const FAR_CENTS = 200;
const FAR_SLACK = 15;

/** The instruction for a tuner state, given the one showing now (for hysteresis). */
export function nextInstruction(state: Pick<TunerState, 'active' | 'cents' | 'withinTolerance' | 'inTune' | 'hint' | 'mode'>, previous: InstructionCode): InstructionCode {
  if (!state.active) return 'pluck';
  if (state.inTune) return 'in-tune';
  if (state.withinTolerance) return 'hold';
  if (state.hint.code === 'other-string') return 'other-string';
  const cents = state.cents;
  const abs = Math.abs(cents);
  if (state.mode !== 'chromatic') {
    const wasFar = previous === 'far-below' || previous === 'far-above';
    if (abs > FAR_CENTS || (wasFar && abs > FAR_CENTS - FAR_SLACK)) return cents < 0 ? 'far-below' : 'far-above';
  }
  const wasNear = previous === 'tighten-little' || previous === 'loosen-little' || previous === 'hold' || previous === 'in-tune';
  const near = abs <= NEAR_CENTS || (wasNear && abs <= NEAR_CENTS + NEAR_SLACK);
  if (cents < 0) return near ? 'tighten-little' : 'tighten';
  return near ? 'loosen-little' : 'loosen';
}

/** Which way the instruction points, for the icon beside the words. */
export type InstructionIcon = 'pluck' | 'up' | 'down' | 'hold' | 'check' | 'warning';

/** Ready-to-show wording. */
export interface InstructionText {
  /** The big line: `Tighten a little`. */
  title: string;
  /** The small line under it. */
  detail: string;
  tone: 'neutral' | 'ok' | 'warn';
  icon: InstructionIcon;
}

/** What the wording needs to know about the situation. */
export interface InstructionContext {
  /** How the target is chosen. */
  mode: 'guide' | 'auto' | 'locked' | 'chromatic';
  /** Display name of the target note without octave: `E`, `E♭`. Empty when nothing is targeted. */
  note: string;
  /** `thickest string`, `5th string`; empty in chromatic mode. */
  stringName: string;
  /** Where that string is, for the guided flow: `string 6, the one nearest your chin`. */
  where?: string;
  /** For `other-string`: the note of the string that seems to have been plucked. */
  otherNote?: string;
  /** For `other-string`: `5th string`. */
  otherStringName?: string;
}

/** The words for an instruction. */
export function instructionText(code: InstructionCode, ctx: InstructionContext): InstructionText {
  const target = ctx.note || 'the note';
  switch (code) {
    case 'pluck':
      if (ctx.mode === 'chromatic') return { title: 'Play any note', detail: 'One note at a time, and let it ring.', tone: 'neutral', icon: 'pluck' };
      if ((ctx.mode === 'guide' || ctx.mode === 'locked') && ctx.stringName) {
        return {
          title: `Pluck the ${ctx.stringName}`,
          detail: ctx.where ? `That is ${ctx.where}. Let it ring.` : 'Let it ring, and pluck again every few seconds.',
          tone: 'neutral',
          icon: 'pluck',
        };
      }
      return { title: 'Pluck one string', detail: 'Any string, on its own. Let it ring.', tone: 'neutral', icon: 'pluck' };
    case 'tighten':
      return { title: 'Tighten', detail: "Too low. Turn this string's peg so the note rises.", tone: 'neutral', icon: 'up' };
    case 'tighten-little':
      return { title: 'Tighten a little', detail: 'Nearly there. A small turn.', tone: 'neutral', icon: 'up' };
    case 'loosen':
      return { title: 'Loosen', detail: "Too high. Turn this string's peg so the note falls.", tone: 'neutral', icon: 'down' };
    case 'loosen-little':
      return { title: 'Loosen a little', detail: 'Nearly there. Go just under the note, then come back up to it.', tone: 'neutral', icon: 'down' };
    case 'hold':
      return { title: 'Hold it there', detail: 'Stop turning and let it ring.', tone: 'ok', icon: 'hold' };
    case 'in-tune':
      return { title: 'In tune', detail: `${target} is right.`, tone: 'ok', icon: 'check' };
    case 'far-below':
      return {
        title: 'Far too low',
        detail: `Over a whole step below ${target}. Tighten slowly, and check you have this string's peg.`,
        tone: 'warn',
        icon: 'warning',
      };
    case 'far-above':
      return {
        title: 'Far too high: loosen now',
        detail: `Over a whole step above ${target}. A string wound this tight can snap.`,
        tone: 'warn',
        icon: 'warning',
      };
    case 'other-string':
      return {
        title: 'Is that the right string?',
        detail: `That sounds like the ${ctx.otherStringName ?? 'next string'}${ctx.otherNote ? ` (${ctx.otherNote})` : ''}. For ${target}, pluck the ${ctx.stringName || 'string you chose'}.`,
        tone: 'warn',
        icon: 'warning',
      };
  }
}

/** A sentence for screen readers: the instruction with its number. */
export function spokenReading(code: InstructionCode, text: InstructionText, cents: number, note: string): string {
  if (code === 'pluck') return text.title;
  if (code === 'in-tune') return `${note} is in tune.`;
  if (code === 'hold') return `${note}: hold it there.`;
  const amount = Math.round(Math.abs(cents));
  if (code === 'far-below' || code === 'far-above' || code === 'other-string') return `${text.title}. ${text.detail}`;
  return `${note}: ${amount} cents ${cents < 0 ? 'low' : 'high'}. ${text.title}.`;
}

// ---------------------------------------------------------------------------------------------
// Input level
// ---------------------------------------------------------------------------------------------

/** What to tell the learner about the microphone signal. */
export type LevelAdvice = 'ok' | 'too-quiet' | 'too-loud' | 'noisy' | 'hum';

/** The sentence for each level warning. */
export const LEVEL_MESSAGES: Record<LevelAdvice, string> = {
  ok: '',
  'too-quiet': 'Too quiet: move closer',
  'too-loud': 'Too loud: move back or pluck softer',
  noisy: 'Noisy here: move closer, or find a quieter spot',
  hum: 'Background hum is being ignored',
};

/** A note that starts less than this far above the gate, and this quiet in absolute terms, was barely heard. */
const WEAK_NOTE_DB = 6;
const WEAK_NOTE_MAX_DB = -45;
/** A room louder than this, in dBFS, is noisy enough to say so. */
const NOISY_FLOOR_DB = -45;
const NOISY_AFTER_S = 2;
/** How long each warning stays up after its cause, in seconds: long enough to read. */
const LOUD_HOLD_S = 2.5;
const QUIET_HOLD_S = 3.5;

/**
 * Turns the tracker's level events into at most one plain warning. Fed every level event; time
 * comes from the events, so it behaves the same on replayed audio.
 *
 * "Too quiet" is only said about a note that was actually heard and barely made it: room noise
 * that never becomes a note says nothing about where the guitar is, and a tuner that nags a
 * learner who has not plucked yet is worse than one that stays silent.
 */
export class LevelWatch {
  private loudUntil = -Infinity;
  private quietUntil = -Infinity;
  private noisySince = Number.NaN;
  private current: LevelAdvice = 'ok';

  /** The advice in force. */
  get advice(): LevelAdvice {
    return this.current;
  }

  /** Forget everything (the microphone was restarted). */
  reset(): void {
    this.loudUntil = -Infinity;
    this.quietUntil = -Infinity;
    this.noisySince = Number.NaN;
    this.current = 'ok';
  }

  /** A note began at this level: a start barely above the gate means the guitar is too far away. */
  noteStarted(time: number, levelDb: number, gateDb: number): void {
    if (levelDb < gateDb + WEAK_NOTE_DB && levelDb < WEAK_NOTE_MAX_DB) this.quietUntil = time + QUIET_HOLD_S;
    else this.quietUntil = -Infinity;
  }

  /** Feed one level event. `noteActive` says whether the tracker currently hears a note. */
  update(e: LevelEvent, noteActive: boolean): LevelAdvice {
    if (e.clipping) this.loudUntil = e.time + LOUD_HOLD_S;

    if (!noteActive && e.noiseFloorDb > NOISY_FLOOR_DB && !e.hum) {
      if (Number.isNaN(this.noisySince)) this.noisySince = e.time;
    } else if (!noteActive) {
      this.noisySince = Number.NaN;
    }

    let next: LevelAdvice = 'ok';
    if (e.time < this.loudUntil) next = 'too-loud';
    else if (e.time < this.quietUntil) next = 'too-quiet';
    else if (e.hum) next = 'hum';
    else if (!Number.isNaN(this.noisySince) && e.time - this.noisySince >= NOISY_AFTER_S) next = 'noisy';
    this.current = next;
    return next;
  }
}

// ---------------------------------------------------------------------------------------------
// Honest hints
// ---------------------------------------------------------------------------------------------

/** A short hint drawn from what the pitch detector can and cannot do. */
export type TipCode = 'settling' | 'damp';

/** The sentence for each hint. */
export const TIP_MESSAGES: Record<TipCode, string> = {
  settling: 'A fresh pluck reads sharp, then settles. Wait a moment before turning.',
  damp: 'Wobbly reading? Rest a finger on the other strings to quiet them.',
};

/** How long a hint stays once it has been earned, in seconds. */
const TIP_HOLD_S = 6;
/** Each hint is offered this many times a visit, and hints keep this far apart: advice, not nagging. */
const TIP_REPEATS = 2;
const TIP_SPACING_S = 20;
/** The needle and the raw readings disagreeing by this much, on average, means another string is in the mix. */
const WOBBLE_CENTS = 1.8;
const WOBBLE_AFTER_S = 0.6;
/** A pluck that drops by this many cents in its first moments shows the "starts sharp" effect clearly. */
const SETTLE_DROP_CENTS = 4;

/**
 * Watches the readings of one note for the two effects worth explaining to a learner. Fed every
 * tuner update while a note sounds.
 */
export class TipWatch {
  private startCents = Number.NaN;
  private settleChecked = false;
  private wobble = 0;
  private wobbleSince = Number.NaN;
  private lastAge = -1;
  private tip: TipCode | null = null;
  private tipUntil = -Infinity;
  private shown: Record<TipCode, number> = { settling: 0, damp: 0 };

  /** The hint to show now, or null. */
  current(time: number): TipCode | null {
    return time < this.tipUntil ? this.tip : null;
  }

  /** Forget the hint and the note (how often each hint has been offered is remembered for the visit). */
  reset(): void {
    this.startCents = Number.NaN;
    this.settleChecked = false;
    this.wobble = 0;
    this.wobbleSince = Number.NaN;
    this.lastAge = -1;
    this.tip = null;
    this.tipUntil = -Infinity;
  }

  /** Feed one reading: `cents` is the steadied value, `rawCents` the frame's own, `age` seconds since the pluck. */
  update(time: number, age: number, cents: number, rawCents: number): TipCode | null {
    if (age < this.lastAge - 1e-6) {
      // A new pluck.
      this.startCents = Number.NaN;
      this.settleChecked = false;
      this.wobble = 0;
      this.wobbleSince = Number.NaN;
    }
    this.lastAge = age;

    if (Number.isNaN(this.startCents) && age >= 0.04 && age <= 0.14) this.startCents = rawCents;
    if (!this.settleChecked && age >= 0.4) {
      this.settleChecked = true;
      // Only worth saying near the note, where turning the peg on the first reading overshoots.
      if (!Number.isNaN(this.startCents) && this.startCents - cents >= SETTLE_DROP_CENTS && Math.abs(cents) < 15) this.show('settling', time);
    }

    // Close to the note and well past the pluck, the two values should agree to a fraction of a cent.
    if (age >= 0.5 && Math.abs(cents) <= 15) {
      this.wobble += 0.08 * (Math.abs(rawCents - cents) - this.wobble);
      if (this.wobble > WOBBLE_CENTS) {
        if (Number.isNaN(this.wobbleSince)) this.wobbleSince = time;
        if (time - this.wobbleSince >= WOBBLE_AFTER_S) this.show('damp', time);
      } else {
        this.wobbleSince = Number.NaN;
      }
    }
    return this.current(time);
  }

  private show(tip: TipCode, time: number): void {
    if (time < this.tipUntil + TIP_SPACING_S - TIP_HOLD_S && this.tipUntil > -Infinity) return;
    if (this.shown[tip] >= TIP_REPEATS) return;
    this.shown[tip]++;
    this.tip = tip;
    this.tipUntil = time + TIP_HOLD_S;
  }
}

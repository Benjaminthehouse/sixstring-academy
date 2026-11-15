/**
 * Staff position -> spelled pitch: clef, key signature and accidentals (which hold for the rest of
 * the bar at their staff position, and across a tie), with the guitar octave rule.
 */
import { type AccidentalType, type ClefType, type OmrPitch, type StepName, pitchAtStaffPosition } from '../types';

const SHARP_ORDER: StepName[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER: StepName[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

/** Alteration of every letter under a key signature (fifths: sharps positive). */
export function keyAlterations(fifths: number): Record<StepName, number> {
  const out: Record<StepName, number> = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  const n = Math.max(-7, Math.min(7, Math.round(fifths)));
  for (let i = 0; i < Math.abs(n); i++) {
    if (n > 0) out[SHARP_ORDER[i]] = 1; else out[FLAT_ORDER[i]] = -1;
  }
  return out;
}

/** Semitone shift of a printed accidental. */
export function accidentalAlter(type: AccidentalType): number {
  return type === 'sharp' ? 1 : type === 'flat' ? -1 : type === 'double-sharp' ? 2 : type === 'double-flat' ? -2 : 0;
}

/**
 * Pitch of a staff position under a clef. Treble clef is read the guitar way (sounding an octave
 * below the written pitch); bass clef at pitch.
 */
export function pitchOf(pos: number, alter: number, clef: ClefType): OmrPitch {
  if (clef === 'bass') return pitchAtStaffPosition(pos - 12, alter, 0);
  return pitchAtStaffPosition(pos, alter, -12);
}

/** Tracks the accidentals in force while reading a staff left to right. */
export class AccidentalState {
  private readonly key: Record<StepName, number>;
  private bar = new Map<number, number>();
  /** Alterations carried into the next bar by ties, by staff position. */
  private tied = new Map<number, number>();

  constructor(fifths: number, private readonly clef: ClefType) {
    this.key = keyAlterations(fifths);
  }

  /** Start a new bar: accidentals lapse, except on notes tied over the bar line. */
  newBar(): void {
    this.bar = new Map();
  }

  /**
   * Pitch of a head. `accidental` is the sign printed in front of it; `tieStop` says the head is
   * the end of a tie (it then keeps the pitch of the note it is tied to); `tieStart` remembers its
   * alteration for the head the tie leads to.
   */
  read(pos: number, accidental: AccidentalType | null, tieStop: boolean, tieStart: boolean): OmrPitch {
    const natural = pitchOf(pos, 0, this.clef);
    let alter: number;
    if (accidental) {
      alter = accidentalAlter(accidental);
      this.bar.set(pos, alter);
    } else if (tieStop && this.tied.has(pos)) {
      alter = this.tied.get(pos) as number;
      // A tied-over alteration counts as restated for the rest of this bar only by convention of
      // some engravers; keep the conservative reading (the tied note only).
    } else if (this.bar.has(pos)) {
      alter = this.bar.get(pos) as number;
    } else {
      alter = this.key[natural.step];
    }
    if (tieStop) this.tied.delete(pos);
    if (tieStart) this.tied.set(pos, alter);
    return pitchOf(pos, alter, this.clef);
  }
}

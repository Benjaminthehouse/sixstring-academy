/**
 * Staff helpers: where a spelled note sits on the five lines, how many ledger lines it needs, and
 * where the accidentals of a key signature go. For drawing notation and for note-reading drills.
 *
 * Positions count lines and spaces upward from the bottom line: 0 is the bottom line, 1 the first
 * space, 2 the second line … 8 the top line. Negative numbers and numbers above 8 are outside the
 * staff and need ledger lines.
 *
 * Guitar music is written an octave above where it sounds (a treble clef with a small 8 below).
 * Data in this app is always sounding pitch, so by default these helpers add the octave: the open
 * low E string, E2, is drawn where E3 is written, below the third ledger line under the staff.
 */
import { keySignature } from './key';
import { midiToNote, note, noteName, withOctaveFor } from './note';

/** Supported clefs. */
export type Clef = 'treble' | 'bass';

/** Options shared by the staff helpers. */
export interface StaffOptions {
  /** Clef (default `treble`). */
  clef?: Clef;
  /** Treat the note as sounding guitar pitch and write it an octave higher (default true). */
  guitar?: boolean;
}

/** Where a note is drawn. */
export interface StaffPosition {
  /** Lines and spaces above the bottom line (0 = bottom line, 8 = top line). */
  position: number;
  /** True when the note head sits on a line, false when in a space. */
  onLine: boolean;
  /** Ledger lines needed: positive above the staff, negative below, 0 inside it. */
  ledgerLines: number;
  /** Positions of those ledger lines, nearest the staff first: `[-2, -4]`. */
  ledgerPositions: number[];
  /** The note as written (after the guitar octave), with its octave: `E3`. */
  written: string;
  /** Alteration of the written note: -1 flat, 0 natural, 1 sharp … */
  accidental: number;
  /** Conventional stem direction: up below the middle line, down on or above it. */
  stem: 'up' | 'down';
}

/** Diatonic index (octave × 7 + letter) of the bottom line of each clef: E4 for treble, G2 for bass. */
const BOTTOM_LINE: Record<Clef, number> = { treble: 4 * 7 + 2, bass: 2 * 7 + 4 };

function ledgerPositionsFor(position: number): number[] {
  const out: number[] = [];
  for (let p = -2; p >= position; p -= 2) out.push(p);
  for (let p = 10; p <= position; p += 2) out.push(p);
  return out;
}

/**
 * Staff position of a spelled note with an octave. `staffPosition('E2')` is the low E string of
 * the guitar: position -7, three ledger lines below. Pass `{ guitar: false }` for notes that are
 * already written pitch, and `{ clef: 'bass' }` for the bass clef.
 */
export function staffPosition(noteInput: string, opts: StaffOptions = {}): StaffPosition {
  const sounding = note(noteInput);
  if (sounding.octave === null) throw new RangeError(`A staff position needs an octave: "${noteInput}"`);
  const octave = sounding.octave + (opts.guitar === false ? 0 : 1);
  const position = octave * 7 + sounding.step - BOTTOM_LINE[opts.clef ?? 'treble'];
  const ledgerPositions = ledgerPositionsFor(position);
  return {
    position,
    onLine: position % 2 === 0,
    ledgerLines: ledgerPositions.length === 0 ? 0 : position < 0 ? -ledgerPositions.length : ledgerPositions.length,
    ledgerPositions,
    written: noteName(sounding.step, sounding.alt, octave),
    accidental: sounding.alt,
    stem: position < 4 ? 'up' : 'down',
  };
}

/** Options for `noteAtStaffPosition`. */
export interface NoteAtPositionOptions extends StaffOptions {
  /** Apply a key signature (sharps positive, flats negative) to the natural note. */
  fifths?: number;
}

/**
 * The note drawn at a staff position, as sounding pitch: `noteAtStaffPosition(0)` -> `E3` (the
 * bottom line of guitar notation sounds E3). With `{ guitar: false }` -> `E4`. A key signature
 * alters the letters it names.
 */
export function noteAtStaffPosition(position: number, opts: NoteAtPositionOptions = {}): string {
  const index = Math.round(position) + BOTTOM_LINE[opts.clef ?? 'treble'];
  const step = ((index % 7) + 7) % 7;
  const writtenOctave = Math.floor(index / 7);
  let alt = 0;
  if (opts.fifths) {
    const letter = 'CDEFGAB'[step];
    const altered = keySignature(opts.fifths).accidentals.find((a) => a[0] === letter);
    if (altered) alt = note(altered).alt;
  }
  return noteName(step, alt, writtenOctave - (opts.guitar === false ? 0 : 1));
}

/** Staff position of a MIDI number, spelled with the given pitch-class name (`staffPositionOfMidi(40, 'E')`). */
export function staffPositionOfMidi(midi: number, spelledAs: string, opts: StaffOptions = {}): StaffPosition {
  return staffPosition(withOctaveFor(spelledAs, midi), opts);
}

// Where engravers put key-signature accidentals on the treble staff (positions from the bottom line).
const SHARP_POSITIONS_TREBLE = [8, 5, 9, 6, 3, 7, 4];
const FLAT_POSITIONS_TREBLE = [4, 7, 3, 6, 2, 5, 1];

/**
 * Staff positions of the accidentals of a key signature, in the order they are written.
 * `keySignaturePositions(2)` -> `[8, 5]`: F sharp on the top line, C sharp in the third space.
 * The bass clef uses the same shape two positions lower.
 */
export function keySignaturePositions(fifths: number, clef: Clef = 'treble'): number[] {
  const count = Math.min(7, Math.abs(Math.round(fifths)));
  const base = fifths >= 0 ? SHARP_POSITIONS_TREBLE : FLAT_POSITIONS_TREBLE;
  const shift = clef === 'bass' ? -2 : 0;
  return base.slice(0, count).map((p) => p + shift);
}

/**
 * Written range of a standard-tuned guitar with the given number of frets, as staff positions on
 * the guitar treble clef: `{ low: -7, high: … }`. Handy for choosing notes in reading exercises.
 */
export function guitarStaffRange(frets = 22): { low: number; high: number; lowNote: string; highNote: string } {
  const lowNote = 'E2';
  const highNote = midiToNote(64 + frets, { prefer: 'sharps' });
  return { low: staffPosition(lowNote).position, high: staffPosition(highNote).position, lowNote, highNote };
}

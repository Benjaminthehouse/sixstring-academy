/**
 * Shared types of the guitar engine.
 *
 * Conventions (the same as everywhere in the app):
 *  - Strings are numbered the guitarist's way: string 1 is the thinnest (highest), string 6 the low E.
 *  - Per-string arrays (a tuning, the frets of a chord shape) run **low to high**: index 0 is the
 *    highest-numbered string. `stringIndex` / `stringNumber` convert between the two.
 *  - Fret 0 is the open string. With a capo, frets are counted **from the capo**, the way tab is
 *    written: fret 0 is the capoed open string and `physicalFret` gives the fret on the wood.
 *  - Pitch is sounding MIDI (standard tuning 40 45 50 55 59 64).
 */

/** A place on the fretboard. `string` 1 = thinnest; `fret` 0 = open (or the capo). */
export interface FretPosition {
  string: number;
  fret: number;
}

/** A fretting-hand finger: 1 index, 2 middle, 3 ring, 4 little. 0 means an open string (no finger). */
export type Finger = 0 | 1 | 2 | 3 | 4;

/**
 * One marker on a fretboard drawing: what every source of notes has in common. The notes of a
 * scale (`scalePositions`), of a pattern (`ScalePattern.notes`), of an arpeggio and of a chord
 * voicing (`Voicing.notes`) can all be drawn as `FretDot[]` without conversion.
 */
export interface FretDot extends FretPosition {
  /** Sounding MIDI note: what to play when the dot is tapped. */
  midi: number;
  /** Spelled name without octave, the way the scale or chord spells it. */
  note: string;
  /** Degree against the root: `1`, `b3`, `#11`. `degreeNumber` turns it into the colour 1–7. */
  degree: string;
  isRoot: boolean;
  /** Fretting finger 1–4 (0 = open string), where the source knows one. */
  finger?: Finger;
  /** For chord tones: `root`, `third`, `seventh` … (`bass` for a slash bass outside the chord). */
  role?: string;
}

/** The five CAGED shapes, named after the open chord each one is built around. */
export type CagedShape = 'C' | 'A' | 'G' | 'E' | 'D';

/** The CAGED shapes in the order they follow each other up the neck. */
export const CAGED_ORDER: readonly CagedShape[] = ['C', 'A', 'G', 'E', 'D'];

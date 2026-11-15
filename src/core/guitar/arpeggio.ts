/**
 * Arpeggios: the tones of a chord laid out across the neck, as single positions and as playable
 * patterns grouped by hand position, with tone roles and fingerings.
 */
import { buildChord, chord as parseChord, chordToneMap, chordTones, note as parseNote, type Chord, type ChordToneRole } from '@/core/theory';
import type { FretRangeOptions } from './fretboard';
import { tonePatterns, tonePositions, type NeckTone, type PatternOptions, type PatternSystem, type ScalePattern } from './scale-patterns';
import { hasStandardIntervals, tuning } from './tunings';

function rolesOf(c: Chord): Map<number, ChordToneRole> {
  const roles = new Map<number, ChordToneRole>();
  for (const tone of chordTones(c)) {
    const pc = parseNote(tone.note).chroma;
    if (!roles.has(pc)) roles.set(pc, tone.role);
  }
  return roles;
}

/** The chord without its slash bass: an arpeggio spells the chord, whatever sits under it. */
function plain(input: string | Chord): Chord {
  const c = parseChord(input);
  return c.bass ? buildChord(c.root, c.type) : c;
}

/**
 * Every position of a chord's tones on the neck, each with its degree, spelled note and role
 * (root, third, fifth, seventh …): `arpeggioPositions('Am7', { maxFret: 12 })`.
 */
export function arpeggioPositions(chordInput: string | Chord, opts: FretRangeOptions = {}): NeckTone[] {
  const c = plain(chordInput);
  return tonePositions(chordToneMap(c), opts, rolesOf(c));
}

/** Options for `arpeggioPatterns`. */
export interface ArpeggioOptions extends PatternOptions {
  /**
   * Layout (default: the five CAGED positions, or plain hand positions in tunings without them).
   * `single-string`, `two-string` and `diagonal` work as for scales.
   */
  system?: PatternSystem;
}

/**
 * Arpeggio patterns of a chord grouped by hand position, each note with its role and a finger:
 * `arpeggioPatterns('Cmaj7')` gives the five CAGED arpeggio shapes. The pattern's `scale` field
 * holds the chord symbol.
 */
export function arpeggioPatterns(chordInput: string | Chord, opts: ArpeggioOptions = {}): ScalePattern[] {
  const c = plain(chordInput);
  const system = opts.system ?? (hasStandardIntervals(tuning(opts.tuning)) ? 'caged' : 'position');
  return tonePatterns(chordToneMap(c), c.symbol, system, opts, rolesOf(c));
}

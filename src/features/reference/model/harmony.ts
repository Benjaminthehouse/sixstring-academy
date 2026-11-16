/**
 * Diatonic harmony: the chords of every major and minor key as one table, keys down the side and
 * scale degrees across, with the numeral and job of each column. Minor keys add the two chords
 * harmonic minor changes (V and vii°). Everything comes from `keyChords` in the theory engine.
 */
import { MAJOR_KEYS, MINOR_KEYS, diatonicChords, keyChords, type Key } from '@/core/theory';
import type { HarmonicFunction } from './circle';

/** The three minor scales a minor key's chords can be built from. */
export type MinorKind = 'natural' | 'harmonic' | 'melodic';

/** The minor scales in the order the table offers them, with their labels. */
export const MINOR_KINDS: ReadonlyArray<{ value: MinorKind; label: string }> = [
  { value: 'natural', label: 'Natural' },
  { value: 'harmonic', label: 'Harmonic' },
  { value: 'melodic', label: 'Melodic' },
];

/** The minor scale an item param names (`harmonic-minor`, `melodic-minor`), or null. */
export function minorKindFromParam(param: string | null | undefined): MinorKind | null {
  return param === 'harmonic-minor' ? 'harmonic' : param === 'melodic-minor' ? 'melodic' : param === 'natural-minor' ? 'natural' : null;
}

/** A column of the table: one scale degree (or a harmonic-minor chord). */
export interface HarmonyColumn {
  /** Numeral, as the theory engine writes it (`bIII`, `vii°`, `V7`). */
  roman: string;
  function: HarmonicFunction;
  /** True for the minor key's chords that come from harmonic minor. */
  harmonic: boolean;
  degree: number;
}

/** A row of the table: one key and its chords, ASCII symbols in column order. */
export interface HarmonyRow {
  key: Key;
  chords: string[];
}

/** The whole table for one mode. */
export interface HarmonyTable {
  mode: 'major' | 'minor';
  sevenths: boolean;
  /** Which minor scale the minor keys' chords come from (null for major keys). */
  minor: MinorKind | null;
  columns: HarmonyColumn[];
  rows: HarmonyRow[];
}

/**
 * The chords of all 15 major (or 15 minor) keys, in circle order: C, the sharp keys, then the flat
 * keys. Minor keys use natural minor plus the V and vii° of harmonic minor (how most songs mix
 * them), or the seven chords of harmonic or melodic minor.
 */
export function harmonyTable(mode: 'major' | 'minor', sevenths = false, minor: MinorKind = 'natural'): HarmonyTable {
  const keys = mode === 'major' ? MAJOR_KEYS : MINOR_KEYS;
  const chordsOf = (k: Key) => (mode === 'minor' && minor !== 'natural' ? diatonicChords(k, { sevenths, minor }) : keyChords(k, { sevenths }));
  const rows = keys.map((k) => ({ key: k, all: chordsOf(k) }));
  const first = rows[0].all;
  const columns: HarmonyColumn[] = first.map((c) => ({
    roman: c.roman,
    function: c.function as HarmonicFunction,
    // Only marks the two borrowed columns of the natural-minor table.
    harmonic: mode === 'minor' && minor === 'natural' && c.variant === 'harmonic',
    degree: c.degree,
  }));
  return { mode, sevenths, minor: mode === 'minor' ? minor : null, columns, rows: rows.map((r) => ({ key: r.key, chords: r.all.map((c) => c.symbol) })) };
}

/** What the table shows, in a sentence under it. */
export function harmonyCaption(mode: 'major' | 'minor', minor: MinorKind = 'natural'): string {
  if (mode === 'major') return 'Every major key has the same pattern: major I, IV and V; minor ii, iii and vi; a diminished vii°.';
  if (minor === 'harmonic')
    return 'Harmonic minor raises the 7th by a half step. That turns v into a major V and ♭VII into a diminished vii°, both pulling hard toward home, and makes ♭III augmented (+). The sound of classical minor keys and flamenco.';
  if (minor === 'melodic')
    return 'Melodic minor raises the 6th and the 7th: ii becomes minor, IV and V major, ♭III augmented (+), and the chords on 6 and 7 diminished. Jazz uses it in both directions (the jazz minor); classical music uses it going up and natural minor coming down.';
  return 'Numerals count from the major scale, so ♭III is the chord on the lowered third degree (many books write it III). The last two columns come from harmonic minor: its raised 7th turns v into a major V and ♭VII into a diminished vii°, which pull harder toward home.';
}

/** Plain words for each function, shown in the legend. */
export const FUNCTION_WORDS: Record<HarmonicFunction, string> = {
  tonic: 'Tonic: home, at rest',
  subdominant: 'Subdominant: moving away',
  dominant: 'Dominant: tension that pulls home',
};

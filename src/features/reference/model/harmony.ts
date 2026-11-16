/**
 * Diatonic harmony: the chords of every major and minor key as one table, keys down the side and
 * scale degrees across, with the numeral and job of each column. Minor keys add the two chords
 * harmonic minor changes (V and vii°). Everything comes from `keyChords` in the theory engine.
 */
import { MAJOR_KEYS, MINOR_KEYS, keyChords, type Key } from '@/core/theory';
import type { HarmonicFunction } from './circle';

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
  columns: HarmonyColumn[];
  rows: HarmonyRow[];
}

/** The chords of all 15 major (or 15 minor) keys, in circle order: C, the sharp keys, then the flat keys. */
export function harmonyTable(mode: 'major' | 'minor', sevenths = false): HarmonyTable {
  const keys = mode === 'major' ? MAJOR_KEYS : MINOR_KEYS;
  const rows = keys.map((k) => ({ key: k, all: keyChords(k, { sevenths }) }));
  const first = rows[0].all;
  const columns: HarmonyColumn[] = first.map((c) => ({
    roman: c.roman,
    function: c.function as HarmonicFunction,
    harmonic: c.variant === 'harmonic',
    degree: c.degree,
  }));
  return { mode, sevenths, columns, rows: rows.map((r) => ({ key: r.key, chords: r.all.map((c) => c.symbol) })) };
}

/** Plain words for each function, shown in the legend. */
export const FUNCTION_WORDS: Record<HarmonicFunction, string> = {
  tonic: 'Tonic: home, at rest',
  subdominant: 'Subdominant: moving away',
  dominant: 'Dominant: tension that pulls home',
};

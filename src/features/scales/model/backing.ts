/**
 * What plays under the scale: a drone on the root, or a short vamp from the backing band whose
 * chords bring out the scale's colour (Dorian over i7–IV7, Mixolydian over I–♭VII, a 12-bar for
 * the blues scales). Chords are built by the theory engine from the root; tests check that each
 * one is built from the scale's own notes (or, for the blues, is the blues).
 */
import type { BackingChord, BackingStyleId } from '@/core/audio';
import { buildChord, chordPcs, chordFitsScale, chroma, getScale, intervalToDegree, romanFor, scaleNotes, transpose, type Chord, type ScaleType } from '@/core/theory';

/** What plays under the scale. */
export type Accompaniment = 'none' | 'drone' | 'band';

/** One chord of a vamp: an interval above the root and a chord type id. */
type VampStep = readonly [interval: string, type: string];

interface VampRecipe {
  /** One chord per bar. */
  bars: readonly VampStep[];
  style: BackingStyleId;
  /** `loose`: the blues, where the IV7 and V7 rub against the scale on purpose. */
  fit?: 'strict' | 'loose';
}

const TWELVE_BAR: readonly VampStep[] = [
  ['P1', '7'], ['P1', '7'], ['P1', '7'], ['P1', '7'],
  ['P4', '7'], ['P4', '7'], ['P1', '7'], ['P1', '7'],
  ['P5', '7'], ['P4', '7'], ['P1', '7'], ['P5', '7'],
];

const RECIPES: Record<string, VampRecipe> = {
  major: { bars: [['P1', 'major'], ['P4', 'major'], ['P5', 'major'], ['P1', 'major']], style: 'pop-rock' },
  dorian: { bars: [['P1', 'm7'], ['P4', '7']], style: 'funk' },
  phrygian: { bars: [['P1', 'minor'], ['m2', 'major']], style: 'metal' },
  lydian: { bars: [['P1', 'major'], ['M2', 'major']], style: 'ballad' },
  mixolydian: { bars: [['P1', 'major'], ['m7', 'major']], style: 'pop-rock' },
  minor: { bars: [['P1', 'minor'], ['m6', 'major'], ['m7', 'major'], ['P1', 'minor']], style: 'pop-rock' },
  locrian: { bars: [['P1', 'm7b5'], ['m2', 'maj7']], style: 'ballad' },
  'major-pentatonic': { bars: [['P1', 'major'], ['M6', 'minor']], style: 'country' },
  'minor-pentatonic': { bars: [['P1', 'm7'], ['P1', 'm7']], style: 'pop-rock' },
  'minor-6-pentatonic': { bars: [['P1', 'm6'], ['P1', 'm6']], style: 'bossa' },
  'dominant-pentatonic': { bars: TWELVE_BAR, style: 'blues-shuffle', fit: 'loose' },
  'minor-blues': { bars: TWELVE_BAR, style: 'blues-shuffle', fit: 'loose' },
  'major-blues': { bars: TWELVE_BAR, style: 'blues-shuffle', fit: 'loose' },
  'combined-blues': { bars: TWELVE_BAR, style: 'blues-shuffle', fit: 'loose' },
  'harmonic-minor': { bars: [['P1', 'minor'], ['P4', 'minor'], ['P5', '7'], ['P1', 'minor']], style: 'latin' },
  'melodic-minor': { bars: [['P1', 'mmaj7'], ['P1', 'm6']], style: 'bossa' },
  'phrygian-dominant': { bars: [['P1', 'major'], ['m2', 'major']], style: 'latin' },
  'lydian-dominant': { bars: [['P1', '7'], ['M2', 'major']], style: 'funk' },
  altered: { bars: [['P1', '7alt'], ['P1', '7alt']], style: 'jazz-swing' },
  'locrian-natural-2': { bars: [['P1', 'm7b5'], ['P1', 'm7b5']], style: 'jazz-swing' },
  'bebop-dominant': { bars: [['P1', '7'], ['P1', '7']], style: 'jazz-swing' },
  'bebop-major': { bars: [['P1', '6'], ['P1', 'maj7']], style: 'jazz-swing' },
  'bebop-dorian': { bars: [['P1', 'm7'], ['P1', 'm7']], style: 'jazz-swing' },
  'hungarian-minor': { bars: [['P1', 'minor'], ['P5', 'major']], style: 'latin' },
  'double-harmonic': { bars: [['P1', 'major'], ['m2', 'major']], style: 'latin' },
};

/** Backing styles in 4/4 a scale line fits over (the 6/8, 12/8 and waltz styles are left out). */
export const VAMP_STYLES: readonly BackingStyleId[] = ['pop-rock', 'ballad', 'funk', 'blues-shuffle', 'jazz-swing', 'bossa', 'latin', 'country', 'folk', 'metal', 'reggae'];

/** Styles whose eighths swing (the scale line swings with them). */
export const SWING_STYLES: ReadonlySet<BackingStyleId> = new Set(['blues-shuffle', 'jazz-swing']);

/** A vamp ready for the band and for display. */
export interface Vamp {
  /** One chord symbol per bar. */
  symbols: string[];
  /** Roman numerals, one per bar (`i7`, `IV7`). */
  romans: string[];
  chords: BackingChord[];
  style: BackingStyleId;
  /** The progression is the blues: its IV7 and V7 rub against the scale on purpose. */
  loose: boolean;
}

function toBacking(c: Chord): BackingChord {
  return { root: chroma(c.root), tones: chordPcs(c), symbol: c.symbol };
}

/** The usual one-chord vamp: the first tonic chord the scale lists that is built from its own notes. */
function tonicVamp(type: ScaleType): VampRecipe | null {
  const notes = scaleNotes('C', type);
  for (const id of type.chords) {
    try {
      const c = buildChord('C', id);
      if (chordFitsScale(c, notes)) return { bars: [['P1', id], ['P1', id]], style: type.quality === 'dominant' ? 'funk' : 'ballad' };
    } catch {
      // A chord type the catalog cannot build on C: try the next one.
    }
  }
  return null;
}

/** The vamp for a scale on a root, or null when no chord suits it (the chromatic scale): use a drone. */
export function vampFor(tonic: string, scaleId: string): Vamp | null {
  const type = getScale(scaleId);
  if (!type) return null;
  const recipe = RECIPES[type.id] ?? tonicVamp(type);
  if (!recipe) return null;
  const built = recipe.bars.map(([ivl, typeId]) => ({ chord: buildChord(transpose(tonic, ivl), typeId), degree: intervalToDegree(ivl) }));
  return {
    symbols: built.map((b) => b.chord.symbol),
    romans: built.map((b) => romanFor(b.degree, b.chord.type)),
    chords: built.map((b) => toBacking(b.chord)),
    style: recipe.style,
    loose: recipe.fit === 'loose',
  };
}

/** Repeat a vamp's bars to cover at least `bars` bars (whole vamps only, so it always resolves). */
export function vampBars(vamp: Vamp, bars: number): BackingChord[] {
  const n = vamp.chords.length;
  const total = Math.max(n, Math.ceil(bars / n) * n);
  return Array.from({ length: total }, (_unused, i) => vamp.chords[i % n]);
}

/** The drone's root: the scale's root in the low register (A2 for A), and whether a fifth suits it. */
export function droneFor(tonic: string, scaleId: string): { midi: number; fifth: boolean } {
  const type = getScale(scaleId);
  const pc = chroma(tonic);
  // E2 (40) .. D#3 (51): low enough to sit under the line, high enough for small speakers.
  const midi = 40 + ((pc - 4 + 12) % 12);
  return { midi, fifth: !!type && type.semitones.includes(7) };
}

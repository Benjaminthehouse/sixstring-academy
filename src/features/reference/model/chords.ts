/**
 * Chord formulas: every chord type of the theory engine's catalog, grouped by category, spelled on
 * a chosen root. The example shape is looked up by the screen (`chordVoicings`) only when a row is
 * on screen, because the biggest altered chords take a few milliseconds each.
 */
import { CHORD_TYPES, buildChord, chordSlug, type ChordType } from '@/core/theory';

/** Categories in the order a learner meets them, with their headings. */
export const CHORD_CATEGORIES = [
  { id: 'triad', title: 'Triads and power chords', blurb: 'Three notes stacked in thirds (or a root and fifth alone).' },
  { id: 'seventh', title: 'Seventh chords', blurb: 'A triad with a seventh on top.' },
  { id: 'sixth', title: 'Sixth chords', blurb: 'A triad with the sixth added instead of a seventh.' },
  { id: 'added', title: 'Added-note chords', blurb: 'A triad with one colour note and no seventh.' },
  { id: 'extended', title: 'Ninths, elevenths and thirteenths', blurb: 'Seventh chords with more thirds stacked on top.' },
  { id: 'altered', title: 'Altered dominants', blurb: 'Dominant sevenths with a raised or lowered fifth or tension.' },
] as const;

/** A chord category id. */
export type ChordCategoryId = (typeof CHORD_CATEGORIES)[number]['id'];

/** The roots offered for spelling the table, in their usual chord spellings. */
export const CHORD_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

/** One row of the chord-formula table. */
export interface ChordRow {
  /** Catalog id (`maj7`, `7sharp9`): also the item param of the row. */
  id: string;
  /** The suffix as written after the root (`maj7`, `''` for major). */
  suffix: string;
  /** The chord on the chosen root, ASCII (`Cmaj7`). */
  symbol: string;
  /** Long name (`major seventh`). */
  name: string;
  /** Formula as degrees (`1 3 5 7`), ASCII. */
  degrees: string[];
  /** Intervals above the root. */
  intervals: string[];
  /** Notes on the chosen root, ASCII. */
  notes: string[];
  category: ChordCategoryId;
  /** 1 = everyday … 4 = specialist. */
  tier: number;
  /** One line on the sound and use, from the catalog. */
  description: string;
  /** Other ways the suffix is written (`M7`, `Δ`). */
  aliases: string[];
  /** Params of its page in the Chords screen. */
  chordPage: string;
}

/** One row for a chord type spelled on a root. */
export function chordRow(type: ChordType, root = 'C'): ChordRow {
  const c = buildChord(root, type);
  return {
    id: type.id,
    suffix: type.symbol,
    symbol: c.symbol,
    name: type.name,
    degrees: [...type.degrees],
    intervals: [...type.intervals],
    notes: [...c.notes],
    category: type.category as ChordCategoryId,
    tier: type.tier,
    description: type.description,
    aliases: [...type.aliases],
    chordPage: chordSlug(c),
  };
}

/** Every catalog chord type (custom types excluded), grouped by category in learning order. */
export function chordGroups(root = 'C'): Array<{ id: ChordCategoryId; title: string; blurb: string; rows: ChordRow[] }> {
  const types = CHORD_TYPES.filter((t) => !t.custom);
  return CHORD_CATEGORIES.map((cat) => ({
    ...cat,
    rows: types
      .filter((t) => t.category === cat.id)
      .map((t, i) => ({ t, i }))
      .sort((a, b) => a.t.tier - b.t.tier || a.i - b.i)
      .map(({ t }) => chordRow(t, root)),
  }));
}

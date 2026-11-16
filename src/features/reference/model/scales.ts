/**
 * Scale formulas: every scale of the theory engine's catalog, grouped by family, with its formula,
 * step pattern and notes on a chosen root (spelled from the simplest tonic for that scale).
 */
import { SCALES, SCALE_FAMILIES, noteSlug, scaleNotes, simplestTonic, type ScaleType } from '@/core/theory';

/** The twelve roots offered, as pitch classes with both names where there are two. */
export const SCALE_ROOTS: ReadonlyArray<{ pc: number; label: string }> = [
  { pc: 0, label: 'C' },
  { pc: 1, label: 'C#/Db' },
  { pc: 2, label: 'D' },
  { pc: 3, label: 'Eb' },
  { pc: 4, label: 'E' },
  { pc: 5, label: 'F' },
  { pc: 6, label: 'F#/Gb' },
  { pc: 7, label: 'G' },
  { pc: 8, label: 'Ab' },
  { pc: 9, label: 'A' },
  { pc: 10, label: 'Bb' },
  { pc: 11, label: 'B' },
];

/** One row of the scale-formula table. */
export interface ScaleRow {
  /** Catalog id (`dorian`): also the item param of the row. */
  id: string;
  name: string;
  /** Other names (`Ionian`). */
  aliases: string[];
  family: string;
  /** Formula as degrees, ASCII (`1 2 b3 4 5 6 b7`). */
  degrees: string[];
  /** Steps between neighbouring notes, closing the octave (`W H W W W H W`). */
  steps: string[];
  size: number;
  /** The tonic used (the simplest spelling of the chosen root for this scale). */
  tonic: string;
  /** Notes from that tonic, ASCII. */
  notes: string[];
  /** First sentence of the catalog's description. */
  summary: string;
  tier: number;
  /** Params of the scale in the Scales screen. */
  scalePage: [string, string];
}

/** The first full sentence of a text (a colon does not end it). */
export function firstSentence(text: string): string {
  const m = /^.*?[.!?](?=\s|$)/.exec(text);
  return m ? m[0] : text;
}

/** One row for a scale on a root pitch class. */
export function scaleRow(scale: ScaleType, rootPc = 0): ScaleRow {
  const tonic = simplestTonic(rootPc, scale);
  return {
    id: scale.id,
    name: scale.name,
    aliases: [...scale.aliases],
    family: scale.family,
    degrees: [...scale.degrees],
    steps: [...scale.stepPattern],
    size: scale.size,
    tonic,
    notes: scaleNotes(tonic, scale.id),
    summary: firstSentence(scale.description),
    tier: scale.tier,
    scalePage: [noteSlug(tonic), scale.id],
  };
}

/** Every scale grouped by family, in the catalog's order (modes stay in mode order). */
export function scaleGroups(rootPc = 0): Array<{ id: string; title: string; blurb: string; rows: ScaleRow[] }> {
  return SCALE_FAMILIES.map((f) => ({
    id: f.id,
    title: f.name,
    blurb: f.description,
    rows: SCALES.filter((s) => s.family === f.id).map((s) => scaleRow(s, rootPc)),
  })).filter((g) => g.rows.length > 0);
}

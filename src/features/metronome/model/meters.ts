/**
 * The time signatures the metronome offers, how odd meters can be grouped, and the plain words
 * that explain them. Everything musical (beats, lengths, default accents) comes from
 * `resolveMeter` in the audio engine; this file only chooses, names and explains.
 */
import { PPQ, defaultGrouping, resolveMeter, type Meter, type TimeSignature } from '@/core/audio';

/** One time signature in the picker. */
export interface MeterChoice {
  /** "7/8": numerator and denominator, no grouping. */
  id: string;
  numerator: number;
  denominator: number;
  /** A one-line description in plain words. */
  blurb: string;
  /** Ways the bar can be grouped, the usual one first. A single entry means there is no choice. */
  groupings: number[][];
}

/** The time signatures one tap away on the main screen. */
export const COMMON_METERS: readonly string[] = ['2/4', '3/4', '4/4', '6/8'];

/** Every time signature the metronome offers, common ones first. */
export const METER_CHOICES: readonly MeterChoice[] = [
  { id: '2/4', numerator: 2, denominator: 4, blurb: 'Two beats in a bar. Marches, polkas, a lot of folk and country.', groupings: [[2]] },
  { id: '3/4', numerator: 3, denominator: 4, blurb: 'Three beats in a bar: the waltz. Strong, weak, weak.', groupings: [[3]] },
  { id: '4/4', numerator: 4, denominator: 4, blurb: 'Four beats in a bar. Most rock, pop, blues and jazz.', groupings: [[4]] },
  { id: '6/8', numerator: 6, denominator: 8, blurb: 'Six eighth notes felt as two big beats of three. Ballads, jigs, slow blues.', groupings: [[3, 3]] },
  { id: '2/2', numerator: 2, denominator: 2, blurb: 'Cut time: two half-note beats. Fast marches, bluegrass, musicals.', groupings: [[2]] },
  { id: '3/8', numerator: 3, denominator: 8, blurb: 'Three quick eighth-note beats. A light, fast waltz.', groupings: [[1, 1, 1]] },
  { id: '5/4', numerator: 5, denominator: 4, blurb: 'Five beats, split into a group of three and a group of two.', groupings: [[3, 2], [2, 3]] },
  { id: '6/4', numerator: 6, denominator: 4, blurb: 'Six quarter-note beats in two groups of three. A broad, slow swing.', groupings: [[3, 3]] },
  { id: '7/4', numerator: 7, denominator: 4, blurb: 'Seven beats: four and three, or the other way round.', groupings: [[4, 3], [3, 4], [2, 2, 3]] },
  { id: '5/8', numerator: 5, denominator: 8, blurb: 'Five quick eighths felt as one long and one short beat.', groupings: [[3, 2], [2, 3]] },
  { id: '7/8', numerator: 7, denominator: 8, blurb: 'Seven quick eighths felt as two short beats and one long one.', groupings: [[2, 2, 3], [3, 2, 2], [2, 3, 2]] },
  { id: '9/8', numerator: 9, denominator: 8, blurb: 'Nine eighths: three big beats of three, or the uneven 2+2+2+3 of Balkan dances.', groupings: [[3, 3, 3], [2, 2, 2, 3]] },
  { id: '10/8', numerator: 10, denominator: 8, blurb: 'Ten eighths in two long and two short beats.', groupings: [[3, 3, 2, 2], [2, 2, 3, 3], [3, 2, 3, 2]] },
  { id: '11/8', numerator: 11, denominator: 8, blurb: 'Eleven eighths: three long beats and a short one, or the 2+2+3+2+2 of Bulgarian dances.', groupings: [[3, 3, 3, 2], [2, 2, 3, 2, 2]] },
  { id: '12/8', numerator: 12, denominator: 8, blurb: 'Twelve eighths felt as four big beats of three. Slow blues and doo-wop.', groupings: [[3, 3, 3, 3]] },
];

const BY_ID = new Map(METER_CHOICES.map((m) => [m.id, m]));

/** The picker entry for "7/8" or "7/8(3+2+2)", or null. */
export function meterChoice(key: string): MeterChoice | null {
  const id = key.split('(')[0].trim();
  return BY_ID.get(id) ?? null;
}

/** True when two groupings are the same list. */
function sameGrouping(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((g, i) => g === b[i]);
}

/**
 * The canonical text of a time signature: "4/4", or "7/8(3+2+2)" when the grouping is not the
 * usual one. Stored settings, presets and the screen's `data-meter` all use it.
 */
export function meterKey(ts: TimeSignature): string {
  const id = `${ts.numerator}/${ts.denominator}`;
  const usual = defaultGrouping(ts.numerator, ts.denominator);
  if (!ts.grouping || sameGrouping(ts.grouping, usual)) return id;
  return `${id}(${ts.grouping.join('+')})`;
}

/**
 * Read a meter key back, accepting only the time signatures and groupings the picker offers
 * (anything else in stored data falls back to null).
 */
export function parseMeterKey(key: unknown): TimeSignature | null {
  if (typeof key !== 'string') return null;
  const m = /^\s*(\d+)\/(\d+)\s*(?:\(([\d+\s]+)\))?\s*$/.exec(key);
  if (!m) return null;
  const choice = BY_ID.get(`${Number(m[1])}/${Number(m[2])}`);
  if (!choice) return null;
  const grouping = m[3] ? m[3].split('+').map((s) => Number(s.trim())) : choice.groupings[0];
  if (!choice.groupings.some((g) => sameGrouping(g, grouping))) return null;
  return { numerator: choice.numerator, denominator: choice.denominator, grouping: grouping.slice() };
}

/** A meter key turned into the engine's resolved meter (4/4 when the key is not offered). */
export function meterOf(key: string): Meter {
  return resolveMeter(parseMeterKey(key) ?? { numerator: 4, denominator: 4 });
}

/** The grouping of a meter key ("3+2+2"), or the usual one. */
export function groupingOf(key: string): number[] {
  return parseMeterKey(key)?.grouping ?? [4];
}

/** Clean up a key ("7/8(2+2+3)" is just "7/8"); unknown keys become "4/4". */
export function normalizeMeterKey(key: unknown): string {
  const ts = parseMeterKey(key);
  return ts ? meterKey(ts) : '4/4';
}

/** "7/8 · 3+2+2" for a label (the grouping only where there is a choice of grouping). */
export function meterLabel(key: string): string {
  const ts = parseMeterKey(key);
  if (!ts) return '4/4';
  const choice = BY_ID.get(`${ts.numerator}/${ts.denominator}`);
  const id = `${ts.numerator}/${ts.denominator}`;
  return choice && choice.groupings.length > 1 && ts.grouping ? `${id} · ${ts.grouping.join('+')}` : id;
}

/**
 * How to count a grouping, in plain words: "Count 1-2 1-2 1-2-3: two short beats, then a long one."
 * Only meaningful for groupings with a choice; groups of one (3/8) have nothing to explain.
 */
export function groupingWords(grouping: readonly number[]): string {
  const count = grouping.map((g) => Array.from({ length: g }, (_, i) => i + 1).join('-')).join('  ');
  const sizes = grouping.map((g) => (g <= 2 ? 'short' : 'long'));
  const allSame = sizes.every((s) => s === sizes[0]);
  if (allSame) return `Count ${count}: ${NUMBER_WORDS[grouping.length] ?? grouping.length} even groups of ${NUMBER_WORDS[grouping[0]] ?? grouping[0]}.`;
  return `Count ${count}: ${describeSizes(sizes)}.`;
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];

/** "two short beats, then a long one" from ['short', 'short', 'long']. */
function describeSizes(sizes: string[]): string {
  const runs: Array<{ size: string; n: number }> = [];
  for (const s of sizes) {
    const last = runs[runs.length - 1];
    if (last && last.size === s) last.n++;
    else runs.push({ size: s, n: 1 });
  }
  const phrase = (r: { size: string; n: number }, first: boolean) => {
    if (r.n === 1) return first ? `one ${r.size} beat` : `a ${r.size} one`;
    return `${NUMBER_WORDS[r.n] ?? r.n} ${r.size} ${first ? 'beats' : 'ones'}`;
  };
  return runs.map((r, i) => (i === 0 ? phrase(r, true) : i === runs.length - 1 ? `then ${phrase(r, false)}` : phrase(r, false))).join(', ');
}

/** Name of the note a tempo counts in this meter. */
export type BeatNote = 'half' | 'quarter' | 'dotted-quarter' | 'eighth' | 'dotted-half';

/** The note value the tempo counts (a dotted quarter in 6/8, a half note in 2/2). */
export function tempoBeatNote(meter: Meter): BeatNote {
  const t = meter.tempoBeatTicks;
  if (t === PPQ * 2) return 'half';
  if (t === PPQ * 3) return 'dotted-half';
  if (t === (PPQ * 3) / 2) return 'dotted-quarter';
  if (t === PPQ / 2) return 'eighth';
  return 'quarter';
}

/** "dotted quarter notes" for a sentence. */
export function beatNoteWords(note: BeatNote): string {
  return { half: 'half notes', 'dotted-half': 'dotted half notes', quarter: 'quarter notes', 'dotted-quarter': 'dotted quarter notes', eighth: 'eighth notes' }[note];
}

/**
 * The tempo after changing only the grouping of the same bar: the eighth-note pulse stays the same
 * (9/8 as 3+3+3 at 80 dotted quarters becomes 2+2+2+3 at 120 quarters), so the bar keeps its length.
 */
export function tempoForRegrouping(tempo: number, from: Meter, to: Meter): number {
  if (from.numerator !== to.numerator || from.denominator !== to.denominator) return tempo;
  if (from.tempoBeatTicks === to.tempoBeatTicks) return tempo;
  return (tempo * from.tempoBeatTicks) / to.tempoBeatTicks;
}

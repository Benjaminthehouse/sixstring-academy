/**
 * The written rhythm: bars of notes and rests with dots, ties and triplets, plus a compact text
 * form so rhythms can be authored by hand:
 *
 *   q q e e q | h. rq | e. s e e q~ q | 3e 3e 3e q h
 *
 *   w h q e s     whole, half, quarter, eighth, sixteenth note
 *   r…            a rest of that value (`rq`)
 *   ….            dotted (`q.`, `rq.`)
 *   …~            tied to the next note (`q~ q`, also across a bar line)
 *   3…            one note of a triplet (`3e 3e 3e`, or `3q 3e` for a long-short pair)
 *   >…            accented
 *   |             bar line
 */
import { PPQ, swingTick } from '@/core/theory';
import { meterInfo, type MeterInfo } from './meter';

/** Written note values, longest first. */
export type NoteValue = 'w' | 'h' | 'q' | 'e' | 's';

/** Length of each value in ticks. */
export const VALUE_TICKS: Record<NoteValue, number> = { w: PPQ * 4, h: PPQ * 2, q: PPQ, e: PPQ / 2, s: PPQ / 4 };

/** Plain names for the values, for copy. */
export const VALUE_NAMES: Record<NoteValue, string> = { w: 'whole note', h: 'half note', q: 'quarter note', e: 'eighth note', s: 'sixteenth note' };

/** One note or rest of a bar. */
export interface RhythmItem {
  /** Ticks from the start of its bar. */
  tick: number;
  /** Length in ticks (dots and triplets applied). */
  ticks: number;
  value: NoteValue;
  dots: 0 | 1;
  rest: boolean;
  /** Tied to the next note: that note is held, not struck again. */
  tie: boolean;
  /** 3 = one note of a triplet (three in the time of two). */
  tuplet: 0 | 3;
  accent: boolean;
}

/** One bar. */
export interface RhythmBar {
  items: RhythmItem[];
}

/** A rhythm of whole bars in one meter. */
export interface Rhythm {
  meter: string;
  bars: RhythmBar[];
  /** Written straight, played with swung eighths. */
  swing: boolean;
}

/** Length in ticks of a value with dots and a tuplet. */
export function itemTicks(value: NoteValue, dots: 0 | 1 = 0, tuplet: 0 | 3 = 0): number {
  let t = VALUE_TICKS[value];
  if (dots) t = (t * 3) / 2;
  if (tuplet === 3) t = (t * 2) / 3;
  return t;
}

const TOKEN = /^(>)?(3)?(r)?([whqes])(\.)?(~)?$/;

/** Parse a run of tokens (no bar lines) into items starting at tick 0. Throws on a token that is not a note or rest. */
export function parseItems(text: string): RhythmItem[] {
  const items: RhythmItem[] = [];
  let tick = 0;
  for (const token of text.trim().split(/\s+/)) {
    if (!token) continue;
    const m = TOKEN.exec(token);
    if (!m) throw new RangeError(`"${token}" is not a note or rest`);
    const value = m[4] as NoteValue;
    const dots: 0 | 1 = m[5] ? 1 : 0;
    const tuplet: 0 | 3 = m[2] ? 3 : 0;
    const ticks = itemTicks(value, dots, tuplet);
    items.push({ tick, ticks, value, dots, rest: !!m[3], tie: !!m[6], tuplet, accent: !!m[1] });
    tick += ticks;
  }
  return items;
}

/** Parse the text form. Throws a RangeError that names the bar and the reason when the text is not a valid rhythm. */
export function parseRhythm(text: string, meter = '4/4', opts: { swing?: boolean } = {}): Rhythm {
  const bars: RhythmBar[] = [];
  const parts = text.split('|').map((p) => p.trim()).filter((p) => p.length > 0);
  parts.forEach((part, barIndex) => {
    try {
      bars.push({ items: parseItems(part) });
    } catch (err) {
      throw new RangeError(`Bar ${barIndex + 1}: ${(err as Error).message}`);
    }
  });
  const rhythm: Rhythm = { meter, bars, swing: !!opts.swing };
  const problems = validateRhythm(rhythm);
  if (problems.length) throw new RangeError(problems[0]);
  return rhythm;
}

/** The text form of a rhythm (round-trips through `parseRhythm`). */
export function formatRhythm(rhythm: Rhythm): string {
  return rhythm.bars
    .map((bar) => bar.items.map((i) => `${i.accent ? '>' : ''}${i.tuplet ? '3' : ''}${i.rest ? 'r' : ''}${i.value}${i.dots ? '.' : ''}${i.tie ? '~' : ''}`).join(' '))
    .join(' | ');
}

/** Ticks used by a bar's items. */
export function barTicksUsed(bar: RhythmBar): number {
  return bar.items.reduce((sum, i) => sum + i.ticks, 0);
}

/** Every item in reading order with its bar and index. */
export function flatItems(rhythm: Rhythm): Array<{ bar: number; index: number; item: RhythmItem }> {
  const out: Array<{ bar: number; index: number; item: RhythmItem }> = [];
  rhythm.bars.forEach((bar, b) => bar.items.forEach((item, index) => out.push({ bar: b, index, item })));
  return out;
}

/**
 * The triplet groups of a bar, as lists of item indices: a run of triplet notes is cut wherever it
 * has filled whole beats (`3e 3e 3e`, `3q 3e`, `3q 3q 3q`). A run that never fills a beat comes
 * back as one (invalid) group.
 */
export function tupletGroups(bar: RhythmBar): number[][] {
  const groups: number[][] = [];
  let current: number[] = [];
  let sum = 0;
  bar.items.forEach((item, i) => {
    if (!item.tuplet) {
      if (current.length) groups.push(current);
      current = [];
      sum = 0;
      return;
    }
    current.push(i);
    sum += item.ticks;
    if (sum % PPQ === 0) {
      groups.push(current);
      current = [];
      sum = 0;
    }
  });
  if (current.length) groups.push(current);
  return groups;
}

/**
 * What is wrong with a rhythm, as sentences; empty when it is well formed: every bar full, items
 * in place, triplets complete and inside one beat, ties joining two notes.
 */
export function validateRhythm(rhythm: Rhythm): string[] {
  const problems: string[] = [];
  let meter: MeterInfo;
  try {
    meter = meterInfo(rhythm.meter);
  } catch {
    return [`"${rhythm.meter}" is not a time signature`];
  }
  if (!rhythm.bars.length) problems.push('The rhythm has no bars');
  rhythm.bars.forEach((bar, b) => {
    const used = barTicksUsed(bar);
    if (used !== meter.barTicks) problems.push(`Bar ${b + 1} holds ${used / PPQ} quarter notes, the meter ${rhythm.meter} needs ${meter.barTicks / PPQ}`);
    let at = 0;
    bar.items.forEach((item, i) => {
      if (item.tick !== at) problems.push(`Bar ${b + 1}, item ${i + 1} starts at tick ${item.tick}, expected ${at}`);
      if (item.ticks !== itemTicks(item.value, item.dots, item.tuplet)) problems.push(`Bar ${b + 1}, item ${i + 1} has the wrong length for its value`);
      if (item.dots && (item.value === 's' || item.tuplet)) problems.push(`Bar ${b + 1}, item ${i + 1}: this value cannot be dotted here`);
      if (item.tie && item.rest) problems.push(`Bar ${b + 1}, item ${i + 1}: a rest cannot be tied`);
      at += item.ticks;
    });
    for (const group of tupletGroups(bar)) {
      const first = bar.items[group[0]];
      const total = group.reduce((sum, i) => sum + bar.items[i].ticks, 0);
      if (first.tick % PPQ !== 0) problems.push(`Bar ${b + 1}: a triplet must start on a beat`);
      if (total % PPQ !== 0) problems.push(`Bar ${b + 1}: an incomplete triplet`);
    }
  });
  const flat = flatItems(rhythm);
  flat.forEach((f, i) => {
    if (!f.item.tie) return;
    const next = flat[i + 1];
    if (!next) problems.push('The last note is tied to nothing');
    else if (next.item.rest) problems.push(`Bar ${f.bar + 1}: a note is tied to a rest`);
  });
  return problems;
}

/** A note the learner strikes: the start of a note that is not held over by a tie. */
export interface RhythmOnset {
  bar: number;
  /** Index of the item in its bar. */
  index: number;
  /** Written position: ticks from the start of the rhythm. */
  tick: number;
  /** Position as played (swing applied). */
  playTick: number;
  /** Sounding length in ticks, tied notes included. */
  ticks: number;
  accent: boolean;
}

/** Move a written tick to where it sounds in a swung rhythm (triplet swing on the eighths). */
export function swungTick(tick: number, meter: MeterInfo): number {
  // Compound time swings by itself; only quarter-note beats are bent.
  if (meter.compound) return tick;
  return Math.round(swingTick(tick, 2 / 3, PPQ));
}

/** The onsets of a rhythm in order. Tied-to notes and rests are left out. */
export function rhythmOnsets(rhythm: Rhythm): RhythmOnset[] {
  const meter = meterInfo(rhythm.meter);
  const out: RhythmOnset[] = [];
  let held = false; // the previous note is tied into this one
  rhythm.bars.forEach((bar, b) => {
    bar.items.forEach((item, index) => {
      if (item.rest) {
        held = false;
        return;
      }
      const tick = b * meter.barTicks + item.tick;
      if (held && out.length) out[out.length - 1].ticks += item.ticks;
      else out.push({ bar: b, index, tick, playTick: rhythm.swing ? swungTick(tick, meter) : tick, ticks: item.ticks, accent: item.accent });
      held = item.tie;
    });
  });
  return out;
}

/** Total length of a rhythm in ticks. */
export function rhythmTicks(rhythm: Rhythm): number {
  return rhythm.bars.length * meterInfo(rhythm.meter).barTicks;
}

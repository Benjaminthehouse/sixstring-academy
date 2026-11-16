/**
 * The compact rhythm notation of lesson content, parsed with the theory engine's note values.
 *
 * A rhythm is note codes separated by spaces, bars separated by `|`:
 *
 *   w h q e s      whole, half, quarter, eighth, sixteenth note
 *   q.  h.         dotted (half as long again)
 *   et  qt         triplet (three in the time of two): write all three, `et et et`
 *   qr  er  h.r    a rest of that length
 *   ~q             tied to the note before: it sounds on, with no new attack
 *
 *   'q q e e q'              one bar of 4/4
 *   'h q qr | e e e e h'     two bars
 *
 * Strumming patterns use one character per slot of an eighth-note (default) or sixteenth-note
 * grid: `D` down, `U` up, `X` a muted (percussive) strum, `-` no strum; spaces are ignored and `|`
 * separates bars: `'D-DU-UDU'`.
 */
import { barCapacity, durationTicks, parseTimeSignature, PPQ, type NoteValueId, type TimeSignature } from '@/core/theory';
import type { DurationCode, RhythmSpec } from './types';

const VALUE_CODES: Record<string, NoteValueId> = { w: 'whole', h: 'half', q: 'quarter', e: 'eighth', s: 'sixteenth' };
const CODE_OF_VALUE: Partial<Record<NoteValueId, string>> = { whole: 'w', half: 'h', quarter: 'q', eighth: 'e', sixteenth: 's' };

/** A parsed duration code. */
export interface ParsedDuration {
  value: NoteValueId;
  dots: number;
  triplet: boolean;
  rest: boolean;
  /** Tied to the previous note (no new attack). */
  tied: boolean;
  ticks: number;
}

/** Parse one duration code (`q`, `e.`, `et`, `qr`, `~h`). Null when it is not one. */
export function parseDuration(code: DurationCode): ParsedDuration | null {
  const match = /^(~?)([whqes])(\.{0,2})(t?)(r?)$/.exec(code.trim());
  if (!match) return null;
  const value = VALUE_CODES[match[2]];
  const dots = match[3].length;
  const triplet = match[4] === 't';
  const rest = match[5] === 'r';
  const tied = match[1] === '~';
  if (tied && rest) return null;
  const ticks = durationTicks(value, { dots: dots || undefined, tuplet: triplet ? 3 : undefined });
  return { value, dots, triplet, rest, tied, ticks };
}

/** The code for a plain note value (`quarter` -> `q`). */
export function durationCode(value: NoteValueId, opts: { dots?: number; rest?: boolean } = {}): DurationCode {
  const letter = CODE_OF_VALUE[value];
  if (!letter) throw new RangeError(`No rhythm code for the note value "${value}"`);
  return `${letter}${'.'.repeat(opts.dots ?? 0)}${opts.rest ? 'r' : ''}`;
}

/** One note or rest of a parsed rhythm. */
export interface RhythmEvent extends ParsedDuration {
  /** The code as written. */
  code: string;
  /** Start, in ticks from the beginning of the rhythm. */
  tick: number;
  /** 0-based bar. */
  bar: number;
  /** What to say when counting it aloud: `1`, `&`, `e`, `a`, or `` when it is off that grid. */
  count: string;
  /** True when a new sound starts here (not a rest, not the continuation of a tie). */
  attack: boolean;
}

/** A rhythm ready to draw, play and grade. */
export interface ParsedRhythm {
  time: TimeSignature;
  bars: number;
  barTicks: number;
  totalTicks: number;
  events: RhythmEvent[];
  /** Ticks at which a sound starts, ascending. */
  onsets: number[];
  /** What is wrong with the pattern (empty when fine). */
  problems: string[];
}

/** The counting syllable of a tick inside a bar: `1 e & a 2 e & a` on a sixteenth grid, by beat. */
export function countLabel(tickInBar: number, time: TimeSignature): string {
  // Compound meters are counted in their eighth notes (1 2 3 4 5 6); simple ones in beats.
  if (time.kind === 'compound') {
    const unit = time.unitTicks;
    return tickInBar % unit === 0 ? String(tickInBar / unit + 1) : tickInBar % (unit / 2) === 0 ? '&' : '';
  }
  const beat = time.unitTicks;
  const within = tickInBar % beat;
  if (within === 0) return String(Math.floor(tickInBar / beat) + 1);
  if (within * 2 === beat) return '&';
  if (within * 4 === beat) return 'e';
  if (within * 4 === beat * 3) return 'a';
  return '';
}

/** Parse a rhythm. Never throws; read `problems`. */
export function parseRhythm(spec: RhythmSpec | string): ParsedRhythm {
  const pattern = typeof spec === 'string' ? spec : (spec?.pattern ?? '');
  const timeText = (typeof spec === 'string' ? undefined : spec?.time) ?? '4/4';
  const problems: string[] = [];
  const parsedTime = parseTimeSignature(timeText);
  if (!parsedTime) problems.push(`"${timeText}" is not a time signature. Write it like 4/4, 3/4 or 6/8.`);
  const time = parsedTime ?? parseTimeSignature('4/4')!;
  const barTicks = barCapacity(time);
  const events: RhythmEvent[] = [];
  const barTexts = (typeof pattern === 'string' ? pattern : '').split('|').map((b) => b.trim());
  if (barTexts.every((b) => b === '')) problems.push('The rhythm is empty. Write note codes such as "q q e e q".');

  barTexts.forEach((barText, bar) => {
    if (barText === '') {
      if (barTexts.length > 1) problems.push(`Bar ${bar + 1} is empty. Remove the extra "|" or fill the bar.`);
      return;
    }
    let tickInBar = 0;
    for (const code of barText.split(/\s+/)) {
      const d = parseDuration(code);
      if (!d) {
        problems.push(`"${code}" in bar ${bar + 1} is not a rhythm code. Use w h q e s, with "." for a dot, "t" for a triplet, "r" for a rest and "~" for a tie (q. et qr ~q).`);
        continue;
      }
      const previous = events[events.length - 1];
      if (d.tied && (!previous || previous.rest)) {
        problems.push(`"${code}" in bar ${bar + 1} is tied, but there is no note before it to tie from. Remove the "~".`);
      }
      events.push({ ...d, code, tick: bar * barTicks + tickInBar, bar, count: countLabel(tickInBar, time), attack: !d.rest && !d.tied });
      tickInBar += d.ticks;
    }
    if (tickInBar !== barTicks) {
      const beats = (n: number): string => `${Math.round((n / PPQ) * 1000) / 1000}`;
      problems.push(`Bar ${bar + 1} lasts ${beats(tickInBar)} quarter notes but a bar of ${time.text} holds ${beats(barTicks)}. Add or remove notes so the bar is exactly full.`);
    }
  });

  const onsets = events.filter((e) => e.attack).map((e) => e.tick);
  return { time, bars: barTexts.length, barTicks, totalTicks: barTexts.length * barTicks, events, onsets, problems };
}

/**
 * The counting of the struck notes of a rhythm, as a learner says it: `'q e e q q'` -> "1, 2 &, 3, 4";
 * beats are separated by commas, bars by " | ". Triplets are counted "1 trip let"; a note off every
 * grid is counted with its beat number. Empty for a rhythm that cannot be read.
 */
export function rhythmCounts(spec: RhythmSpec | string): string {
  const parsed = parseRhythm(spec);
  if (parsed.problems.length > 0) return '';
  const unit = parsed.time.unitTicks;
  const bars: string[] = [];
  for (let bar = 0; bar < parsed.bars; bar++) {
    const beats = new Map<number, string[]>();
    for (const e of parsed.events) {
      if (e.bar !== bar || !e.attack) continue;
      const inBar = e.tick - bar * parsed.barTicks;
      const beat = Math.floor(inBar / unit);
      const within = inBar % unit;
      let word = e.count;
      if (!word) word = within * 3 === unit ? 'trip' : within * 3 === unit * 2 ? 'let' : String(beat + 1);
      // The first syllable of a beat that starts off the beat still says which beat it belongs to.
      const list = beats.get(beat) ?? [];
      if (list.length === 0 && within !== 0 && !/^\d+$/.test(word)) list.push(`(${beat + 1})`);
      list.push(word);
      beats.set(beat, list);
    }
    bars.push([...beats.entries()].sort((a, b) => a[0] - b[0]).map(([, words]) => words.join(' ')).join(', '));
  }
  return bars.filter((b) => b !== '').join(' | ');
}

/** Seconds of a tick at a tempo given in quarter notes per minute. */
export function tickSeconds(tick: number, tempo: number): number {
  return (tick / PPQ) * (60 / tempo);
}

/** When each struck note of a rhythm falls, in seconds from beat one. */
export function rhythmOnsetTimes(spec: RhythmSpec | string, tempo: number): number[] {
  return parseRhythm(spec).onsets.map((tick) => tickSeconds(tick, tempo));
}

/** One slot of a strumming pattern. */
export interface StrumSlot {
  /** Start in ticks. */
  tick: number;
  bar: number;
  /** The stroke, or null for a missed slot (the hand moves, the strings are not hit). */
  stroke: 'down' | 'up' | 'mute' | null;
  /** Counting syllable. */
  count: string;
}

/** A strumming pattern ready to draw and play. */
export interface ParsedStrum {
  slots: StrumSlot[];
  slotTicks: number;
  bars: number;
  totalTicks: number;
  problems: string[];
}

/** Parse a strumming pattern in 4/4. Never throws; read `problems`. */
export function parseStrum(pattern: string, grid: 'eighth' | 'sixteenth' = 'eighth'): ParsedStrum {
  const problems: string[] = [];
  const time = parseTimeSignature('4/4')!;
  const slotTicks = grid === 'sixteenth' ? PPQ / 4 : PPQ / 2;
  const perBar = barCapacity(time) / slotTicks;
  const slots: StrumSlot[] = [];
  const bars = (pattern ?? '').split('|').map((b) => b.replace(/\s+/g, ''));
  if (bars.every((b) => b === '')) problems.push('The strumming pattern is empty. Write one character per slot, such as "D-DU-UDU".');
  bars.forEach((barText, bar) => {
    if (barText === '') return;
    if (barText.length !== perBar) {
      problems.push(`Bar ${bar + 1} of the strumming pattern has ${barText.length} slots but a bar on the ${grid}-note grid has ${perBar}. Write exactly ${perBar} characters (D, U, X or -).`);
    }
    [...barText].forEach((ch, index) => {
      const tickInBar = index * slotTicks;
      const stroke = ch === 'D' ? 'down' : ch === 'U' ? 'up' : ch === 'X' || ch === 'x' ? 'mute' : ch === '-' || ch === '.' ? null : undefined;
      if (stroke === undefined) {
        problems.push(`"${ch}" is not a strumming character. Use D (down), U (up), X (muted) or - (miss).`);
        return;
      }
      slots.push({ tick: bar * barCapacity(time) + tickInBar, bar, stroke, count: countLabel(tickInBar, time) });
    });
  });
  return { slots, slotTicks, bars: bars.length, totalTicks: bars.length * barCapacity(time), problems };
}

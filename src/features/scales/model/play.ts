/**
 * What "Play" plays and how it is written down: the current shape up and down, one octave root to
 * root, or a practice sequence (thirds, groups of four …) from the guitar engine, as timed events
 * for the audio transport and as SixTab for the tab view. Pure; unit-tested.
 */
import { practiceSequence, rootToRoot, sequencesFor, type PatternNote, type ScalePattern, type SequenceInfo, type SequenceKind, type Tuning } from '@/core/guitar';

/** PPQ of the audio transport and of SixTab: 960 ticks per quarter note. */
export const PPQ = 960;

/** What the Play button plays. */
export type PlaySource = 'shape' | 'octave' | 'sequence';
/** Which way a line goes. */
export type Direction = 'up' | 'down' | 'up-down';
/** Notes per beat: quarters, eighths, triplets, sixteenths. */
export type NotesPerBeat = 1 | 2 | 3 | 4;

/** One note of a line, in playing order. */
export interface LineNote {
  string: number;
  fret: number;
  midi: number;
  note: string;
  degree: string;
  finger: number;
}

function strip(n: PatternNote): LineNote {
  return { string: n.string, fret: n.fret, midi: n.midi, note: n.note, degree: n.degree, finger: n.finger };
}

/** Up, down, or up and back down without repeating the top note. */
function directed(notes: readonly PatternNote[], direction: Direction): PatternNote[] {
  if (direction === 'up') return [...notes];
  const down = [...notes].reverse();
  if (direction === 'down') return down;
  return [...notes, ...down.slice(1)];
}

/** The sequences a shape supports, easiest first, without the plain up/down walks (those are the directions). */
export function exerciseChoices(shape: ScalePattern): SequenceInfo[] {
  try {
    return sequencesFor(shape).filter((s) => !['ascending', 'descending', 'up-down', 'down-up'].includes(s.id));
  } catch {
    return [];
  }
}

/** The line for a source on a shape. Never empty for a shape that has notes. */
export function buildLine(shape: ScalePattern, source: PlaySource, direction: Direction, sequence: SequenceKind = 'thirds'): LineNote[] {
  if (!shape.notes.length) return [];
  let notes: PatternNote[];
  if (source === 'octave') {
    const octave = rootToRoot(shape, { octaves: 1 });
    notes = directed(octave.length >= 2 ? octave : shape.notes, direction);
  } else if (source === 'sequence') {
    try {
      notes = practiceSequence(shape, sequence, { direction });
    } catch {
      notes = [];
    }
    if (!notes.length) notes = directed(shape.notes, direction);
  } else {
    notes = directed(shape.notes, direction);
  }
  return notes.map(strip);
}

/** One scheduled note of a line. */
export interface LineEvent extends LineNote {
  /** Position in the line (what lights up). */
  index: number;
  tick: number;
  /** Length in ticks. */
  ticks: number;
}

/** A line laid out in time. */
export interface TimedLine {
  events: LineEvent[];
  /** Length of the line itself. */
  lineTicks: number;
  /** Rounded up to whole 4/4 bars (where a loop wraps), with at least one beat of breath at the end. */
  loopTicks: number;
  bars: number;
}

/** Ticks of one 4/4 bar. */
export const BAR_TICKS = PPQ * 4;

/**
 * Lay a line out in time: `perBeat` notes to a quarter note, off-beat eighths pushed to the
 * triplet grid when `swing` (the shuffle and swing backing styles).
 */
export function timeLine(line: readonly LineNote[], perBeat: NotesPerBeat, swing = false): TimedLine {
  const step = PPQ / perBeat;
  const events = line.map((n, index) => {
    let tick = Math.round(index * step);
    if (swing && perBeat === 2 && index % 2 === 1) tick += Math.round(PPQ / 6);
    const ticks = swing && perBeat === 2 ? (index % 2 === 0 ? Math.round((PPQ * 2) / 3) : Math.round(PPQ / 3)) : Math.round(step);
    return { ...n, index, tick, ticks };
  });
  const lineTicks = Math.round(line.length * step);
  const bars = Math.max(1, Math.ceil((lineTicks + PPQ) / BAR_TICKS));
  return { events, lineTicks, loopTicks: bars * BAR_TICKS, bars };
}

/**
 * The line repeated across a backing loop of `totalBars`, one pass every `block` bars, where
 * `block` is the smallest whole share of the loop that holds the line: a 4-bar line plays three
 * times over a 12-bar blues, a 5-bar line twice (each pass starting on bar 1 or 7). Without this
 * the line played once per loop and fell silent for the rest of the form. Each pass keeps the
 * note indices, so the lit dot follows every pass.
 */
export function fillBars(timed: TimedLine, totalBars: number): LineEvent[] {
  const total = Math.max(1, Math.round(totalBars));
  let block = total;
  for (let d = Math.max(1, timed.bars); d < total; d++) {
    if (total % d === 0) {
      block = d;
      break;
    }
  }
  const passes = Math.max(1, Math.floor(total / block));
  const out: LineEvent[] = [];
  for (let k = 0; k < passes; k++) for (const e of timed.events) out.push({ ...e, tick: e.tick + k * block * BAR_TICKS });
  return out;
}

/** SixTab duration token for a number of notes per beat. */
const DURATION: Record<NotesPerBeat, string> = { 1: 'q', 2: 'e', 3: 'e3', 4: 's' };

/** Rests that fill `ticks` (largest first), as SixTab tokens. */
function restTokens(ticks: number): string[] {
  const out: string[] = [];
  const values: Array<[string, number]> = [['h', PPQ * 2], ['q', PPQ], ['e', PPQ / 2], ['s', PPQ / 4]];
  let left = ticks;
  for (const [token, size] of values) {
    while (left >= size) {
      out.push(token, 'r');
      left -= size;
    }
  }
  return out;
}

/**
 * The line as SixTab (4/4, one bar per line group), padded with rests to whole bars, with the
 * left-hand finger on every fretted note. Parses without errors for every shape (unit-tested).
 */
export function lineTab(line: readonly LineNote[], perBeat: NotesPerBeat, opts: { tuning: Tuning; capo?: number; tempo?: number; title?: string }): string {
  const perBar = perBeat * 4;
  const bars: string[] = [];
  for (let i = 0; i < line.length; i += perBar) {
    const chunk = line.slice(i, i + perBar);
    const tokens: string[] = [DURATION[perBeat]];
    for (const n of chunk) tokens.push(n.fret > 0 && n.finger > 0 ? `${n.string}:${n.fret}{${n.finger}}` : `${n.string}:${n.fret}`);
    const missing = perBar - chunk.length;
    if (missing > 0) {
      if (perBeat === 3) {
        // Triplets must finish their group of three before a plain rest can follow.
        const inGroup = missing % 3;
        for (let k = 0; k < inGroup; k++) tokens.push('r');
        tokens.push(...restTokens(Math.floor(missing / 3) * PPQ));
      } else {
        tokens.push(...restTokens((missing * PPQ) / perBeat));
      }
    }
    bars.push(tokens.join(' '));
  }
  const lines: string[] = [];
  for (let i = 0; i < bars.length; i += 2) lines.push(`| ${bars.slice(i, i + 2).join(' | ')} |`);
  const head = [
    `title: ${opts.title ?? 'Scale exercise'}`,
    `tempo: ${Math.round(opts.tempo ?? 80)}`,
    'time: 4/4',
    `tuning: ${opts.tuning.midi.join(' ')}`,
  ];
  if (opts.capo) head.push(`capo: ${opts.capo}`);
  return `${head.join('\n')}\n${lines.join('\n')}\n`;
}

/** Where a line note sits in the tab: bar index and tick from the bar start. */
export function tabPosition(index: number, perBeat: NotesPerBeat): { bar: number; tick: number } {
  const perBar = perBeat * 4;
  return { bar: Math.floor(index / perBar), tick: Math.round(((index % perBar) * PPQ) / perBeat) };
}

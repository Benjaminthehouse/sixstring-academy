/**
 * Graded reading levels and the generator that writes fresh rhythms for them.
 *
 * A level is a vocabulary of small cells (one beat, two beats or a bar long), each written in the
 * text form of `rhythm.ts`. A bar is built by laying cells end to end on the beats, so every bar
 * is full by construction, long cells sit where a reader expects them (a two-beat cell on beat 1
 * or 3 of 4/4), and a level can never contain a note value it has not introduced. The same level
 * and seed always give the same rhythm.
 */
import { PPQ } from '@/core/theory';
import { meterInfo } from './meter';
import { parseItems, parseRhythm, type NoteValue, type Rhythm, type RhythmBar, type RhythmItem } from './rhythm';

/** One building block of a level. */
export interface Cell {
  /** Tokens in the text form, e.g. `e e` or `q. e`. */
  text: string;
  /** Relative chance of being picked. */
  weight: number;
  /** A calm ending: preferred for the last cell of a phrase. */
  end?: boolean;
  /** Contains what this level teaches; every phrase holds at least one. */
  feature?: boolean;
}

/** What a level may contain: the test suite holds every generated rhythm to this. */
export interface Allowed {
  notes: NoteValue[];
  rests: NoteValue[];
  dotted: NoteValue[];
  ties: boolean;
  triplets: boolean;
}

/** One rung of the reading ladder. */
export interface ReadLevel {
  /** 1-based level number. */
  id: number;
  title: string;
  /** What is new, in one line. */
  blurb: string;
  /** How to count or feel it: shown before the round. */
  teach: string;
  meter: string;
  /** Felt beats per minute to start at. */
  bpm: number;
  swing?: boolean;
  allowed: Allowed;
  cells: Cell[];
  /** Chance that the last note of a bar is tied over the bar line. */
  tieOverBar?: number;
  /** An authored two-bar phrase that shows the new idea; the first phrase of a first attempt. */
  intro: string;
}

const c = (text: string, weight: number, flags: { end?: boolean; feature?: boolean } = {}): Cell => ({ text, weight, ...flags });

/** The reading levels, easiest first. */
export const READ_LEVELS: readonly ReadLevel[] = [
  {
    id: 1,
    title: 'Long and short',
    blurb: 'Whole, half and quarter notes.',
    teach: 'A quarter note lasts one beat, a half note two, a whole note four. Tap once at the start of each note and let the long ones ring.',
    meter: '4/4',
    bpm: 72,
    allowed: { notes: ['w', 'h', 'q'], rests: [], dotted: [], ties: false, triplets: false },
    cells: [c('q', 5), c('h', 3, { end: true, feature: true }), c('w', 1, { end: true, feature: true })],
    intro: 'q q q q | h h',
  },
  {
    id: 2,
    title: 'Rests',
    blurb: 'Quarter and half rests: silence that still takes time.',
    teach: 'A rest is a beat you count but do not play. Keep counting through it: the silence is part of the rhythm.',
    meter: '4/4',
    bpm: 72,
    allowed: { notes: ['w', 'h', 'q'], rests: ['q', 'h'], dotted: [], ties: false, triplets: false },
    cells: [c('q', 5), c('h', 2, { end: true }), c('rq', 3, { feature: true }), c('rh', 0.8, { feature: true }), c('w', 0.4, { end: true })],
    intro: 'q q rq q | q rq h',
  },
  {
    id: 3,
    title: 'Eighth notes',
    blurb: 'Two notes per beat, counted "1 & 2 &".',
    teach: 'Eighth notes split the beat in two. Say "one and two and": the number lands with the click, the "and" exactly halfway.',
    meter: '4/4',
    bpm: 76,
    allowed: { notes: ['h', 'q', 'e'], rests: [], dotted: [], ties: false, triplets: false },
    cells: [c('q', 4), c('e e', 4, { feature: true }), c('h', 1.5, { end: true })],
    intro: 'q e e q q | e e e e h',
  },
  {
    id: 4,
    title: 'Eighth rests',
    blurb: 'Notes that start on the "and".',
    teach: 'An eighth rest on the beat pushes the note to the "and". Count the number silently, then tap on "and".',
    meter: '4/4',
    bpm: 72,
    allowed: { notes: ['h', 'q', 'e'], rests: ['q', 'e'], dotted: [], ties: false, triplets: false },
    cells: [c('q', 3), c('e e', 3), c('re e', 2.5, { feature: true }), c('e re', 1.2, { feature: true }), c('rq', 0.8), c('h', 1, { end: true })],
    intro: 'q re e q q | e e re e h',
  },
  {
    id: 5,
    title: 'Dotted notes',
    blurb: 'A dot adds half again: the dotted quarter.',
    teach: 'A dotted quarter lasts a beat and a half, so the next note lands on an "and". Count "1 (2) &" and tap on the "&".',
    meter: '4/4',
    bpm: 76,
    allowed: { notes: ['h', 'q', 'e'], rests: [], dotted: ['q', 'h'], ties: false, triplets: false },
    cells: [c('q', 3), c('e e', 2.5), c('q. e', 3.5, { feature: true }), c('e q.', 0.8, { feature: true }), c('h. q', 0.8, { feature: true }), c('h', 1.5, { end: true })],
    intro: 'q. e q q | q. e h',
  },
  {
    id: 6,
    title: 'Ties',
    blurb: 'Two notes joined into one longer sound.',
    teach: 'A tie joins two notes: tap the first and hold through the second. Ties are how a note is carried across a beat or a bar line.',
    meter: '4/4',
    bpm: 76,
    allowed: { notes: ['h', 'q', 'e'], rests: [], dotted: [], ties: true, triplets: false },
    cells: [c('q', 3), c('e e', 3), c('h', 1.5, { end: true }), c('e e~ e e', 2.5, { feature: true }), c('h~ e e q', 1.2, { feature: true })],
    tieOverBar: 0.6,
    intro: 'q e e~ e e q | h~ e e q',
  },
  {
    id: 7,
    title: 'Syncopation',
    blurb: 'Accents between the beats.',
    teach: 'Syncopation stresses the "and" and holds it over the next beat. Keep the count steady and let the long note start early.',
    meter: '4/4',
    bpm: 80,
    allowed: { notes: ['h', 'q', 'e'], rests: ['e'], dotted: ['q'], ties: false, triplets: false },
    cells: [c('e q e', 3.5, { feature: true }), c('e q q q e', 1.2, { feature: true }), c('q', 3), c('e e', 2.5), c('re e', 1.2), c('q. e', 1.5), c('h', 1, { end: true })],
    intro: 'e q e q q | e q q q e',
  },
  {
    id: 8,
    title: 'Sixteenth notes',
    blurb: 'Four notes per beat, counted "1 e & a".',
    teach: 'Sixteenths split the beat in four: "one e and a". Tap lightly and evenly; the number still lands on the click.',
    meter: '4/4',
    bpm: 63,
    allowed: { notes: ['h', 'q', 'e', 's'], rests: [], dotted: [], ties: false, triplets: false },
    cells: [c('q', 3), c('e e', 2), c('s s s s', 3, { feature: true }), c('e s s', 2, { feature: true }), c('s s e', 2, { feature: true }), c('h', 1, { end: true })],
    intro: 'q s s s s q e e | e s s s s e q q',
  },
  {
    id: 9,
    title: 'Dotted eighths',
    blurb: 'Long-short and short-long inside one beat.',
    teach: 'A dotted eighth fills three of the four sixteenths. "1 (e &) a": tap on the number and again on the "a".',
    meter: '4/4',
    bpm: 60,
    allowed: { notes: ['h', 'q', 'e', 's'], rests: [], dotted: ['e'], ties: false, triplets: false },
    cells: [c('e. s', 3.5, { feature: true }), c('s e.', 1.2, { feature: true }), c('s e s', 2, { feature: true }), c('s s s s', 1.5), c('e e', 2), c('q', 3), c('h', 1, { end: true })],
    intro: 'e. s q e. s q | s e s e e h',
  },
  {
    id: 10,
    title: 'Sixteenth rests',
    blurb: 'Funk rhythms: the gaps make the groove.',
    teach: 'Keep "1 e & a" running in your head and leave out the rests. The groove comes from what you do not play.',
    meter: '4/4',
    bpm: 60,
    allowed: { notes: ['q', 'e', 's'], rests: ['q', 'e', 's'], dotted: [], ties: false, triplets: false },
    cells: [
      c('rs s s s', 2.5, { feature: true }),
      c('s s rs s', 1.5, { feature: true }),
      c('rs s e', 1.5, { feature: true }),
      c('s s re', 1.5, { feature: true }),
      c('re s s', 1.5, { feature: true }),
      c('s s s s', 2),
      c('e s s', 1.5),
      c('s e s', 1.5),
      c('e e', 1.5),
      c('q', 2.5, { end: true }),
      c('rq', 0.5),
    ],
    intro: 'rs s s s q re s s q | s e s rs s e q rq',
  },
  {
    id: 11,
    title: 'Triplets',
    blurb: 'Three even notes in one beat.',
    teach: 'A triplet fits three even notes into one beat: "1 trip let". Do not rush it into "1 & a": all three are the same length.',
    meter: '4/4',
    bpm: 72,
    allowed: { notes: ['h', 'q', 'e'], rests: [], dotted: [], ties: false, triplets: true },
    cells: [c('3e 3e 3e', 4, { feature: true }), c('q', 3.5), c('e e', 1.5), c('h', 1, { end: true })],
    intro: 'q 3e 3e 3e q q | 3e 3e 3e 3e 3e 3e h',
  },
  {
    id: 12,
    title: 'Swing',
    blurb: 'Written even, played long-short.',
    teach: 'In swing the first eighth of each pair is long and the second short, like "doo-ba doo-ba". It is written as plain eighths; you supply the lilt.',
    meter: '4/4',
    bpm: 96,
    swing: true,
    allowed: { notes: ['h', 'q', 'e'], rests: ['e'], dotted: ['q'], ties: false, triplets: false },
    cells: [c('q', 3), c('e e', 4.5, { feature: true }), c('e q e', 1.2, { feature: true }), c('re e', 1.2, { feature: true }), c('q. e', 0.8, { feature: true }), c('h', 1, { end: true })],
    intro: 'q e e q e e | e e e e h',
  },
  {
    id: 13,
    title: 'Three-four time',
    blurb: 'Three beats in a bar: the waltz.',
    teach: 'Count "1 2 3" with a little weight on 1. A dotted half note fills the whole bar.',
    meter: '3/4',
    bpm: 92,
    allowed: { notes: ['h', 'q', 'e'], rests: [], dotted: ['h'], ties: false, triplets: false },
    cells: [c('q', 4.5, { end: true }), c('e e', 3), c('h', 2, { end: true, feature: true }), c('h.', 1.5, { end: true, feature: true })],
    intro: 'q q e e | h.',
  },
  {
    id: 14,
    title: 'Six-eight time',
    blurb: 'Two big beats, each split in three.',
    teach: 'Six eighths in two groups of three: "1 2 3 4 5 6" with the weight on 1 and 4. The click plays the two big beats.',
    meter: '6/8',
    bpm: 54,
    allowed: { notes: ['h', 'q', 'e'], rests: [], dotted: ['q', 'h'], ties: false, triplets: false },
    cells: [c('q.', 3, { end: true }), c('e e e', 4, { feature: true }), c('q e', 3, { feature: true }), c('e q', 0.8, { feature: true }), c('h.', 0.8, { end: true })],
    intro: 'e e e q. | q e q.',
  },
  {
    id: 15,
    title: 'Mixed reading',
    blurb: 'Everything so far in one line.',
    teach: 'Read a beat ahead of where you are tapping. If a bar goes wrong, catch the next beat one and carry on.',
    meter: '4/4',
    bpm: 76,
    allowed: { notes: ['h', 'q', 'e', 's'], rests: ['q', 'e'], dotted: ['q', 'e'], ties: true, triplets: true },
    cells: [
      c('q', 3, { end: true }),
      c('e e', 2.5),
      c('re e', 1.5, { feature: true }),
      c('q. e', 1.5, { feature: true }),
      c('e q e', 1.5, { feature: true }),
      c('e e~ e e', 1, { feature: true }),
      c('s s s s', 1.5, { feature: true }),
      c('e s s', 1.2, { feature: true }),
      c('s s e', 1.2, { feature: true }),
      c('e. s', 1.2, { feature: true }),
      c('3e 3e 3e', 1.2, { feature: true }),
      c('h', 1, { end: true }),
      c('rq', 0.6),
    ],
    tieOverBar: 0.25,
    intro: 'q. e s s s s q | e q e 3e 3e 3e q',
  },
];

/** The level with this number, clamped to the ladder. */
export function readLevel(id: number): ReadLevel {
  const n = Number.isFinite(id) ? Math.round(id) : 1;
  return READ_LEVELS[Math.min(READ_LEVELS.length, Math.max(1, n)) - 1];
}

/** True when an item fits a level's vocabulary. */
export function itemAllowed(item: RhythmItem, allowed: Allowed): boolean {
  if (item.tuplet && !allowed.triplets) return false;
  if (item.tie && !allowed.ties) return false;
  if (item.dots && !allowed.dotted.includes(item.value)) return false;
  return item.rest ? allowed.rests.includes(item.value) : allowed.notes.includes(item.value);
}

/** A small seeded generator (mulberry32): the same seed gives the same numbers on every device. */
export function seededRandom(seed: number): () => number {
  let a = (Math.floor(seed) >>> 0) + 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ParsedCell extends Cell {
  items: RhythmItem[];
  ticks: number;
}

const parsedCells = new WeakMap<ReadLevel, ParsedCell[]>();

function cellsOf(level: ReadLevel): ParsedCell[] {
  let cells = parsedCells.get(level);
  if (!cells) {
    cells = level.cells.map((cell) => {
      const items = parseItems(cell.text);
      return { ...cell, items, ticks: items.reduce((sum, i) => sum + i.ticks, 0) };
    });
    parsedCells.set(level, cells);
  }
  return cells;
}

/** True when a cell of `ticks` length may start at `at` in a bar: long cells keep to the strong beats. */
function fits(at: number, ticks: number, barTicks: number, meterId: string): boolean {
  if (at + ticks > barTicks) return false;
  if (meterId === '4/4') return at % Math.min(ticks, PPQ * 2) === 0;
  return true;
}

function pick<T extends { weight: number }>(list: readonly T[], random: () => number): T {
  const total = list.reduce((sum, x) => sum + x.weight, 0);
  let r = random() * total;
  for (const x of list) {
    r -= x.weight;
    if (r <= 0) return x;
  }
  return list[list.length - 1];
}

function buildBar(level: ReadLevel, random: () => number, lastBar: boolean): { bar: RhythmBar; features: number } {
  const meter = meterInfo(level.meter);
  const cells = cellsOf(level);
  const items: RhythmItem[] = [];
  let at = 0;
  let features = 0;
  let previous = '';
  let repeats = 0;
  while (at < meter.barTicks) {
    let options = cells.filter((cell) => fits(at, cell.ticks, meter.barTicks, level.meter));
    // Three of the same cell in a row reads as a typo, not a rhythm.
    if (repeats >= 2) {
      const others = options.filter((cell) => cell.text !== previous);
      if (others.length) options = others;
    }
    // Close the phrase on something that lets the hand settle.
    const remaining = meter.barTicks - at;
    const closing = options.filter((cell) => cell.end && cell.ticks === remaining);
    if (lastBar && remaining <= meter.barTicks / 2 && closing.length && random() < 0.85) options = closing;
    if (!options.length) throw new Error(`Level ${level.id}: no cell fits at tick ${at}`);
    const cell = pick(options, random);
    for (const item of cell.items) items.push({ ...item, tick: at + item.tick });
    at += cell.ticks;
    if (cell.feature) features++;
    repeats = cell.text === previous ? repeats + 1 : 1;
    previous = cell.text;
  }
  return { bar: { items }, features };
}

/**
 * Write a phrase of `bars` bars for a level. Deterministic in (level, seed). Every phrase contains
 * at least one of the level's featured cells, never a bar of nothing but rests, and never starts
 * on a rest (the first beat one is where the learner finds the pulse).
 */
export function generatePhrase(level: ReadLevel, seed: number, bars = 2): Rhythm {
  const random = seededRandom(seed * 7919 + level.id * 104729);
  const hasFeature = level.cells.some((cell) => cell.feature);
  for (let attempt = 0; attempt < 60; attempt++) {
    const built: RhythmBar[] = [];
    let features = 0;
    for (let b = 0; b < bars; b++) {
      const result = buildBar(level, random, b === bars - 1);
      built.push(result.bar);
      features += result.features;
    }
    if (hasFeature && features === 0) continue;
    if (built.some((bar) => bar.items.every((i) => i.rest))) continue;
    if (built[0].items[0].rest) continue;
    if (level.tieOverBar) {
      for (let b = 0; b + 1 < built.length; b++) {
        const last = built[b].items[built[b].items.length - 1];
        const first = built[b + 1].items[0];
        if (!last.rest && !first.rest && !last.tuplet && random() < level.tieOverBar) last.tie = true;
      }
    }
    return { meter: level.meter, bars: built, swing: !!level.swing };
  }
  // The vocabulary could not satisfy the constraints (never happens for the shipped levels): fall back to the model phrase.
  return introPhrase(level);
}

/** The level's authored model phrase. */
export function introPhrase(level: ReadLevel): Rhythm {
  return parseRhythm(level.intro, level.meter, { swing: level.swing });
}

/**
 * The phrases of one round. Seed 0 (a first attempt) opens with the authored model phrase; every
 * other phrase is generated, and a different seed gives a different round.
 */
export function generateRound(level: ReadLevel, seed: number, phrases = 4, bars = 2): Rhythm[] {
  const out: Rhythm[] = [];
  for (let p = 0; p < phrases; p++) {
    if (p === 0 && seed === 0) out.push(introPhrase(level));
    else out.push(generatePhrase(level, seed * 31 + p, bars));
  }
  return out;
}

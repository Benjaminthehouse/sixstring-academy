/**
 * Rhythm basics: note values in ticks, dots, tuplets, time signatures with their beat grouping,
 * bar capacity, swing, and tempo markings.
 *
 * Time everywhere in the app is in ticks, 960 to the quarter note. 960 divides cleanly by 2, 3
 * and 5, so every ordinary value, triplet and quintuplet down to the sixty-fourth is a whole number.
 */

/** Ticks per quarter note. */
export const PPQ = 960;

/** Ids of the note values, longest to shortest. */
export type NoteValueId =
  | 'double-whole' | 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth' | 'thirty-second' | 'sixty-fourth';

/** A note value (and its rest). */
export interface NoteValue {
  id: NoteValueId;
  /** American name: `quarter note`. */
  name: string;
  /** British name: `crotchet`. */
  british: string;
  /** `quarter rest`. */
  restName: string;
  /** How many fit in a whole note: 4 for a quarter, 8 for an eighth, 0.5 for a double whole. */
  denominator: number;
  /** Length in ticks. */
  ticks: number;
  /** Length in quarter-note beats. */
  beats: number;
  /** Flags on the stem (or beams when grouped): 1 for an eighth, 2 for a sixteenth. */
  flags: number;
}

const VALUE_DEFS: Array<[NoteValueId, number, string]> = [
  ['double-whole', 0.5, 'breve'], ['whole', 1, 'semibreve'], ['half', 2, 'minim'], ['quarter', 4, 'crotchet'],
  ['eighth', 8, 'quaver'], ['sixteenth', 16, 'semiquaver'], ['thirty-second', 32, 'demisemiquaver'],
  ['sixty-fourth', 64, 'hemidemisemiquaver'],
];

/** The note values from double whole to sixty-fourth. */
export const NOTE_VALUES: readonly NoteValue[] = VALUE_DEFS.map(([id, denominator, british]) => {
  const label = id.replace('-', ' ');
  return {
    id,
    name: `${label} note`,
    british,
    restName: `${label} rest`,
    denominator,
    ticks: (PPQ * 4) / denominator,
    beats: 4 / denominator,
    flags: Math.max(0, Math.log2(denominator) - 2),
  };
});

/** Look a note value up by id (`quarter`) or by denominator (4). Null when there is no such value. */
export function noteValue(value: NoteValueId | number | string): NoteValue | null {
  const asNumber = typeof value === 'number' ? value : /^\d+(\.\d+)?$/.test(value) ? parseFloat(value) : null;
  return NOTE_VALUES.find((v) => (asNumber !== null ? v.denominator === asNumber : v.id === value)) ?? null;
}

/** A tuplet ratio: `[3, 2]` means three notes in the time of two. A bare number uses the usual ratio. */
export type Tuplet = number | [actual: number, normal: number];

const DEFAULT_TUPLET_NORMAL: Record<number, number> = { 2: 3, 3: 2, 4: 3, 5: 4, 6: 4, 7: 4, 9: 8, 10: 8, 11: 8, 12: 8 };

function tupletRatio(tuplet: Tuplet): [number, number] {
  if (Array.isArray(tuplet)) return tuplet;
  const normal = DEFAULT_TUPLET_NORMAL[tuplet];
  if (!normal) throw new RangeError(`No default ratio for a tuplet of ${tuplet}; give [actual, normal]`);
  return [tuplet, normal];
}

/** Lengthen a duration by augmentation dots: one dot adds half, two dots add three quarters. */
export function dottedTicks(ticks: number, dots = 1): number {
  return ticks * (2 - 1 / 2 ** dots);
}

/** Shorten a duration to its tuplet length: `tupletTicks(480, 3)` -> 320, an eighth-note triplet. */
export function tupletTicks(ticks: number, tuplet: Tuplet): number {
  const [actual, normal] = tupletRatio(tuplet);
  return (ticks * normal) / actual;
}

/** A written duration. */
export interface DurationSpec {
  value: NoteValueId;
  dots?: number;
  tuplet?: Tuplet;
}

/**
 * Length in ticks of a note or rest: `durationTicks('quarter')` -> 960,
 * `durationTicks('eighth', { dots: 1 })` -> 720, `durationTicks(8, { tuplet: 3 })` -> 320.
 */
export function durationTicks(value: NoteValueId | number, opts: { dots?: number; tuplet?: Tuplet } = {}): number {
  const found = noteValue(value);
  if (!found) throw new RangeError(`Unknown note value: "${value}"`);
  let ticks = found.ticks;
  if (opts.dots) ticks = dottedTicks(ticks, opts.dots);
  if (opts.tuplet !== undefined) ticks = tupletTicks(ticks, opts.tuplet);
  return ticks;
}

/**
 * The single written value that lasts exactly `ticks`: plain, dotted, double-dotted, or a
 * triplet or quintuplet. Null when no single note value fits (use `splitDuration`).
 */
export function ticksToDuration(ticks: number): DurationSpec | null {
  for (const v of NOTE_VALUES) {
    for (let dots = 0; dots <= 2; dots++) {
      if (dottedTicks(v.ticks, dots) === ticks) return dots ? { value: v.id, dots } : { value: v.id };
    }
  }
  for (const tuplet of [3, 5] as const) {
    for (const v of NOTE_VALUES) {
      if (tupletTicks(v.ticks, tuplet) === ticks) return { value: v.id, tuplet };
    }
  }
  return null;
}

/**
 * Break any length into plain and single-dotted values, longest first, to be written as tied
 * notes: 2400 ticks -> half + eighth. A remainder shorter than a sixty-fourth is dropped.
 */
export function splitDuration(ticks: number): DurationSpec[] {
  const pieces: Array<{ spec: DurationSpec; ticks: number }> = [];
  for (const v of NOTE_VALUES) {
    if (v.id !== 'sixty-fourth') pieces.push({ spec: { value: v.id, dots: 1 }, ticks: dottedTicks(v.ticks) });
    pieces.push({ spec: { value: v.id }, ticks: v.ticks });
  }
  pieces.sort((a, b) => b.ticks - a.ticks);
  const out: DurationSpec[] = [];
  let rest = ticks;
  for (const piece of pieces) {
    while (rest >= piece.ticks) {
      out.push(piece.spec);
      rest -= piece.ticks;
    }
  }
  return out;
}

// ── Time signatures ────────────────────────────────────────────────────────────────────────

/** How a meter is felt. */
export type MeterKind = 'simple' | 'compound' | 'odd';
/** Accent of one pulse inside a bar. */
export type Accent = 'strong' | 'medium' | 'weak';

/** A parsed time signature. */
export interface TimeSignature {
  numerator: number;
  denominator: number;
  /** `6/8`. */
  text: string;
  /** `simple`: beats divide in two (2/4, 3/4, 4/4). `compound`: beats divide in three (6/8, 9/8, 12/8). `odd`: unequal groups (5/4, 7/8). */
  kind: MeterKind;
  /** Length in ticks of one written unit (an eighth in 6/8). */
  unitTicks: number;
  /** Length of a full bar in ticks. */
  barTicks: number;
  /** Accent groups in written units: `[3, 3]` for 6/8, `[2, 2]` for 4/4, `[2, 2, 3]` for 7/8. Sums to the numerator. */
  grouping: number[];
  /** Number of felt beats in a bar: 4 in 4/4, 2 in 6/8, 3 in 7/8, 5 in 5/4. */
  beats: number;
  /** Length in ticks of each felt beat: `[1440, 1440]` in 6/8. */
  beatTicks: number[];
  /** Accent of every written unit in the bar: the downbeat strong, other group starts medium, the rest weak. */
  accents: Accent[];
}

const DEFAULT_ODD_GROUPING: Record<number, number[]> = {
  5: [3, 2], 7: [2, 2, 3], 8: [3, 3, 2], 10: [3, 3, 2, 2], 11: [3, 3, 3, 2], 13: [3, 3, 3, 2, 2],
};

function defaultGrouping(numerator: number, kind: MeterKind): number[] {
  if (kind === 'compound') return Array<number>(numerator / 3).fill(3);
  if (kind === 'simple') {
    if (numerator === 4) return [2, 2];
    return [numerator];
  }
  const known = DEFAULT_ODD_GROUPING[numerator];
  if (known) return known;
  // Fill with threes, finishing with twos, the way additive meters are normally counted.
  const out: number[] = [];
  let rest = numerator;
  while (rest > 4 || rest === 3) {
    out.push(3);
    rest -= 3;
  }
  while (rest > 0) {
    out.push(Math.min(2, rest));
    rest -= Math.min(2, rest);
  }
  return out;
}

/**
 * Parse a time signature: `4/4`, `6/8`, `7/8`, `C` (common time), `C|` or `cut` (2/2), an additive
 * form such as `3+2+2/8`, or a `[numerator, denominator]` pair. `grouping` overrides the default
 * accent grouping of an odd meter. Null when the text is not a time signature.
 */
export function parseTimeSignature(input: string | [number, number], opts: { grouping?: number[] } = {}): TimeSignature | null {
  let numerator: number;
  let denominator: number;
  let grouping = opts.grouping;
  if (Array.isArray(input)) {
    [numerator, denominator] = input;
  } else {
    const text = input.trim().toLowerCase();
    if (text === 'c' || text === 'common' || text === 'common time') {
      numerator = 4;
      denominator = 4;
    } else if (text === 'c|' || text === '¢' || text === 'cut' || text === 'cut time' || text === 'alla breve') {
      numerator = 2;
      denominator = 2;
    } else {
      const m = /^(\d+(?:\s*\+\s*\d+)*)\s*\/\s*(\d+)$/.exec(text);
      if (!m) return null;
      const parts = m[1].split('+').map((p) => parseInt(p.trim(), 10));
      numerator = parts.reduce((a, b) => a + b, 0);
      denominator = parseInt(m[2], 10);
      if (parts.length > 1 && !grouping) grouping = parts;
    }
  }
  if (!Number.isInteger(numerator) || numerator < 1 || numerator > 64) return null;
  if (![1, 2, 4, 8, 16, 32, 64].includes(denominator)) return null;
  if (grouping && (grouping.some((g) => g < 1) || grouping.reduce((a, b) => a + b, 0) !== numerator)) return null;

  let kind: MeterKind;
  if (grouping && new Set(grouping).size > 1) kind = 'odd';
  else if (numerator % 3 === 0 && numerator > 3) kind = 'compound';
  else if (numerator <= 4 || (numerator === 8 && denominator <= 4)) kind = 'simple';
  else kind = 'odd';
  const groups = grouping ?? (numerator === 8 && kind === 'simple' ? [4, 4] : defaultGrouping(numerator, kind));

  const unitTicks = (PPQ * 4) / denominator;
  // Short units (eighths and smaller) are felt in groups; with longer units every unit is a beat.
  const feltInGroups = kind === 'compound' || (kind === 'odd' && denominator >= 8);
  const beatTicks = feltInGroups ? groups.map((g) => g * unitTicks) : Array<number>(numerator).fill(unitTicks);
  const accents: Accent[] = [];
  groups.forEach((size, groupIndex) => {
    for (let i = 0; i < size; i++) accents.push(i > 0 ? 'weak' : groupIndex === 0 ? 'strong' : 'medium');
  });
  return {
    numerator,
    denominator,
    text: `${numerator}/${denominator}`,
    kind,
    unitTicks,
    barTicks: numerator * unitTicks,
    grouping: groups,
    beats: beatTicks.length,
    beatTicks,
    accents,
  };
}

function requireTimeSignature(input: string | [number, number] | TimeSignature): TimeSignature {
  if (typeof input === 'object' && !Array.isArray(input)) return input;
  const ts = parseTimeSignature(input);
  if (!ts) throw new RangeError(`Not a time signature: "${String(input)}"`);
  return ts;
}

/** Ticks in one bar of a time signature: 3840 for 4/4, 2880 for 6/8 and 3/4. */
export function barCapacity(input: string | [number, number] | TimeSignature): number {
  return requireTimeSignature(input).barTicks;
}

/** Tick offset of each felt beat from the start of the bar: `[0, 1440]` in 6/8. */
export function beatPositions(input: string | [number, number] | TimeSignature): number[] {
  const ts = requireTimeSignature(input);
  const out: number[] = [];
  let at = 0;
  for (const length of ts.beatTicks) {
    out.push(at);
    at += length;
  }
  return out;
}

/** How a list of durations fills a bar: the ticks used, the ticks left over (negative when too full), and whether it is exactly full. */
export function barFill(durations: number[], input: string | [number, number] | TimeSignature): { used: number; remaining: number; complete: boolean } {
  const capacity = barCapacity(input);
  const used = durations.reduce((a, b) => a + b, 0);
  return { used, remaining: capacity - used, complete: used === capacity };
}

/** Bar number (0-based) and offset inside it for an absolute tick position. */
export function tickToBar(tick: number, input: string | [number, number] | TimeSignature): { bar: number; offset: number } {
  const capacity = barCapacity(input);
  const bar = Math.floor(tick / capacity);
  return { bar, offset: tick - bar * capacity };
}

// ── Swing ──────────────────────────────────────────────────────────────────────────────────

/** Common swing ratios: the share of the beat taken by the first of two eighth notes. */
export const SWING = { straight: 0.5, light: 0.58, triplet: 2 / 3, hard: 0.75 } as const;

/**
 * Durations of the long and short note of a swung pair. `swingPair()` -> `[640, 320]`: triplet
 * swing splits a quarter-note beat two to one.
 */
export function swingPair(ratio: number = SWING.triplet, beatTicks = PPQ): [long: number, short: number] {
  if (!(ratio > 0 && ratio < 1)) throw new RangeError('A swing ratio lies between 0 and 1');
  const long = Math.round(beatTicks * ratio);
  return [long, beatTicks - long];
}

/**
 * Move a straight tick position to where it falls when swung. Positions on the beat stay put,
 * the off-beat eighth moves later, and everything between is stretched to match, so sixteenths
 * swing along. `swingTick(480)` -> 640; a ratio of 0.5 changes nothing.
 */
export function swingTick(tick: number, ratio: number = SWING.triplet, beatTicks = PPQ): number {
  if (!(ratio > 0 && ratio < 1)) throw new RangeError('A swing ratio lies between 0 and 1');
  const beat = Math.floor(tick / beatTicks);
  const within = tick - beat * beatTicks;
  const half = beatTicks / 2;
  const swung = within < half ? within * 2 * ratio : beatTicks * ratio + (within - half) * 2 * (1 - ratio);
  return beat * beatTicks + swung;
}

/** Swing ratio from the "swing percent" of drum machines and DAWs (50 = straight, 66.7 = triplet). */
export function swingRatioFromPercent(percent: number): number {
  return Math.min(0.9, Math.max(0.5, percent / 100));
}

// ── Tempo ──────────────────────────────────────────────────────────────────────────────────

/** A traditional tempo marking and its range in beats per minute. */
export interface TempoMarking {
  name: string;
  /** What the Italian word means. */
  meaning: string;
  /** Lowest BPM of the range (inclusive). */
  min: number;
  /** Top of the range (exclusive); `Infinity` for the fastest marking. */
  max: number;
}

/** The standard tempo markings from slowest to fastest. Ranges follow the usual metronome scale and do not overlap. */
export const TEMPO_MARKINGS: readonly TempoMarking[] = [
  { name: 'Grave', meaning: 'very slow and solemn', min: 0, max: 40 },
  { name: 'Largo', meaning: 'broad and slow', min: 40, max: 60 },
  { name: 'Larghetto', meaning: 'rather broad', min: 60, max: 66 },
  { name: 'Adagio', meaning: 'slow, at ease', min: 66, max: 76 },
  { name: 'Andante', meaning: 'at a walking pace', min: 76, max: 108 },
  { name: 'Moderato', meaning: 'at a moderate speed', min: 108, max: 120 },
  { name: 'Allegro', meaning: 'fast and bright', min: 120, max: 156 },
  { name: 'Vivace', meaning: 'lively and quick', min: 156, max: 176 },
  { name: 'Presto', meaning: 'very fast', min: 176, max: 200 },
  { name: 'Prestissimo', meaning: 'as fast as possible', min: 200, max: Infinity },
];

/** The tempo marking for a speed in beats per minute: 60 -> Larghetto, 120 -> Allegro. */
export function tempoMarking(bpm: number): TempoMarking {
  if (!(bpm > 0)) throw new RangeError('Tempo must be a positive number of beats per minute');
  return TEMPO_MARKINGS.find((t) => bpm >= t.min && bpm < t.max)!;
}

/** Look a tempo marking up by name, ignoring case (`andante`). */
export function tempoRange(name: string): TempoMarking | null {
  const wanted = name.trim().toLowerCase();
  return TEMPO_MARKINGS.find((t) => t.name.toLowerCase() === wanted) ?? null;
}

/** Seconds that a number of ticks lasts at a tempo given in quarter notes per minute. */
export function ticksToSeconds(ticks: number, bpm: number): number {
  return (ticks / PPQ) * (60 / bpm);
}

/** Ticks covered by a number of seconds at a tempo given in quarter notes per minute. */
export function secondsToTicks(seconds: number, bpm: number): number {
  return (seconds * bpm * PPQ) / 60;
}

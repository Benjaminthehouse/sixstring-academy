/**
 * Intervals: parsing, naming, arithmetic, and transposition that preserves spelling.
 *
 * An interval name is a quality and a number: `P1 m2 M2 m3 M3 P4 A4 d5 P5 m6 M6 m7 M7 P8`,
 * compound ones (`M9`, `P11`, `m13` …), and `AA` / `dd` for doubly augmented / diminished.
 * A leading `-` means descending (`-M3`). An interval is two numbers underneath: letter steps
 * and semitones. That pair is what makes `C# + M3 = E#` rather than `F`.
 *
 * Degree labels are the same thing written against the major scale: `b3` = `m3`, `#4` = `A4`,
 * `bb7` = `d7`, `b9` = `m9`.
 */
import { NATURAL_SEMITONES, note, noteName, pcToNote, withOctaveFor, type AccidentalPreference } from './note';

/** Interval quality letters, from triply diminished to triply augmented. */
export type IntervalQuality = 'ddd' | 'dd' | 'd' | 'm' | 'P' | 'M' | 'A' | 'AA' | 'AAA';
/** How stable an interval sounds. */
export type Consonance = 'perfect' | 'imperfect' | 'dissonant';

/** A parsed interval. `steps` and `semitones` are negative for descending intervals. */
export interface Interval {
  /** Canonical name: `M3`, `d5`, `m13`, `-P4`. */
  name: string;
  quality: IntervalQuality;
  /** Interval number, 1 = unison, 8 = octave, 9 = ninth … always positive. */
  number: number;
  /** Signed letter steps (a third is 2 steps). */
  steps: number;
  /** Signed size in semitones. */
  semitones: number;
  direction: 1 | -1;
  /** Name reduced to within an octave (`M9` -> `M2`; `P8` stays `P8`). Never signed. */
  simple: string;
  /** True for intervals larger than an octave. */
  compound: boolean;
}

/** The major scale in semitones: the yardstick every interval quality is measured against. */
const MAJOR_SEMITONES = NATURAL_SEMITONES;
const PERFECT_STEPS = [0, 3, 4];
const PERFECT_QUALITIES: IntervalQuality[] = ['ddd', 'dd', 'd', 'P', 'A', 'AA', 'AAA'];
const MAJOR_QUALITIES: IntervalQuality[] = ['ddd', 'dd', 'd', 'm', 'M', 'A', 'AA', 'AAA'];

function isPerfectClass(steps: number): boolean {
  return PERFECT_STEPS.includes(((steps % 7) + 7) % 7);
}

/** Semitones of the major/perfect interval spanning `steps` letter steps. */
function referenceSemitones(steps: number): number {
  return MAJOR_SEMITONES[steps % 7] + 12 * Math.floor(steps / 7);
}

function qualityFor(steps: number, semitones: number): IntervalQuality | null {
  const diff = semitones - referenceSemitones(steps);
  const quality = isPerfectClass(steps) ? PERFECT_QUALITIES[diff + 3] : MAJOR_QUALITIES[diff + 4];
  return quality ?? null;
}

function qualityOffset(steps: number, quality: IntervalQuality): number | null {
  const index = isPerfectClass(steps) ? PERFECT_QUALITIES.indexOf(quality) - 3 : MAJOR_QUALITIES.indexOf(quality) - 4;
  const valid = isPerfectClass(steps) ? PERFECT_QUALITIES.includes(quality) : MAJOR_QUALITIES.includes(quality);
  return valid ? index : null;
}

function simpleOf(steps: number, semitones: number): { steps: number; semitones: number } {
  if (steps <= 7) return { steps, semitones };
  const octaves = steps % 7 === 0 ? steps / 7 - 1 : Math.floor(steps / 7);
  return { steps: steps - 7 * octaves, semitones: semitones - 12 * octaves };
}

function build(steps: number, semitones: number): Interval | null {
  const direction: 1 | -1 = steps < 0 || (steps === 0 && semitones < 0) ? -1 : 1;
  const absSteps = Math.abs(steps);
  const absSemitones = direction * semitones;
  const quality = qualityFor(absSteps, absSemitones);
  if (!quality) return null;
  const simple = simpleOf(absSteps, absSemitones);
  const simpleQuality = qualityFor(simple.steps, simple.semitones);
  if (!simpleQuality) return null;
  return {
    name: `${direction < 0 ? '-' : ''}${quality}${absSteps + 1}`,
    quality,
    number: absSteps + 1,
    // `|| 0` turns the -0 a descending unison would produce into plain 0.
    steps: steps || 0,
    semitones: semitones || 0,
    direction,
    simple: `${simpleQuality}${simple.steps + 1}`,
    compound: absSteps > 7,
  };
}

/** Build an interval name from signed letter steps and semitones (2, 4 -> `M3`). */
export function intervalFromSteps(steps: number, semitones: number): string {
  const ivl = build(steps, semitones);
  if (!ivl) throw new RangeError(`No interval spans ${steps} steps and ${semitones} semitones`);
  return ivl.name;
}

const INTERVAL_RE = /^([+-]?)(ddd|dd|d|m|M|P|AAA|AA|A)(\d{1,2})$/;
const WORD_QUALITIES: Record<string, IntervalQuality> = {
  perfect: 'P', perf: 'P', major: 'M', maj: 'M', minor: 'm', min: 'm',
  augmented: 'A', aug: 'A', diminished: 'd', dim: 'd',
};

/** Parse an interval name (`M3`, `-P5`, `A11`, also `min3`, `aug4`); null when it is not one. */
export function parseInterval(input: string): Interval | null {
  if (typeof input !== 'string') return null;
  let text = input.trim();
  const word = /^([+-]?)(perfect|perf|major|maj|minor|min|augmented|aug|diminished|dim)\s*(\d{1,2})$/i.exec(text);
  if (word) text = `${word[1]}${WORD_QUALITIES[word[2].toLowerCase()]}${word[3]}`;
  const m = INTERVAL_RE.exec(text);
  if (!m) return null;
  const number = parseInt(m[3], 10);
  if (number < 1) return null;
  const steps = number - 1;
  const offset = qualityOffset(steps, m[2] as IntervalQuality);
  if (offset === null) return null;
  const semitones = referenceSemitones(steps) + offset;
  if (semitones < 0) return null;
  const direction = m[1] === '-' ? -1 : 1;
  return build(direction * steps, direction * semitones);
}

/** Parse an interval name, throwing a RangeError when it is invalid. */
export function interval(input: string): Interval {
  const ivl = parseInterval(input);
  if (!ivl) throw new RangeError(`Not an interval: "${input}"`);
  return ivl;
}

/** True when the string is a valid interval name. */
export function isInterval(input: string): boolean {
  return parseInterval(input) !== null;
}

/** Signed size of an interval in semitones (`P5` -> 7, `-M3` -> -4). */
export function semitones(input: string): number {
  return interval(input).semitones;
}

/** True for intervals larger than an octave. */
export function isCompound(input: string): boolean {
  return interval(input).compound;
}

/** Reduce a compound interval to within an octave (`M9` -> `M2`, `P15` -> `P8`). */
export function simplifyInterval(input: string): string {
  const ivl = interval(input);
  return ivl.direction < 0 ? `-${ivl.simple}` : ivl.simple;
}

/** Sum of two intervals (`M3` + `m3` = `P5`). */
export function addIntervals(a: string, b: string): string {
  const x = interval(a);
  const y = interval(b);
  return intervalFromSteps(x.steps + y.steps, x.semitones + y.semitones);
}

/** Difference of two intervals (`P5` - `M3` = `m3`); negative results are descending. */
export function subtractIntervals(a: string, b: string): string {
  const x = interval(a);
  const y = interval(b);
  return intervalFromSteps(x.steps - y.steps, x.semitones - y.semitones);
}

/** Inversion within the octave (`M3` -> `m6`, `A4` -> `d5`, `P1` <-> `P8`). Compound intervals invert as their simple form. */
export function invertInterval(input: string): string {
  const simple = interval(interval(input).simple);
  if (simple.steps === 7) {
    // An octave inverts to a unison. An augmented octave has no unison to turn into (there is
    // no "diminished unison"), so it inverts as its simple form, the augmented unison: d8.
    if (simple.semitones > 12) return intervalFromSteps(7, 24 - simple.semitones);
    return intervalFromSteps(0, 12 - simple.semitones);
  }
  return intervalFromSteps(7 - simple.steps, 12 - simple.semitones);
}

/**
 * Transpose a note by an interval, keeping the spelling correct: (`C#`, `M3`) -> `E#`,
 * (`Bb3`, `P5`) -> `F4`, (`C4`, `-m3`) -> `A3`. A note without an octave stays without one.
 */
export function transpose(noteInput: string, intervalInput: string): string {
  const n = note(noteInput);
  const ivl = interval(intervalInput);
  const absoluteStep = n.step + ivl.steps;
  const step = ((absoluteStep % 7) + 7) % 7;
  const octaveShift = Math.floor(absoluteStep / 7);
  const naturalFrom = MAJOR_SEMITONES[n.step] + n.alt;
  const naturalTo = MAJOR_SEMITONES[step] + 12 * octaveShift;
  const alt = naturalFrom + ivl.semitones - naturalTo;
  return noteName(step, alt, n.octave === null ? null : n.octave + octaveShift);
}

/**
 * The interval from one spelled note to another. With octaves on both it is exact and may be
 * descending (`C4` -> `A3` = `-m3`). Without octaves it is the ascending interval inside one
 * octave (`E` -> `C` = `m6`), which is what scale and chord spelling needs.
 */
export function intervalBetween(from: string, to: string): string {
  const a = note(from);
  const b = note(to);
  if (a.midi !== null && b.midi !== null && a.octave !== null && b.octave !== null) {
    const steps = b.step + 7 * b.octave - (a.step + 7 * a.octave);
    return intervalFromSteps(steps, b.midi - a.midi);
  }
  let steps = b.step - a.step;
  let semis = MAJOR_SEMITONES[b.step] + b.alt - (MAJOR_SEMITONES[a.step] + a.alt);
  if (steps < 0) {
    steps += 7;
    semis += 12;
  } else if (steps === 0 && semis < 0) {
    // Same letter, lower alteration: going up means a diminished octave, not a unison.
    steps = 7;
    semis += 12;
  }
  return intervalFromSteps(steps, semis);
}

const QUALITY_WORDS: Record<IntervalQuality, string> = {
  ddd: 'triply diminished', dd: 'doubly diminished', d: 'diminished', m: 'minor', P: 'perfect',
  M: 'major', A: 'augmented', AA: 'doubly augmented', AAA: 'triply augmented',
};
const NUMBER_WORDS = [
  'unison', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'octave', 'ninth', 'tenth',
  'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth',
];

function ordinal(n: number): string {
  const tail = n % 100;
  const suffix = tail >= 11 && tail <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/** Full English name: `m3` -> `minor third`, `A4` -> `augmented fourth`, `-P5` -> `descending perfect fifth`. */
export function intervalName(input: string): string {
  const ivl = interval(input);
  const number = NUMBER_WORDS[ivl.number - 1] ?? ordinal(ivl.number);
  return `${ivl.direction < 0 ? 'descending ' : ''}${QUALITY_WORDS[ivl.quality]} ${number}`;
}

/**
 * Consonance class by spelling. Unison, fifth and octave are perfect consonances; thirds and
 * sixths imperfect; seconds, sevenths and every augmented or diminished interval dissonant.
 * The perfect fourth is classed `perfect` (it is treated as a dissonance only above the bass).
 */
export function consonance(input: string): Consonance {
  const simple = interval(interval(input).simple);
  if (simple.quality === 'P') return 'perfect';
  if ((simple.quality === 'M' || simple.quality === 'm') && (simple.number === 3 || simple.number === 6)) {
    return 'imperfect';
  }
  return 'dissonant';
}

const DEGREE_RE = /^(b{1,3}|#{1,3}|x)?(\d{1,2})$/;

/** Interval above the tonic named by a degree label: `b3` -> `m3`, `#4` -> `A4`, `bb7` -> `d7`, `b9` -> `m9`. */
export function degreeToInterval(label: string): string {
  const m = DEGREE_RE.exec(label.trim().replace(/♯/g, '#').replace(/♭/g, 'b'));
  if (!m) throw new RangeError(`Not a degree label: "${label}"`);
  const number = parseInt(m[2], 10);
  if (number < 1) throw new RangeError(`Not a degree label: "${label}"`);
  const acc = m[1] ?? '';
  const alt = acc === 'x' ? 2 : acc.startsWith('#') ? acc.length : -acc.length;
  return intervalFromSteps(number - 1, referenceSemitones(number - 1) + alt);
}

/** Degree label of an interval above the tonic: `m3` -> `b3`, `A4` -> `#4`, `d7` -> `bb7`, `P5` -> `5`. */
export function intervalToDegree(input: string): string {
  const ivl = interval(input);
  if (ivl.direction < 0) throw new RangeError(`A descending interval has no degree label: "${input}"`);
  const alt = ivl.semitones - referenceSemitones(ivl.number - 1);
  return `${alt >= 0 ? '#'.repeat(alt) : 'b'.repeat(-alt)}${ivl.number}`;
}

/** True when the string is a degree label such as `1`, `b3`, `#11`. */
export function isDegree(label: string): boolean {
  return DEGREE_RE.test(label.trim());
}

/** The twelve degree labels of the harmonic chromatic scale, indexed by semitones above the tonic. */
export const CHROMATIC_DEGREES = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'] as const;

/** Conventional degree label for a number of semitones above the tonic (3 -> `b3`, 14 -> `9`). */
export function semitonesToDegree(semis: number, opts: { tritone?: '#4' | 'b5' } = {}): string {
  if (semis < 0) throw new RangeError('semitonesToDegree needs a non-negative size');
  const octaves = Math.floor(semis / 12);
  const within = semis % 12;
  if (within === 0 && octaves > 0) return String(7 * octaves + 1);
  const base = within === 6 && opts.tritone === 'b5' ? 'b5' : CHROMATIC_DEGREES[within];
  if (octaves === 0) return base;
  const m = DEGREE_RE.exec(base)!;
  return `${m[1] ?? ''}${parseInt(m[2], 10) + 7 * octaves}`;
}

/** Conventional interval name for a size in semitones (3 -> `m3`, 6 -> `A4`, 14 -> `M9`, -7 -> `-P5`). */
export function semitonesToInterval(semis: number, opts: { tritone?: 'A4' | 'd5' } = {}): string {
  const tritone = opts.tritone === 'd5' ? 'b5' : '#4';
  const name = degreeToInterval(semitonesToDegree(Math.abs(Math.round(semis)), { tritone }));
  return semis < 0 ? `-${name}` : name;
}

/** The fourteen simple interval names from unison to octave, in ascending order (tritone as both A4 and d5). */
export const SIMPLE_INTERVALS = [
  'P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'A4', 'd5', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8',
] as const;

/** True when both names parse and describe the same number of semitones (`A4` and `d5`). */
export function enharmonicIntervals(a: string, b: string): boolean {
  const x = parseInterval(a);
  const y = parseInterval(b);
  return !!x && !!y && x.semitones === y.semitones;
}

/**
 * Transpose a note name by semitones, respelling with an ordinary accidental (no E#, no double
 * sharps); keeps the octave if present. `auto` follows the accidental of the source note.
 */
export function transposeBySemitones(noteInput: string, semis: number, prefer: AccidentalPreference = 'auto'): string {
  const n = note(noteInput);
  const shift = Math.round(semis);
  const preference: AccidentalPreference = prefer !== 'auto' ? prefer : n.alt < 0 ? 'flats' : n.alt > 0 ? 'sharps' : 'auto';
  const name = pcToNote((((n.chroma + shift) % 12) + 12) % 12, preference);
  return n.midi === null ? name : withOctaveFor(name, n.midi + shift);
}

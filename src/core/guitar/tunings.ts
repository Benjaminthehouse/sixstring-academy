/**
 * Tunings: the catalog, custom tunings from note names, and the per-string targets a tuner needs.
 *
 * A tuning lists its strings low to high **by string number** (index 0 is the highest-numbered
 * string), which is also low to high by pitch except for re-entrant tunings (ukulele, Nashville).
 */
import { centsBetween, DEFAULT_A4, freqToMidi, midiToFreq } from '@/core/math/pitch-math';
import { midiToNote, parseNote, pcName, withOctaveFor } from '@/core/theory';

/** The kind of instrument a tuning belongs to. */
export type Instrument = 'guitar' | 'bass' | 'ukulele';

/** How the tuning catalog is grouped in pickers. */
export type TuningCategory = 'standard' | 'lowered' | 'drop' | 'open' | 'modal' | 'extended' | 'other';

/** A set of open-string pitches. */
export interface Tuning {
  /** Stable, route-safe id: `standard`, `drop-d`, `dadgad`. Custom tunings get `custom-…`. */
  id: string;
  name: string;
  /** What it is for and how to get there from standard. */
  description: string;
  instrument: Instrument;
  category: TuningCategory;
  /** Sounding MIDI per string, low to high (index 0 = the highest-numbered string). */
  midi: readonly number[];
  /** The same as spelled notes with octaves: `['E2','A2','D3','G3','B3','E4']`. */
  notes: readonly string[];
  /** Number of strings. */
  stringCount: number;
  /** Compact label of the open strings, low to high: `E A D G B E`. */
  label: string;
  /** True when the strings do not rise in pitch from low to high (ukulele, Nashville). */
  reentrant: boolean;
  /** True for a tuning that is not in the catalog. */
  custom: boolean;
}

/** Anything that names a tuning: a catalog id or name, a `Tuning`, or open-string MIDI numbers low to high. */
export type TuningInput = string | Tuning | readonly number[];

function build(
  id: string, name: string, notes: string[], instrument: Instrument, category: TuningCategory, description: string, custom = false,
): Tuning {
  const midi = notes.map((n) => {
    const parsed = parseNote(n);
    if (!parsed || parsed.midi === null) throw new RangeError(`Tuning "${id}": "${n}" is not a note with an octave`);
    return parsed.midi;
  });
  return Object.freeze({
    id, name, description, instrument, category,
    midi: Object.freeze(midi),
    notes: Object.freeze([...notes]),
    stringCount: notes.length,
    label: notes.map((n) => pcName(n)).join(' '),
    reentrant: midi.some((m, i) => i > 0 && m < midi[i - 1]),
    custom,
  });
}

function def(id: string, name: string, notes: string, instrument: Instrument, category: TuningCategory, description: string): Tuning {
  return build(id, name, notes.split(' '), instrument, category, description);
}

/** Every catalog tuning, in teaching order: standard first, then lowered, drop, open, modal, extended and other instruments. */
export const TUNINGS: readonly Tuning[] = [
  def('standard', 'Standard', 'E2 A2 D3 G3 B3 E4', 'guitar', 'standard',
    'The tuning nearly all guitar music is written for: fourths between the strings, with one major third between G and B.'),
  def('half-step-down', 'Half step down', 'Eb2 Ab2 Db3 Gb3 Bb3 Eb4', 'guitar', 'lowered',
    'Standard tuning with every string a half step lower (E flat standard). Slightly looser strings, a darker sound and easier bends; all shapes stay the same.'),
  def('whole-step-down', 'Whole step down', 'D2 G2 C3 F3 A3 D4', 'guitar', 'lowered',
    'Standard tuning with every string a whole step lower (D standard). Heavier and deeper; common in hard rock and metal.'),
  def('drop-d', 'Drop D', 'D2 A2 D3 G3 B3 E4', 'guitar', 'drop',
    'Standard tuning with the low E string lowered a whole step to D. The three lowest strings make a power chord under one finger.'),
  def('double-drop-d', 'Double drop D', 'D2 A2 D3 G3 B3 D4', 'guitar', 'drop',
    'Both E strings lowered to D. Keeps the low D of drop D and adds a ringing D on top; a folk-rock favourite.'),
  def('drop-c-sharp', 'Drop C#', 'C#2 G#2 C#3 F#3 A#3 D#4', 'guitar', 'drop',
    'Drop D shifted down a half step: tune every string down a half step, then the lowest one a further whole step.'),
  def('drop-c', 'Drop C', 'C2 G2 C3 F3 A3 D4', 'guitar', 'drop',
    'Drop D shifted down a whole step: D standard with the lowest string dropped to C. A staple of modern metal.'),
  def('dadgad', 'DADGAD', 'D2 A2 D3 G3 A3 D4', 'guitar', 'modal',
    'An open Dsus4 chord, neither major nor minor. Strings 6, 2 and 1 come down a whole step. The classic tuning of Celtic and fingerstyle guitar.'),
  def('open-g', 'Open G', 'D2 G2 D3 G3 B3 D4', 'guitar', 'open',
    'The open strings sound a G major chord. Strings 6, 5 and 1 come down a whole step. Slide, blues and rootsy rock rhythm.'),
  def('open-d', 'Open D', 'D2 A2 D3 F#3 A3 D4', 'guitar', 'open',
    'The open strings sound a D major chord. A deep, resonant tuning for slide and fingerstyle.'),
  def('open-e', 'Open E', 'E2 B2 E3 G#3 B3 E4', 'guitar', 'open',
    'The open strings sound an E major chord: open D a whole step higher. Strings 5, 4 and 3 are tuned up, so go gently.'),
  def('open-a', 'Open A', 'E2 A2 E3 A3 C#4 E4', 'guitar', 'open',
    'The open strings sound an A major chord: open G a whole step higher. Strings 4, 3 and 2 are tuned up a whole step.'),
  def('open-c', 'Open C', 'C2 G2 C3 G3 C4 E4', 'guitar', 'open',
    'The open strings sound a wide C major chord with a very low bass. Big and orchestral for solo acoustic playing.'),
  def('open-dm', 'Open D minor', 'D2 A2 D3 F3 A3 D4', 'guitar', 'open',
    'The open strings sound a D minor chord: open D with the third string a half step lower. Dark and bluesy.'),
  def('open-em', 'Open E minor', 'E2 B2 E3 G3 B3 E4', 'guitar', 'open',
    'The open strings sound an E minor chord. Only strings 5 and 4 change, each up a whole step.'),
  def('all-fourths', 'All fourths', 'E2 A2 D3 G3 C4 F4', 'guitar', 'other',
    'Every pair of strings a fourth apart: strings 2 and 1 go up a half step. Every shape is the same on every string set, at the price of the familiar open chords.'),
  def('nashville', 'Nashville (high strung)', 'E3 A3 D4 G4 B3 E4', 'guitar', 'other',
    'The four low strings are replaced by thin ones tuned an octave higher. Normal chord shapes come out bright and shimmering, like the high half of a twelve-string.'),
  def('standard-7', 'Seven-string standard', 'B1 E2 A2 D3 G3 B3 E4', 'guitar', 'extended',
    'Standard tuning with a low B string added below the low E.'),
  def('drop-a-7', 'Seven-string drop A', 'A1 E2 A2 D3 G3 B3 E4', 'guitar', 'extended',
    'Seven-string standard with the low B lowered a whole step to A.'),
  def('baritone', 'Baritone', 'B1 E2 A2 D3 F#3 B3', 'guitar', 'extended',
    'A baritone guitar: standard tuning a fourth lower, on a longer neck.'),
  def('bass', 'Bass (four-string)', 'E1 A1 D2 G2', 'bass', 'standard',
    'The standard bass guitar tuning: the four low strings of a guitar, an octave down.'),
  def('bass-5', 'Bass (five-string)', 'B0 E1 A1 D2 G2', 'bass', 'extended',
    'A four-string bass with a low B string added.'),
  def('bass-drop-d', 'Bass drop D', 'D1 A1 D2 G2', 'bass', 'drop',
    'A four-string bass with the E string lowered a whole step to D.'),
  def('ukulele', 'Ukulele', 'G4 C4 E4 A4', 'ukulele', 'standard',
    'Standard soprano, concert and tenor ukulele tuning. The fourth string is tuned high (re-entrant), above the third.'),
  def('ukulele-low-g', 'Ukulele (low G)', 'G3 C4 E4 A4', 'ukulele', 'other',
    'Ukulele with the fourth string an octave lower, so the strings rise in pitch like a guitar.'),
  def('ukulele-baritone', 'Baritone ukulele', 'D3 G3 B3 E4', 'ukulele', 'other',
    'The four high strings of a guitar. Guitar chord shapes work unchanged.'),
];

const BY_ID = new Map(TUNINGS.map((t) => [t.id, t]));
const BY_MIDI = new Map(TUNINGS.map((t) => [t.midi.join(','), t]));

function lookupKey(text: string): string {
  return text.toLowerCase().replace(/♯/g, '#').replace(/♭/g, 'b').replace(/[^a-z0-9#]+/g, ' ').trim();
}

const ALIASES: Record<string, string> = {
  'e standard': 'standard', 'standard e': 'standard', 'eadgbe': 'standard',
  'eb standard': 'half-step-down', 'e flat standard': 'half-step-down', 'half step down': 'half-step-down', 'd# standard': 'half-step-down',
  'd standard': 'whole-step-down', 'whole step down': 'whole-step-down', 'full step down': 'whole-step-down',
  'dropped d': 'drop-d', 'drop d': 'drop-d', 'double drop d': 'double-drop-d', 'double dropped d': 'double-drop-d',
  'drop c#': 'drop-c-sharp', 'drop db': 'drop-c-sharp', 'drop c': 'drop-c',
  'open g': 'open-g', 'spanish': 'open-g', 'open d': 'open-d', 'vestapol': 'open-d', 'open e': 'open-e', 'open a': 'open-a', 'open c': 'open-c',
  'open dm': 'open-dm', 'open d minor': 'open-dm', 'open em': 'open-em', 'open e minor': 'open-em',
  'fourths': 'all-fourths', 'p4': 'all-fourths', 'high strung': 'nashville', 'nashville': 'nashville',
  '7 string': 'standard-7', 'seven string': 'standard-7', '7 string standard': 'standard-7',
  '4 string bass': 'bass', 'bass guitar': 'bass', '5 string bass': 'bass-5', 'uke': 'ukulele', 'gcea': 'ukulele', 'low g ukulele': 'ukulele-low-g',
};
const BY_NAME = new Map<string, Tuning>();
for (const t of TUNINGS) {
  BY_NAME.set(lookupKey(t.id), t);
  BY_NAME.set(lookupKey(t.name), t);
}
for (const [alias, id] of Object.entries(ALIASES)) BY_NAME.set(lookupKey(alias), BY_ID.get(id)!);

/** The standard six-string tuning. */
export const STANDARD_TUNING: Tuning = BY_ID.get('standard')!;

/** Custom tunings made in this session, so their ids resolve like catalog ids. */
const CUSTOM_BY_ID = new Map<string, Tuning>();

function remember(t: Tuning): Tuning {
  if (CUSTOM_BY_ID.size > 500) CUSTOM_BY_ID.clear();
  CUSTOM_BY_ID.set(t.id, t);
  return t;
}

/**
 * Look a tuning up by id, name or common alias (`drop-d`, `Drop D`, `DADGAD`, `Eb standard`), or by
 * the id of a custom tuning built earlier in this session. Null when unknown.
 */
export function getTuning(query: string): Tuning | null {
  return BY_ID.get(query) ?? BY_NAME.get(lookupKey(query)) ?? CUSTOM_BY_ID.get(query) ?? null;
}

/** Catalog tunings for one instrument (default guitar), optionally with a given number of strings. */
export function tuningsFor(instrument: Instrument = 'guitar', stringCount?: number): Tuning[] {
  return TUNINGS.filter((t) => t.instrument === instrument && (stringCount === undefined || t.stringCount === stringCount));
}

/** Options for `customTuning`. */
export interface CustomTuningOptions {
  id?: string;
  name?: string;
  description?: string;
  /** Decides the octaves when the names have none and tells a bass from a ukulele (default: guessed from the string count). */
  instrument?: Instrument;
}

/** Open strings each instrument starts from, used to choose octaves for names given without one. */
function referenceMidi(instrument: Instrument, count: number): number[] {
  if (instrument === 'ukulele') return [67, 60, 64, 69].slice(0, count);
  if (instrument === 'bass') {
    const five = [23, 28, 33, 38, 43, 48];
    return count <= 4 ? five.slice(1, 1 + count) : five.slice(0, count);
  }
  // Guitar: fewer than six strings keep the high ones; more add fourths below (B1, F#1 …).
  const out = [40, 45, 50, 55, 59, 64];
  while (out.length < count) out.unshift(out[0] - 5);
  return out.slice(out.length - count);
}

function splitNames(text: string): string[] {
  const spaced = text.trim().split(/[\s,\-–|]+/).filter(Boolean);
  if (spaced.length > 1) return spaced;
  // A run of capital note letters such as "DADGAD" or "C#G#C#F#A#D#": split before each letter.
  // Anything else (a word, lower case) is not a tuning: "b" could be a note or a flat.
  const run = text.trim();
  if (!/^(?:[A-G](?:#{1,2}|b{1,2}|♯|♭)?\d?)+$/.test(run)) return [];
  return run.match(/[A-G](?:#{1,2}|b{1,2}|♯|♭)?\d?/g) ?? [];
}

/**
 * Build a tuning from note names, low to high: `customTuning('D A D G A D')`, `customTuning('DADGAD')`,
 * `customTuning(['C2','G2','C3','G3','C4','E4'])`. Names without octaves are placed in the octave
 * nearest to the instrument's usual pitch for that string. When the result equals a catalog
 * tuning, that tuning is returned. Throws a RangeError for unreadable names or fewer than two strings.
 */
export function customTuning(names: string | readonly string[], opts: CustomTuningOptions = {}): Tuning {
  const list = (typeof names === 'string' ? splitNames(names) : [...names]).map((n) => n.trim());
  if (list.length < 2 || list.length > 12) throw new RangeError(`A tuning needs 2 to 12 strings, got ${list.length}`);
  const parsed = list.map((raw) => {
    const n = parseNote(raw[0].toUpperCase() + raw.slice(1));
    if (!n) throw new RangeError(`Not a note name: "${raw}"`);
    return n;
  });
  const pcs = parsed.map((n) => n.chroma);
  const looksLikeUkulele = list.length === 4 && [[7, 0, 4, 9], [9, 2, 6, 11]].some((u) => u.every((pc, i) => pc === pcs[i]));
  const instrument = opts.instrument ?? (looksLikeUkulele ? 'ukulele' : list.length === 4 || list.length === 5 ? 'bass' : 'guitar');
  const reference = referenceMidi(instrument, list.length);
  const notes = parsed.map((n, i) => {
    if (n.midi !== null) return n.name;
    // Nearest octave to the usual pitch of this string; a tritone tie goes down (slack, not snapped strings).
    let diff = (n.chroma - (reference[i] % 12) + 12) % 12;
    if (diff >= 6) diff -= 12;
    return withOctaveFor(n.pcName, reference[i] + diff);
  });
  const candidate = build(opts.id ?? `custom-${notes.join('-').toLowerCase().replace(/#/g, 's')}`,
    opts.name ?? notes.map((n) => pcName(n)).join(' '), notes, instrument, 'other', opts.description ?? 'A custom tuning.', true);
  const known = BY_MIDI.get(candidate.midi.join(','));
  if (known && !opts.id && !opts.name) return known;
  return remember(candidate);
}

/** Build a tuning from open-string MIDI numbers, low to high. Returns the catalog tuning when one matches. */
export function tuningFromMidi(midi: readonly number[], opts: CustomTuningOptions = {}): Tuning {
  if (midi.length < 2 || midi.length > 12) throw new RangeError(`A tuning needs 2 to 12 strings, got ${midi.length}`);
  const rounded = midi.map((m) => {
    if (!Number.isFinite(m)) throw new RangeError(`Not a MIDI number: ${m}`);
    return Math.round(m);
  });
  const known = BY_MIDI.get(rounded.join(','));
  if (known && !opts.id && !opts.name) return known;
  const flat = rounded.filter((m) => [1, 3, 8, 10].includes(m % 12)).length;
  const sharp = rounded.filter((m) => m % 12 === 6).length;
  const notes = rounded.map((m) => midiToNote(m, { prefer: flat > sharp ? 'flats' : 'sharps' }));
  const instrument = opts.instrument ?? (rounded.length <= 5 ? (Math.min(...rounded) >= 55 ? 'ukulele' : 'bass') : 'guitar');
  return remember(build(opts.id ?? `custom-${notes.join('-').toLowerCase().replace(/#/g, 's')}`,
    opts.name ?? notes.map((n) => pcName(n)).join(' '), notes, instrument, 'other', opts.description ?? 'A custom tuning.', true));
}

/**
 * Resolve anything that names a tuning. Strings are tried as a catalog id, name or alias, then as
 * note names (`'D A D G A D'`). Throws a RangeError when nothing fits. `undefined` gives standard.
 */
export function tuning(input: TuningInput | undefined = 'standard'): Tuning {
  if (typeof input === 'string') {
    const found = getTuning(input);
    if (found) return found;
    try {
      return customTuning(input);
    } catch {
      throw new RangeError(`Unknown tuning: "${input}"`);
    }
  }
  if (Array.isArray(input)) return tuningFromMidi(input as readonly number[]);
  return input as Tuning;
}

/** The catalog tuning with exactly these open strings (MIDI low to high or a tuning), or null. */
export function identifyTuning(input: readonly number[] | Tuning): Tuning | null {
  const midi = Array.isArray(input) ? (input as readonly number[]) : (input as Tuning).midi;
  return BY_MIDI.get(midi.map((m) => Math.round(m)).join(',')) ?? null;
}

/** One string of a tuning as a tuner target. */
export interface StringTarget {
  /** String number, 1 = thinnest. */
  string: number;
  /** Index in the tuning's low-to-high arrays. */
  index: number;
  midi: number;
  /** Spelled note with octave, as the tuning names it: `Eb2`. */
  note: string;
  /** Target frequency in Hz for the chosen concert pitch. */
  frequency: number;
}

/** Options for the tuner helpers. */
export interface TunerOptions {
  /** Concert pitch of A4 in Hz (default 440). */
  a4?: number;
}

/** Open-string frequencies in Hz, low to high, for a concert pitch (default A4 = 440 Hz). */
export function tuningFrequencies(input: TuningInput = 'standard', a4: number = DEFAULT_A4): number[] {
  return tuning(input).midi.map((m) => midiToFreq(m, a4));
}

/** The tuner's targets for every string of a tuning, low to high. */
export function stringTargets(input: TuningInput = 'standard', opts: TunerOptions = {}): StringTarget[] {
  const t = tuning(input);
  const a4 = opts.a4 ?? DEFAULT_A4;
  return t.midi.map((midi, index) => ({
    string: t.stringCount - index, index, midi, note: t.notes[index], frequency: midiToFreq(midi, a4),
  }));
}

/** A heard frequency matched to the string it most likely belongs to. */
export interface StringMatch extends StringTarget {
  /** Cents from the heard pitch to the string's target: negative = flat (tune up), positive = sharp. */
  cents: number;
  /** True when the pitch is within `tolerance` cents of the target. */
  inTune: boolean;
}

/**
 * The string a heard frequency most likely belongs to, and how far off it is. A pitch more than
 * a tritone from every string still returns the nearest one, so check `cents` before trusting it.
 * `tolerance` (default 5 cents) decides `inTune`.
 */
export function nearestString(frequency: number, input: TuningInput = 'standard', opts: TunerOptions & { tolerance?: number } = {}): StringMatch | null {
  if (!(frequency > 0) || !Number.isFinite(frequency)) return null;
  const targets = stringTargets(input, opts);
  const heard = freqToMidi(frequency, opts.a4 ?? DEFAULT_A4);
  let best = targets[0];
  for (const t of targets) if (Math.abs(t.midi - heard) < Math.abs(best.midi - heard)) best = t;
  const cents = centsBetween(frequency, best.frequency);
  return { ...best, cents, inTune: Math.abs(cents) <= (opts.tolerance ?? 5) };
}

/** How one string changes between two tunings. */
export interface RetuneStep {
  string: number;
  index: number;
  /** Note names with octaves before and after. */
  from: string;
  to: string;
  /** Semitones to move: negative = tune down. */
  semitones: number;
}

/**
 * What to do to each string to get from one tuning to another (default: from standard). Strings
 * that stay put are included with `semitones: 0`. Both tunings must have the same number of strings.
 */
export function retuneSteps(target: TuningInput, from: TuningInput = 'standard'): RetuneStep[] {
  const a = tuning(from);
  const b = tuning(target);
  if (a.stringCount !== b.stringCount) throw new RangeError(`Cannot retune ${a.stringCount} strings to ${b.stringCount}`);
  return b.midi.map((midi, index) => ({
    string: b.stringCount - index, index, from: a.notes[index], to: b.notes[index], semitones: midi - a.midi[index],
  }));
}

/** Semitones between each pair of neighbouring strings, low to high (standard: 5 5 5 4 5). */
export function tuningIntervals(input: TuningInput = 'standard'): number[] {
  const t = tuning(input);
  return t.midi.slice(1).map((m, i) => m - t.midi[i]);
}

const STANDARD_INTERVALS = [5, 5, 5, 4, 5];

/**
 * True when the six highest strings are tuned in the intervals of standard tuning (standard itself,
 * every transposed standard, seven-string standard). Only then do the CAGED chord and scale shapes apply.
 */
export function hasStandardIntervals(input: TuningInput = 'standard'): boolean {
  const steps = tuningIntervals(input);
  if (steps.length < 5) return false;
  const top = steps.slice(steps.length - 5);
  return top.every((s, i) => s === STANDARD_INTERVALS[i]);
}

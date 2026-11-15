/**
 * Scales: the catalog with everything derived from each formula, correctly spelled notes from any
 * tonic, modes, relative and parallel scales, reverse lookup from notes, chord-scale matching,
 * comparison, and harmonisation into triads and seventh chords.
 */
import {
  chord, chordTypeFromIntervals, getChordType, type Chord, type ChordQuality, type ChordType,
} from './chord';
import {
  addIntervals, CHROMATIC_DEGREES, degreeToInterval, interval, intervalBetween, intervalToDegree, subtractIntervals, transpose,
} from './interval';
import { note, noteFromSlug, noteSlug, pcToNote, simplifyNote, spellPc, withOctaveFor } from './note';
import { romanFor } from './roman';
import { RAW_SCALES, SCALE_FAMILIES, type RawScale, type ScaleFamily } from './scale-catalog';

export { SCALE_FAMILIES };
/** Scale family ids and their display information; see `scale-catalog.ts`. */
export type { ScaleFamily, ScaleFamilyInfo } from './scale-catalog';

/** What kind of chord a scale mainly serves. */
export type ScaleQuality = 'major' | 'minor' | 'dominant' | 'diminished' | 'augmented' | 'suspended' | 'other';

/** A scale, independent of its tonic. */
export interface ScaleType {
  /** Stable, route-safe id: `major`, `dorian`, `phrygian-dominant`, `minor-pentatonic`. */
  id: string;
  name: string;
  aliases: string[];
  family: ScaleFamily;
  /** Intervals above the tonic, ascending: `['P1','M2','m3', …]`. */
  intervals: string[];
  /** Degree labels against the major scale: `['1','2','b3', …]`. */
  degrees: string[];
  /** Semitones above the tonic, ascending. */
  semitones: number[];
  /** Semitones from each note to the next, the last one closing the octave. Always sums to 12. */
  steps: number[];
  /** The same as letters: `W` whole step, `H` half step, `WH` three semitones, `2W` four. */
  stepPattern: string[];
  /** Number of notes. */
  size: number;
  /** Twelve-bit pitch-class mask relative to the tonic (bit 0 = tonic). */
  mask: number;
  /** Id of the scale this is a mode of; a family's own parent names itself. Null for scales with no listed modes. */
  parent: string | null;
  /** 1-based mode number within `parent`. */
  mode: number | null;
  /** What it sounds and feels like. */
  description: string;
  /** Where and how it is used. */
  uses: string;
  genres: string[];
  /** Ids of the chord types it is usually played over, the most typical first. */
  chords: string[];
  quality: ScaleQuality;
  /** 1 beginner … 4 expert. */
  tier: 1 | 2 | 3 | 4;
  tags: string[];
}

// ── Catalog ────────────────────────────────────────────────────────────────────────────────

const STEP_NAMES: Record<number, string> = { 1: 'H', 2: 'W', 3: 'WH', 4: '2W', 5: '2WH' };
const SIZE_TAGS: Record<number, string> = {
  5: 'pentatonic', 6: 'hexatonic', 7: 'heptatonic', 8: 'octatonic', 9: 'nonatonic', 10: 'decatonic', 12: 'chromatic',
};

/** The `mode`-th rotation (1-based) of an ascending interval list, respelled from its new tonic. */
function rotateIntervals(intervals: string[], mode: number): string[] {
  const start = mode - 1;
  return intervals.map((_unused, j) => {
    const index = (start + j) % intervals.length;
    const raised = index < start ? addIntervals(intervals[index], 'P8') : intervals[index];
    return subtractIntervals(raised, intervals[start]);
  });
}

function chordQualityToScaleQuality(q: ChordQuality): ScaleQuality {
  if (q === 'half-diminished' || q === 'diminished') return 'diminished';
  if (q === 'power' || q === 'suspended') return 'suspended';
  return q;
}

function deriveQuality(intervals: string[], chords: string[]): ScaleQuality {
  // The scale's main job is the first chord it lists; that settles cases the intervals leave
  // open (the altered scale's "third" is spelled b4, blues scales have two thirds).
  const first = chords.length ? getChordType(chords[0]) : null;
  if (first) return chordQualityToScaleQuality(first.quality);
  if (intervals.length === 12) return 'other';
  const has = (name: string) => intervals.includes(name);
  if (has('M3')) return has('m7') && !has('M7') ? 'dominant' : 'major';
  if (has('m3')) return has('d5') && !has('P5') ? 'diminished' : 'minor';
  return 'suspended';
}

function buildCatalog(): ScaleType[] {
  const rawById = new Map(RAW_SCALES.map((r) => [r.id, r]));
  const cache = new Map<string, string[]>();
  const intervalsOf = (raw: RawScale): string[] => {
    const cached = cache.get(raw.id);
    if (cached) return cached;
    let result: string[];
    if (raw.formula) {
      result = raw.formula.trim().split(/\s+/).map(degreeToInterval);
    } else {
      const parent = raw.parent ? rawById.get(raw.parent) : undefined;
      if (!parent || !raw.mode) throw new Error(`Scale "${raw.id}" has neither a formula nor a parent mode`);
      result = rotateIntervals(intervalsOf(parent), raw.mode);
    }
    cache.set(raw.id, result);
    return result;
  };

  return RAW_SCALES.map((raw) => {
    const intervals = intervalsOf(raw);
    const semitones = intervals.map((i) => interval(i).semitones);
    const steps = semitones.map((s, i) => (i + 1 < semitones.length ? semitones[i + 1] : 12) - s);
    const quality = deriveQuality(intervals, raw.chords);
    const isMode = !!raw.parent && raw.parent !== raw.id;
    const tags = [...new Set([
      ...raw.tags, raw.family, SIZE_TAGS[intervals.length] ?? `${intervals.length}-note`, quality,
      ...(isMode ? ['mode'] : []),
    ])];
    return {
      id: raw.id,
      name: raw.name,
      aliases: raw.aliases,
      family: raw.family,
      intervals,
      degrees: intervals.map(intervalToDegree),
      semitones,
      steps,
      stepPattern: steps.map((s) => STEP_NAMES[s] ?? `${s}H`),
      size: intervals.length,
      mask: semitones.reduce((mask, s) => mask | (1 << (s % 12)), 0),
      parent: raw.parent ?? null,
      mode: raw.parent ? raw.mode ?? 1 : null,
      description: raw.description,
      uses: raw.uses,
      genres: raw.genres,
      chords: raw.chords,
      quality,
      tier: raw.tier,
      tags,
    };
  });
}

/** Every scale in the catalog, grouped by family in teaching order. */
export const SCALES: readonly ScaleType[] = buildCatalog();

function lookupKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/♯/g, '#').replace(/♭/g, 'b').replace(/♮/g, 'natural ')
    .replace(/[()’'.]/g, ' ')
    .replace(/[\s_-]+/g, ' ')
    .trim()
    .replace(/ (scale|mode)$/, '');
}

const SCALES_BY_ID = new Map(SCALES.map((s) => [s.id, s]));
const SCALES_BY_NAME = new Map<string, ScaleType>();
for (const s of SCALES) {
  for (const name of [s.id, s.name, ...s.aliases]) {
    const key = lookupKey(name);
    if (!SCALES_BY_NAME.has(key)) SCALES_BY_NAME.set(key, s);
  }
}
const SCALES_BY_INTERVALS = new Map(SCALES.map((s) => [s.intervals.join(' '), s]));
const SCALES_BY_MASK = new Map<number, ScaleType>();
for (const s of SCALES) if (!SCALES_BY_MASK.has(s.mask)) SCALES_BY_MASK.set(s.mask, s);

/** Look a scale up by id, name or alias, ignoring case and punctuation (`dorian`, `Natural Minor`, `super locrian`, `Ukrainian Dorian`). */
export function getScale(query: string | ScaleType): ScaleType | null {
  if (typeof query !== 'string') return query;
  return SCALES_BY_ID.get(query) ?? SCALES_BY_NAME.get(lookupKey(query)) ?? null;
}

function requireScale(query: string | ScaleType): ScaleType {
  const found = getScale(query);
  if (!found) throw new RangeError(`Unknown scale: "${String(query)}"`);
  return found;
}

/** Filter for `filterScales`. Every given criterion must match. */
export interface ScaleFilter {
  family?: ScaleFamily | ScaleFamily[];
  quality?: ScaleQuality | ScaleQuality[];
  tier?: number;
  maxTier?: number;
  /** Number of notes. */
  size?: number | number[];
  /** Every listed tag must be present. */
  tags?: string[];
  /** Only scales that list this chord type id among the chords they are played over. */
  chord?: string;
  /** Only modes (`true`) or only non-modes (`false`). */
  isMode?: boolean;
}

function oneOf<T>(want: T | T[] | undefined, value: T): boolean {
  if (want === undefined) return true;
  return Array.isArray(want) ? want.includes(value) : want === value;
}

/** Catalog scales matching every given criterion, in catalog order. */
export function filterScales(filter: ScaleFilter = {}): ScaleType[] {
  return SCALES.filter(
    (s) =>
      oneOf(filter.family, s.family) &&
      oneOf(filter.quality, s.quality) &&
      oneOf(filter.size, s.size) &&
      (filter.tier === undefined || s.tier === filter.tier) &&
      (filter.maxTier === undefined || s.tier <= filter.maxTier) &&
      (filter.tags === undefined || filter.tags.every((t) => s.tags.includes(t))) &&
      (filter.chord === undefined || s.chords.includes(filter.chord)) &&
      (filter.isMode === undefined || s.tags.includes('mode') === filter.isMode),
  );
}

/** Free-text search over names, aliases, tags, genres and descriptions; best matches first. */
export function searchScales(query: string): ScaleType[] {
  const q = lookupKey(query);
  if (!q) return [...SCALES];
  const scored: Array<{ scale: ScaleType; score: number; index: number }> = [];
  SCALES.forEach((scale, index) => {
    const names = [scale.name, scale.id, ...scale.aliases].map(lookupKey);
    let score = 0;
    if (names[0] === q || names[1] === q) score = 100;
    else if (names.includes(q)) score = 90;
    else if (names[0].startsWith(q)) score = 70;
    else if (names.some((n) => n.startsWith(q))) score = 60;
    else if (names[0].includes(q)) score = 50;
    else if (names.some((n) => n.includes(q))) score = 40;
    else if ([...scale.tags, ...scale.genres].some((t) => lookupKey(t) === q)) score = 25;
    else if ([...scale.tags, ...scale.genres].some((t) => lookupKey(t).includes(q))) score = 20;
    else if (`${scale.description} ${scale.uses}`.toLowerCase().includes(q)) score = 5;
    if (score > 0) scored.push({ scale, score, index });
  });
  return scored.sort((a, b) => b.score - a.score || a.scale.tier - b.scale.tier || a.index - b.index).map((s) => s.scale);
}

// ── Notes of a scale ───────────────────────────────────────────────────────────────────────

/** True when a scale has seven notes on seven different degrees, so each letter is used once. */
function isLetterScale(type: ScaleType): boolean {
  return type.size === 7 && new Set(type.intervals.map((i) => interval(i).number)).size === 7;
}

/** Options for `scaleNotes`. */
export interface ScaleNotesOptions {
  /** Append the tonic an octave higher. */
  closed?: boolean;
}

/**
 * The notes of a scale from any tonic, correctly spelled: `scaleNotes('F#', 'major')` ends on
 * `E#`, `scaleNotes('G#', 'harmonic-minor')` contains `F##`. Seven-note scales use every letter
 * once. Other scales keep the spelling of their degrees but lose double accidentals, and
 * symmetric scales also lose E#/B#/Cb/Fb, which is how they are conventionally written.
 * A tonic with an octave (`E2`) gives ascending notes with octaves.
 */
export function scaleNotes(tonic: string, scale: string | ScaleType = 'major', opts: ScaleNotesOptions = {}): string[] {
  const type = requireScale(scale);
  const root = note(tonic);
  let notes = type.intervals.map((i) => transpose(root.name, i));
  if (!isLetterScale(type)) {
    const symmetric = type.family === 'symmetric';
    notes = notes.map((name, index) => {
      if (index === 0) return name;
      const n = note(name);
      const whiteKeyAlias = n.alt !== 0 && [0, 2, 4, 5, 7, 9, 11].includes(n.chroma);
      return Math.abs(n.alt) >= 2 || (symmetric && whiteKeyAlias) ? simplifyNote(name) : name;
    });
  }
  if (opts.closed) notes.push(transpose(root.name, 'P8'));
  return notes;
}

/** Pitch classes (0–11) of a scale from a tonic, in scale order. */
export function scalePcs(tonic: string | number, scale: string | ScaleType = 'major'): number[] {
  const type = requireScale(scale);
  const rootPc = typeof tonic === 'number' ? ((Math.round(tonic) % 12) + 12) % 12 : note(tonic).chroma;
  return type.semitones.map((s) => (rootPc + s) % 12);
}

/** MIDI numbers of a scale starting on `tonicMidi`, over `octaves` octaves, ending on the top tonic. */
export function scaleMidi(tonicMidi: number, scale: string | ScaleType = 'major', octaves = 1): number[] {
  const type = requireScale(scale);
  const out: number[] = [];
  for (let o = 0; o < octaves; o++) for (const s of type.semitones) out.push(tonicMidi + 12 * o + s);
  out.push(tonicMidi + 12 * octaves);
  return out;
}

/** True when the note (name or MIDI number) belongs to the scale on that tonic. */
export function scaleContains(tonic: string, scale: string | ScaleType, candidate: string | number): boolean {
  const pc = typeof candidate === 'number' ? ((Math.round(candidate) % 12) + 12) % 12 : note(candidate).chroma;
  return scalePcs(tonic, scale).includes(pc);
}

/**
 * The degree label a note has in a scale (`degreeInScale('A', 'major', 'C#')` -> `3`), or the
 * chromatic degree against the tonic when the note is outside the scale and `chromatic` is set.
 */
export function degreeInScale(tonic: string, scale: string | ScaleType, candidate: string | number, opts: { chromatic?: boolean } = {}): string | null {
  const type = requireScale(scale);
  const rootPc = note(tonic).chroma;
  const pc = typeof candidate === 'number' ? ((Math.round(candidate) % 12) + 12) % 12 : note(candidate).chroma;
  const offset = (pc - rootPc + 12) % 12;
  const index = type.semitones.findIndex((s) => s % 12 === offset);
  if (index >= 0) return type.degrees[index];
  if (!opts.chromatic) return null;
  // By size, not by the displayed name: the b2 of Ab major is shown as A (not Bbb) and is still b2.
  return CHROMATIC_DEGREES[offset];
}

/**
 * Spell a pitch class in the context of a scale: scale notes get the scale's own spelling, and
 * outside notes the conventional chromatic spelling against the tonic (`b2 b3 #4 b6 b7`).
 */
export function spellInScale(tonic: string, scale: string | ScaleType, pc: number): string {
  const type = requireScale(scale);
  const root = note(tonic);
  const target = ((Math.round(pc) % 12) + 12) % 12;
  const notes = scaleNotes(root.pcName, type);
  const inScale = notes.find((n) => note(n).chroma === target);
  if (inScale) return inScale;
  const name = spellPc(target, root.fifths);
  return Math.abs(note(name).alt) >= 2 ? simplifyNote(name) : name;
}

/** Route-safe id for a scale on a tonic: (`F#`, `dorian`) -> `f-sharp-dorian`, (`A`, `minor`) -> `a-minor`. */
export function scaleSlug(tonic: string, scale: string | ScaleType): string {
  return `${noteSlug(note(tonic).pcName)}-${requireScale(scale).id}`;
}

/** Inverse of `scaleSlug`: `bb-major-pentatonic` -> B flat, major pentatonic. Null when the slug names no scale. */
export function parseScaleSlug(slug: string): TonicScale | null {
  const m = /^([a-g](?:-sharp|-flat|b)*)-(.+)$/.exec(slug.trim().toLowerCase());
  if (!m) return null;
  const tonic = noteFromSlug(m[1]);
  const scale = SCALES_BY_ID.get(m[2]);
  return tonic && scale ? { tonic, scale } : null;
}

const WHITE_KEY_PCS = [0, 2, 4, 5, 7, 9, 11];

/** How awkward a scale reads from a tonic: any triple accidental first, then the accidentals counted, then E#/B#/Cb/Fb. */
function spellingCost(tonic: string, type: ScaleType): number {
  let triple = 0;
  let total = 0;
  let aliases = 0;
  for (const name of scaleNotes(tonic, type)) {
    const n = note(name);
    const size = Math.abs(n.alt);
    if (size >= 3) triple++;
    total += size;
    if (size === 1 && WHITE_KEY_PCS.includes(n.chroma)) aliases++;
  }
  return triple * 10000 + total * 100 + aliases * 10 + Math.abs(note(tonic).alt);
}

/**
 * The spelling of a tonic that writes a scale most simply: the fewest accidentals, and never a
 * triple one. `simplestTonic('A#', 'major')` -> `Bb`; `simplestTonic('Gb', 'locrian-bb3-bb7')`
 * -> `F#`; `simplestTonic(8, 'minor')` -> `G#`; `simplestTonic(1, 'major')` -> `Db`. A named
 * tonic is kept when nothing beats it (`F#` major and `Gb` major both stay); a pitch class takes
 * the commoner name on a tie. An octave on the tonic is carried over to the same pitch.
 *
 * `scaleNotes` itself never respells the tonic you give it: B# Lydian augmented really does
 * contain F###. Call this first when the tonic is the app's choice rather than the user's.
 */
export function simplestTonic(tonic: string | number, scale: string | ScaleType = 'major'): string {
  const type = requireScale(scale);
  const given = typeof tonic === 'string' ? note(tonic) : null;
  const pc = given ? given.chroma : ((Math.round(tonic as number) % 12) + 12) % 12;
  const candidates = new Set<string>();
  if (given) candidates.add(given.pcName);
  candidates.add(pcToNote(pc, 'auto'));
  candidates.add(pcToNote(pc, 'sharps'));
  candidates.add(pcToNote(pc, 'flats'));
  let best = '';
  let bestCost = Infinity;
  // Insertion order breaks ties: the given name first, then the commoner one.
  for (const candidate of candidates) {
    const cost = spellingCost(candidate, type);
    if (cost < bestCost) {
      best = candidate;
      bestCost = cost;
    }
  }
  return given && given.midi !== null ? withOctaveFor(best, given.midi) : best;
}

/**
 * True when a chord is built in the scale: every chord tone is a scale note **and** sits on the
 * scale step its interval asks for (a third two steps above the root, a fifth four, a ninth one).
 * Sound alone is not enough: F–Ab–C has the pitches of A harmonic minor (Ab sounds like G#), but
 * it is not a chord of that scale. `scaleNoteNames` is a seven-note scale as spelled notes; for
 * other sizes the test falls back to "all the chord's pitches are in the scale".
 */
export function chordFitsScale(input: string | Chord, scaleNoteNames: readonly string[]): boolean {
  const c = chord(input);
  const pcs = scaleNoteNames.map((n) => note(n).chroma);
  const rootIndex = pcs.indexOf(note(c.root).chroma);
  if (rootIndex < 0) return false;
  if (pcs.length !== 7) return c.notes.every((n) => pcs.includes(note(n).chroma));
  return c.type.intervals.every((name, i) => {
    const steps = interval(name).steps;
    return pcs[(rootIndex + steps) % 7] === note(c.notes[i]).chroma;
  });
}

// ── Modes and relationships ────────────────────────────────────────────────────────────────

const MODE_RESPELL: Record<string, string> = { A1: 'm2', AA1: 'M2', d8: 'M7', dd8: 'm7' };
const PLAIN_INTERVALS = ['P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'A4', 'P5', 'm6', 'M6', 'm7', 'M7'];

/** The everyday name for a size in semitones; the tritone becomes d5 when A4 is already taken. */
function plainInterval(semitones: number, taken: string[]): string {
  const name = PLAIN_INTERVALS[((semitones % 12) + 12) % 12];
  return name === 'A4' && taken.includes('A4') ? 'd5' : name;
}

/** One rotation of a scale. */
export interface ScaleMode {
  /** 1-based mode number: 1 is the scale itself. */
  mode: number;
  intervals: string[];
  degrees: string[];
  /** The catalog scale with these notes, when there is one. */
  scale: ScaleType | null;
}

function findByIntervals(intervals: string[]): ScaleType | null {
  const exact = SCALES_BY_INTERVALS.get(intervals.join(' '));
  if (exact) return exact;
  const mask = intervals.reduce((m, i) => m | (1 << (((interval(i).semitones % 12) + 12) % 12)), 0);
  return SCALES_BY_MASK.get(mask) ?? null;
}

/** Every rotation of a scale, with the catalog scale each one is (Dorian is mode 2 of major). */
export function scaleModes(scale: string | ScaleType): ScaleMode[] {
  const type = requireScale(scale);
  return type.intervals.map((_unused, index) => {
    // Rotating a scale that uses one letter twice (b3 and 3, 4 and b5) can land two notes on the
    // tonic's own letter. Nobody reads "#1" or "b8" as scale degrees, so those become b2 and 7.
    const rotated = rotateIntervals(type.intervals, index + 1).map((i) => MODE_RESPELL[i] ?? i);
    const found = findByIntervals(rotated);
    // A mode the catalog knows is shown the way the catalog spells it (the second mode of the
    // six-tone symmetric scale is the augmented scale, b3 and all, not "1 #2 3 ##4 #5 7").
    // An unnamed rotation keeps its letters unless that would take a doubly altered degree.
    const intervals = found ? [...found.intervals] : rotated.map((i) => (/^(AA|dd)/.test(i) ? plainInterval(interval(i).semitones, rotated) : i));
    return { mode: index + 1, intervals, degrees: intervals.map(intervalToDegree), scale: found };
  });
}

/** A scale on a particular tonic. */
export interface TonicScale {
  tonic: string;
  scale: ScaleType;
}

/**
 * Scales that use exactly the same notes from a different tonic: the relative modes.
 * `relativeScales('C', 'major')` -> D Dorian, E Phrygian, … A natural minor, B Locrian.
 */
export function relativeScales(tonic: string, scale: string | ScaleType): TonicScale[] {
  const type = requireScale(scale);
  const notes = scaleNotes(note(tonic).pcName, type);
  const seen = new Set<string>();
  const out: TonicScale[] = [];
  scaleModes(type).forEach((m, index) => {
    if (index === 0 || !m.scale) return;
    const key = `${note(notes[index]).chroma}:${m.scale.id}`;
    if (seen.has(key) || (m.scale.id === type.id && note(notes[index]).chroma === note(tonic).chroma)) return;
    seen.add(key);
    out.push({ tonic: notes[index], scale: m.scale });
  });
  return out;
}

/**
 * Scales from the same family of modes on the same tonic: the parallel modes.
 * `parallelScales('C', 'major')` -> C Dorian, C Phrygian, … C Locrian.
 */
export function parallelScales(tonic: string, scale: string | ScaleType): TonicScale[] {
  const type = requireScale(scale);
  const root = note(tonic).pcName;
  const seen = new Set<string>([type.id]);
  const out: TonicScale[] = [];
  for (const m of scaleModes(type)) {
    if (!m.scale || seen.has(m.scale.id)) continue;
    seen.add(m.scale.id);
    out.push({ tonic: root, scale: m.scale });
  }
  return out;
}

// ── Reverse lookup ─────────────────────────────────────────────────────────────────────────

/** A scale that contains a given set of notes. */
export interface ScaleMatch extends TonicScale {
  /** Spelled notes of the scale. */
  notes: string[];
  /** How many scale notes are not in the input: 0 means the notes are exactly the scale. */
  extra: number;
}

/** Options for `scalesContaining`. */
export interface ScalesContainingOptions {
  /** Only scales on this tonic. */
  tonic?: string;
  /** Only scales whose notes are exactly the given notes. */
  exact?: boolean;
  maxTier?: number;
  family?: ScaleFamily | ScaleFamily[];
  size?: number | number[];
  /** Include the chromatic scale, which contains everything (default false). */
  chromatic?: boolean;
  limit?: number;
}

function maskOf(pcs: Iterable<number>): number {
  let mask = 0;
  for (const pc of pcs) mask |= 1 << (((Math.round(pc) % 12) + 12) % 12);
  return mask;
}

function rotateMask(mask: number, by: number): number {
  const shift = ((by % 12) + 12) % 12;
  return ((mask << shift) | (mask >> (12 - shift))) & 0xfff;
}

/**
 * Every scale, on every tonic, that contains all the given notes (names or MIDI numbers), best
 * fit first: fewest extra notes, then the simpler scale. A tonic that is among the given notes
 * keeps the spelling it was given.
 */
export function scalesContaining(input: Array<string | number>, opts: ScalesContainingOptions = {}): ScaleMatch[] {
  const given = new Map<number, string>();
  const pcs: number[] = [];
  for (const item of input) {
    if (typeof item === 'number') {
      pcs.push(((Math.round(item) % 12) + 12) % 12);
    } else {
      const n = note(item);
      pcs.push(n.chroma);
      if (!given.has(n.chroma)) given.set(n.chroma, n.pcName);
    }
  }
  const wanted = maskOf(pcs);
  const count = new Set(pcs).size;
  const fixedTonic = opts.tonic ? note(opts.tonic) : null;
  const out: Array<ScaleMatch & { order: number }> = [];
  SCALES.forEach((scale, order) => {
    if (scale.size === 12 && !opts.chromatic) return;
    if (!oneOf(opts.family, scale.family) || !oneOf(opts.size, scale.size)) return;
    if (opts.maxTier !== undefined && scale.tier > opts.maxTier) return;
    for (let tonicPc = 0; tonicPc < 12; tonicPc++) {
      if (fixedTonic && fixedTonic.chroma !== tonicPc) continue;
      const mask = rotateMask(scale.mask, tonicPc);
      if ((mask & wanted) !== wanted) continue;
      const extra = scale.size - count;
      if (opts.exact && extra !== 0) continue;
      const tonic = fixedTonic?.pcName ?? given.get(tonicPc) ?? pcToNote(tonicPc);
      out.push({ tonic, scale, notes: scaleNotes(tonic, scale), extra, order });
    }
  });
  out.sort((a, b) => a.extra - b.extra || a.scale.tier - b.scale.tier || a.order - b.order);
  return out.slice(0, opts.limit ?? out.length).map(({ order: _order, ...match }) => match);
}

// ── Chord-scale theory ─────────────────────────────────────────────────────────────────────

/** A scale that can be played over a chord. */
export interface ChordScaleMatch extends TonicScale {
  notes: string[];
  /** Higher fits better. Comparable only within one result list. */
  score: number;
  /**
   * `primary`: a usual choice for this chord that contains its tones (it may alter the perfect
   * fifth). `compatible`: it contains the whole chord but is not a usual choice. `colour`: a usual
   * choice that deliberately clashes with a chord tone (minor pentatonic over a dominant seventh).
   */
  fit: 'primary' | 'compatible' | 'colour';
  /** Scale notes a half step above a chord tone: play them as passing notes, do not sit on them. */
  avoid: string[];
  /** Scale notes that are not chord tones and are safe to lean on, as degree labels (`9`, `#11`, `13`). */
  tensions: string[];
  /** Chord tones the scale does not contain: the clash of a `colour` choice, or an altered fifth. */
  missing: string[];
}

/** Options for `scalesForChord`. */
export interface ScalesForChordOptions {
  maxTier?: number;
  limit?: number;
  /** Leave out `colour` matches (blues scales over dominant chords and the like). */
  strict?: boolean;
}

const SIZE_BONUS: Record<number, number> = { 5: 5, 6: 4, 7: 6, 8: 4 };
const TENSION_NAMES: Record<number, string> = {
  1: 'b9', 2: '9', 3: '#9', 4: '3', 5: '11', 6: '#11', 7: '5', 8: 'b13', 9: '13', 10: 'b7', 11: '7',
};

/**
 * Chord-scale theory: the scales that fit a chord, built on the chord's root and ranked.
 *
 * A scale qualifies when it contains every chord tone, or when it lists the chord among its usual
 * partners. In the second case it may leave out the chord's perfect fifth (the altered scale over
 * 7#9) and still be `primary`; if it lacks a more important tone it is a `colour` choice (minor
 * blues over a dominant seventh). Ranking prefers listed scales, penalises avoid notes (more
 * heavily on seventh chords, where they matter more), and prefers the simpler scale.
 */
export function scalesForChord(input: string | Chord, opts: ScalesForChordOptions = {}): ChordScaleMatch[] {
  const c = chord(input);
  const root = note(c.root);
  const chordOffsets = [...new Set(c.type.semitones.map((s) => s % 12))];
  const chordMask = maskOf(chordOffsets);
  // A perfect fifth is the first note a voicing drops, so a listed scale may alter it.
  const fifthIsOptional = c.type.intervals.length >= 4 && c.type.intervals.includes('P5');
  const essentialMask = fifthIsOptional ? chordMask & ~(1 << 7) : chordMask;
  const dominant = c.type.quality === 'dominant';
  const avoidWeight = c.type.intervals.length >= 4 ? 4 : 2;
  const out: Array<ChordScaleMatch & { order: number }> = [];
  SCALES.forEach((scale, order) => {
    if (scale.size === 12) return;
    if (opts.maxTier !== undefined && scale.tier > opts.maxTier) return;
    const containsAll = (scale.mask & chordMask) === chordMask;
    const containsEssential = (scale.mask & essentialMask) === essentialMask;
    const listed = scale.chords.includes(c.type.id);
    if (!containsAll && !listed) return;
    const fit: ChordScaleMatch['fit'] = !listed ? 'compatible' : containsEssential ? 'primary' : 'colour';
    if (fit === 'colour' && opts.strict) return;
    const notes = scaleNotes(root.pcName, scale);
    const avoid: string[] = [];
    const tensions: string[] = [];
    scale.semitones.forEach((semi, index) => {
      const offset = semi % 12;
      if (chordOffsets.includes(offset)) return;
      const below = (offset + 11) % 12;
      // On a dominant chord the notes a half step above root and fifth are the b9 and b13: tensions, not clashes.
      const clash = chordOffsets.includes(below) && !(dominant && (below === 0 || below === 7));
      if (clash) avoid.push(notes[index]);
      else tensions.push(TENSION_NAMES[offset] ?? scale.degrees[index]);
    });
    const missing = c.notes.filter((_n, i) => (scale.mask & (1 << (c.type.semitones[i] % 12))) === 0);
    const missingEssential = missing.length - (fifthIsOptional && (scale.mask & (1 << 7)) === 0 ? 1 : 0);
    let score = fit === 'primary' ? 70 : fit === 'compatible' ? 50 : 55 - 8 * missingEssential;
    score -= avoidWeight * avoid.length + 4 * (scale.tier - 1);
    score += SIZE_BONUS[scale.size] ?? 0;
    out.push({ tonic: root.pcName, scale, notes, score, fit, avoid, tensions, missing, order });
  });
  out.sort((a, b) => b.score - a.score || a.order - b.order);
  return out.slice(0, opts.limit ?? out.length).map(({ order: _order, ...match }) => match);
}

// ── Comparison ─────────────────────────────────────────────────────────────────────────────

/** How two scales differ. */
export interface ScaleComparison {
  a: ScaleType;
  b: ScaleType;
  /** Degrees present in both, as labels from `a`. */
  shared: string[];
  /** Degrees only in `a` / only in `b`. */
  onlyA: string[];
  onlyB: string[];
  /** Degree numbers that both scales have but tune differently: `{ number: 6, a: 'b6', b: '6' }`. */
  changes: Array<{ number: number; a: string; b: string }>;
  /** Plain-language summary: `Dorian is Natural minor with a raised 6th.` */
  summary: string;
}

function ordinalWord(n: number): string {
  return ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][n] ?? `${n}th`;
}

/** Compare two scales degree by degree (`compareScales('minor', 'dorian')` -> the 6th is raised). */
export function compareScales(a: string | ScaleType, b: string | ScaleType): ScaleComparison {
  const x = requireScale(a);
  const y = requireScale(b);
  const numberOf = (label: string) => parseInt(label.replace(/[b#]/g, ''), 10);
  const changes: ScaleComparison['changes'] = [];
  let shared: string[];
  let onlyA: string[];
  let onlyB: string[];
  if (isLetterScale(x) && isLetterScale(y)) {
    // Two seven-note scales line up degree for degree, so every difference is a raised or lowered
    // degree. (Comparing by sound would call the altered scale's b4 "the major third".)
    shared = x.degrees.filter((d, i) => d === y.degrees[i]);
    x.degrees.forEach((d, i) => {
      if (d !== y.degrees[i]) changes.push({ number: i + 1, a: d, b: y.degrees[i] });
    });
    onlyA = [];
    onlyB = [];
  } else {
    shared = x.degrees.filter((_d, i) => (y.mask & (1 << (x.semitones[i] % 12))) !== 0);
    const onlyAAll = x.degrees.filter((_d, i) => (y.mask & (1 << (x.semitones[i] % 12))) === 0);
    const onlyBAll = y.degrees.filter((_d, i) => (x.mask & (1 << (y.semitones[i] % 12))) === 0);
    const usedA = new Set<string>();
    const usedB = new Set<string>();
    for (const da of onlyAAll) {
      const sameNumberA = onlyAAll.filter((d) => numberOf(d) === numberOf(da));
      const sameNumberB = onlyBAll.filter((d) => numberOf(d) === numberOf(da));
      if (sameNumberA.length === 1 && sameNumberB.length === 1) {
        changes.push({ number: numberOf(da), a: da, b: sameNumberB[0] });
        usedA.add(da);
        usedB.add(sameNumberB[0]);
      }
    }
    onlyA = onlyAAll.filter((d) => !usedA.has(d));
    onlyB = onlyBAll.filter((d) => !usedB.has(d));
  }
  const parts: string[] = [];
  for (const change of changes) {
    const raised = interval(degreeToInterval(change.b)).semitones > interval(degreeToInterval(change.a)).semitones;
    parts.push(`a ${raised ? 'raised' : 'lowered'} ${ordinalWord(change.number)}`);
  }
  if (onlyB.length) parts.push(`an added ${onlyB.join(', ')}`);
  if (onlyA.length) parts.push(`no ${onlyA.join(', ')}`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  const summary = parts.length === 0 ? `${y.name} has the same notes as ${x.name}.` : `${y.name} is ${x.name} with ${list}.`;
  return { a: x, b: y, shared, onlyA, onlyB, changes, summary };
}

/** Options for `similarScales`. */
export interface SimilarScalesOptions {
  /** Maximum number of results (default 6). */
  limit?: number;
  maxTier?: number;
  /** Only scales with the same number of notes (default false: one note more or fewer also counts). */
  sameSize?: boolean;
}

/**
 * The catalog scales closest to a scale on the same tonic, nearest first: those that differ by
 * the fewest notes. `similarScales('dorian')` starts with natural minor, Mixolydian, melodic
 * minor … Made for "which scale is this?" questions, where the near misses are the good wrong answers.
 */
export function similarScales(scale: string | ScaleType, opts: SimilarScalesOptions = {}): ScaleType[] {
  const type = requireScale(scale);
  const bits = (n: number) => {
    let count = 0;
    for (let v = n; v; v &= v - 1) count++;
    return count;
  };
  const ranked: Array<{ scale: ScaleType; distance: number; order: number }> = [];
  SCALES.forEach((other, order) => {
    if (other.id === type.id || other.mask === type.mask || other.size === 12) return;
    if (opts.maxTier !== undefined && other.tier > opts.maxTier) return;
    if (opts.sameSize && other.size !== type.size) return;
    const distance = bits(other.mask ^ type.mask);
    if (distance <= 4) ranked.push({ scale: other, distance, order });
  });
  ranked.sort((p, q) => p.distance - q.distance || Math.abs(p.scale.tier - type.tier) - Math.abs(q.scale.tier - type.tier) || p.scale.tier - q.scale.tier || p.order - q.order);
  return ranked.slice(0, opts.limit ?? 6).map((r) => r.scale);
}

// ── Harmonisation ──────────────────────────────────────────────────────────────────────────

/** A chord built on one degree of a scale. */
export interface ScaleChord {
  /** 1-based degree of the scale the chord is built on. */
  degree: number;
  /** Degree label of the root against the major scale (`b3`). */
  degreeLabel: string;
  /** Roman numeral, with accidentals against the major scale: `bIII`, `ii°`, `V7`. */
  roman: string;
  root: string;
  /** Chord symbol: `Dm7`. */
  symbol: string;
  type: ChordType;
  notes: string[];
}

/** Options for `harmonizeScale`. */
export interface HarmonizeOptions {
  /** Build four-note seventh chords instead of triads. */
  sevenths?: boolean;
}

/**
 * Harmonise a seven-note scale by stacking thirds on every degree.
 * `harmonizeScale('C', 'major')` -> C Dm Em F G Am Bdim (I ii iii IV V vi vii°);
 * with `{ sevenths: true }` -> Cmaj7 Dm7 Em7 Fmaj7 G7 Am7 Bm7b5.
 */
export function harmonizeScale(tonic: string, scale: string | ScaleType = 'major', opts: HarmonizeOptions = {}): ScaleChord[] {
  const type = requireScale(scale);
  if (!isLetterScale(type)) throw new RangeError(`Only seven-note scales can be harmonised in thirds: "${type.id}"`);
  const notes = scaleNotes(note(tonic).pcName, type);
  const size = opts.sevenths ? 4 : 3;
  return notes.map((root, index) => {
    const tones = Array.from({ length: size }, (_unused, k) => notes[(index + 2 * k) % 7]);
    const chordType = chordTypeFromIntervals(tones.map((t) => intervalBetween(root, t)));
    return {
      degree: index + 1,
      degreeLabel: type.degrees[index],
      roman: romanFor(type.degrees[index], chordType),
      root,
      symbol: `${root}${chordType.symbol}`,
      type: chordType,
      notes: tones,
    };
  });
}

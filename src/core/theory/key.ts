/**
 * Keys: signatures, scales, diatonic chords with harmonic function, relatives and neighbours,
 * circle-of-fifths data, spelling in a key, and key detection.
 *
 * Everything follows from one number: the key's position on the line of fifths (C major = 0,
 * one step sharpward per sharp, flatward per flat; a minor key sits three steps sharpward of its
 * signature). The fifteen major and fifteen minor keys are the positions -7 … +7; keys beyond
 * that (G# major, eight sharps) still work and are marked `theoretical`.
 *
 * A key may also be in one of the other modes of the major scale (A Dorian, E Phrygian). Its
 * signature is that of the parent major scale (A Dorian: one sharp, as G major), its scale is the
 * mode, and its relative is the parent major key. Ionian is major and Aeolian is minor.
 */
import { chord, parseChord, type Chord } from './chord';
import { degreeToInterval, intervalBetween, intervalToDegree, transpose } from './interval';
import { fifthsOf, note, noteFromFifths, noteFromSlug, noteSlug, parseNote, simplifyNote, spellPc, withOctaveFor } from './note';
import { chordFitsScale, harmonizeScale, scaleNotes, type ScaleChord } from './scale';

/**
 * Major or minor. A key in one of the other modes says which in `modal`; its `mode` is `minor`,
 * because like a minor key it is written with the signature of another key (its relative major).
 * `mode === 'major'` therefore always means "the tonic's own major scale gives the signature".
 */
export type KeyMode = 'major' | 'minor';
/** The five modes of the major scale other than major (Ionian) and minor (Aeolian). */
export type ModalMode = 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'locrian';
/** Any of the seven modes a key can be in. */
export type KeyModeName = KeyMode | ModalMode;

/** The seven key modes, brightest first (Lydian … Locrian), the order the modes are usually taught by colour. */
export const KEY_MODE_NAMES: readonly KeyModeName[] = ['lydian', 'major', 'mixolydian', 'dorian', 'minor', 'phrygian', 'locrian'];
/** The five modes other than major and minor. */
export const MODAL_MODES: readonly ModalMode[] = ['dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian'];

// Steps on the line of fifths from the parent major tonic up to the mode's tonic (G major -> A Dorian: 2).
const MODE_OFFSET: Readonly<Record<KeyModeName, number>> = { lydian: -1, major: 0, mixolydian: 1, dorian: 2, minor: 3, phrygian: 4, locrian: 5 };
// The scale id of each mode in the scale catalogue.
const MODE_SCALE: Readonly<Record<KeyModeName, string>> = {
  major: 'major', minor: 'minor', dorian: 'dorian', phrygian: 'phrygian', lydian: 'lydian', mixolydian: 'mixolydian', locrian: 'locrian',
};

/** The quality of a mode's third: `modeQuality('dorian')` -> `minor`, `modeQuality('mixolydian')` -> `major`. */
export function modeQuality(mode: KeyModeName): KeyMode {
  return mode === 'major' || mode === 'lydian' || mode === 'mixolydian' ? 'major' : 'minor';
}

/** The full mode of a key or key reference: its `modal` mode when it has one, else major or minor. */
export function keyModeName(input: { mode: KeyMode; modal?: ModalMode }): KeyModeName {
  return input.modal ?? input.mode;
}

/** True for a key in one of the five modes other than major and minor (A Dorian, E Phrygian). */
export function isModalKey(input: { modal?: ModalMode }): boolean {
  return input.modal !== undefined;
}

/** The three jobs a chord can do in a key. */
export type HarmonicFunction = 'tonic' | 'subdominant' | 'dominant';
/** The three forms of the minor scale. */
export type MinorVariant = 'natural' | 'harmonic' | 'melodic';

/** A key signature. */
export interface KeySignature {
  /** Sharps as a positive number, flats as a negative one: -7 … 7 for the standard keys. */
  fifths: number;
  type: 'sharps' | 'flats' | 'none';
  /** How many sharps or flats. */
  count: number;
  /** The altered notes in the order they are written on the staff: `['F#','C#']`, `['Bb','Eb','Ab']`. */
  accidentals: string[];
}

/** A key: major, minor, or one of the other modes of the major scale. */
export interface Key {
  /** Route-safe id matching the router's `slug()` of the name: `c-major`, `f-sharp-minor`, `bb-major`, `a-dorian`. */
  id: string;
  /** `F# minor`, `A dorian`. */
  name: string;
  /** Chord-style short name: `F#m`, `C`; a modal key has none and repeats its name (`A dorian`). */
  short: string;
  tonic: string;
  /** `major` for a major key; `minor` for a minor key and for a modal one (see `KeyMode`). */
  mode: KeyMode;
  /** The mode, for a key in one of the five other modes (A Dorian: `dorian`); absent for major and minor keys. */
  modal?: ModalMode;
  /** Position of the signature on the line of fifths (same as `signature.fifths`); a mode takes its parent major's. */
  fifths: number;
  signature: KeySignature;
  /** The major scale, the natural minor scale for a minor key, or the mode (A Dorian: A B C D E F# G). */
  scale: string[];
  /** Harmonic minor (raised seventh); null for major and modal keys. */
  harmonicMinor: string[] | null;
  /** Melodic minor, ascending form (raised sixth and seventh); null for major and modal keys. */
  melodicMinor: string[] | null;
  /** Name of the relative key (same signature); for a modal key, the parent major (A Dorian -> `G major`). */
  relative: string;
  /** Name of the parallel key (same tonic, the other of major and minor); for a modal key, major or minor by its third (A Dorian -> `A minor`). */
  parallel: string;
  /** True for keys with more than seven sharps or flats, which exist only on paper. */
  theoretical: boolean;
}

/** A key given as its parts. A modal key is `{ tonic: 'A', mode: 'minor', modal: 'dorian' }` (`modal` wins over `mode`). */
export interface KeyRef {
  tonic: string;
  mode: KeyMode;
  modal?: ModalMode;
}

/** Anything that names a key: `'A minor'`, `'F#m'`, `'bb-major'`, `'A Dorian'`, a `{ tonic, mode, modal? }` pair or a `Key`. */
export type KeyInput = string | KeyRef | Key;

// Sharps arrive in fifths order F C G D A E B; flats in the reverse order.
const SHARP_ORDER = Array.from({ length: 7 }, (_unused, i) => noteFromFifths(i - 1));
const FLAT_ORDER = [...SHARP_ORDER].reverse();

/** The key signature with the given number of sharps (positive) or flats (negative). */
export function keySignature(fifths: number): KeySignature {
  const count = Math.abs(fifths);
  const order = fifths >= 0 ? SHARP_ORDER : FLAT_ORDER;
  const sign = fifths >= 0 ? '#' : 'b';
  const accidentals: string[] = [];
  order.forEach((letter, index) => {
    // Past seven the cycle starts again and the first letters become double sharps or flats.
    const times = count > index ? Math.ceil((count - index) / 7) : 0;
    if (times > 0) accidentals.push(`${letter}${sign.repeat(times)}`);
  });
  return { fifths, type: fifths > 0 ? 'sharps' : fifths < 0 ? 'flats' : 'none', count, accidentals };
}

const KEY_SLUG_RE = /^([a-g](?:-sharp|-flat|b)*)-(major|minor|dorian|phrygian|lydian|mixolydian|locrian)$/;
const MINOR_WORDS = new Set(['m', 'min', 'mi', 'minor', '-', 'moll', 'aeolian']);
const MAJOR_WORDS = new Set(['', 'maj', 'major', 'ma', 'dur', 'ionian']);
// The other modes, with the abbreviations chord charts use ("A mix", "E phryg").
const MODE_WORDS: ReadonlyMap<string, ModalMode> = new Map([
  ['dorian', 'dorian'], ['dor', 'dorian'], ['phrygian', 'phrygian'], ['phryg', 'phrygian'], ['phr', 'phrygian'],
  ['lydian', 'lydian'], ['lyd', 'lydian'], ['mixolydian', 'mixolydian'], ['mixo', 'mixolydian'], ['mix', 'mixolydian'],
  ['locrian', 'locrian'], ['loc', 'locrian'],
] as Array<[string, ModalMode]>);
// German note names as they appear in key names: Fis-Moll, Es-Dur, As-Dur, B-Dur (B flat), H-Moll (B).
const GERMAN_KEY_RE = /^([a-hA-H])(is|es|s)?[\s-]*(dur|moll)$/i;

function parseGermanKey(text: string): KeyRef | null {
  const m = GERMAN_KEY_RE.exec(text);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const suffix = (m[2] ?? '').toLowerCase();
  // Only E and A take the bare "s" (Es, As); every other letter needs "is" or "es".
  if (suffix === 's' && letter !== 'E' && letter !== 'A') return null;
  let name: string;
  if (letter === 'H') name = suffix === 'is' ? 'B#' : suffix === '' ? 'B' : '';
  else if (letter === 'B') name = suffix === '' ? 'Bb' : '';
  else name = `${letter}${suffix === 'is' ? '#' : suffix === '' ? '' : 'b'}`;
  if (!name) return null;
  return { tonic: name, mode: m[3].toLowerCase() === 'dur' ? 'major' : 'minor' };
}

/**
 * Read a key name: `C`, `C major`, `Am`, `A minor`, `F#m`, `Bb`, `eb minor`, `key of G`,
 * `A harmonic minor`, the modes (`A Dorian`, `E phrygian mode`, `D mix`; `Ionian` is major and
 * `Aeolian` minor), route ids such as `f-sharp-minor`, `bb-major` or `a-dorian`, and German names
 * (`Fis-Moll`, `Es-Dur`, `B-Dur` = B flat major, `h-Moll` = B minor). Null when the text is not a key.
 */
export function parseKey(input: string): KeyRef | null {
  if (typeof input !== 'string') return null;
  const text = input.trim().replace(/♯/g, '#').replace(/♭/g, 'b').replace(/[−–—]/g, '-')
    .replace(/^(?:in\s+)?(?:the\s+)?key\s+of\s+/i, '');
  if (!text) return null;
  const slug = KEY_SLUG_RE.exec(text.toLowerCase());
  if (slug) {
    const tonic = noteFromSlug(slug[1]);
    return tonic ? refOf(tonic, slug[2] as KeyModeName) : null;
  }
  const german = parseGermanKey(text);
  if (german) return german;
  // "A flat major", "F-sharp minor": spelled-out accidentals.
  const spelledOut = text.replace(/[\s-]*sharp\b/gi, '#').replace(/[\s-]*flat\b/gi, 'b');
  const m = /^([A-Ga-g][#b]*)\s*(.*)$/.exec(spelledOut);
  if (!m) return null;
  const tonic = parseNote(m[1]);
  if (!tonic || tonic.octave !== null) return null;
  const rest = m[2].trim();
  if (rest === 'M') return { tonic: tonic.pcName, mode: 'major' };
  // The three forms of the minor scale all belong to the one minor key.
  const word = rest.toLowerCase().replace(/\s*(key|scale|mode)$/, '').replace(/^(natural|harmonic|melodic)\s+(?=min)/, '').replace(/\.$/, '');
  if (MINOR_WORDS.has(word)) return { tonic: tonic.pcName, mode: 'minor' };
  if (MAJOR_WORDS.has(word)) return { tonic: tonic.pcName, mode: 'major' };
  const modal = MODE_WORDS.get(word);
  if (modal) return refOf(tonic.pcName, modal);
  return null;
}

/** A key reference for a tonic in any of the seven modes. */
function refOf(tonic: string, mode: KeyModeName): KeyRef {
  return mode === 'major' || mode === 'minor' ? { tonic, mode } : { tonic, mode: 'minor', modal: mode };
}

const KEY_CACHE = new Map<string, Key>();

function buildKey(tonicName: string, mode: KeyModeName): Key {
  const tonic = note(tonicName).pcName;
  const cacheKey = `${tonic} ${mode}`;
  const cached = KEY_CACHE.get(cacheKey);
  if (cached) return cached;
  const fifths = fifthsOf(tonic) - MODE_OFFSET[mode];
  // A modal key's relative is its parent major scale, the key whose signature it borrows.
  const relative = mode === 'major' ? `${transpose(tonic, 'M6')} minor` : mode === 'minor' ? `${transpose(tonic, 'm3')} major` : `${noteFromFifths(fifths)} major`;
  const parallel = mode === 'major' ? 'minor' : mode === 'minor' ? 'major' : modeQuality(mode);
  const built: Key = {
    id: `${noteSlug(tonic)}-${mode}`,
    name: cacheKey,
    short: mode === 'minor' ? `${tonic}m` : mode === 'major' ? tonic : cacheKey,
    tonic,
    ...(mode === 'major' || mode === 'minor' ? { mode } : { mode: 'minor' as const, modal: mode }),
    fifths,
    signature: keySignature(fifths),
    scale: scaleNotes(tonic, MODE_SCALE[mode]),
    harmonicMinor: mode === 'minor' ? scaleNotes(tonic, 'harmonic-minor') : null,
    melodicMinor: mode === 'minor' ? scaleNotes(tonic, 'melodic-minor') : null,
    relative,
    parallel: `${tonic} ${parallel}`,
    theoretical: Math.abs(fifths) > 7,
  };
  KEY_CACHE.set(cacheKey, built);
  return built;
}

/** The key for a name, id, `{ tonic, mode }` pair or existing key; null when it cannot be read. */
export function getKey(input: KeyInput): Key | null {
  if (typeof input !== 'string') {
    return parseNote(input.tonic) ? buildKey(input.tonic, keyModeName(input)) : null;
  }
  const ref = parseKey(input);
  return ref ? buildKey(ref.tonic, keyModeName(ref)) : null;
}

/** The key for a name or reference, throwing a RangeError when it is invalid. */
export function key(input: KeyInput): Key {
  const found = getKey(input);
  if (!found) throw new RangeError(`Not a key: "${typeof input === 'string' ? input : JSON.stringify(input)}"`);
  return found;
}

/** The major key on a tonic. */
export function majorKey(tonic: string): Key {
  return buildKey(tonic, 'major');
}

/** The minor key on a tonic. */
export function minorKey(tonic: string): Key {
  return buildKey(tonic, 'minor');
}

/** Bring a signature back into the fifteen standard ones by enharmonic respelling (8 sharps -> 4 flats). */
function standardFifths(fifths: number): number {
  let f = fifths;
  while (f > 7) f -= 12;
  while (f < -7) f += 12;
  return f;
}

/**
 * The key with a given signature: `keyFromSignature(3)` -> A major, `keyFromSignature(-3, 'minor')`
 * -> C minor, `keyFromSignature(1, 'dorian')` -> A Dorian.
 */
export function keyFromSignature(fifths: number, mode: KeyModeName = 'major'): Key {
  return buildKey(noteFromFifths(fifths + MODE_OFFSET[mode]), mode);
}

/** Both keys that share a signature. */
export function keysWithSignature(fifths: number): { major: Key; minor: Key } {
  return { major: keyFromSignature(fifths, 'major'), minor: keyFromSignature(fifths, 'minor') };
}

const SIGNATURE_ORDER = [0, 1, 2, 3, 4, 5, 6, 7, -1, -2, -3, -4, -5, -6, -7];

/** The fifteen major keys: C, then one to seven sharps, then one to seven flats. */
export const MAJOR_KEYS: readonly Key[] = SIGNATURE_ORDER.map((f) => keyFromSignature(f, 'major'));
/** The fifteen minor keys, in the same signature order as `MAJOR_KEYS` (A minor first). */
export const MINOR_KEYS: readonly Key[] = SIGNATURE_ORDER.map((f) => keyFromSignature(f, 'minor'));
/** All thirty standard keys. */
export const ALL_KEYS: readonly Key[] = [...MAJOR_KEYS, ...MINOR_KEYS];

/** The key with the same signature and the other mode (C major <-> A minor); a modal key's parent major (A Dorian -> G major). */
export function relativeKey(input: KeyInput): Key {
  return key(key(input).relative);
}

/**
 * The key with the same tonic and the other mode (C major <-> C minor); a modal key's major or
 * minor key by its third (A Dorian -> A minor). May be theoretical (Db minor).
 */
export function parallelKey(input: KeyInput): Key {
  return key(key(input).parallel);
}

/**
 * The same key spelled the other way, when one exists among the standard signatures
 * (F# major <-> Gb major, Db minor -> C# minor). Null for keys with only one sensible spelling.
 */
export function enharmonicKey(input: KeyInput): Key | null {
  const k = key(input);
  const candidates = [k.fifths - 12, k.fifths + 12].filter((f) => Math.abs(f) <= 7);
  if (candidates.length === 0) return null;
  return keyFromSignature(candidates[0], keyModeName(k));
}

/** A key's readable spelling: itself, or its enharmonic equivalent when it has more than seven accidentals. */
export function practicalKey(input: KeyInput): Key {
  const k = key(input);
  return k.theoretical ? keyFromSignature(standardFifths(k.fifths), keyModeName(k)) : k;
}

/** The keys nearest to a key. */
export interface KeyNeighbors {
  /** One step sharpward on the circle of fifths (the key of the V chord). */
  dominant: Key;
  /** One step flatward (the key of the IV chord). */
  subdominant: Key;
  relative: Key;
  parallel: Key;
  /** Relative of the dominant key. */
  dominantRelative: Key;
  /** Relative of the subdominant key. */
  subdominantRelative: Key;
}

/**
 * A key's neighbours on the circle of fifths, plus its relative and parallel keys. A modal key's
 * neighbours are in the same mode (A Dorian: E Dorian and D Dorian) and their relatives are their
 * parent major keys.
 */
export function neighborKeys(input: KeyInput): KeyNeighbors {
  const k = key(input);
  const other: KeyMode = k.mode === 'major' ? 'minor' : 'major';
  const at = (delta: number, mode: KeyModeName) => keyFromSignature(standardFifths(k.fifths + delta), mode);
  return {
    dominant: at(1, keyModeName(k)),
    subdominant: at(-1, keyModeName(k)),
    relative: relativeKey(k),
    parallel: practicalKey(parallelKey(k)),
    dominantRelative: at(1, other),
    subdominantRelative: at(-1, other),
  };
}

/** The five closely related keys: the relative, and the keys one sharp or flat away with their relatives. */
export function closelyRelatedKeys(input: KeyInput): Key[] {
  const n = neighborKeys(input);
  return [n.relative, n.dominant, n.dominantRelative, n.subdominant, n.subdominantRelative];
}

/** One of the twelve positions on the circle of fifths. */
export interface CircleSlot {
  /** 0 = C at the top, counting clockwise in fifths. */
  index: number;
  /** Clockwise angle from the top in degrees (index × 30). */
  angle: number;
  /** Major keys at this position, the usual spelling first: `['B', 'Cb']`. */
  major: Key[];
  /** Their relative minor keys, in the same order. */
  minor: Key[];
  /** Pitch class of the major tonic. */
  pc: number;
}

/**
 * Data for drawing the circle of fifths: twelve slots clockwise from C, each with its major key
 * and relative minor. The three overlapping positions carry both spellings (B/Cb, F#/Gb, Db/C#).
 */
export function circleOfFifths(): CircleSlot[] {
  return Array.from({ length: 12 }, (_unused, index) => {
    const options = [index, index - 12]
      .filter((f) => Math.abs(f) <= 7)
      .sort((a, b) => Math.abs(a) - Math.abs(b) || b - a);
    const major = options.map((f) => keyFromSignature(f, 'major'));
    return {
      index,
      angle: index * 30,
      major,
      minor: options.map((f) => keyFromSignature(f, 'minor')),
      pc: note(major[0].tonic).chroma,
    };
  });
}

// ── Scales and chords of a key ─────────────────────────────────────────────────────────────

/** The scale of a key; for minor keys choose the natural (default), harmonic or melodic form. */
export function keyScale(input: KeyInput, variant: MinorVariant = 'natural'): string[] {
  const k = key(input);
  if (!k.harmonicMinor || !k.melodicMinor || variant === 'natural') return [...k.scale];
  return [...(variant === 'harmonic' ? k.harmonicMinor! : k.melodicMinor!)];
}

/** A diatonic chord with its job in the key. */
export interface DiatonicChord extends ScaleChord {
  function: HarmonicFunction;
  /** Which form of the minor scale the chord comes from; `natural` for major and modal keys. */
  variant: MinorVariant;
}

/**
 * Harmonic function of each scale degree (index 0 = first degree), after Riemann. `major` also
 * serves melodic minor, whose upper half is major. In `minor` (natural and harmonic) the chord on
 * the sixth degree is the subdominant's relative, and the seventh degree, lowered or raised, leans
 * toward the tonic as a dominant. A modal key uses the table of its third (`modeQuality`).
 */
export const DEGREE_FUNCTIONS: Readonly<Record<KeyMode, readonly HarmonicFunction[]>> = {
  major: ['tonic', 'subdominant', 'tonic', 'subdominant', 'dominant', 'tonic', 'dominant'],
  minor: ['tonic', 'subdominant', 'tonic', 'subdominant', 'dominant', 'subdominant', 'dominant'],
};

/** Options for `diatonicChords`. */
export interface DiatonicOptions {
  /** Four-note seventh chords instead of triads. */
  sevenths?: boolean;
  /** Form of the minor scale to harmonise (default `natural`). Ignored for major and modal keys. */
  minor?: MinorVariant;
}

/**
 * The chords built on each degree of a key, with roman numerals and harmonic function.
 * `diatonicChords('C')` -> C Dm Em F G Am Bdim; `diatonicChords('A minor', { minor: 'harmonic' })`
 * has E major and G# diminished.
 */
export function diatonicChords(input: KeyInput, opts: DiatonicOptions = {}): DiatonicChord[] {
  const k = key(input);
  const name = keyModeName(k);
  const variant: MinorVariant = name === 'minor' ? opts.minor ?? 'natural' : 'natural';
  const scaleId = name !== 'minor' ? MODE_SCALE[name] : variant === 'natural' ? 'minor' : `${variant}-minor`;
  // Melodic minor has a major-like upper half, so its sixth-degree chord is a tonic substitute again.
  const functions = modeQuality(name) === 'major' || variant === 'melodic' ? DEGREE_FUNCTIONS.major : DEGREE_FUNCTIONS.minor;
  return harmonizeScale(k.tonic, scaleId, { sevenths: opts.sevenths }).map((c, index) => ({
    ...c,
    function: functions[index],
    variant,
  }));
}

/**
 * The chords players actually use in a key. For a major or modal key these are the seven diatonic chords;
 * for a minor key the natural-minor chords plus the major V (or V7) and the diminished vii from
 * harmonic minor, which is how minor-key music is written in practice.
 */
export function keyChords(input: KeyInput, opts: { sevenths?: boolean } = {}): DiatonicChord[] {
  const k = key(input);
  const natural = diatonicChords(k, { sevenths: opts.sevenths });
  if (keyModeName(k) !== 'minor') return natural;
  const harmonic = diatonicChords(k, { sevenths: opts.sevenths, minor: 'harmonic' });
  return [...natural, harmonic[4], harmonic[6]];
}

/**
 * Spell a pitch class or MIDI number in a key. Notes of the key take the key's spelling; the
 * others take the conventional chromatic spelling against the tonic (`b2 b3 #4 b6 b7` in major;
 * in minor the raised sixth and seventh are sharps, so G# rather than Ab in A minor).
 * A MIDI number above 11 keeps its octave: `spellInKey(66, 'Gb major')` -> `Gb4`.
 *
 * A double accidental is kept only where the key itself has it (F## in G# minor). Outside notes
 * that would need one are written plainly (the b6 of Gb major is shown as D, not Ebb) unless
 * `strict` asks for the letter-perfect chromatic spelling.
 */
export function spellInKey(pitch: number, input: KeyInput, opts: { octave?: boolean; strict?: boolean } = {}): string {
  const k = key(input);
  const rounded = Math.round(pitch);
  let name = spellPc(rounded, fifthsOf(k.tonic));
  if (!opts.strict && Math.abs(note(name).alt) >= 2 && !ownNotes(k).has(name)) name = simplifyNote(name);
  const withOctave = opts.octave ?? rounded > 11;
  return withOctave ? withOctaveFor(name, rounded) : name;
}

const OWN_NOTES = new WeakMap<Key, Set<string>>();

/** Every note name a key calls its own: its scale and, in minor, the raised sixth and seventh. */
function ownNotes(k: Key): Set<string> {
  let set = OWN_NOTES.get(k);
  if (!set) {
    set = new Set([...k.scale, ...(k.harmonicMinor ?? []), ...(k.melodicMinor ?? [])]);
    OWN_NOTES.set(k, set);
  }
  return set;
}

/**
 * Whether a key is better served by sharps or flats when all twelve notes need a name (fretboard
 * labels, a tuner): flat keys use flats, everything else sharps.
 */
export function accidentalPreference(input: KeyInput): 'sharps' | 'flats' {
  return key(input).fifths < 0 ? 'flats' : 'sharps';
}

/** Degree label of a note against the tonic of a key, measured on the major scale: `b3`, `5`, `#4`. */
export function degreeInKey(noteName: string, input: KeyInput): string {
  const k = key(input);
  return intervalToDegree(intervalBetween(k.tonic, note(noteName).pcName));
}

/** The note on a degree of a key: `noteAtDegree('Eb major', 'b7')` -> `Db`. */
export function noteAtDegree(input: KeyInput, degree: string): string {
  return transpose(key(input).tonic, degreeToInterval(degree));
}

/** True when the note belongs to the key's scale (for minor keys, any of the three forms on request). */
export function inKey(noteName: string | number, input: KeyInput, variant: MinorVariant = 'natural'): boolean {
  const pc = typeof noteName === 'number' ? ((Math.round(noteName) % 12) + 12) % 12 : note(noteName).chroma;
  return keyScale(input, variant).some((n) => note(n).chroma === pc);
}

// ── Key detection ──────────────────────────────────────────────────────────────────────────

/** One candidate key. */
export interface KeyGuess {
  key: Key;
  /** Raw score; comparable only within one result list. */
  score: number;
  /** Share of belief in this key, 0–1; the confidences of a result list sum to at most 1. */
  confidence: number;
}

/** Options for key detection. */
export interface DetectKeyOptions {
  /** Treat the input as chord symbols, as notes, or decide automatically (default). */
  as?: 'chords' | 'notes' | 'auto';
  /** Maximum number of candidates (default 5). */
  limit?: number;
  /** Per-item weights (durations, in any unit), aligned with the input: notes or chords. */
  weights?: number[];
}

function maskOfNotes(names: string[]): number {
  return names.reduce((m, n) => m | (1 << note(n).chroma), 0);
}

/** The standard spelling(s) of a key on a pitch class, the one with fewer accidentals first. */
function candidateKeys(pc: number, mode: KeyMode): Key[] {
  const out: Key[] = [];
  for (let f = -7; f <= 7; f++) {
    const k = keyFromSignature(f, mode);
    if (note(k.tonic).chroma === pc) out.push(k);
  }
  // On a tie (six sharps or six flats) follow common practice: F# major, Eb minor.
  return out.sort((a, b) => Math.abs(a.fifths) - Math.abs(b.fifths) || (mode === 'major' ? b.fifths - a.fifths : a.fifths - b.fifths));
}

function pickSpelling(pc: number, mode: KeyMode, spelledNames: string[]): Key {
  const options = candidateKeys(pc, mode);
  if (options.length === 1 || spelledNames.length === 0) return options[0];
  const hits = (k: Key) => {
    const names = new Set([...k.scale, ...(k.harmonicMinor ?? [])]);
    return spelledNames.filter((n) => names.has(n)).length;
  };
  return [...options].sort((a, b) => hits(b) - hits(a))[0];
}

function softmax(scores: number[], sharpness: number): number[] {
  const max = Math.max(...scores);
  const weights = scores.map((s) => Math.exp((s - max) * sharpness));
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => w / total);
}

function rank(scored: Array<{ key: Key; score: number }>, sharpness: number, limit: number): KeyGuess[] {
  const shares = softmax(scored.map((s) => s.score), sharpness);
  return scored
    .map((s, i) => ({ key: s.key, score: Math.round(s.score * 1000) / 1000, confidence: Math.round(shares[i] * 1000) / 1000 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Detect the key of a chord progression. Every major and minor key is scored by how many of the
 * chords belong to it, with extra weight for the things that really establish a key: starting
 * and ending on the tonic chord, a dominant resolving to it, a dominant seventh on the fifth
 * degree, and the blues pattern of dominant sevenths on I, IV and V. `weights` (one per input
 * item) lets long chords count for more. Returns ranked candidates; relative keys often come
 * first and second.
 */
export function detectKeyFromChords(input: Array<string | Chord>, opts: DetectKeyOptions = {}): KeyGuess[] {
  const parsed = input.map((c, index) => ({ chord: typeof c === 'string' ? parseChord(c) : c, weight: opts.weights?.[index] ?? 1 }))
    .filter((p): p is { chord: Chord; weight: number } => p.chord !== null);
  if (parsed.length === 0) return [];
  const chords = parsed.map((p) => p.chord);
  const info = parsed.map(({ chord: c, weight }) => ({
    rootPc: note(c.root).chroma,
    mask: maskOfNotes(c.notes),
    size: c.notes.length,
    hasMajorThird: c.type.intervals.includes('M3'),
    hasMinorThird: c.type.intervals.includes('m3'),
    dominant: c.type.quality === 'dominant',
    weight: weight > 0 ? weight : 0,
  }));
  const totalWeight = info.reduce((sum, c) => sum + c.weight, 0) || 1;
  const spelled = chords.flatMap((c) => c.notes);
  const scored: Array<{ key: Key; score: number }> = [];

  for (const mode of ['major', 'minor'] as const) {
    for (let pc = 0; pc < 12; pc++) {
      const k = pickSpelling(pc, mode, spelled);
      const scaleMask = maskOfNotes(k.scale);
      const harmonicMask = k.harmonicMinor ? maskOfNotes(k.harmonicMinor) : 0;
      const degreePc = (semitones: number) => (pc + semitones) % 12;
      // A power chord or sus chord on the tonic counts for either mode; a chord with the wrong third does not.
      const isTonic = (c: (typeof info)[number]) => c.rootPc === pc && !(mode === 'major' ? c.hasMinorThird : c.hasMajorThird);
      const isDominant = (c: (typeof info)[number]) => c.rootPc === degreePc(7) && c.hasMajorThird;

      let fitSum = 0;
      for (const c of info) {
        const inScale = (c.mask & scaleMask) === c.mask;
        let fit: number;
        if (inScale) {
          fit = 1;
        } else if (mode === 'minor' && (c.mask & harmonicMask) === c.mask && (c.rootPc === degreePc(7) || c.rootPc === degreePc(11))) {
          // The major V and the diminished vii of harmonic minor belong to a minor key in practice.
          fit = 0.95;
        } else if (mode === 'major' && c.dominant && (c.rootPc === pc || c.rootPc === degreePc(5))) {
          // Blues: dominant sevenths on I and IV.
          fit = 0.7;
        } else {
          let inside = 0;
          for (let bit = 0; bit < 12; bit++) if (c.mask & (1 << bit) && scaleMask & (1 << bit)) inside++;
          fit = 0.5 * (inside / c.size);
        }
        fitSum += fit * c.weight;
      }
      let score = fitSum / totalWeight;
      // The home chord is the one a song keeps coming back to. A dominant seventh does not count
      // here: on its own it points a fifth down (a lone G7 says C), and the blues has its own rule below.
      score += 0.3 * (info.reduce((sum, c) => sum + (isTonic(c) && !c.dominant ? c.weight : 0), 0) / totalWeight);
      if (info.some(isTonic)) score += 0.1;
      if (isTonic(info[0])) score += 0.12;
      if (isTonic(info[info.length - 1])) score += 0.16;
      const resolves = info.some((c, i) => i + 1 < info.length && isDominant(c) && isTonic(info[i + 1]));
      if (resolves) score += mode === 'minor' ? 0.15 : 0.12;
      if (info.some((c) => isDominant(c) && c.dominant)) score += 0.08;
      // Ending on V7 is a turnaround: it points back to the first chord and names the key.
      const last = info[info.length - 1];
      if (last.dominant && isDominant(last)) score += 0.05;
      // Dominant sevenths on I, IV and V are the signature of a blues. Scale membership alone
      // would hear A7 D7 E7 as "V7 of D" and miss the key every blues player would name.
      const blues = mode === 'major' && [0, 5, 7].every((degree) => info.some((c) => c.dominant && c.rootPc === degreePc(degree)));
      if (blues) score += 0.25;
      scored.push({ key: k, score });
    }
  }
  return rank(scored, 10, opts.limit ?? 5);
}

// Krumhansl–Kessler key profiles: how strongly listeners expect each scale degree in a key.
const PROFILE_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const PROFILE_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlation(a: number[], b: number[]): number {
  const mean = (v: number[]) => v.reduce((x, y) => x + y, 0) / v.length;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

/**
 * Detect the key of a melody or any bag of notes (names or MIDI numbers, optionally weighted by
 * duration) with the Krumhansl–Schmuckler method, nudged toward keys whose tonic is the last note.
 */
export function detectKeyFromNotes(input: Array<string | number>, opts: DetectKeyOptions = {}): KeyGuess[] {
  if (input.length === 0) return [];
  const histogram = new Array<number>(12).fill(0);
  const spelled: string[] = [];
  const pcs = input.map((item, i) => {
    const pc = typeof item === 'number' ? ((Math.round(item) % 12) + 12) % 12 : note(item).chroma;
    histogram[pc] += opts.weights?.[i] ?? 1;
    if (typeof item === 'string') spelled.push(note(item).pcName);
    return pc;
  });
  const scored: Array<{ key: Key; score: number }> = [];
  for (const mode of ['major', 'minor'] as const) {
    const profile = mode === 'major' ? PROFILE_MAJOR : PROFILE_MINOR;
    for (let pc = 0; pc < 12; pc++) {
      const rotated = histogram.map((_v, i) => histogram[(i + pc) % 12]);
      let score = correlation(rotated, profile);
      if (pcs[pcs.length - 1] === pc) score += 0.08;
      if (pcs[0] === pc) score += 0.03;
      scored.push({ key: pickSpelling(pc, mode, spelled), score });
    }
  }
  return rank(scored, 12, opts.limit ?? 5);
}

/**
 * Detect a key from chord symbols or from notes. Chord symbols are assumed unless the input is
 * MIDI numbers or note names with octaves (`E4`); pass `{ as: 'notes' }` for bare note names.
 */
export function detectKey(input: Array<string | number>, opts: DetectKeyOptions = {}): KeyGuess[] {
  let as = opts.as ?? 'auto';
  if (as === 'auto') {
    const looksLikeNotes = input.every((item) => typeof item === 'number' || parseNote(item)?.octave != null);
    as = looksLikeNotes ? 'notes' : 'chords';
  }
  if (as === 'notes') return detectKeyFromNotes(input, opts);
  // Numbers cannot be chords; drop them together with their weights so the two stay aligned.
  const kept = input.map((item, index) => ({ item, weight: opts.weights?.[index] })).filter((e): e is { item: string; weight: number | undefined } => typeof e.item === 'string');
  const weights = opts.weights ? kept.map((e) => e.weight ?? 1) : undefined;
  return detectKeyFromChords(kept.map((e) => e.item), { ...opts, weights });
}

/** The single most likely key, or null when the input is empty or unreadable. */
export function detectBestKey(input: Array<string | number>, opts: DetectKeyOptions = {}): Key | null {
  return detectKey(input, opts)[0]?.key ?? null;
}

/**
 * True when a chord is built from the notes of the key, each tone on its proper scale step (any
 * of the three minor forms counts). Sounding like notes of the key is not enough: `Fm` is not in
 * A minor, although its Ab sounds like the leading tone G#.
 */
export function chordInKey(symbol: string | Chord, input: KeyInput): boolean {
  const c = chord(symbol);
  const k = key(input);
  // The plain scale holds no enharmonic trap, so pitches are enough there; the altered minor forms do.
  const chordMask = maskOfNotes(c.notes);
  if ((maskOfNotes(k.scale) & chordMask) === chordMask) return true;
  return !!k.harmonicMinor && !!k.melodicMinor && [k.harmonicMinor, k.melodicMinor].some((form) => chordFitsScale(c, form));
}

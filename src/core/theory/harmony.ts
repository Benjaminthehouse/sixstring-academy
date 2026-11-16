/**
 * Harmony: roman numerals in a key and back, progression analysis and transposition, modal
 * interchange, secondary dominants, tritone substitutes, cadences and likely next chords.
 *
 * Numerals follow the convention of `roman.ts`: accidentals against the major scale in every key.
 */
import {
  buildChord, chord, getChordType, isNoChord, NO_CHORD, parseChord, tritoneSubstitute,
  type Chord, type ChordType,
} from './chord';
import { CHROMATIC_DEGREES, intervalBetween, intervalToDegree, transpose } from './interval';
import {
  DEGREE_FUNCTIONS, detectKeyFromChords, diatonicChords, key, modeQuality,
  type HarmonicFunction, type Key, type KeyInput, type MinorVariant,
} from './key';
import { note, simplifyNote } from './note';
import { parseRoman, roman, romanFor, romanFromClassicalMinor, splitProgression, type RomanNumeral } from './roman';
import { chordFitsScale, getScale, harmonizeScale, scaleNotes } from './scale';

function tidy(name: string): string {
  return Math.abs(note(name).alt) >= 2 ? simplifyNote(name) : name;
}

// ── Roman numeral <-> chord ────────────────────────────────────────────────────────────────

/** Options for turning numerals into chords. */
export interface RomanToChordOptions {
  /**
   * Read the numerals of a minor key the classical way, where `III VI VII` are the chords of the
   * minor scale (C, F and G in A minor) and need no flat. Ignored in major keys.
   */
  classical?: boolean;
}

/**
 * The chord a roman numeral names in a key: (`V7`, C major) -> `G7`, (`iiø7`, A minor) -> `Bm7b5`,
 * (`V7/ii`, C major) -> `A7`, (`bVII`, E major) -> `D`, (`subV7`, C major) -> `Db7`.
 * Accidentals count from the major scale in every key (`bVI` is F in A minor) unless
 * `classical` is set.
 */
export function romanToChord(numeral: string | RomanNumeral, keyInput: KeyInput, opts: RomanToChordOptions = {}): string {
  const k = key(keyInput);
  let rn = roman(numeral);
  if (opts.classical && k.mode === 'minor') rn = roman(romanFromClassicalMinor(rn.text) ?? rn.text);
  const base = rn.target ? transpose(k.tonic, rn.target.interval) : k.tonic;
  const exact = transpose(base, rn.interval);
  // A double sharp that belongs to the key (the leading tone of G# minor) is kept; any other is respelled.
  const ownNotes = [...k.scale, ...(k.harmonicMinor ?? []), ...(k.melodicMinor ?? [])];
  const root = ownNotes.includes(exact) ? exact : tidy(exact);
  return buildChord(root, rn.type).symbol;
}

/** Turn a progression of numerals (array, or text such as `I–V–vi–IV`) into chords in a key. */
export function progressionToChords(numerals: string | string[], keyInput: KeyInput, opts: RomanToChordOptions = {}): string[] {
  const list = typeof numerals === 'string' ? splitProgression(numerals) : numerals;
  return list.map((n) => romanToChord(n, keyInput, opts));
}

/** How a chord relates to a key. */
export type ChordRelation =
  | 'diatonic' | 'altered-dominant' | 'secondary-dominant' | 'secondary-leading-tone' | 'borrowed'
  | 'neapolitan' | 'tritone-substitute' | 'chromatic';

/** The analysis of one chord in a key. */
export interface RomanAnalysis {
  /** Canonical chord symbol. */
  chord: string;
  /** The numeral that best explains the chord: `ii7`, `V7/ii`, `bVII`, `subV7`. */
  roman: string;
  /** The numeral read literally from the chord's root, with no applied-chord interpretation: `VI7` for A7 in C. */
  literal: string;
  relation: ChordRelation;
  /** Harmonic function in the key; null when the chord has none of its own (chromatic chords). */
  function: HarmonicFunction | null;
  /** For minor keys, the form of the minor scale a diatonic chord belongs to. */
  variant: MinorVariant | null;
  /** For borrowed chords: ids of the parallel scales that contain it, the likeliest source first. */
  borrowedFrom: string[];
  /** For applied chords: the numeral and the chord they point to. */
  target: string | null;
  targetChord: string | null;
  /** One plain-language sentence saying what the chord is doing. */
  explanation: string;
}

const FUNCTIONS_MAJOR = DEGREE_FUNCTIONS.major;
const FUNCTIONS_MINOR = DEGREE_FUNCTIONS.minor;
const INTERCHANGE_SOURCES_MAJOR = ['minor', 'dorian', 'mixolydian', 'phrygian', 'lydian', 'locrian', 'harmonic-minor', 'melodic-minor', 'harmonic-major'];
const INTERCHANGE_SOURCES_MINOR = ['major', 'dorian', 'mixolydian', 'phrygian', 'lydian', 'locrian', 'harmonic-major'];
const STRONG_SOURCES = new Set(['minor', 'major', 'dorian', 'mixolydian']);
const SOURCE_NAMES: Record<string, string> = {
  minor: 'the parallel minor', major: 'the parallel major', dorian: 'parallel Dorian', mixolydian: 'parallel Mixolydian',
  phrygian: 'parallel Phrygian', lydian: 'parallel Lydian', locrian: 'parallel Locrian',
  'harmonic-minor': 'parallel harmonic minor', 'melodic-minor': 'parallel melodic minor', 'harmonic-major': 'parallel harmonic major',
};

function degreeNumber(label: string): number {
  return parseInt(label.replace(/[b#]/g, ''), 10);
}

/** Degree label for a chord root in a key, preferring the given spelling when it is a normal one. */
function rootLabel(k: Key, c: Chord): string {
  const offset = (note(c.root).chroma - note(k.tonic).chroma + 12) % 12;
  const conventional = CHROMATIC_DEGREES[offset];
  let spelled: string;
  try {
    spelled = intervalToDegree(intervalBetween(k.tonic, c.root));
  } catch {
    return conventional;
  }
  if (spelled === conventional) return spelled;
  const diminished = c.type.quality === 'diminished' || c.type.quality === 'half-diminished';
  // Raised roots are how passing and leading-tone diminished chords are written (#i°7, #iv°7, #v°7).
  if (diminished && /^#[1245]$/.test(spelled)) return spelled;
  if (spelled === 'b5') return spelled;
  return conventional;
}

/** The diatonic triad on a pitch class of the key, if it is a plain major or minor one. */
function applicableTarget(k: Key, pc: number): { roman: string; symbol: string } | null {
  const natural = diatonicChords(k);
  const found = natural.find((d) => note(d.root).chroma === pc);
  if (!found) return null;
  if (k.mode === 'minor' && found.degree === 5) {
    // In a minor key the dominant that gets tonicised is the major V of harmonic minor.
    const harmonic = diatonicChords(k, { minor: 'harmonic' })[4];
    return { roman: harmonic.roman, symbol: harmonic.symbol };
  }
  if (found.type.id !== 'major' && found.type.id !== 'minor') return null;
  return { roman: found.roman, symbol: found.symbol };
}

/** What surrounds a chord in a progression; it can change what the chord is doing. */
export interface ChordContext {
  /**
   * The chord that follows, or null when nothing does. Only one reading depends on it: a
   * dominant seventh on the tonic is `V7/IV` when it moves to IV and the blues home chord `I7`
   * when it does not. Leave it out to get the context-free reading (`V7/IV`).
   */
  next?: string | Chord | null;
}

/**
 * Analyse a chord in a key. Recognises diatonic chords (in minor keys from the natural, harmonic
 * and melodic forms), altered dominants, secondary dominants (`V7/ii`), secondary leading-tone
 * chords (`vii°7/V`), the Neapolitan, tritone substitutes (`subV7`), and chords borrowed from
 * parallel modes. Whatever is left is `chromatic`. `analyzeProgression` passes each chord's
 * successor as `context`, which settles the one reading that depends on it (see `ChordContext`).
 */
export function chordToRoman(symbol: string | Chord, keyInput: KeyInput, context: ChordContext = {}): RomanAnalysis {
  const c = chord(symbol);
  const k = key(keyInput);
  const tonicPc = note(k.tonic).chroma;
  const rootPc = note(c.root).chroma;
  const offset = (rootPc - tonicPc + 12) % 12;
  const label = rootLabel(k, c);
  const literal = romanFor(label, c.type);
  // Built in the scale, not merely sounding like it: Fm is no chord of A harmonic minor.
  const fits = (names: string[]) => chordFitsScale(c, names);
  // In the key's own plain scale there is no such trap, so there sounding right is enough
  // (Fmaj7b5 in C is the IV chord, however its fifth is written).
  const chordPcs = c.notes.map((n) => note(n).chroma);
  const soundsIn = (names: string[]) => {
    const pcs = names.map((n) => note(n).chroma);
    return chordPcs.every((pc) => pcs.includes(pc));
  };
  const base = { chord: c.symbol, literal, variant: null, borrowedFrom: [] as string[], target: null, targetChord: null };
  const functionOf = (table: readonly HarmonicFunction[]) => table[degreeNumber(label) - 1] ?? null;

  // 1. Diatonic.
  if (k.mode === 'major' && soundsIn(k.scale)) {
    const fn = functionOf(FUNCTIONS_MAJOR);
    return { ...base, roman: literal, relation: 'diatonic', function: fn, variant: 'natural', explanation: `Diatonic: the ${literal} chord of ${k.name}, a ${fn} chord.` };
  }
  if (k.mode === 'minor') {
    // A modal key (A Dorian) has only its own scale; its chords take the functions of its third.
    const forms = ([['natural', k.scale], ['harmonic', k.harmonicMinor], ['melodic', k.melodicMinor]] as Array<[MinorVariant, string[] | null]>)
      .filter((f): f is [MinorVariant, string[]] => f[1] !== null);
    const brightMode = !!k.modal && modeQuality(k.modal) === 'major';
    for (const [variant, names] of forms) {
      if (!(variant === 'natural' ? soundsIn(names) : fits(names))) continue;
      const fn = functionOf(variant === 'melodic' || brightMode ? FUNCTIONS_MAJOR : FUNCTIONS_MINOR);
      const from = variant === 'natural' ? '' : ` (from ${variant} minor)`;
      return { ...base, roman: literal, relation: 'diatonic', function: fn, variant, explanation: `Diatonic: the ${literal} chord of ${k.name}${from}, a ${fn} chord.` };
    }
  }

  // 1b. The key's own dominant with altered tensions (G7b9 in C, E7#9 in A minor) or a raised fifth (G+).
  const augmentedTriad = c.type.id === 'aug';
  if (offset === 7 && (c.type.quality === 'dominant' || augmentedTriad)) {
    return {
      ...base, roman: literal, relation: 'altered-dominant', function: 'dominant',
      explanation: `The dominant of ${k.name} with altered notes for extra tension. It resolves home like any V chord.`,
    };
  }

  // 1c. The blues tonic: a dominant seventh on I that does not move to IV is home, not V7/IV.
  if (k.mode === 'major' && offset === 0 && c.type.quality === 'dominant' && context.next !== undefined) {
    const next = context.next === null ? null : typeof context.next === 'string' ? parseChord(context.next) : context.next;
    const movesToFour = next !== null && (note(next.root).chroma - tonicPc + 12) % 12 === 5;
    if (!movesToFour) {
      return {
        ...base, roman: literal, relation: 'borrowed', function: 'tonic', borrowedFrom: ['mixolydian'],
        explanation: `The blues home chord: ${k.tonic} with a lowered seventh, the colour of parallel Mixolydian. Here it is a place of rest, not a dominant.`,
      };
    }
  }

  // 2. Secondary dominant: a major, augmented or dominant chord a fifth above a diatonic chord.
  const isDominantShape = c.type.quality === 'dominant' || c.type.id === 'major' || augmentedTriad;
  if (isDominantShape && !(offset === 0 && c.type.id === 'major')) {
    const target = applicableTarget(k, (rootPc + 5) % 12);
    if (target && (rootPc + 5) % 12 !== tonicPc) {
      const numeral = `${romanFor('5', c.type)}/${target.roman}`;
      return {
        ...base, roman: numeral, relation: 'secondary-dominant', function: 'dominant', target: target.roman, targetChord: target.symbol,
        explanation: `Secondary dominant: the V of ${target.roman} (${target.symbol}). It borrows a note or two from outside the key to pull toward that chord.`,
      };
    }
  }

  // 3. Secondary leading-tone chord: a diminished chord a half step below a diatonic chord.
  if (c.type.quality === 'diminished' || c.type.quality === 'half-diminished') {
    // A diminished chord under the tonic itself is the key's own vii°, borrowed if need be, not an applied chord.
    const target = offset === 11 ? null : applicableTarget(k, (rootPc + 1) % 12);
    if (target) {
      const numeral = `${romanFor('7', c.type)}/${target.roman}`;
      return {
        ...base, roman: numeral, relation: 'secondary-leading-tone', function: 'dominant', target: target.roman, targetChord: target.symbol,
        explanation: `Secondary leading-tone chord: built a half step below ${target.symbol}, it resolves upward into it.`,
      };
    }
  }

  // 4. Neapolitan: a major chord on the lowered second degree.
  if (offset === 1 && c.type.quality === 'major') {
    return { ...base, roman: literal, relation: 'neapolitan', function: 'subdominant', borrowedFrom: ['phrygian'], explanation: 'Neapolitan: a major chord on the lowered second degree. It usually leads to the dominant.' };
  }

  // 5. Modal interchange and tritone substitutes.
  const sources = (k.mode === 'major' ? INTERCHANGE_SOURCES_MAJOR : INTERCHANGE_SOURCES_MINOR).filter((id) => fits(scaleNotes(k.tonic, id)));
  const borrowed = (): RomanAnalysis => {
    // Name the root the way its source scale does: a chord on the lowered fifth of Locrian is bV, not #IV.
    const source = getScale(sources[0])!;
    const sourceIndex = source.semitones.indexOf(offset);
    const borrowedRoman = sourceIndex >= 0 ? romanFor(source.degrees[sourceIndex], c.type) : literal;
    // The function follows that degree too, so F# and Gb in C get the same answer.
    const table = k.mode === 'major' ? FUNCTIONS_MINOR : FUNCTIONS_MAJOR;
    const fn = sourceIndex >= 0 ? table[sourceIndex] : functionOf(table);
    return {
      ...base, roman: borrowedRoman, literal: borrowedRoman, relation: 'borrowed', function: fn, borrowedFrom: sources,
      explanation: `Borrowed from ${SOURCE_NAMES[sources[0]] ?? sources[0]} (${k.tonic} ${getScale(sources[0])?.name.toLowerCase() ?? sources[0]}).`,
    };
  };
  if (sources.some((id) => STRONG_SOURCES.has(id))) return borrowed();

  if (c.type.quality === 'dominant') {
    const targetPc = (rootPc + 11) % 12;
    const target = targetPc === tonicPc ? { roman: k.mode === 'major' ? 'I' : 'i', symbol: `${k.tonic}${k.mode === 'major' ? '' : 'm'}` } : applicableTarget(k, targetPc);
    if (target) {
      const replaced = tritoneSubstitute(c) ?? '';
      const numeral = targetPc === tonicPc ? `subV${c.type.symbol}` : `subV${c.type.symbol}/${target.roman}`;
      return {
        ...base, roman: numeral, relation: 'tritone-substitute', function: 'dominant', target: target.roman, targetChord: target.symbol,
        explanation: `Tritone substitute: it stands in for ${replaced}, sharing its third and seventh, and slides down a half step to ${target.symbol}.`,
      };
    }
  }
  if (sources.length > 0) return borrowed();

  return { ...base, roman: literal, relation: 'chromatic', function: null, explanation: `Chromatic: ${c.symbol} lies outside ${k.name} and its usual borrowings.` };
}

/** A progression analysed in a key. */
export interface ProgressionAnalysis {
  key: Key;
  /** How sure the key is, 0–1 (1 when the key was given). */
  keyConfidence: number;
  chords: RomanAnalysis[];
  /** Just the numerals, for display: `['I', 'V', 'vi', 'IV']`. */
  romans: string[];
}

/**
 * Analyse a chord progression. When no key is given it is detected from the chords.
 * Unreadable symbols and `N.C.` are skipped.
 */
export function analyzeProgression(chords: string | Array<string | Chord>, keyInput?: KeyInput): ProgressionAnalysis | null {
  const list = (typeof chords === 'string' ? splitProgression(chords) : chords)
    .map((c) => (typeof c === 'string' ? parseChord(c) : c))
    .filter((c): c is Chord => c !== null);
  if (list.length === 0) return null;
  let k: Key;
  let confidence = 1;
  if (keyInput !== undefined) {
    k = key(keyInput);
  } else {
    const guess = detectKeyFromChords(list)[0];
    k = guess.key;
    confidence = guess.confidence;
  }
  const analysed = list.map((c, i) => chordToRoman(c, k, { next: list[i + 1] ?? null }));
  return { key: k, keyConfidence: confidence, chords: analysed, romans: analysed.map((a) => a.roman) };
}

// ── Transposition ──────────────────────────────────────────────────────────────────────────

function tonicOf(input: KeyInput): string {
  if (typeof input === 'string') {
    const asNote = /^[A-Ga-g][#b♯♭]*$/.test(input.trim()) ? input.trim() : null;
    if (asNote) return note(asNote).pcName;
  }
  return key(input).tonic;
}

/**
 * Move a progression from one key to another: (`['C','Am','F','G7']`, `C`, `Eb`) ->
 * `['Eb','Cm','Ab','Bb7']`. Keys may be given as key names or bare tonics (a bare tonic takes the
 * mode of the other key). Every chord moves by the same spelled interval, so each keeps its role
 * and its correct spelling; a double accidental survives only where the new key itself has one
 * (the vii°7 of G# minor is F##dim7). `N.C.` passes through.
 */
export function transposeProgression(chords: string[], from: KeyInput, to: KeyInput): string[] {
  const ivl = intervalBetween(tonicOf(from), tonicOf(to));
  const isBareTonic = (input: KeyInput) => typeof input === 'string' && /^[A-Ga-g][#b♯♭]*$/.test(input.trim());
  const mode = isBareTonic(to) ? (isBareTonic(from) ? 'major' : key(from).mode) : key(to).mode;
  const target = key({ tonic: tonicOf(to), mode });
  const own = new Set([...target.scale, ...(target.harmonicMinor ?? []), ...(target.melodicMinor ?? [])]);
  const move = (name: string) => {
    const exact = transpose(name, ivl);
    return own.has(exact) ? exact : tidy(exact);
  };
  return chords.map((symbol) => {
    if (isNoChord(symbol)) return NO_CHORD;
    const c = chord(symbol);
    return buildChord(move(c.root), c.type, c.bass ? move(c.bass) : null).symbol;
  });
}

// ── Palettes ───────────────────────────────────────────────────────────────────────────────

/** A chord available by modal interchange. */
export interface BorrowedChord {
  roman: string;
  symbol: string;
  root: string;
  type: ChordType;
  notes: string[];
  /** Ids of the parallel scales that supply it, the most usual first. */
  sources: string[];
}

/**
 * The modal-interchange palette of a key: every chord found on a degree of a parallel mode that
 * the key itself does not have. For C major that includes Cm, Ddim, Eb, Fm, Gm, Ab, Bb (parallel
 * minor), Db (Phrygian), D (Lydian) and more, each tagged with where it comes from.
 */
export function modalInterchange(keyInput: KeyInput, opts: { sevenths?: boolean } = {}): BorrowedChord[] {
  const k = key(keyInput);
  const own = new Set<string>();
  const ownForms: MinorVariant[] = k.mode === 'major' ? ['natural'] : ['natural', 'harmonic', 'melodic'];
  for (const variant of ownForms) {
    for (const d of diatonicChords(k, { sevenths: opts.sevenths, minor: variant })) own.add(`${note(d.root).chroma}:${d.type.id}`);
  }
  const sources = k.mode === 'major' ? INTERCHANGE_SOURCES_MAJOR : INTERCHANGE_SOURCES_MINOR;
  const out = new Map<string, BorrowedChord>();
  for (const source of sources) {
    for (const c of harmonizeScale(k.tonic, source, { sevenths: opts.sevenths })) {
      const id = `${note(c.root).chroma}:${c.type.id}`;
      if (own.has(id) || c.type.custom) continue;
      const existing = out.get(id);
      if (existing) existing.sources.push(source);
      else out.set(id, { roman: c.roman, symbol: buildChord(tidy(c.root), c.type).symbol, root: tidy(c.root), type: c.type, notes: c.notes, sources: [source] });
    }
  }
  return [...out.values()];
}

/** An applied (secondary) chord and where it leads. */
export interface AppliedChord {
  /** `V7/ii`, or `subV7/ii` for tritone substitutes. */
  roman: string;
  symbol: string;
  /** Numeral and chord it resolves to. */
  target: string;
  targetChord: string;
}

function tonicisable(k: Key): Array<{ roman: string; symbol: string; root: string }> {
  const out: Array<{ roman: string; symbol: string; root: string }> = [];
  for (const d of diatonicChords(k)) {
    if (d.degree === 1) continue;
    const target = applicableTarget(k, note(d.root).chroma);
    if (target) out.push({ ...target, root: d.root });
  }
  return out;
}

/**
 * The secondary dominants of a key: the V (or V7) of every diatonic chord that can be tonicised.
 * In C major: A7 -> Dm, B7 -> Em, C7 -> F, D7 -> G, E7 -> Am.
 */
export function secondaryDominants(keyInput: KeyInput, opts: { sevenths?: boolean } = {}): AppliedChord[] {
  const k = key(keyInput);
  const type = getChordType(opts.sevenths === false ? 'major' : '7')!;
  return tonicisable(k).map((target) => ({
    roman: `${romanFor('5', type)}/${target.roman}`,
    symbol: buildChord(tidy(transpose(target.root, 'P5')), type).symbol,
    target: target.roman,
    targetChord: target.symbol,
  }));
}

/** A tritone substitute and the dominant it replaces. */
export interface TritoneSub extends AppliedChord {
  /** The ordinary dominant it stands in for, as numeral and chord. */
  replaces: string;
  replacesChord: string;
}

/**
 * The tritone substitutes of a key: for the V7 and every secondary dominant, the dominant seventh
 * a tritone away, which resolves down a half step. In C major: Db7 -> C, Eb7 -> Dm, Ab7 -> G …
 */
export function tritoneSubstitutes(keyInput: KeyInput): TritoneSub[] {
  const k = key(keyInput);
  const seventh = getChordType('7')!;
  const home = k.mode === 'major' ? { roman: 'I', symbol: k.tonic, root: k.tonic } : { roman: 'i', symbol: `${k.tonic}m`, root: k.tonic };
  return [home, ...tonicisable(k)].map((target, index) => {
    const dominant = buildChord(tidy(transpose(target.root, 'P5')), seventh).symbol;
    return {
      roman: index === 0 ? 'subV7' : `subV7/${target.roman}`,
      symbol: tritoneSubstitute(dominant)!,
      target: target.roman,
      targetChord: target.symbol,
      replaces: index === 0 ? 'V7' : `V7/${target.roman}`,
      replacesChord: dominant,
    };
  });
}

// ── Cadences ───────────────────────────────────────────────────────────────────────────────

/** The four standard cadence types. */
export type CadenceType = 'authentic' | 'plagal' | 'half' | 'deceptive';

/** A classified cadence. */
export interface Cadence {
  type: CadenceType;
  /** `Authentic cadence`, `Phrygian half cadence` … */
  name: string;
  /** The two numerals that make it: `['V7', 'I']`. */
  romans: [string, string];
  /** True when either chord is inverted, which weakens the cadence (an "imperfect" one). */
  inverted: boolean;
  /** What it does, in a sentence. */
  description: string;
}

/**
 * Classify the cadence formed by the last two chords of a phrase: authentic (V–I), plagal (IV–I),
 * half (anything–V) or deceptive (V–vi). Null when the two chords do not form one of these.
 * The key is detected from the chords when it is not given.
 */
export function classifyCadence(chords: Array<string | Chord>, keyInput?: KeyInput): Cadence | null {
  const list = chords.map((c) => (typeof c === 'string' ? parseChord(c) : c)).filter((c): c is Chord => c !== null);
  if (list.length < 2) return null;
  const k = keyInput !== undefined ? key(keyInput) : detectKeyFromChords(list)[0].key;
  const [previous, final] = list.slice(-2);
  const tonicPc = note(k.tonic).chroma;
  const degree = (c: Chord) => (note(c.root).chroma - tonicPc + 12) % 12;
  const hasMajorThird = (c: Chord) => c.type.intervals.includes('M3') || c.type.quality === 'suspended';
  const a = chordToRoman(previous, k);
  const b = chordToRoman(final, k);
  const romans: [string, string] = [a.roman, b.roman];
  const inverted = previous.bass !== null || final.bass !== null;
  const dominantBefore = degree(previous) === 7 && hasMajorThird(previous);
  const leadingToneBefore = degree(previous) === 11 && (previous.type.quality === 'diminished' || previous.type.quality === 'half-diminished');
  const finalIsTonic = degree(final) === 0 && (final.type.quality === 'major' || final.type.quality === 'minor' || final.type.quality === 'power');

  if (finalIsTonic && (dominantBefore || leadingToneBefore)) {
    return {
      type: 'authentic', name: inverted || leadingToneBefore ? 'Imperfect authentic cadence' : 'Authentic cadence', romans, inverted,
      description: 'Dominant to tonic: the strongest way to end a phrase. Tension resolves and the music arrives home.',
    };
  }
  if (finalIsTonic && degree(previous) === 5) {
    const minorFour = previous.type.intervals.includes('m3') && k.mode === 'major';
    return {
      type: 'plagal', name: minorFour ? 'Minor plagal cadence' : 'Plagal cadence', romans, inverted,
      description: 'Subdominant to tonic: the gentle "Amen" ending, a settling rather than a resolution.',
    };
  }
  if (degree(final) === 7 && hasMajorThird(final)) {
    const bassPc = previous.bass ? note(previous.bass).chroma : note(previous.root).chroma;
    const phrygian = k.mode === 'minor' && (bassPc - tonicPc + 12) % 12 === 8;
    return {
      type: 'half', name: phrygian ? 'Phrygian half cadence' : 'Half cadence', romans, inverted,
      description: phrygian
        ? 'The bass steps down a half step onto the dominant: a half cadence with a dark, Spanish colour.'
        : 'The phrase stops on the dominant: a musical comma that asks for an answer.',
    };
  }
  // V to vi in major, V to bVI in minor; a major key may also borrow the minor key's bVI for the surprise.
  if (dominantBefore && (degree(final) === 8 || (degree(final) === 9 && k.mode === 'major'))) {
    return {
      type: 'deceptive', name: 'Deceptive cadence', romans, inverted,
      description: 'The dominant promises home and lands on the sixth degree instead: a surprise that keeps the music going.',
    };
  }
  return null;
}

// ── What comes next ────────────────────────────────────────────────────────────────────────

type Tendency = Array<[numeral: string, weight: number]>;

// Typical continuations in common-practice and pop harmony. Weights are relative likelihoods.
const NEXT_MAJOR: Record<string, Tendency> = {
  I: [['IV', 5], ['V', 5], ['vi', 4], ['ii', 3], ['iii', 2], ['bVII', 1.5]],
  ii: [['V', 6], ['IV', 2], ['vii°', 1.5], ['I', 1.5], ['iii', 1]],
  iii: [['vi', 5], ['IV', 4], ['ii', 1.5], ['I', 1]],
  IV: [['V', 5], ['I', 5], ['ii', 2.5], ['vi', 2], ['iv', 1.5]],
  V: [['I', 7], ['vi', 3], ['IV', 2.5], ['iii', 1]],
  vi: [['IV', 5], ['ii', 4], ['V', 3], ['iii', 2], ['I', 1.5]],
  'vii°': [['I', 6], ['iii', 2], ['vi', 1.5]],
  bVII: [['IV', 4], ['I', 4], ['bVI', 2]],
  bVI: [['bVII', 5], ['V', 3], ['I', 2]],
  bIII: [['IV', 4], ['bVI', 3], ['bVII', 2]],
  iv: [['I', 5], ['V', 3]],
  bII: [['V', 5], ['I', 3]],
};
const NEXT_MINOR: Record<string, Tendency> = {
  i: [['iv', 4], ['bVI', 4], ['bVII', 4], ['V', 3.5], ['bIII', 3], ['ii°', 2], ['v', 2]],
  'ii°': [['V', 6], ['i', 1.5], ['vii°', 1]],
  bIII: [['bVI', 4], ['bVII', 3.5], ['iv', 3], ['i', 2]],
  iv: [['V', 5], ['i', 4], ['bVII', 3], ['bVI', 1.5], ['ii°', 1.5]],
  v: [['i', 5], ['bVI', 3], ['iv', 2]],
  V: [['i', 7], ['bVI', 3], ['iv', 1.5]],
  bVI: [['bVII', 5], ['V', 4], ['iv', 3], ['bIII', 3], ['i', 2.5], ['ii°', 1.5]],
  bVII: [['i', 5], ['bIII', 4.5], ['bVI', 3], ['V', 1.5]],
  'vii°': [['i', 7]],
  bII: [['V', 5], ['i', 3]],
  IV: [['i', 4], ['bVII', 3], ['V', 3]],
  I: [['iv', 4], ['bVI', 2]],
};

/** A suggested next chord. */
export interface NextChord {
  roman: string;
  chord: string;
  /** Likelihood among the suggestions, 0–1; the list sums to 1. */
  probability: number;
  /** Why this move works. */
  reason: string;
}

function triadNumeral(label: string, type: ChordType): string {
  const quality = type.quality;
  const base = quality === 'diminished' || quality === 'half-diminished' ? 'dim' : type.intervals.includes('m3') ? 'minor' : 'major';
  return romanFor(label, getChordType(base)!);
}

/** One sentence on why a chord change works, from where the roots sit in the key and how they move. */
function moveReason(from: Chord, fromAnalysis: RomanAnalysis, to: Chord, k: Key): string {
  const tonicPc = note(k.tonic).chroma;
  const fromDegree = (note(from.root).chroma - tonicPc + 12) % 12;
  const toDegree = (note(to.root).chroma - tonicPc + 12) % 12;
  const motion = (toDegree - fromDegree + 12) % 12;
  const majorThird = (c: Chord) => c.type.intervals.includes('M3');
  const diminished = (c: Chord) => c.type.quality === 'diminished' || c.type.quality === 'half-diminished';

  if (fromAnalysis.relation === 'tritone-substitute' && motion === 11) return 'Slides down a half step into the chord it was aiming at.';
  if (fromAnalysis.relation === 'secondary-leading-tone' && motion === 1) return 'Rises a half step into the chord it was aiming at.';
  if (fromAnalysis.relation === 'secondary-dominant' && motion === 5) return 'Resolves down a fifth to the chord it was the dominant of.';
  if (toDegree === 0) {
    if (fromDegree === 7 && majorThird(from)) return 'Resolves home: dominant to tonic, the strongest pull in tonal music.';
    if (fromDegree === 11 && diminished(from)) return 'Resolves home: the leading-tone chord rises a half step into the tonic.';
    if (fromDegree === 5) return 'Settles home gently, the plagal ("Amen") move.';
    if (fromDegree === 10) return 'Steps up into the home chord: the modal cadence of rock and folk.';
    if (fromDegree === 7) return 'Returns home from the minor v chord: a soft, modal close.';
    if (fromDegree === 1) return 'Slides down a half step onto the home chord.';
    return 'Returns to the home chord.';
  }
  if (fromDegree === 7 && majorThird(from) && toDegree === (k.mode === 'major' ? 9 : 8)) {
    return 'Deceptive: the ear expects home and gets the sixth degree instead.';
  }
  if (toDegree === 7) {
    return majorThird(to)
      ? 'Moves to the dominant, building tension that wants to resolve.'
      : 'Moves to the minor v chord, a gentle, modal kind of dominant.';
  }
  if (motion === 5) return 'Root falls a fifth, the strongest root motion.';
  if (motion === 7) return 'Root rises a fifth: an opening, questioning move.';
  if (motion === 8 || motion === 9) return 'Root falls a third, so the two chords share two notes: a smooth change of colour.';
  if (motion === 3 || motion === 4) return 'Root rises a third; two notes are shared, so the change is soft.';
  if (motion === 1 || motion === 2) return 'Root steps up, carrying the music forward.';
  if (motion === 10 || motion === 11) return 'Root steps down.';
  if (motion === 0) return 'Same root, new colour.';
  return 'Root moves a tritone: a deliberate jolt.';
}

/**
 * Likely next chords after a chord (symbol or numeral) in a key, from common-practice and pop
 * tendencies, most likely first. Applied chords (`V7/ii`, `subV7/V`, `vii°7/vi`) point to their
 * target. An unfamiliar chord falls back to the moves that re-establish the key.
 */
export function nextChords(current: string | Chord, keyInput: KeyInput, opts: { sevenths?: boolean; limit?: number } = {}): NextChord[] {
  const k = key(keyInput);
  const asRoman = typeof current === 'string' ? parseRoman(current) : null;
  const asChord = typeof current !== 'string' ? current : asRoman ? null : parseChord(current);
  if (!asRoman && !asChord) throw new RangeError(`Neither a chord nor a roman numeral: "${String(current)}"`);
  const symbol = asChord ? asChord.symbol : romanToChord(asRoman!, k);
  const analysis = chordToRoman(symbol, k);
  const here = chord(symbol);
  const home = k.mode === 'major' ? 'I' : 'i';
  const sixth = k.mode === 'major' ? 'vi' : 'bVI';

  let tendency: Tendency;
  if (analysis.target && analysis.relation !== 'diatonic') {
    // An applied chord wants its target; the deceptive alternative is the chord a third below it.
    tendency = [[analysis.target, 8]];
    if (analysis.target !== home) tendency.push([home, 1]);
    else tendency.push([sixth, 1.5]);
  } else {
    const table = k.mode === 'major' ? NEXT_MAJOR : NEXT_MINOR;
    // Sevenths and extensions follow the tendencies of the triad underneath them.
    tendency = table[triadNumeral(rootLabel(k, here), here.type)] ?? [[home, 4], ['V', 3], [k.mode === 'major' ? 'IV' : 'iv', 2]];
  }

  const sevenths = opts.sevenths ? [...diatonicChords(k, { sevenths: true }), ...(k.mode === 'minor' ? diatonicChords(k, { sevenths: true, minor: 'harmonic' }) : [])] : [];
  const total = tendency.reduce((sum, [, w]) => sum + w, 0);
  const out = tendency.map(([numeral, weight]) => {
    let nextRoman = numeral;
    if (opts.sevenths) {
      const triad = romanToChord(numeral, k);
      const match = sevenths.find((d) => note(d.root).chroma === note(chord(triad).root).chroma && d.type.intervals.includes(chord(triad).type.intervals[1]));
      if (match) nextRoman = match.roman;
    }
    const nextSymbol = romanToChord(nextRoman, k);
    return {
      roman: nextRoman,
      chord: nextSymbol,
      probability: Math.round((weight / total) * 1000) / 1000,
      reason: moveReason(here, analysis, chord(nextSymbol), k),
    };
  });
  return out.sort((a, b) => b.probability - a.probability).slice(0, opts.limit ?? out.length);
}

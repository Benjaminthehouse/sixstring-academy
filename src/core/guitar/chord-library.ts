/**
 * The chord library: the curated shapes of `chord-shapes.ts` turned into voicings for any root,
 * plus the families that are better computed than typed (close triads on every string set, and
 * drop-2 and drop-3 seventh chords in every inversion).
 *
 * The shapes are written for standard tuning. They also serve every tuning with the same string
 * intervals (E flat standard, D standard, seven-string standard) and any capo: the library looks
 * up the shape that *sounds* the chord there. Other tunings get their voicings from the generator.
 */
import { buildChord, chord as parseChord, getChordType, note as parseNote, type Chord, type ChordType } from '@/core/theory';
import { MOVABLE_SHAPES, OPEN_SHAPES, type MovableShape } from './chord-shapes';
import type { NeckOptions } from './fretboard';
import { hasStandardIntervals, tuning, type Tuning } from './tunings';
import type { CagedShape } from './types';
import { parseFrets, tryBuildVoicing, type Voicing, type VoicingCategory } from './voicing';

/** Categories in the order the library lists them. */
export const VOICING_CATEGORIES: readonly VoicingCategory[] = ['open', 'barre', 'caged', 'power', 'shell', 'triad', 'jazz', 'drop2', 'drop3', 'generated'];

/** What each voicing family is, for headings and help text. */
export const VOICING_CATEGORY_INFO: Readonly<Record<VoicingCategory, { name: string; description: string }>> = {
  open: { name: 'Open chords', description: 'Chords in the first few frets that let open strings ring. The first shapes every guitarist learns.' },
  barre: { name: 'Barre chords', description: 'The E and A shapes with the index finger laid across the strings in place of the nut. One shape, twelve chords.' },
  caged: { name: 'CAGED shapes', description: 'The C, G and D shapes moved up the neck. Together with the E and A shapes they cover the whole fretboard.' },
  power: { name: 'Power chords', description: 'Root and fifth only, on the low strings. Neither major nor minor, and at home under distortion.' },
  shell: { name: 'Shell voicings', description: 'Root, third and seventh: the three notes that define a seventh chord. The basis of jazz rhythm guitar.' },
  triad: { name: 'Triads', description: 'Three-note chords on three neighbouring strings, in every inversion. Small shapes for fills, funk and soloing.' },
  jazz: { name: 'Jazz voicings', description: 'Four- and five-note grips for seventh, extended and altered chords, with the root on string 6, 5 or 4.' },
  drop2: { name: 'Drop 2', description: 'Four-note seventh chords on four neighbouring strings, made by dropping the second voice from the top an octave.' },
  drop3: { name: 'Drop 3', description: 'Four-note seventh chords with a skipped string, made by dropping the third voice from the top an octave.' },
  generated: { name: 'More shapes', description: 'Further playable shapes worked out for this chord.' },
};

/** Options for the library look-ups. */
export interface LibraryOptions extends NeckOptions {
  /** Only these families. */
  categories?: VoicingCategory[];
  /** Also return the voicings with another chord tone in the bass (triad and drop inversions). Default: only the bass the symbol asks for. */
  inversions?: boolean;
  /** Highest fret a shape may use (default 15). */
  maxFret?: number;
}

interface Shape {
  frets: Array<number | null>;
  fingers?: string;
  label: string;
  category: VoicingCategory;
  shape: CagedShape | null;
}

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

const OPEN_PARSED = OPEN_SHAPES.map((o) => ({ def: o, chord: parseChord(o.chord), frets: parseFrets(o.frets) }));
const MOVABLE_PARSED = MOVABLE_SHAPES.map((m) => ({ def: m, rootPc: parseNote(m.root).chroma, frets: parseFrets(m.frets) }));

/** The six standard-tuned strings as open MIDI numbers: the frame every curated shape is written in. */
const STANDARD = [40, 45, 50, 55, 59, 64];

const TRIAD_TYPES = ['major', 'minor', 'dim', 'aug'];
const DROP_TYPES = ['maj7', '7', 'm7', 'm7b5', 'dim7', '6', 'm6', 'mmaj7'];
/** String sets as indices into the six standard strings, low to high. */
const TRIAD_SETS = [[0, 1, 2], [1, 2, 3], [2, 3, 4], [3, 4, 5]];
const DROP2_SETS = [[2, 3, 4, 5], [1, 2, 3, 4], [0, 1, 2, 3]];
const DROP3_SETS = [[0, 2, 3, 4], [1, 3, 4, 5]];
const INVERSION_NAMES = ['root position', 'first inversion', 'second inversion', 'third inversion'];

/** Chords whose inversions are just the same chord on another root (equal divisions of the octave). */
function isSymmetric(type: ChordType): boolean {
  return type.id === 'aug' || type.id === 'dim7';
}

/**
 * Put voices on strings. `tones` are semitones above the root, one per string of `set`, in the
 * order low string to high; each voice sounds above the one before. Returns six frets in standard
 * tuning at the lowest place on the neck, or null when the shape needs more than five frets.
 */
function placeVoices(rootPc: number, tones: number[], set: number[]): Array<number | null> | null {
  let pitch = STANDARD[set[0]] + mod12(rootPc + tones[0] - STANDARD[set[0]]);
  const frets: number[] = [pitch - STANDARD[set[0]]];
  for (let k = 1; k < tones.length; k++) {
    pitch += mod12(tones[k] - tones[k - 1]) || 12;
    frets.push(pitch - STANDARD[set[k]]);
  }
  let low = Math.min(...frets);
  while (low < 0) {
    for (let k = 0; k < frets.length; k++) frets[k] += 12;
    low += 12;
  }
  while (low >= 12) {
    for (let k = 0; k < frets.length; k++) frets[k] -= 12;
    low -= 12;
  }
  if (Math.max(...frets) - low > 4) return null;
  const out: Array<number | null> = [null, null, null, null, null, null];
  set.forEach((s, k) => {
    out[s] = frets[k];
  });
  return out;
}

function stringNames(set: number[]): string {
  const numbers = set.map((s) => 6 - s);
  const run = numbers.every((n, i) => i === 0 || n === numbers[i - 1] - 1);
  return run ? `strings ${numbers[0]}–${numbers[numbers.length - 1]}` : `strings ${numbers.join(' ')}`;
}

/** Close triads and drop voicings of a chord type on a root, as shapes in standard tuning. */
function computedShapes(rootPc: number, type: ChordType): Shape[] {
  const out: Shape[] = [];
  const tones = type.semitones.map((s) => s % 12);
  if (TRIAD_TYPES.includes(type.id)) {
    for (const set of TRIAD_SETS) {
      for (let inv = 0; inv < (isSymmetric(type) ? 1 : 3); inv++) {
        const frets = placeVoices(rootPc, [0, 1, 2].map((k) => tones[(inv + k) % 3]), set);
        if (frets) out.push({ frets, label: `Triad, ${stringNames(set)}, ${INVERSION_NAMES[inv]}`, category: 'triad', shape: null });
      }
    }
  }
  if (DROP_TYPES.includes(type.id)) {
    const families: Array<[VoicingCategory, string, number[][], number[]]> = [
      // Voice order from the bass up, as steps through the chord tones: drop 2 is 1 5 7 3, drop 3 is 1 7 3 5.
      ['drop2', 'Drop 2', DROP2_SETS, [0, 2, 3, 1]],
      ['drop3', 'Drop 3', DROP3_SETS, [0, 3, 1, 2]],
    ];
    for (const [category, name, sets, order] of families) {
      for (const set of sets) {
        for (let inv = 0; inv < (isSymmetric(type) ? 1 : 4); inv++) {
          const frets = placeVoices(rootPc, order.map((k) => tones[(inv + k) % 4]), set);
          if (frets) out.push({ frets, label: `${name}, ${stringNames(set)}, ${INVERSION_NAMES[inv]}`, category, shape: null });
        }
      }
    }
  }
  return out;
}

function movableLabel(def: MovableShape, baseFret: number): string {
  return def.category === 'barre' ? `${def.name} at fret ${baseFret}` : `${def.name}, fret ${baseFret}`;
}

/** Every curated shape (standard-tuning frets) that sounds a root and type, for one bass or for all. */
function shapesFor(rootPc: number, type: ChordType, bassPc: number | null, withInversions: boolean): Shape[] {
  const out: Shape[] = [];
  const wantedBass = bassPc ?? rootPc;
  for (const o of OPEN_PARSED) {
    if (o.chord.type.id !== type.id || parseNote(o.chord.root).chroma !== rootPc) continue;
    const bass = o.chord.bass ? parseNote(o.chord.bass).chroma : rootPc;
    if (bass !== wantedBass && !(withInversions && type.semitones.some((s) => mod12(rootPc + s) === bass))) continue;
    out.push({ frets: [...o.frets], fingers: o.def.fingers, label: 'Open', category: 'open', shape: null });
  }
  if (wantedBass === rootPc || withInversions) {
    for (const m of MOVABLE_PARSED) {
      if (m.def.type !== type.id) continue;
      const shift = mod12(rootPc - m.rootPc);
      const frets = m.frets.map((f) => (f === null ? null : f + shift));
      const base = Math.min(...frets.filter((f): f is number => f !== null));
      out.push({ frets, fingers: m.def.fingers, label: movableLabel(m.def, base), category: m.def.category, shape: m.def.shape });
    }
  }
  for (const shape of computedShapes(rootPc, type)) out.push(shape);
  return out;
}

/** Semitones the tuning (with capo) sounds above standard, or null when the curated shapes do not apply to it. */
function libraryOffset(t: Tuning, capo: number): number | null {
  if (t.stringCount < 6 || !hasStandardIntervals(t)) return null;
  return t.midi[t.stringCount - 6] - STANDARD[0] + capo;
}

/**
 * The curated voicings of a chord, in teaching order: open shapes, barre chords, the other CAGED
 * shapes, power chords, shells, triads, jazz grips, drop 2, drop 3. A plain symbol gets the shapes
 * with the root in the bass; a slash chord (`C/E`) the shapes with that bass; `inversions: true`
 * every inversion. Empty for chords the library has no shape for (use `chordVoicings`, which
 * also generates) and for tunings without standard intervals.
 */
export function libraryVoicings(chordInput: string | Chord, opts: LibraryOptions = {}): Voicing[] {
  const c = parseChord(chordInput);
  const t = tuning(opts.tuning);
  const capo = opts.capo ?? 0;
  const offset = libraryOffset(t, capo);
  if (offset === null) return [];
  const maxFret = opts.maxFret ?? 15;
  const rootPc = mod12(parseNote(c.root).chroma - offset);
  const bassPc = c.bass ? mod12(parseNote(c.bass).chroma - offset) : null;
  const pad: null[] = Array.from({ length: t.stringCount - 6 }, () => null);
  const plain = buildChord(c.root, c.type);
  const out: Voicing[] = [];
  const seen = new Set<string>();
  for (const shape of shapesFor(rootPc, c.type, bassPc, opts.inversions ?? false)) {
    if (opts.categories && !opts.categories.includes(shape.category)) continue;
    if (shape.frets.some((f) => f !== null && f > maxFret)) continue;
    const key = shape.frets.join(',');
    if (seen.has(key)) continue;
    // A non-chord bass (Am/G) is part of the symbol; chord-tone basses are read off the shape.
    const voicing = tryBuildVoicing(c.bass && c.inversion === null ? c : plain, [...pad, ...shape.frets], {
      tuning: t, capo, fingers: shape.fingers ? `${'x'.repeat(pad.length)}${shape.fingers}` : undefined,
      label: shape.label, category: shape.category, shape: shape.shape, source: 'library',
    });
    if (!voicing) continue;
    const bass = parseNote(voicing.bass).chroma;
    const wanted = c.bass ? parseNote(c.bass).chroma : parseNote(c.root).chroma;
    if (bass !== wanted && !opts.inversions) continue;
    seen.add(key);
    out.push(voicing);
  }
  return out.sort((a, b) => VOICING_CATEGORIES.indexOf(a.category) - VOICING_CATEGORIES.indexOf(b.category));
}

/** Twelve root names, one per pitch class, spelled the way chord charts usually do. */
export const LIBRARY_ROOTS: readonly string[] = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Ids of the chord types the library has curated shapes for. */
export function libraryChordTypes(): string[] {
  const ids = new Set<string>([...OPEN_PARSED.map((o) => o.chord.type.id), ...MOVABLE_SHAPES.map((m) => m.type), ...TRIAD_TYPES, ...DROP_TYPES]);
  return [...ids];
}

let openCache: Voicing[] | null = null;

/** Every open-position chord of the library in standard tuning, in teaching order. */
export function openChordVoicings(): Voicing[] {
  if (!openCache) {
    openCache = OPEN_PARSED.map((o) => {
      const voicing = tryBuildVoicing(o.chord, o.frets, { fingers: o.def.fingers, label: 'Open', category: 'open', source: 'library' });
      /* c8 ignore next */
      if (!voicing) throw new Error(`Open shape ${o.def.chord} ${o.def.frets} is not a valid voicing`);
      return voicing;
    });
  }
  return [...openCache];
}

/**
 * The whole library for a tuning: every curated and computed shape on all twelve roots, inversions
 * included. A few thousand voicings; meant for browsing, search indexes and tests.
 */
export function voicingLibrary(opts: LibraryOptions = {}): Voicing[] {
  const out: Voicing[] = [];
  const seen = new Set<string>();
  for (const typeId of libraryChordTypes()) {
    const type = getChordType(typeId);
    /* c8 ignore next */
    if (!type) continue;
    for (const root of LIBRARY_ROOTS) {
      for (const voicing of libraryVoicings(buildChord(root, type), { ...opts, inversions: true })) {
        if (seen.has(voicing.id)) continue;
        seen.add(voicing.id);
        out.push(voicing);
      }
    }
  }
  // Slash chords over a bass that is not a chord tone only exist as typed open shapes.
  for (const o of OPEN_PARSED) {
    if (!o.chord.bass || o.chord.inversion !== null) continue;
    for (const voicing of libraryVoicings(o.chord, opts)) {
      if (!seen.has(voicing.id)) {
        seen.add(voicing.id);
        out.push(voicing);
      }
    }
  }
  return out;
}

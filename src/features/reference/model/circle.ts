/**
 * The circle of fifths page: everything about one key, computed by the theory engine.
 *
 * Keys are the 15 major and 15 minor keys with a real signature (`ALL_KEYS`). Names stay ASCII
 * (`F# minor`); the screen formats them in the learner's naming.
 */
import { ALL_KEYS, getKey, keyChords, neighborKeys, progressionToChords, type Key } from '@/core/theory';

/** The key the circle opens on. */
export const DEFAULT_KEY = 'C major';

const KEY_BY_ID = new Map<string, Key>(ALL_KEYS.map((k) => [k.id, k]));

/** One of the 30 keys by route id (`f-sharp-minor`) or name (`F# minor`), or null. */
export function keyFromParam(param: string | null | undefined): Key | null {
  if (!param) return null;
  const direct = KEY_BY_ID.get(param);
  if (direct) return direct;
  const parsed = getKey(param);
  return parsed ? KEY_BY_ID.get(parsed.id) ?? null : null;
}

/** A key by name, falling back to C major (the circle always shows something). */
export function circleKey(name: string | null | undefined): Key {
  return keyFromParam(name) ?? KEY_BY_ID.get('c-major')!;
}

/** What the signature says, in words: "1 sharp", "3 flats", "no sharps or flats". */
export function signatureWords(k: Key): string {
  const { count, type } = k.signature;
  if (count === 0) return 'no sharps or flats';
  const word = type === 'sharps' ? 'sharp' : 'flat';
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** Tonic, subdominant or dominant: the three jobs a chord does in a key. */
export type HarmonicFunction = 'tonic' | 'subdominant' | 'dominant';

/** One chord of a key with its numeral and job. */
export interface KeyChord {
  /** Roman numeral as the theory engine writes it (`bIII`, `vii°`). */
  roman: string;
  /** Chord symbol, ASCII (`F#m`, `Bdim`). */
  symbol: string;
  /** Chord tones, ASCII. */
  notes: string[];
  function: HarmonicFunction;
  /** `harmonic` for the minor key's chords borrowed from harmonic minor (V, vii°). */
  variant: 'natural' | 'harmonic' | 'melodic';
  /** Scale degree 1–7 the chord is built on. */
  degree: number;
}

/** The chords of a key: the seven diatonic triads (or sevenths), plus V and vii° in minor. */
export function keyChordRow(k: Key, sevenths = false): KeyChord[] {
  return keyChords(k, { sevenths }).map((c) => ({
    roman: c.roman,
    symbol: c.symbol,
    notes: [...c.notes],
    function: c.function as HarmonicFunction,
    variant: c.variant as KeyChord['variant'],
    degree: c.degree,
  }));
}

/** The I–IV–V–I of a key (i–iv–V–i in minor, with the major V of harmonic minor). */
export function cadenceOf(k: Key): { romans: string[]; chords: string[] } {
  const romans = k.mode === 'minor' ? ['i', 'iv', 'V', 'i'] : ['I', 'IV', 'V', 'I'];
  return { romans, chords: progressionToChords(romans.join(' '), k.name) };
}

/** A neighbouring key and why it is close. */
export interface Neighbour {
  role: 'dominant' | 'subdominant' | 'relative' | 'parallel' | 'dominantRelative' | 'subdominantRelative';
  /** Plain words for the role. */
  label: string;
  key: Key;
}

const NEIGHBOUR_LABEL: Record<Neighbour['role'], string> = {
  subdominant: 'One step anticlockwise',
  dominant: 'One step clockwise',
  relative: 'Relative',
  parallel: 'Parallel',
  subdominantRelative: 'Relative of the anticlockwise key',
  dominantRelative: 'Relative of the clockwise key',
};

const NEIGHBOUR_ORDER: Neighbour['role'][] = ['subdominant', 'dominant', 'relative', 'parallel', 'subdominantRelative', 'dominantRelative'];

/**
 * The keys around this one: one step each way on the circle (one accidental apart), the relative
 * key (same signature), the parallel key (same tonic) and the relatives of the two steps.
 * Keys outside the 30 (a theoretical parallel such as D# major) are left out.
 */
export function neighboursOf(k: Key): Neighbour[] {
  const n = neighborKeys(k);
  const out: Neighbour[] = [];
  for (const role of NEIGHBOUR_ORDER) {
    const v: Key | null | undefined = n[role];
    const found = v ? keyFromParam(v.id) : null;
    if (found) out.push({ role, label: NEIGHBOUR_LABEL[role], key: found });
  }
  return out;
}

/** The scale to draw on the neck for a key: its major scale, or natural minor. */
export function neckScaleOf(k: Key): { tonic: string; scale: 'major' | 'minor' } {
  return { tonic: k.tonic, scale: k.mode === 'minor' ? 'minor' : 'major' };
}

/** Short letter for a function, shown with the word: T, S, D. */
export function functionLetter(f: HarmonicFunction): 'T' | 'S' | 'D' {
  return f === 'tonic' ? 'T' : f === 'subdominant' ? 'S' : 'D';
}

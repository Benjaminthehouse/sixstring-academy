/**
 * The chord library organised for people: the first-chords path in learning order, families by
 * type, the twelve roots, and search by symbol or name.
 *
 * Everything here is derived from the theory catalog (69 chord types): the families only group
 * catalog ids, and a test checks that every type sits in exactly one family.
 */
import { CHORD_TYPES, getChordType, parseChord, searchChordTypes, type ChordType } from '@/core/theory';
import { normaliseTyped, readSymbol } from './symbols';

// ---------------------------------------------------------------------------------------------
// Families
// ---------------------------------------------------------------------------------------------

/** A family of chord types, as a learner would look for them. */
export interface ChordFamily {
  /** Route-safe id: `major`, `m7`, `half-diminished`. */
  id: string;
  /** Short label for a chip: `Major`, `m7`, `ø`. */
  label: string;
  /** Heading: `Minor sevenths`. */
  title: string;
  /** One plain sentence about the sound and where it turns up. */
  blurb: string;
  /** Catalog type ids, the everyday one first. */
  types: string[];
}

/** Every family in the order of the chips. Every catalog type is in exactly one. */
export const FAMILIES: readonly ChordFamily[] = [
  { id: 'major', label: 'Major', title: 'Major chords', blurb: 'Bright and settled: the home chords of most songs.', types: ['major', 'majb5'] },
  { id: 'minor', label: 'Minor', title: 'Minor chords', blurb: 'Darker and softer than major, with the third a half step lower.', types: ['minor'] },
  { id: '7', label: '7', title: 'Seventh chords', blurb: 'Major with a flat seventh: restless, bluesy, wanting to move on.', types: ['7'] },
  { id: 'maj7', label: 'maj7', title: 'Major sevenths', blurb: 'Major with the note just below the root: warm, dreamy, a little jazzy.', types: ['maj7', 'maj7b5'] },
  { id: 'm7', label: 'm7', title: 'Minor sevenths', blurb: 'Minor with a flat seventh: mellow and smooth, at home in soul, funk and jazz.', types: ['m7', 'mmaj7', 'm7sharp5'] },
  { id: 'sus', label: 'sus', title: 'Suspended chords', blurb: 'The third swapped for the second or fourth: open, unresolved, neither major nor minor.', types: ['sus4', 'sus2', 'sus2sus4', '7sus4', '7sus2', '9sus4', '13sus4', '7sus4b9'] },
  { id: 'add', label: 'add', title: 'Added-note chords', blurb: 'A plain chord with one extra note on top: sparkle without a seventh.', types: ['add9', 'madd9', 'add11', 'add4', 'madd11', 'addsharp11'] },
  { id: '6', label: '6', title: 'Sixth chords', blurb: 'A chord with the sixth added: sweet, vintage, the sound of swing and bossa nova.', types: ['6', 'm6', '69', 'm69', 'mb6'] },
  { id: '9', label: '9', title: 'Ninth chords', blurb: 'Seventh chords with the ninth on top: fuller and funkier.', types: ['9', 'maj9', 'm9', 'mmaj9'] },
  { id: 'dim', label: 'dim', title: 'Diminished chords', blurb: 'Stacked minor thirds: tense and unstable, used to pass from one chord to the next.', types: ['dim', 'dim7', 'dimmaj7'] },
  { id: 'aug', label: 'aug', title: 'Augmented chords', blurb: 'Major with a raised fifth: eerie and floating, often a step on the way somewhere.', types: ['aug', '7sharp5', 'maj7sharp5'] },
  { id: 'half-diminished', label: 'm7♭5', title: 'Half-diminished chords', blurb: 'A diminished triad with a minor seventh: the dark ii chord of a minor key.', types: ['m7b5', 'm9b5'] },
  { id: 'extended', label: 'Extended', title: 'Extended chords', blurb: 'Elevenths and thirteenths: rich jazz and soul colours built high above the root.', types: ['13', 'm11', '11', 'maj13', 'm13', 'm7add11', 'maj7sharp11', 'maj9sharp11'] },
  {
    id: 'altered',
    label: 'Altered',
    title: 'Altered dominants',
    blurb: 'Seventh chords with sharpened or flattened tensions: maximum pull toward the next chord.',
    types: ['7sharp9', '7b9', '7b5', '7sharp11', '7b13', '7alt', '13b9', '13sharp9', '9sharp11', '13sharp11', '9sharp5', '9b5', '9b13', '7b9b13', '7sharp9sharp5', '7b9sharp5', '7b9b5', '7sharp9b5', '7b9sharp11', '7sharp9sharp11'],
  },
  { id: 'power', label: 'Power', title: 'Power chords', blurb: 'Root and fifth only: neither major nor minor, made for rock and distortion.', types: ['5'] },
];

const FAMILY_BY_ID = new Map(FAMILIES.map((f) => [f.id, f]));
const FAMILY_OF_TYPE = new Map<string, ChordFamily>();
for (const f of FAMILIES) for (const t of f.types) FAMILY_OF_TYPE.set(t, f);

/** A family by id, or null. */
export function familyById(id: string): ChordFamily | null {
  return FAMILY_BY_ID.get(id) ?? null;
}

/** The family a catalog type belongs to (custom types go with their closest catalog quality). */
export function familyOfType(type: ChordType | string): ChordFamily {
  const t = typeof type === 'string' ? getChordType(type) : type;
  const found = t ? FAMILY_OF_TYPE.get(t.id) : undefined;
  if (found) return found;
  // Symbols outside the catalog (`C7no5`) go by quality.
  const q = t?.quality;
  if (q === 'minor') return FAMILY_BY_ID.get('minor')!;
  if (q === 'dominant') return FAMILY_BY_ID.get('7')!;
  if (q === 'suspended') return FAMILY_BY_ID.get('sus')!;
  return FAMILY_BY_ID.get('major')!;
}

/** The catalog types of a family, in display order. */
export function familyTypes(family: ChordFamily): ChordType[] {
  return family.types.map((id) => getChordType(id)).filter((t): t is ChordType => !!t);
}

// ---------------------------------------------------------------------------------------------
// Roots and spelling
// ---------------------------------------------------------------------------------------------

/** How each of the twelve roots is spelled for chords that lean major (flats for the black keys, F# for the sixth). */
const MAJOR_SPELLING = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
/** Minor-type chords: the spellings guitarists read on charts (C#m, G#m, but Ebm and Bbm). */
const MINOR_SPELLING = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

/** The twelve roots as chips: pitch class and a label that names both spellings where they differ. */
export const ROOTS: ReadonlyArray<{ pc: number; label: string; slug: string }> = [
  { pc: 0, label: 'C', slug: 'c' },
  { pc: 1, label: 'C♯/D♭', slug: 'c-sharp' },
  { pc: 2, label: 'D', slug: 'd' },
  { pc: 3, label: 'E♭', slug: 'eb' },
  { pc: 4, label: 'E', slug: 'e' },
  { pc: 5, label: 'F', slug: 'f' },
  { pc: 6, label: 'F♯', slug: 'f-sharp' },
  { pc: 7, label: 'G', slug: 'g' },
  { pc: 8, label: 'G♯/A♭', slug: 'ab' },
  { pc: 9, label: 'A', slug: 'a' },
  { pc: 10, label: 'B♭', slug: 'bb' },
  { pc: 11, label: 'B', slug: 'b' },
];

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Pitch class of a root name (`F#` -> 6). */
export function rootPc(root: string): number {
  const base = LETTER_PC[root.charAt(0).toUpperCase()] ?? 0;
  let alt = 0;
  for (const ch of root.slice(1)) alt += ch === '#' ? 1 : ch === 'b' ? -1 : 0;
  return (((base + alt) % 12) + 12) % 12;
}

/** The usual spelling of a root for a chord type: Db major but C#m, Ab but G#m. */
export function spellRoot(pc: number, type: ChordType | string): string {
  const t = typeof type === 'string' ? getChordType(type) : type;
  const minorish = t ? t.quality === 'minor' || t.quality === 'diminished' || t.quality === 'half-diminished' : false;
  const i = ((pc % 12) + 12) % 12;
  return (minorish ? MINOR_SPELLING : MAJOR_SPELLING)[i];
}

/** A chord symbol from a root pitch class and a type: `symbolFor(1, 'minor')` -> `C#m`. */
export function symbolFor(pc: number, type: ChordType | string): string {
  const t = typeof type === 'string' ? getChordType(type) : type;
  if (!t) throw new RangeError(`Unknown chord type: ${String(type)}`);
  return `${spellRoot(pc, t)}${t.symbol}`;
}

/** The twelve chords of one type, C first. */
export function chordsOfType(type: ChordType | string): string[] {
  return ROOTS.map((r) => symbolFor(r.pc, type));
}

/** The chords on one root, family by family (everyday types first; `maxTier` hides the rare ones). */
export function chordsOnRoot(pc: number, opts: { maxTier?: number } = {}): Array<{ family: ChordFamily; chords: string[] }> {
  const maxTier = opts.maxTier ?? 4;
  return FAMILIES.map((family) => ({
    family,
    chords: familyTypes(family)
      .filter((t) => t.tier <= maxTier)
      .map((t) => symbolFor(pc, t)),
  })).filter((g) => g.chords.length > 0);
}

// ---------------------------------------------------------------------------------------------
// The first-chords path
// ---------------------------------------------------------------------------------------------

/** One stage of the path. */
export interface PathStage {
  id: string;
  title: string;
  blurb: string;
  chords: string[];
}

/**
 * The chords a beginner needs, in the order they are usually learned: two-finger minor chords
 * first, then the open majors of the common keys, then F, the dominant sevenths, colour chords,
 * power chords and the first barres.
 */
export const PATH: readonly PathStage[] = [
  {
    id: 'first',
    title: 'Your first seven',
    blurb: 'Open chords that let the strings ring. With these you can play hundreds of songs.',
    chords: ['Em', 'Am', 'E', 'A', 'D', 'G', 'C'],
  },
  {
    id: 'next',
    title: 'Next steps',
    blurb: 'D minor, the famous F, and the seventh chords that pull a song back home.',
    chords: ['Dm', 'F', 'E7', 'A7', 'D7', 'G7', 'B7', 'C7'],
  },
  {
    id: 'colour',
    title: 'Colour chords',
    blurb: 'Small changes to shapes you know that make a song sound richer.',
    chords: ['Am7', 'Em7', 'Dm7', 'Cmaj7', 'Fmaj7', 'Asus2', 'Asus4', 'Dsus2', 'Dsus4', 'Cadd9'],
  },
  {
    id: 'barre',
    title: 'Power chords and barres',
    blurb: 'Movable shapes: learn one and you can play it in every key.',
    chords: ['E5', 'A5', 'Bm', 'F#m', 'B', 'Bb', 'C#m', 'Gm', 'Cm'],
  },
];

/** The whole path in learning order. */
export const FIRST_CHORDS: readonly string[] = PATH.flatMap((s) => s.chords);

/** Where a chord sits in the learning order (0 = first), or -1 when it is not on the path. */
export function learningIndex(symbol: string): number {
  return FIRST_CHORDS.indexOf(symbol);
}

/** The first chord on the path the learner has not marked as known, or null when all are known. */
export function nextToLearn(known: ReadonlySet<string>): string | null {
  return FIRST_CHORDS.find((c) => !known.has(c)) ?? null;
}

/** How far along a stage is: known chords out of all. */
export function stageProgress(stage: PathStage, known: ReadonlySet<string>): { known: number; total: number } {
  return { known: stage.chords.filter((c) => known.has(c)).length, total: stage.chords.length };
}

// ---------------------------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------------------------

/** One search result. */
export type SearchHit =
  | { kind: 'chord'; symbol: string; exact: boolean }
  | { kind: 'type'; type: ChordType; family: ChordFamily }
  | { kind: 'root'; pc: number };

const ROOT_RE = /^([A-G](?:##|bb|#|b)?)(.*)$/;

/**
 * Search the library. A symbol (`F#m7b5`, `Bb/D`, `am`) finds that chord first, then its
 * neighbours on the same root; a root with the start of a suffix (`Cma`) completes it; a name
 * (`minor seventh`, `half diminished`, `sus`) finds chord types.
 */
export function searchChords(query: string, limit = 24): SearchHit[] {
  const raw = query.trim();
  if (!raw) return [];
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  const addChord = (symbol: string, exact: boolean) => {
    if (seen.has(symbol) || hits.length >= limit) return;
    seen.add(symbol);
    hits.push({ kind: 'chord', symbol, exact });
  };

  const typed = normaliseTyped(raw);
  const parsed = readSymbol(raw);
  const rootMatch = ROOT_RE.exec(typed.split('/')[0]);
  const looksLikeSymbol = !!rootMatch && /^[A-Ga-g]/.test(raw) && !/\s/.test(raw.replace(/\s+$/, ''));

  if (parsed) addChord(parsed.symbol, true);
  if (looksLikeSymbol && rootMatch && !typed.includes('/')) {
    const root = rootMatch[1];
    const suffix = rootMatch[2].toLowerCase();
    if (parseChord(root)) {
      // Complete the suffix: every catalog type whose symbol or alias starts with what was typed.
      const completions = CHORD_TYPES.filter((t) => {
        if (!suffix) return t.tier <= 2;
        if (t.symbol.toLowerCase().startsWith(suffix)) return true;
        return t.aliases.some((a) => a.toLowerCase().startsWith(suffix) && a.length > 0);
      }).sort((a, b) => a.tier - b.tier || a.symbol.length - b.symbol.length);
      for (const t of completions) {
        const c = parseChord(`${root}${t.symbol}`);
        if (c) addChord(c.symbol, false);
      }
    }
  }
  if (hits.length === 0 || !looksLikeSymbol) {
    // Words: chord-type names and aliases ("half diminished" finds "half-diminished seventh").
    const words = raw.toLowerCase().replace(/[-_]/g, ' ').split(/\s+/).filter(Boolean);
    const plain = (s: string) => s.toLowerCase().replace(/[-_]/g, ' ');
    const byWords = CHORD_TYPES.filter((t) => words.every((w) => plain(t.name).split(' ').some((p) => p.startsWith(w)) || t.aliases.some((a) => plain(a) === w)));
    const types = [...byWords.sort((a, b) => a.tier - b.tier), ...searchChordTypes(raw)].filter((t, i, list) => list.indexOf(t) === i).slice(0, 8);
    for (const t of types) {
      if (hits.length >= limit) break;
      hits.push({ kind: 'type', type: t, family: familyOfType(t) });
    }
  }
  return hits;
}

/**
 * Chord symbols as the chord screen uses them: route params, skill ids and display text.
 *
 * Route params come from the theory module's `chordSlug` (`g-major`, `f-sharp-m7b5`), with a
 * slash bass written `-over-` (`c-major-over-e`). Reading is forgiving, because other screens link
 * here with the progress module's skill slugs (`g`, `em`, `f-sharp-m`, `b-flat`, `c-e`) and people
 * type addresses by hand (`#chords--g`, `#chords--f-sharp-m7`).
 *
 * Skill ids follow the convention the progress, practice and profile modules already read:
 * lower-case, a natural root glued to its suffix (`chord:am7`), an altered root spelled out with
 * hyphens (`chord:f-sharp-m`, `chord:b-flat`), a slash bass after a hyphen (`chord:c-e`).
 */
import { chordFromSlug, chordSlug, formatChord, getChordType, noteFromSlug, noteSlug, parseChord, type Chord } from '@/core/theory';

/** Parse a chord symbol, or null. Accepts what people type: lower-case roots, ♯ ♭, spaces. */
export function readSymbol(input: string): Chord | null {
  const text = normaliseTyped(input);
  if (!text) return null;
  return parseChord(text);
}

/** Tidy a typed symbol: Unicode accidentals to ASCII, the root (and a slash bass) upper-cased. */
export function normaliseTyped(input: string): string {
  let text = input.trim().replace(/♯/g, '#').replace(/♭/g, 'b').replace(/\s+/g, '');
  if (!text) return '';
  text = text.charAt(0).toUpperCase() + text.slice(1);
  text = text.replace(/\/([a-g])/, (_m, bass: string) => `/${bass.toUpperCase()}`);
  return text;
}

/** The canonical ASCII symbol of a chord-like input; throws `RangeError` for nonsense. */
export function canonical(input: string | Chord): string {
  if (typeof input !== 'string') return input.symbol;
  const c = readSymbol(input);
  if (!c) throw new RangeError(`Not a chord: ${input}`);
  return c.symbol;
}

/** Display text: `F#m7b5` -> `F♯m7♭5`. Never throws. */
export function displaySymbol(symbol: string, opts: { system?: 'letters' | 'solfege' | 'german' } = {}): string {
  try {
    return formatChord(symbol, { system: opts.system });
  } catch {
    return symbol;
  }
}

const SAFE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The route param for a chord page: `g-major`, `f-sharp-m7b5`, `c-major-over-e`. */
export function chordParam(input: string | Chord): string {
  const c = typeof input === 'string' ? readSymbol(input) : input;
  if (!c) throw new RangeError(`Not a chord: ${String(input)}`);
  const base = c.bass ? parseChord(c.symbol.split('/')[0]) : c;
  let body = '';
  try {
    body = base ? chordSlug(base) : '';
  } catch {
    body = '';
  }
  if (!SAFE.test(body)) body = skillSlug(base ?? c);
  return c.bass ? `${body}-over-${noteSlug(c.bass)}` : body;
}

/** Suffix used in skill slugs: `''` for major, `m` for minor, the catalog id otherwise. */
function skillSuffix(c: Chord): string {
  if (c.type.id === 'major') return '';
  if (c.type.id === 'minor') return 'm';
  if (!c.type.custom) return c.type.id;
  // A symbol the catalog lacks (`C7no5`): its suffix, made slug-safe.
  const suffix = c.symbol.split('/')[0].slice(c.root.length);
  return suffix.toLowerCase().replace(/#/g, 'sharp').replace(/[^a-z0-9]+/g, '');
}

/** A note as skill slugs write it: `c`, `f-sharp`, `b-flat`. */
function skillNote(note: string): string {
  const letter = note.charAt(0).toLowerCase();
  const acc = note.slice(1);
  const sharps = (acc.match(/#/g) ?? []).length;
  const flats = (acc.match(/b/g) ?? []).length;
  return letter + '-sharp'.repeat(sharps) + '-flat'.repeat(flats);
}

/** The lower-case slug used in skill ids: `em`, `am7`, `f-sharp-m`, `b-flat`, `c-e`. */
export function skillSlug(input: string | Chord): string {
  const c = typeof input === 'string' ? readSymbol(input) : input;
  if (!c) throw new RangeError(`Not a chord: ${String(input)}`);
  const root = skillNote(c.root);
  const suffix = skillSuffix(c);
  const altered = root.includes('-');
  let out = suffix ? (altered ? `${root}-${suffix}` : `${root}${suffix}`) : root;
  if (c.bass) out += `-${skillNote(c.bass)}`;
  return out;
}

/** `chord:<slug>`: the skill a chord's practice and "I know this" flag go to. */
export function chordSkillId(input: string | Chord): string {
  return `chord:${skillSlug(input)}`;
}

/** Read a skill slug back (`f-sharp-m` -> `F#m`, `c-e` -> `C/E`), or null. */
export function fromSkillSlug(slugText: string): Chord | null {
  const text = slugText.trim().toLowerCase();
  const m = /^([a-g])((?:-sharp|-flat)*)(.*)$/.exec(text);
  if (!m) return null;
  let rootSlug = m[1] + m[2];
  let rest = m[3];
  // A flat written as a bare `b` right after the letter (`bb`, `eb-m7`, `abm`): no suffix starts with b.
  if (!m[2] && rest.startsWith('b')) {
    rootSlug += 'b';
    rest = rest.slice(1);
  }
  rest = rest.replace(/^-/, '');
  // A slash bass is the last hyphenated part when it is a note: `c-e`, `am7-g`, `d-f-sharp`.
  let bass: string | null = null;
  const slash = /(?:^|-)([a-g](?:-sharp|-flat|b)*)$/.exec(rest);
  if (slash) {
    const maybeBass = noteFromSlug(slash[1]);
    if (maybeBass) {
      bass = maybeBass;
      rest = rest.slice(0, slash.index);
    }
  }
  const root = noteFromSlug(rootSlug);
  if (!root) return null;
  let suffix = '';
  if (rest === '' || rest === 'major' || rest === 'maj') suffix = '';
  else if (rest === 'm' || rest === 'minor' || rest === 'min') suffix = 'm';
  else {
    const type = getChordType(rest);
    if (type) suffix = type.symbol;
    else suffix = rest.replace(/sharp/g, '#').replace(/-/g, '');
  }
  return parseChord(`${root}${suffix}${bass ? `/${bass}` : ''}`);
}

/** Fixed sub-screens of the chord route. */
export type ChordView =
  | { view: 'library' }
  | { view: 'chord'; symbol: string; voicing: number | null }
  | { view: 'trainer'; chords: string[] }
  | { view: 'identify'; shape: string | null }
  | { view: 'mine' }
  | { view: 'type'; family: string }
  | { view: 'root'; root: string };

/** Turn the route params into a view. Unknown params fall back to the library, never a dead end. */
export function viewFromParams(params: readonly string[]): ChordView {
  const [first = '', ...rest] = params;
  switch (first) {
    case '':
      return { view: 'library' };
    case 'trainer':
    case 'changes':
      return { view: 'trainer', chords: rest.map(chordFromParam).filter((s): s is string => !!s).slice(0, 4) };
    case 'identify':
    case 'name':
    case 'shape':
      return { view: 'identify', shape: rest[0] ?? null };
    case 'mine':
    case 'my-chords':
      return { view: 'mine' };
    case 'type':
      return rest[0] ? { view: 'type', family: rest[0] } : { view: 'library' };
    case 'root':
      return rest[0] && noteFromSlug(rest[0]) ? { view: 'root', root: noteFromSlug(rest[0])! } : { view: 'library' };
    default: {
      const symbol = chordFromParam(first);
      if (!symbol) return { view: 'library' };
      const n = Number(rest[0]);
      return { view: 'chord', symbol, voicing: Number.isInteger(n) && n >= 1 ? n : null };
    }
  }
}

/** A route param (any of the accepted spellings) as a canonical chord symbol, or null. */
export function chordFromParam(param: string): string | null {
  const p = param.trim().toLowerCase();
  if (!p || !SAFE.test(p)) return null;
  const over = p.split('-over-');
  if (over.length === 2) {
    const base = chordFromParam(over[0]);
    const bass = noteFromSlug(over[1]);
    if (!base || !bass) return null;
    return parseChord(`${base}/${bass}`)?.symbol ?? null;
  }
  const bySlug = chordFromSlug(p);
  if (bySlug) return bySlug.symbol;
  return fromSkillSlug(p)?.symbol ?? null;
}

/** A chord type's suffix for display (`m7♭5`, `maj7`), or `major` for the plain triad. */
export function typeLabel(typeSymbol: string): string {
  return displaySymbol(`C${typeSymbol}`).slice(1) || 'major';
}

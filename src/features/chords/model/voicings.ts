/**
 * The voicings a chord page shows: the guitar engine's curated library shapes (open, E- and
 * A-shape barres, CAGED, shells, jazz grips, drop 2 / drop 3, triads on every string set, power
 * chords), topped up with the generator's best shapes when the library is thin. Grouped the way a
 * teacher would present them, each group easiest first.
 */
import { beginnerVoicing, checkVoicingFingering, chordVoicings, difficultyLevel, formatFrets, libraryVoicings, type Voicing } from '@/core/guitar';
import { parseChord } from '@/core/theory';

/** The four groups on a chord page. */
export type VoicingGroupId = 'whole' | 'jazz' | 'drop' | 'triad';

/** A group of voicings with its heading. */
export interface VoicingGroup {
  id: VoicingGroupId;
  title: string;
  blurb: string;
  voicings: Voicing[];
}

/** Everything a chord page needs about shapes. */
export interface VoicingSet {
  symbol: string;
  groups: VoicingGroup[];
  /** Every voicing in display order (the order the arrow keys walk). */
  all: Voicing[];
  /** Set when there is no practical shape, or when the shapes leave tones out. */
  note: string | null;
}

const GROUPS: Record<VoicingGroupId, { title: string; blurb: string; max: number }> = {
  whole: { title: 'Whole chord', blurb: 'Open, barre and CAGED shapes: the full chord across most of the strings.', max: 8 },
  jazz: { title: 'Shells and jazz grips', blurb: 'Three or four notes, the root on string 6, 5 or 4: the third and seventh carry the sound.', max: 6 },
  drop: { title: 'Drop 2 and drop 3', blurb: 'Four-note shapes on neighbouring strings: smooth to move between, the jazz guitarist’s staple.', max: 6 },
  triad: { title: 'Triads on string sets', blurb: 'Three strings at a time, anywhere on the neck: small, clear shapes for fills and second guitar parts.', max: 8 },
};

const GROUP_ORDER: VoicingGroupId[] = ['whole', 'jazz', 'drop', 'triad'];

/** Which group a voicing category belongs to. */
export function groupOf(v: Pick<Voicing, 'category'>): VoicingGroupId {
  switch (v.category) {
    case 'shell':
    case 'jazz':
      return 'jazz';
    case 'drop2':
    case 'drop3':
      return 'drop';
    case 'triad':
      return 'triad';
    default:
      return 'whole';
  }
}

/** True when a voicing can be fingered by the engine's hand rules (every fretted note has a finger). */
export function isPlayable(v: Voicing): boolean {
  const fingered = v.frets.every((f, i) => f === null || f === 0 || v.fingers[i] !== null);
  return fingered && v.difficulty <= 9 && checkVoicingFingering(v.frets, v.fingers).length === 0;
}

/** A short line about how hard a voicing is: `Easy`, `Medium`, `Hard`, `Expert`. */
export function difficultyWord(v: Pick<Voicing, 'difficulty'>): 'Easy' | 'Medium' | 'Hard' | 'Expert' {
  const level = difficultyLevel(v.difficulty);
  return level === 'easy' ? 'Easy' : level === 'medium' ? 'Medium' : level === 'hard' ? 'Hard' : 'Expert';
}

/** A human label for a voicing: the engine's label, with the frets for generated shapes. */
export function voicingLabel(v: Voicing): string {
  if (v.source === 'generated' && v.category === 'generated') return `${v.label} (${formatFrets(v.frets)})`;
  return v.label;
}

const cache = new Map<string, VoicingSet>();

/**
 * The voicings for a chord page, cached per symbol and tuning (a tuning id; standard by default).
 * Never throws: a bad symbol gives an empty set with a note.
 */
export function voicingSet(symbol: string, tuning = 'standard'): VoicingSet {
  const key = `${symbol}|${tuning}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const set = buildSet(symbol, tuning);
  cache.set(key, set);
  return set;
}

/** True when the set for this chord is already worked out (no work on the next call). */
export function hasVoicingSet(symbol: string, tuning = 'standard'): boolean {
  return cache.has(`${symbol}|${tuning}`);
}

function buildSet(symbol: string, tuning: string): VoicingSet {
  const parsed = parseChord(symbol);
  if (!parsed) return { symbol, groups: [], all: [], note: `“${symbol}” is not a chord symbol this library knows.` };
  let library: Voicing[] = [];
  let generated: Voicing[] = [];
  try {
    library = libraryVoicings(symbol, { tuning });
  } catch {
    library = [];
  }
  try {
    generated = chordVoicings(symbol, { tuning });
  } catch {
    generated = [];
  }

  const seen = new Set<string>();
  const byGroup: Record<VoicingGroupId, Voicing[]> = { whole: [], jazz: [], drop: [], triad: [] };
  const add = (v: Voicing) => {
    const key = formatFrets(v.frets);
    if (seen.has(key) || !isPlayable(v)) return;
    seen.add(key);
    byGroup[groupOf(v)].push(v);
  };
  for (const v of library) add(v);
  // The generator's shapes that are not plain extras (a shell or drop 2 the library did not list).
  for (const v of generated) if (v.category !== 'generated') add(v);
  // Plain generated shapes only where the library has little to offer.
  const extras = generated.filter((v) => v.category === 'generated' && v.difficulty <= 6).sort((a, b) => a.difficulty - b.difficulty);
  for (const v of extras) {
    if (byGroup.whole.length >= 3) break;
    add(v);
  }
  // Still nothing at all: take whatever the generator found, however hard.
  if (GROUP_ORDER.every((g) => byGroup[g].length === 0)) for (const v of generated) add(v);

  const groups: VoicingGroup[] = [];
  for (const id of GROUP_ORDER) {
    const list = byGroup[id].sort((a, b) => a.difficulty - b.difficulty || a.baseFret - b.baseFret).slice(0, GROUPS[id].max);
    if (list.length) groups.push({ id, title: GROUPS[id].title, blurb: GROUPS[id].blurb, voicings: list });
  }
  const all = groups.flatMap((g) => g.voicings);
  return { symbol, groups, all, note: noteFor(symbol, all) };
}

function noteFor(symbol: string, all: Voicing[]): string | null {
  if (all.length === 0) {
    return `There is no practical shape for ${symbol} in this tuning: its notes cannot be held by one hand at once. Play the simpler chord suggested below, or split it between two instruments.`;
  }
  const first = all[0];
  if (first.omitted.length) {
    const tones = first.omitted.map((d) => (d === '5' ? 'the fifth' : d === '1' ? 'the root' : `the ${d}`));
    return `These shapes leave out ${tones.join(' and ')}. That is normal for big chords: six strings and four fingers cannot hold everything, and the third and seventh carry the sound.`;
  }
  return null;
}

/**
 * Where a chord page opens: on the shape a teacher would show first (the guitar engine's
 * `beginnerVoicing`: the standard open shape, or the easy version of a barre such as the small F),
 * when the set has it; otherwise on the easiest shape. The strip itself stays easiest-first.
 */
export function defaultIndex(symbol: string, tuning = 'standard'): number {
  const set = voicingSet(symbol, tuning);
  if (!set.all.length) return 0;
  let first: Voicing | null = null;
  try {
    first = beginnerVoicing(symbol, { tuning });
  } catch {
    first = null;
  }
  if (!first) return 0;
  const key = formatFrets(first.frets);
  const i = set.all.findIndex((v) => formatFrets(v.frets) === key);
  return i < 0 ? 0 : i;
}

/** The voicing a chord page opens on (see `defaultIndex`), or null. */
export function defaultVoicing(symbol: string, tuning = 'standard'): Voicing | null {
  const set = voicingSet(symbol, tuning);
  return set.all[defaultIndex(symbol, tuning)] ?? null;
}

/** The shape to draw on a library tile: the same as the page opens on. */
export function tileVoicing(symbol: string, tuning = 'standard'): Voicing | null {
  return defaultVoicing(symbol, tuning);
}

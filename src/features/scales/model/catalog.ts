/**
 * The scale catalog as a learner meets it: grouped for humans (Essentials first), searchable by
 * name, alias, tag or style, and with the twelve roots spelled the way each scale wants them.
 * Every scale and every note comes from `@/core/theory`; this file only arranges them.
 */
import { SCALES, chroma, formatNote, getScale, pcToNote, prettyAccidentals, searchScales, simplestTonic, type NoteNaming, type ScaleType } from '@/core/theory';

/** Ids of the scale groups, in the order the picker shows them. */
export type ScaleGroupId = 'essentials' | 'modes' | 'minor' | 'pentatonic' | 'jazz' | 'symmetric' | 'world' | 'harmonic-major';

/** A group of scales in the picker. */
export interface ScaleGroup {
  id: ScaleGroupId;
  title: string;
  /** One line under the group title. */
  description: string;
  scales: ScaleType[];
}

const ESSENTIALS = ['major', 'minor', 'major-pentatonic', 'minor-pentatonic', 'minor-blues', 'major-blues'];
const MODES = ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'minor', 'locrian'];
/** Jazz favourites that live in another family; listed again under Jazz so a jazz player finds them together. */
const JAZZ_FAVOURITES = ['melodic-minor', 'lydian-dominant', 'altered', 'locrian-natural-2', 'diminished-half-whole', 'whole-tone'];
/** Pentatonics from Japan, China and Indonesia: world scales rather than rock boxes. */
const WORLD_PENTATONICS = ['kumoi', 'in-sen', 'hirajoshi', 'iwato', 'in', 'chinese', 'pelog', 'ryukyu'];
/** Minor-family modes with a strong regional sound, listed again under World. */
const WORLD_FAVOURITES = ['phrygian-dominant', 'dorian-sharp-4'];

function byIds(ids: readonly string[]): ScaleType[] {
  return ids.map((id) => getScale(id)).filter((s): s is ScaleType => !!s);
}

function byFamily(...families: string[]): ScaleType[] {
  return SCALES.filter((s) => families.includes(s.family));
}

/** Sort a family's scales by mode number (the parent first), keeping catalog order otherwise. */
function modeOrder(scales: ScaleType[]): ScaleType[] {
  return [...scales].sort((a, b) => (a.parent ?? a.id).localeCompare(b.parent ?? b.id) || (a.mode ?? 0) - (b.mode ?? 0));
}

let cachedGroups: ScaleGroup[] | null = null;

/**
 * The picker's groups, Essentials first. A scale can appear in two groups (Dorian is a mode and
 * a jazz favourite); every scale in the catalog appears in at least one.
 */
export function scaleGroups(): ScaleGroup[] {
  if (cachedGroups) return cachedGroups;
  const essential = new Set(ESSENTIALS);
  const world = new Set(WORLD_PENTATONICS);
  const pentatonics = byFamily('pentatonic', 'blues').filter((s) => !essential.has(s.id) && !world.has(s.id));
  cachedGroups = [
    { id: 'essentials', title: 'Essentials', description: 'The six scales behind most songs. Start here.', scales: byIds(ESSENTIALS) },
    { id: 'modes', title: 'Modes', description: 'The major scale started from each of its seven notes.', scales: byIds(MODES) },
    {
      id: 'minor',
      title: 'Minor family',
      description: 'Harmonic and melodic minor, and the modes they give.',
      scales: [...modeOrder(byFamily('harmonic-minor')), ...modeOrder(byFamily('melodic-minor'))],
    },
    { id: 'pentatonic', title: 'More pentatonics and blues', description: 'Five- and six-note colours beyond the two classic boxes.', scales: pentatonics },
    { id: 'jazz', title: 'Jazz and bebop', description: 'Bebop lines and the scales jazz players reach for over altered chords.', scales: [...byFamily('bebop'), ...byIds(JAZZ_FAVOURITES)] },
    { id: 'symmetric', title: 'Symmetric', description: 'Built from one repeating step pattern: the same shape all over the neck.', scales: byFamily('symmetric') },
    {
      id: 'world',
      title: 'World and exotic',
      description: 'Sounds from Spain, the Balkans, the Middle East, India and Japan, and composers’ inventions.',
      scales: [...byIds(WORLD_FAVOURITES), ...modeOrder(byFamily('double-harmonic')), ...byIds(WORLD_PENTATONICS), ...byFamily('exotic')],
    },
    { id: 'harmonic-major', title: 'Harmonic major family', description: 'Major with a lowered sixth, and its seven modes.', scales: modeOrder(byFamily('harmonic-major')) },
  ];
  return cachedGroups;
}

/** The group a scale belongs to first (the one its own family puts it in). */
export function primaryGroupOf(scaleId: string): ScaleGroup {
  const groups = scaleGroups();
  return groups.find((g) => g.scales.some((s) => s.id === scaleId)) ?? groups[0];
}

/** Lowercase, accents and punctuation folded, so "Phrygian ♭2" and "phrygian b2" match. */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/♭/g, 'b')
    .replace(/♯/g, '#')
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, ' ')
    .trim();
}

/**
 * Scales matching what a learner types: names and aliases first (from the theory engine's search),
 * then tags, styles and group names ("spanish", "japanese", "jazz", "modes"). Empty text gives
 * every scale. Results never repeat a scale.
 */
export function findScales(query: string): ScaleType[] {
  const q = fold(query);
  if (!q) return [...SCALES];
  const out: ScaleType[] = [];
  const seen = new Set<string>();
  const add = (s: ScaleType) => {
    if (seen.has(s.id)) return;
    seen.add(s.id);
    out.push(s);
  };
  for (const s of searchScales(query)) add(s);
  const words = q.split(' ');
  const matches = (hay: string) => words.every((w) => hay.includes(w));
  for (const s of SCALES) {
    const hay = fold([s.name, s.id, ...s.aliases, ...s.tags, ...s.genres, s.quality].join(' '));
    if (matches(hay)) add(s);
  }
  for (const g of scaleGroups()) if (matches(fold(g.title))) for (const s of g.scales) add(s);
  return out;
}

/** One of the twelve roots, spelled for a scale. */
export interface RootChoice {
  /** Pitch class 0–11 (C = 0). */
  pc: number;
  /** ASCII spelling the scale reads best from (`Bb` for B♭ major, `A#` never). */
  tonic: string;
  /** Display text in the reader's naming (`B♭`, `Si♭`). */
  label: string;
}

/** The twelve roots from C, each spelled with the fewest accidentals for this scale. */
export function rootChoices(scale: string | ScaleType, naming: NoteNaming = 'letters'): RootChoice[] {
  return Array.from({ length: 12 }, (_unused, pc) => {
    let tonic: string;
    try {
      tonic = simplestTonic(pc, scale);
    } catch {
      tonic = pcToNote(pc, 'auto');
    }
    return { pc, tonic, label: formatNote(tonic, { system: naming }) };
  });
}

/** The root a semitone up (+1) or down (-1), spelled for the scale. */
export function stepRoot(tonic: string, scale: string | ScaleType, delta: number): string {
  const choices = rootChoices(scale);
  const pc = chroma(tonic);
  return choices[(((pc + delta) % 12) + 12) % 12].tonic;
}

/** Short tier wording for the picker: who a scale is for. */
export function tierLabel(tier: number): string {
  if (tier <= 1) return 'Start here';
  if (tier === 2) return 'Next steps';
  if (tier === 3) return 'Advanced';
  return 'Specialist';
}

/** First words of scale names that are ordinary words, written in lower case after a root ("A minor pentatonic"). */
const COMMON_FIRST_WORDS = new Set([
  'major', 'minor', 'natural', 'melodic', 'harmonic', 'whole', 'chromatic', 'diminished', 'augmented', 'bebop',
  'combined', 'dominant', 'six-tone', 'leading', 'tritone', 'double', 'altered', 'suspended',
]);

/** A scale's name as it reads after a root: "minor pentatonic", "Dorian", "Lydian ♯2". */
export function displayScaleName(scale: ScaleType): string {
  const name = prettyAccidentals(scale.name);
  const first = name.split(' ')[0].toLowerCase();
  return COMMON_FIRST_WORDS.has(first) ? name.charAt(0).toLowerCase() + name.slice(1) : name;
}

/** Root and scale for a title: "A minor pentatonic", "F♯ Dorian", "B♭ Lydian ♯2". */
export function scaleTitle(tonic: string, scale: ScaleType, naming: NoteNaming = 'letters'): string {
  return `${formatNote(tonic, { system: naming })} ${displayScaleName(scale)}`;
}

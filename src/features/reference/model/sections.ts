/**
 * The shelves of the Reference and the addresses that open them.
 *
 *   #reference                         the list of sections (phones) / the circle of fifths (wide screens)
 *   #reference--circle                 one section
 *   #reference--circle--e-minor        one section opened on one item (a key, an interval, a term …)
 *
 * The item param is whatever the section uses as an id (`g-major`, `m3`, `maj7`, `dorian`,
 * `drop-d`, `barre`, `staccato`); a section that does not know it simply opens at the top.
 */

/** The id of a Reference section (its route param). */
export type SectionId = 'circle' | 'keys' | 'intervals' | 'chords' | 'scales' | 'harmony' | 'notation' | 'tunings' | 'glossary';

/** One shelf of the Reference. */
export interface SectionInfo {
  id: SectionId;
  /** Name in the list and as the page title. */
  title: string;
  /** One line under the title in the list. */
  blurb: string;
  /** Bundled lucide icon name. */
  icon: string;
}

/** Every section, in the order of the list. */
export const SECTIONS: readonly SectionInfo[] = [
  { id: 'circle', title: 'Circle of fifths', blurb: 'Pick a key: its signature, chords, neighbours and notes on the neck.', icon: 'CircleDot' },
  { id: 'keys', title: 'Key signatures', blurb: 'All 30 keys, the order of sharps and flats, and how to name a key.', icon: 'KeyRound' },
  { id: 'intervals', title: 'Intervals', blurb: 'Every distance from unison to octave: names, sounds and neck shapes.', icon: 'Ruler' },
  { id: 'chords', title: 'Chord formulas', blurb: 'Every chord type with its formula, notes and a shape to play.', icon: 'Grid3x3' },
  { id: 'scales', title: 'Scale formulas', blurb: 'Every scale and mode with its formula and step pattern.', icon: 'Waypoints' },
  { id: 'harmony', title: 'Chords in every key', blurb: 'The diatonic chords of all major and minor keys, with numerals.', icon: 'Table' },
  { id: 'notation', title: 'Notation and tab', blurb: 'Note values, rests, signs, dynamics and every tab symbol.', icon: 'FileMusic' },
  { id: 'tunings', title: 'Tunings', blurb: 'Standard, drop, open and more: the notes and what each is for.', icon: 'SlidersHorizontal' },
  { id: 'glossary', title: 'Glossary', blurb: 'Every word the lessons use, in one line each.', icon: 'BookA' },
];

const BY_ID = new Map<string, SectionInfo>(SECTIONS.map((s) => [s.id, s]));

/** A section by id, or null. */
export function sectionById(id: string | null | undefined): SectionInfo | null {
  return id ? BY_ID.get(id) ?? null : null;
}

/** Where the Reference is: a section (or none: the list) and an optional item inside it. */
export interface ReferenceAddress {
  section: SectionId | null;
  item: string | null;
}

/** Read the route params. Unknown sections fall back to the list; extra params are ignored. */
export function parseReferenceParams(params: readonly string[]): ReferenceAddress {
  const section = sectionById(params[0]);
  if (!section) return { section: null, item: null };
  const item = params[1] && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(params[1]) ? params[1] : null;
  return { section: section.id, item };
}

/** Route params for an address (`['keys', 'g-major']`). */
export function referenceParams(section: SectionId, item?: string | null): string[] {
  return item ? [section, item] : [section];
}

/** The section a wide screen shows when the address names none. */
export const DEFAULT_SECTION: SectionId = 'circle';

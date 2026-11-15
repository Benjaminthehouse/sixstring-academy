/**
 * The chord-progression catalog: authored data (one file per family under `data/`), lookups by
 * id, style, level and family, and the bridge to music: resolve a progression in any key with the
 * theory engine and hand the bars to the BackingBand. `API.md` beside this file is the digest.
 */
import type { BackingBar, BackingOptions, BackingStyleId } from '@/core/audio';
import { BLUES } from './data/blues';
import { BORROWED } from './data/borrowed';
import { CLASSICAL } from './data/classical';
import { FIFTIES } from './data/fifties';
import { FLAMENCO } from './data/flamenco';
import { FOLK_COUNTRY } from './data/folk-country';
import { FUNK_SOUL } from './data/funk-soul';
import { JAZZ } from './data/jazz';
import { LATIN } from './data/latin';
import { METAL } from './data/metal';
import { MINOR_POP } from './data/minor-pop';
import { MODAL } from './data/modal';
import { POP_ROCK } from './data/pop-rock';
import { REGGAE_SKA } from './data/reggae-ska';
import { SECONDARY } from './data/secondary';
import {
  homeKey, parseChart, resolveProgression, scalesInKey, toBackingBars,
  type ConcreteScale, type ResolvedProgression,
} from './resolve';
import type { Progression, ProgressionFamily, ProgressionFeel, ProgressionSpec, ProgressionStyle } from './types';

export type * from './types';
export {
  TONALITY_NAME, TONALITY_SCALE, bestTonic, formatSlot, homeKey, keyChoices, keyModeFor, parseChart, parseSlot,
  resolveProgression, resolveSlot, scalesInKey, splitBeats, toBackingBars, tonicSpellings,
} from './resolve';
export type { ConcreteScale, HomeKey, ResolvedChord, ResolvedProgression } from './resolve';

/** Display information for a style, in browsing order. */
export interface StyleInfo {
  id: ProgressionStyle;
  name: string;
  description: string;
}

/** The styles, in the order a browser should show them. */
export const PROGRESSION_STYLES: readonly StyleInfo[] = [
  { id: 'pop', name: 'Pop', description: 'The loops behind most songs on the radio.' },
  { id: 'rock', name: 'Rock', description: 'Three-chord rock and roll, Mixolydian swagger and power-chord riffs.' },
  { id: 'blues', name: 'Blues', description: 'Twelve bars and their relatives: the form under rock, jazz and soul.' },
  { id: 'folk', name: 'Folk', description: 'Two- and three-chord songs, hymns, ballads and modal tunes.' },
  { id: 'country', name: 'Country', description: 'Boom-chick grooves, walking basses and the II7 chord.' },
  { id: 'doo-wop', name: 'Fifties and doo-wop', description: 'The ice-cream changes and the slow dance in 12/8.' },
  { id: 'jazz', name: 'Jazz', description: 'ii–V–I, turnarounds, rhythm changes, substitutions and modal forms.' },
  { id: 'latin', name: 'Latin and bossa nova', description: 'Montunos, minor vamps and the gliding chords of bossa nova.' },
  { id: 'funk', name: 'Funk', description: 'One-chord vamps and dominant grooves where rhythm is everything.' },
  { id: 'soul', name: 'Soul', description: 'Warm sevenths, borrowed chords and gospel-born cadences.' },
  { id: 'rnb', name: 'R&B', description: 'Smooth seventh-chord loops and soft landings.' },
  { id: 'gospel', name: 'Gospel', description: 'Walking basses, passing chords and the Amen.' },
  { id: 'reggae', name: 'Reggae', description: 'Two-chord one-drop grooves with the skank on 2 and 4.' },
  { id: 'ska', name: 'Ska', description: 'Turnarounds with up-strokes on every off-beat.' },
  { id: 'metal', name: 'Metal', description: 'Minor-key power chords, Phrygian and Locrian darkness, harmonic-minor drama.' },
  { id: 'flamenco', name: 'Flamenco and Spanish', description: 'The Andalusian cadence and the Phrygian half step.' },
  { id: 'classical', name: 'Classical and baroque', description: 'Sequences, grounds, cadences and galant patterns.' },
  { id: 'modal', name: 'Modal', description: 'One progression per mode, built on the chord that gives the mode away.' },
];

/** Display information for a family (the catalog's chapters). */
export interface FamilyInfo {
  id: ProgressionFamily;
  name: string;
  description: string;
}

const FAMILY_DATA: ReadonlyArray<[FamilyInfo, readonly ProgressionSpec[]]> = [
  [{ id: 'pop-rock', name: 'Pop and rock staples', description: 'The axis loop and its rotations, three-chord rock, Mixolydian rock, rising fifths.' }, POP_ROCK],
  [{ id: 'fifties', name: 'Fifties and doo-wop', description: 'I–vi–IV–V and its relatives.' }, FIFTIES],
  [{ id: 'blues', name: 'Blues forms', description: '12-bar, quick change, turnarounds, minor, 8- and 16-bar, jazz and Bird blues.' }, BLUES],
  [{ id: 'folk-country', name: 'Folk and country', description: 'Two- and three-chord songs, hymns, walking basses, modal folk.' }, FOLK_COUNTRY],
  [{ id: 'minor-pop', name: 'Minor-key pop', description: 'Loops built from the natural minor scale.' }, MINOR_POP],
  [{ id: 'borrowed', name: 'Borrowed chords', description: 'Colours from the parallel minor inside a major key.' }, BORROWED],
  [{ id: 'secondary', name: 'Secondary dominants and line clichés', description: 'Chords that point at other chords, and lines that move inside one chord.' }, SECONDARY],
  [{ id: 'modal', name: 'Modal progressions', description: 'Each mode and its characteristic chord.' }, MODAL],
  [{ id: 'funk-soul', name: 'Funk, soul, R&B and gospel', description: 'Vamps, grooves, smooth sevenths and gospel runs.' }, FUNK_SOUL],
  [{ id: 'reggae-ska', name: 'Reggae and ska', description: 'One-drop grooves and the ska turnaround.' }, REGGAE_SKA],
  [{ id: 'latin', name: 'Latin and bossa nova', description: 'Montunos, minor vamps, bossa nova patterns.' }, LATIN],
  [{ id: 'flamenco', name: 'Flamenco and Spanish', description: 'The Andalusian cadence and its guitar keys.' }, FLAMENCO],
  [{ id: 'metal', name: 'Metal and hard rock', description: 'Power chords, Phrygian and Locrian colours.' }, METAL],
  [{ id: 'jazz', name: 'Jazz', description: 'ii–V–I, turnarounds, rhythm changes, substitutions, Coltrane cycles, modal forms.' }, JAZZ],
  [{ id: 'classical', name: 'Classical and baroque', description: 'Sequences, grounds, cadences, galant patterns.' }, CLASSICAL],
];

/** The families in catalog order. */
export const PROGRESSION_FAMILIES: readonly FamilyInfo[] = FAMILY_DATA.map(([info]) => info);

function build(family: ProgressionFamily, spec: ProgressionSpec): Progression {
  return Object.freeze({ ...spec, family, bars: Object.freeze(parseChart(spec.chart).map((bar) => Object.freeze(bar))) });
}

/** Every progression, in catalog order (family by family, as authored). */
export const PROGRESSIONS: readonly Progression[] = Object.freeze(
  FAMILY_DATA.flatMap(([info, specs]) => specs.map((s) => build(info.id, s))),
);

const BY_ID = new Map(PROGRESSIONS.map((p) => [p.id, p]));

const byLevel = (a: Progression, b: Progression): number => a.level - b.level;

/** A progression by id, or null. */
export function getProgression(id: string): Progression | null {
  return BY_ID.get(id) ?? null;
}

/** A progression by id; throws RangeError for an unknown id. */
export function progression(id: string): Progression {
  const p = BY_ID.get(id);
  if (!p) throw new RangeError(`Unknown progression: "${id}"`);
  return p;
}

/** Progressions of one style, easiest first (stable within a level). */
export function progressionsByStyle(style: ProgressionStyle): Progression[] {
  return PROGRESSIONS.filter((p) => p.styles.includes(style)).sort(byLevel);
}

/** Progressions whose level lies in [min, max] (one level when max is omitted), easiest first. */
export function progressionsByLevel(min: number, max: number = min): Progression[] {
  return PROGRESSIONS.filter((p) => p.level >= min && p.level <= max).sort(byLevel);
}

/** Progressions of one family, in authored order. */
export function progressionsByFamily(family: ProgressionFamily): Progression[] {
  return PROGRESSIONS.filter((p) => p.family === family);
}

/** The related progressions of one entry, as entries. */
export function relatedProgressions(p: Progression | string): Progression[] {
  const entry = typeof p === 'string' ? progression(p) : p;
  return entry.related.map((id) => BY_ID.get(id)).filter((x): x is Progression => !!x);
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Case- and accent-insensitive search over names, other names, ids, styles and song titles. */
export function searchProgressions(text: string): Progression[] {
  const words = fold(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return PROGRESSIONS.filter((p) => {
    const hay = fold([p.id, p.name, ...(p.aka ?? []), ...p.styles, p.chart, ...(p.heardIn ?? []).map((h) => h.title)].join(' '));
    return words.every((w) => hay.includes(w));
  }).sort(byLevel);
}

// An accidental at the start of a word, before a numeral that is not the start of an ordinary word.
const NAME_ACCIDENTAL = /(^|[\s(–/-])([b#])(?=(?:VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(?![a-ln-z]))/g;

/** A name with music signs: `'I–bVII–IV'` -> `'I–♭VII–IV'` (only accidentals before numerals change). */
export function formatProgressionName(name: string): string {
  return name.replace(NAME_ACCIDENTAL, (_m, pre: string, acc: string) => `${pre}${acc === 'b' ? '♭' : '♯'}`);
}

/** The skill id under which the progress store records jamming over a progression. */
export function progressionSkillId(id: string): string {
  return `progression:${id}`;
}

/** Resolve a progression (or id) in a key; the tonic defaults to its first guitar-friendly key. */
export function progressionInKey(p: Progression | string, tonic?: string, opts: { backing?: BackingStyleId } = {}): ResolvedProgression {
  const entry = typeof p === 'string' ? progression(p) : p;
  return resolveProgression(entry, tonic ?? entry.keys[0], opts);
}

/** The soloing scales of a progression in a key (`tryThis.scales` made concrete). */
export function soloScales(p: Progression | string, tonic?: string): ConcreteScale[] {
  const entry = typeof p === 'string' ? progression(p) : p;
  return scalesInKey(entry.tryThis.scales, homeKey(entry, tonic ?? entry.keys[0]));
}

/** Everything `BackingBand.load(bars, options)` needs, plus the resolved chords for the screen. */
export interface BackingSetup {
  bars: BackingBar[];
  options: BackingOptions;
  resolved: ResolvedProgression;
}

/**
 * Ready-to-play input for the BackingBand: `band.load(setup.bars, setup.options)`. Uses the
 * progression's default feel unless another (for example one of `altFeels`) is given; the tempo
 * defaults to the middle of the feel's range. Extra options (choruses, loop, seed) pass through.
 */
export function backingFor(
  p: Progression | string,
  tonic?: string,
  opts: { feel?: ProgressionFeel; tempo?: number } & Omit<Partial<BackingOptions>, 'style' | 'tempo'> = {},
): BackingSetup {
  const entry = typeof p === 'string' ? progression(p) : p;
  const { feel: chosen, tempo, ...rest } = opts;
  const f = chosen ?? entry.feel;
  const resolved = resolveProgression(entry, tonic ?? entry.keys[0], { backing: f.backing });
  const t = tempo ?? Math.round((f.tempo[0] + f.tempo[1]) / 2);
  return { bars: toBackingBars(resolved), options: { ...rest, style: f.backing, tempo: t }, resolved };
}

/**
 * Browsing the catalog: the style groups a learner picks from, level bands, search, and the short
 * chord sequence a card plays when tapped. Pure.
 */
import {
  PROGRESSIONS, formatProgressionName, formatSlot, progressionInKey, searchProgressions,
  type Progression, type ProgressionStyle,
} from '@/content/progressions';

/** A browsing group: one or more catalog styles under one name. */
export interface StyleGroup {
  id: string;
  name: string;
  /** Catalog styles that belong to the group. */
  styles: readonly ProgressionStyle[];
  /** One line under the group's heading. */
  blurb: string;
  /** lucide icon name. */
  icon: string;
}

/** The groups, in browsing order. */
export const STYLE_GROUPS: readonly StyleGroup[] = [
  { id: 'pop-rock', name: 'Pop and rock', styles: ['pop', 'rock', 'doo-wop'], blurb: 'The loops behind most songs on the radio, three-chord rock and the fifties changes.', icon: 'Radio' },
  { id: 'blues', name: 'Blues', styles: ['blues'], blurb: 'Twelve bars and their relatives: the form under rock, jazz and soul.', icon: 'Guitar' },
  { id: 'folk-country', name: 'Folk and country', styles: ['folk', 'country'], blurb: 'Two- and three-chord songs, hymns, walking basses and modal tunes.', icon: 'Tent' },
  { id: 'jazz', name: 'Jazz', styles: ['jazz'], blurb: 'ii–V–I, turnarounds, rhythm changes and substitutions.', icon: 'Music4' },
  { id: 'classical', name: 'Classical', styles: ['classical'], blurb: 'Sequences, grounds, cadences and galant patterns.', icon: 'Columns3' },
  { id: 'flamenco', name: 'Flamenco', styles: ['flamenco'], blurb: 'The Andalusian cadence and the Phrygian half step.', icon: 'Flame' },
  { id: 'latin', name: 'Latin', styles: ['latin'], blurb: 'Montunos, minor vamps and the gliding chords of bossa nova.', icon: 'Sun' },
  { id: 'funk-soul', name: 'Funk and soul', styles: ['funk', 'soul', 'rnb', 'gospel'], blurb: 'One-chord vamps, warm sevenths and gospel-born cadences.', icon: 'Disc3' },
  { id: 'reggae', name: 'Reggae', styles: ['reggae', 'ska'], blurb: 'Two-chord one-drop grooves and the ska turnaround.', icon: 'Waves' },
  { id: 'metal', name: 'Metal', styles: ['metal'], blurb: 'Power chords, Phrygian and Locrian darkness, harmonic-minor drama.', icon: 'Zap' },
  { id: 'modal', name: 'Modal', styles: ['modal'], blurb: 'One progression per mode, built on the chord that gives the mode away.', icon: 'Compass' },
];

/** A group by id, or null. */
export function styleGroup(id: string | null | undefined): StyleGroup | null {
  return STYLE_GROUPS.find((g) => g.id === id) ?? null;
}

/** The group a progression is filed under first (its most typical style). */
export function primaryGroup(p: Progression): StyleGroup {
  for (const s of p.styles) {
    const g = STYLE_GROUPS.find((x) => x.styles.includes(s));
    if (g) return g;
  }
  return STYLE_GROUPS[0];
}

/** Does a progression belong to a group (through any of its styles)? */
export function inGroup(p: Progression, group: StyleGroup): boolean {
  return p.styles.some((s) => group.styles.includes(s));
}

/** Level bands for the filter. */
export interface LevelBand {
  id: 'beginner' | 'intermediate' | 'advanced';
  name: string;
  min: number;
  max: number;
}

/** Beginner 1–3, intermediate 4–6, advanced 7–10. */
export const LEVEL_BANDS: readonly LevelBand[] = [
  { id: 'beginner', name: 'Beginner', min: 1, max: 3 },
  { id: 'intermediate', name: 'Intermediate', min: 4, max: 6 },
  { id: 'advanced', name: 'Advanced', min: 7, max: 10 },
];

/** The band a level falls in. */
export function bandOf(level: number): LevelBand {
  return LEVEL_BANDS.find((b) => level >= b.min && level <= b.max) ?? LEVEL_BANDS[LEVEL_BANDS.length - 1];
}

/** Filters for the browser. */
export interface BrowseFilter {
  group?: string | null;
  band?: LevelBand['id'] | null;
  query?: string;
}

/** Search text with dashes between numerals read as spaces (`I–V–vi–IV` finds the axis loop). */
export function normaliseQuery(text: string): string {
  return text.replace(/[–—‑-]+/g, ' ').replace(/♭/g, 'b').replace(/♯/g, '#').trim();
}

/** The progressions that pass a filter: easiest first within catalog order when searching, catalog order otherwise. */
export function filterProgressions(filter: BrowseFilter = {}): Progression[] {
  const q = normaliseQuery(filter.query ?? '');
  let list: Progression[] = q ? searchProgressions(q) : [...PROGRESSIONS];
  const group = styleGroup(filter.group);
  if (group) list = list.filter((p) => inGroup(p, group));
  const band = LEVEL_BANDS.find((b) => b.id === filter.band);
  if (band) list = list.filter((p) => p.level >= band.min && p.level <= band.max);
  if (!q) list.sort((a, b) => a.level - b.level);
  return list;
}

/** A progression's numerals as one line for a card: `I – V – vi – IV`, a held chord shown once. */
export function numeralLine(p: Pick<Progression, 'bars'>, max = 8): string[] {
  const out: string[] = [];
  for (const bar of p.bars) {
    for (const token of bar) {
      if (out.length && out[out.length - 1] === token) continue;
      out.push(token);
    }
  }
  const shown = out.map((t) => formatSlot(t));
  return shown.length > max ? [...shown.slice(0, max - 1), '…'] : shown;
}

/** Display name of a progression (accidentals before numerals as music signs). */
export function displayName(p: Pick<Progression, 'name'>): string {
  return formatProgressionName(p.name);
}

/** One chord of a preview: the symbol and how many beats it rings. */
export interface PreviewChord {
  symbol: string;
  beats: number;
  /** Bar index in the chart (for lighting the bar that sounds). */
  bar: number;
  /** Index within the bar. */
  index: number;
}

/**
 * The chords a card plays when tapped: the first pass of the chart with held bars folded into one
 * (a 12-bar blues previews as its changes, not four bars of I7), two beats each, at most
 * `maxChords` chords.
 * `full` plays the chart as written instead (every bar, at its real length).
 */
export function previewChords(p: Progression, tonic: string, opts: { maxChords?: number; full?: boolean } = {}): PreviewChord[] {
  const r = progressionInKey(p, tonic);
  const out: PreviewChord[] = [];
  r.bars.forEach((bar, b) => {
    bar.forEach((c, i) => {
      const last = out[out.length - 1];
      if (!opts.full && last && last.symbol === c.symbol) return;
      out.push({ symbol: c.symbol, beats: opts.full ? c.beats : 2, bar: b, index: i });
    });
  });
  return opts.full ? out : out.slice(0, opts.maxChords ?? 8);
}

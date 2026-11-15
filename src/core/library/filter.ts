/**
 * Searching, filtering and sorting song listings. Pure: the Songs screen and any other screen
 * that lists songs share the same rules.
 */
import { difficultyBand, type DifficultyBand } from '@/core/song';
import { KIND_NAMES, SKILL_NAMES, STYLE_NAMES } from '@/content/songs';
import type { SongListing, SongSkill, SongSource, SongStyle } from './types';

/** Level bands (the song core's: beginner 1–3, intermediate 4–7, expert 8–10). */
export type LevelBand = DifficultyBand;

/** Which songs to show. Every field is optional; empty arrays and nulls mean "any". */
export interface SongFilter {
  /** Free text: title, composer, style, key, tags, what it teaches. */
  query?: string;
  /** Built-in songs, the learner's own, or favourites (needs `favourites` in the context). */
  scope?: 'all' | SongSource | 'favourites';
  levels?: LevelBand[];
  styles?: SongStyle[];
  /** A song matches when it trains every chosen skill. */
  skills?: SongSkill[];
  /** Must have these (needs summaries; songs without a summary yet are kept). */
  features?: Array<'chords' | 'lyrics' | 'tab'>;
}

/** Facts about the learner a filter or sort may need. */
export interface FilterContext {
  favourites?: ReadonlySet<string>;
}

/** Sort orders of the song list. `fit` uses an order the caller computed (`rankSongs`). */
export type SongSort = 'fit' | 'level' | 'title' | 'recent' | 'length';

/** Display names of the sort orders. */
export const SORT_NAMES: Readonly<Record<SongSort, string>> = {
  fit: 'Best for you',
  level: 'Easiest first',
  title: 'Title (A to Z)',
  recent: 'Recently added',
  length: 'Shortest first',
};

/** Display names of the level bands. */
export const LEVEL_BAND_NAMES: Readonly<Record<LevelBand, string>> = { beginner: 'Beginner', intermediate: 'Intermediate', expert: 'Expert' };
/** Levels of each band, for "Beginner (1–3)". */
export const LEVEL_BAND_RANGE: Readonly<Record<LevelBand, [number, number]>> = { beginner: [1, 3], intermediate: [4, 7], expert: [8, 10] };

/** Lower case, accents removed, punctuation to spaces. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9#/]+/g, ' ')
    .trim();
}

/** Everything a search looks through, with a weight per field. */
function haystack(s: SongListing): Array<[string, number]> {
  return [
    [s.title, 6],
    [s.composer ?? '', 3],
    [s.style ? STYLE_NAMES[s.style] : '', 2],
    [s.kind ? KIND_NAMES[s.kind] : '', 2],
    [s.key ?? '', 1],
    [s.tags.join(' '), 2],
    [s.teaches.join(' '), 1],
    [s.skills.map((k) => SKILL_NAMES[k]).join(' '), 1],
    [s.summary?.chords.join(' ') ?? '', 1],
    [s.notes ?? '', 1],
  ];
}

/**
 * How well a listing matches a search, 0 = not at all. Every word of the query must appear
 * somewhere (word starts count most), so "blues a" finds the blues in A.
 */
export function searchScore(s: SongListing, query: string): number {
  const words = normalizeText(query).split(' ').filter(Boolean);
  if (!words.length) return 1;
  const fields = haystack(s).map(([text, w]) => [` ${normalizeText(text)}`, w] as const);
  let total = 0;
  for (const word of words) {
    let best = 0;
    for (const [text, w] of fields) {
      if (!text) continue;
      if (text.includes(` ${word} `) || text.endsWith(` ${word}`)) best = Math.max(best, w * 3);
      else if (text.includes(` ${word}`)) best = Math.max(best, w * 2);
      else if (word.length >= 3 && text.includes(word)) best = Math.max(best, w);
    }
    if (!best) return 0;
    total += best;
  }
  return total;
}

/** The listings that pass a filter, in their original order. */
export function filterSongs(list: readonly SongListing[], filter: SongFilter, ctx: FilterContext = {}): SongListing[] {
  const q = filter.query?.trim() ?? '';
  return list.filter((s) => {
    if (filter.scope === 'built-in' || filter.scope === 'mine') {
      if (s.source !== filter.scope) return false;
    } else if (filter.scope === 'favourites' && !ctx.favourites?.has(s.id)) return false;
    if (filter.levels?.length && !filter.levels.includes(difficultyBand(s.level))) return false;
    if (filter.styles?.length && (!s.style || !filter.styles.includes(s.style))) return false;
    if (filter.skills?.length && !filter.skills.every((k) => s.skills.includes(k))) return false;
    if (filter.features?.length && s.summary) {
      const sum = s.summary;
      for (const f of filter.features) {
        if (f === 'chords' && !sum.hasChords) return false;
        if (f === 'lyrics' && !sum.hasLyrics) return false;
        if (f === 'tab' && !sum.hasTab) return false;
      }
    }
    if (q && !searchScore(s, q)) return false;
    return true;
  });
}

/** How many filter choices are active (for a "Filters (2)" button). Search and scope do not count. */
export function activeFilterCount(filter: SongFilter): number {
  return (filter.levels?.length ?? 0) + (filter.styles?.length ?? 0) + (filter.skills?.length ?? 0) + (filter.features?.length ?? 0);
}

/**
 * Sort listings. `fit` follows `fitOrder` (ids best first, from `rankSongs`); a search puts the
 * best matches first whatever the order, so typing a title finds it at the top.
 */
export function sortSongs(list: readonly SongListing[], sort: SongSort, opts: { fitOrder?: readonly string[]; query?: string } = {}): SongListing[] {
  const fitIndex = new Map((opts.fitOrder ?? []).map((id, i) => [id, i]));
  const byTitle = (a: SongListing, b: SongListing) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  const compare: Record<SongSort, (a: SongListing, b: SongListing) => number> = {
    fit: (a, b) => (fitIndex.get(a.id) ?? 1e9) - (fitIndex.get(b.id) ?? 1e9) || a.level - b.level || byTitle(a, b),
    level: (a, b) => a.level - b.level || byTitle(a, b),
    title: byTitle,
    recent: (a, b) => b.addedAt - a.addedAt || byTitle(a, b),
    length: (a, b) => (a.summary?.seconds ?? 1e9) - (b.summary?.seconds ?? 1e9) || a.level - b.level || byTitle(a, b),
  };
  const q = opts.query?.trim();
  const scored = q ? new Map(list.map((s) => [s.id, searchScore(s, q)])) : null;
  return [...list].sort((a, b) => (scored ? (scored.get(b.id) ?? 0) - (scored.get(a.id) ?? 0) : 0) || compare[sort](a, b));
}

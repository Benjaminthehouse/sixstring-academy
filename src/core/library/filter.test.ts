import { describe, expect, it } from 'vitest';
import { SONG_ENTRIES } from '@/content/songs';
import { activeFilterCount, filterSongs, normalizeText, searchScore, sortSongs } from './filter';
import { builtinListing } from './library';
import type { SongListing } from './types';

/** The five seed songs these expectations were written for: authors keep adding songs beside them. */
const SEEDS = new Set(['hot-cross-buns', 'frere-jacques', 'st-blues-shuffle-a', 'st-pimami-3-4', 'greensleeves-fingerstyle']);
const BUILT_IN = SONG_ENTRIES.filter((e) => SEEDS.has(e.id)).map(builtinListing);
const ids = (list: SongListing[]) => list.map((s) => s.id);

/** A learner's song as the library would list it. */
function mine(id: string, over: Partial<SongListing> = {}): SongListing {
  return { id, source: 'mine', title: id, level: 2, levelSource: 'estimated', tags: [], skills: ['melody'], teaches: [], addedAt: 10, updatedAt: 10, ...over };
}

describe('search', () => {
  it('ignores case and accents', () => {
    expect(normalizeText('Frère JACQUES!')).toBe('frere jacques');
    const frere = BUILT_IN.find((s) => s.id === 'frere-jacques')!;
    expect(searchScore(frere, 'frere')).toBeGreaterThan(0);
    expect(searchScore(frere, 'FRÈRE jac')).toBeGreaterThan(0);
  });

  it('needs every word somewhere: title, composer, style, tags, what it teaches', () => {
    expect(ids(filterSongs(BUILT_IN, { query: 'blues' }))).toEqual(['st-blues-shuffle-a']);
    expect(ids(filterSongs(BUILT_IN, { query: 'shuffle in A' }))).toEqual(['st-blues-shuffle-a']);
    expect(ids(filterSongs(BUILT_IN, { query: 'traditional english' })).sort()).toEqual(['greensleeves-fingerstyle', 'hot-cross-buns']);
    expect(ids(filterSongs(BUILT_IN, { query: 'round' }))).toEqual(['frere-jacques']);
    expect(ids(filterSongs(BUILT_IN, { query: 'arpeggio' }))).toContain('st-pimami-3-4');
    expect(filterSongs(BUILT_IN, { query: 'zzzz' })).toEqual([]);
  });

  it('ranks title matches above matches elsewhere', () => {
    const list = [mine('my-a', { title: 'Morning Song', tags: ['greensleeves'] }), mine('my-b', { title: 'Greensleeves Waltz' })];
    expect(ids(sortSongs(list, 'title', { query: 'greensleeves' }))).toEqual(['my-b', 'my-a']);
  });
});

describe('filters', () => {
  it('by level band', () => {
    const beginner = filterSongs(BUILT_IN, { levels: ['beginner'] });
    expect(beginner.length).toBeGreaterThan(0);
    expect(beginner.every((s) => s.level <= 3)).toBe(true);
    const intermediate = filterSongs(BUILT_IN, { levels: ['intermediate'] });
    expect(intermediate.every((s) => s.level >= 4 && s.level <= 7)).toBe(true);
    expect(filterSongs(BUILT_IN, { levels: ['beginner', 'intermediate'] })).toHaveLength(beginner.length + intermediate.length);
  });

  it('by style and by every chosen skill', () => {
    expect(ids(filterSongs(BUILT_IN, { styles: ['blues'] }))).toEqual(['st-blues-shuffle-a']);
    const picking = filterSongs(BUILT_IN, { skills: ['fingerpicking'] });
    expect(ids(picking).sort()).toEqual(['greensleeves-fingerstyle', 'st-pimami-3-4']);
    expect(ids(filterSongs(BUILT_IN, { skills: ['fingerpicking', 'technique'] }))).toEqual(['greensleeves-fingerstyle']);
    // A song of the learner's without a style never matches a style filter.
    expect(filterSongs([mine('my-x')], { styles: ['folk'] })).toEqual([]);
  });

  it('by source and favourites', () => {
    const all = [...BUILT_IN, mine('my-x')];
    expect(ids(filterSongs(all, { scope: 'mine' }))).toEqual(['my-x']);
    expect(filterSongs(all, { scope: 'built-in' })).toHaveLength(BUILT_IN.length);
    expect(ids(filterSongs(all, { scope: 'favourites' }, { favourites: new Set(['hot-cross-buns']) }))).toEqual(['hot-cross-buns']);
    expect(filterSongs(all, { scope: 'all' })).toHaveLength(all.length);
  });

  it('by features once a summary is known (songs without one stay listed)', () => {
    const withLyrics = mine('my-l', { summary: { hasLyrics: true, hasChords: false, hasTab: true } as SongListing['summary'] });
    const without = mine('my-n', { summary: { hasLyrics: false, hasChords: false, hasTab: true } as SongListing['summary'] });
    const unknown = mine('my-u');
    expect(ids(filterSongs([withLyrics, without, unknown], { features: ['lyrics'] }))).toEqual(['my-l', 'my-u']);
  });

  it('counts the active choices', () => {
    expect(activeFilterCount({})).toBe(0);
    expect(activeFilterCount({ query: 'x', scope: 'mine', levels: ['beginner'], styles: ['folk', 'blues'], skills: ['melody'] })).toBe(4);
  });
});

describe('sorting', () => {
  const list = [mine('my-c', { title: 'Cello', level: 5, addedAt: 3 }), mine('my-a', { title: 'apple', level: 2, addedAt: 1 }), mine('my-b', { title: 'Banjo', level: 2, addedAt: 2 })];

  it('by level, title and date added', () => {
    expect(ids(sortSongs(list, 'level'))).toEqual(['my-a', 'my-b', 'my-c']);
    expect(ids(sortSongs(list, 'title'))).toEqual(['my-a', 'my-b', 'my-c']);
    expect(ids(sortSongs(list, 'recent'))).toEqual(['my-c', 'my-b', 'my-a']);
  });

  it('by fit, following the ranking, unranked songs last', () => {
    expect(ids(sortSongs(list, 'fit', { fitOrder: ['my-c', 'my-b'] }))).toEqual(['my-c', 'my-b', 'my-a']);
  });

  it('by length, songs without a known length last', () => {
    const timed = [mine('my-long', { summary: { seconds: 90 } as SongListing['summary'] }), mine('my-short', { summary: { seconds: 20 } as SongListing['summary'] }), mine('my-unknown')];
    expect(ids(sortSongs(timed, 'length'))).toEqual(['my-short', 'my-long', 'my-unknown']);
  });

  it('never changes the list it is given', () => {
    const before = ids(list);
    sortSongs(list, 'title');
    expect(ids(list)).toEqual(before);
  });
});

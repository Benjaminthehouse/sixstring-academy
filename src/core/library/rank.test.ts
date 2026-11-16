import { describe, expect, it } from 'vitest';
import type { ProgressState } from '@/core/progress';
import { SONG_ENTRIES } from '@/content/songs';
import { builtinListing } from './library';
import { goodNextSongs, learnerFromProgress, rankSongs, targetLevel, type LearnerSnapshot, type PlayedSong } from './rank';
import type { SongListing } from './types';

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

/** A small catalogue covering levels 1 to 8 in a few styles. */
function song(id: string, level: number, style: SongListing['style'] = 'folk', over: Partial<SongListing> = {}): SongListing {
  return { id, source: 'built-in', title: id, level, levelSource: 'authored', style, tags: [], skills: ['melody'], teaches: [], addedAt: 0, updatedAt: 0, ...over };
}
const CATALOGUE = [
  song('l1-folk', 1),
  song('l1-kids', 1, 'children'),
  song('l2-folk', 2),
  song('l2-blues', 2, 'blues'),
  song('l3-classical', 3, 'classical'),
  song('l4-folk', 4),
  song('l5-blues', 5, 'blues'),
  song('l7-classical', 7, 'classical'),
  song('l8-jazz', 8, 'jazz'),
];

function learner(over: Partial<LearnerSnapshot> = {}, played: Record<string, Partial<PlayedSong>> = {}): LearnerSnapshot {
  const full: Record<string, PlayedSong> = {};
  for (const [id, p] of Object.entries(played)) full[id] = { attempts: 1, completed: true, stars: 0, mastery: 0, bestAccuracy: 0, lastAt: NOW - DAY, ...p };
  return { experience: 'beginner', played: full, favourites: new Set(), now: NOW, ...over };
}

describe('the level that fits', () => {
  it('starts from the experience the learner chose', () => {
    expect(targetLevel(CATALOGUE, learner())).toBe(1);
    expect(targetLevel(CATALOGUE, learner({ experience: null }))).toBe(1);
    expect(targetLevel(CATALOGUE, learner({ experience: 'intermediate' }))).toBe(4);
    expect(targetLevel(CATALOGUE, learner({ experience: 'expert' }))).toBe(7);
  });

  it('moves up one level past songs played well, never for songs only tried', () => {
    expect(targetLevel(CATALOGUE, learner({}, { 'l2-folk': { stars: 2 } }))).toBe(3);
    expect(targetLevel(CATALOGUE, learner({}, { 'l3-classical': { stars: 1, completed: false } }))).toBe(1);
    expect(targetLevel(CATALOGUE, learner({}, { 'l8-jazz': { stars: 3 } }))).toBe(9);
  });
});

describe('ranking', () => {
  it('a new beginner gets level 1 and 2 songs first, nothing far above', () => {
    const top = goodNextSongs(CATALOGUE, learner());
    expect(top).toHaveLength(3);
    expect(top.every((r) => r.listing.level <= 2)).toBe(true);
    expect(top[0].reason).toBe('Right at your level');
    expect(rankSongs(CATALOGUE, learner()).at(-1)?.listing.id).toBe('l8-jazz');
  });

  it('suggestions are of different styles when the list allows', () => {
    const styles = goodNextSongs(CATALOGUE, learner()).map((r) => r.listing.style);
    expect(new Set(styles).size).toBe(3);
  });

  it('a song the learner started comes first, a mastered one goes out of the way', () => {
    const l = learner({}, { 'l2-blues': { completed: false, stars: 0 }, 'l1-folk': { stars: 3, mastery: 4 } });
    const ranked = rankSongs(CATALOGUE, l);
    expect(ranked[0].listing.id).toBe('l2-blues');
    expect(ranked[0].reason).toBe('You started this one');
    const mastered = ranked.find((r) => r.listing.id === 'l1-folk')!;
    expect(mastered.reason).toBe('You know this one');
    expect(goodNextSongs(CATALOGUE, l).map((r) => r.listing.id)).not.toContain('l1-folk');
  });

  it('a finished song with few stars asks to be polished', () => {
    const r = rankSongs(CATALOGUE, learner({}, { 'l1-kids': { stars: 1 } })).find((x) => x.listing.id === 'l1-kids')!;
    expect(r.reason).toBe('Polish it: you have 1 of 3 stars');
  });

  it('favourites and fresh imports get a nudge and say why', () => {
    const fresh = song('my-new-song-ab12', 1, undefined, { source: 'mine', addedAt: NOW - DAY });
    const ranked = rankSongs([...CATALOGUE, fresh], learner({ favourites: new Set(['l2-folk']) }));
    expect(ranked.find((r) => r.listing.id === 'l2-folk')!.reason).toBe('One of your favourites');
    expect(ranked.find((r) => r.listing.id === fresh.id)!.reason).toBe('You added this');
    expect(ranked[0].listing.id).toBe(fresh.id);
  });

  it('labels the fit of each song for an intermediate learner', () => {
    const fits = Object.fromEntries(rankSongs(CATALOGUE, learner({ experience: 'intermediate' })).map((r) => [r.listing.id, r.fit]));
    expect(fits).toMatchObject({ 'l2-folk': 'easy', 'l3-classical': 'right', 'l4-folk': 'right', 'l5-blues': 'stretch', 'l7-classical': 'hard' });
  });

  it('works on the real built-in collection', () => {
    // The collection grows as authors add songs: check what holds for any of them.
    const all = SONG_ENTRIES.map(builtinListing);
    const top = goodNextSongs(all, learner());
    expect(top.length).toBeGreaterThanOrEqual(Math.min(2, all.filter((s) => s.level <= 2).length));
    expect(top.map((r) => r.listing.level).every((lv) => lv <= 2)).toBe(true);
    expect(new Set(top.map((r) => r.listing.id)).size).toBe(top.length);
  });
});

describe('learnerFromProgress', () => {
  it('reads song skills, song favourites and the experience', () => {
    const state = {
      profile: { experience: 'intermediate' },
      skills: {
        'song:greensleeves-fingerstyle': { attempts: 2, completed: true, stars: 2, mastery: 1, bestAccuracy: 0.85, lastAt: NOW },
        'scale:a-minor:box-1': { attempts: 5, completed: true, stars: 3, mastery: 5, bestAccuracy: 1, lastAt: NOW },
      },
      favourites: { 'song:hot-cross-buns': { kind: 'song', id: 'hot-cross-buns', title: 'Hot Cross Buns', at: NOW }, 'chord:g': { kind: 'chord', id: 'g', title: 'G', at: NOW } },
    } as unknown as ProgressState;
    const l = learnerFromProgress(state, NOW);
    expect(l.experience).toBe('intermediate');
    expect(Object.keys(l.played)).toEqual(['greensleeves-fingerstyle']);
    expect(l.played['greensleeves-fingerstyle']).toMatchObject({ stars: 2, bestAccuracy: 0.85 });
    expect([...l.favourites]).toEqual(['hot-cross-buns']);
    expect(targetLevel(SONG_ENTRIES.map(builtinListing), l)).toBe(6);
  });
});

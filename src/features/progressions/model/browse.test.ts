import { describe, expect, it } from 'vitest';
import { PROGRESSIONS, progression } from '@/content/progressions';
import { LEVEL_BANDS, STYLE_GROUPS, bandOf, filterProgressions, inGroup, normaliseQuery, numeralLine, previewChords, primaryGroup, shelf } from './browse';

describe('style groups', () => {
  it('file every progression under at least one group, and every group has some', () => {
    for (const p of PROGRESSIONS) expect(STYLE_GROUPS.some((g) => inGroup(p, g)), p.id).toBe(true);
    for (const g of STYLE_GROUPS) expect(PROGRESSIONS.filter((p) => inGroup(p, g)).length, g.id).toBeGreaterThan(0);
  });

  it('have the groups the owner asked for, in browsing order', () => {
    expect(STYLE_GROUPS.map((g) => g.id)).toEqual(['pop-rock', 'blues', 'folk-country', 'jazz', 'classical', 'flamenco', 'latin', 'funk-soul', 'reggae', 'metal', 'modal']);
  });

  it('file a progression first under its most typical style', () => {
    expect(primaryGroup(progression('blues-12-bar')).id).toBe('blues');
    expect(primaryGroup(progression('flamenco-andalusian')).id).toBe('flamenco');
    expect(primaryGroup(progression('pop-axis')).id).toBe('pop-rock');
  });
});

describe('shelves', () => {
  it('lead with the progressions filed under the group, so shelves rarely repeat', () => {
    const jazz = shelf(STYLE_GROUPS.find((g) => g.id === 'jazz')!);
    expect(jazz.length).toBe(4);
    expect(jazz.every((p) => primaryGroup(p).id === 'jazz')).toBe(true);
    const shown = STYLE_GROUPS.flatMap((g) => shelf(g).map((p) => p.id));
    expect(new Set(shown).size).toBeGreaterThan(shown.length * 0.8);
  });
});

describe('levels', () => {
  it('cover 1 to 10 without gaps', () => {
    for (let l = 1; l <= 10; l++) expect(LEVEL_BANDS.filter((b) => l >= b.min && l <= b.max)).toHaveLength(1);
    expect(bandOf(2).id).toBe('beginner');
    expect(bandOf(5).id).toBe('intermediate');
    expect(bandOf(9).id).toBe('advanced');
  });
});

describe('filtering', () => {
  it('returns the whole catalog, easiest first, without a filter', () => {
    const all = filterProgressions();
    expect(all).toHaveLength(PROGRESSIONS.length);
    for (let i = 1; i < all.length; i++) expect(all[i].level).toBeGreaterThanOrEqual(all[i - 1].level);
  });

  it('combines group, level band and search', () => {
    const blues = filterProgressions({ group: 'blues' });
    expect(blues.length).toBeGreaterThan(5);
    expect(blues.every((p) => p.styles.includes('blues'))).toBe(true);
    const easyBlues = filterProgressions({ group: 'blues', band: 'beginner' });
    expect(easyBlues.every((p) => p.level <= 3 && p.styles.includes('blues'))).toBe(true);
    expect(filterProgressions({ query: 'andalusian' }).map((p) => p.id)).toContain('flamenco-andalusian');
    expect(filterProgressions({ query: 'andalusian', group: 'jazz' }).map((p) => p.id)).not.toContain('flamenco-andalusian');
  });

  it('finds the axis loop when typed with dashes or by a song', () => {
    expect(normaliseQuery('I–V–vi–IV')).toBe('I V vi IV');
    expect(filterProgressions({ query: 'I–V–vi–IV' }).map((p) => p.id)).toContain('pop-axis');
    expect(filterProgressions({ query: 'let it be' }).map((p) => p.id)).toContain('pop-axis');
    expect(filterProgressions({ query: 'zzzz-nothing' })).toEqual([]);
  });
});

describe('cards', () => {
  it('show the numerals with music signs and a held chord once', () => {
    expect(numeralLine(progression('pop-axis'))).toEqual(['I', 'V', 'vi', 'IV']);
    expect(numeralLine(progression('flamenco-andalusian'))).toEqual(['i', '♭VII', '♭VI', 'V']);
    const blues = numeralLine(progression('blues-12-bar'));
    expect(blues.length).toBeLessThanOrEqual(8);
    for (let i = 1; i < blues.length; i++) expect(blues[i]).not.toBe(blues[i - 1]);
  });

  it('preview the changes of a 12-bar blues instead of four bars of one chord', () => {
    const p = progression('blues-12-bar');
    const short = previewChords(p, 'A');
    for (let i = 1; i < short.length; i++) expect(short[i].symbol).not.toBe(short[i - 1].symbol);
    expect(short.length).toBeLessThanOrEqual(8);
    const full = previewChords(p, 'A', { full: true });
    expect(full.reduce((n, c) => n + c.beats, 0)).toBe(12 * 4);
  });

  it('preview every catalog progression in its default key', () => {
    for (const p of PROGRESSIONS) {
      const chords = previewChords(p, p.keys[0]);
      expect(chords.length, p.id).toBeGreaterThan(0);
      for (const c of chords) expect(c.beats).toBeGreaterThan(0);
    }
  });
});

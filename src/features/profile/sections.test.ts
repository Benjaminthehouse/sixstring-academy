import { describe, expect, it } from 'vitest';
import { parseHash } from '@/app/router';
import { SECTIONS, locate, paramsFor, sectionById } from './sections';

describe('the parts of the Me area', () => {
  it('lists the seven parts once each, overview first, Account beside Your data', () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(['overview', 'achievements', 'shop', 'settings', 'account', 'data', 'about']);
    expect(new Set(SECTIONS.map((s) => s.label)).size).toBe(SECTIONS.length);
    expect(SECTIONS[0].param).toBeUndefined();
  });

  it('every part has an address that the router reads back to it', () => {
    for (const section of SECTIONS) {
      const params = paramsFor(section.id);
      const hash = `#${['profile', ...params].join('--')}`;
      const route = parseHash(hash);
      expect(route.name).toBe('profile');
      // Slug-safe params survive the router untouched.
      expect(route.params).toEqual(params);
      expect(locate(route.params).section.id).toBe(section.id);
    }
  });

  it('reads a detail after the part, and keeps it in the address', () => {
    expect(locate(['achievements', 'streak-7'])).toMatchObject({ section: { id: 'achievements' }, detail: 'streak-7', known: true });
    expect(paramsFor('achievements', 'streak-7')).toEqual(['achievements', 'streak-7']);
    expect(paramsFor('settings', 'sound')).toEqual(['settings', 'sound']);
    // The overview has no param of its own, so it cannot carry a detail.
    expect(paramsFor('overview', 'x')).toEqual([]);
  });

  it('understands the words people use for a part', () => {
    expect(locate(['preferences']).section.id).toBe('settings');
    expect(locate(['trophies']).section.id).toBe('achievements');
    expect(locate(['backup']).section.id).toBe('data');
    expect(locate(['credits']).section.id).toBe('about');
    expect(locate(['sign-in']).section.id).toBe('account');
    expect(locate(['sync']).section.id).toBe('account');
  });

  it('falls back to the overview for an address that names no part, and says so', () => {
    expect(locate([])).toMatchObject({ section: { id: 'overview' }, known: true });
    expect(locate(['no-such-part'])).toMatchObject({ section: { id: 'overview' }, detail: null, known: false });
    expect(sectionById('shop').title).toBe('Shop');
  });

  it('never uses a route name the host reserves', () => {
    for (const section of SECTIONS) expect(['sidebar', 'customize', 'upgrade', 'downloads']).not.toContain(section.param);
  });
});

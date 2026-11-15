import { describe, expect, it } from 'vitest';
import { decodeState, selectAchievements, selectLevel, selectQuests, selectStreak, shopOf } from '@/core/progress';
import { RICH_GEMS, emptyFixture, richFixture } from './fixtures';

const NOW = Date.parse('2026-11-15T19:10:00Z');

describe('test fixtures', () => {
  it('a new learner is exactly what the store makes of an empty browser', () => {
    const f = emptyFixture(NOW, 'UTC');
    const s = f.store.getState();
    expect(s.xp.total).toBe(0);
    expect(s.profile.onboarded).toBe(false);
    expect(selectQuests(s).daily).toHaveLength(3);
    expect(selectAchievements(s).unlocked).toBe(0);
  });

  it('Robin has a history worth looking at', () => {
    const f = richFixture(NOW, 'UTC');
    const s = f.store.getState();
    expect(s.profile).toMatchObject({ name: 'Robin', experience: 'intermediate', teacher: 'dev', onboarded: true });
    expect(selectLevel(s).level).toBeGreaterThanOrEqual(10);
    // The last twelve days are an unbroken streak that includes today.
    expect(selectStreak(s)).toMatchObject({ current: 12, todayMet: true });
    expect(selectAchievements(s).unlocked).toBeGreaterThan(20);
    expect(Object.keys(s.days).length).toBeGreaterThan(60);
    expect(s.log.length).toBeGreaterThan(50);
    // Two hearts down, one freeze held, the Ocean accent owned but not worn.
    expect(s.hearts.count).toBe(3);
    expect(s.streak.freezes).toBe(1);
    expect(s.cosmetics).toContain('accent-ocean');
    expect(s.prefs.accent).toBe('accent-sunburst');
    expect(s.xp.boost).toBeNull();
  });

  it('Robin can afford a 150 or 200 gem cosmetic but not the 400 gem vine', () => {
    const f = richFixture(NOW, 'UTC');
    const s = f.store.getState();
    expect(s.gems.balance).toBeGreaterThanOrEqual(RICH_GEMS);
    expect(s.gems.balance).toBeLessThan(400);
    const shop = shopOf(s, NOW);
    expect(shop.cosmetics.find((c) => c.id === 'wood-ebony')).toMatchObject({ owned: false, affordable: true });
    expect(shop.cosmetics.find((c) => c.id === 'inlay-vine')).toMatchObject({ owned: false, affordable: false });
    expect(shop.consumables.find((c) => c.id === 'heart-refill')).toMatchObject({ available: true, affordable: true });
  });

  it('is the same on every run, and its save file loads back to the same state', () => {
    const a = richFixture(NOW, 'UTC');
    const b = richFixture(NOW, 'UTC');
    expect(a.saved()).toBe(b.saved());
    const decoded = decodeState(a.saved(), { now: NOW, timeZone: 'UTC' }, { allowNewer: true });
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.state.xp.total).toBe(a.store.getState().xp.total);
      expect(decoded.state.achievements).toEqual(a.store.getState().achievements);
      expect(decoded.report.reset).toEqual([]);
    }
  });
});

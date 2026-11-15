import { describe, expect, it } from 'vitest';
import { LEVEL_TITLES, STEADY_LEVEL, STEADY_STEP, levelForXp, levelInfo, levelTitle, xpForLevel, xpToNextLevel } from './levels';

describe('level curve', () => {
  it('starts at level 1 with 0 XP', () => {
    expect(levelForXp(0)).toBe(1);
    expect(xpForLevel(1)).toBe(0);
  });

  it('is strictly increasing in XP per level', () => {
    for (let level = 1; level < 200; level++) {
      expect(xpForLevel(level + 1)).toBeGreaterThan(xpForLevel(level));
      expect(xpForLevel(level + 1) - xpForLevel(level)).toBe(xpToNextLevel(level));
    }
  });

  it('never needs less XP for a later level-up than for an earlier one', () => {
    for (let level = 1; level < 200; level++) {
      expect(xpToNextLevel(level + 1)).toBeGreaterThanOrEqual(xpToNextLevel(level));
    }
  });

  it('maps XP to levels monotonically, one XP at a time', () => {
    let previous = 1;
    for (let xp = 0; xp <= 60_000; xp++) {
      const level = levelForXp(xp);
      expect(level).toBeGreaterThanOrEqual(previous);
      expect(level - previous).toBeLessThanOrEqual(1);
      previous = level;
    }
  });

  it('agrees with itself at every threshold', () => {
    for (let level = 2; level <= 150; level++) {
      const start = xpForLevel(level);
      expect(levelForXp(start)).toBe(level);
      expect(levelForXp(start - 1)).toBe(level - 1);
    }
  });

  it('is generous early and steady later', () => {
    expect(xpToNextLevel(1)).toBe(20); // one short session
    expect(levelForXp(20)).toBe(2);
    expect(levelForXp(200)).toBe(5);
    expect(xpForLevel(10)).toBe(900);
    expect(xpForLevel(STEADY_LEVEL)).toBe(6000);
    for (let level = STEADY_LEVEL; level < STEADY_LEVEL + 50; level++) expect(xpToNextLevel(level)).toBe(STEADY_STEP);
    expect(xpForLevel(50)).toBe(18_500);
  });

  it('tolerates bad input', () => {
    expect(levelForXp(-5)).toBe(1);
    expect(levelForXp(Number.NaN)).toBe(1);
    expect(levelInfo(Number.NaN).level).toBe(1);
    expect(xpForLevel(0)).toBe(0);
  });
});

describe('level titles', () => {
  it('are ordered, unique and start at level 1', () => {
    expect(LEVEL_TITLES[0]).toEqual({ level: 1, title: 'Open String' });
    for (let i = 1; i < LEVEL_TITLES.length; i++) expect(LEVEL_TITLES[i].level).toBeGreaterThan(LEVEL_TITLES[i - 1].level);
    expect(new Set(LEVEL_TITLES.map((t) => t.title)).size).toBe(LEVEL_TITLES.length);
  });

  it('use the last title at or below the level', () => {
    expect(levelTitle(1)).toBe('Open String');
    expect(levelTitle(3)).toBe('First Chord');
    expect(levelTitle(5)).toBe('Campfire Strummer');
    expect(levelTitle(16)).toBe('Session Player');
    expect(levelTitle(50)).toBe('Virtuoso');
    expect(levelTitle(120)).toBe('Virtuoso');
  });
});

describe('levelInfo', () => {
  it('reports progress inside the level', () => {
    const info = levelInfo(30); // level 2 starts at 20 and takes 40
    expect(info.level).toBe(2);
    expect(info.title).toBe('First Fret');
    expect(info.xpIntoLevel).toBe(10);
    expect(info.xpForNext).toBe(40);
    expect(info.xpRemaining).toBe(30);
    expect(info.fraction).toBeCloseTo(0.25);
    expect(info.nextTitle).toEqual({ level: 3, title: 'First Chord' });
  });

  it('has no next title at the top', () => {
    expect(levelInfo(xpForLevel(60)).nextTitle).toBeNull();
  });

  it('keeps the fraction inside 0..1 everywhere', () => {
    for (let xp = 0; xp < 20_000; xp += 7) {
      const { fraction } = levelInfo(xp);
      expect(fraction).toBeGreaterThanOrEqual(0);
      expect(fraction).toBeLessThan(1);
    }
  });
});

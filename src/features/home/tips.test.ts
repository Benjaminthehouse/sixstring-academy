import { describe, expect, it } from 'vitest';
import { ROUTE_BY_NAME } from '@/app/routes';
import { TIPS, tipForDay } from './tips';

describe('TIPS', () => {
  it('has at least 40 tips with unique ids', () => {
    expect(TIPS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(TIPS.map((t) => t.id)).size).toBe(TIPS.length);
    expect(new Set(TIPS.map((t) => t.text)).size).toBe(TIPS.length);
  });

  it('keeps each tip short enough to read at a glance and written as plain sentences', () => {
    for (const tip of TIPS) {
      expect(tip.text.length, tip.id).toBeGreaterThan(50);
      expect(tip.text.length, tip.id).toBeLessThanOrEqual(240);
      expect(tip.text, tip.id).toMatch(/[.?]$/);
      expect(tip.text, tip.id).not.toContain('!');
      expect(tip.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('links only to real screens, and always says what the link does', () => {
    for (const tip of TIPS) {
      expect(!!tip.route, tip.id).toBe(!!tip.action);
      if (tip.route) expect(ROUTE_BY_NAME[tip.route], `${tip.id} -> ${tip.route}`).toBeDefined();
    }
    // A good share of the tips lead somewhere in the app.
    expect(TIPS.filter((t) => t.route).length).toBeGreaterThanOrEqual(15);
  });
});

describe('tipForDay', () => {
  it('shows a different tip every day and comes round after all of them', () => {
    const run = Array.from({ length: TIPS.length }, (_, i) => tipForDay(20500 + i).id);
    expect(new Set(run).size).toBe(TIPS.length);
    expect(tipForDay(20500 + TIPS.length)).toBe(tipForDay(20500));
  });

  it('steps on when the learner asks for another', () => {
    expect(tipForDay(100, 1)).toBe(tipForDay(101));
    expect(tipForDay(100, TIPS.length)).toBe(tipForDay(100));
  });

  it('copes with odd day numbers', () => {
    expect(tipForDay(-1)).toBe(TIPS[TIPS.length - 1]);
    expect(tipForDay(0.9)).toBe(TIPS[0]);
  });
});

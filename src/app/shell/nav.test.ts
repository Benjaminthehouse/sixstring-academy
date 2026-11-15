import { describe, expect, it } from 'vitest';
import { ROUTES, ROUTE_BY_NAME } from '../routes';
import { APP_NAME, DESTINATIONS, destinationFor, documentTitleFor, hubRoutes, isDestinationRoute, isKnownRoute, searchableRoutes, sectionsThatFit, upTarget } from './nav';

describe('destinations', () => {
  it('are the five tabs in order, each a real route', () => {
    expect(DESTINATIONS.map((d) => d.route)).toEqual(['home', 'study', 'studio', 'tools', 'profile']);
    expect(DESTINATIONS.map((d) => d.label)).toEqual(['Today', 'Learn', 'Play', 'Tools', 'Me']);
    for (const d of DESTINATIONS) {
      expect(ROUTE_BY_NAME[d.route], d.route).toBeDefined();
      expect(ROUTE_BY_NAME[d.route].section).toBe(d.section);
      expect(d.icon).toBe(ROUTE_BY_NAME[d.route].icon);
    }
  });

  it('give every registry route exactly one tab', () => {
    for (const route of ROUTES) {
      const destination = destinationFor(route.name);
      expect(destination.section, route.name).toBe(route.section);
    }
    expect(destinationFor('tuner').route).toBe('tools');
    expect(destinationFor('scales').route).toBe('studio');
    expect(destinationFor('teachers').route).toBe('study');
    expect(destinationFor('kit').route).toBe('profile');
  });

  it('send unknown names to Today, like the registry does', () => {
    expect(isKnownRoute('tuner')).toBe(true);
    expect(isKnownRoute('nope')).toBe(false);
    expect(isKnownRoute('toString')).toBe(false);
    expect(destinationFor('nope').route).toBe('home');
  });
});

describe('hubRoutes', () => {
  it('lists every inHub route of a section, in registry order', () => {
    for (const section of ['learn', 'play', 'tools'] as const) {
      const expected = ROUTES.filter((r) => r.section === section && r.inHub).map((r) => r.name);
      expect(hubRoutes(section).map((r) => r.name)).toEqual(expected);
      expect(expected.length).toBeGreaterThan(0);
    }
  });

  it('never lists detail screens or the hubs themselves', () => {
    const all = (['home', 'learn', 'play', 'tools', 'me'] as const).flatMap((s) => hubRoutes(s).map((r) => r.name));
    for (const name of ['play', 'study', 'studio', 'tools', 'home', 'kit', 'profile']) expect(all).not.toContain(name);
  });
});

describe('upTarget', () => {
  it('goes from a sub-screen to its feature', () => {
    expect(upTarget('scales', ['a-minor'])).toBe('scales');
    expect(upTarget('teachers', ['mia', 'lesson-3'])).toBe('teachers');
  });
  it('goes from a feature to its hub', () => {
    expect(upTarget('scales', [])).toBe('studio');
    expect(upTarget('tuner', [])).toBe('tools');
    expect(upTarget('learn', [])).toBe('study');
  });
  it('goes from a detail screen that is not in a hub to the hub', () => {
    expect(upTarget('play', ['greensleeves'])).toBe('studio');
  });
  it('goes from a destination to Today', () => {
    for (const d of DESTINATIONS) expect(upTarget(d.route, [])).toBe('home');
    expect(isDestinationRoute('studio')).toBe(true);
    expect(isDestinationRoute('scales')).toBe(false);
  });
});

describe('searchableRoutes', () => {
  it('covers every hub screen and the five destinations, nothing else', () => {
    const names = searchableRoutes().map((r) => r.name);
    for (const route of ROUTES) {
      const expected = route.inHub || DESTINATIONS.some((d) => d.route === route.name);
      expect(names.includes(route.name), route.name).toBe(expected);
    }
  });
});

describe('documentTitleFor', () => {
  it('puts the screen first and the app name last', () => {
    expect(documentTitleFor('Tuner')).toBe(`Tuner · ${APP_NAME}`);
    expect(documentTitleFor('  ')).toBe(APP_NAME);
  });
});

describe('sectionsThatFit', () => {
  const counts = { learn: 3, play: 10, tools: 4 };
  it('opens everything on a tall screen', () => {
    expect(sectionsThatFit(40, 'home', counts).sort()).toEqual(['learn', 'play', 'tools']);
  });
  it('opens what fits on a laptop, in tab order', () => {
    expect(sectionsThatFit(12, 'home', counts)).toEqual(['learn', 'tools']);
  });
  it('always opens the current section, even when it does not fit', () => {
    expect(sectionsThatFit(4, 'play', counts)).toEqual(['play']);
    expect(sectionsThatFit(12, 'play', counts)).toEqual(['play']);
    expect(sectionsThatFit(15, 'play', counts)).toEqual(['play', 'learn']);
  });
  it('opens nothing when there is no room and no current section with screens', () => {
    expect(sectionsThatFit(0, 'me', counts)).toEqual([]);
  });
});

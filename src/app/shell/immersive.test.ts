import { afterEach, describe, expect, it } from 'vitest';
import { ROUTE_BY_NAME } from '../routes';
import { IMMERSIVE_ROUTES, requestImmersive, requestedImmersion, resolveImmersion, routeImmersion, strongerLevel } from './immersive';

describe('the immersive registry', () => {
  it('only names real routes', () => {
    for (const name of Object.keys(IMMERSIVE_ROUTES)) expect(ROUTE_BY_NAME[name], name).toBeDefined();
  });

  it('makes the player and the camera immersive', () => {
    expect(routeImmersion('play', [])).toBe('focus');
    expect(routeImmersion('play', ['greensleeves'])).toBe('focus');
    expect(routeImmersion('camera', [])).toBe('focus');
  });

  it('makes lessons and games immersive only once one is open', () => {
    expect(routeImmersion('learn', [])).toBe('none');
    expect(routeImmersion('learn', ['unit-3'])).toBe('none');
    expect(routeImmersion('learn', ['unit-3', 'lesson-2'])).toBe('focus');
    expect(routeImmersion('teachers', ['mia'])).toBe('none');
    expect(routeImmersion('teachers', ['mia', 'lesson-3'])).toBe('focus');
    expect(routeImmersion('arcade', [])).toBe('none');
    expect(routeImmersion('arcade', ['fret-rush'])).toBe('focus');
  });

  it('leaves everything else alone, including names that are not routes', () => {
    expect(routeImmersion('home', [])).toBe('none');
    expect(routeImmersion('tuner', ['drop-d'])).toBe('none');
    expect(routeImmersion('constructor', [])).toBe('none');
  });
});

describe('levels', () => {
  it('rank none < focus < bare', () => {
    expect(strongerLevel('none', 'focus')).toBe('focus');
    expect(strongerLevel('bare', 'focus')).toBe('bare');
    expect(strongerLevel('focus', 'none')).toBe('focus');
  });

  it('let a request win over the registry in both directions', () => {
    expect(resolveImmersion(null, 'play', [])).toBe('focus');
    expect(resolveImmersion('none', 'play', [])).toBe('none');
    expect(resolveImmersion('bare', 'tuner', [])).toBe('bare');
    expect(resolveImmersion(null, 'tuner', [])).toBe('none');
  });
});

describe('live requests', () => {
  const release: Array<() => void> = [];
  afterEach(() => {
    for (const r of release.splice(0)) r();
  });

  it('are null until someone asks, and null again when they stop', () => {
    expect(requestedImmersion()).toBeNull();
    const stop = requestImmersive();
    expect(requestedImmersion()).toBe('focus');
    stop();
    expect(requestedImmersion()).toBeNull();
    stop(); // twice is harmless
    expect(requestedImmersion()).toBeNull();
  });

  it('resolve to the strongest of several', () => {
    release.push(requestImmersive('focus'));
    const stopBare = requestImmersive('bare');
    release.push(requestImmersive('none'));
    expect(requestedImmersion()).toBe('bare');
    stopBare();
    expect(requestedImmersion()).toBe('focus');
  });
});

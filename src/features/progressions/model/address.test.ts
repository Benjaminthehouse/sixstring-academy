import { describe, expect, it } from 'vitest';
import { parseAddress, progressionParams } from './address';

describe('addresses', () => {
  it('reads the browser, the builder and saved progressions', () => {
    expect(parseAddress([])).toEqual({ view: 'browse' });
    expect(parseAddress(['builder'])).toEqual({ view: 'builder' });
    expect(parseAddress(['builder', 'jam'])).toEqual({ view: 'builder-jam' });
    expect(parseAddress(['builder', 'my-lx3k2'])).toEqual({ view: 'open-saved', id: 'my-lx3k2' });
    expect(parseAddress(['builder', 'whatever'])).toEqual({ view: 'builder' });
    expect(parseAddress(['no-such-progression'])).toEqual({ view: 'unknown' });
  });

  it('reads a progression with or without a key, and the jam', () => {
    const a = parseAddress(['pop-axis']);
    expect(a).toMatchObject({ view: 'page', tonic: null, canonical: ['pop-axis'] });
    expect(parseAddress(['pop-axis', 'd'])).toMatchObject({ view: 'page', tonic: 'D' });
    expect(parseAddress(['pop-axis', 'a-sharp'])).toMatchObject({ view: 'page', tonic: 'Bb', canonical: ['pop-axis', 'bb'] });
    expect(parseAddress(['pop-axis', 'bb', 'jam'])).toMatchObject({ view: 'jam', tonic: 'Bb' });
    expect(parseAddress(['pop-axis', 'jam'])).toMatchObject({ view: 'jam', tonic: null });
    expect(parseAddress(['pop-axis', 'zz'])).toMatchObject({ view: 'page', tonic: null, canonical: ['pop-axis'] });
  });

  it('writes params that the router accepts', () => {
    expect(progressionParams('pop-axis', 'F#', true)).toEqual(['pop-axis', 'f-sharp', 'jam']);
    expect(progressionParams('pop-axis', null)).toEqual(['pop-axis']);
    for (const p of progressionParams('flamenco-andalusian', 'C#', true)) expect(p).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });
});

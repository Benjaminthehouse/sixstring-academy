import { describe, expect, it } from 'vitest';
import { jamOptionParams, parseAddress, progressionParams } from './address';

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

  it('reads a jam set up by a lesson: tempo, style, times through, chart hidden', () => {
    const a = parseAddress(['blues-12-bar', 'a', 'jam', 't84', 'x2']);
    expect(a).toMatchObject({ view: 'jam', tonic: 'A', options: { tempo: 84, passes: 2 }, canonical: ['blues-12-bar', 'a', 'jam', 't84', 'x2'] });
    expect(parseAddress(['minor-i-bvi-biii-bvii', 'e', 'jam', 'waltz', 't96'])).toMatchObject({ view: 'jam', tonic: 'E', options: { style: 'waltz', tempo: 96 } });
    expect(parseAddress(['pop-axis', 'a', 'jam', 'hide-chart'])).toMatchObject({ view: 'jam', options: { hideChart: true }, canonical: ['pop-axis', 'a', 'jam', 'hide-chart'] });
    // Options may come before the key; without a key the remembered one is used.
    expect(parseAddress(['pop-axis', 'jam', 't100'])).toMatchObject({ view: 'jam', tonic: null, options: { tempo: 100 } });
    expect(parseAddress(['pop-axis', 't100', 'g', 'jam'])).toMatchObject({ view: 'jam', tonic: 'G', canonical: ['pop-axis', 'g', 'jam', 't100'] });
    // Out of range or unknown: ignored, never a broken screen.
    expect(parseAddress(['pop-axis', 'g', 'jam', 'x40', 'polka'])).toMatchObject({ view: 'jam', tonic: 'G', options: {} });
    // An unknown word before the key does not cost the address its key.
    expect(parseAddress(['pop-axis', 'polka', 'g', 'jam', 't90'])).toMatchObject({ view: 'jam', tonic: 'G', options: { tempo: 90 }, canonical: ['pop-axis', 'g', 'jam', 't90'] });
    expect(parseAddress(['pop-axis', 'x99', 'f-sharp'])).toMatchObject({ view: 'page', tonic: 'F#', canonical: ['pop-axis', 'f-sharp'] });
    // On the chart page, band options mean nothing.
    expect(parseAddress(['pop-axis', 'g', 't100'])).toMatchObject({ view: 'page', options: {}, canonical: ['pop-axis', 'g'] });
  });

  it('writes jam options that read back the same', () => {
    const o = { tempo: 72, style: 'ballad' as const, passes: 3, hideChart: true };
    const params = progressionParams('classical-minor-cadence', 'E', true, o);
    for (const p of params) expect(p).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(parseAddress(params)).toMatchObject({ view: 'jam', tonic: 'E', options: o, canonical: params });
    expect(jamOptionParams({})).toEqual([]);
  });
});

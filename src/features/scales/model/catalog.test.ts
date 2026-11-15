import { describe, expect, it } from 'vitest';
import { SCALES, chroma } from '@/core/theory';
import { findScales, primaryGroupOf, rootChoices, scaleGroups, stepRoot, tierLabel } from './catalog';

describe('scale groups', () => {
  it('puts the Essentials first: major, natural minor, both pentatonics and both blues scales', () => {
    const [first] = scaleGroups();
    expect(first.id).toBe('essentials');
    expect(first.scales.map((s) => s.id)).toEqual(['major', 'minor', 'major-pentatonic', 'minor-pentatonic', 'minor-blues', 'major-blues']);
  });

  it('follows the order a learner expects and lists every scale of the catalog at least once', () => {
    const groups = scaleGroups();
    expect(groups.map((g) => g.id)).toEqual(['essentials', 'modes', 'minor', 'pentatonic', 'jazz', 'symmetric', 'world', 'harmonic-major']);
    const listed = new Set(groups.flatMap((g) => g.scales.map((s) => s.id)));
    const missing = SCALES.filter((s) => !listed.has(s.id)).map((s) => s.id);
    expect(missing).toEqual([]);
  });

  it('never lists a scale twice inside one group, and every group has a title and a description', () => {
    for (const g of scaleGroups()) {
      const ids = g.scales.map((s) => s.id);
      expect(new Set(ids).size, g.id).toBe(ids.length);
      expect(g.title.length).toBeGreaterThan(3);
      expect(g.description.length).toBeGreaterThan(10);
    }
  });

  it('keeps the modes of the major scale in mode order', () => {
    const modes = scaleGroups().find((g) => g.id === 'modes')!;
    expect(modes.scales.map((s) => s.mode)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('puts harmonic minor and melodic minor with their modes in the Minor family, parents first', () => {
    const minor = scaleGroups().find((g) => g.id === 'minor')!;
    expect(minor.scales).toHaveLength(14);
    expect(minor.scales[0].id).toBe('harmonic-minor');
    expect(minor.scales[7].id).toBe('melodic-minor');
  });

  it('knows each scale’s home group', () => {
    expect(primaryGroupOf('minor-pentatonic').id).toBe('essentials');
    expect(primaryGroupOf('dorian').id).toBe('modes');
    expect(primaryGroupOf('altered').id).toBe('minor');
    expect(primaryGroupOf('hirajoshi').id).toBe('world');
    expect(primaryGroupOf('whole-tone').id).toBe('jazz');
    expect(primaryGroupOf('bebop-dominant').id).toBe('jazz');
  });
});

describe('finding a scale', () => {
  it('finds scales by name first', () => {
    expect(findScales('dorian')[0].id).toBe('dorian');
    expect(findScales('Dorian')[0].id).toBe('dorian');
    expect(findScales('blues')[0].id).toBe('minor-blues');
    expect(findScales('harmonic minor')[0].id).toBe('harmonic-minor');
  });

  it('finds scales by sound and style words', () => {
    expect(findScales('spanish').map((s) => s.id)).toEqual(expect.arrayContaining(['phrygian-dominant', 'phrygian']));
    expect(findScales('japanese').map((s) => s.id)).toEqual(expect.arrayContaining(['hirajoshi', 'kumoi', 'in-sen']));
    expect(findScales('jazz').map((s) => s.id)).toEqual(expect.arrayContaining(['altered', 'bebop-dominant']));
    expect(findScales('super locrian')[0].id).toBe('altered');
  });

  it('finds a group by its name', () => {
    expect(findScales('symmetric').map((s) => s.id)).toEqual(expect.arrayContaining(['whole-tone', 'diminished-half-whole', 'chromatic']));
  });

  it('gives every scale for empty text, and no repeats ever', () => {
    expect(findScales('')).toHaveLength(SCALES.length);
    for (const q of ['minor', 'pent', 'b', 'mode', 'jazz']) {
      const ids = findScales(q).map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('finds nothing for nonsense', () => {
    expect(findScales('zzqx')).toEqual([]);
  });
});

describe('roots', () => {
  it('spells the twelve major keys the way a musician writes them', () => {
    const tonics = rootChoices('major').map((r) => r.tonic);
    expect(tonics).toEqual(['C', 'Db', 'D', 'Eb', 'E', 'F', expect.stringMatching(/^(F#|Gb)$/), 'G', 'Ab', 'A', 'Bb', 'B']);
  });

  it('spells minor keys with sharps where they read better (C♯ minor, G♯ minor)', () => {
    const tonics = rootChoices('minor').map((r) => r.tonic);
    expect(tonics[1]).toBe('C#');
    expect(tonics[8]).toBe('G#');
    expect(tonics[10]).toBe('Bb');
  });

  it('gives each of the 12 pitch classes exactly once for every scale', () => {
    for (const s of SCALES) {
      const choices = rootChoices(s.id);
      expect(choices.map((c) => chroma(c.tonic))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      for (const c of choices) expect(c.label.length).toBeGreaterThan(0);
    }
  });

  it('labels roots in the reader’s naming', () => {
    expect(rootChoices('major', 'solfege')[0].label).toBe('Do');
    expect(rootChoices('major', 'german')[11].label).toBe('H');
    expect(rootChoices('major')[10].label).toBe('B♭');
  });

  it('steps the root by a semitone, wrapping round, spelled for the scale', () => {
    expect(stepRoot('A', 'minor-pentatonic', 1)).toBe('Bb');
    expect(stepRoot('C', 'major', -1)).toBe('B');
    expect(stepRoot('B', 'major', 1)).toBe('C');
    expect(stepRoot('C', 'minor', 1)).toBe('C#');
  });

  it('describes tiers in plain words', () => {
    expect(tierLabel(1)).toBe('Start here');
    expect(tierLabel(4)).toBe('Specialist');
  });
});

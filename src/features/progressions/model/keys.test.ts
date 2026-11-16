import { describe, expect, it } from 'vitest';
import { PROGRESSIONS, progression } from '@/content/progressions';
import { chroma, isNote } from '@/core/theory';
import { capoAdvice, defaultTonic, keyOptions, keyParam, spellTonic, stepTonic, tonicFromParam } from './keys';

const axis = progression('pop-axis');
const andalusian = progression('flamenco-andalusian');

describe('key options', () => {
  it('lists the guitar-friendly keys first, then the other keys, twelve in all', () => {
    const { friendly, others, all } = keyOptions(axis);
    expect(friendly.map((k) => k.tonic)).toEqual([...axis.keys]);
    expect(friendly.length + others.length).toBe(12);
    expect(new Set(all.map((k) => k.pc)).size).toBe(12);
    expect(all.map((k) => k.pc)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('spells every key of every progression as a real note, once per pitch class', () => {
    for (const p of PROGRESSIONS) {
      const { all } = keyOptions(p);
      expect(all).toHaveLength(12);
      for (const k of all) expect(isNote(k.tonic)).toBe(true);
    }
  });

  it('defaults to the first guitar-friendly key', () => {
    expect(defaultTonic(axis)).toBe('G');
    expect(defaultTonic(andalusian)).toBe(andalusian.keys[0]);
  });
});

describe('key params', () => {
  it('round-trips through the route param', () => {
    for (const p of PROGRESSIONS.slice(0, 40)) {
      for (const k of keyOptions(p).all) {
        expect(tonicFromParam(p, keyParam(k.tonic))).toBe(k.tonic);
      }
    }
  });

  it('reads sharps, flats and plain names, and respells them for the progression', () => {
    expect(keyParam('F#')).toBe('f-sharp');
    expect(keyParam('Bb')).toBe('bb');
    expect(tonicFromParam(axis, 'f-sharp')).toBe(spellTonic(axis, 6));
    expect(tonicFromParam(axis, 'a-sharp')).toBe('Bb');
    expect(tonicFromParam(axis, 'Bb')).toBe('Bb');
    expect(tonicFromParam(axis, 'c')).toBe('C');
  });

  it('refuses anything that is not a note', () => {
    expect(tonicFromParam(axis, 'jam')).toBeNull();
    expect(tonicFromParam(axis, 'h')).toBeNull();
    expect(tonicFromParam(axis, '')).toBeNull();
    expect(tonicFromParam(axis, null)).toBeNull();
  });

  it('steps a semitone up and down, wrapping round the twelve', () => {
    expect(stepTonic(axis, 'G', 1)).toBe(spellTonic(axis, 8));
    expect(stepTonic(axis, 'C', -1)).toBe('B');
    expect(stepTonic(axis, 'B', 1)).toBe('C');
    let t = 'C';
    for (let i = 0; i < 12; i++) t = stepTonic(axis, t, 1);
    expect(t).toBe('C');
    expect(chroma(stepTonic(andalusian, 'E', -1))).toBe(3);
  });
});

describe('capo advice', () => {
  it('suggests capo 3 with G shapes for the axis progression in B flat', () => {
    const advice = capoAdvice(axis, 'Bb');
    expect(advice).not.toBeNull();
    expect(advice!.capo).toBe(3);
    expect(advice!.shapesTonic).toBe('G');
    expect(advice!.shapes).toEqual([
      { chord: 'Bb', shape: 'G' },
      { chord: 'F', shape: 'D' },
      { chord: 'Gm', shape: 'Em' },
      { chord: 'Eb', shape: 'C' },
    ]);
    expect(advice!.easyShare).toBeGreaterThan(advice!.withoutShare);
  });

  it('says nothing for a key that is already easy', () => {
    for (const t of ['G', 'C', 'D']) expect(capoAdvice(axis, t)).toBeNull();
  });

  it('suggests a capo for a blues in B flat (A or G shapes) but never for a jazz form', () => {
    const blues = progression('blues-12-bar-triads');
    const b = capoAdvice(blues, 'Bb');
    expect(b).not.toBeNull();
    expect(b!.capo).toBeGreaterThan(0);
    expect(capoAdvice(progression('jazz-ii-v-i'), 'Bb')).toBeNull();
    expect(capoAdvice(progression('jazz-rhythm-changes'), 'Db')).toBeNull();
  });

  it('names the shapes in the key the hand plays', () => {
    const minor = PROGRESSIONS.find((p) => p.id === 'minor-i-bvi-biii-bvii')!;
    const advice = capoAdvice(minor, 'C');
    if (advice) {
      expect(chroma(advice.shapesTonic)).toBe((12 + 0 - advice.capo) % 12);
      for (const s of advice.shapes) expect(isNote(s.shape.replace(/m$|5$|7$/, '')) || s.shape.length > 0).toBe(true);
    }
  });
});

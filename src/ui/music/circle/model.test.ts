import { describe, expect, it } from 'vitest';
import { circleSlots, circleWedges, moveOnCircle, polar, signatureText, slotOfKey, wedgePath } from './model';

const romanAt = (key: string) => {
  const out: Record<string, string> = {};
  for (const w of circleWedges(key)) if (w.roman) out[`${w.ring}:${w.keys[0].tonic}`] = w.roman;
  return out;
};

describe('circle of fifths model', () => {
  it('has twelve slots clockwise from C with the relative minors', () => {
    const slots = circleSlots();
    expect(slots.map((s) => s.major[0].tonic)).toEqual(['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F']);
    expect(slots.map((s) => s.minor[0].tonic)).toEqual(['A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'Bb', 'F', 'C', 'G', 'D']);
    expect(slots[6].major.map((k) => k.tonic)).toEqual(['F#', 'Gb']);
  });

  it('finds the slot of any spelling of a key', () => {
    expect(slotOfKey('G major')).toMatchObject({ index: 1, ring: 'major' });
    expect(slotOfKey('E minor')).toMatchObject({ index: 1, ring: 'minor' });
    expect(slotOfKey('Gb major')).toMatchObject({ index: 6, ring: 'major' });
    expect(slotOfKey('C# major')).toMatchObject({ index: 7, ring: 'major' });
    expect(slotOfKey('not a key')).toBeNull();
    expect(slotOfKey(null)).toBeNull();
  });

  it('puts the diatonic chords of G major on the key and its neighbours', () => {
    expect(romanAt('G major')).toEqual({
      'major:C': 'IV', 'major:G': 'I', 'major:D': 'V',
      'minor:A': 'ii', 'minor:E': 'vi', 'minor:B': 'iii',
      'minor:F#': 'vii°',
    });
    const sel = circleWedges('G major').filter((w) => w.selected);
    expect(sel).toHaveLength(1);
    expect(sel[0]).toMatchObject({ ring: 'major', index: 1 });
  });

  it('numbers a minor key against the major scale (bIII, bVI, bVII)', () => {
    expect(romanAt('A minor')).toEqual({
      'major:C': 'bIII', 'major:F': 'bVI', 'major:G': 'bVII',
      'minor:A': 'i', 'minor:D': 'iv', 'minor:E': 'v',
      'minor:B': 'ii°',
    });
  });

  it('writes signatures, including both spellings at the enharmonic slots', () => {
    const slots = circleSlots();
    expect(signatureText(slots[0])).toBe('0');
    expect(signatureText(slots[2])).toBe('2♯');
    expect(signatureText(slots[10])).toBe('2♭');
    expect(signatureText(slots[6])).toBe('6♯ 6♭');
  });

  it('draws wedges and walks the circle with the arrow keys', () => {
    const top = polar(100, 100, 50, 0);
    expect(top.x).toBeCloseTo(100, 6);
    expect(top.y).toBeCloseTo(50, 6);
    expect(polar(100, 100, 50, 90).x).toBeCloseTo(150, 6);
    expect(wedgePath(0, 0, 10, 20, -15, 15)).toMatch(/^M.* A20 20 0 0 1 .* L.* A10 10 0 0 0 .* Z$/);
    expect(moveOnCircle({ index: 11, ring: 'major' }, 'ArrowRight')).toEqual({ index: 0, ring: 'major' });
    expect(moveOnCircle({ index: 0, ring: 'major' }, 'ArrowLeft')).toEqual({ index: 11, ring: 'major' });
    expect(moveOnCircle({ index: 4, ring: 'major' }, 'ArrowDown')).toEqual({ index: 4, ring: 'minor' });
    expect(moveOnCircle({ index: 4, ring: 'minor' }, 'Home')).toEqual({ index: 0, ring: 'minor' });
  });
});

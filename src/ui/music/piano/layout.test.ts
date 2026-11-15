import { describe, expect, it } from 'vitest';
import { isBlackKey, pianoLayout, rangeAround } from './layout';

describe('pianoLayout', () => {
  it('lays out one octave: seven white keys, five black ones over the gaps', () => {
    const p = pianoLayout('C4', 'B4');
    expect(p.keys).toHaveLength(12);
    expect(p.whiteCount).toBe(7);
    const whites = p.keys.filter((k) => !k.black);
    expect(whites.map((k) => k.x)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const black = p.keys.filter((k) => k.black);
    expect(black.map((k) => k.midi)).toEqual([61, 63, 66, 68, 70]);
    // C# sits over the C|D gap, nudged toward C; D# toward E.
    const cs = black[0];
    expect(cs.x + cs.w / 2).toBeLessThan(1);
    expect(cs.x + cs.w / 2).toBeGreaterThan(0.8);
    expect(black[1].x + black[1].w / 2).toBeGreaterThan(2);
  });

  it('widens a range that starts or ends on a black key', () => {
    const p = pianoLayout('C#4', 'F#4');
    expect(p.from).toBe(60);
    expect(p.to).toBe(67);
    expect(pianoLayout(72, 60).from).toBe(60);
  });

  it('knows the black keys', () => {
    expect([60, 61, 62, 63, 64, 65, 66].map(isBlackKey)).toEqual([false, true, false, true, false, false, true]);
  });

  it('picks whole octaves around highlighted notes', () => {
    expect(rangeAround(['E4', 'G4'])).toEqual([60, 71]);
    expect(rangeAround(['Bb3', 'D5'])).toEqual([48, 83]);
    expect(rangeAround([])).toEqual([60, 71]);
  });
});

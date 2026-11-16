import { describe, expect, it } from 'vitest';
import { SLIDE_IN_SEMITONES, SLIDE_OUT_SEMITONES, parseTabTechnique, pitchCurve, slideGlide, slideGlideSeconds } from './expression';

/** The curve sampled every millisecond over `seconds`. */
function trace(curve: NonNullable<ReturnType<typeof pitchCurve>>, seconds: number): number[] {
  const out: number[] = [];
  for (let t = 0; t <= seconds + 1e-9; t += 0.001) out.push(curve.at(t));
  return out;
}

describe('pitch curves', () => {
  it('a note without techniques does not move', () => {
    expect(pitchCurve({}, 1)).toBeNull();
    expect(pitchCurve({ bend: 0, vibrato: false }, 1)).toBeNull();
  });

  it('a full bend rises smoothly to two semitones, stays there, and never overshoots', () => {
    const c = pitchCurve({ bend: 2 }, 0.8)!;
    expect(c.initial).toBe(0);
    const x = trace(c, 0.8);
    expect(Math.max(...x)).toBeCloseTo(200, 6);
    expect(Math.min(...x)).toBeGreaterThanOrEqual(0);
    // It takes a moment to arrive (a player pushes the string), then holds.
    const arrived = x.findIndex((v) => v > 199.9);
    expect(arrived).toBeGreaterThan(60);
    expect(arrived).toBeLessThan(260);
    expect(x.slice(arrived).every((v) => v > 199.9)).toBe(true);
    // Monotonic on the way up: no wobble.
    for (let i = 1; i < arrived; i++) expect(x[i]).toBeGreaterThanOrEqual(x[i - 1] - 1e-9);
    expect(c.end).toBeLessThan(0.3);
  });

  it('bend and release goes up to the target and back to the fretted pitch before the note ends', () => {
    const c = pitchCurve({ bend: { amount: 2, release: true } }, 1)!;
    const x = trace(c, 1);
    expect(Math.max(...x)).toBeCloseTo(200, 6);
    expect(x[x.length - 1]).toBeCloseTo(0, 6);
    expect(c.end).toBeLessThanOrEqual(1 + 1e-9);
    // The top is held for a while in the middle.
    expect(x.filter((v) => v > 199.9).length).toBeGreaterThan(200);
  });

  it('a pre-bend starts bent; with a release it comes down', () => {
    const held = pitchCurve({ bend: { amount: 1, pre: true } }, 1)!;
    expect(held.initial).toBeCloseTo(100, 9);
    expect(held.at(0.9)).toBeCloseTo(100, 9);
    const released = pitchCurve({ bend: { amount: 2, pre: true, release: true } }, 1)!;
    expect(released.initial).toBeCloseTo(200, 9);
    expect(released.at(1)).toBeCloseTo(0, 6);
  });

  it('a half-step and a quarter-tone bend reach exactly their amounts', () => {
    expect(Math.max(...trace(pitchCurve({ bend: 1 }, 0.6)!, 0.6))).toBeCloseTo(100, 6);
    expect(Math.max(...trace(pitchCurve({ bend: 0.5 }, 0.6)!, 0.6))).toBeCloseTo(50, 6);
  });

  it('vibrato waits for the note to speak, then swings sharp only (steel) at its rate and width', () => {
    const c = pitchCurve({ vibrato: true }, 2)!;
    const x = trace(c, 2);
    expect(x.slice(0, 120).every((v) => v === 0)).toBe(true);
    const later = x.slice(600);
    expect(Math.min(...later)).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.max(...later)).toBeCloseTo(30, 0);
    // Count the peaks over one second: 5.5 Hz.
    let peaks = 0;
    for (let i = 1001; i < 1999; i++) if (x[i] > x[i - 1] && x[i] >= x[i + 1] && x[i] > 15) peaks++;
    expect(peaks).toBeGreaterThanOrEqual(5);
    expect(peaks).toBeLessThanOrEqual(6);
    // Classical vibrato rocks both ways.
    const both = trace(pitchCurve({ vibrato: { shape: 'both', depth: 20 } }, 2)!, 2).slice(600);
    expect(Math.min(...both)).toBeCloseTo(-10, 0);
    expect(Math.max(...both)).toBeCloseTo(10, 0);
  });

  it('vibrato on a bend starts once the bend has arrived', () => {
    const c = pitchCurve({ bend: 2, vibrato: true }, 1.5)!;
    const x = trace(c, 1.5);
    const arrived = x.findIndex((v) => v > 199.9);
    // Before the bend arrives nothing but the bend; afterwards it wobbles above the bent pitch.
    expect(x.slice(0, arrived).every((v) => v <= 200 + 1e-9)).toBe(true);
    const after = x.slice(arrived + 200);
    expect(Math.min(...after)).toBeGreaterThanOrEqual(199.9);
    expect(Math.max(...after)).toBeGreaterThan(220);
  });

  it('a slide in starts a few frets away and arrives quickly; a slide out falls away at the end and fades', () => {
    const inBelow = pitchCurve({ slideIn: 'below' }, 0.5)!;
    expect(inBelow.initial).toBeCloseTo(-SLIDE_IN_SEMITONES * 100, 9);
    expect(inBelow.at(inBelow.end)).toBeCloseTo(0, 6);
    expect(inBelow.end).toBeLessThanOrEqual(0.12 + 1e-9);
    expect(pitchCurve({ slideIn: 'above' }, 0.5)!.initial).toBeCloseTo(SLIDE_IN_SEMITONES * 100, 9);
    const out = pitchCurve({ slideOut: 'down' }, 0.6)!;
    expect(out.at(0.2)).toBe(0);
    expect(out.at(0.6)).toBeCloseTo(-SLIDE_OUT_SEMITONES * 100, 6);
    expect(out.fadeFrom).toBeGreaterThanOrEqual(0.3);
    expect(pitchCurve({ slideOut: 'up' }, 0.6)!.at(0.6)).toBeCloseTo(SLIDE_OUT_SEMITONES * 100, 6);
  });

  it('nonsense is tamed: NaN lengths, huge bends', () => {
    const c = pitchCurve({ bend: 99 }, NaN)!;
    expect(Math.max(...trace(c, 1))).toBeCloseTo(400, 6);
    expect(Number.isFinite(c.end)).toBe(true);
  });

  it('a glide between two frets eases out of one and into the other', () => {
    expect(slideGlide(0, 200, 0)).toBe(0);
    expect(slideGlide(0, 200, 1)).toBe(200);
    expect(slideGlide(0, 200, 0.5)).toBeCloseTo(100, 9);
    expect(slideGlideSeconds(0.25)).toBeCloseTo(0.1125, 9);
    expect(slideGlideSeconds(5)).toBe(0.12);
    expect(slideGlideSeconds(0.01)).toBe(0.03);
  });
});

describe('tab techniques', () => {
  it('reads hammer-ons, pull-offs, slides, bends, releases and vibrato the way tab writes them', () => {
    expect(parseTabTechnique('5')).toEqual([{ fret: 5 }]);
    expect(parseTabTechnique('5h7')).toEqual([{ fret: 5 }, { fret: 7, legato: 'hammer' }]);
    expect(parseTabTechnique('7p5')).toEqual([{ fret: 7 }, { fret: 5, legato: 'pull' }]);
    expect(parseTabTechnique('5h7p5')).toEqual([{ fret: 5 }, { fret: 7, legato: 'hammer' }, { fret: 5, legato: 'pull' }]);
    expect(parseTabTechnique('5/7')).toEqual([{ fret: 5 }, { fret: 7, legato: 'slide' }]);
    expect(parseTabTechnique('7\\5')).toEqual([{ fret: 7 }, { fret: 5, legato: 'slide' }]);
    expect(parseTabTechnique('5s7')).toEqual([{ fret: 5 }, { fret: 7, legato: 'slide' }]);
    expect(parseTabTechnique('5b7')).toEqual([{ fret: 5, bend: { amount: 2 } }]);
    expect(parseTabTechnique('5b6')).toEqual([{ fret: 5, bend: { amount: 1 } }]);
    expect(parseTabTechnique('5b')).toEqual([{ fret: 5, bend: { amount: 2 } }]);
    expect(parseTabTechnique('5b7r5')).toEqual([{ fret: 5, bend: { amount: 2, release: true } }]);
    expect(parseTabTechnique('7pb9')).toEqual([{ fret: 7, bend: { amount: 2, pre: true } }]);
    expect(parseTabTechnique('7~')).toEqual([{ fret: 7, vibrato: true }]);
    expect(parseTabTechnique('/7')).toEqual([{ fret: 7, slideIn: 'below' }]);
    expect(parseTabTechnique('\\7')).toEqual([{ fret: 7, slideIn: 'above' }]);
    expect(parseTabTechnique('7\\')).toEqual([{ fret: 7, slideOut: 'down' }]);
    expect(parseTabTechnique('12h14p12~')).toEqual([{ fret: 12 }, { fret: 14, legato: 'hammer' }, { fret: 12, legato: 'pull', vibrato: true }]);
  });

  it('refuses what is not tab, and techniques that go the wrong way', () => {
    for (const bad of ['', 'x', 'h7', '7h5', '5p7', '5b3', '5b7r4', 'abc', '5q7']) expect(parseTabTechnique(bad), bad).toBeNull();
  });
});

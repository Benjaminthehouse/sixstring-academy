import { describe, expect, it } from 'vitest';
import { beatsPerMinute, countInWords, meterBeat, tempoMark } from './meter';

const T = (numerator: number, denominator: number) => ({ numerator, denominator });

describe('meterBeat', () => {
  it('counts quarters in simple time, dotted quarters in compound time, eighths in 3/8', () => {
    expect(meterBeat(T(4, 4))).toMatchObject({ ticks: 960, perBar: 4, glyph: null });
    expect(meterBeat(T(3, 4))).toMatchObject({ ticks: 960, perBar: 3 });
    expect(meterBeat(T(6, 8))).toMatchObject({ ticks: 1440, perBar: 2, glyph: '♩.', name: 'dotted-quarter' });
    expect(meterBeat(T(9, 8))).toMatchObject({ ticks: 1440, perBar: 3 });
    expect(meterBeat(T(12, 8))).toMatchObject({ ticks: 1440, perBar: 4 });
    expect(meterBeat(T(3, 8))).toMatchObject({ ticks: 480, perBar: 3, glyph: '♪', name: 'eighth-note' });
  });

  it('falls back to quarters when there is no meter', () => {
    expect(meterBeat(null).ticks).toBe(960);
  });
});

describe('tempoMark', () => {
  it('says a 6/8 song at 90 quarters a minute is ♩. = 60, the mark on the score', () => {
    expect(tempoMark(90, T(6, 8))).toMatchObject({ value: 60, short: '♩. = 60', spoken: '60 dotted-quarter beats a minute' });
    expect(beatsPerMinute(90, T(6, 8))).toBeCloseTo(60);
  });

  it('counts 3/8 in eighths: 60 quarters is 120 eighths, as the count-in clicks', () => {
    expect(tempoMark(60, T(3, 8))).toMatchObject({ value: 120, short: '♪ = 120' });
  });

  it('keeps plain bpm for a quarter beat', () => {
    expect(tempoMark(92.4, T(4, 4))).toMatchObject({ value: 92, short: '92 bpm', spoken: '92 beats a minute' });
  });

  it('follows the practice tempo: 70 % of ♩. = 60 is ♩. = 42', () => {
    expect(tempoMark(90 * 0.7, T(6, 8)).short).toBe('♩. = 42');
  });
});

describe('countInWords', () => {
  it('names the beats the count-in clicks', () => {
    expect(countInWords(T(4, 4))).toBe('One bar of clicks before the music starts: 4 beats.');
    expect(countInWords(T(6, 8))).toBe('One bar of clicks before the music starts: 2 dotted-quarter beats.');
    expect(countInWords(T(3, 8))).toBe('One bar of clicks before the music starts: 3 eighth-note beats.');
  });
});

import { describe, expect, it } from 'vitest';
import { centsBetween, freqToMidi, midiToFreq, midiToName, nearestNote, octaveOf, pitchClass } from './pitch-math';

describe('pitch-math', () => {
  it('maps the guitar open strings', () => {
    const open = [40, 45, 50, 55, 59, 64].map((m) => +midiToFreq(m).toFixed(2));
    expect(open).toEqual([82.41, 110, 146.83, 196, 246.94, 329.63]);
    expect([40, 45, 50, 55, 59, 64].map((m) => midiToName(m))).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
  });
  it('round-trips and measures cents', () => {
    expect(freqToMidi(440)).toBeCloseTo(69, 10);
    expect(freqToMidi(midiToFreq(52, 442), 442)).toBeCloseTo(52, 10);
    expect(centsBetween(midiToFreq(70), midiToFreq(69))).toBeCloseTo(100, 8);
    const n = nearestNote(midiToFreq(40) * Math.pow(2, 12 / 1200));
    expect(n.midi).toBe(40);
    expect(n.cents).toBeCloseTo(12, 1);
  });
  it('names notes', () => {
    expect(midiToName(60)).toBe('C4');
    expect(midiToName(61, { flats: true })).toBe('Db4');
    expect(midiToName(58, { octave: false })).toBe('A#');
    expect(pitchClass(-1)).toBe(11);
    expect(octaveOf(59)).toBe(3);
  });
});

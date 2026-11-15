import { describe, expect, it } from 'vitest';
import { key, scaleToneMap } from '@/core/theory';
import {
  DOUBLE_INLAY_FRETS, INLAY_FRETS, NECK_PRESETS, TUNINGS, fingertipDistance, fretAtDistance, fretDistance, fretMidpoint, fretSpaceAt, fretWidth,
  fretWireSegment, fretboardHalfWidth, fretboardLayout, fretboardNotes, frequencyAt, inlayFrets, isValidPosition, midiAt, neckGeometry, neckPoint,
  neckRange, noteAt, openStringMidi, physicalFret, pitchClassAt, positionKey, positionsForMidi, positionsForNote, positionsForPitchClass,
  samePosition, spellMidi, stringIndex, stringNumber, stringOffset,
} from './index';

describe('string numbering', () => {
  it('converts between string numbers and low-to-high indices', () => {
    expect(stringIndex(6)).toBe(0);
    expect(stringIndex(1)).toBe(5);
    expect(stringNumber(0)).toBe(6);
    expect(stringNumber(5)).toBe(1);
    expect(stringIndex(4, 4)).toBe(0);
    expect(stringNumber(0, 7)).toBe(7);
    for (let s = 1; s <= 7; s++) expect(stringNumber(stringIndex(s, 7), 7)).toBe(s);
  });
});

describe('pitch at a position', () => {
  it('matches the textbook fretboard', () => {
    expect(midiAt({ string: 6, fret: 0 })).toBe(40); // E2
    expect(midiAt({ string: 5, fret: 3 })).toBe(48); // C3
    expect(midiAt({ string: 2, fret: 1 })).toBe(60); // middle C
    expect(midiAt({ string: 1, fret: 5 })).toBe(69); // A4
    expect(midiAt({ string: 1, fret: 12 })).toBe(76);
    expect(midiAt({ string: 3, fret: 4 })).toBe(midiAt({ string: 2, fret: 0 }));
    for (const s of [6, 5, 4, 2]) expect(midiAt({ string: s, fret: 5 })).toBe(midiAt({ string: s - 1, fret: 0 }));
  });

  it('counts frets from the capo', () => {
    expect(midiAt({ string: 6, fret: 0 }, { capo: 2 })).toBe(42);
    expect(midiAt({ string: 5, fret: 3 }, { capo: 2 })).toBe(50);
    expect(openStringMidi(1, { capo: 3 })).toBe(67);
    expect(physicalFret(3, 2)).toBe(5);
  });

  it('follows the tuning', () => {
    expect(midiAt({ string: 6, fret: 0 }, { tuning: 'drop-d' })).toBe(38);
    expect(midiAt({ string: 4, fret: 2 }, { tuning: 'bass' })).toBe(30);
    expect(midiAt({ string: 7, fret: 0 }, { tuning: 'standard-7' })).toBe(35);
    expect(pitchClassAt({ string: 1, fret: 3 }, { tuning: 'ukulele' })).toBe(0);
    expect(() => midiAt({ string: 7, fret: 0 })).toThrow(RangeError);
    expect(() => midiAt({ string: 0, fret: 0 })).toThrow(RangeError);
  });

  it('gives frequencies for the concert pitch', () => {
    expect(frequencyAt({ string: 5, fret: 0 })).toBeCloseTo(110, 6);
    expect(frequencyAt({ string: 1, fret: 5 }, { a4: 442 })).toBeCloseTo(442, 6);
  });

  it('validates positions', () => {
    expect(isValidPosition({ string: 1, fret: 0 })).toBe(true);
    expect(isValidPosition({ string: 7, fret: 0 })).toBe(false);
    expect(isValidPosition({ string: 7, fret: 0 }, { tuning: 'standard-7' })).toBe(true);
    expect(isValidPosition({ string: 1, fret: -1 })).toBe(false);
    expect(isValidPosition({ string: 1, fret: 25 })).toBe(false);
    expect(isValidPosition({ string: 1, fret: 2.5 })).toBe(false);
    expect(isValidPosition({ string: 1, fret: 13 }, { maxFret: 12 })).toBe(false);
  });
});

describe('spelling', () => {
  it('spells a position the way its key or scale does', () => {
    const pos = { string: 1, fret: 1 }; // F4 / E#4
    expect(noteAt(pos)).toBe('F4');
    expect(noteAt(pos, { context: { tonic: 'F#', scale: 'major' } })).toBe('E#4');
    expect(noteAt(pos, { context: { tonic: 'F#', scale: 'major' }, octave: false })).toBe('E#');
    expect(noteAt({ string: 2, fret: 2 }, { context: { key: 'Ab major' } })).toBe('Db4');
    expect(noteAt({ string: 2, fret: 2 }, { context: { key: 'A major' } })).toBe('C#4');
    expect(noteAt({ string: 2, fret: 2 }, { context: { key: key('Db major') }, octave: false })).toBe('Db');
    expect(noteAt({ string: 3, fret: 1 }, { context: { chord: 'E7' } })).toBe('G#3');
    expect(noteAt({ string: 3, fret: 1 }, { context: { chord: 'Fm' } })).toBe('Ab3');
    expect(noteAt({ string: 3, fret: 1 }, { context: { prefer: 'flats' } })).toBe('Ab3');
    expect(noteAt({ string: 3, fret: 1 }, { context: { prefer: 'sharps' } })).toBe('G#3');
    expect(noteAt({ string: 3, fret: 1 }, { context: scaleToneMap('A', 'harmonic-minor') })).toBe('G#3');
  });

  it('spells bare MIDI numbers', () => {
    expect(spellMidi(61)).toBe('Db4');
    expect(spellMidi(61, { key: 'D' })).toBe('C#4');
    expect(spellMidi(59, { tonic: 'Gb', scale: 'major' })).toBe('Cb4');
    expect(spellMidi(60, { tonic: 'C#', scale: 'major' })).toBe('B#3');
    expect(spellMidi(66, undefined, { octave: false })).toBe('F#');
  });

  it('labels a whole fretboard', () => {
    const rows = fretboardNotes({ maxFret: 12, context: { key: 'F major' } });
    expect(rows).toHaveLength(6);
    expect(rows[0]).toHaveLength(13);
    expect(rows[0][0]).toEqual({ string: 6, fret: 0, midi: 40, note: 'E' });
    expect(rows[0][6].note).toBe('Bb');
    expect(rows[5][12]).toEqual({ string: 1, fret: 12, midi: 76, note: 'E' });
    expect(fretboardNotes({ tuning: 'bass', maxFret: 5 })).toHaveLength(4);
  });
});

describe('finding positions', () => {
  it('finds every place a pitch can be played', () => {
    expect(positionsForMidi(64)).toEqual([
      { string: 5, fret: 19 }, { string: 4, fret: 14 }, { string: 3, fret: 9 }, { string: 2, fret: 5 }, { string: 1, fret: 0 },
    ]);
    expect(positionsForMidi(40)).toEqual([{ string: 6, fret: 0 }]);
    expect(positionsForMidi(39)).toEqual([]);
    expect(positionsForMidi(64, { maxFret: 5 })).toEqual([{ string: 2, fret: 5 }, { string: 1, fret: 0 }]);
    expect(positionsForMidi(64, { minFret: 6, maxFret: 12 })).toEqual([{ string: 3, fret: 9 }]);
    expect(positionsForMidi(66, { capo: 2 })).toContainEqual({ string: 1, fret: 0 });
    expect(positionsForNote('E4')).toEqual(positionsForMidi(64));
    expect(positionsForNote(64)).toEqual(positionsForMidi(64));
  });

  it('finds every place of a pitch class', () => {
    const cs = positionsForPitchClass('C', { maxFret: 12 });
    expect(cs).toEqual([
      { string: 6, fret: 8 }, { string: 5, fret: 3 }, { string: 4, fret: 10 }, { string: 3, fret: 5 }, { string: 2, fret: 1 }, { string: 1, fret: 8 },
    ]);
    expect(positionsForPitchClass(4, { maxFret: 12 }).filter((p) => p.string === 6)).toEqual([{ string: 6, fret: 0 }, { string: 6, fret: 12 }]);
    expect(positionsForNote('C', { maxFret: 12 })).toEqual(cs);
    expect(() => positionsForPitchClass('X')).toThrow(RangeError);
    expect(() => positionsForNote('?')).toThrow(RangeError);
  });

  it('agrees with midiAt in every tuning, with and without a capo', () => {
    for (const t of TUNINGS) {
      for (const capo of [0, 3]) {
        for (let string = 1; string <= t.stringCount; string++) {
          for (const fret of [0, 1, 7, 12]) {
            const pos = { string, fret };
            const midi = midiAt(pos, { tuning: t, capo });
            expect(positionsForMidi(midi, { tuning: t, capo })).toContainEqual(pos);
            expect(positionsForPitchClass(midi % 12, { tuning: t, capo })).toContainEqual(pos);
          }
        }
      }
    }
  });

  it('reports the range of the neck', () => {
    expect(neckRange()).toEqual({ low: 40, high: 86 });
    expect(neckRange({ frets: 24 }).high).toBe(88);
    expect(neckRange({ tuning: 'bass', frets: 20 })).toEqual({ low: 28, high: 63 });
    expect(neckRange({ capo: 2 }).low).toBe(42);
  });

  it('compares and keys positions', () => {
    expect(positionKey({ string: 5, fret: 3 })).toBe('5:3');
    expect(samePosition({ string: 5, fret: 3 }, { string: 5, fret: 3 })).toBe(true);
    expect(samePosition({ string: 5, fret: 3 }, { string: 5, fret: 4 })).toBe(false);
  });
});

describe('fret geometry', () => {
  it('places frets by the twelfth root of two', () => {
    expect(fretDistance(0)).toBe(0);
    expect(fretDistance(12)).toBeCloseTo(0.5, 12);
    expect(fretDistance(24)).toBeCloseTo(0.75, 12);
    expect(fretDistance(1)).toBeCloseTo(1 - Math.pow(2, -1 / 12), 12);
    expect(fretDistance(12, 648)).toBeCloseTo(324, 9);
    expect(fretDistance(1, 648)).toBeCloseTo(36.37, 2);
    expect(fretDistance(5, 648)).toBeCloseTo(162.54, 1);
    // The string left to vibrate past fret n sounds n semitones higher: its length ratio is 2^(-n/12).
    for (let n = 0; n <= 24; n++) expect(1 - fretDistance(n)).toBeCloseTo(Math.pow(2, -n / 12), 12);
  });

  it('inverts fret distance', () => {
    for (let n = 0; n <= 24; n += 0.5) expect(fretAtDistance(fretDistance(n, 650), 650)).toBeCloseTo(n, 9);
    expect(fretAtDistance(1)).toBe(Infinity);
    expect(fretAtDistance(700, 648)).toBe(Infinity);
    expect(fretSpaceAt(0)).toBe(0);
    expect(fretSpaceAt(fretMidpoint(3))).toBe(3);
    expect(fretSpaceAt(fretDistance(3))).toBe(3);
    expect(fretSpaceAt(fretDistance(3) + 1e-6)).toBe(4);
  });

  it('gives fret spaces that shrink by the same ratio', () => {
    expect(fretWidth(0)).toBe(0);
    for (let n = 1; n < 24; n++) {
      expect(fretWidth(n + 1)).toBeLessThan(fretWidth(n));
      expect(fretWidth(n + 1) / fretWidth(n)).toBeCloseTo(Math.pow(2, -1 / 12), 12);
    }
    const total = Array.from({ length: 12 }, (_x, i) => fretWidth(i + 1)).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(0.5, 12);
  });

  it('puts markers in the middle of the fret space and fingertips behind the wire', () => {
    expect(fretMidpoint(0)).toBe(0);
    for (let n = 1; n <= 22; n++) {
      const low = fretDistance(n - 1);
      const high = fretDistance(n);
      expect(fretMidpoint(n)).toBeCloseTo((low + high) / 2, 12);
      expect(fingertipDistance(n)).toBeGreaterThan(fretMidpoint(n));
      expect(fingertipDistance(n)).toBeLessThan(high);
    }
    expect(fingertipDistance(0)).toBe(0);
    expect(fingertipDistance(5, 1, 0.5)).toBeCloseTo(fretMidpoint(5), 12);
  });

  it('lists the inlay frets', () => {
    expect([...INLAY_FRETS]).toEqual([3, 5, 7, 9, 12, 15, 17, 19, 21, 24]);
    expect([...DOUBLE_INLAY_FRETS]).toEqual([12, 24]);
    expect(inlayFrets(12)).toEqual([
      { fret: 3, double: false }, { fret: 5, double: false }, { fret: 7, double: false }, { fret: 9, double: false }, { fret: 12, double: true },
    ]);
  });

  it('maps positions onto the neck plane', () => {
    const g = NECK_PRESETS.electric;
    const lowE = neckPoint({ string: 6, fret: 5 });
    const highE = neckPoint({ string: 1, fret: 5 });
    expect(lowE.x).toBeCloseTo(fretMidpoint(5, g.scaleLength), 9);
    expect(lowE.x).toBe(highE.x);
    expect(lowE.y).toBeCloseTo(-highE.y, 9);
    expect(lowE.y).toBeLessThan(0);
    // Strings fan out toward the bridge and stay inside the fretboard.
    expect(Math.abs(neckPoint({ string: 1, fret: 12 }).y)).toBeGreaterThan(Math.abs(neckPoint({ string: 1, fret: 1 }).y));
    for (const fret of [0, 1, 12, 22]) {
      const p = neckPoint({ string: 1, fret });
      expect(Math.abs(p.y)).toBeLessThan(fretboardHalfWidth(p.x));
    }
    expect(stringOffset(1, 0)).toBeCloseTo(g.nutSpread / 2, 9);
    expect(stringOffset(6, g.scaleLength)).toBeCloseTo(-g.bridgeSpread / 2, 9);
    expect(neckPoint({ string: 3, fret: 0 }).x).toBe(0);
    expect(neckPoint({ string: 3, fret: 7 }, g, 'wire').x).toBeCloseTo(fretDistance(7, g.scaleLength), 9);
    expect(neckPoint({ string: 3, fret: 7 }, g, 'fingertip').x).toBeCloseTo(fingertipDistance(7, g.scaleLength), 9);
    const [a, b] = fretWireSegment(12);
    expect(a.x).toBeCloseTo(g.scaleLength / 2, 9);
    expect(b.y - a.y).toBeCloseTo(g.width12, 9);
    expect(fretboardHalfWidth(0)).toBeCloseTo(g.nutWidth / 2, 9);
  });

  it('builds geometries from presets and partial values', () => {
    expect(neckGeometry('classical').scaleLength).toBe(650);
    expect(neckGeometry().stringCount).toBe(6);
    const seven = neckGeometry({ stringCount: 7 });
    expect(seven.nutSpread).toBeCloseTo((NECK_PRESETS.electric.nutSpread / 5) * 6, 9);
    expect(seven.nutWidth).toBeGreaterThan(seven.nutSpread);
    expect(stringOffset(7, 0, seven)).toBeCloseTo(-seven.nutSpread / 2, 9);
    expect(neckGeometry({ scaleLength: 628 }).nutWidth).toBe(NECK_PRESETS.electric.nutWidth);
    expect(stringOffset(1, 10, { ...NECK_PRESETS.electric, stringCount: 1 })).toBe(0);
  });

  it('lays out a stretch of fretboard for drawing', () => {
    const layout = fretboardLayout({ firstFret: 1, lastFret: 12 });
    expect(layout.wires).toHaveLength(13);
    expect(layout.wires[0]).toBe(0);
    expect(layout.wires[12]).toBeCloseTo(1, 12);
    expect(layout.centres).toHaveLength(12);
    for (let i = 0; i < 12; i++) {
      expect(layout.centres[i]).toBeGreaterThan(layout.wires[i]);
      expect(layout.centres[i]).toBeLessThan(layout.wires[i + 1]);
    }
    expect(layout.wires[1] - layout.wires[0]).toBeGreaterThan(layout.wires[12] - layout.wires[11]);
    expect(layout.strings).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => expect.closeTo(v, 9)));
    const box = fretboardLayout({ firstFret: 5, lastFret: 9, proportional: false, stringCount: 4 });
    expect(box.wires).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => expect.closeTo(v, 9)));
    expect(box.strings).toHaveLength(4);
    expect(fretboardLayout({ stringCount: 1 }).strings).toEqual([0.5]);
  });
});

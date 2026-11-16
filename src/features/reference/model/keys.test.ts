import { describe, expect, it } from 'vitest';
import { scaleNotes } from '@/core/theory';
import { MNEMONICS, flatOrder, majorFromFlats, majorFromSharps, namingRules, raisedSeventh, rowOfKey, scaleLine, sharpOrder, signatureRows } from './keys';

describe('key signatures', () => {
  const rows = signatureRows();

  it('has 15 signatures covering all 30 keys once', () => {
    expect(rows).toHaveLength(15);
    const ids = rows.flatMap((r) => [r.major.id, r.minor.id]);
    expect(new Set(ids).size).toBe(30);
  });

  // Hand-written truth sample (any theory book's table).
  it('matches the standard table', () => {
    const table = Object.fromEntries(rows.map((r) => [r.fifths, `${r.major.name} / ${r.minor.name}: ${r.accidentals.join(' ')}`]));
    expect(table[0]).toBe('C major / A minor: ');
    expect(table[1]).toBe('G major / E minor: F#');
    expect(table[3]).toBe('A major / F# minor: F# C# G#');
    expect(table[6]).toBe('F# major / D# minor: F# C# G# D# A# E#');
    expect(table[7]).toBe('C# major / A# minor: F# C# G# D# A# E# B#');
    expect(table[-1]).toBe('F major / D minor: Bb');
    expect(table[-4]).toBe('Ab major / F minor: Bb Eb Ab Db');
    expect(table[-6]).toBe('Gb major / Eb minor: Bb Eb Ab Db Gb Cb');
    expect(table[-7]).toBe('Cb major / Ab minor: Bb Eb Ab Db Gb Cb Fb');
  });

  it('every key’s own scale carries exactly its signature’s accidentals', () => {
    for (const r of rows) {
      for (const k of [r.major, r.minor]) {
        const altered = scaleNotes(k.tonic, k.mode === 'major' ? 'major' : 'minor').filter((n) => n.length > 1);
        expect(new Set(altered)).toEqual(new Set(r.accidentals));
      }
    }
  });

  it('knows the order of sharps and flats and the sentences that spell them', () => {
    expect(sharpOrder()).toEqual(['F#', 'C#', 'G#', 'D#', 'A#', 'E#', 'B#']);
    expect(flatOrder()).toEqual(['Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Fb']);
    const initials = (s: string) => s.split(' ').map((w) => w[0]).join('');
    expect(initials(MNEMONICS.sharps)).toBe(sharpOrder().map((n) => n[0]).join(''));
    expect(initials(MNEMONICS.flats)).toBe(flatOrder().map((n) => n[0]).join(''));
  });

  it('naming rules hold for every signature', () => {
    for (const r of rows) {
      if (r.type === 'sharps') expect(majorFromSharps(r.accidentals)).toBe(r.major.tonic);
      if (r.type === 'flats') expect(majorFromFlats(r.accidentals)).toBe(r.major.tonic);
    }
  });

  it('writes the worked examples from the engine', () => {
    const [sharps, flats, minor] = namingRules();
    expect(sharps.text).toContain('end on G#, so the key is A major');
    expect(flats.text).toContain('Bb Eb Ab, so the key is Eb major');
    expect(minor.text).toContain('A major or F# minor');
  });

  it('finds the row of a major or minor key', () => {
    expect(rowOfKey(rows, 'e-minor')?.major.name).toBe('G major');
    expect(rowOfKey(rows, 'x')).toBeNull();
  });

  it('puts the scale on the guitar staff from octave 3', () => {
    const g = rows.find((r) => r.fifths === 1)!;
    expect(scaleLine(g.major)).toEqual(['G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F#4', 'G4']);
    expect(scaleLine(g.minor)).toEqual(['E3', 'F#3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4']);
    expect(scaleLine(g.minor, 'harmonic')[6]).toBe('D#4');
    expect(raisedSeventh(g.minor)).toBe('D#');
    expect(raisedSeventh(g.major)).toBeNull();
    // G# minor's leading tone is a double sharp.
    expect(raisedSeventh(rows.find((r) => r.fifths === 5)!.minor)).toBe('F##');
  });
});

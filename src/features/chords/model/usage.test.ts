import { describe, expect, it } from 'vitest';
import { CHORD_TYPES, parseChord } from '@/core/theory';
import { chordsOfType } from './catalog';
import { changePartners, chordUsage, keysOf } from './usage';

describe('where a chord is used', () => {
  it('lists the keys a G chord belongs to with its numeral there', () => {
    const keys = keysOf('G', 30);
    const find = (k: string) => keys.find((u) => u.key === k)?.roman;
    expect(find('G major')).toBe('I');
    expect(find('C major')).toBe('V');
    expect(find('D major')).toBe('IV');
    expect(find('E minor')).toBe('♭III');
    expect(keys[0].roman).toBe('I');
  });

  it('only lists keys whose notes spell the chord', () => {
    const f = keysOf('F', 30).map((k) => k.key);
    expect(f).toContain('Bb minor');
    expect(f).not.toContain('A# minor');
    expect(f).not.toContain('C minor');
    expect(keysOf('E7', 30).map((k) => `${k.key} ${k.roman}`)).toContain('A minor V7');
  });

  it('builds everyday progressions in the right keys', () => {
    const g = chordUsage('G');
    expect(g.examples[0]).toMatchObject({ key: 'G major', romans: 'I–V–vi–IV', chords: ['G', 'D', 'Em', 'C'], self: 0 });
    expect(g.examples[1]).toMatchObject({ key: 'D major', chords: ['D', 'G', 'A', 'D'], self: 1 });
    const am7 = chordUsage('Am7');
    expect(am7.examples[0]).toMatchObject({ key: 'G major', chords: ['Am7', 'D7', 'Gmaj7'] });
    const half = chordUsage('F#m7b5');
    expect(half.examples[0]).toMatchObject({ key: 'E minor', chords: ['F#m7b5', 'B7', 'Em'] });
    const em = chordUsage('Em');
    expect(em.examples[0]).toMatchObject({ key: 'G major', chords: ['G', 'D', 'Em', 'C'], self: 2 });
    expect(chordUsage('E7').examples.some((e) => e.chords.join(' ') === 'E7 A7 B7')).toBe(true);
  });

  it('keeps the chord itself in its example', () => {
    expect(chordUsage('Cadd9').examples[0].chords[0]).toBe('Cadd9');
    expect(chordUsage('G7#9').examples.some((e) => e.chords.includes('G7#9'))).toBe(true);
  });

  it('works for every type on every root without throwing, with valid chords only', () => {
    for (const t of CHORD_TYPES) {
      for (const s of chordsOfType(t)) {
        const u = chordUsage(s);
        expect(u.styles.length, s).toBeGreaterThan(20);
        for (const ex of u.examples) {
          expect(ex.chords[ex.self], s).toBe(s);
          for (const c of ex.chords) expect(parseChord(c), `${s}: ${c}`).not.toBeNull();
          expect(ex.chords.join(' ')).not.toMatch(/##|bb/);
        }
      }
    }
  }, 60_000);
});

describe('change partners', () => {
  it('start with the classic beginner pairs', () => {
    expect(changePartners('G').slice(0, 3)).toEqual(['C', 'Em', 'D']);
    expect(changePartners('Em')[0]).toBe('Am');
    expect(changePartners('C13b9').length).toBeGreaterThan(0);
    expect(changePartners('G')).not.toContain('G');
  });
});

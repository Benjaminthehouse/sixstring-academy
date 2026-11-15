import { describe, expect, it } from 'vitest';
import { beginnerVoicing } from '@/core/guitar';
import { CHORD_TYPES, chordPcs, parseChord } from '@/core/theory';
import { chordsOfType, chordsOnRoot, FAMILIES, familyById, familyOfType, FIRST_CHORDS, learningIndex, nextToLearn, PATH, ROOTS, rootPc, searchChords, spellRoot, stageProgress, symbolFor } from './catalog';

describe('families', () => {
  it('put every catalog chord type in exactly one family', () => {
    const counts = new Map<string, number>();
    for (const f of FAMILIES) for (const t of f.types) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const t of CHORD_TYPES) expect(counts.get(t.id), t.id).toBe(1);
    expect([...counts.keys()].sort()).toEqual(CHORD_TYPES.map((t) => t.id).sort());
    expect(CHORD_TYPES).toHaveLength(69);
  });

  it('follow the brief: major, minor, 7, maj7, m7, sus, add, 6, 9, dim, aug, half-diminished, extended, altered (and power)', () => {
    expect(FAMILIES.map((f) => f.id)).toEqual(['major', 'minor', '7', 'maj7', 'm7', 'sus', 'add', '6', '9', 'dim', 'aug', 'half-diminished', 'extended', 'altered', 'power']);
    for (const f of FAMILIES) {
      expect(f.blurb.length).toBeGreaterThan(20);
      expect(familyById(f.id)).toBe(f);
    }
  });

  it('lead each family with its everyday type', () => {
    expect(familyById('m7')!.types[0]).toBe('m7');
    expect(familyById('sus')!.types[0]).toBe('sus4');
    expect(familyById('half-diminished')!.types[0]).toBe('m7b5');
    expect(familyOfType('7sharp9').id).toBe('altered');
    expect(familyOfType('m7b5').id).toBe('half-diminished');
    expect(familyOfType('5').id).toBe('power');
  });
});

describe('roots', () => {
  it('spell black-key roots as charts do', () => {
    expect(spellRoot(1, 'major')).toBe('Db');
    expect(spellRoot(1, 'minor')).toBe('C#');
    expect(spellRoot(8, 'major')).toBe('Ab');
    expect(spellRoot(8, 'minor')).toBe('G#');
    expect(spellRoot(10, 'minor')).toBe('Bb');
    expect(spellRoot(6, 'major')).toBe('F#');
    expect(spellRoot(6, 'm7b5')).toBe('F#');
    expect(symbolFor(1, 'm7')).toBe('C#m7');
    expect(symbolFor(3, '7sharp9')).toBe('Eb7#9');
  });

  it('give twelve distinct chords per type, one on each root', () => {
    for (const t of CHORD_TYPES) {
      const chords = chordsOfType(t);
      expect(chords).toHaveLength(12);
      const pcs = chords.map((s) => rootPc(parseChord(s)!.root));
      expect(pcs).toEqual(ROOTS.map((r) => r.pc));
      for (const s of chords) expect(parseChord(s)?.type.id, s).toBe(t.id);
    }
  });

  it('list the chords on a root by family, rare ones only on request', () => {
    const everyday = chordsOnRoot(7, { maxTier: 2 }).flatMap((g) => g.chords);
    expect(everyday).toContain('G');
    expect(everyday).toContain('Gm7');
    expect(everyday).not.toContain('G7#9');
    expect(chordsOnRoot(7).flatMap((g) => g.chords)).toHaveLength(69);
  });
});

describe('the first-chords path', () => {
  it('starts with Em, Am, E, A, D, G, C, then Dm and F', () => {
    expect(FIRST_CHORDS.slice(0, 9)).toEqual(['Em', 'Am', 'E', 'A', 'D', 'G', 'C', 'Dm', 'F']);
    expect(learningIndex('Em')).toBe(0);
    expect(learningIndex('F')).toBe(8);
    expect(learningIndex('C13b9')).toBe(-1);
  });

  it('has no repeats and only canonical symbols', () => {
    expect(new Set(FIRST_CHORDS).size).toBe(FIRST_CHORDS.length);
    for (const s of FIRST_CHORDS) expect(parseChord(s)?.symbol).toBe(s);
  });

  it('gets harder stage by stage: the first seven are easy open chords', () => {
    for (const s of PATH[0].chords) {
      const v = beginnerVoicing(s)!;
      expect(v.category, s).toBe('open');
      expect(v.difficulty, s).toBeLessThanOrEqual(3.6);
    }
    const mean = (chords: string[]) => chords.reduce((sum, s) => sum + beginnerVoicing(s)!.difficulty, 0) / chords.length;
    expect(mean(PATH[0].chords)).toBeLessThan(mean(PATH[1].chords));
    expect(mean(PATH[0].chords)).toBeLessThan(mean(PATH[3].chords));
    for (const s of FIRST_CHORDS) expect(beginnerVoicing(s), s).not.toBeNull();
  });

  it('finds the next chord to learn and counts a stage', () => {
    expect(nextToLearn(new Set())).toBe('Em');
    expect(nextToLearn(new Set(['Em', 'Am']))).toBe('E');
    expect(nextToLearn(new Set(FIRST_CHORDS))).toBeNull();
    expect(stageProgress(PATH[0], new Set(['Em', 'G', 'Bm']))).toEqual({ known: 2, total: 7 });
  });
});

describe('search', () => {
  const symbols = (q: string) => searchChords(q).filter((h) => h.kind === 'chord').map((h) => (h.kind === 'chord' ? h.symbol : ''));

  it('finds a typed symbol first', () => {
    expect(symbols('F#m7b5')[0]).toBe('F#m7b5');
    expect(symbols('Bb/D')[0]).toBe('Bb/D');
    expect(symbols('f#m7b5')[0]).toBe('F#m7b5');
    expect(symbols('F♯m7♭5')[0]).toBe('F#m7b5');
    expect(symbols('am')[0]).toBe('Am');
    expect(symbols('Bø7')[0]).toBe('Bm7b5');
    expect(searchChords('F#m7b5')[0]).toMatchObject({ kind: 'chord', exact: true });
  });

  it('completes a suffix on the same root', () => {
    const hits = symbols('Cma');
    expect(hits).toContain('Cmaj7');
    expect(hits).toContain('Cmaj9');
    const minors = symbols('F#m');
    expect(minors[0]).toBe('F#m');
    expect(minors).toContain('F#m7');
    expect(minors).toContain('F#m7b5');
  });

  it('offers the everyday chords for a bare root', () => {
    const hits = symbols('G');
    expect(hits[0]).toBe('G');
    expect(hits).toContain('Gm');
    expect(hits).toContain('G7');
  });

  it('finds chord types by name', () => {
    const types = (q: string) => searchChords(q).flatMap((h) => (h.kind === 'type' ? [h.type.id] : []));
    expect(types('minor seventh')).toContain('m7');
    expect(types('half diminished')).toContain('m7b5');
    expect(types('suspended')).toContain('sus4');
    expect(searchChords('')).toEqual([]);
  });

  it('gives chords whose notes the theory engine agrees with', () => {
    for (const q of ['Cmaj7', 'Eb7#9', 'Abm6', 'C#dim7']) {
      const s = symbols(q)[0];
      expect(chordPcs(s).length).toBeGreaterThanOrEqual(3);
    }
  });
});

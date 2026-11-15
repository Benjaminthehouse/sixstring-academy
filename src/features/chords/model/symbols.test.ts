import { describe, expect, it } from 'vitest';
import { CHORD_TYPES } from '@/core/theory';
import { chordsOfType } from './catalog';
import { chordFromParam, chordParam, chordSkillId, displaySymbol, fromSkillSlug, readSymbol, skillSlug, viewFromParams } from './symbols';

const SAFE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe('route params', () => {
  it('use the theory module’s chord slugs', () => {
    expect(chordParam('G')).toBe('g-major');
    expect(chordParam('F#m7b5')).toBe('f-sharp-m7b5');
    expect(chordParam('Bbmaj7')).toBe('bb-maj7');
    expect(chordParam('C/E')).toBe('c-major-over-e');
    expect(chordParam('D/F#')).toBe('d-major-over-f-sharp');
  });

  it('round-trip every catalog type on every root, and slash chords', () => {
    for (const t of CHORD_TYPES) {
      for (const s of chordsOfType(t)) {
        const p = chordParam(s);
        expect(p, s).toMatch(SAFE);
        expect(chordFromParam(p), s).toBe(s);
      }
    }
    for (const s of ['C/E', 'G/B', 'Am7/G', 'D/F#', 'Bb/D', 'F/C']) expect(chordFromParam(chordParam(s))).toBe(s);
  });

  it('read hand-typed addresses and other screens’ skill slugs', () => {
    expect(chordFromParam('g')).toBe('G');
    expect(chordFromParam('f-sharp-m7')).toBe('F#m7');
    expect(chordFromParam('f-sharp-m')).toBe('F#m');
    expect(chordFromParam('em')).toBe('Em');
    expect(chordFromParam('am7')).toBe('Am7');
    expect(chordFromParam('b-flat')).toBe('Bb');
    expect(chordFromParam('bb')).toBe('Bb');
    expect(chordFromParam('c-e')).toBe('C/E');
    expect(chordFromParam('eb-m7')).toBe('Ebm7');
    expect(chordFromParam('nonsense')).toBeNull();
    expect(chordFromParam('h7')).toBeNull();
  });
});

describe('skill ids', () => {
  it('follow the convention the progress, practice and profile modules read', () => {
    expect(chordSkillId('Em')).toBe('chord:em');
    expect(chordSkillId('F')).toBe('chord:f');
    expect(chordSkillId('Am7')).toBe('chord:am7');
    expect(chordSkillId('F#m')).toBe('chord:f-sharp-m');
    expect(chordSkillId('Bb')).toBe('chord:b-flat');
    expect(chordSkillId('C/E')).toBe('chord:c-e');
    expect(skillSlug('C7#9')).toBe('c7sharp9');
    expect(skillSlug('C6/9')).toBe('c69');
  });

  it('read back to the same chord for every type on every root', () => {
    for (const t of CHORD_TYPES) {
      for (const s of chordsOfType(t)) {
        const slug = skillSlug(s);
        expect(slug, s).toMatch(SAFE);
        expect(fromSkillSlug(slug)?.symbol, `${s} -> ${slug}`).toBe(s);
      }
    }
    expect(fromSkillSlug('d-f-sharp')?.symbol).toBe('D/F#');
  });
});

describe('typed symbols', () => {
  it('forgive case and Unicode accidentals', () => {
    expect(readSymbol('am7')?.symbol).toBe('Am7');
    expect(readSymbol('bb/d')?.symbol).toBe('Bb/D');
    expect(readSymbol('C♯m')?.symbol).toBe('C#m');
    expect(readSymbol('')).toBeNull();
    expect(displaySymbol('F#m7b5')).toBe('F♯m7♭5');
    expect(displaySymbol('not a chord')).toBe('not a chord');
  });
});

describe('views', () => {
  it('route params to sub-screens', () => {
    expect(viewFromParams([])).toEqual({ view: 'library' });
    expect(viewFromParams(['g'])).toEqual({ view: 'chord', symbol: 'G', voicing: null });
    expect(viewFromParams(['f-sharp-m7'])).toEqual({ view: 'chord', symbol: 'F#m7', voicing: null });
    expect(viewFromParams(['f-major', '2'])).toEqual({ view: 'chord', symbol: 'F', voicing: 2 });
    expect(viewFromParams(['trainer'])).toEqual({ view: 'trainer', chords: [] });
    expect(viewFromParams(['trainer', 'g-major', 'c-major'])).toEqual({ view: 'trainer', chords: ['G', 'C'] });
    expect(viewFromParams(['changes'])).toEqual({ view: 'trainer', chords: [] });
    expect(viewFromParams(['identify', 'x32010'])).toEqual({ view: 'identify', shape: 'x32010' });
    expect(viewFromParams(['mine'])).toEqual({ view: 'mine' });
    expect(viewFromParams(['type', 'm7'])).toEqual({ view: 'type', family: 'm7' });
    expect(viewFromParams(['root', 'f-sharp'])).toEqual({ view: 'root', root: 'F#' });
    expect(viewFromParams(['what-is-this'])).toEqual({ view: 'library' });
  });
});

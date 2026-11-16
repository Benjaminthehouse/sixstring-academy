/**
 * Cases found in review: harmony of the three minor scales, display names, search words learners
 * type ("7th", "parallel minor", "leading tone"), and copy that read wrong ("P.M..").
 * Truth here is written out by hand, not taken from the engine.
 */
import { describe, expect, it } from 'vitest';
import { keyFromParam } from './circle';
import { MINOR_KINDS, harmonyCaption, harmonyTable, minorKindFromParam } from './harmony';
import { intervalById } from './intervals';
import { prettyName } from './names';
import { scaleGroups } from './scales';
import { TOPICS, buildSearchIndex, normalizeQuery, searchReference } from './search';
import { sectionText } from './text';

const rowOf = (t: ReturnType<typeof harmonyTable>, keyId: string) => t.rows.find((r) => r.key.id === keyId)!.chords;

describe('chords of the three minor scales', () => {
  it('natural minor keeps the borrowed V and vii° columns', () => {
    const t = harmonyTable('minor');
    expect(t.minor).toBe('natural');
    expect(t.columns.map((c) => c.roman)).toEqual(['i', 'ii°', 'bIII', 'iv', 'v', 'bVI', 'bVII', 'V', 'vii°']);
    expect(t.columns.map((c) => c.harmonic)).toEqual([false, false, false, false, false, false, false, true, true]);
    expect(rowOf(t, 'a-minor')).toEqual(['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G', 'E', 'G#dim']);
  });

  it('harmonic minor: i ii° III+ iv V VI vii°', () => {
    const t = harmonyTable('minor', false, 'harmonic');
    expect(t.minor).toBe('harmonic');
    expect(t.columns.map((c) => c.roman)).toEqual(['i', 'ii°', 'bIII+', 'iv', 'V', 'bVI', 'vii°']);
    expect(t.columns.every((c) => !c.harmonic)).toBe(true);
    expect(rowOf(t, 'a-minor')).toEqual(['Am', 'Bdim', 'Caug', 'Dm', 'E', 'F', 'G#dim']);
    expect(rowOf(t, 'c-minor')).toEqual(['Cm', 'Ddim', 'Ebaug', 'Fm', 'G', 'Ab', 'Bdim']);
    // The raised 7th of G# minor is F double-sharp, never G.
    expect(rowOf(t, 'g-sharp-minor')).toEqual(['G#m', 'A#dim', 'Baug', 'C#m', 'D#', 'E', 'F##dim']);
  });

  it('harmonic minor sevenths: i(maj7) iiø7 III+maj7 iv7 V7 VImaj7 vii°7', () => {
    const t = harmonyTable('minor', true, 'harmonic');
    expect(rowOf(t, 'a-minor')).toEqual(['AmMaj7', 'Bm7b5', 'Cmaj7#5', 'Dm7', 'E7', 'Fmaj7', 'G#dim7']);
  });

  it('melodic minor: i ii III+ IV V vi° vii°', () => {
    const t = harmonyTable('minor', false, 'melodic');
    expect(t.columns.map((c) => c.roman)).toEqual(['i', 'ii', 'bIII+', 'IV', 'V', 'vi°', 'vii°']);
    expect(rowOf(t, 'a-minor')).toEqual(['Am', 'Bm', 'Caug', 'D', 'E', 'F#dim', 'G#dim']);
    expect(rowOf(t, keyFromParam('Eb minor')!.id)).toEqual(['Ebm', 'Fm', 'Gbaug', 'Ab', 'Bb', 'Cdim', 'Ddim']);
  });

  it('melodic minor sevenths: i(maj7) ii7 III+maj7 IV7 V7 viø7 viiø7', () => {
    const t = harmonyTable('minor', true, 'melodic');
    expect(rowOf(t, 'a-minor')).toEqual(['AmMaj7', 'Bm7', 'Cmaj7#5', 'D7', 'E7', 'F#m7b5', 'G#m7b5']);
  });

  it('major keys ignore the minor choice', () => {
    expect(harmonyTable('major', false, 'melodic')).toEqual(harmonyTable('major'));
    expect(harmonyTable('major').minor).toBeNull();
  });

  it('reads the minor scale from the address and explains each table', () => {
    expect(minorKindFromParam('harmonic-minor')).toBe('harmonic');
    expect(minorKindFromParam('melodic-minor')).toBe('melodic');
    expect(minorKindFromParam('a-minor')).toBeNull();
    expect(MINOR_KINDS.map((k) => k.value)).toEqual(['natural', 'harmonic', 'melodic']);
    expect(harmonyCaption('minor', 'harmonic')).toMatch(/raises the 7th/);
    expect(harmonyCaption('minor', 'melodic')).toMatch(/raises the 6th and the 7th/);
  });

  it('the text export carries all three minor tables', () => {
    const text = sectionText('harmony');
    expect(text).toContain('Minor keys, harmonic minor');
    expect(text).toContain('A minor | Am | Bdim | Caug | Dm | E | F | G#dim');
    expect(text).toContain('Minor keys, melodic minor');
    expect(text).toContain('A minor | Am | Bm | Caug | D | E | F#dim | G#dim');
  });
});

describe('display names', () => {
  it('writes accidentals in names as signs', () => {
    expect(prettyName('Drop C#')).toBe('Drop C♯');
    expect(prettyName('Eb standard')).toBe('E♭ standard');
    expect(prettyName('Dorian b2')).toBe('Dorian ♭2');
    expect(prettyName('Dorian #4')).toBe('Dorian ♯4');
    expect(prettyName('Lydian #2 #6')).toBe('Lydian ♯2 ♯6');
    expect(prettyName('Minor 7b5 pentatonic')).toBe('Minor 7♭5 pentatonic');
    expect(prettyName('Phrygian b4 bb7')).toBe('Phrygian ♭4 𝄫7');
  });

  it('leaves ordinary words alone', () => {
    for (const word of ['Bebop Dorian', 'Blues', 'Arabian', 'Lydian augmented', 'Ab']) {
      expect(prettyName(word).replace('A♭', 'Ab')).toBe(word);
    }
  });

  it('every step in a scale formula is one the intro explains (H, W, WH, 2W)', () => {
    const tokens = new Set(scaleGroups(0).flatMap((g) => g.rows.flatMap((r) => r.steps)));
    expect([...tokens].sort()).toEqual(['2W', 'H', 'W', 'WH']);
  });
});

describe('search finds what learners type', () => {
  const index = buildSearchIndex();
  const ids = (q: string, n = 8) => searchReference(index, q, n).map((h) => h.entry.id);
  const titles = (q: string, n = 8) => searchReference(index, q, n).map((h) => h.entry.title);

  it('keeps ids unique with the topics added', () => {
    const all = index.map((e) => e.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it('reads ordinals as words', () => {
    expect(normalizeQuery('7th')).toBe('seventh');
    expect(normalizeQuery('dominant 7th chord')).toBe('dominant seventh chord');
    expect(normalizeQuery('8th note')).toBe('eighth note');
    expect(ids('7th')).toContain('chords:7');
    expect(ids('maj 7th')).toContain('chords:maj7');
    expect(ids('8th note')).toContain('notation:note-values');
    expect(ids('13th')).toContain('chords:13');
  });

  it('finds relative and parallel keys by either word order', () => {
    expect(ids('relative minor')).toContain('glossary:relative-minor');
    expect(ids('minor relative')).toContain('glossary:relative-minor');
    expect(titles('parallel minor')[0]).toBe('Parallel keys');
    expect(titles('parallel major')[0]).toBe('Parallel keys');
  });

  it('finds ideas that live inside a section', () => {
    expect(titles('leading tone')[0]).toBe('Leading tone');
    expect(titles('leading note')[0]).toBe('Leading tone');
    expect(titles('roman numerals')).toContain('Diatonic chords and Roman numerals');
    expect(titles('b string')[0]).toBe('The G–B exception');
    expect(titles('harmonic minor chords')[0]).toBe('Chords of harmonic minor');
    expect(titles('jazz minor chords')[0]).toBe('Chords of melodic minor');
    expect(titles('inversion')).toContain('Inverting an interval');
  });

  it('every topic opens a place that exists', () => {
    for (const t of TOPICS) {
      if (!t.item) continue;
      const ok =
        (t.section === 'circle' && keyFromParam(t.item) !== null) ||
        (t.section === 'harmony' && minorKindFromParam(t.item) !== null) ||
        (t.section === 'intervals' && (t.item === 'g-b' || intervalById(t.item) !== null));
      expect(ok, `${t.section}:${t.item}`).toBe(true);
    }
  });

  it('shows scale and tuning names with signs', () => {
    expect(titles('dorian b2')[0]).toBe('Dorian ♭2');
    expect(titles('drop c#')).toContain('Drop C♯');
  });

  it('does not double the full stop after a symbol that has one', () => {
    const pm = index.find((e) => e.id === 'notation:palm-mute')!;
    expect(pm.subtitle.startsWith('Written P.M. Rest')).toBe(true);
    const h = index.find((e) => e.id === 'notation:hammer-on')!;
    expect(h.subtitle.startsWith('Written h. ')).toBe(true);
    expect(index.some((e) => /\.\.(?!\.)/.test(e.subtitle))).toBe(false);
  });
});

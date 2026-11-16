import { describe, expect, it } from 'vitest';
import { PROGRESSIONS, homeKey, progression, resolveProgression } from '@/content/progressions';
import { defaultProfile } from '@/core/progress';
import { needsPlainWords, plainKeyName, plainRole, plainScaleName, plainTitle } from './plain';

const NUMERAL_WORD = /(^|[\s(–-])[b#♭♯]?(?:iii|ii|iv|vii|vi|v|i|III|II|IV|VII|VI|V|I)(?:°|ø|\+|maj|m|\d)*(?=$|[\s)–\-/,:])/;

describe('who gets plain words', () => {
  const skill = { attempts: 1, completed: true } as never;
  it('a beginner, and anyone in Mia’s course, until Dev’s or Prof. Varga’s course starts', () => {
    const base = { profile: defaultProfile(0), skills: {} };
    expect(needsPlainWords({ ...base, profile: { ...base.profile, experience: 'beginner' }, skills: {} })).toBe(true);
    expect(needsPlainWords({ ...base, profile: { ...base.profile, experience: 'intermediate' }, skills: {} })).toBe(false);
    expect(needsPlainWords({ ...base, profile: { ...base.profile, experience: 'intermediate' }, skills: { 'teacher:mia:first-chords': skill } })).toBe(true);
    expect(needsPlainWords({ ...base, profile: { ...base.profile, experience: 'beginner' }, skills: { 'teacher:mia:first-chords': skill, 'teacher:dev:major-scale': skill } })).toBe(false);
    expect(needsPlainWords({ ...base, profile: { ...base.profile, experience: 'beginner' }, skills: { 'teacher:elena:legato': skill } })).toBe(false);
    // A lesson only opened, never tried, does not count.
    expect(needsPlainWords({ ...base, profile: { ...base.profile, experience: 'beginner' }, skills: { 'teacher:dev:major-scale': { attempts: 0, completed: false } as never } })).toBe(true);
  });
});

describe('plain scale and key names', () => {
  it('describe a mode or harmonic minor by the notes that differ', () => {
    expect(plainScaleName('A', 'harmonic-minor')).toBe('A minor with G♯');
    expect(plainScaleName('E', 'harmonic-minor')).toBe('E minor with D♯');
    expect(plainScaleName('E', 'dorian')).toBe('E minor with C♯');
    expect(plainScaleName('G', 'mixolydian')).toBe('G major with F');
    expect(plainScaleName('E', 'phrygian')).toBe('E minor with F');
    expect(plainScaleName('F', 'lydian')).toBe('F major with B');
    expect(plainScaleName('A', 'harmonic-minor', 'solfege')).toBe('La minor with Sol♯');
  });

  it('keep the everyday names a beginner already knows', () => {
    expect(plainScaleName('A', 'minor-pentatonic')).toMatch(/^A minor pentatonic$/i);
    expect(plainScaleName('G', 'major')).toMatch(/^G major$/i);
    expect(plainScaleName('E', 'minor-blues')).toMatch(/^E minor blues$/i);
  });

  it('never say "harmonic" for any scale the jam offers on Mia’s progressions', () => {
    for (const p of PROGRESSIONS) {
      for (const tip of p.tryThis.scales) {
        const text = plainScaleName('A', tip.scale);
        if (tip.scale === 'harmonic-minor') expect(text).not.toMatch(/harmonic/i);
      }
    }
  });

  it('name keys plainly, a mode after its plain description', () => {
    expect(plainKeyName(homeKey(progression('pop-axis'), 'G'))).toBe('G major');
    expect(plainKeyName(homeKey(progression('classical-minor-cadence'), 'A'))).toBe('A minor');
    expect(plainKeyName(homeKey(progression('funk-one-chord-minor'), 'E'))).toBe('E minor with C♯ (Dorian)');
  });
});

describe('plain titles', () => {
  it('drop the numerals and keep the words', () => {
    expect(plainTitle('I–V–vi–IV (the axis progression)', [])).toBe('The axis progression');
    expect(plainTitle('Minor cadence (i–iv–V7–i)', [])).toBe('Minor cadence');
    expect(plainTitle('Three chords: I–IV–I–V', [])).toBe('Three chords');
    expect(plainTitle('Two chords: I and V7', [])).toBe('Two chords');
    expect(plainTitle('12-bar blues (dominant sevenths)', [])).toBe('12-bar blues (dominant sevenths)');
    expect(plainTitle('Andalusian cadence', [])).toBe('Andalusian cadence');
  });

  it('use the chords when the name is only numerals', () => {
    expect(plainTitle('i–bVI–bIII–bVII', ['Em', 'C', 'G', 'D', 'Em'])).toBe('Em – C – G – D');
    expect(plainTitle('Mixolydian I–bVII', ['G', 'F'])).toBe('G – F');
  });

  it('leave no roman numeral in any catalog name', () => {
    for (const p of PROGRESSIONS) {
      const r = resolveProgression(p, p.keys[0]);
      const chords = r.bars.flat().map((c) => c.symbol);
      const title = plainTitle(p.name, chords);
      expect(title.length, p.id).toBeGreaterThan(0);
      expect(NUMERAL_WORD.test(title), `${p.id}: ${title}`).toBe(false);
    }
  });
});

describe('plain chord role', () => {
  it('calls the chord on the home note the home chord, and says nothing about the others', () => {
    const key = homeKey(progression('classical-minor-cadence'), 'A');
    expect(plainRole('A', key)).toBe('Home chord');
    expect(plainRole('E', key)).toBeNull();
  });
});

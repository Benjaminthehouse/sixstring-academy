import { describe, expect, it } from 'vitest';
import { checkVoicingFingering, formatFrets } from '@/core/guitar';
import { CHORD_TYPES, chordPcs } from '@/core/theory';
import { chordsOfType } from './catalog';
import { defaultIndex, defaultVoicing, difficultyWord, groupOf, isPlayable, shapeNote, voicingSet } from './voicings';

describe('every chord in the catalog', () => {
  it('has at least one playable voicing in all 12 roots, or a clear note saying why not', () => {
    const problems: string[] = [];
    let chords = 0;
    for (const t of CHORD_TYPES) {
      for (const symbol of chordsOfType(t)) {
        chords++;
        const set = voicingSet(symbol);
        if (set.all.length === 0) {
          if (!set.note || !/no practical shape/.test(set.note)) problems.push(`${symbol}: no voicing and no note`);
          continue;
        }
        for (const v of set.all) {
          if (!isPlayable(v)) problems.push(`${symbol}: ${formatFrets(v.frets)} is not playable`);
          if (checkVoicingFingering(v.frets, v.fingers).length) problems.push(`${symbol}: ${formatFrets(v.frets)} breaks the hand rules`);
          // Every sounding note is a tone of the chord.
          const pcs = new Set(chordPcs(symbol));
          for (const m of v.midi) if (!pcs.has(m % 12)) problems.push(`${symbol}: ${formatFrets(v.frets)} sounds a note outside the chord`);
        }
      }
    }
    expect(chords).toBe(69 * 12);
    expect(problems).toEqual([]);
  }, 120_000);
});

describe('a chord page’s shapes', () => {
  it('open on the easiest whole chord: the small F, the open G and C', () => {
    expect(formatFrets(defaultVoicing('F')!.frets)).toBe('xx3211');
    expect(formatFrets(defaultVoicing('G')!.frets)).toBe('320003');
    expect(formatFrets(defaultVoicing('C')!.frets)).toBe('x32010');
    expect(formatFrets(defaultVoicing('Em')!.frets)).toBe('022000');
    expect(formatFrets(defaultVoicing('E5')!.frets)).toMatch(/^02/);
  });

  it('open the first-chords path on the shapes a teacher shows: barres stay barres', () => {
    expect(formatFrets(defaultVoicing('Bm')!.frets)).toBe('x24432');
    expect(formatFrets(defaultVoicing('F#m')!.frets)).toBe('244222');
    expect(defaultVoicing('Bb')!.baseFret).toBe(1);
    expect(defaultVoicing('C#m')!.baseFret).toBeLessThanOrEqual(4);
  });

  it('keep the full barre for F among the whole-chord shapes', () => {
    const whole = voicingSet('F').groups.find((g) => g.id === 'whole')!.voicings.map((v) => formatFrets(v.frets));
    expect(whole).toContain('133211');
    expect(whole.indexOf('xx3211')).toBeLessThan(whole.indexOf('133211'));
  });

  it('show open, E- and A-shape barres, CAGED shapes and triads for a major chord', () => {
    const set = voicingSet('C');
    const cats = new Set(set.all.map((v) => v.category));
    for (const c of ['open', 'barre', 'caged', 'triad']) expect(cats.has(c as never), c).toBe(true);
    const shapes = new Set(set.all.filter((v) => v.category === 'barre').map((v) => v.shape));
    expect(shapes.has('E')).toBe(true);
    expect(shapes.has('A')).toBe(true);
    expect(set.groups.map((g) => g.id)).toEqual(['whole', 'triad']);
  });

  it('show shells, jazz grips and drop 2 / drop 3 for a seventh chord', () => {
    const groups = voicingSet('Cmaj7').groups.map((g) => g.id);
    expect(groups).toEqual(['whole', 'jazz', 'drop']);
    const cats = new Set(voicingSet('Cmaj7').all.map((v) => v.category));
    for (const c of ['shell', 'jazz', 'drop2', 'drop3']) expect(cats.has(c as never), c).toBe(true);
  });

  it('order every group from easiest', () => {
    for (const s of ['C', 'F', 'Bm', 'Cmaj7', 'G7', 'F#m7b5', 'C13b9']) {
      for (const g of voicingSet(s).groups) {
        const d = g.voicings.map((v) => v.difficulty);
        expect([...d].sort((a, b) => a - b), `${s} ${g.id}`).toEqual(d);
        for (const v of g.voicings) expect(groupOf(v)).toBe(g.id);
      }
    }
  });

  it('say so when a shape leaves tones out (of that shape, not of the chord)', () => {
    const set = voicingSet('C13');
    expect(set.all.length).toBeGreaterThan(0);
    for (const v of set.all) expect(shapeNote(v) === null).toBe(v.omitted.length === 0);
    expect(set.all.some((v) => v.omitted.length > 0 && /leaves out/.test(shapeNote(v)!))).toBe(true);
    expect(voicingSet('C').note).toBeNull();
  });

  it('describe difficulty in words', () => {
    expect(difficultyWord({ difficulty: 2.2 })).toBe('Easy');
    expect(difficultyWord({ difficulty: 5 })).toBe('Medium');
    expect(difficultyWord({ difficulty: 6.9 })).toBe('Hard');
    expect(difficultyWord({ difficulty: 8.5 })).toBe('Expert');
  });

  it('point the page at the default shape inside the easiest-first list', () => {
    const set = voicingSet('Bm');
    expect(formatFrets(set.all[defaultIndex('Bm')].frets)).toBe('x24432');
    expect(defaultIndex('G')).toBe(0);
  });

  it('cope with nonsense', () => {
    const set = voicingSet('H#');
    expect(set.all).toEqual([]);
    expect(set.note).toBeTruthy();
  });
});

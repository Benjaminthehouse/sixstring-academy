import { describe, expect, it } from 'vitest';
import { scalePatterns } from '@/core/guitar';
import { SCALES, chroma, getScale, scaleNotes, staffPosition } from '@/core/theory';
import { rootChoices } from './catalog';
import { familyModes, modeSentence, prettyDegrees, relatedParams, scalePageModel, staffLine } from './page';

describe('every scale page', () => {
  it('builds for every scale in the catalog in all 12 roots, and agrees with the theory engine', () => {
    let pages = 0;
    for (const s of SCALES) {
      for (const root of rootChoices(s.id)) {
        const m = scalePageModel(root.tonic, s.id);
        pages++;
        expect(m.tones.map((t) => t.note)).toEqual(scaleNotes(root.tonic, s.id));
        expect(m.tones.map((t) => t.degree)).toEqual(s.degrees);
        expect(m.steps.reduce((sum, st) => sum + st.semitones, 0)).toBe(12);
        expect(m.steps).toHaveLength(s.size);
        expect(m.title.length).toBeGreaterThan(2);
        expect(m.mood.length).toBeGreaterThan(10);
        // Every relative and parallel is a real scale page.
        for (const r of [...m.relatives, ...m.parallels]) {
          expect(getScale(r.scale), r.scale).not.toBeNull();
          expect(relatedParams(r)).toHaveLength(2);
        }
        for (const c of m.fitsChords) expect(chroma(c.symbol.match(/^[A-G](#|b)*/)![0])).toBe(chroma(root.tonic));
        // A staff line one octave up and down from the root.
        const line = staffLine(`${root.tonic}3`, s.id);
        expect(line.notes).toHaveLength(2 * s.size + 1);
        expect(line.notes[0]).toBe(line.notes[line.notes.length - 1]);
        expect(line.top).toBe(s.size);
      }
    }
    expect(pages).toBe(SCALES.length * 12);
  });

  it('builds the chord lists of every seven-note scale that can be stacked in thirds', () => {
    for (const s of SCALES.filter((x) => x.size === 7)) {
      const m = scalePageModel('C', s.id);
      if (m.triads) {
        expect(m.triads).toHaveLength(7);
        expect(m.sevenths).toHaveLength(7);
      }
    }
    expect(scalePageModel('C', 'major').triads).not.toBeNull();
    expect(scalePageModel('C', 'minor-pentatonic').triads).toBeNull();
  });
});

describe('the scale page model', () => {
  it('describes A minor pentatonic', () => {
    const m = scalePageModel('A', 'minor-pentatonic');
    expect(m.title).toBe('A minor pentatonic');
    expect(m.tones.map((t) => t.label)).toEqual(['A', 'C', 'D', 'E', 'G']);
    expect(m.degreesText).toBe('1 ♭3 4 5 ♭7');
    expect(m.stepsText).toBe('W+H–W–W–W+H–W');
    expect(m.steps[0].words).toBe('step and a half (3 frets)');
    expect(m.tones[1].intervalWords).toBe('minor third');
    expect(m.groupTitle).toBe('Essentials');
    // The engine's chord-scale matching: the first choice over Am7.
    const am7 = m.fitsChords.find((c) => c.symbol === 'Am7')!;
    expect(am7.fit).toBe('primary');
    expect(am7.rank).toBe(1);
    expect(m.fitsChords[0].fit).toBe('primary');
    // The same five notes from C are C major pentatonic.
    expect(m.relatives.map((r) => `${r.tonic} ${r.scale}`)).toContain('C major-pentatonic');
    expect(m.compareWith[0]).toBe('minor-blues');
  });

  it('spells F♯ major with E♯, never F', () => {
    const m = scalePageModel('F#', 'major');
    expect(m.tones.map((t) => t.note)).toEqual(['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#']);
    expect(m.tones.map((t) => t.label)).toContain('E♯');
    expect(m.triads!.map((c) => c.symbol)).toEqual(['F#', 'G#m', 'A#m', 'B', 'C#', 'D#m', 'E#dim']);
  });

  it('names each mode’s parent on the root that shares its notes', () => {
    const d = scalePageModel('D', 'dorian');
    expect(d.modeOf).toEqual({ mode: 2, parent: 'major', parentName: 'major', parentTonic: 'C' });
    expect(modeSentence(d)).toBe('Dorian is the second mode of C major: the same notes, starting from D.');
    expect(scalePageModel('A', 'minor-pentatonic').parallels[0].detail).toBe('Minor blues is Minor pentatonic with an added ♭5.');
    expect(prettyDegrees('raised #4 and b7 (b13)')).toBe('raised ♯4 and ♭7 (♭13)');
    expect(scalePageModel('E', 'phrygian-dominant').modeOf?.parentTonic).toBe('A');
    expect(scalePageModel('C', 'major').modeOf).toBeNull();
  });

  it('lists the seven modes of the family, each from its own root', () => {
    const modes = familyModes('D', 'dorian');
    expect(modes.map((m) => `${m.tonic} ${m.scale}`)).toEqual(['C major', 'D dorian', 'E phrygian', 'F lydian', 'G mixolydian', 'A minor', 'B locrian']);
    expect(familyModes('A', 'minor-blues')).toEqual([]);
  });

  it('harmonises A natural minor with the right numerals', () => {
    const m = scalePageModel('A', 'minor');
    expect(m.triads!.map((c) => `${c.roman} ${c.symbol}`)).toEqual(['i Am', 'ii° Bdim', 'bIII C', 'iv Dm', 'v Em', 'bVI F', 'bVII G']);
    expect(m.triads![2].romanText).toBe('♭III');
    expect(m.sevenths!.map((c) => c.symbol)).toEqual(['Am7', 'Bm7b5', 'Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7']);
  });

  it('offers a simpler spelling when there is one', () => {
    expect(scalePageModel('A#', 'minor').simplerTonic).toBe('Bb');
    expect(scalePageModel('Bb', 'minor').simplerTonic).toBeNull();
    expect(scalePageModel('A', 'minor').simplerTonic).toBeNull();
  });

  it('labels notes in solfege when asked', () => {
    expect(scalePageModel('C', 'major', 'solfege').tones.map((t) => t.label)).toEqual(['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si']);
  });
});

describe('the staff line', () => {
  it('goes up an octave and back down, spelled by the engine', () => {
    const line = staffLine('A2', 'minor-pentatonic');
    expect(line.notes).toEqual(['A2', 'C3', 'D3', 'E3', 'G3', 'A3', 'G3', 'E3', 'D3', 'C3', 'A2']);
    expect(line.labels).toEqual(['R', '♭3', '4', '5', '♭7', 'R', '♭7', '5', '4', '♭3', 'R']);
  });

  it('starts from the lowest root of box 1, so the staff shows what the shape plays', () => {
    const box1 = scalePatterns('A', 'minor-pentatonic')[0];
    const lowest = box1.roots.reduce((a, b) => (a.string > b.string ? a : b));
    expect(lowest).toEqual({ string: 6, fret: 5 });
    // A2 in the guitar's treble clef (8vb) sits in the second space down from the staff, written A3.
    expect(staffPosition('A2').written).toBe('A3');
  });
});

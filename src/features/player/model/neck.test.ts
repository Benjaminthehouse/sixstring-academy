import { describe, expect, it } from 'vitest';
import { flattenSong, practiceTargets, sixTab } from '@/core/song';
import { beatSpots, chartSymbol, chordName, describeSpots, heardName, neckMarkers, neckRange, spotName, targetSpots } from './neck';

const STANDARD = [40, 45, 50, 55, 59, 64];

describe('fretboard under the score', () => {
  it('shows the nut for parts near it and a window up the neck otherwise', () => {
    expect(neckRange([{ fret: 0 }, { fret: 4 }])).toEqual([0, 5]);
    expect(neckRange([{ fret: 2 }, { fret: 3 }])).toEqual([0, 5]);
    expect(neckRange([{ fret: 7 }, { fret: 10 }])).toEqual([6, 11]);
    expect(neckRange([{ fret: 5 }, { fret: 12 }], { maxFret: 15 })).toEqual([4, 13]);
    expect(neckRange([])).toEqual([0, 5]);
    // A part that climbs past the learner's last fret still shows its top note.
    expect(neckRange([{ fret: 0 }, { fret: 17 }], { maxFret: 12 })).toEqual([0, 17]);
  });

  it('turns beats and targets into spots, with fingers from the score', () => {
    const song = sixTab(`title: Spots
tempo: 90
| "G" q 3:4{3} 3:2{1} (5:3 4:0) 3:x |
`);
    const t = flattenSong(song);
    const beats = t.trackBeats(song.tracks[0].id);
    expect(beatSpots(beats[0])).toEqual([{ string: 3, fret: 4, finger: 3 }]);
    expect(beatSpots(beats[3])).toEqual([]); // a dead note is not a place to light up
    const targets = practiceTargets(t, song.tracks[0].id);
    expect(targetSpots(targets[1])).toEqual([{ string: 3, fret: 2, finger: 1 }]);
    expect(beatSpots(null)).toEqual([]);
  });

  it('lights the notes to play now and dims the next ones, spelled in the key', () => {
    const m = neckMarkers([{ string: 3, fret: 4, finger: 3 }], [{ string: 3, fret: 2 }, { string: 3, fret: 4 }], { tuning: STANDARD, capo: 0, key: 'G' });
    expect(m).toEqual([
      expect.objectContaining({ string: 3, fret: 4, state: 'target', color: 'accent', note: 'B', noteLabel: true, description: 'now, finger 3' }),
      expect.objectContaining({ string: 3, fret: 2, state: 'ghost', color: 'neutral', note: 'A', description: 'next' }),
    ]);
    // Spelled for the key: string 1, fret 6 is B flat in F and A sharp in E.
    expect(neckMarkers([{ string: 2, fret: 3 }], [], { tuning: STANDARD, capo: 0, key: 'F' })[0].note).toBe('D');
    expect(neckMarkers([{ string: 1, fret: 6 }], [], { tuning: STANDARD, capo: 0, key: 'F' })[0].note).toBe('Bb');
    expect(neckMarkers([{ string: 1, fret: 6 }], [], { tuning: STANDARD, capo: 0, key: 'E' })[0].note).toBe('A#');
  });

  it('counts frets from the capo', () => {
    // Capo 2, string 3 open sounds A.
    expect(neckMarkers([{ string: 3, fret: 0 }], [], { tuning: STANDARD, capo: 2 })[0].note).toBe('A');
  });

  it('says in words where to play', () => {
    const o = { tuning: STANDARD, capo: 0, key: 'G' };
    expect(describeSpots([{ string: 3, fret: 4, finger: 3 }], o)).toBe('B on string 3, fret 4 (finger 3)');
    expect(describeSpots([{ string: 1, fret: 0 }], o)).toBe('E on open string 1');
    expect(describeSpots([{ string: 5, fret: 0 }, { string: 4, fret: 2 }], o)).toBe('A on open string 5 and E on string 4, fret 2');
    expect(describeSpots([], o, 'G')).toBe('the G chord');
  });

  // Review: the wait-mode prompt showed data spellings ("F# on string 4", "That sounded like A#").
  it('writes sharps and flats as ♯ and ♭ in the words it shows', () => {
    const inE = { tuning: STANDARD, capo: 0, key: 'E' };
    const inF = { tuning: STANDARD, capo: 0, key: 'F' };
    expect(describeSpots([{ string: 4, fret: 4 }], inE)).toBe('F♯ on string 4, fret 4');
    expect(describeSpots([{ string: 1, fret: 6 }], inF)).toBe('B♭ on string 1, fret 6');
    expect(describeSpots([], inE, 'F#m7')).toBe('the F♯m7 chord');
    expect(chordName('Bb')).toBe('B♭');
    expect(spotName({ string: 1, fret: 6 }, inE)).toBe('A♯');
  });

  it('names a heard pitch in the song’s key', () => {
    expect(heardName(70, 'F')).toBe('B♭');
    expect(heardName(70, 'E')).toBe('A♯');
    expect(heardName(66)).toBe('F♯');
    expect(heardName(60, 'G')).toBe('C');
    expect(heardName(-1)).toBe('that');
  });

  it('names a chord behind a capo by the shape played, as the chart above the tab does', () => {
    // Korobeiniki under capo 2: the song sounds F♯7, Bm; the learner plays and reads E7, Am.
    expect(chordName(chartSymbol('F#7', 2))).toBe('E7');
    expect(chordName(chartSymbol('Bm', 2))).toBe('Am');
    expect(chordName(chartSymbol('A', 2))).toBe('G');
    expect(describeSpots([], { tuning: STANDARD, capo: 2 }, chartSymbol('A', 2))).toBe('the G chord');
    // No capo: what sounds is what is played.
    expect(chartSymbol('F#7', 0)).toBe('F#7');
    expect(chartSymbol('N.C.', 3)).toBe('N.C.');
  });
});

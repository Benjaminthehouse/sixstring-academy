import { describe, expect, it } from 'vitest';
import { chordVoicings, scalePatterns } from '@/core/guitar';
import { coveredInlays } from './Fretboard';
import { arpeggioMarkers, cellLabel, dotsToMarkers, markerLabel, noteMarkers, patternMarkers, scaleMarkers, voicingOnBoard } from './markers';

describe('patternMarkers', () => {
  const box1 = scalePatterns('A', 'minor-pentatonic')[0];

  it('marks A minor pentatonic box 1 with degrees, colours and roots', () => {
    const m = patternMarkers(box1, { label: 'degree' });
    expect(m).toHaveLength(12);
    const at = (s: number, f: number) => m.find((x) => x.string === s && x.fret === f)!;
    expect(at(6, 5)).toMatchObject({ label: 'R', color: 'deg-1', root: true, note: 'A' });
    expect(at(6, 8)).toMatchObject({ label: '♭3', color: 'deg-3', root: false, note: 'C' });
    expect(at(4, 7)).toMatchObject({ label: 'R', root: true });
    expect(at(5, 7)).toMatchObject({ label: '5', color: 'deg-5' });
    expect(at(2, 8)).toMatchObject({ label: '♭7', color: 'deg-7', note: 'G' });
    expect(m.filter((x) => x.root).map((x) => `${x.string}:${x.fret}`).sort()).toEqual(['1:5', '4:7', '6:5']);
  });

  it('labels with fingers, notes in any naming system, or intervals', () => {
    expect(patternMarkers(box1, { label: 'finger', color: 'finger' })[0]).toMatchObject({ label: '1', color: 'finger-1' });
    expect(patternMarkers(box1, { label: 'note', naming: 'solfege' })[0].label).toBe('La');
    expect(patternMarkers(box1, { label: 'interval' }).find((x) => x.note === 'C')!.label).toBe('m3');
    expect(patternMarkers(box1, { label: 'none' })[0].label).toBe('');
  });
});

describe('scale and arpeggio markers', () => {
  it('spells C major across the neck with only the seven notes', () => {
    const m = scaleMarkers('C', 'major', { maxFret: 12 });
    expect(new Set(m.map((x) => x.note))).toEqual(new Set(['C', 'D', 'E', 'F', 'G', 'A', 'B']));
    expect(m.every((x) => x.fret >= 0 && x.fret <= 12)).toBe(true);
    expect(m.find((x) => x.string === 5 && x.fret === 3)).toMatchObject({ note: 'C', root: true, color: 'deg-1' });
  });

  it('spells F# major with E#, and German names B as H', () => {
    expect(scaleMarkers('F#', 'major', { maxFret: 12 }).some((x) => x.note === 'E#')).toBe(true);
    expect(scaleMarkers('G', 'major', { maxFret: 5, naming: 'german' }).find((x) => x.note === 'B')!.label).toBe('H');
  });

  it('gives arpeggio chord tones their roles', () => {
    const m = arpeggioMarkers('Am7', { minFret: 5, maxFret: 8, label: 'degree' });
    expect(new Set(m.map((x) => x.note))).toEqual(new Set(['A', 'C', 'E', 'G']));
    expect(m.find((x) => x.note === 'C')!.description).toContain('third');
  });

  it('finds every place a note is played', () => {
    const cs = noteMarkers('C', { maxFret: 5 });
    expect(cs.map((x) => `${x.string}:${x.fret}`).sort()).toEqual(['2:1', '3:5', '5:3']);
    expect(noteMarkers('E4', { maxFret: 12 }).map((x) => `${x.string}:${x.fret}`).sort()).toEqual(['1:0', '2:5', '3:9'].sort());
  });
});

describe('voicingOnBoard', () => {
  it('draws open G with fingers, open strings as rings and nothing muted', () => {
    const g = voicingOnBoard(chordVoicings('G')[0]);
    expect(g.muted).toEqual([]);
    expect(g.barres).toEqual([]);
    const fretted = g.markers.filter((m) => m.fret > 0);
    expect(fretted.map((m) => `${m.string}:${m.fret}:${m.label}`).sort()).toEqual(['1:3:3', '5:2:1', '6:3:2'].sort());
    expect(fretted.find((m) => m.string === 5)!.color).toBe('finger-1');
    const open = g.markers.filter((m) => m.fret === 0);
    expect(open.map((m) => m.label).sort()).toEqual(['B', 'D', 'G']);
    expect(open.every((m) => m.shape === 'ring')).toBe(true);
  });

  it('draws the F barre and the muted string of C', () => {
    const f = voicingOnBoard(chordVoicings('F')[0]);
    expect(f.barres).toHaveLength(1);
    expect(f.barres[0]).toMatchObject({ fret: 1, fromString: 6, toString: 1, label: '1', color: 'finger-1' });
    const c = voicingOnBoard(chordVoicings('C')[0], { openAs: 'mark' });
    expect(c.muted).toEqual([6]);
    expect(c.open.sort()).toEqual([1, 3]);
    expect(c.markers.every((m) => m.fret > 0)).toBe(true);
  });
});

describe('labels and inlays', () => {
  it('builds a marker label from any source', () => {
    const src = { string: 3, fret: 2, note: 'A', degree: '1', isRoot: true, finger: 2 };
    expect(markerLabel(src, 'degree', { rootLabel: '1' })).toBe('1');
    expect(markerLabel(src, 'finger')).toBe('2');
    expect(dotsToMarkers([src])[0]).toMatchObject({ label: 'A', root: true, description: 'root, finger 2' });
  });

  it('names cells for screen readers, with or without the note', () => {
    expect(cellLabel({ string: 3, fret: 5 }, 'C')).toBe('string 3, fret 5, C');
    expect(cellLabel({ string: 6, fret: 0 }, 'E', 'solfege')).toBe('string 6, open, Mi');
    expect(cellLabel({ string: 2, fret: 1 })).toBe('string 2, fret 1');
  });

  it('hides an inlay only when markers sit on both strings around it', () => {
    expect(coveredInlays([{ string: 3, fret: 5 }, { string: 4, fret: 5 }], 6)).toBe('5.c');
    expect(coveredInlays([{ string: 3, fret: 5 }], 6)).toBe('');
    expect(coveredInlays([{ string: 2, fret: 12 }, { string: 3, fret: 12 }], 6)).toBe('12.0');
    // With a capo, marker frets count from the capo.
    expect(coveredInlays([{ string: 3, fret: 3 }, { string: 4, fret: 3 }], 6, 2)).toBe('5.c');
  });
});

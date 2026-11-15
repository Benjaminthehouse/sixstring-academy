import { describe, expect, it } from 'vitest';
import { CAMPFIRE_GROOVE, TECHNIQUE_SAMPLER, cloneSong, sixTab } from '@/core/song';
import { buildTabModel, isBarRest, noteKey, tempoText } from './model';

describe('buildTabModel', () => {
  it('links hammer-ons, pull-offs, slides and ties to the note they come from', () => {
    const model = buildTabModel(sixTab(TECHNIQUE_SAMPLER));
    const cols = model.measures[0].columns;
    expect(cols[1].notes[0]).toMatchObject({ text: '7', from: { measure: 0, col: 0, string: 3 } });
    expect(cols[1].notes[0].note.legato).toBe('hammer');
    expect(cols[2].notes[0].from).toEqual({ measure: 0, col: 1, string: 3 });
    expect(cols[4].notes[0].note.slide).toBe('up');
    // "h 4:7 4:-" in bar 5: the tie is printed in parentheses and comes from the note before.
    const tied = model.measures[4].columns[1].notes[0];
    expect(tied).toMatchObject({ tied: true, paren: true, text: '7', from: { measure: 4, col: 0, string: 4 } });
  });

  it('prints dead, ghost and harmonic notes the tab way', () => {
    const model = buildTabModel(sixTab(TECHNIQUE_SAMPLER));
    const bar3 = model.measures[2].columns;
    expect(bar3[0].notes[0]).toMatchObject({ text: '12', harmonic: true });
    expect(bar3[3].notes[0]).toMatchObject({ text: 'x' });
    expect(model.measures[3].columns[2].notes[0]).toMatchObject({ text: '5', paren: true, tied: false });
  });

  it('splits a beat no single value can write into tied pieces', () => {
    const song = sixTab('title: T\n\n| q 3:5 3:5 3:5 3:5 |\n');
    const s = cloneSong(song);
    const note = s.tracks[0].measures[0].beats[0].notes[0];
    s.tracks[0].measures[0].beats = [
      { start: 0, duration: 1200, notes: [{ ...note }] },
      { start: 1200, duration: 720, value: { base: 8, dots: 1 }, notes: [{ ...note }] },
      { start: 1920, duration: 960, value: { base: 4 }, notes: [{ ...note }] },
      { start: 2880, duration: 960, value: { base: 4 }, notes: [{ ...note }] },
    ];
    const cols = buildTabModel(s).measures[0].columns;
    expect(cols.map((c) => [c.beat, c.piece, c.duration])).toEqual([
      [0, 0, 960],
      [0, 1, 240],
      [1, 0, 720],
      [2, 0, 960],
      [3, 0, 960],
    ]);
    expect(cols[1].notes[0]).toMatchObject({ tied: true, paren: true, from: { measure: 0, col: 0, string: 3 } });
    expect(cols[1].value).toEqual({ base: 16 });
  });

  it('names chords by the shape played under a capo, or by what sounds', () => {
    const song = sixTab('title: T\ncapo: 2\n\n| "A" q 3:2 3:2 3:2 3:2 |\n');
    expect(buildTabModel(song).measures[0].chords[0].text).toBe('G');
    expect(buildTabModel(song, { chordNames: 'sounding' }).measures[0].chords[0].text).toBe('A');
    const flat = sixTab('title: T\n\n| "Bbm7" q 3:2 3:2 3:2 3:2 |\n');
    expect(buildTabModel(flat).measures[0].chords[0].text).toBe('B♭m7');
  });

  it('reads repeats, endings, sections and the barlines between them', () => {
    const m = buildTabModel(sixTab(CAMPFIRE_GROOVE)).measures;
    expect(m[0].repeatStart).toBe(true);
    expect(m[2].ending).toEqual({ numbers: [1], start: true, end: false, closed: false });
    expect(m[3].ending).toEqual({ numbers: [1], start: false, end: true, closed: true });
    expect(m[3].endBar).toBe('repeat');
    expect(m[4].ending).toMatchObject({ numbers: [2], start: true });
    expect(m[5].endBar).toBe('double');
    expect(m[6].section).toBe('Chorus');
    expect(m[6].tempo[0].bpm).toBe(104);
    expect(m[9].endBar).toBe('final');
    expect(m[0].showTime).toBe(true);
    expect(m[1].showTime).toBe(false);
  });

  it('shows a range of bars with the tempo in force', () => {
    const model = buildTabModel(sixTab(CAMPFIRE_GROOVE), { bars: [7, 9] });
    expect(model.measures.map((m) => m.bar)).toEqual([7, 8]);
    expect(model.firstBar).toBe(7);
    expect(model.measures[0].tempo[0].bpm).toBe(104);
    expect(model.measures[0].showTime).toBe(true);
  });

  it('labels strings of any tuning, highest first, and tracks of their own', () => {
    const model = buildTabModel(sixTab('title: T\ntuning: drop-d\n\n| q 6:0 6:0 6:0 6:0 |\n'));
    expect(model.stringLabels.slice(1)).toEqual(['E', 'B', 'G', 'D', 'A', 'D']);
    const bass = buildTabModel(sixTab(CAMPFIRE_GROOVE), { track: 'bass' });
    expect(bass.strings).toBe(4);
    expect(bass.stringLabels.slice(1)).toEqual(['G', 'D', 'A', 'E']);
  });

  it('marks whole-bar rests and builds keys for note states', () => {
    const model = buildTabModel(sixTab('title: T\n\n| w r | q 3:5 3:5 3:5 3:5 |\n'));
    expect(isBarRest(model.measures[0])).toBe(true);
    expect(isBarRest(model.measures[1])).toBe(false);
    expect(model.measures[1].columns[2].notes[0].key).toBe(noteKey(1, 2, 3));
    expect(noteKey(4, 1)).toBe('4:1');
  });

  it('writes tempo per dotted quarter in compound time', () => {
    expect(tempoText(90, { numerator: 6, denominator: 8 })).toBe('= 60');
    expect(tempoText(90, { numerator: 3, denominator: 4 })).toBe('= 90');
  });
});

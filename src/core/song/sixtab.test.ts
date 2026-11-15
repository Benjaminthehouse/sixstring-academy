import { describe, expect, it } from 'vitest';
import { AMAZING_GRACE, CAMPFIRE_GROOVE, ODE_TO_JOY, SONG_EXAMPLES, TECHNIQUE_SAMPLER } from './examples';
import { parseSixTab, sixTab, SixTabSyntaxError } from './sixtab-parse';
import { sixTabLosses, toSixTab } from './sixtab-write';
import { validateSong } from './validate';
import { barLength, measureTicks } from './model';
import type { Song } from './types';

const header = 'title: T\ntempo: 100\n';

function errorsOf(text: string) {
  const r = parseSixTab(text);
  expect(r.song).toBeNull();
  return r.errors;
}

describe('SixTab examples', () => {
  it.each(Object.entries(SONG_EXAMPLES))('%s parses and validates cleanly', (_id, text) => {
    const r = parseSixTab(text);
    expect(r.errors).toEqual([]);
    expect(r.song).not.toBeNull();
    expect(validateSong(r.song!).filter((i) => i.level === 'error')).toEqual([]);
    for (const t of r.song!.tracks) t.measures.forEach((m, i) => expect(measureTicks(m)).toBe(barLength(r.song!.bars[i])));
  });

  it('reads Ode to Joy: header, pitches, chords, dotted rhythm', () => {
    const song = sixTab(ODE_TO_JOY);
    expect(song.meta).toMatchObject({ id: 'ode-to-joy', title: 'Ode to Joy', composer: 'Ludwig van Beethoven', licence: 'Public domain', difficulty: 1 });
    expect(song.meta.tags).toEqual(['melody', 'beginner', 'classical']);
    expect(song.tempo).toEqual([{ bar: 0, bpm: 100 }]);
    expect(song.bars).toHaveLength(8);
    expect(song.sections).toEqual([{ name: 'Theme', start: 0, end: 8 }]);
    const melody = song.tracks[0].measures.flatMap((m) => m.beats.map((b) => b.notes[0].midi));
    // E E F G | G F E D | C C D E | E D D (sounding pitch, E4 = 64)
    expect(melody.slice(0, 15)).toEqual([64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62]);
    const bar4 = song.tracks[0].measures[3].beats;
    expect(bar4.map((b) => [b.start, b.duration])).toEqual([[0, 1440], [1440, 480], [1920, 1920]]);
    expect(bar4[0].value).toEqual({ base: 4, dots: 1 });
    expect(song.chords.slice(0, 2)).toEqual([{ bar: 0, tick: 0, symbol: 'C' }, { bar: 1, tick: 0, symbol: 'G' }]);
    expect(song.chords[song.chords.length - 1]).toEqual({ bar: 7, tick: 1920, symbol: 'C' });
  });

  it('reads Amazing Grace: 3/4, pickup bar and lyrics', () => {
    const song = sixTab(AMAZING_GRACE);
    expect(song.bars[0]).toEqual({ time: { numerator: 3, denominator: 4 }, length: 960 });
    expect(song.bars[1].time).toEqual({ numerator: 3, denominator: 4 });
    const lyrics = song.tracks[0].measures.flatMap((m) => m.beats.map((b) => b.lyric)).filter(Boolean);
    expect(lyrics.join(' ')).toBe('A- maz- ing grace how sweet the sound that saved a wretch like me');
    expect(song.tracks[0].measures[0].beats[0].notes[0]).toMatchObject({ string: 4, fret: 0, midi: 50 });
  });

  it('reads every technique of the sampler', () => {
    const song = sixTab(TECHNIQUE_SAMPLER);
    const beats = song.tracks[0].measures.flatMap((m) => m.beats);
    const n = (i: number, k = 0) => beats[i].notes[k];
    expect(n(1)).toMatchObject({ fret: 7, legato: 'hammer' });
    expect(n(2)).toMatchObject({ fret: 5, legato: 'pull' });
    expect(n(4)).toMatchObject({ fret: 9, slide: 'up' });
    expect(n(5)).toMatchObject({ fret: 7, slide: 'down' });
    expect(n(6).finger).toBe(1);
    expect(n(8).bend).toEqual({ amount: 2, release: true });
    expect(n(9).bend).toEqual({ amount: 1 });
    expect(n(11).vibrato).toBe(true);
    expect(beats[12].notes.every((x) => x.palmMute)).toBe(true);
    expect(beats[12].stroke).toBe('down');
    expect(beats[13]).toMatchObject({ duration: 320, value: { base: 8, tuplet: { actual: 3, normal: 2 } } });
    const colour = song.tracks[0].measures[2].beats;
    expect(colour[0].notes[0]).toMatchObject({ string: 1, fret: 12, harmonic: 'natural' });
    expect(colour[2].notes[0]).toMatchObject({ harmonic: 'natural', letRing: true });
    expect(colour[3].notes[0]).toMatchObject({ string: 6, dead: true });
    const bar4 = song.tracks[0].measures[3].beats;
    expect(bar4[0].notes[0].slideIn).toBe('below');
    expect(bar4[1].notes[0].slideOut).toBe('down');
    expect(bar4[2].notes[0].ghost).toBe(true);
    expect(bar4[3].notes[0].accent).toBe(true);
    expect(bar4[4].notes[0].staccato).toBe(true);
    expect(bar4[5].notes[0].tap).toBe(true);
    expect(song.tracks[0].measures[4].beats[1].notes[0]).toMatchObject({ tie: true, fret: 7 });
    expect(song.tracks[0].measures[5].beats.map((b) => b.notes[0].pluck)).toEqual(['p', 'i', 'm', 'a']);
    const last = song.tracks[0].measures[7].beats;
    expect(last[0].notes[0].slideIn).toBe('above');
    expect(last[1].notes[0].bend).toEqual({ amount: 2, pre: true });
    expect(last[2].notes[0]).toMatchObject({ bend: { amount: 2, release: true }, vibrato: true });
    expect(song.tracks[0].measures[6].beats[1].stroke).toBe('up');
  });

  it('reads a band song: tracks, roles, bass tuning, repeats, endings, %, strum, tempo change', () => {
    const song = sixTab(CAMPFIRE_GROOVE);
    expect(song.tracks.map((t) => [t.id, t.role])).toEqual([['rhythm', 'rhythm'], ['bass', 'bass']]);
    expect(song.tracks[1].tuning).toEqual([28, 33, 38, 43]);
    expect(song.tracks[1].measures[0].beats[0].notes[0].midi).toBe(31); // G1
    expect(song.bars.map((b) => [b.repeatStart ?? false, b.repeatEnd ?? 0, b.ending ?? []])).toEqual([
      [true, 0, []], [false, 0, []], [false, 0, [1]], [false, 2, [1]], [false, 0, [2]], [false, 0, [2]],
      [false, 0, []], [false, 0, []], [false, 0, []], [false, 0, []],
    ]);
    expect(song.chords[0]).toEqual({ bar: 0, tick: 0, symbol: 'G', voicing: [3, 2, 0, 0, 0, 3] });
    expect(song.chords[1]).toEqual({ bar: 1, tick: 0, symbol: 'Em' });
    expect(song.tracks[0].measures[1].beats).toEqual(song.tracks[0].measures[0].beats);
    expect(song.sections.map((s) => [s.name, s.start, s.end, s.strum?.pattern])).toEqual([['Verse', 0, 6, 'D-DU-UDU'], ['Chorus', 6, 10, undefined]]);
    expect(song.tempo).toEqual([{ bar: 0, bpm: 96 }, { bar: 6, bpm: 104 }]);
    const slash = song.tracks[0].measures[0].beats[0];
    expect(slash).toMatchObject({ slash: true, stroke: 'down', notes: [] });
  });
});

describe('SixTab errors', () => {
  it('reports a bar that does not add up, with line, column and the missing value', () => {
    const errs = errorsOf(`${header}| q 3:0 3:2 2:0 | q 1:0 1:0 1:0 1:0 |\n`);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ line: 3, column: 1 });
    expect(errs[0].message).toContain('Bar 1 adds up to 2880 ticks but 4/4 needs 3840: a quarter is missing');
  });

  it('reports too much in a bar', () => {
    const [e] = errorsOf(`${header}| q 3:0 3:2 2:0 2:1 e 1:0 |\n`);
    expect(e.message).toContain('an eighth too much');
  });

  it('needs a duration before the first note', () => {
    const [e] = errorsOf(`${header}| 3:0 3:2 |\n`);
    expect(e).toMatchObject({ line: 3, column: 3 });
    expect(e.expected).toContain('q (quarter)');
  });

  it('points at an unknown token and says what was expected', () => {
    const [e] = errorsOf(`${header}| q 3:0 foo 2:0 2:1 |\n`);
    expect(e).toMatchObject({ line: 3, column: 9, found: 'foo' });
    expect(e.expected).toContain('a note like 3:5');
  });

  it('checks strings, frets, ties and legato', () => {
    expect(errorsOf(`${header}| w 7:0 |\n`)[0].message).toContain('There is no string 7');
    expect(errorsOf(`${header}| w 3:40 |\n`)[0].message).toContain('beyond the neck');
    expect(errorsOf(`${header}| w 3:- |\n`)[0].message).toContain('nothing is ringing on that string');
    expect(errorsOf(`${header}| h 3:5 3:3h |\n`)[0].message).toContain('that is a pull-off');
    expect(errorsOf(`${header}| h 3:5 r | w 3:7h |\n`)[0].message).toContain('no earlier note on string 3');
    expect(errorsOf(`${header}| w (3:5 3:7) |\n`)[0].message).toContain('Two notes on string 3');
  });

  it('checks modifiers and suggests the right spelling', () => {
    const [e] = errorsOf(`${header}| w 3:5{p} |\n`);
    expect(e.message).toContain('Picking fingers are capital letters');
    expect(errorsOf(`${header}| w 3:5 {pm} |\n`)[0].message).toContain('no space');
    expect(errorsOf(`${header}| w 3:5q |\n`)[0].message).toContain('Unknown technique "q"');
  });

  it('checks header fields, chord symbols and lyrics', () => {
    expect(errorsOf('title: T\ntempo: fast\n| w 3:0 |\n')[0]).toMatchObject({ line: 2, column: 8, found: 'fast' });
    expect(errorsOf('title: T\nmood: happy\n| w 3:0 |\n')[0].message).toContain('Unknown header field');
    expect(errorsOf(`${header}| "Hmaj9q" w 3:0 |\n`)[0].message).toContain('not a chord symbol');
    expect(errorsOf(`${header}| h 3:0 3:2 |\nlyrics: one two three\n`)[0]).toMatchObject({ line: 4, column: 17, found: 'three' });
    expect(errorsOf('tempo: 90\n| w 3:0 |\n')[0].message).toContain('needs a title');
    expect(errorsOf(`${header}| w 3:0\n`)[0].message).toContain('ends with a bar line');
  });

  it('lets later tracks follow the first track\'s time changes', () => {
    const song = sixTab(`${header}track: A\n| w 3:0 |\ntime: 3/4\n| h. 3:0 ||\ntrack: B\n| w 4:0 | h. 4:0 ||\n`);
    expect(song.bars.map((b) => b.time.numerator)).toEqual([4, 3]);
    expect(song.tracks[1].measures[1].beats[0].duration).toBe(2880);
    const clash = errorsOf(`${header}track: A\n| w 3:0 |\ntime: 3/4\n| h. 3:0 ||\ntrack: B\n| w 4:0 |\ntime: 2/4\n| h 4:0 ||\n`);
    expect(clash[0].message).toContain('is in 2/4 but the first track has 3/4');
  });

  it('checks that tracks cover the same bars', () => {
    const errs = errorsOf(`${header}track: A\n| w 3:0 | w 3:0 |\ntrack: B\n| w 3:0 |\n`);
    expect(errs[0].message).toContain('Track "B" has 1 bars but the first track has 2');
  });

  it('collects several errors at once and sixTab() throws them all', () => {
    const text = `${header}| q 3:0 |\n| q 9:0 3:0 3:0 3:0 |\n`;
    expect(parseSixTab(text).errors.length).toBeGreaterThanOrEqual(2);
    expect(() => sixTab(text)).toThrow(SixTabSyntaxError);
    try {
      sixTab(text);
    } catch (e) {
      expect((e as SixTabSyntaxError).message).toMatch(/line 3, column 1: Bar 1 adds up/);
    }
  });

  it('works as a tagged template', () => {
    const song = sixTab`title: Tag
tempo: 60
| w 6:0 ||`;
    expect(song.tracks[0].measures[0].beats[0].notes[0].midi).toBe(40);
  });
});

describe('SixTab round trip', () => {
  const strip = (s: Song) => JSON.parse(JSON.stringify(s));
  it.each(Object.entries(SONG_EXAMPLES))('%s: parse -> write -> parse gives the same song', (_id, text) => {
    const a = sixTab(text);
    expect(sixTabLosses(a)).toEqual([]);
    const written = toSixTab(a);
    const r = parseSixTab(written);
    expect(r.errors).toEqual([]);
    expect(strip(r.song!)).toEqual(strip(a));
    // Writing again is stable.
    expect(toSixTab(r.song!)).toBe(written);
  });

  it('writes lengths no single value can express as tied notes', () => {
    const song = sixTab(`${header}| w 3:5 |\n`);
    const beats = song.tracks[0].measures[0].beats;
    beats.splice(0, 1, { start: 0, duration: 1200, notes: [{ string: 3, fret: 5, midi: 60 }] }, { start: 1200, duration: 2640, notes: [] });
    const text = toSixTab(song);
    expect(text).toContain('q 3:5 s 3:-');
    const again = sixTab(text);
    expect(again.tracks[0].measures[0].beats.map((b) => b.duration).reduce((x, y) => x + y)).toBe(3840);
  });

  it('writes a custom tuning, capo and multi-digit voicing', () => {
    const song = sixTab(`title: T\ntempo: 70\ntuning: C G C G C E\ncapo: 2\n| "Bb=x-1-3-3-3-1" w 5:0 ||\n`);
    expect(song.tuning).toEqual([36, 43, 48, 55, 60, 64]);
    expect(song.tracks[0].measures[0].beats[0].notes[0].midi).toBe(45);
    const text = toSixTab(song);
    expect(text).toContain('capo: 2');
    expect(strip(sixTab(text))).toEqual(strip(song));
  });
});

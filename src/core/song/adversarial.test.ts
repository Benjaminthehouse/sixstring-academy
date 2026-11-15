/**
 * Adversarial tests: real-world mess for every importer, fuzzing of SixTab, the arranger on hard
 * material, timeline and practice edge cases, and the difficulty ranking. All music here is
 * invented for these tests or public domain.
 */
import { describe, expect, it } from 'vitest';
import { arrangeLine, arrangeTrack } from './arranger';
import { AMAZING_GRACE, CAMPFIRE_GROOVE, ODE_TO_JOY, SONG_EXAMPLES, TECHNIQUE_SAMPLER } from './examples';
import { toAsciiTab } from './export-text';
import { detectTextFormat } from './import-any';
import { importAsciiTab } from './import-ascii';
import { importChordPro, importChordSheet } from './import-chords';
import { importMidi } from './import-midi';
import { importMusicXml } from './import-musicxml';
import { buildMeasures, type Onset } from './import-util';
import { barCapacity, createSong, midiOf, soundingPitch, valueTicks } from './model';
import { FlowMode, WaitMode, flowTargets, practiceTargets } from './practice';
import { buildPlayEvents, type PlayNote, type PlayStrum } from './schedule';
import { SongPlayer, type SongPlayerOutput } from './song-player';
import { estimateDifficulty } from './stats';
import { flattenSong, playbackOrder } from './timeline';
import { parseSixTab, sixTab } from './sixtab-parse';
import { sixTabLosses, toSixTab } from './sixtab-write';
import { retuneSong } from './transform';
import type { BarInfo, Beat, ChordEvent, Note, NoteValue, Section, Song, TimeSig, Track } from './types';
import { validateSong } from './validate';

const errors = (s: Song) => validateSong(s).filter((i) => i.level === 'error').map((i) => i.message);
/** Struck notes per beat as "string/fret" (dead notes "x"), joined with "+". */
const shape = (s: Song, t = 0) =>
  s.tracks[t].measures.map((m) => m.beats.filter((b) => b.notes.length).map((b) => b.notes.map((n) => `${n.string}/${n.dead ? 'x' : n.fret}`).join('+')));
const durations = (s: Song, t = 0) => s.tracks[t].measures.map((m) => m.beats.map((b) => b.duration));
const noteBeats = (s: Song, bar = 0, t = 0): Beat[] => s.tracks[t].measures[bar].beats.filter((b) => b.notes.length);
const C_CHORD = '5/3+4/2+3/0+2/1+1/0';
/** Sounding pitches per beat, low to high ("~" = tied), "r" for a rest. */
const melody = (s: Song, t = 0) =>
  s.tracks[t].measures.map((m) => m.beats.map((b) => (b.notes.length ? [...b.notes].sort((x, y) => x.midi - y.midi).map((n) => `${n.midi}${n.tie ? '~' : ''}`).join('+') : 'r')));
const tab = (...lines: string[]) => lines.join('\n');

describe('ASCII tab in the styles found on the web', () => {
  const styles: Record<string, string> = {
    'e| labels': tab('e|---0---|', 'B|---1---|', 'G|---0---|', 'D|---2---|', 'A|---3---|', 'E|-------|'),
    'E-| labels, high E in capitals': tab('E-|---0---|', 'B-|---1---|', 'G-|---0---|', 'D-|---2---|', 'A-|---3---|', 'E-|-------|'),
    'no labels': tab('|---0---|', '|---1---|', '|---0---|', '|---2---|', '|---3---|', '|-------|'),
    'string numbers': tab('1|---0---|', '2|---1---|', '3|---0---|', '4|---2---|', '5|---3---|', '6|-------|'),
    'colon bar lines': tab('e:---0---:', 'B:---1---:', 'G:---0---:', 'D:---2---:', 'A:---3---:', 'E:-------:'),
    'labels with a space': tab('e |---0---|', 'B |---1---|', 'G |---0---|', 'D |---2---|', 'A |---3---|', 'E |-------|'),
    'unicode dashes and box lines': tab('e│—–—0—–—│', 'B│———1———│', 'G│———0———│', 'D│———2———│', 'A│———3———│', 'E│———————│'),
    'Windows line endings': ['e|---0---|', 'B|---1---|', 'G|---0---|', 'D|---2---|', 'A|---3---|', 'E|-------|'].join('\r\n'),
    'indented with tabs and spaces': tab('\te|---0---|', '    B|---1---|', '\tG|---0---|', '  D|---2---|', '\tA|---3---|', ' E|-------|'),
    'separator lines around': tab('------------------------', 'e|---0---|', 'B|---1---|', 'G|---0---|', 'D|---2---|', 'A|---3---|', 'E|-------|', '------------------------'),
    'a comment after one line': tab('e|---0---|', 'B|---1---|   <- keep this ringing', 'G|---0---|', 'D|---2---|', 'A|---3---|', 'E|-------|'),
    'non-breaking spaces': tab('e|---0---|  ', 'B|---1---|', 'G|---0---|', 'D|---2---|', 'A|---3---|', 'E|-------|'),
  };
  it.each(Object.entries(styles))('%s: a C chord in standard tuning', (_name, text) => {
    expect(detectTextFormat(text)).toBe('ascii-tab');
    const r = importAsciiTab(text);
    expect(errors(r.song)).toEqual([]);
    expect(r.song.tuning).toEqual([40, 45, 50, 55, 59, 64]);
    expect(r.song.bars).toHaveLength(1);
    expect(shape(r.song)).toEqual([[C_CHORD]]);
    expect(noteBeats(r.song)[0].notes.map((n) => n.midi).sort((a, b) => a - b)).toEqual([48, 52, 55, 60, 64]);
    expect(r.song.bars[0].repeatStart).toBeUndefined();
  });

  it('keeps the comment written after a line as an annotation', () => {
    const r = importAsciiTab(styles['a comment after one line']);
    expect(r.song.annotations.map((a) => a.text)).toEqual(['<- keep this ringing']);
  });

  it('reads wrapped systems with words, section headers and chord names between them', () => {
    const text = tab(
      'Little Waltz Study (an original exercise)',
      'Time: 3/4    Tempo: 84',
      '',
      '[Part A]',
      '   Am' + ' '.repeat(17) + 'E',
      'e|----------0--------|----------0-------|',
      'B|-------1-----1-----|-------0-----0----|',
      'G|----2-----------2--|----1-----------1-|',
      'D|-------------------|------------------|',
      'A|-0-----------------|------------------|',
      'E|-------------------|-0----------------|',
      '',
      'Let the bass notes ring.',
      '',
      '[Part B]',
      '   C' + ' '.repeat(18) + 'G',
      'e|----------0--------|----------3-------|',
      'B|-------1-----1-----|-------0-----0----|',
      'G|----0-----------0--|----0-----------0-|',
      'D|-------------------|------------------|',
      'A|-3-----------------|------------------|',
      'E|-------------------|-3----------------|',
    );
    const r = importAsciiTab(text);
    const s = r.song;
    expect(errors(s)).toEqual([]);
    expect(s.meta.title).toBe('Little Waltz Study (an original exercise)');
    expect(s.bars.map((b) => b.time)).toEqual(Array(4).fill({ numerator: 3, denominator: 4 }));
    expect(s.tempo[0].bpm).toBe(84);
    expect(shape(s)).toEqual([
      ['5/0', '3/2', '2/1', '1/0', '2/1', '3/2'],
      ['6/0', '3/1', '2/0', '1/0', '2/0', '3/1'],
      ['5/3', '3/0', '2/1', '1/0', '2/1', '3/0'],
      ['6/3', '3/0', '2/0', '1/3', '2/0', '3/0'],
    ]);
    // Six evenly spaced notes in a 3/4 bar: eighth notes.
    expect(durations(s)).toEqual(Array(4).fill([480, 480, 480, 480, 480, 480]));
    expect(s.chords.map((c) => `${c.bar}:${c.tick}:${c.symbol}`)).toEqual(['0:0:Am', '1:0:E', '2:0:C', '3:0:G']);
    expect(s.sections.map((x) => [x.name, x.start, x.end])).toEqual([['Part A', 0, 2], ['Part B', 2, 4]]);
  });

  it('splits systems written without a blank line between them, even when the names repeat inside a system', () => {
    const twelve = tab(
      'e|---0---|', 'B|---1---|', 'G|---0---|', 'D|---2---|', 'A|---3---|', 'E|-------|',
      'e|---3---|', 'B|---0---|', 'G|---0---|', 'D|---0---|', 'A|---2---|', 'E|---3---|',
    );
    expect(shape(importAsciiTab(twelve).song)).toEqual([[C_CHORD], ['6/3+5/2+4/0+3/0+2/0+1/3']]);
    // DADGAD names: D appears three times in one system.
    const dadgad = importAsciiTab(tab('D|-0---|', 'A|-0---|', 'G|-0---|', 'D|-2---|', 'A|-2---|', 'D|-0---|'));
    expect(dadgad.song.tuning).toEqual([38, 45, 50, 55, 57, 62]);
    expect(shape(dadgad.song)).toEqual([['6/0+5/2+4/2+3/0+2/0+1/0']]);
  });

  it('reads two-digit frets beside one-digit ones', () => {
    const r = importAsciiTab(tab(
      'e|-12---10-----|',
      'B|-13---10-----|',
      'G|-12----9-----|',
      'D|-14---11-----|',
      'A|-------------|',
      'E|-------------|',
    ));
    expect(shape(r.song)).toEqual([['4/14+3/12+2/13+1/12', '4/11+3/9+2/10+1/10']]);
    const run = importAsciiTab(tab('e|-10-12-15-12-10-8-|', 'B|------------------|', 'G|------------------|', 'D|------------------|', 'A|------------------|', 'E|------------------|'));
    expect(shape(run.song)).toEqual([['1/10', '1/12', '1/15', '1/12', '1/10', '1/8']]);
    // "10" then "13" starting one column later are two notes in a row, not a chord.
    const offset = importAsciiTab(tab('e|-12h14p12-10-----|', 'B|-----------13/15-|', 'G|-----------------|', 'D|-----------------|', 'A|-----------------|', 'E|-----------------|'));
    expect(shape(offset.song)).toEqual([['1/12', '1/14', '1/12', '1/10', '2/13', '2/15']]);
  });

  it('reads hammer, pull, slide, bend and release chains', () => {
    const r = importAsciiTab(tab(
      'e|-----------------------------------|',
      'B|-----------------------------------|',
      'G|-5h7p5-----9b11r9~--7/9--9\\7--12b13-|',
      'D|-----------------------------------|',
      'A|-----------------------------------|',
      'E|-----------------------------------|',
    ));
    const notes = noteBeats(r.song).map((b) => b.notes[0]);
    expect(errors(r.song)).toEqual([]);
    expect(notes.map((n) => n.fret)).toEqual([5, 7, 5, 9, 7, 9, 9, 7, 12]);
    expect(notes[1].legato).toBe('hammer');
    expect(notes[2].legato).toBe('pull');
    expect(notes[3]).toMatchObject({ bend: { amount: 2, release: true }, vibrato: true });
    expect(notes[5].slide).toBe('up');
    expect(notes[7].slide).toBe('down');
    expect(notes[8].bend).toEqual({ amount: 1 });
    // Evenly written legato notes get even lengths.
    const d = noteBeats(r.song).map((b) => b.duration);
    expect(d[0]).toBe(d[1]);
  });

  it('reads a chain written without dashes: 5h7p5/9b11r9~', () => {
    const r = importAsciiTab(tab('e|-----------------|', 'B|-----------------|', 'G|-5h7p5/9b11r9~----|', 'D|-----------------|', 'A|-----------------|', 'E|-----------------|'));
    expect(errors(r.song)).toEqual([]);
    const notes = noteBeats(r.song).map((b) => b.notes[0]);
    expect(notes.map((n) => n.fret)).toEqual([5, 7, 5, 9]);
    expect(notes.map((n) => n.legato ?? n.slide ?? null)).toEqual([null, 'hammer', 'pull', 'up']);
    expect(notes[3]).toMatchObject({ bend: { amount: 2, release: true }, vibrato: true });
  });

  it('reads slide-in, slide-out, ghost, harmonic and dead notes, and bends written in other ways', () => {
    const r = importAsciiTab(tab(
      'e|-/7---7\\---(5)--<12>--x--7b(9)--7^9-|',
      'B|-------------------------------------|',
      'G|-------------------------------------|',
      'D|-------------------------------------|',
      'A|-------------------------------------|',
      'E|-------------------------------------|',
    ));
    const notes = noteBeats(r.song).map((b) => b.notes[0]);
    expect(notes[0].slideIn).toBe('below');
    expect(notes[1].slideOut).toBe('down');
    expect(notes[2]).toMatchObject({ fret: 5, ghost: true });
    expect(notes[3]).toMatchObject({ fret: 12, harmonic: 'natural' });
    expect(notes[4].dead).toBe(true);
    expect(notes[5].bend).toEqual({ amount: 2 });
    expect(notes[6].bend).toEqual({ amount: 2 });
  });

  it('reads a dense line full of technique signs as tab', () => {
    const r = importAsciiTab(tab('G|-7b9-7b(9)-12b14r12-14p12h14-|', 'D|-----------------------------|', 'A|-----------------------------|', 'E|-----------------------------|'));
    expect(r.song.tuning).toEqual([28, 33, 38, 43]);
    expect(shape(r.song)[0]).toEqual(['1/7', '1/7', '1/12', '1/14', '1/12', '1/14']);
  });

  it('takes the rhythm from a row of rhythm letters above the staff', () => {
    const r = importAsciiTab(tab(
      '  q   e e h',
      'e|-0---1-3-0-------|',
      'B|-----------------|',
      'G|-----------------|',
      'D|-----------------|',
      'A|-----------------|',
      'E|-----------------|',
    ));
    expect(durations(r.song)).toEqual([[960, 480, 480, 1920]]);
    expect(r.estimatedRhythm).toBe(false);
    expect(r.warnings.some((w) => w.message.includes('rhythm letters'))).toBe(true);
    // A letter over an empty column is a rest.
    const rest = importAsciiTab(tab('  q   q   q   q', 'e|-0-------3-------|', 'B|-----------------|', 'G|-----------------|', 'D|-----------------|', 'A|-----------------|', 'E|-----------------|'));
    expect(rest.song.tracks[0].measures[0].beats.map((b) => (b.notes.length ? b.notes[0].fret : 'r'))).toEqual([0, 'r', 3, 'r']);
  });

  it('gives evenly spaced notes even lengths and lets the last one take the padding', () => {
    const r = importAsciiTab(tab('e|-0-1-3-|', 'B|-------|', 'G|-------|', 'D|-------|', 'A|-------|', 'E|-------|'));
    expect(durations(r.song)).toEqual([[960, 960, 1920]]);
    const bass = importAsciiTab(tab('G|---------------|', 'D|---------------|', 'A|-----0---2-----|', 'E|-3---------3---|'));
    expect(bass.song.tuning).toEqual([28, 33, 38, 43]);
    expect(durations(bass.song)).toEqual([[960, 960, 480, 1440]]);
  });
});

describe('ASCII tab export and import round trip', () => {
  /** A random one-line melody: straight and dotted values from sixteenths to wholes, some rests. */
  const randomMelody = (seed: number) => {
    const r = rng(seed);
    const bars: string[] = [];
    for (let b = 0; b < 4; b++) {
      let left = 16;
      const toks: string[] = [];
      let cur = '';
      while (left > 0) {
        const [v, d] = r.pick(([[1, 's'], [2, 'e'], [3, 'e.'], [4, 'q'], [6, 'q.'], [8, 'h'], [12, 'h.'], [16, 'w']] as Array<[number, string]>).filter(([x]) => x <= left));
        if (d !== cur) toks.push((cur = d));
        toks.push(r.chance(0.15) ? 'r' : `${r.int(1, 6)}:${r.int(0, 15)}${r.chance(0.1) ? '~' : ''}`);
        left -= v;
      }
      bars.push(toks.join(' '));
    }
    return sixTab(`title: Melody ${seed}\ntempo: 90\n| ${bars.join(' | ')} ||\n`);
  };
  const onsets = (s: Song) => s.tracks[0].measures.map((m) => m.beats.filter((b) => b.notes.length).map((b) => `${b.start}:${b.notes.map((n) => `${n.string}/${n.fret}`).join('+')}`));

  it('reads back pitches, strings and rhythm exactly from its own rhythm row (200 random melodies)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const song = randomMelody(seed);
      const r = importAsciiTab(toAsciiTab(song));
      expect(r.estimatedRhythm, `seed ${seed}`).toBe(false);
      expect(onsets(r.song), `seed ${seed}`).toEqual(onsets(song));
      expect(durations(r.song), `seed ${seed}`).toEqual(durations(song));
    }
  });

  it('without the rhythm row keeps every pitch and string, and most of the rhythm from the spacing alone', () => {
    let exact = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const song = randomMelody(seed);
      const back = importAsciiTab(toAsciiTab(song, { rhythm: false })).song;
      expect(onsets(back).map((bar) => bar.map((x) => x.split(':')[1])), `seed ${seed}`).toEqual(onsets(song).map((bar) => bar.map((x) => x.split(':')[1])));
      if (JSON.stringify(onsets(back)) === JSON.stringify(onsets(song))) exact++;
    }
    expect(exact).toBeGreaterThanOrEqual(60);
  });
});

describe('ASCII tab tunings and hints', () => {
  const riff = (names: string[]) => tab(
    `${names[0]}|---------------|`,
    `${names[1]}|---------------|`,
    `${names[2]}|---------------|`,
    `${names[3]}|-0---0---------|`,
    `${names[4]}|-0---0---------|`,
    `${names[5]}|-0---0---3-5---|`,
  );

  it('reads drop D from the string names', () => {
    const r = importAsciiTab(riff(['e', 'B', 'G', 'D', 'A', 'D']));
    expect(r.song.tuning).toEqual([38, 45, 50, 55, 59, 64]);
    expect(noteBeats(r.song)[0].notes.map((n) => n.midi)).toEqual([38, 45, 50]);
  });

  it('believes a tuning line over default string names', () => {
    const r = importAsciiTab(`Tuning: Drop D (D A D G B E)\n${riff(['e', 'B', 'G', 'D', 'A', 'E'])}`);
    expect(r.song.tuning).toEqual([38, 45, 50, 55, 59, 64]);
    for (const line of ['Drop D tuning', 'tuning - dropped D', 'Tuning: DADGBE']) {
      expect(importAsciiTab(`${line}\n${riff(['e', 'B', 'G', 'D', 'A', 'E'])}`).song.tuning).toEqual([38, 45, 50, 55, 59, 64]);
    }
  });

  it('reads half-step-down tunings without taking "1/2" for a time signature', () => {
    for (const line of ['Tuned down 1/2 step', 'Tuning: Eb standard', 'Tuning: half step down (Eb Ab Db Gb Bb Eb)']) {
      const r = importAsciiTab(`${line}\n${riff(['e', 'B', 'G', 'D', 'A', 'E'])}`);
      expect(r.song.tuning).toEqual([39, 44, 49, 54, 58, 63]);
      expect(r.song.bars[0].time).toEqual({ numerator: 4, denominator: 4 });
    }
    const named = importAsciiTab(riff(['Eb', 'Bb', 'Gb', 'Db', 'Ab', 'Eb']));
    expect(named.song.tuning).toEqual([39, 44, 49, 54, 58, 63]);
  });

  it('reads seven-string and five-string bass tab', () => {
    const seven = importAsciiTab(tab('e|-0-|---', 'B|-0-|---', 'G|-1-|---', 'D|-2-|---', 'A|-2-|---', 'E|-0-|---', 'B|-2-|---'));
    expect(seven.song.tuning).toEqual([35, 40, 45, 50, 55, 59, 64]);
    const five = importAsciiTab(tab('G|-------|', 'D|-------|', 'A|---2---|', 'E|-------|', 'B|-0-----|'));
    expect(five.song.tuning).toEqual([23, 28, 33, 38, 43]);
    expect(noteBeats(five.song).map((b) => b.notes[0].midi)).toEqual([23, 35]);
  });

  it('reads capo, tempo and time hints written in different ways', () => {
    const body = riff(['e', 'B', 'G', 'D', 'A', 'E']);
    expect(importAsciiTab(`Capo on the 3rd fret\n${body}`).song.capo).toBe(3);
    expect(importAsciiTab(`Capo: II\n${body}`).song.capo).toBe(2);
    expect(importAsciiTab(`No capo\n${body}`).song.capo).toBe(0);
    expect(importAsciiTab(`q = 132\n${body}`).song.tempo[0].bpm).toBe(132);
    expect(importAsciiTab(`(6/8)\n${body}`).song.bars[0].time).toEqual({ numerator: 6, denominator: 8 });
    expect(importAsciiTab(`Played at 72 bpm\n${body}`).song.tempo[0].bpm).toBe(72);
    // Prose numbers are not hints.
    const prose = importAsciiTab(`I learned this in 2019, about 3/4 of it by ear.\n${body}`);
    expect(prose.song.bars[0].time).toEqual({ numerator: 4, denominator: 4 });
    expect(prose.song.tempo[0].bpm).toBe(90);
  });

  it('finds tab embedded in prose and repeat notes written beside or under it', () => {
    const r = importAsciiTab(tab(
      'Here is the riff I worked out. Play it slowly at first, then speed up.',
      'e|-----0-----|',
      'B|---1---1---|',
      'G|-2-------2-|',
      'D|-----------|',
      'A|-3---------|',
      'E|-----------|',
      'Repeat 3x',
      'Then the verse is the same thing with more feeling.',
    ));
    expect(errors(r.song)).toEqual([]);
    expect(r.song.meta.title).toBe('Imported tab');
    expect(r.song.bars[0]).toMatchObject({ repeatStart: true, repeatEnd: 3 });
    expect(r.song.tracks[0].measures[0].beats.some((b) => b.lyric)).toBe(false);
    const x3 = importAsciiTab(tab('e|-0-1-3-|  x3', 'B|-------|', 'G|-------|', 'D|-------|', 'A|-------|', 'E|-------|'));
    expect(x3.song.bars[0].repeatEnd).toBe(3);
    const dots = importAsciiTab(tab('e||-0-1-3-||', 'B||*-----*||', 'G||-------||', 'D||-------||', 'A||*-----*||', 'E||-------||'));
    expect(dots.song.bars[0]).toMatchObject({ repeatStart: true, repeatEnd: 2 });
  });
});

describe('chord sheets in the styles found on the web', () => {
  const chordList = (s: Song) => s.chords.map((c) => `${c.bar}:${c.tick}:${c.symbol}`);

  it('reads chords over lyrics with odd spacing, a capo line, sections and messy symbols', () => {
    const text = tab(
      'Title: Morning Road',
      'Capo: 3',
      '',
      'Verse 1:',
      'G        D/F#      Em7    C(add9)',
      '  Walking down the morning road,',
      '',
      'Chorus',
      '   C      G   C      D',
      'And on we go, and on we go',
    );
    expect(detectTextFormat(text)).toBe('chord-sheet');
    const r = importChordSheet(text);
    expect(errors(r.song)).toEqual([]);
    expect(r.song.capo).toBe(3);
    // Shapes G D/F# Em7 C(add9) behind capo 3 sound Bb F/A Gm7 Ebadd9.
    expect(r.song.chords.slice(0, 4).map((c) => c.symbol)).toEqual(['Bb', 'F/A', 'Gm7', 'Ebadd9']);
    expect(r.song.key).toBe('Bb');
    expect(r.song.sections.map((x) => x.name)).toEqual(['Verse 1', 'Chorus']);
    const lyrics = r.song.tracks[0].measures.flatMap((m) => m.beats.map((b) => b.lyric).filter(Boolean));
    expect(lyrics.slice(0, 4)).toEqual(['Walking', 'down the', 'morning', 'road,']);
  });

  it('keeps columns aligned when chord and lyric lines are typed with tabs (and Windows line ends)', () => {
    const r = importChordSheet('Am\tF\tC\tG\r\nOne\ttwo\tthree\tfour\r\n');
    const lyrics = r.song.tracks[0].measures.map((m) => m.beats.map((b) => b.lyric).filter(Boolean).join(' '));
    expect(r.song.chords.map((c) => c.symbol)).toEqual(['Am', 'F', 'C', 'G']);
    expect(lyrics).toEqual(['One', 'two', 'three', 'four']);
  });

  it('reads chords-only lines with bar lines and beat marks', () => {
    const text = tab('Intro:', '| G . . . | C . D . |', '| Em . . . | C . . . | x2', '', '[Outro]', '|G / / /|D / C /|G|');
    expect(detectTextFormat(text)).toBe('chord-sheet');
    const r = importChordSheet(text);
    expect(errors(r.song)).toEqual([]);
    expect(chordList(r.song)).toEqual(['0:0:G', '1:0:C', '1:1920:D', '2:0:Em', '3:0:C', '4:0:G', '5:0:D', '5:1920:C', '6:0:G']);
    expect(r.song.bars[2].repeatStart).toBe(true);
    expect(r.song.bars[3].repeatEnd).toBe(2);
    expect(r.song.sections.map((x) => [x.name, x.start, x.end])).toEqual([['Intro', 0, 4], ['Outro', 4, 7]]);
  });

  it('reads a Nashville number chart in its key', () => {
    const text = tab('Key: G', '| 1 . . . | 4 . . . | 5 . 5/7 . | 1 |', '| 6m | 2- . 5 . | b7 | 1 |');
    expect(detectTextFormat(text)).toBe('chord-sheet');
    const r = importChordSheet(text);
    expect(errors(r.song)).toEqual([]);
    expect(r.song.chords.map((c) => c.symbol)).toEqual(['G', 'C', 'D', 'D/F#', 'G', 'Em', 'Am', 'D', 'F', 'G']);
    expect(r.warnings.some((w) => w.message.includes('Nashville'))).toBe(true);
    // Without a key, numbers are not chords.
    expect(importChordSheet('1 4 5 1\n6m 4 5 5').song.chords).toEqual([]);
  });

  it('plays a chorus again where the sheet says so', () => {
    const text = tab(
      '[Verse]', 'G       C', 'First line here', '[Chorus]', 'D       G', 'Sing it out', '', '[Verse]', 'G       C', 'Second verse here',
      '(Repeat Chorus)', '', 'Chorus x2',
    );
    const r = importChordSheet(text);
    expect(errors(r.song)).toEqual([]);
    expect(r.song.sections.map((x) => x.name)).toEqual(['Verse', 'Chorus', 'Verse', 'Chorus', 'Chorus']);
    const lyrics = r.song.tracks[0].measures.flatMap((m) => m.beats.map((b) => b.lyric).filter(Boolean));
    expect(lyrics.filter((l) => l === 'Sing it').length + lyrics.filter((l) => l === 'Sing it out').length).toBe(4);
  });

  it('plays a section marked "x2" twice', () => {
    const r = importChordSheet(tab('Chorus x2', 'G       D', 'Sing it out', '[Outro]', 'C', 'Bye'));
    expect(r.song.chords.map((c) => c.symbol)).toEqual(['G', 'D', 'G', 'D', 'C']);
    expect(r.song.sections.map((x) => x.name)).toEqual(['Chorus', 'Outro']);
  });

  it('reads ChordPro with directives, comments, sections, capo and an inline N.C.', () => {
    const text = tab(
      '{title: Old Mill Song}', '{subtitle: an invented tune}', '{key: D}', '{capo: 2}', '{time: 3/4}', '{tempo: 100}', '# a comment line',
      '{start_of_verse: Verse 1}', '[D]Down by the [G]old mill [D]stream', 'The [A7]water turns the [D]wheel', '{end_of_verse}',
      '{soc}', '[G]Turn, turn, [D]turn', '{eoc}', '{comment: Verse 2}', '[D]Grinding all the [G]corn', '{chorus}', '[N.C.]Last line, [D]done',
    );
    expect(detectTextFormat(text)).toBe('chordpro');
    const r = importChordPro(text);
    const s = r.song;
    expect(errors(s)).toEqual([]);
    expect(s.meta).toMatchObject({ title: 'Old Mill Song', artist: 'an invented tune' });
    expect(s.bars[0].time).toEqual({ numerator: 3, denominator: 4 });
    expect(s.tempo[0].bpm).toBe(100);
    // D shapes behind capo 2 sound E; the key follows what sounds.
    expect(s.capo).toBe(2);
    expect(s.key).toBe('E');
    expect(s.chords.slice(0, 4).map((c) => c.symbol)).toEqual(['E', 'A', 'E', 'B7']);
    expect(s.sections.map((x) => x.name)).toEqual(['Verse 1', 'Chorus', 'Verse 2', 'Chorus']);
    expect(s.chords.some((c) => c.symbol === 'N.C.')).toBe(true);
  });

  it('recognises inline chords even in a two-line ChordPro song', () => {
    const text = '[G]Amazing [C]grace\nhow [G]sweet';
    expect(detectTextFormat(text)).toBe('chordpro');
    expect(importChordPro(text).song.chords.map((c) => c.symbol)).toEqual(['G', 'C', 'G']);
  });
});

describe('MusicXML variants', () => {
  const score = (parts: string, partList = '<score-part id="P1"><part-name>Guitar</part-name></score-part>') => `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0"><work><work-title>Test Air</work-title></work><part-list>${partList}</part-list>${parts}</score-partwise>`;
  const note = (step: string, octave: number, duration: number, type: string, extra = '', voice = 1, alter = 0) =>
    `<note><pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><type>${type}</type>${extra}</note>`;
  const triplet = '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>';

  it('reads a pickup measure, triplets and ties across bar lines (no tab: arranged)', () => {
    const r = importMusicXml(score(`<part id="P1">
<measure number="0" implicit="yes"><attributes><divisions>6</divisions><key><fifths>1</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef></attributes>${note('D', 3, 6, 'quarter')}</measure>
<measure number="1">${note('G', 3, 12, 'half')}${note('B', 3, 2, 'eighth', triplet)}${note('A', 3, 2, 'eighth', triplet)}${note('G', 3, 2, 'eighth', triplet)}</measure>
<measure number="2">${note('B', 3, 12, 'half', '<tie type="start"/><notations><tied type="start"/></notations>')}${note('B', 3, 6, 'quarter', '<tie type="stop"/><tie type="start"/><notations><tied type="stop"/><tied type="start"/></notations>')}</measure>
<measure number="3">${note('B', 3, 6, 'quarter', '<tie type="stop"/><notations><tied type="stop"/></notations>')}<note><rest/><duration>12</duration><voice>1</voice><type>half</type></note></measure>
</part>`));
    const s = r.song;
    expect(errors(s)).toEqual([]);
    expect(s.meta.title).toBe('Test Air');
    expect(s.key).toBe('G');
    expect(s.bars[0].length).toBe(960);
    expect(melody(s)).toEqual([['50'], ['55', '59', '57', '55'], ['59', '59~'], ['59~', 'r']]);
    expect(durations(s)).toEqual([[960], [1920, 320, 320, 320], [1920, 960], [960, 1920]]);
    expect(s.tracks[0].measures[1].beats[1].value).toEqual({ base: 8, tuplet: { actual: 3, normal: 2 } });
    // A tie keeps its string and fret.
    const [a, b] = [s.tracks[0].measures[2].beats[1].notes[0], s.tracks[0].measures[3].beats[0].notes[0]];
    expect([a.string, a.fret]).toEqual([b.string, b.fret]);
  });

  it('merges two voices written with <backup> and <forward>, keeping the held bass', () => {
    const r = importMusicXml(score(`<part id="P1">
<measure number="1"><attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef></attributes>
${note('E', 4, 2, 'quarter')}${note('D', 4, 2, 'quarter')}${note('C', 4, 2, 'quarter')}${note('D', 4, 2, 'quarter')}
<backup><duration>8</duration></backup>${note('C', 3, 4, 'half', '', 2)}${note('G', 2, 4, 'half', '', 2)}</measure>
<measure number="2">${note('E', 4, 1, 'eighth')}${note('E', 4, 1, 'eighth')}${note('E', 4, 2, 'quarter')}<forward><duration>4</duration></forward>
<backup><duration>8</duration></backup>${note('C', 3, 8, 'whole', '', 2)}</measure>
</part>`));
    const s = r.song;
    expect(errors(s)).toEqual([]);
    expect(melody(s)).toEqual([['48+64', '62', '43+60', '62'], ['48+64', '64', '64', 'r']]);
    const bass = s.tracks[0].measures[0].beats[0].notes.find((n) => n.midi === 48)!;
    expect(bass.length).toBe(1920);
    expect(s.tracks[0].measures[1].beats[0].notes.find((n) => n.midi === 48)!.length).toBe(3840);
  });

  it('takes string and fret from a TAB staff with its own tuning and capo', () => {
    const tabNote = (step: string, octave: number, string: number, fret: number, duration = 4) =>
      `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>1</voice><type>quarter</type><staff>1</staff><notations><technical><string>${string}</string><fret>${fret}</fret></technical></notations></note>`;
    const r = importMusicXml(score(`<part id="P1">
<measure number="1"><attributes><divisions>4</divisions><time><beats>2</beats><beat-type>4</beat-type></time><clef><sign>TAB</sign><line>5</line></clef>
<staff-details><staff-lines>6</staff-lines>
<staff-tuning line="1"><tuning-step>D</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
<staff-tuning line="2"><tuning-step>A</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
<staff-tuning line="3"><tuning-step>D</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
<staff-tuning line="4"><tuning-step>G</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
<staff-tuning line="5"><tuning-step>B</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
<staff-tuning line="6"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning>
<capo>2</capo></staff-details></attributes>
${tabNote('E', 2, 6, 0)}${tabNote('F', 3, 4, 1)}</measure>
</part>`));
    const s = r.song;
    expect(errors(s)).toEqual([]);
    expect(s.tuning).toEqual([38, 45, 50, 55, 59, 64]);
    expect(s.capo).toBe(2);
    // String and fret win over the written pitch: 6/0 behind capo 2 in drop D sounds E2, 4/1 sounds F3.
    expect(s.tracks[0].measures[0].beats.map((b) => [b.notes[0].string, b.notes[0].fret, b.notes[0].midi])).toEqual([[6, 0, 40], [4, 1, 53]]);
  });

  it('reads chord symbols with offsets, alterations, bass notes and N.C.', () => {
    const harmony = (inner: string) => `<harmony>${inner}</harmony>`;
    const r = importMusicXml(score(`<part id="P1">
<measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
${harmony('<root><root-step>A</root-step></root><kind>minor-seventh</kind>')}${note('A', 3, 1, 'quarter')}
${harmony('<root><root-step>D</root-step></root><kind text="7">dominant</kind><degree><degree-value>9</degree-value><degree-alter>1</degree-alter><degree-type>add</degree-type></degree><offset>1</offset>')}${note('C', 4, 1, 'quarter')}${note('E', 4, 2, 'half')}</measure>
<measure number="2">${harmony('<root><root-step>B</root-step><root-alter>-1</root-alter></root><kind>major</kind><bass><bass-step>D</bass-step></bass>')}${note('D', 4, 2, 'half')}${harmony('<root><root-step>C</root-step></root><kind>none</kind>')}${note('D', 4, 2, 'half')}</measure>
</part>`));
    expect(r.song.chords.map((c) => `${c.bar}:${c.tick}:${c.symbol}`)).toEqual(['0:0:Am7', '0:1920:D7#9', '1:0:Bb/D', '1:1920:N.C.']);
  });

  it('reads an overfull measure in a wider meter instead of losing notes', () => {
    const r = importMusicXml(score(`<part id="P1">
<measure number="1"><attributes><divisions>1</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>${note('C', 4, 1, 'quarter')}${note('D', 4, 1, 'quarter')}${note('E', 4, 1, 'quarter')}</measure>
<measure number="2">${note('F', 4, 2, 'half')}</measure>
</part>`));
    expect(errors(r.song)).toEqual([]);
    expect(r.song.bars.map((b) => b.time.numerator)).toEqual([3, 2]);
    expect(melody(r.song)).toEqual([['60', '62', '64'], ['65']]);
    expect(r.warnings.some((w) => w.message.includes('read as 3/4'))).toBe(true);
  });

  it('keeps a second part aligned when it writes the pickup as a full-measure rest, and leaves drums out', () => {
    const partList = '<score-part id="P1"><part-name>Melody</part-name></score-part><score-part id="P2"><part-name>Bass</part-name></score-part><score-part id="P3"><part-name>Drums</part-name></score-part>';
    const r = importMusicXml(score(`<part id="P1">
<measure number="0" implicit="yes"><attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>${note('D', 4, 1, 'quarter')}</measure>
<measure number="1">${note('G', 4, 3, 'half', '<dot/>')}</measure></part>
<part id="P2"><measure number="0" implicit="yes"><attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time><clef><sign>F</sign><line>4</line></clef></attributes><note><rest measure="yes"/><duration>3</duration><voice>1</voice></note></measure>
<measure number="1">${note('G', 2, 3, 'half', '<dot/>')}</measure></part>
<part id="P3"><measure number="0" implicit="yes"><attributes><divisions>1</divisions><clef><sign>percussion</sign></clef></attributes><note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched><duration>1</duration><voice>1</voice></note></measure>
<measure number="1"><note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched><duration>3</duration><voice>1</voice></note></measure></part>`, partList));
    const s = r.song;
    expect(errors(s)).toEqual([]);
    expect(s.tracks.map((t) => t.name)).toEqual(['Melody', 'Bass']);
    expect(r.warnings.some((w) => w.message.includes('"Drums" is a drum part'))).toBe(true);
    // The bass's G sounds on the downbeat of bar 1 together with the melody's G.
    expect(s.tracks[1].measures[1].beats[0].notes[0].midi).toBe(43);
    expect(s.tracks[1].measures[0].beats.every((b) => !b.notes.length)).toBe(true);
  });

  it('uses the first lyric verse and joins syllables', () => {
    const r = importMusicXml(score(`<part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
${note('C', 4, 1, 'quarter', '<lyric number="2"><text>Two</text></lyric><lyric number="1"><syllabic>begin</syllabic><text>Hel</text></lyric>')}${note('D', 4, 1, 'quarter', '<lyric number="1"><syllabic>end</syllabic><text>lo</text></lyric>')}</measure></part>`));
    expect(r.song.tracks[0].measures[0].beats.map((b) => b.lyric)).toEqual(['Hel-', 'lo']);
  });
});

describe('MIDI with several tracks and tempo changes', () => {
  /** An invented piece: piano chords, a nylon guitar line (straight eighths, a chord, a tie over the bar line, triplets), drums. */
  async function file(ppq: number): Promise<Uint8Array> {
    const { Midi } = await import('@tonejs/midi');
    const midi = new Midi();
    midi.header.tempos.push({ ticks: 0, bpm: 90 }, { ticks: ppq * 8, bpm: 120 }, { ticks: ppq * 13 + 3, bpm: 60 });
    midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] }, { ticks: ppq * 8, timeSignature: [3, 4] });
    midi.header.update();
    const piano = midi.addTrack();
    piano.name = 'Piano';
    for (let i = 0; i < 14; i++) piano.addNote({ midi: 48 + (i % 3) * 4, ticks: i * ppq, durationTicks: ppq, velocity: 0.5 });
    const gtr = midi.addTrack();
    gtr.name = 'Nylon';
    gtr.instrument.number = 24;
    [48, 52, 55, 60, 64, 60, 55, 52].forEach((m, i) => gtr.addNote({ midi: m, ticks: (i * ppq) / 2 + (i % 2 ? 2 : i ? -1 : 0) * Math.round(ppq / 96), durationTicks: ppq / 2, velocity: 0.7 }));
    [48, 55, 60, 64].forEach((m) => gtr.addNote({ midi: m, ticks: 4 * ppq, durationTicks: 4 * ppq, velocity: 0.7 }));
    gtr.addNote({ midi: 67, ticks: 8 * ppq, durationTicks: ppq, velocity: 0.7 });
    gtr.addNote({ midi: 69, ticks: 9 * ppq, durationTicks: ppq, velocity: 0.7 });
    gtr.addNote({ midi: 71, ticks: 10 * ppq, durationTicks: 2 * ppq, velocity: 0.7 });
    gtr.addNote({ midi: 72, ticks: 12 * ppq, durationTicks: 2 * ppq, velocity: 0.7 });
    [74, 72, 71].forEach((m, i) => gtr.addNote({ midi: m, ticks: 14 * ppq + Math.round((i * ppq) / 3), durationTicks: Math.round(ppq / 3), velocity: 0.7 }));
    gtr.addNote({ midi: 67, ticks: 15 * ppq, durationTicks: 2 * ppq, velocity: 0.7 });
    const bass = midi.addTrack();
    bass.name = 'Bass';
    bass.instrument.number = 33;
    for (let i = 0; i < 4; i++) bass.addNote({ midi: 36, ticks: i * 4 * ppq, durationTicks: 2 * ppq, velocity: 0.7 });
    const drums = midi.addTrack();
    drums.channel = 9;
    for (let i = 0; i < 16; i++) drums.addNote({ midi: 36, ticks: i * ppq, durationTicks: 10, velocity: 0.9 });
    const bytes = midi.toArray();
    // The writer always declares 480 ticks per quarter: the ticks above were computed for `ppq`, so say so.
    bytes[12] = ppq >> 8;
    bytes[13] = ppq & 255;
    return bytes;
  }

  it.each([480, 96, 1024])('picks the guitar, follows tempo and meter changes, and reads triplets beside straight notes (ppq %i)', async (ppq) => {
    const r = await importMidi(await file(ppq));
    const s = r.song;
    expect(errors(s)).toEqual([]);
    expect(s.tracks.map((t) => t.name)).toEqual(['Nylon']);
    expect(s.bars.map((b) => b.time.numerator)).toEqual([4, 4, 3, 3, 3]);
    expect(s.tempo).toEqual([{ bar: 0, bpm: 90 }, { bar: 2, bpm: 120 }, { bar: 3, tick: 1920, bpm: 60 }]);
    expect(melody(s)).toEqual([
      ['48', '52', '55', '60', '64', '60', '55', '52'], ['48+55+60+64'], ['67', '69', '71'], ['71~', '72'], ['74', '72', '71', '67'],
    ]);
    expect(durations(s)[4]).toEqual([320, 320, 320, 1920]);
    // 8 beats at 90, 5 at 120, then 4 at 60 to the end.
    expect(flattenSong(s).totalSeconds).toBeCloseTo(8 * (60 / 90) + 5 * 0.5 + 4, 6);
  });

  it('imports several tracks when asked: bass gets its own tuning, drums stay out', async () => {
    const r = await importMidi(await file(480), { tracks: 'all' });
    const s = r.song;
    expect(errors(s)).toEqual([]);
    expect(s.tracks.map((t) => [t.name, t.role])).toEqual([['Piano', 'lead'], ['Nylon', 'lead'], ['Bass', 'bass']]);
    expect(s.tracks[2].tuning).toEqual([28, 33, 38, 43]);
    expect(s.tracks[2].measures[0].beats[0].notes[0]).toMatchObject({ midi: 36, string: 3, fret: 3 });
    // Asking for the drum track by number still leaves it out.
    const drums = await importMidi(await file(480), { tracks: [1, 3] });
    expect(drums.song.tracks.map((t) => t.name)).toEqual(['Nylon']);
    expect(drums.warnings.some((w) => w.message.includes('drum track'))).toBe(true);
    expect(s.tracks.every((t) => t.measures.length === s.bars.length)).toBe(true);
  });
});

describe('arranger: playable, sensible fingerings', () => {
  const at = (l: Array<{ string: number; fret: number }>) => l.map((p) => `${p.string}/${p.fret}`);
  const pitch = (l: Array<{ string: number; fret: number }>, tuning = [40, 45, 50, 55, 59, 64], capo = 0) => l.map((p) => tuning[tuning.length - p.string] + capo + p.fret);
  /** Every beat can be held by one hand: fretted notes (struck or still ringing) within five frets, one note per string. */
  function assertHoldable(song: Song, track = song.tracks[0]) {
    let tick = 0;
    const ringing: Array<{ string: number; fret: number; end: number }> = [];
    track.measures.forEach((m, bar) => {
      for (const b of m.beats) {
        const t = tick + b.start;
        for (let i = ringing.length - 1; i >= 0; i--) if (ringing[i].end <= t) ringing.splice(i, 1);
        const here = [...b.notes.filter((n) => !n.tie).map((n) => ({ string: n.string, fret: n.fret })), ...ringing];
        const strings = here.map((p) => p.string);
        expect(new Set(strings).size, `bar ${bar + 1}: two notes on one string`).toBe(strings.length);
        const fretted = here.filter((p) => p.fret > 0).map((p) => p.fret);
        if (fretted.length) expect(Math.max(...fretted) - Math.min(...fretted), `bar ${bar + 1}: stretch`).toBeLessThanOrEqual(4);
        for (const n of b.notes) if (n.length && n.length > b.duration) ringing.push({ string: n.string, fret: n.fret, end: t + n.length });
      }
      tick += barCapacity(song.bars[bar].time);
    });
  }
  function twoVoice(voices: Array<Array<[midi: number, tick: number, sustain: number]>>, bars: number, tuning?: number[]): Song {
    const map = new Map<number, Onset>();
    for (const [midi, tick, sustain] of voices.flat()) {
      const o = map.get(tick) ?? { tick, notes: [] };
      o.notes.push({ midi, sustain });
      map.set(tick, o);
    }
    const song = createSong({ meta: { title: 'Voices' }, bars, ...(tuning ? { tuning } : {}) });
    song.tracks[0].measures = buildMeasures([...map.values()], song.bars.map((_, i) => ({ start: i * 3840, length: 3840 })), { tuning: song.tuning, capo: 0 });
    return song;
  }

  it('plays scales in position: G major in open position, C major two octaves with at most two shifts', () => {
    expect(at(arrangeLine([43, 45, 47, 48, 50, 52, 54, 55, 57, 59, 60, 62, 64, 66, 67]))).toEqual(['6/3', '5/0', '5/2', '5/3', '4/0', '4/2', '4/4', '3/0', '3/2', '2/0', '2/1', '2/3', '1/0', '1/2', '1/3']);
    const c = arrangeLine([48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72]);
    expect(pitch(c)).toEqual([48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72]);
    const frets = c.filter((p) => p.fret > 0).map((p) => p.fret);
    let shifts = 0;
    for (let i = 1; i < frets.length; i++) if (Math.abs(frets[i] - frets[i - 1]) > 4) shifts++;
    expect(shifts).toBeLessThanOrEqual(2);
    // E minor pentatonic in open position, chromatic run in first position.
    expect(at(arrangeLine([40, 43, 45, 47, 50, 52, 55, 57, 59, 62, 64, 67]))).toEqual(['6/0', '6/3', '5/0', '5/2', '4/0', '4/2', '3/0', '3/2', '2/0', '2/3', '1/0', '1/3']);
    expect(arrangeLine([52, 53, 54, 55, 56, 57, 58, 59, 60]).every((p) => p.fret <= 4)).toBe(true);
  });

  it('plays open-position arpeggios where they lie, and moves up only for high notes', () => {
    expect(at(arrangeLine([45, 52, 57, 60, 64, 60, 57, 52]))).toEqual(['5/0', '4/2', '3/2', '2/1', '1/0', '2/1', '3/2', '4/2']);
    expect(at(arrangeLine([48, 52, 55, 60, 64, 60, 55, 52]))).toEqual(['5/3', '4/2', '3/0', '2/1', '1/0', '2/1', '3/0', '4/2']);
    const high = arrangeLine([67, 69, 71, 72, 74, 72, 71, 67]);
    const f = high.map((p) => p.fret);
    expect(Math.max(...f) - Math.min(...f)).toBeLessThanOrEqual(4);
  });

  it('shifts after a long note rather than in the middle of a run', () => {
    // A whole-note chord in open position, then a melody that lies in 7th position.
    const song = twoVoice([[[48, 0, 3840], [55, 0, 3840], [60, 0, 3840], [64, 0, 3840]], [[67, 3840, 960], [69, 4800, 960], [71, 5760, 960], [72, 6720, 960]]], 2);
    const r = arrangeTrack(song, 0);
    const line = r.track.measures[1].beats.map((b) => b.notes[0]);
    const frets = line.map((n) => n.fret);
    expect(Math.max(...frets) - Math.min(...frets)).toBeLessThanOrEqual(3);
    expect(line.map((n) => n.midi)).toEqual([67, 69, 71, 72]);
  });

  it('keeps leaps playable and leaves out (with a warning) what the neck cannot reach', () => {
    const leaps = arrangeLine([52, 76, 55, 79, 48, 72, 59, 83]);
    expect(pitch(leaps.slice(0, 7))).toEqual([52, 76, 55, 79, 48, 72, 59]);
    expect(leaps[7]).toEqual({ string: 0, fret: -1, midi: 83 });
    const song = sixTab(`title: T\ntempo: 90\n| q 1:0 1:0 1:0 1:0 |\n`);
    song.tracks[0].measures[0].beats[2].notes[0].midi = 100;
    const r = arrangeTrack(song, 0, { octaves: false });
    expect(r.warnings.some((w) => w.includes('cannot be played'))).toBe(true);
    expect(r.track.measures[0].beats.map((b) => b.notes.length)).toEqual([1, 1, 0, 1]);
    expect(errors({ ...song, tracks: [r.track] })).toEqual([]);
  });

  it('holds a bass note under a moving melody, and lets it go early (shortened) when no hand can hold both', () => {
    const q = 960;
    const song = twoVoice([
      [[48, 0, 3840], [43, 3840, 1920], [45, 5760, 1920]],
      [[67, 0, q], [76, q, q], [72, 2 * q, q], [67, 3 * q, q], [71, 4 * q, q], [74, 5 * q, q], [72, 6 * q, q], [76, 7 * q, q]],
    ], 2);
    const r = arrangeTrack(song, 0);
    const out: Song = { ...song, tracks: [r.track] };
    expect(errors(out)).toEqual([]);
    assertHoldable(out);
    const bar1 = r.track.measures[0].beats;
    const bass = bar1[0].notes.find((n) => n.midi === 48)!;
    expect(bass.length).toBe(3840);
    // G2 can only be played at 6/3: D5 cannot be reached while it rings, so it is let go after the first beat.
    const g2 = r.track.measures[1].beats[0].notes.find((n) => n.midi === 43)!;
    expect([g2.string, g2.fret]).toEqual([6, 3]);
    expect(g2.length).toBeUndefined();
    expect(r.warnings.some((w) => w.includes('let go early'))).toBe(true);
  });

  it('places chords as holdable shapes, drops the inner notes of an impossible cluster, and keeps every pitch otherwise', () => {
    const chords = [[48, 52, 55, 60, 64], [47, 50, 55, 59, 67], [45, 52, 57, 60, 64], [41, 48, 53, 57, 60, 65]];
    const song = twoVoice([chords.flatMap((c, i) => c.map((m) => [m, i * 960, 960] as [number, number, number]))], 1);
    const r = arrangeTrack(song, 0);
    const out: Song = { ...song, tracks: [r.track] };
    assertHoldable(out);
    expect(r.track.measures[0].beats.map((b) => b.notes.map((n) => n.midi).sort((a, b) => a - b))).toEqual(chords);
    const cluster = twoVoice([[[40, 0, 3840], [53, 0, 3840], [62, 0, 3840], [71, 0, 3840], [77, 0, 3840]]], 1);
    const c = arrangeTrack(cluster, 0);
    assertHoldable({ ...cluster, tracks: [c.track] });
    expect(c.warnings.some((w) => w.includes('no hand can hold'))).toBe(true);
    const kept = c.track.measures[0].beats[0].notes.map((n) => n.midi);
    expect(kept).toContain(40);
    expect(kept).toContain(77);
  });

  it('uses alternate tunings and the capo', () => {
    const dropD = [38, 45, 50, 55, 59, 64];
    expect(at(arrangeLine([38, 40, 41, 43, 45], { tuning: dropD }))).toEqual(['6/0', '6/2', '6/3', '6/5', '5/0']);
    const power = twoVoice([[[38, 0, 3840], [45, 0, 3840], [50, 0, 3840]]], 1, dropD);
    expect(arrangeTrack(power, 0).track.measures[0].beats[0].notes.map((n) => `${n.string}/${n.fret}`)).toEqual(['6/0', '5/0', '4/0']);
    const dadgad = [38, 45, 50, 55, 57, 62];
    const d = arrangeLine([50, 52, 54, 55, 57, 59, 61, 62], { tuning: dadgad });
    expect(pitch(d, dadgad)).toEqual([50, 52, 54, 55, 57, 59, 61, 62]);
    expect(d.every((p) => p.fret <= 4)).toBe(true);
    // Capo 2: frets count from the capo; D3 is the open fourth string.
    const capo = arrangeLine([52, 54, 56, 57], { capo: 2 });
    expect(pitch(capo, undefined, 2)).toEqual([52, 54, 56, 57]);
    expect(capo[0]).toMatchObject({ string: 4, fret: 0 });
    // Retuning a song keeps every pitch and every bar holdable.
    const { song: retuned } = retuneSong(sixTab(TECHNIQUE_SAMPLER), { tuning: dropD });
    assertHoldable(retuned);
  });
});

describe('timeline and player edge cases', () => {
  function setup(song: Song, countInBars = 0) {
    let now = 0;
    const clock = { now: () => now, soundingNow: () => now };
    const notes: Array<{ e: PlayNote; time: number; seconds: number }> = [];
    const strums: Array<{ e: PlayStrum; time: number }> = [];
    const clicks: number[] = [];
    const output: SongPlayerOutput = {
      note: (e, time, seconds) => notes.push({ e, time, seconds }), strum: (e, time) => strums.push({ e, time }), click: (_l, time) => clicks.push(time), stopAll: () => {},
    };
    const player = new SongPlayer(song, { output, clock, timer: 'manual', countInBars });
    const runTo = (t: number) => {
      for (let x = now; x <= t; x += 0.02) {
        now = x;
        player.transport.process(x);
        player.transport.flushVisual(x);
      }
      now = t;
      player.transport.process(t);
      player.transport.flushVisual(t);
    };
    return { player, notes, strums, clicks, runTo };
  }
  const scaleSong = (bpm = 120) => sixTab(`title: Scale\ntempo: ${bpm}\n| q 3:0 3:2 2:0 2:1 | 2:3 1:0 1:2 1:3 ||\n`);

  it('times tempo changes inside a bar and a ramp exactly, and maps seconds back to ticks', () => {
    const song = sixTab('title: T\ntempo: 60\n| q 1:0 1:0 1:0 1:0 | 1:0 1:0 1:0 1:0 ||\n');
    song.tempo.push({ bar: 0, tick: 1920, bpm: 120 });
    song.tempo.push({ bar: 1, bpm: 120, ramp: true }, { bar: 1, tick: 3840 - 1, bpm: 60 });
    const tl = flattenSong(song);
    const secs = tl.trackBeats('guitar').map((b) => b.sec);
    expect(secs.slice(0, 5)).toEqual([0, 1, 2, 2.5, 3]);
    // Ramp from 120 to 60 over the second bar: each beat longer than the one before.
    const gaps = secs.slice(4).map((x, i, a) => (i ? x - a[i - 1] : 0)).slice(1);
    expect(gaps[0]).toBeGreaterThan(0.5);
    expect(gaps[1]).toBeGreaterThan(gaps[0]);
    expect(gaps[2]).toBeGreaterThan(gaps[1]);
    for (const t of [0, 100, 1919, 1920, 2500, 3840, 5000, 7000]) expect(tl.tickAt(tl.secondsAt(t))).toBeCloseTo(t, 6);
  });

  it('repeats a ramp: each pass glides again from its start, and a jump into the middle lands on the tempo there', () => {
    const song = sixTab('title: R\ntempo: 60\n|: q 1:0 1:0 1:0 1:0 | 1:0 1:0 1:0 1:0 :|\ntempo: 120\n| w 1:0 ||\n');
    song.tempo[0].ramp = true;
    const tl = flattenSong(song);
    expect(tl.bars.map((b) => b.bar)).toEqual([0, 1, 0, 1, 2]);
    const pass = (i: number) => tl.bars[i].endSec - tl.bars[i].startSec;
    expect(pass(2)).toBeCloseTo(pass(0), 9);
    expect(pass(3)).toBeCloseTo(pass(1), 9);
    expect(tl.tempo.bpmAt(tl.bars[2].start)).toBe(60);
    expect(tl.tempo.bpmAt(tl.bars[2].start - 1)).toBeCloseTo(120, 0);
    expect(tl.tempo.bpmAt(tl.bars[1].start)).toBeCloseTo(90, 6);
    expect(tl.tempo.bpmAt(tl.bars[4].start)).toBe(120);
    // Starting a repeat in the middle of a ramp: the second pass of bar 1 starts at 90, not at 60.
    const mid = sixTab('title: M\ntempo: 60\n| q 1:0 1:0 1:0 1:0 |: 1:0 1:0 1:0 1:0 :|\ntempo: 120\n| w 1:0 ||\n');
    mid.tempo[0].ramp = true;
    const tm = flattenSong(mid);
    expect(tm.bars.map((b) => b.bar)).toEqual([0, 1, 1, 2]);
    expect(tm.tempo.bpmAt(tm.bars[2].start)).toBeCloseTo(90, 6);
  });

  it('plays a ramp exactly where the timeline says', () => {
    const song = sixTab('title: R\ntempo: 60\n| q 1:0 1:0 1:0 1:0 |\ntempo: 120\n| q 1:0 1:0 1:0 1:0 ||\n');
    song.tempo[0].ramp = true;
    const { player, notes, runTo } = setup(song);
    player.play();
    runTo(8);
    const tl = player.timeline.trackBeats('guitar').map((b) => b.sec);
    notes.forEach((n, i) => expect(n.time - notes[0].time).toBeCloseTo(tl[i], 6));
  });

  it('seeks into the middle of a note: the next note comes on time and position follows', () => {
    const { player, notes, runTo } = setup(scaleSong());
    player.seek(480);
    expect(player.position().tick).toBe(480);
    player.play();
    runTo(2);
    expect(notes[0].e.tick).toBe(960);
    expect(notes[1].time - notes[0].time).toBeCloseTo(0.5, 6);
  });

  it('changes the practice tempo while playing without touching pitch', () => {
    const { player, notes, runTo } = setup(scaleSong());
    player.play();
    runTo(0.7);
    player.tempoPercent = 50;
    runTo(8);
    const gaps = notes.map((n, i) => (i ? n.time - notes[i - 1].time : 0));
    expect(gaps[gaps.length - 1]).toBeCloseTo(1, 6);
    expect(notes.map((n) => n.e.midi)).toEqual([55, 57, 59, 60, 62, 64, 66, 67]);
  });

  it('counts in a full bar at the practice tempo', () => {
    const { player, notes, clicks, runTo } = setup(scaleSong(), 1);
    player.tempoPercent = 50;
    player.play();
    runTo(6);
    expect(clicks).toHaveLength(4);
    expect(clicks[1] - clicks[0]).toBeCloseTo(1, 6);
    expect(notes[0].time - clicks[0]).toBeCloseTo(4, 6);
  });

  it('sounds a note tied over the bar line once, for its whole length', () => {
    const { player, notes, runTo } = setup(sixTab('title: T\ntempo: 120\n| h 3:0 3:2 | q 3:- 3:4 h 3:5 ||\n'));
    player.play();
    runTo(5);
    expect(notes.map((n) => [n.e.tick, n.e.midi])).toEqual([[0, 55], [1920, 57], [4800, 59], [5760, 60]]);
    // Half + quarter at 120 bpm: 1.5 s.
    expect(notes[1].seconds).toBeCloseTo(1.5, 6);
  });

  it('sounds simultaneous tracks together', () => {
    const { player, notes, strums, runTo } = setup(sixTab(CAMPFIRE_GROOVE));
    player.play();
    runTo(1);
    expect(strums[0].time).toBeCloseTo(notes[0].time, 9);
    expect(notes[0].e.track).toBe('bass');
  });

  it('loops the shortest stretch between two bars when a repeat lies between them', () => {
    const song = sixTab('title: L\ntempo: 120\n|: q 1:0 1:1 1:3 1:5 | 2:0 2:1 2:3 2:5 :| q 3:0 3:2 3:4 3:5 ||\n');
    const { player, notes, runTo } = setup(song);
    expect(player.timeline.bars.map((b) => `${b.bar}.${b.pass}`)).toEqual(['0.1', '1.1', '0.2', '1.2', '2.1']);
    player.setLoop(1, 2);
    expect(player.loop).toMatchObject({ start: 3 * 3840, end: 5 * 3840 });
    player.play();
    runTo(9);
    expect(notes.slice(0, 10).map((n) => n.e.midi)).toEqual([59, 60, 62, 64, 55, 57, 59, 60, 59, 60]);
  });

  it('starts a pre-bend at the bent pitch once (not twice) and releases it', () => {
    const events = buildPlayEvents(flattenSong(sixTab('title: B\ntempo: 60\n| h 3:7b2{pre} 3:7b2r{pre} ||\n')));
    const notes = events.filter((e): e is PlayNote => e.kind === 'note');
    expect(notes[0]).toMatchObject({ midi: 62, cents: 200 });
    expect(notes.filter((n) => n.tick >= 1920).map((n) => [n.midi, n.cents ?? 0])).toEqual([[62, 200], [62, 0]]);
    expect(soundingPitch(sixTab('title: B\ntempo: 60\n| w 3:7b2r{pre} ||\n').tracks[0].measures[0].beats[0].notes[0])).toBe(64);
  });
});

describe('practice scoring edge cases', () => {
  const hz = (midi: number, cents = 0) => 440 * 2 ** ((midi - 69 + cents / 100) / 12);
  const repeated = () => practiceTargets(flattenSong(sixTab('title: R\ntempo: 120\n| q 1:0 1:0 1:3 1:0 | h 2:1 2:3 ||\n')), 'guitar');

  it('wait mode: a double trigger matches one note, not the repeated note after it', () => {
    const w = new WaitMode(repeated());
    expect(w.hear({ time: 1, midi: 64, freq: hz(64) }).kind).toBe('match');
    expect(w.hear({ time: 1.04, midi: 64, freq: hz(64) }).kind).toBe('ignored');
    expect(w.index).toBe(1);
    expect(w.hear({ time: 1.6, midi: 64, freq: hz(64) }).kind).toBe('match');
  });

  it('wait mode: the last note still ringing is not a wrong note; an octave slip is flagged', () => {
    const w = new WaitMode(repeated());
    w.hear({ time: 0, midi: 64 });
    w.hear({ time: 0.5, midi: 64 });
    expect(w.current!.midis).toEqual([67]);
    expect(w.hear({ time: 1.2, midi: 64 }).kind).toBe('ignored');
    const slip = w.hear({ time: 1.5, midi: 55 });
    expect(slip).toMatchObject({ kind: 'wrong', octave: true });
    expect(w.hear({ time: 1.7, midi: 67 }).kind).toBe('match');
    expect(w.summary().wrong).toBe(1);
  });

  it('flow mode: double triggers, ringing notes and octave slips neither score nor break the combo', () => {
    const f = new FlowMode(flowTargets(repeated()));
    expect(f.hear({ time: 0.01, midi: 64 })!.grade).toBe('perfect');
    // The detector fires again 30 ms later: not the second E (due at 0.5 s).
    expect(f.hear({ time: 0.04, midi: 64 })).toBeNull();
    expect(f.hear({ time: 0.51, midi: 64 })!.grade).toBe('perfect');
    // The E still ringing, re-detected just before the G is due, is not a wrong note.
    expect(f.hear({ time: 0.9, midi: 64 })).toBeNull();
    // The G an octave low (a detector slip) is ignored; the real G scores.
    expect(f.hear({ time: 1.0, midi: 55 })).toBeNull();
    expect(f.hear({ time: 1.02, midi: 67 })!.grade).toBe('perfect');
    expect(f.result().combo).toBe(3);
  });

  it('flow mode: a note far too early is not a hit; the target is then missed', () => {
    const f = new FlowMode(flowTargets(repeated()));
    f.hear({ time: 0, midi: 64 });
    f.hear({ time: 0.5, midi: 64 });
    // G due at 1.0 s, played 0.3 s early: outside every window.
    expect(f.hear({ time: 0.7, midi: 67 })).toBeNull();
    expect(f.advance(1.2).map((j) => j.grade)).toEqual(['missed']);
    expect(f.result().combo).toBe(0);
  });

  it('flow mode: the rest of a strum after its chord was judged is not wrong', () => {
    const t = practiceTargets(flattenSong(sixTab('title: C\ntempo: 60\n| q (5:3 4:2 3:0 2:1 1:0){dn} (6:3 5:2 4:0 3:0 2:0 1:3){dn} h r ||\n')), 'guitar');
    const f = new FlowMode(flowTargets(t));
    expect(f.hear({ time: 0, midi: 48 })).toBeNull();
    // Two of the three pitch classes are enough to judge a strum, timed from its first note.
    expect(f.hear({ time: 0.01, midi: 52 })).toMatchObject({ grade: 'perfect', offset: 0 });
    expect(f.hear({ time: 0.02, midi: 55 })).toBeNull();
    expect(f.hear({ time: 0.03, midi: 60 })).toBeNull();
    expect(f.hear({ time: 0.04, midi: 64 })).toBeNull();
    expect(f.result().counts.wrong).toBe(0);
  });

  it('flow mode follows the speed trainer: target times move with the tempo of each pass', () => {
    const targets = flowTargets(repeated(), { tempoPercent: 50 });
    const f = new FlowMode(targets);
    expect(f.hear({ time: 1.0, midi: 64 })!.grade).toBe('perfect');
    f.nextPass({ tempoPercent: 100 });
    // songTimeAt now divides by 1.0: the second E is due at 0.5 s.
    expect(f.hear({ time: 0, midi: 64 })!.grade).toBe('perfect');
    expect(f.hear({ time: 0.5, midi: 64 })!.grade).toBe('perfect');
  });

  it('a rhythm track can be practised: its slashes are chord targets', () => {
    const tl = flattenSong(sixTab(CAMPFIRE_GROOVE));
    const t = practiceTargets(tl, 'rhythm');
    expect(t.length).toBeGreaterThan(20);
    expect(t[0]).toMatchObject({ symbol: 'G', chord: true, pcs: [7, 11, 2] });
    expect(t[0].positions).toHaveLength(6);
    const w = new WaitMode(t);
    for (const m of [43, 47, 50]) w.hear({ time: 0, midi: m });
    expect(w.index).toBe(1);
  });
});

describe('difficulty estimator ranks pieces in a sensible order', () => {
  const tiers: Array<{ name: string; band: 'beginner' | 'intermediate' | 'expert'; levels: [number, number]; songs: Array<[string, string]> }> = [
    { name: 'trivial', band: 'beginner', levels: [1, 1], songs: [
      ['open strings', 'title: Open\ntempo: 60\n| w 6:0 | w 5:0 | w 4:0 | w 3:0 ||\n'],
      ['two notes', 'title: Two\ntempo: 70\n| q 1:0 1:0 2:1 2:1 | 1:0 1:0 h 2:1 ||\n'],
    ] },
    { name: 'beginner', band: 'beginner', levels: [1, 3], songs: [
      ['Amazing Grace', AMAZING_GRACE],
      ['Ode to Joy', ODE_TO_JOY],
      ['open chords', 'title: Chords\ntempo: 80\ntrack: Rhythm\nrole: rhythm\n| "G" q D D D D | "C" D D D D | "D" D D D D | "G" w D ||\n'],
      ['Campfire Groove', CAMPFIRE_GROOVE],
    ] },
    { name: 'intermediate', band: 'intermediate', levels: [4, 7], songs: [
      ['melody in 7th position', 'title: Pos\ntempo: 100\n| e 3:7 3:9 2:7 2:8 2:10 1:7 1:8 1:10 | 1:8 1:7 2:10 2:8 2:7 3:9 q 3:7 ||\n'],
      ['barre chords in sixteenths', 'title: Barre\ntempo: 100\ntrack: Rhythm\nrole: rhythm\n| "F" s D D U D U D U D U D U D U D U D | "Bm" D D U D U D U D U D U D U D U D | "Bb" D D U D U D U D U D U D U D U D | "C#m7" D D U D U D U D U D U D U D U D ||\n'],
      ['Technique Sampler', TECHNIQUE_SAMPLER],
    ] },
    { name: 'expert', band: 'expert', levels: [8, 10], songs: [
      ['fast legato with bends', 'title: Lead\ntempo: 130\n| s 2:15 2:17h 2:15p 3:16 3:14 3:16b2r 3:14 4:16 4:14p 4:12 5:14 5:12 5:15 4:12 4:14 4:15~ | q 1:17b2 1:15 2:17 e 2:15 2:13 ||\n'],
      ['shred run', 'title: Shred\ntempo: 160\n| s 1:12 1:15h 1:12p 2:15 2:13p 2:12p 3:14 3:12p 4:14 4:12p 5:15 5:14p 6:15 6:12p 6:15h 5:12 |\n'],
    ] },
  ];
  const rated = tiers.map((t) => ({ ...t, results: t.songs.map(([name, text]) => ({ name, d: estimateDifficulty(sixTab(text)) })) }));

  it.each(rated.flatMap((t) => t.results.map((r) => [t.name, r.name, t, r] as const)))('%s: %s gets a level and band in its tier', (_tier, _name, t, r) => {
    expect(r.d.level).toBeGreaterThanOrEqual(t.levels[0]);
    expect(r.d.level).toBeLessThanOrEqual(t.levels[1]);
    expect(r.d.band).toBe(t.band);
    if (t.name === 'intermediate' || t.name === 'expert') expect(r.d.reasons.length).toBeGreaterThan(0);
  });

  it('every piece of a tier scores below every piece of the next tier', () => {
    for (let i = 1; i < rated.length; i++) {
      const below = Math.max(...rated[i - 1].results.map((r) => r.d.score));
      const above = Math.min(...rated[i].results.map((r) => r.d.score));
      expect(below, `${rated[i - 1].name} < ${rated[i].name}`).toBeLessThan(above);
    }
  });

  it('orders pieces inside the harder tiers, and a slower tempo rates lower', () => {
    const score = (tier: number, k: number) => rated[tier].results[k].d.score;
    expect(score(2, 0)).toBeLessThan(score(2, 1));
    expect(score(2, 1)).toBeLessThan(score(2, 2));
    expect(score(3, 0)).toBeLessThan(score(3, 1));
    const shred = sixTab(rated[3].songs[1][1]);
    expect(estimateDifficulty(shred, { tempoPercent: 50 }).score).toBeLessThan(estimateDifficulty(shred).score);
    // Strumming sixteenths is not as hard as picking sixteenths.
    expect(rated[2].results[1].d.factors.speed).toBeLessThan(rated[3].results[1].d.factors.speed);
  });
});

// ── SixTab fuzzing ───────────────────────────────────────────────────────────────────────────

/** A small seeded PRNG (mulberry32), so a failing case can be replayed. */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T,>(list: readonly T[]): T => list[Math.floor(next() * list.length)],
    chance: (p: number) => next() < p,
  };
}

const STD = [40, 45, 50, 55, 59, 64];
const BASS = [28, 33, 38, 43];
const TIMES: TimeSig[] = [{ numerator: 4, denominator: 4 }, { numerator: 3, denominator: 4 }, { numerator: 6, denominator: 8 }, { numerator: 2, denominator: 4 }, { numerator: 5, denominator: 4 }, { numerator: 7, denominator: 8 }, { numerator: 12, denominator: 8 }];
const SYMBOLS = ['C', 'Am', 'G7', 'Fmaj7', 'Dm7', 'E', 'Bb', 'F#m7b5', 'C/E', 'Dsus4', 'Aadd9', 'N.C.'];
const VOICED: Record<string, Array<number | null>> = { C: [null, 3, 2, 0, 1, 0], Am: [null, 0, 2, 2, 1, 0], E: [0, 2, 2, 1, 0, 0], G7: [3, 2, 0, 0, 0, 1] };

/**
 * A random song that SixTab can express exactly: meters, pickups, triplets, chords, every
 * technique in a context where it is legal, slashes, lyrics, chord symbols with shapes,
 * annotations, repeats with endings, sections with strum patterns, tempo/time/key changes, a bass track.
 */
function randomSong(seed: number): Song {
  const r = rng(seed);
  const guitarTuning = r.pick([STD, [38, 45, 50, 55, 59, 64], [38, 45, 50, 55, 57, 62]]);
  const capo = r.chance(0.3) ? r.int(1, 5) : 0;
  const barCount = r.int(1, 7);
  const bars: BarInfo[] = [];
  let time = r.pick(TIMES);
  for (let i = 0; i < barCount; i++) {
    if (i > 0 && r.chance(0.15)) time = r.pick(TIMES);
    bars.push({ time: { ...time } });
  }
  const pickup = barCount > 1 && r.chance(0.25) ? r.pick([480, 960, 1440]) : undefined;
  if (pickup && pickup < barCapacity(bars[0].time)) bars[0].length = pickup;
  // Repeats: one passage, maybe with first and second endings.
  if (barCount >= 3 && r.chance(0.5)) {
    const from = r.int(0, barCount - 3);
    const to = r.int(from, barCount - 2);
    bars[from].repeatStart = true;
    if (to + 1 < barCount && r.chance(0.5)) {
      bars[to].ending = [1];
      bars[to].repeatEnd = 2;
      bars[to + 1].ending = [2];
    } else bars[to].repeatEnd = r.pick([2, 2, 3, 4]);
  }
  for (let i = 1; i < barCount; i++) if (r.chance(0.12)) bars[i].key = r.pick(['D', 'Em', 'F', 'Bb']);
  const tempo: Song['tempo'] = [{ bar: 0, bpm: r.int(40, 200) }];
  for (let i = 1; i < barCount; i++) if (r.chance(0.15)) tempo.push({ bar: i, bpm: r.int(40, 200) });
  const sections: Section[] = [];
  if (r.chance(0.6)) {
    let at = 0;
    let k = 1;
    while (at < barCount) {
      const len = r.int(1, barCount - at);
      sections.push({ name: `Part ${k++}`, start: at, end: at + len, ...(r.chance(0.3) ? { strum: { pattern: r.pick(['D-DU-UDU', 'DDUUDU', 'D--D', 'X-X-']) } } : {}) });
      at += len;
    }
  }
  const chords: ChordEvent[] = [];
  const annotations: Song['annotations'] = [];

  const makeTrack = (id: string, name: string, role: 'lead' | 'rhythm' | 'bass', tuning: number[], trackCapo: number, first: boolean): Track => {
    const last = new Map<number, Note>();
    const measures = bars.map((info, bi) => {
      const length = info.length ?? barCapacity(info.time);
      const beats: Beat[] = [];
      let at = 0;
      while (at < length) {
        const left = length - at;
        // A straight value that fits, or a whole triplet group.
        const options: Array<{ ticks: number; value: NoteValue; count: number }> = [];
        for (const v of [{ base: 1 }, { base: 2, dots: 1 }, { base: 2 }, { base: 4, dots: 1 }, { base: 4 }, { base: 8, dots: 1 }, { base: 8 }, { base: 16 }, { base: 32 }] as NoteValue[]) {
          const t = valueTicks(v);
          if (t <= left) options.push({ ticks: t, value: v, count: 1 });
        }
        for (const base of [4, 8, 16]) {
          const v: NoteValue = { base, tuplet: { actual: 3, normal: 2 } };
          if (valueTicks(v) * 3 <= left) options.push({ ticks: valueTicks(v), value: v, count: 3 });
        }
        const o = r.pick(options);
        for (let c = 0; c < o.count; c++) {
          const beat: Beat = { start: at, duration: o.ticks, value: { ...o.value, ...(o.value.tuplet ? { tuplet: { ...o.value.tuplet } } : {}) }, notes: [] };
          const kind = role === 'rhythm' ? r.pick(['slash', 'slash', 'slash', 'rest']) : r.pick(['note', 'note', 'note', 'chord', 'rest']);
          if (kind === 'slash') {
            beat.slash = true;
            const s = r.pick(['/', 'D', 'U', 'X', 'D', 'U']);
            if (s === 'D') beat.stroke = 'down';
            if (s === 'U') beat.stroke = 'up';
            if (s === 'X') {
              beat.mutedStrum = true;
              if (r.chance(0.5)) beat.stroke = r.pick(['down', 'up'] as const);
            }
          } else if (kind === 'rest') {
            last.clear();
          } else {
            const count = kind === 'chord' ? r.int(2, Math.min(4, tuning.length)) : 1;
            const strings = [...Array(tuning.length).keys()].map((k) => k + 1).sort(() => r.next() - 0.5).slice(0, count).sort((a, b) => b - a);
            for (const string of strings) {
              const prev = last.get(string);
              const note: Note = { string, fret: r.int(0, 15), midi: 0 };
              const connect = prev && !prev.dead && r.chance(0.3) ? r.pick(['tie', 'hammer', 'pull', 'slide'] as const) : null;
              if (connect === 'tie' && prev) {
                note.fret = prev.fret;
                note.tie = true;
                if (prev.harmonic) note.harmonic = prev.harmonic;
              } else if ((connect === 'hammer' || connect === 'pull' || connect === 'slide') && prev) {
                const up = connect === 'hammer' ? true : connect === 'pull' ? false : r.chance(0.5);
                const fret = up ? prev.fret + r.int(1, 3) : prev.fret - r.int(1, 3);
                if (fret >= 0 && fret <= 24) {
                  note.fret = fret;
                  if (connect === 'slide') note.slide = up ? 'up' : 'down';
                  else note.legato = connect;
                }
              }
              if (!note.tie) {
                if (r.chance(0.08)) note.vibrato = true;
                if (r.chance(0.05)) note.accent = true;
                if (r.chance(0.05)) note.tap = true;
                if (r.chance(0.06)) note.bend = { amount: r.pick([0.5, 1, 1.5, 2, 3]), ...(r.chance(0.4) ? { release: true } : {}), ...(r.chance(0.2) ? { pre: true } : {}) };
                if (r.chance(0.05)) note.slideIn = r.pick(['below', 'above'] as const);
                if (r.chance(0.05)) note.slideOut = r.pick(['up', 'down'] as const);
                const colour = r.int(0, 30);
                if (colour === 0) note.ghost = true;
                if (colour === 1) note.harmonic = 'natural';
                if (colour === 2) note.harmonic = 'artificial';
                if (colour === 3) note.dead = true;
                if (colour === 4) {
                  note.harmonic = 'natural';
                  note.ghost = true;
                }
              }
              if (r.chance(0.06)) note.palmMute = true;
              if (r.chance(0.05)) note.letRing = true;
              if (r.chance(0.04)) note.staccato = true;
              if (count === 1 && r.chance(0.08)) note.finger = r.pick([0, 1, 2, 3, 4, 'T'] as const);
              if (count === 1 && r.chance(0.06)) note.pluck = r.pick(['p', 'i', 'm', 'a', 'c'] as const);
              note.midi = midiOf(string, note.fret, tuning, trackCapo);
              beat.notes.push(note);
            }
            if (r.chance(0.1)) beat.stroke = r.pick(['down', 'up'] as const);
          }
          if (first && r.chance(0.12)) {
            const symbol = r.pick(SYMBOLS);
            if (!chords.some((x) => x.bar === bi && x.tick === at)) chords.push({ bar: bi, tick: at, symbol, ...(VOICED[symbol] && tuning.length === 6 && r.chance(0.5) ? { voicing: [...VOICED[symbol]] } : {}) });
          }
          if (first && r.chance(0.04)) annotations.push({ bar: bi, tick: at, text: r.pick(['let ring', 'swing', 'a tempo', 'rit.']) });
          for (const n of beat.notes) last.set(n.string, n);
          beats.push(beat);
          at += o.ticks;
        }
      }
      return { beats };
    });
    return { id, name, role, ...(first ? {} : { tuning: [...tuning] }), measures };
  };

  const tracks: Track[] = [];
  const role = r.pick(['lead', 'lead', 'rhythm'] as const);
  tracks.push(makeTrack(role === 'rhythm' ? 'rhythm' : 'guitar', role === 'rhythm' ? 'Rhythm' : 'Guitar', role, guitarTuning, capo, true));
  if (r.chance(0.35)) {
    const bass = makeTrack('bass', 'Bass', 'bass', BASS, 0, false);
    bass.capo = 0;
    tracks.push(bass);
  }
  // Lyrics on singable beats of the first track.
  if (tracks[0].role !== 'rhythm' && r.chance(0.4)) {
    for (const m of tracks[0].measures) for (const b of m.beats) if (b.notes.length && !b.notes.every((n) => n.tie) && r.chance(0.5)) b.lyric = r.pick(['la', 'sing-', 'ing', 'oh', "it's"]);
  }
  const song: Song = {
    meta: { id: `fuzz-${seed}`, title: `Fuzz ${seed}`, ...(r.chance(0.5) ? { composer: 'Sixstring Academy' } : {}), ...(r.chance(0.3) ? { difficulty: r.int(1, 10), tags: ['fuzz', 'test'] } : {}) },
    tuning: guitarTuning,
    capo,
    ...(r.chance(0.5) ? { key: r.pick(['C', 'G', 'Am', 'F# minor', 'Bb']) } : {}),
    tempo,
    bars,
    sections,
    tracks,
    chords: chords.sort((a, b) => a.bar - b.bar || a.tick - b.tick),
    annotations: annotations.sort((a, b) => a.bar - b.bar || a.tick - b.tick),
  };
  return song;
}

describe('SixTab fuzzing', () => {
  const strip = (s: Song) => JSON.parse(JSON.stringify(s));

  it('random songs are valid, write without losses, and parse back to exactly the same song (300 seeds)', () => {
    const seen = new Map<string, number>();
    const count = (k: string) => seen.set(k, (seen.get(k) ?? 0) + 1);
    for (let seed = 1; seed <= 300; seed++) {
      const song = randomSong(seed);
      for (const t of song.tracks) for (const m of t.measures) for (const b of m.beats) {
        if (b.slash) count(b.mutedStrum ? 'muted strum' : 'slash');
        if (b.value?.tuplet) count('tuplet');
        if (b.notes.length > 1) count('chord');
        if (b.lyric) count('lyric');
        for (const n of b.notes) for (const k of Object.keys(n)) if (!['string', 'fret', 'midi'].includes(k)) count(k);
      }
      if (song.bars.some((b) => b.ending)) count('ending');
      if (song.bars.some((b) => b.repeatEnd && b.repeatEnd > 2)) count('repeat xN');
      if (song.bars[0].length) count('pickup');
      if (song.tracks.length > 1) count('two tracks');
      if (song.tempo.length > 1) count('tempo change');
      if (song.bars.some((b, i) => i && b.time.numerator !== song.bars[i - 1].time.numerator)) count('time change');
      if (song.chords.some((c) => c.voicing)) count('voicing');
      const problems = validateSong(song, { notation: false }).filter((i) => i.level === 'error');
      expect(problems, `seed ${seed}: generator made an invalid song`).toEqual([]);
      expect(sixTabLosses(song), `seed ${seed}`).toEqual([]);
      const text = toSixTab(song);
      const back = parseSixTab(text);
      expect(back.errors, `seed ${seed}:\n${text}`).toEqual([]);
      expect(strip(back.song!), `seed ${seed}:\n${text}`).toEqual(strip(song));
      expect(toSixTab(back.song!), `seed ${seed}: writing is stable`).toBe(text);
    }
    // The generator really exercises the format.
    for (const k of ['slash', 'muted strum', 'tuplet', 'chord', 'lyric', 'tie', 'legato', 'slide', 'bend', 'vibrato', 'accent', 'tap', 'slideIn', 'slideOut', 'ghost', 'harmonic', 'dead', 'palmMute', 'letRing', 'staccato', 'finger', 'pluck', 'ending', 'repeat xN', 'pickup', 'two tracks', 'tempo change', 'time change', 'voicing']) {
      expect(seen.get(k) ?? 0, k).toBeGreaterThan(3);
    }
  });

  it('equivalent spellings parse to the same song: /n durations, extra whitespace and tabs, comments, Windows line ends (150 seeds)', () => {
    const letters: Record<string, string> = { w: '/1', h: '/2', q: '/4', e: '/8', s: '/16' };
    for (let seed = 400; seed < 550; seed++) {
      const r = rng(seed);
      const song = randomSong(seed);
      const text = toSixTab(song)
        .split('\n')
        .map((line) => {
          if (!line.startsWith('|') && !line.startsWith(':|')) return line;
          // Rewrite duration letters outside quotes, pad tokens with spaces and tabs, add a trailing comment.
          const parts = line.split(/("[^"]*")/);
          const music = parts.map((part, i) => (i % 2 ? part : part.split(' ').map((tok) => {
            const m = /^([whqes])(\.{0,2}\d*)$/.exec(tok);
            const t = m && r.chance(0.6) ? letters[m[1]] + m[2] : tok;
            return t + (r.chance(0.2) && !t.endsWith('^') ? r.pick([' ', '\t', '  ']) : '');
          }).join(' '))).join('');
          return music + (r.chance(0.3) ? '   // a comment' : '');
        })
        .join(r.chance(0.5) ? '\r\n' : '\n');
      const back = parseSixTab(text);
      expect(back.errors, `seed ${seed}:\n${text}`).toEqual([]);
      expect(strip(back.song!), `seed ${seed}`).toEqual(strip(song));
    }
  });

  it('malformed input never throws: every error has a line and column inside the text, and a song that parses is valid (3000 mutations)', () => {
    const sources = [...Object.values(SONG_EXAMPLES), ...[11, 22, 33, 44, 55].map((seed) => toSixTab(randomSong(seed)))];
    const alphabet = ['|', ':', '(', ')', '[', ']', '{', '}', '"', '^', '%', '/', '\\', 'h', 'p', 'b', 'r', 's', 't', 'x', '~', '>', '-', '.', '0', '3', '9', '12', '99', ' ', 'q', 'e', 'w', 'D', 'U', 'X', '\n', ',', '#', '//', 'pm', '{x}', ':|x', '[1]', 'lyrics: la', 'track: B', 'time: 3/4', 'tuning: bass', '\t', 'é', '\u2014'];
    const r = rng(2024);
    let parsedOk = 0;
    for (let k = 0; k < 3000; k++) {
      let text = r.pick(sources);
      for (let m = r.int(1, 3); m > 0; m--) {
        const at = r.int(0, text.length);
        switch (r.int(0, 6)) {
          case 0: text = text.slice(0, at) + text.slice(at + r.int(1, 4)); break;
          case 1: text = text.slice(0, at) + r.pick(alphabet) + text.slice(at); break;
          case 2: text = text.slice(0, at); break;
          case 3: {
            const lines = text.split('\n');
            const i = r.int(0, lines.length - 1);
            if (r.chance(0.5)) lines.splice(i, 1);
            else lines.splice(i, 0, lines[i]);
            text = lines.join('\n');
            break;
          }
          case 4: text = text.replace(/\d+/, () => String(r.pick([0, 31, 99, 400, 5000]))); break;
          case 5: {
            const words = text.split(' ');
            const i = r.int(0, Math.max(0, words.length - 2));
            [words[i], words[i + 1]] = [words[i + 1], words[i]];
            text = words.join(' ');
            break;
          }
          default: text = text.slice(0, at) + r.pick(alphabet) + text.slice(at + 1);
        }
      }
      let result: ReturnType<typeof parseSixTab>;
      try {
        result = parseSixTab(text);
      } catch (e) {
        throw new Error(`parseSixTab threw on mutation ${k}: ${(e as Error).message}\n${text}`);
      }
      const lines = text.split(/\r?\n/);
      if (result.song) {
        parsedOk++;
        expect(result.errors).toEqual([]);
        expect(validateSong(result.song, { notation: false }).filter((i) => i.level === 'error'), `mutation ${k}:\n${text}`).toEqual([]);
      } else {
        expect(result.errors.length, `mutation ${k}`).toBeGreaterThan(0);
        for (const e of result.errors) {
          expect(e.message.length, `mutation ${k}`).toBeGreaterThan(5);
          expect(e.line, `mutation ${k}: ${e.message}\n${text}`).toBeGreaterThanOrEqual(1);
          expect(e.line, `mutation ${k}: ${e.message}\n${text}`).toBeLessThanOrEqual(Math.max(1, lines.length));
          expect(e.column, `mutation ${k}: ${e.message}`).toBeGreaterThanOrEqual(1);
          expect(e.column, `mutation ${k}: ${e.message} (line ${e.line}: "${lines[e.line - 1]}")`).toBeLessThanOrEqual((lines[e.line - 1]?.length ?? 0) + 1);
        }
      }
    }
    // Some mutations are harmless (a fret changed); most are not.
    expect(parsedOk).toBeGreaterThan(50);
    expect(parsedOk).toBeLessThan(2500);
  });
});

describe('SixTab grammar in API.md matches the parser', () => {
  const H = 'title: T\ntempo: 90\n';
  const one = (body: string, head = H) => {
    const r = parseSixTab(head + body);
    expect(r.errors).toEqual([]);
    return r.song!;
  };
  const err = (body: string, head = H) => {
    const r = parseSixTab(head + body);
    expect(r.song).toBeNull();
    return r.errors;
  };
  const beats = (song: Song, t = 0) => song.tracks[t].measures.flatMap((m) => m.beats);

  it('header fields', () => {
    const s = one('| h. 3:0 ||\n', 'title: Song Title\ncomposer: C\nartist: A\narranger: R\nsource: S\nlicence: Public domain\ndifficulty: 3\ntags: a, b\ntempo: 72\ntime: 3/4\nkey: F# minor\ntuning: drop-d\ncapo: 2\n');
    expect(s.meta).toMatchObject({ id: 'song-title', title: 'Song Title', composer: 'C', artist: 'A', arranger: 'R', source: 'S', licence: 'Public domain', difficulty: 3, tags: ['a', 'b'] });
    expect([s.tempo, s.key, s.tuning, s.capo]).toEqual([[{ bar: 0, bpm: 72 }], 'F# minor', [38, 45, 50, 55, 59, 64], 2]);
    expect(one('| w 3:0 ||\n', 'title: T\nid: my-id\nlicense: PD\ntempo: 60\n').meta).toMatchObject({ id: 'my-id', licence: 'PD' });
    for (const [tuning, midi] of [['standard', STD], ['dadgad', [38, 45, 50, 55, 57, 62]], ['D A D G B E', [38, 45, 50, 55, 59, 64]], ['C2 G2 C3 G3 C4 E4', [36, 43, 48, 55, 60, 64]], ['40 45 50 55 59 64', STD]] as const) {
      expect(one('| w 3:0 ||\n', `${H}tuning: ${tuning}\n`).tuning).toEqual(midi);
    }
    expect(one('| w 3:0 ||\n', `${H}tuning: bass\n`).tuning).toEqual(BASS);
    for (const key of ['G', 'Em', 'Bb major', 'C#m']) expect(one('| w 3:0 ||\n', `${H}key: ${key}\n`).key).toBe(key);
    expect(one('| q 3:0 | w 3:0 ||\n', `${H}pickup: q\n`).bars[0].length).toBe(960);
    expect(err('| w 3:0 ||\n', 'tempo: 90\n')[0].message).toContain('needs a title');
    expect(err('| w 3:0 ||\n', `${H}difficulty: 11\n`)[0]).toMatchObject({ line: 3 });
    expect(err('| w 3:0 ||\n', `${H}id: Not Slug\n`)[0].message).toContain('lowercase');
    expect(err('| w 3:0 ||\n', `${H}tuning: 1 2 3 4\n`)[0]).toMatchObject({ line: 3, column: 9 });
  });

  it('durations: letters, /n, dots and tuplet digits, sticky across bars', () => {
    const ticks = (d: string, n: number) => beats(one(`| ${d} ${Array(n).fill('3:0').join(' ')} ||\n`))[0].duration;
    expect([ticks('w', 1), ticks('h', 2), ticks('q', 4), ticks('e', 8), ticks('s', 16), ticks('/32', 32)]).toEqual([3840, 1920, 960, 480, 240, 120]);
    expect([ticks('/1', 1), ticks('/2', 2), ticks('/4', 4), ticks('/8', 8), ticks('/16', 16)]).toEqual([3840, 1920, 960, 480, 240]);
    expect(beats(one('| /64 ' + Array(64).fill('3:0').join(' ') + ' ||\n'))[0].duration).toBe(60);
    expect(beats(one('| q. 3:0 e 3:0 h 3:0 ||\n')).map((b) => b.duration)).toEqual([1440, 480, 1920]);
    expect(beats(one('| e.. 3:0 /32 3:0 q 3:0 h 3:0 ||\n'))[0].duration).toBe(840);
    expect(beats(one('| e3 3:0 3:0 3:0 s6 3:0 3:0 3:0 3:0 3:0 3:0 h 3:0 ||\n')).map((b) => b.duration)).toEqual([320, 320, 320, 160, 160, 160, 160, 160, 160, 1920]);
    expect(beats(one('| q5 3:0 3:0 3:0 3:0 3:0 ||\n'))[0]).toMatchObject({ duration: 768, value: { base: 4, tuplet: { actual: 5, normal: 4 } } });
    expect(one('| q 3:0 3:0 3:0 3:0 | 3:0 3:0 3:0 3:0 ||\n').tracks[0].measures[1].beats).toHaveLength(4);
    expect(err('| e1 3:0 |\n')[0].message).toContain('tuplet');
    // Durations reset per track.
    expect(err('track: A\n| q 3:0 3:0 3:0 3:0 ||\ntrack: B\n| 3:0 3:0 3:0 3:0 ||\n')[0].message).toContain('No duration yet');
  });

  it('notes, chords, rests and slashes', () => {
    const b = beats(one('| q 3:5 3:x 3:(5) 3:<12> | 3:- (5:3 4:2 2:1) r / | D U X X{dn} ||\n'));
    expect(b[0].notes[0]).toMatchObject({ string: 3, fret: 5, midi: 60 });
    expect(b[1].notes[0]).toMatchObject({ fret: 0, dead: true });
    expect(b[2].notes[0]).toMatchObject({ fret: 5, ghost: true });
    expect(b[3].notes[0]).toMatchObject({ fret: 12, harmonic: 'natural' });
    expect(b[4].notes[0]).toMatchObject({ fret: 12, tie: true, harmonic: 'natural' });
    expect(b[5].notes.map((n) => `${n.string}:${n.fret}`)).toEqual(['5:3', '4:2', '2:1']);
    expect(b[6].notes).toEqual([]);
    expect(b[7]).toMatchObject({ slash: true, notes: [] });
    expect(b.slice(8).map((x) => [x.slash, x.stroke ?? null, x.mutedStrum ?? false])).toEqual([[true, 'down', false], [true, 'up', false], [true, null, true], [true, 'down', true]]);
  });

  it('suffixes and prefixes, each documented meaning', () => {
    const n = beats(one('| s 3:5 3:7h 3:5p 3:7s 3:9t 3:9~ 3:9> 3:9b 3:9b1 3:9b0.5r 3:9/ 3:9\\ /3:7 \\3:7 3:7b2r~ 3:7 ||\n')).map((x) => x.notes[0]);
    expect(n[1].legato).toBe('hammer');
    expect(n[2].legato).toBe('pull');
    expect(n[3].slide).toBe('up');
    expect(n[4].tap).toBe(true);
    expect(n[5].vibrato).toBe(true);
    expect(n[6].accent).toBe(true);
    expect([n[7].bend, n[8].bend, n[9].bend]).toEqual([{ amount: 2 }, { amount: 1 }, { amount: 0.5, release: true }]);
    expect([n[10].slideOut, n[11].slideOut]).toEqual(['up', 'down']);
    expect([n[12].slideIn, n[13].slideIn]).toEqual(['below', 'above']);
    expect(n[14]).toMatchObject({ bend: { amount: 2, release: true }, vibrato: true });
    // A slide down is still written "s": the direction follows the frets.
    expect(beats(one('| h 3:9 3:7s ||\n'))[1].notes[0].slide).toBe('down');
    expect(err('| h 3:5 3:3h ||\n')[0].message).toContain('pull-off');
    expect(err('| h 3:5 3:7p ||\n')[0].message).toContain('hammer-on');
    expect(err('| h 3:5 r | w 3:7s ||\n'.replace('| h 3:5 r | w', '| h 3:5 r | w'))[0].message).toContain('no earlier note');
  });

  it('modifiers after a note or a group', () => {
    const n = beats(one('| s 3:5{pm} 3:5{lr} 3:5{st} 3:5{ac} 3:5{vib} 3:5{x} 3:5{gh} 3:5{nh} 3:5{ah} 3:5{tap} 3:5b2{pre} 3:5{dn} 3:5{up} 3:5{0} 3:5{T} 3:5{P} ||\n'));
    const f = (k: number) => n[k].notes[0];
    expect([f(0).palmMute, f(1).letRing, f(2).staccato, f(3).accent, f(4).vibrato, f(5).dead, f(6).ghost]).toEqual([true, true, true, true, true, true, true]);
    expect([f(7).harmonic, f(8).harmonic, f(9).tap, f(10).bend]).toEqual(['natural', 'artificial', true, { amount: 2, pre: true }]);
    expect([n[11].stroke, n[12].stroke, f(13).finger, f(14).finger, f(15).pluck]).toEqual(['down', 'up', 0, 'T', 'p']);
    const g = beats(one('| w (3:2{2} 2:3{3}){pm dn} ||\n'))[0];
    expect(g.stroke).toBe('down');
    expect(g.notes.map((x) => [x.finger, x.palmMute])).toEqual([[2, true], [3, true]]);
    for (const [k, v] of [['1', 1], ['2', 2], ['3', 3], ['4', 4]] as const) expect(beats(one(`| w 3:5{${k}} ||\n`))[0].notes[0].finger).toBe(v);
    for (const [k, v] of [['I', 'i'], ['M', 'm'], ['A', 'a'], ['C', 'c']] as const) expect(beats(one(`| w 3:5{${k}} ||\n`))[0].notes[0].pluck).toBe(v);
    expect(err('| w (3:2 2:3){2} ||\n')[0].message).toContain('belongs to one note');
  });

  it('chord symbols with shapes, annotations, bar lines, repeats, endings and %', () => {
    const s = one('|: "Am" q 1:0 "G=320003" 1:0 ^"let ring" "Bb=x-1-3-3-3-1" 1:0 1:0 | % :|x3\n|: h 1:0 1:0 :|: h 2:0 2:0 :|\n|: w 3:0 | [1] w 3:0 :| [2] w 3:0 ||\n');
    expect(s.chords).toEqual([{ bar: 0, tick: 0, symbol: 'Am' }, { bar: 0, tick: 960, symbol: 'G', voicing: [3, 2, 0, 0, 0, 3] }, { bar: 0, tick: 1920, symbol: 'Bb', voicing: [null, 1, 3, 3, 3, 1] }, { bar: 1, tick: 960, symbol: 'G', voicing: [3, 2, 0, 0, 0, 3] }, { bar: 1, tick: 1920, symbol: 'Bb', voicing: [null, 1, 3, 3, 3, 1] }]);
    expect(s.annotations).toEqual([{ bar: 0, tick: 1920, text: 'let ring' }]);
    expect(s.bars.map((b) => [b.repeatStart ?? false, b.repeatEnd ?? 0, b.ending ?? null])).toEqual([[true, 0, null], [false, 3, null], [true, 2, null], [true, 2, null], [true, 0, null], [false, 2, [1]], [false, 0, [2]]]);
    expect(s.tracks[0].measures[1].beats).toEqual(s.tracks[0].measures[0].beats);
    expect(playbackOrder(s.bars).map((x) => x.bar)).toEqual([0, 1, 0, 1, 0, 1, 2, 2, 3, 3, 4, 5, 4, 6]);
  });

  it('body directives: sections, tempo/time/key changes, strum, tracks, lyrics and comments', () => {
    const text = `${H}# a comment line
[Verse 1]
strum: D-DU-UDU // a comment at the end
| q 3:0 3:0 3:0 3:0 |
lyrics: A-maz-ing _
tempo: 120
time: 3/4
key: D
| h. 3:0 ||
track: Bass
role: bass
tuning: bass
capo: 0
[Verse 1]
| w 4:0 | h. 4:0 ||
`;
    const r = parseSixTab(text);
    expect(r.errors).toEqual([]);
    const s = r.song!;
    expect(s.sections).toEqual([{ name: 'Verse 1', start: 0, end: 2, strum: { pattern: 'D-DU-UDU' } }]);
    expect(s.tempo).toEqual([{ bar: 0, bpm: 90 }, { bar: 1, bpm: 120 }]);
    expect(s.bars.map((b) => [b.time.numerator, b.key ?? null])).toEqual([[4, null], [3, 'D']]);
    expect(s.tracks[0].measures[0].beats.map((b) => b.lyric ?? null)).toEqual(['A-', 'maz-', 'ing', null]);
    expect(s.tracks[1]).toMatchObject({ id: 'bass', role: 'bass', tuning: BASS, capo: 0 });
    // A later track's section must match the first track's.
    expect(err(`track: A\n[One]\n| w 3:0 ||\ntrack: B\n[Two]\n| w 3:0 ||\n`)[0].message).toContain('has no "Two" section there');
    expect(err(`track: A\n| w 3:0 ||\nrole: bass\n`)[0].message).toContain('before the track\'s first music line');
    const empty = err('[Empty]\n[Next]\n| w 3:0 ||\n');
    expect(empty.length).toBeGreaterThan(0);
    for (const e of empty) expect([e.line, e.message.includes('no bars')]).toEqual([e.line === 3 ? 3 : 4, true]);
  });

  it('every bar adds up exactly, with the documented message', () => {
    expect(err('| q 3:0 3:0 3:0 | w 3:0 ||\n')[0].message).toBe('Bar 1 adds up to 2880 ticks but 4/4 needs 3840: a quarter is missing.');
  });
});


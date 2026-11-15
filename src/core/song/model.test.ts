import { describe, expect, it } from 'vitest';
import { arrangeLine, arrangeTrack, spellTrack } from './arranger';
import { AMAZING_GRACE, CAMPFIRE_GROOVE, ODE_TO_JOY, TECHNIQUE_SAMPLER } from './examples';
import { createSong, midiOf, restBeats, soundingPitch, splitTicks, valueFromTicks, valueTicks } from './model';
import { sixTab } from './sixtab-parse';
import { estimateDifficulty, songStats } from './stats';
import { TempoMap, flattenSong, playbackOrder } from './timeline';
import { extractBars, extractSection, practiceVariants, retuneSong, strumBeats, transposeKey, transposeSong, withStrumTrack } from './transform';
import type { Song } from './types';
import { isValidSong, validateSong } from './validate';

const header = 'title: T\ntempo: 120\n';

describe('durations', () => {
  it('converts written values and ticks', () => {
    expect(valueTicks({ base: 4 })).toBe(960);
    expect(valueTicks({ base: 4, dots: 1 })).toBe(1440);
    expect(valueTicks({ base: 8, tuplet: { actual: 3, normal: 2 } })).toBe(320);
    expect(valueFromTicks(320)).toEqual({ base: 8, tuplet: { actual: 3, normal: 2 } });
    expect(valueFromTicks(2880)).toEqual({ base: 2, dots: 1 });
    expect(valueFromTicks(1200)).toBeNull();
    expect(splitTicks(1200).map((p) => p.ticks)).toEqual([960, 240]);
    expect(restBeats(0, 2880).map((b) => [b.start, b.duration])).toEqual([[0, 2880]]);
  });

  it('knows sounding pitches of strings, harmonics and dead notes', () => {
    expect(midiOf(6, 0, [40, 45, 50, 55, 59, 64])).toBe(40);
    expect(midiOf(1, 3, [40, 45, 50, 55, 59, 64], 2)).toBe(69);
    expect(soundingPitch({ string: 3, fret: 7, midi: 62, harmonic: 'natural' })).toBe(74);
    expect(soundingPitch({ string: 3, fret: 12, midi: 67, harmonic: 'natural' })).toBe(67);
    expect(soundingPitch({ string: 3, fret: 0, midi: 55, dead: true })).toBeNull();
  });

  it('creates valid empty songs', () => {
    const s = createSong({ meta: { title: 'Blank Page' }, bars: 3, time: { numerator: 6, denominator: 8 }, bpm: 90 });
    expect(s.meta.id).toBe('blank-page');
    expect(validateSong(s)).toEqual([]);
    expect(s.tracks[0].measures[2].beats[0]).toMatchObject({ duration: 2880, value: { base: 2, dots: 1 } });
  });
});

describe('validation', () => {
  const base = () => sixTab(`${header}| q 3:0 3:2 2:0 2:1 | w 2:0 ||\n`);
  it('accepts a correct song and finds nothing', () => {
    expect(validateSong(base())).toEqual([]);
    expect(isValidSong(base())).toBe(true);
  });
  it('explains bars that are not full, gaps and overlaps', () => {
    const s = base();
    s.tracks[0].measures[0].beats.pop();
    const [e] = validateSong(s);
    expect(e).toMatchObject({ level: 'error', code: 'bar-length', bar: 0 });
    expect(e.message).toBe('Bar 1 of "Guitar" holds 2880 ticks but 4/4 needs 3840: a quarter is missing.');
    const g = base();
    g.tracks[0].measures[0].beats[1].start = 1000;
    expect(validateSong(g).map((i) => i.code)).toContain('beat-gap');
  });
  it('checks pitch against string, fret, tuning and capo', () => {
    const s = base();
    s.tracks[0].measures[0].beats[0].notes[0].midi = 57;
    const e = validateSong(s).find((i) => i.code === 'pitch-mismatch')!;
    expect(e.message).toContain('string 3 fret 0 sounds G3 (55), but the note says A3 (57)');
    const c = base();
    c.capo = 2;
    expect(validateSong(c).filter((i) => i.code === 'pitch-mismatch')).toHaveLength(5);
    const o = base();
    o.tracks[0].measures[1].beats[0].notes[0].tie = true;
    expect(validateSong(o).map((i) => i.code)).toContain('tie-fret');
  });
  it('checks ties, legato, strings and chord symbols', () => {
    const s = base();
    s.tracks[0].measures[1].beats[0].notes[0].tie = true;
    expect(validateSong(s).find((i) => i.code === 'tie-fret')!.message).toContain('string 2 is tied from fret 1 to fret 0');
    const orphan = sixTab(`${header}| w 1:0 ||\n`);
    orphan.tracks[0].measures[0].beats[0].notes[0].tie = true;
    expect(validateSong(orphan).map((i) => i.code)).toContain('tie-orphan');
    const t = base();
    t.tracks[0].measures[0].beats[0].notes.push({ string: 3, fret: 2, midi: 57 });
    expect(validateSong(t).map((i) => i.code)).toContain('note-duplicate-string');
    const u = base();
    u.chords.push({ bar: 0, tick: 0, symbol: 'Qmaj' });
    expect(validateSong(u).map((i) => i.code)).toContain('chord-symbol');
  });
});

describe('timeline', () => {
  it('unrolls repeats and first/second endings', () => {
    const song = sixTab(CAMPFIRE_GROOVE);
    expect(playbackOrder(song.bars).map((x) => x.bar)).toEqual([0, 1, 2, 3, 0, 1, 4, 5, 6, 7, 8, 9]);
    expect(playbackOrder(song.bars, { unroll: false }).map((x) => x.bar)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(playbackOrder([{ time: { numerator: 4, denominator: 4 } }, { time: { numerator: 4, denominator: 4 }, repeatEnd: 3 }]).map((x) => x.bar)).toEqual([0, 1, 0, 1, 0, 1]);
  });

  it('times beats through tempo changes', () => {
    const song = sixTab(CAMPFIRE_GROOVE);
    const tl = flattenSong(song);
    expect(tl.bars).toHaveLength(12);
    // 8 bars of 4/4 at 96 bpm = 20 s, then 4 bars at 104 bpm.
    expect(tl.bars[8].startSec).toBeCloseTo((8 * 4 * 60) / 96, 9);
    expect(tl.totalSeconds).toBeCloseTo((8 * 4 * 60) / 96 + (4 * 4 * 60) / 104, 9);
    expect(tl.tempo.bpmAt(tl.bars[8].start)).toBe(104);
    const bass = tl.trackBeats('bass');
    expect(bass[0]).toMatchObject({ tick: 0, sec: 0, notes: [{ midi: 31 }] });
    // Second pass of bar 1 (index 5) comes after the four bars of the first pass.
    expect(tl.bars[5]).toMatchObject({ bar: 1, pass: 2, start: 5 * 3840 });
    expect(tl.chords.map((c) => c.symbol).slice(0, 7)).toEqual(['G', 'Em', 'C', 'D', 'G', 'Em', 'C']);
    // The repeat plays the verse twice: two occurrences.
    expect(tl.sections.map((s) => [s.name, s.startIndex, s.endIndex])).toEqual([['Verse', 0, 4], ['Verse', 4, 8], ['Chorus', 8, 12]]);
  });

  it('looks up bars, beats and chords by tick and time', () => {
    const tl = flattenSong(sixTab(ODE_TO_JOY));
    const sec = tl.bars[3].startSec + 0.9 * 60 / 100; // inside the dotted quarter (1.5 beats)
    const beat = tl.beatAtTime('guitar', sec)!;
    expect(beat).toMatchObject({ bar: 3, beat: 0, duration: 1440 });
    expect(tl.barAtTime(sec).bar).toBe(3);
    expect(tl.chordAt(tl.bars[1].start + 10)!.symbol).toBe('G');
    expect(tl.locate(3 * 3840 + 1500)).toMatchObject({ bar: 3, tickInBar: 1500, beat: 1 });
    expect(tl.tickAt(tl.secondsAt(12345))).toBeCloseTo(12345, 6);
  });

  it('handles a tempo ramp with the closed form of the audio engine', () => {
    const map = new TempoMap([{ tick: 0, bpm: 60, ramp: true }, { tick: 960 * 4, bpm: 120 }]);
    // Integral of 60/bpm over a linear ramp from 60 to 120 across 4 beats: 4 * ln(2) seconds.
    expect(map.secondsAt(3840)).toBeCloseTo(4 * Math.log(2), 9);
    expect(map.bpmAt(1920)).toBe(90);
    expect(map.tickAt(map.secondsAt(1000))).toBeCloseTo(1000, 6);
    expect(map.secondsAt(3840 + 960) - map.secondsAt(3840)).toBeCloseTo(0.5, 9);
  });

  it('starts with the pickup and keeps 3/4 bars', () => {
    const tl = flattenSong(sixTab(AMAZING_GRACE));
    expect(tl.bars[0].length).toBe(960);
    expect(tl.bars[1].start).toBe(960);
    expect(tl.totalTicks).toBe(960 + 7 * 2880);
  });
});

describe('arranger', () => {
  it('lands a C major scale in open position', () => {
    const line = arrangeLine([48, 50, 52, 53, 55, 57, 59, 60]);
    expect(line.map((p) => `${p.string}:${p.fret}`)).toEqual(['5:3', '4:0', '4:2', '4:3', '3:0', '3:2', '2:0', '2:1']);
  });

  it('keeps a melody in one position when it lies there', () => {
    // A minor pentatonic up from A3 to C5: playable without moving at the 5th fret.
    const line = arrangeLine([57, 60, 62, 64, 67, 69, 72, 69, 67, 64]);
    const frets = line.filter((p) => p.fret > 0).map((p) => p.fret);
    expect(Math.max(...frets) - Math.min(...frets)).toBeLessThanOrEqual(4);
    expect(line.every((p) => p.fret >= 4 && p.fret <= 9)).toBe(true);
  });

  it('respects a preferred position, capo and tuning', () => {
    const hi = arrangeLine([64, 65, 67], { preferPosition: 12 });
    expect(hi.every((p) => p.fret >= 9)).toBe(true);
    const capo = arrangeLine([50, 52], { capo: 2 });
    expect(capo.map((p) => `${p.string}:${p.fret}`)).toEqual(['5:3', '4:0']);
    const dropD = arrangeLine([38, 40], { tuning: [38, 45, 50, 55, 59, 64] });
    expect(dropD[0]).toEqual({ string: 6, fret: 0, midi: 38 });
  });

  it('places chords as holdable shapes and keeps legato on one string', () => {
    const song = sixTab(`${header}| q (5:3 4:2 3:0 2:1 1:0) e 3:5 3:7h q 3:9s 1:0 |\n`);
    for (const b of song.tracks[0].measures[0].beats) for (const n of b.notes) n.string = 1;
    const r = arrangeTrack(song, 0);
    const beats = r.track.measures[0].beats;
    expect(beats[0].notes.map((n) => n.midi).sort()).toEqual([48, 52, 55, 60, 64].sort());
    expect(new Set(beats[0].notes.map((n) => n.string)).size).toBe(5);
    expect(beats[2].notes[0].string).toBe(beats[1].notes[0].string);
    expect(beats[2].notes[0].legato).toBe('hammer');
    expect(beats[3].notes[0].string).toBe(beats[2].notes[0].string);
    expect(beats[3].notes[0].slide).toBe('up');
    const s2: Song = { ...song, tracks: [r.track] };
    expect(validateSong(s2).filter((i) => i.level === 'error')).toEqual([]);
  });

  it('moves music outside the guitar range by octaves and says so', () => {
    const song = sixTab(`${header}| q 1:0 1:1 1:3 1:5 ||\n`);
    for (const b of song.tracks[0].measures[0].beats) for (const n of b.notes) n.midi += 36;
    const r = arrangeTrack(song, 0);
    expect(r.octaveShift).toBe(-2);
    expect(r.warnings[0]).toContain('moved 2 octaves down');
    expect(r.track.measures[0].beats.map((b) => b.notes[0].midi)).toEqual([76, 77, 79, 81]);
  });

  it('spells pitches in the key for notation, written an octave up', () => {
    const song = sixTab(`title: T\ntempo: 90\nkey: F\n| q 3:3 2:1 1:1 1:3 |\n`);
    const spelled = spellTrack(song);
    expect(spelled.map((b) => b.notes[0].name)).toEqual(['Bb3', 'C4', 'F4', 'G4']);
    expect(spelled[0].notes[0].written).toBe('Bb4');
  });
});

describe('transformations', () => {
  it('transposes notes, chords and key', () => {
    const song = sixTab(ODE_TO_JOY);
    const { song: up } = transposeSong(song, 2);
    expect(up.key).toBe('D');
    expect(up.chords.slice(0, 2).map((c) => c.symbol)).toEqual(['D', 'A']);
    expect(up.tracks[0].measures[0].beats[0].notes[0]).toMatchObject({ string: 1, fret: 2, midi: 66 });
    expect(isValidSong(up)).toBe(true);
    const { song: down } = transposeSong(song, -3);
    expect(down.key).toBe('A');
    expect(down.tracks[0].measures[0].beats[0].notes[0].midi).toBe(61);
    expect(isValidSong(down)).toBe(true);
    expect(transposeKey('E minor', 1)).toBe('Fm');
    expect(transposeKey('C', 6)).toBe('F#');
    expect(transposeKey('C', -1)).toBe('B');
  });

  it('changes capo and tuning keeping the pitch (re-fingering)', () => {
    const song = sixTab(AMAZING_GRACE);
    const { song: capo2 } = retuneSong(song, { capo: 2 });
    expect(isValidSong(capo2)).toBe(true);
    const pitches = (s: Song) => s.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => b.notes.map((n) => n.midi)));
    expect(pitches(capo2)).toEqual(pitches(song));
    expect(capo2.capo).toBe(2);
    const { song: dropD } = retuneSong(song, { tuning: [38, 45, 50, 55, 59, 64] });
    expect(pitches(dropD)).toEqual(pitches(song));
    expect(isValidSong(dropD)).toBe(true);
  });

  it('changes capo keeping the shapes (the music moves up)', () => {
    const song = sixTab(ODE_TO_JOY);
    const { song: s } = retuneSong(song, { capo: 3, keep: 'shapes' });
    expect(s.tracks[0].measures[0].beats[0].notes[0]).toMatchObject({ fret: 0, midi: 67 });
    expect(s.chords[0].symbol).toBe('D#');
    expect(isValidSong(s)).toBe(true);
  });

  it('cuts out bars and sections as exercises', () => {
    const song = sixTab(CAMPFIRE_GROOVE);
    const chorus = extractSection(song, 'chorus')!;
    expect(chorus.bars).toHaveLength(4);
    expect(chorus.tempo).toEqual([{ bar: 0, bpm: 104 }]);
    expect(chorus.chords[0]).toMatchObject({ bar: 0, tick: 0, symbol: 'C' });
    expect(chorus.meta.id).toBe('campfire-groove-chorus');
    expect(isValidSong(chorus)).toBe(true);
    const bars = extractBars(song, 1, 3, { repeat: 4 });
    expect(bars.bars[0].repeatStart).toBe(true);
    expect(bars.bars[1].repeatEnd).toBe(4);
    expect(bars.chords[0]).toMatchObject({ bar: 0, symbol: 'Em' });
    expect(flattenSong(bars).bars).toHaveLength(8);
    expect(isValidSong(bars)).toBe(true);
  });

  it('drops ties that start before an excerpt', () => {
    const song = sixTab(TECHNIQUE_SAMPLER);
    const ex = extractBars(song, 4, 5);
    expect(ex.tracks[0].measures[0].beats[1].notes[0].tie).toBe(true);
    const ex2 = sixTab(`${header}| w 3:5 | w 3:- ||\n`);
    const cut = extractBars(ex2, 1, 2);
    expect(cut.tracks[0].measures[0].beats[0].notes[0].tie).toBeUndefined();
    expect(isValidSong(cut)).toBe(true);
  });

  it('builds strum bars from a pattern and a strum track from the sections', () => {
    const bar = strumBeats({ numerator: 4, denominator: 4 }, 'D-DU-UDU');
    expect(bar.map((b) => (b.slash ? (b.stroke === 'up' ? 'U' : 'D') : 'r') + b.duration)).toEqual(['D480', 'r480', 'D480', 'U480', 'r480', 'U480', 'D480', 'U480']);
    expect(strumBeats({ numerator: 6, denominator: 8 }).map((b) => b.duration)).toEqual([1440, 1440]);
    expect(strumBeats({ numerator: 4, denominator: 4 }, 'D--U').map((b) => b.duration)).toEqual([960, 1920, 960]);
    const song = withStrumTrack(sixTab(AMAZING_GRACE), { pattern: 'D-DU-U' });
    const strum = song.tracks.find((t) => t.name === 'Strumming')!;
    expect(strum.role).toBe('rhythm');
    expect(strum.measures[0].beats.every((b) => !b.slash)).toBe(true);
    expect(strum.measures[1].beats.filter((b) => b.slash)).toHaveLength(4);
    expect(isValidSong(song)).toBe(true);
    expect(withStrumTrack(song).tracks.filter((t) => t.name === 'Strumming')).toHaveLength(1);
  });

  it('makes slower practice versions', () => {
    const v = practiceVariants(sixTab(ODE_TO_JOY));
    expect(v.map((x) => x.bpm)).toEqual([50, 70, 85, 100]);
  });
});

describe('statistics and difficulty', () => {
  it('counts notes, range, techniques and positions', () => {
    const st = songStats(sixTab(TECHNIQUE_SAMPLER));
    const t = st.tracks[0];
    expect(t.techniques['hammer-on']).toBe(2);
    expect(t.techniques['pull-off']).toBe(2);
    expect(t.techniques.bend).toBe(3);
    expect(t.techniques['pre-bend']).toBe(1);
    expect(t.techniques.tapping).toBe(1);
    expect(t.tuplets).toBe(true);
    const ode = songStats(sixTab(ODE_TO_JOY)).tracks[0];
    expect(ode.noteCount).toBe(30);
    expect(ode.range).toMatchObject({ low: 60, high: 67, lowName: 'C4', highName: 'G4' });
    expect(ode.frets).toEqual({ min: 0, max: 3 });
    expect(ode.shifts).toBe(0);
    expect(ode.strings).toEqual([1, 2]);
  });

  it('rates easy songs low and hard ones high', () => {
    const ode = estimateDifficulty(sixTab(ODE_TO_JOY));
    const grace = estimateDifficulty(sixTab(AMAZING_GRACE));
    const band = estimateDifficulty(sixTab(CAMPFIRE_GROOVE));
    const sampler = estimateDifficulty(sixTab(TECHNIQUE_SAMPLER));
    expect(ode.level).toBeLessThanOrEqual(2);
    expect(ode.band).toBe('beginner');
    expect(grace.level).toBeLessThanOrEqual(2);
    expect(band.level).toBeGreaterThanOrEqual(2);
    expect(band.level).toBeLessThanOrEqual(4);
    expect(sampler.level).toBeGreaterThanOrEqual(6);
    expect(sampler.reasons.length).toBeGreaterThan(0);
    const shred = sixTab(`title: Shred\ntempo: 160\n| s 1:12 1:15h 1:12p 2:15 2:13p 2:12p 3:14 3:12p 4:14 4:12p 5:15 5:14p 6:15 6:12p 6:15h 5:12 |\n`);
    const hard = estimateDifficulty(shred);
    expect(hard.level).toBeGreaterThanOrEqual(8);
    expect(hard.band).toBe('expert');
    expect(estimateDifficulty(shred, { tempoPercent: 40 }).level).toBeLessThan(hard.level);
  });
});

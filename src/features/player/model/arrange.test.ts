import { describe, expect, it } from 'vitest';
import { sixTab, type Song } from '@/core/song';
import { arrangeForPlayer, arrangementWords, isAsWritten, keyName } from './arrange';

// A strum part over a tune, plus a bass with its own tuning: the shapes of G, C and D7.
const SONG = sixTab(`title: Test
tempo: 90
time: 4/4
key: G

track: Your strum
role: rhythm
| "G=320003" q D D D D | "C=x32010" D D D D | "D7=xx0212" D D D D | "G=320003" w D ||

track: Tune
role: lead
| q 3:0 3:2 2:0 2:1 | 2:0 2:1 h 2:3 | q 2:3 2:1 2:0 3:2 | w 3:0 ||

track: Bass
role: bass
tuning: bass
| w 3:3 | 2:3 | 3:5 | 3:3 ||
`);

const notes = (s: Song, track: number) => s.tracks[track].measures.flatMap((m) => m.beats.flatMap((b) => b.notes.map((n) => ({ string: n.string, fret: n.fret, midi: n.midi }))));

describe('arrangeForPlayer', () => {
  it('leaves the song alone as written', () => {
    expect(arrangeForPlayer(SONG, { transpose: 0, capo: null }).song).toBe(SONG);
    expect(arrangeForPlayer(SONG, { transpose: 0, capo: 0 }).song).toBe(SONG);
    expect(isAsWritten(SONG, { transpose: 0, capo: 0 })).toBe(true);
    expect(isAsWritten(SONG, { transpose: 0, capo: 2 })).toBe(false);
  });

  it('follows a capo: the same shapes, everything two semitones higher, the bass too', () => {
    const r = arrangeForPlayer(SONG, { transpose: 0, capo: 2 });
    expect(r).toMatchObject({ sounding: 2, capo: 2 });
    expect(r.song.capo).toBe(2);
    expect(r.song.key).toBe('A');
    // The tune keeps its frets, two semitones up.
    expect(notes(r.song, 1).map((n) => `${n.string}:${n.fret}`)).toEqual(notes(SONG, 1).map((n) => `${n.string}:${n.fret}`));
    expect(notes(r.song, 1).map((n) => n.midi)).toEqual(notes(SONG, 1).map((n) => n.midi + 2));
    // Chords name what sounds (A, D, E7) and keep their shapes (frets behind the capo).
    expect(r.song.chords.map((c) => c.symbol)).toEqual(['A', 'D', 'E7', 'A']);
    expect(r.song.chords[0].voicing).toEqual(SONG.chords[0].voicing);
    // The bass, with its own tuning, moves with the music.
    expect(notes(r.song, 2).map((n) => n.midi)).toEqual(notes(SONG, 2).map((n) => n.midi + 2));
    // The written song is untouched.
    expect(SONG.capo).toBe(0);
    expect(SONG.key).toBe('G');
  });

  it('transposes for singing: every part moves, the tab changes to match', () => {
    const r = arrangeForPlayer(SONG, { transpose: -2, capo: null });
    expect(r).toMatchObject({ sounding: -2, capo: 0 });
    expect(r.song.key).toBe('F');
    expect(r.song.chords.map((c) => c.symbol)).toEqual(['F', 'Bb', 'C7', 'F']);
    expect(notes(r.song, 1).map((n) => n.midi)).toEqual(notes(SONG, 1).map((n) => n.midi - 2));
    expect(notes(r.song, 2).map((n) => n.midi)).toEqual(notes(SONG, 2).map((n) => n.midi - 2));
  });

  it('combines both: capo 2 and one semitone up sounds three semitones higher', () => {
    const r = arrangeForPlayer(SONG, { transpose: 1, capo: 2 });
    expect(r).toMatchObject({ sounding: 3, capo: 2 });
    expect(r.song.key).toBe('Bb');
    expect(notes(r.song, 1).map((n) => n.midi)).toEqual(notes(SONG, 1).map((n) => n.midi + 3));
    // Frets count from the capo: every tune note is one fret above its written fret.
    expect(notes(r.song, 1).map((n) => n.fret)).toEqual(notes(SONG, 1).map((n) => n.fret + 1));
  });

  it('takes a written capo off: the shapes stay, the music goes down', () => {
    const capoed = { ...SONG, capo: 3, key: 'Bb', tracks: SONG.tracks } as Song;
    const r = arrangeForPlayer(capoed, { transpose: 0, capo: 0 });
    expect(r).toMatchObject({ sounding: -3, capo: 0 });
    expect(r.song.capo).toBe(0);
  });
});

describe('arrangementWords', () => {
  it('says what sounds and which shapes are played', () => {
    expect(arrangementWords({ key: 'G', capo: 0 }, { transpose: 0, capo: 2 })).toMatchObject({ sounds: 'A major', shapes: 'G major', shift: '+2', line: 'Sounds in A major. You play G major shapes with a capo on fret 2.' });
    expect(arrangementWords({ key: 'G', capo: 0 }, { transpose: -2, capo: null })).toMatchObject({ sounds: 'F major', shift: '−2', line: 'Sounds in F major, no capo.' });
    expect(arrangementWords({ key: 'Em', capo: 0 }, { transpose: 0, capo: 0 })).toMatchObject({ sounds: 'E minor', shift: '', line: 'Sounds in E minor, no capo.' });
    expect(arrangementWords({ key: 'E dorian', capo: 0 }, { transpose: 2, capo: null }).sounds).toBe('F♯ Dorian');
    expect(arrangementWords({ capo: 0 }, { transpose: 3, capo: null }).line).toBe('Sounds 3 semitones higher than written.');
  });
});

describe('keyName', () => {
  it('names major, minor and modal keys, never "E Dorian major"', () => {
    expect(keyName('G')).toBe('G major');
    expect(keyName('F#m')).toBe('F♯ minor');
    expect(keyName('E Dorian')).toBe('E Dorian');
    expect(keyName('A dorian')).toBe('A Dorian');
    expect(keyName('Bb minor')).toBe('B♭ minor');
    expect(keyName('')).toBeNull();
  });
});

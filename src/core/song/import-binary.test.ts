import { describe, expect, it } from 'vitest';
import { detectFormat, importSong } from './import-any';
import { importGuitarPro } from './import-gp';
import { importMidi, listMidiTracks } from './import-midi';
import type { Song } from './types';
import { validateSong } from './validate';

const errors = (s: Song) => validateSong(s).filter((i) => i.level === 'error');

/** Ode to Joy written for a flute two octaves above the guitar's open E, a bass line and drums, slightly off the grid. */
async function odeMidi(): Promise<Uint8Array> {
  const { Midi } = await import('@tonejs/midi');
  const midi = new Midi();
  midi.header.name = 'Ode to Joy (MIDI)';
  midi.header.setTempo(100);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
  midi.header.keySignatures.push({ ticks: 0, key: 'C', scale: 'major' });
  midi.header.update();
  const ppq = midi.header.ppq;
  const melody = midi.addTrack();
  melody.name = 'Flute';
  melody.instrument.number = 73;
  // E E F G | G F E D | C C D E | E. D D   (+24 above the sounding guitar melody)
  const pitches = [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62].map((p) => p + 24);
  const beats = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5, 0.5, 2];
  let at = 0;
  pitches.forEach((midiNote, i) => {
    const jitter = ((i * 7) % 5) - 2; // a few ticks early or late, as a played file would be
    melody.addNote({ midi: midiNote, ticks: Math.max(0, Math.round(at * ppq) + jitter * 3), durationTicks: Math.round(beats[i] * ppq * 0.9), velocity: 0.8 });
    at += beats[i];
  });
  const bass = midi.addTrack();
  bass.name = 'Bass';
  bass.instrument.number = 33;
  [36, 43, 36, 43].forEach((n, i) => bass.addNote({ midi: n, ticks: i * 4 * ppq, durationTicks: 4 * ppq, velocity: 0.7 }));
  const drums = midi.addTrack();
  drums.channel = 9;
  for (let i = 0; i < 16; i++) drums.addNote({ midi: 42, ticks: i * ppq, durationTicks: ppq / 4, velocity: 0.5 });
  const bytes = midi.toArray();
  // @tonejs/midi's writer offsets the key by 7 twice; set the key-signature meta event (FF 59 02 sf mi) to C major
  // the way any other MIDI writer would, so the reader is tested on a correct file.
  for (let i = 0; i + 4 < bytes.length; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0x59 && bytes[i + 2] === 0x02) {
      bytes[i + 3] = 0;
      bytes[i + 4] = 0;
    }
  }
  return bytes;
}

describe('MIDI importer', () => {
  it('lists tracks and rates them', async () => {
    const tracks = await listMidiTracks(await odeMidi());
    expect(tracks.map((t) => [t.name, t.notes, t.percussion])).toEqual([['Flute', 15, false], ['Bass', 4, false], ['Track 3', 16, true]]);
    expect(tracks[2].score).toBe(0);
    expect(tracks[0].score).toBeGreaterThan(tracks[1].score);
  });

  it('picks the melody, quantises, moves it into the guitar range and arranges it', async () => {
    const r = await importMidi(await odeMidi());
    const s = r.song;
    expect(errors(s)).toEqual([]);
    expect(s.meta.title).toBe('Ode to Joy (MIDI)');
    expect(s.key).toBe('C');
    expect(s.tempo).toEqual([{ bar: 0, bpm: 100 }]);
    expect(s.bars).toHaveLength(4);
    expect(r.warnings.some((w) => w.message.includes('chosen as the guitar part'))).toBe(true);
    expect(r.warnings.some((w) => w.message.includes('octave'))).toBe(true);
    const notes = s.tracks[0].measures.flatMap((m) => m.beats.filter((b) => b.notes.length));
    expect(notes.map((b) => b.notes[0].midi)).toEqual([76, 76, 77, 79, 79, 77, 76, 74, 72, 72, 74, 76, 76, 74, 74]);
    expect(s.tracks[0].measures[3].beats.filter((b) => b.notes.length).map((b) => b.start)).toEqual([0, 1440, 1920]);
    // Every note was given a string and fret that sound its pitch (validation checks pitch against tuning).
    expect(notes.every((b) => b.notes[0].string >= 1 && b.notes[0].string <= 6)).toBe(true);
  });

  it('imports a chosen track (a bass) with bass tuning', async () => {
    const r = await importMidi(await odeMidi(), { track: 1 });
    expect(r.song.tracks[0].role).toBe('bass');
    expect(r.song.tracks[0].tuning).toEqual([28, 33, 38, 43]);
    expect(errors(r.song)).toEqual([]);
    expect(r.song.tracks[0].measures[0].beats[0].notes[0].midi).toBe(36);
  });

  it('is found by the sniffer', async () => {
    const bytes = await odeMidi();
    expect(await detectFormat(bytes)).toBe('midi');
    expect((await importSong(bytes)).format).toBe('midi');
  });
});

/** A Guitar Pro 7 file made with alphaTab itself: alphaTex in, the GP exporter out. */
async function riversideWaltz(): Promise<Uint8Array> {
  const at = await import('@coderline/alphatab/core');
  const tex = String.raw`\title "Riverside Waltz" \artist "Sixstring Academy" \music "Sixstring Academy" \tempo 90
.
\track "Lead Guitar" \tuning (E4 B3 G3 D3 A2 D2) \capo 2 \lyrics "Down by the ri- ver side"
\ts (3 4) \section "Verse" \chord ("Dm" 1 3 2 0 x x) 0.4.4 {ch "Dm"} 3.3{h}.4 5.3.4 | \ro 7.3{b (0 4)}.4 5.2{sl}.4 7.2.4 | 0.6{pm}.4 x.5.4 12.1{nh}.4 | \ae (1) \rc 2 5.1{v}.2 5.1{st}.4 | \ae (2) 3.2.2{d} | -.2.2{d} |`;
  const score = at.importer.ScoreLoader.loadAlphaTex(tex);
  return new at.exporter.Gp7Exporter().export(score, new at.Settings());
}

describe('Guitar Pro importer (through alphaTab)', () => {
  it('reads a .gp file written by alphaTab', async () => {
    const bytes = await riversideWaltz();
    expect(await detectFormat(bytes, 'riverside.gp')).toBe('guitar-pro');
    const r = await importGuitarPro(bytes);
    const s = r.song;
    expect(errors(s)).toEqual([]);
    expect(s.meta).toMatchObject({ title: 'Riverside Waltz', artist: 'Sixstring Academy', composer: 'Sixstring Academy' });
    expect(s.tuning).toEqual([38, 45, 50, 55, 59, 64]);
    expect(s.capo).toBe(2);
    expect(s.tempo).toEqual([{ bar: 0, bpm: 90 }]);
    expect(s.bars).toHaveLength(6);
    expect(s.bars[0].time).toEqual({ numerator: 3, denominator: 4 });
    expect(s.bars[1].repeatStart).toBe(true);
    expect(s.bars[3]).toMatchObject({ repeatEnd: 2, ending: [1] });
    expect(s.bars[4].ending).toEqual([2]);
    expect(s.sections[0]).toMatchObject({ name: 'Verse', start: 0 });
    // The Dm diagram is a shape behind capo 2: it sounds Em.
    expect(s.chords[0]).toEqual({ bar: 0, tick: 0, symbol: 'Em', voicing: [null, null, 0, 2, 3, 1] });
    expect(r.warnings.some((w) => w.message.includes('capo shapes'))).toBe(true);
    const beats = s.tracks[0].measures.flatMap((m) => m.beats);
    expect(beats[0].notes[0]).toMatchObject({ string: 4, fret: 0, midi: 52 });
    expect(beats[1].notes[0]).toMatchObject({ string: 3, fret: 3, midi: 60 });
    expect(beats[2].notes[0]).toMatchObject({ fret: 5, legato: 'hammer' });
    expect(beats[3].notes[0].bend).toEqual({ amount: 2 });
    expect(beats[5].notes[0]).toMatchObject({ string: 2, fret: 7, slide: 'up' });
    expect(beats[6].notes[0]).toMatchObject({ string: 6, palmMute: true });
    expect(beats[7].notes[0]).toMatchObject({ string: 5, dead: true });
    expect(beats[8].notes[0]).toMatchObject({ string: 1, fret: 12, harmonic: 'natural' });
    expect(beats[9].notes[0].vibrato).toBe(true);
    expect(beats[10].notes[0].staccato).toBe(true);
    expect(beats[11]).toMatchObject({ duration: 2880 });
    expect(beats[12].notes[0]).toMatchObject({ tie: true, string: 2, fret: 3 });
    expect(beats.map((b) => b.lyric).filter(Boolean)).toEqual(['Down', 'by', 'the', 'ri-', 'ver', 'side']);
  });

  it('refuses bytes that are not a Guitar Pro file', async () => {
    await expect(importGuitarPro(new Uint8Array([1, 2, 3, 4, 5]))).rejects.toThrow(RangeError);
  });
});

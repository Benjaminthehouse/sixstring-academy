import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AMAZING_GRACE, CAMPFIRE_GROOVE, ODE_TO_JOY, TECHNIQUE_SAMPLER } from './examples';
import { toMusicXml } from './export-musicxml';
import { songFromJson, songToJson, toAsciiTab } from './export-text';
import { detectFormat, detectTextFormat, importSong } from './import-any';
import { isSongImportError, type SongImportError } from './import-error';
import { importAsciiTab } from './import-ascii';
import { importChordPro, importChordSheet } from './import-chords';
import { importMusicXml, importMxl } from './import-musicxml';
import { sixTab } from './sixtab-parse';
import type { Song } from './types';
import { validateSong } from './validate';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const errors = (s: Song) => validateSong(s).filter((i) => i.level === 'error');
const melody = (s: Song, t = 0) => s.tracks[t].measures.flatMap((m) => m.beats.filter((b) => b.notes.length && !b.notes.every((n) => n.tie)).map((b) => b.notes.map((n) => n.midi).sort((a, b) => a - b).join('+')));
const rhythm = (s: Song, t = 0) => s.tracks[t].measures.map((m) => m.beats.map((b) => b.duration));

describe('ASCII tab importer', () => {
  it('reads Greensleeves: hints, systems, rhythm from spacing, chords, lyrics, repeat', () => {
    const r = importAsciiTab(fixture('greensleeves.tab.txt'));
    const s = r.song;
    expect(errors(s)).toEqual([]);
    expect(r.estimatedRhythm).toBe(true);
    expect(r.warnings[0].message).toContain('estimated');
    expect(s.meta.title).toBe('Greensleeves');
    expect(s.tempo[0].bpm).toBe(96);
    expect(s.bars).toHaveLength(8);
    expect(s.bars[0].time).toEqual({ numerator: 3, denominator: 4 });
    // C D | E F E | D B | G A B | C A | A G# A | B G# | E   (sounding pitch)
    expect(melody(s)).toEqual(['60', '62', '64', '65', '64', '62', '59', '55', '57', '59', '60', '57', '57', '56', '57', '59', '56', '52']);
    expect(rhythm(s)).toEqual([[1920, 960], [1440, 480, 960], [1920, 960], [1440, 480, 960], [1920, 960], [1440, 480, 960], [1920, 960], [2880]]);
    expect(s.chords.map((c) => `${c.bar}:${c.tick}:${c.symbol}`)).toEqual(['0:0:Am', '1:0:C', '2:0:G', '3:0:Em', '4:0:Am', '6:0:E', '7:0:Am']);
    const lyrics = s.tracks[0].measures.flatMap((m) => m.beats.map((b) => b.lyric).filter(Boolean));
    expect(lyrics).toEqual(['las,', 'my', 'love,', 'you', 'do', 'me', 'wrong,', 'to', 'cast', 'me']);
    expect(s.bars[4].repeatStart).toBe(true);
    expect(s.bars[7].repeatEnd).toBe(2);
  });

  it('reads techniques, two-digit frets, palm mutes and a drop D tuning from string names', () => {
    const r = importAsciiTab(fixture('drop-d-riff.tab.txt'));
    const s = r.song;
    expect(errors(s)).toEqual([]);
    expect(s.tuning).toEqual([38, 45, 50, 55, 59, 64]);
    expect(r.warnings.some((w) => w.message.includes('string names'))).toBe(true);
    const beats = s.tracks[0].measures[0].beats.filter((b) => b.notes.length);
    expect(beats[0].notes.map((n) => `${n.string}:${n.fret}`)).toEqual(['6:0', '5:0', '3:5']);
    expect(beats[0].notes.every((n) => n.palmMute)).toBe(true);
    expect(beats[1].notes[0]).toMatchObject({ string: 3, fret: 7, legato: 'hammer' });
    expect(beats[3].notes[0]).toMatchObject({ fret: 5, legato: 'pull' });
    expect(beats[5].notes[0]).toMatchObject({ fret: 7, slide: 'up' });
    expect(beats[6].notes[0]).toMatchObject({ string: 4, fret: 7, bend: { amount: 2, release: true } });
    const bar2 = s.tracks[0].measures[1].beats.filter((b) => b.notes.length).map((b) => b.notes.map((n) => `${n.string}:${n.dead ? 'x' : n.fret}`).join());
    expect(bar2).toEqual(['1:12', '1:10', '2:13', '2:12', '2:10', '3:x']);
    expect(s.tempo[0].bpm).toBe(120);
  });

  it('reads back what the ASCII exporter writes, with the same rhythm', () => {
    for (const text of [ODE_TO_JOY, AMAZING_GRACE]) {
      const song = sixTab(text);
      const ascii = toAsciiTab(song);
      const back = importAsciiTab(ascii).song;
      expect(errors(back)).toEqual([]);
      expect(melody(back)).toEqual(melody(song));
      expect(back.tuning).toEqual(song.tuning);
      expect(back.chords.map((c) => c.symbol)).toEqual(song.chords.map((c) => c.symbol));
    }
    const ode = sixTab(ODE_TO_JOY);
    expect(rhythm(importAsciiTab(toAsciiTab(ode)).song)).toEqual(rhythm(ode));
  });

  it('writes the ASCII exporter standard way: high e on top, chord names, technique signs', () => {
    const text = toAsciiTab(sixTab(TECHNIQUE_SAMPLER), { width: 100 });
    const lines = text.split('\n');
    expect(lines).toContain('Tuning: E A D G B E');
    const tabLines = lines.filter((l) => /^[eBGDAE]\|/.test(l));
    expect(tabLines[0].startsWith('e|')).toBe(true);
    expect(tabLines[5].startsWith('E|')).toBe(true);
    // Notes are spaced by their length, so a hammer-on reads "5--h7" rather than "5h7".
    expect(text).toMatch(/5-+h7/);
    expect(text).toContain('7b9r7');
    expect(text).toContain('<12>');
    const back = importAsciiTab(text).song;
    expect(errors(back)).toEqual([]);
    const notes = back.tracks[0].measures[0].beats.flatMap((b) => b.notes);
    expect(notes.map((n) => n.legato).filter(Boolean)).toEqual(['hammer', 'pull']);
    expect(notes.find((n) => n.bend)!.bend).toEqual({ amount: 2, release: true });
  });

  it('repeats a bar marked with %', () => {
    const text = ['e|-0---1---3---0---|-------%--------|', 'B|-----------------|----------------|', 'G|-----------------|----------------|', 'D|-----------------|----------------|', 'A|-----------------|----------------|', 'E|-----------------|----------------|'].join('\n');
    const s = importAsciiTab(text).song;
    expect(errors(s)).toEqual([]);
    expect(melody(s)).toEqual(['64', '65', '67', '64', '64', '65', '67', '64']);
  });

  it('gives an empty song and a clear warning for text without tab', () => {
    const r = importAsciiTab('just some words\nand more words');
    expect(r.confidence).toBe(0);
    expect(r.warnings[0].message).toContain('No tab lines');
  });
});

describe('chord sheet importers', () => {
  it('reads ChordPro: directives, sections, inline chords, lyrics, chorus reuse', () => {
    const r = importChordPro(fixture('amazing-grace.cho'));
    const s = r.song;
    expect(errors(s)).toEqual([]);
    expect(s.meta).toMatchObject({ title: 'Amazing Grace', artist: 'Traditional' });
    expect(s.key).toBe('G');
    expect(s.bars[0].time).toEqual({ numerator: 3, denominator: 4 });
    expect(s.tempo[0].bpm).toBe(80);
    expect(s.tracks[0]).toMatchObject({ role: 'rhythm' });
    expect(s.sections.map((x) => x.name)).toEqual(['Verse 1', 'Chorus', 'Verse 2', 'Chorus']);
    expect(s.chords.slice(0, 4).map((c) => c.symbol)).toEqual(['G', 'G7', 'C', 'G']);
    const beats = s.tracks[0].measures.flatMap((m) => m.beats);
    expect(beats.every((b) => b.slash || !b.notes.length)).toBe(true);
    expect(beats.find((b) => b.lyric)!.lyric).toBe('Amazing grace, how');
    expect(r.estimatedRhythm).toBe(true);
  });

  it('reads chords over lyrics: heading, capo (stored as sounding chords), sections, bar lines and x2', () => {
    const r = importChordSheet(fixture('oh-susanna.txt'));
    const s = r.song;
    expect(errors(s)).toEqual([]);
    expect(s.meta).toMatchObject({ title: 'Oh! Susanna', artist: 'Stephen Foster, 1848' });
    expect(s.capo).toBe(2);
    // The sheet says C G (shapes behind capo 2); what sounds is D A.
    expect(s.chords.slice(0, 3).map((c) => c.symbol)).toEqual(['D', 'A', 'D']);
    expect(r.warnings.some((w) => w.message.includes('shape C = D'))).toBe(true);
    expect(s.sections.map((x) => x.name)).toEqual(['Verse 1', 'Chorus', 'Outro']);
    const outro = s.sections[2];
    expect(outro.end - outro.start).toBe(3);
    expect(s.bars[outro.start].repeatStart).toBe(true);
    expect(s.bars[outro.end - 1].repeatEnd).toBe(2);
    const lyric = s.tracks[0].measures.flatMap((m) => m.beats).map((b) => b.lyric).filter(Boolean);
    expect(lyric[0]).toBe('I come from Alabama with my banjo on my');
    expect(lyric[1]).toBe('knee,');
  });
});

describe('MusicXML importer', () => {
  it('reads a guitar part written as notation + TAB, and arranges a part without tab', () => {
    const r = importMusicXml(fixture('greensleeves.musicxml'));
    const s = r.song;
    expect(errors(s)).toEqual([]);
    expect(s.meta).toMatchObject({ title: 'Greensleeves', composer: 'Traditional', licence: 'Public domain' });
    expect(s.key).toBe('Am');
    expect(s.tempo).toEqual([{ bar: 0, bpm: 92 }]);
    expect(s.bars[0]).toMatchObject({ length: 960 });
    expect(s.bars[2].repeatStart).toBe(true);
    expect(s.bars[3]).toMatchObject({ repeatEnd: 2, ending: [1] });
    expect(s.bars[4].ending).toEqual([2]);
    expect(s.tracks.map((t) => t.name)).toEqual(['Classical Guitar', 'Flute']);
    const g = s.tracks[0];
    // The duplicated TAB notes collapse into one, with string and fret from the tab.
    expect(g.measures[1].beats.map((b) => b.notes.map((n) => `${n.string}:${n.fret}`).join())).toEqual(['2:1', '2:3']);
    expect(g.measures[2].beats.map((b) => b.duration)).toEqual([1440, 480, 960]);
    expect(g.measures[2].beats[1].notes[0]).toMatchObject({ fret: 1, legato: 'hammer' });
    expect(g.measures[3].beats[0].notes[0].vibrato).toBe(true);
    expect(g.measures[4].beats.slice(0, 3).map((b) => b.duration)).toEqual([320, 320, 320]);
    expect(g.measures[4].beats[0].value).toEqual({ base: 8, tuplet: { actual: 3, normal: 2 } });
    expect(g.measures[5].beats[0].notes[0]).toMatchObject({ tie: true, string: 2, fret: 1 });
    expect(g.measures[5].beats[1].notes[0].staccato).toBe(true);
    expect(g.measures.flatMap((m) => m.beats.map((b) => b.lyric)).filter(Boolean)).toEqual(['A-', 'las', 'my', 'love', 'you', 'do', 'me', 'wrong']);
    expect(s.chords.map((c) => c.symbol)).toEqual(['Am', 'C', 'G7', 'Em', 'Am7']);
    expect(s.annotations).toEqual([{ bar: 2, tick: 0, text: 'gently' }]);
    // The flute sounds an octave above the guitar; the arranger fits it on the neck and says what it did.
    const f = s.tracks[1];
    expect(r.warnings.some((w) => w.message.includes('"Flute" had no tab'))).toBe(true);
    expect(r.warnings.some((w) => w.message.includes('moved 1 octave down'))).toBe(true);
    expect(f.measures[1].beats[0].notes[0].midi).toBe(72);
    expect(f.measures[4].beats[0].notes).toEqual([]);
  });

  it('round-trips the examples through MusicXML export', () => {
    for (const text of [ODE_TO_JOY, AMAZING_GRACE, TECHNIQUE_SAMPLER, CAMPFIRE_GROOVE]) {
      const song = sixTab(text);
      const back = importMusicXml(toMusicXml(song)).song;
      expect(errors(back)).toEqual([]);
      expect(back.meta.title).toBe(song.meta.title);
      expect(back.bars.map((b) => [b.time, b.length, b.repeatStart, b.repeatEnd, b.ending])).toEqual(song.bars.map((b) => [b.time, b.length, b.repeatStart, b.repeatEnd, b.ending]));
      expect(back.tempo).toEqual(song.tempo);
      expect(back.chords.map((c) => [c.bar, c.tick, c.symbol])).toEqual(song.chords.map((c) => [c.bar, c.tick, c.symbol]));
      expect(back.tracks.length).toBe(song.tracks.length);
      song.tracks.forEach((t, i) => {
        expect(rhythm(back, i)).toEqual(rhythm(song, i));
        expect(back.tracks[i].measures.map((m) => m.beats.map((b) => b.notes.map((n) => `${n.string}:${n.fret}`).join()))).toEqual(t.measures.map((m) => m.beats.map((b) => b.notes.map((n) => `${n.string}:${n.fret}`).join())));
      });
      expect(back.tracks[0].measures.flatMap((m) => m.beats.map((b) => b.lyric ?? ''))).toEqual(song.tracks[0].measures.flatMap((m) => m.beats.map((b) => b.lyric ?? '')));
    }
    const tech = importMusicXml(toMusicXml(sixTab(TECHNIQUE_SAMPLER))).song.tracks[0].measures[0].beats;
    expect(tech[1].notes[0].legato).toBe('hammer');
    expect(tech[2].notes[0].legato).toBe('pull');
    expect(tech[4].notes[0].slide).toBe('up');
    expect(tech[8].notes[0].bend).toEqual({ amount: 2, release: true });
    const band = importMusicXml(toMusicXml(sixTab(CAMPFIRE_GROOVE))).song;
    expect(band.tracks[0].role).toBe('rhythm');
    expect(band.tracks[1].tuning).toEqual([28, 33, 38, 43]);
  });

  it('opens compressed .mxl files', async () => {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    zip.file('META-INF/container.xml', '<?xml version="1.0"?><container><rootfiles><rootfile full-path="score/song.musicxml"/></rootfiles></container>');
    zip.file('score/song.musicxml', fixture('greensleeves.musicxml'));
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    expect(await detectFormat(bytes, 'song.mxl')).toBe('mxl');
    const r = await importMxl(bytes);
    expect(r.song.meta.title).toBe('Greensleeves');
    expect(r.song.tracks).toHaveLength(2);
  });

  it('refuses XML that is not a score', () => {
    expect(() => importMusicXml('<html><body/></html>')).toThrow(RangeError);
    expect(() => importMusicXml('<score-partwise><part id="P1"><measure>')).toThrow(/Unclosed/);
  });
});

describe('JSON and the sniffer', () => {
  it('round-trips JSON and rejects broken songs with a reason', () => {
    const song = sixTab(CAMPFIRE_GROOVE);
    expect(songFromJson(songToJson(song))).toEqual(song);
    expect(() => songFromJson('{"format":"other"}')).toThrow('This file is not a Sixstring Academy song');
    const bad = JSON.parse(songToJson(song));
    bad.song.tracks[0].measures[0].beats.pop();
    expect(() => songFromJson(JSON.stringify(bad))).toThrow(/a mistake the player cannot work around: Bar 1/);
  });

  it('refuses broken files in words for the learner, keeping the technical reason as the detail', async () => {
    const refusal = async (p: Promise<unknown> | (() => unknown)): Promise<SongImportError> => {
      try {
        if (typeof p === 'function') p();
        else await p;
      } catch (e) {
        expect(isSongImportError(e), String(e)).toBe(true);
        expect(e).toBeInstanceOf(RangeError);
        return e as SongImportError;
      }
      throw new Error('expected a refusal');
    };
    const technical = /JSON|Unexpected|DataView|Offset|undefined|<html>|Corrupted|End of data/;
    const json = await refusal(() => songFromJson('{"meta": '));
    expect(json.message).toMatch(/damaged or cut short/);
    expect(json.message).not.toMatch(technical);
    expect(json.detail).toMatch(/^Not JSON/);
    const missing = await refusal(() => songFromJson('{"meta": {}}'));
    expect(missing.message).toMatch(/part of the song is missing/);
    expect(missing.detail).toBe('Song JSON is missing "tuning".');
    const newer = await refusal(() => songFromJson(JSON.stringify({ format: JSON.parse(songToJson(sixTab(ODE_TO_JOY))).format, version: 99, song: {} })));
    expect(newer.message).toMatch(/newer version of Sixstring Academy/);
    const html = await refusal(() => importMusicXml('<html><body/></html>'));
    expect(html.message).toMatch(/not a music score/);
    expect(html.message).not.toMatch(technical);
    expect(html.detail).toBe('The root element is <html>.');
    // A MIDI file cut short after its header: the MIDI reader's own error is only the detail.
    const midi = await refusal(importSong(new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 2, 1, 0xe0, 0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 40, 0]), { name: 'cut.mid' }));
    expect(midi.message).toMatch(/MIDI file could not be read/);
    expect(midi.message).not.toMatch(technical);
    expect(midi.detail).toBeTruthy();
    const mxl = await refusal(importSong(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5]), { name: 'broken.mxl', format: 'mxl' }));
    expect(mxl.message).toMatch(/could not be unpacked/);
    expect(mxl.message).not.toMatch(technical);
    const six = await refusal(importSong('title: X\ntempo: 90\n| q 3:0 |\n', { format: 'sixtab' }));
    expect(six.detail).toMatch(/^line 3, column/);
    // A damaged XML file keeps the XML reader's words: the song library shows its own sentence for those.
    await expect(importSong('<score-partwise><part id="P1"><measure>', { format: 'musicxml' })).rejects.toThrow(/^Unclosed/);
  });

  it('detects formats from content', async () => {
    expect(detectTextFormat(ODE_TO_JOY)).toBe('sixtab');
    expect(detectTextFormat(CAMPFIRE_GROOVE)).toBe('sixtab');
    expect(detectTextFormat(fixture('greensleeves.tab.txt'))).toBe('ascii-tab');
    expect(detectTextFormat(fixture('drop-d-riff.tab.txt'))).toBe('ascii-tab');
    expect(detectTextFormat(fixture('amazing-grace.cho'))).toBe('chordpro');
    expect(detectTextFormat(fixture('oh-susanna.txt'))).toBe('chord-sheet');
    expect(detectTextFormat(fixture('greensleeves.musicxml'))).toBe('musicxml');
    expect(detectTextFormat(songToJson(sixTab(ODE_TO_JOY)))).toBe('json');
    expect(detectTextFormat('Dear diary, today I practised.')).toBe('unknown');
    expect(await detectFormat(new TextEncoder().encode(fixture('amazing-grace.cho')), 'x.cho')).toBe('chordpro');
    // Guitar Pro 3-5 start with a length byte and "FICHIER GUITAR PRO"; .gpx with "BCFZ".
    const gp5 = new Uint8Array([24, ...new TextEncoder().encode('FICHIER GUITAR PRO v5.00'), 0, 0, 0]);
    expect(await detectFormat(gp5)).toBe('guitar-pro');
    expect(await detectFormat(new Uint8Array([...new TextEncoder().encode('BCFZ'), 1, 2, 3]))).toBe('guitar-pro');
    expect(await detectFormat(new Uint8Array([0, 1, 2, 3]), 'song.gp4')).toBe('guitar-pro');
    expect(await detectFormat(new Uint8Array([0, 1, 2, 3]), 'notes.bin')).toBe('unknown');
  });

  it('imports anything through one entry point', async () => {
    const tab = await importSong(fixture('greensleeves.tab.txt'));
    expect(tab.format).toBe('ascii-tab');
    const six = await importSong(new TextEncoder().encode(ODE_TO_JOY), { name: 'ode.sixtab' });
    expect(six.format).toBe('sixtab');
    expect(six.confidence).toBe(1);
    await expect(importSong('hello world')).rejects.toThrow(/not a format/);
    await expect(importSong('title: X\ntempo: 90\n| q 3:0 |\n', { format: 'sixtab' })).rejects.toThrow(/line 3/);
  });
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { CAMPFIRE_GROOVE, ODE_TO_JOY, parseSixTab, sixTab, type Song } from '@/core/song';
import { SONG_ENTRIES } from '@/content/songs';
import { MINE_PREFIX, createLibrary, isMineId, type Library } from './library';
import { FALLBACK_LIBRARY_BYTES, keyValueStore, memoryStore, type KeyValue } from './store';
import { LibraryError, isLibraryError } from './types';

const FIXTURES = fileURLToPath(new URL('../song/fixtures/', import.meta.url));
const ROUTE_SAFE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A library on a memory store with a fixed clock and dice, talking to no other tab. */
function makeLibrary(opts: { store?: ReturnType<typeof memoryStore>; now?: () => number } = {}): Library {
  let seed = 1;
  return createLibrary({ store: opts.store ?? memoryStore(), now: opts.now ?? (() => 1_700_000_000_000), random: () => ((seed = (seed * 16807) % 2147483647) / 2147483647), broadcast: false });
}

/** A key-value map that behaves like localStorage, optionally refusing writes past a size. */
function fakeKv(maxChars = Infinity): KeyValue & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    read: (k) => data.get(k) ?? null,
    write: (k, v) => {
      const size = [...data.entries()].reduce((n, [key, val]) => n + (key === k ? 0 : val.length), 0) + v.length;
      if (size > maxChars) return false;
      data.set(k, v);
      return true;
    },
    remove: (k) => void data.delete(k),
    persistent: () => true,
  };
}

/** Pitches of the first track, for comparing a song with its copy. */
function pitches(song: Song): number[] {
  return song.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => b.notes.map((n) => n.midi)));
}

async function rejection(p: Promise<unknown>): Promise<LibraryError> {
  try {
    await p;
  } catch (e) {
    if (isLibraryError(e)) return e;
    throw e;
  }
  throw new Error('expected the call to fail');
}

/** A Guitar Pro 7 file made with alphaTab itself (as the song core's own tests do). */
async function guitarProFile(): Promise<Uint8Array> {
  const at = await import('@coderline/alphatab/core');
  const tex = String.raw`\title "Library Waltz" \artist "Sixstring Academy" \tempo 90
.
\track "Lead Guitar"
\ts (3 4) \chord ("Am" x 0 2 2 1 0) 0.5.4 {ch "Am"} 2.4.4 2.3.4 | 1.2.4 0.1.4 1.2.4 | 2.3.2. |`;
  const score = at.importer.ScoreLoader.loadAlphaTex(tex);
  return new at.exporter.Gp7Exporter().export(score, new at.Settings());
}

const ASCII_TAB = `Riff in E

e|-----------------|-----------------|
B|-----------------|-----------------|
G|-----------------|-----------------|
D|---------2---4---|---------2---4---|
A|-----2-----------|-----2-----------|
E|-0-------------0-|-0-------------0-|
`;

const CHORDPRO = `{title: Down the Lane}
{key: G}
[G]Walking down the [C]lane today,
[D]sun is on the [G]way.
`;

describe('built-in songs', () => {
  it('are listed at once, before the learner’s songs have loaded', () => {
    const lib = makeLibrary();
    const snap = lib.snapshot();
    expect(snap.ready).toBe(false);
    expect(snap.songs.map((s) => s.id).sort()).toEqual(SONG_ENTRIES.map((e) => e.id).sort());
    expect(snap.songs.every((s) => s.source === 'built-in' && !isMineId(s.id))).toBe(true);
  });

  it('load as valid songs with their id, and are cached as copies', async () => {
    const lib = makeLibrary();
    const a = await lib.load('hot-cross-buns');
    expect(a.meta.id).toBe('hot-cross-buns');
    expect(a.meta.title).toBe('Hot Cross Buns');
    a.meta.title = 'changed by the caller';
    const b = await lib.load('hot-cross-buns');
    expect(b.meta.title).toBe('Hot Cross Buns');
  });

  it('summarise on request, once', async () => {
    const lib = makeLibrary();
    const s = await lib.summary('hot-cross-buns');
    // The learner plays the tune (tab); the teacher's strummed part does not count as "strum".
    expect(s).toMatchObject({ bars: 4, hasTab: true, hasLyrics: true, hasChords: true, hasStrumming: false, time: '4/4', bpm: 72 });
    expect(await lib.summary('frere-jacques')).toMatchObject({ hasTab: false, hasStrumming: true, hasLyrics: true });
    expect(s.chords).toEqual(['G', 'D']);
    expect(await lib.summary('hot-cross-buns')).toBe(s);
    expect((await lib.get('hot-cross-buns'))?.summary).toBe(s);
  });

  it('cannot be changed or deleted, only copied', async () => {
    const lib = makeLibrary();
    expect((await rejection(lib.update('frere-jacques', { title: 'x' }))).code).toBe('read-only');
    expect((await rejection(lib.remove('frere-jacques'))).code).toBe('read-only');
    const copy = await lib.duplicate('frere-jacques');
    expect(copy.id.startsWith(MINE_PREFIX)).toBe(true);
    expect(copy.title).toBe('Frère Jacques (strum along) (my copy)');
    expect(copy.style).toBe('children');
    expect(copy.level).toBe(1);
    expect(copy.imported?.origin).toEqual({ kind: 'duplicate', from: 'frere-jacques' });
    expect(pitches(await lib.load(copy.id))).toEqual(pitches(await lib.load('frere-jacques')));
  });

  it('list with a filter', async () => {
    const lib = makeLibrary();
    await lib.save(sixTab(ODE_TO_JOY));
    expect((await lib.list({ scope: 'mine' })).map((s) => s.title)).toEqual(['Ode to Joy']);
    // Authors keep adding songs: every blues song, and only those, whatever the collection holds.
    const blues = await lib.list({ styles: ['blues'] });
    expect(blues.map((s) => s.id)).toContain('st-blues-shuffle-a');
    expect(blues.every((s) => s.style === 'blues')).toBe(true);
    expect((await lib.list({ scope: 'favourites' }, { favourites: new Set(['frere-jacques']) })).map((s) => s.id)).toEqual(['frere-jacques']);
  });

  it('an unknown id is "not found"', async () => {
    const lib = makeLibrary();
    expect((await rejection(lib.load('no-such-song'))).code).toBe('not-found');
    expect((await rejection(lib.load('my-no-such-song-0000'))).code).toBe('not-found');
    expect(await lib.get('no-such-song')).toBeNull();
  });
});

describe('the learner’s songs', () => {
  it('save with a route-safe id, an estimated or authored level and a summary', async () => {
    const lib = makeLibrary();
    const saved = await lib.save(sixTab(ODE_TO_JOY));
    expect(saved.id).toMatch(/^my-ode-to-joy-[a-z0-9]{4}$/);
    expect(ROUTE_SAFE.test(saved.id)).toBe(true);
    expect(saved).toMatchObject({ source: 'mine', title: 'Ode to Joy', composer: 'Ludwig van Beethoven', level: 1, levelSource: 'authored', key: 'C major' });
    expect(saved.summary?.hasTab).toBe(true);
    expect(saved.skills).toEqual(expect.arrayContaining(['melody', 'chords']));
    expect(saved.bytes).toBeGreaterThan(100);
    const list = await lib.list();
    expect(list.filter((s) => s.source === 'mine').map((s) => s.id)).toEqual([saved.id]);
    expect(lib.snapshot().ready).toBe(true);
    const loaded = await lib.load(saved.id);
    expect(loaded.meta.id).toBe(saved.id);
    expect(pitches(loaded)).toEqual(pitches(sixTab(ODE_TO_JOY)));
  });

  it('estimate the level when the file gives none', async () => {
    const lib = makeLibrary();
    const song = sixTab(ODE_TO_JOY);
    delete song.meta.difficulty;
    const saved = await lib.save(song);
    expect(saved.levelSource).toBe('estimated');
    expect(saved.level).toBe(saved.summary!.estimatedLevel);
  });

  it('never reuse an id, even for the same title', async () => {
    const lib = makeLibrary();
    const ids = new Set<string>();
    for (let i = 0; i < 6; i++) ids.add((await lib.save(sixTab(ODE_TO_JOY))).id);
    expect(ids.size).toBe(6);
  });

  it('update their details; a new title is written into the song too', async () => {
    const lib = makeLibrary();
    const saved = await lib.save(sixTab(CAMPFIRE_GROOVE));
    const a = await lib.update(saved.id, { style: 'folk', level: 6, tags: [' Campfire ', 'BAND', ''], notes: '  play it slow  ' });
    expect(a).toMatchObject({ style: 'folk', level: 6, levelSource: 'set', tags: ['campfire', 'band'], notes: 'play it slow' });
    const b = await lib.update(saved.id, { level: null });
    expect(b.levelSource).toBe('estimated');
    expect(b.level).toBe(saved.summary!.estimatedLevel);
    const c = await lib.rename(saved.id, '  Fireside Groove ');
    expect(c.title).toBe('Fireside Groove');
    expect(c.id).toBe(saved.id);
    expect((await lib.load(saved.id)).meta.title).toBe('Fireside Groove');
    expect((await rejection(lib.rename(saved.id, '   '))).code).toBe('empty');
  });

  it('delete and come back with undo', async () => {
    const lib = makeLibrary();
    const saved = await lib.save(sixTab(ODE_TO_JOY));
    const removed = await lib.remove(saved.id);
    expect(await lib.get(saved.id)).toBeNull();
    expect((await rejection(lib.load(saved.id))).code).toBe('not-found');
    const back = await lib.restore(removed);
    expect(back.id).toBe(saved.id);
    expect(pitches(await lib.load(saved.id))).toEqual(pitches(sixTab(ODE_TO_JOY)));
  });

  it('replace a song in place, keeping its id and the learner’s details', async () => {
    const lib = makeLibrary();
    const saved = await lib.save(sixTab(ODE_TO_JOY));
    await lib.update(saved.id, { style: 'classical', notes: 'mine' });
    const edited = sixTab(ODE_TO_JOY);
    edited.tracks[0].measures[0].beats[0].notes[0] = { ...edited.tracks[0].measures[0].beats[0].notes[0], fret: 3, midi: 67 };
    const replaced = await lib.save(edited, { replace: saved.id });
    expect(replaced).toMatchObject({ id: saved.id, style: 'classical', notes: 'mine', addedAt: saved.addedAt });
    expect(pitches(await lib.load(saved.id))[0]).toBe(67);
    expect((await rejection(lib.save(edited, { replace: 'hot-cross-buns' }))).code).toBe('read-only');
  });

  it('tell subscribers about every change', async () => {
    const lib = makeLibrary();
    const heard = vi.fn();
    const off = lib.subscribe(heard);
    const saved = await lib.save(sixTab(ODE_TO_JOY));
    await lib.update(saved.id, { style: 'folk' });
    const removed = await lib.remove(saved.id);
    await lib.restore(removed);
    expect(heard).toHaveBeenCalledTimes(4);
    off();
    await lib.save(sixTab(ODE_TO_JOY));
    expect(heard).toHaveBeenCalledTimes(4);
  });

  it('refuse a song the player could not handle', async () => {
    const lib = makeLibrary();
    const broken = sixTab(ODE_TO_JOY);
    broken.tracks[0].measures[0].beats[0].duration = 7;
    expect((await rejection(lib.save(broken))).code).toBe('unreadable');
    expect((await lib.list()).some((s) => s.source === 'mine')).toBe(false);
  });
});

describe('importing', () => {
  it('reads pasted text tab, keeps the importer’s warnings and says the rhythm is estimated', async () => {
    const lib = makeLibrary();
    const r = await lib.importText(ASCII_TAB, { title: 'My E riff' });
    expect(r.format).toBe('ascii-tab');
    expect(r.formatName).toBe('Text tab');
    expect(r.estimatedRhythm).toBe(true);
    expect(r.listing).toMatchObject({ title: 'My E riff', source: 'mine' });
    expect(r.listing.imported).toMatchObject({ origin: { kind: 'paste', format: 'ascii-tab' }, estimatedRhythm: true });
    expect(r.listing.imported?.warnings).toEqual(r.warnings);
    const song = await lib.load(r.listing.id);
    expect(song.bars.length).toBe(2);
    expect(pitches(song)).toContain(40);
  });

  it('reads a ChordPro paste with its chords and lyrics', async () => {
    const lib = makeLibrary();
    const r = await lib.importText(CHORDPRO);
    expect(r.format).toBe('chordpro');
    expect(r.listing.title).toBe('Down the Lane');
    expect(r.listing.summary).toMatchObject({ hasChords: true, hasLyrics: true, hasStrumming: true });
    expect(r.listing.summary?.chords).toEqual(['G', 'C', 'D']);
    expect(r.listing.skills).toEqual(expect.arrayContaining(['chords', 'strumming', 'singing']));
  });

  it('reads typed SixTab as "typed"', async () => {
    const lib = makeLibrary();
    const r = await lib.importText(ODE_TO_JOY);
    expect(r.format).toBe('sixtab');
    expect(r.listing.imported?.origin.kind).toBe('typed');
    expect(r.warnings).toEqual([]);
  });

  it('explains text that is not music, and empty text', async () => {
    const lib = makeLibrary();
    const e = await rejection(lib.importText('Dear diary, today I practised for an hour.'));
    expect(e.code).toBe('unsupported');
    expect(e.message).toMatch(/does not look like tab/);
    expect((await rejection(lib.importText('   \n  '))).code).toBe('empty');
  });

  it('imports a MusicXML file', async () => {
    const lib = makeLibrary();
    const file = new File([readFileSync(FIXTURES + 'greensleeves.musicxml')], 'greensleeves.musicxml');
    const r = await lib.importFile(file);
    expect(r.format).toBe('musicxml');
    expect(r.listing.imported?.origin).toEqual({ kind: 'import', format: 'musicxml', fileName: 'greensleeves.musicxml' });
    expect(r.listing.summary?.hasTab).toBe(true);
    expect((await lib.load(r.listing.id)).bars.length).toBeGreaterThan(4);
  });

  it('imports a Guitar Pro file', async () => {
    const lib = makeLibrary();
    const file = new File([new Uint8Array(await guitarProFile())], 'library-waltz.gp');
    const r = await lib.importFile(file);
    expect(r.format).toBe('guitar-pro');
    expect(r.listing.title).toBe('Library Waltz');
    expect(r.listing.summary).toMatchObject({ time: '3/4', bars: 3, hasChords: true });
  });

  it('sends photos and PDFs to the scanner, and refuses huge or empty files', async () => {
    const lib = makeLibrary();
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])], 'sheet.png');
    expect((await rejection(lib.importFile(png))).code).toBe('needs-scan');
    const pdf = new File([new TextEncoder().encode('%PDF-1.7\n%...')], 'sheet.pdf');
    expect((await rejection(lib.importFile(pdf))).code).toBe('needs-scan');
    const huge = { name: 'big.gp', size: 50 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as File;
    expect((await rejection(lib.importFile(huge))).code).toBe('too-large');
    expect((await rejection(lib.importFile(new File([], 'empty.txt')))).code).toBe('empty');
  });

  it('turns a damaged file into a plain message', async () => {
    const lib = makeLibrary();
    const junk = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])], 'riff.gp5');
    const e = await rejection(lib.importFile(junk));
    expect(['unreadable', 'unsupported']).toContain(e.code);
    expect(e.message.length).toBeGreaterThan(20);
  });
});

describe('exporting', () => {
  it('writes SixTab that reads back, text tab and MusicXML, with file names', async () => {
    const lib = makeLibrary();
    const six = await lib.exportSong('hot-cross-buns', 'sixtab');
    expect(six.filename).toBe('hot-cross-buns.sixtab.txt');
    const back = parseSixTab(six.data);
    expect(back.errors).toEqual([]);
    expect(pitches(back.song!)).toEqual(pitches(await lib.load('hot-cross-buns')));
    const ascii = await lib.exportSong('hot-cross-buns', 'ascii-tab');
    expect(ascii.filename).toBe('hot-cross-buns-tab.txt');
    expect(ascii.data).toMatch(/^G\|/m);
    const xml = await lib.exportSong('greensleeves-fingerstyle', 'musicxml');
    expect(xml.filename).toBe('greensleeves-fingerstyle.musicxml');
    expect(xml.data).toContain('<score-partwise');
    const json = await lib.exportSong('st-blues-shuffle-a', 'json');
    expect(json.filename).toBe('12-bar-blues-shuffle-in-a.song.json');
    expect(JSON.parse(json.data).song.meta.title).toBe('12-Bar Blues Shuffle in A');
  });
});

describe('persistence', () => {
  it('a second library on the same storage finds the songs (a reload)', async () => {
    const kv = fakeKv();
    const first = createLibrary({ store: keyValueStore(kv), broadcast: false });
    const saved = await first.save(sixTab(ODE_TO_JOY));
    await first.update(saved.id, { style: 'classical' });
    const second = createLibrary({ store: keyValueStore(kv), broadcast: false });
    const listing = await second.get(saved.id);
    expect(listing).toMatchObject({ title: 'Ode to Joy', style: 'classical' });
    expect(pitches(await second.load(saved.id))).toEqual(pitches(sixTab(ODE_TO_JOY)));
    await second.remove(saved.id);
    const third = createLibrary({ store: keyValueStore(kv), broadcast: false });
    expect(await third.get(saved.id)).toBeNull();
  });

  it('the fallback has a size limit and says when it is full', async () => {
    const lib = createLibrary({ store: keyValueStore(fakeKv(), 6000), broadcast: false });
    await lib.save(sixTab(ODE_TO_JOY));
    const e = await rejection(lib.save(sixTab(CAMPFIRE_GROOVE)));
    expect(e.code).toBe('full');
    expect(e.message).toMatch(/no room/i);
    expect(FALLBACK_LIBRARY_BYTES).toBeLessThan(5 * 1024 * 1024);
  });

  it('a storage that refuses a write leaves nothing half-saved', async () => {
    const kv = fakeKv(3000);
    const lib = createLibrary({ store: keyValueStore(kv), broadcast: false });
    const e = await rejection(lib.save(sixTab(CAMPFIRE_GROOVE)));
    expect(e.code).toBe('full');
    expect([...kv.data.keys()].filter((k) => k.startsWith('library.v1.song.'))).toEqual([]);
    expect(await lib.list()).toHaveLength(SONG_ENTRIES.length);
  });

  it('reports where songs are kept and how much room they use', async () => {
    const lib = makeLibrary();
    await lib.save(sixTab(ODE_TO_JOY));
    const s = await lib.status();
    expect(s).toMatchObject({ backend: 'memory', persistent: false, songs: 1 });
    expect(s.usedBytes).toBeGreaterThan(0);
    expect(s.limitBytes).toBeGreaterThan(s.usedBytes);
  });
});

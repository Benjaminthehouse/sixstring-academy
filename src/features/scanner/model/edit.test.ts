/** Corrections, selection, things to check and undo on a small hand-made draft. */
import { describe, expect, it } from 'vitest';
import { sixTab, validateSong } from '@/core/song';
import { type Draft, type NoteMark, checkBar, viewSong } from './draft';
import { addNote, confirm, deleteBeat, deleteNote, evenBar, fitBar, insertBeat, rearrange, setDetails, setFret, setPitch, setString, setTuning, setValue, transposeSymbol } from './edit';
import { commit, firstSelection, itemsToCheck, moveSelection, nextToCheck, redo, startHistory, undo } from './select';

/** A draft over a SixTab song, every note read with confidence 0.9 except the ones listed (0.3). */
function draftOf(text: string, doubtful: string[] = []): Draft {
  const song = sixTab(text);
  const marks = song.tracks[0].measures.map((m, bar) => ({
    page: 0, system: 0, box: { x: bar * 100, y: 0, w: 100, h: 50 }, systemBox: null, source: 'tab' as const, estimated: false,
    beats: m.beats.map((b, beat) => ({
      ids: [`e${bar}.${beat}`], boxes: [], confidence: 0.9, altValues: [], reasons: [], source: 'image' as const, checked: false,
      notes: b.notes.map((n): NoteMark => ({ ids: [], boxes: [], confidence: doubtful.includes(`${bar}:${beat}:${n.string}`) ? 0.3 : 0.9, altFrets: [], altMidis: [], reasons: [], source: 'image', checked: false })),
    })),
  }));
  return { song, marks, pageCount: 1, notationOnly: false, hasNotation: false, tabLines: 6, notes: [] };
}

const SONG = `title: Test
tempo: 90
time: 4/4
| q 2:0 2:0 2:1 2:3 | 2:3 2:1 2:0 3:2 | (3:0 2:1) 3:0 h 2:0 |`;

function valid(d: Draft) {
  return validateSong(viewSong(d), { notation: false }).filter((i) => i.level === 'error');
}

function must(r: ReturnType<typeof setFret>): Draft {
  if (!r.ok) throw new Error(r.message);
  return r.draft;
}

describe('edits', () => {
  it('sets a fret and the pitch follows; the old draft is untouched', () => {
    const d = draftOf(SONG, ['0:2:2']);
    const e = must(setFret(d, { bar: 0, beat: 2, note: 0 }, 5));
    const n = e.song.tracks[0].measures[0].beats[2].notes[0];
    expect(n).toMatchObject({ string: 2, fret: 5, midi: 64 });
    expect(e.marks[0].beats[2].notes[0]).toMatchObject({ checked: true, confidence: 1, source: 'user' });
    expect(d.song.tracks[0].measures[0].beats[2].notes[0].fret).toBe(1);
    expect(setFret(d, { bar: 0, beat: 2, note: 0 }, 25)).toEqual({ ok: false, message: 'Frets go from 0 (open string) to 24.' });
    expect(valid(e)).toEqual([]);
  });

  it('moves a note to another string keeping the fret (tab) or the pitch (notation), swapping a clash', () => {
    const d = draftOf(SONG);
    const byFret = must(setString(d, { bar: 0, beat: 3, note: 0 }, 3, 'fret'));
    expect(byFret.song.tracks[0].measures[0].beats[3].notes[0]).toMatchObject({ string: 3, fret: 3, midi: 58 });
    const byPitch = must(setString(d, { bar: 0, beat: 3, note: 0 }, 3, 'pitch'));
    expect(byPitch.song.tracks[0].measures[0].beats[3].notes[0]).toMatchObject({ string: 3, fret: 7, midi: 62 });
    // Chord (3:0 2:1): moving the B-string note to string 3 swaps the two.
    const swapped = must(setString(d, { bar: 2, beat: 0, note: 1 }, 3, 'fret'));
    expect(swapped.song.tracks[0].measures[2].beats[0].notes.map((n) => `${n.string}:${n.fret}`).sort()).toEqual(['2:0', '3:1']);
    expect(valid(swapped)).toEqual([]);
    expect(setString(d, { bar: 0, beat: 0, note: 0 }, 1, 'pitch').ok).toBe(false);
  });

  it('sets a pitch on the same string when it reaches, else on a free string', () => {
    const d = draftOf(SONG);
    expect(must(setPitch(d, { bar: 0, beat: 0, note: 0 }, 61)).song.tracks[0].measures[0].beats[0].notes[0]).toMatchObject({ string: 2, fret: 2 });
    const low = must(setPitch(d, { bar: 0, beat: 0, note: 0 }, 41));
    expect(low.song.tracks[0].measures[0].beats[0].notes[0]).toMatchObject({ string: 6, fret: 1, midi: 41 });
    expect(setPitch(d, { bar: 0, beat: 0, note: 0 }, 20).ok).toBe(false);
  });

  it('changes a note length, checks the bar total, and fits the bar either way', () => {
    const d = draftOf(SONG);
    const long = must(setValue(d, { bar: 0, beat: 0 }, { base: 2 }));
    expect(checkBar(long.song, 0)).toMatchObject({ ok: false, text: 'A quarter too long' });
    const trimmed = must(fitBar(long, 0));
    expect(checkBar(trimmed.song, 0).ok).toBe(true);
    expect(trimmed.song.tracks[0].measures[0].beats.map((b) => b.duration)).toEqual([1920, 960, 960]);
    expect(trimmed.marks[0].beats).toHaveLength(3);
    const short = must(setValue(d, { bar: 1, beat: 3 }, { base: 8 }));
    expect(checkBar(short.song, 1).text).toBe('An eighth is missing');
    const filled = must(fitBar(short, 1));
    expect(filled.song.tracks[0].measures[1].beats).toHaveLength(5);
    expect(filled.marks[1].beats).toHaveLength(5);
    expect(checkBar(filled.song, 1).ok).toBe(true);
    const even = must(evenBar(long, 0));
    expect(even.song.tracks[0].measures[0].beats.every((b) => b.duration === 960)).toBe(true);
  });

  it('deletes notes and beats, adds notes and beats, keeping the marks in step', () => {
    const d = draftOf(SONG);
    const lessNote = must(deleteNote(d, { bar: 2, beat: 0, note: 0 }));
    expect(lessNote.song.tracks[0].measures[2].beats[0].notes).toHaveLength(1);
    expect(lessNote.marks[2].beats[0].notes).toHaveLength(1);
    const rest = must(deleteNote(lessNote, { bar: 2, beat: 0, note: 0 }));
    expect(rest.song.tracks[0].measures[2].beats[0]).toMatchObject({ notes: [], duration: 960 });
    const lessBeat = must(deleteBeat(d, { bar: 0, beat: 1 }));
    expect(lessBeat.song.tracks[0].measures[0].beats).toHaveLength(3);
    expect(lessBeat.song.tracks[0].measures[0].beats[2].start).toBe(1920);
    const added = must(addNote(d, { bar: 0, beat: 0 }, 5, 3));
    expect(added.song.tracks[0].measures[0].beats[0].notes.map((n) => n.string).sort()).toEqual([2, 5]);
    expect(added.marks[0].beats[0].notes).toHaveLength(2);
    const replaced = must(addNote(d, { bar: 0, beat: 0 }, 2, 7));
    expect(replaced.song.tracks[0].measures[0].beats[0].notes).toEqual([{ string: 2, fret: 7, midi: 66 }]);
    const inserted = must(insertBeat(d, { bar: 0, beat: 1 }, 'after'));
    expect(inserted.song.tracks[0].measures[0].beats).toHaveLength(5);
    expect(inserted.song.tracks[0].measures[0].beats[2]).toMatchObject({ notes: [], duration: 960, start: 1920 });
    expect(inserted.marks[0].beats[2].source).toBe('user');
    for (const x of [lessNote, rest, lessBeat, added, inserted]) expect(valid(x)).toEqual([]);
  });

  it('keeps ties valid: a tied note follows the fret of the note it continues', () => {
    const d = draftOf(`title: Ties
time: 4/4
| h 3:5 3:- | w 3:- |`);
    const e = must(setFret(d, { bar: 0, beat: 0, note: 0 }, 7));
    const frets = e.song.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => b.notes.map((n) => `${n.fret}${n.tie ? 't' : ''}`)));
    expect(frets).toEqual(['7', '7t', '7t']);
    const broken = must(setFret(d, { bar: 0, beat: 1, note: 0 }, 2));
    expect(broken.song.tracks[0].measures[0].beats[1].notes[0].tie).toBeUndefined();
    expect(valid(broken)).toEqual([]);
  });

  it('changes details: tempo, key, capo (pitches and chord names follow), tuning by shapes or by pitch', () => {
    const d = draftOf(SONG);
    d.song.chords = [{ bar: 0, tick: 0, symbol: 'G' }, { bar: 1, tick: 0, symbol: 'D/F#' }];
    const e = must(setDetails(d, { title: 'Mine', bpm: 72, key: 'G', capo: 2 }));
    expect(e.song.meta.title).toBe('Mine');
    expect(e.song.tempo[0].bpm).toBe(72);
    expect(e.song.key).toBe('G');
    expect(e.song.tracks[0].measures[0].beats[0].notes[0].midi).toBe(61);
    expect(e.song.chords.map((c) => c.symbol)).toEqual(['A', 'E/G#']);
    expect(setDetails(d, { bpm: 5 }).ok).toBe(false);
    expect(valid(e)).toEqual([]);
    const dropD = [38, 45, 50, 55, 59, 64];
    const shapes = must(setTuning(d, dropD, 'shapes'));
    expect(shapes.song.tracks[0].measures[0].beats[0].notes[0]).toMatchObject({ string: 2, fret: 0, midi: 59 });
    const pitch = must(setTuning(d, dropD, 'pitch'));
    expect(pitch.song.tuning).toEqual(dropD);
    expect(pitch.marks[0].beats[0].notes).toHaveLength(1);
    expect(valid(pitch)).toEqual([]);
    expect(setTuning(d, [28, 33, 38, 43], 'shapes').ok).toBe(false);
    expect(transposeSymbol('Bb7', 2)).toBe('C7');
    expect(transposeSymbol('F#m/C#', -1)).toBe('Fm/C');
  });

  it('fingers notation-only music near a chosen fret, marks following their notes', () => {
    const d = draftOf(SONG, ['0:0:2']);
    const high = must(rearrange(d, { preferPosition: 9 }));
    const notes = high.song.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => b.notes));
    expect(notes.filter((n) => n.fret >= 5).length).toBeGreaterThan(notes.length / 2);
    // Pitches are kept and the doubtful note's mark moved with it.
    expect(high.song.tracks[0].measures[0].beats[0].notes[0].midi).toBe(59);
    expect(high.marks[0].beats[0].notes[0].confidence).toBe(0.3);
    expect(valid(high)).toEqual([]);
  });
});

describe('selection and checking', () => {
  it('moves with the arrows through beats and strings', () => {
    const d = draftOf(SONG);
    let s = firstSelection(d);
    expect(s).toEqual({ bar: 0, beat: 0, note: 0, string: 2 });
    s = moveSelection(d, s, 'right');
    expect(s).toMatchObject({ bar: 0, beat: 1, note: 0 });
    for (let i = 0; i < 3; i++) s = moveSelection(d, s, 'right');
    expect(s).toMatchObject({ bar: 1, beat: 0 });
    s = moveSelection(d, s, 'down');
    expect(s).toEqual({ bar: 1, beat: 0, note: null, string: 3 });
    s = moveSelection(d, s, 'left');
    expect(s).toMatchObject({ bar: 0, beat: 3, string: 2, note: 0 });
    s = moveSelection(d, { bar: 0, beat: 0, note: 0, string: 2 }, 'left');
    expect(s).toMatchObject({ bar: 0, beat: 0 });
    s = moveSelection(d, { bar: 0, beat: 0, note: 0, string: 1 }, 'up');
    expect(s.string).toBe(1);
  });

  it('lists doubtful notes and bars that do not add up, and walks through them', () => {
    let d = draftOf(SONG, ['0:2:2', '2:0:3']);
    d = must(setValue(d, { bar: 1, beat: 0 }, { base: 2 }));
    const items = itemsToCheck(d);
    expect(items.map((i) => `${i.kind}@${i.bar}:${i.beat}`)).toEqual(['note@0:2', 'bar@1:null', 'note@2:0']);
    expect(items[1].text).toBe('Bar 2: a quarter too long.');
    expect(nextToCheck(d, null)).toEqual(items[0]);
    expect(nextToCheck(d, { bar: 0, beat: 2, note: 0, string: 2 })).toEqual(items[1]);
    expect(nextToCheck(d, { bar: 2, beat: 3, note: 0, string: 2 })).toEqual(items[0]);
    const ok = must(confirm(d, { bar: 0, beat: 2, note: 0 }));
    expect(itemsToCheck(ok)).toHaveLength(2);
  });

  it('undoes and redoes', () => {
    const d = draftOf(SONG);
    let h = startHistory(d);
    h = commit(h, must(setFret(h.present, { bar: 0, beat: 0, note: 0 }, 3)));
    h = commit(h, must(setFret(h.present, { bar: 0, beat: 1, note: 0 }, 4)));
    expect(h.past).toHaveLength(2);
    h = undo(h);
    expect(h.present.song.tracks[0].measures[0].beats[1].notes[0].fret).toBe(0);
    h = redo(h);
    expect(h.present.song.tracks[0].measures[0].beats[1].notes[0].fret).toBe(4);
    h = undo(undo(h));
    expect(h.present).toBe(d);
    expect(undo(h)).toBe(h);
    h = commit(h, must(setFret(h.present, { bar: 0, beat: 0, note: 0 }, 9)));
    expect(h.future).toEqual([]);
  });
});

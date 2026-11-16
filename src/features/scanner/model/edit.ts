/**
 * Corrections to a proofreading draft. Every function is pure: it returns a new draft (or a plain
 * sentence saying why it cannot), and keeps the marks beside the song in step. What the learner
 * touches is marked as checked, so the "left to check" count goes down as they work.
 *
 *   const r = setFret(draft, { bar: 2, beat: 1, note: 0 }, 7);
 *   if (r.ok) history = commit(history, r.draft); else toast(r.message);
 */
import { type Beat, type Note, type NoteValue, type Song, arrangeTrack, barLength, midiOf, valueFromTicks, valueTicks } from '@/core/song';
import { type BeatMark, type Draft, type NoteMark, userBeatMark, userNoteMark } from './draft';

/** A note of the draft: bar, beat index in the bar, note index in the beat. */
export interface NoteRef {
  bar: number;
  beat: number;
  note: number;
}

/** A beat of the draft. */
export interface BeatRef {
  bar: number;
  beat: number;
}

/** What an edit gives back. */
export type EditResult = { ok: true; draft: Draft } | { ok: false; message: string };

/** Highest fret the editor accepts. */
export const EDIT_MAX_FRET = 24;

const ok = (draft: Draft): EditResult => ({ ok: true, draft });
const no = (message: string): EditResult => ({ ok: false, message });

function clone(d: Draft): Draft {
  return typeof structuredClone === 'function' ? structuredClone(d) : (JSON.parse(JSON.stringify(d)) as Draft);
}

function beatsOf(song: Song, bar: number): Beat[] | null {
  return song.tracks[0]?.measures[bar]?.beats ?? null;
}

function restart(beats: Beat[]): void {
  let at = 0;
  for (const b of beats) {
    b.start = at;
    at += b.duration;
  }
}

function touch(mark: NoteMark | undefined): void {
  if (!mark) return;
  mark.checked = true;
  mark.confidence = 1;
  mark.source = 'user';
}

/** Open-string pitch of a string, with the capo. */
function openOf(song: Song, string: number): number {
  return midiOf(string, 0, song.tuning, song.capo);
}

/** The note before this one on the same string (null after a rest or at the start). */
function previousOnString(song: Song, bar: number, beat: number, string: number): Note | null {
  const track = song.tracks[0];
  for (let b = bar; b >= 0; b--) {
    const beats = track.measures[b]?.beats ?? [];
    for (let i = b === bar ? beat - 1 : beats.length - 1; i >= 0; i--) {
      if (!beats[i].notes.length) return null;
      const n = beats[i].notes.find((x) => x.string === string);
      if (n) return n;
    }
  }
  return null;
}

/** Notes tied on from this one keep its fret (a tie holds one fret). */
function followTies(song: Song, bar: number, beat: number, note: Note): void {
  const track = song.tracks[0];
  for (let b = bar; b < track.measures.length; b++) {
    const beats = track.measures[b].beats;
    for (let i = b === bar ? beat + 1 : 0; i < beats.length; i++) {
      if (!beats[i].notes.length) return;
      const n = beats[i].notes.find((x) => x.string === note.string);
      if (!n) continue;
      if (!n.tie) return;
      n.fret = note.fret;
      n.midi = note.midi;
    }
  }
}

function getNote(d: Draft, ref: NoteRef): { note: Note; mark: NoteMark | undefined; beat: Beat; beatMark: BeatMark | undefined } | null {
  const beats = beatsOf(d.song, ref.bar);
  const beat = beats?.[ref.beat];
  const note = beat?.notes[ref.note];
  if (!beat || !note) return null;
  const beatMark = d.marks[ref.bar]?.beats[ref.beat];
  return { note, mark: beatMark?.notes[ref.note], beat, beatMark };
}

/** Set the fret of a note (its pitch follows; notes tied on from it follow too). */
export function setFret(draft: Draft, ref: NoteRef, fret: number): EditResult {
  if (!Number.isInteger(fret) || fret < 0 || fret > EDIT_MAX_FRET) return no(`Frets go from 0 (open string) to ${EDIT_MAX_FRET}.`);
  const d = clone(draft);
  const got = getNote(d, ref);
  if (!got) return no('That note is no longer there.');
  const { note, mark } = got;
  note.fret = fret;
  note.midi = midiOf(note.string, fret, d.song.tuning, d.song.capo);
  if (note.tie) {
    const prev = previousOnString(d.song, ref.bar, ref.beat, note.string);
    if (!prev || prev.fret !== fret) delete note.tie;
  }
  followTies(d.song, ref.bar, ref.beat, note);
  touch(mark);
  return ok(d);
}

/** Move a note to another string, keeping its fret (tab: the number was on another line) or its pitch (notation). */
export function setString(draft: Draft, ref: NoteRef, string: number, keep: 'fret' | 'pitch'): EditResult {
  const strings = draft.song.tuning.length;
  if (!Number.isInteger(string) || string < 1 || string > strings) return no(`Strings go from 1 (the thinnest) to ${strings}.`);
  const d = clone(draft);
  const got = getNote(d, ref);
  if (!got) return no('That note is no longer there.');
  const { note, mark, beat, beatMark } = got;
  if (note.string === string) return ok(draft);
  const other = beat.notes.findIndex((n) => n.string === string);
  if (keep === 'pitch') {
    const fret = note.midi - openOf(d.song, string);
    if (fret < 0 || fret > EDIT_MAX_FRET) return no(`That pitch cannot be played on string ${string}.`);
    if (other >= 0) return no(`String ${string} already plays a note here.`);
    note.string = string;
    note.fret = fret;
  } else {
    if (other >= 0) {
      // Swap the two: a column read one line off usually has its neighbour misplaced too.
      const o = beat.notes[other];
      o.string = note.string;
      o.midi = midiOf(o.string, o.fret, d.song.tuning, d.song.capo);
      touch(beatMark?.notes[other]);
    }
    note.string = string;
    note.midi = midiOf(string, note.fret, d.song.tuning, d.song.capo);
  }
  delete note.tie;
  touch(mark);
  return ok(d);
}

/** Set the sounding pitch of a note: same string when it reaches, else the lowest fret on a free string. */
export function setPitch(draft: Draft, ref: NoteRef, midi: number): EditResult {
  const d = clone(draft);
  const got = getNote(d, ref);
  if (!got) return no('That note is no longer there.');
  const { note, mark, beat } = got;
  const strings = d.song.tuning.length;
  const fits = (s: number) => {
    const f = midi - openOf(d.song, s);
    return f >= 0 && f <= EDIT_MAX_FRET ? f : null;
  };
  let string = note.string;
  let fret = fits(string);
  if (fret === null) {
    let best: { s: number; f: number } | null = null;
    for (let s = 1; s <= strings; s++) {
      if (s !== note.string && beat.notes.some((n) => n.string === s)) continue;
      const f = fits(s);
      if (f !== null && (!best || f < best.f)) best = { s, f };
    }
    if (!best) return no('That pitch is out of the instrument’s range.');
    string = best.s;
    fret = best.f;
  }
  note.string = string;
  note.fret = fret;
  note.midi = midi;
  delete note.tie;
  touch(mark);
  return ok(d);
}

/** Set the length of a beat (the rest of the bar moves along). */
export function setValue(draft: Draft, ref: BeatRef, value: NoteValue): EditResult {
  const ticks = valueTicks(value);
  if (!(ticks > 0) || !Number.isFinite(ticks)) return no('That is not a note length.');
  const d = clone(draft);
  const beats = beatsOf(d.song, ref.bar);
  const beat = beats?.[ref.beat];
  if (!beats || !beat) return no('That beat is no longer there.');
  beat.duration = Math.round(ticks);
  beat.value = { ...value };
  restart(beats);
  const m = d.marks[ref.bar]?.beats[ref.beat];
  if (m) {
    m.checked = true;
    m.confidence = 1;
    m.source = 'user';
  }
  return ok(d);
}

/** Remove one note; a beat left without notes becomes a rest of the same length. */
export function deleteNote(draft: Draft, ref: NoteRef): EditResult {
  const d = clone(draft);
  const got = getNote(d, ref);
  if (!got) return no('That note is no longer there.');
  got.beat.notes.splice(ref.note, 1);
  got.beatMark?.notes.splice(ref.note, 1);
  if (got.beatMark) got.beatMark.checked = true;
  return ok(d);
}

/** Remove a whole beat (note, chord or rest): the notes after it move earlier. */
export function deleteBeat(draft: Draft, ref: BeatRef): EditResult {
  const d = clone(draft);
  const beats = beatsOf(d.song, ref.bar);
  if (!beats?.[ref.beat]) return no('That beat is no longer there.');
  beats.splice(ref.beat, 1);
  d.marks[ref.bar]?.beats.splice(ref.beat, 1);
  restart(beats);
  return ok(d);
}

/** Put a fret on a string of a beat (replaces the fret when the string already plays). */
export function addNote(draft: Draft, ref: BeatRef, string: number, fret: number): EditResult {
  const beats = beatsOf(draft.song, ref.bar);
  const beat = beats?.[ref.beat];
  if (!beat) return no('That beat is no longer there.');
  const existing = beat.notes.findIndex((n) => n.string === string);
  if (existing >= 0) return setFret(draft, { ...ref, note: existing }, fret);
  const strings = draft.song.tuning.length;
  if (!Number.isInteger(string) || string < 1 || string > strings) return no(`Strings go from 1 (the thinnest) to ${strings}.`);
  if (!Number.isInteger(fret) || fret < 0 || fret > EDIT_MAX_FRET) return no(`Frets go from 0 (open string) to ${EDIT_MAX_FRET}.`);
  const d = clone(draft);
  const b = beatsOf(d.song, ref.bar)![ref.beat];
  b.notes.push({ string, fret, midi: midiOf(string, fret, d.song.tuning, d.song.capo) });
  const mark = d.marks[ref.bar]?.beats[ref.beat];
  if (mark) {
    mark.notes.push(userNoteMark());
    mark.checked = true;
  }
  return ok(d);
}

/** Insert a rest beat before or after a beat (default: the same length), to add a note the reader missed. */
export function insertBeat(draft: Draft, ref: BeatRef, where: 'before' | 'after', value?: NoteValue): EditResult {
  const d = clone(draft);
  const beats = beatsOf(d.song, ref.bar);
  if (!beats) return no('That bar is no longer there.');
  const near = beats[ref.beat];
  const v = value ?? near?.value ?? valueFromTicks(near?.duration ?? 960) ?? { base: 4 };
  const at = Math.max(0, Math.min(beats.length, where === 'after' ? ref.beat + 1 : ref.beat));
  beats.splice(at, 0, { start: 0, duration: Math.round(valueTicks(v)), notes: [], value: { ...v } });
  restart(beats);
  d.marks[ref.bar]?.beats.splice(at, 0, userBeatMark());
  return ok(d);
}

/** Make a bar add up: a short bar gets a rest at its end; a long one is cut at the bar line. */
export function fitBar(draft: Draft, bar: number): EditResult {
  const d = clone(draft);
  const beats = beatsOf(d.song, bar);
  const info = d.song.bars[bar];
  if (!beats || !info) return no('That bar is no longer there.');
  restart(beats);
  const need = barLength(info);
  const total = beats.reduce((s, b) => s + b.duration, 0);
  if (total === need) return ok(draft);
  if (total < need) {
    const gap = need - total;
    const v = valueFromTicks(gap);
    beats.push({ start: total, duration: gap, notes: [], ...(v ? { value: v } : {}) });
    d.marks[bar]?.beats.push(userBeatMark());
  } else {
    while (beats.length && beats[beats.length - 1].start >= need) {
      beats.pop();
      d.marks[bar]?.beats.pop();
    }
    const last = beats[beats.length - 1];
    if (last) {
      last.duration = need - last.start;
      const v = valueFromTicks(last.duration);
      if (v) last.value = v;
      else delete last.value;
    }
  }
  return ok(d);
}

/** Give every beat of a bar the same length so it adds up (when the bar can be split evenly). */
export function evenBar(draft: Draft, bar: number): EditResult {
  const beats = beatsOf(draft.song, bar);
  const info = draft.song.bars[bar];
  if (!beats?.length || !info) return no('That bar has no notes to spread.');
  const each = barLength(info) / beats.length;
  const v = Number.isInteger(each) ? valueFromTicks(each) : null;
  if (!v) return no(`${beats.length} notes cannot share this bar evenly.`);
  const d = clone(draft);
  const out = beatsOf(d.song, bar)!;
  for (const b of out) {
    b.duration = each;
    b.value = { ...v };
  }
  restart(out);
  for (const m of d.marks[bar]?.beats ?? []) {
    m.checked = true;
    m.confidence = 1;
    m.source = 'user';
  }
  return ok(d);
}

/** The learner says a doubtful note (or the beat's rhythm, without `note`) is right as read. */
export function confirm(draft: Draft, ref: BeatRef & { note?: number | null }): EditResult {
  const d = clone(draft);
  const bm = d.marks[ref.bar]?.beats[ref.beat];
  if (!bm) return no('That beat is no longer there.');
  if (ref.note !== undefined && ref.note !== null) {
    const nm = bm.notes[ref.note];
    if (!nm) return no('That note is no longer there.');
    nm.checked = true;
  } else {
    bm.checked = true;
    for (const nm of bm.notes) nm.checked = true;
  }
  return ok(d);
}

/** Change what the song is called, its speed, key or capo. With a capo, frets count from it (the shapes stay; pitches follow). */
export function setDetails(draft: Draft, patch: { title?: string; bpm?: number; key?: string | null; capo?: number }): EditResult {
  if (patch.bpm !== undefined && !(patch.bpm >= 20 && patch.bpm <= 300)) return no('Tempo goes from 20 to 300 beats per minute.');
  if (patch.capo !== undefined && !(Number.isInteger(patch.capo) && patch.capo >= 0 && patch.capo <= 12)) return no('A capo goes from fret 0 to 12.');
  const d = clone(draft);
  const song = d.song;
  if (patch.title !== undefined) song.meta.title = patch.title;
  if (patch.bpm !== undefined) {
    if (song.tempo.length) song.tempo[0].bpm = Math.round(patch.bpm);
    else song.tempo = [{ bar: 0, bpm: Math.round(patch.bpm) }];
  }
  if (patch.key !== undefined) {
    if (patch.key) song.key = patch.key;
    else delete song.key;
  }
  if (patch.capo !== undefined && patch.capo !== song.capo) {
    const shift = patch.capo - song.capo;
    song.capo = patch.capo;
    for (const m of song.tracks[0].measures) for (const b of m.beats) for (const n of b.notes) n.midi = midiOf(n.string, n.fret, song.tuning, song.capo);
    // Chord symbols name what sounds: they move with the capo.
    if (shift && song.chords.length) song.chords = song.chords.map((c) => ({ ...c, symbol: transposeSymbol(c.symbol, shift) }));
  }
  return ok(d);
}

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Move a chord symbol by semitones (roots and slash basses), keeping sharps or flats as written. */
export function transposeSymbol(symbol: string, semis: number): string {
  const move = (root: string): string => {
    const m = /^([A-G])(#|b)?$/.exec(root);
    if (!m) return root;
    const pc = (((PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + semis) % 12) + 12) % 12;
    return (m[2] === 'b' ? FLATS : SHARPS)[pc];
  };
  return symbol.replace(/^([A-G][#b]?)/, (r) => move(r)).replace(/\/([A-G][#b]?)$/, (_, r: string) => `/${move(r)}`);
}

/**
 * Change the tuning. `shapes`: the frets stay and the pitches follow (tab printed for that tuning).
 * `pitch`: the pitches stay and the music is fingered again for the new tuning.
 */
export function setTuning(draft: Draft, tuning: readonly number[], keep: 'shapes' | 'pitch'): EditResult {
  if (tuning.length !== draft.song.tuning.length) return no(`Pick a tuning with ${draft.song.tuning.length} strings.`);
  if (keep === 'shapes') {
    const d = clone(draft);
    d.song.tuning = tuning.slice();
    for (const m of d.song.tracks[0].measures) for (const b of m.beats) for (const n of b.notes) n.midi = midiOf(n.string, n.fret, d.song.tuning, d.song.capo);
    return ok(d);
  }
  return rearrange(draft, { tuning: tuning.slice(), keepStrings: true });
}

/** Finger the music again with the arranger (notation-only sheets): near `preferPosition`, or re-fingered for a new tuning. */
export function rearrange(draft: Draft, opts: { preferPosition?: number; tuning?: number[]; keepStrings?: boolean }): EditResult {
  const d = clone(draft);
  if (opts.tuning) d.song.tuning = opts.tuning.slice();
  let result;
  try {
    result = arrangeTrack(d.song, 0, { tuning: d.song.tuning, capo: d.song.capo, ...(opts.preferPosition !== undefined ? { preferPosition: opts.preferPosition } : {}), keepStrings: !!opts.keepStrings, octaves: false });
  } catch (e) {
    return no(e instanceof Error ? e.message : 'The music could not be fingered.');
  }
  const before = d.song.tracks[0];
  const after = result.track;
  after.measures.forEach((m, bar) => {
    m.beats.forEach((b, bi) => {
      const old = before.measures[bar]?.beats[bi];
      const mark = d.marks[bar]?.beats[bi];
      if (!old || !mark) return;
      const used = new Set<number>();
      mark.notes = b.notes.map((n) => {
        const k = old.notes.findIndex((o, i) => !used.has(i) && o.midi === n.midi);
        if (k < 0) return userNoteMark();
        used.add(k);
        return mark.notes[k] ?? userNoteMark();
      });
    });
  });
  d.song.tracks[0] = after;
  return ok(d);
}

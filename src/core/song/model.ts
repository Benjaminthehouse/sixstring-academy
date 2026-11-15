/**
 * Small building blocks for songs: durations, bar lengths, pitches of string/fret, empty songs,
 * cloning and ids. Everything else in the module is built on these.
 */
import { STANDARD_TUNING } from '@/core/guitar';
import { transposeChordBySemitones } from '@/core/theory';
import { PPQ, type BarInfo, type Beat, type Measure, type Note, type NoteValue, type Song, type SongMeta, type TimeSig, type Track } from './types';

/** Ticks in a whole note. */
export const WHOLE = PPQ * 4;

/** Highest fret any importer or validator accepts. */
export const MAX_FRET = 30;

/** Ticks of a full bar in a time signature. */
export function barCapacity(time: TimeSig): number {
  return Math.round((WHOLE * time.numerator) / time.denominator);
}

/** Length of a bar in ticks: its explicit pickup length, or what its time signature holds. */
export function barLength(info: BarInfo): number {
  return info.length ?? barCapacity(info.time);
}

/** Format a time signature: `6/8`. */
export function formatTimeSig(time: TimeSig): string {
  return `${time.numerator}/${time.denominator}`;
}

/** Read `3/4`, `6/8`, `C` (4/4) or `cut` (2/2); null for anything else. */
export function parseTimeSig(text: string): TimeSig | null {
  const t = text.trim().toLowerCase();
  if (t === 'c' || t === 'common') return { numerator: 4, denominator: 4 };
  if (t === 'cut' || t === 'c|') return { numerator: 2, denominator: 2 };
  const m = /^(\d{1,2})\s*\/\s*(\d{1,2})$/.exec(t);
  if (!m) return null;
  const numerator = Number(m[1]);
  const denominator = Number(m[2]);
  if (numerator < 1 || numerator > 32 || ![1, 2, 4, 8, 16, 32].includes(denominator)) return null;
  return { numerator, denominator };
}

/** Ticks of a written duration (base value, dots, tuplet). */
export function valueTicks(value: NoteValue): number {
  let ticks = WHOLE / value.base;
  let add = ticks / 2;
  for (let i = 0; i < (value.dots ?? 0); i++) {
    ticks += add;
    add /= 2;
  }
  if (value.tuplet) ticks = (ticks * value.tuplet.normal) / value.tuplet.actual;
  return ticks;
}

/** The usual "normal" count of a tuplet of n: 3 in 2, 5/6/7 in 4, 9 in 8. */
export function tupletNormal(actual: number): number {
  let normal = 1;
  while (normal * 2 < actual) normal *= 2;
  return normal;
}

const BASES = [1, 2, 4, 8, 16, 32, 64];

/**
 * How a tick length is written: a plain or dotted value, or a triplet/quintuplet/sextuplet value;
 * null when it needs a tie (5 sixteenths) or is not a musical length.
 */
export function valueFromTicks(ticks: number): NoteValue | null {
  for (const base of BASES) {
    for (let dots = 0; dots <= 2; dots++) {
      if (Math.abs(valueTicks({ base, dots }) - ticks) < 1e-6) return dots ? { base, dots } : { base };
    }
  }
  for (const actual of [3, 6, 5, 7, 9]) {
    const normal = tupletNormal(actual);
    for (const base of BASES) {
      for (let dots = 0; dots <= 1; dots++) {
        const v: NoteValue = { base, ...(dots ? { dots } : {}), tuplet: { actual, normal } };
        if (Math.abs(valueTicks(v) - ticks) < 1e-6) return v;
      }
    }
  }
  return null;
}

/** Plain and dotted values, longest first, used to fill a gap with rests or tied notes. */
const FILL_VALUES: Array<{ value: NoteValue; ticks: number }> = BASES.flatMap((base) =>
  [1, 0].map((dots) => {
    const value: NoteValue = dots ? { base, dots } : { base };
    return { value, ticks: valueTicks(value) };
  }),
).sort((a, b) => b.ticks - a.ticks);

/**
 * Split a length into written values that add up to it (longest first), for rests that fill a
 * gap or for a note split across a bar line. Tick remainders that no value can express are kept
 * in a last piece without a `value`.
 */
export function splitTicks(ticks: number): Array<{ ticks: number; value?: NoteValue }> {
  const out: Array<{ ticks: number; value?: NoteValue }> = [];
  let left = Math.round(ticks);
  const single = valueFromTicks(left);
  if (single && !single.tuplet) return [{ ticks: left, value: single }];
  while (left > 0) {
    const piece = FILL_VALUES.find((v) => v.ticks <= left + 1e-6);
    if (!piece || piece.ticks < 30) {
      out.push({ ticks: left });
      break;
    }
    out.push({ ticks: piece.ticks, value: { ...piece.value } });
    left -= piece.ticks;
  }
  return out;
}

/** Rest beats filling [start, end) of a bar. */
export function restBeats(start: number, end: number): Beat[] {
  const beats: Beat[] = [];
  let at = start;
  for (const piece of splitTicks(end - start)) {
    beats.push({ start: at, duration: piece.ticks, notes: [], ...(piece.value ? { value: piece.value } : {}) });
    at += piece.ticks;
  }
  return beats;
}

/** True for a beat that sounds nothing (no notes, not a slash). */
export function isRest(beat: Beat): boolean {
  return beat.notes.length === 0 && !beat.slash;
}

/** Ticks a measure's beats add up to. */
export function measureTicks(measure: Measure): number {
  return measure.beats.reduce((sum, b) => sum + b.duration, 0);
}

/** The tuning a track plays in (its own, or the song's). */
export function trackTuning(song: Song, track: Track): number[] {
  return track.tuning ?? song.tuning;
}

/** The capo a track plays with (its own, or the song's). */
export function trackCapo(song: Song, track: Track): number {
  return track.capo ?? song.capo;
}

/** Sounding MIDI of a string and fret: tuning (low to high) + capo + fret; NaN for a string the tuning lacks. */
export function midiOf(string: number, fret: number, tuning: readonly number[], capo = 0): number {
  const index = tuning.length - string;
  if (index < 0 || index >= tuning.length) return NaN;
  return tuning[index] + capo + fret;
}

/** Semitones above the open string at which a natural harmonic over a fret sounds; undefined where none rings. */
const NATURAL_HARMONICS: Record<number, number> = { 12: 12, 24: 24, 7: 19, 19: 19, 5: 24, 4: 28, 9: 28, 16: 28, 3: 31, 15: 31 };

/**
 * The pitch that is heard when the note is struck: harmonics an octave (or more) up, a pre-bend at
 * its bent pitch, a dead note as null. Use this for what a microphone should hear first; `note.midi`
 * stays the fretted pitch.
 */
export function soundingPitch(note: Note): number | null {
  if (note.dead) return null;
  if (note.harmonic === 'natural') {
    const open = note.midi - note.fret;
    const over = NATURAL_HARMONICS[note.fret];
    return over === undefined ? note.midi + 12 : open + over;
  }
  if (note.harmonic === 'artificial') return note.midi + 12;
  // A pre-bend is struck at its bent pitch (a release brings it down afterwards).
  if (note.bend?.pre) return note.midi + note.bend.amount;
  return note.midi;
}

/** Turn a title into a slug-safe id: lowercase letters, digits and single hyphens. */
export function slugify(text: string): string {
  const s = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'song';
}

/** Options for `createSong`. */
export interface CreateSongInit {
  meta?: Partial<SongMeta>;
  tuning?: number[];
  capo?: number;
  key?: string;
  bpm?: number;
  time?: TimeSig;
  /** Number of empty (rest-filled) bars, default 1. */
  bars?: number;
  /** Tracks to create; default one lead track. */
  tracks?: Array<Pick<Track, 'name' | 'role'> & Partial<Pick<Track, 'id' | 'tuning' | 'capo'>>>;
}

/** A new, valid song: rest-filled bars in one time signature, standard tuning, 120 bpm unless told otherwise. */
export function createSong(init: CreateSongInit = {}): Song {
  const time = init.time ?? { numerator: 4, denominator: 4 };
  const barCount = Math.max(1, init.bars ?? 1);
  const title = init.meta?.title ?? 'Untitled';
  const bars: BarInfo[] = Array.from({ length: barCount }, () => ({ time: { ...time } }));
  const trackDefs = init.tracks ?? [{ name: 'Guitar', role: 'lead' as const }];
  const used = new Set<string>();
  const tracks: Track[] = trackDefs.map((t) => {
    const id = uniqueId(t.id ?? slugify(t.name), used);
    return {
      id,
      name: t.name,
      role: t.role,
      ...(t.tuning ? { tuning: [...t.tuning] } : {}),
      ...(t.capo !== undefined ? { capo: t.capo } : {}),
      measures: bars.map((b) => ({ beats: restBeats(0, barLength(b)) })),
    };
  });
  return {
    meta: { ...init.meta, id: init.meta?.id ?? slugify(title), title },
    tuning: [...(init.tuning ?? STANDARD_TUNING.midi)],
    capo: init.capo ?? 0,
    ...(init.key ? { key: init.key } : {}),
    tempo: [{ bar: 0, bpm: init.bpm ?? 120 }],
    bars,
    sections: [],
    tracks,
    chords: [],
    annotations: [],
  };
}

/** A unique id built from `base` (adds -2, -3 … when taken) and records it. */
export function uniqueId(base: string, used: Set<string>): string {
  const root = slugify(base);
  let id = root;
  for (let n = 2; used.has(id); n++) id = `${root}-${n}`;
  used.add(id);
  return id;
}

/** A deep copy that shares nothing with the original. */
export function cloneSong(song: Song): Song {
  return JSON.parse(JSON.stringify(song)) as Song;
}

/** Tempo in quarter notes per minute at the start of a bar (the last change at or before it). */
export function tempoAtBar(song: Song, bar: number, tick = 0): number {
  let bpm = song.tempo[0]?.bpm ?? 120;
  for (const t of song.tempo) {
    if (t.bar < bar || (t.bar === bar && (t.tick ?? 0) <= tick)) bpm = t.bpm;
  }
  return bpm;
}

/** The chord symbol sounding at a bar and tick, or null before the first one. */
export function chordAt(song: Song, bar: number, tick = 0): string | null {
  let found: string | null = null;
  for (const c of song.chords) {
    if (c.bar < bar || (c.bar === bar && c.tick <= tick)) found = c.symbol;
    else break;
  }
  return found;
}

/**
 * The chord shape a guitarist plays for a sounding chord behind a capo (`A` with capo 2 is played
 * as a `G` shape). Chord symbols in songs are always what sounds; use this for display.
 */
export function capoShape(symbol: string, capo: number): string {
  if (!capo || /^n\.?c\.?$/i.test(symbol)) return symbol;
  try {
    return transposeChordBySemitones(symbol, -capo);
  } catch {
    return symbol;
  }
}

/** Sort a song's timeline lists (chords, annotations, tempo, sections) into time order, in place. */
export function sortSongLists(song: Song): Song {
  const byPos = (a: { bar: number; tick?: number }, b: { bar: number; tick?: number }) => a.bar - b.bar || (a.tick ?? 0) - (b.tick ?? 0);
  song.chords.sort(byPos);
  song.annotations.sort(byPos);
  song.tempo.sort(byPos);
  song.sections.sort((a, b) => a.start - b.start);
  return song;
}

/** Find a track by id, by name (case-insensitive) or by index. */
export function findTrack(song: Song, ref?: string | number): Track | undefined {
  if (ref === undefined) return song.tracks[0];
  if (typeof ref === 'number') return song.tracks[ref];
  return song.tracks.find((t) => t.id === ref) ?? song.tracks.find((t) => t.name.toLowerCase() === ref.toLowerCase());
}


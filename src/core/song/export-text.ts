/**
 * Text exporters: ASCII tab (the web format, with tuning, capo, tempo and time hints, chord names
 * above and lyrics below, so `importAsciiTab` reads it back) and JSON (the song model as it is,
 * wrapped with a format tag and version).
 */
import { midiToNote } from '@/core/theory';
import { findTrack, formatTimeSig, trackCapo, trackTuning, valueFromTicks, valueTicks } from './model';
import type { Beat, Note, Song } from './types';
import { validateSong } from './validate';

/** Options for `toAsciiTab`. */
export interface AsciiTabWriteOptions {
  /** Track id, name or index (default the first). */
  track?: string | number;
  /** Characters per line (default 80). */
  width?: number;
  /** Header lines with title, tuning, capo, tempo and time (default true). */
  header?: boolean;
  /**
   * A row of rhythm letters above the staff (w h q e s t, dots, "3" for triplets), so the rhythm
   * is read back exactly rather than estimated from the spacing (default true).
   */
  rhythm?: boolean;
}

const RHYTHM_LETTER: Record<number, string> = { 1: 'w', 2: 'h', 4: 'q', 8: 'e', 16: 's', 32: 't', 64: 'x' };

/** The rhythm letter of a beat's length ("q.", "e3"), or null when no single letter writes it. */
function rhythmToken(b: Beat): string | null {
  const v = b.value && Math.abs(valueTicks(b.value) - b.duration) < 1e-6 ? b.value : valueFromTicks(b.duration);
  if (!v || !RHYTHM_LETTER[v.base]) return null;
  if (v.tuplet && (v.tuplet.actual !== 3 || v.tuplet.normal !== 2)) return null;
  return `${RHYTHM_LETTER[v.base]}${'.'.repeat(v.dots ?? 0)}${v.tuplet ? '3' : ''}`;
}

function noteToken(n: Note): string {
  if (n.tie) return '';
  let core: string;
  if (n.dead) core = 'x';
  else if (n.ghost) core = `(${n.fret})`;
  else if (n.harmonic) core = `<${n.fret}>`;
  else core = String(n.fret);
  let t = '';
  if (n.legato === 'hammer') t += 'h';
  if (n.legato === 'pull') t += 'p';
  if (n.slide === 'up') t += '/';
  if (n.slide === 'down') t += '\\';
  if (!n.legato && !n.slide && n.slideIn === 'below') t += '/';
  if (!n.legato && !n.slide && n.slideIn === 'above') t += '\\';
  if (n.tap) t += 't';
  t += core;
  if (n.bend) {
    t += `b${n.fret + Math.round(n.bend.amount)}`;
    if (n.bend.release) t += `r${n.fret}`;
  }
  if (n.vibrato) t += '~';
  if (n.slideOut === 'down') t += '\\';
  if (n.slideOut === 'up') t += '/';
  return t;
}

/** Write one track as ASCII tab. */
export function toAsciiTab(song: Song, opts: AsciiTabWriteOptions = {}): string {
  const track = findTrack(song, opts.track) ?? song.tracks[0];
  const tuning = trackTuning(song, track);
  const capo = trackCapo(song, track);
  const width = Math.max(30, opts.width ?? 80);
  const strings = tuning.length;
  const names = [...tuning].reverse().map((m, i) => {
    const n = midiToNote(m, { prefer: 'sharps' }).replace(/-?\d+$/, '');
    return i === 0 && n === 'E' ? 'e' : n;
  });
  const nameWidth = Math.max(...names.map((n) => n.length));
  const out: string[] = [];
  if (opts.header !== false) {
    out.push(`Title: ${song.meta.title}`);
    if (song.meta.composer) out.push(`Composer: ${song.meta.composer}`);
    out.push(`Tuning: ${[...tuning].map((m) => midiToNote(m, { prefer: 'sharps' }).replace(/-?\d+$/, '')).join(' ')}`);
    if (capo) out.push(`Capo: ${capo}`);
    out.push(`Tempo: ${song.tempo[0]?.bpm ?? 100} bpm`);
    out.push(`Time: ${formatTimeSig(song.bars[0]?.time ?? { numerator: 4, denominator: 4 })}`);
    out.push('');
  }

  /** One bar rendered as columns: string rows, chord row, lyric row, palm-mute row. */
  interface Block { rows: string[]; chords: string; lyrics: string; pm: string; rhythm: string; width: number }
  const blocks: Block[] = track.measures.map((m, bar) => {
    const info = song.bars[bar];
    const tokens = m.beats.map((b: Beat) => Array.from({ length: strings }, (_, i) => {
      const n = b.notes.find((x) => x.string === i + 1);
      return n ? noteToken(n) : '';
    }));
    // Columns in proportion to time (so the importer reads the rhythm back): two per sixteenth,
    // more when a long token (12h14, 7b9r7) needs room, the same scale across the whole bar.
    // Rhythm letters for the bar, unless a beat cannot be written with one (then the spacing alone tells).
    const letters = m.beats.map(rhythmToken);
    const timed = opts.rhythm !== false && letters.every(Boolean) && !m.beats.some((b) => b.notes.length && b.notes.every((n) => n.tie));
    const room = (k: number) => Math.max(1, ...tokens[k].map((t) => t.length), timed ? letters[k]!.length : 0) + 1;
    let scale = Math.max(2 / 240, ...m.beats.map((b, k) => room(k) / Math.max(1, b.duration)));
    const colAt = (tick: number) => Math.round(tick * scale);
    for (let tries = 0; tries < 8 && m.beats.some((b, k) => colAt(b.start + b.duration) - colAt(b.start) < room(k)); tries++) scale *= 1.15;
    const rows = Array.from({ length: strings }, () => '-');
    let chords = ' ';
    let lyrics = ' ';
    let pm = ' ';
    let rhythm = ' ';
    const barChords = song.chords.filter((c) => c.bar === bar);
    m.beats.forEach((b: Beat, k) => {
      const cols = colAt(b.start + b.duration) - colAt(b.start);
      const startCol = rows[0].length;
      for (let i = 0; i < strings; i++) rows[i] += tokens[k][i].padEnd(cols, '-');
      const chord = barChords.find((c) => c.tick >= b.start && c.tick < b.start + b.duration);
      chords = chords.padEnd(startCol, ' ') + (chord ? `${chord.symbol} ` : '');
      if (b.lyric) lyrics = lyrics.padEnd(startCol, ' ') + `${b.lyric} `;
      if (b.notes.some((n) => n.palmMute)) pm = pm.padEnd(startCol, ' ') + 'PM'.padEnd(cols, '-');
      if (timed) rhythm = rhythm.padEnd(startCol, ' ') + letters[k];
    });
    if (info.repeatStart && strings >= 4) {
      rows[1] = `*${rows[1].slice(1)}`;
      rows[strings - 2] = `*${rows[strings - 2].slice(1)}`;
    }
    if (info.repeatEnd && strings >= 4) {
      for (const i of [1, strings - 2]) rows[i] = `${rows[i].slice(0, -1)}*`;
    }
    const w = rows[0].length;
    return { rows: rows.map((r) => `${r}|`), chords: chords.padEnd(w + 1), lyrics: lyrics.padEnd(w + 1), pm: pm.padEnd(w + 1), rhythm: rhythm.padEnd(w + 1), width: w + 1 };
  });

  let line: Block[] = [];
  let used = nameWidth + 1;
  const flush = () => {
    if (!line.length) return;
    const pad = ' '.repeat(nameWidth + 1);
    const chordRow = pad + line.map((b) => b.chords).join('');
    const pmRow = pad + line.map((b) => b.pm).join('');
    if (pmRow.trim()) out.push(pmRow.replace(/\s+$/, ''));
    if (chordRow.trim()) out.push(chordRow.replace(/\s+$/, ''));
    const rhythmRow = pad + line.map((b) => b.rhythm).join('');
    if (rhythmRow.trim()) out.push(rhythmRow.replace(/\s+$/, ''));
    for (let i = 0; i < strings; i++) out.push(`${names[i].padEnd(nameWidth)}|${line.map((b) => b.rows[i]).join('')}`);
    const lyricRow = pad + line.map((b) => b.lyrics).join('');
    if (lyricRow.trim()) out.push(lyricRow.replace(/\s+$/, ''));
    out.push('');
    line = [];
    used = nameWidth + 1;
  };
  for (const b of blocks) {
    if (line.length && used + b.width > width) flush();
    line.push(b);
    used += b.width;
  }
  flush();
  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}

/** Format tag written into song JSON files. */
export const SONG_JSON_FORMAT = 'sixstring-song';
/** Current version of the JSON format. */
export const SONG_JSON_VERSION = 1;

/** The song as JSON text, wrapped with format and version. */
export function songToJson(song: Song, opts: { pretty?: boolean } = {}): string {
  return JSON.stringify({ format: SONG_JSON_FORMAT, version: SONG_JSON_VERSION, song }, null, opts.pretty === false ? undefined : 2);
}

/** Read song JSON (wrapped or a bare song). Throws a RangeError naming what is wrong. */
export function songFromJson(text: string): Song {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new RangeError(`Not JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  const obj = data as { format?: string; version?: number; song?: unknown };
  const candidate = (obj && typeof obj === 'object' && 'song' in obj ? obj.song : data) as Partial<Song>;
  if (obj && typeof obj === 'object' && obj.format && obj.format !== SONG_JSON_FORMAT) throw new RangeError(`Unknown JSON format "${obj.format}".`);
  if (obj?.version !== undefined && obj.version > SONG_JSON_VERSION) throw new RangeError(`Song JSON version ${obj.version} is newer than this app understands (${SONG_JSON_VERSION}).`);
  for (const k of ['meta', 'tuning', 'tempo', 'bars', 'tracks'] as const) {
    if (!candidate || typeof candidate !== 'object' || !(k in candidate)) throw new RangeError(`Song JSON is missing "${k}".`);
  }
  const c = candidate as Song;
  const song: Song = { ...c, sections: c.sections ?? [], chords: c.chords ?? [], annotations: c.annotations ?? [], capo: c.capo ?? 0 };
  const errors = validateSong(song, { notation: false }).filter((i) => i.level === 'error');
  if (errors.length) throw new RangeError(`Song JSON is not a valid song: ${errors[0].message}${errors.length > 1 ? ` (and ${errors.length - 1} more)` : ''}`);
  return song;
}

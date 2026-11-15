/**
 * SixTab serializer: any valid song back to the hand-typed format. Parsing the output gives the
 * same song for anything SixTab can express (`parseSixTab(toSixTab(s))` round-trips songs that
 * were parsed from SixTab). What it cannot express is approximated and listed by `sixTabLosses`:
 * merged-voice note lengths are dropped, durations no single value can write become tied notes,
 * and chord symbols, annotations and tempo changes inside a beat move to the start of that beat.
 */
import { identifyTuning } from '@/core/guitar';
import { midiToNote } from '@/core/theory';
import { barLength, formatTimeSig, slugify, splitTicks, valueFromTicks, valueTicks } from './model';
import type { Beat, Note, NoteValue, Song, Track } from './types';

/** Options for `toSixTab`. */
export interface SixTabWriteOptions {
  /** Bars per music line (default 4). */
  barsPerLine?: number;
}

const LETTER: Record<number, string> = { 1: 'w', 2: 'h', 4: 'q', 8: 'e', 16: 's' };

/** The duration token for a written value: `q`, `e.`, `e3`, `/32`. */
export function durationToken(value: NoteValue): string {
  const base = LETTER[value.base] ?? `/${value.base}`;
  return `${base}${'.'.repeat(value.dots ?? 0)}${value.tuplet ? value.tuplet.actual : ''}`;
}

function tuningText(tuning: readonly number[]): string {
  const known = identifyTuning([...tuning]);
  if (known && known.midi.length === tuning.length && known.midi.every((m, i) => m === tuning[i])) return known.id;
  return tuning.map((m) => midiToNote(m, { prefer: 'sharps' })).join(' ');
}

function sameValue(a: NoteValue | null, b: NoteValue | null): boolean {
  if (!a || !b) return false;
  return a.base === b.base && (a.dots ?? 0) === (b.dots ?? 0) && (a.tuplet?.actual ?? 0) === (b.tuplet?.actual ?? 0) && (a.tuplet?.normal ?? 0) === (b.tuplet?.normal ?? 0);
}

/** One beat as SixTab will write it, after splitting lengths no value can express. */
interface Piece {
  beat: Beat;
  value: NoteValue;
  /** A continuation of the beat before it (tied notes, or a rest after a slash). */
  continuation: boolean;
}

function piecesOf(beat: Beat): Piece[] {
  const stated = beat.value && Math.abs(valueTicks(beat.value) - beat.duration) < 1e-6 ? beat.value : null;
  const value = stated ?? valueFromTicks(beat.duration);
  if (value) return [{ beat, value, continuation: false }];
  const parts = splitTicks(beat.duration).filter((p) => p.value);
  return parts.map((p, i) => ({ beat, value: p.value!, continuation: i > 0 }));
}

function fretText(note: Note): string {
  if (note.tie) return '-';
  if (note.dead && note.fret === 0) return 'x';
  if (note.ghost && !note.harmonic) return `(${note.fret})`;
  if (note.harmonic === 'natural') return `<${note.fret}>`;
  return String(note.fret);
}

function noteText(note: Note, beatMods: string[], continuation: boolean): string {
  if (continuation) return `${note.string}:-`;
  let t = '';
  if (note.slideIn === 'below') t += '/';
  if (note.slideIn === 'above') t += '\\';
  t += `${note.string}:${fretText(note)}`;
  if (note.legato === 'hammer') t += 'h';
  if (note.legato === 'pull') t += 'p';
  if (note.slide) t += 's';
  if (note.tap) t += 't';
  if (note.vibrato) t += '~';
  if (note.accent) t += '>';
  if (note.bend) t += `b${note.bend.amount === 2 ? '' : note.bend.amount}${note.bend.release ? 'r' : ''}`;
  if (note.slideOut === 'up') t += '/';
  if (note.slideOut === 'down') t += '\\';
  const mods: string[] = [];
  if (note.palmMute) mods.push('pm');
  if (note.letRing) mods.push('lr');
  if (note.staccato) mods.push('st');
  if (note.dead && !(note.fret === 0 && !note.tie)) mods.push('x');
  if (note.ghost && note.harmonic) mods.push('gh');
  if (note.harmonic === 'artificial') mods.push('ah');
  if (note.harmonic === 'natural' && note.tie) mods.push('nh');
  if (note.bend?.pre) mods.push('pre');
  if (note.finger !== undefined) mods.push(String(note.finger));
  if (note.pluck) mods.push(note.pluck.toUpperCase());
  mods.push(...beatMods);
  return mods.length ? `${t}{${mods.join(' ')}}` : t;
}

function beatText(piece: Piece): string {
  const { beat, continuation } = piece;
  const strokeMods = !continuation && beat.stroke ? [beat.stroke === 'down' ? 'dn' : 'up'] : [];
  if (beat.slash) {
    if (continuation) return 'r';
    if (beat.mutedStrum) return `X${strokeMods.length && beat.stroke ? `{${strokeMods.join(' ')}}` : ''}`;
    if (beat.stroke === 'down') return 'D';
    if (beat.stroke === 'up') return 'U';
    return '/';
  }
  if (!beat.notes.length) return 'r';
  const notes = [...beat.notes].sort((a, b) => b.string - a.string);
  if (notes.length === 1) return noteText(notes[0], strokeMods, continuation);
  const inner = notes.map((n) => noteText(n, [], continuation)).join(' ');
  return strokeMods.length ? `(${inner}){${strokeMods.join(' ')}}` : `(${inner})`;
}

/** True for a beat a lyrics line sings on (the parser's rule: a slash, or notes that are not all tied). */
function singable(beat: Beat): boolean {
  return !!beat.slash || (beat.notes.length > 0 && !beat.notes.every((n) => n.tie));
}

/** What `toSixTab` cannot write exactly for this song (empty = a lossless round trip). */
export function sixTabLosses(song: Song): string[] {
  const out: string[] = [];
  song.tracks.forEach((t) =>
    t.measures.forEach((m, bar) =>
      m.beats.forEach((b) => {
        if (b.notes.some((n) => n.length !== undefined)) out.push(`Bar ${bar + 1} of "${t.name}": held note lengths (merged voices) are dropped.`);
        if (!valueFromTicks(b.duration)) out.push(`Bar ${bar + 1} of "${t.name}": a ${b.duration}-tick beat is written as tied notes.`);
        if (b.text) out.push(`Bar ${bar + 1} of "${t.name}": beat text becomes an annotation.`);
      }),
    ),
  );
  for (const tc of song.tempo) if ((tc.tick ?? 0) > 0) out.push(`Bar ${tc.bar + 1}: a tempo change inside the bar moves to the bar line.`);
  for (const tc of song.tempo) if (tc.ramp) out.push(`Bar ${tc.bar + 1}: a tempo ramp becomes a step change.`);
  return [...new Set(out)];
}

/** Write a song as SixTab text. */
export function toSixTab(song: Song, opts: SixTabWriteOptions = {}): string {
  const perLine = Math.max(1, opts.barsPerLine ?? 4);
  const out: string[] = [];
  const m = song.meta;
  out.push(`title: ${m.title}`);
  if (m.id !== slugify(m.title)) out.push(`id: ${m.id}`);
  if (m.composer) out.push(`composer: ${m.composer}`);
  if (m.artist) out.push(`artist: ${m.artist}`);
  if (m.arranger) out.push(`arranger: ${m.arranger}`);
  if (m.source) out.push(`source: ${m.source}`);
  if (m.licence) out.push(`licence: ${m.licence}`);
  if (m.difficulty !== undefined) out.push(`difficulty: ${m.difficulty}`);
  if (m.tags?.length) out.push(`tags: ${m.tags.join(', ')}`);
  const firstTempo = [...song.tempo].sort((a, b) => a.bar - b.bar || (a.tick ?? 0) - (b.tick ?? 0))[0];
  out.push(`tempo: ${firstTempo?.bpm ?? 100}`);
  if (song.bars[0]) out.push(`time: ${formatTimeSig(song.bars[0].time)}`);
  if (song.key) out.push(`key: ${song.key}`);
  out.push(`tuning: ${tuningText(song.tuning)}`);
  if (song.capo) out.push(`capo: ${song.capo}`);
  const pickup = song.bars[0]?.length;
  if (pickup !== undefined) {
    const v = valueFromTicks(pickup);
    if (v) out.push(`pickup: ${durationToken(v)}`);
  }

  const multi = song.tracks.length > 1 || song.tracks[0]?.name !== 'Guitar';
  song.tracks.forEach((track, ti) => {
    out.push('');
    if (multi) out.push(`track: ${track.name}`);
    if (multi || track.role !== 'lead') out.push(`role: ${track.role}`);
    if (track.tuning) out.push(`tuning: ${tuningText(track.tuning)}`);
    if (track.capo !== undefined) out.push(`capo: ${track.capo}`);
    writeTrack(song, track, ti === 0, perLine, out);
  });
  return `${out.join('\n')}\n`;
}

function writeTrack(song: Song, track: Track, first: boolean, perLine: number, out: string[]): void {
  let line: string[] = [];
  let lineBars = 0;
  let lyricBeats: Beat[] = [];
  let current: NoteValue | null = null;
  let lastTime = song.bars[0] ? formatTimeSig(song.bars[0].time) : '4/4';

  const flush = (closing: string) => {
    if (!lineBars) return;
    out.push(`${line.join(' ')} ${closing}`.trimEnd());
    const sung = lyricBeats.filter(singable);
    if (sung.some((b) => b.lyric)) {
      const syl = sung.map((b) => (b.lyric ? b.lyric.replace(/\s+/g, '') || '_' : '_'));
      while (syl.length && syl[syl.length - 1] === '_') syl.pop();
      out.push(`lyrics: ${syl.join(' ')}`);
    }
    line = [];
    lineBars = 0;
    lyricBeats = [];
  };

  track.measures.forEach((measure, bar) => {
    const info = song.bars[bar];
    const section = song.sections.find((s) => s.start === bar);
    const tempo = bar > 0 ? song.tempo.filter((t) => t.bar === bar).pop() : undefined;
    const time = formatTimeSig(info.time);
    const timeChange = bar > 0 && time !== lastTime;
    const keyChange = first && info.key;
    const breakHere = lineBars >= perLine || section || (first && tempo) || timeChange || keyChange || (info.repeatStart && lineBars > 0);
    if (breakHere) flush(closingBar(song, bar - 1));
    if (section) {
      out.push(`[${section.name}]`);
      if (first && section.strum) out.push(`strum: ${section.strum.pattern}`);
    }
    if (first && tempo) out.push(`tempo: ${tempo.bpm}`);
    if (timeChange) out.push(`time: ${time}`);
    if (keyChange) out.push(`key: ${info.key}`);
    lastTime = time;

    if (!lineBars) {
      line.push(info.repeatStart ? '|:' : '|');
      current = null;
    } else {
      line.push(barSeparator(song, bar - 1));
    }
    const prevInfo = song.bars[bar - 1];
    const continuesEnding = !!prevInfo?.ending && prevInfo.repeatEnd === undefined && prevInfo.ending.join() === info.ending?.join();
    if (info.ending && !continuesEnding) line.push(`[${info.ending.join(',')}]`);
    const chords = song.chords.filter((c) => c.bar === bar);
    const notes = song.annotations.filter((a) => a.bar === bar);
    const beats = measure.beats;
    beats.forEach((beat, bi) => {
      const end = beat.start + beat.duration;
      const isLast = bi === beats.length - 1;
      const inBeat = <T extends { tick: number }>(x: T) => x.tick >= beat.start && (x.tick < end || (isLast && x.tick < barLength(info)));
      if (first) for (const a of notes.filter(inBeat)) line.push(`^"${a.text.replace(/"/g, "'")}"`);
      if (beat.text) line.push(`^"${beat.text.replace(/"/g, "'")}"`);
      const chord = first ? chords.filter(inBeat).pop() : undefined;
      if (chord) line.push(chord.voicing ? `"${chord.symbol}=${frets(chord.voicing)}"` : `"${chord.symbol}"`);
      for (const piece of piecesOf(beat)) {
        if (!sameValue(current, piece.value)) {
          line.push(durationToken(piece.value));
          current = piece.value;
        }
        line.push(beatText(piece));
      }
      lyricBeats.push(beat);
    });
    lineBars++;
  });
  flush(closingBar(song, track.measures.length - 1));
}

function frets(v: ReadonlyArray<number | null>): string {
  const big = v.some((f) => f !== null && f > 9);
  return v.map((f) => (f === null ? 'x' : String(f))).join(big ? '-' : '');
}

/** The bar line between bar `bar` and the next one inside a music line. */
function barSeparator(song: Song, bar: number): string {
  const end = song.bars[bar]?.repeatEnd;
  const start = song.bars[bar + 1]?.repeatStart;
  // ":|:" ends one repeat and starts the next; with a count other than 2 the start is written separately.
  if (end !== undefined) return end === 2 ? (start ? ':|:' : ':|') : `:|x${end}${start ? ' |:' : ''}`;
  if (endsEnding(song, bar)) return start ? '|| |:' : '||';
  return start ? '|:' : '|';
}

/** The bar line that ends a music line after bar `bar`. */
function closingBar(song: Song, bar: number): string {
  const end = song.bars[bar]?.repeatEnd;
  if (end !== undefined) return `:|${end !== 2 ? `x${end}` : ''}`;
  return bar === song.bars.length - 1 || endsEnding(song, bar) ? '||' : '|';
}

/** True when `bar` is the last bar of a first/second-time ending that no repeat sign closes (the parser carries endings to the next "||"). */
function endsEnding(song: Song, bar: number): boolean {
  const info = song.bars[bar];
  const next = song.bars[bar + 1];
  return !!info?.ending && info.repeatEnd === undefined && (!next?.ending || next.ending.join() !== info.ending.join());
}

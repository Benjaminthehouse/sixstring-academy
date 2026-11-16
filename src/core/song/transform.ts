/**
 * Song transformations: transpose, change tuning or capo (re-fingering with the arranger), cut a
 * section or bar range out as a looping exercise, and slower practice versions. All return a new
 * song; the input is never changed.
 */
import { getKey, keyModeName, transposeBySemitones, transposeChordBySemitones } from '@/core/theory';
import { arrangeTrack, type ArrangeOptions } from './arranger';
import { MAX_FRET, barCapacity, barLength, cloneSong, midiOf, restBeats, slugify, tempoAtBar, trackCapo, trackTuning, uniqueId, valueFromTicks } from './model';
import type { BarInfo, Beat, ChordEvent, Note, Song, TimeSig, Track } from './types';

/**
 * Key name moved by semitones, keeping its mode; spelled the practical way (Gb rather than F# major
 * only when simpler). `transposeKey('Em', 1)` -> `Fm`; `transposeKey('A dorian', 2)` -> `B dorian`.
 */
export function transposeKey(key: string, semitones: number): string {
  const k = getKey(key);
  if (!k) return key;
  const mode = keyModeName(k);
  const semis = ((semitones % 12) + 12) % 12;
  const shifted = transposeBySemitones(k.tonic, semis, semitones >= 0 ? 'sharps' : 'flats');
  const candidates = [shifted, transposeBySemitones(k.tonic, semis, 'flats'), transposeBySemitones(k.tonic, semis, 'sharps')];
  let best = shifted;
  let bestCount = Infinity;
  for (const tonic of candidates) {
    const g = getKey({ tonic, mode: k.mode, modal: k.modal });
    if (g && !g.theoretical && g.signature.count < bestCount) {
      best = tonic;
      bestCount = g.signature.count;
    }
  }
  return k.modal ? `${best} ${mode}` : k.mode === 'minor' ? `${best}m` : best;
}

/** Options for `transposeSong`. */
export interface TransposeOptions extends ArrangeOptions {
  /**
   * `shift` (default): move every fret by the interval where the whole part stays on the neck,
   * keeping the fingering; otherwise re-arrange. `arrange`: always re-arrange for the new pitches.
   */
  mode?: 'shift' | 'arrange';
}

/** Transpose a song by semitones: notes, chord symbols (voicings dropped), key and key changes. */
export function transposeSong(song: Song, semitones: number, opts: TransposeOptions = {}): { song: Song; warnings: string[] } {
  const out = cloneSong(song);
  const warnings: string[] = [];
  if (!semitones) return { song: out, warnings };
  const newKey = out.key ? transposeKey(out.key, semitones) : undefined;
  const prefer = newKey && getKey(newKey) && getKey(newKey)!.signature.fifths < 0 ? 'flats' : 'sharps';
  if (newKey) out.key = newKey;
  for (const b of out.bars) if (b.key) b.key = transposeKey(b.key, semitones);
  out.chords = out.chords.map((c): ChordEvent => {
    const symbol = /^n\.?c\.?$/i.test(c.symbol) ? c.symbol : safeTransposeChord(c.symbol, semitones, prefer);
    return { bar: c.bar, tick: c.tick, symbol };
  });
  out.tracks = out.tracks.map((track) => {
    const tuning = trackTuning(out, track);
    const capo = trackCapo(out, track);
    const notes = track.measures.flatMap((m) => m.beats.flatMap((b) => b.notes));
    // Moving every fret keeps the fingering exactly, as long as the part stays on the neck.
    const canShift = notes.every((n) => n.fret + semitones >= 0 && n.fret + semitones <= Math.min(19, MAX_FRET));
    if (opts.mode !== 'arrange' && canShift) {
      for (const n of notes) {
        n.fret += semitones;
        n.midi = midiOf(n.string, n.fret, tuning, capo);
      }
      return track;
    }
    for (const n of notes) n.midi += semitones;
    const r = arrangeTrack(out, track, { ...opts, keepStrings: true });
    warnings.push(...r.warnings);
    return r.track;
  });
  return { song: out, warnings };
}

function safeTransposeChord(symbol: string, semitones: number, prefer: 'sharps' | 'flats'): string {
  try {
    return transposeChordBySemitones(symbol, semitones, prefer);
  } catch {
    return symbol;
  }
}

/** Options for `retuneSong`. */
export interface RetuneOptions extends Omit<ArrangeOptions, 'tuning' | 'capo'> {
  tuning?: number[];
  capo?: number;
  /**
   * `pitch` (default): the music sounds the same; frets are worked out again for the new tuning/capo.
   * `shapes`: the frets stay and the music moves with the tuning/capo (a capo transposes the song).
   */
  keep?: 'pitch' | 'shapes';
}

/** Change the tuning and/or capo of a song and its tracks. */
export function retuneSong(song: Song, opts: RetuneOptions): { song: Song; warnings: string[] } {
  const out = cloneSong(song);
  const warnings: string[] = [];
  const tuning = opts.tuning ?? out.tuning;
  const capo = opts.capo ?? out.capo;
  if (tuning.length !== out.tuning.length && opts.keep === 'shapes') throw new RangeError('Keeping the shapes needs a tuning with the same number of strings.');
  const deltas = tuning.map((m, i) => m + capo - (out.tuning[i] + out.capo));
  if (opts.keep === 'shapes') {
    const uniform = deltas.every((d) => d === deltas[0]);
    for (const track of out.tracks) {
      if (track.tuning || track.capo !== undefined) continue;
      for (const m of track.measures) for (const b of m.beats) for (const n of b.notes) n.midi = midiOf(n.string, n.fret, tuning, capo);
    }
    if (uniform && deltas[0]) {
      const shift = deltas[0];
      out.chords = out.chords.map((c) => ({ ...c, symbol: /^n\.?c\.?$/i.test(c.symbol) ? c.symbol : safeTransposeChord(c.symbol, shift, 'sharps') }));
      if (out.key) out.key = transposeKey(out.key, shift);
      for (const b of out.bars) if (b.key) b.key = transposeKey(b.key, shift);
    } else if (!uniform) {
      warnings.push('The strings moved by different amounts, so the chord symbols may no longer match what sounds.');
    }
    out.tuning = [...tuning];
    out.capo = capo;
    return { song: out, warnings };
  }
  out.tuning = [...tuning];
  out.capo = capo;
  // Chord shapes belong to the old tuning and capo.
  out.chords = out.chords.map((c) => ({ bar: c.bar, tick: c.tick, symbol: c.symbol }));
  out.tracks = out.tracks.map((track) => {
    if (track.tuning || track.capo !== undefined) return track;
    const r = arrangeTrack(out, track, { ...opts, tuning, capo, keepStrings: true, octaves: false });
    warnings.push(...r.warnings);
    return r.track;
  });
  return { song: out, warnings };
}

/** Options for `extractBars`. */
export interface ExtractOptions {
  /** Title of the exercise (default: "<title> (bars 5–8)"). */
  title?: string;
  /** Wrap the excerpt in repeat signs, played this many times in all (e.g. 4). */
  repeat?: number;
}

/**
 * Cut bars [from, to) out as a song of their own: the chord, tempo and key in force at `from`
 * carried in, ties and legato that start outside the range struck instead, repeat signs and
 * endings removed (the excerpt plays straight through, or `repeat` times).
 */
export function extractBars(song: Song, from: number, to: number, opts: ExtractOptions = {}): Song {
  const start = Math.max(0, Math.min(song.bars.length - 1, Math.floor(from)));
  const end = Math.max(start + 1, Math.min(song.bars.length, Math.floor(to)));
  const src = cloneSong(song);
  const title = opts.title ?? `${song.meta.title} (bar${end - start > 1 ? `s ${start + 1}–${end}` : ` ${start + 1}`})`;
  const bars: BarInfo[] = src.bars.slice(start, end).map((b, i) => ({
    time: b.time,
    ...(b.key ? { key: b.key } : {}),
    // A pickup stays a pickup only when the excerpt starts with it.
    ...(b.length !== undefined && start === 0 && i === 0 ? { length: b.length } : {}),
  }));
  if (opts.repeat && opts.repeat >= 2) {
    bars[0] = { ...bars[0], repeatStart: true };
    bars[bars.length - 1] = { ...bars[bars.length - 1], repeatEnd: Math.floor(opts.repeat) };
  }
  let key = song.key;
  for (let b = 0; b <= start; b++) if (song.bars[b]?.key) key = song.bars[b].key;
  if (bars[0].key) delete bars[0].key;
  const inRange = <T extends { bar: number }>(x: T) => x.bar >= start && x.bar < end;
  const chords = src.chords.filter(inRange).map((c) => ({ ...c, bar: c.bar - start }));
  if (!chords.some((c) => c.bar === 0 && c.tick === 0)) {
    const carried = [...src.chords].filter((c) => c.bar < start || (c.bar === start && c.tick === 0)).pop();
    if (carried) chords.unshift({ ...carried, bar: 0, tick: 0 });
  }
  const tempo = [{ bar: 0, bpm: tempoAtBar(song, start) }, ...src.tempo.filter((t) => inRange(t) && (t.bar > start || (t.tick ?? 0) > 0)).map((t) => ({ ...t, bar: t.bar - start }))];
  const sections = src.sections
    .filter((s) => s.end > start && s.start < end)
    .map((s) => ({ ...s, start: Math.max(0, s.start - start), end: Math.min(end, s.end) - start }));
  const tracks = src.tracks.map((t) => {
    const measures = t.measures.slice(start, end);
    // What the first bar continues from is not in the excerpt: strike it instead.
    const ringing = new Set<number>();
    let open = true;
    for (const m of measures) {
      for (const b of m.beats) {
        if (!open) break;
        if (!b.notes.length && !b.slash) {
          open = false;
          break;
        }
        for (const n of b.notes) {
          if (!ringing.has(n.string)) {
            delete n.tie;
            delete n.legato;
            delete n.slide;
          }
          ringing.add(n.string);
        }
      }
      break;
    }
    return { ...t, measures };
  });
  return {
    meta: { ...src.meta, id: `${src.meta.id}-${slugify(`bars ${start + 1} ${end}`)}`, title },
    tuning: src.tuning,
    capo: src.capo,
    ...(key ? { key } : {}),
    tempo,
    bars,
    sections,
    tracks,
    chords,
    annotations: src.annotations.filter(inRange).map((a) => ({ ...a, bar: a.bar - start })),
  };
}

/** Cut a section out by name (first one with that name, case-insensitive) or index. Null when there is none. */
export function extractSection(song: Song, section: string | number, opts: ExtractOptions = {}): Song | null {
  const s = typeof section === 'number' ? song.sections[section] : song.sections.find((x) => x.name.toLowerCase() === section.toLowerCase());
  if (!s) return null;
  const out = extractBars(song, s.start, s.end, { title: opts.title ?? `${song.meta.title}: ${s.name}`, ...opts });
  out.meta.id = `${song.meta.id}-${slugify(s.name)}`;
  return out;
}

/** The same song at `percent` of its tempo (every tempo change scaled). */
export function withTempoPercent(song: Song, percent: number): Song {
  const out = cloneSong(song);
  const f = Math.max(0.05, percent / 100);
  out.tempo = out.tempo.map((t) => ({ ...t, bpm: Math.round(t.bpm * f * 10) / 10 }));
  return out;
}

/** Practice versions at several speeds, slowest first (default 50, 70, 85 and 100 %). */
export function practiceVariants(song: Song, percents: number[] = [50, 70, 85, 100]): Array<{ percent: number; bpm: number; song: Song }> {
  return [...percents].sort((a, b) => a - b).map((percent) => {
    const s = withTempoPercent(song, percent);
    return { percent, bpm: s.tempo[0].bpm, song: s };
  });
}

/** Every note of a song with its track and position, for quick checks and statistics. */
export function allNotes(song: Song): Array<{ track: string; bar: number; beat: number; note: Note }> {
  const out: Array<{ track: string; bar: number; beat: number; note: Note }> = [];
  for (const t of song.tracks) t.measures.forEach((m, bar) => m.beats.forEach((b, beat) => b.notes.forEach((note) => out.push({ track: t.id, bar, beat, note }))));
  return out;
}

/**
 * One bar of strummed slashes from a strum pattern (`D-DU-UDU`: one character per equal step,
 * D down, U up, X muted, - or . no strum). Without a pattern (or one that does not divide the
 * bar): one downstroke per felt beat (dotted quarters in 6/8).
 */
export function strumBeats(time: TimeSig, pattern?: string): Beat[] {
  const cap = barCapacity(time);
  const pat = pattern?.replace(/\s+/g, '').toUpperCase();
  const beats: Beat[] = [];
  const push = (start: number, duration: number, c: string) => {
    const beat: Beat = c === '-' || c === '.' ? { start, duration, notes: [] } : { start, duration, notes: [], slash: true, stroke: c === 'U' ? 'up' : 'down' };
    if (c === 'X') beat.mutedStrum = true;
    const v = valueFromTicks(duration);
    if (v) beat.value = v;
    beats.push(beat);
  };
  if (pat && /^[DUX.\-]+$/.test(pat) && cap % pat.length === 0) {
    const step = cap / pat.length;
    for (let i = 0; i < pat.length; i++) {
      const c = pat[i];
      const prev = beats[beats.length - 1];
      // Consecutive skips are one rest.
      if ((c === '-' || c === '.') && prev && !prev.slash && !prev.notes.length) {
        prev.duration += step;
        const v = valueFromTicks(prev.duration);
        if (v) prev.value = v;
        else delete prev.value;
      } else push(i * step, step, c);
    }
    return beats;
  }
  const beat = ((960 * 4) / time.denominator) * (time.denominator === 8 && time.numerator % 3 === 0 && time.numerator > 3 ? 3 : 1);
  const n = Math.max(1, Math.round(cap / beat));
  for (let i = 0; i < n; i++) push(i * beat, i === n - 1 ? cap - i * beat : beat, 'D');
  return beats;
}

/**
 * Add (or replace) a rhythm track that strums the chord timeline: each section's strum pattern,
 * else `pattern`, else a downstroke per beat. A pickup bar stays silent.
 */
export function withStrumTrack(song: Song, opts: { name?: string; pattern?: string } = {}): Song {
  const out = cloneSong(song);
  const name = opts.name ?? 'Strumming';
  const measures = out.bars.map((info, bar) => {
    if (info.length !== undefined) return { beats: restBeats(0, barLength(info)) };
    const section = out.sections.find((s) => bar >= s.start && bar < s.end);
    return { beats: strumBeats(info.time, section?.strum?.pattern ?? opts.pattern) };
  });
  const existing = out.tracks.findIndex((t) => t.name === name && t.role === 'rhythm');
  const used = new Set(out.tracks.filter((_, i) => i !== existing).map((t) => t.id));
  const track: Track = { id: existing >= 0 ? out.tracks[existing].id : uniqueId(name, used), name, role: 'rhythm', measures };
  if (existing >= 0) out.tracks[existing] = track;
  else out.tracks.push(track);
  return out;
}

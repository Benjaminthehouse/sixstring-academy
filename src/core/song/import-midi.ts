/**
 * Standard MIDI file importer (through @tonejs/midi, loaded on demand): pick the best track (or a
 * given one), convert to 960 ticks per quarter, quantise to the grid that fits (sixteenths or
 * triplets), lay the notes out in bars from the file's time signatures, carry tempo, key and
 * lyrics, and let the arranger put it on the neck.
 */
import { getKey } from '@/core/theory';
import { arrangeTrack, type ArrangeOptions } from './arranger';
import { importFailure, SongImportError } from './import-error';
import { buildMeasures, chooseGrid, quantize, type Onset } from './import-util';
import { barCapacity, slugify, uniqueId } from './model';
import type { BarInfo, ImportResult, ImportWarning, Song, TempoChange, TimeSig } from './types';
import { PPQ } from './types';

/** Options for `importMidi`. */
export interface MidiImportOptions {
  /** Track index to import (see `listMidiTracks`); default the best guitar-like melodic track. */
  track?: number;
  /** Several tracks as several song tracks (guitar and bass, say), or 'all' for every track with notes except drums. */
  tracks?: number[] | 'all';
  /** Grid in ticks (960 per quarter) to quantise to everywhere; default chosen beat by beat from the notes (sixteenths or triplets). */
  grid?: number;
  /** Keep only the highest note where notes overlap (a melody out of a piano part). */
  melodyOnly?: boolean;
  title?: string;
  arrange?: ArrangeOptions;
}

/** What `listMidiTracks` reports about each track. */
export interface MidiTrackInfo {
  index: number;
  name: string;
  instrument: string;
  /** General MIDI program number 0–127. */
  program: number;
  channel: number;
  percussion: boolean;
  notes: number;
  low: number;
  high: number;
  /** Most notes sounding at once. */
  polyphony: number;
  /** How suitable it is as the guitar part (higher is better; 0 = unusable). */
  score: number;
}

type MidiFile = InstanceType<typeof import('@tonejs/midi').Midi>;

async function load(bytes: ArrayBuffer | Uint8Array): Promise<MidiFile> {
  const { Midi } = await import('@tonejs/midi');
  try {
    return new Midi(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  } catch (e) {
    // The MIDI reader's own words ("Bad MIDI file", "Offset is outside the bounds of the DataView") go to `detail`.
    throw importFailure('midi', e);
  }
}

function describe(midi: MidiFile): MidiTrackInfo[] {
  return midi.tracks.map((t, index) => {
    const notes = t.notes;
    const percussion = t.channel === 9 || t.instrument.percussion;
    const low = notes.length ? notes.reduce((m, n) => Math.min(m, n.midi), Infinity) : 0;
    const high = notes.length ? notes.reduce((m, n) => Math.max(m, n.midi), -Infinity) : 0;
    const events = notes.flatMap((n) => [[n.ticks, 1], [n.ticks + n.durationTicks, -1]] as Array<[number, number]>).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let now = 0;
    let polyphony = 0;
    for (const [, d] of events) {
      now += d;
      polyphony = Math.max(polyphony, now);
    }
    const program = t.instrument.number;
    const inRange = notes.length ? notes.filter((n) => n.midi >= 40 && n.midi <= 88).length / notes.length : 0;
    const guitar = program >= 24 && program <= 31;
    const bass = program >= 32 && program <= 39;
    const score = percussion || !notes.length ? 0 : notes.length * (0.3 + inRange) * (guitar ? 2 : bass ? 0.6 : 1) * (polyphony > 6 ? 0.6 : 1);
    return { index, name: t.name || `Track ${index + 1}`, instrument: t.instrument.name, program, channel: t.channel, percussion, notes: notes.length, low, high, polyphony, score };
  });
}

/** The tracks of a MIDI file, with how well each would work as the guitar part. */
export async function listMidiTracks(bytes: ArrayBuffer | Uint8Array): Promise<MidiTrackInfo[]> {
  return describe(await load(bytes));
}

/**
 * Quantise onsets beat by beat: each quarter-note beat takes the grid (sixteenths, eighth or
 * sixteenth triplets, thirty-seconds) that fits its onsets best, finer grids having to earn it,
 * so straight eighths and a triplet figure can sit in the same bar. Returns a function mapping any
 * tick (onset or note end) to the grid of the beat it falls in.
 */
export function beatGrids(onsets: readonly number[], fixed?: number): { snap: (tick: number) => number; grids: Map<number, number>; offGrid: number } {
  const grids = new Map<number, number>();
  if (fixed) return { snap: (t) => quantize(t, fixed), grids, offGrid: onsets.filter((t) => Math.abs(t - quantize(t, fixed)) > fixed / 4).length };
  const byBeat = new Map<number, number[]>();
  for (const t of onsets) {
    // A note a hair before the beat belongs to that beat.
    const beat = Math.floor((t + PPQ / 24) / PPQ);
    const list = byBeat.get(beat) ?? [];
    list.push(t - beat * PPQ);
    byBeat.set(beat, list);
  }
  let offGrid = 0;
  for (const [beat, list] of byBeat) {
    const g = chooseGrid(list.map((x) => Math.max(0, x)));
    grids.set(beat, g);
    offGrid += list.filter((x) => Math.abs(x - quantize(x, g)) > g / 4).length;
  }
  const snap = (t: number) => {
    const beat = Math.floor((t + PPQ / 24) / PPQ);
    const g = grids.get(beat) ?? PPQ / 4;
    return beat * PPQ + quantize(t - beat * PPQ, g);
  };
  return { snap, grids, offGrid };
}

/**
 * Import a Standard MIDI File: the best guitar-like track as a one-track song, or several tracks
 * (`tracks`). Throws a RangeError when nothing playable is in it.
 */
export async function importMidi(bytes: ArrayBuffer | Uint8Array, opts: MidiImportOptions = {}): Promise<ImportResult> {
  const midi = await load(bytes);
  const warnings: ImportWarning[] = [];
  const infos = describe(midi);
  const chosen = opts.track ?? [...infos].sort((a, b) => b.score - a.score)[0]?.index;
  const wanted = opts.tracks === 'all'
    ? infos.filter((i) => i.notes && !i.percussion).map((i) => i.index)
    : opts.tracks?.length ? opts.tracks.filter((i) => infos[i]?.notes) : chosen !== undefined ? [chosen] : [];
  const asked = wanted.map((i) => infos[i]).filter((i): i is MidiTrackInfo => !!i && i.notes > 0);
  // Drum tracks hold no pitches a guitar could play.
  const picked = asked.filter((i) => !i.percussion);
  if (asked.length > picked.length) warnings.push({ message: `${asked.length - picked.length} drum track${asked.length - picked.length > 1 ? 's were' : ' was'} left out.`, confidence: 0.9 });
  if (!picked.length) throw new SongImportError('The MIDI file has no notes to import.', { format: 'midi', detail: asked.length ? 'Only drum tracks have notes.' : 'No track has notes.' });
  if (opts.track === undefined && !opts.tracks && infos.filter((i) => i.score > 0).length > 1) {
    const info = picked[0];
    warnings.push({ message: `Track ${info.index + 1} ("${info.name}", ${info.instrument}) was chosen as the guitar part out of ${infos.filter((i) => i.notes).length}.`, confidence: 0.7 });
  }
  const ppq = midi.header.ppq || 480;
  const scale = PPQ / ppq;
  const raw = picked.map((info) => {
    let notes = midi.tracks[info.index].notes.map((n) => ({ midi: n.midi, tick: n.ticks * scale, dur: Math.max(1, n.durationTicks * scale), vel: n.velocity }));
    if (opts.melodyOnly) {
      notes = notes.filter((n) => !notes.some((m) => m !== n && m.midi > n.midi && m.tick < n.tick + n.dur * 0.5 && m.tick + m.dur > n.tick + n.dur * 0.5 && Math.abs(m.tick - n.tick) < PPQ / 8));
    }
    return { info, notes };
  });
  const all = raw.flatMap((r) => r.notes);
  const { snap, offGrid } = beatGrids(all.map((n) => n.tick), opts.grid);
  if (offGrid > all.length * 0.15) warnings.push({ message: 'Many notes are played off the beat (a live recording?); they were moved to the nearest sixteenth or triplet.', confidence: 0.5 });
  const placed = raw.map((r) => ({
    info: r.info,
    notes: r.notes.map((n) => {
      const tick = snap(n.tick);
      // A note's end snaps too, but it lasts at least a thirty-second.
      const end = Math.max(tick + PPQ / 8, snap(n.tick + n.dur));
      return { midi: n.midi, tick, dur: end - tick };
    }),
  }));

  // Bars from the time signatures.
  const sigs = [...midi.header.timeSignatures].sort((a, b) => a.ticks - b.ticks).map((s) => ({ tick: s.ticks * scale, time: { numerator: s.timeSignature[0] || 4, denominator: s.timeSignature[1] || 4 } as TimeSig }));
  if (!sigs.length || sigs[0].tick > 0) sigs.unshift({ tick: 0, time: sigs[0]?.time ?? { numerator: 4, denominator: 4 } });
  const end = placed.reduce((m, p) => p.notes.reduce((x, n) => Math.max(x, n.tick + n.dur), m), 0);
  const bars: BarInfo[] = [];
  const layout: Array<{ start: number; length: number }> = [];
  let at = 0;
  let si = 0;
  while (at < end || !bars.length) {
    while (si + 1 < sigs.length && sigs[si + 1].tick <= at + 1) si++;
    const time = sigs[si].time;
    const length = barCapacity(time);
    bars.push({ time: { ...time } });
    layout.push({ start: at, length });
    at += length;
  }
  const barOf = (tick: number) => {
    let i = 0;
    while (i + 1 < layout.length && layout[i + 1].start <= tick) i++;
    return i;
  };

  const tempo: TempoChange[] = [];
  for (const t of [...midi.header.tempos].sort((a, b) => a.ticks - b.ticks)) {
    const tick = snap(t.ticks * scale);
    const bar = barOf(tick);
    const inBar = Math.max(0, tick - layout[bar].start);
    const bpm = Math.round(t.bpm * 100) / 100;
    const last = tempo[tempo.length - 1];
    if (last && last.bar === bar && (last.tick ?? 0) === inBar) {
      last.bpm = bpm;
      continue;
    }
    if (last && last.bpm === bpm) continue;
    tempo.push({ bar, ...(inBar > 0 ? { tick: inBar } : {}), bpm });
  }
  if (!tempo.length || tempo[0].bar !== 0 || (tempo[0].tick ?? 0) > 0) tempo.unshift({ bar: 0, bpm: tempo[0]?.bpm ?? 120 });

  const lyricEvents = midi.header.meta.filter((m) => m.type === 'lyrics');
  const title = opts.title || midi.header.name || picked[0].name || 'Imported MIDI';
  const ks = midi.header.keySignatures[0];
  const key = ks ? getKey(`${ks.key} ${ks.scale}`)?.short : undefined;
  const guitarTuning = opts.arrange?.tuning ?? [40, 45, 50, 55, 59, 64];
  const song: Song = {
    meta: { id: slugify(title), title, source: 'Imported from a MIDI file' },
    tuning: guitarTuning,
    capo: opts.arrange?.capo ?? 0,
    ...(key ? { key } : {}),
    tempo,
    bars,
    sections: [],
    tracks: [],
    chords: [],
    annotations: [],
  };
  const used = new Set<string>();
  placed.forEach(({ info, notes }, k) => {
    const bass = info.program >= 32 && info.program <= 39;
    const onsets = new Map<number, Onset>();
    for (const n of notes) {
      const o = onsets.get(n.tick) ?? { tick: n.tick, notes: [] };
      if (!o.notes.some((x) => x.midi === n.midi)) o.notes.push({ midi: n.midi, sustain: n.dur });
      onsets.set(n.tick, o);
    }
    if (k === 0) {
      // Sung words (lyric events) go on the first track's notes.
      for (const ev of lyricEvents) {
        const o = onsets.get(snap(ev.ticks * scale));
        const text = ev.text.replace(/[\r\n/\\]/g, '').trim();
        if (o && text) o.lyric = text;
      }
    }
    const tuning = bass ? [28, 33, 38, 43] : guitarTuning;
    const measures = buildMeasures([...onsets.values()], layout, { tuning, capo: song.capo, minRest: PPQ / 4 });
    const name = info.name || (bass ? 'Bass' : 'Guitar');
    const track = { id: uniqueId(name, used), name, role: (bass ? 'bass' : 'lead') as 'bass' | 'lead', ...(bass ? { tuning } : {}), measures };
    const r = arrangeTrack(song, track, bass ? { ...opts.arrange, tuning, capo: 0 } : opts.arrange);
    song.tracks.push(r.track);
    warnings.push(...r.warnings.map((message) => ({ message: placed.length > 1 ? `${name}: ${message}` : message, confidence: 0.7 })));
  });
  warnings.push({ message: 'Strings and frets were chosen by the arranger; MIDI files carry no tab.', confidence: 0.8 });
  return { song, warnings, confidence: offGrid > all.length * 0.15 ? 0.5 : 0.8 };
}

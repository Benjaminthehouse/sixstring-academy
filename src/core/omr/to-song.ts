/**
 * A thin converter from a reading (one page or a document) to the app's Song model, for the
 * screen that lets the learner play along after proofreading:
 *
 *   const { song, warnings, confidence, estimatedRhythm } = omrToSong(doc, { title: 'My song' });
 *
 * One guitar track; one bar per measure of the joined systems. Where a tab staff exists its
 * strings and frets are used (pitches follow from them); notation alone is given frets low on the
 * neck. Durations come from the reading (read, copied from the notation, or estimated from the
 * spacing); a measure that does not add up is padded with a rest or cut at the bar line, with a
 * warning, so the song is always valid. Chord symbols that were read (or filled by the AI) become
 * chord events; ties, dead notes and natural harmonics carry over.
 */
import { type Beat, type ChordEvent, type ImportResult, type ImportWarning, type Note, type NoteValue, type Song, createSong } from '@/core/song';
import { type OmrDocument, joinPages } from './pipeline';
import { metreTicks } from './reconcile';
import { type DurationValue, type OmrEvent, type OmrMeasure, type OmrPage, type OmrStaff, STANDARD_TUNING, isNotationEvent, isTabEvent } from './types';

const BASE: Record<DurationValue, number> = { whole: 1, half: 2, quarter: 4, eighth: 8, '16th': 16, '32nd': 32 };
const KEYS: Record<number, string> = { [-7]: 'Cb', [-6]: 'Gb', [-5]: 'Db', [-4]: 'Ab', [-3]: 'Eb', [-2]: 'Bb', [-1]: 'F', 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#' };

/** Options for {@link omrToSong}. */
export interface OmrToSongOptions {
  title?: string;
  /** Quarter notes per minute (default: 90). */
  bpm?: number;
  /** Open strings, sounding MIDI low to high (default standard tuning). */
  tuning?: number[];
}

/** Strings and frets for sounding pitches played together: each on its own string, low frets first. */
function fretChord(midis: number[], tuning: readonly number[]): { string: number; fret: number; midi: number }[] {
  const strings = tuning.length;
  const out: { string: number; fret: number; midi: number }[] = [];
  const used = new Set<number>();
  for (const m of midis.slice().sort((a, b) => b - a)) {
    let best: { string: number; fret: number; cost: number } | null = null;
    for (let s = 1; s <= strings; s++) {
      if (used.has(s)) continue;
      const fret = m - tuning[strings - s];
      if (fret < 0 || fret > 20) continue;
      const cost = fret + (out.length && s < Math.max(...out.map((o) => o.string)) ? 50 : 0);
      if (!best || cost < best.cost) best = { string: s, fret, cost };
    }
    if (best) {
      used.add(best.string);
      out.push({ string: best.string, fret: best.fret, midi: m });
    }
  }
  return out;
}

function noteValue(e: OmrEvent): NoteValue | undefined {
  const d = e.duration;
  if (!d) return undefined;
  return { base: BASE[d.value], ...(d.dots ? { dots: d.dots } : {}), ...(d.tuplet ? { tuplet: d.tuplet } : {}) };
}

/** Notes of one event as Song notes. */
function notesOf(e: OmrEvent, tuning: readonly number[]): Note[] {
  if (isTabEvent(e)) {
    if (e.kind !== 'tab') return [];
    return e.notes.map((n) => {
      const out: Note = { string: n.string, fret: n.fret, midi: tuning[tuning.length - n.string] + n.fret };
      if (n.tieStop) out.tie = true;
      if (n.technique?.includes('x')) out.dead = true;
      if (n.technique?.includes('<>')) out.harmonic = 'natural';
      return out;
    });
  }
  if (!isNotationEvent(e) || e.kind !== 'chord') return [];
  const linked = e.notes.every((n) => n.string !== undefined && n.fret !== undefined);
  if (linked) return e.notes.map((n) => ({ string: n.string as number, fret: n.fret as number, midi: tuning[tuning.length - (n.string as number)] + (n.fret as number), ...(n.tieStop ? { tie: true } : {}) }));
  const frets = fretChord(e.notes.map((n) => n.pitch.midi), tuning);
  return frets.map((f) => ({ ...f, ...(e.notes.find((n) => n.pitch.midi === f.midi)?.tieStop ? { tie: true } : {}) }));
}

/** Convert a reading to a Song (see the file comment). */
export function omrToSong(input: OmrPage | OmrDocument, opts: OmrToSongOptions = {}): ImportResult {
  const doc: OmrDocument = 'pages' in input ? input : joinPages([input]);
  const tuning = opts.tuning ?? STANDARD_TUNING.slice();
  const warnings: ImportWarning[] = [];
  const confidences: number[] = [];
  let estimated = false;
  const title = opts.title ?? doc.pages.flatMap((p) => p.texts).find((t) => t.kind === 'title' && t.text)?.text ?? 'Scanned music';
  const bars: Song['bars'] = [];
  const beatsPerBar: Beat[][] = [];
  const chords: ChordEvent[] = [];
  let key: string | undefined;
  doc.measures.forEach((ref, barIndex) => {
    const page = doc.pages[ref.page];
    const sys = page.systems.find((s) => s.index === ref.system);
    if (!sys) return;
    const staves = ref.staffIds.map((id) => sys.staves.find((s) => s.id === id)).filter((s): s is OmrStaff => !!s);
    const tabStaff = staves.find((s) => s.kind === 'tab');
    const notation = staves.find((s) => s.kind === 'notation');
    const lead = tabStaff ?? notation;
    if (!lead) return;
    if (key === undefined && notation?.keyInForce) key = KEYS[notation.keyInForce.fifths];
    const t = lead.timeInForce ?? notation?.timeInForce ?? { beats: 4, beatValue: 4 };
    const full = metreTicks(t.beats, t.beatValue);
    const m: OmrMeasure | undefined = lead.measures[ref.measureIndex];
    // Tab under notation leaves rests out: take the events (and rests) of the notation, with the
    // tab's strings and frets through the links.
    const nm = notation?.measures[ref.measureIndex];
    const events: OmrEvent[] = tabStaff && notation && nm ? nm.events.slice() : (m?.events ?? []).slice();
    events.sort((a, b) => a.x - b.x);
    const beats: Beat[] = [];
    let at = 0;
    for (const e of events) {
      if (isNotationEvent(e) && e.grace) continue;
      const tabPartner = tabStaff && isNotationEvent(e) && e.linkedEventId ? tabStaff.measures.flatMap((q) => q.events).find((q) => q.id === e.linkedEventId) : undefined;
      const dur = e.duration?.ticks ?? 0;
      if (!dur) continue;
      if (e.duration?.source === 'inferred') estimated = true;
      const notes = notesOf(tabPartner ?? e, tuning);
      for (const n of [...(tabPartner ?? e).notes]) confidences.push(n.confidence);
      const value = noteValue(e);
      beats.push({ start: at, duration: dur, notes, ...(value ? { value } : {}) });
      at += dur;
    }
    const length = m?.pickup || nm?.pickup ? Math.max(1, at) : full;
    if (at < length) {
      if (at > 0 && !(m?.pickup || nm?.pickup)) warnings.push({ message: `Measure ${barIndex + 1} adds up to less than the time signature; a rest was added at its end.`, bar: barIndex, confidence: 0.4 });
      beats.push({ start: at, duration: length - at, notes: [] });
    } else if (at > length) {
      warnings.push({ message: `Measure ${barIndex + 1} adds up to more than the time signature; what runs past the bar line was cut.`, bar: barIndex, confidence: 0.3 });
      while (beats.length && beats[beats.length - 1].start >= length) beats.pop();
      const last = beats[beats.length - 1];
      if (last) {
        last.duration = length - last.start;
        delete last.value;
      }
    }
    bars.push({ time: { numerator: t.beats, denominator: t.beatValue }, ...(length !== full ? { length } : {}) });
    beatsPerBar.push(beats);
    // Chord symbols of this measure, at the beat nearest to them.
    for (const text of sys.texts) {
      if (text.kind !== 'chord-symbol' || !text.text || text.x === undefined) continue;
      const span = m ?? nm;
      if (!span || text.x < span.x0 || text.x >= span.x1) continue;
      let tick = 0;
      let best = Infinity;
      events.forEach((e, k) => {
        const d = Math.abs(e.x - text.x!);
        if (d < best && beats[k]) {
          best = d;
          tick = beats[k].start;
        }
      });
      chords.push({ bar: barIndex, tick, symbol: text.text });
    }
  });
  const song = createSong({ meta: { title, source: 'Read from a picture of the sheet' }, tuning, bars: Math.max(1, bars.length), bpm: opts.bpm ?? 90, ...(key ? { key } : {}) });
  if (bars.length) {
    song.bars = bars;
    song.tracks[0].measures = beatsPerBar.map((beats) => ({ beats }));
  }
  song.chords = chords.sort((a, b) => a.bar - b.bar || a.tick - b.tick);
  if (estimated) warnings.push({ message: 'Some note lengths were estimated from the spacing; check the rhythm by ear.', confidence: 0.3 });
  const confidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;
  return { song, warnings, confidence: Math.round(confidence * 100) / 100, ...(estimated ? { estimatedRhythm: true } : {}) };
}

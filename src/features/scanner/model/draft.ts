/**
 * The proofreading draft: a Song built from a sheet reading, with a "mark" beside every bar, beat
 * and note that remembers where it came from on the picture, how sure the reader was, what else it
 * might be, and whether the learner has checked it.
 *
 *   const draft = buildDraft(doc);            // OmrDocument from the worker
 *   viewSong(draft)                           // a valid Song for TabView and playback, always
 *   finalSong(draft)                          // what is saved: bars that do not add up are fixed, with warnings
 *
 * The draft's own song keeps what the learner typed even when a bar does not add up yet (they may
 * be halfway through fixing it); `viewSong` shows such a bar honestly (a longer bar prints its real
 * length as a time signature, a short one gets a rest), and `finalSong` makes it valid.
 *
 * Built like `omrToSong` in `@/core/omr` (same bars, beats and frets; the tests check that), plus:
 * provenance for the proofreader, and the right tuning for four-, five- and seven-line tab staves
 * (the page assembler labels every tab staff with guitar tuning).
 */
import { type Beat, type ChordEvent, type NoteValue, type Note, type Song, barLength, createSong, describeTicks, isChordWord, midiOf, valueFromTicks, valueTicks } from '@/core/song';
import type { OmrDocument } from '@/core/omr/pipeline';
import { type BBox, type DurationValue, type OmrEvent, type OmrIssue, type OmrMeasure, type OmrNote, type OmrStaff, type OmrTabEvent, type OmrTabNote, isNotationEvent, isTabEvent } from '@/core/omr/types';
import { parseTempoText } from './tempo';

/** Below this a reading is a guess (the reader's own threshold). */
export const GUESS = 0.5;

/** Who a reading comes from. */
export type MarkSource = 'image' | 'merged' | 'inferred' | 'ai' | 'user';

/** Where one note came from and how sure the reader was. */
export interface NoteMark {
  /** Ids of the reader's elements (tab number, note head). */
  ids: string[];
  /** Their boxes on the page picture (page px). */
  boxes: BBox[];
  /** 0..1; 1 once the learner fixed or confirmed it. */
  confidence: number;
  /** Other frets the reader considered (tab), best first. */
  altFrets: number[];
  /** Other sounding pitches the reader considered (notation), best first. */
  altMidis: number[];
  /** Why it is doubtful, in words. */
  reasons: string[];
  source: MarkSource;
  /** The learner looked at it (fixed, confirmed or added it). */
  checked: boolean;
}

/** Where one beat (note, chord or rest) came from; its `notes` run parallel to the beat's notes. */
export interface BeatMark {
  ids: string[];
  boxes: BBox[];
  /** Confidence of the rhythm (note length). */
  confidence: number;
  /** Other lengths the reader considered, best first. */
  altValues: NoteValue[];
  reasons: string[];
  source: MarkSource;
  checked: boolean;
  notes: NoteMark[];
}

/** Which staves a bar was read from. */
export type BarSource = 'tab' | 'notation' | 'both';

/** Where one bar came from. */
export interface BarMark {
  /** 0-based page of the document. */
  page: number;
  /** System index on that page. */
  system: number;
  /** The measure on the page (all its staves), page px. */
  box: BBox | null;
  /** The whole system, page px (to zoom the picture to the line). */
  systemBox: BBox | null;
  source: BarSource;
  /** Note lengths were estimated from the spacing (no rhythm printed). */
  estimated: boolean;
  beats: BeatMark[];
}

/** The song being proofread and the marks beside it. */
export interface Draft {
  song: Song;
  marks: BarMark[];
  /** Pages the reading came from. */
  pageCount: number;
  /** No tab staff anywhere: strings and frets were chosen by the app (see `positions.ts`). */
  notationOnly: boolean;
  /** Some bar has a notation staff (show notation above the tab). */
  hasNotation: boolean;
  /** Lines of the tab staves (6 guitar, 4 bass ...); 0 for notation only. */
  tabLines: number;
  /** Things the learner should know about the whole reading. */
  notes: string[];
}

/** Sounding open strings, low to high, for a tab staff of this many lines (as the tab reader assumes). */
export const LINE_TUNINGS: Record<number, { tuning: number[]; name: string; role: 'lead' | 'bass' }> = {
  4: { tuning: [28, 33, 38, 43], name: 'bass in standard tuning (E A D G)', role: 'bass' },
  5: { tuning: [23, 28, 33, 38, 43], name: 'five-string bass (B E A D G)', role: 'bass' },
  6: { tuning: [40, 45, 50, 55, 59, 64], name: 'guitar in standard tuning', role: 'lead' },
  7: { tuning: [35, 40, 45, 50, 55, 59, 64], name: 'seven-string guitar (B E A D G B E)', role: 'lead' },
};

const STANDARD = LINE_TUNINGS[6].tuning;
const BASE: Record<DurationValue, number> = { whole: 1, half: 2, quarter: 4, eighth: 8, '16th': 16, '32nd': 32 };
const KEYS: Record<number, string> = { [-7]: 'Cb', [-6]: 'Gb', [-5]: 'Db', [-4]: 'Ab', [-3]: 'Eb', [-2]: 'Bb', [-1]: 'F', 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#' };

/** Ticks of a metre: 4/4 = 3840. */
export function metreTicks(beats: number, beatValue: number): number {
  return Math.round((beats * 3840) / beatValue);
}

function union(boxes: (BBox | null | undefined)[]): BBox | null {
  const list = boxes.filter((b): b is BBox => !!b && b.w >= 0 && b.h >= 0);
  if (!list.length) return null;
  const x0 = Math.min(...list.map((b) => b.x));
  const y0 = Math.min(...list.map((b) => b.y));
  const x1 = Math.max(...list.map((b) => b.x + b.w));
  const y1 = Math.max(...list.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function reasonsOf(...lists: (OmrIssue[] | undefined)[]): string[] {
  const out: string[] = [];
  for (const l of lists) for (const i of l ?? []) if (!out.includes(i.message)) out.push(i.message);
  return out;
}

function sourceOf(s: string | undefined): MarkSource {
  return s === 'ai' || s === 'merged' || s === 'inferred' || s === 'user' ? s : 'image';
}

/** Strings and frets for pitches struck together: each on its own string, low frets first (as `omrToSong`). */
export function fretChord(midis: number[], tuning: readonly number[]): { string: number; fret: number; midi: number }[] {
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

function noteValueOf(e: OmrEvent): NoteValue | undefined {
  const d = e.duration;
  if (!d) return undefined;
  return { base: BASE[d.value], ...(d.dots ? { dots: d.dots } : {}), ...(d.tuplet ? { tuplet: d.tuplet } : {}) };
}

function emptyNoteMark(): NoteMark {
  return { ids: [], boxes: [], confidence: 1, altFrets: [], altMidis: [], reasons: [], source: 'user', checked: true };
}

/** A fresh mark for a note the learner added. */
export function userNoteMark(): NoteMark {
  return emptyNoteMark();
}

/** A fresh mark for a beat the learner added. */
export function userBeatMark(): BeatMark {
  return { ids: [], boxes: [], confidence: 1, altValues: [], reasons: [], source: 'user', checked: true, notes: [] };
}

/** Notes of a tab column as Song notes with their marks; `partner` = the notation chord linked to it. */
function tabNotes(e: OmrTabEvent, tuning: readonly number[], partner: OmrEvent | undefined, dropped: { count: number }): { notes: Note[]; marks: NoteMark[] } {
  const notes: Note[] = [];
  const marks: NoteMark[] = [];
  if (e.kind !== 'tab') return { notes, marks };
  const heads: OmrNote[] = partner && isNotationEvent(partner) ? partner.notes : [];
  const usedStrings = new Set<number>();
  // Best reading first, so a duplicate on one string keeps the surer number.
  const order = e.notes.slice().sort((a, b) => b.confidence - a.confidence);
  for (const n of order) {
    if (n.string < 1 || n.string > tuning.length || usedStrings.has(n.string)) {
      dropped.count++;
      continue;
    }
    usedStrings.add(n.string);
    const out: Note = { string: n.string, fret: n.fret, midi: midiOf(n.string, n.fret, tuning) };
    if (n.tieStop) out.tie = true;
    if (n.technique?.includes('x')) out.dead = true;
    if (n.technique?.includes('<>')) out.harmonic = 'natural';
    const head = heads.find((h) => h.string === n.string && h.fret === n.fret) ?? heads.find((h) => h.string === n.string);
    notes.push(out);
    marks.push(tabNoteMark(n, head));
  }
  // Keep the column's own order (top string first) for a stable display.
  const idx = notes.map((_, i) => i).sort((a, b) => notes[a].string - notes[b].string);
  return { notes: idx.map((i) => notes[i]), marks: idx.map((i) => marks[i]) };
}

function tabNoteMark(n: OmrTabNote, head: OmrNote | undefined): NoteMark {
  return {
    ids: [n.id, ...(head ? [head.id] : [])],
    boxes: [n.bbox, ...(head ? [head.bbox] : [])],
    confidence: n.confidence,
    altFrets: (n.alternatives ?? []).map((a) => a.value).filter((f) => f !== n.fret && f >= 0 && f <= 24),
    altMidis: [],
    reasons: reasonsOf(n.issues, head?.issues),
    source: sourceOf(n.source),
    checked: false,
  };
}

function headMark(n: OmrNote): NoteMark {
  return {
    ids: [n.id],
    boxes: [n.bbox],
    confidence: n.confidence,
    altFrets: [],
    altMidis: (n.alternatives ?? []).map((a) => a.value.midi).filter((m) => m !== n.pitch.midi),
    reasons: reasonsOf(n.issues),
    source: sourceOf(n.source),
    checked: false,
  };
}

/** Options for {@link buildDraft}. */
export interface BuildDraftOptions {
  title?: string;
  /** Quarter notes per minute (default: from a tempo marking on the page, else 90). */
  bpm?: number;
}

/** The tab line count of a reading (the first tab staff), or 0 when it has no tab. */
export function tabLinesOf(doc: OmrDocument): number {
  for (const p of doc.pages) for (const s of p.systems) for (const st of s.staves) if (st.kind === 'tab') return st.lineCount;
  return 0;
}

/** Build the draft from a reading (see the file comment). */
export function buildDraft(doc: OmrDocument, opts: BuildDraftOptions = {}): Draft {
  const lines = tabLinesOf(doc);
  const line = LINE_TUNINGS[lines];
  const tuning = line ? line.tuning.slice() : STANDARD.slice();
  const notes: string[] = [];
  if (lines && lines !== 6) notes.push(line ? `This tab has ${lines} lines, so it is read as ${line.name}.` : `This tab has ${lines} lines; it is read with guitar tuning. Check the tuning.`);
  const dropped = { count: 0 };
  let estimated = false;
  let hasNotation = false;
  let anyTab = false;
  let key: string | undefined;
  const bars: Song['bars'] = [];
  const measures: { beats: Beat[] }[] = [];
  const marks: BarMark[] = [];
  const chords: ChordEvent[] = [];

  doc.measures.forEach((ref) => {
    const page = doc.pages[ref.page];
    const sys = page?.systems.find((s) => s.index === ref.system);
    if (!sys) return;
    const barIndex = bars.length;
    const staves = ref.staffIds.map((id) => sys.staves.find((s) => s.id === id)).filter((s): s is OmrStaff => !!s);
    const tabStaff = staves.find((s) => s.kind === 'tab');
    const notation = staves.find((s) => s.kind === 'notation');
    const lead = tabStaff ?? notation;
    if (!lead) return;
    if (notation) hasNotation = true;
    if (tabStaff) anyTab = true;
    if (key === undefined && notation?.keyInForce) key = KEYS[notation.keyInForce.fifths];
    const t = lead.timeInForce ?? notation?.timeInForce ?? { beats: 4, beatValue: 4 };
    const full = metreTicks(t.beats, t.beatValue);
    const m: OmrMeasure | undefined = lead.measures[ref.measureIndex];
    const nm = notation?.measures[ref.measureIndex];
    const tm = tabStaff?.measures[ref.measureIndex];
    const events: OmrEvent[] = (tabStaff && notation && nm ? nm.events : m?.events ?? []).slice().sort((a, b) => a.x - b.x);
    const tabEvents = tabStaff ? [...(tm?.events ?? []), ...tabStaff.measures.flatMap((q) => q.events)] : [];
    const beats: Beat[] = [];
    const beatMarks: BeatMark[] = [];
    let barEstimated = false;
    let at = 0;
    for (const e of events) {
      if (isNotationEvent(e) && e.grace) continue;
      const dur = e.duration?.ticks ?? 0;
      if (!dur) continue;
      if (e.duration?.source === 'inferred') {
        estimated = true;
        barEstimated = true;
      }
      const partner = tabStaff && isNotationEvent(e) && e.linkedEventId ? tabEvents.find((q) => q.id === e.linkedEventId) : undefined;
      let beatNotes: Note[] = [];
      let noteMarks: NoteMark[] = [];
      if (partner && isTabEvent(partner)) {
        ({ notes: beatNotes, marks: noteMarks } = tabNotes(partner, tuning, e, dropped));
      } else if (isTabEvent(e)) {
        ({ notes: beatNotes, marks: noteMarks } = tabNotes(e, tuning, undefined, dropped));
      } else if (isNotationEvent(e) && e.kind === 'chord') {
        const linked = e.notes.length > 0 && e.notes.every((n) => n.string !== undefined && n.fret !== undefined && n.string <= tuning.length);
        if (linked) {
          for (const n of e.notes) {
            beatNotes.push({ string: n.string as number, fret: n.fret as number, midi: midiOf(n.string as number, n.fret as number, tuning), ...(n.tieStop ? { tie: true } : {}) });
            noteMarks.push(headMark(n));
          }
        } else {
          for (const f of fretChord(e.notes.map((n) => n.pitch.midi), tuning)) {
            const head = e.notes.find((n) => n.pitch.midi === f.midi);
            beatNotes.push({ ...f, ...(head?.tieStop ? { tie: true } : {}) });
            noteMarks.push(head ? headMark(head) : emptyNoteMark());
          }
          if (beatNotes.length < e.notes.length) dropped.count += e.notes.length - beatNotes.length;
        }
      }
      const value = noteValueOf(e);
      beats.push({ start: at, duration: dur, notes: beatNotes, ...(value ? { value } : {}) });
      const d = e.duration!;
      beatMarks.push({
        ids: [e.id, ...(partner ? [partner.id] : [])],
        boxes: [e.bbox, ...(partner ? [partner.bbox] : [])],
        confidence: d.confidence,
        altValues: (d.alternatives ?? []).map((a) => ({ base: BASE[a.value.value], ...(a.value.dots ? { dots: a.value.dots } : {}) })),
        reasons: reasonsOf(e.issues, partner?.issues),
        source: sourceOf(d.source),
        checked: false,
        notes: noteMarks,
      });
      at += dur;
    }
    const pickup = !!(m?.pickup || nm?.pickup) && at > 0 && at < full && barIndex === 0;
    bars.push({ time: { numerator: t.beats, denominator: t.beatValue }, ...(pickup ? { length: at } : {}) });
    measures.push({ beats });
    const boxes = staves.map((st) => {
      const sm = st.measures[ref.measureIndex];
      const g = st.geometry.bbox;
      return sm ? { x: sm.x0, y: g.y, w: sm.x1 - sm.x0, h: g.h } : null;
    });
    marks.push({ page: ref.page, system: sys.index, box: union(boxes), systemBox: sys.bbox ?? null, source: tabStaff && notation ? 'both' : tabStaff ? 'tab' : 'notation', estimated: barEstimated, beats: beatMarks });
    // Chord symbols of this measure, at the beat nearest to them.
    for (const text of sys.texts) {
      if (text.kind !== 'chord-symbol' || text.x === undefined) continue;
      const symbol = text.text.trim();
      if (!symbol || !isChordWord(symbol)) continue;
      const span = m ?? nm;
      if (!span || text.x < span.x0 || text.x >= span.x1) continue;
      let tick = 0;
      let best = Infinity;
      events.forEach((e, k) => {
        const dx = Math.abs(e.x - text.x!);
        if (dx < best && beats[k]) {
          best = dx;
          tick = beats[k].start;
        }
      });
      chords.push({ bar: barIndex, tick, symbol: symbol.replace(/^[(\[]|[)\]]$/g, '') });
    }
  });

  const texts = doc.pages.flatMap((p) => [...p.texts, ...p.systems.flatMap((s) => s.texts)]);
  const title = opts.title ?? texts.find((t) => t.kind === 'title' && t.text.trim())?.text.trim() ?? 'Scanned music';
  const composer = texts.find((t) => t.kind === 'composer' && t.text.trim())?.text.trim();
  const tempoText = texts.find((t) => t.kind === 'tempo' && t.text.trim())?.text;
  const bpm = opts.bpm ?? (tempoText ? parseTempoText(tempoText) : null) ?? 90;
  const song = createSong({
    meta: { title, ...(composer ? { composer } : {}), source: 'Read from a picture of the sheet' },
    tuning,
    bars: Math.max(1, bars.length),
    bpm,
    ...(key ? { key } : {}),
    tracks: [{ name: line?.role === 'bass' ? 'Bass' : 'Guitar', role: line?.role ?? 'lead' }],
  });
  if (bars.length) {
    song.bars = bars;
    song.tracks[0].measures = measures;
  } else {
    marks.push({ page: 0, system: 0, box: null, systemBox: null, source: 'tab', estimated: false, beats: [userBeatMark()] });
    notes.push('No music was found on the picture.');
  }
  song.chords = chords.sort((a, b) => a.bar - b.bar || a.tick - b.tick);
  if (estimated) notes.push('No rhythm is printed in some bars, so note lengths there were estimated from the spacing. Play it back to check.');
  if (dropped.count) notes.push(`${dropped.count} ${dropped.count === 1 ? 'note was' : 'notes were'} left out because two landed on one string.`);
  return { song, marks, pageCount: doc.pages.length, notationOnly: !anyTab && hasNotation, hasNotation, tabLines: lines, notes };
}

// ------------------------------------------------------------------------------------------
// Bar checks and the two songs made from a draft
// ------------------------------------------------------------------------------------------

/** How a bar adds up against its time signature. */
export interface BarCheck {
  ticks: number;
  need: number;
  /** ticks - need: negative = short, positive = too long. */
  diff: number;
  ok: boolean;
  /** "Adds up", "A quarter is missing", "An eighth too long". */
  text: string;
}

/** Check one bar of a song. */
export function checkBar(song: Song, bar: number): BarCheck {
  const info = song.bars[bar];
  const beats = song.tracks[0]?.measures[bar]?.beats ?? [];
  const ticks = beats.reduce((s, b) => s + b.duration, 0);
  const need = info ? barLength(info) : 0;
  const diff = ticks - need;
  if (diff === 0) return { ticks, need, diff, ok: true, text: 'Adds up' };
  if (info && diff >= need && need > 0) {
    const bars = Math.round((ticks / need) * 10) / 10;
    return { ticks, need, diff, ok: false, text: `Holds about ${bars} bars: a bar line was probably missed` };
  }
  const what = describeAmount(Math.abs(diff), info?.time.denominator ?? 4);
  const cap = what.charAt(0).toUpperCase() + what.slice(1);
  return { ticks, need, diff, ok: false, text: diff < 0 ? `${cap} ${/s$/.test(what) && !/^an? /.test(what) ? 'are' : 'is'} missing` : `${cap} too long` };
}

/** A length in words: "a quarter", "a dotted eighth", or a count of beats when no single note lasts that long. */
export function describeAmount(ticks: number, denominator = 4): string {
  if (valueFromTicks(ticks)) return describeTicks(ticks);
  const unit = 3840 / denominator;
  if (Number.isInteger(ticks / unit)) {
    const n = ticks / unit;
    return `${n} ${denominator === 8 ? 'eighth-note beats' : 'beats'}`;
  }
  return `${ticks} ticks`;
}

/** Bars that do not add up. */
export function badBars(song: Song): number[] {
  const out: number[] = [];
  song.bars.forEach((_, i) => {
    if (!checkBar(song, i).ok) out.push(i);
  });
  return out;
}

/** Drop ties that no longer continue the same fret (after an edit), so the song stays valid. */
function sanitizeTies(song: Song): void {
  const last = new Map<number, Note | null>();
  for (const m of song.tracks[0]?.measures ?? []) {
    for (const b of m.beats) {
      if (!b.notes.length) {
        if (!b.slash) last.clear();
        continue;
      }
      for (const n of b.notes) {
        const prev = last.get(n.string) ?? null;
        if (n.tie && (!prev || prev.fret !== n.fret)) delete n.tie;
        if ((n.legato || n.slide) && (!prev || prev.fret === n.fret)) {
          delete n.legato;
          delete n.slide;
        }
      }
      for (const n of b.notes) last.set(n.string, n);
    }
  }
}

function restBeat(start: number, duration: number): Beat {
  const value = valueFromTicks(duration);
  return { start, duration, notes: [], ...(value ? { value } : {}) };
}

/** A time signature that holds `ticks` (for showing a bar that is too long as it is). */
function timeHolding(ticks: number, prefer: number): { numerator: number; denominator: number } | null {
  for (const den of [prefer, 4, 8, 16, 32]) {
    const unit = 3840 / den;
    if (Number.isInteger(unit) && ticks % unit === 0) return { numerator: ticks / unit, denominator: den };
  }
  return null;
}

/**
 * A valid Song for display and playback: a short bar gets a rest at its end, a bar that is too
 * long is shown in a time signature that holds it (so nothing typed disappears), broken ties are
 * dropped. The draft itself is not changed.
 */
export function viewSong(draft: Draft): Song {
  const song: Song = JSON.parse(JSON.stringify(draft.song));
  const track = song.tracks[0];
  song.bars.forEach((info, i) => {
    const m = track.measures[i];
    if (!m) return;
    let at = 0;
    for (const b of m.beats) {
      b.start = at;
      at += b.duration;
    }
    const need = barLength(info);
    if (at < need) m.beats.push(restBeat(at, need - at));
    else if (at > need) {
      let total = at;
      let time = timeHolding(total, info.time.denominator);
      if (!time) {
        const padded = Math.ceil(total / 240) * 240;
        m.beats.push(restBeat(total, padded - total));
        total = padded;
        time = timeHolding(total, 16)!;
      }
      song.bars[i] = { ...info, time };
      delete song.bars[i].length;
    }
    if (!m.beats.length) m.beats.push(restBeat(0, need));
  });
  song.chords = song.chords.filter((c) => c.bar < song.bars.length && c.tick < barLength(song.bars[c.bar]));
  sanitizeTies(song);
  return song;
}

/**
 * The song to save: bars keep their time signature; a short bar gets a rest at its end, a bar that
 * is too long loses what runs past the bar line (each said in `warnings`).
 */
export function finalSong(draft: Draft): { song: Song; warnings: string[] } {
  const song: Song = JSON.parse(JSON.stringify(draft.song));
  const warnings: string[] = [];
  const track = song.tracks[0];
  song.bars.forEach((info, i) => {
    const m = track.measures[i];
    let at = 0;
    for (const b of m.beats) {
      b.start = at;
      at += b.duration;
    }
    const need = barLength(info);
    if (at < need) {
      if (at > 0) warnings.push(`Bar ${i + 1} was ${describeTicks(need - at)} short; a rest fills the end.`);
      m.beats.push(restBeat(at, need - at));
    } else if (at > need) {
      warnings.push(`Bar ${i + 1} was ${describeTicks(at - need)} too long; what ran past the bar line was cut.`);
      while (m.beats.length && m.beats[m.beats.length - 1].start >= need) m.beats.pop();
      const last = m.beats[m.beats.length - 1];
      if (last) {
        last.duration = need - last.start;
        const v = valueFromTicks(last.duration);
        if (v) last.value = v;
        else delete last.value;
      }
    }
  });
  song.chords = song.chords.filter((c) => c.tick < barLength(song.bars[c.bar]));
  sanitizeTies(song);
  return { song, warnings };
}

/** Value of a beat for display ("quarter", "dotted eighth"). */
export function valueName(v: NoteValue | undefined, duration: number): string {
  const value = v && Math.abs(valueTicks(v) - duration) < 1 ? v : valueFromTicks(duration);
  if (!value) return `${duration} ticks`;
  const names: Record<number, string> = { 1: 'whole', 2: 'half', 4: 'quarter', 8: 'eighth', 16: 'sixteenth', 32: 'thirty-second', 64: 'sixty-fourth' };
  return `${value.dots === 2 ? 'double-dotted ' : value.dots ? 'dotted ' : ''}${names[value.base] ?? `1/${value.base}`}${value.tuplet ? (value.tuplet.actual === 3 ? ' triplet' : ` ${value.tuplet.actual}-tuplet`) : ''}`;
}

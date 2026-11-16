/**
 * The first stage of the tab engraving: a track of a song turned into measures of columns (one
 * per rhythmic event) with everything the drawing needs already worked out: display text of each
 * fret, which earlier note a tie / hammer-on / slide comes from, beams and tuplets, chord symbols,
 * lyrics, sections, tempo marks, repeats and endings. Independent of width and zoom.
 */
import { identifyTuning, spellMidi } from '@/core/guitar';
import { capoShape, findTrack, PPQ, splitTicks, valueFromTicks, type Note, type NoteValue, type Song, type TimeSig, type Track } from '@/core/song';
import { formatChord, type NoteNaming } from '@/core/theory';
import { noteText } from '../format';
import { beamCount, beamGroups, tupletGroups, type RhythmEvent, type TupletGroup } from './rhythm';

/** Where a note sits: measure index in the model, column index, string. */
export interface NoteRef {
  measure: number;
  col: number;
  string: number;
}

/** One fret number on the tab. */
export interface TabNote {
  string: number;
  fret: number;
  /** The song's note (for techniques). Continuation pieces carry the note they continue. */
  note: Note;
  /** What is printed: `5`, `12`, `x`. */
  text: string;
  /** Printed in parentheses: a ghost note, a tied note, or the held part of a long note. */
  paren: boolean;
  /** Natural harmonic: printed in angle brackets. */
  harmonic: boolean;
  /** Continues the previous note on this string without striking it (a tie, or a split note). */
  tied: boolean;
  /** Key for note states: `bar:beat:string`. */
  key: string;
  /** The earlier note on this string that this one is tied, slurred or slid from. */
  from?: NoteRef;
  /**
   * A held piece that is not drawn: a note held through several columns shows its fret once per
   * bar (the struck note, then the last held piece of each bar, tied from it), not a run of `(5)`s.
   */
  hidden?: boolean;
}

/** One rhythmic event of a measure: a beat, or a tied piece of a beat that no single value can write. */
export interface TabColumn extends RhythmEvent {
  /** Index of the song beat in its measure. */
  beat: number;
  /** 0 for the beat itself, 1… for the tied pieces after it. */
  piece: number;
  slash: boolean;
  mutedStrum: boolean;
  stroke?: 'down' | 'up';
  notes: TabNote[];
  /** Beams/flags of the written value. */
  beams: number;
  /** Lyric syllable (display text without the trailing hyphen) and whether a hyphen follows. */
  lyric?: { text: string; hyphen: boolean };
  /** Beat text (a performance hint). */
  text?: string;
  /** Any note palm-muted, let ring, with vibrato, accented … (for spans and rows). */
  flags: ColumnFlags;
}

/** What a column carries that decides spans and rows. */
export interface ColumnFlags {
  palmMute: boolean;
  letRing: boolean;
  /** A let-ring note is still sounding here: from its column until its string is struck again, a rest, or the bar's end. */
  ringing: boolean;
  /** Inside a palm-mute stretch: between P.M. notes, while no muted string is struck open again (the thumb muted under a melody). */
  muted: boolean;
  vibrato: boolean;
  accent: boolean;
  staccato: boolean;
  tap: boolean;
  artificial: boolean;
  bend: boolean;
  pluck: boolean;
  finger: boolean;
}

/** A chord symbol in a measure. */
export interface TabChord {
  tick: number;
  /** As printed (formatted, capo shape when asked). */
  text: string;
  /** The stored symbol (what sounds). */
  symbol: string;
  /** Shape low to high when the song gives one. */
  voicing?: Array<number | null>;
}

/** One bar of the track. */
export interface TabMeasure {
  /** Index into `song.bars`. */
  bar: number;
  /** Index in `model.measures`. */
  index: number;
  time: TimeSig;
  /** Ticks in this bar (a pickup is shorter). */
  length: number;
  /** Print the time signature (first bar and changes). */
  showTime: boolean;
  repeatStart: boolean;
  /** Times played in all, when a repeat ends here. */
  repeatEnd?: number;
  /** First/second-time ending numbers, with where the bracket starts and whether it closes here. */
  ending?: { numbers: number[]; start: boolean; end: boolean; closed: boolean };
  /** The bar ends with a double barline (a new section follows) or the final barline. */
  endBar: 'single' | 'double' | 'final' | 'repeat';
  section?: string;
  tempo: Array<{ tick: number; bpm: number; text: string }>;
  chords: TabChord[];
  annotations: Array<{ tick: number; text: string }>;
  /** Key in force (for notation spelling). */
  key: string;
  /** The key changes at this bar. */
  keyChange: boolean;
  columns: TabColumn[];
  beamGroups: number[][];
  tuplets: TupletGroup[];
}

/** The whole track, ready to lay out. */
export interface TabModel {
  song: Song;
  track: Track;
  tuning: number[];
  capo: number;
  /** Number of strings (lines). */
  strings: number;
  /** Open-string labels by string number (index 1 = string 1). */
  stringLabels: string[];
  measures: TabMeasure[];
  /** First bar shown, for ranges. */
  firstBar: number;
}

/** Options of `buildTabModel`. */
export interface TabModelOptions {
  /** Track id, name or index (default: the first track). */
  track?: string | number;
  /** Bars to include, `[from, to)` (default: all). */
  bars?: [number, number];
  /** With a capo, print chord shapes (`G` under capo 2) or what sounds (`A`). Default `shapes`. */
  chordNames?: 'shapes' | 'sounding';
  naming?: NoteNaming;
}

/** Key for a note's practice state: `bar:beat:string` (or `bar:beat` for the whole beat). */
export function noteKey(bar: number, beat: number, string?: number): string {
  return string === undefined ? `${bar}:${beat}` : `${bar}:${beat}:${string}`;
}

/** Build the engraving model of one track. Throws a RangeError when the song has no such track. */
export function buildTabModel(song: Song, opts: TabModelOptions = {}): TabModel {
  const track = findTrack(song, opts.track) ?? song.tracks[0];
  if (!track) throw new RangeError('The song has no tracks to show.');
  const tuning = track.tuning ?? song.tuning;
  const capo = track.capo ?? song.capo ?? 0;
  const naming = opts.naming ?? 'letters';
  const total = song.bars.length;
  const from = Math.max(0, Math.min(total, opts.bars?.[0] ?? 0));
  const to = Math.max(from, Math.min(total, opts.bars?.[1] ?? total));

  const strings = tuning.length;
  const known = identifyTuning(tuning);
  const stringLabels: string[] = [''];
  for (let s = 1; s <= strings; s++) {
    const index = strings - s;
    const name = known?.notes[index] ?? spellMidi(tuning[index]);
    stringLabels.push(noteText(name.replace(/-?\d+$/, ''), naming));
  }

  const sectionAt = new Map<number, string>();
  for (const s of song.sections) if (!sectionAt.has(s.start)) sectionAt.set(s.start, s.name);
  const sectionStarts = new Set(song.sections.map((s) => s.start));

  const measures: TabMeasure[] = [];
  const last = new Map<number, NoteRef>();
  let key = song.key ?? 'C';
  for (let bar = 0; bar < to; bar++) if (bar < from && song.bars[bar]?.key) key = song.bars[bar].key!;

  for (let bar = from; bar < to; bar++) {
    const info = song.bars[bar];
    const prevInfo = bar > 0 ? song.bars[bar - 1] : undefined;
    const time = info.time;
    const capacity = Math.round((PPQ * 4 * time.numerator) / time.denominator);
    const length = info.length ?? capacity;
    const index = measures.length;
    const keyChange = !!info.key && bar > from;
    if (info.key) key = info.key;
    const showTime = bar === from || !prevInfo || prevInfo.time.numerator !== time.numerator || prevInfo.time.denominator !== time.denominator;

    const columns = buildColumns(track, bar, length, index, last);
    const events: RhythmEvent[] = columns;
    const next = song.bars[bar + 1];
    let endBar: TabMeasure['endBar'] = 'single';
    if (info.repeatEnd) endBar = 'repeat';
    else if (bar === total - 1) endBar = 'final';
    else if (bar === to - 1) endBar = 'single';
    else if (next && sectionStarts.has(bar + 1) && !next.repeatStart) endBar = 'double';

    let ending: TabMeasure['ending'];
    if (info.ending?.length) {
      const same = (a?: number[], b?: number[]) => !!a && !!b && a.join(',') === b.join(',');
      const start = bar === from || !same(prevInfo?.ending, info.ending);
      const end = bar === to - 1 || !same(next?.ending, info.ending);
      ending = { numbers: [...info.ending], start, end, closed: end && !!info.repeatEnd };
    }

    measures.push({
      bar,
      index,
      time,
      length,
      showTime,
      repeatStart: !!info.repeatStart,
      repeatEnd: info.repeatEnd,
      ending,
      endBar,
      section: sectionAt.get(bar),
      tempo: song.tempo
        .filter((t) => t.bar === bar)
        .map((t) => ({ tick: t.tick ?? 0, bpm: t.bpm, text: tempoText(t.bpm, time) })),
      chords: song.chords
        .filter((c) => c.bar === bar)
        .sort((a, b) => a.tick - b.tick)
        .map((c) => ({ tick: c.tick, symbol: c.symbol, voicing: c.voicing, text: chordText(c.symbol, capo, opts.chordNames ?? 'shapes', naming) })),
      annotations: song.annotations.filter((a) => a.bar === bar).map((a) => ({ tick: a.tick, text: a.text })),
      key,
      keyChange,
      columns,
      beamGroups: beamGroups(events, time, length),
      tuplets: tupletGroups(events),
    });
  }
  holdSpans(measures);
  thinHeldNotes(measures);
  // A range that starts mid-song still shows the tempo in force.
  if (measures.length && !measures[0].tempo.some((t) => t.tick === 0)) {
    const inForce = [...song.tempo].filter((t) => t.bar < from || (t.bar === from && (t.tick ?? 0) === 0)).pop() ?? song.tempo[0];
    if (inForce) measures[0].tempo.unshift({ tick: 0, bpm: inForce.bpm, text: tempoText(inForce.bpm, measures[0].time) });
  }
  return { song, track, tuning, capo, strings, stringLabels, measures, firstBar: from };
}

/** Tempo as printed: a quarter, or a dotted quarter in compound time (6/8 at 90 quarters a minute is ♩. = 60). */
export function tempoText(bpm: number, time: TimeSig): string {
  const compound = time.denominator === 8 && time.numerator % 3 === 0 && time.numerator > 3;
  const value = compound ? bpm / 1.5 : bpm;
  return `= ${Math.round(value)}`;
}

/** Whether tempo marks in this meter are written for a dotted quarter. */
export function isCompound(time: TimeSig): boolean {
  return time.denominator === 8 && time.numerator % 3 === 0 && time.numerator > 3;
}

function chordText(symbol: string, capo: number, names: 'shapes' | 'sounding', naming: NoteNaming): string {
  const shown = names === 'shapes' && capo > 0 ? capoShape(symbol, capo) : symbol;
  try {
    return formatChord(shown, { system: naming });
  } catch {
    return shown;
  }
}

function emptyFlags(): ColumnFlags {
  return { palmMute: false, letRing: false, ringing: false, muted: false, vibrato: false, accent: false, staccato: false, tap: false, artificial: false, bend: false, pluck: false, finger: false };
}

function buildColumns(track: Track, bar: number, length: number, measureIndex: number, last: Map<number, NoteRef>): TabColumn[] {
  const measure = track.measures[bar];
  const beats = measure?.beats ?? [];
  const out: TabColumn[] = [];
  if (!beats.length) {
    out.push(restColumn(0, 0, 0, length));
    last.clear();
    return out;
  }
  beats.forEach((beat, bi) => {
    const rest = beat.notes.length === 0 && !beat.slash;
    const written = beat.value ?? valueFromTicks(beat.duration);
    const pieces: Array<{ ticks: number; value: NoteValue | null }> = written ? [{ ticks: beat.duration, value: written }] : splitTicks(beat.duration).map((p) => ({ ticks: p.ticks, value: p.value ?? null }));
    let start = beat.start;
    pieces.forEach((p, pi) => {
      const col: TabColumn = {
        beat: bi,
        piece: pi,
        start,
        duration: p.ticks,
        value: p.value,
        rest,
        slash: !!beat.slash,
        mutedStrum: !!beat.mutedStrum,
        stroke: pi === 0 ? beat.stroke : undefined,
        notes: [],
        beams: beamCount(p.value),
        flags: emptyFlags(),
      };
      if (pi === 0) {
        if (beat.lyric) {
          const hyphen = beat.lyric.endsWith('-');
          const text = hyphen ? beat.lyric.slice(0, -1) : beat.lyric;
          if (text) col.lyric = { text, hyphen };
        }
        if (beat.text) col.text = beat.text;
      }
      const colIndex = out.length;
      const sorted = [...beat.notes].sort((a, b) => a.string - b.string);
      for (const n of sorted) {
        const continued = pi > 0;
        const tied = continued || !!n.tie;
        const connects = tied || !!n.legato || !!n.slide;
        const from = connects ? last.get(n.string) : undefined;
        const tabNote: TabNote = {
          string: n.string,
          fret: n.fret,
          note: n,
          text: n.dead ? 'x' : String(n.fret),
          paren: !!n.ghost || tied,
          harmonic: n.harmonic === 'natural' && !continued,
          tied,
          key: noteKey(bar, bi, n.string),
          ...(from ? { from } : {}),
        };
        col.notes.push(tabNote);
        last.set(n.string, { measure: measureIndex, col: colIndex, string: n.string });
        if (!continued) {
          const f = col.flags;
          f.palmMute ||= !!n.palmMute;
          f.letRing ||= !!n.letRing;
          f.vibrato ||= !!n.vibrato;
          f.accent ||= !!n.accent;
          f.staccato ||= !!n.staccato;
          f.tap ||= !!n.tap;
          f.artificial ||= n.harmonic === 'artificial';
          f.bend ||= !!n.bend;
          f.pluck ||= !!n.pluck;
          f.finger ||= n.finger !== undefined && n.finger !== 0;
        } else {
          // The held part keeps sounding: let ring and palm mute spans run through it.
          col.flags.palmMute ||= !!n.palmMute;
          col.flags.letRing ||= !!n.letRing;
          col.flags.vibrato ||= !!n.vibrato;
        }
      }
      if (rest) last.clear();
      out.push(col);
      start += p.ticks;
    });
  });
  return out;
}

/**
 * Where let ring and palm mute last, so each is written once per stretch rather than on every
 * note: a let-ring note rings until its string is struck again (without let ring), a rest, or the
 * end of the bar; a palm-mute stretch runs from one P.M. note to the next, across barlines, while
 * no muted string is struck again unmuted (the thumb muting the bass under a fingered melody).
 */
export function holdSpans(measures: ReadonlyArray<{ columns: readonly TabColumn[] }>): void {
  const ring = new Set<number>();
  const mute = new Set<number>();
  let pending: TabColumn[] = [];
  for (const m of measures) {
    ring.clear();
    for (const c of m.columns) {
      if (c.rest) {
        ring.clear();
        mute.clear();
        pending = [];
        continue;
      }
      for (const n of c.notes) {
        if (n.tied) continue;
        if (n.note.letRing) ring.add(n.string);
        else ring.delete(n.string);
        if (n.note.palmMute) mute.add(n.string);
        else mute.delete(n.string);
      }
      c.flags.ringing = c.flags.letRing || ring.size > 0;
      if (c.flags.palmMute) {
        for (const p of pending) p.flags.muted = true;
        pending = [];
        c.flags.muted = true;
      } else if (mute.size > 0) pending.push(c);
      else pending = [];
    }
  }
}

/**
 * Thin out held notes: within a bar, a tied piece followed by another tied piece of the same note
 * is hidden and the later piece is tied straight from the note before. A note held through a bar
 * then reads `5 ⌒ (5)`, once, instead of `5 (5) (5) (5)`.
 */
export function thinHeldNotes(measures: readonly TabMeasure[]): void {
  for (const m of measures) {
    m.columns.forEach((c, ci) => {
      for (const n of c.notes) {
        const from = n.from;
        if (!n.tied || !from || from.measure !== m.index || from.col >= ci) continue;
        const prev = m.columns[from.col]?.notes.find((x) => x.string === from.string);
        if (!prev || !prev.tied || prev.hidden) continue;
        prev.hidden = true;
        if (prev.from) n.from = prev.from;
        else delete n.from;
      }
    });
  }
}

function restColumn(beat: number, piece: number, start: number, duration: number): TabColumn {
  const value = valueFromTicks(duration);
  return { beat, piece, start, duration, value, rest: true, slash: false, mutedStrum: false, notes: [], beams: beamCount(value), flags: emptyFlags() };
}

/** True when a measure is one rest filling the whole bar (drawn centred, as a bar rest). */
export function isBarRest(m: TabMeasure): boolean {
  return m.columns.length === 1 && m.columns[0].rest;
}

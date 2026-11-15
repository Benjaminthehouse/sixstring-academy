/**
 * The song as an absolute timeline: repeats unrolled into playback order, every beat at its
 * absolute tick and second through the tempo map, chords and sections as spans, plus the lookups
 * a player needs (which bar and beat is sounding at a tick or a second).
 *
 * The tempo maths is the same closed form as the audio engine's `Timeline` (linear ramps in
 * quarter notes per minute), so a tick maps to the same second here and in the transport.
 */
import { barLength } from './model';
import type { Annotation, BarInfo, Beat, ChordEvent, Note, Song, TimeSig } from './types';
import { PPQ } from './types';

/** A tempo point on the absolute (unrolled) tick axis. */
export interface TempoPoint {
  tick: number;
  bpm: number;
  ramp?: boolean;
}

const SEC_PER_TICK_AT_1BPM = 60 / PPQ;

/** Tempo map over absolute ticks: seconds ↔ ticks with step changes and linear ramps. */
export class TempoMap {
  readonly points: readonly TempoPoint[];
  private readonly secs: number[];

  constructor(points: readonly TempoPoint[]) {
    const pts = (points.length ? points : [{ tick: 0, bpm: 120 }])
      .map((p) => ({ tick: Math.max(0, p.tick), bpm: Math.max(1, p.bpm), ramp: !!p.ramp }))
      .sort((a, b) => a.tick - b.tick);
    if (pts[0].tick > 0) pts.unshift({ tick: 0, bpm: pts[0].bpm, ramp: false });
    this.points = pts;
    this.secs = [0];
    for (let i = 1; i < pts.length; i++) this.secs.push(this.secs[i - 1] + TempoMap.span(pts[i - 1], pts[i], pts[i].tick));
  }

  private static span(a: TempoPoint, b: TempoPoint | undefined, tick: number): number {
    const dt = tick - a.tick;
    if (a.ramp && b && b.tick > a.tick && Math.abs(b.bpm - a.bpm) > 1e-9) {
      const k = (b.bpm - a.bpm) / (b.tick - a.tick);
      return (SEC_PER_TICK_AT_1BPM * Math.log((a.bpm + k * Math.min(dt, b.tick - a.tick)) / a.bpm)) / k + (dt > b.tick - a.tick ? ((dt - (b.tick - a.tick)) * SEC_PER_TICK_AT_1BPM) / b.bpm : 0);
    }
    return (dt * SEC_PER_TICK_AT_1BPM) / a.bpm;
  }

  private index(tick: number): number {
    let lo = 0;
    let hi = this.points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.points[mid].tick <= tick) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Seconds from tick 0 to `tick`. */
  secondsAt(tick: number): number {
    const i = this.index(tick);
    return this.secs[i] + TempoMap.span(this.points[i], this.points[i + 1], tick);
  }

  /** The tick reached after `sec` seconds. */
  tickAt(sec: number): number {
    let lo = 0;
    let hi = this.points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.secs[mid] <= sec) lo = mid;
      else hi = mid - 1;
    }
    const a = this.points[lo];
    const b = this.points[lo + 1];
    const ds = sec - this.secs[lo];
    if (a.ramp && b && b.tick > a.tick && Math.abs(b.bpm - a.bpm) > 1e-9) {
      const k = (b.bpm - a.bpm) / (b.tick - a.tick);
      return a.tick + (a.bpm / k) * (Math.exp((ds * k) / SEC_PER_TICK_AT_1BPM) - 1);
    }
    return a.tick + (ds * a.bpm) / SEC_PER_TICK_AT_1BPM;
  }

  /** Tempo (quarter notes per minute) at a tick. */
  bpmAt(tick: number): number {
    const i = this.index(tick);
    const a = this.points[i];
    const b = this.points[i + 1];
    if (a.ramp && b && b.tick > a.tick) return a.bpm + ((b.bpm - a.bpm) * Math.min(tick - a.tick, b.tick - a.tick)) / (b.tick - a.tick);
    return a.bpm;
  }
}

/** One bar in playback order. */
export interface TimelineBar {
  /** Position in playback order (0-based). */
  index: number;
  /** The song bar this is (index into `song.bars`). */
  bar: number;
  /** Which time through a repeat (1-based). */
  pass: number;
  /** Absolute start tick. */
  start: number;
  length: number;
  time: TimeSig;
  startSec: number;
  endSec: number;
}

/** One beat of one track at its absolute place. */
export interface TimelineBeat {
  track: string;
  trackIndex: number;
  /** Playback-order bar index. */
  index: number;
  /** Song bar index. */
  bar: number;
  /** Beat index within the measure. */
  beat: number;
  /** Absolute tick and length. */
  tick: number;
  duration: number;
  sec: number;
  durSec: number;
  notes: Note[];
  /** The beat object in the song (do not mutate). */
  source: Beat;
}

/** A chord symbol as a span of time. */
export interface TimelineChord {
  tick: number;
  endTick: number;
  sec: number;
  endSec: number;
  symbol: string;
  voicing?: Array<number | null>;
  /** Playback-order bar index and song bar index where it starts. */
  index: number;
  bar: number;
}

/** A section occurrence in playback order. */
export interface TimelineSection {
  name: string;
  /** Playback-order bar range [startIndex, endIndex). */
  startIndex: number;
  endIndex: number;
  tick: number;
  endTick: number;
  sec: number;
  endSec: number;
}

/** Options for `flattenSong`. */
export interface FlattenOptions {
  /** Play repeats and endings as written (default true); false lays every bar out once. */
  unroll?: boolean;
  /** Only these tracks (ids or indexes); default all. */
  tracks?: Array<string | number>;
}

/** Bar order for playback: repeats taken, first/second endings chosen. */
export function playbackOrder(bars: readonly BarInfo[], opts: { unroll?: boolean } = {}): Array<{ bar: number; pass: number }> {
  if (opts.unroll === false) return bars.map((_, bar) => ({ bar, pass: 1 }));
  const order: Array<{ bar: number; pass: number }> = [];
  let i = 0;
  let pass = 1;
  let repeatFrom = 0;
  let jumpedFrom = -1;
  let jumped = false;
  const guard = bars.length * 64 + 64;
  while (i < bars.length && order.length < guard) {
    const info = bars[i];
    if (info.repeatStart && !jumped) {
      repeatFrom = i;
      pass = 1;
    }
    jumped = false;
    if (pass > 1 && i > jumpedFrom && !info.ending) {
      // Past the endings of the last repeat: a later ":|" without "|:" repeats from here.
      pass = 1;
      repeatFrom = i;
      jumpedFrom = -1;
    }
    if (info.ending && !info.ending.includes(pass)) {
      i++;
      continue;
    }
    order.push({ bar: i, pass });
    if (info.repeatEnd !== undefined && info.repeatEnd >= 2) {
      if (pass < info.repeatEnd) {
        pass++;
        jumpedFrom = Math.max(jumpedFrom, i);
        i = repeatFrom;
        jumped = true;
        continue;
      }
      pass = 1;
      jumpedFrom = -1;
      repeatFrom = i + 1;
    }
    i++;
  }
  return order;
}

function bsearch<T>(list: readonly T[], tick: number, startOf: (x: T) => number): number {
  let lo = 0;
  let hi = list.length - 1;
  if (hi < 0 || tick < startOf(list[0])) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (startOf(list[mid]) <= tick) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** A song laid out on one absolute time axis. Build with `flattenSong`. */
export class SongTimeline {
  readonly bars: TimelineBar[] = [];
  /** Every beat of every included track, by tick then track order. */
  readonly beats: TimelineBeat[] = [];
  readonly chords: TimelineChord[] = [];
  readonly sections: TimelineSection[] = [];
  readonly annotations: Array<Annotation & { absTick: number; index: number }> = [];
  readonly tempo: TempoMap;
  readonly totalTicks: number;
  readonly totalSeconds: number;
  private readonly byTrack = new Map<string, TimelineBeat[]>();

  constructor(readonly song: Song, opts: FlattenOptions = {}) {
    const order = playbackOrder(song.bars, opts);
    const firstIndex = new Map<number, number>();
    let tick = 0;
    order.forEach(({ bar, pass }, index) => {
      const info = song.bars[bar];
      const length = barLength(info);
      if (!firstIndex.has(bar)) firstIndex.set(bar, index);
      this.bars.push({ index, bar, pass, start: tick, length, time: info.time, startSec: 0, endSec: 0 });
      tick += length;
    });
    this.totalTicks = tick;

    // Tempo, read along the written bars (a ramp glides from its change to the next one), then laid
    // out in playback order: where a repeat jumps, a ramp in progress ends at the tempo it reached
    // and the jump lands on the tempo written there.
    const writtenStart: number[] = [];
    let w = 0;
    for (const info of song.bars) {
      writtenStart.push(w);
      w += barLength(info);
    }
    const changes = [...song.tempo]
      .map((t) => ({ at: (writtenStart[t.bar] ?? w) + (t.tick ?? 0), bpm: t.bpm, ramp: !!t.ramp }))
      .sort((a, b) => a.at - b.at);
    if (!changes.length) changes.push({ at: 0, bpm: 120, ramp: false });
    /** Tempo at a written position and whether a ramp is under way there. */
    const writtenTempo = (at: number): { bpm: number; ramp: boolean } => {
      let i = -1;
      for (let k = 0; k < changes.length; k++) if (changes[k].at <= at) i = k;
      if (i < 0) return { bpm: changes[0].bpm, ramp: false };
      const c = changes[i];
      const next = changes[i + 1];
      if (c.ramp && next && next.at > c.at) return { bpm: c.bpm + ((next.bpm - c.bpm) * (at - c.at)) / (next.at - c.at), ramp: true };
      return { bpm: c.bpm, ramp: false };
    };
    const points: TempoPoint[] = [];
    this.bars.forEach((b, k) => {
      const prev = this.bars[k - 1];
      const contiguous = !!prev && prev.bar === b.bar - 1;
      const at = writtenStart[b.bar];
      if (!contiguous) {
        if (prev) {
          // Close a ramp at the value it reached by the end of the bar before the jump.
          const end = writtenTempo(writtenStart[prev.bar] + prev.length - 1e-6);
          if (end.ramp) points.push({ tick: b.start, bpm: end.bpm, ramp: false });
        }
        const here = writtenTempo(at);
        points.push({ tick: b.start, bpm: here.bpm, ramp: here.ramp });
      }
      for (const c of changes) {
        if (c.at < at || c.at >= at + b.length) continue;
        if (!contiguous && c.at === at) {
          points[points.length - 1] = { tick: b.start, bpm: c.bpm, ramp: c.ramp };
          continue;
        }
        points.push({ tick: b.start + (c.at - at), bpm: c.bpm, ramp: c.ramp });
      }
    });
    this.tempo = new TempoMap(points);
    for (const b of this.bars) {
      b.startSec = this.tempo.secondsAt(b.start);
      b.endSec = this.tempo.secondsAt(b.start + b.length);
    }
    this.totalSeconds = this.tempo.secondsAt(tick);

    const wanted = opts.tracks?.map((r) => (typeof r === 'number' ? song.tracks[r]?.id : r));
    song.tracks.forEach((track, trackIndex) => {
      if (wanted && !wanted.includes(track.id) && !wanted.includes(track.name)) return;
      const list: TimelineBeat[] = [];
      for (const b of this.bars) {
        const measure = track.measures[b.bar];
        if (!measure) continue;
        measure.beats.forEach((beat, bi) => {
          const at = b.start + beat.start;
          const sec = this.tempo.secondsAt(at);
          list.push({
            track: track.id, trackIndex, index: b.index, bar: b.bar, beat: bi, tick: at, duration: beat.duration,
            sec, durSec: this.tempo.secondsAt(at + beat.duration) - sec, notes: beat.notes, source: beat,
          });
        });
      }
      this.byTrack.set(track.id, list);
      this.beats.push(...list);
    });
    this.beats.sort((a, b) => a.tick - b.tick || a.trackIndex - b.trackIndex);

    // Chords: carried across bars; a repeat pass restarts with the chord in force at that bar.
    const chords = [...song.chords].sort((a, b) => a.bar - b.bar || a.tick - b.tick);
    const chordAtBarStart = (bar: number): ChordEvent | null => {
      let found: ChordEvent | null = null;
      for (const c of chords) if (c.bar < bar || (c.bar === bar && c.tick === 0)) found = c;
      return found;
    };
    for (const b of this.bars) {
      const inBar = chords.filter((c) => c.bar === b.bar);
      const startChord = inBar.find((c) => c.tick === 0) ?? chordAtBarStart(b.bar);
      const last = this.chords[this.chords.length - 1];
      if (startChord && (!last || last.symbol !== startChord.symbol || inBar.some((c) => c.tick === 0) || last.endTick !== b.start)) {
        this.pushChord(startChord, b, 0);
      }
      for (const c of inBar) if (c.tick > 0) this.pushChord(c, b, c.tick);
    }
    for (let i = 0; i < this.chords.length; i++) {
      const c = this.chords[i];
      c.endTick = this.chords[i + 1]?.tick ?? tick;
      c.endSec = this.tempo.secondsAt(c.endTick);
    }

    for (const b of this.bars) {
      const s = song.sections.find((sec) => b.bar >= sec.start && b.bar < sec.end);
      const last = this.sections[this.sections.length - 1];
      if (!s) continue;
      const continues = last && last.name === s.name && last.endIndex === b.index && b.bar !== s.start;
      if (continues) {
        last.endIndex = b.index + 1;
        last.endTick = b.start + b.length;
        last.endSec = b.endSec;
      } else {
        this.sections.push({ name: s.name, startIndex: b.index, endIndex: b.index + 1, tick: b.start, endTick: b.start + b.length, sec: b.startSec, endSec: b.endSec });
      }
    }

    for (const b of this.bars) {
      for (const a of song.annotations) if (a.bar === b.bar) this.annotations.push({ ...a, absTick: b.start + a.tick, index: b.index });
    }
  }

  private pushChord(c: ChordEvent, b: TimelineBar, tick: number): void {
    const at = b.start + tick;
    const prev = this.chords[this.chords.length - 1];
    if (prev && prev.tick === at) this.chords.pop();
    this.chords.push({ tick: at, endTick: at, sec: this.tempo.secondsAt(at), endSec: 0, symbol: c.symbol, ...(c.voicing ? { voicing: c.voicing } : {}), index: b.index, bar: b.bar });
  }

  /** Beats of one track (by id) in time order. */
  trackBeats(trackId: string): TimelineBeat[] {
    return this.byTrack.get(trackId) ?? [];
  }

  /** Seconds from the start to a tick. */
  secondsAt(tick: number): number {
    return this.tempo.secondsAt(tick);
  }

  /** The tick reached after `sec` seconds. */
  tickAt(sec: number): number {
    return this.tempo.tickAt(sec);
  }

  /** The playback bar sounding at a tick (clamped to the song). */
  barAt(tick: number): TimelineBar {
    const i = bsearch(this.bars, tick, (b) => b.start);
    return this.bars[Math.max(0, Math.min(this.bars.length - 1, i))];
  }

  /** The playback bar sounding after `sec` seconds. */
  barAtTime(sec: number): TimelineBar {
    return this.barAt(this.tickAt(sec));
  }

  /** The beat of a track sounding at a tick, or null before its first beat or after the end. */
  beatAt(trackId: string, tick: number): TimelineBeat | null {
    const list = this.trackBeats(trackId);
    const i = bsearch(list, tick, (b) => b.tick);
    if (i < 0) return null;
    const beat = list[i];
    return tick < beat.tick + beat.duration ? beat : null;
  }

  /** The beat of a track sounding after `sec` seconds. */
  beatAtTime(trackId: string, sec: number): TimelineBeat | null {
    return this.beatAt(trackId, this.tickAt(sec));
  }

  /** The chord sounding at a tick, or null. */
  chordAt(tick: number): TimelineChord | null {
    const i = bsearch(this.chords, tick, (c) => c.tick);
    return i < 0 ? null : this.chords[i];
  }

  /** The section occurrence containing a tick, or null. */
  sectionAt(tick: number): TimelineSection | null {
    return this.sections.find((s) => tick >= s.tick && tick < s.endTick) ?? null;
  }

  /** Playback index of the first time a song bar is played (or -1 when an ending skips it everywhere). */
  firstIndexOf(bar: number): number {
    return this.bars.find((b) => b.bar === bar)?.index ?? -1;
  }

  /** Absolute tick where a song bar is first played (0 when it never is). */
  tickOfBar(bar: number): number {
    const i = this.firstIndexOf(bar);
    return i < 0 ? 0 : this.bars[i].start;
  }

  /** Where a tick is: playback bar, song bar, tick in the bar, quarter-note beat and progress through the bar. */
  locate(tick: number): { index: number; bar: number; pass: number; tickInBar: number; beat: number; barProgress: number } {
    const b = this.barAt(tick);
    const tickInBar = Math.max(0, Math.min(b.length, tick - b.start));
    const beatTicks = (PPQ * 4) / b.time.denominator;
    return { index: b.index, bar: b.bar, pass: b.pass, tickInBar, beat: Math.floor(tickInBar / beatTicks), barProgress: b.length ? tickInBar / b.length : 0 };
  }
}

/** Lay a song out on one absolute timeline (repeats unrolled unless `unroll: false`). */
export function flattenSong(song: Song, opts: FlattenOptions = {}): SongTimeline {
  return new SongTimeline(song, opts);
}

/** Length of a song in seconds as played (repeats included). */
export function songDuration(song: Song): number {
  return flattenSong(song).totalSeconds;
}

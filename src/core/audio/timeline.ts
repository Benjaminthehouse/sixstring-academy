/**
 * Musical time, as pure maths: time signatures (simple, compound, odd with grouping), tempo maps
 * with ramps, swing, and the conversions between ticks, seconds and bar/beat/tick positions.
 * 960 ticks per quarter note, like every song in the app. Bars and beats are 0-based indices
 * (bar 0 beat 0 is the first downbeat); `formatPosition` prints the musician's 1-based form.
 */

/** Ticks per quarter note. */
export const PPQ = 960;

/** A time signature; `grouping` splits the bar into groups of denominator units (7/8 = [2, 2, 3]). */
export interface TimeSignature {
  numerator: number;
  denominator: number;
  grouping?: number[];
}

/** 0 = silent, 1 = normal beat, 2 = medium (start of a group), 3 = strong (downbeat). */
export type AccentLevel = 0 | 1 | 2 | 3;

/** One felt beat of a bar. */
export interface MeterBeat {
  /** Offset from the start of the bar in ticks. */
  tick: number;
  /** Length in ticks (beats are unequal in odd meters). */
  length: number;
  /** How many denominator units the beat spans (3 for a dotted-quarter beat in 6/8). */
  units: number;
  /** Default accent of this beat. */
  accent: AccentLevel;
}

/** A time signature with everything derived from it. */
export interface Meter {
  numerator: number;
  denominator: number;
  grouping: number[];
  /** Ticks in one denominator unit. */
  unitTicks: number;
  /** Ticks in one bar. */
  barTicks: number;
  /** True when the felt beats are the groups (6/8 in two, 7/8 in three) rather than the units. */
  grouped: boolean;
  beats: MeterBeat[];
  /** The note value a tempo marking normally counts in this meter, in ticks (1440 = dotted quarter). */
  tempoBeatTicks: number;
}

/** How a bar is normally felt when no grouping is given. */
export function defaultGrouping(numerator: number, denominator: number): number[] {
  const n = numerator;
  if (denominator >= 8) {
    if (n <= 4) return new Array<number>(n).fill(1);
    if (n % 3 === 0) return new Array<number>(n / 3).fill(3);
    const odd: Record<number, number[]> = { 5: [3, 2], 7: [2, 2, 3], 8: [3, 3, 2], 10: [3, 3, 2, 2], 11: [3, 3, 3, 2], 13: [3, 3, 3, 2, 2] };
    if (odd[n]) return odd[n];
    const g: number[] = [];
    let left = n;
    while (left > 4) {
      g.push(3);
      left -= 3;
    }
    if (left === 4) g.push(2, 2);
    else if (left > 0) g.push(left);
    return g;
  }
  const simple: Record<number, number[]> = { 5: [3, 2], 6: [3, 3], 7: [4, 3], 9: [3, 3, 3] };
  return simple[n] ?? [n];
}

/** Parse "4/4", "6/8" or "7/8(2+2+3)". Throws on nonsense. */
export function parseTimeSignature(text: string): TimeSignature {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*(?:\(([\d+\s]+)\))?\s*$/.exec(text);
  if (!m) throw new Error(`not a time signature: ${text}`);
  const ts: TimeSignature = { numerator: Number(m[1]), denominator: Number(m[2]) };
  if (m[3]) ts.grouping = m[3].split('+').map((s) => Number(s.trim()));
  return ts;
}

/** Derive beats, lengths and default accents from a time signature (object or "7/8" text). */
export function resolveMeter(input: TimeSignature | string): Meter {
  const ts = typeof input === 'string' ? parseTimeSignature(input) : input;
  const numerator = Math.max(1, Math.round(ts.numerator));
  const denominator = [1, 2, 4, 8, 16, 32].includes(ts.denominator) ? ts.denominator : 4;
  const unitTicks = (PPQ * 4) / denominator;
  const given = ts.grouping && ts.grouping.length && ts.grouping.every((g) => g >= 1) && ts.grouping.reduce((a, b) => a + b, 0) === numerator;
  const grouping = given ? ts.grouping!.slice() : defaultGrouping(numerator, denominator);
  const grouped = denominator >= 8 && grouping.some((g) => g > 1);
  const beats: MeterBeat[] = [];
  if (grouped) {
    let tick = 0;
    grouping.forEach((units, i) => {
      beats.push({ tick, length: units * unitTicks, units, accent: i === 0 ? 3 : 1 });
      tick += units * unitTicks;
    });
  } else {
    const groupStarts = new Set<number>();
    let acc = 0;
    for (const g of grouping) {
      groupStarts.add(acc);
      acc += g;
    }
    for (let i = 0; i < numerator; i++) {
      beats.push({ tick: i * unitTicks, length: unitTicks, units: 1, accent: i === 0 ? 3 : groupStarts.has(i) ? 2 : 1 });
    }
  }
  let tempoBeatTicks = unitTicks;
  if (grouped) {
    const allThrees = grouping.every((g) => g === 3);
    tempoBeatTicks = allThrees ? 3 * unitTicks : 2 * unitTicks;
  }
  return { numerator, denominator, grouping, unitTicks, barTicks: numerator * unitTicks, grouped, beats, tempoBeatTicks };
}

/** The default accent of every beat of a meter. */
export function defaultAccents(meter: Meter): AccentLevel[] {
  return meter.beats.map((b) => b.accent);
}

/** Bar, beat and tick-within-beat, all 0-based. */
export interface BarBeatTick {
  bar: number;
  beat?: number;
  tick?: number;
}

/** A musical position with everything an animation needs. */
export interface MusicalPosition {
  /** Absolute tick from the start of the piece. */
  absTick: number;
  bar: number;
  beat: number;
  /** Ticks since the start of the beat. */
  tick: number;
  /** Ticks since the start of the bar. */
  barTick: number;
  beatsInBar: number;
  /** 0..1 through the current beat, and through the current bar. */
  beatProgress: number;
  barProgress: number;
  meter: Meter;
}

/** "3.2.480" with 1-based bar and beat, as musicians count. */
export function formatPosition(p: { bar: number; beat: number; tick: number }): string {
  return `${p.bar + 1}.${p.beat + 1}.${String(Math.round(p.tick)).padStart(3, '0')}`;
}

/** A tempo change. With `ramp`, the tempo glides linearly (per tick) to the next point. */
export interface TempoPoint {
  tick: number;
  /** Quarter notes per minute. */
  bpm: number;
  ramp?: boolean;
}

/** Swing: every pair of `unitTicks` is split `ratio` : `1 - ratio` (0.5 = straight, 0.667 = triplet). */
export interface Swing {
  ratio: number;
  unitTicks: number;
}

/** A change of time signature at a bar line. */
export interface MeterChange {
  bar: number;
  timeSignature: TimeSignature | string;
}

interface MeterSegment {
  bar: number;
  tick: number;
  meter: Meter;
}

/** Everything needed to build a {@link Timeline}. */
export interface TimelineInit {
  /** Constant tempo in quarter notes per minute (default 120). Ignored when `tempo` is given. */
  bpm?: number;
  tempo?: TempoPoint[];
  timeSignature?: TimeSignature | string;
  /** Time-signature changes; the first should be at bar 0. Overrides `timeSignature`. */
  meters?: MeterChange[];
  swing?: Swing | null;
}

const SEC_PER_TICK_AT_1BPM = 60 / PPQ;
const EPS = 1e-7;

/**
 * An immutable map of musical time: tempo, meters and swing. All conversions are exact closed
 * forms (no step integration), so a tick maps to the same second however it is reached.
 */
export class Timeline {
  readonly tempo: readonly TempoPoint[];
  readonly swing: Swing | null;
  private readonly segments: MeterSegment[];
  private readonly tempoSec: number[];
  private readonly init: TimelineInit;

  constructor(init: TimelineInit = {}) {
    this.init = init;
    const points = (init.tempo && init.tempo.length ? init.tempo : [{ tick: 0, bpm: init.bpm ?? 120 }])
      .map((p) => ({ tick: p.tick, bpm: Math.max(1, p.bpm), ramp: !!p.ramp }))
      .sort((a, b) => a.tick - b.tick);
    this.tempo = points;
    this.tempoSec = [0];
    for (let i = 1; i < points.length; i++) {
      this.tempoSec.push(this.tempoSec[i - 1] + Timeline.span(points[i - 1], points[i], points[i].tick));
    }
    // Seconds are measured from tick 0, wherever the first tempo point sits.
    const zero = this.rawSeconds(0);
    for (let i = 0; i < this.tempoSec.length; i++) this.tempoSec[i] -= zero;
    const sw = init.swing;
    this.swing = sw && sw.ratio > 0.5 + 1e-9 ? { ratio: Math.min(0.8, sw.ratio), unitTicks: sw.unitTicks } : null;
    const changes = (init.meters && init.meters.length ? init.meters : [{ bar: 0, timeSignature: init.timeSignature ?? { numerator: 4, denominator: 4 } }])
      .slice()
      .sort((a, b) => a.bar - b.bar);
    this.segments = [];
    let tick = 0;
    for (let i = 0; i < changes.length; i++) {
      const meter = resolveMeter(changes[i].timeSignature);
      const bar = i === 0 ? 0 : Math.max(changes[i].bar, this.segments[i - 1].bar + 1);
      if (i > 0) tick += (bar - this.segments[i - 1].bar) * this.segments[i - 1].meter.barTicks;
      this.segments.push({ bar, tick, meter });
    }
  }

  /** A copy with some settings replaced. */
  with(changes: TimelineInit): Timeline {
    const next: TimelineInit = { ...this.init, ...changes };
    if (changes.bpm !== undefined && changes.tempo === undefined) next.tempo = undefined;
    if (changes.timeSignature !== undefined && changes.meters === undefined) next.meters = undefined;
    return new Timeline(next);
  }

  // --- tempo -----------------------------------------------------------------------------------

  /** Seconds taken from point a's tick to `tick` (which lies between a and b, or after a if b is null). */
  private static span(a: TempoPoint, b: TempoPoint | null, tick: number): number {
    const dt = tick - a.tick;
    if (a.ramp && b && b.tick > a.tick && Math.abs(b.bpm - a.bpm) > 1e-9) {
      const k = (b.bpm - a.bpm) / (b.tick - a.tick);
      return (SEC_PER_TICK_AT_1BPM * Math.log((a.bpm + k * dt) / a.bpm)) / k;
    }
    return (dt * SEC_PER_TICK_AT_1BPM) / a.bpm;
  }

  private pointIndex(tick: number): number {
    const pts = this.tempo;
    let lo = 0, hi = pts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pts[mid].tick <= tick) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  private rawSeconds(tick: number): number {
    const i = this.pointIndex(tick);
    const a = this.tempo[i];
    if (tick < a.tick) return this.tempoSec[i] + ((tick - a.tick) * SEC_PER_TICK_AT_1BPM) / a.bpm;
    return this.tempoSec[i] + Timeline.span(a, this.tempo[i + 1] ?? null, tick);
  }

  private rawTicks(sec: number): number {
    const pts = this.tempo;
    let i = 0;
    {
      let lo = 0, hi = pts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (this.tempoSec[mid] <= sec) lo = mid; else hi = mid - 1;
      }
      i = lo;
    }
    const a = pts[i];
    const b = pts[i + 1] ?? null;
    const ds = sec - this.tempoSec[i];
    if (ds >= 0 && a.ramp && b && b.tick > a.tick && Math.abs(b.bpm - a.bpm) > 1e-9) {
      const k = (b.bpm - a.bpm) / (b.tick - a.tick);
      return a.tick + (a.bpm / k) * (Math.exp((ds * k) / SEC_PER_TICK_AT_1BPM) - 1);
    }
    return a.tick + (ds * a.bpm) / SEC_PER_TICK_AT_1BPM;
  }

  /** Tempo in quarter notes per minute at a tick (ramps included, swing ignored). */
  bpmAt(tick: number): number {
    const i = this.pointIndex(tick);
    const a = this.tempo[i];
    const b = this.tempo[i + 1];
    if (tick >= a.tick && a.ramp && b && b.tick > a.tick) {
      return a.bpm + ((b.bpm - a.bpm) * Math.min(tick - a.tick, b.tick - a.tick)) / (b.tick - a.tick);
    }
    return a.bpm;
  }

  /** Where a written tick is actually played once swing is applied. */
  swingTick(tick: number): number {
    const s = this.swing;
    if (!s) return tick;
    const pair = 2 * s.unitTicks;
    const base = Math.floor(tick / pair) * pair;
    const pos = tick - base;
    return pos <= s.unitTicks ? base + pos * 2 * s.ratio : base + pair * s.ratio + (pos - s.unitTicks) * 2 * (1 - s.ratio);
  }

  /** Inverse of {@link swingTick}. */
  unswingTick(tick: number): number {
    const s = this.swing;
    if (!s) return tick;
    const pair = 2 * s.unitTicks;
    const base = Math.floor(tick / pair) * pair;
    const pos = tick - base;
    const split = pair * s.ratio;
    return pos <= split ? base + pos / (2 * s.ratio) : base + s.unitTicks + (pos - split) / (2 * (1 - s.ratio));
  }

  /** Seconds from tick 0 to a written tick, through every tempo change and with swing applied. */
  ticksToSeconds(tick: number): number {
    return this.rawSeconds(this.swingTick(tick));
  }

  /** The written tick sounding `sec` seconds after tick 0. Inverse of {@link ticksToSeconds}. */
  secondsToTicks(sec: number): number {
    return this.unswingTick(this.rawTicks(sec));
  }

  // --- meter -----------------------------------------------------------------------------------

  private segmentAtTick(tick: number): MeterSegment {
    const s = this.segments;
    let i = s.length - 1;
    while (i > 0 && s[i].tick > tick + EPS) i--;
    return s[i];
  }

  private segmentAtBar(bar: number): MeterSegment {
    const s = this.segments;
    let i = s.length - 1;
    while (i > 0 && s[i].bar > bar) i--;
    return s[i];
  }

  /** The meter in force at a tick. */
  meterAt(tick: number): Meter {
    return this.segmentAtTick(tick).meter;
  }

  /** The meter of a bar. */
  meterOfBar(bar: number): Meter {
    return this.segmentAtBar(bar).meter;
  }

  /** Absolute tick where a bar starts. */
  barStart(bar: number): number {
    const seg = this.segmentAtBar(bar);
    return seg.tick + (bar - seg.bar) * seg.meter.barTicks;
  }

  /** Absolute tick of a bar/beat/tick position. */
  tickOf(p: BarBeatTick): number {
    const seg = this.segmentAtBar(p.bar);
    const beats = seg.meter.beats;
    const beat = Math.max(0, Math.min(beats.length - 1, Math.floor(p.beat ?? 0)));
    return seg.tick + (p.bar - seg.bar) * seg.meter.barTicks + beats[beat].tick + (p.tick ?? 0);
  }

  /** Bar, beat and tick of an absolute tick, plus progress fractions for animation. */
  positionOf(absTick: number): MusicalPosition {
    const seg = this.segmentAtTick(absTick);
    const meter = seg.meter;
    const rel = absTick - seg.tick;
    const barInSeg = Math.floor((rel + EPS) / meter.barTicks);
    const barTick = Math.max(0, rel - barInSeg * meter.barTicks);
    let beat = meter.beats.length - 1;
    while (beat > 0 && meter.beats[beat].tick > barTick + EPS) beat--;
    const b = meter.beats[beat];
    const tick = Math.max(0, barTick - b.tick);
    return {
      absTick,
      bar: seg.bar + barInSeg,
      beat,
      tick,
      barTick,
      beatsInBar: meter.beats.length,
      beatProgress: Math.min(1, tick / b.length),
      barProgress: Math.min(1, barTick / meter.barTicks),
      meter,
    };
  }
}

/** Convert a tempo counted in some note value (e.g. dotted quarters) to quarter notes per minute. */
export function toQuarterBpm(bpm: number, beatTicks: number): number {
  return (bpm * beatTicks) / PPQ;
}

/** Convert quarter notes per minute to a tempo counted in some note value. */
export function fromQuarterBpm(qpm: number, beatTicks: number): number {
  return (qpm * PPQ) / beatTicks;
}

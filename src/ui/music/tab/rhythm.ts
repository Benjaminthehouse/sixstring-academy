/**
 * Rhythm engraving rules for tab, without any drawing: how a beat's length is written, which
 * notes share a beam, how many beams each note gets (with the short "stub" beams of dotted
 * rhythms), and which notes form a tuplet. Pure and unit-tested; the renderer only turns the
 * answers into stems and beams.
 */
import { PPQ, type NoteValue, type TimeSig } from '@/core/song';

const WHOLE = PPQ * 4;
const EPS = 1e-6;

/** What the beaming rules need to know about one rhythmic event (a column of the tab). */
export interface RhythmEvent {
  /** Ticks from the start of the bar. */
  start: number;
  duration: number;
  /** The written value; null when the length cannot be written as one value. */
  value: NoteValue | null;
  /** A rest (never beamed). */
  rest: boolean;
}

/** Ticks of a written value (base, dots, tuplet). */
export function writtenTicks(value: NoteValue): number {
  let ticks = WHOLE / value.base;
  let add = ticks / 2;
  for (let i = 0; i < (value.dots ?? 0); i++) {
    ticks += add;
    add /= 2;
  }
  if (value.tuplet) ticks = (ticks * value.tuplet.normal) / value.tuplet.actual;
  return ticks;
}

/** Beams (or flags) a value carries: eighth 1, sixteenth 2, thirty-second 3, quarter and longer 0. */
export function beamCount(value: NoteValue | null): number {
  if (!value || value.base < 8) return 0;
  return Math.max(0, Math.round(Math.log2(value.base)) - 2);
}

/**
 * The tick boundaries that beams do not cross in a bar: quarter beats in x/4, dotted quarters in
 * compound time (6/8, 9/8, 12/8), 2+2+3-style groups in odd x/8 meters, half notes in x/2.
 * A pickup bar (shorter than its signature) is aligned to the end of the bar, as it is played.
 */
export function beamBoundaries(time: TimeSig, length: number): number[] {
  const unitOf = WHOLE / time.denominator;
  const capacity = unitOf * time.numerator;
  const groups: number[] = [];
  if (time.denominator <= 4) {
    for (let i = 0; i < time.numerator; i++) groups.push(unitOf);
  } else if (time.numerator % 3 === 0) {
    for (let i = 0; i < time.numerator / 3; i++) groups.push(unitOf * 3);
  } else if (time.numerator <= 3) {
    groups.push(capacity);
  } else {
    // 5/8 = 2+3, 7/8 = 2+2+3, 4/8 = 2+2: pairs, with a closing three when the count is odd.
    let left = time.numerator;
    while (left > 0) {
      const take = left === 3 ? 3 : 2;
      groups.push(unitOf * take);
      left -= take;
    }
  }
  const offset = capacity - length;
  const out: number[] = [];
  let at = 0;
  for (const g of groups) {
    at += g;
    const shifted = at - offset;
    if (shifted > EPS && shifted < length - EPS) out.push(shifted);
  }
  return out;
}

function unitIndex(boundaries: readonly number[], tick: number): number {
  let i = 0;
  while (i < boundaries.length && tick >= boundaries[i] - EPS) i++;
  return i;
}

/**
 * Groups of event indices that are beamed together. Eighths and shorter are beamed within a
 * beat unit (see `beamBoundaries`); rests, quarters and unwritable lengths break a beam; in 4/4
 * a half bar of plain eighths is joined under one beam, as engravers do. Groups of one are not
 * returned: those notes get flags.
 */
export function beamGroups(events: readonly RhythmEvent[], time: TimeSig, length: number): number[][] {
  const boundaries = beamBoundaries(time, length);
  const groups: number[][] = [];
  let current: number[] = [];
  let currentUnit = -1;
  const close = () => {
    if (current.length > 1) groups.push(current);
    current = [];
    currentUnit = -1;
  };
  events.forEach((e, i) => {
    const beams = beamCount(e.value);
    if (e.rest || beams === 0) {
      close();
      return;
    }
    const unit = unitIndex(boundaries, e.start);
    // A note that starts in one unit and runs into the next (a syncopated eighth) still closes its group.
    if (current.length && unit !== currentUnit) close();
    current.push(i);
    currentUnit = unit;
    const end = e.start + e.duration;
    if (unitIndex(boundaries, end - EPS) !== unit) close();
  });
  close();
  return joinHalfBars(groups, events, time, length);
}

/** In a full 4/4 bar, two beamed quarter-beats of four plain eighths in one half become one beam of four. */
function joinHalfBars(groups: number[][], events: readonly RhythmEvent[], time: TimeSig, length: number): number[][] {
  if (time.numerator !== 4 || time.denominator !== 4 || length !== WHOLE) return groups;
  const plainEighths = (g: number[]) => g.length === 2 && g.every((i) => isPlain(events[i].value, 8));
  const out: number[][] = [];
  for (let k = 0; k < groups.length; k++) {
    const a = groups[k];
    const b = groups[k + 1];
    if (b && plainEighths(a) && plainEighths(b)) {
      const startA = events[a[0]].start;
      const startB = events[b[0]].start;
      const sameHalf = Math.floor(startA / (WHOLE / 2)) === Math.floor(startB / (WHOLE / 2));
      if (sameHalf && Math.abs(startA % (WHOLE / 2)) < EPS && Math.abs(startB - startA - PPQ) < EPS && b[0] === a[a.length - 1] + 1) {
        out.push([...a, ...b]);
        k++;
        continue;
      }
    }
    out.push(a);
  }
  return out;
}

function isPlain(value: NoteValue | null, base: number): boolean {
  return !!value && value.base === base && !value.dots && !value.tuplet;
}

/** One beam segment of a group: level 1 is the main beam; `stub` marks a short beam on one note pointing left or right. */
export interface BeamSegment {
  level: number;
  /** First and last event index the segment spans (equal for a stub). */
  from: number;
  to: number;
  stub?: 'left' | 'right';
}

/**
 * The beams of one beamed group: the main beam over all of it, and for each deeper level a beam
 * over every run of notes that need it; a lone note that needs a deeper beam gets a stub that
 * points toward the note it belongs with (into the group at its ends; for dotted rhythms, toward
 * the beat it completes).
 */
export function beamSegments(group: readonly number[], events: readonly RhythmEvent[]): BeamSegment[] {
  if (group.length < 2) return [];
  const counts = group.map((i) => beamCount(events[i].value));
  const max = Math.max(...counts);
  const segments: BeamSegment[] = [{ level: 1, from: group[0], to: group[group.length - 1] }];
  for (let level = 2; level <= max; level++) {
    let k = 0;
    while (k < group.length) {
      if (counts[k] < level) {
        k++;
        continue;
      }
      let end = k;
      while (end + 1 < group.length && counts[end + 1] >= level) end++;
      if (end > k) segments.push({ level, from: group[k], to: group[end] });
      else segments.push({ level, from: group[k], to: group[k], stub: stubSide(group, k, events) });
      k = end + 1;
    }
  }
  return segments;
}

function stubSide(group: readonly number[], k: number, events: readonly RhythmEvent[]): 'left' | 'right' {
  if (k === 0) return 'right';
  if (k === group.length - 1) return 'left';
  const e = events[group[k]];
  const first = events[group[0]];
  // On a subdivision of its own length (s at the start of a pair) it opens the next note; otherwise it closes the one before.
  return Math.abs((e.start - first.start) % (2 * e.duration)) < EPS ? 'right' : 'left';
}

/** A tuplet: consecutive events written as `actual` in the time of `normal`. */
export interface TupletGroup {
  actual: number;
  normal: number;
  /** Event indices, in order. */
  events: number[];
  /** True when the group is incomplete (an importer's stray triplet): drawn with a bracket all the same. */
  partial?: boolean;
}

/**
 * Tuplet groups: consecutive events with the same ratio, closed as soon as their written lengths
 * add up to `actual` notes of the shortest value in the group (three eighths, a quarter and an
 * eighth, six sixteenths …).
 */
export function tupletGroups(events: readonly RhythmEvent[]): TupletGroup[] {
  const groups: TupletGroup[] = [];
  let current: TupletGroup | null = null;
  let written = 0;
  let maxBase = 0;
  const close = (partial: boolean) => {
    if (current && current.events.length) groups.push(partial ? { ...current, partial: true } : current);
    current = null;
    written = 0;
    maxBase = 0;
  };
  events.forEach((e, i) => {
    const t = e.value?.tuplet;
    if (!t) {
      if (current) close(true);
      return;
    }
    if (current && (current.actual !== t.actual || current.normal !== t.normal)) close(true);
    if (!current) current = { actual: t.actual, normal: t.normal, events: [] };
    current.events.push(i);
    const plain: NoteValue = { base: e.value!.base, dots: e.value!.dots };
    written += writtenTicks(plain);
    maxBase = Math.max(maxBase, e.value!.base);
    const target = (current.actual * WHOLE) / maxBase;
    if (written >= target - EPS) close(written > target + EPS);
  });
  if (current) close(true);
  return groups;
}

/** True when the beamed groups contain exactly this tuplet's notes (then the number needs no bracket). */
export function tupletMatchesBeam(tuplet: TupletGroup, beams: readonly number[][]): boolean {
  return beams.some((g) => g.length === tuplet.events.length && g.every((v, i) => v === tuplet.events[i]));
}

/** Text of a bend amount in semitones: 2 -> `full`, 1 -> `½`, 0.5 -> `¼`, 3 -> `1½`, 4 -> `2`. */
export function bendText(semitones: number): string {
  const whole = semitones / 2;
  const int = Math.floor(whole + EPS);
  const frac = whole - int;
  if (int === 1 && frac < EPS) return 'full';
  const fracText = Math.abs(frac - 0.5) < 0.01 ? '½' : Math.abs(frac - 0.25) < 0.01 ? '¼' : Math.abs(frac - 0.75) < 0.01 ? '¾' : frac > EPS ? String(Math.round(frac * 100) / 100).replace(/^0/, '') : '';
  if (int === 0) return fracText || '0';
  return `${int}${fracText}`;
}

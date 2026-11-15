/**
 * Rhythm of a tab staff, read from the stems printed under (or over) it.
 *
 * What the picture gives: a stem means "a quarter or longer", each beam or flag at its far end
 * halves that, and no stem at all (on a staff that has stems elsewhere) is a whole note. What it
 * usually does not give: half against quarter (many engravers print both as a bare stem) and
 * augmentation dots. Those are settled, where possible, by making the measure add up; such
 * values are marked as inferred, with a confidence below a value that was actually seen.
 */
import type { BinaryImage } from '../image/gray';
import { type DurationValue, type OmrDuration, durationTicks } from '../types';

/** A stem found outside the staff. */
export interface Stem {
  /** Centre column and extent in strip px. */
  x: number;
  y0: number;
  y1: number;
  width: number;
  /** Beams or flags at its far end. */
  beams: number;
}

/** Geometry the rhythm reader needs. */
export interface RhythmGeometry {
  space: number;
  lineYs: number[];
  x0: number;
  x1: number;
}

/**
 * Find the stems on one side of the staff: upright strokes at least 1.3 spaces long that start
 * within two spaces of the outer line. `side` +1 looks below the staff, -1 above it.
 */
export function findStems(bin: BinaryImage, g: RhythmGeometry, side: 1 | -1): Stem[] {
  const sp = g.space;
  const { width: w, height: h, data } = bin;
  const edge = side > 0 ? g.lineYs[g.lineYs.length - 1] : g.lineYs[0];
  const ya = side > 0 ? Math.ceil(edge + 0.3 * sp) : 0;
  const yb = side > 0 ? h : Math.floor(edge - 0.3 * sp);
  if (yb - ya < 1.3 * sp) return [];
  const minLen = 1.3 * sp;
  const xa = Math.max(0, Math.floor(g.x0 - sp));
  const xb = Math.min(w, Math.ceil(g.x1 + sp));
  // Longest upright run per column inside the band.
  const top = new Int32Array(w).fill(-1);
  const len = new Int32Array(w);
  for (let x = xa; x < xb; x++) {
    let run = 0;
    let best = 0;
    let bestTop = -1;
    for (let y = ya; y <= yb; y++) {
      const on = y < yb && data[y * w + x];
      if (on) run++;
      else {
        if (run > best) {
          best = run;
          bestTop = y - run;
        }
        run = 0;
      }
    }
    if (best >= minLen) {
      top[x] = bestTop;
      len[x] = best;
    }
  }
  const stems: Stem[] = [];
  let x = xa;
  while (x < xb) {
    if (top[x] < 0) {
      x++;
      continue;
    }
    const start = x;
    let y0 = top[x];
    let y1 = top[x] + len[x];
    while (x < xb && top[x] >= 0) {
      y0 = Math.min(y0, top[x]);
      y1 = Math.max(y1, top[x] + len[x]);
      x++;
    }
    const width = x - start;
    // A stem is thin; anything wider is a beam on end, a bracket or a letter.
    if (width > 0.45 * sp) continue;
    // It starts near the staff: the gap between staff and stem is at most two spaces.
    const gap = side > 0 ? y0 - edge : edge - y1;
    if (gap > 2.2 * sp) continue;
    stems.push({ x: (start + x) / 2, y0, y1, width, beams: 0 });
  }
  for (const s of stems) s.beams = countBeams(bin, s, sp, side);
  return stems;
}

/**
 * Count the beams or flags at the far end of a stem: the ink runs a column just beside the stem
 * crosses there. Beams welded together by blur count by their thickness.
 */
export function countBeams(bin: BinaryImage, stem: Stem, space: number, side: 1 | -1): number {
  const { width: w, height: h, data } = bin;
  // The far third of the stem, plus a little beyond its tip.
  const span = stem.y1 - stem.y0;
  const ya = Math.max(0, Math.floor(side > 0 ? stem.y1 - Math.max(0.45 * span, 1.3 * space) : stem.y0 - 0.25 * space));
  const yb = Math.min(h, Math.ceil(side > 0 ? stem.y1 + 0.25 * space : stem.y0 + Math.max(0.45 * span, 1.3 * space)));
  const counts: number[] = [];
  for (const dir of [-1, 1]) {
    const here: number[] = [];
    for (const d of [0.22, 0.32, 0.42]) {
      const x = Math.round(stem.x + dir * (stem.width / 2 + d * space));
      if (x < 0 || x >= w) continue;
      let n = 0;
      let run = 0;
      for (let y = ya; y <= yb; y++) {
        const on = y < yb && data[y * w + x];
        if (on) run++;
        else {
          // One beam is about half a space thick; two that touch are over a space.
          if (run >= 0.12 * space) n += Math.max(1, Math.round(run / (0.72 * space)));
          run = 0;
        }
      }
      here.push(n);
    }
    here.sort((a, b) => a - b);
    counts.push(here.length ? here[here.length >> 1] : 0);
  }
  return Math.min(4, Math.max(...counts, 0));
}

/** What the picture says about one event's length. */
export interface RhythmEvidence {
  /** A stem was found for the event. */
  stem: boolean;
  /** Beams / flags on it. */
  beams: number;
  /** A rest of this value is printed here instead of numbers. */
  rest?: DurationValue;
}

const VALUE_BY_BEAMS: DurationValue[] = ['quarter', 'eighth', '16th', '32nd', '32nd'];

/** A candidate length of an event. */
interface Option {
  value: DurationValue;
  dots: 0 | 1 | 2;
  ticks: number;
  /** How far the picture is from saying exactly this (0 = it shows it; higher = more of a leap). */
  cost: number;
}

const opt = (value: DurationValue, dots: 0 | 1 | 2, cost: number): Option => ({ value, dots, ticks: durationTicks(value, dots), cost });

/** The lengths an event may have, cheapest first. */
function optionsFor(e: RhythmEvidence): Option[] {
  if (e.rest) return [opt(e.rest, 0, 0), opt(e.rest, 1, 1.2)];
  if (!e.stem) return [opt('whole', 0, 0), opt('half', 0, 1.4), opt('half', 1, 1.6)];
  if (e.beams === 0) return [opt('quarter', 0, 0), opt('half', 0, 0.45), opt('quarter', 1, 0.7), opt('half', 1, 0.9)];
  const v = VALUE_BY_BEAMS[e.beams];
  return [opt(v, 0, 0), opt(v, 1, 0.8)];
}

/** Input of {@link solveMeasure}: the events of one measure, left to right. */
export interface MeasureEvent extends RhythmEvidence {
  /** Position in strip px. */
  x: number;
}

/**
 * Give the events of one measure lengths that add up to `ticks`, staying as close as possible to
 * what the stems show and to the spacing (a note followed by a wide gap is more likely the long
 * one). Returns null when no combination fits.
 */
export function solveMeasure(events: MeasureEvent[], ticks: number, xEnd: number): { options: Option[]; cost: number; ties: number } | null {
  const n = events.length;
  if (!n || n > 24) return null;
  const choices = events.map(optionsFor);
  // Share of the measure's width each event has to itself: a rough stand-in for its share of the time.
  const gaps = events.map((e, i) => Math.max(1, (i + 1 < n ? events[i + 1].x : xEnd) - e.x));
  const total = gaps.reduce((a, b) => a + b, 0);
  let best: { options: Option[]; cost: number } | null = null;
  let ties = 0;
  const suffixMin = new Array<number>(n + 1).fill(0);
  const suffixMax = new Array<number>(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    suffixMin[i] = suffixMin[i + 1] + Math.min(...choices[i].map((c) => c.ticks));
    suffixMax[i] = suffixMax[i + 1] + Math.max(...choices[i].map((c) => c.ticks));
  }
  const pick: Option[] = [];
  const walk = (i: number, left: number, cost: number): void => {
    if (best && cost > best.cost + 1e-6) return;
    if (i === n) {
      if (left !== 0) return;
      // Spacing: engravers give longer notes more room (roughly with the square root of the length).
      let spacing = 0;
      let norm = 0;
      for (const o of pick) norm += Math.sqrt(o.ticks);
      for (let k = 0; k < n; k++) spacing += Math.abs(Math.sqrt(pick[k].ticks) / norm - gaps[k] / total);
      const c = cost + 1.5 * spacing;
      if (!best || c < best.cost - 1e-6) {
        best = { options: pick.slice(), cost: c };
        ties = 0;
      } else if (Math.abs(c - best.cost) <= 0.05) ties++;
      return;
    }
    if (left < suffixMin[i] || left > suffixMax[i]) return;
    for (const o of choices[i]) {
      pick.push(o);
      walk(i + 1, left - o.ticks, cost + o.cost);
      pick.pop();
    }
  };
  walk(0, ticks, 0);
  const found = best as { options: Option[]; cost: number } | null;
  return found ? { options: found.options, cost: found.cost, ties } : null;
}

/** Result of {@link assignDurations} for one event (null = the staff carries no rhythm). */
export type ReadDuration = OmrDuration | null;

/**
 * Turn the evidence of every event into durations. `measures` lists, per measure, the indices of
 * its events in time order and the x of its closing bar line. With `measureTicks` (from a time
 * signature) the stem-only notes and hidden dots are resolved by making each measure add up;
 * without it, the most common length that the unambiguous measures agree on is tried (4/4 when
 * there is nothing to go on), at lower confidence; `support` is the number of measures that showed
 * that length outright.
 */
export function assignDurations(events: MeasureEvent[], measures: { events: number[]; xEnd: number }[], measureTicks: number | null): { durations: ReadDuration[]; measureTicks: number | null; assumed: boolean; support: number } {
  const stems = events.filter((e) => e.stem).length;
  if (!stems) return { durations: events.map(() => null), measureTicks, assumed: false, support: 0 };
  const seen = (e: RhythmEvidence): Option => optionsFor(e)[0];
  let ticks = measureTicks;
  let assumed = false;
  let support = 0;
  if (!ticks) {
    // No time signature: take the length the fullest measures show. A measure of plain quarters
    // and beamed groups shows its true length; one with halves printed as bare stems falls short.
    const sums = measures.filter((m) => m.events.length).map((m) => m.events.reduce((a, i) => a + seen(events[i]).ticks, 0));
    let pick = 0;
    let votes = 0;
    for (const c of [3840, 2880, 1920, 5760]) {
      if (sums.some((s) => s > c)) continue;
      const exact = sums.filter((s) => s === c).length;
      if (exact > votes) {
        votes = exact;
        pick = c;
      }
    }
    // Nothing adds up to a usual measure: common time if everything fits into it, else leave the stems as seen.
    ticks = pick || (sums.every((s) => s <= 3840) ? 3840 : null);
    support = votes;
    assumed = true;
  }
  const out: ReadDuration[] = events.map(() => null);
  const make = (o: Option, confidence: number, alts: Option[]): OmrDuration => ({
    value: o.value,
    dots: o.dots,
    ticks: o.ticks,
    confidence,
    alternatives: alts.filter((a) => a !== o && !(a.value === o.value && a.dots === o.dots)).slice(0, 2).map((a) => ({ value: { value: a.value, dots: a.dots }, confidence: Math.max(0.05, confidence * 0.6 - 0.15 * a.cost) })),
  });
  for (const m of measures) {
    const list = m.events.map((i) => events[i]);
    const base = list.map(seen);
    const baseSum = base.reduce((a, o) => a + o.ticks, 0);
    const solved = ticks && list.length ? solveMeasure(list, ticks, m.xEnd) : null;
    m.events.forEach((i, k) => {
      const e = events[i];
      const options = optionsFor(e);
      const shown = base[k];
      // What the picture alone supports: beams and flags are plain to see, a bare stem is a quarter or a half.
      const clear = e.rest ? 0.7 : e.stem ? (e.beams > 0 ? 0.88 : 0.55) : 0.6;
      if (!solved) {
        out[i] = make(shown, baseSum === ticks ? Math.min(0.9, clear + 0.25) : clear * 0.85, options);
        return;
      }
      const chosen = solved.options[k];
      const same = chosen.value === shown.value && chosen.dots === shown.dots;
      let confidence: number;
      if (same) confidence = Math.min(0.92, clear + (assumed ? 0.2 : 0.3));
      else confidence = (assumed ? 0.42 : 0.6) - (solved.ties ? 0.12 : 0) - 0.1 * Math.max(0, chosen.cost - 0.45);
      out[i] = make(chosen, Math.max(0.1, confidence), options);
    });
  }
  return { durations: out, measureTicks: ticks, assumed, support };
}

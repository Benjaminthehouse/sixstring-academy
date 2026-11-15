/**
 * Scoring a recognised page against its ground truth.
 *
 * Elements are matched by position (staves by their lines, bar lines by x, note heads and tab
 * numbers by box centre, measures by overlap), then compared. All counts are plain tallies so
 * pages can be summed into corpus-level rates.
 */
import type { Point } from '../image/gray';
import type { AccidentalType, OmrEvent, OmrMeasure, OmrNotationEvent, OmrNote, OmrPage, OmrStaff, OmrTabEvent, OmrTabNote } from '../types';
import { type GroundTruth, type GtMeasure, type GtNotationEvent, type GtNote, type GtStaff, type GtTabEvent, type GtTabNote, gtStaves, polylineY } from './truth';

/** Detection tally. */
export interface Tally {
  tp: number;
  fp: number;
  fn: number;
}

/** Accuracy tally. */
export interface Ratio {
  correct: number;
  total: number;
}

/** Scores of one page (or the sum over many). */
export interface PageScore {
  pages: number;
  /** Ground-truth staves, detected staves, and matches (same line count, lines within 0.3 space). */
  stavesTruth: number;
  stavesDetected: number;
  stavesMatched: number;
  /** Sum and maximum of the mean line-position error of matched staves, in staff spaces. */
  lineErrorSum: number;
  lineErrorMax: number;
  /** Every per-staff line error (for percentiles). */
  lineErrors: number[];
  /** Sum of the left / right end errors of matched staves, in staff spaces (two per staff). */
  endErrorSum: number;
  kind: Ratio;
  /** Decisions "these two neighbouring staves are / are not one system". */
  systems: Ratio;
  barlines: Tally;
  barlineType: Ratio;
  /** Matched staves whose measure count is right. */
  measureCount: Ratio;
  // ---- symbols (need the staff recognizers) ----
  notes: Tally;
  pitch: Ratio;
  duration: Ratio;
  rests: Tally;
  accidentals: Ratio;
  ties: Ratio;
  /** Notation measures read exactly (every event: pitches and duration). */
  measureExact: Ratio;
  key: Ratio;
  time: Ratio;
  tabNotes: Tally;
  fret: Ratio;
  string: Ratio;
  tabDuration: Ratio;
  /** Tab measures read exactly (every column: strings and frets). */
  tabMeasureExact: Ratio;
}

/** An all-zero score. */
export function emptyScore(): PageScore {
  const t = (): Tally => ({ tp: 0, fp: 0, fn: 0 });
  const r = (): Ratio => ({ correct: 0, total: 0 });
  return {
    pages: 0, stavesTruth: 0, stavesDetected: 0, stavesMatched: 0, lineErrorSum: 0, lineErrorMax: 0, lineErrors: [], endErrorSum: 0,
    kind: r(), systems: r(), barlines: t(), barlineType: r(), measureCount: r(),
    notes: t(), pitch: r(), duration: r(), rests: t(), accidentals: r(), ties: r(), measureExact: r(), key: r(), time: r(),
    tabNotes: t(), fret: r(), string: r(), tabDuration: r(), tabMeasureExact: r(),
  };
}

/** Add `b` into `a`. */
export function addScore(a: PageScore, b: PageScore): PageScore {
  const keys = Object.keys(a) as (keyof PageScore)[];
  for (const k of keys) {
    const va = a[k];
    const vb = b[k];
    if (k === 'lineErrorMax') a.lineErrorMax = Math.max(a.lineErrorMax, b.lineErrorMax);
    else if (Array.isArray(va)) (va as number[]).push(...(vb as number[]));
    else if (typeof va === 'number') (a[k] as number) = va + (vb as number);
    else for (const f of Object.keys(va) as (keyof typeof va)[]) (va[f] as number) += (vb as typeof va)[f] as number;
  }
  return a;
}

/** Share of the detections that are right (1 when nothing was detected). */
export const precision = (t: Tally): number => (t.tp + t.fp ? t.tp / (t.tp + t.fp) : 1);
/** Share of the true elements that were found (1 when there was nothing to find). */
export const recall = (t: Tally): number => (t.tp + t.fn ? t.tp / (t.tp + t.fn) : 1);
/** Harmonic mean of precision and recall. */
export const f1 = (t: Tally): number => {
  const p = precision(t);
  const r = recall(t);
  return p + r ? (2 * p * r) / (p + r) : 0;
};
/** Accuracy of a ratio tally (1 when nothing was compared). */
export const rate = (r: Ratio): number => (r.total ? r.correct / r.total : 1);

/** A ground-truth staff paired with the detected staff that covers it (or null). */
export interface StaffMatch {
  truth: GtStaff;
  truthSystem: number;
  detected: OmrStaff | null;
  detectedSystem: number;
  /** Mean line distance in staff spaces (Infinity when unmatched). */
  error: number;
}

function sampleXs(line: Point[], count = 9): number[] {
  const a = line[0].x;
  const b = line[line.length - 1].x;
  const out: number[] = [];
  for (let k = 0; k < count; k++) out.push(a + (b - a) * (0.08 + (0.84 * k) / (count - 1)));
  return out;
}

/** Pair ground-truth staves with detected staves by the position of their lines. */
export function matchStaves(page: OmrPage, truth: GroundTruth): StaffMatch[] {
  const det: { staff: OmrStaff; system: number }[] = [];
  page.systems.forEach((sys, s) => sys.staves.forEach((staff) => det.push({ staff, system: s })));
  const gts = gtStaves(truth);
  const pairs: { g: number; d: number; err: number }[] = [];
  gts.forEach(({ staff: g }, gi) => {
    det.forEach(({ staff: d }, di) => {
      if (d.lineCount !== g.lineCount) return;
      const overlap = Math.min(d.geometry.x1, g.x1) - Math.max(d.geometry.x0, g.x0);
      if (overlap < 0.75 * (g.x1 - g.x0)) return;
      let sum = 0;
      let n = 0;
      for (let l = 0; l < g.lineCount; l++) {
        for (const x of sampleXs(g.lines[l])) {
          sum += Math.abs(polylineY(d.geometry.lines[l], x) - polylineY(g.lines[l], x));
          n++;
        }
      }
      const err = sum / n / g.space;
      if (err < 0.3) pairs.push({ g: gi, d: di, err });
    });
  });
  pairs.sort((a, b) => a.err - b.err);
  const usedG = new Set<number>();
  const usedD = new Set<number>();
  const out: StaffMatch[] = gts.map(({ staff, system }) => ({ truth: staff, truthSystem: system, detected: null, detectedSystem: -1, error: Infinity }));
  for (const p of pairs) {
    if (usedG.has(p.g) || usedD.has(p.d)) continue;
    usedG.add(p.g);
    usedD.add(p.d);
    out[p.g].detected = det[p.d].staff;
    out[p.g].detectedSystem = det[p.d].system;
    out[p.g].error = p.err;
  }
  return out;
}

const centre = (b: { x: number; y: number; w: number; h: number }): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const centreOf = (b: [number, number, number, number]): Point => ({ x: b[0] + b[2] / 2, y: b[1] + b[3] / 2 });

/** Greedy one-to-one matching of two point sets within `maxDist`. Returns index pairs [a, b]. */
export function matchPoints(a: Point[], b: Point[], maxDist: number): [number, number][] {
  const cand: { i: number; j: number; d: number }[] = [];
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      const d = Math.hypot(a[i].x - b[j].x, a[i].y - b[j].y);
      if (d <= maxDist) cand.push({ i, j, d });
    }
  }
  cand.sort((p, q) => p.d - q.d);
  const ua = new Set<number>();
  const ub = new Set<number>();
  const out: [number, number][] = [];
  for (const c of cand) {
    if (ua.has(c.i) || ub.has(c.j)) continue;
    ua.add(c.i);
    ub.add(c.j);
    out.push([c.i, c.j]);
  }
  return out;
}

const ACC: Record<string, AccidentalType> = { '#': 'sharp', b: 'flat', n: 'natural', '##': 'double-sharp', bb: 'double-flat' };

function sameDuration(g: { value: string; dots: number; tuplet?: { actual: number; normal: number } }, d: OmrEvent['duration']): boolean {
  if (!d) return false;
  if (d.value !== g.value || d.dots !== g.dots) return false;
  const gt = g.tuplet ? `${g.tuplet.actual}:${g.tuplet.normal}` : '';
  const dt = d.tuplet ? `${d.tuplet.actual}:${d.tuplet.normal}` : '';
  return gt === dt;
}

/** For each truth measure, the detected measure that overlaps it most (or null). */
function matchMeasures<E>(gt: GtMeasure<E>[], det: OmrMeasure[]): (OmrMeasure | null)[] {
  return gt.map((g) => {
    let best: OmrMeasure | null = null;
    let bestO = 0;
    for (const d of det) {
      const o = Math.min(g.x1, d.x1) - Math.max(g.x0, d.x0);
      if (o > bestO) {
        bestO = o;
        best = d;
      }
    }
    return best && bestO >= 0.6 * (g.x1 - g.x0) ? best : null;
  });
}

function scoreNotation(score: PageScore, g: GtStaff & { kind: 'notation' }, d: OmrStaff): void {
  const gEvents = g.measures.flatMap((m) => m.events);
  const dEvents = d.measures.flatMap((m) => m.events).filter((e): e is OmrNotationEvent => e.kind === 'chord' || e.kind === 'rest');
  const gHeads: { n: GtNote; e: GtNotationEvent }[] = [];
  for (const e of gEvents) for (const n of e.notes) gHeads.push({ n, e });
  const dHeads: { n: OmrNote; e: OmrNotationEvent }[] = [];
  for (const e of dEvents) for (const n of e.notes) dHeads.push({ n, e });
  const pairs = matchPoints(gHeads.map((h) => centreOf(h.n.head)), dHeads.map((h) => centre(h.n.bbox)), 0.6 * g.space);
  score.notes.tp += pairs.length;
  score.notes.fn += gHeads.length - pairs.length;
  score.notes.fp += dHeads.length - pairs.length;
  const eventPair = new Map<GtNotationEvent, OmrNotationEvent>();
  for (const [gi, di] of pairs) {
    const gh = gHeads[gi];
    const dh = dHeads[di];
    score.pitch.total++;
    if (dh.n.pitch.midi === gh.n.midi) score.pitch.correct++;
    if (gh.n.accidental || dh.n.accidental) {
      score.accidentals.total++;
      if (gh.n.accidental && dh.n.accidental && ACC[gh.n.accidental] === dh.n.accidental.type) score.accidentals.correct++;
    }
    if (gh.n.tieStart || dh.n.tieStart) {
      score.ties.total++;
      if (gh.n.tieStart && dh.n.tieStart) score.ties.correct++;
    }
    if (!eventPair.has(gh.e)) eventPair.set(gh.e, dh.e);
  }
  // Rests by position.
  const gRests = gEvents.filter((e) => e.type === 'rest' && e.head);
  const dRests = dEvents.filter((e) => e.kind === 'rest');
  const restPairs = matchPoints(gRests.map((e) => centreOf(e.head as [number, number, number, number])), dRests.map((e) => centre(e.bbox)), 1.0 * g.space);
  score.rests.tp += restPairs.length;
  score.rests.fn += gRests.length - restPairs.length;
  score.rests.fp += dRests.length - restPairs.length;
  for (const [gi, di] of restPairs) eventPair.set(gRests[gi], dRests[di]);
  for (const [ge, de] of eventPair) {
    score.duration.total++;
    if (sameDuration(ge.duration, de.duration)) score.duration.correct++;
  }
  // Exact measures.
  const mm = matchMeasures(g.measures, d.measures);
  g.measures.forEach((gm, i) => {
    score.measureExact.total++;
    const dm = mm[i];
    if (!dm) return;
    const de = dm.events.filter((e): e is OmrNotationEvent => e.kind === 'chord' || e.kind === 'rest');
    if (de.length !== gm.events.length) return;
    for (let k = 0; k < de.length; k++) {
      const a = gm.events[k];
      const b = de[k];
      if ((a.type === 'rest') !== (b.kind === 'rest')) return;
      if (!sameDuration(a.duration, b.duration)) return;
      const pa = a.notes.map((n) => n.midi).sort((x, y) => x - y).join(',');
      const pb = b.notes.map((n) => n.pitch.midi).sort((x, y) => x - y).join(',');
      if (pa !== pb) return;
    }
    score.measureExact.correct++;
  });
  if (g.key) {
    score.key.total++;
    if ((d.keySignature?.fifths ?? 0) === g.key.fifths) score.key.correct++;
  }
  if (g.time) {
    score.time.total++;
    if (d.timeSignature && d.timeSignature.beats === g.time.num && d.timeSignature.beatValue === g.time.den) score.time.correct++;
  }
}

function scoreTab(score: PageScore, g: GtStaff & { kind: 'tab' }, d: OmrStaff): void {
  const gEvents = g.measures.flatMap((m) => m.events);
  const dEvents = d.measures.flatMap((m) => m.events).filter((e): e is OmrTabEvent => e.kind === 'tab' || e.kind === 'tab-rest');
  const gNotes: { n: GtTabNote; e: GtTabEvent }[] = [];
  for (const e of gEvents) for (const n of e.notes) gNotes.push({ n, e });
  const dNotes: { n: OmrTabNote; e: OmrTabEvent }[] = [];
  for (const e of dEvents) for (const n of e.notes) dNotes.push({ n, e });
  const pairs = matchPoints(gNotes.map((h) => centreOf(h.n.bbox)), dNotes.map((h) => centre(h.n.bbox)), 0.6 * g.space);
  score.tabNotes.tp += pairs.length;
  score.tabNotes.fn += gNotes.length - pairs.length;
  score.tabNotes.fp += dNotes.length - pairs.length;
  const eventPair = new Map<GtTabEvent, OmrTabEvent>();
  for (const [gi, di] of pairs) {
    const gn = gNotes[gi];
    const dn = dNotes[di];
    score.fret.total++;
    if (dn.n.fret === gn.n.fret) score.fret.correct++;
    score.string.total++;
    if (dn.n.string === gn.n.string) score.string.correct++;
    if (!eventPair.has(gn.e)) eventPair.set(gn.e, dn.e);
  }
  if (g.stems) {
    for (const [ge, de] of eventPair) {
      score.tabDuration.total++;
      if (sameDuration(ge.duration, de.duration)) score.tabDuration.correct++;
    }
  }
  const mm = matchMeasures(g.measures, d.measures);
  g.measures.forEach((gm, i) => {
    score.tabMeasureExact.total++;
    const dm = mm[i];
    if (!dm) return;
    const ge = gm.events.filter((e) => e.type === 'note');
    const de = dm.events.filter((e): e is OmrTabEvent => e.kind === 'tab');
    if (de.length !== ge.length) return;
    for (let k = 0; k < de.length; k++) {
      const a = ge[k].notes.map((n) => `${n.string}:${n.fret}`).sort().join(',');
      const b = de[k].notes.map((n) => `${n.string}:${n.fret}`).sort().join(',');
      if (a !== b) return;
    }
    score.tabMeasureExact.correct++;
  });
}

/** Score one recognised page against its ground truth. */
export function scorePage(page: OmrPage, truth: GroundTruth): PageScore {
  const score = emptyScore();
  score.pages = 1;
  const matches = matchStaves(page, truth);
  score.stavesTruth = matches.length;
  score.stavesDetected = page.systems.reduce((a, s) => a + s.staves.length, 0);
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const g = m.truth;
    const d = m.detected;
    if (!d) {
      score.barlines.fn += g.barlines.length;
      // Missed staves lose all their symbols.
      if (g.kind === 'notation') {
        for (const mm of g.measures) {
          score.measureExact.total++;
          for (const e of mm.events) {
            score.notes.fn += e.notes.length;
            if (e.type === 'rest' && e.head) score.rests.fn++;
          }
        }
      } else {
        for (const mm of g.measures) {
          score.tabMeasureExact.total++;
          for (const e of mm.events) score.tabNotes.fn += e.notes.length;
        }
      }
      continue;
    }
    score.stavesMatched++;
    score.lineErrorSum += m.error;
    score.lineErrorMax = Math.max(score.lineErrorMax, m.error);
    score.lineErrors.push(m.error);
    score.endErrorSum += (Math.abs(d.geometry.x0 - g.x0) + Math.abs(d.geometry.x1 - g.x1)) / g.space;
    score.kind.total++;
    if (d.kind === g.kind) score.kind.correct++;
    // Bar lines by x along the staff.
    const pairs = matchPoints(g.barlines.map((b) => ({ x: b.x, y: 0 })), d.barlines.map((b) => ({ x: b.x, y: 0 })), 0.6 * g.space);
    score.barlines.tp += pairs.length;
    score.barlines.fn += g.barlines.length - pairs.length;
    score.barlines.fp += d.barlines.length - pairs.length;
    for (const [gi, di] of pairs) {
      score.barlineType.total++;
      if (g.barlines[gi].type === d.barlines[di].type) score.barlineType.correct++;
    }
    // A repeat sign right after the clef closes a "measure" that holds only the clef, key and time
    // signature. The ground truth does not count it; the assembler drops it once it is known to be empty.
    const header = g.barlines.length > 1 && g.barlines[1].type === 'repeat-begin' && g.barlines[1].x < g.measures[0].x0 + 0.6 * (g.measures[0].x1 - g.measures[0].x0) ? 1 : 0;
    score.measureCount.total++;
    if (d.measures.length === g.measures.length || d.measures.length === g.measures.length + header) score.measureCount.correct++;
    if (g.kind === 'notation') scoreNotation(score, g, d);
    else scoreTab(score, g, d);
    // System grouping with the next ground-truth staff.
    const next = matches[i + 1];
    if (next?.detected) {
      score.systems.total++;
      if ((next.truthSystem === m.truthSystem) === (next.detectedSystem === m.detectedSystem)) score.systems.correct++;
    }
  }
  return score;
}

/** p-th percentile (0..1) of a list. */
export function percentileOf(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = values.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

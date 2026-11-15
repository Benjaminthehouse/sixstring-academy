/**
 * The standard-notation recognizer: reads one five-line staff strip into notes, chords and rests
 * with pitch, duration and ties, plus clef, key and time signature.
 *
 *   const reading = recognizeNotationStaff(extractStaff(analysis, i));
 *   const page = await recognizePage(gray, { notation: createNotationRecognizer() });
 *
 * See README.md of `core/omr` (section "Notation recognizer") for the method and its limits.
 */
import type {
  AccidentalType, Alternative, BBox, ClefType, DurationValue, OmrNotationEvent, OmrNote, OmrPitch, OmrText, OmrWarning, RecognizeNotationStaff, RecognizeOptions,
  StaffInput, StaffReading,
} from '../types';
import { durationTicks } from '../types';
import { type Header, readHeader } from './header';
import { type Head, findHeads } from './heads';
import { type AccidentalMark, ownBox, readAccidentals, tieBetween, tupletNumber } from './marks';
import { type Chord, type SBox, baseValue, buildChords, readDots, readTails } from './notes';
import { AccidentalState, pitchOf } from './pitch';
import { type RestMark, readRests } from './rests';
import { type DurationOption, type RhythmEvent, inferMeasureTicks, measureTicks, optionTicks, solveMeasure, stepValue } from './rhythm';
import { type Stroke, findStrokes } from './stems';
import { CLAIM, type Strip, buildStrip, posY } from './strip';

export { buildStrip, type Strip } from './strip';
export { type Header, readHeader } from './header';
export { type Head, type HeadKind, findHeads } from './heads';
export { type Chord } from './notes';
export { type RestMark } from './rests';
export { type Stroke, findStrokes } from './stems';
export { AccidentalState, keyAlterations, pitchOf } from './pitch';
export { type DurationOption, type RhythmEvent, measureTicks, solveMeasure } from './rhythm';
export { type Template, templatesOf } from './templates';

/** An event in strip coordinates, before it is turned into the output model. */
export interface StripEvent {
  kind: 'chord' | 'rest';
  x: number;
  chord?: Chord;
  rest?: RestMark;
  /** Accidental in front of each head of the chord (same order as `chord.heads`). */
  accidentals: (AccidentalMark | null)[];
  /** Per head: a tie starts / ends here. */
  tieStart: boolean[];
  tieStop: boolean[];
  /** Index of the measure (in `input.measures`). */
  measure: number;
  rhythm: RhythmEvent;
  /** Confidence of the duration after the consistency check. */
  durationConfidence: number;
  box: SBox;
}

/** Everything the recognizer worked out for one staff, in strip coordinates (for debugging and tests). */
export interface StaffAnalysis {
  strip: Strip;
  header: Header;
  strokes: Stroke[];
  heads: Head[];
  chords: Chord[];
  rests: RestMark[];
  events: StripEvent[];
  /** Ticks per measure used for the consistency check (0 = unknown). */
  measureTicks: number;
  /** Per measure of `input.measures`: did it add up? (null = not checked). */
  measureOk: (boolean | null)[];
  texts: SBox[];
  warnings: OmrWarning[];
  /** Milliseconds per stage. */
  timings: Record<string, number>;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Share of the ledger lines a head outside the staff needs that are actually there (1 inside the staff). */
export function ledgerSupport(strip: Strip, head: Head): number {
  const { w, h, nl, s } = strip;
  const need: number[] = [];
  if (head.pos >= 10) for (let p = 10; p <= head.pos; p += 2) need.push(p);
  if (head.pos <= -2) for (let p = -2; p >= head.pos; p -= 2) need.push(p);
  if (!need.length) return 1;
  const cover = (xa: number, xb: number, y: number): number => {
    let hit = 0;
    let n = 0;
    for (let x = Math.round(xa); x < Math.round(xb); x++) {
      n++;
      if (x < 0 || x >= w) continue;
      for (let dy = -3; dy <= 3; dy++) {
        const yy = Math.round(y) + dy;
        if (yy >= 0 && yy < h && nl[yy * w + x]) { hit++; break; }
      }
    }
    return n ? hit / n : 0;
  };
  let found = 0;
  for (const p of need) {
    const y = posY(strip, p);
    const left = cover(head.x - head.w / 2 - 0.3 * s, head.x - head.w / 2 - 0.05 * s, y);
    const right = cover(head.x + head.w / 2 + 0.05 * s, head.x + head.w / 2 + 0.3 * s, y);
    const through = Math.abs(p - head.pos) <= 1 ? 1 : cover(head.x - head.w / 2, head.x + head.w / 2, y);
    if (Math.max(left, right) >= 0.6 && Math.min(left, right) >= 0.2 && through >= 0.6) found++;
  }
  return found / need.length;
}

/** Give the components under the heads and stems of the chords to the notes. */
function ownNotes(strip: Strip, chords: Chord[]): void {
  const { w, h, cc, owner } = strip;
  const take = (x: number, y: number): void => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = xi + dx;
        const yy = yi + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const id = cc.labels[yy * w + xx];
        if (id) owner[id] = CLAIM.head;
      }
    }
  };
  for (const c of chords) {
    for (const hd of c.heads) {
      take(hd.x, hd.y);
      take(hd.x - 0.38 * hd.w, hd.y);
      take(hd.x + 0.38 * hd.w, hd.y);
    }
    if (c.stem) for (let y = c.stem.ya; y <= c.stem.yb; y += 3) take(c.stem.x, y);
  }
}

function measureOf(input: StaffInput, x: number): number {
  const ms = input.measures;
  if (!ms.length) return 0;
  for (let i = 0; i < ms.length; i++) if (x >= ms[i].x0 && x < ms[i].x1) return i;
  return x < ms[0].x0 ? 0 : ms.length - 1;
}

/** Duration readings of a chord, primary first. */
function chordOptions(c: Chord): DurationOption[] {
  const value = baseValue(c);
  const dots = Math.min(2, c.dots) as 0 | 1 | 2;
  const out: DurationOption[] = [{ value, dots, tuplet: c.tuplet, cost: 0 }];
  const add = (v: DurationValue | null, d: number, cost: number): void => {
    if (v && d >= 0 && d <= 2) out.push({ value: v, dots: d as 0 | 1 | 2, tuplet: c.tuplet, cost });
  };
  const kind = c.heads[0].kind;
  const kindScore = Math.min(...c.heads.map((hd) => hd.kindScore));
  // A dot missed (faint, merged into the head) or invented (a speck, a staccato dot).
  add(value, dots + 1, dots === 0 ? 1.0 : 2.2);
  if (dots > 0) add(value, dots - 1, 1.3);
  if (kind === 'filled') {
    const n = Math.max(c.beams, c.flags);
    const tail = 0.8 + 1.6 * c.tailScore;
    add(stepValue(value, 1), dots, tail);
    if (n > 0) add(stepValue(value, -1), dots, tail);
    if (n === 0) {
      // An open head filled in by blur.
      add('half', dots, 1.0 + 2.2 * kindScore);
      add('half', dots + 1, 2.0 + 2.2 * kindScore);
    }
  } else if (kind === 'open') {
    add('quarter', dots, 1.0 + 2.2 * kindScore);
    add('whole', dots, 2.6);
  } else {
    add('half', dots, 2.6);
  }
  return out;
}

/** Duration readings of a rest, primary first. */
function restOptions(r: RestMark): DurationOption[] {
  const dots = Math.min(2, r.dots) as 0 | 1 | 2;
  const out: DurationOption[] = [{ value: r.value, dots, cost: 0 }];
  for (const a of r.alternatives) out.push({ value: a.value, dots, cost: 0.9 + 4 * Math.max(0, r.score - a.score) });
  if (r.value === 'whole' && !out.some((o) => o.value === 'half')) out.push({ value: 'half', dots, cost: 1.4 });
  if (r.value === 'half' && !out.some((o) => o.value === 'whole')) out.push({ value: 'whole', dots, cost: 1.4 });
  out.push({ value: r.value, dots: Math.min(2, dots + 1) as 0 | 1 | 2, cost: 1.6 });
  if (dots > 0) out.push({ value: r.value, dots: (dots - 1) as 0 | 1 | 2, cost: 1.5 });
  return out;
}

/** Options that carry over from earlier staves of the page. */
export interface NotationContext {
  fifths?: number;
  beats?: number;
  beatValue?: number;
  clef?: ClefType;
}

/** Run the whole analysis of one staff strip and keep every intermediate result. */
export function analyzeNotationStaff(input: StaffInput, options: RecognizeOptions = {}): StaffAnalysis {
  const timings: Record<string, number> = {};
  let t = now();
  const lap = (name: string): void => {
    const n = now();
    timings[name] = (timings[name] ?? 0) + n - t;
    t = n;
  };
  const strip = buildStrip(input);
  const { s } = strip;
  const warnings: OmrWarning[] = [];
  lap('prepare');

  const header = readHeader(strip);
  lap('header');
  const musicX0 = header.endX + 0.15 * s;
  const musicX1 = strip.x1 + 0.3 * s;
  ownBox(strip, { x0: 0, y0: 0, x1: header.endX + 1, y1: strip.h }, CLAIM.header, 0.6);
  for (const b of input.barlines) ownBox(strip, { x0: b.x0 - 2, y0: strip.top - 0.3 * s, x1: b.x1 + 2, y1: strip.bottom + 0.3 * s }, CLAIM.barline, 0.5);

  const strokes = findStrokes(strip, musicX0, musicX1);
  lap('stems');
  let heads = findHeads(strip, musicX0, musicX1);
  lap('heads');
  // Heads off the staff need their ledger lines; this is also what keeps letters of the text
  // above the staff ("o", "d") from being read as notes.
  heads = heads.filter((hd) => {
    const support = ledgerSupport(strip, hd);
    if (support < 0.5) return false;
    if (support < 1) hd.score *= 0.7;
    return true;
  });
  let chords = buildChords(strip, heads, strokes);
  // Notes with filled heads first: a ring-like shape inside one of them (the loop of a flag, the
  // gap between two beams) is neither a half note nor a whole note.
  const insideNote = (hd: Head): boolean => {
    for (const dx of [-0.38 * hd.w, 0.38 * hd.w]) {
      const xi = Math.round(hd.x + dx);
      const yi = Math.round(hd.y);
      if (xi < 0 || xi >= strip.w || yi < 0 || yi >= strip.h) continue;
      const id = strip.cc.labels[yi * strip.w + xi];
      if (id && strip.owner[id] === CLAIM.head) return true;
    }
    return false;
  };
  ownNotes(strip, chords.filter((c) => c.stem && c.heads[0].kind === 'filled'));
  chords = chords.filter((c) => !c.stem || c.heads[0].kind === 'filled' || !c.heads.some(insideNote));
  ownNotes(strip, chords.filter((c) => c.stem));
  // A filled head without a stem is not a note; an open head without one is a whole note, which
  // stands alone (a ring-like shape inside a beam, a flag or a rest is not one).
  chords = chords.filter((c) => {
    if (c.stem) return true;
    if (c.heads[0].kind === 'filled') return false;
    c.heads = c.heads.filter((hd) => hd.score >= 0.56 && !insideNote(hd));
    if (!c.heads.length) return false;
    for (const hd of c.heads) {
      if (hd.kind === 'open') {
        hd.kind = 'whole';
        hd.kindScore = Math.min(hd.kindScore, 0.5);
        hd.score *= 0.85;
      }
    }
    return true;
  });
  ownNotes(strip, chords.filter((c) => !c.stem));
  readTails(strip, chords);
  readDots(strip, chords);
  for (const c of chords) for (const d of c.dotBoxes) ownBox(strip, d, CLAIM.dot);
  lap('notes');

  // Accidentals may reach left as far as the previous chord or bar line.
  const sorted = chords.slice().sort((a, b) => a.x - b.x);
  const limitX = (c: Chord): number => {
    const i = sorted.indexOf(c);
    let lim = musicX0 - 0.2 * s;
    for (let k = i - 1; k >= 0; k--) {
      // Notes of another voice at the same place do not block.
      if (sorted[k].box.x1 < c.x - 0.6 * s) { lim = Math.max(lim, Math.max(...sorted[k].heads.map((hd) => hd.x + hd.w / 2)) + 0.05 * s); break; }
    }
    for (const b of input.barlines) if (b.x1 < c.x) lim = Math.max(lim, b.x1 + 1);
    return lim;
  };
  const accidentals = readAccidentals(strip, chords, limitX);
  lap('accidentals');
  const rests = readRests(strip, musicX0, musicX1);
  lap('rests');

  // Events, left to right.
  const events: StripEvent[] = [];
  for (const c of chords) {
    events.push({
      kind: 'chord', x: c.x, chord: c, accidentals: accidentals.get(c) ?? c.heads.map(() => null),
      tieStart: c.heads.map(() => false), tieStop: c.heads.map(() => false),
      measure: measureOf(input, c.x),
      rhythm: { options: [], chosen: 0, group: -1, dropCost: c.score < 0.6 ? 2.4 : Infinity, dropped: false },
      durationConfidence: 1, box: c.box,
    });
  }
  for (const r of rests) {
    events.push({
      kind: 'rest', x: r.x, rest: r, accidentals: [], tieStart: [], tieStop: [], measure: measureOf(input, r.x),
      rhythm: { options: [], chosen: 0, group: -1, dropCost: r.score < 0.62 ? 2.0 : Infinity, dropped: false },
      durationConfidence: 1, box: r.box,
    });
  }
  events.sort((a, b) => a.x - b.x);

  // Beam groups and tuplet numbers.
  let group = 0;
  const chordEvents = events.filter((e) => e.kind === 'chord');
  for (let i = 0; i < chordEvents.length; i++) {
    const c = chordEvents[i].chord as Chord;
    if (!c.beamLeft && !c.beamRight) continue;
    if (!c.beamLeft) group++;
    chordEvents[i].rhythm.group = group;
  }
  const groups = new Map<number, StripEvent[]>();
  for (const e of chordEvents) {
    if (e.rhythm.group < 0) continue;
    const l = groups.get(e.rhythm.group);
    if (l) l.push(e); else groups.set(e.rhythm.group, [e]);
  }
  for (const list of groups.values()) {
    const tn = tupletNumber(strip, list.map((e) => e.chord as Chord));
    if (tn && tn.value === 3 && list.length === 3) {
      for (const e of list) (e.chord as Chord).tuplet = { actual: 3, normal: 2 };
      ownBox(strip, tn.box, CLAIM.tuplet, 0.3);
    }
  }
  lap('tuplets');

  // Ties between neighbouring chords with a head at the same staff position.
  for (let i = 0; i + 1 < events.length; i++) {
    const a = events[i];
    const b = events[i + 1];
    if (a.kind !== 'chord' || b.kind !== 'chord') continue;
    const ca = a.chord as Chord;
    const cb = b.chord as Chord;
    ca.heads.forEach((ha, ia) => {
      const ib = cb.heads.findIndex((hb) => hb.pos === ha.pos);
      if (ib < 0 || b.accidentals[ib]) return;
      const hb = cb.heads[ib];
      const from = ha.x + ha.w / 2 + 1;
      const to = hb.x - hb.w / 2 - 1;
      if (to - from > 14 * s) return;
      const tie = tieBetween(strip, from, to, ha.y);
      if (tie.found) {
        a.tieStart[ia] = true;
        b.tieStop[ib] = true;
        if (tie.box) ownBox(strip, tie.box, CLAIM.tie, 0.5);
      }
    });
  }
  // A tie that leaves the staff at its end, or arrives at its start (the music continues on another system).
  if (events.length) {
    const last = events[events.length - 1];
    if (last.kind === 'chord') {
      const c = last.chord as Chord;
      c.heads.forEach((hd, i) => {
        const from = Math.max(...c.dotBoxes.map((d) => d.x1), hd.x + hd.w / 2) + 1;
        const lastBar = input.barlines.length ? input.barlines[input.barlines.length - 1] : null;
        const to = (lastBar && lastBar.x0 > from ? lastBar.x0 : strip.x1) - 2;
        if (to - from < 0.8 * s) return;
        const tie = tieBetween(strip, from, to, hd.y);
        if (tie.found) last.tieStart[i] = true;
      });
    }
    const first = events[0];
    if (first.kind === 'chord') {
      const c = first.chord as Chord;
      c.heads.forEach((hd, i) => {
        if (first.accidentals[i]) return;
        const to = hd.x - hd.w / 2 - 1;
        const from = Math.max(musicX0, to - 2.2 * s);
        if (to - from < 0.8 * s) return;
        const tie = tieBetween(strip, from, to, hd.y);
        if (tie.found) first.tieStop[i] = true;
      });
    }
  }
  lap('ties');

  // Rhythm: options per event, then the measure check.
  for (const e of events) e.rhythm.options = e.kind === 'chord' ? chordOptions(e.chord as Chord) : restOptions(e.rest as RestMark);
  const perMeasure: StripEvent[][] = input.measures.map(() => []);
  if (!perMeasure.length) perMeasure.push([]);
  for (const e of events) perMeasure[Math.min(perMeasure.length - 1, e.measure)].push(e);
  for (const list of perMeasure) {
    if (list.length === 1 && list[0].kind === 'rest' && (list[0].rest as RestMark).value === 'whole') list[0].rhythm.measureRest = true;
  }
  const ctx = options.context ?? {};
  let target = 0;
  if (header.time && header.time.confidence >= 0.5) target = measureTicks(header.time.value.beats, header.time.value.beatValue);
  else if (ctx.beats && ctx.beatValue) target = measureTicks(ctx.beats, ctx.beatValue);
  const sums = perMeasure.map((list) => list.reduce((a, e) => a + optionTicks(e.rhythm.options[0]), 0));
  if (!target) target = inferMeasureTicks(sums.filter((_, i) => !(perMeasure[i].length === 1 && perMeasure[i][0].rhythm.measureRest)));
  const measureOk: (boolean | null)[] = perMeasure.map(() => null);
  if (target) {
    perMeasure.forEach((list, mi) => {
      if (!list.length) return;
      const first = mi === 0;
      const lastM = mi === perMeasure.length - 1;
      const sum = sums[mi];
      // A pickup bar at the start and its complement at the end are shorter than the metre.
      const mayBeShort = (first || lastM) && sum < target;
      const sol = solveMeasure(list.map((e) => e.rhythm), target, mayBeShort ? 1.25 : 3.2);
      measureOk[mi] = sol.consistent;
      if (sol.consistent) {
        for (const e of list) e.durationConfidence = e.rhythm.chosen === 0 && !e.rhythm.dropped ? 0.95 : 0.55;
      } else if (mayBeShort) {
        measureOk[mi] = null;
        for (const e of list) e.durationConfidence = 0.8;
      } else {
        for (const e of list) e.durationConfidence = 0.45;
        warnings.push({ code: 'measure-mismatch', message: `Measure ${mi + 1} of this staff does not add up: read ${(sum / 960).toFixed(2)} quarter notes, expected ${(target / 960).toFixed(2)}.` });
      }
    });
  } else {
    for (const e of events) e.durationConfidence = 0.75;
  }
  lap('rhythm');

  // What is left above the staff is text for the caller to read (chord symbols, tempo, titles).
  const texts = textRegions(strip, musicX0);
  lap('text');

  return {
    strip, header, strokes, heads, chords, rests,
    events: events.filter((e) => !e.rhythm.dropped),
    measureTicks: target, measureOk, texts, warnings, timings,
  };
}

/** Boxes of unexplained ink above the staff, merged into lines of text. */
function textRegions(strip: Strip, fromX: number): SBox[] {
  const { s, cc, owner } = strip;
  const boxes: SBox[] = [];
  for (let id = 1; id <= cc.count; id++) {
    if (owner[id]) continue;
    const ch = cc.y1[id] - cc.y0[id] + 1;
    const cw = cc.x1[id] - cc.x0[id] + 1;
    if (cc.y1[id] > strip.top - 0.6 * s) continue;
    if (ch < 0.35 * s || ch > 3.5 * s || cw > 4 * s || cc.area[id] < 0.05 * s * s) continue;
    if (cc.x1[id] < fromX - 6 * s) continue;
    boxes.push({ x0: cc.x0[id], y0: cc.y0[id], x1: cc.x1[id] + 1, y1: cc.y1[id] + 1 });
  }
  boxes.sort((a, b) => a.x0 - b.x0);
  const lines: SBox[] = [];
  for (const b of boxes) {
    const l = lines.find((q) => b.x0 - q.x1 < 0.9 * s && Math.min(q.y1, b.y1) - Math.max(q.y0, b.y0) > -0.3 * s && Math.abs((q.y0 + q.y1) / 2 - (b.y0 + b.y1) / 2) < 1.2 * s);
    if (l) {
      l.x1 = Math.max(l.x1, b.x1);
      l.y0 = Math.min(l.y0, b.y0);
      l.y1 = Math.max(l.y1, b.y1);
    } else {
      lines.push({ ...b });
    }
  }
  return lines.filter((l) => l.x1 - l.x0 >= 0.5 * s);
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

function toPageBox(input: StaffInput, b: SBox): BBox {
  const p = input.toPageBox(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  return { x: round2(p.x), y: round2(p.y), w: round2(p.w), h: round2(p.h) };
}

/** Turn an analysis into the staff reading the page assembler expects (page coordinates). */
export function toReading(a: StaffAnalysis, options: RecognizeOptions = {}): StaffReading<OmrNotationEvent> {
  const { strip, header } = a;
  const input = strip.input;
  const ctx = options.context ?? {};
  const clefType: ClefType = header.clef?.value ?? ctx.clef ?? 'treble-8vb';
  const fifths = header.key?.value ?? (header.clef ? 0 : ctx.fifths ?? 0);
  const state = new AccidentalState(fifths, clefType);
  const events: (OmrNotationEvent & { measureIndex?: number })[] = [];
  let measure = -1;
  let total = 0;
  let n = 0;
  for (const e of a.events) {
    if (e.measure !== measure) {
      state.newBar();
      measure = e.measure;
    }
    const opt = e.rhythm.options[e.rhythm.chosen];
    const alts: Alternative<{ value: DurationValue; dots: 0 | 1 | 2 }>[] = [];
    e.rhythm.options.forEach((o, k) => {
      if (k === e.rhythm.chosen || alts.length >= 3) return;
      if (alts.some((q) => q.value.value === o.value && q.value.dots === o.dots)) return;
      alts.push({ value: { value: o.value, dots: o.dots }, confidence: round2(Math.max(0.02, Math.min(0.45, 0.5 / (1 + o.cost + (k === 0 ? 0 : 0))))) });
    });
    const full = e.rhythm.measureRest && a.measureTicks ? a.measureTicks : durationTicks(opt.value, opt.dots, opt.tuplet);
    const duration = { value: opt.value, dots: opt.dots, tuplet: opt.tuplet, ticks: full, confidence: round2(e.durationConfidence), alternatives: alts.length ? alts : undefined };
    const centre = input.toPage(e.x, e.kind === 'chord' ? (e.chord as Chord).heads[0].y : (e.box.y0 + e.box.y1) / 2);
    if (e.kind === 'rest') {
      const r = e.rest as RestMark;
      const conf = round2(Math.max(0.05, Math.min(1, (r.score - 0.35) / 0.4)));
      events.push({ id: '', bbox: toPageBox(input, r.box), confidence: conf, source: 'image', kind: 'rest', x: round2(centre.x), notes: [], duration, voice: r.voice, measureIndex: e.measure });
      total += conf;
      n++;
      continue;
    }
    const c = e.chord as Chord;
    const notes: OmrNote[] = c.heads.map((hd, i) => {
      const acc = e.accidentals[i];
      const pitch = state.read(hd.pos, acc ? acc.type : null, e.tieStop[i], e.tieStart[i]);
      const conf = round2(Math.max(0.05, Math.min(1, (hd.score - 0.35) / 0.4)));
      const alternatives: Alternative<OmrPitch>[] = [];
      if (acc) {
        for (const alt of acc.alternatives.slice(0, 2)) alternatives.push({ value: pitchOf(hd.pos, accAlter(alt.type), clefType), confidence: round2(Math.max(0.02, Math.min(0.45, alt.score - 0.3))) });
        if (acc.score < 0.7) alternatives.push({ value: pitchOf(hd.pos, pitchOf(hd.pos, 0, clefType).alter, clefType), confidence: 0.2 });
      }
      const note: OmrNote = {
        id: '',
        bbox: toPageBox(input, { x0: hd.x - hd.w / 2, y0: hd.y - hd.h / 2, x1: hd.x + hd.w / 2, y1: hd.y + hd.h / 2 }),
        confidence: conf,
        source: 'image',
        staffPosition: hd.pos,
        head: hd.kind,
        pitch,
      };
      if (alternatives.length) note.alternatives = alternatives;
      if (acc) {
        note.accidental = {
          id: '', bbox: toPageBox(input, acc.box), confidence: round2(Math.max(0.05, Math.min(1, (acc.score - 0.4) / 0.35))), source: 'image', type: acc.type,
          alternatives: acc.alternatives.length ? acc.alternatives.slice(0, 2).map((q) => ({ value: q.type, confidence: round2(Math.max(0.02, Math.min(0.45, q.score - 0.3))) })) : undefined,
        };
      }
      if (e.tieStart[i]) note.tieStart = true;
      if (e.tieStop[i]) note.tieStop = true;
      return note;
    });
    const conf = round2(Math.min(...notes.map((q) => q.confidence)));
    const ev: OmrNotationEvent & { measureIndex?: number } = {
      id: '', bbox: toPageBox(input, c.box), confidence: conf, source: 'image', kind: 'chord', x: round2(centre.x), notes, duration, voice: c.voice, measureIndex: e.measure,
    };
    if (c.dir) ev.stem = c.dir;
    if (c.beamLeft || c.beamRight) ev.beams = c.beams;
    else if (c.flags) ev.flags = c.flags;
    events.push(ev);
    total += conf;
    n++;
  }
  const reading: StaffReading<OmrNotationEvent> = {
    events,
    confidence: round2(n ? total / n : header.clef ? 0.5 : 0),
    warnings: a.warnings.length ? a.warnings : undefined,
  };
  if (header.clef) {
    reading.clef = {
      id: '', bbox: toPageBox(input, header.clef), confidence: round2(header.clef.confidence), source: 'image', type: header.clef.value,
      alternatives: header.clef.alternatives?.length ? header.clef.alternatives : undefined,
    };
  }
  if (header.key) {
    reading.keySignature = { id: '', bbox: toPageBox(input, header.key), confidence: round2(header.key.confidence), source: 'image', fifths: header.key.value, alternatives: header.key.alternatives?.length ? header.key.alternatives : undefined };
  } else if (header.clef) {
    // A clef with nothing after it is the key of C (or A minor): say so, at the clef's right edge.
    reading.keySignature = { id: '', bbox: toPageBox(input, { x0: header.clef.x1, y0: strip.top, x1: header.clef.x1, y1: strip.bottom }), confidence: round2(0.9 * header.clef.confidence), source: 'image', fifths: 0 };
  }
  if (header.time) {
    const v = header.time.value;
    reading.timeSignature = {
      id: '', bbox: toPageBox(input, header.time), confidence: round2(header.time.confidence), source: 'image', beats: v.beats, beatValue: v.beatValue, symbol: v.symbol,
      alternatives: header.time.alternatives?.length ? header.time.alternatives.map((q) => ({ value: { beats: q.value.beats, beatValue: q.value.beatValue }, confidence: round2(q.confidence) })) : undefined,
    };
  }
  if (a.texts.length) {
    reading.texts = a.texts.map((b): OmrText => {
      const p = toPageBox(input, b);
      const tall = b.y1 - b.y0 > 1.9 * strip.s;
      return { id: '', bbox: p, confidence: 0, source: 'image', kind: tall ? 'title' : 'chord-symbol', text: '', x: p.x };
    });
  }
  return reading;
}

function accAlter(t: AccidentalType): number {
  return t === 'sharp' ? 1 : t === 'flat' ? -1 : t === 'double-sharp' ? 2 : t === 'double-flat' ? -2 : 0;
}

/** Read one notation staff strip (stateless: key and time come from the strip or from `options.context`). */
export const recognizeNotationStaff: RecognizeNotationStaff = (input: StaffInput, options?: RecognizeOptions) => toReading(analyzeNotationStaff(input, options), options);

/**
 * A recognizer that remembers clef, key and time signature from staff to staff, the way a reader
 * does: later systems of a page rarely repeat the time signature. Make one per page.
 */
export function createNotationRecognizer(): RecognizeNotationStaff {
  const memory: NotationContext = {};
  return (input: StaffInput, options: RecognizeOptions = {}) => {
    const opts: RecognizeOptions = { ...options, context: { ...memory, ...options.context } };
    const analysis = analyzeNotationStaff(input, opts);
    const reading = toReading(analysis, opts);
    if (reading.clef && reading.clef.confidence >= 0.5) memory.clef = reading.clef.type;
    if (reading.keySignature && reading.keySignature.confidence >= 0.5) memory.fifths = reading.keySignature.fifths;
    if (reading.timeSignature && reading.timeSignature.confidence >= 0.5) {
      memory.beats = reading.timeSignature.beats;
      memory.beatValue = reading.timeSignature.beatValue;
    }
    return reading;
  };
}

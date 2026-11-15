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
  AccidentalType, Alternative, BBox, ClefType, DurationValue, OmrNotationEvent, OmrNote, OmrPitch, OmrText, OmrVisionModel, OmrWarning, RecognizeNotationStaff,
  RecognizeOptions, StaffInput, StaffReading,
} from '../types';
import { cropGray } from '../image/gray';
import { durationTicks } from '../types';
import { type Header, classifyBox, readHeader } from './header';
import { type Head, findHeads } from './heads';
import { type AccidentalMark, findTuplets, ownBox, readAccidentals, tieBetween } from './marks';
import { type Chord, type SBox, baseValue, buildChords, readDots, readTails } from './notes';
import { AccidentalState, keyAlterations, pitchOf } from './pitch';
import { type RestMark, readRests } from './rests';
import { type DurationOption, type RhythmEvent, inferMeasureTicks, measureTicks, metreOfTicks, optionTicks, solveMeasure, stepValue } from './rhythm';
import { type Stroke, findStrokes, stemFromHead } from './stems';
import { CLAIM, type Strip, type StripQuality, buildStrip, posY, stripQuality } from './strip';

export { buildStrip, type Strip, type StripQuality, stripQuality } from './strip';
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
  /** The duration was worked out from the measure length, not read (an unmarked triplet). */
  inferred?: boolean;
  /** The duration was confirmed by the vision model. */
  fromModel?: boolean;
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
  /** Measures (and voices) that still do not add up after the consistency check. */
  mismatches: { measure: number; voice: number; message: string }[];
  /** Per measure: does it hold two voices? */
  twoVoices: boolean[];
  /** Picture quality of the strip (blur, noise): scales every confidence of the reading. */
  quality: StripQuality;
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
  // A ledger line printed light (grey) or washed out by the capture can miss the binary
  // altogether: then it is a row of the grey picture darker than the paper just above and below.
  const gray = strip.input.gray.data;
  const faint = (xa: number, xb: number, y: number): boolean => {
    const yi = Math.round(y);
    const off = Math.round(0.3 * s);
    if (yi - off - 1 < 0 || yi + off + 1 >= h) return false;
    let line = 0;
    let paper = 0;
    let n = 0;
    const cols: number[] = [];
    for (let x = Math.round(xa); x < Math.round(xb); x++) {
      if (x < 0 || x >= w) continue;
      let darkest = 0;
      for (let dy = -1; dy <= 1; dy++) darkest = Math.max(darkest, 255 - gray[(yi + dy) * w + x]);
      line += darkest;
      cols.push(darkest);
      // Paper on both sides of the line: the brighter of the two rows does not hide a letter's stroke.
      paper += Math.max(255 - gray[(yi - off) * w + x], 255 - gray[(yi + off) * w + x]);
      n++;
    }
    if (!n) return false;
    // A line is evenly dark along its length (the strokes of letters are not), with paper around it.
    const mean = line / n;
    return mean - paper / n >= 25 && mean >= 2 * (paper / n) && cols.every((v) => v >= 0.6 * mean);
  };
  let found = 0;
  for (const p of need) {
    const y = posY(strip, p);
    const la = head.x - head.w / 2 - 0.3 * s;
    const lb = head.x - head.w / 2 - 0.05 * s;
    const ra = head.x + head.w / 2 + 0.05 * s;
    const rb = head.x + head.w / 2 + 0.3 * s;
    const left = cover(la, lb, y);
    const right = cover(ra, rb, y);
    const through = Math.abs(p - head.pos) <= 1 ? 1 : cover(head.x - head.w / 2, head.x + head.w / 2, y);
    if (Math.max(left, right) >= 0.6 && Math.min(left, right) >= 0.2 && through >= 0.6) found++;
    else if (faint(la, lb, y) && faint(ra, rb, y) && (Math.abs(p - head.pos) <= 1 || faint(head.x - head.w / 2, head.x + head.w / 2, y))) found++;
  }
  return found / need.length;
}

/** The component of the line-free ink a ring-shaped head is drawn in (0 = none found). */
function componentAt(strip: Strip, hd: Head): number {
  for (const [fx, fy] of [[-0.38, 0], [0.38, 0], [0, -0.4], [0, 0.4]]) {
    const xi = Math.round(hd.x + fx * hd.w);
    const yi = Math.round(hd.y + fy * hd.h);
    if (xi < 0 || xi >= strip.w || yi < 0 || yi >= strip.h) continue;
    const id = strip.cc.labels[yi * strip.w + xi];
    if (id) return id;
  }
  return 0;
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
  // A dot missed (faint, merged into the head) or invented (a speck, a staccato dot): how likely
  // depends on what the grey image shows where the dot would be.
  add(value, dots + 1, dots === 0 ? 0.5 + 2.6 * (1 - c.dotScore) : 2.2);
  if (dots > 0) add(value, dots - 1, 0.9 + 1.5 * c.dotScore);
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

/** Voice of an event (1 = upper / only voice). */
function voiceOf(e: StripEvent): number {
  return e.kind === 'chord' ? (e.chord as Chord).voice : (e.rest as RestMark).voice;
}

/** Do two notes on different stems (or a stemmed note and a whole note) stand at the same place? */
function simultaneous(chords: Chord[], s: number): boolean {
  for (let i = 0; i < chords.length; i++) {
    for (let j = i + 1; j < chords.length && chords[j].x - chords[i].x <= 0.6 * s; j++) {
      const a = chords[i];
      const b = chords[j];
      if (a.dir !== b.dir || (!a.stem && !b.stem)) return true;
    }
  }
  return false;
}

/**
 * Split the events of a measure into two voices when things in it sound together that one voice
 * cannot play: notes on opposite stems (or a whole note and a stemmed note) at the same place, or
 * a rest directly above / below a note. Stems up are the upper voice, stems down the lower;
 * rests go by where they are printed, or else to the voice that has room for them.
 * Returns true when the measure has two voices.
 */
function assignVoices(strip: Strip, list: StripEvent[], target: number): boolean {
  const { s } = strip;
  for (const e of list) {
    if (e.chord) e.chord.voice = 1;
    if (e.rest) e.rest.voice = 1;
  }
  let two = false;
  for (let i = 0; i < list.length && !two; i++) {
    for (let j = i + 1; j < list.length && list[j].x - list[i].x <= 0.6 * s; j++) {
      const a = list[i];
      const b = list[j];
      if (a.chord && b.chord) two = a.chord.dir !== b.chord.dir || (!a.chord.stem && !b.chord.stem);
      else if (a.chord || b.chord) two = true;
      if (two) break;
    }
  }
  if (!two) return false;
  const mid = (strip.top + strip.bottom) / 2;
  const chordsOf = list.filter((e) => e.chord);
  for (const e of chordsOf) {
    const c = e.chord as Chord;
    if (c.dir) c.voice = c.dir === 'up' ? 1 : 2;
  }
  // A whole note takes the voice its companion at the same place does not have.
  for (const e of chordsOf) {
    const c = e.chord as Chord;
    if (c.dir) continue;
    const mate = chordsOf.find((o) => o !== e && Math.abs(o.x - e.x) <= 0.6 * s && (o.chord as Chord).dir);
    if (mate) c.voice = (mate.chord as Chord).voice === 1 ? 2 : 1;
    else c.voice = c.heads[0].y > mid ? 2 : 1;
  }
  const sum = (v: number): number => list.filter((e) => voiceOf(e) === v && e.chord).reduce((q, e) => q + optionTicks(e.rhythm.options[0]), 0);
  const filled = [0, sum(1), sum(2)];
  for (const e of list) {
    const r = e.rest;
    if (!r) continue;
    const cy = (r.box.y0 + r.box.y1) / 2;
    const ticks = optionTicks(e.rhythm.options[0]);
    const mate = chordsOf.find((o) => Math.abs(o.x - e.x) <= 0.6 * s);
    if (mate) r.voice = (mate.chord as Chord).voice === 1 ? 2 : 1;
    else if (r.displaced) r.voice = cy < mid ? 1 : 2;
    else if (target) r.voice = target - filled[1] >= target - filled[2] ? 1 : 2;
    else r.voice = cy <= mid ? 1 : 2;
    filled[r.voice] += ticks;
  }
  return true;
}

/**
 * A measure that is too long may hide triplets whose "3" was not found: groups of three equal
 * notes (a beam group of three, or three equal notes in a row) read as triplets. Returns the
 * groups whose choice makes the measure add up, or null when none or more than one choice does.
 */
function tripletChoice(list: StripEvent[], target: number): StripEvent[][] | null {
  // Notes already read as tuplets (their number was found) stay as they are.
  const chordsIn = list.filter((e) => e.chord && !(e.chord as Chord).tuplet);
  const plain = (e: StripEvent): string | null => {
    const o = e.rhythm.options[0];
    return e.chord && !(e.chord as Chord).tuplet && o.dots === 0 ? o.value : null;
  };
  const groups: StripEvent[][] = [];
  const byBeam = new Map<number, StripEvent[]>();
  for (const e of chordsIn) {
    if (e.rhythm.group < 0) continue;
    const l = byBeam.get(e.rhythm.group);
    if (l) l.push(e); else byBeam.set(e.rhythm.group, [e]);
  }
  for (const g of byBeam.values()) if (g.length === 3 && plain(g[0]) && g.every((e) => plain(e) === plain(g[0]))) groups.push(g);
  // Unbeamed: exactly three equal notes in a row.
  for (let i = 0; i + 2 < list.length; i++) {
    const run = list.slice(i, i + 3);
    const v = plain(run[0]);
    if (!v || run.some((e) => e.rhythm.group >= 0 || plain(e) !== v)) continue;
    if ((i > 0 && plain(list[i - 1]) === v && list[i - 1].rhythm.group < 0) || (i + 3 < list.length && plain(list[i + 3]) === v && list[i + 3].rhythm.group < 0)) continue;
    groups.push(run);
  }
  if (!groups.length || groups.length > 6) return null;
  const base = list.reduce((q, e) => q + optionTicks(e.rhythm.options[0]), 0);
  const gain = groups.map((g) => g.reduce((q, e) => q + optionTicks(e.rhythm.options[0]), 0) / 3);
  let pick = -1;
  for (let mask = 1; mask < 1 << groups.length; mask++) {
    let t = base;
    for (let k = 0; k < groups.length; k++) if (mask & (1 << k)) t -= gain[k];
    if (Math.abs(t - target) > 2) continue;
    // Ambiguous when two different choices fit: leave it to the dots and flags.
    if (pick >= 0) return null;
    pick = mask;
  }
  if (pick < 0) return null;
  return groups.filter((_, k) => pick & (1 << k));
}

/** Read the groups chosen by {@link tripletChoice} as triplets. Returns true when it did. */
function inferTriplets(list: StripEvent[], target: number): boolean {
  const chosen = tripletChoice(list, target);
  if (!chosen) return false;
  for (const g of chosen) {
    for (const e of g) {
      const c = e.chord as Chord;
      c.tuplet = { actual: 3, normal: 2 };
      e.rhythm.options = chordOptions(c);
      e.inferred = true;
    }
  }
  return true;
}

/**
 * A "3" read where there is none (a dynamic letter, a fingering) shortens its notes: when the
 * measure is short and comes out exactly right without the tuplets read from marks, those marks
 * were wrong. Returns true when it dropped them.
 */
function dropFalseTuplets(list: StripEvent[], target: number): boolean {
  const marked = list.filter((e) => e.chord?.tuplet && !e.inferred);
  if (!marked.length) return false;
  const plain = (e: StripEvent): number => {
    const o = e.rhythm.options[0];
    return marked.includes(e) ? optionTicks({ ...o, tuplet: undefined }) : optionTicks(o);
  };
  if (Math.abs(list.reduce((q, e) => q + plain(e), 0) - target) > 2) return false;
  for (const e of marked) {
    const c = e.chord as Chord;
    c.tuplet = undefined;
    e.rhythm.options = chordOptions(c);
  }
  return true;
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
  let heads = findHeads(strip, musicX0, musicX1, { strokes });
  lap('heads');
  // Heads off the staff need their ledger lines; this is also what keeps letters of the text
  // above the staff ("o", "d") from being read as notes.
  heads = heads.filter((hd) => {
    const support = ledgerSupport(strip, hd);
    // (Beyond the guitar's range, from below drop-D's low D to above the 15th fret of the top
    // string, half of the ledger lines is too little to go on: that is where text sits.)
    if (support < (hd.pos >= 15 || hd.pos <= -9 ? 0.75 : 0.5)) return false;
    if (support < 1) hd.score *= 0.7;
    return true;
  });
  let built = buildChords(strip, heads, strokes);
  // Heads left without a stem: look for it in the grey image, where a faint stem survives.
  {
    const rescued: Stroke[] = [];
    for (const c of built) {
      if (c.stem) continue;
      for (const hd of c.heads) {
        if (hd.score < 0.7 || (hd.kind === 'whole' && hd.feat.zWhole > 0.7 && hd.feat.zWhole - hd.feat.zOpen >= 0.25)) continue;
        const st = stemFromHead(strip, hd.x, hd.y, hd.w);
        if (st && !strokes.some((q) => Math.abs(q.x - st.x) < 0.3 * s && q.top <= st.bottom && q.bottom >= st.top)) rescued.push(st);
      }
    }
    if (rescued.length) {
      for (const hd of heads) {
        hd.stem = undefined;
        hd.side = undefined;
      }
      strokes.push(...rescued);
      strokes.sort((p, q) => p.x - q.x);
      built = buildChords(strip, heads, strokes);
    }
  }
  // Notes with filled heads first: a ring-like shape inside one of them (the loop of a flag, the
  // gap between two beams) is neither a half note nor a whole note.
  const owned = (hd: Head): boolean => {
    // Sample the ring all the way round: in the gap between two beams its left and right ends are paper.
    for (const [fx, fy] of [[-0.38, 0], [0.38, 0], [0, -0.4], [0, 0.4], [-0.27, -0.3], [0.27, -0.3], [-0.27, 0.3], [0.27, 0.3]]) {
      const xi = Math.round(hd.x + fx * hd.w);
      const yi = Math.round(hd.y + fy * hd.h);
      if (xi < 0 || xi >= strip.w || yi < 0 || yi >= strip.h) continue;
      const id = strip.cc.labels[yi * strip.w + xi];
      // (A stem the layout stage took for a bar line carries its head with it: that is not "explained".)
      if (id && strip.owner[id] && strip.owner[id] !== CLAIM.barline) return true;
    }
    return false;
  };
  ownNotes(strip, built.filter((c) => c.stem && c.heads[0].kind === 'filled'));
  const stemmed = built.filter((c) => c.stem && (c.heads[0].kind === 'filled' || !c.heads.some(owned)));
  ownNotes(strip, stemmed);
  readTails(strip, stemmed);
  readDots(strip, stemmed);
  for (const c of stemmed) for (const d of c.dotBoxes) ownBox(strip, d, CLAIM.dot);
  lap('notes');

  // Accidentals may reach left as far as the previous chord or bar line.
  const limitFor = (all: Chord[]) => {
    const sorted = all.slice().sort((p, q) => p.x - q.x);
    return (c: Chord): number => {
      const i = sorted.indexOf(c);
      let lim = musicX0 - 0.2 * s;
      for (let k = i - 1; k >= 0; k--) {
        // Notes of another voice at the same place do not block.
        if (sorted[k].box.x1 < c.x - 0.6 * s) { lim = Math.max(lim, Math.max(...sorted[k].heads.map((hd) => hd.x + hd.w / 2)) + 0.05 * s); break; }
      }
      for (const b of input.barlines) if (b.x1 < c.x) lim = Math.max(lim, b.x1 + 1);
      return lim;
    };
  };
  const accidentals = readAccidentals(strip, stemmed, limitFor(stemmed));
  lap('accidentals');

  // Whole notes: stemless open heads that stand alone. A filled head without a stem is not a
  // note, and a ring inside something already explained (the eye of a sharp, a flag) is not one
  // either. What remains competes with the rests: a sixteenth rest has loops too.
  let wholes = built.filter((c) => !c.stem && c.heads[0].kind !== 'filled');
  for (const c of wholes) {
    c.heads = c.heads.filter((hd) => {
      if (hd.feat.zWhole < 0.58 || hd.feat.holeWhole >= 0.9 || owned(hd)) return false;
      // A tuplet "3" or a fingering number has loops too: when the whole component reads better
      // as a digit than the ring reads as a note, it is a digit.
      const id = componentAt(strip, hd);
      if (id) {
        const { cc } = strip;
        const ch = cc.y1[id] - cc.y0[id] + 1;
        const cw = cc.x1[id] - cc.x0[id] + 1;
        if (ch >= 0.7 * s && ch <= 2.6 * s && cw <= 2 * s) {
          const g = classifyBox(strip, cc.x0[id], cc.y0[id], cc.x1[id] + 1, cc.y1[id] + 1, ['timeSig2', 'timeSig3', 'timeSig4', 'timeSig5', 'timeSig6', 'timeSig7', 'timeSig8', 'timeSig9']);
          if (g.length && g[0].score > hd.feat.zWhole) return false;
        }
      }
      return true;
    });
  }
  wholes = wholes.filter((c) => c.heads.length > 0);
  const rests = readRests(strip, musicX0, musicX1);
  wholes = wholes.filter((c) => {
    const clash = rests.find((r) => c.x > r.box.x0 - 0.2 * s && c.x < r.box.x1 + 0.2 * s && c.heads.some((hd) => hd.y > r.box.y0 - 0.3 * s && hd.y < r.box.y1 + 0.3 * s));
    if (!clash) return true;
    const z = Math.max(...c.heads.map((hd) => hd.feat.zWhole));
    if (clash.score >= z - 0.05) return false;
    rests.splice(rests.indexOf(clash), 1);
    return true;
  });
  for (const c of wholes) {
    for (const hd of c.heads) {
      hd.kindScore = hd.kind === 'whole' ? hd.kindScore : Math.min(hd.kindScore, 0.5);
      hd.kind = 'whole';
      hd.score = hd.feat.zWhole;
    }
    c.score = Math.min(...c.heads.map((hd) => hd.score));
  }
  ownNotes(strip, wholes);
  readDots(strip, wholes);
  for (const c of wholes) for (const d of c.dotBoxes) ownBox(strip, d, CLAIM.dot);
  const chords = stemmed.concat(wholes).sort((p, q) => p.x - q.x);
  for (const [c, marks] of readAccidentals(strip, wholes, limitFor(chords))) accidentals.set(c, marks);
  // A "dot" seen only in the grey image that falls inside an accidental is part of that accidental.
  for (const c of chords) {
    if (!c.dotSoft || !c.dots) continue;
    const d = c.dotBoxes[0];
    for (const marks of accidentals.values()) {
      if (marks.some((m) => m && d.x1 > m.box.x0 - 2 && d.x0 < m.box.x1 + 2 && d.y1 > m.box.y0 && d.y0 < m.box.y1)) {
        c.dots = 0;
        c.dotBoxes = [];
        c.dotScore = 0;
        break;
      }
    }
  }
  // Two notes at the same place on different stems: two voices share the staff, and their rests
  // are moved up and down out of each other's way.
  if (simultaneous(chords, s)) {
    rests.push(...readRests(strip, musicX0, musicX1, { displaced: true }));
    rests.sort((p, q) => p.x - q.x);
  }
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
  // Tuplet numbers: a "3" over a bracket governs the notes under the bracket, a bare "3" the
  // beam group it sits on.
  const marks = findTuplets(strip, musicX0, musicX1, chords.map((c) => c.box));
  for (const mark of marks) {
    const mx = (mark.box.x0 + mark.box.x1) / 2;
    let members: StripEvent[] = [];
    if (mark.bracket) {
      members = chordEvents.filter((e) => e.x >= mark.x0 - 0.7 * s && e.x <= mark.x1 + 0.7 * s);
    } else {
      for (const list of groups.values()) {
        if (mx >= list[0].x - 0.6 * s && mx <= list[list.length - 1].x + 0.6 * s) members = list;
      }
    }
    // The number is printed next to its notes (beyond the heads, or beyond the stems and beam,
    // with or without a bracket), not across the staff from them.
    members = members.filter((e) => {
      const c = e.chord as Chord;
      const y0 = Math.min(c.box.y0, c.stem ? c.tipY : c.box.y0);
      const y1 = Math.max(c.box.y1, c.stem ? c.tipY : c.box.y1);
      return mark.box.y1 > y0 - 3 * s && mark.box.y0 < y1 + 3 * s;
    });
    if (members.length === 3) for (const e of members) (e.chord as Chord).tuplet = { actual: 3, normal: 2 };
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
      const from = Math.max(ha.x + ha.w / 2, ...ca.dotBoxes.map((d) => d.x1)) + 1;
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
        // Some engravers draw the open end of a tie along the nearest staff line, where most of it is hidden.
        const tie = tieBetween(strip, from, to, hd.y, 0.2, true);
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
        const tie = tieBetween(strip, from, to, hd.y, 0.2, true);
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
  const sums = perMeasure.map((list) => list.reduce((q, e) => q + optionTicks(e.rhythm.options[0]), 0));
  // (With two voices on the staff a measure holds twice its length: the sums say nothing then.)
  const mode = simultaneous(chords, s) ? 0 : inferMeasureTicks(sums.filter((_, i) => !(perMeasure[i].length === 1 && perMeasure[i][0].rhythm.measureRest)));
  let target = 0;
  if (header.time) {
    let ticks = measureTicks(header.time.value.beats, header.time.value.beatValue);
    const agree = (t: number): number => sums.filter((v) => v === t).length;
    // Measures that fit the printed metre once unmarked triplets are read as such (a piece in
    // triplets throughout makes every measure equally "too long").
    const agreeSig = (t: number): number => perMeasure.filter((list, i) => sums[i] === t || (sums[i] > t && tripletChoice(list, t) !== null)).length;
    if (mode && mode !== ticks && (header.time.confidence < 0.5 || agree(mode) >= 2 * Math.max(1, agreeSig(ticks)))) {
      // Most measures agree with each other but not with the time signature: the numbers were
      // misread more likely than every measure. Take the alternative reading that fits, or at
      // least do not bend the notes to a wrong metre.
      const alt = header.time.alternatives?.find((q) => measureTicks(q.value.beats, q.value.beatValue) === mode);
      if (alt) {
        const old = header.time.value;
        header.time.alternatives = [{ value: old, confidence: 0.3 }, ...(header.time.alternatives ?? []).filter((q) => q !== alt)];
        header.time.value = alt.value;
        header.time.confidence = Math.max(0.5, Math.min(header.time.confidence, 0.6));
        ticks = mode;
      } else {
        header.time.confidence = Math.min(header.time.confidence, 0.35);
        ticks = 0;
      }
    }
    if (ticks && (header.time.confidence >= 0.5 || ticks === mode)) target = ticks;
  }
  if (!target && ctx.beats && ctx.beatValue) target = measureTicks(ctx.beats, ctx.beatValue);
  if (!target) target = mode;
  const measureOk: (boolean | null)[] = perMeasure.map(() => null);
  const mismatches: StaffAnalysis['mismatches'] = [];
  const twoVoices = perMeasure.map((list) => assignVoices(strip, list, target));
  if (target) {
    perMeasure.forEach((all, mi) => {
      if (!all.length) return;
      const first = mi === 0;
      const lastM = mi === perMeasure.length - 1;
      const voices = twoVoices[mi] ? [1, 2] : [1];
      let ok: boolean | null = true;
      for (const v of voices) {
        const list = twoVoices[mi] ? all.filter((e) => voiceOf(e) === v) : all;
        if (!list.length) continue;
        const sum = list.reduce((q, e) => q + optionTicks(e.rhythm.options[0]), 0);
        // A pickup bar at the start and its complement at the end are shorter than the metre;
        // so is a voice that pauses without rests.
        const mayBeShort = (first || lastM || twoVoices[mi]) && sum < target;
        // A missed bar line leaves two (or more) whole measures in one: nothing to repair then.
        if (sum > target && sum % target === 0 && !twoVoices[mi]) {
          let run = 0;
          let cuts = 0;
          for (const e of list) {
            run += optionTicks(e.rhythm.options[0]);
            if (run % target === 0) cuts++;
          }
          if (cuts === sum / target) {
            for (const e of list) e.durationConfidence = 0.85;
            continue;
          }
        }
        if (sum > target) inferTriplets(list, target);
        else if (sum < target && !mayBeShort) dropFalseTuplets(list, target);
        const sol = solveMeasure(list.map((e) => e.rhythm), target, mayBeShort ? 1.25 : 3.2);
        if (sol.consistent) {
          for (const e of list) e.durationConfidence = e.rhythm.chosen === 0 && !e.rhythm.dropped ? (e.inferred ? 0.6 : 0.95) : 0.55;
        } else if (mayBeShort) {
          if (ok) ok = null;
          for (const e of list) e.durationConfidence = 0.8;
        } else {
          ok = false;
          for (const e of list) e.durationConfidence = 0.45;
          mismatches.push({ measure: mi, voice: v, message: `Measure ${mi + 1} of this staff does not add up${twoVoices[mi] ? ` in voice ${v}` : ''}: read ${(sum / 960).toFixed(2)} quarter notes, expected ${(target / 960).toFixed(2)}.` });
        }
      }
      measureOk[mi] = ok;
    });
  } else {
    for (const e of events) e.durationConfidence = 0.75;
  }
  lap('rhythm');

  // What is left above the staff is text for the caller to read (chord symbols, tempo, titles).
  const texts = textRegions(strip, musicX0);
  lap('text');
  const quality = stripQuality(strip);
  if (quality.score < 0.5) {
    warnings.push({ code: 'low-quality', message: 'This staff is blurred or noisy in the picture: check every note and rhythm, or retake the photo closer and in better light.' });
  }

  return {
    strip, header, strokes, heads, chords, rests,
    events: events.filter((e) => !e.rhythm.dropped),
    measureTicks: target, measureOk, texts, warnings, mismatches, twoVoices, quality, timings,
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
  // A poor picture makes every reading less certain: rhythm most (one wrong dot or flag, one
  // missed bar line), positions somewhat (a blurred head near the boundary of two positions).
  const q = a.quality.score;
  const noteFactor = 0.6 + 0.4 * q;
  const durFactor = 0.4 + 0.6 * q;
  // With neither clef nor key signature seen and nothing carried from a staff above, the start
  // of the staff was probably lost (cut off, in shadow): the key, and so every pitch, is a guess.
  const keyUnknown = !header.clef && !header.key && ctx.fifths === undefined;
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
    const duration = { value: opt.value, dots: opt.dots, tuplet: opt.tuplet, ticks: full, confidence: round2(e.durationConfidence * durFactor), alternatives: alts.length ? alts : undefined };
    const centre = input.toPage(e.x, e.kind === 'chord' ? (e.chord as Chord).heads[0].y : (e.box.y0 + e.box.y1) / 2);
    if (e.kind === 'rest') {
      const r = e.rest as RestMark;
      const conf = round2(Math.max(0.05, Math.min(1, (r.score - 0.35) / 0.4)) * noteFactor);
      events.push({ id: '', bbox: toPageBox(input, r.box), confidence: conf, source: e.fromModel ? 'merged' : 'image', kind: 'rest', x: round2(centre.x), notes: [], duration, voice: r.voice, measureIndex: e.measure });
      total += conf;
      n++;
      continue;
    }
    const c = e.chord as Chord;
    const notes: OmrNote[] = c.heads.map((hd, i) => {
      const acc = e.accidentals[i];
      const pitch = state.read(hd.pos, acc ? acc.type : null, e.tieStop[i], e.tieStart[i]);
      const conf = round2(Math.min(keyUnknown ? 0.45 : 1, Math.max(0.05, Math.min(1, (hd.score - 0.35) / 0.4)) * noteFactor));
      const alternatives: Alternative<OmrPitch>[] = [];
      if (acc) {
        for (const alt of acc.alternatives.slice(0, 2)) alternatives.push({ value: pitchOf(hd.pos, accAlter(alt.type), clefType), confidence: round2(Math.max(0.02, Math.min(0.45, alt.score - 0.3))) });
        if (acc.score < 0.7) alternatives.push({ value: pitchOf(hd.pos, pitchOf(hd.pos, 0, clefType).alter, clefType), confidence: 0.2 });
      }
      // On a poor picture a head can be one position off: offer the neighbours (in the key).
      if (q < 0.75) {
        for (const p of [hd.pos + 1, hd.pos - 1]) {
          const step = pitchOf(p, 0, clefType).step;
          alternatives.push({ value: pitchOf(p, keyAlterations(fifths)[step], clefType), confidence: round2(0.1 + 0.15 * (1 - q)) });
        }
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
      id: '', bbox: toPageBox(input, c.box), confidence: conf, source: e.fromModel ? 'merged' : e.inferred ? 'inferred' : 'image', kind: 'chord', x: round2(centre.x), notes, duration, voice: c.voice, measureIndex: e.measure,
    };
    if (c.dir) ev.stem = c.dir;
    if (c.beamLeft || c.beamRight) ev.beams = c.beams;
    else if (c.flags) ev.flags = c.flags;
    events.push(ev);
    total += conf;
    n++;
  }
  const warnings = [...a.warnings, ...a.mismatches.map((m): OmrWarning => ({ code: 'measure-mismatch', message: m.message }))];
  if (keyUnknown && events.some((e) => e.kind === 'chord')) {
    warnings.push({ code: 'other', message: 'The start of this staff (clef and key signature) could not be read: the pitches assume no sharps or flats in the key.' });
  }
  const reading: StaffReading<OmrNotationEvent> = {
    events,
    confidence: round2(n ? total / n : header.clef ? 0.5 : 0),
    warnings: warnings.length ? warnings : undefined,
  };
  if (header.clef) {
    reading.clef = {
      id: '', bbox: toPageBox(input, header.clef), confidence: round2(header.clef.confidence), source: 'image', type: header.clef.value,
      alternatives: header.clef.alternatives?.length ? header.clef.alternatives : undefined,
    };
  } else if (events.some((e) => e.kind === 'chord')) {
    // No clef seen (cut off, faint): say which one the pitches assume, as a guess to confirm.
    const x0 = strip.x0;
    reading.clef = {
      id: '', bbox: toPageBox(input, { x0, y0: strip.top - strip.s, x1: x0 + 2 * strip.s, y1: strip.bottom + strip.s }), confidence: ctx.clef ? 0.45 : 0.3, source: 'inferred', type: clefType,
      alternatives: clefType === 'bass' ? [{ value: 'treble-8vb', confidence: 0.2 }] : [{ value: 'bass', confidence: 0.1 }],
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

const VALUES: DurationValue[] = ['whole', 'half', 'quarter', 'eighth', '16th', '32nd'];

/** What the vision model is asked about one measure. */
export function measurePrompt(beats: number, beatValue: number, count: number): string {
  return [
    'The picture shows ONE measure of guitar sheet music in standard notation (five-line staff, treble clef).',
    `The time signature is ${beats}/${beatValue}. A reader found ${count} notes / chords / rests in it but their lengths do not add up.`,
    'List every note, chord (several heads on one stem count as one) and rest from left to right.',
    'Answer with JSON only, in this shape:',
    '{"events":[{"type":"note","value":"quarter","dots":0,"triplet":false}]}',
    'type is "note" or "rest"; value is one of "whole","half","quarter","eighth","16th","32nd"; dots is 0, 1 or 2.',
  ].join('\n');
}

/**
 * Second opinion for the measures that do not add up: the vision model is shown each such measure
 * and asked for its note values. Its answer is used only when it can be checked: it must list as
 * many events as were found, of the same kinds in the same order, and they must fill the measure
 * exactly. Otherwise the reading stays as it was (and stays flagged). Returns how many measures
 * were repaired.
 */
export async function refineWithModel(a: StaffAnalysis, ai: OmrVisionModel, signal?: AbortSignal): Promise<number> {
  const { strip } = a;
  const target = a.measureTicks;
  if (!target || !a.mismatches.length) return 0;
  const metre = a.header.time?.value ?? metreOfTicks(target);
  if (!metre) return 0;
  let repaired = 0;
  for (const mi of [...new Set(a.mismatches.map((m) => m.measure))]) {
    if (signal?.aborted) break;
    if (a.twoVoices[mi]) continue;
    const m = strip.input.measures[mi];
    const list = a.events.filter((e) => e.measure === mi);
    if (!m || !list.length) continue;
    const x0 = Math.max(0, Math.round(m.x0 - 0.5 * strip.s));
    const x1 = Math.min(strip.w, Math.round(m.x1 + 0.5 * strip.s));
    const crop = cropGray(strip.input.gray, x0, 0, x1 - x0, strip.h);
    let answer: unknown = null;
    try {
      answer = await ai.ask({ gray: crop }, measurePrompt(metre.beats, metre.beatValue, list.length), signal);
    } catch {
      answer = null;
    }
    const raw = (answer as { events?: unknown } | null)?.events;
    if (!Array.isArray(raw) || raw.length !== list.length) continue;
    const parsed: DurationOption[] = [];
    let ok = true;
    raw.forEach((r, i) => {
      const q = r as { type?: unknown; value?: unknown; dots?: unknown; triplet?: unknown };
      const value = VALUES.find((v) => v === q.value);
      const dots = q.dots === 1 || q.dots === 2 ? q.dots : 0;
      if (!value || (q.type === 'rest') !== (list[i].kind === 'rest')) ok = false;
      else parsed.push({ value, dots, tuplet: q.triplet === true ? { actual: 3, normal: 2 } : undefined, cost: 0 });
    });
    if (!ok || parsed.reduce((t, o) => t + optionTicks(o), 0) !== target) continue;
    list.forEach((e, i) => {
      const o = parsed[i];
      let k = e.rhythm.options.findIndex((q) => q.value === o.value && q.dots === o.dots && !!q.tuplet === !!o.tuplet);
      if (k < 0) k = e.rhythm.options.push(o) - 1;
      if (k !== e.rhythm.chosen) e.fromModel = true;
      e.rhythm.chosen = k;
      e.durationConfidence = 0.6;
      if (e.chord) e.chord.tuplet = o.tuplet;
    });
    a.measureOk[mi] = true;
    a.mismatches = a.mismatches.filter((q) => q.measure !== mi);
    repaired++;
  }
  return repaired;
}

/** What a reading leaves for the staves after it: clef, key and time in force at its end. */
export function contextAfter(reading: StaffReading<OmrNotationEvent>, before: NotationContext): NotationContext {
  const out: NotationContext = { ...before };
  if (reading.clef && reading.clef.confidence >= 0.5) out.clef = reading.clef.type;
  if (reading.keySignature && reading.keySignature.confidence >= 0.5) out.fifths = reading.keySignature.fifths;
  if (reading.timeSignature && reading.timeSignature.confidence >= 0.5) {
    out.beats = reading.timeSignature.beats;
    out.beatValue = reading.timeSignature.beatValue;
  }
  return out;
}

/**
 * Per page picture: what each staff read left in force, by staff index. Later systems rarely
 * repeat the time signature, so a staff takes clef, key and time from the nearest staff ABOVE it
 * on the same page (never from one below, so reading order and re-runs do not matter).
 */
const pageMemory = new WeakMap<object, Map<number, NotationContext>>();

function inheritedContext(input: StaffInput): NotationContext {
  const mem = input.page ? pageMemory.get(input.page.gray) : undefined;
  if (!mem) return {};
  let best = -1;
  for (const k of mem.keys()) if (k < input.index && k > best) best = k;
  return best >= 0 ? { ...(mem.get(best) as NotationContext) } : {};
}

function remember(input: StaffInput, ctx: NotationContext): void {
  if (!input.page) return;
  let mem = pageMemory.get(input.page.gray);
  if (!mem) {
    mem = new Map();
    pageMemory.set(input.page.gray, mem);
  }
  mem.set(input.index, ctx);
}

/**
 * Read one notation staff strip. Key and time come from the strip, else from `options.context`,
 * else from the staves above it on the same page picture (read earlier with this function). With
 * `options.ai`, measures that do not add up are shown to the vision model for a second opinion
 * (see {@link refineWithModel}); the result is then a promise.
 */
export const recognizeNotationStaff: RecognizeNotationStaff = (input: StaffInput, options: RecognizeOptions = {}) => {
  const inherited = inheritedContext(input);
  const opts: RecognizeOptions = { ...options, context: { ...inherited, ...options.context } };
  const analysis = analyzeNotationStaff(input, opts);
  const finish = (): StaffReading<OmrNotationEvent> => {
    const reading = toReading(analysis, opts);
    remember(input, contextAfter(reading, opts.context ?? {}));
    return reading;
  };
  if (opts.ai && analysis.mismatches.length) return refineWithModel(analysis, opts.ai, opts.signal).then(finish);
  return finish();
};

/**
 * A recognizer that remembers clef, key and time signature from staff to staff, the way a reader
 * does: later systems of a page rarely repeat the time signature. Make one per page.
 */
export function createNotationRecognizer(): RecognizeNotationStaff {
  let memory: NotationContext = {};
  return async (input: StaffInput, options: RecognizeOptions = {}) => {
    const opts: RecognizeOptions = { ...options, context: { ...memory, ...options.context } };
    const analysis = analyzeNotationStaff(input, opts);
    if (opts.ai && analysis.mismatches.length) await refineWithModel(analysis, opts.ai, opts.signal);
    const reading = toReading(analysis, opts);
    memory = contextAfter(reading, memory);
    return reading;
  };
}

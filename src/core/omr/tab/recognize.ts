/**
 * The printed-tablature reader: one cleaned staff strip in, fret numbers per string out.
 *
 *   header (TAB letters, time signature) ─▶ ink on string lines ─▶ digit height, line style,
 *   blur ─▶ classify / cut / join into numbers (twice: the second time knowing the staff's
 *   face) ─▶ reliability of the staff ─▶ marks between numbers ─▶ columns (chords) ─▶ sanity
 *   checks ─▶ rhythm from stems and rests ─▶ events with page boxes, confidences, alternatives
 *
 * Everything is measured in strip px (24 per staff space by default) and scaled by the digit
 * height found on the staff itself, so other strip resolutions and staff sizes work unchanged.
 */
import { type Components, labelComponents } from '../image/cc';
import { cropBinary } from '../image/gray';
import {
  type Alternative, type DurationValue, type OmrClef, type OmrTabEvent, type OmrTabNote, type OmrText, type OmrTimeSignature, type OmrWarning,
  type RecognizeOptions, type StaffInput, type StaffReading, STANDARD_TUNING, durationTicks, midiAtFret,
} from '../types';
import { type Box, type GlyphPatch, type LineProfile, classifyPatch, extractPatch, lineInBox, refineBox } from './glyph';
import { type TabMark, applyMarks, findArcs, findBends, findSlides } from './marks';
import { type Glyph, type ReaderContext, type TabNumber, assembleLine, facePenalties, isDigitLabel, lineThroughEvidence, profileFor, readCluster, struckKey, struckReference } from './numbers';
import { type LineBlob, type StripGeometry, barlineSolidity, columnProfile, digitMetrics, findLineBlobs, findWeldedBlobs, groupAdjacent, groupColumns, nearBarline, profileValleys, tightBox } from './segment';
import { type RestReading, findRests, readTimeSignature } from './header';
import { type MeasureEvent, type ReadDuration, type Stem, assignDurations, findStems } from './rhythm';
import { BLUR_LEVELS, TEMPLATE_FACE_LIST, struckTemplates, templatesAtBlur } from './templates';

/** One column of numbers before it becomes an event. */
export interface TabColumn {
  /** Centre in strip px. */
  x: number;
  numbers: TabNumber[];
  flags: string[];
}

/** Internals of a reading, for the evaluation tools and the unit tests. */
export interface TabDebug {
  /** Digit height of the staff in strip px. */
  digitHeight: number;
  /** Index into BLUR_LEVELS of the template set used. */
  blurLevel: number;
  /** The staff lines strike through the numbers, and the evidence (see `lineThroughEvidence`). */
  lineThrough: boolean;
  strike: number;
  /** How well each face explains the clearly read digits (mean correlation; empty when too few). */
  faceRatings: number[];
  /** Mean correlation of the digits read, and the 0..1 reliability derived from it. */
  meanScore: number;
  reliability: number;
  blobs: LineBlob[];
  glyphs: Glyph[];
  numbers: TabNumber[];
  columns: TabColumn[];
  marks: TabMark[];
  /** Right end of the TAB letters in strip px (0 when there are none). */
  clefEnd: number;
  /** Strip x of each event of the reading, in the same order. */
  stripX: number[];
  /** Stems found, and the measure length (ticks) the rhythm was fitted to (null = none). */
  stems: Stem[];
  measureTicks: number | null;
  /** Tuning the notes' pitches were worked out with (low to high). */
  tuning: readonly number[];
  /** Time spent, ms: total and per stage. */
  ms: number;
  timings: Record<string, number>;
}

/** A reading plus its internals. */
export interface TabReadingDetail {
  reading: StaffReading<OmrTabEvent>;
  debug: TabDebug;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * What earlier staves of a page have established for the later ones: a time signature is
 * printed once, at the top, and holds for the systems below. The staves of a page share the page
 * image object, which keys this memory; it goes away with the image.
 */
interface PageMemory {
  time?: { beats: number; beatValue: number };
  /** Measure length in ticks that at least two measures of an earlier staff showed outright. */
  ticks?: number;
}
const pageMemory = new WeakMap<object, PageMemory>();

/** Find the stacked T-A-B letters at the start of the staff; returns their box in strip px. */
function findClef(cc: Components, dy: number, input: StaffInput): Box | null {
  const sp = input.space;
  const n = input.lineCount;
  const top = input.lineYs[0];
  const bottom = input.lineYs[n - 1];
  const letters: Box[] = [];
  for (let c = 1; c <= cc.count; c++) {
    const w = cc.x1[c] - cc.x0[c] + 1;
    const h = cc.y1[c] - cc.y0[c] + 1;
    const cx = (cc.x0[c] + cc.x1[c] + 1) / 2;
    const cy = (cc.y0[c] + cc.y1[c] + 1) / 2 + dy;
    if (cx - input.x0 > 4.2 * sp || cx < input.x0) continue;
    if (h < 1.05 * sp || h > 2.6 * sp || w < 0.5 * sp || w > 2.6 * sp) continue;
    if (cy < top - 0.3 * sp || cy > bottom + 0.3 * sp) continue;
    if (nearBarline(input, cc.x0[c], cc.x1[c] + 1, 0) && w < 0.6 * sp) continue;
    letters.push({ x0: cc.x0[c], y0: cc.y0[c] + dy, x1: cc.x1[c] + 1, y1: cc.y1[c] + 1 + dy });
  }
  // The letters stand in one column (a time signature right of them is another column): take
  // the leftmost letter and everything stacked with it.
  letters.sort((a, b) => a.x0 - b.x0);
  for (const first of letters) {
    const mid = (first.x0 + first.x1) / 2;
    const column = letters.filter((l) => l.x0 < mid && l.x1 > mid);
    const box: Box = { x0: Math.min(...column.map((l) => l.x0)), y0: Math.min(...column.map((l) => l.y0)), x1: Math.max(...column.map((l) => l.x1)), y1: Math.max(...column.map((l) => l.y1)) };
    // Two or three letters stacked over most of the staff height.
    if (column.length >= 2 && box.y1 - box.y0 >= 0.55 * (bottom - top) && box.x1 - box.x0 <= 3 * sp) return box;
  }
  return null;
}

/**
 * Height of the digits' ink proper: the median height of digit-sized blobs once their boxes are
 * brought to the half-maximum outline. Relative glyph heights are measured against this.
 */
function inkHeightOf(ctx: Omit<ReaderContext, 'templates' | 'blurLevel'>, blobs: LineBlob[]): number {
  const hd = ctx.digitHeight;
  const hs: number[] = [];
  for (const b of blobs) {
    const h = b.box.y1 - b.box.y0;
    const w = b.box.x1 - b.box.x0;
    if (Math.abs(b.offset) > 0.2 || h < 0.8 * hd || h > 1.2 * hd || w > 0.95 * hd || w < 0.2 * hd) continue;
    const r = refineBox(ctx.gray, b.box, null);
    hs.push(r.y1 - r.y0);
    if (hs.length >= 40) break;
  }
  if (hs.length < 2) return hd;
  hs.sort((a, b) => a - b);
  return hs[hs.length >> 1];
}

/**
 * Pick the template blur that suits this strip: the level at which sample digits correlate best.
 * On a staff whose lines strike through the numbers the samples are compared the way they will be
 * read (line subtracted, against struck templates): left in, the line looks like extra blur and
 * pushes the choice one or two levels too soft, which costs the 0 / 6 / 8 / 9 distinctions.
 */
function chooseBlur(ctx: Omit<ReaderContext, 'templates' | 'blurLevel'>, blobs: LineBlob[], strike: number): number {
  const hd = ctx.digitHeight;
  const digitHigh = (b: LineBlob): boolean => Math.abs(b.offset) < 0.2 && b.box.y1 - b.box.y0 > 0.8 * hd && b.box.y1 - b.box.y0 < 1.2 * hd;
  const sample = blobs.filter((b) => digitHigh(b) && b.box.x1 - b.box.x0 < 0.85 * hd && b.box.x1 - b.box.x0 > 0.2 * hd);
  if (sample.length < 6) {
    // A staff of two-digit frets (a riff at the 12th fret) has few lone digits: cut its numbers
    // at the lightest column near the middle and sample the halves as well.
    for (const b of blobs) {
      const w = b.box.x1 - b.box.x0;
      if (!digitHigh(b) || w < 0.85 * hd || w > 2.1 * hd) continue;
      const fusedLine = ctx.lineThrough && b.fused ? { lineY: ctx.lineYs[b.line], band: ctx.lineThickness / 2 + 2 } : null;
      const cut = profileValleys(columnProfile(ctx.gray, b.box, fusedLine), 0.3 * w, 1)[0];
      if (cut === undefined) continue;
      const x = Math.floor(b.box.x0) + cut;
      for (const half of [tightBox(ctx.noLines, { ...b.box, x1: x }), tightBox(ctx.noLines, { ...b.box, x0: x })]) {
        if (half && half.x1 - half.x0 > 0.2 * hd && half.y1 - half.y0 > 0.8 * hd) sample.push({ ...b, box: half });
      }
      if (sample.length >= 24) break;
    }
  }
  if (sample.length < 2) return 1;
  // A dozen digits spread over the staff are enough; each is cut and resampled once.
  const step = Math.max(1, Math.floor(sample.length / 12));
  const patches: { patch: GlyphPatch; relH: number; struck: { centre: number; thickness: number } | null }[] = [];
  for (let i = 0; i < sample.length; i += step) {
    const b = sample[i];
    let profile: LineProfile | null = null;
    if (ctx.lineThrough && b.fused) {
      profile = profileFor(ctx, b.line, (b.box.x0 + b.box.x1) / 2);
      if (lineInBox(profile, b.box).thickness <= 0) profile = null;
    }
    const box = refineBox(ctx.gray, b.box, profile);
    const at = profile ? lineInBox(profile, box) : null;
    const struck = at && at.thickness > 0 ? struckKey(ctx, at, true) : null;
    // Samples the line crosses at an odd place would each need their own template sets at every
    // level tried; the typical ones are enough to judge the blur.
    if (struck && ctx.struckRef && struck !== ctx.struckRef) continue;
    patches.push({ patch: extractPatch(ctx.gray, box, profile), relH: (box.y1 - box.y0) / ctx.inkHeight, struck });
  }
  if (!patches.length) return 1;
  const cache = new Map<number, number>();
  const rate = (level: number): number => {
    let v = cache.get(level);
    if (v === undefined) {
      const plain = templatesAtBlur(level);
      let sum = 0;
      for (const q of patches) {
        const templates = q.struck ? struckTemplates(level, q.struck.centre, q.struck.thickness) : plain;
        sum += classifyPatch(q.patch, templates, { allow: (t) => !t.music && t.cls < 10, relH: q.relH, relHTolerance: 0.3, coarse: true })[0]?.score ?? 0;
      }
      v = sum / patches.length;
      cache.set(level, v);
    }
    return v;
  };
  // Walk uphill from a middle level: the mean score has a single peak along the blur ladder.
  let best = 2;
  for (;;) {
    const here = rate(best);
    const down = best > 0 ? rate(best - 1) : -Infinity;
    const up = best < BLUR_LEVELS.length - 1 ? rate(best + 1) : -Infinity;
    if (down >= here && down >= up) best--;
    else if (up > here + 0.003) best++;
    else break;
  }
  // With the line taken out, the mean score keeps rising a little with template blur on a soft
  // picture while the digits' distinctions (all in the rows off the line) wash out: a staff that
  // is really struck through then reads better at level 2 than at the level the score prefers
  // (held-out faces at photo quality: 70-78 % right at the preferred level, 82-96 % at level 2).
  // Only where level 2 explains the digits nearly as well, though: a picture that is truly much
  // softer (score gap 0.09 and more on the corpus' worst photos) needs the softer templates. Nor
  // where the "strike" is only blur closing the gap blanked around the numbers (the line no
  // darker inside the glyph than outside it).
  if (best > STRUCK_MAX_BLUR && strike >= STRUCK_RATIO && patches.some((q) => q.struck) && rate(STRUCK_MAX_BLUR) >= 0.74 && rate(best) - rate(STRUCK_MAX_BLUR) <= 0.08) best = STRUCK_MAX_BLUR;
  return best;
}

/** Softest template level used on a staff whose lines strike through the numbers. */
const STRUCK_MAX_BLUR = 2;
/** Line darkness inside the numbers, relative to the bare line, from which a staff counts as really struck through. */
const STRUCK_RATIO = 1.05;

/**
 * A chord whose fretted notes lie more than five frets apart cannot be fingered. If one note has
 * an almost equally good second reading that fits, take it; otherwise keep the reading and mark
 * the odd note as doubtful.
 */
function checkStretch(col: TabColumn): void {
  const fretted = (): TabNumber[] => col.numbers.filter((n) => !n.dead && n.fret > 0);
  const span = (list: TabNumber[]): number => (list.length ? Math.max(...list.map((n) => n.fret)) - Math.min(...list.map((n) => n.fret)) : 0);
  if (span(fretted()) <= 5) return;
  col.flags.push('wide-stretch');
  for (const n of fretted().sort((a, b) => a.confidence - b.confidence)) {
    for (const alt of n.alternatives) {
      if (alt.confidence < 0.6 * n.confidence) continue;
      const others = fretted().filter((o) => o !== n);
      const trial = alt.value > 0 ? [...others.map((o) => o.fret), alt.value] : others.map((o) => o.fret);
      if (trial.length && Math.max(...trial) - Math.min(...trial) <= 5) {
        const old = { value: n.fret, confidence: n.confidence * 0.9 };
        n.alternatives = [old, ...n.alternatives.filter((a) => a !== alt)];
        n.fret = alt.value;
        n.confidence = Math.min(0.49, alt.confidence);
        n.flags.push('chosen-by-stretch');
        return;
      }
    }
  }
  // Nothing fits: the note farthest from the others is the doubtful one.
  const list = fretted();
  const med = list.map((n) => n.fret).sort((a, b) => a - b)[list.length >> 1];
  const odd = list.slice().sort((a, b) => Math.abs(b.fret - med) - Math.abs(a.fret - med))[0];
  odd.confidence *= 0.7;
  odd.flags.push('wide-stretch');
}

/**
 * Read the rhythm of the columns from the stems of the staff. Measures are the stretches between
 * the bar lines that passed the solidity check, so a column of numbers mistaken for a bar line
 * does not upset the arithmetic.
 */
function readRhythm(input: StaffInput, columns: TabColumn[], rests: RestReading[], bars: { x: number }[], knownTicks: number | null): { durations: ReadDuration[]; restDurations: ReadDuration[]; stems: Stem[]; measureTicks: number | null; assumed: boolean; support: number } {
  const sp = input.space;
  const none = { durations: columns.map(() => null), restDurations: rests.map(() => null), stems: [], measureTicks: knownTicks, assumed: false, support: 0 };
  if (!columns.length) return none;
  let chosen: { stems: Stem[]; match: (Stem | null)[]; hits: number } | null = null;
  for (const side of [1, -1] as const) {
    const stems = findStems(input.binary, input, side);
    if (!stems.length) continue;
    const used = new Set<Stem>();
    const match = columns.map((col) => {
      let best: Stem | null = null;
      for (const st of stems) if (!used.has(st) && Math.abs(st.x - col.x) <= 0.5 * sp && (!best || Math.abs(st.x - col.x) < Math.abs(best.x - col.x))) best = st;
      if (best) used.add(best);
      return best;
    });
    const hits = match.filter(Boolean).length;
    if (!chosen || hits > chosen.hits) chosen = { stems, match, hits };
  }
  // A staff carries rhythm when a fair share of its columns have a stem.
  if (!chosen || chosen.hits < 2 || chosen.hits < 0.25 * columns.length) return none;
  const picked = chosen;
  const events: (MeasureEvent & { col: number; rest: DurationValue | undefined; index: number })[] = [
    ...columns.map((col, i) => ({ x: col.x, stem: !!picked.match[i], beams: picked.match[i]?.beams ?? 0, col: i, rest: undefined, index: i })),
    ...rests.map((r, i) => ({ x: r.x, stem: false, beams: 0, col: -1, rest: r.value, index: i })),
  ].sort((a, b) => a.x - b.x);
  const cuts = [...bars.map((b) => b.x).filter((x) => x > input.x0 + 0.5 * sp && x < input.x1 - 0.5 * sp), input.x1].sort((a, b) => a - b);
  const measures: { events: number[]; xEnd: number }[] = cuts.map((x) => ({ events: [], xEnd: x }));
  events.forEach((e, i) => {
    const m = measures.find((q) => e.x < q.xEnd) ?? measures[measures.length - 1];
    m.events.push(i);
  });
  const res = assignDurations(events, measures, knownTicks);
  const durations: ReadDuration[] = columns.map(() => null);
  const restDurations: ReadDuration[] = rests.map(() => null);
  events.forEach((e, i) => {
    if (e.col >= 0) durations[e.col] = res.durations[i];
    else restDurations[e.index] = res.durations[i];
  });
  return { durations, restDurations, stems: chosen.stems, measureTicks: res.measureTicks, assumed: res.assumed, support: res.support };
}

/** Default tunings by number of tab lines, sounding MIDI low to high. */
const DEFAULT_TUNINGS: Record<number, { tuning: readonly number[]; name: string }> = {
  4: { tuning: [28, 33, 38, 43], name: 'bass tab in standard tuning (E A D G)' },
  5: { tuning: [23, 28, 33, 38, 43], name: 'five-string bass tab (B E A D G)' },
  6: { tuning: STANDARD_TUNING, name: 'guitar tab in standard tuning' },
  7: { tuning: [35, 40, 45, 50, 55, 59, 64], name: 'seven-string guitar tab (B E A D G B E)' },
};

/**
 * The tuning a staff is read with: the one given when it has a string per line, else the usual
 * one for that many lines (said in a warning unless it is a six-line guitar staff), so that a
 * four-line bass staff does not get guitar pitches.
 */
export function tuningFor(lines: number, given: readonly number[] | undefined, warnings: OmrWarning[]): readonly number[] {
  if (given && given.length === lines) return given;
  const fallback = DEFAULT_TUNINGS[lines];
  if (given) {
    warnings.push({ code: 'other', message: `The tuning given has ${given.length} strings but this staff has ${lines} lines; ${fallback ? `it was read as ${fallback.name}` : 'the top strings of the given tuning were used'}.` });
    return fallback ? fallback.tuning : given;
  }
  if (fallback && lines !== 6) warnings.push({ code: 'other', message: `This staff has ${lines} lines and was read as ${fallback.name}; set the tuning if it is for another instrument.` });
  return fallback ? fallback.tuning : STANDARD_TUNING;
}

/** Read one tab staff and return the reading with its internals. */
export function readTabStaff(input: StaffInput, options: RecognizeOptions = {}, force: { blurLevel?: number } = {}): TabReadingDetail {
  const t0 = now();
  const timings: Record<string, number> = {};
  const sp = input.space;
  const n = input.lineCount;
  const warnings: OmrWarning[] = [];
  const tuning = tuningFor(n, options.tuning, warnings);

  // Components of the staff band, with and without the lines.
  const bandY = Math.max(0, Math.floor(input.lineYs[0] - 1.7 * sp));
  const bandH = Math.min(input.gray.height, Math.ceil(input.lineYs[n - 1] + 1.1 * sp)) - bandY;
  const ccFree = labelComponents(cropBinary(input.noLines, 0, bandY, input.noLines.width, bandH));
  const ccFull = labelComponents(cropBinary(input.binary, 0, bandY, input.binary.width, bandH));
  timings.components = now() - t0;
  const clefBox = findClef(ccFree, bandY, input);
  const clefEnd = clefBox ? clefBox.x1 : 0;

  // Bar lines the layout stage found, minus those that are really a column of stacked numbers.
  const bars = input.barlines.filter((bar) => {
    const solid = barlineSolidity(input.binary, input, bar) >= 0.93;
    if (!solid) warnings.push({ code: 'other', message: 'A bar line found on this staff looks like a column of fret numbers; check the measures around it.' });
    return solid;
  });
  const barred: StripGeometry = { ...input, barlines: bars };
  // The header: clef letters and, on some tab staves, a time signature in big numerals.
  const timeSig = readTimeSignature(input.noLines, ccFree, bandY, barred, clefEnd, templatesAtBlur(1));
  const headerEnd = Math.max(clefEnd, timeSig ? timeSig.box.x1 : 0);

  let blobs = findLineBlobs(ccFree, input, ccFull, bandY);
  blobs = blobs.filter((b) => {
    if (b.box.x0 < headerEnd + 0.15 * sp) return false;
    // Nothing is printed on the very ends of the staff but the lines that close it.
    if (b.box.x1 < input.x0 + 0.3 * sp || b.box.x0 > input.x1 - 0.3 * sp) return false;
    for (const bar of bars) {
      // The remains of a bar line: no wider than the bar itself.
      if (b.box.x1 > bar.x0 - 1 && b.box.x0 < bar.x1 + 1 && b.box.x1 - b.box.x0 <= 2.2 * (bar.x1 - bar.x0) + 2) return false;
      // The dots of a repeat sign (they can land on a line in a six-line staff).
      const dotty = b.box.y1 - b.box.y0 <= 0.6 * sp && b.box.x1 - b.box.x0 <= 0.6 * sp;
      if (dotty && bar.type.startsWith('repeat') && b.box.x1 > bar.x0 - 1.1 * sp && b.box.x0 < bar.x1 + 1.1 * sp) return false;
    }
    return true;
  });
  const metrics = digitMetrics(blobs, barred);
  const digitHeight = metrics.height;
  // Numbers welded to their neighbours in a chord, or to an arc or stem, come as one oversized component: cut them out again.
  let rests = findRests(input.noLines, ccFree, bandY, barred, headerEnd + 0.2 * sp, templatesAtBlur(1));
  // A shape that is clearly a rest is not searched for numbers; a doubtful one is, and loses if numbers are found in it.
  const inRest = (xa: number, xb: number): boolean => rests.some((r) => r.confidence >= 0.6 && xb > r.box.x0 && xa < r.box.x1);
  const welded = findWeldedBlobs(ccFree, bandY, input, input.gray, digitHeight, metrics.centreOffset, (xa, xb) => xa < headerEnd + 0.15 * sp || xa < input.x0 + 0.4 * sp || xb > input.x1 - 0.4 * sp || nearBarline(barred, xa, xb, 0) || inRest(xa, xb));
  if (welded.length) blobs = blobs.concat(welded);
  const base: Omit<ReaderContext, 'templates' | 'blurLevel'> = {
    gray: input.gray,
    noLines: input.noLines,
    lineYs: input.lineYs,
    space: sp,
    lineThickness: input.lineThickness,
    digitHeight,
    inkHeight: digitHeight,
    centreOffset: metrics.centreOffset,
    profiles: new Map(),
    lineThrough: false,
  };
  const strike = lineThroughEvidence(input.gray, blobs, input.lineYs, digitHeight);
  base.lineThrough = strike.through;
  base.struckRef = strike.through ? struckReference(base, blobs) : null;
  base.struckKeys = [];
  base.inkHeight = inkHeightOf(base, blobs);
  let t1 = now();
  const blurLevel = force.blurLevel ?? chooseBlur(base, blobs, strike.median);
  timings.blur = now() - t1;
  t1 = now();
  const ctx: ReaderContext = { ...base, templates: templatesAtBlur(blurLevel), blurLevel };

  // Glyphs: clusters of neighbouring pieces on a line, divided the way the classifier likes best.
  const maxGap = 0.36 * digitHeight;
  const clusters: { atoms: LineBlob[]; glyphs: Glyph[] }[] = [];
  for (let l = 0; l < n; l++) {
    const row = blobs.filter((b) => b.line === l).sort((a, b) => a.box.x0 - b.box.x0);
    for (const grp of groupAdjacent(row.map((b) => ({ x0: b.box.x0, x1: b.box.x1 })), maxGap)) {
      const atoms = grp.map((k) => row[k]);
      clusters.push({ atoms, glyphs: readCluster(ctx, atoms) });
    }
  }
  // Second look at the doubtful ones, now knowing which face the staff is set in.
  const faceRatings: number[] = [];
  const penalty = facePenalties(clusters.flatMap((c) => c.glyphs), ctx.templates, TEMPLATE_FACE_LIST.length, 0.7, 0.08, faceRatings);
  // (Not worth it on a staff that is mostly noise: there the first reading is as good as any.)
  const firstScores = clusters.flatMap((c) => c.glyphs).filter((g) => isDigitLabel(g.label)).map((g) => g.score);
  const firstMean = firstScores.length ? firstScores.reduce((a, b) => a + b, 0) / firstScores.length : 0;
  if (penalty && firstMean >= 0.8) {
    const topFaces = faceRatings.map((v, f) => ({ v, f })).sort((a, b) => b.v - a.v).slice(0, 6).map((o) => o.f);
    const ctx2: ReaderContext = { ...ctx, penalty, topFaces };
    for (const c of clusters) {
      if (c.glyphs.length && c.glyphs.every((g) => g.margin >= 0.15 && g.score >= 0.8)) continue;
      c.glyphs = readCluster(ctx2, c.atoms);
    }
  }
  let glyphs: Glyph[] = clusters.flatMap((c) => c.glyphs);
  // How readable is this staff? On a good picture the digits correlate at 0.95 and above with
  // their templates; where the average sinks towards 0.8 the staff is mostly noise, every
  // reading is a guess, and weak matches are more likely dirt than numbers.
  const digitScores = glyphs.filter((g) => isDigitLabel(g.label)).map((g) => g.score);
  const meanScore = digitScores.length ? digitScores.reduce((a, b) => a + b, 0) / digitScores.length : 0;
  const reliability = digitScores.length ? Math.max(0, Math.min(1, (meanScore - 0.74) / 0.18)) : 1;
  if (reliability < 0.35) glyphs = glyphs.filter((g) => g.score >= 0.68);
  const numbers: TabNumber[] = [];
  for (let l = 0; l < n; l++) numbers.push(...assembleLine(glyphs.filter((g) => g.line === l), digitHeight, maxGap, base.inkHeight));
  rests = rests.filter((r) => r.confidence >= 0.6 || !numbers.some((q) => q.box.x1 > r.box.x0 && q.box.x0 < r.box.x1 && q.box.y1 > r.box.y0 && q.box.y0 < r.box.y1));
  if (reliability < 1) for (const q of numbers) q.confidence *= 0.3 + 0.7 * reliability;
  // Doubts a single glyph cannot know about itself:
  const sortedScores = digitScores.slice().sort((a, b) => a - b);
  const typical = sortedScores.length ? sortedScores[sortedScores.length >> 1] : 0;
  for (const q of numbers) {
    if (q.dead) continue;
    // - it matches clearly worse than the other numbers of its staff (something is off with it);
    const worst = Math.min(...q.digits.map((g) => g.score));
    const behind = typical - worst;
    if (behind > 0.05) q.confidence *= Math.max(0.3, 1 - 6 * (behind - 0.05));
    // - its digits had to be cut apart;
    if (q.digits.some((g) => g.split)) q.confidence *= 0.85;
    // - a staff line runs through it on a soft picture: the middle of the digit, which is what
    //   tells 0, 6, 8 and 9 apart, cannot be seen.
    if (base.lineThrough && blurLevel >= 2 && q.digits.some((g) => g.fused)) q.confidence *= 0.8;
  }
  // A staff on which nearly everything reads as a lone 1 is more likely a row of strokes (the
  // stems of a notation staff taken for tab, pieces of bar lines) than a tune played on fret 1.
  const lone1 = numbers.filter((q) => !q.dead && q.digits.length === 1 && q.fret === 1).length;
  if (numbers.length >= 5 && lone1 >= 0.8 * numbers.length) {
    for (const q of numbers) {
      if (q.dead || q.digits.length !== 1 || q.fret !== 1) continue;
      q.confidence = Math.min(q.confidence, 0.45);
      q.flags.push('mostly-ones');
    }
    warnings.push({ code: 'other', message: 'Nearly every mark on this staff reads as a 1: they may be stems or strokes rather than fret numbers.' });
  }
  if (reliability < 0.5 && numbers.length) warnings.push({ code: 'low-quality', message: 'The numbers on this staff are hard to make out in this picture; treat them as guesses.' });
  timings.glyphs = now() - t1;

  // Marks drawn between the numbers: ties and slurs, slides, bends.
  const marks: TabMark[] = reliability >= 0.5 ? [...findArcs(input.noLines, barred, numbers, digitHeight), ...findSlides(input.noLines, barred, numbers), ...findBends(input.binary, barred, numbers)] : [];
  applyMarks(marks);

  // Columns: numbers printed above one another sound together.
  const columns: TabColumn[] = groupColumns(numbers, 0.42 * digitHeight).map((items) => ({
    x: items.reduce((a, q) => a + (q.x0 + q.x1) / 2, 0) / items.length,
    numbers: items,
    flags: [],
  }));
  for (const col of columns) checkStretch(col);

  // Rhythm: stems under (or over) the staff, one per column; rests printed among the numbers.
  t1 = now();

  let memory = pageMemory.get(input.page.gray);
  if (!memory) pageMemory.set(input.page.gray, (memory = {}));
  if (timeSig && timeSig.confidence >= 0.5) memory.time = { beats: timeSig.beats, beatValue: timeSig.beatValue };
  const ctxTime = options.context;
  const time = timeSig ?? (ctxTime?.beats && ctxTime.beatValue ? { beats: ctxTime.beats, beatValue: ctxTime.beatValue } : memory.time ?? null);
  const knownTicks = time ? Math.round((time.beats * 3840) / time.beatValue) : memory.ticks ?? null;
  const rhythm = readRhythm(input, columns, rests, bars, knownTicks);
  if (!knownTicks && rhythm.measureTicks && rhythm.support >= 2) memory.ticks = rhythm.measureTicks;
  timings.rhythm = now() - t1;

  const events: (OmrTabEvent & { measureIndex?: number })[] = [];
  const eventX = new Map<OmrTabEvent, number>();
  columns.forEach((col, ci) => {
    const notes: OmrTabNote[] = col.numbers.map((q) => {
      const string = q.line + 1;
      const alternatives: Alternative<number>[] | undefined = q.alternatives.length ? q.alternatives.map((a) => ({ value: a.value, confidence: a.confidence })) : undefined;
      const technique = [q.dead ? 'x' : '', q.harmonic ? '<>' : '', q.technique ?? ''].join('') || undefined;
      return {
        id: '',
        bbox: input.toPageBox(q.box.x0, q.box.y0, q.box.x1 - q.box.x0, q.box.y1 - q.box.y0),
        confidence: q.confidence,
        source: 'image' as const,
        string,
        fret: q.fret,
        alternatives,
        midi: midiAtFret(Math.min(string, tuning.length), q.fret, tuning),
        parenthesized: q.parenthesized || undefined,
        tieStop: q.tieStop || undefined,
        technique,
      };
    });
    const x0 = Math.min(...col.numbers.map((q) => q.box.x0));
    const y0 = Math.min(...col.numbers.map((q) => q.box.y0));
    const x1 = Math.max(...col.numbers.map((q) => q.box.x1));
    const y1 = Math.max(...col.numbers.map((q) => q.box.y1));
    const mid = input.toPage(col.x, (y0 + y1) / 2);
    const measure = input.measures.find((m) => col.x >= m.x0 && col.x < m.x1);
    const event: OmrTabEvent & { measureIndex?: number } = {
      id: '',
      bbox: input.toPageBox(x0, y0, x1 - x0, y1 - y0),
      confidence: Math.min(...notes.map((q) => q.confidence)),
      source: 'image',
      kind: 'tab',
      x: mid.x,
      notes,
      duration: rhythm.durations[ci] ?? undefined,
      measureIndex: measure?.index,
    };
    events.push(event);
    eventX.set(event, col.x);
  });

  rests.forEach((r, i) => {
    const duration = rhythm.restDurations[i] ?? { value: r.value, dots: 0 as const, ticks: durationTicks(r.value), confidence: r.confidence };
    const mid = input.toPage(r.x, (r.box.y0 + r.box.y1) / 2);
    const event: OmrTabEvent & { measureIndex?: number } = {
      id: '',
      bbox: input.toPageBox(r.box.x0, r.box.y0, r.box.x1 - r.box.x0, r.box.y1 - r.box.y0),
      confidence: r.confidence,
      source: 'image',
      kind: 'tab-rest',
      x: mid.x,
      notes: [],
      duration,
      measureIndex: input.measures.find((m) => r.x >= m.x0 && r.x < m.x1)?.index,
    };
    events.push(event);
    eventX.set(event, r.x);
  });
  // Time order is order along the staff (in strip px: on a rotated page the page x alone could mislead).
  events.sort((a, b) => (eventX.get(a) as number) - (eventX.get(b) as number));
  const stripX = events.map((e) => eventX.get(e) as number);

  let clef: OmrClef | undefined;
  if (clefBox) clef = { id: '', bbox: input.toPageBox(clefBox.x0, clefBox.y0, clefBox.x1 - clefBox.x0, clefBox.y1 - clefBox.y0), confidence: 0.9, source: 'image', type: 'tab' };
  const timeSignature: OmrTimeSignature | undefined = timeSig
    ? { id: '', bbox: input.toPageBox(timeSig.box.x0, timeSig.box.y0, timeSig.box.x1 - timeSig.box.x0, timeSig.box.y1 - timeSig.box.y0), confidence: timeSig.confidence, source: 'image', beats: timeSig.beats, beatValue: timeSig.beatValue }
    : undefined;
  const texts: OmrText[] = [];
  const confidence = events.length ? events.reduce((a, e) => a + e.confidence, 0) / events.length : 0.5;
  return {
    reading: { events, clef, timeSignature, texts, confidence, warnings },
    debug: { digitHeight, blurLevel, lineThrough: base.lineThrough, strike: strike.median, tuning, faceRatings, meanScore, reliability, blobs, glyphs, numbers, columns, marks, clefEnd, stripX, stems: rhythm.stems, measureTicks: rhythm.measureTicks, ms: now() - t0, timings },
  };
}

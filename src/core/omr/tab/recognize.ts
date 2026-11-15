/**
 * The printed-tablature reader: one cleaned staff strip in, fret numbers per string out.
 *
 *   ink on string lines ─▶ digit height ─▶ classify / cut / join into numbers ─▶ columns
 *   (chords) ─▶ sanity checks ─▶ rhythm from stems ─▶ events with page boxes and confidences
 */
import { type Components, labelComponents } from '../image/cc';
import { cropBinary } from '../image/gray';
import {
  type Alternative, type OmrClef, type OmrTabEvent, type OmrTabNote, type OmrText, type OmrTimeSignature, type OmrWarning,
  type RecognizeOptions, type StaffInput, type StaffReading, STANDARD_TUNING, midiAtFret,
} from '../types';
import type { Box } from './glyph';
import { type Glyph, type ReaderContext, type TabNumber, assembleLine, detectLineThrough, facePenalties, readCluster } from './numbers';
import { type LineBlob, estimateDigitHeight, findLineBlobs, groupAdjacent, groupColumns, nearBarline } from './segment';
import { BLUR_LEVELS, TEMPLATE_FACE_LIST, templatesAtBlur } from './templates';

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
  /** The staff lines strike through the numbers. */
  lineThrough: boolean;
  blobs: LineBlob[];
  glyphs: Glyph[];
  numbers: TabNumber[];
  columns: TabColumn[];
  /** Right end of the TAB letters in strip px (0 when there are none). */
  clefEnd: number;
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

/** Find the stacked T-A-B letters at the start of the staff; returns their box in strip px. */
function findClef(cc: Components, dy: number, input: StaffInput): Box | null {
  const sp = input.space;
  const n = input.lineCount;
  const top = input.lineYs[0];
  const bottom = input.lineYs[n - 1];
  let box: Box | null = null;
  let count = 0;
  for (let c = 1; c <= cc.count; c++) {
    const w = cc.x1[c] - cc.x0[c] + 1;
    const h = cc.y1[c] - cc.y0[c] + 1;
    const cx = (cc.x0[c] + cc.x1[c] + 1) / 2;
    const cy = (cc.y0[c] + cc.y1[c] + 1) / 2 + dy;
    if (cx - input.x0 > 4.2 * sp || cx < input.x0) continue;
    if (h < 1.05 * sp || h > 2.6 * sp || w < 0.5 * sp || w > 2.6 * sp) continue;
    if (cy < top - 0.3 * sp || cy > bottom + 0.3 * sp) continue;
    if (nearBarline(input, cc.x0[c], cc.x1[c] + 1, 0) && w < 0.6 * sp) continue;
    count++;
    const b = { x0: cc.x0[c], y0: cc.y0[c] + dy, x1: cc.x1[c] + 1, y1: cc.y1[c] + 1 + dy };
    box = box ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) } : b;
  }
  // Two or three letters stacked over most of the staff height.
  if (!box || count < 2 || box.y1 - box.y0 < 0.55 * (bottom - top) || box.x1 - box.x0 > 3 * sp) return null;
  return box;
}

/** Pick the template blur that suits this strip: the level at which sample digits correlate best. */
function chooseBlur(ctx: Omit<ReaderContext, 'templates'>, blobs: LineBlob[]): number {
  const hd = ctx.digitHeight;
  const sample = blobs.filter((b) => {
    const h = b.box.y1 - b.box.y0;
    const w = b.box.x1 - b.box.x0;
    return Math.abs(b.offset) < 0.2 && h > 0.8 * hd && h < 1.2 * hd && w < 0.85 * hd && w > 0.2 * hd;
  });
  if (sample.length < 2) return 1;
  const step = Math.max(1, Math.floor(sample.length / 14));
  let best = 0;
  let bestScore = -Infinity;
  for (let level = 0; level < BLUR_LEVELS.length; level++) {
    const c: ReaderContext = { ...ctx, templates: templatesAtBlur(level), digitsOnly: true };
    let sum = 0;
    let k = 0;
    for (let i = 0; i < sample.length; i += step) {
      const g = readCluster(c, [sample[i]]);
      sum += g.length === 1 ? g[0].score : 0;
      k++;
    }
    const mean = sum / Math.max(1, k);
    if (mean > bestScore + 0.004) {
      bestScore = mean;
      best = level;
    }
  }
  return best;
}

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

/** Read one tab staff and return the reading with its internals. */
export function readTabStaff(input: StaffInput, options: RecognizeOptions = {}): TabReadingDetail {
  const t0 = now();
  const timings: Record<string, number> = {};
  const sp = input.space;
  const n = input.lineCount;
  const tuning = options.tuning ?? STANDARD_TUNING;
  const warnings: OmrWarning[] = [];

  // Components of the staff band, with and without the lines.
  const bandY = Math.max(0, Math.floor(input.lineYs[0] - 1.1 * sp));
  const bandH = Math.min(input.gray.height, Math.ceil(input.lineYs[n - 1] + 1.1 * sp)) - bandY;
  const ccFree = labelComponents(cropBinary(input.noLines, 0, bandY, input.noLines.width, bandH));
  const ccFull = labelComponents(cropBinary(input.binary, 0, bandY, input.binary.width, bandH));
  timings.components = now() - t0;
  const clefBox = findClef(ccFree, bandY, input);
  const clefEnd = clefBox ? clefBox.x1 : 0;

  let blobs = findLineBlobs(ccFree, input, ccFull, bandY);
  blobs = blobs.filter((b) => {
    if (b.box.x0 < clefEnd + 0.15 * sp) return false;
    if (b.box.x1 < input.x0 - 0.5 * sp || b.box.x0 > input.x1 + 0.5 * sp) return false;
    for (const bar of input.barlines) {
      // The remains of a bar line: no wider than the bar itself.
      if (b.box.x1 > bar.x0 - 1 && b.box.x0 < bar.x1 + 1 && b.box.x1 - b.box.x0 <= 2.2 * (bar.x1 - bar.x0) + 2) return false;
      // The dots of a repeat sign (they can land on a line in a six-line staff).
      const dotty = b.box.y1 - b.box.y0 <= 0.6 * sp && b.box.x1 - b.box.x0 <= 0.6 * sp;
      if (dotty && bar.type.startsWith('repeat') && b.box.x1 > bar.x0 - 1.1 * sp && b.box.x0 < bar.x1 + 1.1 * sp) return false;
    }
    return true;
  });
  const digitHeight = estimateDigitHeight(blobs, input);
  const base: Omit<ReaderContext, 'templates'> = {
    gray: input.gray,
    noLines: input.noLines,
    lineYs: input.lineYs,
    space: sp,
    lineThickness: input.lineThickness,
    digitHeight,
    profiles: new Map(),
    lineThrough: detectLineThrough(input.gray, blobs, input.lineYs, digitHeight),
  };
  let t1 = now();
  const blurLevel = chooseBlur(base, blobs);
  timings.blur = now() - t1;
  t1 = now();
  const ctx: ReaderContext = { ...base, templates: templatesAtBlur(blurLevel) };

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
  const penalty = facePenalties(clusters.flatMap((c) => c.glyphs), ctx.templates, TEMPLATE_FACE_LIST.length);
  if (penalty) {
    const ctx2: ReaderContext = { ...ctx, penalty };
    for (const c of clusters) {
      if (c.glyphs.length && c.glyphs.every((g) => g.margin >= 0.15 && g.score >= 0.8)) continue;
      c.glyphs = readCluster(ctx2, c.atoms);
    }
  }
  const glyphs: Glyph[] = clusters.flatMap((c) => c.glyphs);
  const numbers: TabNumber[] = [];
  for (let l = 0; l < n; l++) numbers.push(...assembleLine(glyphs.filter((g) => g.line === l), digitHeight, maxGap));
  timings.glyphs = now() - t1;

  // Columns: numbers printed above one another sound together.
  const columns: TabColumn[] = groupColumns(numbers, 0.42 * digitHeight).map((items) => ({
    x: items.reduce((a, q) => a + (q.x0 + q.x1) / 2, 0) / items.length,
    numbers: items,
    flags: [],
  }));
  for (const col of columns) checkStretch(col);

  const events: (OmrTabEvent & { measureIndex?: number })[] = [];
  for (const col of columns) {
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
    events.push({
      id: '',
      bbox: input.toPageBox(x0, y0, x1 - x0, y1 - y0),
      confidence: Math.min(...notes.map((q) => q.confidence)),
      source: 'image',
      kind: 'tab',
      x: mid.x,
      notes,
      measureIndex: measure?.index,
    });
  }

  let clef: OmrClef | undefined;
  if (clefBox) clef = { id: '', bbox: input.toPageBox(clefBox.x0, clefBox.y0, clefBox.x1 - clefBox.x0, clefBox.y1 - clefBox.y0), confidence: 0.9, source: 'image', type: 'tab' };
  const timeSignature: OmrTimeSignature | undefined = undefined;
  const texts: OmrText[] = [];
  const confidence = events.length ? events.reduce((a, e) => a + e.confidence, 0) / events.length : 0.5;
  return {
    reading: { events, clef, timeSignature, texts, confidence, warnings },
    debug: { digitHeight, blurLevel, lineThrough: base.lineThrough, blobs, glyphs, numbers, columns, clefEnd, ms: now() - t0, timings },
  };
}

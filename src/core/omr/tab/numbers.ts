/**
 * From ink on a string line to fret numbers: group neighbouring pieces, find the split of each
 * group into glyphs that the classifier likes best (so touching digits are cut apart and a digit
 * that fell into pieces is put together again), join neighbouring digits into two-digit frets,
 * and turn correlation scores into confidences and alternatives.
 */
import type { BinaryImage, GrayImage } from '../image/gray';
import { type Box, type ClassScore, type GlyphPatch, type LineProfile, classifyPatch, correlate, correlateComposite, extractPatch, lineProfileAt } from './glyph';
import { GLYPH_H } from './templates';
import { type LineBlob, columnProfile, offLineExtent, profileValleys, tightBox } from './segment';
import type { GlyphTemplate } from './templates';

/** Highest fret a guitar has; larger numbers are misreadings. */
export const MAX_FRET = 24;

/** One classified glyph on a string line. */
export interface Glyph {
  box: Box;
  line: number;
  /** Classes best first (scores already carry the class priors). */
  ranked: ClassScore[];
  /** Best class label ('0'..'9', 'x', '(' ...). */
  label: string;
  /** Correlation of the best class and its lead over the runner-up. */
  score: number;
  margin: number;
  /** The glyph hangs on its staff line (struck through, or touching it). */
  fused: boolean;
  /** The glyph was cut out of a wider blob of touching glyphs. */
  split?: boolean;
}

/** A fret number: one or two digit glyphs on a line. */
export interface TabNumber {
  line: number;
  box: Box;
  x0: number;
  x1: number;
  digits: Glyph[];
  fret: number;
  confidence: number;
  alternatives: { value: number; confidence: number }[];
  /** Gap between the two digits in digit heights (two-digit numbers only). */
  gap?: number;
  /** A dead note: the glyph is an x, `fret` is a placeholder. */
  dead?: boolean;
  /** Printed in parentheses / angle brackets. */
  parenthesized?: boolean;
  harmonic?: boolean;
  /** Technique mark printed after the number ('h', 'p', '/', ...). */
  technique?: string;
  tieStop?: boolean;
  /** Notes on how the reading was reached (for the warning list and for debugging). */
  flags: string[];
}

/** What the glyph reader needs to know about the strip. */
export interface ReaderContext {
  gray: GrayImage;
  noLines: BinaryImage;
  lineYs: number[];
  space: number;
  lineThickness: number;
  /** Digit height of the staff, strip px. */
  digitHeight: number;
  /** Templates at the blur level chosen for the staff. */
  templates: GlyphTemplate[];
  /** Line cross-sections already measured, by line and stretch of staff. */
  profiles: Map<number, LineProfile>;
  /** Read only digits (used while the blur level is being chosen). */
  digitsOnly?: boolean;
  /** Score penalty per template once the face of the staff is known (see `facePenalties`). */
  penalty?: Float32Array | null;
  /**
   * The staff lines strike through the numbers of this staff (rather than being blanked behind
   * them). Only then is the line taken out of a glyph that hangs on it.
   */
  lineThrough: boolean;
}

/** True for the digit classes. */
export const isDigitLabel = (label: string): boolean => label.length === 1 && label >= '0' && label <= '9';

/**
 * How much better than a digit a mark must correlate to be believed. Numbers are what a tab
 * staff is made of; a letter between them is rare and a 6 that reads slightly better as a "b"
 * is still a 6.
 */
const CLASS_PRIOR: Record<string, number> = { x: 0.03, '(': 0.05, ')': 0.05, '<': 0.05, '>': 0.05, h: 0.1, p: 0.1, b: 0.1, s: 0.1, r: 0.1, '/': 0.1, '\\': 0.1, '~': 0.2 };

/** Cross-section of line `line` around column x (cached per stretch of two staff spaces). */
function profileFor(ctx: ReaderContext, line: number, x: number): LineProfile {
  const bucket = Math.floor(x / (2 * ctx.space));
  const key = line * 100000 + bucket;
  let p = ctx.profiles.get(key);
  if (!p) {
    const cx = (bucket + 0.5) * 2 * ctx.space;
    p = lineProfileAt(ctx.gray, ctx.lineYs[line], cx - 3.5 * ctx.space, cx + 3.5 * ctx.space, ctx.lineThickness / 2 + 0.2 * ctx.space);
    ctx.profiles.set(key, p);
  }
  return p;
}

/** Classify the content of a box. In a struck-through staff, `fused` boxes have the staff line taken out first. */
export function readGlyph(ctx: ReaderContext, box: Box, line: number, fused: boolean): (Glyph & { patch: GlyphPatch }) | null {
  const h = box.y1 - box.y0;
  const w = box.x1 - box.x0;
  if (h < 3 || w < 1.5) return null;
  const patch = extractPatch(ctx.gray, box, fused && ctx.lineThrough ? profileFor(ctx, line, (box.x0 + box.x1) / 2) : null);
  const relH = h / ctx.digitHeight;
  const raw = classifyPatch(patch, ctx.templates, { relH, relHTolerance: 0.25, allow: ctx.digitsOnly ? (t) => t.cls < 10 : undefined, penalty: ctx.penalty });
  if (!raw.length) return null;
  const ranked = raw.map((r) => ({ ...r, score: r.score - (CLASS_PRIOR[r.label] ?? 0) })).sort((a, b) => b.score - a.score);
  return { box, line, ranked, label: ranked[0].label, score: ranked[0].score, margin: ranked[0].score - (ranked[1]?.score ?? 0), fused, patch };
}

/** Lowest correlation at which a glyph is accepted at all. */
export const MIN_GLYPH_SCORE = 0.5;

/** Sub-box between two columns, tightened to its ink; keeps the full height when the piece is clearly cut short. */
function pieceBox(ctx: ReaderContext, box: Box, xa: number, xb: number): Box | null {
  const t = tightBox(ctx.noLines, { x0: xa, y0: box.y0, x1: xb, y1: box.y1 });
  if (!t) return null;
  if (t.y1 - t.y0 < 0.85 * (box.y1 - box.y0)) {
    t.y0 = box.y0;
    t.y1 = box.y1;
  }
  return t;
}

/** What a run of neighbouring pieces reads as when taken as one unit, and how good that reading is. */
interface RunReading {
  glyphs: Glyph[];
  value: number;
}

/**
 * Read a run of pieces as one glyph, or as two touching ones when it is too wide for one (every
 * plausible cut is tried; the cut wins if both halves read better than the whole).
 */
function readRun(ctx: ReaderContext, atoms: LineBlob[]): RunReading {
  const hd = ctx.digitHeight;
  const line = atoms[0].line;
  const fused = atoms.some((a) => a.fused);
  const box: Box = {
    x0: Math.min(...atoms.map((a) => a.box.x0)),
    y0: Math.min(...atoms.map((a) => a.box.y0)),
    x1: Math.max(...atoms.map((a) => a.box.x1)),
    y1: Math.max(...atoms.map((a) => a.box.y1)),
  };
  const area = atoms.reduce((a, b) => a + b.area, 0);
  // Ink nothing can be made of: free if it is a speck, costly if it is the size of half a digit.
  const nothing: RunReading = { glyphs: [], value: area > 0.1 * hd * hd ? -0.15 : -0.005 };
  if (fused) {
    // Leftovers of the staff line stick out sideways only at the height of the line.
    const ext = offLineExtent(ctx.noLines, box, ctx.lineYs[line], ctx.lineThickness / 2 + 1.5);
    if (ext) {
      if (ext.x0 - box.x0 >= 2) box.x0 = ext.x0;
      if (box.x1 - ext.x1 >= 2) box.x1 = ext.x1;
    }
  }
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  if (h < 0.45 * hd || h > 1.75 * hd || w > 2.3 * hd) return nothing;
  if (Math.abs((box.y0 + box.y1) / 2 - ctx.lineYs[line]) > 0.34 * hd) return nothing;
  // The worth of a glyph grows with its width: explaining a whole digit well beats explaining
  // its two halves passably.
  const worth = (g: Glyph): number => ((g.box.x1 - g.box.x0) / hd) * (g.score - 0.5);
  const single = readGlyph(ctx, box, line, fused);
  const mustSplit = w > 1.02 * hd;
  const digitHigh = h >= 0.7 * hd && h <= 1.3 * hd;
  if (!digitHigh || w < 0.56 * hd || (single && single.score >= 0.9 && !mustSplit)) {
    return single && single.score >= MIN_GLYPH_SCORE && !mustSplit ? { glyphs: [single], value: worth(single) } : nothing;
  }
  const profile = columnProfile(ctx.gray, box, fused ? { lineY: ctx.lineYs[line], band: ctx.lineThickness / 2 + 2 } : null);
  // Two touching glyphs? Lay the best pair of templates over the whole blob and compare that
  // with the blob read as one glyph: both scores are then about the same pixels.
  let best: { left: Glyph; right: Glyph; s: number } | null = null;
  const k = GLYPH_H / h;
  for (const cut of profileValleys(profile, 0.2 * hd, 4)) {
    const lb = pieceBox(ctx, box, box.x0, Math.floor(box.x0) + cut);
    const rb = pieceBox(ctx, box, Math.floor(box.x0) + cut, box.x1);
    if (!lb || !rb) continue;
    const left = readGlyph(ctx, lb, line, fused);
    const right = readGlyph(ctx, rb, line, fused);
    if (!left || !right || left.score < MIN_GLYPH_SCORE || right.score < MIN_GLYPH_SCORE) continue;
    // A blob no wider than one digit is two glyphs only if both are digits and one is a 1.
    if (!mustSplit && !(isDigitLabel(left.label) && isDigitLabel(right.label) && (left.label === '1' || right.label === '1'))) continue;
    let s = Math.min(left.score, right.score);
    if (single) {
      s = correlateComposite(single.patch, [
        { t: ctx.templates[left.ranked[0].template], c0: (lb.x0 - box.x0) * k, c1: (lb.x1 - box.x0) * k },
        { t: ctx.templates[right.ranked[0].template], c0: (rb.x0 - box.x0) * k, c1: (rb.x1 - box.x0) * k },
      ]) - Math.max(CLASS_PRIOR[left.label] ?? 0, CLASS_PRIOR[right.label] ?? 0);
    }
    if (!best || s > best.s) best = { left: { ...left, split: true }, right: { ...right, split: true }, s };
  }
  const singleScore = single ? single.score : 0;
  if (best && (mustSplit || best.s > singleScore + 0.03)) return { glyphs: [best.left, best.right], value: worth(best.left) + worth(best.right) };
  if (single && single.score >= MIN_GLYPH_SCORE && !mustSplit) return { glyphs: [single], value: worth(single) };
  return nothing;
}

/**
 * Read a cluster of neighbouring pieces of one line (sorted left to right): choose the division
 * into runs of up to three pieces whose readings are best overall.
 */
export function readCluster(ctx: ReaderContext, atoms: LineBlob[]): Glyph[] {
  const k = atoms.length;
  if (k === 1) return readRun(ctx, atoms).glyphs;
  const best: { value: number; prev: number; glyphs: Glyph[] }[] = [{ value: 0, prev: -1, glyphs: [] }];
  for (let i = 1; i <= k; i++) {
    let pick: { value: number; prev: number; glyphs: Glyph[] } | null = null;
    for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
      const run = atoms.slice(j, i);
      if (run.length > 1 && run[run.length - 1].box.x1 - run[0].box.x0 > 2.3 * ctx.digitHeight) break;
      const r = readRun(ctx, run);
      // A small bonus for the simpler division (fewer joins) breaks ties.
      const value = best[j].value + r.value - 0.002 * (run.length - 1);
      if (!pick || value > pick.value) pick = { value, prev: j, glyphs: r.glyphs };
    }
    best.push(pick as { value: number; prev: number; glyphs: Glyph[] });
  }
  const out: Glyph[][] = [];
  for (let i = k; i > 0; i = best[i].prev) out.push(best[i].glyphs);
  return out.reverse().flat();
}

/** Map a correlation score and its lead over the runner-up to a 0..1 confidence. */
export function glyphConfidence(score: number, margin: number): number {
  const a = Math.max(0, Math.min(1, (score - 0.5) / 0.38));
  const b = Math.max(0, Math.min(1, margin / 0.14));
  return Math.max(0.02, Math.min(0.99, a * (0.35 + 0.65 * b)));
}

/** Digit readings of a glyph that score close to the best, with confidences. */
function digitOptions(g: Glyph, count = 3): { digit: number; p: number }[] {
  const out: { digit: number; p: number }[] = [];
  const digits = g.ranked.filter((r) => r.cls <= 9);
  if (!digits.length) return out;
  const top = digits[0].score;
  for (let i = 0; i < digits.length && out.length < count; i++) {
    const r = digits[i];
    if (i && top - r.score > 0.22) break;
    const lead = i === 0 ? r.score - (digits[1]?.score ?? 0) : r.score - top;
    out.push({ digit: r.cls, p: glyphConfidence(r.score, lead) });
  }
  return out;
}

/**
 * Build a number from one or two digit glyphs of a line: the fret, its confidence, and the other
 * plausible readings (confusable digits, and the two digits read as separate notes when the gap
 * between them is wide for a two-digit number). Frets above {@link MAX_FRET} are implausible:
 * the best plausible combination is preferred and the confidence drops; the raw reading stays in
 * the alternatives so nothing is hidden.
 */
export function buildNumber(digits: Glyph[], digitHeight: number): TabNumber {
  const line = digits[0].line;
  const box: Box = {
    x0: Math.min(...digits.map((d) => d.box.x0)),
    y0: Math.min(...digits.map((d) => d.box.y0)),
    x1: Math.max(...digits.map((d) => d.box.x1)),
    y1: Math.max(...digits.map((d) => d.box.y1)),
  };
  const flags: string[] = [];
  const opts = digits.map((d) => digitOptions(d));
  // Every combination of the leading options; a number is as sure as its least sure digit.
  let combos: { value: number; p: number; raw: boolean }[] = [{ value: 0, p: 1, raw: true }];
  for (let i = 0; i < digits.length; i++) {
    const next: typeof combos = [];
    for (const c of combos) for (let k = 0; k < opts[i].length; k++) next.push({ value: c.value * 10 + opts[i][k].digit, p: Math.min(c.p, opts[i][k].p), raw: c.raw && k === 0 });
    combos = next;
  }
  const raw = combos.find((c) => c.raw) as { value: number; p: number; raw: boolean };
  let pick = raw;
  let confidence = raw.p;
  const leadingZero = digits.length === 2 && opts[0][0].digit === 0;
  if (raw.value > MAX_FRET || leadingZero) {
    // Not a fret that exists (or a leading zero): take the best reading that does, but call it a guess.
    flags.push(raw.value > MAX_FRET ? 'implausible-fret' : 'leading-zero');
    const ok = combos.filter((c) => c.value <= MAX_FRET && !c.raw && (digits.length === 1 || c.value >= 10)).sort((a, b) => b.p - a.p)[0];
    if (ok) {
      pick = ok;
      confidence = Math.min(0.45, ok.p);
    } else {
      confidence = Math.min(0.2, raw.p);
    }
  }
  const alternatives: { value: number; confidence: number }[] = [];
  const seen = new Set<number>([pick.value]);
  for (const c of combos.slice().sort((a, b) => Number(b.raw) - Number(a.raw) || b.p - a.p)) {
    if (seen.has(c.value)) continue;
    seen.add(c.value);
    if (c.value > MAX_FRET && !c.raw) continue;
    alternatives.push({ value: c.value, confidence: Math.min(c.p, confidence * 0.9) });
    if (alternatives.length >= 3) break;
  }
  let gap: number | undefined;
  if (digits.length === 2) {
    gap = (digits[1].box.x0 - digits[0].box.x1) / digitHeight;
    // "10" or "1 0"? A wide gap makes the two-note reading a real possibility.
    if (gap > 0.22) {
      flags.push('wide-gap');
      confidence *= gap > 0.3 ? 0.6 : 0.85;
      for (const d of digits) {
        const v = opts[digits.indexOf(d)][0]?.digit;
        if (v !== undefined && !seen.has(v)) {
          seen.add(v);
          alternatives.push({ value: v, confidence: 0.3 * confidence });
        }
      }
    }
  }
  return { line, box, x0: box.x0, x1: box.x1, digits, fret: pick.value, confidence, alternatives, gap, flags };
}

const LEGATO_MARKS = new Set(['h', 'p', 's', '/', '\\']);
const AFTER_MARKS = new Set(['b', 'r', '~']);

/** The glyph re-read as a digit (its best digit class), or null when no digit fits. */
function asDigit(g: Glyph): Glyph | null {
  const digits = g.ranked.filter((r) => r.cls <= 9);
  if (!digits.length || digits[0].score < MIN_GLYPH_SCORE) return null;
  return { ...g, ranked: digits, label: digits[0].label, score: digits[0].score, margin: digits[0].score - (digits[1]?.score ?? 0) };
}

/**
 * Turn the glyphs of one string line into numbers. Digits closer than `maxGap` form one number;
 * an x is a dead note; brackets mark the number they enclose; a technique letter or slash counts
 * only where it stands next to a number (otherwise it is re-read as the digit it resembles most,
 * or dropped), and is attached to the number before it.
 */
export function assembleLine(glyphs: Glyph[], digitHeight: number, maxGap = 0.36 * digitHeight): TabNumber[] {
  const hd = digitHeight;
  let row = glyphs.slice().sort((a, b) => a.box.x0 - b.box.x0);
  const numberLike = (g: Glyph | undefined): boolean => !!g && (isDigitLabel(g.label) || g.label === 'x');
  // Marks need a number beside them.
  const kept: Glyph[] = [];
  for (let i = 0; i < row.length; i++) {
    const g = row[i];
    if (isDigitLabel(g.label) || g.label === 'x') {
      kept.push(g);
      continue;
    }
    const prev = row[i - 1];
    const next = row[i + 1];
    const gapL = prev ? g.box.x0 - prev.box.x1 : Infinity;
    const gapR = next ? next.box.x0 - g.box.x1 : Infinity;
    let ok = false;
    if (g.label === '(' || g.label === '<') ok = numberLike(next) && gapR <= 0.6 * hd;
    else if (g.label === ')' || g.label === '>') ok = numberLike(prev) && gapL <= 0.6 * hd;
    else if (LEGATO_MARKS.has(g.label)) ok = (numberLike(prev) || prev?.label === ')') && gapL <= 1.4 * hd && (numberLike(next) || next?.label === '(') && gapR <= 1.4 * hd;
    else if (AFTER_MARKS.has(g.label)) ok = (numberLike(prev) || prev?.label === ')') && gapL <= 1.4 * hd;
    if (ok) {
      kept.push(g);
      continue;
    }
    const d = asDigit(g);
    if (d) kept.push({ ...d, score: d.score - 0.03 });
  }
  row = kept;
  const out: TabNumber[] = [];
  let i = 0;
  let open: string | null = null;
  while (i < row.length) {
    const g = row[i];
    if (g.label === '(' || g.label === '<') {
      open = g.label;
      i++;
      continue;
    }
    if (g.label === ')' || g.label === '>') {
      const last = out[out.length - 1];
      if (last && g.box.x0 - last.box.x1 <= 0.6 * hd) {
        if (g.label === ')') last.parenthesized = true;
        else last.harmonic = true;
      }
      open = null;
      i++;
      continue;
    }
    if (!isDigitLabel(g.label) && g.label !== 'x') {
      const last = out[out.length - 1];
      if (last) last.technique = g.label === 's' ? '/' : g.label;
      i++;
      continue;
    }
    let num: TabNumber;
    if (g.label === 'x') {
      num = { line: g.line, box: g.box, x0: g.box.x0, x1: g.box.x1, digits: [g], fret: 0, confidence: glyphConfidence(g.score, g.margin), alternatives: [], dead: true, flags: ['dead-note'] };
      const d = asDigit(g);
      if (d) num.alternatives.push({ value: d.ranked[0].cls, confidence: Math.min(num.confidence * 0.8, glyphConfidence(d.score, 0)) });
      i++;
    } else {
      const next = row[i + 1];
      const pair = next && isDigitLabel(next.label) && next.box.x0 - g.box.x1 <= maxGap;
      num = buildNumber(pair ? [g, next] : [g], hd);
      i += pair ? 2 : 1;
    }
    if (open === '(') num.parenthesized = true;
    if (open === '<') num.harmonic = true;
    open = null;
    out.push(num);
  }
  return out;
}

/**
 * Work out which faces the digits of a staff are set in, and return a score penalty per template.
 *
 * All numbers of a staff come from one face. Each face is rated by how well its own drawing of
 * the right digit correlates with the glyphs that read clearly; a template then loses a fraction
 * of the distance between the best face and the best face it stands for (at most `cap`). So a
 * shape that only an unlikely face draws - a dotted zero in a staff set in a plain sans - has to
 * win by a margin. Null when fewer than five glyphs read clearly.
 */
export function facePenalties(glyphs: (Glyph & { patch?: GlyphPatch })[], templates: GlyphTemplate[], faceCount: number, strength = 0.7, cap = 0.08): Float32Array | null {
  const sure = glyphs.filter((g) => g.patch && isDigitLabel(g.label) && g.score >= 0.8 && g.margin >= 0.06);
  if (sure.length < 5) return null;
  const step = Math.max(1, Math.floor(sure.length / 36));
  const sum = new Float32Array(faceCount);
  const cnt = new Float32Array(faceCount);
  const best = new Float32Array(faceCount);
  for (let i = 0; i < sure.length; i += step) {
    const g = sure[i];
    const patch = g.patch as GlyphPatch;
    const cls = g.ranked[0].cls;
    best.fill(-1);
    for (const t of templates) {
      if (t.cls !== cls || Math.abs(t.w - patch.w) > Math.max(3, 0.42 * patch.w)) continue;
      let s = -1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s = Math.max(s, correlate(patch, t, dx, dy));
      for (const f of t.faces) if (s > best[f]) best[f] = s;
    }
    for (let f = 0; f < faceCount; f++) {
      // A face with no drawing near the glyph's width counts as a poor match.
      sum[f] += best[f] >= 0 ? best[f] : 0.5;
      cnt[f]++;
    }
  }
  let top = 0;
  for (let f = 0; f < faceCount; f++) top = Math.max(top, sum[f] / Math.max(1, cnt[f]));
  const out = new Float32Array(templates.length);
  templates.forEach((t, i) => {
    let near = Infinity;
    for (const f of t.faces) near = Math.min(near, top - sum[f] / Math.max(1, cnt[f]));
    out[i] = Number.isFinite(near) ? Math.min(cap, strength * Math.max(0, near)) : 0;
  });
  return out;
}

/**
 * Does the staff line strike through the numbers of this staff, or is it blanked behind them?
 * Along the centre of the line, a struck-through glyph is dark from edge to edge; a blanked one
 * shows paper wherever the glyph itself has none (inside a 0, beside a 1). The staff is called
 * struck-through when that holds for most of its digit-sized blobs.
 */
export function detectLineThrough(gray: GrayImage, blobs: LineBlob[], lineYs: number[], digitHeight: number): boolean {
  const ratios: number[] = [];
  for (const b of blobs) {
    const h = b.box.y1 - b.box.y0;
    const w = b.box.x1 - b.box.x0;
    if (!b.fused || h < 0.75 * digitHeight || h > 1.3 * digitHeight || w < 0.3 * digitHeight || w > 0.95 * digitHeight) continue;
    const y = Math.max(0, Math.min(gray.height - 1, Math.floor(lineYs[b.line])));
    const xa = Math.max(0, Math.floor(b.box.x0 + 0.2 * w));
    const xb = Math.min(gray.width, Math.ceil(b.box.x1 - 0.2 * w));
    if (xb - xa < 2) continue;
    // Lightest pixel of the line's centre row inside the glyph, against the bare line just outside it.
    let light = 0;
    for (let x = xa; x < xb; x++) light = Math.max(light, gray.data[y * gray.width + x]);
    let outside = 0;
    let n = 0;
    for (let d = 3; d <= 8; d++) {
      for (const x of [Math.floor(b.box.x0) - d, Math.ceil(b.box.x1) + d - 1]) {
        if (x < 0 || x >= gray.width) continue;
        outside += 255 - gray.data[y * gray.width + x];
        n++;
      }
    }
    if (!n) continue;
    const lineInk = outside / n;
    if (lineInk < 60) continue;
    ratios.push((255 - light) / lineInk);
  }
  if (ratios.length < 3) return ratios.length > 0 && ratios.every((r) => r > 0.75);
  ratios.sort((a, b) => a - b);
  return ratios[ratios.length >> 1] > 0.75;
}

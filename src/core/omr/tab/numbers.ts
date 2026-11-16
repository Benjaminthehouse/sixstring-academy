/**
 * From ink on a string line to fret numbers: group neighbouring pieces, find the split of each
 * group into glyphs that the classifier likes best (so touching digits are cut apart and a digit
 * that fell into pieces is put together again), join neighbouring digits into two-digit frets,
 * and turn correlation scores into confidences and alternatives.
 */
import type { BinaryImage, GrayImage } from '../image/gray';
import { fretsInDigits } from '../frets';
import { type Box, type ClassScore, type GlyphPatch, type LineProfile, classifyPatch, correlate, correlateComposite, discriminate, extractPatch, lineInBox, lineProfileAt, refineBox, widthTolerance } from './glyph';
import { GLYPH_H, struckTemplates } from './templates';
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
  /** The glyph comes from ink cut out of a larger shape (a chord column, a number with an arc on it). */
  welded?: boolean;
  /** The resampled picture of the glyph and the template set it was compared with (same indices as `ranked[].template`). */
  patch?: GlyphPatch;
  templates?: GlyphTemplate[];
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
  /** The digits read as one number past the last fret (`fret` is then a reading of them on the neck). */
  readAs?: number;
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
  /** Digit height of the staff, strip px: as boxed on the binarised strip, and of the ink proper (half-maximum outline). */
  digitHeight: number;
  inkHeight: number;
  /** How far below its line the centre of a digit sits on this staff, strip px (a property of the face and the engraver). */
  centreOffset: number;
  /** Templates at the blur level chosen for the staff, and that level (index into BLUR_LEVELS). */
  templates: GlyphTemplate[];
  blurLevel: number;
  /** Line cross-sections already measured, by line and stretch of staff. */
  profiles: Map<number, LineProfile>;
  /** Score penalty per template once the face of the staff is known (see `facePenalties`). */
  penalty?: Float32Array | null;
  /** The faces that explain the staff best, best first (indices into the face list). */
  topFaces?: number[];
  /**
   * The staff lines strike through the numbers of this staff (rather than being blanked behind
   * them). Only then is the line taken out of a glyph that hangs on it.
   */
  lineThrough: boolean;
  /**
   * Where the line runs through a typical digit of this staff, in rows of a normalised glyph
   * (see {@link struckReference}), used while the blur level is judged.
   */
  struckRef?: { centre: number; thickness: number } | null;
  /** The struck geometries this staff reads with so far (a dozen at most; see {@link struckKey}). */
  struckKeys?: { centre: number; thickness: number }[];
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
export function profileFor(ctx: Pick<ReaderContext, 'gray' | 'lineYs' | 'space' | 'lineThickness' | 'profiles'>, line: number, x: number): LineProfile {
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

/**
 * Classify the content of a box. In a struck-through staff, a glyph that hangs on its line has
 * the line subtracted and is compared with templates struck by the same line.
 */
export function readGlyph(ctx: ReaderContext, rough: Box, line: number, fused: boolean): Glyph | null {
  if (rough.y1 - rough.y0 < 3 || rough.x1 - rough.x0 < 1.5) return null;
  let profile: LineProfile | null = null;
  if (fused && ctx.lineThrough) {
    profile = profileFor(ctx, line, (rough.x0 + rough.x1) / 2);
    if (lineInBox(profile, rough).thickness <= 0) profile = null;
  }
  const box = refineBox(ctx.gray, rough, profile);
  let templates = ctx.templates;
  if (profile) {
    const at = struckKey(ctx, lineInBox(profile, box));
    templates = struckTemplates(ctx.blurLevel, at.centre, at.thickness);
  }
  const patch = extractPatch(ctx.gray, box, profile);
  const relH = (box.y1 - box.y0) / ctx.inkHeight;
  const raw = classifyPatch(patch, templates, { relH, relHTolerance: 0.25, allow: (t) => !t.music, penalty: ctx.penalty });
  if (!raw.length) return null;
  const ranked = raw.map((r) => ({ ...r, score: r.score - (CLASS_PRIOR[r.label] ?? 0) })).sort((a, b) => b.score - a.score);
  if (ctx.topFaces && ranked.length > 1 && ranked[0].cls <= 9 && ranked[0].score - ranked[1].score < CLOSE_CALL) settleCloseCall(patch, templates, ranked, ctx.topFaces);
  return { box, line, ranked, label: ranked[0].label, score: ranked[0].score, margin: ranked[0].score - (ranked[1]?.score ?? 0), fused, patch, templates };
}

/**
 * The struck template geometry a glyph is compared with: where the line crosses it, to half rows
 * (the one-pixel shift search absorbs the rest). Each geometry is a set of templates to draw
 * (5-15 ms), and a noisy staff could ask for dozens: past {@link MAX_STRUCK_PER_STAFF} the nearest
 * one this staff already uses serves. With `rough` (judging the blur level, where a few typical
 * digits suffice) anything within 0.75 rows of the staff's reference geometry is taken as that.
 * The choice depends on the staff alone, never on what was read before.
 */
export function struckKey(ctx: Pick<ReaderContext, 'struckRef' | 'struckKeys'>, at: { centre: number; thickness: number }, rough = false): { centre: number; thickness: number } {
  const ref = ctx.struckRef;
  if (rough && ref && Math.abs(at.centre - ref.centre) <= 0.75 && Math.abs(at.thickness - ref.thickness) <= 0.75) return ref;
  const own = { centre: Math.round(at.centre * 2) / 2, thickness: Math.max(0.5, Math.round(at.thickness * 2) / 2) };
  const used = ctx.struckKeys;
  if (!used) return own;
  const same = used.find((o) => o.centre === own.centre && o.thickness === own.thickness);
  if (same) return same;
  if (used.length < MAX_STRUCK_PER_STAFF) {
    used.push(own);
    return own;
  }
  const dist = (o: { centre: number; thickness: number }): number => Math.abs(o.centre - at.centre) + Math.abs(o.thickness - at.thickness);
  return used.reduce((x, y) => (dist(y) < dist(x) ? y : x));
}

/** Struck template geometries one staff may use (see {@link struckKey}). */
const MAX_STRUCK_PER_STAFF = 12;

/**
 * The staff's typical line geometry in glyph rows (median over the digit-sized pieces that hang on
 * a line, to half rows), or null when fewer than three can be measured.
 */
export function struckReference(ctx: Pick<ReaderContext, 'gray' | 'lineYs' | 'space' | 'lineThickness' | 'profiles' | 'digitHeight'>, blobs: LineBlob[]): { centre: number; thickness: number } | null {
  const hd = ctx.digitHeight;
  const cs: number[] = [];
  const ts: number[] = [];
  for (const b of blobs) {
    const h = b.box.y1 - b.box.y0;
    const w = b.box.x1 - b.box.x0;
    if (!b.fused || Math.abs(b.offset) > 0.2 || h < 0.8 * hd || h > 1.2 * hd || w < 0.2 * hd || w > 0.85 * hd) continue;
    const profile = profileFor(ctx, b.line, (b.box.x0 + b.box.x1) / 2);
    const at = lineInBox(profile, refineBox(ctx.gray, b.box, profile));
    if (at.thickness <= 0) continue;
    cs.push(at.centre);
    ts.push(at.thickness);
    if (cs.length >= 40) break;
  }
  if (cs.length < 3) return null;
  const med = (v: number[]): number => v.sort((a, b) => a - b)[v.length >> 1];
  return { centre: Math.round(med(cs) * 2) / 2, thickness: Math.max(0.5, Math.round(med(ts) * 2) / 2) };
}

/** Lead below which the two best digit readings are compared face by face. */
const CLOSE_CALL = 0.07;

/**
 * Two digits score almost alike. The overall best templates of the two may come from different
 * faces (a light 0 against a bold 6), which blurs the comparison; so the two readings are put
 * head to head inside each of the staff's likely faces, on the pixels where that face's two
 * digits differ, and the verdicts are averaged. A clear verdict reorders the ranking; the scores
 * are moved apart or together accordingly so the confidence follows.
 */
function settleCloseCall(patch: GlyphPatch, templates: GlyphTemplate[], ranked: ClassScore[], topFaces: number[]): void {
  const first = ranked[0];
  for (let k = 1; k < Math.min(3, ranked.length); k++) {
    const other = ranked[k];
    if (other.cls > 9 || first.score - other.score >= CLOSE_CALL) break;
    let sum = 0;
    let n = 0;
    for (const f of topFaces) {
      const pick = (cls: number): GlyphTemplate | null => {
        let best: GlyphTemplate | null = null;
        let bs = -2;
        for (const t of templates) {
          if (t.cls !== cls || t.music || !t.faces.includes(f) || Math.abs(t.w - patch.w) > widthTolerance(patch.w)) continue;
          const s = correlate(patch, t);
          if (s > bs) {
            bs = s;
            best = t;
          }
        }
        return best;
      };
      const a = pick(first.cls);
      const b = pick(other.cls);
      if (!a || !b) continue;
      sum += discriminate(patch, a, b);
      n++;
    }
    if (!n) continue;
    const verdict = sum / n;
    // The head-to-head difference is about three times as sensitive as the overall scores.
    const lead = first.score - other.score + 0.35 * verdict;
    const mid = (first.score + other.score) / 2;
    if (lead < 0) {
      const a = { ...other, score: mid - lead / 2 };
      const b = { ...first, score: mid + lead / 2 };
      ranked[0] = a;
      ranked[k] = b;
      ranked.sort((x, y) => y.score - x.score);
      return;
    }
    first.score = mid + lead / 2;
    other.score = mid - lead / 2;
  }
  ranked.sort((x, y) => y.score - x.score);
}

/** Lowest correlation at which a glyph is accepted at all. */
export const MIN_GLYPH_SCORE = 0.6;

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
  let w = box.x1 - box.x0;
  let h = box.y1 - box.y0;
  if (h < 0.45 * hd || h > 2.4 * hd || w > 2.3 * hd) return nothing;
  // The worth of a glyph grows with its width: explaining a whole digit well beats explaining
  // its two halves passably.
  const worth = (g: Glyph): number => ((g.box.x1 - g.box.x0) / hd) * (g.score - 0.5);
  const centred = (b: Box): boolean => Math.abs((b.y0 + b.y1) / 2 - ctx.lineYs[line]) <= 0.34 * hd;
  let single = h <= 1.75 * hd && centred(box) ? readGlyph(ctx, box, line, fused) : null;
  if (h > 1.15 * hd) {
    // Taller than a digit: something hangs on it (the end of a tie, a stem). Look at the part
    // where a digit of this staff would be, and keep whichever reads better.
    const mid = ctx.lineYs[line] + ctx.centreOffset;
    const cut = tightBox(ctx.noLines, { x0: box.x0, y0: Math.max(box.y0, mid - 0.56 * hd), x1: box.x1, y1: Math.min(box.y1, mid + 0.56 * hd) });
    if (cut && cut.y1 - cut.y0 >= 0.7 * hd) {
      const clipped = readGlyph(ctx, cut, line, true);
      if (clipped && (!single || clipped.score > single.score)) {
        single = clipped;
        box.x0 = cut.x0; box.y0 = cut.y0; box.x1 = cut.x1; box.y1 = cut.y1;
        w = box.x1 - box.x0;
        h = box.y1 - box.y0;
      }
    }
  }
  if (h > 1.75 * hd || !centred(box)) return nothing;
  const mustSplit = w > 1.02 * hd;
  const digitHigh = h >= 0.7 * hd && h <= 1.3 * hd;
  if (!digitHigh || w < 0.6 * hd || (single && single.score >= 0.9 && !mustSplit)) {
    return single && single.score >= MIN_GLYPH_SCORE && !mustSplit ? { glyphs: [single], value: worth(single) } : nothing;
  }
  const profile = columnProfile(ctx.gray, box, fused ? { lineY: ctx.lineYs[line], band: ctx.lineThickness / 2 + 2 } : null);
  // Two touching glyphs? Lay the best pair of templates over the whole blob and compare that
  // with the blob read as one glyph: both scores are then about the same pixels.
  let best: { left: Glyph; right: Glyph; s: number } | null = null;
  for (const cut of profileValleys(profile, 0.2 * hd, 3)) {
    const lb = pieceBox(ctx, box, box.x0, Math.floor(box.x0) + cut);
    const rb = pieceBox(ctx, box, Math.floor(box.x0) + cut, box.x1);
    if (!lb || !rb) continue;
    const left = readGlyph(ctx, lb, line, fused);
    const right = readGlyph(ctx, rb, line, fused);
    if (!left || !right || left.score < MIN_GLYPH_SCORE || right.score < MIN_GLYPH_SCORE) continue;
    // A blob no wider than one digit is two glyphs only if both are digits and one is a 1.
    if (!mustSplit && !(isDigitLabel(left.label) && isDigitLabel(right.label) && (left.label === '1' || right.label === '1'))) continue;
    let s = Math.min(left.score, right.score);
    if (single?.patch && left.templates && right.templates) {
      // Columns of the whole blob's patch that each half is meant to explain.
      const k = GLYPH_H / (single.box.y1 - single.box.y0);
      s = correlateComposite(single.patch, [
        { t: left.templates[left.ranked[0].template], c0: (left.box.x0 - single.box.x0) * k, c1: (left.box.x1 - single.box.x0) * k },
        { t: right.templates[right.ranked[0].template], c0: (right.box.x0 - single.box.x0) * k, c1: (right.box.x1 - single.box.x0) * k },
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
  const glyphs = readClusterRaw(ctx, atoms);
  if (!atoms.some((a) => a.welded)) return glyphs;
  // Ink cut out of a larger shape may be anything; it counts as a glyph only when it reads well.
  return glyphs.filter((g) => {
    const from = atoms.some((a) => a.welded && a.box.x1 > g.box.x0 && a.box.x0 < g.box.x1);
    if (from) g.welded = true;
    return !from || g.score >= WELDED_MIN_SCORE;
  });
}

/** Lowest correlation at which a glyph cut out of a larger shape is accepted. */
export const WELDED_MIN_SCORE = 0.72;

function readClusterRaw(ctx: ReaderContext, atoms: LineBlob[]): Glyph[] {
  const k = atoms.length;
  if (k === 1) return readRun(ctx, atoms).glyphs;
  // A long chain of pieces is not a number but dirt along the line (or a line broken into
  // crumbs): read the pieces one by one rather than try every way of joining them.
  if (k > 10) return atoms.flatMap((a) => readRun(ctx, [a]).glyphs);
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
  let readAs: number | undefined;
  /** Readings of the printed digits taken one or two at a time (when no reading of the whole is on the neck). */
  let pieces: number[] = [];
  if (raw.value > MAX_FRET || leadingZero) {
    // Not a fret that exists (or a leading zero): take the best reading that does, but call it a guess.
    flags.push(raw.value > MAX_FRET ? 'implausible-fret' : 'leading-zero');
    const ok = combos.filter((c) => c.value <= MAX_FRET && !c.raw && (digits.length === 1 || c.value >= 10)).sort((a, b) => b.p - a.p)[0];
    if (ok) {
      pick = ok;
      confidence = Math.min(0.45, ok.p);
    } else if (raw.value > MAX_FRET) {
      // Nothing like it is on the neck: most likely two numbers side by side ("9" "2" read as 92).
      // A reading of its own digits takes its place, as a guess, and the others are offered.
      pieces = fretsInDigits(String(raw.value), MAX_FRET);
      readAs = raw.value;
      pick = { value: pieces[0] ?? 0, p: raw.p, raw: false };
      confidence = Math.min(0.2, raw.p);
    } else {
      confidence = Math.min(0.2, raw.p);
    }
  }
  const alternatives: { value: number; confidence: number }[] = [];
  const seen = new Set<number>([pick.value]);
  for (const c of combos.slice().sort((a, b) => Number(b.raw) - Number(a.raw) || b.p - a.p)) {
    if (seen.has(c.value)) continue;
    seen.add(c.value);
    // Only frets the neck has are offered (the printed number is said in an issue instead).
    if (c.value > MAX_FRET) continue;
    alternatives.push({ value: c.value, confidence: Math.min(c.p, confidence * 0.9) });
    if (alternatives.length >= 3) break;
  }
  for (const v of pieces) {
    if (seen.has(v) || alternatives.length >= 3) continue;
    seen.add(v);
    alternatives.push({ value: v, confidence: confidence * 0.9 });
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
  return { line, box, x0: box.x0, x1: box.x1, digits, fret: pick.value, confidence, alternatives, gap, flags, ...(readAs !== undefined ? { readAs } : {}) };
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
 * or dropped), and is attached to the number before it. `inkHeight` (height of the digits' ink)
 * lets a tall "1" beside a number be recognised as the bracket it is.
 */
export function assembleLine(glyphs: Glyph[], digitHeight: number, maxGap = 0.36 * digitHeight, inkHeight = 0): TabNumber[] {
  const hd = digitHeight;
  let row = glyphs.slice().sort((a, b) => a.box.x0 - b.box.x0);
  const numberLike = (g: Glyph | undefined): boolean => !!g && (isDigitLabel(g.label) || g.label === 'x');
  // Brackets come in pairs. A 1 that could as well be a bracket IS one when its partner stands
  // on the other side of the number: "1 5 )" is "(5)", and "( 5 1" is too.
  const could = (g: Glyph | undefined, label: string): boolean => !!g && g.label === '1' && g.ranked.some((r) => r.label === label && r.score >= g.score - 0.25 && r.score >= 0.45);
  const relabel = (g: Glyph, label: string): Glyph => {
    const hit = g.ranked.find((r) => r.label === label) as ClassScore;
    return { ...g, label, score: hit.score, margin: 0, ranked: [hit, ...g.ranked.filter((r) => r !== hit)] };
  };
  // A bracket is taller than the digits it encloses. A "1" that tall, with a bracket among its
  // readings and a digit on its inner side, is the bracket (the pair rule below still applies).
  if (inkHeight > 0) {
    for (let i = 0; i < row.length; i++) {
      const g = row[i];
      if (g.label !== '1' || g.box.y1 - g.box.y0 < 1.14 * inkHeight) continue;
      const next = row[i + 1];
      const prev = row[i - 1];
      if (could(g, '(') && next && isDigitLabel(next.label) && next.box.y1 - next.box.y0 < 1.1 * inkHeight && next.box.x0 - g.box.x1 <= 0.6 * hd) row[i] = relabel(g, '(');
      else if (could(g, ')') && prev && isDigitLabel(prev.label) && prev.box.y1 - prev.box.y0 < 1.1 * inkHeight && g.box.x0 - prev.box.x1 <= 0.6 * hd) row[i] = relabel(g, ')');
    }
  }
  // Both brackets read as 1s: "1 5 1" or "1 1 2 1" set tight is no fret (frets have one or two
  // digits), but a number in brackets is, when both outer glyphs could be the brackets.
  for (let i = 0; i + 2 < row.length; i++) {
    if (!could(row[i], '(')) continue;
    for (const inner of [1, 2]) {
      const j = i + inner + 1;
      if (j >= row.length || !could(row[j], ')')) continue;
      const mid = row.slice(i + 1, j);
      if (!mid.every((g) => isDigitLabel(g.label))) continue;
      if (row[i + 1].box.x0 - row[i].box.x1 > 0.6 * hd || row[j].box.x0 - row[j - 1].box.x1 > 0.6 * hd) continue;
      if (inner === 2 && mid[1].box.x0 - mid[0].box.x1 > maxGap) continue;
      row[i] = relabel(row[i], '(');
      row[j] = relabel(row[j], ')');
      break;
    }
  }
  for (let i = 0; i < row.length; i++) {
    const g = row[i];
    const pair = g.label === '(' || g.label === '<' ? (g.label === '(' ? ')' : '>') : g.label === ')' || g.label === '>' ? (g.label === ')' ? '(' : '<') : null;
    if (!pair) continue;
    const forward = g.label === '(' || g.label === '<';
    const step = forward ? 1 : -1;
    // The digits of the number, then the glyph beyond them.
    let k = i + step;
    let digits = 0;
    while (row[k] && isDigitLabel(row[k].label) && digits < 2) {
      k += step;
      digits++;
    }
    if (digits >= 1 && row[k]?.label === pair) continue; // the partner is there
    // No partner: the outermost "digit" is it, if it is a 1 that could be a bracket and a digit remains inside.
    const outer = k - step;
    if (digits >= 2 && could(row[outer], pair)) row[outer] = relabel(row[outer], pair);
    else if (digits === 1 && row[k] && could(row[k], pair) && Math.abs(row[k].box.x0 - g.box.x0) <= 3.2 * hd) row[k] = relabel(row[k], pair);
  }
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
    // A bracket needs its number AND its partner on the far side of it: a lone "<" is more likely
    // the end of a slide stroke than half a harmonic.
    const partner = (from: number, step: number, label: string): boolean => {
      let k = from + step;
      let digits = 0;
      while (row[k] && numberLike(row[k]) && digits < 2) {
        k += step;
        digits++;
      }
      return digits >= 1 && row[k]?.label === label;
    };
    if (g.label === '(' || g.label === '<') ok = numberLike(next) && gapR <= 0.6 * hd && partner(i, 1, g.label === '(' ? ')' : '>');
    else if (g.label === ')' || g.label === '>') ok = numberLike(prev) && gapL <= 0.6 * hd && partner(i, -1, g.label === ')' ? '(' : '<');
    else if (LEGATO_MARKS.has(g.label)) {
      // "5h7": the letter leans on the number before it, or stands between two numbers.
      const left = (numberLike(prev) || prev?.label === ')') && gapL <= 1.4 * hd;
      ok = left && (gapL <= 0.5 * hd || ((numberLike(next) || next?.label === '(') && gapR <= 1.4 * hd));
    } else if (AFTER_MARKS.has(g.label)) ok = (numberLike(prev) || prev?.label === ')') && gapL <= 1.4 * hd;
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
export function facePenalties(glyphs: Glyph[], templates: GlyphTemplate[], faceCount: number, strength = 0.7, cap = 0.08, ratings?: number[]): Float32Array | null {
  const sure = glyphs.filter((g) => g.patch && g.templates && isDigitLabel(g.label) && g.score >= 0.8 && g.margin >= 0.06);
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
    for (const t of g.templates as GlyphTemplate[]) {
      if (t.cls !== cls || t.music || Math.abs(t.w - patch.w) > widthTolerance(patch.w)) continue;
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
  if (ratings) for (let f = 0; f < faceCount; f++) ratings[f] = sum[f] / Math.max(1, cnt[f]);
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
  return lineThroughEvidence(gray, blobs, lineYs, digitHeight).through;
}

/**
 * The evidence behind {@link detectLineThrough}: for each digit-sized blob that hangs on its line,
 * the lightest pixel of the line's centre row inside the glyph, as a share of the bare line's ink
 * just outside it. `median` of those ratios (0 without samples): well above 1 where the line runs
 * through the numbers (the glyph adds to it), below 1 where it is blanked behind them, near 1
 * where blur has closed the blanked gap.
 */
export function lineThroughEvidence(gray: GrayImage, blobs: LineBlob[], lineYs: number[], digitHeight: number): { through: boolean; median: number; samples: number } {
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
  if (!ratios.length) return { through: false, median: 0, samples: 0 };
  ratios.sort((a, b) => a - b);
  const median = ratios[ratios.length >> 1];
  const through = ratios.length < 3 ? ratios[0] > 0.75 : median > 0.75;
  return { through, median, samples: ratios.length };
}

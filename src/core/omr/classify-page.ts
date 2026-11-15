/**
 * A quick look at a page before reading it: is it tablature, standard notation, both, a text-like
 * sheet (chord sheet, lyrics, ASCII tab: send it to OCR and the song importers), or not music?
 *
 *   const c = classifyPage(imageData);       // ~0.2-0.6 s on a phone photo; run it in the worker
 *   if (c.kind === 'text') runOcr(); else recognizePage(imageData);
 *
 * It runs the staff finder on a reduced copy of the page and, where it finds no staves, counts
 * lines of text. Six "lines" made of dashes (ASCII tab typed with - characters) are reported as
 * text, because OCR + the ASCII-tab importer read those far better than the graphics reader.
 */
import { binarize } from './image/binarize';
import { labelComponents } from './image/cc';
import { type BinaryImage, type GrayImage, downscaleInt } from './image/gray';
import { analyzePage } from './page';
import { type OmrImageInput, toGray } from './pipeline';
import { lineYAt } from './staff/model';
import type { StaffLayout } from './staff/model';

/** What a page holds. */
export type PageKind = 'tab' | 'notation' | 'both' | 'text' | 'not-music';

/** Result of {@link classifyPage}. */
export interface PageClassification {
  kind: PageKind;
  /** 0..1. */
  confidence: number;
  /** Staves found by kind, and systems where a notation staff has its tab partner. */
  staves: { notation: number; tab: number; linkedSystems: number };
  /** Lines of text found outside the staves. */
  textLines: number;
  /** Six-line groups made of dashes: ASCII tab printed as text. */
  asciiTab: boolean;
  /** One plain sentence for the screen. */
  reason: string;
  ms: number;
}

/** Options for {@link classifyPage}. */
export interface ClassifyOptions {
  /** The page is reduced until its longer side is at most this many px (default 1800). */
  maxSide?: number;
}

/**
 * How solid a staff's lines are on the binarised page: share of ink along the lines, and gaps per
 * staff space. Printed lines are solid apart from the knock-outs behind digits; a typed row of
 * dashes breaks every character.
 */
function lineSolidity(bin: BinaryImage, st: StaffLayout): { ink: number; gapsPerSpace: number } {
  let ink = 0;
  let total = 0;
  let gaps = 0;
  const w = bin.width;
  for (let l = 0; l < st.lineCount; l++) {
    let prev = 1;
    for (let x = Math.ceil(st.x0); x < Math.floor(st.x1); x++) {
      const yc = lineYAt(st, l, x);
      let on = 0;
      for (let dy = -1; dy <= 1 && !on; dy++) {
        const y = Math.round(yc + dy);
        if (y >= 0 && y < bin.height && bin.data[y * w + x]) on = 1;
      }
      ink += on;
      total++;
      if (prev && !on) gaps++;
      prev = on;
    }
  }
  const spaces = Math.max(1, ((st.x1 - st.x0) * st.lineCount) / Math.max(1, st.space));
  return { ink: total ? ink / total : 0, gapsPerSpace: gaps / spaces };
}

/** Lines of text: rows of several letter-sized components side by side. */
function countTextLines(gray: GrayImage, exclude: { y0: number; y1: number }[]): number {
  const bin = binarize(gray, { method: 'sauvola' });
  const cc = labelComponents(bin);
  const H = gray.height;
  const W = gray.width;
  const items: { y0: number; y1: number; x0: number; x1: number }[] = [];
  for (let i = 1; i <= cc.count; i++) {
    const h = cc.y1[i] - cc.y0[i] + 1;
    const w = cc.x1[i] - cc.x0[i] + 1;
    if (h < Math.max(5, 0.004 * H) || h > 0.05 * H || w > 6 * h || cc.area[i] < 8) continue;
    const yc = (cc.y0[i] + cc.y1[i]) / 2;
    if (exclude.some((e) => yc >= e.y0 && yc <= e.y1)) continue;
    items.push({ y0: cc.y0[i], y1: cc.y1[i], x0: cc.x0[i], x1: cc.x1[i] });
  }
  items.sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  let lines = 0;
  let cur: { y0: number; y1: number; n: number; x0: number; x1: number } | null = null;
  const close = (): void => {
    if (cur && cur.n >= 4 && cur.x1 - cur.x0 >= 0.15 * W) lines++;
  };
  for (const it of items) {
    const yc = (it.y0 + it.y1) / 2;
    if (cur && yc >= cur.y0 && yc <= cur.y1) {
      cur.n++;
      cur.x0 = Math.min(cur.x0, it.x0);
      cur.x1 = Math.max(cur.x1, it.x1);
    } else {
      close();
      cur = { y0: it.y0, y1: it.y1, n: 1, x0: it.x0, x1: it.x1 };
    }
  }
  close();
  return lines;
}

/** Classify a page picture (see the file comment). */
export function classifyPage(image: OmrImageInput, opts: ClassifyOptions = {}): PageClassification {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const full = toGray(image);
  const maxSide = opts.maxSide ?? 1800;
  const factor = Math.max(1, Math.ceil(Math.max(full.width, full.height) / maxSide));
  const gray = downscaleInt(full, factor);
  const analysis = analyzePage(gray);
  const { layout, pre } = analysis;
  let notation = 0;
  let tab = 0;
  let ascii = 0;
  for (const st of layout.staves) {
    if (st.kind === 'notation') notation++;
    else {
      const s = lineSolidity(pre.binary, st);
      // Typed dashes: the line breaks at every character (several gaps per staff space).
      if (s.gapsPerSpace > 0.6 && s.ink < 0.85) ascii++;
      else tab++;
    }
  }
  const linkedSystems = layout.systems.filter((sys) => sys.staves.some((i) => layout.staves[i].partner !== null)).length;
  // Text outside the staves (in the reduced page's own coordinates: the normalised page has the
  // same orientation and roughly the same scale for this purpose).
  const exclude = layout.staves.map((st) => {
    const ratio = pre.scale || 1;
    return { y0: st.contentBox.y / ratio, y1: (st.contentBox.y + st.contentBox.h) / ratio };
  });
  const textLines = countTextLines(gray, exclude);
  const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  const meanConf = layout.staves.length ? layout.staves.reduce((a, s) => a + s.kindConfidence * s.confidence, 0) / layout.staves.length : 0;
  const base = { staves: { notation, tab, linkedSystems }, textLines, asciiTab: ascii > 0, ms };
  if (notation && tab) return { ...base, kind: 'both', confidence: round2(meanConf), reason: `Found ${notation} notation and ${tab} tab staves.` };
  if (notation) return { ...base, kind: 'notation', confidence: round2(meanConf), reason: `Found ${notation} notation ${notation === 1 ? 'staff' : 'staves'}.` };
  if (tab) return { ...base, kind: 'tab', confidence: round2(meanConf), reason: `Found ${tab} tab ${tab === 1 ? 'staff' : 'staves'}.` };
  if (ascii) return { ...base, kind: 'text', confidence: 0.8, reason: 'This looks like tab typed with dashes: it reads best as text.' };
  if (textLines >= 3) return { ...base, kind: 'text', confidence: round2(Math.min(0.9, 0.5 + 0.05 * textLines)), reason: `No staff lines, but ${textLines} lines of text: a chord sheet or lyrics.` };
  return { ...base, kind: 'not-music', confidence: textLines ? 0.6 : 0.8, reason: 'No staff lines or lines of text were found on this picture.' };
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

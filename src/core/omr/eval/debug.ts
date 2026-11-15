/**
 * Annotated debug pictures (Node only): draw the ground truth, the detected layout or a
 * recognised page over the image and write a PNG that can be opened and looked at.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GrayImage, Point } from '../image/gray';
import type { PageAnalysis } from '../page';
import type { OmrPage } from '../types';
import { COLORS, Canvas, type Rgb } from './draw';
import { writePng } from './png';
import type { GroundTruth } from './truth';

/** Default directory for dumps: guitar/e2e/out/omr (git-ignored). */
export function dumpDir(): string {
  return join(fileURLToPath(new URL('../../../../', import.meta.url)), 'e2e', 'out', 'omr');
}

/** Scale factor that makes labels readable on small and large pages alike. */
function labelScale(staffSpace: number): number {
  return staffSpace >= 14 ? 2 : 1;
}

/** Draw the ground truth: staff lines (green), bar lines (blue), heads / digits (red), text (purple). */
export function drawTruth(canvas: Canvas, gt: GroundTruth, opts: { labels?: boolean } = {}): void {
  const ls = labelScale(gt.staffSpace);
  for (const sys of gt.systems) {
    for (const st of sys.staves) {
      for (const line of st.lines) canvas.polyline(line, COLORS.green, 1, 0.9);
      for (const b of st.barlines) {
        canvas.line(b.top.x, b.top.y, b.bottom.x, b.bottom.y, COLORS.blue, 1);
        if (opts.labels !== false && b.type !== 'single') canvas.text(b.top.x - 6, b.top.y - 9 * ls, b.type.slice(0, 3), COLORS.blue, ls);
      }
      for (const box of [st.clef?.bbox, st.time?.bbox, st.kind === 'notation' ? st.key?.bbox : null]) {
        if (box) canvas.rect(box[0], box[1], box[2], box[3], COLORS.cyan);
      }
      if (st.kind === 'notation') {
        for (const m of st.measures) {
          for (const e of m.events) {
            if (e.type === 'rest') {
              if (e.head) canvas.rect(e.head[0], e.head[1], e.head[2], e.head[3], COLORS.orange);
              continue;
            }
            for (const n of e.notes) {
              canvas.rect(n.head[0], n.head[1], n.head[2], n.head[3], COLORS.red);
              if (n.accBox) canvas.rect(n.accBox[0], n.accBox[1], n.accBox[2], n.accBox[3], COLORS.magenta);
            }
            for (const d of e.dotBoxes ?? []) canvas.rect(d[0], d[1], d[2], d[3], COLORS.magenta);
            if (e.flagBox) canvas.rect(e.flagBox[0], e.flagBox[1], e.flagBox[2], e.flagBox[3], COLORS.yellow);
          }
        }
      } else {
        for (const m of st.measures) {
          for (const e of m.events) {
            for (const n of e.notes) canvas.rect(n.bbox[0], n.bbox[1], n.bbox[2], n.bbox[3], COLORS.red);
            if (e.type === 'rest' && e.bbox) canvas.rect(e.bbox[0], e.bbox[1], e.bbox[2], e.bbox[3], COLORS.orange);
          }
        }
      }
    }
  }
  for (const t of gt.texts) canvas.rect(t.bbox[0], t.bbox[1], t.bbox[2], t.bbox[3], COLORS.purple);
}

/** Write the image with its ground truth drawn over it. */
export function dumpTruth(path: string, gray: GrayImage, gt: GroundTruth): void {
  const c = Canvas.fromGray(gray, 0.3);
  drawTruth(c, gt);
  writePng(path, c.image());
}

const KIND_COLOR: Record<string, Rgb> = { notation: COLORS.blue, tab: COLORS.orange };

/** Draw a recognised page: staves, bar lines, measures, events with their readings. */
export function drawPage(canvas: Canvas, page: OmrPage, opts: { labels?: boolean } = {}): void {
  const ls = labelScale(page.staffSpace);
  const labels = opts.labels !== false;
  for (const sys of page.systems) {
    canvas.rect(sys.bbox.x, sys.bbox.y, sys.bbox.w, sys.bbox.h, COLORS.grey, 1, 0.6);
    if (labels) canvas.text(sys.bbox.x + 2, sys.bbox.y + 2, `S${sys.index}`, COLORS.grey, ls);
    for (const st of sys.staves) {
      const col = KIND_COLOR[st.kind];
      for (const line of st.geometry.lines) canvas.polyline(line, col, 1, 0.9);
      const cb = st.geometry.contentBox;
      canvas.rect(cb.x, cb.y, cb.w, cb.h, col, 1, 0.35);
      if (labels) {
        const first = st.geometry.lines[0][0];
        canvas.text(first.x, first.y - 9 * ls - 2, `${st.kind} ${st.lineCount}L ${(st.confidence * 100).toFixed(0)}%`, col, ls);
      }
      for (const b of st.barlines) {
        canvas.rect(b.bbox.x, b.bbox.y, b.bbox.w, b.bbox.h, COLORS.red, 1);
        if (labels && b.type !== 'single') canvas.text(b.bbox.x - 4, b.bbox.y + b.bbox.h + 2, b.type.replace('repeat-', 'r'), COLORS.red, ls);
      }
      for (const m of st.measures) {
        if (labels) canvas.text(m.x0 + 3, st.geometry.bbox.y + st.geometry.bbox.h + 2 + (b2(st) ? 9 * ls : 0), `M${m.index}`, COLORS.green, ls);
        for (const e of m.events) {
          if (e.kind === 'chord' || e.kind === 'rest') {
            canvas.rect(e.bbox.x, e.bbox.y, e.bbox.w, e.bbox.h, COLORS.purple, 1, 0.5);
            for (const n of e.notes) {
              canvas.rect(n.bbox.x, n.bbox.y, n.bbox.w, n.bbox.h, COLORS.magenta);
              if (labels) canvas.text(n.bbox.x + n.bbox.w + 1, n.bbox.y, `${n.pitch.step}${n.pitch.alter > 0 ? '#' : n.pitch.alter < 0 ? 'B' : ''}${n.pitch.octave}`, COLORS.magenta, 1);
            }
            if (labels) canvas.text(e.bbox.x, e.bbox.y - 9, `${e.duration.value[0]}${'.'.repeat(e.duration.dots)}`, COLORS.purple, 1);
          } else {
            for (const n of e.notes) {
              canvas.rect(n.bbox.x, n.bbox.y, n.bbox.w, n.bbox.h, COLORS.magenta);
              if (labels) canvas.text(n.bbox.x + n.bbox.w + 1, n.bbox.y, String(n.fret), COLORS.magenta, 1);
            }
          }
        }
      }
    }
    for (const t of sys.texts) canvas.rect(t.bbox.x, t.bbox.y, t.bbox.w, t.bbox.h, COLORS.cyan);
  }
}

function b2(st: { barlines: { type: string }[] }): boolean {
  return st.barlines.some((b) => b.type !== 'single');
}

/** Write a recognised page drawn over the image it was read from. */
export function dumpPage(path: string, gray: GrayImage, page: OmrPage, truth?: GroundTruth | null): void {
  const c = Canvas.fromGray(gray, 0.4);
  if (truth) {
    // Ground truth underneath in thin green so misses are visible.
    for (const sys of truth.systems) for (const st of sys.staves) for (const line of st.lines) c.polyline(line, COLORS.green, 1, 0.5);
  }
  drawPage(c, page);
  writePng(path, c.image());
}

/** Draw polylines (e.g. raw line candidates) for low-level debugging. */
export function dumpPolylines(path: string, gray: GrayImage, groups: { points: Point[]; color?: Rgb }[]): void {
  const c = Canvas.fromGray(gray, 0.5);
  for (const g of groups) c.polyline(g.points, g.color ?? COLORS.red, 1);
  writePng(path, c.image());
}

/**
 * Write the normalised page of an analysis (what the layout stage saw) with the detected staves
 * and bar lines drawn in. `view` picks the image underneath: the flattened grey page, the symbol
 * binary, the line-smoothed binary or the page with staff lines removed.
 */
export function dumpAnalysis(path: string, analysis: PageAnalysis, view: 'gray' | 'binary' | 'lines' | 'strokes' | 'noLines' = 'binary'): void {
  const { pre, layout } = analysis;
  const c = view === 'gray'
    ? Canvas.fromGray(pre.gray, 0.2)
    : Canvas.fromBinary(view === 'binary' ? pre.binary : view === 'lines' ? pre.lineBinary : view === 'strokes' ? pre.strokeBinary : layout.noLines, 70);
  for (const st of layout.staves) {
    const col = KIND_COLOR[st.kind];
    for (let l = 0; l < st.lineCount; l++) c.polyline(Array.from(st.xs).map((x, k) => ({ x, y: st.ys[l][k] })), col, 1, 0.7);
    c.rect(st.contentBox.x, st.contentBox.y, st.contentBox.w, st.contentBox.h, col, 1, 0.3);
    for (const b of st.barlines) c.rect(b.x0, b.yTop, b.x1 - b.x0, b.yBottom - b.yTop, COLORS.red, 1);
    c.text(st.x0, st.ys[0][0] - 10, `${st.index} ${st.kind} ${st.lineCount}L S${st.space.toFixed(1)} ${(st.confidence * 100).toFixed(0)}%`, col, 1);
    if (st.tabClef) c.rect(st.tabClef.x, st.tabClef.y, st.tabClef.w, st.tabClef.h, COLORS.cyan, 1);
  }
  writePng(path, c.image());
}

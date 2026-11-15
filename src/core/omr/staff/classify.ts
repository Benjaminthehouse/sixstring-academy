/**
 * Staff kind: notation or tablature.
 *
 * The line count decides almost always (five lines = notation, six = guitar tab, four = bass tab).
 * The content is used as a cross-check and for the confidence: a tab staff carries small glyphs
 * centred ON its lines (fret digits) and often the letters T-A-B stacked at its start, while a
 * notation staff carries stems and note heads that hang between and across the lines.
 */
import { labelComponents } from '../image/cc';
import { type BinaryImage, cropBinary } from '../image/gray';
import type { BBox, StaffKind } from '../types';
import { type KindEvidence, type StaffGeom, lineYAt } from './model';

/** Result of {@link classifyStaff}. */
export interface StaffClassification {
  kind: StaffKind;
  confidence: number;
  evidence: KindEvidence;
  /** Box of the stacked "TAB" letters when found (page px of the analysed image). */
  tabClef: BBox | null;
}

/**
 * Classify one staff. `noLines` is the page with staff lines removed; `pageSpace` the typical
 * notation staff space of the page.
 */
export function classifyStaff(noLines: BinaryImage, staff: StaffGeom, pageSpace: number): StaffClassification {
  const sp = staff.space;
  const xm = (staff.x0 + staff.x1) / 2;
  const top = lineYAt(staff, 0, xm);
  const bottom = lineYAt(staff, staff.lineCount - 1, xm);
  // Components in a band a little taller than the staff.
  const bx = Math.max(0, Math.floor(staff.x0));
  const by = Math.max(0, Math.floor(Math.min(lineYAt(staff, 0, staff.x0), lineYAt(staff, 0, staff.x1)) - 1.2 * sp));
  const bw = Math.min(noLines.width - bx, Math.ceil(staff.x1 - staff.x0));
  const bh = Math.min(noLines.height - by, Math.ceil(bottom - top + 2.4 * sp + Math.abs(lineYAt(staff, 0, staff.x1) - lineYAt(staff, 0, staff.x0))));
  let digitLike = 0;
  let noteLike = 0;
  let tabLetters = false;
  let tabClef: BBox | null = null;
  if (bw > 4 && bh > 4) {
    const band = cropBinary(noLines, bx, by, bw, bh);
    const cc = labelComponents(band);
    const letters: { x0: number; x1: number; y0: number; y1: number }[] = [];
    for (let c = 1; c <= cc.count; c++) {
      const cw = cc.x1[c] - cc.x0[c] + 1;
      const ch = cc.y1[c] - cc.y0[c] + 1;
      if (cc.area[c] < 0.04 * sp * sp) continue;
      const cx = bx + (cc.x0[c] + cc.x1[c] + 1) / 2;
      const cy = by + (cc.y0[c] + cc.y1[c] + 1) / 2;
      const t = lineYAt(staff, 0, cx);
      const b = lineYAt(staff, staff.lineCount - 1, cx);
      const local = (b - t) / (staff.lineCount - 1);
      // Letters of a TAB clef: within the first few spaces, each one to two spaces tall.
      if (cx - staff.x0 < 4.2 * sp && ch >= 0.7 * local && ch <= 2.3 * local && cw >= 0.5 * local && cw <= 2.6 * local && cy > t - 0.3 * local && cy < b + 0.3 * local) {
        letters.push({ x0: bx + cc.x0[c], x1: bx + cc.x1[c] + 1, y0: by + cc.y0[c], y1: by + cc.y1[c] + 1 });
      }
      if (cx - staff.x0 < 3.5 * sp) continue; // clef area: not content
      const inside = cy > t - 0.6 * local && cy < b + 0.6 * local;
      if (!inside) continue;
      // Distance of the blob centre from the nearest staff line, in spaces.
      const rel = (cy - t) / local;
      const off = Math.abs(rel - Math.round(rel));
      if (ch >= 2.4 * local && cw < 2.5 * local) {
        // A stem with its head, or a bar line (bar lines span the staff exactly and are counted for neither).
        if (!(Math.abs(ch - (b - t)) < 0.5 * local && cw < 0.5 * local)) noteLike++;
      } else if (ch >= 0.45 * local && ch <= 1.25 * local && cw <= 1.7 * local && cw >= 0.15 * local) {
        if (off <= 0.22) digitLike++;
        else if (off >= 0.3) noteLike += 0.5;
      }
    }
    // Three letters stacked: same column, top to bottom, together spanning most of the staff.
    if (letters.length >= 3) {
      letters.sort((a, b) => a.y0 - b.y0);
      for (let i = 0; i + 2 < letters.length && !tabLetters; i++) {
        const tri = [letters[i], letters[i + 1], letters[i + 2]];
        const cxs = tri.map((l) => (l.x0 + l.x1) / 2);
        const spanY = tri[2].y1 - tri[0].y0;
        const aligned = Math.max(...cxs) - Math.min(...cxs) < 0.9 * sp;
        const stacked = tri[1].y0 >= tri[0].y0 + 0.5 * sp && tri[2].y0 >= tri[1].y0 + 0.5 * sp;
        if (aligned && stacked && spanY >= 0.6 * (bottom - top) && spanY <= 1.25 * (bottom - top)) {
          tabLetters = true;
          const x0 = Math.min(...tri.map((l) => l.x0));
          const y0 = tri[0].y0;
          tabClef = { x: x0, y: y0, w: Math.max(...tri.map((l) => l.x1)) - x0, h: tri[2].y1 - y0 };
        }
      }
    }
  }
  const spaceRatio = pageSpace > 0 ? sp / pageSpace : 1;
  const evidence: KindEvidence = { lineCount: staff.lineCount, spaceRatio, tabLetters, digitLike, noteLike };
  const total = digitLike + noteLike;
  const digitShare = total >= 3 ? digitLike / total : 0.5;
  let kind: StaffKind;
  let confidence: number;
  if (staff.lineCount === 6) {
    kind = 'tab';
    confidence = 0.9 + (tabLetters ? 0.07 : 0) + (digitShare - 0.5) * 0.06;
  } else if (staff.lineCount === 4) {
    kind = 'tab';
    confidence = 0.6 + (tabLetters ? 0.25 : 0) + (digitShare - 0.5) * 0.3;
  } else {
    // Five lines: notation unless the content clearly says tab (banjo and some lute tab use five lines).
    const tabLike = tabLetters && digitShare > 0.75;
    kind = tabLike ? 'tab' : 'notation';
    confidence = tabLike ? 0.7 : 0.9 + (0.5 - digitShare) * 0.12 - (tabLetters ? 0.25 : 0);
  }
  return { kind, confidence: Math.max(0.05, Math.min(0.99, confidence)), evidence, tabClef };
}

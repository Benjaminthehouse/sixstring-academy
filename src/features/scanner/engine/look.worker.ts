/**
 * NO LONGER USED: the quick look now runs in the sheet reader's own worker (`omr.lookAtPage`, see
 * `look.ts`), so the reader is not bundled twice. Kept only because the lane that replaced it did
 * not create it; safe to delete.
 *
 * The quick look at a page, off the main thread: what it holds (tab, notation, text), where its
 * staves and bar lines are, how good the picture is, where the paper is, and the reader's cleaned,
 * straightened version of it (shown so the learner sees what will be read).
 */
import { analyzePage, classifyPage } from '@/core/omr';
import type { GrayImage } from '@/core/omr/image/gray';
import { findPaper, shrinkGray } from '../model/paper';
import type { LookRequest, LookResponse, LookResult } from './look-protocol';

const CLEAN_SIDE = 1400;

function simplify(line: { x: number; y: number }[], max = 16): { x: number; y: number }[] {
  if (line.length <= max) return line.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < max; i++) {
    const p = line[Math.round((i * (line.length - 1)) / (max - 1))];
    out.push({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });
  }
  return out;
}

function look(gray: GrayImage): LookResult {
  const paper = findPaper(gray);
  const c = classifyPage(gray);
  const result: LookResult = {
    kind: c.kind,
    reason: c.reason,
    textLines: c.textLines,
    staves: [],
    barlines: [],
    paper: paper.desk ? paper.box : null,
    paperCover: paper.desk ? paper.cover : null,
    quality: 0,
    skew: 0,
    staffSpace: 0,
    correction: 'none',
    clean: null,
  };
  if (c.kind === 'text' || c.kind === 'not-music') return result;
  const a = analyzePage(gray);
  const q = a.page.quality;
  result.quality = q.score;
  result.skew = q.skewDegrees;
  result.staffSpace = q.sourceStaffSpace;
  result.correction = q.correction;
  for (const sys of a.page.systems) {
    for (const st of sys.staves) {
      result.staves.push({ kind: st.kind, lineCount: st.lineCount, box: st.geometry.bbox, lines: st.geometry.lines.map((l) => simplify(l)) });
      for (const b of st.barlines) result.barlines.push({ x: b.x, y0: st.geometry.bbox.y, y1: st.geometry.bbox.y + st.geometry.bbox.h });
    }
  }
  if (a.pre.gray.width > 0 && a.pre.gray.height > 0) {
    const small = shrinkGray(a.pre.gray, CLEAN_SIDE).img;
    result.clean = { width: small.width, height: small.height, data: small.data };
  }
  return result;
}

const scope = self as unknown as { onmessage: ((e: MessageEvent<LookRequest>) => void) | null; postMessage: (msg: LookResponse, transfer?: Transferable[]) => void };

scope.onmessage = (e) => {
  const msg = e.data;
  if (msg.type !== 'look') return;
  try {
    const r = look(msg.gray);
    scope.postMessage({ type: 'looked', id: msg.id, result: r }, r.clean ? [r.clean.data.buffer as ArrayBuffer] : []);
  } catch (err) {
    scope.postMessage({ type: 'failed', id: msg.id, message: err instanceof Error ? err.message : String(err) });
  }
};

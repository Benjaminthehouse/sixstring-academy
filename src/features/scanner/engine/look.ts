/**
 * The quick look at each page, done by the sheet reader's own worker (`omr.lookAtPage`): what the
 * page holds, where its staves, bar lines and paper are, how good the picture is, and the
 * cleaned, straightened page. One worker serves the look and the reading, so the reader ships once.
 */
import type { OmrLook } from '@/core/omr/look';
import type { OmrWorkerClient } from '@/core/omr/worker/client';
import type { GrayImage } from '@/core/omr/image/gray';
import type { LookResult } from './look-protocol';

/** The quick look of the screen. */
export interface Looker {
  look(gray: GrayImage): Promise<LookResult>;
  close(): void;
}

/** Long side of the cleaned page shown in the page review. */
export const CLEAN_SIDE = 1400;

function simplify(line: { x: number; y: number }[], max = 16): { x: number; y: number }[] {
  if (line.length <= max) return line.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < max; i++) {
    const p = line[Math.round((i * (line.length - 1)) / (max - 1))];
    out.push({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });
  }
  return out;
}

/** The screen's view of a look (staff lines thinned out for drawing over the thumbnail). */
export function lookResult(look: OmrLook): LookResult {
  const c = look.classification;
  const result: LookResult = {
    kind: c.kind,
    reason: c.reason,
    textLines: c.textLines,
    staves: [],
    barlines: [],
    paper: look.paper.desk ? look.paper.box : null,
    paperCover: look.paper.desk ? look.paper.cover : null,
    quality: 0,
    skew: 0,
    staffSpace: 0,
    correction: 'none',
    clean: look.clean,
  };
  const page = look.page;
  if (!page) return result;
  result.quality = page.quality.score;
  result.skew = page.quality.skewDegrees;
  result.staffSpace = page.quality.sourceStaffSpace;
  result.correction = page.quality.correction;
  for (const sys of page.systems) {
    for (const st of sys.staves) {
      result.staves.push({ kind: st.kind, lineCount: st.lineCount, box: st.geometry.bbox, lines: st.geometry.lines.map((l) => simplify(l)) });
      for (const b of st.barlines) result.barlines.push({ x: b.x, y0: st.geometry.bbox.y, y1: st.geometry.bbox.y + st.geometry.bbox.h });
    }
  }
  return result;
}

/** A looker on the reader's worker (`client` gives the screen's worker, started on first use). */
export function createLooker(client: () => OmrWorkerClient): Looker {
  let closed = false;
  const once = (gray: GrayImage) => {
    // A copy goes to the worker: the caller keeps its pixels.
    const copy: GrayImage = { width: gray.width, height: gray.height, data: new Uint8Array(gray.data) };
    return client().lookAtPage(copy, { cleanSide: CLEAN_SIDE, transfer: true });
  };
  return {
    async look(gray) {
      if (closed) throw Object.assign(new Error('Closed.'), { name: 'AbortError' });
      try {
        return lookResult(await once(gray));
      } catch (e) {
        // A reading cancelled mid-staff restarts the worker, which drops the looks waiting with it: ask again.
        if (!closed && e instanceof Error && /restarted/.test(e.message)) return lookResult(await once(gray));
        throw e;
      }
    },
    close() {
      closed = true;
    },
  };
}

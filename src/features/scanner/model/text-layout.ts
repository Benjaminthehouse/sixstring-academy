/**
 * Text that arrives as positioned pieces (a PDF's text layer, words found by OCR) rebuilt as plain
 * lines in which horizontal position becomes column position. Chord sheets and ASCII tab depend on
 * that: a chord belongs to the syllable under it, a fret to the dash column it sits in.
 *
 *   const text = layoutText(items);          // items: { text, x, y, w, h } in any units, y down
 *   importSong(text)                         // chord sheet / ASCII tab importers take it from here
 */

/** A piece of text and its box (any units, y grows downward). */
export interface TextPiece {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Options for {@link layoutText}. */
export interface LayoutTextOptions {
  /** Width of one character column (default: measured from the pieces). */
  charWidth?: number;
  /** Leave an empty line where the gap between two lines is at least this many line heights (default 1.7). */
  blankGap?: number;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = values.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Width of one character: the median of width / length over pieces with some length to them. */
export function estimateCharWidth(pieces: TextPiece[]): number {
  const per = pieces.filter((p) => p.text.trim().length >= 2 && p.w > 0).map((p) => p.w / p.text.length);
  if (per.length) return median(per);
  const any = pieces.filter((p) => p.text.length && p.w > 0).map((p) => p.w / p.text.length);
  return median(any) || 1;
}

/** Group pieces into lines (by vertical overlap), top to bottom, each sorted left to right. */
export function groupLines(pieces: TextPiece[]): TextPiece[][] {
  const list = pieces.filter((p) => p.text.length > 0 && Number.isFinite(p.x) && Number.isFinite(p.y)).sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const lineH = median(list.map((p) => p.h)) || 1;
  const lines: { mid: number; items: TextPiece[] }[] = [];
  for (const p of list) {
    const mid = p.y + p.h / 2;
    const last = lines[lines.length - 1];
    if (last && Math.abs(mid - last.mid) <= lineH * 0.45) {
      last.items.push(p);
      last.mid = (last.mid * (last.items.length - 1) + mid) / last.items.length;
    } else lines.push({ mid, items: [p] });
  }
  return lines.map((l) => l.items.sort((a, b) => a.x - b.x));
}

/** Rebuild plain text with columns from positioned pieces (see the file comment). */
export function layoutText(pieces: TextPiece[], opts: LayoutTextOptions = {}): string {
  const lines = groupLines(pieces);
  if (!lines.length) return '';
  const cw = opts.charWidth ?? estimateCharWidth(pieces);
  const left = Math.min(...lines.map((l) => l[0].x));
  const lineH = median(pieces.map((p) => p.h)) || 1;
  const blank = opts.blankGap ?? 1.2;
  const out: string[] = [];
  let prevTop: number | null = null;
  for (const items of lines) {
    const top = Math.min(...items.map((p) => p.y));
    if (prevTop !== null && top - prevTop >= lineH * (1 + blank) - 1e-9) out.push('');
    let line = '';
    let prevEnd = -Infinity;
    for (const p of items) {
      const text = p.text.trim();
      if (!text) continue;
      if (line.length && p.x - prevEnd < cw * 0.35) {
        // Touching pieces are one word split by the producer.
        line += text;
      } else {
        const col = Math.max(0, Math.round((p.x - left) / cw));
        line = col > line.length ? line.padEnd(col, ' ') + text : line + (line.length ? ' ' : '') + text;
      }
      prevEnd = p.x + p.w;
    }
    out.push(line.replace(/\s+$/, ''));
    prevTop = top;
  }
  return out.join('\n');
}

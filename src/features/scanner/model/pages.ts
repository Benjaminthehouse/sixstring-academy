/**
 * The pages of one sheet, in reading order: photos, PDF pages and pasted text, each with what the
 * quick look found. Several pages make one song; the learner can reorder, rotate, crop, retake or
 * remove them. Pure list operations and the plain words the page cards show.
 */
import type { BBox } from '@/core/omr/types';

/** What a page holds (from the quick look). */
export type PageKind = 'tab' | 'notation' | 'both' | 'text' | 'not-music';

/** Where a page came from. */
export type PageOrigin = 'camera' | 'photo' | 'pdf' | 'sample';

/** The quick look at a page. */
export interface PageLook {
  kind: PageKind;
  /** Staves found, with their boxes in page px (for the overlay). */
  staves: { kind: 'tab' | 'notation'; lineCount: number; box: BBox; lines: { x: number; y: number }[][] }[];
  /** Bar lines found, page px (x, top, bottom). */
  barlines: { x: number; y0: number; y1: number }[];
  /** The paper (when a desk shows around it). */
  paper: BBox | null;
  /** 0..1, the reader's view of the picture. */
  quality: number;
  /** Degrees of rotation corrected. */
  skew: number;
  /** Staff space of the picture, px. */
  staffSpace: number;
  /** One plain sentence ("Six lines of tab and notation, sharp and straight."). */
  summary: string;
  /** Advice when the picture could be better, or null. */
  advice: string | null;
}

/** One page of the sheet. */
export interface ScanPage {
  id: string;
  /** "Photo 1", "song.pdf, page 2". */
  label: string;
  origin: PageOrigin;
  width: number;
  height: number;
  /** Small picture for the tray (object URL). */
  thumbUrl: string;
  /** The working picture (object URL). */
  url: string;
  /** Text found in a PDF's text layer (a typed chord sheet or tab), when it reads as one. */
  pdfText?: string;
  /** null while the quick look runs. */
  look: PageLook | null;
  /** The quick look failed (a sentence). */
  lookError?: string;
}

/** Move the page at `from` to index `to`. */
export function movePage<T>(pages: readonly T[], from: number, to: number): T[] {
  const out = pages.slice();
  if (from < 0 || from >= out.length) return out;
  const [p] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, p);
  return out;
}

/** Replace the page with this id. */
export function replacePage(pages: readonly ScanPage[], id: string, next: ScanPage): ScanPage[] {
  return pages.map((p) => (p.id === id ? next : p));
}

/** What the pages hold together: the kind that decides how they are read. */
export function sheetKind(pages: readonly ScanPage[]): 'music' | 'text' | 'unknown' | 'empty' {
  if (!pages.length) return 'empty';
  const looks = pages.map((p) => (p.pdfText ? 'text' : p.look?.kind ?? null));
  if (looks.some((k) => k === null)) return 'unknown';
  if (looks.some((k) => k === 'tab' || k === 'notation' || k === 'both')) return 'music';
  if (looks.some((k) => k === 'text')) return 'text';
  return 'unknown';
}

/** Name of a page's kind for its card. */
export function kindLabel(kind: PageKind): string {
  switch (kind) {
    case 'tab':
      return 'Tab';
    case 'notation':
      return 'Notation';
    case 'both':
      return 'Notation and tab';
    case 'text':
      return 'Chords or text tab';
    default:
      return 'No music found';
  }
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** The card's sentence and advice from what the quick look measured. */
export function describeLook(input: { kind: PageKind; tab: number; notation: number; quality: number; skew: number; staffSpace: number; paperCover: number | null; textLines?: number }): { summary: string; advice: string | null } {
  const { kind, tab, notation } = input;
  let summary: string;
  if (kind === 'text') summary = input.textLines ? `${plural(input.textLines, 'line')} of text: chords, lyrics or typed tab.` : 'Text: chords, lyrics or typed tab.';
  else if (kind === 'not-music') summary = 'No staff lines found on this picture.';
  else {
    const parts: string[] = [];
    if (notation) parts.push(plural(notation, 'notation staff', 'notation staves'));
    if (tab) parts.push(plural(tab, 'tab staff', 'tab staves'));
    summary = `${parts.join(' and ')} found.`;
  }
  let advice: string | null = null;
  if (kind === 'not-music') advice = 'Retake it flat and close enough that the staff lines are clear, or try another page.';
  else if (kind !== 'text') {
    if (input.staffSpace > 0 && input.staffSpace < 7) advice = 'The music is small in the picture: move closer or use a higher resolution.';
    else if (input.quality < 0.45) advice = 'The picture is soft or dim: retake it in good light, held steady, for a much better reading.';
    else if (input.paperCover !== null && input.paperCover < 0.6) advice = 'The page fills little of the picture: crop to the sheet, or move closer.';
    else if (Math.abs(input.skew) > 6) advice = 'The page is quite tilted: it was straightened, but a straighter photo reads better.';
  }
  return { summary, advice };
}

/** Render scale for a PDF page so its staves come out about `targetSpace` px apart (when the staff space at scale 1 is known). */
export function pdfScale(page: { width: number; height: number }, opts: { staffSpaceAt1?: number; targetSpace?: number; maxSide?: number; minScale?: number } = {}): number {
  const maxSide = opts.maxSide ?? 3400;
  const target = opts.targetSpace ?? 18;
  // Without a measurement: about 250 dpi (PDF units are 1/72 inch).
  let scale = opts.staffSpaceAt1 && opts.staffSpaceAt1 > 0 ? target / opts.staffSpaceAt1 : 250 / 72;
  scale = Math.max(opts.minScale ?? 150 / 72, scale);
  const long = Math.max(page.width, page.height);
  if (long * scale > maxSide) scale = maxSide / long;
  return scale;
}

/** Position choices for music read from notation only (no tab printed): where on the neck to play it. */
export const POSITIONS: { id: string; label: string; hint: string; prefer: number }[] = [
  { id: 'open', label: 'Open position', hint: 'Low on the neck, open strings where they fit. Easiest to start with.', prefer: 1 },
  { id: 'fifth', label: 'Fifth position', hint: 'Around frets 4 to 8: fewer jumps for melodies that sit higher.', prefer: 5 },
  { id: 'high', label: 'Up the neck', hint: 'Around frets 7 to 12: a warmer sound on the thicker strings.', prefer: 9 },
];

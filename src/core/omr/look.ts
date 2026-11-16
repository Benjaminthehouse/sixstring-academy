/**
 * The quick look at a page, before reading it: what it holds (tab, notation, both, text, nothing),
 * where the paper is in a photo, the layout (systems, staves with their lines, bar lines and
 * measures, no symbols), how good the picture is, and the reader's cleaned, straightened page so a
 * screen can show what will be read. About a second for a phone photo; run it in the worker
 * (`omr.lookAtPage(image, { cleanSide: 1400 })`).
 *
 *   const look = lookAtPage(gray, { cleanSide: 1400 });
 *   look.classification.kind;   // 'tab' | 'notation' | 'both' | 'text' | 'not-music'
 *   look.page?.systems;          // geometry only, in px of the picture
 *   look.clean;                  // GrayImage, long side at most 1400 px (null when not asked or not music)
 */
import { type PageClassification, classifyPage } from './classify-page';
import type { GrayImage } from './image/gray';
import { type PaperArea, findPaper, shrinkGray } from './image/paper';
import { analyzePage } from './page';
import { type OmrImageInput, toGray } from './pipeline';
import type { OmrPage } from './types';

/** What the quick look found. */
export interface OmrLook {
  classification: PageClassification;
  /** The paper in the picture (`desk` true when something else shows around it). */
  paper: PaperArea;
  /** The layout without symbols, in px of the picture; null for text or a page without music. */
  page: OmrPage | null;
  /** The reader's flattened, straightened page, reduced (grey); null when not asked for or not music. */
  clean: GrayImage | null;
}

/** Options for {@link lookAtPage}. */
export interface LookOptions {
  /** Long side of the cleaned page in px (0 or absent: no cleaned page). */
  cleanSide?: number;
  /** Long side the classifier works at (default its own). */
  maxSide?: number;
}

/** Look at a page (see the file comment). */
export function lookAtPage(image: OmrImageInput, opts: LookOptions = {}): OmrLook {
  const gray = toGray(image);
  const paper = findPaper(gray);
  const classification = classifyPage(gray, opts.maxSide ? { maxSide: opts.maxSide } : {});
  if (classification.kind === 'text' || classification.kind === 'not-music') return { classification, paper, page: null, clean: null };
  const analysis = analyzePage(gray);
  let clean: GrayImage | null = null;
  if (opts.cleanSide && analysis.pre.gray.width > 0 && analysis.pre.gray.height > 0) {
    const small = shrinkGray(analysis.pre.gray, opts.cleanSide).img;
    // A copy the caller owns (it may be moved to another thread).
    clean = { width: small.width, height: small.height, data: small.data === analysis.pre.gray.data ? small.data.slice() : small.data };
  }
  return { classification, paper, page: analysis.page, clean };
}

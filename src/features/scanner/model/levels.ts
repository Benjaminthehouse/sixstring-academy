/**
 * A box of a picture made ready for OCR: its paper turned white and its ink black. A phone photo's
 * paper is grey (180-210) and its ink dark grey; cut out and laid on a white strip next to other
 * boxes, the grey paper reads to the OCR as a dark patch and nothing in it is read (measured: none
 * of 8 chord names over a tab staff in a good photo; all of them once levelled). Clean pages and
 * scans are left as they are (their paper is already white).
 */
import type { GrayImage } from '@/core/omr/image/gray';

/** A levelled cut-out (grey, one byte per pixel). */
export interface LevelledCrop {
  x: number;
  y: number;
  width: number;
  height: number;
  data: Uint8Array;
  /** The ink and paper levels found (0..255); equal when the box held nothing to level. */
  ink: number;
  paper: number;
}

/** Below this ink-to-paper contrast the box is taken as blank paper and left alone. */
export const MIN_CONTRAST = 24;

/**
 * Cut out `box` (whole pixels, clipped to the picture) and stretch it so its paper (the 80th
 * percentile) becomes white and its ink (the 5th percentile) black.
 */
export function levelledCrop(gray: GrayImage, box: { x: number; y: number; w: number; h: number }): LevelledCrop {
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const w = Math.max(0, Math.min(gray.width, Math.ceil(box.x + box.w)) - x);
  const h = Math.max(0, Math.min(gray.height, Math.ceil(box.y + box.h)) - y);
  const data = new Uint8Array(w * h);
  const hist = new Uint32Array(256);
  for (let r = 0; r < h; r++) {
    const row = (y + r) * gray.width + x;
    for (let c = 0; c < w; c++) {
      const v = gray.data[row + c];
      data[r * w + c] = v;
      hist[v]++;
    }
  }
  const at = (q: number): number => {
    const target = q * w * h;
    let seen = 0;
    for (let v = 0; v < 256; v++) {
      seen += hist[v];
      if (seen > target) return v;
    }
    return 255;
  };
  const ink = w * h ? at(0.05) : 0;
  const paper = w * h ? at(0.8) : 255;
  if (paper - ink < MIN_CONTRAST) return { x, y, width: w, height: h, data, ink: paper, paper };
  const span = paper - ink;
  for (let i = 0; i < data.length; i++) {
    const v = ((data[i] - ink) * 255) / span;
    data[i] = v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
  }
  return { x, y, width: w, height: h, data, ink, paper };
}

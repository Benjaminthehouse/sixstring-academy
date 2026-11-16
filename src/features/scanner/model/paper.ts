/**
 * Where the sheet of paper is in a photo (the finder itself is part of the sheet reader's quick
 * look, `@/core/omr/image/paper`), and the crop box the page review suggests from it.
 */
import type { BBox } from '@/core/omr/types';

export { type PaperArea, findPaper, otsu, shrinkGray } from '@/core/omr/image/paper';

/** A crop box grown by a margin (px) and kept inside the picture. */
export function padBox(box: BBox, margin: number, width: number, height: number): BBox {
  const x0 = Math.max(0, Math.floor(box.x - margin));
  const y0 = Math.max(0, Math.floor(box.y - margin));
  const x1 = Math.min(width, Math.ceil(box.x + box.w + margin));
  const y1 = Math.min(height, Math.ceil(box.y + box.h + margin));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

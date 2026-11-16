/**
 * Where the sheet of paper is in a photo: the bright, even region, found on a small copy with the
 * ink closed over (so staff lines and notes do not break the paper up). Part of the quick look
 * (`look.ts`): a screen uses it to suggest a crop that leaves the desk out, and to say "move closer"
 * when the page fills too little of the picture.
 *
 *   const p = findPaper(gray);     // { box, cover, desk } in the picture's px
 */
import type { BBox } from '../types';
import type { GrayImage } from './gray';

/** Result of {@link findPaper}. */
export interface PaperArea {
  /** The paper, in px of the picture given. */
  box: BBox;
  /** Share of the picture the paper covers (0..1). */
  cover: number;
  /** Something that is not paper (desk, hand, a book's other page) shows around it. */
  desk: boolean;
}

/** Reduce to at most `maxSide` px on the longer side by averaging blocks. */
export function shrinkGray(img: GrayImage, maxSide: number): { img: GrayImage; scale: number } {
  const f = Math.max(1, Math.ceil(Math.max(img.width, img.height) / maxSide));
  if (f === 1) return { img, scale: 1 };
  const w = Math.max(1, Math.floor(img.width / f));
  const h = Math.max(1, Math.floor(img.height / f));
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dy = 0; dy < f; dy++) {
        const row = (y * f + dy) * img.width + x * f;
        for (let dx = 0; dx < f; dx++) s += img.data[row + dx];
      }
      data[y * w + x] = Math.round(s / (f * f));
    }
  }
  return { img: { width: w, height: h, data }, scale: f };
}

/** Grey closing (max then min over a square of radius r): dark strokes thinner than 2r vanish. */
function closeGray(img: GrayImage, r: number): GrayImage {
  const pass = (src: Uint8Array, w: number, h: number, horizontal: boolean, max: boolean): Uint8Array => {
    const out = new Uint8Array(src.length);
    for (let a = 0; a < (horizontal ? h : w); a++) {
      for (let b = 0; b < (horizontal ? w : h); b++) {
        let v = max ? 0 : 255;
        for (let k = -r; k <= r; k++) {
          const c = b + k;
          if (c < 0 || c >= (horizontal ? w : h)) continue;
          const p = horizontal ? src[a * w + c] : src[c * w + a];
          v = max ? Math.max(v, p) : Math.min(v, p);
        }
        out[horizontal ? a * w + b : b * w + a] = v;
      }
    }
    return out;
  };
  const { width: w, height: h } = img;
  let d = pass(img.data, w, h, true, true);
  d = pass(d, w, h, false, true);
  d = pass(d, w, h, true, false);
  d = pass(d, w, h, false, false);
  return { width: w, height: h, data: d };
}

/** Otsu threshold of a grey picture. */
export function otsu(img: GrayImage): number {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < img.data.length; i++) hist[img.data[i]]++;
  const total = img.data.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

function longestRun(flags: boolean[]): [number, number] {
  let best: [number, number] = [0, -1];
  let start = -1;
  for (let i = 0; i <= flags.length; i++) {
    if (i < flags.length && flags[i]) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      if (i - 1 - start > best[1] - best[0]) best = [start, i - 1];
      start = -1;
    }
  }
  return best;
}

/** Find the paper (see the file comment). */
export function findPaper(gray: GrayImage): PaperArea {
  const full: BBox = { x: 0, y: 0, w: gray.width, h: gray.height };
  if (gray.width < 8 || gray.height < 8) return { box: full, cover: 1, desk: false };
  const { img, scale } = shrinkGray(gray, 320);
  const closed = closeGray(img, Math.max(2, Math.round(Math.max(img.width, img.height) / 60)));
  const t = otsu(closed);
  const { width: w, height: h, data } = closed;
  // Mean of each side of the split: little difference means there is only paper (or only desk).
  let hi = 0;
  let hiN = 0;
  let lo = 0;
  let loN = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] > t) {
      hi += data[i];
      hiN++;
    } else {
      lo += data[i];
      loN++;
    }
  }
  const contrast = hiN && loN ? hi / hiN - lo / loN : 0;
  if (contrast < 40 || hiN < data.length * 0.15 || loN < data.length * 0.03) return { box: full, cover: 1, desk: false };
  const rows: boolean[] = [];
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (data[y * w + x] > t) n++;
    rows.push(n / w > 0.35);
  }
  const [r0, r1] = longestRun(rows);
  const cols: boolean[] = [];
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = r0; y <= r1; y++) if (data[y * w + x] > t) n++;
    cols.push(r1 >= r0 && n / (r1 - r0 + 1) > 0.5);
  }
  const [c0, c1] = longestRun(cols);
  if (r1 < r0 || c1 < c0) return { box: full, cover: 1, desk: false };
  const x0 = Math.max(0, c0 * scale);
  const y0 = Math.max(0, r0 * scale);
  const x1 = Math.min(gray.width, (c1 + 1) * scale);
  const y1 = Math.min(gray.height, (r1 + 1) * scale);
  const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  const cover = (box.w * box.h) / (gray.width * gray.height);
  return { box, cover, desk: cover < 0.97 };
}

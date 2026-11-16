/**
 * Pictures of pages in the browser: a photo or a rendered PDF page becomes a working picture
 * (upright, at most a few thousand pixels, kept as an encoded Blob so several pages do not fill a
 * phone's memory), a thumbnail, and on demand the grey pixels the reader works on.
 */
import { loadImage } from '@/core/platform';
import type { GrayImage } from '@/core/omr/image/gray';
import type { BBox } from '@/core/omr/types';

/** Longest side of a working picture: enough for a staff space of 15-25 px on a phone photo of a page. */
export const MAX_SIDE = 3000;
const THUMB_SIDE = 420;

/** A canvas that works here (off-screen when available). */
export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/** A 2D canvas of a size. */
export function makeCanvas(width: number, height: number): AnyCanvas {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Its 2D context. */
export function ctx2d(canvas: AnyCanvas): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const c = canvas.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!c) throw new Error('This browser cannot draw pictures (no 2D canvas).');
  return c;
}

/** Encode a canvas. */
export async function toBlob(canvas: AnyCanvas, type = 'image/jpeg', quality = 0.9): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => (canvas as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be encoded.'))), type, quality));
}

/** Draw `source` scaled to fit `maxSide`. */
export function fitted(source: CanvasImageSource, width: number, height: number, maxSide: number): AnyCanvas {
  const s = Math.min(1, maxSide / Math.max(width, height));
  const canvas = makeCanvas(width * s, height * s);
  const c = ctx2d(canvas);
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** A page picture ready for the tray and the reader. */
export interface PagePicture {
  blob: Blob;
  /** The thumbnail, encoded (kept with an unsaved scan). */
  thumbBlob: Blob;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
}

/** Turn a canvas into a page picture (PNG for clean renders, JPEG for photos). */
export async function pictureFromCanvas(canvas: AnyCanvas, kind: 'photo' | 'render'): Promise<PagePicture> {
  const blob = await toBlob(canvas, kind === 'render' ? 'image/png' : 'image/jpeg', 0.92);
  const thumb = fitted(canvas as unknown as CanvasImageSource, canvas.width, canvas.height, THUMB_SIDE);
  const thumbBlob = await toBlob(thumb, 'image/jpeg', 0.8);
  return { blob, thumbBlob, url: URL.createObjectURL(blob), thumbUrl: URL.createObjectURL(thumbBlob), width: canvas.width, height: canvas.height };
}

/** A photo or picture file as a page picture (upright, at most MAX_SIDE). */
export async function pictureFromFile(file: Blob, kind: 'photo' | 'render' = 'photo'): Promise<PagePicture> {
  const img = await loadImage(file);
  try {
    const canvas = fitted(img.source as CanvasImageSource, img.width, img.height, MAX_SIDE);
    return await pictureFromCanvas(canvas, kind);
  } finally {
    img.release();
  }
}

/** Decode a page picture to a canvas. */
export async function canvasOf(blob: Blob): Promise<AnyCanvas> {
  const img = await loadImage(blob);
  try {
    const canvas = makeCanvas(img.width, img.height);
    ctx2d(canvas).drawImage(img.source as CanvasImageSource, 0, 0);
    return canvas;
  } finally {
    img.release();
  }
}

/** Grey pixels of a canvas (what the reader takes). */
export function grayOfCanvas(canvas: AnyCanvas): GrayImage {
  const { width, height } = canvas;
  const rgba = ctx2d(canvas).getImageData(0, 0, width, height).data;
  const data = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < data.length; i += 4, j++) data[j] = (77 * rgba[i] + 150 * rgba[i + 1] + 29 * rgba[i + 2] + 128) >> 8;
  return { width, height, data };
}

/** Grey pixels of a page picture. */
export async function grayOf(blob: Blob): Promise<GrayImage> {
  return grayOfCanvas(await canvasOf(blob));
}

/** A grey picture as a canvas. */
export function canvasOfGray(img: GrayImage): AnyCanvas {
  const canvas = makeCanvas(img.width, img.height);
  const c = ctx2d(canvas);
  const out = c.createImageData(img.width, img.height);
  for (let i = 0, j = 0; j < img.data.length; i += 4, j++) {
    const v = img.data[j];
    out.data[i] = v;
    out.data[i + 1] = v;
    out.data[i + 2] = v;
    out.data[i + 3] = 255;
  }
  c.putImageData(out, 0, 0);
  return canvas;
}

/** A page picture cropped to a box. */
export async function cropPicture(blob: Blob, box: BBox, kind: 'photo' | 'render'): Promise<PagePicture> {
  const src = await canvasOf(blob);
  const canvas = makeCanvas(box.w, box.h);
  ctx2d(canvas).drawImage(src as unknown as CanvasImageSource, box.x, box.y, box.w, box.h, 0, 0, canvas.width, canvas.height);
  return pictureFromCanvas(canvas, kind);
}

/** A page picture turned a quarter turn (clockwise with `dir` 1). */
export async function rotatePicture(blob: Blob, dir: 1 | -1, kind: 'photo' | 'render'): Promise<PagePicture> {
  const src = await canvasOf(blob);
  const canvas = makeCanvas(src.height, src.width);
  const c = ctx2d(canvas);
  c.translate(canvas.width / 2, canvas.height / 2);
  c.rotate((dir * Math.PI) / 2);
  c.drawImage(src as unknown as CanvasImageSource, -src.width / 2, -src.height / 2);
  return pictureFromCanvas(canvas, kind);
}

/** Free the object URLs of a picture. */
export function releasePicture(p: { url?: string; thumbUrl?: string }): void {
  if (p.url) URL.revokeObjectURL(p.url);
  if (p.thumbUrl && p.thumbUrl !== p.url) URL.revokeObjectURL(p.thumbUrl);
}

/**
 * Web Worker entry for the fretboard tracker. `VisionPipeline` (pipeline.ts) creates it with
 *   new Worker(new URL('./vision.worker.ts', import.meta.url), { type: 'module' })
 * and speaks `VisionRequest` / `VisionResponse` (see protocol.ts). One tracker per worker.
 *
 * Frames arrive either as raw RGBA (`frame`) or as an `ImageBitmap` already shrunk to the working
 * size (`bitmap`): the bitmap is read back here, on an OffscreenCanvas, so the main thread never
 * waits for pixels.
 */
import { createVisionHost, type VisionRequest } from './protocol';
import type { Frame } from './types';

interface WorkerScope {
  onmessage: ((event: MessageEvent<VisionRequest>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

let canvas: OffscreenCanvas | null = null;
let context: OffscreenCanvasRenderingContext2D | null = null;

function canReadBitmaps(): boolean {
  try {
    if (typeof OffscreenCanvas === 'undefined') return false;
    const probe = new OffscreenCanvas(2, 2);
    return probe.getContext('2d', { willReadFrequently: true }) !== null;
  } catch {
    return false;
  }
}

function decodeBitmap(bitmap: ImageBitmap, width: number, height: number): Frame {
  if (!canvas || !context || canvas.width !== width || canvas.height !== height) {
    canvas = new OffscreenCanvas(width, height);
    context = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
    if (!context) throw new Error('no 2d context in the worker');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'medium';
  }
  context.drawImage(bitmap, 0, 0, width, height);
  const image = context.getImageData(0, 0, width, height);
  return { data: image.data, width, height };
}

const bitmaps = canReadBitmaps();
const handle = createVisionHost({}, bitmaps ? { decodeBitmap } : {});
scope.onmessage = (event) => {
  scope.postMessage(handle(event.data));
};
scope.postMessage({ type: 'ready', bitmaps });

/**
 * Web Worker entry for the fretboard tracker. `VisionPipeline` (pipeline.ts) creates it with
 *   new Worker(new URL('./vision.worker.ts', import.meta.url), { type: 'module' })
 * and speaks `VisionRequest` / `VisionResponse` (see protocol.ts). One tracker per worker.
 *
 * Frames arrive as a camera `VideoFrame` (`video-frame`: shrunk and read here, so the main thread
 * only wraps the frame), as an `ImageBitmap` already shrunk to the working size (`bitmap`: read
 * back here), or as raw RGBA (`frame`). Both images go through one OffscreenCanvas.
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

/** Can this worker draw a transferred camera frame (WebCodecs `VideoFrame`) on its canvas? */
function canReadVideoFrames(): boolean {
  return typeof VideoFrame === 'function' && canReadBitmaps();
}

/** Draw an image (a shrunk bitmap, or a full camera frame shrunk on the way) at the working size and read its pixels. */
function decodeBitmap(bitmap: ImageBitmap | VideoFrame, width: number, height: number): Frame {
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
const videoFrames = canReadVideoFrames();
const handle = createVisionHost({}, { ...(bitmaps ? { decodeBitmap } : {}), ...(videoFrames ? { decodeVideoFrame: decodeBitmap } : {}) });
scope.onmessage = (event) => {
  scope.postMessage(handle(event.data));
};
scope.postMessage({ type: 'ready', bitmaps, videoFrames });

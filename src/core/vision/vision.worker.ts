/**
 * Web Worker entry for the fretboard tracker. `VisionPipeline` (pipeline.ts) creates it with
 *   new Worker(new URL('./vision.worker.ts', import.meta.url), { type: 'module' })
 * and speaks `VisionRequest` / `VisionResponse` (see protocol.ts). One tracker per worker.
 *
 * Frames arrive as a camera `VideoFrame` (`video-frame`: the main thread only wraps the frame), as
 * an `ImageBitmap` already shrunk to the working size (`bitmap`: read back here), or as raw RGBA
 * (`frame`). A `VideoFrame` is copied out plane by plane and averaged down to the working size in
 * plain code (`frame-copy.ts`: about 3.5 ms for 1280x720 I420, against 6-8 ms for drawing it on a
 * canvas); a format that code cannot read is drawn on the OffscreenCanvas instead.
 */
import { canReadRaw, rawToRgba } from './frame-copy';
import { createVisionHost, type VisionRequest, type VisionResponse } from './protocol';
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

/** Can this worker read a transferred camera frame (WebCodecs `VideoFrame`)? */
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

/** Buffers reused from frame to frame (one frame in flight at a time). */
let planes: Uint8Array | null = null;

/** The camera frame's planes, copied out and averaged down to the working size; null when its format is not one `rawToRgba` reads. */
async function copyVideoFrame(frame: VideoFrame, width: number, height: number): Promise<Frame | null> {
  if (!canReadRaw(frame.format) || typeof frame.copyTo !== 'function') return null;
  const size = frame.allocationSize();
  if (!planes || planes.length < size) planes = new Uint8Array(size);
  const buffer = planes.length === size ? planes : planes.subarray(0, size);
  const layout = await frame.copyTo(buffer);
  const rect = frame.visibleRect;
  const data = rawToRgba(
    { format: frame.format, width: rect?.width ?? frame.displayWidth, height: rect?.height ?? frame.displayHeight, data: buffer, layout, matrix: frame.colorSpace?.matrix ?? null, fullRange: frame.colorSpace?.fullRange ?? null },
    width,
    height,
  );
  return data ? { data, width, height } : null;
}

/** A `video-frame` request: copy the planes out (or draw the frame), then track it like a raw frame. */
async function videoFrameRequest(request: Extract<VisionRequest, { type: 'video-frame' }>): Promise<VisionResponse> {
  const t0 = performance.now();
  let frame: Frame | null = null;
  try {
    frame = await copyVideoFrame(request.frame, request.width, request.height);
  } catch {
    frame = null;
  }
  if (!frame) {
    // Not a layout the copy reads: the host draws it (or says it cannot).
    return handle(request);
  }
  request.frame.close();
  const readMs = performance.now() - t0;
  const response = handle({ type: 'frame', frame, timeMs: request.timeMs, seq: request.seq });
  if (response.type === 'update') response.timing = { ...response.timing, readMs, totalMs: response.timing.totalMs + readMs };
  return response;
}

const bitmaps = canReadBitmaps();
const videoFrames = canReadVideoFrames();
const handle = createVisionHost({}, { ...(bitmaps ? { decodeBitmap } : {}), ...(videoFrames ? { decodeVideoFrame: decodeBitmap } : {}) });
scope.onmessage = (event) => {
  const request = event.data;
  if (request.type === 'video-frame' && videoFrames) {
    void videoFrameRequest(request).then((response) => scope.postMessage(response));
    return;
  }
  scope.postMessage(handle(request));
};
scope.postMessage({ type: 'ready', bitmaps, videoFrames });

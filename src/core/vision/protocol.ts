/**
 * Message protocol between the camera screen and the tracker running in a Web Worker
 * (`vision.worker.ts`). Every message is plain data (structured-clone safe). The host logic lives
 * here, outside the worker entry, so it can be tested in Node and run on the main thread when
 * workers are unavailable. `VisionPipeline` (pipeline.ts) speaks it for you.
 *
 *   worker -> screen: { type: 'ready', bitmaps, videoFrames } (once, when the worker has loaded)
 *   screen -> worker: { type: 'frame', frame, timeMs, seq } (transfer frame.data.buffer)
 *                  or { type: 'video-frame', frame, width, height, timeMs, seq } (transfer the
 *                     VideoFrame; worker only: it is shrunk and read there, so the main thread only
 *                     wraps the camera frame, about 0.1 ms)
 *                  or { type: 'bitmap', bitmap, timeMs, seq } (transfer the ImageBitmap; worker only)
 *   worker -> screen: { type: 'update', update, seq, timing } (one per frame)
 *   screen -> worker: calibrate / confirm-fret / shift-numbering / confirm-numbering / options /
 *                     reset / sample-color / probe, each with an optional `id`
 *   worker -> screen: { type: 'state', ok, state, pose, id }  (one per command)
 *
 * Send the next frame only when the previous `update` has arrived: frames must never queue.
 */
import { sampleMarkerColor, type MarkerColor } from './color-markers';
import { FretboardTracker, type FretboardTrackerOptions, type TrackerState, type TrackerUpdate } from './tracker';
import type { Frame, FretboardPose, Point, Rect } from './types';

/** Tracker settings that can cross the worker boundary (everything but a custom detector). */
export type VisionOptions = Omit<FretboardTrackerOptions, 'detector'>;

/** A message to the vision worker. `id` (commands) and `seq` (frames) are echoed in the answer. */
export type VisionRequest =
  | { type: 'frame'; frame: Frame; timeMs: number; seq?: number }
  | { type: 'bitmap'; bitmap: ImageBitmap; width?: number; height?: number; timeMs: number; seq?: number }
  | { type: 'video-frame'; frame: VideoFrame; width: number; height: number; timeMs: number; seq?: number }
  | { type: 'calibrate'; pose: FretboardPose; timeMs?: number; id?: number }
  | { type: 'confirm-fret'; point: Point; fret: number; id?: number }
  | { type: 'confirm-numbering'; id?: number }
  | { type: 'shift-numbering'; delta: number; id?: number }
  | { type: 'options'; options: Partial<VisionOptions>; id?: number }
  | { type: 'reset'; id?: number }
  | { type: 'sample-color'; point: Point; radius?: number; id?: number }
  | { type: 'probe'; rect: Rect | null; id?: number };

/** Where the time of one frame went, in ms. */
export interface FrameTiming {
  /** Turning the transferred bitmap or video frame into pixels at the working size (0 for raw frames). */
  readMs: number;
  /** `FretboardTracker.update`. */
  trackMs: number;
  /** Both, plus the host's own bookkeeping. */
  totalMs: number;
}

/** A small copy of the working frame (test and debugging aid, see the 'probe' request). */
export interface FrameProbe {
  width: number;
  height: number;
  /** RGBA. */
  data: Uint8ClampedArray;
}

/** A message from the vision worker. */
export type VisionResponse =
  | { type: 'ready'; bitmaps: boolean; videoFrames?: boolean }
  | { type: 'update'; update: TrackerUpdate; seq?: number; width: number; height: number; timing: FrameTiming; probe?: FrameProbe }
  | { type: 'state'; ok: boolean; state: TrackerState; pose: FretboardPose | null; id?: number; color?: MarkerColor | null }
  | { type: 'error'; message: string; id?: number; seq?: number };

/** What the host needs from its environment. */
export interface VisionHostEnvironment {
  /** Turn a transferred bitmap into an RGBA frame of the given size (the worker supplies one with an OffscreenCanvas). */
  decodeBitmap?: (bitmap: ImageBitmap, width: number, height: number) => Frame;
  /** Shrink a transferred camera frame to the given size and read its RGBA pixels (the worker supplies one where WebCodecs exists). */
  decodeVideoFrame?: (frame: VideoFrame, width: number, height: number) => Frame;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** The error a host answers when it cannot read a transferred `VideoFrame` (the pipeline then sends bitmaps). */
export const VIDEO_FRAMES_UNREADABLE = 'this host cannot read video frames; send bitmaps';

/** Copy the part of `frame` under `rect` (fractions of the frame, 0..1). */
function probeOf(frame: Frame, rect: Rect): FrameProbe | undefined {
  const x0 = Math.max(0, Math.floor(rect.x * frame.width));
  const y0 = Math.max(0, Math.floor(rect.y * frame.height));
  const x1 = Math.min(frame.width, Math.ceil((rect.x + rect.width) * frame.width));
  const y1 = Math.min(frame.height, Math.ceil((rect.y + rect.height) * frame.height));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return undefined;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) data.set(frame.data.subarray(((y0 + y) * frame.width + x0) * 4, ((y0 + y) * frame.width + x1) * 4), y * w * 4);
  return { width: w, height: h, data };
}

/** The worker's message handler around one tracker: request in, response out. Never throws. */
export function createVisionHost(options: VisionOptions = {}, env: VisionHostEnvironment = {}): (request: VisionRequest) => VisionResponse {
  const tracker = new FretboardTracker(options);
  let last: Frame | null = null;
  let probe: Rect | null = null;
  const state = (ok: boolean, id: number | undefined, extra: { color?: MarkerColor | null } = {}): VisionResponse => ({ type: 'state', ok, state: tracker.state, pose: tracker.pose, id, ...extra });
  const runFrame = (frame: Frame, timeMs: number, seq: number | undefined, readMs: number, t0: number): VisionResponse => {
    last = frame;
    const t1 = now();
    const update = tracker.update(frame, timeMs);
    const t2 = now();
    const out: VisionResponse = { type: 'update', update, seq, width: frame.width, height: frame.height, timing: { readMs, trackMs: t2 - t1, totalMs: t2 - t0 } };
    if (probe) out.probe = probeOf(frame, probe);
    return out;
  };
  return (request) => {
    const id = 'id' in request ? request.id : undefined;
    try {
      switch (request.type) {
        case 'frame':
          return runFrame(request.frame, request.timeMs, request.seq, 0, now());
        case 'bitmap': {
          const t0 = now();
          const bitmap = request.bitmap;
          if (!env.decodeBitmap) {
            bitmap.close?.();
            return { type: 'error', message: 'this host cannot read bitmaps; send frames', seq: request.seq };
          }
          let frame: Frame;
          try {
            frame = env.decodeBitmap(bitmap, request.width ?? bitmap.width, request.height ?? bitmap.height);
          } finally {
            bitmap.close?.();
          }
          return runFrame(frame, request.timeMs, request.seq, now() - t0, t0);
        }
        case 'video-frame': {
          const t0 = now();
          const source = request.frame;
          if (!env.decodeVideoFrame) {
            source.close?.();
            return { type: 'error', message: VIDEO_FRAMES_UNREADABLE, seq: request.seq };
          }
          let frame: Frame;
          try {
            frame = env.decodeVideoFrame(source, request.width, request.height);
          } catch {
            return { type: 'error', message: VIDEO_FRAMES_UNREADABLE, seq: request.seq };
          } finally {
            source.close?.();
          }
          return runFrame(frame, request.timeMs, request.seq, now() - t0, t0);
        }
        case 'calibrate':
          tracker.calibrate(request.pose, request.timeMs);
          return state(true, id);
        case 'confirm-fret':
          return state(tracker.confirmFret(request.point, request.fret), id);
        case 'confirm-numbering':
          return state(tracker.confirmNumbering(), id);
        case 'shift-numbering':
          return state(tracker.shiftNumbering(request.delta), id);
        case 'options':
          tracker.setOptions(request.options);
          return state(true, id);
        case 'reset':
          tracker.reset();
          return state(true, id);
        case 'sample-color': {
          const color = last ? sampleMarkerColor(last, request.point, request.radius) : null;
          return state(color !== null, id, { color });
        }
        case 'probe':
          probe = request.rect;
          return state(true, id);
        default:
          return { type: 'error', message: `unknown request ${(request as { type?: unknown }).type}`, id };
      }
    } catch (e) {
      return { type: 'error', message: e instanceof Error ? e.message : String(e), id, seq: 'seq' in request ? request.seq : undefined };
    }
  };
}

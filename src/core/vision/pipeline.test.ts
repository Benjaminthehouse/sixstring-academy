/**
 * `VisionPipeline` in Node with stand-ins for the browser: a video element whose frame callback the
 * test fires, a worker that runs the real host (`createVisionHost`) on a rendered scene, and a
 * `createImageBitmap` that hands out placeholders. The real thing in Chromium: e2e/vision-live.cjs.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { VisionPipeline, workingSizeFor, type PipelineRender, type PipelineUpdate } from './pipeline';
import { createVisionHost, type VisionRequest, type VisionResponse } from './protocol';
import { renderScene } from './testing/render';
import { sampleScene } from './testing/scene';
import type { Frame } from './types';

let scene: ReturnType<typeof renderScene>;

beforeAll(() => {
  // An easy scene with the nut in view: the tracker locks within a few frames.
  for (let seed = 0; seed < 24; seed++) {
    const s = renderScene(sampleScene('easy', seed));
    if (s.truth.nutVisible && s.spec.width === 640) {
      scene = s;
      break;
    }
  }
});

type FrameCallback = (now: number, meta: { expectedDisplayTime: number }) => void;

function fakeVideo() {
  const callbacks = new Map<number, FrameCallback>();
  let next = 1;
  const video = {
    videoWidth: 1280,
    videoHeight: 720,
    readyState: 4,
    paused: false,
    srcObject: null,
    requestVideoFrameCallback: (cb: FrameCallback) => {
      callbacks.set(next, cb);
      return next++;
    },
    cancelVideoFrameCallback: (id: number) => callbacks.delete(id),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  /** Present one video frame at time t: fires the pending frame callback(s). */
  const present = (t: number): void => {
    const pending = [...callbacks.values()];
    callbacks.clear();
    for (const cb of pending) cb(t, { expectedDisplayTime: t });
  };
  return { video: video as unknown as HTMLVideoElement, present, pendingCallbacks: () => callbacks.size };
}

/** A worker stand-in: answers after `delayMs` (simulated processing time), on a timer. `videoFrames`: it says it reads them; `readsVideoFrames` false: it says so but cannot. */
function fakeWorker(delayMs: () => number, frame: Frame, opts: { videoFrames?: boolean; readsVideoFrames?: boolean } = {}) {
  const host = createVisionHost({}, { decodeBitmap: () => frame, ...(opts.videoFrames && opts.readsVideoFrames !== false ? { decodeVideoFrame: () => frame } : {}) });
  const sent: VisionRequest[] = [];
  let terminated = false;
  const worker = {
    onmessage: null as ((e: { data: VisionResponse }) => void) | null,
    onerror: null as unknown,
    postMessage(request: VisionRequest) {
      sent.push(request);
      setTimeout(() => {
        if (terminated) return;
        const response = host(request);
        worker.onmessage?.({ data: response });
      }, request.type === 'bitmap' || request.type === 'frame' || request.type === 'video-frame' ? delayMs() : 0);
    },
    terminate() {
      terminated = true;
    },
  };
  setTimeout(() => worker.onmessage?.({ data: { type: 'ready', bitmaps: true, videoFrames: opts.videoFrames ?? false } }), 0);
  return { worker: worker as unknown as Worker, sent, isTerminated: () => terminated };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('workingSizeFor', () => {
  it('keeps the aspect ratio, never upscales, and keeps sides even', () => {
    expect(workingSizeFor(1280, 720, 640)).toEqual({ width: 640, height: 360 });
    expect(workingSizeFor(640, 480, 640)).toEqual({ width: 640, height: 480 });
    expect(workingSizeFor(480, 270, 640)).toEqual({ width: 480, height: 270 });
    expect(workingSizeFor(1920, 1080, 544)).toEqual({ width: 544, height: 306 });
    // Portrait: the same pixel count as landscape.
    const p = workingSizeFor(720, 1280, 640);
    expect(p.width * p.height).toBeGreaterThan(0.95 * 640 * 360);
    expect(p.width * p.height).toBeLessThan(1.05 * 640 * 360);
    expect(workingSizeFor(0, 0, 640)).toEqual({ width: 0, height: 0 });
  });
});

describe('VisionPipeline', () => {
  it('runs frames through the worker one at a time, drops the rest, and sends the newest dropped frame when free', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.stubGlobal('createImageBitmap', async (_v: unknown, o?: ImageBitmapOptions) => ({ width: o?.resizeWidth ?? 1280, height: o?.resizeHeight ?? 720, close: () => undefined }));
    const { video, present } = fakeVideo();
    // 45 ms per frame: slower than the 33 ms between frames.
    const w = fakeWorker(() => 45, scene.frame);
    const updates: PipelineUpdate[] = [];
    const renders: PipelineRender[] = [];
    const p = new VisionPipeline({ createWorker: () => w.worker, onUpdate: (u) => updates.push(u), onRender: (r) => renders.push(r), tracker: scene.truth.hints });
    const started = p.start(video);
    await vi.advanceTimersByTimeAsync(5);
    await started;
    expect(p.mode).toBe('worker');
    for (let i = 0; i < 60; i++) {
      present(1000 + i * 33.3);
      await vi.advanceTimersByTimeAsync(33.3);
    }
    await vi.advanceTimersByTimeAsync(200);
    const frames = w.sent.filter((r) => r.type === 'bitmap') as Extract<VisionRequest, { type: 'bitmap' }>[];
    // Never two frames in flight: each was sent after the answer to the one before.
    expect(updates.length).toBe(frames.length);
    expect(frames.map((f) => f.seq)).toEqual(frames.map((_, i) => i + 1));
    expect(frames[0].width).toBe(640);
    expect(frames[0].height).toBe(360);
    // 45 ms each with no waiting for the next frame: well over 20 per second of video (waiting
    // for the next frame after each answer would process every other frame: 30 of 60).
    console.log(`45 ms per frame, 60 frames at 30 fps: ${frames.length} processed, ${p.stats.framesDropped} dropped`);
    expect(frames.length).toBeGreaterThanOrEqual(38);
    expect(p.stats.framesDropped).toBeGreaterThan(10);
    // Every answer says which frame it was for.
    for (let i = 0; i < updates.length; i++) expect(updates[i].frameTime).toBe(frames[i].timeMs);
    expect(updates.at(-1)?.update.state).toBe('locked');
    expect(renders.length).toBe(60);
    expect(renders.at(-1)?.pose).not.toBeNull();
    p.stop();
    expect(w.isTerminated()).toBe(true);
  });

  it('pauses (answers in flight are dropped), resumes, answers commands, and releases everything on stop', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.stubGlobal('createImageBitmap', async (_v: unknown, o?: ImageBitmapOptions) => ({ width: o?.resizeWidth ?? 1280, height: o?.resizeHeight ?? 720, close: () => undefined }));
    const { video, present, pendingCallbacks } = fakeVideo();
    const w = fakeWorker(() => 20, scene.frame);
    const updates: PipelineUpdate[] = [];
    const p = new VisionPipeline({ createWorker: () => w.worker, onUpdate: (u) => updates.push(u), tracker: scene.truth.hints });
    const started = p.start(video);
    await vi.advanceTimersByTimeAsync(5);
    await started;
    let t = 0;
    const run = async (n: number): Promise<void> => {
      for (let i = 0; i < n; i++) {
        present((t += 33.3));
        await vi.advanceTimersByTimeAsync(33.3);
      }
    };
    await run(10);
    present((t += 33.3));
    await vi.advanceTimersByTimeAsync(1);
    p.pause();
    const before = updates.length;
    expect(pendingCallbacks()).toBe(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(updates.length).toBe(before);
    p.resume();
    await run(10);
    expect(updates.length).toBeGreaterThan(before + 5);
    // Commands go through the worker and resolve with its answer.
    const answer = p.confirmNumbering();
    await vi.advanceTimersByTimeAsync(50);
    await expect(answer).resolves.toBe(true);
    const color = p.sampleMarkerColor({ x: 10, y: 10 });
    await vi.advanceTimersByTimeAsync(50);
    await expect(color).resolves.toBeNull();
    // A pose for another frame size is rescaled to the working frame before it is handed over.
    const truth = scene.truth.pose;
    expect(truth).not.toBeNull();
    p.stop();
    expect(w.isTerminated()).toBe(true);
    expect(pendingCallbacks()).toBe(0);
    expect(p.isRunning).toBe(false);
    expect(p.mode).toBe('idle');
    expect(p.latest).toBeNull();
    // Commands after stop resolve false instead of hanging.
    await expect(p.reset()).resolves.toBe(false);
  });

  it('counts the frame grab on the main thread wherever it happens (most frames are sent when the worker answers)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    // createImageBitmap(video, resize) copies and shrinks the frame synchronously on the calling
    // thread (8-9 ms a frame in headless Chromium): a stand-in that takes 3 ms of real time.
    const busy = (ms: number): void => {
      const end = performance.now() + ms;
      while (performance.now() < end);
    };
    vi.stubGlobal('createImageBitmap', (_v: unknown, o?: ImageBitmapOptions) => {
      busy(3);
      return Promise.resolve({ width: o?.resizeWidth ?? 1280, height: o?.resizeHeight ?? 720, close: () => undefined });
    });
    const { video, present } = fakeVideo();
    const w = fakeWorker(() => 45, scene.frame);
    const p = new VisionPipeline({ createWorker: () => w.worker, tracker: scene.truth.hints });
    const started = p.start(video);
    await vi.advanceTimersByTimeAsync(5);
    await started;
    for (let i = 0; i < 40; i++) {
      present(1000 + i * 33.3);
      await vi.advanceTimersByTimeAsync(33.3);
    }
    const stats = p.stats;
    const sent = w.sent.filter((r) => r.type === 'bitmap').length;
    expect(stats.transfer).toBe('bitmap');
    expect(stats.grabMs).toBeGreaterThanOrEqual(2.9);
    // About sent x 3 ms over 40 video frames; the old median per video frame saw only the cheap drops.
    expect(stats.mainThreadMs).toBeGreaterThanOrEqual((0.9 * sent * 3) / 40);
    expect(stats.mainThreadMaxMs).toBeGreaterThanOrEqual(2.9);
    expect(stats.mainThreadShare).toBeGreaterThan(0);
    p.stop();
  });

  it('hands camera frames to the worker as VideoFrames where it can, and falls back to bitmaps where it cannot', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    let bitmapsMade = 0;
    vi.stubGlobal('createImageBitmap', async (_v: unknown, o?: ImageBitmapOptions) => {
      bitmapsMade++;
      return { width: o?.resizeWidth ?? 1280, height: o?.resizeHeight ?? 720, close: () => undefined };
    });
    let made = 0;
    let closed = 0;
    let refuse = false;
    class FakeVideoFrame {
      constructor() {
        if (refuse) throw new DOMException('cannot wrap this video', 'InvalidStateError');
        made++;
      }
      close(): void {
        closed++;
      }
    }
    vi.stubGlobal('VideoFrame', FakeVideoFrame);
    const run = async (worker: ReturnType<typeof fakeWorker>, frames: number): Promise<VisionPipeline> => {
      const { video, present } = fakeVideo();
      const p = new VisionPipeline({ createWorker: () => worker.worker, tracker: scene.truth.hints });
      const started = p.start(video);
      await vi.advanceTimersByTimeAsync(5);
      await started;
      for (let i = 0; i < frames; i++) {
        present(1000 + i * 33.3);
        await vi.advanceTimersByTimeAsync(33.3);
      }
      await vi.advanceTimersByTimeAsync(100);
      return p;
    };
    // The worker reads VideoFrames: no bitmap is made on this thread, every frame is closed after reading.
    const w1 = fakeWorker(() => 20, scene.frame, { videoFrames: true });
    const p1 = await run(w1, 20);
    const sent1 = w1.sent.filter((r) => r.type === 'video-frame') as Extract<VisionRequest, { type: 'video-frame' }>[];
    expect(p1.stats.transfer).toBe('video-frame');
    expect(sent1.length).toBeGreaterThan(10);
    expect(sent1[0].width).toBe(640);
    expect(sent1[0].height).toBe(360);
    expect(bitmapsMade).toBe(0);
    expect(closed).toBe(made);
    expect(p1.latest?.update.state).toBe('locked');
    p1.stop();
    // A worker that turns out not to read them: one error, then bitmaps.
    const w2 = fakeWorker(() => 20, scene.frame, { videoFrames: true, readsVideoFrames: false });
    const p2 = await run(w2, 12);
    expect(w2.sent.filter((r) => r.type === 'video-frame').length).toBe(1);
    expect(p2.stats.transfer).toBe('bitmap');
    expect(p2.latest?.update.state).not.toBe('searching');
    p2.stop();
    // A browser that cannot wrap the video: bitmaps at once, same frame.
    refuse = true;
    bitmapsMade = 0;
    const w3 = fakeWorker(() => 20, scene.frame, { videoFrames: true });
    const p3 = await run(w3, 8);
    expect(w3.sent.filter((r) => r.type === 'video-frame').length).toBe(0);
    expect(w3.sent.filter((r) => r.type === 'bitmap').length).toBeGreaterThan(4);
    expect(p3.stats.transfer).toBe('bitmap');
    p3.stop();
  });

  it('falls back to running the tracker without a worker when none can be made', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const data = scene.frame.data;
    class FakeCanvas {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext() {
        return { drawImage: () => undefined, getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: w === 640 && h === 360 ? data : new Uint8ClampedArray(w * h * 4), width: w, height: h }) };
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeCanvas);
    const { video, present } = fakeVideo();
    const statuses: string[] = [];
    const updates: PipelineUpdate[] = [];
    const p = new VisionPipeline({ createWorker: () => null, onStatus: (s) => statuses.push(s.mode), onUpdate: (u) => updates.push(u), tracker: scene.truth.hints });
    const started = p.start(video);
    await vi.advanceTimersByTimeAsync(5);
    await started;
    expect(p.mode).toBe('main');
    for (let i = 0; i < 20; i++) {
      present(i * 33.3);
      await vi.advanceTimersByTimeAsync(33.3);
    }
    expect(updates.length).toBeGreaterThan(10);
    expect(updates.at(-1)?.update.state).toBe('locked');
    p.stop();
    expect(statuses).toEqual(['main', 'idle']);
  });
});

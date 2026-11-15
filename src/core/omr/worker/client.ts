/**
 * The page side of the OMR worker: the same calls as the pipeline, run in a module worker so a
 * full page never blocks the UI.
 *
 *   const omr = createOmrWorker();                       // one per screen; terminate() on unmount
 *   const page = await omr.recognizePage(imageData, { onProgress: setProgress, signal });
 *   const kind = await omr.classifyPage(imageData);
 *
 * Cancelling (`signal`) asks the worker to stop between staves; if it has not stopped within
 * `cancelGraceMs` (a staff can take a second on a slow phone) the worker is terminated and a new
 * one is started on the next call. Either way the promise rejects with `OmrCancelledError`.
 * `ai` (an `OmrVisionModel`) is called on the page thread when a recognizer asks for a second
 * opinion; `createOmrWorker({ worker: 'inline' })` runs everything in this thread (tests, Node).
 */
import type { PageClassification } from '../classify-page';
import { type OmrDocument, type OmrImageInput, type OmrProgress, OmrCancelledError } from '../pipeline';
import type { OmrPage, OmrVisionModel } from '../types';
import { type OmrRequest, type OmrResponse, type WorkerRecognizeOptions, createOmrWorkerHandler } from './protocol';

/** The part of `Worker` the client uses (a real Worker, or the inline stand-in). */
export interface OmrWorkerLike {
  postMessage(msg: OmrRequest, transfer?: Transferable[]): void;
  onmessage: ((e: { data: OmrResponse }) => void) | null;
  onerror?: ((e: unknown) => void) | null;
  terminate(): void;
}

/** Options for {@link createOmrWorker}. */
export interface OmrClientOptions {
  /** Make the worker (default: the bundled module worker); `'inline'` runs in this thread. */
  worker?: (() => OmrWorkerLike) | 'inline';
  /** After a cancel, how long the worker may take to stop by itself before it is terminated (ms, default 1000). */
  cancelGraceMs?: number;
}

/** Options of one run. */
export interface OmrRunOptions extends WorkerRecognizeOptions {
  onProgress?: (p: OmrProgress) => void;
  signal?: AbortSignal;
  /** Vision model for the recognizers' second opinions (runs on this thread). */
  ai?: OmrVisionModel | null;
  /** Move the picture's buffer to the worker instead of copying it (the caller's copy becomes unusable). */
  transfer?: boolean;
}

/** What {@link createOmrWorker} returns. */
export interface OmrWorkerClient {
  recognizePage(image: OmrImageInput, options?: OmrRunOptions): Promise<OmrPage>;
  recognizeDocument(images: OmrImageInput[], options?: OmrRunOptions): Promise<OmrDocument>;
  classifyPage(image: OmrImageInput, options?: { maxSide?: number; signal?: AbortSignal; transfer?: boolean }): Promise<PageClassification>;
  /** Stop the worker; runs still going reject as cancelled. */
  terminate(): void;
}

interface Job {
  resolve: (v: Extract<OmrResponse, { type: 'result' }>) => void;
  reject: (e: Error) => void;
  onProgress?: (p: OmrProgress) => void;
  ai?: OmrVisionModel | null;
  signal?: AbortSignal;
}

function defaultWorker(): OmrWorkerLike {
  return new Worker(new URL('./omr.worker.ts', import.meta.url), { type: 'module', name: 'omr' }) as unknown as OmrWorkerLike;
}

/** A stand-in worker that runs the handler on this thread (asynchronously, like a real one). */
function inlineWorker(): OmrWorkerLike {
  const w: OmrWorkerLike = {
    onmessage: null,
    postMessage(msg) {
      setTimeout(() => handler(msg), 0);
    },
    terminate() {
      w.onmessage = null;
    },
  };
  const handler = createOmrWorkerHandler((msg) => setTimeout(() => w.onmessage?.({ data: msg }), 0));
  return w;
}

function buffersOf(images: OmrImageInput[]): Transferable[] {
  return images.map((im) => im.data.buffer as ArrayBuffer);
}

/** Start an OMR worker client (see the file comment). */
export function createOmrWorker(opts: OmrClientOptions = {}): OmrWorkerClient {
  const make = opts.worker === 'inline' ? inlineWorker : opts.worker ?? defaultWorker;
  const grace = opts.cancelGraceMs ?? 1000;
  let worker: OmrWorkerLike | null = null;
  let nextId = 1;
  const jobs = new Map<number, Job>();

  const failAll = (err: Error): void => {
    for (const [id, job] of jobs) {
      jobs.delete(id);
      job.reject(err);
    }
  };

  const kill = (): void => {
    if (!worker) return;
    worker.onmessage = null;
    worker.terminate();
    worker = null;
  };

  const onMessage = (msg: OmrResponse): void => {
    const job = jobs.get(msg.id);
    if (!job) return;
    if (msg.type === 'progress') job.onProgress?.(msg.progress);
    else if (msg.type === 'result') {
      jobs.delete(msg.id);
      job.resolve(msg);
    } else if (msg.type === 'error') {
      jobs.delete(msg.id);
      job.reject(msg.name === 'AbortError' ? new OmrCancelledError() : Object.assign(new Error(msg.message), { name: msg.name }));
    } else if (msg.type === 'ai-ask') {
      const answer = (value: unknown): void => worker?.postMessage({ type: 'ai-answer', id: msg.id, askId: msg.askId, value });
      if (!job.ai) answer(null);
      else job.ai.ask(msg.image, msg.prompt, job.signal).then(answer, () => answer(null));
    }
  };

  const ensure = (): OmrWorkerLike => {
    if (worker) return worker;
    const w = make();
    w.onmessage = (e) => onMessage(e.data);
    w.onerror = (e) => {
      const m = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'the reader could not start';
      kill();
      failAll(new Error(`The sheet reader stopped: ${m}`));
    };
    worker = w;
    return w;
  };

  type StartRequest = { type: 'recognize'; images: OmrImageInput[]; document: boolean; options: WorkerRecognizeOptions; ai: boolean } | { type: 'classify'; image: OmrImageInput; maxSide?: number };
  const start = (request: StartRequest, transfer: Transferable[], job: Omit<Job, 'resolve' | 'reject'>): Promise<Extract<OmrResponse, { type: 'result' }>> => {
    if (job.signal?.aborted) return Promise.reject(new OmrCancelledError());
    const id = nextId++;
    const w = ensure();
    return new Promise((resolve, reject) => {
      jobs.set(id, { ...job, resolve, reject });
      const onAbort = (): void => {
        if (!jobs.has(id)) return;
        worker?.postMessage({ type: 'cancel', id });
        setTimeout(() => {
          const pending = jobs.get(id);
          if (!pending) return;
          // Still busy inside a staff: stop the worker; the next call starts a fresh one.
          jobs.delete(id);
          kill();
          pending.reject(new OmrCancelledError());
          failAll(new Error('The sheet reader was restarted.'));
        }, grace);
      };
      job.signal?.addEventListener('abort', onAbort, { once: true });
      w.postMessage({ ...request, id } as OmrRequest, transfer);
    });
  };

  const runOptions = (o: OmrRunOptions): WorkerRecognizeOptions => {
    const { onProgress: _p, signal: _s, ai: _a, transfer: _t, ...rest } = o;
    return rest;
  };

  return {
    async recognizePage(image, options = {}) {
      const r = await start({ type: 'recognize', images: [image], document: false, options: runOptions(options), ai: !!options.ai }, options.transfer ? buffersOf([image]) : [], options);
      return r.page as OmrPage;
    },
    async recognizeDocument(images, options = {}) {
      const r = await start({ type: 'recognize', images, document: true, options: runOptions(options), ai: !!options.ai }, options.transfer ? buffersOf(images) : [], options);
      return r.document as OmrDocument;
    },
    async classifyPage(image, options = {}) {
      const r = await start({ type: 'classify', image, maxSide: options.maxSide }, options.transfer ? buffersOf([image]) : [], { signal: options.signal });
      return r.classification as PageClassification;
    },
    terminate() {
      kill();
      failAll(new OmrCancelledError());
    },
  };
}

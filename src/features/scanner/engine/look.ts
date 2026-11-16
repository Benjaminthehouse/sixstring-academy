/**
 * Client of the quick-look worker: one worker per screen, requests answered in order, everything
 * rejected (and the worker stopped) on `close()`.
 */
import type { GrayImage } from '@/core/omr/image/gray';
import type { LookRequest, LookResponse, LookResult } from './look-protocol';

/** The quick look of the screen. */
export interface Looker {
  look(gray: GrayImage): Promise<LookResult>;
  close(): void;
}

/** Start the quick-look worker (lazily, on the first request). */
export function createLooker(): Looker {
  let worker: Worker | null = null;
  let next = 1;
  const jobs = new Map<number, { resolve: (r: LookResult) => void; reject: (e: Error) => void }>();
  const failAll = (e: Error) => {
    for (const [, j] of jobs) j.reject(e);
    jobs.clear();
  };
  const ensure = (): Worker => {
    if (worker) return worker;
    const w = new Worker(new URL('./look.worker.ts', import.meta.url), { type: 'module', name: 'scan-look' });
    w.onmessage = (e: MessageEvent<LookResponse>) => {
      const msg = e.data;
      const job = jobs.get(msg.id);
      if (!job) return;
      jobs.delete(msg.id);
      if (msg.type === 'looked') job.resolve(msg.result);
      else job.reject(new Error(msg.message));
    };
    w.onerror = (e) => {
      w.terminate();
      worker = null;
      failAll(new Error(`The page could not be looked at: ${e.message || 'the helper stopped'}`));
    };
    worker = w;
    return w;
  };
  return {
    look(gray) {
      const id = next++;
      const w = ensure();
      return new Promise<LookResult>((resolve, reject) => {
        jobs.set(id, { resolve, reject });
        // A copy goes to the worker: the caller keeps its pixels.
        const copy = new Uint8Array(gray.data);
        const msg: LookRequest = { type: 'look', id, gray: { width: gray.width, height: gray.height, data: copy } };
        w.postMessage(msg, [copy.buffer]);
      });
    },
    close() {
      worker?.terminate();
      worker = null;
      failAll(Object.assign(new Error('Closed.'), { name: 'AbortError' }));
    },
  };
}

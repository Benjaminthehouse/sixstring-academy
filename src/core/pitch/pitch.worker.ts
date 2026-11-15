/**
 * Worker entry: runs the analysis engine off the main thread. Audio normally arrives straight
 * from the AudioWorklet through a transferred MessagePort (so the main thread never touches the
 * samples); `audio` messages on the worker's own channel are accepted too, for the AnalyserNode
 * fallback. Events go back to the page in small batches.
 */
import { type EngineConfigPatch, PitchEngine, type PitchEngineOptions } from './engine';
import type { PitchEvent } from './types';

/** Messages the page (or the audio thread) sends to the worker. */
export type WorkerRequest =
  | { type: 'init'; options: PitchEngineOptions }
  | { type: 'port'; port: MessagePort }
  | { type: 'audio'; samples: Float32Array; frame?: number; time?: number }
  | { type: 'config'; patch: EngineConfigPatch }
  | { type: 'reset' };

/** Messages the worker sends to the page. */
export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'events'; events: PitchEvent[] }
  | { type: 'error'; message: string };

interface WorkerScope {
  postMessage(message: WorkerResponse): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
}

const scope = self as unknown as WorkerScope;
let engine: PitchEngine | null = null;

function send(events: PitchEvent[]): void {
  if (events.length > 0) scope.postMessage({ type: 'events', events });
}

function onAudio(msg: Extract<WorkerRequest, { type: 'audio' }>): void {
  if (!engine) return;
  const time = msg.time ?? (msg.frame !== undefined ? msg.frame / engine.sampleRate : undefined);
  send(engine.process(msg.samples, time));
}

function handle(msg: WorkerRequest): void {
  try {
    switch (msg.type) {
      case 'init':
        engine = new PitchEngine(msg.options);
        scope.postMessage({ type: 'ready' });
        break;
      case 'port':
        msg.port.onmessage = (e: MessageEvent<WorkerRequest>) => handle(e.data);
        break;
      case 'audio':
        onAudio(msg);
        break;
      case 'config':
        if (engine) send(engine.configure(msg.patch));
        break;
      case 'reset':
        if (engine) send(engine.reset());
        break;
    }
  } catch (err) {
    scope.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
}

scope.onmessage = (e) => handle(e.data);

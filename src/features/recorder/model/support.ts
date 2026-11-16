/**
 * Can this browser, on this host, record a take? Decided before anything is asked, so the screen
 * opens in the right state: a Record button, or a plain explanation and what still works.
 */
import type { MediaFailure } from '@/core/platform';
import { pickMimeType } from './takes';

/** The facts that decide it (read from the browser by {@link detectSupport}). */
export interface SupportFacts {
  /** Running inside a Claude artifact (the viewer refuses the microphone). */
  artifact: boolean;
  /** `navigator.mediaDevices.getUserMedia` exists. */
  hasMediaApi: boolean;
  /** https or localhost. */
  secure: boolean;
  /** `MediaRecorder` exists. */
  hasRecorder: boolean;
  /** `MediaRecorder.isTypeSupported`, when there is one. */
  isTypeSupported: ((type: string) => boolean) | null;
}

/** What the recorder can do here. */
export type RecorderSupport =
  | { ok: true; mimeType: string | null }
  /** The microphone itself is out of reach: show `<MediaBlocked reason>`. */
  | { ok: false; kind: 'media'; reason: MediaFailure }
  /** The microphone may work but the browser cannot record it: explain in these words. */
  | { ok: false; kind: 'recorder'; title: string; fix: string };

/** Words for a browser that has a microphone but cannot record. */
export const NO_RECORDER = {
  title: 'This browser cannot record audio',
  fix: 'Recording needs a current Chrome, Edge, Firefox or Safari (14.1 or later). Takes you saved before still play here.',
} as const;

/** Words for a browser that can record, but in no format it can also play back. */
export const NO_FORMAT = {
  title: 'This browser cannot record in a format it can play back',
  fix: 'Recording works in a current Chrome, Edge, Firefox or Safari. Takes you saved before still play here.',
} as const;

/** Decide from the facts. The host comes first: in a Claude artifact nothing else matters. */
export function recorderSupport(f: SupportFacts): RecorderSupport {
  if (f.artifact) return { ok: false, kind: 'media', reason: 'blocked-by-host' };
  if (!f.hasMediaApi) return { ok: false, kind: 'media', reason: 'unsupported' };
  if (!f.secure) return { ok: false, kind: 'media', reason: 'insecure-context' };
  if (!f.hasRecorder) return { ok: false, kind: 'recorder', ...NO_RECORDER };
  // No isTypeSupported at all (very old Safari previews): let the browser choose its own format.
  if (!f.isTypeSupported) return { ok: true, mimeType: null };
  const mimeType = pickMimeType(f.isTypeSupported);
  if (!mimeType) return { ok: false, kind: 'recorder', ...NO_FORMAT };
  return { ok: true, mimeType };
}

/** The facts as this browser has them. */
export function detectSupport(artifact: boolean, secure: boolean): RecorderSupport {
  const g = globalThis as typeof globalThis & { MediaRecorder?: typeof MediaRecorder };
  const recorder = typeof g.MediaRecorder === 'function' ? g.MediaRecorder : null;
  return recorderSupport({
    artifact,
    hasMediaApi: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
    secure,
    hasRecorder: recorder !== null,
    isTypeSupported: recorder && typeof recorder.isTypeSupported === 'function' ? (type) => recorder.isTypeSupported(type) : null,
  });
}

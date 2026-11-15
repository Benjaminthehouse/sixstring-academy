/**
 * Microphone and camera access with typed, user-explainable failures.
 *
 * Features never call getUserMedia directly. They call `requestMic()` / `requestCamera()` and, on
 * failure, show `explainMediaFailure(result)` (the UI kit has a ready-made <MediaBlocked> panel).
 */
import { isArtifact, isSecureContextForMedia } from './env';

export type MediaFailure =
  | 'blocked-by-host' // running inside a Claude artifact: the viewer refuses mic/camera for every page
  | 'insecure-context' // plain http on a non-localhost address
  | 'denied' // the person (or a browser policy) said no
  | 'no-device' // no microphone / camera attached
  | 'in-use' // another app holds the device
  | 'unsupported' // browser has no getUserMedia
  | 'unknown';

export type MediaResult = { ok: true; stream: MediaStream } | { ok: false; reason: MediaFailure; detail?: string };

function classify(err: unknown): MediaFailure {
  const name = (err as { name?: string })?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return isArtifact() ? 'blocked-by-host' : 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no-device';
  if (name === 'NotReadableError' || name === 'AbortError') return 'in-use';
  return 'unknown';
}

async function request(constraints: MediaStreamConstraints): Promise<MediaResult> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return { ok: false, reason: isArtifact() ? 'blocked-by-host' : 'unsupported' };
  }
  if (!isSecureContextForMedia()) return { ok: false, reason: 'insecure-context' };
  try {
    return { ok: true, stream: await navigator.mediaDevices.getUserMedia(constraints) };
  } catch (err) {
    return { ok: false, reason: classify(err), detail: String((err as Error)?.message ?? err) };
  }
}

/**
 * Raw instrument audio: echo cancellation, noise suppression and auto gain are all OFF, because
 * they mangle a guitar signal (they gate sustained notes and bend the pitch the detector sees).
 */
export function requestMic(deviceId?: string): Promise<MediaResult> {
  return request({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    },
    video: false,
  });
}

export interface CameraOptions {
  deviceId?: string;
  /** "user" = laptop/selfie camera (default), "environment" = phone rear camera. */
  facing?: 'user' | 'environment';
  width?: number;
  height?: number;
}

export function requestCamera(opts: CameraOptions = {}): Promise<MediaResult> {
  return request({
    audio: false,
    video: {
      deviceId: opts.deviceId ? { exact: opts.deviceId } : undefined,
      facingMode: opts.deviceId ? undefined : opts.facing ?? 'user',
      width: { ideal: opts.width ?? 1280 },
      height: { ideal: opts.height ?? 720 },
      frameRate: { ideal: 30 },
    },
  });
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop());
}

export async function listDevices(kind: 'audioinput' | 'videoinput'): Promise<MediaDeviceInfo[]> {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === kind);
  } catch {
    return [];
  }
}

/** Plain-language title + what to do about it. `device` is "microphone" or "camera". */
export function explainMediaFailure(reason: MediaFailure, device: 'microphone' | 'camera'): { title: string; fix: string } {
  switch (reason) {
    case 'blocked-by-host':
      return {
        title: `The ${device} is switched off in this viewer`,
        fix: `This copy of Sixstring Academy is running inside Claude, which does not let pages use the ${device}. Open the app from its own address (or install it) to use this feature. Everything that does not need the ${device} works here.`,
      };
    case 'insecure-context':
      return {
        title: `The ${device} needs a secure address`,
        fix: 'Browsers only allow it on https:// addresses or on localhost. Open the app over https, or run it on this device.',
      };
    case 'denied':
      return {
        title: `Permission to use the ${device} was declined`,
        fix: `Allow the ${device} for this site in your browser's address bar (the lock or camera icon), then try again.`,
      };
    case 'no-device':
      return { title: `No ${device} found`, fix: `Plug in or enable a ${device}, then try again.` };
    case 'in-use':
      return { title: `The ${device} is busy`, fix: `Another app or tab is using the ${device}. Close it, then try again.` };
    case 'unsupported':
      return { title: `This browser cannot use the ${device}`, fix: 'Use a current version of Chrome, Edge, Safari or Firefox.' };
    default:
      return { title: `Could not start the ${device}`, fix: 'Try again. If it keeps failing, reload the page.' };
  }
}

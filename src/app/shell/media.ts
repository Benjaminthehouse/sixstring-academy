/**
 * Whether this host can give a screen the microphone and the camera at all, known before asking:
 * a Claude artifact never can, and neither can a page on a plain http address. The hubs use it to
 * mark the screens that will fall back to tapping.
 */
import { isArtifact, isSecureContextForMedia } from '@/core/platform/env';
import type { MediaFailure } from '@/core/platform/media';

/** What the host allows. `reason` says why not, in the vocabulary of `explainMediaFailure`. */
export interface MediaAvailability {
  mic: boolean;
  camera: boolean;
  reason: MediaFailure | null;
}

/** Decide availability from the three facts that matter. Exported for tests. */
export function availabilityFrom(artifact: boolean, secureWithMedia: boolean, hasMediaApi: boolean): MediaAvailability {
  if (artifact) return { mic: false, camera: false, reason: 'blocked-by-host' };
  if (!hasMediaApi) return { mic: false, camera: false, reason: 'unsupported' };
  if (!secureWithMedia) return { mic: false, camera: false, reason: 'insecure-context' };
  return { mic: true, camera: true, reason: null };
}

/** Microphone and camera availability on this host. */
export function mediaAvailability(): MediaAvailability {
  const hasApi = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  return availabilityFrom(isArtifact(), isSecureContextForMedia(), hasApi);
}

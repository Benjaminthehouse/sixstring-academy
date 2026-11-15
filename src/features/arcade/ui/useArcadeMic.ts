import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MediaFailure } from '@/core/platform';
import { PitchTracker } from '@/core/pitch';
import { getAudioContext, getEngine, unlockAudio } from '@/core/audio';
import { micOptions } from '@/core/settings';

/** Microphone state in a round. */
export type MicStatus = 'off' | 'starting' | 'on' | 'failed';

// The "no microphone here" panel is shown once per visit; after that a game quietly uses taps.
let blockedShown = false;

/** Whether the microphone panel was already shown in this visit. */
export function micBlockedShown(): boolean {
  return blockedShown;
}

/** Remember that the panel was shown. */
export function markMicBlockedShown(): void {
  blockedShown = true;
}

/** The microphone API a game gets. */
export interface ArcadeMic {
  status: MicStatus;
  failure: MediaFailure | null;
  /** The running tracker (null until `status` is `on`). */
  tracker: PitchTracker | null;
  /** Open the microphone; resolves null when it is listening, else why it could not. */
  start: () => Promise<MediaFailure | null>;
  stop: () => void;
  /**
   * Seconds between a sound being heard from the speakers and the same moment arriving from the
   * microphone (output plus input latency), to take off note times judged against the click.
   */
  latency: () => number;
}

/**
 * One pitch tracker for the round, on the app's playback clock (so note times line up with the
 * click), started from a tap and released on unmount.
 */
export function useArcadeMic(): ArcadeMic {
  const [status, setStatus] = useState<MicStatus>('off');
  const [failure, setFailure] = useState<MediaFailure | null>(null);
  const [tracker, setTracker] = useState<PitchTracker | null>(null);
  const ref = useRef<PitchTracker | null>(null);
  const release = useRef<(() => void) | null>(null);
  const alive = useRef(true);

  const stop = useCallback(() => {
    ref.current?.stop();
    ref.current = null;
    release.current?.();
    release.current = null;
    if (alive.current) {
      setTracker(null);
      setStatus((s) => (s === 'failed' ? s : 'off'));
    }
  }, []);

  const start = useCallback(async (): Promise<MediaFailure | null> => {
    if (ref.current) return null;
    setStatus('starting');
    setFailure(null);
    await unlockAudio().catch(() => false);
    let ctx: AudioContext | undefined;
    try {
      ctx = getAudioContext() as AudioContext;
    } catch {
      ctx = undefined;
    }
    const t = new PitchTracker({ ...micOptions(), ...(ctx ? { audioContext: ctx } : {}) });
    const res = await t.start();
    if (!alive.current) {
      t.stop();
      return 'unknown';
    }
    if (!res.ok) {
      t.stop();
      const reason: MediaFailure = res.reason === 'audio-failed' ? 'unknown' : res.reason;
      if (res.detail === 'superseded') return reason;
      setFailure(reason);
      setStatus('failed');
      return reason;
    }
    ref.current = t;
    if (ctx) release.current = getEngine().hold();
    t.onStatus((s, fault) => {
      if (s === 'stopped' && fault && alive.current) {
        ref.current = null;
        release.current?.();
        release.current = null;
        setTracker(null);
        setFailure(fault === 'device-lost' ? 'no-device' : 'unknown');
        setStatus('failed');
      }
    });
    setTracker(t);
    setStatus('on');
    return null;
  }, []);

  const latency = useCallback(() => {
    let out = 0;
    try {
      out += getEngine().outputLatency;
    } catch {
      /* no audio engine */
    }
    const inL = ref.current?.info?.inputLatency;
    if (typeof inL === 'number' && Number.isFinite(inL)) out += inL;
    return Math.min(0.3, Math.max(0, out));
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      ref.current?.stop();
      ref.current = null;
      release.current?.();
      release.current = null;
    };
  }, []);

  return useMemo(() => ({ status, failure, tracker, start, stop, latency }), [status, failure, tracker, start, stop, latency]);
}

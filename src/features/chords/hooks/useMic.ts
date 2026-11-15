/**
 * The microphone for the chord screen: one `PitchTracker` with chroma (for chord checking), on the
 * audio engine's own clock so strums line up with the metronome. Started from a tap, stopped when
 * the screen or the activity goes away, and honest about why it could not start.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioContext, getEngine, unlockAudio } from '@/core/audio';
import { PitchTracker } from '@/core/pitch';
import { isArtifact, type MediaFailure } from '@/core/platform';
import { micOptions } from '@/core/settings';

/** Where the microphone is. */
export type MicStatus = 'off' | 'starting' | 'on' | 'failed';

/** The hook's result. */
export interface MicControl {
  status: MicStatus;
  failure: MediaFailure | null;
  /** The running tracker (null unless `status === 'on'`). */
  tracker: PitchTracker | null;
  /** Open the microphone (from a tap). Resolves to the tracker, or null when it failed. */
  start: () => Promise<PitchTracker | null>;
  stop: () => void;
}

/** True where this host can never give the page a microphone (inside the Claude viewer). */
export function micRefusedByHost(): boolean {
  try {
    return isArtifact();
  } catch {
    return false;
  }
}

/** Own one microphone tracker for as long as the component is mounted. */
export function useMic(): MicControl {
  const [status, setStatus] = useState<MicStatus>('off');
  const [failure, setFailure] = useState<MediaFailure | null>(null);
  const [tracker, setTracker] = useState<PitchTracker | null>(null);
  const trackerRef = useRef<PitchTracker | null>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  const offStatusRef = useRef<(() => void) | null>(null);
  const alive = useRef(true);

  const stop = useCallback(() => {
    offStatusRef.current?.();
    offStatusRef.current = null;
    trackerRef.current?.stop();
    trackerRef.current = null;
    releaseRef.current?.();
    releaseRef.current = null;
    if (alive.current) {
      setTracker(null);
      setStatus((s) => (s === 'failed' ? s : 'off'));
    }
  }, []);

  const start = useCallback(async (): Promise<PitchTracker | null> => {
    if (trackerRef.current) return trackerRef.current;
    if (micRefusedByHost()) {
      setFailure('blocked-by-host');
      setStatus('failed');
      return null;
    }
    setFailure(null);
    setStatus('starting');
    let audioContext: AudioContext | undefined;
    try {
      await unlockAudio();
      audioContext = getAudioContext();
      releaseRef.current = getEngine().hold();
    } catch {
      audioContext = undefined;
    }
    const t = new PitchTracker({ ...micOptions(), chroma: true, ...(audioContext ? { audioContext } : {}) });
    trackerRef.current = t;
    const res = await t.start();
    if (!alive.current || trackerRef.current !== t) {
      t.stop();
      return null;
    }
    if (!res.ok) {
      trackerRef.current = null;
      releaseRef.current?.();
      releaseRef.current = null;
      if (res.detail === 'superseded') {
        setStatus('off');
        return null;
      }
      setFailure(res.reason === 'audio-failed' ? 'unknown' : res.reason);
      setStatus('failed');
      return null;
    }
    offStatusRef.current = t.onStatus((s, fault) => {
      if (s === 'stopped' && fault && alive.current) {
        setFailure(fault === 'device-lost' ? 'no-device' : 'unknown');
        setStatus('failed');
        setTracker(null);
        trackerRef.current = null;
        releaseRef.current?.();
        releaseRef.current = null;
      }
    });
    setTracker(t);
    setStatus('on');
    return t;
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      offStatusRef.current?.();
      trackerRef.current?.stop();
      trackerRef.current = null;
      releaseRef.current?.();
      releaseRef.current = null;
    };
  }, []);

  return { status, failure, tracker, start, stop };
}

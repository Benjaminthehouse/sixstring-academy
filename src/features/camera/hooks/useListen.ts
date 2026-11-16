/**
 * "Listen to my guitar": the microphone confirms the note played, so the overlay can flash the
 * right fret green (and the drill and the song's wait mode move on). Started from a tap, stopped
 * when switched off, when the tab is hidden and when the screen goes away. Uses the learner's
 * microphone settings (`micOptions`).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { PitchTracker } from '@/core/pitch';
import type { MediaFailure } from '@/core/platform';
import { micOptions } from '@/core/settings';

/** Where the microphone is. */
export type ListenStatus = 'off' | 'starting' | 'on' | 'failed';

/** The listening microphone. */
export interface Listen {
  status: ListenStatus;
  failure: MediaFailure | null;
  /** Start (from a tap). */
  start: () => Promise<void>;
  stop: () => void;
}

/** `onNote(midi, time)` is called for every new note heard (read from a ref: pass anything). */
export function useListen(onNote: (midi: number) => void): Listen {
  const [status, setStatus] = useState<ListenStatus>('off');
  const [failure, setFailure] = useState<MediaFailure | null>(null);
  const tracker = useRef<PitchTracker | null>(null);
  const handler = useRef(onNote);
  handler.current = onNote;

  const stop = useCallback(() => {
    tracker.current?.stop();
    tracker.current = null;
    setStatus('off');
  }, []);

  const start = useCallback(async () => {
    tracker.current?.stop();
    const t = new PitchTracker({ ...micOptions() });
    tracker.current = t;
    setStatus('starting');
    setFailure(null);
    t.on('noteon', (e) => handler.current(e.midi));
    t.onStatus((s, fault) => {
      if (tracker.current !== t) return;
      if (s === 'stopped' && fault) {
        tracker.current = null;
        setFailure(fault === 'device-lost' ? 'no-device' : 'unknown');
        setStatus('failed');
      }
    });
    const res = await t.start();
    if (tracker.current !== t) return;
    if (!res.ok) {
      if (res.detail === 'superseded') return;
      tracker.current = null;
      setFailure(res.reason === 'audio-failed' ? 'unknown' : res.reason);
      setStatus('failed');
      return;
    }
    setStatus('on');
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && tracker.current) stop();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      tracker.current?.stop();
      tracker.current = null;
    };
  }, [stop]);

  return { status, failure, start, stop };
}

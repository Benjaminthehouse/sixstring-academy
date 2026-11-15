import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaFailure } from '@/core/platform';
import { PitchTracker } from '@/core/pitch';

/** Microphone state for "play it back on your guitar". */
export type MicStatus = 'off' | 'starting' | 'on' | 'failed';

/**
 * Notes played on the learner's guitar, one callback per new note. Notes heard while `ignore()`
 * is true (the app itself is playing, so the speaker is in the microphone) are dropped, and so are
 * notes below B♭2: a knock on the guitar's body reads as F♯2–A2 and the melodies never go there.
 */
export function useMicNotes(onNote: (midi: number) => void, ignore: () => boolean) {
  const [status, setStatus] = useState<MicStatus>('off');
  const [failure, setFailure] = useState<MediaFailure | null>(null);
  const tracker = useRef<PitchTracker | null>(null);
  const onNoteRef = useRef(onNote);
  onNoteRef.current = onNote;
  const ignoreRef = useRef(ignore);
  ignoreRef.current = ignore;

  const stop = useCallback(() => {
    tracker.current?.stop();
    tracker.current = null;
    setStatus('off');
  }, []);

  /** Open the microphone (call from a tap). */
  const start = useCallback(async () => {
    if (tracker.current) return;
    setStatus('starting');
    setFailure(null);
    const t = new PitchTracker();
    const res = await t.start();
    if (!res.ok) {
      t.stop();
      if (res.detail === 'superseded') return;
      setFailure(res.reason === 'audio-failed' ? 'unknown' : res.reason);
      setStatus('failed');
      return;
    }
    tracker.current = t;
    t.on('noteon', (e) => {
      if (ignoreRef.current() || e.midi < 46) return;
      onNoteRef.current(e.midi);
    });
    t.onStatus((s, fault) => {
      if (s === 'stopped' && fault) {
        tracker.current = null;
        setFailure(fault === 'device-lost' ? 'no-device' : 'unknown');
        setStatus('failed');
      }
    });
    setStatus('on');
  }, []);

  useEffect(() => () => tracker.current?.stop(), []);

  return { status, failure, start, stop };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { PitchTracker, waitForNote, type Cancelable, type NoteWaitResult } from '@/core/pitch';
import type { MediaFailure } from '@/core/platform';
import { learnerA4, micOptions } from '@/core/settings';

/** Microphone state for "Play it". */
export type MicStatus = 'off' | 'starting' | 'on' | 'failed';

/**
 * The microphone for "Play it": one pitch tracker for the screen, opened from a tap, closed when
 * the screen goes. `listen` waits for one of the asked pitches; the input level is written straight
 * to an element (`levelRef`), never through React state.
 */
export function useMic() {
  const [status, setStatus] = useState<MicStatus>('off');
  const [failure, setFailure] = useState<MediaFailure | null>(null);
  const tracker = useRef<PitchTracker | null>(null);
  const levelEl = useRef<HTMLElement | null>(null);
  const offLevel = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    offLevel.current?.();
    offLevel.current = null;
    tracker.current?.stop();
    tracker.current = null;
    setStatus('off');
  }, []);

  /** Open the microphone (call from a tap). Resolves true when it is listening. */
  const start = useCallback(async (): Promise<boolean> => {
    if (tracker.current) return true;
    setStatus('starting');
    setFailure(null);
    const t = new PitchTracker({ ...micOptions() });
    const res = await t.start();
    if (!res.ok) {
      t.stop();
      if (res.detail === 'superseded') return false;
      setFailure(res.reason === 'audio-failed' ? 'unknown' : res.reason);
      setStatus('failed');
      return false;
    }
    tracker.current = t;
    offLevel.current = t.on('level', (e) => {
      const el = levelEl.current;
      if (!el) return;
      // -60 dBFS (silence) to -10 dBFS (a loud pluck), as a 0..1 bar.
      const x = Math.max(0, Math.min(1, (e.db + 60) / 50));
      el.style.transform = `scaleX(${x.toFixed(3)})`;
    });
    t.onStatus((s, fault) => {
      if (s === 'stopped' && fault) {
        tracker.current = null;
        setFailure(fault === 'device-lost' ? 'no-device' : 'unknown');
        setStatus('failed');
      }
    });
    setStatus('on');
    return true;
  }, []);

  /** Wait for one of `midis` (exact octave or any). Null when the microphone is not on. */
  const listen = useCallback((midis: readonly number[], octaves: 'exact' | 'any', onWrong: (midi: number) => void): Cancelable<NoteWaitResult> | null => {
    const t = tracker.current;
    if (!t) return null;
    return waitForNote(t, midis, {
      octaves,
      toleranceCents: 45,
      minHoldMs: 80,
      a4: learnerA4(),
      timeoutMs: 30000,
      // Below E2 is no guitar note: a knock or a bump on the desk.
      onWrongNote: (n) => {
        if (n.midi >= 40) onWrong(n.midi);
      },
    });
  }, []);

  /** Attach the input-level bar. */
  const levelRef = useCallback((el: HTMLElement | null) => {
    levelEl.current = el;
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { status, failure, start, stop, listen, levelRef };
}

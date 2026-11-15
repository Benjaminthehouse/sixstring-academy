import { useEffect, useRef, useState } from 'react';
import type { MediaFailure } from '@/core/platform';
import { PitchTracker } from '@/core/pitch';
import { micOptions } from '@/core/settings';
import { MicNotes, type MicStatus } from '../engine/mic';

export type { MicStatus } from '../engine/mic';

/**
 * Notes played on the learner's guitar, one callback per new note, through the learner's chosen
 * microphone, sensitivity and A4. Notes heard while `ignore()` is true (the app itself is playing)
 * are dropped. The microphone is released when the screen goes away, even mid-prompt.
 */
export function useMicNotes(onNote: (midi: number) => void, ignore: () => boolean) {
  const [status, setStatus] = useState<MicStatus>('off');
  const [failure, setFailure] = useState<MediaFailure | null>(null);
  const onNoteRef = useRef(onNote);
  onNoteRef.current = onNote;
  const ignoreRef = useRef(ignore);
  ignoreRef.current = ignore;
  const micRef = useRef<MicNotes | null>(null);
  const mic = () =>
    (micRef.current ??= new MicNotes(() => new PitchTracker({ ...micOptions() }), {
      note: (midi) => onNoteRef.current(midi),
      ignore: () => ignoreRef.current(),
      status: (s, f) => {
        setStatus(s);
        setFailure(f);
      },
    }));

  useEffect(
    () => () => {
      micRef.current?.dispose();
      micRef.current = null;
    },
    [],
  );

  return { status, failure, start: () => mic().start(), stop: () => mic().stop() };
}

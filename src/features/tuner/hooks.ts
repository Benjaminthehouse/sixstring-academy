/**
 * React bindings for the tuner screen: the session (created once, configured from props), the
 * reference-note player, and the microphone permission probe.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { playTone, pluck, unlockAudio, type ToneName } from '@/core/audio';
import { isArtifact } from '@/core/platform';
import { TunerSession, type SessionConfig, type SessionView } from './model/session';
import type { StringTarget } from './model/targets';

/** What the screen passes to the session on every render. */
export interface SessionProps {
  targets: readonly StringTarget[];
  a4: number;
  toleranceCents: number;
  deviceId: string | null;
  preferFlats: boolean;
}

/** The screen's session and its current snapshot. The microphone is released when the screen unmounts. */
export function useTunerSession(props: SessionProps): { session: TunerSession; view: SessionView } {
  const ref = useRef<TunerSession | null>(null);
  if (!ref.current) ref.current = new TunerSession(props);
  const session = ref.current;

  const { targets, a4, toleranceCents, deviceId, preferFlats } = props;
  useEffect(() => {
    const config: SessionConfig = { targets, a4, toleranceCents, deviceId, preferFlats };
    session.configure(config);
  }, [session, targets, a4, toleranceCents, deviceId, preferFlats]);

  // Screens are mounted and unmounted constantly: leaving must always release the microphone.
  // (`stop`, not `dispose`: under StrictMode the effect is replayed on the same session.)
  useEffect(() => () => session.stop(), [session]);

  const view = useSyncExternalStore(session.subscribe, session.getView, session.getView);
  return { session, view };
}

/** What the browser says about microphone permission, without asking for it. */
export type MicPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

/**
 * Ask the Permissions API whether the microphone is already allowed. Never prompts and never
 * throws: browsers without the API (or without the "microphone" name) answer `unknown`.
 */
export async function queryMicPermission(): Promise<MicPermission> {
  if (isArtifact()) return 'denied';
  try {
    const permissions = typeof navigator !== 'undefined' ? navigator.permissions : undefined;
    if (!permissions?.query) return 'unknown';
    const status = await permissions.query({ name: 'microphone' as PermissionName });
    return status.state === 'granted' || status.state === 'denied' || status.state === 'prompt' ? status.state : 'unknown';
  } catch {
    return 'unknown';
  }
}

/** How a reference note sounds. */
export type EarVoice = 'tone' | 'pluck';

/** Options for one reference note. */
export interface ReferencePlay {
  voice: EarVoice;
  /** Keep sounding (steady tone) or keep re-plucking until stopped. */
  loop: boolean;
  /** Play an octave higher: small phone speakers cannot carry the low strings. */
  octaveUp: boolean;
}

/** The reference-note player. */
export interface ReferenceTone {
  /** MIDI number of the note sounding now (before any octave shift), or null. */
  playing: number | null;
  play(midi: number, options: ReferencePlay): void;
  stop(): void;
}

/** Seconds a steady tone sounds when it is not looping. */
const TONE_SECONDS = 4;
/** Seconds between plucks when looping, and how long one pluck counts as "playing". */
const PLUCK_EVERY_S = 2.6;

/**
 * Plays a string's target pitch through the audio engine: a steady tone or a plucked string,
 * once or looping. One note at a time; it stops when the screen unmounts.
 */
export function useReferenceTone(a4: number, guitarTone: string, onChange?: (playing: boolean) => void): ReferenceTone {
  const [playing, setPlaying] = useState<number | null>(null);
  const stopSound = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const stop = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const wasPlaying = stopSound.current !== null;
    stopSound.current?.();
    stopSound.current = null;
    setPlaying(null);
    if (wasPlaying) onChangeRef.current?.(false);
  }, []);

  const play = useCallback(
    (midi: number, options: ReferencePlay) => {
      stop();
      // Called from a tap or key press: this is what lets the browser start audio.
      void unlockAudio();
      const note = midi + (options.octaveUp ? 12 : 0);
      if (options.voice === 'tone') {
        const handle = playTone(note, undefined, { voice: 'reference', a4, velocity: 0.75 });
        stopSound.current = () => handle.stop();
        if (!options.loop) timer.current = setTimeout(stop, TONE_SECONDS * 1000);
      } else {
        let current = pluck(note, undefined, { a4, tone: guitarTone as ToneName, velocity: 0.85, letRing: true });
        stopSound.current = () => current.stop(undefined, 0.08);
        const again = (): void => {
          if (!options.loop) {
            stop();
            return;
          }
          current = pluck(note, undefined, { a4, tone: guitarTone as ToneName, velocity: 0.85, letRing: true });
          timer.current = setTimeout(again, PLUCK_EVERY_S * 1000);
        };
        timer.current = setTimeout(again, PLUCK_EVERY_S * 1000);
      }
      setPlaying(midi);
      onChangeRef.current?.(true);
    },
    [a4, guitarTone, stop],
  );

  useEffect(() => stop, [stop]);
  return { playing, play, stop };
}

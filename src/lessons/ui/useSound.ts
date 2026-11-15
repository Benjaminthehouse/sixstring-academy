/**
 * Playing lesson sounds (`Sound` data -> `soundPlan` -> the audio engine). One player per
 * component: starting a sound stops the one before, unmounting stops everything it started.
 * Must be started from a tap or key press (the audio engine unlocks there).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { audioNow, playClick, pluck, strum, unlockAudio } from '@/core/audio';
import { soundPlan, type SoundPlan } from '../sound';
import type { Sound } from '../types';
import { stretchPlan } from './logic/sound';

/** What is playing: nothing, the sound at speed, or slowly. */
export type SoundSpeed = 'normal' | 'slow';

/** Schedule a plan now. Returns a function that silences it. */
export function schedulePlan(plan: SoundPlan): () => void {
  const t0 = audioNow() + 0.06;
  const handles: Array<{ stop: (when?: number, release?: number) => void }> = [];
  const takeBacks: Array<() => void> = [];
  for (const e of plan.events) {
    if (e.type === 'strum') {
      handles.push(...strum(e.midi, t0 + e.at, { direction: e.direction, articulation: e.muted ? 'dead' : 'normal', duration: e.duration }));
    } else if (e.type === 'click') {
      takeBacks.push(playClick('woodblock', e.accent ? 'accent' : 'beat', t0 + e.at));
    } else {
      for (const m of e.midi) handles.push(pluck(m, t0 + e.at, { duration: e.duration, string: e.string }));
    }
  }
  return () => {
    for (const h of handles) h.stop(undefined, 0.05);
    for (const t of takeBacks) t();
  };
}

/** A sound player for one component. */
export function useSoundPlayer(): {
  playing: SoundSpeed | null;
  play: (sound: Sound | SoundPlan, speed?: SoundSpeed, factor?: number) => void;
  stop: () => void;
} {
  const [playing, setPlaying] = useState<SoundSpeed | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<number | null>(null);
  // Bumped by every play and stop, so a sound whose unlock resolves late is not started after a stop.
  const tokenRef = useRef(0);

  const stop = useCallback(() => {
    tokenRef.current += 1;
    stopRef.current?.();
    stopRef.current = null;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setPlaying(null);
  }, []);

  const play = useCallback(
    (sound: Sound | SoundPlan, speed: SoundSpeed = 'normal', factor = 1.5) => {
      stop();
      const base = 'events' in sound ? sound : soundPlan(sound);
      const plan = speed === 'slow' ? stretchPlan(base, factor) : base;
      setPlaying(speed);
      const token = tokenRef.current;
      void unlockAudio().then(() => {
        if (token === tokenRef.current) stopRef.current = schedulePlan(plan);
      });
      timerRef.current = window.setTimeout(() => {
        stopRef.current = null;
        timerRef.current = null;
        setPlaying(null);
      }, Math.max(400, (plan.duration + 0.1) * 1000));
    },
    [stop],
  );

  useEffect(() => stop, [stop]);
  return { playing, play, stop };
}

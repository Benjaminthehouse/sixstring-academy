/**
 * Playing lesson sounds (`Sound` data -> `soundPlan` -> the audio engine). One player per
 * component: starting a sound stops the one before, unmounting stops everything it started.
 * Must be started from a tap or key press (the audio engine unlocks there).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { audioNow, normalizeClickSet, normalizeTone, playClick, playLineOverChord, pluck, startDrone, strum, unlockAudio, type PhraseNote, type PlayOptions } from '@/core/audio';
import { soundPrefs } from '@/core/settings';
import { soundPlan, type SoundEvent, type SoundPlan } from '../sound';
import type { Sound } from '../types';
import { stretchPlan } from './logic/sound';

/** What is playing: nothing, the sound at speed, or slowly. */
export type SoundSpeed = 'normal' | 'slow';

/** The audio engine's options for a tab note's techniques (bend, vibrato, slides, hammer-on/pull-off). */
export function techniqueOptions(e: SoundEvent): Partial<PlayOptions> {
  const t = e.technique;
  if (!t) return {};
  const opts: Partial<PlayOptions> = {};
  if (t.bend !== undefined) opts.bend = t.release ? { amount: t.bend, release: true } : t.bend;
  if (t.vibrato) opts.vibrato = true;
  if (t.legato) opts.legato = t.legato;
  if (t.slideIn) opts.slideIn = t.slideIn;
  if (t.slideOut) opts.slideOut = t.slideOut;
  return opts;
}

/** The plucked events of a plan as a phrase for the engine (a line to play over a held chord). */
export function planLine(plan: SoundPlan, tone?: PlayOptions['tone']): PhraseNote[] {
  return plan.events
    .filter((e) => e.type === 'pluck')
    .flatMap((e) => e.midi.map((midi) => ({ midi, at: e.at, duration: e.duration, string: e.string, tone, ...techniqueOptions(e) })));
}

/** Schedule a plan now. Returns a function that silences it. */
export function schedulePlan(plan: SoundPlan): () => void {
  const t0 = audioNow() + 0.06;
  // The learner's guitar sound and click (Settings).
  const prefs = soundPrefs();
  const tone = normalizeTone(prefs.guitarTone);
  const click = normalizeClickSet(prefs.clickSound);
  const handles: Array<{ stop: (when?: number, release?: number) => void }> = [];
  const takeBacks: Array<() => void> = [];
  if (plan.drone) {
    // Under the whole sound, on the audio clock: it starts with the first note and fades after the last.
    const drone = startDrone({ root: plan.drone.midi, fifth: plan.drone.fifth, when: t0, duration: plan.duration + 0.4, fadeIn: 0.25, volume: 0.6 });
    handles.push({ stop: () => drone.stop(0.15) });
  }
  if (plan.hold) {
    // A line over a held chord: the engine holds the chord on its own voice while the line plays.
    const phrase = playLineOverChord(plan.hold.midi, planLine(plan, tone), t0, { chordVoice: plan.hold.voice, hold: plan.duration, tone });
    handles.push({ stop: (when) => phrase.stop(when) });
  }
  for (const e of plan.events) {
    if (e.type === 'strum') {
      handles.push(...strum(e.midi, t0 + e.at, { tone, direction: e.direction, articulation: e.muted ? 'dead' : 'normal', duration: e.duration }));
    } else if (e.type === 'click') {
      takeBacks.push(playClick(click, e.accent ? 'accent' : 'beat', t0 + e.at));
    } else if (!plan.hold) {
      for (const m of e.midi) handles.push(pluck(m, t0 + e.at, { tone, duration: e.duration, string: e.string, ...techniqueOptions(e) }));
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

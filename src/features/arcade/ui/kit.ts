/**
 * Small pieces the game components share: a round clock, finding a fretboard cell on the page
 * (for effects), the learner's pitch settings, and marker builders.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PatternNote } from '@/core/guitar';
import type { FretMarker, MusicColor } from '@/ui/music';
import { degreeColor } from '@/ui/music';
import { useMediaQuery } from '@/ui';
import { learnerA4 } from '@/core/settings';
import { audioNow } from '@/core/audio';
import type { Stars } from '../core/scoring';
import { pausableClock, timerBag } from '../core/timers';
import { degreeShort } from '../core/degreeDarts';

/** Seconds the round has run: the clock stands still while `running` is false (a pause). */
export function useRoundClock(running: boolean): () => number {
  const clock = useRef(pausableClock());
  useEffect(() => {
    clock.current.set(running, performance.now());
  }, [running]);
  return useCallback(() => clock.current.seconds(performance.now()), []);
}

/** A pausable stopwatch for a component (milliseconds of `performance.now()`); see `pausableClock`. */
export function usePausableClock(running: boolean): { reset: () => void; seconds: () => number } {
  const clock = useRef(pausableClock());
  const runningRef = useRef(running);
  runningRef.current = running;
  useEffect(() => {
    clock.current.set(running, performance.now());
  }, [running]);
  return useMemo(
    () => ({
      reset: () => {
        clock.current = pausableClock();
        clock.current.set(runningRef.current, performance.now());
      },
      seconds: () => clock.current.seconds(performance.now()),
    }),
    [],
  );
}

/** {@link timerBag} for a component: every timeout still pending is cancelled on unmount. */
export function useLater(): (fn: () => void, ms: number) => void {
  const [bag] = useState(timerBag);
  useEffect(() => bag.clear, [bag]);
  return bag.later;
}

/** True where a keyboard is the likely input (a mouse or trackpad): only then does copy name keys. */
export function useKeyboardHints(): boolean {
  return useMediaQuery('(hover: hover) and (pointer: fine)');
}

/** The cell button for a position inside a board (the boards use position labels). */
export function cellElement(root: Element | null | undefined, pos: { string: number; fret: number }): Element | null {
  if (!root) return null;
  const label = pos.fret === 0 ? `string ${pos.string}, open` : `string ${pos.string}, fret ${pos.fret}`;
  return root.querySelector(`button[aria-label="${label}"]`);
}

/** Options for `waitForNote` that follow the learner's settings. */
export function pitchWaitOptions(anyOctave: boolean): { octaves: 'exact' | 'any'; toleranceCents: number; a4: number; minHoldMs: number } {
  return { octaves: anyOctave ? 'any' : 'exact', toleranceCents: 45, a4: learnerA4(), minHoldMs: 60 };
}

/**
 * Notes below B♭2 that the microphone calls wrong are not counted: a knock on the guitar's body
 * reads as F♯2–A2 (see the pitch module's limits).
 */
export function countsAsWrong(midi: number): boolean {
  return midi >= 46;
}

/** The audio clock now, or 0 without audio. */
export function audioClock(): number {
  try {
    return audioNow();
  } catch {
    return 0;
  }
}

/** A marker for a pattern note. */
export function noteMarker(n: PatternNote, opts: { label?: 'note' | 'degree' | 'none'; color?: MusicColor | 'degree'; state?: FretMarker['state']; root?: boolean; id?: string } = {}): FretMarker {
  const color = opts.color === 'degree' || opts.color === undefined ? degreeColor(n.degree) : opts.color;
  const label = opts.label ?? 'none';
  return {
    string: n.string,
    fret: n.fret,
    id: opts.id,
    note: n.note,
    label: label === 'note' ? n.note : label === 'degree' ? degreeShort(n.degree) : '',
    noteLabel: label === 'note' || undefined,
    color,
    state: opts.state ?? 'normal',
    root: opts.root ?? n.isRoot,
  };
}

/** Headline for a number of stars. */
export const HEADLINES: Record<Stars, string> = { 0: 'Keep at it', 1: 'Nice work', 2: 'Great round', 3: 'Perfect round' };

/** "1.4 s". */
export function secondsText(s: number): string {
  return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
}

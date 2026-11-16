/**
 * Every sound the Reference makes: intervals, chords, scales, a I–IV–V–I, open strings and the
 * tab examples. One thing plays at a time (`useSounder`): starting another sound, or tapping the
 * same one again, stops what was playing. Sounds start from a tap (the play functions unlock audio
 * themselves) in the learner's guitar tone.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { audioNow, normalizeTone, pluck, scheduleVisual, stopAll, strum, unlockAudio, type ToneName } from '@/core/audio';
import { chordVoicings, type Tuning } from '@/core/guitar';
import { SongPlayer, liveOutput, type Song } from '@/core/song';
import { soundPrefs } from '@/core/settings';
import { noteToMidi } from '@/core/theory';

function tone(): ToneName {
  return normalizeTone(soundPrefs().guitarTone, 'steel');
}

/** Notes one after another, letting each ring; returns the seconds it lasts. */
export function playLine(midis: readonly number[], gap = 0.3): number {
  const t0 = audioNow() + 0.05;
  const t = tone();
  midis.forEach((m, i) => pluck(m, t0 + i * gap, { tone: t, velocity: 0.72, duration: gap * 1.6 }));
  return midis.length * gap + 0.6;
}

/** Note names with octaves (`G3`) to MIDI. */
export function lineMidi(notes: readonly string[]): number[] {
  return notes.map((n) => noteToMidi(n));
}

/** An interval: lower note, upper note, then both together. */
export function playInterval(root: number, semitones: number): number {
  const t0 = audioNow() + 0.05;
  const t = tone();
  pluck(root, t0, { tone: t, velocity: 0.75, duration: 0.7 });
  pluck(root + semitones, t0 + 0.7, { tone: t, velocity: 0.75, duration: 0.7 });
  pluck(root, t0 + 1.5, { tone: t, velocity: 0.7, duration: 1.6, string: 5 });
  if (semitones > 0) pluck(root + semitones, t0 + 1.5, { tone: t, velocity: 0.7, duration: 1.6, string: 4 });
  return 3.2;
}

/** The first shape of a chord in a tuning, as MIDI low to high with its strings. */
export function chordShape(symbol: string, tuning: Tuning | string = 'standard'): { midi: number[]; strings: number[] } | null {
  try {
    const v = chordVoicings(symbol, { tuning })[0];
    if (!v) return null;
    const notes = [...v.notes].sort((a, b) => b.string - a.string);
    return { midi: notes.map((n) => n.midi), strings: notes.map((n) => n.string) };
  } catch {
    return null;
  }
}

/** Strum a chord once; returns the seconds it lasts. */
export function strumChord(symbol: string, tuning: Tuning | string = 'standard', when?: number, direction: 'down' | 'up' = 'down'): number {
  const shape = chordShape(symbol, tuning);
  if (!shape) return 0;
  strum(shape.midi, when, { direction, tone: tone(), velocity: direction === 'down' ? 0.8 : 0.6, strings: shape.strings });
  return 2;
}

/**
 * A progression, two strums a chord (down on the beat, up on the "and" of the second), the last
 * chord left ringing. `onStep(i)` fires when chord `i` is heard, and with -1 at the end.
 */
export function playProgression(symbols: readonly string[], tuning: Tuning | string, onStep: (i: number) => void, bpm = 96): number {
  const beat = 60 / bpm;
  const t0 = audioNow() + 0.08;
  symbols.forEach((s, i) => {
    const at = t0 + i * 2 * beat;
    const last = i === symbols.length - 1;
    strumChord(s, tuning, at, 'down');
    if (!last) strumChord(s, tuning, at + 1.5 * beat, 'up');
    scheduleVisual(at, () => onStep(i));
  });
  const total = symbols.length * 2 * beat + 1.2;
  scheduleVisual(t0 + total, () => onStep(-1));
  return total;
}

/** The open strings of a tuning, low to high, then strummed together. */
export function playOpenStrings(midi: readonly number[]): number {
  const t0 = audioNow() + 0.05;
  const t = tone();
  const n = midi.length;
  midi.forEach((m, i) => pluck(m, t0 + i * 0.32, { tone: t, velocity: 0.7, duration: 0.5, string: n - i }));
  const strumAt = t0 + n * 0.32 + 0.15;
  strum([...midi], strumAt, { tone: t, velocity: 0.75, strings: midi.map((_m, i) => n - i) });
  return n * 0.32 + 2.2;
}

/** What is playing now (an id the screen chose) and how to start or stop a sound. */
export interface Sounder {
  playing: string | null;
  /** Start a sound under `id` (or stop it, when it is the one playing). `run` returns its length in seconds. */
  toggle: (id: string, run: () => number | Promise<number>) => void;
  /** Play a tab example (a parsed song) under `id`. */
  toggleSong: (id: string, song: Song) => void;
  stop: () => void;
}

/** One sound at a time for the whole Reference, silenced when the screen goes away. */
export function useSounder(): Sounder {
  const [playing, setPlaying] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const player = useRef<SongPlayer | null>(null);
  const current = useRef<string | null>(null);
  const token = useRef(0);

  const clear = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    if (player.current) {
      try {
        player.current.stop();
        player.current.dispose();
      } catch {
        /* already gone */
      }
      player.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    token.current++;
    clear();
    stopAll();
    current.current = null;
    setPlaying(null);
  }, [clear]);

  const finishAfter = useCallback((id: string, seconds: number, my: number) => {
    timer.current = window.setTimeout(() => {
      if (token.current !== my || current.current !== id) return;
      current.current = null;
      setPlaying(null);
    }, Math.max(200, seconds * 1000));
  }, []);

  const toggle = useCallback(
    (id: string, run: () => number | Promise<number>) => {
      if (current.current === id) {
        stop();
        return;
      }
      token.current++;
      const my = token.current;
      clear();
      stopAll();
      current.current = id;
      setPlaying(id);
      void unlockAudio().then(async () => {
        if (token.current !== my) return;
        const seconds = await run();
        if (token.current !== my) return;
        finishAfter(id, seconds, my);
      });
    },
    [clear, finishAfter, stop],
  );

  const toggleSong = useCallback(
    (id: string, song: Song) => {
      if (current.current === id) {
        stop();
        return;
      }
      token.current++;
      const my = token.current;
      clear();
      stopAll();
      current.current = id;
      setPlaying(id);
      void unlockAudio().then(async () => {
        if (token.current !== my) return;
        const p = new SongPlayer(song, { countInBars: 0, output: liveOutput({ tone: tone() }) });
        player.current = p;
        p.subscribe((e) => {
          if (e.type === 'end' && token.current === my) {
            current.current = null;
            setPlaying(null);
          }
        });
        try {
          await p.prepare();
        } catch {
          /* plays without the pre-render */
        }
        if (token.current !== my) return;
        p.play();
        // A safety net in case the end event never arrives (a suspended context, a closed tab).
        const tempo = song.tempo[0]?.bpm ?? 90;
        finishAfter(id, (song.bars.length * 4 * 60) / tempo + 3, my);
      });
    },
    [clear, finishAfter, stop],
  );

  useEffect(() => () => {
    token.current++;
    clear();
    stopAll();
  }, [clear]);

  return { playing, toggle, toggleSong, stop };
}

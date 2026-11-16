/**
 * A song from the library on the live neck: load it, play it at the chosen tempo (the app's song
 * player, so it sounds), and follow along: the step sounding now is lit, the next one dimmed. While
 * stopped the learner walks through the steps by hand (or by playing them, with the microphone on).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { unlockAudio } from '@/core/audio';
import { useSong, useSongList } from '@/core/library';
import { SongPlayer } from '@/core/song';
import { useRafLoop } from '@/ui';
import { songPlan, stepIndexAt, type SongPlan } from '../model/song';

/** What the screen needs to show and drive a song. */
export interface SongMode {
  /** The song in use (the first built-in song when none is picked). */
  songId: string | null;
  title: string;
  plan: SongPlan | null;
  loading: boolean;
  error: string | null;
  /** Songs to pick from: easiest first. */
  choices: Array<{ id: string; title: string; level: number }>;
  step: number;
  playing: boolean;
  /** Tempo in percent of the written tempo (40-120). */
  tempo: number;
  setTempo: (percent: number) => void;
  /** Written tempo in BPM (quarters per minute). */
  bpm: number;
  toggle: () => Promise<void>;
  /** Step by hand (stops playback). */
  goTo: (index: number) => void;
  next: () => void;
  previous: () => void;
}

/** The song mode for `id` (null = the first built-in song). Active only while `active`. */
export function useSongMode(id: string | null, active: boolean): SongMode {
  const { songs } = useSongList();
  const choices = useMemo(
    () =>
      songs
        .slice()
        .sort((a, b) => Number(a.source !== 'built-in') - Number(b.source !== 'built-in') || a.level - b.level || a.title.localeCompare(b.title))
        .map((s) => ({ id: s.id, title: s.title, level: s.level })),
    [songs],
  );
  const songId = id ?? choices[0]?.id ?? null;
  const { song, listing, error } = useSong(active ? songId : null);
  const plan = useMemo(() => (song && active ? songPlan(song) : null), [song, active]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tempo, setTempoState] = useState(80);
  const player = useRef<SongPlayer | null>(null);

  // A new song starts at its first step, stopped.
  useEffect(() => {
    setStep(0);
    setPlaying(false);
    if (!plan) return;
    return () => {
      player.current?.dispose();
      player.current = null;
    };
  }, [plan]);

  // Leaving song mode stops the music.
  useEffect(() => {
    if (!active) {
      player.current?.stop();
      setPlaying(false);
    }
  }, [active]);

  const ensurePlayer = useCallback((): SongPlayer | null => {
    if (!plan) return null;
    if (!player.current) {
      const p = new SongPlayer(plan.timeline.song, { countInBars: 1 });
      p.subscribe((e) => {
        if (e.type === 'state') setPlaying(e.state === 'playing');
        if (e.type === 'end') {
          setPlaying(false);
          setStep(0);
        }
      });
      player.current = p;
    }
    return player.current;
  }, [plan]);

  const toggle = useCallback(async () => {
    const p = ensurePlayer();
    if (!p || !plan) return;
    if (p.state === 'playing') {
      p.pause();
      return;
    }
    await unlockAudio();
    await p.prepare();
    p.tempoPercent = tempo;
    const at = plan.steps[step];
    if (p.state === 'stopped' || (at && Math.abs(p.position().tick - at.tick) > 1)) p.seek(at ? at.tick : 0);
    p.play();
  }, [ensurePlayer, plan, step, tempo]);

  const setTempo = useCallback((percent: number) => {
    const v = Math.max(40, Math.min(120, Math.round(percent)));
    setTempoState(v);
    if (player.current) player.current.tempoPercent = v;
  }, []);

  const goTo = useCallback(
    (index: number) => {
      if (!plan) return;
      const i = Math.max(0, Math.min(plan.steps.length - 1, index));
      const p = player.current;
      if (p && p.state === 'playing') p.pause();
      p?.seek(plan.steps[i].tick);
      setStep(i);
    },
    [plan],
  );

  // While playing, follow the music (React state only when the step changes).
  useRafLoop(() => {
    const p = player.current;
    if (!p || !plan || p.state !== 'playing') return;
    const pos = p.position();
    if (pos.countIn) return;
    const i = stepIndexAt(plan.steps, pos.tick);
    setStep((s) => (s === i ? s : i));
  }, playing && active);

  useEffect(
    () => () => {
      player.current?.dispose();
      player.current = null;
    },
    [],
  );

  const bpm = plan?.timeline.tempo.points[0]?.bpm ?? 0;
  return {
    songId,
    title: listing?.title ?? song?.meta.title ?? choices.find((c) => c.id === songId)?.title ?? 'Song',
    plan,
    loading: active && !!songId && !song && !error,
    error: error ? error.message : plan === null && song ? 'This song has no notes to show on the neck.' : null,
    choices,
    step,
    playing,
    tempo,
    setTempo,
    bpm,
    toggle,
    goTo,
    next: () => goTo(step + 1),
    previous: () => goTo(step - 1),
  };
}

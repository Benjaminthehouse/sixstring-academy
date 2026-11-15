/**
 * Everything an exercise screen does, in one hook: the part and tempo, the runner (click, guide
 * guitar, cursor), the self-judged ladder, microphone takes and their analysis, the visit's time
 * and the one `recordActivity` it ends with.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pluck, unlockAudio, audioNow, type ToneName, normalizeTone } from '@/core/audio';
import { partSong, songBpm, techniqueSkillId, type ExercisePart, type TechniqueExercise } from '@/content/technique';
import { explainMediaFailure, keepAwake, type MediaFailure } from '@/core/platform';
import { recordActivity, useProgress, usePrefs, type ActivityResult } from '@/core/progress';
import type { Song } from '@/core/song';
import { useLocalState } from '@/ui';
import { tickHealthClock } from '../engine/health-clock';
import { TakeListener, type InputLevel, type TakeData } from '../engine/listen';
import { ExerciseRunner, type RunState } from '../engine/runner';
import { localDay, readRecord, type TechniqueRecord } from '../model/history';
import { afterPass, clampTempo, nudge as nudgeTempo, startTempo, type LadderMove } from '../model/ladder';
import { analyzeLevels } from '../model/levels';
import { analyzeBend, analyzePrebend, analyzeVibrato } from '../model/pitchshape';
import { newVisit, visitActivity, type VisitSession } from '../model/session';
import { analyzeTake, expectedFromSong, type Verdict } from '../model/takes';

const OPEN = [0, 64, 59, 55, 50, 45, 40];

/** What a take found, in one shape for every kind of check. */
export interface TakeView {
  kind: 'notes' | 'onsets' | 'bend' | 'prebend' | 'vibrato' | 'level';
  verdict: Verdict;
  /** 0..100 when the check scores. */
  score: number | null;
  headline: string;
  details: string[];
  noteStates: Record<string, 'hit' | 'miss'> | null;
  /** Bars of a level check, in dBFS. */
  bars?: number[];
  /** What was heard, to play back. */
  heard: Array<{ midi: number; at: number; dur: number }>;
  tempo: number;
}

/** The microphone's state on this screen. */
export type MicState = { kind: 'off' } | { kind: 'starting' } | { kind: 'ready' } | { kind: 'blocked'; reason: MediaFailure };

/** What the screen shows after a pass or a take. */
export interface PassNote {
  verdict: Verdict;
  move: LadderMove;
  tempo: number;
  text: string;
  at: number;
}

function moveText(verdict: Verdict, move: LadderMove, tempo: number): string {
  if (move === 'goal') return verdict === 'clean' ? `Clean at the goal tempo, ${tempo} BPM. That is this exercise done; keep it there or try the next one.` : `At the goal tempo, ${tempo} BPM.`;
  if (move === 'up') return `Clean. Up to ${tempo} BPM.`;
  if (move === 'down') return `Two passes that were not clean yet: back to ${tempo} BPM. Clean first, fast later.`;
  if (move === 'fixed') return verdict === 'clean' ? 'Clean. Do it a few more times to make it yours.' : 'Not yet. Listen to the target again and have another go.';
  if (verdict === 'close') return `Nearly. Stay at ${tempo} BPM for another pass.`;
  return `Not yet. Stay at ${tempo} BPM and play it once more, slowly and loose.`;
}

/** Map a microphone failure to the platform's wording. */
export function micFailure(reason: MediaFailure | 'audio-failed'): MediaFailure {
  return reason === 'audio-failed' ? 'unknown' : reason;
}

/** The exercise screen's state and actions. */
export function useExercise(e: TechniqueExercise) {
  const prefs = usePrefs();
  const skillData = useProgress((s) => s.skills[techniqueSkillId(e.id)]?.data);
  const record = useMemo(() => readRecord(skillData), [skillData]);
  const recordRef = useRef<TechniqueRecord>(record);
  recordRef.current = record;

  const [storedPart, setStoredPart] = useLocalState<string>(`technique.part.${e.id}`, e.parts[0]?.id ?? '');
  const partIndex = Math.max(0, e.parts.findIndex((p) => p.id === storedPart));
  const part: ExercisePart = e.parts[partIndex] ?? e.parts[0];
  const even = part.pulse === 'eighth';

  const [tempo, setTempo] = useState(() => clampTempo(startTempo(e.tempo, record.best), even));
  const song: Song = useMemo(() => partSong(e, part, tempo), [e, part, tempo]);

  const runnerRef = useRef<ExerciseRunner | null>(null);
  if (!runnerRef.current) runnerRef.current = new ExerciseRunner();
  const runner = runnerRef.current;
  const listenerRef = useRef<TakeListener | null>(null);
  if (!listenerRef.current) listenerRef.current = new TakeListener();
  const listener = listenerRef.current;

  const [runState, setRunState] = useState<RunState>('idle');
  const [activity, setActivity] = useState<'idle' | 'practice' | 'demo' | 'take'>('idle');
  const activityRef = useRef(activity);
  activityRef.current = activity;
  const [countIn, setCountIn] = useState<{ beat: number; beats: number } | null>(null);
  const [current, setCurrent] = useState<{ bar: number; beat: number } | null>(null);
  const [guide, setGuide] = useLocalState<boolean>('technique.guide', false);
  const [micWanted, setMicWanted] = useLocalState<boolean>('technique.mic', false);
  const [takeClick, setTakeClick] = useState<boolean>(part.check.kind !== 'onsets' || part.click === 'backbeat' || part.click === 'offbeat');
  const [mic, setMic] = useState<MicState>({ kind: 'off' });
  const [level, setLevel] = useState<InputLevel | null>(null);
  const [take, setTake] = useState<TakeView | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [note, setNote] = useState<PassNote | null>(null);
  const [passes, setPasses] = useState(0);
  const [result, setResult] = useState<ActivityResult | null>(null);

  const visit = useRef<VisitSession>(newVisit(e.id, tempo, Date.now()));
  const missesRef = useRef(0);
  const tempoRef = useRef(tempo);
  tempoRef.current = tempo;
  const exerciseSecRef = useRef(0);
  const [exerciseMin, setExerciseMin] = useState(0);

  // Settings: the click and the guitar sound.
  useEffect(() => runner.setSounds(prefs.sound.clickSound, prefs.sound.guitarTone), [runner, prefs.sound.clickSound, prefs.sound.guitarTone]);

  // The runner follows the part and tempo: a new song when stopped, a tempo change when playing.
  useEffect(() => {
    if (runner.state === 'idle') runner.load(part, song, tempo);
    else runner.setTempo(tempo, song);
  }, [runner, part, song, tempo]);

  useEffect(() => {
    setTakeClick(part.check.kind !== 'onsets' || part.click === 'backbeat' || part.click === 'offbeat');
  }, [part]);

  // How many notes a second: above eight the fretboard does not follow every note.
  const notesPerSec = useMemo(() => {
    const beats = song.tracks[0]?.measures.reduce((n, m) => n + m.beats.length, 0) ?? 0;
    const sec = song.bars.length * (60 / songBpm(part, tempo)) * 4;
    return sec > 0 ? beats / sec : 0;
  }, [song, part, tempo]);
  const followRef = useRef(true);
  followRef.current = notesPerSec <= 8;

  const finishTakeRef = useRef<() => void>(() => undefined);

  useEffect(
    () =>
      runner.subscribe((ev) => {
        if (ev.type === 'state') {
          setRunState(ev.state);
          if (ev.state === 'idle') {
            setCountIn(null);
            setCurrent(null);
            if (activityRef.current === 'take') finishTakeRef.current();
            else setActivity('idle');
          }
        } else if (ev.type === 'countin') setCountIn({ beat: ev.beat, beats: ev.beats });
        else if (ev.type === 'beat') {
          setCountIn(null);
          if (followRef.current) setCurrent({ bar: ev.bar, beat: ev.beat });
        }
      }),
    [runner],
  );

  // Leaving the screen: stop the sound, close the microphone, record the visit.
  useEffect(
    () => () => {
      runner.stop();
      listener.stop();
      const out = visitActivity(e, visit.current, recordRef.current, localDay(Date.now()));
      if (out) recordActivity(out.input);
      visit.current = newVisit(e.id, tempoRef.current, Date.now());
    },
    [e, runner, listener],
  );
  useEffect(() => () => runner.dispose(), [runner]);

  // One tick a second: practice time, the health clock, the strain limit.
  const playing = runState !== 'idle' || activity === 'take';
  useEffect(() => {
    const id = window.setInterval(() => {
      const active = runner.state !== 'idle' || listener.recording;
      tickHealthClock(1, active);
      if (active) {
        visit.current.activeSec += 1;
        exerciseSecRef.current += 1;
        if (exerciseSecRef.current % 60 === 0) setExerciseMin(exerciseSecRef.current / 60);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [runner, listener]);

  // Keep the screen awake while practising.
  useEffect(() => (playing ? keepAwake() : undefined), [playing]);

  // The live input level while the microphone is open.
  useEffect(() => listener.onLevel((l) => setLevel((prev) => (prev && Math.abs(prev.db - l.db) < 1.5 && prev.clipping === l.clipping ? prev : l))), [listener]);
  useEffect(
    () =>
      listener.onLost(() => {
        setMic({ kind: 'blocked', reason: 'no-device' });
        if (activityRef.current === 'take') runner.stop();
      }),
    [listener, runner],
  );

  // Turning the microphone switch off closes the microphone.
  useEffect(() => {
    if (!micWanted) {
      listener.stop();
      setMic({ kind: 'off' });
      setLevel(null);
    }
  }, [micWanted, listener]);

  /** Apply a pass verdict to the ladder. */
  const applyVerdict = useCallback(
    (verdict: Verdict, source: 'self' | 'mic', score?: number) => {
      const t = tempoRef.current;
      visit.current.passes.push({ tempo: t, verdict, source, partId: part.id, ...(score !== undefined ? { score } : {}) });
      const r = afterPass({ tempo: t, missesHere: missesRef.current }, verdict, e.tempo);
      missesRef.current = r.state.missesHere;
      const next = clampTempo(r.state.tempo, even);
      visit.current.tempo = next;
      setTempo(next);
      setPasses((n) => n + 1);
      setNote({ verdict, move: r.move, tempo: next, text: moveText(verdict, r.move, next), at: Date.now() });
    },
    [e.tempo, part.id, even],
  );

  const changeTempo = useCallback(
    (value: number) => {
      const next = clampTempo(value, even);
      missesRef.current = 0;
      visit.current.tempo = next;
      setTempo(next);
    },
    [even],
  );

  const nudge = useCallback((dir: 1 | -1, fine = false) => changeTempo(nudgeTempo(tempoRef.current, dir, e.tempo, fine, even)), [changeTempo, e.tempo, even]);

  /** Switch what the runner is doing: stop first, so the stop's events are read with the old activity. */
  const begin = useCallback(
    (kind: 'practice' | 'demo' | 'take') => {
      runner.stop();
      activityRef.current = kind;
      setActivity(kind);
    },
    [runner],
  );

  const stop = useCallback(() => {
    if (activityRef.current === 'take') {
      // Stopping a take early still judges what was played.
      runner.stop();
      return;
    }
    runner.stop();
    setActivity('idle');
  }, [runner]);

  const startPractice = useCallback(() => {
    setTake(null);
    begin('practice');
    void runner.start({ loop: true, guide, click: true });
  }, [runner, guide, begin]);

  const hear = useCallback(() => {
    if (activityRef.current === 'demo') {
      stop();
      return;
    }
    begin('demo');
    void runner.start({ loop: false, guide: true, click: true });
  }, [runner, stop, begin]);

  const openMic = useCallback(async (): Promise<boolean> => {
    if (listener.open) return true;
    setMic({ kind: 'starting' });
    const res = await listener.start();
    if (!res.ok) {
      if (res.detail !== 'superseded') setMic({ kind: 'blocked', reason: micFailure(res.reason) });
      return false;
    }
    setMic({ kind: 'ready' });
    return true;
  }, [listener]);

  const startTake = useCallback(async () => {
    setTake(null);
    void unlockAudio();
    runner.stop();
    const ok = await openMic();
    if (!ok) return;
    begin('take');
    listener.begin();
    await runner.start({ loop: false, guide: false, click: takeClick });
  }, [listener, openMic, runner, takeClick, begin]);

  /** Judge the take that just ended. */
  const judge = useCallback(
    (data: TakeData): TakeView => {
      const c = part.check;
      const t = tempoRef.current;
      const bpm = songBpm(part, t);
      const a4 = prefs.a4;
      const first = data.notes[0]?.start ?? 0;
      const heard = data.notes.map((n) => ({ midi: n.midi, at: n.start - first, dur: Math.min(1.5, n.duration) }));
      if (c.kind === 'notes' || c.kind === 'onsets') {
        const r = analyzeTake({ kind: c.kind, expected: expectedFromSong(partSong(e, part, t)), bpm: t, notes: data.notes, onsets: data.onsets, intonation: c.kind === 'notes' && c.intonation });
        return { kind: c.kind, verdict: r.verdict, score: r.score, headline: r.messages[0], details: r.messages.slice(1), noteStates: r.noteStates, heard, tempo: t };
      }
      if (c.kind === 'bend') {
        const from = OPEN[c.string] + c.fret;
        const r = analyzeBend(data.pitch, data.onsets, { fromMidi: from, toMidi: from + c.semitones, toleranceCents: c.toleranceCents, a4 });
        return { kind: 'bend', verdict: r.verdict, score: r.found ? Math.max(0, Math.round(100 - Math.abs(r.reachedCents) * 2)) : 0, headline: r.messages[0], details: r.messages.slice(1), noteStates: null, heard, tempo: t };
      }
      if (c.kind === 'prebend') {
        const fret = OPEN[c.string] + c.fret;
        const r = analyzePrebend(data.pitch, data.onsets, { fretMidi: fret, bentMidi: fret + c.semitones, toleranceCents: c.toleranceCents, beatSec: 60 / bpm, a4 });
        return { kind: 'prebend', verdict: r.verdict, score: null, headline: r.messages[0], details: r.messages.slice(1), noteStates: null, heard, tempo: t };
      }
      if (c.kind === 'vibrato') {
        const r = analyzeVibrato(data.pitch, { midi: OPEN[c.string] + c.fret, style: c.style, wavesPerBeat: c.wavesPerBeat, bpm, a4 });
        return { kind: 'vibrato', verdict: r.verdict, score: null, headline: r.messages[0], details: r.messages.slice(1), noteStates: null, heard, tempo: t };
      }
      if (c.kind === 'level') {
        const time = song.bars[0]?.time ?? { numerator: 4, denominator: 4 };
        const barSec = (time.numerator * (4 / time.denominator) * 60) / bpm;
        const r = analyzeLevels(data.levels, data.onsets, { barSec, shape: c.shape });
        return { kind: 'level', verdict: r.verdict, score: null, headline: r.messages[0], details: r.messages.slice(1), noteStates: null, bars: r.barDb, heard, tempo: t };
      }
      return { kind: 'notes', verdict: 'not-yet', score: null, headline: c.why, details: [], noteStates: null, heard, tempo: t };
    },
    [e, part, prefs.a4, song],
  );

  finishTakeRef.current = () => {
    if (!listener.recording) {
      activityRef.current = 'idle';
      setActivity('idle');
      return;
    }
    activityRef.current = 'idle';
    setAnalysing(true);
    // Let the last note ring into the microphone before closing the take.
    window.setTimeout(() => {
      const data = listener.end();
      const view = judge(data);
      setTake(view);
      setAnalysing(false);
      setActivity('idle');
      applyVerdict(view.verdict, 'mic', view.score ?? undefined);
    }, 700);
  };

  /** Play back what the microphone heard, as notes on the guitar synth. */
  const playBack = useCallback(() => {
    if (!take?.heard.length) return;
    void unlockAudio();
    const t0 = audioNow() + 0.15;
    const tone = normalizeTone(prefs.sound.guitarTone) as ToneName;
    for (const n of take.heard) pluck(n.midi, t0 + n.at, { duration: n.dur, tone, velocity: 0.7 });
  }, [take, prefs.sound.guitarTone]);

  const selectPart = useCallback(
    (id: string) => {
      runner.stop();
      setActivity('idle');
      setTake(null);
      setStoredPart(id);
    },
    [runner, setStoredPart],
  );

  /** Finish the visit now: record it and show the summary. */
  const finish = useCallback(() => {
    runner.stop();
    setActivity('idle');
    const out = visitActivity(e, visit.current, recordRef.current, localDay(Date.now()));
    visit.current = newVisit(e.id, tempoRef.current, Date.now());
    setPasses(0);
    if (!out) return null;
    const r = recordActivity(out.input);
    setResult(r);
    return r;
  }, [e, runner]);

  /** The cool-down note for the record (routines use it). */
  const setVisitNote = useCallback((text: string) => {
    visit.current.note = text;
  }, []);

  const micReason = mic.kind === 'blocked' ? explainMediaFailure(mic.reason, 'microphone') : null;
  /** What is going on, as the screen shows it (a tempo change can restart the runner by itself). */
  const mode: 'idle' | 'practice' | 'demo' | 'take' = analysing ? 'take' : runState === 'idle' ? 'idle' : activity === 'idle' ? 'practice' : activity;

  return {
    mode,
    part,
    partIndex,
    selectPart,
    song,
    tempo,
    setTempo: changeTempo,
    nudge,
    record,
    runState,
    activity,
    countIn,
    current,
    guide,
    setGuide: (on: boolean) => {
      setGuide(on);
      runner.configure({ guide: on });
    },
    micWanted,
    setMicWanted,
    mic,
    micReason,
    level,
    takeClick,
    setTakeClick,
    take,
    clearTake: () => setTake(null),
    analysing,
    note,
    passes,
    startPractice,
    startTake,
    stop,
    hear,
    clean: () => applyVerdict('clean', 'self'),
    notYet: () => applyVerdict('not-yet', 'self'),
    playBack,
    finish,
    result,
    clearResult: () => setResult(null),
    exerciseMin,
    setVisitNote,
    runner,
    listener,
    openMic,
  };
}

/** The hook's result. */
export type ExerciseState = ReturnType<typeof useExercise>;

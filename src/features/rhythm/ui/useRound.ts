/**
 * The life of one round, shared by every rhythm activity: ready, running, done.
 *
 * It owns the session, the inputs (keys, the pad through `tap`, the microphone), the judgements as
 * they arrive, and what happens at the end (statistics, the tip, the report to the progress
 * store). A screen supplies the chart and draws the display.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useImmersive } from '@/app/shell';
import { unlockAudio } from '@/core/audio';
import type { OnsetEvent } from '@/core/pitch';
import { isArtifact } from '@/core/platform';
import { getProgress, getProgressStore, recordActivity, type ActivityResult } from '@/core/progress';
import { useLatest, useWakeLock } from '@/ui';
import { isBleed, isCalibrated, loadCalibration, offsetFor, saveCalibration, type InputSource } from '../core/calibration';
import { activityFor } from '../core/report';
import type { Chart, Segment, Target } from '../core/charts';
import { meterInfo, secondsPerTick } from '../core/meter';
import { MIC_WINDOWS, TAP_WINDOWS, type Judgement } from '../core/scoring';
import { pickTip, type Tip } from '../core/tips';
import { rhythmDebug } from '../engine/debug';
import { MicInput, TAP_KEYS, isTypingTarget, tapTime, type MicFailure } from '../engine/input';
import { RhythmSession, type SessionResult } from '../engine/session';
import { playChartSound, prepareSounds, soundSettings, strumChord } from '../engine/sounds';
import type { RhythmPrefs } from './prefs';

/** What a screen tells the hook about the round it wants played. */
export interface RoundSpec {
  /** Skill id for the progress store (`rhythm:read:3`). */
  skill: string;
  /** Title for the practice log and "continue". */
  title: string;
  /** Route params after `rhythm`. */
  params: string[];
  chart: Chart;
  prefs: RhythmPrefs;
  /** Chord for strums (default Em). */
  chord?: string;
  staccato?: boolean;
  /** Seconds one strum slot lasts. */
  slotSeconds?: number;
  /** False for rounds that are not scored (listening, calibration). */
  record?: boolean;
  /** The round has silent bars: the tip looks at them. */
  innerClock?: boolean;
  /** Force an input source regardless of the stored preference. */
  source?: InputSource;
  /** Tempo limits, so the tip knows whether "slower" / "faster" can be offered. */
  canSlow?: boolean;
  canSpeedUp?: boolean;
  countsHidden?: boolean;
  /** Skip the first-time calibration offer (the calibration screen itself). */
  noOffer?: boolean;
  /** Use an offset of zero whatever is stored (calibration measures the raw delay). */
  rawTiming?: boolean;
  /** Every microphone onset as it arrives, before any filtering (calibration looks at levels too). */
  onOnset?: (onset: OnsetEvent) => void;
  /** Ignore the keyboard (a sheet is open over the screen and has the keys). */
  keysOff?: boolean;
}

/** The tempo a skill was last played at (kept in range), or `fallback` when it has never been played. */
export function lastTempo(skill: string, fallback: number, min: number, max: number): number {
  const data = getProgress().skills[skill]?.data;
  const bpm = data && typeof data === 'object' && !Array.isArray(data) ? data.bpm : undefined;
  return typeof bpm === 'number' && Number.isFinite(bpm) ? Math.min(max, Math.max(min, Math.round(bpm))) : fallback;
}

/** The most recent judgement, numbered so the same verdict twice still re-triggers feedback. */
export interface LastJudgement {
  judgement: Judgement;
  target: Target | null;
  n: number;
}

/** Microphone state for the screen. */
export interface MicState {
  status: 'off' | 'starting' | 'on' | 'failed';
  reason?: MicFailure;
}

/** What the hook gives a screen. */
export interface Round {
  phase: 'ready' | 'starting' | 'running' | 'done';
  session: RhythmSession | null;
  /** The chart of the round in progress (or just finished); the spec's chart before the first start. */
  chart: Chart;
  /** The stretch being heard. */
  segment: Segment | null;
  /** Judgement per expected note, by target id. */
  marks: ReadonlyMap<number, Judgement>;
  /** Every judgement of the round in order, extras included (the lane draws tap marks from this). */
  judgements: readonly Judgement[];
  last: LastJudgement | null;
  result: SessionResult | null;
  /** What the progress store answered, when the round was recorded. */
  outcome: ActivityResult | null;
  tip: Tip | null;
  mic: MicState;
  /** The source in effect: the preference, or `tap` where the microphone cannot be used. */
  source: InputSource;
  /** True where this host has no microphone at all (the Claude viewer). */
  micBlocked: boolean;
  /** Set when a first-time calibration offer is waiting for an answer. */
  offer: InputSource | null;
  /** Answer the offer: `skip` starts the round, `close` just closes it (after calibrating). */
  answerOffer(answer: 'skip' | 'close'): void;
  start(): void;
  stop(): void;
  /** Back to the ready phase (keeps nothing of the last round). */
  reset(): void;
  /** A tap from the pad. Pass the DOM event so its own timestamp is used. */
  tap(event?: { timeStamp: number } | null, dir?: 'D' | 'U'): void;
  /** Microphone level in dBFS for a meter (-100 when off). */
  micLevel(): number;
  /** Forget a microphone failure (the learner chose to tap instead). */
  clearMicFailure(): void;
}

const EMPTY_MARKS: ReadonlyMap<number, Judgement> = new Map();

/** Run rounds of a chart. */
export function useRound(spec: RoundSpec): Round {
  const specRef = useLatest(spec);
  const [phase, setPhase] = useState<Round['phase']>('ready');
  const [session, setSession] = useState<RhythmSession | null>(null);
  const [chart, setChart] = useState<Chart | null>(null);
  const [segment, setSegment] = useState<Segment | null>(null);
  const [marks, setMarks] = useState<ReadonlyMap<number, Judgement>>(EMPTY_MARKS);
  const [judgements, setJudgements] = useState<readonly Judgement[]>([]);
  const [last, setLast] = useState<LastJudgement | null>(null);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [outcome, setOutcome] = useState<ActivityResult | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [mic, setMic] = useState<MicState>({ status: 'off' });
  const [offer, setOffer] = useState<InputSource | null>(null);

  const sessionRef = useRef<RhythmSession | null>(null);
  const micRef = useRef<MicInput | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const offerRef = useRef(offer);
  offerRef.current = offer;
  const counter = useRef(0);
  const startedAs = useRef<{ source: InputSource; calibrated: boolean }>({ source: 'tap', calibrated: false });
  const alive = useRef(true);

  const micBlocked = isArtifact();
  const wanted = spec.source ?? spec.prefs.source;
  const source: InputSource = wanted === 'mic' && !micBlocked ? 'mic' : 'tap';

  const running = phase === 'running';
  useImmersive(running || phase === 'starting', 'focus');
  useWakeLock(running);

  const teardown = useCallback(() => {
    sessionRef.current?.dispose();
    sessionRef.current = null;
    micRef.current?.stop();
    micRef.current = null;
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // Leaving mid-round (another screen, Back): what was played still counts, as a round left early.
      const live = sessionRef.current;
      if (live && live.state === 'running') live.stop();
      teardown();
      if (rhythmDebug.session && rhythmDebug.session.state !== 'running') rhythmDebug.session = null;
    };
  }, [teardown]);

  // A reload or a closed tab does not unmount the screen: end the round the same way, and save now.
  useEffect(() => {
    const onHide = (e: PageTransitionEvent) => {
      if (e.persisted) return;
      const live = sessionRef.current;
      if (!live || live.state !== 'running') return;
      live.stop();
      getProgressStore().flush();
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  const finish = useCallback(
    (res: SessionResult) => {
      const s = specRef.current;
      micRef.current?.stop();
      micRef.current = null;
      rhythmDebug.lastResult = res;
      const { stats } = res;
      // Recorded first, whether or not the screen is still there: a round left early still counts.
      const activity = activityFor({ skill: s.skill, title: s.title, params: s.params, record: s.record }, res, sessionRef.current?.chart.bpm ?? s.chart.bpm);
      const recorded: ActivityResult | null = activity ? recordActivity(activity) : null;
      if (!alive.current) return;
      setMic((m) => (m.status === 'on' ? { status: 'off' } : m));
      // A round stopped before anything was due has nothing to say: go back to the start.
      if (!activity && !res.completed) {
        setPhase('ready');
        setSegment(null);
        return;
      }
      setResult(res);
      setOutcome(recorded);
      setTip(
        pickTip(stats, {
          source: startedAs.current.source,
          calibrated: startedAs.current.calibrated,
          innerClock: s.innerClock,
          canSlow: s.canSlow,
          canSpeedUp: s.canSpeedUp,
          countsHidden: s.countsHidden,
        }),
      );
      setSegment(null);
      setPhase('done');
    },
    [specRef],
  );

  const begin = useCallback(async () => {
    const s = specRef.current;
    const want = s.source ?? s.prefs.source;
    const src: InputSource = want === 'mic' && !isArtifact() ? 'mic' : 'tap';
    setPhase('starting');
    // Inside the gesture: the audio context must be resumed before anything is awaited.
    const unlocked = unlockAudio();
    let micLatency = 60;
    if (src === 'mic') {
      setMic({ status: 'starting' });
      const input = new MicInput(
        (onset: OnsetEvent) => {
          const live = sessionRef.current;
          if (!live || live.state !== 'running') return;
          const now = specRef.current;
          now.onOnset?.(onset);
          // The app's own click coming back through the microphone is not the learner.
          if (!now.rawTiming && isBleed(onset, live.recentSoundTimes(12), loadCalibration().bleed)) return;
          live.tap(onset.time);
        },
        () => {
          // The device went away mid-round: stop and say so rather than score silence.
          setMic({ status: 'failed', reason: 'in-use' });
          sessionRef.current?.stop();
        },
      );
      const res = await input.start(getProgress().prefs.mic.deviceId || undefined);
      if (!alive.current) {
        input.stop();
        return;
      }
      if (!res.ok) {
        setMic({ status: 'failed', reason: res.reason });
        setPhase('ready');
        return;
      }
      micRef.current = input;
      micLatency = res.info.latencyMs;
      setMic({ status: 'on' });
    }
    await unlocked;
    const cal = loadCalibration();
    const meter = meterInfo(s.chart.meter);
    const spt = secondsPerTick(s.chart.bpm, meter);
    const prefs = getProgress().prefs.sound;
    const settings = soundSettings(prefs, {
      chord: strumChord(s.chord ?? 'Em'),
      staccato: !!s.staccato,
      slotSeconds: s.slotSeconds ?? spt * 480,
      secondsPerTick: spt,
    });
    await prepareSounds(settings, s.chart.sounds);
    if (!alive.current) {
      micRef.current?.stop();
      micRef.current = null;
      return;
    }
    sessionRef.current?.dispose();
    const live = new RhythmSession({
      chart: s.chart,
      play: (sound, time) => playChartSound(sound, time, settings),
      windows: src === 'mic' ? MIC_WINDOWS : TAP_WINDOWS,
      offsetMs: s.rawTiming ? 0 : offsetFor(cal, src, micLatency),
      graceMs: src === 'mic' ? 280 : 120,
      extraPenalty: src === 'mic' ? 0.15 : undefined,
      forgiveSoft: src === 'mic',
    });
    startedAs.current = { source: src, calibrated: isCalibrated(cal, src) };
    sessionRef.current = live;
    const collected: Judgement[] = [];
    live.on('judge', ({ judgement, target }) => {
      collected.push(judgement);
      setJudgements([...collected]);
      if (judgement.targetId !== null) {
        const id = judgement.targetId;
        setMarks((prev) => new Map(prev).set(id, judgement));
      }
      setLast({ judgement, target, n: ++counter.current });
    });
    live.on('segment', (seg) => setSegment(seg));
    live.on('end', finish);
    setSession(live);
    setChart(s.chart);
    setMarks(EMPTY_MARKS);
    setJudgements([]);
    setLast(null);
    setResult(null);
    setOutcome(null);
    setTip(null);
    setSegment(s.chart.segments[0] ?? null);
    rhythmDebug.session = live;
    rhythmDebug.started++;
    live.start();
    setPhase('running');
  }, [finish, specRef]);

  const start = useCallback(() => {
    if (phaseRef.current === 'starting' || phaseRef.current === 'running') return;
    const s = specRef.current;
    const want = s.source ?? s.prefs.source;
    const src: InputSource = want === 'mic' && !isArtifact() ? 'mic' : 'tap';
    if (!s.noOffer && s.record !== false) {
      const cal = loadCalibration();
      if (src === 'tap' && !cal.offered && cal.tapMs === null) {
        setOffer('tap');
        return;
      }
      // The microphone is not set up before the learner has tried it: the first round uses the
      // delay the device reports, and if the timing then reads early or late by a steady amount
      // the tip after the round offers the ten-second calibration.
      if (src === 'mic' && !cal.micOffered) saveCalibration({ micOffered: true });
    }
    void begin();
  }, [begin, specRef]);

  const answerOffer = useCallback(
    (answer: 'skip' | 'close') => {
      setOffer(null);
      if (answer === 'skip') void begin();
    },
    [begin],
  );

  const stop = useCallback(() => {
    const live = sessionRef.current;
    if (live && live.state === 'running') live.stop();
    else if (phaseRef.current === 'starting') {
      teardown();
      setPhase('ready');
    }
  }, [teardown]);

  const reset = useCallback(() => {
    teardown();
    setSession(null);
    setChart(null);
    setSegment(null);
    setMarks(EMPTY_MARKS);
    setJudgements([]);
    setLast(null);
    setResult(null);
    setOutcome(null);
    setTip(null);
    setPhase('ready');
  }, [teardown]);

  const tap = useCallback((event?: { timeStamp: number } | null, dir?: 'D' | 'U') => {
    const live = sessionRef.current;
    if (!live || live.state !== 'running') return;
    live.tap(tapTime(event), dir);
  }, []);

  // Keys: Space, F and J tap while a round runs; Space or Enter start it; Escape stops it.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || offerRef.current || specRef.current.keysOff) return;
      const p = phaseRef.current;
      if (p === 'running') {
        if (e.code in TAP_KEYS) {
          e.preventDefault();
          if (!e.repeat) tap(e, TAP_KEYS[e.code]);
        } else if (e.code === 'Escape') {
          e.preventDefault();
          stop();
        }
        return;
      }
      if (p === 'ready' && (e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
        const el = e.target as HTMLElement | null;
        if (isTypingTarget(el) || el?.closest?.('button, a[href], [role="slider"], [role="radio"], [role="tab"], [role="switch"], summary')) return;
        e.preventDefault();
        start();
      }
    };
    // A held Space must not "click" whatever button has focus when it is released.
    const onKeyUp = (e: KeyboardEvent) => {
      if (phaseRef.current === 'running' && e.code in TAP_KEYS) e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [start, stop, tap, specRef]);

  const micLevel = useCallback(() => micRef.current?.levelDb ?? -100, []);
  const clearMicFailure = useCallback(() => setMic({ status: 'off' }), []);

  return {
    phase,
    session,
    chart: phase === 'ready' ? spec.chart : chart ?? spec.chart,
    segment,
    marks,
    judgements,
    last,
    result,
    outcome,
    tip,
    mic,
    source,
    micBlocked,
    offer,
    answerOffer,
    start,
    stop,
    reset,
    tap,
    micLevel,
    clearMicFailure,
  };
}

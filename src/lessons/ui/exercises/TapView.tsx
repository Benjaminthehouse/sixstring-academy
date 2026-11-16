/**
 * Tap a rhythm. A big pad (and the Space key), a visible count-in with clicks, the beat kept
 * going while the learner taps, then a picture of how each tap landed. The taps are timed from
 * the pointer and key events themselves, against the moment beat one was heard.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Text, cx } from '@/ui';
import { RhythmView } from '@/ui/music';
import { audioSoundingNow, audioState, normalizeClickSet, playClick, unlockAudio } from '@/core/audio';
import { soundPrefs } from '@/core/settings';
import { soundPlan } from '../../sound';
import type { TapRhythmExercise } from '../../types';
import { useStepKeys } from '../keys';
import { tapPlan, tapsFromBeatOne } from '../logic/tap';
import { useSoundPlayer } from '../useSound';
import type { ExerciseViewProps } from './types';
import styles from './Exercises.module.css';

type Phase = 'ready' | 'counting' | 'tapping' | 'none-heard';

/** How each tap landed, drawn as a strip: notes as lines, taps as dots coloured by verdict. */
function TapTimeline({ length, targets, verdicts, taps }: { length: number; targets: number[]; verdicts: Array<'hit' | 'early' | 'late' | 'missed'>; taps: number[] }) {
  const pad = 0.15;
  const span = length + pad * 2;
  const x = (t: number): number => ((t + pad) / span) * 100;
  return (
    <svg className={styles.timeline} viewBox="0 0 100 24" preserveAspectRatio="none" role="img" aria-label={`${verdicts.filter((v) => v === 'hit').length} of ${targets.length} taps on time`}>
      <line x1={0} x2={100} y1={12} y2={12} className={styles.timelineAxis} />
      {targets.map((t, i) => (
        <line key={`t${i}`} x1={x(t)} x2={x(t)} y1={3} y2={21} className={cx(styles.timelineTarget, styles[`verdict-${verdicts[i] ?? 'missed'}`])} />
      ))}
      {taps.map((t, i) => (
        <circle key={`p${i}`} cx={x(t)} cy={12} r={1.6} className={styles.timelineTap} />
      ))}
    </svg>
  );
}

/** Tap the rhythm shown and/or heard. */
export function TapRhythmView({ exercise, review, onSubmit, setPrimary, hints, level }: ExerciseViewProps<TapRhythmExercise>) {
  const plan = useMemo(() => tapPlan(exercise, level), [exercise, level]);
  const player = useSoundPlayer();
  const [phase, setPhaseState] = useState<Phase>('ready');
  // The phase as the event handlers see it right now (state lags a render behind a fast tap).
  const phaseRef = useRef<Phase>('ready');
  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const [count, setCount] = useState<number | null>(null);
  const [tapCount, setTapCount] = useState(0);
  const taps = useRef<number[]>([]);
  const beatOne = useRef<number | null>(null);
  const timers = useRef<number[]>([]);
  const takeBacks = useRef<Array<() => void>>([]);
  const padRef = useRef<HTMLButtonElement | null>(null);
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;
  const firstTap = exercise.start === 'first-tap';
  const showNotation = exercise.show !== 'audio';
  const showAudio = exercise.show !== 'notation';

  const clear = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    for (const b of takeBacks.current) b();
    takeBacks.current = [];
  };
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clear();
    };
  }, []);

  const finish = () => {
    clear();
    const anchor = beatOne.current;
    const raw = taps.current;
    if (anchor === null || raw.length === 0) {
      setPhase('none-heard');
      setCount(null);
      return;
    }
    setPhase('ready');
    submitRef.current({ type: 'tap-rhythm', taps: tapsFromBeatOne(raw, anchor, plan.beat) });
  };

  const reset = () => {
    player.stop();
    clear();
    taps.current = [];
    setTapCount(0);
    beatOne.current = null;
  };

  const start = async () => {
    if (review || phaseRef.current === 'counting' || phaseRef.current === 'tapping') return;
    reset();
    if (firstTap) {
      setPhase('tapping');
      setCount(null);
      padRef.current?.focus({ preventScroll: true });
      return;
    }
    setPhase('counting');
    const audio = audioState() !== 'unsupported' && (await unlockAudio());
    // The step may have gone while the audio woke up: schedule nothing for it (no clicks, no answer).
    if (!alive.current) return;
    const lead = 0.25;
    // "Now" on the audio clock as heard and on the page's clock: a click scheduled for T is heard
    // when the sounding clock reaches T, so both clocks agree on when beat one is heard.
    const soundingNow = audio ? audioSoundingNow() : 0;
    const pageNow = performance.now();
    const firstClickHeard = pageNow + lead * 1000;
    const one = firstClickHeard + plan.countIn * 1000;
    beatOne.current = one;
    const clickSet = normalizeClickSet(soundPrefs().clickSound);
    for (const c of plan.clicks) {
      if (audio) takeBacks.current.push(playClick(clickSet, c.accent ? 'accent' : 'beat', soundingNow + lead + c.at));
      const at = firstClickHeard + c.at * 1000 - pageNow;
      timers.current.push(window.setTimeout(() => setCount(c.count), Math.max(0, at)));
    }
    // Taps a little before beat one count (an early first note), so tapping opens just before it.
    timers.current.push(window.setTimeout(() => setPhase('tapping'), Math.max(0, one - pageNow - plan.beat * 500)));
    timers.current.push(window.setTimeout(finish, Math.max(0, one + plan.stopAfter * 1000 - pageNow)));
    padRef.current?.focus({ preventScroll: true });
  };

  const tap = (time: number) => {
    if (review) return;
    const p = phaseRef.current;
    if (p === 'ready' || p === 'none-heard') {
      if (!firstTap) return;
      // In "first tap" mode the first tap starts the rhythm and is its first note.
      reset();
      setPhase('tapping');
    } else if (p === 'counting') {
      // A tap during the count-in is kept: it may be an early first note.
    }
    if (firstTap && beatOne.current === null) {
      beatOne.current = time;
      timers.current.push(window.setTimeout(finish, plan.stopAfter * 1000));
    }
    taps.current.push(time);
    setTapCount(taps.current.length);
    const pad = padRef.current;
    if (pad) {
      pad.classList.remove(styles.padHit);
      void pad.offsetWidth;
      pad.classList.add(styles.padHit);
    }
  };

  const listen = () => player.play(soundPlan({ kind: 'rhythm', pattern: exercise.rhythm.pattern, time: exercise.rhythm.time, tempo: exercise.tempo }));

  useStepKeys(
    {
      space: () => {
        const p = phaseRef.current;
        if (p === 'counting' || p === 'tapping' || firstTap) tap(performance.now());
        else void start();
        return true;
      },
      char: (k) => (showAudio && k.toLowerCase() === 'l' ? (listen(), true) : false),
    },
    !review,
  );

  useEffect(() => {
    if (review) {
      setPrimary(null);
      return;
    }
    if (phase === 'counting' || phase === 'tapping') setPrimary({ label: phase === 'counting' ? 'Get ready' : 'Tapping', icon: 'Hand', disabled: true });
    else if (firstTap) setPrimary({ label: 'Tap the pad to start', icon: 'Hand', disabled: true });
    else setPrimary({ label: phase === 'none-heard' ? 'Try again' : 'Start', icon: 'Play', onClick: () => void start() });
    // start is recreated every render but reads only refs and stable values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, review, firstTap]);

  useEffect(() => () => setPrimary(null), [setPrimary]);

  const detail = review?.result.feedback.detail.type === 'tap-rhythm' ? review.result.feedback.detail : null;
  const given = review?.answer?.type === 'tap-rhythm' ? review.answer.taps : [];

  return (
    <div className={styles.answerArea}>
      {showNotation && (
        <div className={styles.rhythmBox}>
          <RhythmView rhythm={exercise.rhythm.pattern} time={exercise.rhythm.time} />
        </div>
      )}
      <div className={styles.tapMeta}>
        <Text variant="caption" tone="muted">
          {exercise.tempo} BPM{firstTap ? ' · start when you are ready' : ' · one bar of clicks counts you in'}
        </Text>
        {showAudio && !review && (
          <Button variant="ghost" iconLeft={player.playing ? 'Square' : 'Volume2'} onClick={() => (player.playing ? player.stop() : listen())}>
            {player.playing ? 'Stop' : 'Hear it first'}
          </Button>
        )}
      </div>
      {review && detail ? (
        <div className={styles.tapResult}>
          <TapTimeline length={plan.length} targets={plan.targets} verdicts={detail.onsets.map((o) => o.verdict)} taps={given.map((t) => t - detail.offsetMs / 1000)} />
          <div className={styles.legend}>
            <span className={styles['verdict-hit']}>On time</span>
            <span className={styles['verdict-early']}>Early</span>
            <span className={styles['verdict-late']}>Late</span>
            <span className={styles['verdict-missed']}>Missed</span>
          </div>
        </div>
      ) : (
        <button
          ref={padRef}
          type="button"
          className={cx(styles.pad, phase === 'counting' && styles.padCounting, phase === 'tapping' && styles.padLive)}
          onPointerDown={(e) => {
            e.preventDefault();
            tap(e.timeStamp || performance.now());
          }}
          aria-label={phase === 'tapping' ? 'Tap pad: tap the rhythm' : 'Tap pad'}
          data-tap-pad=""
        >
          <span className={styles.padCount} aria-live="off">
            {(phase === 'counting' || phase === 'tapping') && !firstTap ? (count ?? '') : 'Tap'}
          </span>
          <span className={styles.padHint}>
            {phase === 'counting' ? 'Listen to the count…' : phase === 'tapping' ? (tapCount > 0 ? `${tapCount} ${tapCount === 1 ? 'tap' : 'taps'}` : 'Tap with the rhythm') : phase === 'none-heard' ? 'No taps came through. Press Start and tap here.' : firstTap ? 'Tap here to start' : 'Press Start, then tap here'}
            {hints && <span className={styles.padKeys}> · Space taps</span>}
          </span>
        </button>
      )}
      <span className="sr-only" aria-live="polite">
        {phase === 'counting' ? `Count in: ${count ?? ''}` : phase === 'tapping' ? 'Tap now' : ''}
      </span>
    </div>
  );
}

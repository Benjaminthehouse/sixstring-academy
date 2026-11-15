import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Icon, Kbd, Text, cx, useEventListener } from '@/ui';
import { Fretboard, noteText, useMusicSettings, type FretMarker } from '@/ui/music';
import { audioNow, startDrone, stopAll, unlockAudio, type DroneHandle } from '@/core/audio';
import { scaleMidi } from '@/core/theory';
import { MODE_LEVELS, makeModeRound, modeInfo, modeLabel, type ModeId, type ModeQuestion } from '../../core/modeMatch';
import { regionOf } from '../../core/focus';
import { addHit, addMiss, findPoints, newTally, starsFor } from '../../core/scoring';
import { hitSound, missSound, playNote } from '../sound';
import { noteMarker, useRoundClock } from '../kit';
import { RoundFrame } from '../RoundFrame';
import type { GameProps } from '../types';
import styles from '../Arcade.module.css';

const STEP = 0.3;

/** Mode Match: hear a mode over a drone (or see it on the neck) and name it. */
export function ModeMatch({ ctx, running, fx, title, onFinish, onEnd }: GameProps) {
  const level = MODE_LEVELS.find((l) => l.n === ctx.level) ?? MODE_LEVELS[0];
  // The daily challenge keeps the learner's key; ordinary rounds wander so absolute pitch is no help.
  const round = useMemo(() => makeModeRound(level, ctx.seed, { size: ctx.size, tuning: ctx.tuning, tonic: ctx.size ? ctx.focus.tonic : undefined }), [level, ctx.seed, ctx.size, ctx.tuning, ctx.focus.tonic]);
  const { naming } = useMusicSettings();
  const [index, setIndex] = useState(0);
  const [tally, setTally] = useState(newTally);
  const [answers, setAnswers] = useState<Array<{ chosen: ModeId; right: boolean; seconds: number }>>([]);
  const [chosen, setChosen] = useState<ModeId | null>(null);
  const [playing, setPlaying] = useState<'question' | 'chosen' | 'answer' | null>(null);
  const drone = useRef<DroneHandle | null>(null);
  const playTimer = useRef<number | null>(null);
  const shownAt = useRef(0);
  const elapsed = useRoundClock(running);
  const finished = useRef(false);
  const answerRef = useRef<HTMLDivElement>(null);
  const q: ModeQuestion | undefined = round.questions[index];

  const silence = useCallback(() => {
    if (playTimer.current !== null) window.clearTimeout(playTimer.current);
    playTimer.current = null;
    drone.current?.stop(0.25);
    drone.current = null;
    try {
      stopAll();
    } catch {
      /* no audio */
    }
    setPlaying(null);
  }, []);

  useEffect(() => silence, [silence]);

  /** Play a mode on the question's tonic over its drone: up an octave and back down. */
  const play = useCallback(
    async (mode: ModeId, which: 'question' | 'chosen' | 'answer') => {
      if (!q) return;
      silence();
      await unlockAudio().catch(() => false);
      const up = scaleMidi(q.notes[0], mode, 1);
      const notes = [...up, ...up.slice(0, -1).reverse()];
      drone.current = startDrone({ root: q.drone, fifth: true, volume: 0.32, fadeIn: 0.3 });
      const t0 = audioNow() + 0.45;
      notes.forEach((m, i) => playNote(m, undefined, t0 + i * STEP, i === notes.length - 1 ? 1.2 : STEP * 1.1));
      setPlaying(which);
      const total = 0.45 + notes.length * STEP + 1.0;
      playTimer.current = window.setTimeout(() => {
        drone.current?.stop(0.6);
        drone.current = null;
        setPlaying(null);
      }, total * 1000);
    },
    [q, silence],
  );

  // A new ear question plays by itself once the round runs.
  useEffect(() => {
    if (!running || !q) return;
    shownAt.current = performance.now();
    if (q.kind === 'ear') void play(q.mode, 'question');
    // Only on a new question.
  }, [running, index]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = useCallback(
    (done: typeof answers, t: typeof tally) => {
      if (finished.current) return;
      finished.current = true;
      silence();
      const right = done.filter((a) => a.right).length;
      const accuracy = done.length ? right / round.questions.length : 0;
      const confused = new Map<string, number>();
      done.forEach((a, i) => {
        if (!a.right) {
          const key = `${round.questions[i].mode}>${a.chosen}`;
          confused.set(key, (confused.get(key) ?? 0) + 1);
        }
      });
      const worst = [...confused.entries()].sort((a, b) => b[1] - a[1])[0];
      const [was, heard] = worst ? (worst[0].split('>') as [ModeId, ModeId]) : [null, null];
      onFinish({
        score: t.score,
        accuracy,
        stars: starsFor(accuracy),
        bestCombo: t.bestCombo,
        mistakes: t.misses,
        count: done.length,
        durationSec: Math.round(elapsed()),
        perfect: t.misses === 0,
        stats: [
          { label: 'Right', value: `${right} of ${round.questions.length}` },
          { label: 'By ear', value: `${done.filter((a, i) => a.right && round.questions[i].kind === 'ear').length}` },
          { label: 'On the neck', value: `${done.filter((a, i) => a.right && round.questions[i].kind === 'eye').length}` },
          { label: 'Best combo', value: `${t.bestCombo}` },
        ],
        tip: was && heard ? `You heard ${modeLabel(heard, level.plain)} where it was ${modeLabel(was, level.plain)}. ${modeInfo(was).colour}` : 'Every mode named. Next, hum the colour note of each one over the drone.',
        marks: done.map((a) => (a.right ? 'ok' : 'bad')),
      });
    },
    [elapsed, level.plain, onFinish, round.questions, silence],
  );

  const answer = useCallback(
    (mode: ModeId) => {
      if (!running || !q || chosen) return;
      const right = mode === q.mode;
      const seconds = (performance.now() - shownAt.current) / 1000;
      // Credit for answering during or soon after the playback (about 5 s), less after that.
      const points = findPoints(Math.max(0, seconds - 5), tally.combo, true);
      const t = right ? addHit(tally, points) : addMiss(tally);
      setTally(t);
      setChosen(mode);
      const done = [...answers, { chosen: mode, right, seconds }];
      setAnswers(done);
      const btn = answerRef.current?.querySelector(`[data-mode="${mode}"]`);
      if (right) {
        silence();
        hitSound(t.combo);
        fx.burst(btn, 'ok', 'lg');
        fx.pop(btn, `+${points}`);
      } else {
        missSound();
        fx.shake(btn);
      }
      if (done.length >= round.questions.length) {
        window.setTimeout(() => finish(done, t), right ? 900 : 1800);
      } else if (right) {
        window.setTimeout(() => {
          setChosen(null);
          setIndex((i) => i + 1);
        }, 1100);
      }
    },
    [running, q, chosen, tally, answers, fx, round.questions.length, finish, silence],
  );

  const next = useCallback(() => {
    if (!chosen || answers.length >= round.questions.length) return;
    silence();
    setChosen(null);
    setIndex((i) => i + 1);
  }, [chosen, answers.length, round.questions.length, silence]);

  useEventListener(typeof window === 'undefined' ? null : window, 'keydown', (e: KeyboardEvent) => {
    if (!running || !q || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest?.('input, textarea, select, [role="dialog"]')) return;
    if (e.key === ' ') {
      e.preventDefault();
      if (q.kind === 'ear') void play(q.mode, 'question');
      return;
    }
    if (e.key === 'Enter' && chosen && !(target?.closest?.('button, a'))) {
      e.preventDefault();
      next();
      return;
    }
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= q.options.length) {
      e.preventDefault();
      answer(q.options[n - 1]);
    }
  });

  const markers = useMemo<FretMarker[]>(() => (q?.pattern ? q.pattern.notes.map((n) => noteMarker(n, { label: n.isRoot ? 'degree' : 'none', color: n.isRoot ? 'deg-1' : 'neutral' })) : []), [q]);
  const right = q && chosen ? chosen === q.mode : null;

  const prompt = q ? (
    <>
      <span className={styles.promptKicker}>{q.kind === 'ear' ? 'Listen over the drone' : 'Look at the shape'}</span>
      <span className={styles.promptBig}>Which mode?</span>
      <span className={styles.promptHint}>
        {q.kind === 'ear' ? `On ${noteText(q.tonic, naming)}. Space plays it again.` : `Root ${noteText(q.tonic, naming)} is marked R.`}
      </span>
    </>
  ) : null;

  const board = q ? (
    q.kind === 'eye' && q.pattern ? (
      <div className={styles.board}>
        <Fretboard frets={regionOf(q.pattern)} tuning={ctx.tuning} markers={markers} />
      </div>
    ) : (
      <div className={styles.listenStage}>
        <button type="button" className={cx(styles.bigPlay, playing === 'question' && styles.bigPlayOn)} onClick={() => void play(q.mode, 'question')} aria-label="Play it again" aria-keyshortcuts="Space" data-arcade-replay>
          <Icon name={playing === 'question' ? 'AudioLines' : 'RotateCcw'} size={40} />
        </button>
        <span className={styles.listenLabel}>{playing === 'question' ? 'Playing…' : 'Play it again'}</span>
      </div>
    )
  ) : null;

  return (
    <RoundFrame
      title={title}
      progress={{ value: answers.length, max: round.questions.length }}
      score={tally.score}
      combo={tally.combo}
      onEnd={() => {
        silence();
        onEnd();
      }}
      prompt={prompt}
      status={
        chosen && q ? (
          <span className={styles.statusStack}>
            <Text tone={right ? 'ok' : 'bad'} weight="semibold">
              {right ? `Yes: ${modeLabel(q.mode, level.plain)}.` : `It was ${modeLabel(q.mode, level.plain)}.`}
            </Text>
            <Text tone="muted" size="sm">
              {modeInfo(q.mode).colour}
            </Text>
          </span>
        ) : (
          <Text tone="muted">{running ? 'Pick the mode. Number keys work too.' : 'Get ready…'}</Text>
        )
      }
      statusKind={chosen ? (right ? 'hit' : 'miss') : 'waiting'}
      board={board}
      controls={
        <div className={styles.answerArea}>
          <div ref={answerRef} className={styles.answerGrid} data-count={q?.options.length ?? 0}>
            {q?.options.map((m, i) => {
              const state = chosen ? (m === q.mode ? 'right' : m === chosen ? 'wrong' : 'idle') : 'idle';
              return (
                <button
                  key={m}
                  type="button"
                  data-mode={m}
                  className={cx(styles.answerBtn, state === 'right' && styles.answerRight, state === 'wrong' && styles.answerWrong)}
                  onClick={() => answer(m)}
                  disabled={!running || (!!chosen && state === 'idle')}
                  aria-keyshortcuts={String(i + 1)}
                >
                  <Kbd>{i + 1}</Kbd>
                  <span className={styles.answerName}>{modeLabel(m, level.plain)}</span>
                  {state === 'right' && <Icon name="Check" size={18} strokeWidth={3} />}
                  {state === 'wrong' && <Icon name="X" size={18} strokeWidth={3} />}
                </button>
              );
            })}
          </div>
          {chosen && !right && q && (
            <div className={styles.compareRow}>
              {q.kind === 'ear' && (
                <>
                  <Button size="sm" iconLeft={playing === 'chosen' ? 'AudioLines' : 'Play'} onClick={() => void play(chosen, 'chosen')}>
                    Hear {modeLabel(chosen, level.plain)}
                  </Button>
                  <Button size="sm" iconLeft={playing === 'answer' ? 'AudioLines' : 'Play'} onClick={() => void play(q.mode, 'answer')}>
                    Hear {modeLabel(q.mode, level.plain)}
                  </Button>
                </>
              )}
              {answers.length < round.questions.length && (
                <Button variant="primary" iconRight="ArrowRight" onClick={next} aria-keyshortcuts="Enter" data-arcade-next>
                  Next
                </Button>
              )}
            </div>
          )}
        </div>
      }
      keys={[[`1–${q?.options.length ?? 2}`, 'answer'], ['Space', 'play again'], ['Enter', 'next']]}
      fx={fx}
      data={{ game: 'mode-match', index, answer: q?.mode, kind: q?.kind }}
    />
  );
}

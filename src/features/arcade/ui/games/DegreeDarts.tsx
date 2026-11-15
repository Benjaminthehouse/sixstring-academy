import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CountdownRing, Text } from '@/ui';
import { Fretboard, degreeText, noteText, useMusicSettings, type FretCell, type FretMarker } from '@/ui/music';
import { waitForNote } from '@/core/pitch';
import { DARTS_LEVELS, DEGREE_INFO, degreeCall, makeDartsRound } from '../../core/degreeDarts';
import { boxOf, posKey } from '../../core/focus';
import { addHit, addMiss, findPoints, newTally, starsFor } from '../../core/scoring';
import { appIsSounding, hitSound, missSound, playNote } from '../sound';
import { audioClock, cellElement, countsAsWrong, noteMarker, pitchWaitOptions, secondsText, useRoundClock } from '../kit';
import { RoundFrame } from '../RoundFrame';
import { MicLine } from '../MicLine';
import type { GameProps } from '../types';
import styles from '../Arcade.module.css';

interface Thrown {
  degree: string;
  firstTry: boolean;
  seconds: number;
}

/** Degree Darts: a degree is called; hit it anywhere in the shape, and learn what it does. */
export function DegreeDarts({ ctx, input, mic, anyOctave, running, fx, title, onFinish, onEnd }: GameProps) {
  const level = DARTS_LEVELS.find((l) => l.n === ctx.level) ?? DARTS_LEVELS[0];
  const round = useMemo(() => makeDartsRound(ctx.pattern, ctx.scale.degrees, level, ctx.seed, ctx.size), [ctx.pattern, ctx.scale.degrees, level, ctx.seed, ctx.size]);
  const { naming } = useMusicSettings();
  const [index, setIndex] = useState(0);
  const [tally, setTally] = useState(newTally);
  const [thrown, setThrown] = useState<Thrown[]>([]);
  const [missesHere, setMissesHere] = useState(0);
  const [flash, setFlash] = useState<{ keys: string[]; markers: FretMarker[] } | null>(null);
  const [status, setStatus] = useState<{ kind: string; text: string; role?: string }>({ kind: 'waiting', text: '' });
  const boardRef = useRef<HTMLDivElement>(null);
  const shownAt = useRef({ wall: 0, audio: 0 });
  const elapsed = useRoundClock(running);
  const finished = useRef(false);
  const dart = round.darts[index];
  const timed = !!level.seconds;

  useEffect(() => {
    if (running) shownAt.current = { wall: performance.now(), audio: audioClock() };
  }, [index, running]);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 700);
    return () => window.clearTimeout(id);
  }, [flash]);

  const finish = useCallback(
    (done: Thrown[], t: typeof tally) => {
      if (finished.current) return;
      finished.current = true;
      const firstTry = done.filter((d) => d.firstTry).length;
      const asked = timed ? done.length + (missesHere > 0 ? 1 : 0) : round.darts.length;
      const accuracy = asked ? firstTry / asked : 0;
      // The degree missed most often is the one to learn next.
      const missed = new Map<string, number>();
      for (const d of done) if (!d.firstTry) missed.set(d.degree, (missed.get(d.degree) ?? 0) + 1);
      const worst = [...missed.entries()].sort((a, b) => b[1] - a[1])[0];
      const avg = done.length ? done.reduce((s, d) => s + d.seconds, 0) / done.length : 0;
      onFinish({
        score: t.score,
        accuracy,
        stars: starsFor(accuracy),
        bestCombo: t.bestCombo,
        mistakes: t.misses,
        count: done.length,
        durationSec: Math.round(elapsed()),
        perfect: t.misses === 0 && done.length > 0,
        stats: [
          { label: 'Hits', value: `${done.length}${timed ? '' : ` of ${round.darts.length}`}` },
          { label: 'First try', value: `${firstTry}` },
          { label: 'Average throw', value: done.length ? secondsText(avg) : '–' },
          { label: 'Best combo', value: `${t.bestCombo}` },
        ],
        tip: worst
          ? `Work on ${degreeCall(worst[0])}: ${DEGREE_INFO[worst[0]]?.role ?? ''} In this scale it is ${noteText(round.darts.find((d) => d.degree === worst[0])?.note ?? '', naming)}.`
          : 'Every dart on target. Next time say each degree out loud as you hit it.',
        marks: done.map((d) => (d.firstTry ? (d.seconds < 3 ? 'ok' : 'meh') : 'bad')),
      });
    },
    [elapsed, missesHere, naming, onFinish, round.darts, timed],
  );

  const hit = useCallback(
    (pos: { string: number; fret: number; midi: number }, viaMic: boolean, pluckTime?: number) => {
      if (!dart || finished.current) return;
      const seconds = viaMic && pluckTime !== undefined ? Math.max(0.15, pluckTime - shownAt.current.audio) : (performance.now() - shownAt.current.wall) / 1000;
      const firstTry = missesHere === 0;
      const points = findPoints(seconds, tally.combo, firstTry);
      const t = firstTry ? addHit(tally, points) : { ...tally, score: tally.score + points, hits: tally.hits + 1 };
      const done = [...thrown, { degree: dart.degree, firstTry, seconds }];
      setTally(t);
      setThrown(done);
      setMissesHere(0);
      const answer = dart.answers.find((a) => a.string === pos.string && a.fret === pos.fret) ?? dart.answers.find((a) => a.midi === pos.midi) ?? dart.answers[0];
      // Light every place that degree sits: one hit shows the whole family.
      setFlash({ keys: dart.answers.map(posKey), markers: dart.answers.map((a) => noteMarker(a, { label: 'degree', color: 'degree', state: posKey(a) === posKey(answer) ? 'hit' : 'normal' })) });
      if (!viaMic) playNote(answer.midi, answer.string);
      hitSound(t.combo, viaMic);
      const el = cellElement(boardRef.current, answer);
      fx.burst(el, t.combo >= 10 ? 'streak' : 'ok');
      fx.pop(el, `+${points}`);
      setStatus({ kind: 'hit', text: `${noteText(answer.note, naming)} is ${degreeCall(dart.degree)}.`, role: DEGREE_INFO[dart.degree]?.role });
      if (index + 1 >= round.darts.length) finish(done, t);
      else setIndex(index + 1);
    },
    [dart, missesHere, tally, thrown, fx, naming, index, round.darts.length, finish],
  );

  const miss = useCallback(
    (cell: { string: number; fret: number; note: string; midi: number } | null) => {
      if (!dart || finished.current) return;
      setTally((t) => addMiss(t));
      setMissesHere((m) => m + 1);
      missSound();
      const inShape = cell ? ctx.pattern.notes.find((n) => n.string === cell.string && n.fret === cell.fret) : undefined;
      if (cell) fx.shake(cellElement(boardRef.current, cell));
      if (cell && inShape) {
        setFlash({ keys: [posKey(cell)], markers: [noteMarker(inShape, { label: 'degree', color: 'bad', state: 'miss' })] });
        setStatus({ kind: 'miss', text: `That is ${degreeCall(inShape.degree)} (${noteText(inShape.note, naming)}). Count from the root to ${degreeCall(dart.degree)}.` });
      } else {
        if (cell) setFlash({ keys: [posKey(cell)], markers: [{ string: cell.string, fret: cell.fret, label: cell.note, noteLabel: true, note: cell.note, color: 'bad', state: 'miss' }] });
        setStatus({ kind: 'miss', text: cell ? `${noteText(cell.note, naming)} is not in the shape.` : `Not ${degreeCall(dart.degree)}. Count up from the root.` });
      }
    },
    [dart, fx, naming, ctx.pattern.notes],
  );

  const onCell = useCallback(
    (cell: FretCell) => {
      if (!running || !dart) return;
      if (dart.answers.some((a) => a.string === cell.string && a.fret === cell.fret)) hit(cell, false);
      else {
        playNote(cell.midi, cell.string, undefined, 0.45);
        miss(cell);
      }
    },
    [running, dart, hit, miss],
  );

  const hitRef = useRef(hit);
  hitRef.current = hit;
  const missRef = useRef(miss);
  missRef.current = miss;
  useEffect(() => {
    if (!running || input !== 'mic' || !mic.tracker || !dart) return;
    const midis = [...new Set(dart.answers.map((a) => a.midi))];
    const wait = waitForNote(mic.tracker, midis, {
      ...pitchWaitOptions(anyOctave),
      onWrongNote: (n) => {
        if (countsAsWrong(n.midi) && !appIsSounding()) missRef.current(null);
      },
    });
    let live = true;
    void wait.then((r) => {
      if (!live || !r.ok) return;
      const pos = dart.answers.find((a) => a.midi === r.midi) ?? dart.answers[0];
      hitRef.current(pos, true, r.time);
    });
    return () => {
      live = false;
      wait.cancel();
    };
  }, [running, input, mic.tracker, dart, anyOctave]);

  const markers = useMemo(() => {
    const out: FretMarker[] = [];
    if (level.shape === 'shown') for (const n of ctx.pattern.notes) out.push(noteMarker(n, { label: 'none', color: 'neutral' }));
    if (missesHere >= 2 && dart) for (const a of dart.answers) out.push(noteMarker(a, { label: 'degree', color: 'accent', state: 'target' }));
    if (flash) {
      const keys = new Set(flash.keys);
      for (let i = out.length - 1; i >= 0; i--) if (keys.has(posKey(out[i]))) out.splice(i, 1);
      out.push(...flash.markers);
    }
    return out;
  }, [level.shape, ctx.pattern.notes, missesHere, dart, flash]);

  const prompt = dart ? (
    <>
      <span className={styles.promptKicker}>{input === 'mic' ? 'Play' : 'Hit'}</span>
      <span className={styles.promptBig} data-arcade-call={dart.degree}>
        {degreeCall(dart.degree)}
      </span>
      <span className={styles.promptHint}>
        Degree {degreeText(dart.degree)} of {ctx.scaleName}
        {dart.answers.length > 1 ? `: ${dart.answers.length} places in this shape` : ''}
      </span>
    </>
  ) : null;

  return (
    <RoundFrame
      title={title}
      progress={timed ? null : { value: thrown.length, max: round.darts.length }}
      score={tally.score}
      combo={tally.combo}
      timer={timed ? <CountdownRing seconds={level.seconds!} running={running} onDone={() => finish(thrown, tally)} size={44} /> : undefined}
      onEnd={onEnd}
      prompt={prompt}
      status={
        status.text ? (
          <span className={styles.statusStack}>
            <Text tone={status.kind === 'hit' ? 'ok' : 'bad'} weight="semibold">
              {status.text}
            </Text>
            {status.role && <Text tone="muted" size="sm">{status.role}</Text>}
          </span>
        ) : (
          <Text tone="muted">{!running ? 'Get ready…' : level.shape === 'shown' ? 'The larger dots are the roots: count from there.' : 'The shape is hidden. Find the root in your head, then count.'}</Text>
        )
      }
      statusKind={status.kind}
      board={
        <div ref={boardRef} className={styles.board}>
          <Fretboard frets={round.frets} tuning={ctx.tuning} markers={markers} box={level.shape === 'hidden' ? boxOf(ctx.pattern) : null} onCellClick={onCell} cellLabels="position" noteContext={{ tonic: ctx.focus.tonic, scale: ctx.focus.scale }} />
        </div>
      }
      controls={input === 'mic' ? <MicLine mic={mic} /> : undefined}
      fx={fx}
      data={{ game: 'degree-darts', index, call: dart?.degree, answers: dart ? dart.answers.map(posKey).join(' ') : '' }}
    />
  );
}

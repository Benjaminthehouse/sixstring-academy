import { useCallback, useMemo, useRef, useState } from 'react';
import { CountdownRing, Text, useMediaQuery } from '@/ui';
import { Fretboard, degreeText, noteText, useMusicSettings, type FretCell, type FretMarker } from '@/ui/music';
import { SPRINT_LEVELS, makeSprintRound, sprintScore } from '../../core/sprint';
import { degreeCall } from '../../core/degreeDarts';
import { posKey } from '../../core/focus';
import { addHit, addMiss, comboMultiplier, newTally, starsFor } from '../../core/scoring';
import { hitSound, missSound, playNote } from '../sound';
import { cellElement, secondsText, useRoundClock } from '../kit';
import { RoundFrame } from '../RoundFrame';
import type { GameProps } from '../types';
import styles from '../Arcade.module.css';

interface SprintDone {
  found: number;
  total: number;
  wrong: number;
  secondsLeft: number;
  score: number;
}

/** Fretboard Sprint: find every place one note of the scale sits on the neck, against the clock. */
export function Sprint({ ctx, running, fx, title, onFinish, onEnd }: GameProps) {
  const level = SPRINT_LEVELS.find((l) => l.n === ctx.level) ?? SPRINT_LEVELS[0];
  const round = useMemo(() => makeSprintRound(ctx.focus, ctx.scale.degrees, level, ctx.seed, { size: ctx.size, tuning: ctx.tuning }), [ctx.focus, ctx.scale.degrees, level, ctx.seed, ctx.size, ctx.tuning]);
  const { naming } = useMusicSettings();
  const [index, setIndex] = useState(0);
  const [found, setFound] = useState<Set<string>>(() => new Set());
  const [wrong, setWrong] = useState(0);
  const [reveal, setReveal] = useState(false);
  const [done, setDone] = useState<SprintDone[]>([]);
  const [tally, setTally] = useState(newTally);
  const [flash, setFlash] = useState<FretMarker | null>(null);
  const [status, setStatus] = useState<{ kind: string; text: string }>({ kind: 'waiting', text: '' });
  const boardRef = useRef<HTMLDivElement>(null);
  const sprintStart = useRef<number>(0);
  const elapsed = useRoundClock(running);
  const finished = useRef(false);
  const sprint = round.sprints[index];
  // A phone held upright gets the neck standing up: twelve frets fit down the screen, not across.
  const upright = useMediaQuery('(max-width: 719px) and (orientation: portrait)');

  if (running && sprintStart.current === 0) sprintStart.current = performance.now();

  const finishAll = useCallback(
    (all: SprintDone[], t: typeof tally) => {
      if (finished.current) return;
      finished.current = true;
      const totals = all.reduce((s, d) => ({ found: s.found + d.found, total: s.total + d.total, wrong: s.wrong + d.wrong }), { found: 0, total: 0, wrong: 0 });
      const accuracy = totals.total ? totals.found / (totals.total + totals.wrong) : 0;
      onFinish({
        score: all.reduce((s, d) => s + d.score, 0) + t.score,
        accuracy,
        stars: starsFor(accuracy),
        bestCombo: t.bestCombo,
        mistakes: totals.wrong + (totals.total - totals.found),
        count: totals.found,
        durationSec: Math.round(elapsed()),
        perfect: totals.wrong === 0 && totals.found === totals.total,
        stats: [
          { label: 'Found', value: `${totals.found} of ${totals.total}` },
          { label: 'Wrong taps', value: `${totals.wrong}` },
          { label: 'Time to spare', value: secondsText(all.reduce((s, d) => s + d.secondsLeft, 0)) },
          { label: 'Sprints', value: `${all.length}` },
        ],
        tip:
          totals.found === totals.total
            ? 'Every one found. Notice the octave shape: two strings up and two frets higher (three frets higher when you cross the B string).'
            : 'Find the notes on the low E and A strings first; the octave shapes give you the rest.',
        marks: all.map((d) => (d.found === d.total && d.wrong === 0 ? 'ok' : d.found >= d.total * 0.6 ? 'meh' : 'bad')),
      });
    },
    [elapsed, onFinish],
  );

  const endSprint = useCallback(
    (foundCount: number, wrongCount: number, t: typeof tally, timeUp: boolean) => {
      if (!sprint) return;
      const left = Math.max(0, level.seconds - (performance.now() - sprintStart.current) / 1000);
      const s = sprintScore({ found: foundCount, total: sprint.positions.length, wrong: wrongCount, secondsLeft: timeUp ? 0 : left });
      const all = [...done, { found: foundCount, total: sprint.positions.length, wrong: wrongCount, secondsLeft: timeUp ? 0 : left, score: s.score - foundCount * 100 }];
      setDone(all);
      setReveal(timeUp);
      setStatus(
        timeUp
          ? { kind: 'miss', text: `Time. ${foundCount} of ${sprint.positions.length}: the ones left are shown.` }
          : { kind: 'hit', text: `All ${sprint.positions.length} in ${secondsText(level.seconds - left)}. +${Math.round(left) * 10} time bonus.` },
      );
      window.setTimeout(
        () => {
          if (index + 1 >= round.sprints.length) finishAll(all, t);
          else {
            setIndex(index + 1);
            setFound(new Set());
            setWrong(0);
            setReveal(false);
            sprintStart.current = performance.now();
            setStatus({ kind: 'waiting', text: '' });
          }
        },
        timeUp ? 1800 : 900,
      );
    },
    [sprint, level.seconds, done, index, round.sprints.length, finishAll],
  );

  const onCell = useCallback(
    (cell: FretCell) => {
      if (!running || !sprint || reveal || finished.current) return;
      const key = posKey(cell);
      const el = cellElement(boardRef.current, cell);
      playNote(cell.midi, cell.string, undefined, 0.5);
      if (found.has(key)) return;
      if (sprint.positions.some((p) => posKey(p) === key)) {
        const next = new Set(found);
        next.add(key);
        const points = Math.round(100 * comboMultiplier(tally.combo));
        const t = addHit(tally, points);
        setFound(next);
        setTally(t);
        hitSound(t.combo, true);
        fx.burst(el, t.combo >= 8 ? 'streak' : 'ok');
        fx.pop(el, `+${points}`);
        setStatus({ kind: 'hit', text: `${next.size} of ${sprint.positions.length}` });
        if (next.size >= sprint.positions.length) endSprint(next.size, wrong, t, false);
      } else {
        setWrong((w) => w + 1);
        setTally((t) => addMiss(t));
        missSound();
        fx.shake(el);
        setFlash({ string: cell.string, fret: cell.fret, label: cell.note, noteLabel: true, note: cell.note, color: 'bad', state: 'miss' });
        window.setTimeout(() => setFlash(null), 800);
        setStatus({ kind: 'miss', text: `That is ${noteText(cell.note, naming)}.` });
      }
    },
    [running, sprint, reveal, found, tally, fx, wrong, endSprint, naming],
  );

  const markers = useMemo(() => {
    if (!sprint) return [];
    const out: FretMarker[] = [];
    for (const p of sprint.positions) {
      const key = posKey(p);
      if (found.has(key)) out.push({ string: p.string, fret: p.fret, label: sprint.note, noteLabel: true, note: sprint.note, color: 'ok', state: 'normal', root: sprint.degree === '1' });
      else if (reveal) out.push({ string: p.string, fret: p.fret, label: sprint.note, noteLabel: true, note: sprint.note, color: 'neutral', state: 'ghost' });
    }
    if (flash) out.push(flash);
    return out;
  }, [sprint, found, reveal, flash]);

  const prompt = sprint ? (
    <>
      <span className={styles.promptKicker}>
        Sprint {index + 1} of {round.sprints.length} · {sprint.degree === '1' ? 'the root' : degreeCall(sprint.degree)}
      </span>
      <span className={styles.promptBig} data-arcade-call={sprint.note}>
        Every {noteText(sprint.note, naming)}
      </span>
      <span className={styles.promptHint}>
        {sprint.positions.length} on frets 0–{level.maxFret} · degree {degreeText(sprint.degree)} of {ctx.scaleName}
      </span>
    </>
  ) : null;

  return (
    <RoundFrame
      title={title}
      progress={sprint ? { value: found.size, max: sprint.positions.length } : null}
      score={done.reduce((s, d) => s + d.score, 0) + tally.score}
      combo={tally.combo}
      timer={sprint ? <CountdownRing seconds={level.seconds} running={running && !reveal && found.size < sprint.positions.length} resetKey={index} onDone={() => endSprint(found.size, wrong, tally, true)} size={44} /> : undefined}
      onEnd={onEnd}
      prompt={prompt}
      status={status.text ? <Text tone={status.kind === 'hit' ? 'ok' : 'bad'} weight="semibold">{status.text}</Text> : <Text tone="muted">{running ? (upright ? 'Nut at the top. Tap every one you can find.' : 'Tap every one you can find.') : 'Get ready…'}</Text>}
      statusKind={status.kind}
      board={
        <div ref={boardRef} className={upright ? styles.boardUpright : styles.board}>
          <Fretboard frets={round.frets} tuning={ctx.tuning} markers={markers} onCellClick={onCell} cellLabels="position" orientation={upright ? 'vertical' : 'horizontal'} maxFretWidth={upright ? 46 : undefined} fretNumbers="all" noteContext={{ tonic: ctx.focus.tonic, scale: ctx.focus.scale }} />
        </div>
      }
      fx={fx}
      wide
      data={{ game: 'fretboard-sprint', index, note: sprint?.note, total: sprint?.positions.length, found: found.size, todo: sprint ? sprint.positions.map(posKey).filter((k) => !found.has(k)).join(' ') : '' }}
    />
  );
}

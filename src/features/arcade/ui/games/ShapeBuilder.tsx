import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Text, formatClock, useEventListener, useInterval } from '@/ui';
import { Fretboard, noteText, useMusicSettings, type FretCell, type FretMarker } from '@/ui/music';
import { scaleContains } from '@/core/theory';
import { judgeShapeTap, makeShapeRound, missReason, shapeScore } from '../../core/shapeBuilder';
import { boxOf, posKey } from '../../core/focus';
import { addHit, addMiss, comboMultiplier, newTally, starsFor } from '../../core/scoring';
import { hitSound, missSound, playNote } from '../sound';
import { cellElement, noteMarker, secondsText, useRoundClock } from '../kit';
import { RoundFrame } from '../RoundFrame';
import type { GameProps } from '../types';
import styles from '../Arcade.module.css';

/** Shape Builder: study the shape, then tap it back into place around its roots. */
export function ShapeBuilder({ ctx, running, fx, title, onFinish, onEnd }: GameProps) {
  const round = useMemo(() => makeShapeRound(ctx.pattern), [ctx.pattern]);
  const { naming } = useMusicSettings();
  const [stage, setStage] = useState<'study' | 'build'>('study');
  const [placed, setPlaced] = useState<Set<string>>(() => new Set());
  const [tally, setTally] = useState(newTally);
  const [peeks, setPeeks] = useState(0);
  const [peeking, setPeeking] = useState(false);
  const [flash, setFlash] = useState<{ key: string; marker: FretMarker } | null>(null);
  const [status, setStatus] = useState<{ kind: string; text: string }>({ kind: 'waiting', text: '' });
  const [, setTick] = useState(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const buildStarted = useRef<number | null>(null);
  const elapsed = useRoundClock(running);
  const finished = useRef(false);

  useInterval(() => setTick((t) => t + 1), running && stage === 'build' ? 1000 : null);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 900);
    return () => window.clearTimeout(id);
  }, [flash]);

  useEffect(() => {
    if (!peeking) return;
    const id = window.setTimeout(() => setPeeking(false), 1500);
    return () => window.clearTimeout(id);
  }, [peeking]);

  const startBuild = useCallback(() => {
    setStage('build');
    buildStarted.current = performance.now();
    setStatus({ kind: 'waiting', text: '' });
  }, []);

  useEventListener(typeof window === 'undefined' ? null : window, 'keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || stage !== 'study' || !running || e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.target as HTMLElement | null)?.closest?.('button, a, input, select, [role="dialog"]')) return;
    e.preventDefault();
    startBuild();
  });

  const buildSeconds = () => (buildStarted.current === null ? 0 : (performance.now() - buildStarted.current) / 1000);

  const finish = useCallback(
    (placedCount: number, t: typeof tally, peekCount: number) => {
      if (finished.current) return;
      finished.current = true;
      const seconds = buildSeconds();
      const { score, accuracy } = shapeScore({ placed: placedCount, mistakes: t.misses, peeks: peekCount, seconds });
      const stars = starsFor(accuracy);
      onFinish({
        score: score + t.score,
        accuracy,
        stars,
        bestCombo: t.bestCombo,
        mistakes: t.misses,
        count: placedCount,
        durationSec: Math.round(elapsed()),
        perfect: t.misses === 0 && peekCount === 0,
        stats: [
          { label: 'Notes placed', value: `${placedCount}` },
          { label: 'Slips', value: `${t.misses}` },
          { label: 'Peeks', value: `${peekCount}` },
          { label: 'Build time', value: secondsText(seconds) },
        ],
        tip:
          t.misses + peekCount === 0
            ? `${ctx.pattern.name} is in your hands. Play it on the guitar now, slowly, saying the root each time you land on it.`
            : 'Build it string by string: two or three notes on each, always counted from the root.',
        marks: [...Array(placedCount).fill('ok'), ...Array(Math.min(12, t.misses)).fill('bad'), ...Array(peekCount).fill('meh')],
      });
    },
    [ctx.pattern.name, elapsed, onFinish],
  );

  const onCell = useCallback(
    (cell: FretCell) => {
      if (!running || stage !== 'build' || finished.current) return;
      const verdict = judgeShapeTap(round, placed, cell);
      const el = cellElement(boardRef.current, cell);
      if (verdict.kind === 'anchor' || verdict.kind === 'already') {
        playNote(cell.midi, cell.string, undefined, 0.6);
        setStatus({ kind: 'waiting', text: verdict.kind === 'anchor' ? `That is the root, ${noteText(cell.note, naming)}. Build around it.` : 'Already placed.' });
        return;
      }
      if (verdict.kind === 'place') {
        const next = new Set(placed);
        next.add(posKey(cell));
        const points = Math.round(50 * comboMultiplier(tally.combo));
        const t = addHit(tally, points);
        setPlaced(next);
        setTally(t);
        playNote(verdict.note.midi, verdict.note.string);
        hitSound(t.combo, true);
        fx.burst(el, t.combo >= 8 ? 'streak' : 'ok');
        fx.pop(el, `+${points}`);
        setStatus({ kind: 'hit', text: `${noteText(verdict.note.note, naming)}, the ${verdict.note.degree === '1' ? 'root' : verdict.note.degree.replace('b', '♭').replace('#', '♯')}. ${round.toPlace.length - next.size} to go.` });
        if (next.size >= round.toPlace.length) finish(next.size, t, peeks);
        return;
      }
      const inScale = scaleContains(ctx.focus.tonic, ctx.focus.scale, cell.midi);
      setTally((t) => addMiss(t));
      playNote(cell.midi, cell.string, undefined, 0.4);
      missSound();
      fx.shake(el);
      setFlash({ key: posKey(cell), marker: { string: cell.string, fret: cell.fret, label: cell.note, noteLabel: true, note: cell.note, color: 'bad', state: 'miss' } });
      setStatus({ kind: 'miss', text: `${noteText(cell.note, naming)}: ${missReason(inScale, ctx.pattern.name).toLowerCase()}.` });
    },
    [running, stage, round, placed, tally, fx, naming, finish, peeks, ctx.focus.tonic, ctx.focus.scale, ctx.pattern.name],
  );

  const markers = useMemo(() => {
    const out: FretMarker[] = [];
    if (stage === 'study' || peeking) {
      for (const n of ctx.pattern.notes) {
        const isPlaced = placed.has(posKey(n));
        out.push(noteMarker(n, { label: 'note', color: 'degree', state: stage === 'build' && !n.isRoot && !isPlaced ? 'ghost' : 'normal' }));
      }
    } else {
      for (const n of round.anchors) out.push(noteMarker(n, { label: 'note', color: 'degree' }));
      for (const n of round.toPlace) if (placed.has(posKey(n))) out.push(noteMarker(n, { label: 'note', color: 'degree' }));
    }
    if (flash) out.push(flash.marker);
    return out;
  }, [stage, peeking, ctx.pattern.notes, round, placed, flash]);

  const left = round.toPlace.length - placed.size;
  const prompt =
    stage === 'study' ? (
      <>
        <span className={styles.promptKicker}>Study it</span>
        <span className={styles.promptBig}>{ctx.pattern.name}</span>
        <span className={styles.promptHint}>
          {ctx.pattern.notes.length} notes, {ctx.pattern.positionName.toLowerCase()}. When it is in your head, hide it.
        </span>
      </>
    ) : (
      <>
        <span className={styles.promptKicker}>Build it back</span>
        <span className={styles.promptBig}>{left === 0 ? 'Done' : `${left} to place`}</span>
        <span className={styles.promptHint}>The roots are given. Tap every other note of {ctx.pattern.name}.</span>
      </>
    );

  return (
    <RoundFrame
      title={title}
      progress={{ value: placed.size, max: round.toPlace.length }}
      score={tally.score}
      combo={tally.combo}
      timer={stage === 'build' ? <span className={styles.clock}>{formatClock(Math.floor(buildSeconds()))}</span> : undefined}
      onEnd={onEnd}
      prompt={prompt}
      status={status.text ? <Text tone={status.kind === 'hit' ? 'ok' : status.kind === 'miss' ? 'bad' : 'muted'} weight="semibold">{status.text}</Text> : <Text tone="muted">{stage === 'study' ? 'The coloured dots are the shape; the bigger ones are its roots.' : 'Tap a fret to place a note.'}</Text>}
      statusKind={status.kind}
      board={
        <div ref={boardRef} className={styles.board}>
          <Fretboard frets={round.frets} tuning={ctx.tuning} markers={markers} box={stage === 'study' ? boxOf(ctx.pattern) : null} onCellClick={onCell} cellLabels="position" noteContext={{ tonic: ctx.focus.tonic, scale: ctx.focus.scale }} />
        </div>
      }
      controls={
        stage === 'study' ? (
          <Button variant="primary" size="lg" iconLeft="EyeOff" onClick={startBuild} disabled={!running} data-arcade-build aria-keyshortcuts="Enter">
            Hide it and build
          </Button>
        ) : (
          <Button
            iconLeft="Eye"
            onClick={() => {
              setPeeks((p) => p + 1);
              setPeeking(true);
            }}
            disabled={peeking || finished.current}
            data-arcade-peek
          >
            Peek (counts as a slip)
          </Button>
        )
      }
      keys={[['Enter', stage === 'study' ? 'hide and build' : 'place the focused fret'], ['←→↑↓', 'move on the neck']]}
      fx={fx}
      data={{ game: 'shape-builder', stage, placed: placed.size, left, todo: round.toPlace.filter((n) => !placed.has(posKey(n))).map(posKey).join(' ') }}
    />
  );
}

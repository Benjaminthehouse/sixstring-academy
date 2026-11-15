import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Icon, Text, cx, useEventListener } from '@/ui';
import { Fretboard, TabSnippet, noteText, useMusicSettings, type FretCell, type FretMarker } from '@/ui/music';
import { NoteRecorder } from '@/core/pitch';
import { audioNow, stopAll, unlockAudio } from '@/core/audio';
import { LICK_LEVELS, makeLickRound, markLick, type LickMark } from '../../core/lickEcho';
import { comboMultiplier, newTally, starsFor } from '../../core/scoring';
import { hitSound, missSound, playNote } from '../sound';
import { cellElement, noteMarker, useRoundClock } from '../kit';
import { RoundFrame } from '../RoundFrame';
import { MicLine } from '../MicLine';
import type { GameProps } from '../types';
import styles from '../Arcade.module.css';

type Phase = 'listen' | 'answer' | 'marked';

/** Lick Echo: hear a short phrase from the shape, play it back; every note is checked in order. */
export function LickEcho({ ctx, input, mic, anyOctave, running, fx, title, onFinish, onEnd }: GameProps) {
  const level = LICK_LEVELS.find((l) => l.n === ctx.level) ?? LICK_LEVELS[0];
  const round = useMemo(() => makeLickRound(ctx.pattern, level, ctx.seed, ctx.size), [ctx.pattern, level, ctx.seed, ctx.size]);
  const { naming } = useMusicSettings();
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('listen');
  const [entered, setEntered] = useState<Array<{ midi: number; note: string }>>([]);
  const [marks, setMarks] = useState<LickMark[]>([]);
  const [tally, setTally] = useState(newTally);
  const [playing, setPlaying] = useState(false);
  const [heard, setHeard] = useState(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const playTimer = useRef<number | null>(null);
  const elapsed = useRoundClock(running);
  const finished = useRef(false);
  const lick = round.licks[index];
  const mark = marks[index] ?? null;
  const octaves = anyOctave ? 'any' : 'exact';

  const stopPlayback = useCallback(() => {
    if (playTimer.current !== null) window.clearTimeout(playTimer.current);
    playTimer.current = null;
    try {
      stopAll();
    } catch {
      /* no audio */
    }
    setPlaying(false);
  }, []);
  useEffect(() => stopPlayback, [stopPlayback]);

  /** Play the phrase; when it is over, it is the learner's turn. */
  const playLick = useCallback(async () => {
    if (!lick) return;
    stopPlayback();
    await unlockAudio().catch(() => false);
    const t0 = audioNow() + 0.15;
    lick.notes.forEach((n, i) => playNote(n.midi, n.string, t0 + i * lick.step, i === lick.notes.length - 1 ? lick.step * 2 : lick.step * 0.95));
    setPlaying(true);
    setPhase((p) => (p === 'marked' ? p : 'listen'));
    const total = 0.15 + lick.notes.length * lick.step + lick.step + 0.35;
    playTimer.current = window.setTimeout(() => {
      playTimer.current = null;
      setPlaying(false);
      setPhase((p) => (p === 'marked' ? p : 'answer'));
    }, total * 1000);
  }, [lick, stopPlayback]);

  useEffect(() => {
    if (!running || !lick) return;
    setEntered([]);
    setHeard(0);
    void playLick();
  }, [running, index]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = useCallback(
    (all: LickMark[], t: typeof tally) => {
      if (finished.current) return;
      finished.current = true;
      stopPlayback();
      const expected = round.licks.reduce((s, l) => s + l.midis.length, 0);
      const right = all.reduce((s, m) => s + m.comparison.correct, 0);
      const accuracy = expected ? right / expected : 0;
      const perfect = all.filter((m) => m.perfect).length;
      onFinish({
        score: t.score,
        accuracy,
        stars: starsFor(accuracy),
        bestCombo: t.bestCombo,
        mistakes: all.reduce((s, m) => s + m.comparison.missed.length + m.comparison.extra.length, 0),
        count: right,
        durationSec: Math.round(elapsed()),
        perfect: perfect === round.licks.length,
        stats: [
          { label: 'Phrases echoed', value: `${perfect} of ${round.licks.length}` },
          { label: 'Notes right', value: `${right} of ${expected}` },
          { label: 'Phrase length', value: `${level.length} notes` },
          { label: 'Best combo', value: `${t.bestCombo}` },
        ],
        tip:
          perfect === round.licks.length
            ? 'Every phrase echoed. Next, sing each one before you play it.'
            : 'Hum the phrase back first, then find its first note. Most phrases move to the next note of the shape.',
        marks: all.map((m) => (m.perfect ? 'ok' : m.comparison.accuracy >= 0.5 ? 'meh' : 'bad')),
      });
    },
    [elapsed, level.length, onFinish, round.licks, stopPlayback],
  );

  /** Mark what was played (tapped or heard) against the phrase. */
  const submit = useCallback(
    (played: number[]) => {
      if (!lick || finished.current || marks[index]) return;
      const m = markLick(played, lick.midis, octaves);
      const all = [...marks];
      all[index] = m;
      setMarks(all);
      setPhase('marked');
      let t = { ...tally };
      if (m.perfect) {
        const combo = t.combo + 1;
        t = { ...t, combo, bestCombo: Math.max(t.bestCombo, combo), hits: t.hits + 1, score: t.score + Math.round(m.points * comboMultiplier(t.combo)) };
        hitSound(combo, input === 'mic');
        const last = lick.notes[lick.notes.length - 1];
        const el = cellElement(boardRef.current, last);
        fx.burst(el, 'ok', 'lg');
        fx.pop(el, `+${Math.round(m.points * comboMultiplier(tally.combo))}`);
      } else {
        t = { ...t, combo: 0, misses: t.misses + 1, score: t.score + m.points };
        missSound();
      }
      setTally(t);
      if (index + 1 >= round.licks.length) window.setTimeout(() => finish(all, t), m.perfect ? 1000 : 2200);
      else if (m.perfect) window.setTimeout(() => setIndex((i) => i + 1), 1100);
    },
    [lick, marks, index, octaves, tally, input, fx, round.licks.length, finish],
  );

  // The microphone: record from the end of the phrase until the learner has played it.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    if (!running || input !== 'mic' || !mic.tracker || phase !== 'answer' || !lick) return;
    const rec = new NoteRecorder(mic.tracker, { minDurationMs: 50, onNote: (_n, all) => setHeard(all.length) });
    rec.start();
    const startedAt = performance.now();
    let nearlyAt: number | null = null;
    const id = window.setInterval(() => {
      const done = rec.notes.length;
      if (done >= lick.midis.length - 1 && nearlyAt === null) nearlyAt = performance.now();
      const enough = done >= lick.midis.length || (nearlyAt !== null && performance.now() - nearlyAt > Math.max(900, lick.step * 2000));
      const timedOut = performance.now() - startedAt > 5000 + lick.midis.length * 1500;
      if (enough || timedOut) {
        window.clearInterval(id);
        const take = rec.stop();
        submitRef.current(take.slice(0, lick.midis.length + 2).map((n) => n.midi));
      }
    }, 150);
    return () => {
      window.clearInterval(id);
      if (rec.recording) rec.stop();
    };
  }, [running, input, mic.tracker, phase, lick]);

  const onCell = useCallback(
    (cell: FretCell) => {
      if (!running || !lick) return;
      playNote(cell.midi, cell.string, undefined, 0.6);
      if (phase === 'marked' || input === 'mic') return;
      if (playing) stopPlayback();
      const next = [...entered, { midi: cell.midi, note: cell.note }];
      setEntered(next);
      if (phase === 'listen') setPhase('answer');
      if (next.length >= lick.midis.length) submit(next.map((e) => e.midi));
    },
    [running, lick, phase, input, playing, stopPlayback, entered, submit],
  );

  const next = useCallback(() => {
    if (!marks[index] || index + 1 >= round.licks.length) return;
    setIndex((i) => i + 1);
  }, [marks, index, round.licks.length]);

  useEventListener(typeof window === 'undefined' ? null : window, 'keydown', (e: KeyboardEvent) => {
    if (!running || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest?.('input, textarea, select, [role="dialog"]')) return;
    if (e.key === ' ' && !target?.closest?.('button')) {
      e.preventDefault();
      void playLick();
    } else if (e.key === 'Backspace' && phase !== 'marked' && entered.length) {
      e.preventDefault();
      setEntered((x) => x.slice(0, -1));
    } else if (e.key === 'Enter' && phase === 'marked' && !target?.closest?.('button, a')) {
      e.preventDefault();
      next();
    }
  });

  const markers = useMemo(() => {
    const out: FretMarker[] = ctx.pattern.notes.map((n) => noteMarker(n, { label: 'none', color: 'neutral' }));
    if (lick && (level.show === 'first' || phase === 'marked')) {
      const shown = phase === 'marked' ? lick.notes : lick.notes.slice(0, 1);
      shown.forEach((n, i) => {
        const at = out.findIndex((m) => m.string === n.string && m.fret === n.fret);
        if (at >= 0) out.splice(at, 1);
        const state = phase === 'marked' ? (mark?.perNote[i] === 'right' ? 'hit' : 'miss') : 'target';
        out.push(noteMarker(n, { label: 'note', color: phase === 'marked' ? (mark?.perNote[i] === 'right' ? 'ok' : 'bad') : 'accent', state, id: `lick-${i}` }));
      });
    }
    return out;
  }, [ctx.pattern.notes, lick, level.show, phase, mark]);

  const slots = lick ? (
    <ol className={styles.slots} aria-label="Your notes" data-arcade-entered={entered.map((e) => e.midi).join(',')}>
      {lick.notes.map((n, i) => {
        const res = mark?.perNote[i];
        const mine = input === 'tap' ? entered[i] : undefined;
        const filled = input === 'mic' ? i < heard : !!mine;
        return (
          <li key={i} className={cx(styles.slot, filled && styles.slotFilled, res === 'right' && styles.slotRight, (res === 'wrong' || res === 'missed') && styles.slotWrong)}>
            {res ? noteText(n.note, naming) : mine ? noteText(mine.note, naming) : filled ? '•' : ''}
          </li>
        );
      })}
    </ol>
  ) : null;

  const prompt = lick ? (
    <>
      <span className={styles.promptKicker}>
        Phrase {index + 1} of {round.licks.length}
      </span>
      <span className={styles.promptBig}>{playing ? 'Listen…' : phase === 'marked' ? (mark?.perfect ? 'Echoed' : 'Close') : input === 'mic' ? 'Play it back' : 'Tap it back'}</span>
      {level.show === 'tab' ? (
        <TabSnippet className={styles.tab} tab={lick.tab} tempo={lick.bpm} time="4/4" tuning={ctx.tuning.id} size="sm" rhythm={false} aria-label="The phrase as tab" />
      ) : (
        <span className={styles.promptHint}>
          {level.show === 'first'
            ? `It starts on ${noteText(lick.notes[0].note, naming)}, string ${lick.notes[0].string}${lick.notes[0].fret === 0 ? ' open' : ` fret ${lick.notes[0].fret}`}.`
            : `${lick.notes.length} notes, by ear. Space plays it again.`}
        </span>
      )}
    </>
  ) : null;

  return (
    <RoundFrame
      title={title}
      progress={{ value: marks.filter(Boolean).length, max: round.licks.length }}
      score={tally.score}
      combo={tally.combo}
      onEnd={() => {
        stopPlayback();
        onEnd();
      }}
      prompt={prompt}
      status={
        <div className={styles.runStatus}>
          {slots}
          {mark ? (
            <Text tone={mark.perfect ? 'ok' : 'bad'} weight="semibold">
              {mark.perfect ? 'Every note, in order.' : `${mark.comparison.correct} of ${lick?.midis.length} right. The phrase is shown on the neck.`}
            </Text>
          ) : (
            <Text tone="muted">{!running ? 'Get ready…' : playing ? 'Listen to the whole phrase first.' : input === 'mic' ? 'Your turn: play it on your guitar.' : 'Tap the notes in order. Backspace takes one back.'}</Text>
          )}
        </div>
      }
      statusKind={mark ? (mark.perfect ? 'hit' : 'miss') : 'waiting'}
      board={
        <div ref={boardRef} className={styles.board}>
          <Fretboard frets={round.frets} tuning={ctx.tuning} markers={markers} onCellClick={onCell} cellLabels="position" noteContext={{ tonic: ctx.focus.tonic, scale: ctx.focus.scale }} />
        </div>
      }
      controls={
        <div className={styles.controlRow}>
          {input === 'mic' && <MicLine mic={mic} hint={phase === 'answer' ? 'Your turn: listening' : 'Waiting for the phrase'} />}
          <Button iconLeft={playing ? 'AudioLines' : 'RotateCcw'} onClick={() => void playLick()} aria-keyshortcuts="Space" data-arcade-replay>
            Play it again
          </Button>
          {input === 'tap' && phase !== 'marked' && entered.length > 0 && (
            <Button variant="ghost" iconLeft="Undo2" onClick={() => setEntered((x) => x.slice(0, -1))}>
              Undo
            </Button>
          )}
          {phase === 'marked' && !mark?.perfect && index + 1 < round.licks.length && (
            <Button variant="primary" iconRight="ArrowRight" onClick={next} aria-keyshortcuts="Enter" data-arcade-next>
              Next phrase
            </Button>
          )}
          {phase === 'marked' && mark?.perfect && <Icon name="CircleCheck" size={24} className={styles.okIcon} label="Echoed" />}
        </div>
      }
      keys={[['Space', 'play again'], ['Backspace', 'undo'], ['Enter', 'next']]}
      fx={fx}
      data={{ game: 'lick-echo', index, phase, lick: lick?.midis.join(','), answers: lick ? lick.notes.map((n) => `${n.string}:${n.fret}`).join(' ') : '' }}
    />
  );
}

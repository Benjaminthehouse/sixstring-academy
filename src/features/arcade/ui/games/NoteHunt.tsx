import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CountdownRing, Icon, Text } from '@/ui';
import { Fretboard, noteText, useMusicSettings, type FretCell, type FretMarker } from '@/ui/music';
import { waitForNote } from '@/core/pitch';
import { NOTE_HUNT_LEVELS, answersTarget, makeNoteHuntRound, targetMidis, type HuntTarget } from '../../core/noteHunt';
import { boxOf, posKey } from '../../core/focus';
import { addHit, addMiss, findPoints, newTally, speedOf, starsFor, type Speed } from '../../core/scoring';
import { appIsSounding, hitSound, missSound, playNote } from '../sound';
import { audioClock, cellElement, countsAsWrong, noteMarker, pitchWaitOptions, secondsText, useRoundClock } from '../kit';
import { RoundFrame } from '../RoundFrame';
import { MicLine } from '../MicLine';
import type { GameProps } from '../types';
import styles from '../Arcade.module.css';

interface Found {
  index: number;
  firstTry: boolean;
  seconds: number;
  speed: Speed;
  note: string;
}

type Flash = { kind: 'hit' | 'miss'; key: string; marker: FretMarker; until: number } | null;

const SPEED_WORD: Record<Speed, string> = { fast: 'Fast', good: 'Good', slow: 'Got it' };

/** Note Hunt: one note at a time lights up (or is named) in the shape; find it. */
export function NoteHunt({ ctx, input, mic, anyOctave, running, fx, title, onFinish, onEnd }: GameProps) {
  const level = NOTE_HUNT_LEVELS.find((l) => l.n === ctx.level) ?? NOTE_HUNT_LEVELS[0];
  const round = useMemo(() => makeNoteHuntRound(ctx.pattern, level, ctx.seed, ctx.size), [ctx.pattern, level, ctx.seed, ctx.size]);
  const { naming } = useMusicSettings();
  const [index, setIndex] = useState(0);
  const [tally, setTally] = useState(newTally);
  const [found, setFound] = useState<Found[]>([]);
  const [missesHere, setMissesHere] = useState(0);
  const [flash, setFlash] = useState<Flash>(null);
  const [status, setStatus] = useState<{ kind: string; text: string }>({ kind: 'waiting', text: '' });
  const boardRef = useRef<HTMLDivElement>(null);
  const shownAt = useRef({ wall: 0, audio: 0 });
  const elapsed = useRoundClock(running);
  const finished = useRef(false);
  const target: HuntTarget | undefined = round.targets[index];
  const timed = !!level.seconds;

  // Each new target starts its own stopwatch (wall clock for taps, audio clock for the microphone).
  useEffect(() => {
    if (!running) return;
    shownAt.current = { wall: performance.now(), audio: audioClock() };
  }, [index, running]);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), Math.max(0, flash.until - performance.now()));
    return () => window.clearTimeout(id);
  }, [flash]);

  const finish = useCallback(
    (done: Found[], t: typeof tally) => {
      if (finished.current) return;
      finished.current = true;
      const firstTry = done.filter((f) => f.firstTry).length;
      // A rush counts the notes reached (the one being hunted when time ran out, if it was tried).
      const asked = timed ? done.length + (missesHere > 0 ? 1 : 0) : round.targets.length;
      const accuracy = asked === 0 ? 0 : firstTry / asked;
      const times = done.map((f) => f.seconds);
      const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
      // The note that took longest on average is the one to look at again.
      const byNote = new Map<string, number[]>();
      for (const f of done) byNote.set(f.note, [...(byNote.get(f.note) ?? []), f.seconds + (f.firstTry ? 0 : 2)]);
      const slowest = [...byNote.entries()].map(([n, s]) => [n, s.reduce((a, b) => a + b, 0) / s.length] as const).sort((a, b) => b[1] - a[1])[0];
      const stars = starsFor(accuracy);
      onFinish({
        score: t.score,
        accuracy,
        stars,
        bestCombo: t.bestCombo,
        mistakes: t.misses,
        count: done.length,
        durationSec: Math.round(elapsed()),
        perfect: t.misses === 0 && done.length > 0,
        stats: [
          { label: 'Found', value: `${done.length}${timed ? '' : ` of ${round.targets.length}`}` },
          { label: 'First try', value: `${firstTry}` },
          { label: 'Average find', value: times.length ? secondsText(avg) : '–' },
          { label: 'Fastest', value: times.length ? secondsText(Math.min(...times)) : '–' },
        ],
        tip: slowest && slowest[1] > 2 ? `${noteText(slowest[0], naming)} took you longest. Before the next round, find every ${noteText(slowest[0], naming)} in the shape and say its name as you play it.` : stars >= 3 ? 'Clean and quick. Try the next level, or the same shape from memory.' : 'Look one note ahead: while you play this one, find the next.',
        marks: done.map((f) => (!f.firstTry ? 'bad' : f.speed === 'slow' ? 'meh' : 'ok')),
        detail: done.map((f) => `${f.firstTry ? 'first' : 'retry'}:${f.speed}`).join(' '),
      });
    },
    [elapsed, missesHere, naming, onFinish, round.targets.length, timed],
  );

  const hit = useCallback(
    (pos: { string: number; fret: number; midi: number }, viaMic: boolean, pluckTime?: number) => {
      if (!target || finished.current) return;
      const seconds = viaMic && pluckTime !== undefined ? Math.max(0.15, pluckTime - shownAt.current.audio) : (performance.now() - shownAt.current.wall) / 1000;
      const firstTry = missesHere === 0;
      const points = findPoints(seconds, tally.combo, firstTry);
      const nextTally = firstTry ? addHit(tally, points) : { ...tally, score: tally.score + points, hits: tally.hits + 1 };
      const speed = speedOf(seconds);
      const rec: Found = { index, firstTry, seconds, speed, note: target.note };
      const done = [...found, rec];
      setTally(nextTally);
      setFound(done);
      setMissesHere(0);
      const answer = target.answers.find((a) => a.string === pos.string && a.fret === pos.fret) ?? target.answers.find((a) => a.midi === pos.midi) ?? target.answers[0];
      setFlash({ kind: 'hit', key: posKey(answer), marker: noteMarker(answer, { label: 'note', color: 'ok', state: 'hit' }), until: performance.now() + 520 });
      if (!viaMic) playNote(answer.midi, answer.string);
      hitSound(nextTally.combo, viaMic);
      const el = cellElement(boardRef.current, answer);
      fx.burst(el, nextTally.combo >= 10 ? 'streak' : 'ok', nextTally.combo >= 5 && nextTally.combo % 5 === 0 ? 'lg' : 'sm');
      fx.pop(el, `+${points}`, 'ok');
      setStatus({ kind: 'hit', text: `${SPEED_WORD[speed]}: ${noteText(answer.note, naming)}, string ${answer.string}${answer.fret === 0 ? ' open' : `, fret ${answer.fret}`} · ${secondsText(seconds)}` });
      if (index + 1 >= round.targets.length) finish(done, nextTally);
      else setIndex(index + 1);
    },
    [target, missesHere, tally, index, found, fx, naming, round.targets.length, finish],
  );

  const miss = useCallback(
    (cell: { string: number; fret: number; note: string } | null, heardMidi?: number) => {
      if (!target || finished.current) return;
      setTally((t) => addMiss(t));
      setMissesHere((m) => m + 1);
      missSound();
      if (cell) {
        const el = cellElement(boardRef.current, cell);
        fx.shake(el);
        setFlash({ kind: 'miss', key: posKey(cell), marker: { string: cell.string, fret: cell.fret, label: cell.note, noteLabel: true, note: cell.note, color: 'bad', state: 'miss' }, until: performance.now() + 900 });
      }
      const heard = cell ? noteText(cell.note, naming) : heardMidi !== undefined ? 'another note' : 'not it';
      const want = level.mode === 'lit' ? 'the lit dot' : noteText(target.note, naming);
      setStatus({ kind: 'miss', text: `That was ${heard}. Look for ${want}${missesHere >= 1 ? ': it is marked now' : ''}.` });
    },
    [target, fx, naming, level.mode, missesHere],
  );

  const onCell = useCallback(
    (cell: FretCell) => {
      if (!running || !target) return;
      if (answersTarget(target, cell)) hit(cell, false);
      else {
        playNote(cell.midi, cell.string, undefined, 0.5);
        miss(cell);
      }
    },
    [running, target, hit, miss],
  );

  // The microphone: wait for the target note itself (any place it sounds in the shape).
  const hitRef = useRef(hit);
  hitRef.current = hit;
  const missRef = useRef(miss);
  missRef.current = miss;
  useEffect(() => {
    if (!running || input !== 'mic' || !mic.tracker || !target) return;
    const midis = targetMidis(target);
    const wait = waitForNote(mic.tracker, midis, {
      ...pitchWaitOptions(anyOctave),
      onWrongNote: (n) => {
        if (!countsAsWrong(n.midi) || appIsSounding()) return;
        missRef.current(null, n.midi);
      },
    });
    let live = true;
    void wait.then((r) => {
      if (!live || !r.ok) return;
      const pos = target.answers.find((a) => a.midi === r.midi) ?? target.answers[0];
      hitRef.current({ string: pos.string, fret: pos.fret, midi: pos.midi }, true, r.time);
    });
    return () => {
      live = false;
      wait.cancel();
    };
  }, [running, input, mic.tracker, target, anyOctave]);

  const onTimeUp = useCallback(() => finish(found, tally), [finish, found, tally]);

  const markers = useMemo(() => {
    const out: FretMarker[] = [];
    // The lit level always shows the dot; named levels show the answer after two misses.
    const help = level.mode === 'lit' || missesHere >= 2;
    const targetKeys = new Set(target ? target.answers.map(posKey) : []);
    if (level.shape === 'shown') {
      for (const n of ctx.pattern.notes) {
        if (targetKeys.has(posKey(n)) && (level.mode === 'lit' || missesHere >= 2)) continue;
        // While a dot is lit, the rest of the shape steps back so the light is unmistakable.
        out.push(noteMarker(n, { label: level.labels ? 'note' : 'none', color: level.labels ? 'degree' : 'neutral', state: level.mode === 'lit' && running ? 'ghost' : 'normal' }));
      }
    }
    if (target && running && help) {
      for (const a of target.answers) out.push(noteMarker(a, { label: level.labels ? 'note' : 'none', color: 'accent', state: 'target' }));
    }
    if (flash) {
      const i = out.findIndex((m) => posKey(m) === flash.key);
      if (i >= 0) out.splice(i, 1);
      out.push(flash.marker);
    }
    return out;
  }, [ctx.pattern.notes, level, target, running, missesHere, flash]);

  const prompt = !target ? null : level.mode === 'lit' ? (
    <>
      <span className={styles.promptKicker}>{input === 'mic' ? 'Play the lit note' : 'Tap the lit note'}</span>
      <span className={styles.promptBig}>{level.labels ? noteText(target.note, naming) : <Icon name="Crosshair" size={36} label="the lit dot" />}</span>
    </>
  ) : (
    <>
      <span className={styles.promptKicker}>{input === 'mic' ? 'Play a' : 'Find a'}</span>
      <span className={styles.promptBig} data-arcade-call={target.note}>
        {noteText(target.note, naming)}
      </span>
      <span className={styles.promptHint}>{target.answers.length > 1 ? `${target.answers.length} in this shape: any one counts` : 'One in this shape'}</span>
    </>
  );

  const box = level.shape === 'hidden' || level.mode === 'named' ? boxOf(ctx.pattern) : null;

  return (
    <RoundFrame
      title={title}
      progress={timed ? null : { value: found.length, max: round.targets.length }}
      score={tally.score}
      combo={tally.combo}
      timer={timed ? <CountdownRing seconds={level.seconds!} running={running} onDone={onTimeUp} size={44} /> : undefined}
      onEnd={onEnd}
      prompt={prompt}
      status={status.text ? <Text tone={status.kind === 'hit' ? 'ok' : status.kind === 'miss' ? 'bad' : 'muted'} weight="semibold">{status.text}</Text> : <Text tone="muted">{running ? (input === 'mic' ? 'Listening. Play the note on your guitar, or tap it.' : level.mode === 'lit' ? 'Tap the lit dot on the neck.' : 'Tap it on the neck.') : 'Get ready…'}</Text>}
      statusKind={status.kind}
      board={
        <div ref={boardRef} className={styles.board}>
          <Fretboard frets={round.frets} tuning={ctx.tuning} markers={markers} box={box} onCellClick={onCell} cellLabels="position" noteContext={{ tonic: ctx.focus.tonic, scale: ctx.focus.scale }} />
        </div>
      }
      controls={input === 'mic' ? <MicLine mic={mic} /> : undefined}
      keys={[['←→↑↓', 'move on the neck'], ['Enter', 'choose the focused fret']]}
      fx={fx}
      data={{ game: 'note-hunt', index, target: target ? targetMidis(target).join(',') : '', answers: target ? target.answers.map(posKey).join(' ') : '', found: found.map((f) => `${f.firstTry ? 'first' : 'retry'}:${f.speed}`).join(' ') }}
    />
  );
}

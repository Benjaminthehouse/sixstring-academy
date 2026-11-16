import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Text, cx, useEventListener } from '@/ui';
import { Fretboard, noteText, useMusicSettings, type FretCell, type FretMarker } from '@/ui/music';
import { waitForNote } from '@/core/pitch';
import { audioNow, audioSoundingNow, getDrums, normalizeClickSet, playBass, playClick, playDrum, preloadClicks, scheduleVisual, unlockAudio } from '@/core/audio';
import { soundPrefs } from '@/core/settings';
import { RUN_LEVELS, RunJudge, nextTempo, runFrets, runNotes, runOutcome, runTimeline, runTip, COUNT_IN_BEATS, type NoteJudgement, type RunEvent, type RunOutcome } from '../../core/runScale';
import { posKey } from '../../core/focus';
import { starsFor, type Stars } from '../../core/scoring';
import { hitSound, missSound, playNote } from '../sound';
import { cellElement, countsAsWrong, noteMarker, pitchWaitOptions, useRoundClock } from '../kit';
import { RoundFrame } from '../RoundFrame';
import { MicLine } from '../MicLine';
import type { GameProps } from '../types';
import styles from '../Arcade.module.css';

type Phase = 'ready' | 'count' | 'run' | 'between';

/** Plays sounds a little ahead of the audio clock, so a stop takes back almost nothing. */
class AheadScheduler {
  private i = 0;
  private timer: number | null = null;
  private cancels: Array<() => void> = [];
  constructor(private readonly events: Array<{ time: number; play: (t: number) => (() => void) | void }>) {
    this.events.sort((a, b) => a.time - b.time);
  }
  start(): void {
    this.pump();
    this.timer = window.setInterval(() => this.pump(), 40);
  }
  private pump(): void {
    const horizon = audioNow() + 0.22;
    while (this.i < this.events.length && this.events[this.i].time < horizon) {
      const e = this.events[this.i++];
      const cancel = e.play(e.time);
      if (cancel) this.cancels.push(cancel);
    }
    if (this.i >= this.events.length && this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }
  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    for (const c of this.cancels.splice(0)) c();
    try {
      getDrums().stopAll();
    } catch {
      /* no audio */
    }
  }
}

const JUDGE_WORD: Record<NoteJudgement['kind'], string> = { 'on-time': 'On time', early: 'Early', late: 'Late', missed: 'Missed' };

/** Run the Scale: the shape up (and down) in time with a click; clean runs climb a speed ladder. */
export function RunTheScale({ ctx, input, mic, anyOctave, running, fx, title, onFinish, onEnd }: GameProps) {
  const level = RUN_LEVELS.find((l) => l.n === ctx.level) ?? RUN_LEVELS[0];
  const runs = Math.max(1, ctx.size ?? level.runs);
  const notes = useMemo(() => runNotes(ctx.pattern, level), [ctx.pattern, level]);
  const midis = useMemo(() => notes.map((n) => n.midi), [notes]);
  const frets = useMemo(() => runFrets(ctx.pattern), [ctx.pattern]);
  const { naming } = useMusicSettings();
  const [phase, setPhase] = useState<Phase>('ready');
  const [bpm, setBpm] = useState(level.startBpm);
  const [runIndex, setRunIndex] = useState(0);
  const [count, setCount] = useState<number | null>(null);
  const [, setVersion] = useState(0);
  const [last, setLast] = useState<{ kind: string; text: string }>({ kind: 'waiting', text: '' });
  const [outcomes, setOutcomes] = useState<Array<RunOutcome & { bpm: number; results: NoteJudgement[]; score: number; bestCombo: number }>>([]);
  const [flash, setFlash] = useState<{ key: string; marker: FretMarker } | null>(null);
  const judgeRef = useRef<RunJudge | null>(null);
  const aheadRef = useRef<AheadScheduler | null>(null);
  // Each run's visual cues carry its number; a run that was called off cannot come back to life.
  const runToken = useRef(0);
  const endAt = useRef(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const elapsed = useRoundClock(running);
  const finished = useRef(false);
  const bump = () => setVersion((v) => v + 1);
  const judge = judgeRef.current;
  const octaves = anyOctave ? 'any' : 'exact';

  useEffect(() => {
    try {
      preloadClicks(normalizeClickSet(soundPrefs().clickSound));
    } catch {
      /* no audio */
    }
    return () => {
      runToken.current++;
      aheadRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 360);
    return () => window.clearTimeout(id);
  }, [flash]);

  /** React to a judged input: sound, sparks, words. */
  const show = useCallback(
    (ev: RunEvent, viaMic: boolean) => {
      if (ev.kind === 'ignored') return;
      if (ev.kind === 'wrong') {
        missSound();
        setLast({ kind: 'miss', text: `Wrong note. Next is ${noteText(notes[ev.index].note, naming)}.` });
        bump();
        return;
      }
      const j = ev.judgement;
      const n = notes[j.index];
      const el = cellElement(boardRef.current, n);
      const ms = j.deviation === null ? 0 : Math.round(j.deviation * 1000);
      if (!viaMic) playNote(n.midi, n.string, undefined, Math.min(0.9, 60 / bpm / level.perBeat));
      if (j.kind === 'on-time') {
        fx.burst(el, 'ok');
        if ((judgeRef.current?.comboNow ?? 0) % 8 === 0) hitSound(judgeRef.current?.comboNow ?? 0, true);
      } else fx.burst(el, 'accent');
      fx.pop(el, j.kind === 'on-time' ? `+${j.points}` : `${ms > 0 ? '+' : ''}${ms} ms`, j.kind === 'on-time' ? 'ok' : 'accent');
      setFlash({ key: posKey(n), marker: noteMarker(n, { label: 'none', color: j.kind === 'on-time' ? 'ok' : 'info', state: 'hit' }) });
      setLast({ kind: j.kind, text: ev.skipped.length ? `Skipped ${noteText(notes[ev.skipped[0].index].note, naming)}. ${JUDGE_WORD[j.kind]}.` : j.kind === 'on-time' ? 'On time' : `${JUDGE_WORD[j.kind]} by ${Math.abs(ms)} ms` });
      bump();
    },
    [notes, naming, bpm, level.perBeat, fx],
  );

  const finishRound = useCallback((done: typeof outcomes) => {
    if (finished.current) return;
    finished.current = true;
    const total = done.reduce((s, o) => s + o.notes, 0);
    const credit = done.reduce((s, o) => s + o.accuracy * o.notes, 0);
    const accuracy = total ? credit / total : 0;
    const stars: Stars = starsFor(accuracy);
    const all = done.flatMap((o) => o.results);
    const onTime = all.filter((r) => r.kind === 'on-time').length;
    const top = Math.max(...done.map((o) => o.bpm));
    const lastRun = done[done.length - 1];
    onFinish({
      score: done.reduce((s, o) => s + o.score, 0),
      accuracy,
      stars,
      bestCombo: Math.max(...done.map((o) => o.bestCombo)),
      mistakes: done.reduce((s, o) => s + o.missed + o.wrong, 0),
      count: all.filter((r) => r.kind !== 'missed').length,
      durationSec: Math.round(elapsed()),
      perfect: done.every((o) => o.clean && o.onTime === o.notes),
      stats: [
        { label: 'Top tempo', value: `${top} BPM` },
        { label: 'On time', value: `${total ? Math.round((onTime / total) * 100) : 0}%` },
        { label: 'Early · late', value: `${all.filter((r) => r.kind === 'early').length} · ${all.filter((r) => r.kind === 'late').length}` },
        { label: 'Missed', value: `${all.filter((r) => r.kind === 'missed').length}` },
      ],
      tip: runTip(lastRun),
      marks: done.map((o) => (o.clean ? 'ok' : o.accuracy >= 0.6 ? 'meh' : 'bad')),
      detail: done.map((o) => o.results.map((r) => r.kind).join(',')).join(' | '),
    });
  }, [elapsed, onFinish]);


  const endRun = useCallback(() => {
    const j = judgeRef.current;
    if (!j) return;
    j.tick(Infinity);
    aheadRef.current?.stop();
    aheadRef.current = null;
    const o = runOutcome(j.results);
    const done = [...outcomes, { ...o, bpm, results: [...j.results], score: j.score, bestCombo: j.bestCombo }];
    setOutcomes(done);
    judgeRef.current = null;
    setCount(null);
    const nextBpm = nextTempo(level, bpm, o.clean);
    if (o.clean) hitSound(10);
    else missSound();
    if (done.length >= runs) {
      finishRound(done);
      return;
    }
    setBpm(nextBpm);
    setRunIndex(done.length);
    setPhase('between');
    setLast({ kind: o.clean ? 'clean' : 'again', text: o.clean ? `Clean run. Up to ${nextBpm} BPM.` : `${runTip(o)} Same tempo again.` });
  }, [outcomes, bpm, level, runs, finishRound]);

  /** Lay out a run from `start` (audio time of the first count-in click) and start the sound. */
  const beginRun = useCallback(
    (start: number) => {
      const tl = runTimeline(midis.length, bpm, level.perBeat, start);
      const token = ++runToken.current;
      const live = (fn: () => void) => () => {
        if (runToken.current === token) fn();
      };
      judgeRef.current = new RunJudge(midis, tl.noteTimes, tl.noteSec, { octaves });
      endAt.current = tl.end;
      const clickSet = normalizeClickSet(soundPrefs().clickSound);
      const groove = level.backing === 'groove';
      const bass = groove && input === 'tap';
      const rootMidi = 36 + ((notes[0].midi % 12) + 12) % 12;
      const events: Array<{ time: number; play: (t: number) => (() => void) | void }> = [];
      tl.clicks.forEach((c, i) => {
        const beatInBar = (i - COUNT_IN_BEATS + 400) % 4;
        if (c.countIn || !groove) events.push({ time: c.time, play: (t) => playClick(clickSet, c.accent ? 'accent' : 'beat', t) });
        else {
          events.push({ time: c.time, play: (t) => void playDrum(beatInBar % 2 === 0 ? 'kick' : 'snare', t, beatInBar === 0 ? 0.9 : 0.75) });
          events.push({ time: c.time, play: (t) => void playDrum('hihatClosed', t, 0.5) });
          events.push({ time: c.time + tl.beat / 2, play: (t) => void playDrum('hihatClosed', t, 0.32) });
          if (bass && beatInBar % 2 === 0) events.push({ time: c.time, play: (t) => void playBass(rootMidi, t, { duration: tl.beat * 1.6, velocity: 0.7 }) });
        }
        if (c.countIn) scheduleVisual(c.time, live(() => setCount(i + 1)));
      });
      scheduleVisual(
        tl.noteTimes[0] - 0.02,
        live(() => {
          setCount(null);
          setPhase('run');
        }),
      );
      aheadRef.current?.stop();
      aheadRef.current = new AheadScheduler(events);
      aheadRef.current.start();
      setPhase('count');
      setLast({ kind: 'waiting', text: '' });
      bump();
    },
    [midis, bpm, level, octaves, input, notes],
  );

  /** Start from a tap: the count-in begins a moment from now. */
  const startByTap = useCallback(async () => {
    if (!running || (phase !== 'ready' && phase !== 'between')) return;
    await unlockAudio().catch(() => false);
    beginRun(audioNow() + 0.35);
  }, [running, phase, beginRun]);

  // Space starts the count-in (as the hint says), even with the focus on the neck.
  useEventListener(typeof window === 'undefined' ? null : window, 'keydown', (e: KeyboardEvent) => {
    if (e.key !== ' ' || e.repeat || e.metaKey || e.ctrlKey || e.altKey || !running || (phase !== 'ready' && phase !== 'between')) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest?.('input, textarea, select, a, [role="dialog"]')) return;
    if (target?.closest?.('button') && !target.closest('[data-arcade-stage]')) return;
    e.preventDefault();
    void startByTap();
  });

  // The round paused (the tab was hidden) mid-run: the run is called off, not judged against a
  // click nobody heard; the same tempo waits for a fresh start.
  useEffect(() => {
    if (running || (phase !== 'count' && phase !== 'run')) return;
    runToken.current++;
    aheadRef.current?.stop();
    aheadRef.current = null;
    judgeRef.current = null;
    setCount(null);
    setPhase(outcomes.length ? 'between' : 'ready');
    setLast({ kind: 'waiting', text: 'Paused. This run starts again from the top.' });
  }, [running, phase, outcomes.length]);

  // Microphone, before a run: playing the first note of the run starts the count-in. Hands stay on the guitar.
  useEffect(() => {
    if (!running || input !== 'mic' || !mic.tracker || (phase !== 'ready' && phase !== 'between')) return;
    const wait = waitForNote(mic.tracker, midis[0], pitchWaitOptions(anyOctave));
    let live = true;
    void wait.then((r) => {
      if (!live || !r.ok) return;
      const beat = 60 / bpm;
      const lead = beat * Math.max(1, Math.ceil(0.9 / beat));
      let start = r.time - mic.latency() + lead;
      // Detected late (a busy machine): keep the grid, start a whole beat later.
      while (start < audioNow() + 0.08) start += beat;
      beginRun(start);
    });
    return () => {
      live = false;
      wait.cancel();
    };
  }, [running, input, mic, phase, midis, anyOctave, bpm, beginRun]);

  // Microphone, during a run: wait for the note due (or the one after it, if one was skipped).
  const showRef = useRef(show);
  showRef.current = show;
  useEffect(() => {
    if (input !== 'mic' || !mic.tracker || (phase !== 'count' && phase !== 'run')) return;
    const tracker = mic.tracker;
    const ctl = new AbortController();
    const latency = mic.latency();
    const opts = pitchWaitOptions(anyOctave);
    (async () => {
      while (!ctl.signal.aborted) {
        const j = judgeRef.current;
        if (!j || j.done) return;
        const minStart = j.earliest();
        const r = await waitForNote(tracker, j.accepting(), {
          ...opts,
          timeoutMs: 250,
          signal: ctl.signal,
          onWrongNote: (n) => {
            if (n.time - latency < minStart || !countsAsWrong(n.midi)) return;
            showRef.current(j.wrongNote(n.midi), true);
          },
        });
        if (ctl.signal.aborted || judgeRef.current !== j) return;
        if (!r.ok) continue;
        const t = r.time - latency;
        if (t < j.earliest()) {
          // The note still ringing from before (the start note, say): wait for a fresh pluck.
          await new Promise((ok) => window.setTimeout(ok, 60));
          continue;
        }
        showRef.current(j.play(r.midi, t), true);
      }
    })();
    return () => ctl.abort();
  }, [input, mic, phase, anyOctave]);

  // The judge's clock: silent notes become misses, and the run ends a beat after its last note.
  const endRunRef = useRef(endRun);
  endRunRef.current = endRun;
  useEffect(() => {
    if (phase !== 'count' && phase !== 'run') return;
    const id = window.setInterval(() => {
      const j = judgeRef.current;
      if (!j) return;
      const now = input === 'mic' ? audioNow() - mic.latency() : audioSoundingNow();
      const missed = j.tick(now);
      if (missed.length) {
        setLast({ kind: 'missed', text: `Missed ${noteText(notes[missed[missed.length - 1].index].note, naming)}.` });
        bump();
      }
      if (j.done && audioNow() > endAt.current - 0.2) endRunRef.current();
    }, 50);
    return () => window.clearInterval(id);
  }, [phase, input, mic, notes, naming]);

  const onCell = useCallback(
    (cell: FretCell) => {
      const j = judgeRef.current;
      if (!running) return;
      if (!j || (phase !== 'count' && phase !== 'run')) {
        playNote(cell.midi, cell.string, undefined, 0.5);
        return;
      }
      // Same pitch anywhere counts: a tap on the next string's equal note is still that note.
      showRef.current(j.play(cell.midi, audioSoundingNow()), false);
    },
    [running, phase],
  );

  const current = judge && !judge.done ? judge.current : phase === 'ready' || phase === 'between' ? 0 : -1;
  const markers = useMemo(() => {
    const out: FretMarker[] = [];
    const now = current >= 0 ? notes[current] : null;
    for (const n of ctx.pattern.notes) {
      if (now && posKey(n) === posKey(now)) continue;
      out.push(noteMarker(n, { label: 'degree', color: 'degree' }));
    }
    if (now) out.push(noteMarker(now, { label: 'degree', color: 'accent', state: 'target' }));
    if (flash) {
      const i = out.findIndex((m) => posKey(m) === flash.key);
      if (i >= 0) out.splice(i, 1);
      out.push(flash.marker);
    }
    return out;
  }, [ctx.pattern.notes, notes, current, flash]);

  const results = judge ? judge.results : outcomes[outcomes.length - 1]?.results ?? [];
  const strip = (
    <ol className={styles.strip} aria-label="This run, note by note" data-arcade-judgements={results.map((r) => r.kind).join(',')}>
      {notes.map((n, i) => {
        const r = results.find((x) => x.index === i);
        const state = r ? r.kind : i === current && (phase === 'run' || phase === 'count') ? 'now' : 'todo';
        return (
          <li key={i} className={cx(styles.pill, styles[`pill_${state.replace('-', '')}`])} aria-label={`${noteText(n.note, naming)}: ${r ? JUDGE_WORD[r.kind] : 'to play'}`}>
            <span aria-hidden="true">{state === 'on-time' ? '✓' : state === 'early' ? '‹' : state === 'late' ? '›' : state === 'missed' ? '×' : ''}</span>
          </li>
        );
      })}
    </ol>
  );

  const scoreNow = outcomes.reduce((s, o) => s + o.score, 0) + (judge?.score ?? 0);
  const comboNow = judge?.comboNow ?? 0;
  const startNote = noteText(notes[0].note, naming);
  const where = `string ${notes[0].string}${notes[0].fret === 0 ? ' open' : `, fret ${notes[0].fret}`}`;

  let prompt;
  if (phase === 'count') {
    prompt = (
      <>
        <span className={styles.promptKicker}>Get ready · {bpm} BPM</span>
        <span className={cx(styles.promptBig, styles.countNum)} key={count ?? 0} data-arcade-count={count ?? 0}>
          {count ?? '·'}
        </span>
        <span className={styles.promptHint}>Start on {startNote} after four clicks.</span>
      </>
    );
  } else if (phase === 'run' && judge && !judge.done) {
    const n = notes[judge.current];
    prompt = (
      <>
        <span className={styles.promptKicker}>
          Run {runIndex + 1} of {runs} · {bpm} BPM
        </span>
        <span className={styles.promptBig}>{noteText(n.note, naming)}</span>
        <span className={styles.promptHint}>Note {judge.current + 1} of {notes.length}</span>
      </>
    );
  } else {
    prompt = (
      <>
        <span className={styles.promptKicker}>
          Run {runIndex + 1} of {runs} · {bpm} BPM
        </span>
        <span className={styles.promptBig}>{input === 'mic' ? `Play ${startNote}` : 'Ready?'}</span>
        <span className={styles.promptHint}>
          {input === 'mic' ? `${startNote} on ${where} starts the count-in.` : `Tap Start, then tap each lit note on the click. First: ${startNote}, ${where}.`} {level.perBeat === 2 ? 'Two notes a click.' : 'One note a click.'}
        </span>
      </>
    );
  }

  const waiting = phase === 'ready' || phase === 'between';
  return (
    <RoundFrame
      title={title}
      progress={{ value: outcomes.length, max: runs }}
      score={scoreNow}
      combo={comboNow}
      onEnd={() => {
        aheadRef.current?.stop();
        onEnd();
      }}
      prompt={prompt}
      status={
        <div className={styles.runStatus}>
          {strip}
          <Text tone={last.kind === 'on-time' || last.kind === 'clean' ? 'ok' : last.kind === 'miss' || last.kind === 'missed' ? 'bad' : last.kind === 'waiting' ? 'muted' : 'warn'} weight="semibold">
            {last.text || (waiting ? (level.backing === 'groove' ? (input === 'mic' ? 'With the microphone on, the band plays drums only.' : 'A drum groove plays under you.') : 'A click on every beat.') : ' ')}
          </Text>
        </div>
      }
      statusKind={last.kind}
      board={
        <div ref={boardRef} className={styles.board}>
          <Fretboard frets={frets} tuning={ctx.tuning} markers={markers} onCellClick={onCell} cellLabels="position" noteContext={{ tonic: ctx.focus.tonic, scale: ctx.focus.scale }} />
        </div>
      }
      controls={
        <>
          {input === 'mic' && <MicLine mic={mic} hint={waiting ? `Play ${startNote} to start` : 'Listening'} />}
          {waiting && (
            <Button variant={input === 'mic' ? 'secondary' : 'primary'} size="lg" iconLeft="Play" onClick={() => void startByTap()} disabled={!running} data-arcade-start aria-keyshortcuts="Space">
              {outcomes.length ? `Next run · ${bpm} BPM` : 'Start'}
            </Button>
          )}
        </>
      }
      keys={[['Space', 'start the count-in'], ['←→↑↓', 'move on the neck'], ['Enter', 'play the focused fret']]}
      fx={fx}
      data={{ game: 'run-the-scale', phase, bpm, run: runIndex, current: current >= 0 ? posKey(notes[current]) : '', due: judge && !judge.done ? judge.times[judge.current].toFixed(3) : '' }}
    />
  );
}

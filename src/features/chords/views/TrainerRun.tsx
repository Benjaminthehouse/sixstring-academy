/**
 * A running round of the chord-change trainer, in one of three ways:
 *
 *  - one minute: change back and forth for 60 seconds; a tap per change, or the microphone counts
 *    every strum that rings as the next chord (`ChangeCounter` on `waitForChord`);
 *  - in time: a metronome, a set number of beats per chord, eight changes; a tap when the fingers
 *    land, or the microphone checks the strum on each change beat;
 *  - check: the microphone waits for each chord to ring correctly before moving on and says which
 *    string to look at when it does not.
 *
 * The screen keeps the chords big and the one action (tap / stop) in the thumb zone; Space taps.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { audioSoundingNow, Metronome, normalizeClickSet, playUi } from '@/core/audio';
import type { Voicing } from '@/core/guitar';
import { waitForChord, type PitchTracker } from '@/core/pitch';
import { soundPrefs } from '@/core/settings';
import { formatNote } from '@/core/theory';
import { ActionBar, Banner, Button, CountdownRing, ProgressBar, Text, cx } from '@/ui';
import { useMusicSettings } from '@/ui/music';
import { useShortcuts } from '../hooks/keys';
import { strumHint, type StrumHint } from '../model/hints';
import { ChangeCounter, RING_TRUE, soundsLikeHeld, specOf } from '../model/listen';
import { displaySymbol } from '../model/symbols';
import { judgeStrum, judgeTaps, onTimeWindow, type ChangeOutcome, type CheckStep } from '../model/trainer';
import { MarkedDiagram } from './MarkedDiagram';
import styles from './Trainer.module.css';

/** The three ways to practise. */
export type TrainerMode = 'minute' | 'timed' | 'check';
/** How changes are counted. */
export type TrainerInput = 'tap' | 'mic';

/** What a round produced. */
export type RoundResult =
  | { mode: 'minute'; input: TrainerInput; changes: number; unclear: number; seconds: number; completed: boolean }
  | { mode: 'timed'; input: TrainerInput; outcomes: ChangeOutcome[]; bpm: number; beats: number; seconds: number; completed: boolean }
  | { mode: 'check'; steps: CheckStep[]; seconds: number; completed: boolean };

/** Props shared by the three runs. */
export interface RunProps {
  chords: string[];
  voicings: Voicing[];
  input: TrainerInput;
  tracker: PitchTracker | null;
  onDone: (result: RoundResult) => void;
}

/** Changes in a timed round and chords in a check round. */
export const TIMED_CHANGES = 8;
export const CHECK_STEPS = 8;
/** Length of a one-minute round, seconds. */
export const MINUTE = 60;

function useNoteFormat() {
  const { naming } = useMusicSettings();
  return useCallback((n: string) => formatNote(n, { system: naming }), [naming]);
}

/** The chords of the set as cards: the one held now, the one to change to, the rest. */
function ChordCards({ chords, voicings, held, next, hintStrings, big }: { chords: string[]; voicings: Voicing[]; held: number; next: number | null; hintStrings?: readonly number[]; big?: boolean }) {
  const { naming } = useMusicSettings();
  if (big) {
    const i = next ?? held;
    return (
      <div className={styles.cards}>
        <div className={cx(styles.card, styles.bigCard)} data-role="next" data-current-chord={chords[i]}>
          <span className={styles.cardTag}>Play</span>
          <MarkedDiagram voicing={voicings[i]} size="lg" title={displaySymbol(chords[i], { system: naming })} strings={hintStrings} footer="notes" />
        </div>
      </div>
    );
  }
  return (
    <div className={styles.cards}>
      {chords.map((c, i) => {
        const role = i === next ? 'next' : i === held ? 'now' : 'other';
        return (
          <div key={`${c}-${i}`} className={styles.card} data-role={role} data-current-chord={role === 'next' ? c : undefined}>
            <span className={styles.cardTag}>{role === 'next' ? (held < 0 ? 'Start on' : 'Change to') : role === 'now' ? 'Now' : 'Later'}</span>
            <MarkedDiagram voicing={voicings[i]} size={chords.length > 2 ? 'sm' : 'md'} title={displaySymbol(c, { system: naming })} strings={role === 'next' ? hintStrings : undefined} />
          </div>
        );
      })}
    </div>
  );
}

/** A dot that pulses with each strum the microphone hears (moved outside React). */
function MicListening({ tracker }: { tracker: PitchTracker | null }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!tracker) return undefined;
    let timer = 0;
    const offOnset = tracker.on('onset', () => {
      ref.current?.style.setProperty('--level', '1.8');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => ref.current?.style.setProperty('--level', '1'), 140);
    });
    return () => {
      offOnset();
      window.clearTimeout(timer);
    };
  }, [tracker]);
  return (
    <span ref={ref} className={styles.micDot} data-listening>
      Listening
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// One minute
// ---------------------------------------------------------------------------------------------

/** One-minute changes. */
export function MinuteRun({ chords, voicings, input, tracker, onDone }: RunProps) {
  const fmt = useNoteFormat();
  const { naming } = useMusicSettings();
  const n = chords.length;
  const [phase, setPhase] = useState<'countin' | 'go'>('countin');
  const [countIn, setCountIn] = useState(3);
  const [held, setHeld] = useState(0);
  const [count, setCount] = useState(0);
  const [hint, setHint] = useState<StrumHint | null>(null);
  const countRef = useRef(0);
  const unclearRef = useRef(0);
  const startedAt = useRef(0);
  const counterRef = useRef<ChangeCounter | null>(null);
  const done = useRef(false);

  const finish = useCallback(
    (completed: boolean) => {
      if (done.current) return;
      done.current = true;
      counterRef.current?.stop();
      const seconds = phase === 'go' ? Math.min(MINUTE, Math.round((performance.now() - startedAt.current) / 1000)) : 0;
      onDone({ mode: 'minute', input, changes: countRef.current, unclear: unclearRef.current, seconds: completed ? MINUTE : seconds, completed });
    },
    [input, onDone, phase],
  );

  // 3, 2, 1, go.
  useEffect(() => {
    if (phase !== 'countin') return undefined;
    playUi('countdown');
    const t = window.setTimeout(() => {
      if (countIn > 1) {
        setCountIn((c) => c - 1);
        return;
      }
      playUi('go');
      startedAt.current = performance.now();
      setPhase('go');
    }, 1000);
    return () => window.clearTimeout(t);
  }, [countIn, phase]);

  // The microphone counts from "go".
  useEffect(() => {
    if (phase !== 'go' || input !== 'mic' || !tracker) return undefined;
    const counter = new ChangeCounter(tracker, voicings.map(specOf), {
      onChange: (c, index) => {
        countRef.current = c;
        setCount(c);
        setHeld(index);
        setHint(null);
      },
      onUnclear: (m, target) => {
        unclearRef.current++;
        setHint(strumHint(voicings[target], m, fmt));
      },
    });
    counterRef.current = counter;
    counter.start();
    return () => {
      counter.stop();
    };
  }, [phase, input, tracker, voicings, fmt]);

  const tap = useCallback(() => {
    if (phase !== 'go' || input !== 'tap' || done.current) return;
    countRef.current += 1;
    setCount(countRef.current);
    setHeld((h) => (h + 1) % n);
  }, [phase, input, n]);

  useShortcuts({ ' ': tap, Escape: () => finish(false) });

  const next = (held + 1) % n;
  return (
    <div className={styles.run} data-trainer-run="minute" data-phase={phase} data-count={count}>
      <div className={styles.runTop}>
        <CountdownRing key={phase} seconds={MINUTE} running={phase === 'go'} onDone={() => finish(true)} size={84} label="Time left" />
        <div className={styles.count} aria-live="polite">
          <span key={count} className={cx(styles.countNumber, count > 0 && styles.bump)} data-count-value>
            {count}
          </span>
          <span className={styles.countLabel}>clean {count === 1 ? 'change' : 'changes'}</span>
        </div>
      </div>
      {phase === 'countin' ? (
        <>
          <span className={styles.countIn} aria-live="assertive">
            {countIn}
          </span>
          <Text>Fingers on {displaySymbol(chords[0], { system: naming })}. Change on “go”.</Text>
          <ChordCards chords={chords} voicings={voicings} held={-1} next={0} />
        </>
      ) : (
        <>
          <ChordCards chords={chords} voicings={voicings} held={held} next={next} hintStrings={hint?.strings} />
          <div className={styles.status} aria-live="polite">
            {input === 'mic' ? (
              hint ? (
                <Banner tone="warn" title="Not counted">
                  {hint.text}
                </Banner>
              ) : (
                <Text tone="muted">
                  <MicListening tracker={tracker} /> · strum once each time you land on the next chord.
                </Text>
              )
            ) : (
              <Text tone="muted">Tap the moment your fingers land on the next chord. Clean beats fast.</Text>
            )}
          </div>
        </>
      )}
      <ActionBar className={styles.runBar}>
        <Button variant="ghost" onClick={() => finish(false)}>
          Stop
        </Button>
        {input === 'tap' && (
          <Button variant="primary" size="lg" onClick={tap} disabled={phase !== 'go'} className={styles.tapButton} data-tap>
            Changed
          </Button>
        )}
      </ActionBar>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// In time
// ---------------------------------------------------------------------------------------------

/** Changes in time with a metronome. */
export function TimedRun({ chords, voicings, input, tracker, onDone, bpm, beats }: RunProps & { bpm: number; beats: number }) {
  const { naming } = useMusicSettings();
  const n = chords.length;
  const beatSec = 60 / bpm;
  const [view, setView] = useState<{ countIn: number | null; beat: number; k: number }>({ countIn: null, beat: -1, k: -1 });
  const [lastOutcome, setLastOutcome] = useState<ChangeOutcome | null>(null);
  const changeTimes = useRef<number[]>([]);
  const taps = useRef<number[]>([]);
  const micOutcomes = useRef<Array<ChangeOutcome | null>>(Array(TIMED_CHANGES).fill(null));
  const waits = useRef<Array<{ cancel: () => void }>>([]);
  const metronome = useRef<Metronome | null>(null);
  const startedAt = useRef(performance.now());
  const done = useRef(false);
  const specs = useMemo(() => voicings.map(specOf), [voicings]);

  const finish = useCallback(
    (completed: boolean) => {
      if (done.current) return;
      done.current = true;
      metronome.current?.stop();
      const seconds = Math.round((performance.now() - startedAt.current) / 1000);
      const report = () => {
        waits.current.forEach((w) => w.cancel());
        let outcomes: ChangeOutcome[];
        if (input === 'mic') outcomes = micOutcomes.current.slice(0, Math.max(1, changeTimes.current.length)).map((o) => o ?? 'missed');
        else outcomes = judgeTaps(changeTimes.current, taps.current, beatSec, beats);
        onDone({ mode: 'timed', input, outcomes, bpm, beats, seconds, completed });
      };
      // Let a strum that is still being judged finish (at most a beat or two).
      if (input === 'mic' && completed) window.setTimeout(report, Math.round((beatSec + onTimeWindow(beatSec).late) * 1000) + 300);
      else report();
    },
    [input, beatSec, beats, bpm, onDone],
  );

  useEffect(() => {
    const m = new Metronome({ tempo: bpm, timeSignature: '4/4' });
    m.countInBars = 1;
    m.sound = normalizeClickSet(soundPrefs().clickSound);
    metronome.current = m;
    let k = -1;
    const lateLimit = Math.max(onTimeWindow(beatSec).late, Math.min(0.5 * beats * beatSec, (beats - 0.25) * beatSec));
    const endAt = TIMED_CHANGES * beats + Math.max(1, Math.ceil(beats / 2));
    const off = m.onBeat((b) => {
      if (done.current) return;
      if (b.countIn) {
        setView({ countIn: b.beat + 1, beat: -1, k: -1 });
        return;
      }
      k++;
      if (k > 0 && k % beats === 0) {
        const changeNo = k / beats;
        if (changeNo <= TIMED_CHANGES) changeTimes.current[changeNo - 1] = b.time;
      }
      setView({ countIn: null, beat: k % beats, k });
      // With the microphone: start listening for the next chord on the beat before it is due.
      if (input === 'mic' && tracker && (k + 1) % beats === 0) {
        const changeNo = (k + 1) / beats;
        if (changeNo <= TIMED_CHANGES) {
          const target = changeNo % n;
          const due = b.time + beatSec;
          const w = waitForChord(tracker, specs[target], { threshold: RING_TRUE, rivals: specs.filter((_s, i) => i !== target), timeoutMs: (beatSec + lateLimit) * 1000 });
          waits.current.push(w);
          void w.then((r) => {
            if (r.ok || r.reason === 'timeout') {
              const o = judgeStrum(r.ok ? r.time : null, due, beatSec, r.failedAttempts);
              micOutcomes.current[changeNo - 1] = o;
              setLastOutcome(o);
            }
          });
        }
      }
      if (k >= endAt) finish(true);
    });
    m.start();
    startedAt.current = performance.now();
    return () => {
      off();
      m.dispose();
      waits.current.forEach((w) => w.cancel());
    };
    // One metronome per round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tap = useCallback(() => {
    if (input !== 'tap' || done.current) return;
    taps.current.push(audioSoundingNow());
    // Judge the change this tap belongs to straight away, for feedback.
    const outcomes = judgeTaps(changeTimes.current, taps.current, beatSec, beats);
    setLastOutcome(outcomes.length ? outcomes[outcomes.length - 1] : null);
  }, [input, beatSec, beats]);

  useShortcuts({ ' ': tap, Escape: () => finish(false) });

  const k = view.k;
  const chordNow = k < 0 ? 0 : Math.floor(k / beats) % n;
  const changeNo = k < 0 ? 0 : Math.floor(k / beats);
  const comingUp = k >= 0 && view.beat === beats - 1;
  const nextChord = (chordNow + 1) % n;
  const doneChanges = Math.min(TIMED_CHANGES, changeNo);
  return (
    <div className={styles.run} data-trainer-run="timed" data-k={k}>
      <div className={styles.runTop}>
        <Text tone="muted" tabular>
          {bpm} BPM · {beats === 1 ? 'every beat' : `${beats} beats a chord`}
        </Text>
        <div className={styles.count}>
          <span className={styles.countNumber}>{view.countIn ?? `${doneChanges}/${TIMED_CHANGES}`}</span>
          <span className={styles.countLabel}>{view.countIn ? 'count-in' : 'changes'}</span>
        </div>
      </div>
      <ProgressBar className={styles.progressLine} value={doneChanges} max={TIMED_CHANGES} aria-label="Changes done" valueText={false} size="sm" />
      <ChordCards chords={chords} voicings={voicings} held={comingUp ? chordNow : -1} next={comingUp ? nextChord : chordNow} />
      <div className={styles.beats} aria-hidden>
        {Array.from({ length: beats }, (_x, i) => (
          <span key={i} className={styles.beat} data-on={i === view.beat} data-change={i === 0} />
        ))}
      </div>
      <div className={styles.status} aria-live="polite">
        {view.countIn ? (
          <Text>Fingers on {displaySymbol(chords[0], { system: naming })}. {input === 'mic' ? 'Strum on each beat.' : 'Tap when your fingers land on each new chord.'}</Text>
        ) : lastOutcome ? (
          <Text weight="semibold" tone={lastOutcome === 'clean' ? 'ok' : lastOutcome === 'late' ? 'warn' : 'bad'} data-outcome={lastOutcome}>
            {lastOutcome === 'clean' ? 'On time.' : lastOutcome === 'late' ? 'A little late: start moving on the beat before.' : lastOutcome === 'wrong' ? 'That one did not ring as the chord.' : 'Missed that change. Keep going.'}
          </Text>
        ) : (
          <Text tone="muted">{comingUp ? `Get ready: ${displaySymbol(chords[nextChord], { system: naming })} on the next beat.` : 'Keep strumming in time.'}</Text>
        )}
        {input === 'mic' && <MicListening tracker={tracker} />}
      </div>
      <ActionBar className={styles.runBar}>
        <Button variant="ghost" onClick={() => finish(false)}>
          Stop
        </Button>
        {input === 'tap' && (
          <Button variant="primary" size="lg" onClick={tap} className={styles.tapButton} data-tap>
            Fingers down
          </Button>
        )}
      </ActionBar>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Check with the microphone
// ---------------------------------------------------------------------------------------------

/** The microphone waits for each chord to ring before moving on. */
export function CheckRun({ chords, voicings, tracker, onDone }: RunProps) {
  const fmt = useNoteFormat();
  const { naming } = useMusicSettings();
  const n = chords.length;
  const [step, setStep] = useState(0);
  const [hint, setHint] = useState<StrumHint | null>(null);
  const [tries, setTries] = useState(0);
  const steps = useRef<CheckStep[]>([]);
  const last = useRef(performance.now());
  const startedAt = useRef(performance.now());
  const done = useRef(false);
  const specs = useMemo(() => voicings.map(specOf), [voicings]);
  const failedRef = useRef(0);

  const finish = useCallback(
    (completed: boolean) => {
      if (done.current) return;
      done.current = true;
      onDone({ mode: 'check', steps: steps.current, seconds: Math.round((performance.now() - startedAt.current) / 1000), completed });
    },
    [onDone],
  );

  const advance = useCallback(
    (failed: number) => {
      const now = performance.now();
      steps.current.push({ seconds: (now - last.current) / 1000, failedAttempts: failed });
      last.current = now;
      setHint(null);
      setTries(0);
      failedRef.current = 0;
      if (steps.current.length >= CHECK_STEPS) finish(true);
      else setStep((s) => s + 1);
    },
    [finish],
  );

  useEffect(() => {
    if (!tracker || done.current) return undefined;
    const idx = step % n;
    const prev = (idx - 1 + n) % n;
    failedRef.current = 0;
    const w = waitForChord(tracker, specs[idx], {
      threshold: RING_TRUE,
      rivals: specs.filter((_s, i) => i !== idx),
      onAttempt: (m) => {
        // Strumming the chord you are leaving is not a mistake.
        if (step > 0 && soundsLikeHeld(m, specs[prev])) return;
        failedRef.current++;
        setTries(failedRef.current);
        setHint(strumHint(voicings[idx], m, fmt));
      },
    });
    void w.then((r) => {
      if (!r.ok || done.current) return;
      playUi('correct');
      advance(failedRef.current);
    });
    return () => w.cancel();
  }, [step, tracker, n, specs, voicings, fmt, advance]);

  useShortcuts({ Escape: () => finish(false) });

  const idx = step % n;
  return (
    <div className={styles.run} data-trainer-run="check" data-step={step}>
      <div className={styles.runTop}>
        <MicListening tracker={tracker} />
        <div className={styles.count}>
          <span className={styles.countNumber}>
            {Math.min(step + 1, CHECK_STEPS)}/{CHECK_STEPS}
          </span>
          <span className={styles.countLabel}>chords</span>
        </div>
      </div>
      <ProgressBar className={styles.progressLine} value={steps.current.length} max={CHECK_STEPS} aria-label="Chords done" valueText={false} size="sm" />
      <ChordCards chords={chords} voicings={voicings} held={idx} next={null} hintStrings={hint?.strings} big />
      <div className={styles.status} aria-live="polite">
        {hint ? (
          <Banner tone="warn" title={tries > 1 ? `Not yet (${tries} tries)` : 'Not quite'}>
            {hint.text}
          </Banner>
        ) : (
          <Text>
            Strum {displaySymbol(chords[idx], { system: naming })} and let it ring. The app moves on when every note comes through.
          </Text>
        )}
      </div>
      <ActionBar className={styles.runBar}>
        <Button variant="ghost" onClick={() => finish(false)}>
          Stop
        </Button>
        <Button onClick={() => advance(Math.max(1, failedRef.current))} data-skip>
          Skip this chord
        </Button>
      </ActionBar>
    </div>
  );
}

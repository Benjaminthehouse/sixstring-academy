/**
 * Play exercises: the learner plays a note, a chord or a phrase into the microphone. The target is
 * shown on the neck (or as a chord box or tab), a meter shows the input level, the note heard is
 * named live with a hint when it is not the one asked for, and "I can't play right now" is always
 * one tap away. When the microphone cannot be opened, the kit's MediaBlocked explains why and
 * offers the tapping version.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MediaBlocked, Spinner, Text, cx } from '@/ui';
import { ChordDiagram, Fretboard, NoteBadge, type FretMarker } from '@/ui/music';
import { PitchTracker } from '@/core/pitch';
import { learnerA4, micOptions } from '@/core/settings';
import { midiToNote } from '@/core/theory';
import type { MediaFailure } from '@/core/platform';
import { phraseMidi, playNoteTarget, referenceFrets } from '../../grade';
import { listenFor, trackerOptionsFor, type Listening } from '../../listen';
import type { PlayChordExercise, PlayExercise, PlayNoteExercise, PlayPhraseExercise } from '../../types';
import { FigureView } from '../figures/figures';
import { RichText } from '../RichText';
import { heardNothing } from '../logic/play';
import type { ExerciseViewProps } from './types';
import styles from './Exercises.module.css';

/** Set once the microphone has opened in this visit, so later play steps can start listening by themselves. */
let micOpenedBefore = false;

type MicState = { kind: 'idle' } | { kind: 'starting' } | { kind: 'listening' } | { kind: 'blocked'; reason: MediaFailure } | { kind: 'lost' };

function noteWords(midi: number): string {
  return `{n:${midiToNote(midi)}}`;
}

/** What to aim for, drawn: the position on the neck, the chord box, or the phrase as tab. */
function Target({ exercise, heard }: { exercise: PlayExercise; heard: number[] }) {
  if (exercise.type === 'play-note') {
    const target = playNoteTarget(exercise);
    const where = exercise.where;
    const markers: FretMarker[] = where ? [{ ...where, label: '', note: target !== null ? midiToNote(target, { octave: false }) : undefined, noteLabel: true, color: 'accent', state: 'target' }] : [];
    return (
      <div className={styles.playTarget}>
        {target !== null && <NoteBadge note={midiToNote(target)} octave size="lg" />}
        {where && (
          <div className={styles.neck}>
            <Fretboard frets={[Math.max(0, where.fret - 2), Math.max(4, where.fret + 2)]} markers={markers} size="lg" fretNumbers="all" aria-label={`Play string ${where.string}, ${where.fret === 0 ? 'open' : `fret ${where.fret}`}`} />
          </div>
        )}
      </div>
    );
  }
  if (exercise.type === 'play-chord') {
    const frets = referenceFrets(exercise);
    return <div className={styles.playTarget}>{frets ? <ChordDiagram frets={frets} chord={exercise.chord} size="md" footer="notes" /> : <RichText text={`{c:${exercise.chord}}`} />}</div>;
  }
  const expected = phraseMidi(exercise);
  return (
    <div className={styles.playTarget}>
      <FigureView figure={{ kind: 'tab', notes: exercise.notes, tempo: exercise.tempo, tuning: exercise.tuning, capo: exercise.capo }} />
      <ol className={styles.phraseProgress} aria-label="Notes played">
        {expected.map((m, i) => (
          <li key={i} className={cx(styles.phraseNote, i < heard.length && styles.phraseDone)}>
            <RichText text={noteWords(m)} />
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Play into the microphone. */
export function PlayView({ exercise, review, onSubmit, setPrimary, onCantPlay, onMicUnavailable, level, hints }: ExerciseViewProps<PlayNoteExercise | PlayChordExercise | PlayPhraseExercise>) {
  const [mic, setMic] = useState<MicState>({ kind: 'idle' });
  const [heard, setHeard] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [phrase, setPhrase] = useState<number[]>([]);
  const trackerRef = useRef<PitchTracker | null>(null);
  const listeningRef = useRef<Listening | null>(null);
  const meterRef = useRef<HTMLSpanElement | null>(null);
  const alive = useRef(true);
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;
  const unavailableRef = useRef(onMicUnavailable);
  unavailableRef.current = onMicUnavailable;
  const expectedPhrase = useMemo(() => (exercise.type === 'play-phrase' ? phraseMidi(exercise) : []), [exercise]);

  const stop = useCallback(() => {
    listeningRef.current?.cancel();
    listeningRef.current = null;
    trackerRef.current?.stop();
    trackerRef.current = null;
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stop();
    };
  }, [stop]);

  const listen = useCallback(
    (tracker: PitchTracker) => {
      const a4 = learnerA4();
      const listening = listenFor(tracker, exercise, {
        level,
        a4,
        timeoutMs: exercise.type === 'play-phrase' ? 40_000 : 30_000,
        onNote: (midi, right) => {
          if (!alive.current) return;
          setHeard(midi);
          if (exercise.type === 'play-phrase') {
            setPhrase((p) => [...p, midi]);
            setMessage(null);
          } else if (!right) {
            const where = exercise.type === 'play-note' && exercise.where ? ` Aim for string ${exercise.where.string}, ${exercise.where.fret === 0 ? 'open' : `fret ${exercise.where.fret}`}.` : '';
            setMessage(`That was ${midiToNote(midi)}.${where}`);
          }
        },
        onAttempt: (attempt) => {
          if (!alive.current) return;
          setMessage(attempt.missing.length > 0 ? 'Not every note rang. Press each string firmly, just behind the fret, and strum again.' : 'Some strings sounded that are not in the chord. Mute or skip them and strum again.');
        },
      });
      listeningRef.current = listening;
      void listening.then((answer) => {
        if (!alive.current || listeningRef.current !== listening) return;
        listeningRef.current = null;
        if (heardNothing(answer)) {
          // Silence is not a mistake: keep listening.
          setMessage('I have not heard anything yet. Play when you are ready, close to the microphone.');
          if (trackerRef.current) listen(trackerRef.current);
          return;
        }
        stop();
        setMic({ kind: 'idle' });
        submitRef.current(answer);
      });
    },
    [exercise, level, stop],
  );

  const start = useCallback(async () => {
    if (review) return;
    stop();
    setMic({ kind: 'starting' });
    setMessage(null);
    setPhrase([]);
    const tracker = new PitchTracker({ ...micOptions(), ...trackerOptionsFor(exercise) });
    trackerRef.current = tracker;
    const result = await tracker.start();
    if (!alive.current || trackerRef.current !== tracker) {
      tracker.stop();
      return;
    }
    if (!result.ok) {
      trackerRef.current = null;
      if (result.detail === 'superseded') return;
      setMic({ kind: 'blocked', reason: result.reason === 'audio-failed' ? 'unknown' : result.reason });
      return;
    }
    micOpenedBefore = true;
    tracker.on('level', (e) => {
      const el = meterRef.current;
      if (el) el.style.transform = `scaleX(${Math.max(0.02, Math.min(1, (e.db + 70) / 60))})`;
    });
    tracker.on('noteon', (e) => {
      if (alive.current && exercise.type !== 'play-chord') setHeard(e.midi);
    });
    tracker.onStatus((status, fault) => {
      if (alive.current && status === 'stopped' && fault === 'device-lost') setMic({ kind: 'lost' });
    });
    setMic({ kind: 'listening' });
    listen(tracker);
  }, [review, stop, exercise, listen]);

  // A microphone that already opened in this visit starts listening by itself.
  useEffect(() => {
    if (!review && micOpenedBefore) void start();
    // Only on entering the step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (review) {
      setPrimary(null);
      return;
    }
    if (mic.kind === 'listening') {
      if (exercise.type === 'play-phrase') setPrimary({ label: "I'm done", icon: 'Check', onClick: () => listeningRef.current?.finish() });
      else setPrimary({ label: 'Listening…', icon: 'Mic', disabled: true, busy: true });
    } else if (mic.kind === 'starting') setPrimary({ label: 'Opening the microphone', icon: 'Mic', disabled: true, busy: true });
    else if (mic.kind === 'blocked') setPrimary({ label: 'Tap it instead', icon: 'Hand', onClick: () => unavailableRef.current?.() });
    else setPrimary({ label: mic.kind === 'lost' ? 'Listen again' : 'Start listening', icon: 'Mic', onClick: () => void start() });
  }, [mic.kind, review, exercise.type, setPrimary, start]);

  useEffect(() => () => setPrimary(null), [setPrimary]);

  const detail = review?.result.feedback.detail;
  const verb = exercise.type === 'play-chord' ? 'Strum it' : exercise.type === 'play-phrase' ? 'Play the notes in order' : 'Play the note';

  if (mic.kind === 'blocked' && !review) {
    return (
      <div className={styles.answerArea}>
        <Target exercise={exercise} heard={[]} />
        <MediaBlocked reason={mic.reason} device="microphone" onRetry={() => void start()} onContinueWithout={onMicUnavailable} continueLabel="Do the tapping version instead" framed>
          The lesson goes on with a version you answer by tapping, so nothing is lost.
        </MediaBlocked>
      </div>
    );
  }

  return (
    <div className={styles.answerArea}>
      <Target exercise={exercise} heard={exercise.type === 'play-phrase' ? (review?.answer?.type === 'play-phrase' ? review.answer.played : phrase) : []} />
      {!review && (
        <div className={styles.micPanel} aria-live="polite">
          <div className={styles.micRow}>
            <span className={cx(styles.micDot, mic.kind === 'listening' && styles.micOn)} aria-hidden="true" />
            <Text weight="semibold">
              {mic.kind === 'listening' ? `Listening. ${verb}.` : mic.kind === 'starting' ? 'Opening the microphone…' : mic.kind === 'lost' ? 'The microphone went away.' : `${verb}, then I will listen.`}
            </Text>
            {mic.kind === 'starting' && <Spinner size={16} />}
          </div>
          <div className={styles.meter} aria-hidden="true">
            <span ref={meterRef} className={styles.meterFill} />
          </div>
          <div className={styles.heard}>
            <Text variant="caption" tone="muted">
              Heard:
            </Text>
            {heard !== null ? <NoteBadge note={midiToNote(heard)} octave size="md" /> : <Text variant="caption" tone="muted">nothing yet</Text>}
          </div>
          {message && (
            <Text variant="caption" className={styles.micMessage}>
              {message}
            </Text>
          )}
          {exercise.type === 'play-phrase' && mic.kind === 'listening' && (
            <Text variant="caption" tone="muted">
              {phrase.length} of {expectedPhrase.length} notes. Tap "I'm done" when you have played them all.
            </Text>
          )}
        </div>
      )}
      {review && detail?.type === 'play-note' && detail.played !== null && (
        <div className={styles.heard}>
          <Text variant="caption" tone="muted">
            You played:
          </Text>
          <NoteBadge note={midiToNote(detail.played)} octave size="md" />
          {detail.cents !== null && Math.abs(detail.cents) > 15 && (
            <Text variant="caption" tone="muted">
              {Math.abs(Math.round(detail.cents))} cents {detail.cents > 0 ? 'sharp' : 'flat'}: your guitar may need tuning.
            </Text>
          )}
        </div>
      )}
    </div>
  );
}

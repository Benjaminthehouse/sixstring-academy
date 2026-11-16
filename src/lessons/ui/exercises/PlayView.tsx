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
import { parseNote } from '@/core/theory';
import type { MediaFailure } from '@/core/platform';
import { voicingFor } from '../../figures';
import { phraseMidi, playNoteTarget } from '../../grade';
import { listenFor, phraseListenMs, trackerOptionsFor, type Listening } from '../../listen';
import { exerciseSpelling, spellPitch, type SpellContext } from '../../spelling';
import type { PlayChordExercise, PlayExercise, PlayNoteExercise, PlayPhraseExercise, StaffNote, TabNote } from '../../types';
import { FigureView } from '../figures/figures';
import { RichText } from '../RichText';
import { heardNothing } from '../logic/play';
import type { ExerciseViewProps } from './types';
import styles from './Exercises.module.css';

/** Set once the microphone has opened in this visit, so later play steps can start listening by themselves. */
let micOpenedBefore = false;

type MicState = { kind: 'idle' } | { kind: 'starting' } | { kind: 'listening' } | { kind: 'blocked'; reason: MediaFailure } | { kind: 'lost' };

/** "string 6, open" / "string 5, fret 3": a place in plain words. */
function placeWords(p: { string: number; fret: number }): string {
  return `string ${p.string}, ${p.fret === 0 ? 'open' : `fret ${p.fret}`}`;
}

/** The notes of a phrase drawn on a staff (rests left out: the staff figure draws notes only). */
function phraseStaff(notes: readonly TabNote[], midis: readonly number[], context: SpellContext | undefined): StaffNote[] {
  const out: StaffNote[] = [];
  let k = 0;
  for (const n of notes) {
    if ('rest' in n) continue;
    const midi = midis[k++];
    if (midi === undefined) break;
    out.push({ note: spellPitch(midi, context), duration: n.duration.replace(/r$/, '') });
  }
  return out;
}

/** What to aim for, drawn: the position on the neck, the chord box, or the phrase as tab (or a staff, for a reading test). */
function Target({ exercise, heard, reviewed }: { exercise: PlayExercise; heard: number[]; reviewed: boolean }) {
  const context = useMemo(() => exerciseSpelling(exercise), [exercise]);
  if (exercise.type === 'play-note') {
    const target = playNoteTarget(exercise);
    const written = parseNote(exercise.note);
    const hide = exercise.hideNames === true || exercise.staffOnly === true;
    if (exercise.staffOnly) {
      return (
        <div className={styles.playTarget} data-play-target="staff">
          <FigureView figure={{ kind: 'staff', notes: [exercise.note], key: exercise.key }} />
        </div>
      );
    }
    const where = exercise.where;
    const markers: FretMarker[] = where ? [{ ...where, label: '', note: hide || !written ? undefined : written.pcName, noteLabel: hide ? undefined : true, color: 'accent', state: 'target' }] : [];
    return (
      <div className={styles.playTarget} data-play-target="note">
        {!hide && exercise.labels === 'place' && where ? (
          <span className={styles.placeBadge} data-place-label="">
            {placeWords(where)}
          </span>
        ) : (
          !hide && target !== null && written && <NoteBadge note={written.name} octave size="lg" />
        )}
        {where && (
          <div className={styles.neck}>
            <Fretboard frets={[Math.max(0, where.fret - 2), Math.max(4, where.fret + 2)]} markers={markers} size="lg" fretNumbers="all" aria-label={`Play ${placeWords(where)}`} />
          </div>
        )}
      </div>
    );
  }
  if (exercise.type === 'play-chord') {
    const voicing = voicingFor(exercise.chord, exercise.frets, { tuning: exercise.tuning, capo: exercise.capo, fingers: exercise.fingers });
    if (exercise.hideDiagram && !reviewed) {
      return (
        <div className={styles.playTarget} data-play-target="hidden-chord">
          <div className={styles.hiddenChord}>
            <span className={styles.hiddenChordMark} aria-hidden="true">
              ?
            </span>
            <Text variant="caption" tone="muted">
              <RichText text={`Find {c:${exercise.chord}} on your own. The box shows after you play.`} />
            </Text>
          </div>
        </div>
      );
    }
    return (
      <div className={styles.playTarget} data-play-target="chord">
        {voicing ? <ChordDiagram voicing={voicing} fingers={exercise.fingers} chord={exercise.chord} size="md" footer="notes" /> : <RichText text={`{c:${exercise.chord}}`} />}
      </div>
    );
  }
  const expected = phraseMidi(exercise);
  const hide = exercise.hideNames === true || exercise.staffOnly === true;
  return (
    <div className={styles.playTarget} data-play-target="phrase">
      {exercise.staffOnly ? (
        <FigureView figure={{ kind: 'staff', notes: phraseStaff(exercise.notes, expected, context), key: exercise.key }} />
      ) : (
        <FigureView figure={{ kind: 'tab', notes: exercise.notes, tempo: exercise.tempo, tuning: exercise.tuning, capo: exercise.capo, key: exercise.key }} />
      )}
      <ol className={styles.phraseProgress} aria-label="Notes played">
        {expected.map((m, i) => {
          const tab = exercise.notes.filter((n) => !('rest' in n))[i] as { string: number; fret: number } | undefined;
          return (
            <li key={i} className={cx(styles.phraseNote, i < heard.length && styles.phraseDone, exercise.labels === 'place' && !hide && styles.phrasePlace)} aria-label={hide ? `note ${i + 1}` : undefined}>
              {hide ? (
                <span className={styles.phraseIndex}>{i + 1}</span>
              ) : exercise.labels === 'place' && tab ? (
                <>
                  <span className={styles.phraseString}>string {tab.string}</span>
                  <span>{tab.fret === 0 ? 'open' : `fret ${tab.fret}`}</span>
                </>
              ) : (
                <RichText text={`{n:${spellPitch(m, context)}}`} />
              )}
            </li>
          );
        })}
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
  // A heard pitch is named in the exercise's key (C#4 in A major, never Db4); by name alone where targets are labelled by place.
  const context = useMemo(() => exerciseSpelling(exercise), [exercise]);
  const byPlace = exercise.type !== 'play-chord' && exercise.labels === 'place';
  const heardName = useCallback((midi: number) => spellPitch(midi, context, { octave: !byPlace }), [context, byPlace]);

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
        // A phrase gets as long as it lasts (twice over, at least 40 s): a 16-bar melody must not time out halfway.
        timeoutMs: exercise.type === 'play-phrase' ? phraseListenMs(exercise) : 30_000,
        onNote: (midi, right) => {
          if (!alive.current) return;
          setHeard(midi);
          if (exercise.type === 'play-phrase') {
            setPhrase((p) => [...p, midi]);
            setMessage(null);
          } else if (!right) {
            const where = exercise.type === 'play-note' && exercise.where && !exercise.staffOnly ? ` Aim for ${placeWords(exercise.where)}.` : '';
            // Markup, so the name reads C♯3 (or Do♯3) like every other note on screen, never "C#3".
            setMessage(`That was {n:${heardName(midi)}}.${where}`);
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
    [exercise, level, stop, heardName],
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
        <Target exercise={exercise} heard={[]} reviewed={false} />
        {/* The way on is the bar's one primary button ("Tap it instead"), not a second copy here. */}
        <MediaBlocked reason={mic.reason} device="microphone" onRetry={() => void start()} framed>
          Tap it instead: the lesson goes on with a version you answer by tapping, so nothing is lost.
        </MediaBlocked>
      </div>
    );
  }

  return (
    <div className={styles.answerArea}>
      <Target exercise={exercise} heard={exercise.type === 'play-phrase' ? (review?.answer?.type === 'play-phrase' ? review.answer.played : phrase) : []} reviewed={!!review} />
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
            {heard !== null ? <NoteBadge note={heardName(heard)} octave={!byPlace} size="md" /> : <Text variant="caption" tone="muted">nothing yet</Text>}
          </div>
          {message && (
            <Text variant="caption" className={styles.micMessage}>
              <RichText text={message} terms={false} />
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
          <NoteBadge note={heardName(detail.played)} octave={!byPlace} size="md" />
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

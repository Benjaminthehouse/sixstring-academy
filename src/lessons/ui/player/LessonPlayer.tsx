/**
 * The lesson player: runs any session the lesson engine builds (a lesson, a checkpoint, a unit
 * practice drill, a review) full-screen and free of distraction.
 *
 *   top     close (asks first, offers "Save and leave"), progress, hearts / mistakes left, combo
 *   middle  the teaching card or the exercise
 *   bottom  one primary button in the thumb zone: Check, then the feedback slides up, Continue
 *
 * Keyboard: number keys pick, Enter checks and continues, Space replays (or taps), Backspace
 * clears, arrows nudge, Escape asks to leave. Sounds go through `playUi`; XP, streak, quests and
 * achievements are announced by the shell, and shown again in the summary.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useImmersive, useScreenTitle } from '@/app/shell';
import { ActionBar, Button, HeartsChip, Icon, IconButton, Kbd, Page, ProgressBar, Text, cx, toast, useIsMobile, useIsTouch, useWakeLock } from '@/ui';
import { playUi } from '@/core/audio';
import { isArtifact } from '@/core/platform';
import { sessionReport, type EffectResults, type ProgressPort } from '../../effects';
import { currentStep, isResumable, mistakesLeft, sessionProgress, type SessionSource } from '../../session';
import { nextLesson } from '../../map';
import { practiceSource } from '../../start';
import type { Answer, Course } from '../../types';
import { LessonProvider } from '../context';
import { isTypingTarget, StepKeysProvider, useKeysRegistry } from '../keys';
import { isCheckable } from '../logic/drafts';
import { positionOfKey } from '../logic/layout';
import { nextLabel, type NextStep } from '../logic/summary';
import { selfSubmitting } from '../exercises/registry';
import type { PrimaryAction } from '../exercises/types';
import { useMusicSettings } from '@/ui/music';
import { FeedbackPanel, LeaveDialog, SummaryView } from './Panels';
import { ExerciseFrame, PausedNote, TeachingCard } from './StepViews';
import { useLessonSession } from './useLessonSession';
import styles from './Player.module.css';

/** Props of {@link LessonPlayer}. */
export interface LessonPlayerProps {
  /** What to run (see `SessionSource` in `@/lessons`). */
  source: SessionSource;
  /** Leave the player: the close button after "Save and leave", and "Back to the path". */
  onExit: () => void;
  /**
   * The obvious next step after the summary ("Next lesson", "Practise to refill hearts"). Without
   * it the player runs the next lesson or the practice drill itself, in place.
   */
  onNext?: (step: NextStep) => void;
  /** Words of the way back (default "Back to the path"). */
  exitLabel?: string;
  /** Where effects go (default: the app's progress store). A gallery passes a port that keeps nothing. */
  port?: ProgressPort;
  /** Save the unfinished session and offer it again (default true). */
  persist?: boolean;
  /** Route and params that reopen this session, stored with the activity ("Continue" on Today). */
  route?: string;
  params?: string[];
}

const COMBO_SOUNDS = new Set([3, 5, 10, 15, 20, 30]);

function courseOf(source: SessionSource): Course | null {
  return source.mode === 'review' ? (source.courses[0] ?? null) : source.course;
}

function nounOf(mode: SessionSource['mode']): string {
  return mode === 'checkpoint' ? 'checkpoint' : mode === 'practice' ? 'practice' : mode === 'review' ? 'review' : 'lesson';
}

/** True for a click or key event's target that should keep its own Enter / Space (the bar's buttons, links, a "hint" button). */
function ownsEnter(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && typeof el.closest === 'function' && !!el.closest('[data-own-enter], [data-player-bar] button, a[href]');
}

function inNativeKeys(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && typeof el.closest === 'function' && !!el.closest('[data-native-keys]');
}

/** Run a lesson session full-screen. */
export function LessonPlayer({ source: initialSource, onExit, onNext, exitLabel = 'Back to the path', port, persist = true, route, params }: LessonPlayerProps) {
  const session = useLessonSession({ source: initialSource, port, persist, route, params, mic: isArtifact() ? false : undefined });
  const { state, dispatch, results, restart, source } = session;
  const course = courseOf(source);
  const step = currentStep(state);
  const progress = sessionProgress(state);
  const done = state.phase === 'done';
  const isMobile = useIsMobile();
  const isTouch = useIsTouch();
  const hints = !isMobile && !isTouch;
  const { naming } = useMusicSettings();
  // The draft and the primary-button override belong to one step: kept with its id, so a new
  // step never sees the last one's (child effects run before the player's own).
  const [draftState, setDraftState] = useState<{ id: string; answer: Answer | null } | null>(null);
  const [primaryState, setPrimaryState] = useState<{ id: string; action: PrimaryAction } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const registry = useKeysRegistry();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const continueRef = useRef<HTMLButtonElement | null>(null);
  const noun = nounOf(state.mode);

  useImmersive(true, 'focus');
  useScreenTitle(state.title || 'Lesson');
  useWakeLock(!done);

  const stepId = step ? `${step.key}:${step.kind === 'exercise' ? step.attempt : 0}:${step.kind === 'exercise' && step.alternative ? 'alt' : ''}` : 'done';
  const draft = draftState && draftState.id === stepId ? draftState.answer : null;
  const primary = primaryState && primaryState.id === stepId ? primaryState.action : null;
  const setDraft = useCallback((answer: Answer | null) => setDraftState({ id: stepId, answer }), [stepId]);

  // A new step starts at the top of the view.
  useEffect(() => {
    if (stageRef.current && state.phase === 'step') {
      const top = stageRef.current.getBoundingClientRect().top + window.scrollY - 120;
      if (window.scrollY > top) window.scrollTo({ top: Math.max(0, top) });
    }
    // Only when the step changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId]);

  // Picked up from a save: say so once, and offer a fresh start.
  useEffect(() => {
    if (!session.resumed) return;
    toast({
      title: 'Picked up where you left off',
      description: `Step ${progress.done + 1} of ${progress.total}.`,
      action: { label: 'Start over', onClick: () => restart() },
    });
    // Once, on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Feedback appears: the sound, and focus on Continue so Enter (or a screen reader) goes on.
  const feedback = state.phase === 'feedback' ? state.feedback : null;
  useEffect(() => {
    if (!feedback) return;
    if (feedback.result.correct) {
      playUi('correct');
      if (COMBO_SOUNDS.has(state.stats.combo)) window.setTimeout(() => playUi('combo', { step: Math.min(8, Math.floor(state.stats.combo / 3)) }), 180);
    } else if (!feedback.skipped) {
      playUi('wrong');
    }
    continueRef.current?.focus({ preventScroll: true });
    // On each new feedback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback]);

  // The end: the completion sound once.
  useEffect(() => {
    if (done && state.outcome === 'completed' && state.summary && state.summary.exercises > 0) playUi('lessonComplete');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const setPrimary = useCallback(
    (action: PrimaryAction | null) => setPrimaryState((prev) => (action ? { id: stepId, action } : prev && prev.id === stepId ? null : prev)),
    [stepId],
  );

  const submit = useCallback(
    (answer: Answer) => {
      const s = currentStep(state);
      const result = dispatch({ type: 'answer', answer });
      // A self-rated flashcard needs no verdict: on to the next step at once.
      if (s?.kind === 'exercise' && s.exercise.type === 'flashcard' && result.state.phase === 'feedback') dispatch({ type: 'continue' });
    },
    [dispatch, state],
  );

  const check = () => {
    if (state.phase !== 'step' || !step || step.kind !== 'exercise') return;
    if (primary) {
      if (!primary.disabled) primary.onClick?.();
      return;
    }
    if (isCheckable(draft)) submit(draft);
  };
  const advance = () => dispatch({ type: 'continue' });
  const skip = () => dispatch({ type: 'skip' });
  const cantPlay = useCallback(() => void dispatch({ type: 'cant-play', scope: 'session' }), [dispatch]);
  const micUnavailable = useCallback(() => void dispatch({ type: 'mic', available: false }), [dispatch]);

  const askToLeave = () => {
    if (done || !isResumable(state)) {
      onExit();
      return;
    }
    dispatch({ type: 'pause' });
    setLeaving(true);
  };
  const stay = () => {
    setLeaving(false);
    dispatch({ type: 'resume' });
  };
  const saveAndLeave = () => {
    setLeaving(false);
    onExit();
  };
  const endNow = () => {
    setLeaving(false);
    dispatch({ type: 'quit' });
  };

  // The next step the summary offers.
  const next: NextStep = useMemo(() => {
    if (!done || !state.summary) return { kind: 'path' };
    const s = state.summary;
    if (s.outcome === 'out-of-hearts' && state.unitId) return { kind: 'practice', unitId: state.unitId };
    if (s.outcome === 'failed') return { kind: 'path' };
    if (s.outcome === 'quit') return { kind: 'path' };
    if (course && source.mode !== 'review') {
      const n = nextLesson(course, session.port.getState(), Date.now());
      if (n) {
        const lesson = course.units.find((u) => u.id === n.unitId)?.lessons.find((l) => l.id === n.lessonId);
        if (lesson && lesson.id !== state.lessonId) return { kind: 'lesson', unitId: n.unitId, lessonId: n.lessonId, title: lesson.title };
      }
    }
    return { kind: 'path' };
    // results: the store has just recorded the session, so "next" reads fresh progress.
  }, [done, state.summary, state.unitId, state.lessonId, course, source.mode, session.port, results]);

  const goNext = () => {
    if (next.kind === 'path') return onExit();
    if (onNext) return onNext(next);
    if (next.kind === 'lesson' && course) restart({ mode: 'lesson', course, lessonId: next.lessonId });
    else if (next.kind === 'practice' && course) restart(practiceSource(course, next.unitId, session.port.getState()));
    else onExit();
  };

  // The one keyboard listener of the lesson.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (leaving || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const typing = isTypingTarget(e.target);
      if (typing && !(e.target instanceof HTMLInputElement && (e.key === 'Enter' || e.key === 'Escape'))) return;
      const handlers = registry.current;
      if (e.key === 'Escape') {
        e.preventDefault();
        askToLeave();
        return;
      }
      if (e.key === 'Enter') {
        if (ownsEnter(e.target)) return;
        if (handlers?.enter?.()) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        if (done) goNext();
        else if (state.phase === 'feedback' || step?.kind === 'card') advance();
        else check();
        return;
      }
      if (state.phase !== 'step' || !step) return;
      if (step.kind === 'card') {
        if (e.key === 'ArrowRight' || e.key === ' ') {
          if (e.key === ' ' && ownsEnter(e.target)) return;
          e.preventDefault();
          advance();
        }
        return;
      }
      if (e.key === ' ') {
        if (handlers?.space?.()) e.preventDefault();
        return;
      }
      if (e.key === 'Backspace') {
        if (handlers?.backspace?.()) e.preventDefault();
        return;
      }
      if (e.key.startsWith('Arrow')) {
        if (inNativeKeys(e.target)) return;
        if (handlers?.arrow?.(e.key as 'ArrowUp')) e.preventDefault();
        return;
      }
      const position = positionOfKey(e.key);
      if (position !== null) {
        if (handlers?.digit?.(position)) e.preventDefault();
        return;
      }
      if (e.key.length === 1 && handlers?.char?.(e.key)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const report = done && state.summary ? sessionReport(state.summary, results ?? EMPTY_RESULTS) : null;
  const checkpointLeft = mistakesLeft(state);
  const exercise = step?.kind === 'exercise' ? step.exercise : null;
  const review = feedback && exercise ? { result: feedback.result, answer: feedback.answer } : null;
  const canCheck = isCheckable(draft);
  const playStep = !!exercise && (exercise.type === 'play-note' || exercise.type === 'play-chord' || exercise.type === 'play-phrase');
  const altReason = step?.kind === 'exercise' && step.alternative ? (isArtifact() ? 'The microphone is not available in this viewer, so this one is answered by tapping.' : 'This is the version you answer by tapping.') : null;

  return (
    <LessonProvider course={course}>
      <StepKeysProvider registry={registry}>
        <Page title={state.title || 'Lesson'} hideHeader className={styles.page}>
          <div className={styles.player} data-lesson-player="" data-phase={state.phase} data-mode={state.mode}>
            <header className={styles.top}>
              <IconButton icon="X" label={done ? 'Close' : `Leave the ${noun}`} onClick={askToLeave} data-close="" />
              <div className={styles.progress}>
                <ProgressBar value={progress.done} max={Math.max(1, progress.total)} aria-label={`${state.title}: progress`} valueText={false} tone="ok" size="md" />
              </div>
              <div className={styles.status}>
                {state.stats.combo >= 2 && !done && (
                  <span key={state.stats.combo} className={styles.combo} aria-label={`${state.stats.combo} right in a row`} data-combo={state.stats.combo}>
                    <Icon name="Flame" size="sm" />
                    {state.stats.combo}
                  </span>
                )}
                {state.hearts !== null && (
                  <span key={`h${state.hearts}`} className={cx(styles.hearts, feedback?.heartLost && styles.heartsLost)} data-hearts={state.hearts}>
                    <HeartsChip value={state.hearts} max={5} pips={!isMobile} />
                  </span>
                )}
                {checkpointLeft !== null && (
                  <span className={styles.allowance} data-mistakes-left={checkpointLeft}>
                    <Icon name="ShieldCheck" size="sm" /> {checkpointLeft} {checkpointLeft === 1 ? 'mistake' : 'mistakes'} left
                  </span>
                )}
                {state.paused && leaving && <PausedNote />}
              </div>
            </header>

            <div className={styles.stage} ref={stageRef} key={stepId} data-step-id={stepId}>
              {report ? (
                <SummaryView report={report} teacher={course?.teacher ?? 'none'} />
              ) : step?.kind === 'card' ? (
                <TeachingCard card={step.card} onNext={advance} />
              ) : step?.kind === 'exercise' ? (
                <ExerciseFrame
                  exercise={step.exercise}
                  presentation={step.presentation}
                  review={review}
                  attempt={step.attempt}
                  alternative={step.alternative}
                  alternativeReason={altReason}
                  onDraft={setDraft}
                  onSubmit={submit}
                  setPrimary={setPrimary}
                  onCantPlay={step.usesMic ? cantPlay : undefined}
                  onMicUnavailable={step.usesMic ? micUnavailable : undefined}
                  hints={hints}
                  level={state.level}
                  naming={naming}
                  uid={`step-${stepId.replace(/[^a-z0-9]/gi, '')}`}
                />
              ) : null}
            </div>

            <ActionBar className={cx(styles.bar, feedback && styles[`bar-${feedback.result.correct ? 'ok' : feedback.skipped ? 'info' : 'bad'}`])} stretchOnMobile={false} data-player-bar="">
              <div className={styles.barInner}>
                {feedback && exercise && <FeedbackPanel exercise={exercise} feedback={feedback} seed={state.stats.answers} combo={state.stats.combo} />}
                <div className={styles.barButtons}>
                  {hints && !done && (
                    <span className={styles.barKeys} aria-hidden="true">
                      <Kbd>Enter</Kbd> {feedback || step?.kind === 'card' ? 'continue' : 'check'} · <Kbd>Esc</Kbd> leave
                    </span>
                  )}
                  {done ? (
                    <>
                      {next.kind !== 'path' && (
                        <Button onClick={onExit} data-action="exit">
                          {exitLabel}
                        </Button>
                      )}
                      {state.summary?.outcome === 'failed' && (
                        <Button onClick={() => restart()} data-action="retry">
                          Try again
                        </Button>
                      )}
                      <Button variant="primary" size="lg" iconRight="ArrowRight" className={styles.primary} onClick={goNext} data-action="next" ref={continueRef}>
                        {next.kind === 'path' ? (source.mode === 'review' ? 'Back to learning' : exitLabel) : nextLabel(next, state.mode)}
                      </Button>
                    </>
                  ) : feedback || step?.kind === 'card' ? (
                    <Button variant="primary" size="lg" iconRight="ArrowRight" className={styles.primary} onClick={advance} ref={continueRef} data-action="continue">
                      Continue
                    </Button>
                  ) : exercise ? (
                    <>
                      {exercise.type !== 'flashcard' && (
                        <Button variant="ghost" onClick={skip} data-action="skip" className={styles.skip}>
                          {playStep ? 'Skip' : "I don't know"}
                        </Button>
                      )}
                      {primary ? (
                        <Button variant="primary" size="lg" className={styles.primary} iconLeft={primary.icon} onClick={primary.onClick} disabled={primary.disabled} loading={primary.busy} data-action="primary">
                          {primary.label}
                        </Button>
                      ) : selfSubmitting(exercise) ? null : (
                        <Button variant="primary" size="lg" className={styles.primary} onClick={check} disabled={!canCheck} data-action="check">
                          Check
                        </Button>
                      )}
                    </>
                  ) : null}
                </div>
              </div>
            </ActionBar>
          </div>
          <LeaveDialog open={leaving} noun={noun} done={progress.done} total={progress.total} onStay={stay} onSave={saveAndLeave} onEnd={endNow} />
          {!done && state.mode === 'review' && progress.total > 0 && (
            <Text variant="caption" tone="muted" className="sr-only" aria-live="polite">
              {progress.remaining} cards left
            </Text>
          )}
        </Page>
      </StepKeysProvider>
    </LessonProvider>
  );
}

const EMPTY_RESULTS: EffectResults = { activity: null, heart: null, cardsAdded: 0, reviews: [], skillsMarked: [] };

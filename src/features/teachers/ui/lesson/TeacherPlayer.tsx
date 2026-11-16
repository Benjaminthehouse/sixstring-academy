/**
 * A teacher's lesson, full screen: the lesson engine's session (`useLessonSession`) with the
 * teacher in the room. It is the engine's player made from the same parts (`ExerciseFrame`,
 * `FeedbackPanel`, `SummaryView`, `LeaveDialog`), with four differences:
 *
 *   - teaching cards show the teacher's portrait and name and read aloud in their voice;
 *   - after an answer the teacher reacts in a short line of their own before the explanation;
 *   - a task card sends the learner to a tool (Player, Tuner, Metronome, Technique ...) with its
 *     place kept, and welcomes them back with what the progress log shows they did there;
 *   - the unit's performance is framed as a show, and finishing it ends the unit with the
 *     teacher's celebration.
 *
 * The summary also lists the plan's Theory Path lessons behind the lesson; playing along in the
 * Player's listen mode (which logs nothing by itself) is logged as practice when the learner comes
 * back and goes on; and the shell's rewards wait for the summary (`useRewardHold`).
 *
 * It duplicates the engine's `LessonPlayer` loop (keys, feedback, leave dialog, summary). Folding it
 * into a custom-step slot of `@/lessons/ui` would remove about 300 lines, but that is the lessons
 * engine's code; until it offers such a slot, keep the two in step by hand.
 *
 * Same keys as the Theory Path: number keys pick, Enter checks and continues (opens a task's tool,
 * or continues once back), Space replays or taps, Backspace takes back, Escape asks to leave.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '@/app/router';
import { useImmersive, useRewardHandoff, useRewardHold, useScreenTitle } from '@/app/shell';
import { teacherById } from '@/app/teachers';
import { playUi } from '@/core/audio';
import { isArtifact } from '@/core/platform';
import { getProgress, markSkill, recordActivity, touchRecent } from '@/core/progress';
import {
  currentStep, explainOf, isResumable, mistakesLeft, nextLesson, sessionProgress, sessionReport, speakable,
  type Answer, type EffectResults, type SessionSource,
} from '@/lessons';
import {
  ExerciseFrame, FeedbackPanel, LeaveDialog, LessonProvider, StepKeysProvider, SummaryView, feedbackCopy, nextLabel, selfSubmitting, teacherLine, useKeysRegistry, useLessonSession,
  type NextStep, type PrimaryAction,
} from '@/lessons/ui';
import { useMusicSettings } from '@/ui/music';
import { ActionBar, Button, Icon, IconButton, Kbd, Page, ProgressBar, Text, cx, toast, useIsMobile, useIsTouch, useWakeLock } from '@/ui';
import { OUTLINE, PROFILES, TASK_TOOLS, hasArt, isTaskStep, pickLine, taskRoute, type TaskStep, type TeacherCourse } from '@/content/teachers';
import { courseStanding } from '../../model/standing';
import { clearPendingTask, findTaskActivity, playAlongLine, playAlongPractice, readPendingTask, savePendingTask } from '../../model/tasks';
import { inNativeKeys, isCheckable, isTypingTarget, ownsEnter, positionOfKey } from './keys';
import { Reaction, TaskCard, TeacherCard, TeacherLine, useTaskTarget, type TaskState } from './Steps';
import { TheoryLinks } from './TheoryLinks';
import { UnitComplete } from './UnitComplete';
import { Portrait } from '../Portrait';
import styles from './Lesson.module.css';

/** Props of {@link TeacherPlayer}. */
export interface TeacherPlayerProps {
  tc: TeacherCourse;
  source: SessionSource;
  /** The route params that reopen this session (`['mia', 'tune-up']`). */
  params: string[];
  onExit: () => void;
}

const COMBO_SOUNDS = new Set([3, 5, 10, 15, 20, 30]);
const EMPTY_RESULTS: EffectResults = { activity: null, heart: null, cardsAdded: 0, reviews: [], skillsMarked: [] };

/** Run a teacher's session (a lesson, a checkpoint, a practice drill or a review) full screen. */
export function TeacherPlayer({ tc, source: initialSource, params, onExit }: TeacherPlayerProps) {
  const teacher = tc.teacher;
  const card = teacherById(teacher);
  const profile = PROFILES[teacher];
  const session = useLessonSession({ source: initialSource, persist: true, route: 'teachers', params, mic: isArtifact() ? false : undefined });
  const { state, dispatch, results, restart, source } = session;
  const course = tc.course;
  const step = currentStep(state);
  const progress = sessionProgress(state);
  const done = state.phase === 'done';
  const isMobile = useIsMobile();
  // Both hooks run on every render: a phone turned sideways (or a window resized) crosses the
  // phone width, and a hook skipped by `&&` would change the hook order and crash the lesson.
  const isTouch = useIsTouch();
  const hints = !isMobile && !isTouch;
  const { naming } = useMusicSettings();
  const [draftState, setDraftState] = useState<{ id: string; answer: Answer | null } | null>(null);
  const [primaryState, setPrimaryState] = useState<{ id: string; action: PrimaryAction } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const registry = useKeysRegistry();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const continueRef = useRef<HTMLButtonElement | null>(null);
  const noun = state.mode === 'checkpoint' ? 'checkpoint' : state.mode === 'practice' ? 'practice' : state.mode === 'review' ? 'review' : 'lesson';

  useImmersive(true, 'focus');
  useScreenTitle(state.title || 'Lesson');
  useWakeLock(!done);
  // The shell's rewards (the previous lesson's card, a new level) wait for the summary, never over a step.
  useRewardHold(!done);
  // "Next lesson" holds them from the tap, so the summary's card leaves before the next lesson shows.
  const handOff = useRewardHandoff();

  // The step as authored (a task, a card with a drawing, the unit's performance).
  const head = state.queue[0];
  const authoredId = head ? (head.step as { id?: string }).id : undefined;
  const authored = state.lessonId ? tc.step(state.lessonId, authoredId) : null;
  const task: TaskStep | null = step?.kind === 'card' && authored && isTaskStep(authored) ? authored : null;
  const unit = state.lessonId ? tc.unitOf(state.lessonId) : state.unitId ? (tc.units.find((u) => u.id === state.unitId) ?? null) : null;
  const milestone = unit?.milestone && unit.milestone.lesson === state.lessonId ? unit.milestone : null;
  const performing = !!milestone && step?.kind === 'exercise' && authoredId === milestone.step;

  const stepId = step ? `${step.key}:${step.kind === 'exercise' ? step.attempt : 0}:${step.kind === 'exercise' && step.alternative ? 'alt' : ''}` : 'done';
  const draft = draftState && draftState.id === stepId ? draftState.answer : null;
  const primary = primaryState && primaryState.id === stepId ? primaryState.action : null;
  const setDraft = useCallback((answer: Answer | null) => setDraftState({ id: stepId, answer }), [stepId]);
  const setPrimary = useCallback(
    (action: PrimaryAction | null) => setPrimaryState((prev) => (action ? { id: stepId, action } : prev && prev.id === stepId ? null : prev)),
    [stepId],
  );

  // ── Tasks: out to a tool and back ──────────────────────────────────────────────────────────
  const taskTarget = useTaskTarget(task ?? PLACEHOLDER_TASK);
  const [taskBack, setTaskBack] = useState<{ stepId: string; openedAt: number } | null>(() => {
    // Opening on a task the learner went out to do: they are back.
    const t = state.lessonId && authoredId ? readPendingTask(Date.now(), { teacher, lessonId: state.lessonId, taskId: authoredId }) : null;
    return t ? { stepId, openedAt: t.openedAt } : null;
  });
  const back = task && taskBack && taskBack.stepId === stepId ? taskBack : null;
  const taskState: TaskState | null = task
    ? {
        target: taskTarget.target,
        fallback: taskTarget.fallback,
        phase: back ? 'back' : 'ready',
        done: back ? findTaskActivity(taskTarget.target, getProgress().log, back.openedAt) : null,
        unavailable: taskTarget.unavailable,
      }
    : null;
  const backLine = taskState?.done ? pickLine(profile.taskBack.done, state.stats.answers + progress.done) : profile.taskBack.unsure;
  // Played along in listen mode, which the Player does not log as practice: Continue logs it.
  const playAlong =
    task && back && taskState && !taskState.done ? playAlongPractice(taskState.target, { openedAt: back.openedAt, now: Date.now(), minutes: task.minutes, title: taskState.fallback && task.fallback?.title ? task.fallback.title : task.title, logged: null }) : null;
  if (taskState) taskState.credit = playAlongLine(playAlong);

  const openTask = () => {
    if (!task || !state.lessonId || !taskState || taskState.unavailable) return;
    const { route, params: toolParams } = taskRoute(taskState.target);
    savePendingTask({ teacher, lessonId: state.lessonId, taskId: task.id, target: taskState.target, openedAt: Date.now() });
    // Time out in the tool is not lesson time; Today's "Continue" leads back here.
    dispatch({ type: 'pause' });
    touchRecent({ route: 'teachers', params, title: `${state.title} with ${card.first}`, kind: 'teacher-lesson', fraction: progress.fraction });
    setTaskBack({ stepId, openedAt: Date.now() });
    navigate(route, ...toolParams);
  };
  const leaveTask = () => {
    if (playAlong) {
      try {
        recordActivity(playAlong);
      } catch {
        // Practice that could not be logged must not stop the lesson.
      }
    }
    clearPendingTask();
    setTaskBack(null);
    dispatch({ type: 'continue' });
  };

  // A new step starts at the top of the view.
  useEffect(() => {
    if (stageRef.current && state.phase === 'step') {
      const top = stageRef.current.getBoundingClientRect().top + window.scrollY - 120;
      if (window.scrollY > top) window.scrollTo({ top: Math.max(0, top) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId]);

  // Picked up from a save: say so once (unless the learner is simply back from a task).
  useEffect(() => {
    if (!session.resumed || back) return;
    toast({
      title: 'Picked up where you left off',
      description: `Step ${progress.done + 1} of ${progress.total}.`,
      action: { label: 'Start over', onClick: () => restart() },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback]);

  // The end: the sound, the pending task forgotten, and the course flag when the whole plan is done.
  useEffect(() => {
    if (!done) return;
    clearPendingTask();
    if (state.outcome === 'completed' && state.summary && state.summary.exercises > 0) playUi('lessonComplete');
    const outline = OUTLINE.find((o) => o.id === teacher);
    if (outline && courseStanding(getProgress(), outline).finished) markSkill(`teacher:${teacher}:course`, { completed: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const submit = useCallback(
    (answer: Answer) => {
      const s = currentStep(state);
      const result = dispatch({ type: 'answer', answer });
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
  const advance = () => {
    if (task) {
      leaveTask();
      return;
    }
    dispatch({ type: 'continue' });
  };
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
    clearPendingTask();
    dispatch({ type: 'quit' });
  };

  // What the summary offers next: the next lesson of the course (by the engine's map), else the course page.
  const next: NextStep = useMemo(() => {
    if (!done || !state.summary) return { kind: 'path' };
    const s = state.summary;
    if (s.outcome === 'failed' || s.outcome === 'quit') return { kind: 'path' };
    if (source.mode !== 'review') {
      const n = nextLesson(course, session.port.getState(), Date.now());
      if (n && n.lessonId !== state.lessonId) {
        const l = tc.lesson(n.lessonId);
        if (l) return { kind: 'lesson', unitId: n.unitId, lessonId: n.lessonId, title: l.title };
      }
    }
    return { kind: 'path' };
    // `results` arrive when the store has recorded the session, so the map reads fresh progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, state.summary, state.lessonId, course, source.mode, results]);
  const exitLabel = `Back to ${card.first}'s course`;
  const goNext = () => {
    if (next.kind === 'lesson') {
      handOff();
      navigate('teachers', teacher, next.lessonId);
    } else onExit();
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
        else if (task && taskState?.phase === 'ready' && !taskState.unavailable) openTask();
        else if (task && taskState?.phase === 'ready') advance();
        else if (state.phase === 'feedback' || step?.kind === 'card') advance();
        else check();
        return;
      }
      if (state.phase !== 'step' || !step) return;
      if (step.kind === 'card') {
        if (!task && (e.key === 'ArrowRight' || e.key === ' ')) {
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
  const altReason = step?.kind === 'exercise' && step.alternative ? (isArtifact() ? 'The microphone is not available in this viewer, so this one is answered by tapping.' : 'This is the version you answer by tapping.') : null;
  // The teacher's line sits right above the panel's verdict ("Right.", "Not quite."): never the same words twice.
  const verdict = feedback && exercise ? feedbackCopy(exercise, feedback, state.stats.answers).title : '';
  const reaction = feedback ? pickLine(feedback.skipped ? profile.reactions.skipped : feedback.result.correct ? profile.reactions.right : profile.reactions.wrong, state.stats.answers, verdict) : '';
  const unitDone = !!report && !!milestone && report.outcome === 'completed' && state.mode === 'lesson';
  const tool = taskState ? TASK_TOOLS[taskState.target.tool] : null;

  const exerciseFrame = step?.kind === 'exercise' && (
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
  );

  return (
    <LessonProvider course={course}>
      <StepKeysProvider registry={registry}>
        <Page title={state.title || 'Lesson'} hideHeader className={styles.page}>
          <div className={styles.player} data-lesson-player="" data-teacher-player={teacher} data-phase={state.phase} data-mode={state.mode}>
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
                {checkpointLeft !== null && (
                  <span className={styles.allowance} data-mistakes-left={checkpointLeft}>
                    <Icon name="ShieldCheck" size="sm" /> {checkpointLeft} {checkpointLeft === 1 ? 'mistake' : 'mistakes'} left
                  </span>
                )}
                <span className={styles.with} aria-label={`With ${card.name}`}>
                  <Portrait teacher={teacher} size={1.75} />
                  <span className={styles.withName}>{card.first}</span>
                </span>
              </div>
            </header>

            <div className={styles.stage} ref={stageRef} key={stepId} data-step-id={stepId}>
              {report ? (
                <div className={styles.end}>
                  {unitDone && unit && milestone ? (
                    // Once the microphone is off for the session (refused, missing, "can't play now"), the show was its tapping version.
                    <UnitComplete teacher={teacher} unit={unit} milestone={milestone} tc={tc} played={!state.micOff} />
                  ) : (state.summary?.exercises ?? 0) === 0 ? null : (
                    // A session with nothing in it (a review with no card due) gets no "well done".
                    <div className={styles.says} data-teacher-says="">
                      <TeacherLine teacher={teacher} size={3}>
                        <span className={styles.saysLine}>{teacherLine(teacher, report.outcome, report.perfect)}</span>
                      </TeacherLine>
                    </div>
                  )}
                  <SummaryView report={report} teacher="none" />
                  {state.mode === 'lesson' && state.lessonId && report.outcome !== 'quit' && <TheoryLinks teacher={teacher} lessonId={state.lessonId} />}
                </div>
              ) : task && taskState ? (
                <TaskCard teacher={teacher} task={task} state={taskState} backLine={backLine} />
              ) : step?.kind === 'card' ? (
                <TeacherCard teacher={teacher} card={step.card} art={authored && hasArt(authored) ? authored.art : undefined} onNext={advance} />
              ) : performing && milestone ? (
                <section className={styles.show} data-performance={milestone.step}>
                  <div className={styles.showHead}>
                    <span className={styles.spot} aria-hidden="true">
                      <Icon name="Sparkles" size="sm" />
                    </span>
                    <div>
                      <Text variant="eyebrow" tone="accent">
                        Your show
                      </Text>
                      <Text weight="semibold">{milestone.piece}</Text>
                    </div>
                  </div>
                  <div className={styles.showWords}>
                    <TeacherLine teacher={teacher} size={2.25}>
                      <span className={styles.saysLine}>{profile.performance}</span>
                    </TeacherLine>
                  </div>
                  {exerciseFrame}
                </section>
              ) : (
                exerciseFrame
              )}
            </div>

            <ActionBar className={cx(styles.bar, feedback && styles[`bar-${feedback.result.correct ? 'ok' : feedback.skipped ? 'info' : 'bad'}`])} stretchOnMobile={false} data-player-bar="">
              <div className={styles.barInner}>
                {feedback && exercise && (
                  <>
                    <Reaction teacher={teacher} line={reaction} explain={speakable(explainOf(exercise) ?? '', {})} />
                    <FeedbackPanel exercise={exercise} feedback={feedback} seed={state.stats.answers} combo={state.stats.combo} />
                  </>
                )}
                <div className={cx(styles.barButtons, done && styles.barButtonsDone)}>
                  {hints && !done && (
                    <span className={styles.barKeys} aria-hidden="true">
                      <Kbd>Enter</Kbd> {task && taskState?.phase === 'ready' ? (taskState.unavailable ? 'skip' : `open ${tool?.name ?? 'the tool'}`) : feedback || step?.kind === 'card' ? 'continue' : primary ? primary.label.toLowerCase() : 'check'} · <Kbd>Esc</Kbd> leave
                    </span>
                  )}
                  {done ? (
                    <>
                      {next.kind !== 'path' && (
                        <Button onClick={onExit} data-action="exit" wrap>
                          {exitLabel}
                        </Button>
                      )}
                      {state.summary?.outcome === 'failed' && (
                        <Button onClick={() => restart()} data-action="retry" wrap>
                          Try again
                        </Button>
                      )}
                      <Button variant="primary" size="lg" iconRight="ArrowRight" className={styles.primary} onClick={goNext} data-action="next" ref={continueRef} wrap>
                        {next.kind === 'path' ? exitLabel : nextLabel(next, state.mode)}
                      </Button>
                    </>
                  ) : task && taskState ? (
                    taskState.phase === 'ready' ? (
                      taskState.unavailable ? (
                        <Button variant="primary" size="lg" iconRight="ArrowRight" className={styles.primary} onClick={advance} ref={continueRef} data-action="skip-task">
                          Skip for now
                        </Button>
                      ) : (
                        <>
                          <Button variant="ghost" onClick={advance} data-action="skip-task" className={styles.skip}>
                            {isMobile ? 'Skip' : 'Skip for now'}
                          </Button>
                          <Button variant="primary" size="lg" iconRight="ArrowUpRight" className={styles.primary} onClick={openTask} disabled={taskTarget.checking} data-action="open-task" wrap>
                            {`Open ${tool?.name ?? 'the tool'}`}
                          </Button>
                        </>
                      )
                    ) : (
                      <>
                        <Button variant="ghost" iconLeft="RotateCcw" onClick={openTask} data-action="open-again" className={styles.skip}>
                          {isMobile ? 'Go again' : `Back to ${tool?.name ?? 'the tool'}`}
                        </Button>
                        <Button variant="primary" size="lg" iconRight="ArrowRight" className={styles.primary} onClick={advance} ref={continueRef} data-action="continue">
                          Continue
                        </Button>
                      </>
                    )
                  ) : feedback || step?.kind === 'card' ? (
                    <Button variant="primary" size="lg" iconRight="ArrowRight" className={styles.primary} onClick={advance} ref={continueRef} data-action="continue">
                      Continue
                    </Button>
                  ) : exercise ? (
                    <>
                      {step?.kind === 'exercise' && step.usesMic ? (
                        <Button variant="ghost" iconLeft={isMobile ? undefined : 'MicOff'} onClick={cantPlay} data-cant-play="" className={styles.skip}>
                          {isMobile ? "Can't play now" : "I can't play right now"}
                        </Button>
                      ) : (
                        exercise.type !== 'flashcard' && (
                          <Button variant="ghost" onClick={skip} data-action="skip" className={styles.skip}>
                            I don't know
                          </Button>
                        )
                      )}
                      {primary ? (
                        <Button variant="primary" size="lg" className={styles.primary} iconLeft={primary.icon} onClick={primary.onClick} disabled={primary.disabled} loading={primary.busy} data-action="primary" wrap>
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
        </Page>
      </StepKeysProvider>
    </LessonProvider>
  );
}

/** A stand-in so the task hook can run on steps that are not tasks (hooks cannot be skipped). */
const PLACEHOLDER_TASK: TaskStep = { type: 'task', id: 'none', title: '', body: '', tool: 'tuner', minutes: 1 };

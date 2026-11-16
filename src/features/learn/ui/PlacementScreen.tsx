/**
 * `#learn--placement`: "Find my level". A short adaptive quiz over the written units (see
 * `model/placement.ts`): two questions per unit probed, a third when they split, starting at the
 * beginning and jumping ahead while the learner keeps passing. At the end it offers to mark the
 * units they know as done, exactly as passing those units' checkpoints would. Nothing is marked
 * without that last tap.
 *
 * The question in the middle is the lesson player's own exercise frame and feedback panel, so a
 * placement question looks and answers like every other question in the app.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionBar, Button, Heading, Icon, IconButton, Page, ProgressBar, Skeleton, Text, toast, useIsMobile, useIsTouch } from '@/ui';
import { navigate } from '@/app/router';
import { useImmersive } from '@/app/shell';
import { playUi } from '@/core/audio';
import { markSkill, recordActivity } from '@/core/progress';
import { useMusicSettings } from '@/ui/music';
import {
  generateExercise, grade, hashSeed, isGenerated, presentExercise, solve, type Answer, type Exercise, type ExerciseStep, type GradeResult, type Presentation,
  type SessionFeedback, type Unit,
} from '@/lessons';
import { ExerciseFrame, FeedbackPanel, LessonProvider, StepKeysProvider, selfSubmitting, useKeysRegistry, type PrimaryAction } from '@/lessons/ui';
import { courseForUnit, outlineUnit } from '@/content/theory';
import { nextProbe, probePool, probeVerdict, recordProbe, startPlacement, unitsKnown, type PlacementSearch } from '../model/placement';
import { useConditions, useTheory } from '../useTheory';
import styles from './PlacementScreen.module.css';

interface Question {
  exercise: Exercise;
  presentation: Presentation;
  uid: string;
}

interface Probe {
  index: number;
  pool: ExerciseStep[];
  results: boolean[];
}

type Phase = 'intro' | 'quiz' | 'result';

function checkable(answer: Answer | null): answer is Answer {
  if (!answer) return false;
  switch (answer.type) {
    case 'choice':
    case 'listen-choice':
      return answer.selected.length > 0;
    case 'order':
      return answer.order.length > 0;
    case 'fill-blanks':
      return answer.blanks.every((b) => b !== null);
    case 'type-answer':
    case 'fretboard-name':
    case 'staff-read':
      return answer.text.trim().length > 0;
    case 'fretboard-find':
      return answer.positions.length > 0;
    case 'chord-build':
      return answer.text !== undefined ? answer.text.trim().length > 0 : (answer.frets ?? []).some((f) => f !== null);
    case 'match-pairs':
      return answer.pairs.length > 0;
    default:
      return true;
  }
}

/** The placement quiz. */
export function PlacementScreen() {
  const { theory } = useTheory();
  const [conditions] = useConditions();
  const { naming } = useMusicSettings();
  const isMobile = useIsMobile();
  const isTouch = useIsTouch();
  useImmersive(true, 'focus');

  const units: Unit[] = useMemo(() => theory.units.flatMap((u) => (u.unit ? [u.unit] : [])), [theory]);
  const [phase, setPhase] = useState<Phase>('intro');
  const [search, setSearch] = useState<PlacementSearch>(() => startPlacement(0));
  const [probe, setProbe] = useState<Probe | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [feedback, setFeedback] = useState<SessionFeedback | null>(null);
  const [draft, setDraft] = useState<Answer | null>(null);
  const [primary, setPrimaryState] = useState<PrimaryAction | null>(null);
  const [tally, setTally] = useState({ asked: 0, right: 0 });
  const [seed] = useState(() => hashSeed(Date.now(), 'placement'));
  const startedAt = useRef(0);
  const recorded = useRef(false);
  const registry = useKeysRegistry();
  const continueRef = useRef<HTMLButtonElement | null>(null);

  const unitOf = (index: number): Unit | null => units[index] ?? null;
  const levelOf = (unit: Unit) => courseForUnit(theory, unit.id).level;

  const ask = useCallback(
    (p: Probe) => {
      const unit = units[p.index];
      const step = p.pool[p.results.length % Math.max(1, p.pool.length)];
      if (!unit || !step) return;
      const n = p.results.length;
      const qSeed = hashSeed(seed, p.index, n);
      const exercise = isGenerated(step) ? generateExercise(step, { seed: qSeed, difficulty: 0.6, level: courseForUnit(theory, unit.id).level }) : step;
      setQuestion({ exercise, presentation: presentExercise(exercise, qSeed), uid: `place-${p.index}-${n}` });
      setDraft(null);
      setPrimaryState(null);
      setFeedback(null);
    },
    [units, seed, theory],
  );

  const openProbe = useCallback(
    (s: PlacementSearch) => {
      const index = nextProbe(s);
      if (index === null) {
        setPhase('result');
        setQuestion(null);
        return;
      }
      const unit = units[index];
      const p: Probe = { index, pool: unit ? probePool(unit, conditions, hashSeed(seed, index)) : [], results: [] };
      setProbe(p);
      if (p.pool.length === 0) {
        // Nothing to ask here (every question needs sound): count the unit as not known.
        const next = recordProbe(s, index, false);
        setSearch(next);
        openProbe(next);
        return;
      }
      ask(p);
    },
    [units, conditions, seed, ask],
  );

  const begin = () => {
    const s = startPlacement(units.length);
    setSearch(s);
    setTally({ asked: 0, right: 0 });
    startedAt.current = Date.now();
    recorded.current = false;
    setPhase('quiz');
    openProbe(s);
  };

  const judge = (answer: Answer | null) => {
    if (!question || feedback) return;
    const probed = probe ? unitOf(probe.index) : null;
    const ctx = { level: probed ? levelOf(probed) : ('beginner' as const), naming };
    let result: GradeResult;
    if (answer === null) {
      const shown = grade(question.exercise, solve(question.exercise), ctx);
      result = { correct: false, score: 0, feedback: shown.feedback };
    } else result = grade(question.exercise, answer, ctx);
    setFeedback({ result, answer, skipped: answer === null, heartLost: false, willRetry: false });
    setTally((t) => ({ asked: t.asked + 1, right: t.right + (result.correct ? 1 : 0) }));
    if (result.correct) playUi('correct');
    else if (answer !== null) playUi('wrong');
  };

  const advance = () => {
    if (!probe || !feedback) return;
    const results = [...probe.results, feedback.result.correct];
    let verdict = probeVerdict(results);
    // A small pool can run out before the probe is settled: then more right than wrong passes.
    if (verdict === null && results.length >= probe.pool.length) verdict = results.filter(Boolean).length * 2 > results.length;
    if (verdict === null) {
      const p = { ...probe, results };
      setProbe(p);
      ask(p);
      return;
    }
    const next = recordProbe(search, probe.index, verdict);
    setSearch(next);
    openProbe(next);
  };

  // Each phase starts at the top of the screen.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [phase]);

  // The quiz is over: a little XP for the questions answered (it is a test, not a lesson).
  useEffect(() => {
    if (phase !== 'result' || recorded.current || tally.asked === 0) return;
    recorded.current = true;
    recordActivity({
      kind: 'other',
      xp: Math.max(2, tally.asked),
      title: 'Theory Path: placement quiz',
      accuracy: tally.right / tally.asked,
      mistakes: tally.asked - tally.right,
      count: tally.asked,
      durationSec: Math.round((Date.now() - startedAt.current) / 1000),
      completed: true,
    });
  }, [phase, tally]);

  const setPrimary = useCallback((action: PrimaryAction | null) => setPrimaryState(action), []);
  const check = () => {
    if (feedback || !question) return;
    if (primary) {
      if (!primary.disabled) primary.onClick?.();
      return;
    }
    if (checkable(draft)) judge(draft);
  };

  useEffect(() => {
    if (feedback) continueRef.current?.focus({ preventScroll: true });
  }, [feedback]);

  // Keys: number keys and letters go to the question, Enter checks and continues.
  useEffect(() => {
    if (phase !== 'quiz') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && e.key !== 'Enter') return;
      if (el?.closest?.('[data-player-bar] button, [role="dialog"]')) return;
      const h = registry.current;
      if (e.key === 'Enter') {
        if (h?.enter?.()) return e.preventDefault();
        e.preventDefault();
        if (feedback) advance();
        else check();
        return;
      }
      if (feedback) return;
      if (/^[1-9]$/.test(e.key)) {
        if (h?.digit?.(Number(e.key) - 1)) e.preventDefault();
      } else if (e.key === ' ') {
        if (h?.space?.()) e.preventDefault();
      } else if (e.key === 'Backspace') {
        if (h?.backspace?.()) e.preventDefault();
      } else if (e.key.startsWith('Arrow')) {
        if (h?.arrow?.(e.key as 'ArrowUp')) e.preventDefault();
      } else if (e.key.length === 1 && h?.char?.(e.key)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const known = unitsKnown(search);
  const knownUnits = units.slice(0, known);
  const nextUnit = units[known] ?? null;

  const apply = () => {
    for (const u of knownUnits) for (const l of u.lessons) markSkill(l.skill, { completed: true, masteryAtLeast: 1 });
    playUi('achievement');
    const first = outlineUnit(knownUnits[0].id)?.number ?? 1;
    const last = outlineUnit(knownUnits[knownUnits.length - 1].id)?.number ?? first;
    toast.ok(first === last ? `Unit ${first} is marked done` : `Units ${first} to ${last} are marked done`, {
      description: nextUnit ? `Carry on with Unit ${outlineUnit(nextUnit.id)?.number}: ${nextUnit.title}.` : 'Every unit written so far is done.',
    });
    navigate('learn', ...(nextUnit ? [nextUnit.id] : []));
  };

  const leave = () => navigate('learn');

  if (!theory.complete) {
    return (
      <Page title="Find my level" hideHeader>
        <div className={styles.loading} aria-busy="true" data-placement-loading="">
          <Skeleton variant="text" width="50%" />
          <Skeleton variant="text" lines={3} />
        </div>
      </Page>
    );
  }

  if (phase === 'intro') {
    return (
      <Page title="Find my level" back={{ to: 'learn', label: 'Theory Path' }}>
        <div className={styles.screen}>
          <div className={styles.intro} data-placement="intro">
            <span className={styles.introIcon} aria-hidden="true">
              <Icon name="Compass" size={36} />
            </span>
            <Text variant="lead">A few questions from each unit, starting with the basics. While you keep getting them right, the quiz jumps ahead; when you don't, it narrows in on your level.</Text>
            <ul className={styles.points}>
              <li>
                <Icon name="Clock" size="sm" /> Two to five minutes
              </li>
              <li>
                <Icon name="CircleHelp" size="sm" /> Not sure? Tap “I don't know”: it is the fastest way to the right level
              </li>
              <li>
                <Icon name="ShieldCheck" size="sm" /> No hearts to lose, and nothing changes until you say so
              </li>
            </ul>
          </div>
          <ActionBar>
            <Button variant="ghost" onClick={leave}>
              Not now
            </Button>
            <Button variant="primary" size="lg" iconRight="ArrowRight" onClick={begin} data-placement-begin="" wrap>
              Start the quiz
            </Button>
          </ActionBar>
        </div>
      </Page>
    );
  }

  if (phase === 'result') {
    return (
      <Page title="Your level" hideHeader>
        <div className={styles.screen}>
          <div className={styles.result} data-placement="result" data-known={known}>
            <span className={styles.resultIcon} aria-hidden="true">
              <Icon name={known > 0 ? 'Trophy' : 'Footprints'} size={36} />
            </span>
            <Heading level={1} size="2xl" display>
              {known === 0 ? 'Start at the beginning' : known === units.length ? 'You know every unit written so far' : `You can skip ${known} ${known === 1 ? 'unit' : 'units'}`}
            </Heading>
            <Text variant="lead" tone="muted">
              {known === 0
                ? `Unit 1 builds everything from the ground up, two minutes at a time. You answered ${tally.right} of ${tally.asked} right.`
                : `You answered ${tally.right} of ${tally.asked} right. Mark these units done and the path opens after them; you can still open any of their lessons.`}
            </Text>
            {known > 0 && (
              <ol className={styles.knownList}>
                {knownUnits.map((u) => (
                  <li key={u.id}>
                    <Icon name="CircleCheck" size="sm" className={styles.knownIcon} />
                    <span className={styles.knownNumber}>Unit {outlineUnit(u.id)?.number}</span>
                    <span>{u.title}</span>
                  </li>
                ))}
              </ol>
            )}
            {nextUnit && (
              <Text tone="muted">
                Your place: <strong>Unit {outlineUnit(nextUnit.id)?.number}, {nextUnit.title}</strong>.
              </Text>
            )}
          </div>
          <ActionBar>
            {known > 0 ? (
              <>
                <Button variant="ghost" onClick={leave}>
                  Not now
                </Button>
                <Button variant="primary" size="lg" iconLeft="Check" onClick={apply} data-placement-apply="" wrap>
                  Mark {known === 1 ? 'it' : 'them'} done
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={leave}>
                  Back to the path
                </Button>
                <Button variant="primary" size="lg" iconRight="ArrowRight" onClick={() => navigate('learn', units[0]?.id, units[0]?.lessons[0]?.id)} data-placement-first="" wrap>
                  Start Unit 1
                </Button>
              </>
            )}
          </ActionBar>
        </div>
      </Page>
    );
  }

  const unit = probe ? unitOf(probe.index) : null;
  const placed = unit ? outlineUnit(unit.id) : null;
  const done = search.probes.length;
  const ex = question?.exercise ?? null;
  const review = feedback && ex ? { result: feedback.result, answer: feedback.answer } : null;
  const hints = !isMobile && !isTouch;
  const course = unit ? courseForUnit(theory, unit.id) : theory.course;

  return (
    <LessonProvider course={course}>
      <StepKeysProvider registry={registry}>
        <Page title="Find my level" hideHeader className={styles.page}>
          <div className={styles.quiz} data-placement="quiz" data-probe={probe?.index ?? -1}>
            <header className={styles.top}>
              <IconButton icon="X" label="Stop the quiz" onClick={() => (done > 0 || (probe?.results.length ?? 0) > 0 ? setPhase('result') : leave())} data-placement-stop="" />
              <div className={styles.progress}>
                <ProgressBar value={known} max={Math.max(1, units.length)} tone="ok" size="md" aria-label="Units you know so far" valueText={false} />
              </div>
              <span className={styles.level} data-level={known}>
                {known === 0 ? 'Finding your level' : `${known} ${known === 1 ? 'unit' : 'units'} known`}
              </span>
            </header>
            {placed && unit && (
              <p className={styles.checking} data-checking={unit.id}>
                <Icon name="Compass" size="sm" /> Checking Unit {placed.number}: {unit.title}
              </p>
            )}
            {/* data-question: the question as data, so a browser check can answer it the way the lesson checks do. */}
            <div className={styles.stage} key={question?.uid ?? 'none'} data-step-id={question?.uid ?? ''} data-question={question ? JSON.stringify({ exercise: question.exercise, presentation: question.presentation }) : undefined}>
              {question && (
                <ExerciseFrame
                  exercise={question.exercise}
                  presentation={question.presentation}
                  review={review}
                  attempt={0}
                  alternative={false}
                  onDraft={setDraft}
                  onSubmit={(a) => judge(a)}
                  setPrimary={setPrimary}
                  hints={hints}
                  level={unit ? levelOf(unit) : 'beginner'}
                  naming={naming}
                  uid={question.uid}
                />
              )}
            </div>
            <ActionBar className={styles.bar} stretchOnMobile={false} data-player-bar="">
              <div className={styles.barInner}>
                {feedback && ex && <FeedbackPanel exercise={ex} feedback={feedback} seed={tally.asked} combo={0} />}
                <div className={styles.barButtons}>
                  {feedback ? (
                    <Button variant="primary" size="lg" iconRight="ArrowRight" onClick={advance} ref={continueRef} data-action="continue" className={styles.primaryButton}>
                      Continue
                    </Button>
                  ) : ex ? (
                    <>
                      <Button variant="ghost" onClick={() => judge(null)} data-action="skip">
                        I don't know
                      </Button>
                      {primary ? (
                        <Button variant="primary" size="lg" iconLeft={primary.icon} onClick={primary.onClick} disabled={primary.disabled} loading={primary.busy} data-action="primary" className={styles.primaryButton} wrap>
                          {primary.label}
                        </Button>
                      ) : selfSubmitting(ex) ? null : (
                        <Button variant="primary" size="lg" onClick={check} disabled={!checkable(draft)} data-action="check" className={styles.primaryButton}>
                          Check
                        </Button>
                      )}
                    </>
                  ) : null}
                </div>
              </div>
            </ActionBar>
          </div>
        </Page>
      </StepKeysProvider>
    </LessonProvider>
  );
}

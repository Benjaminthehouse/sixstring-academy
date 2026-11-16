/**
 * A timed routine (`#technique--tech-warm-up`, `#technique--tech-cool-down`): short steps, each
 * with its material and the click, a countdown that moves on by itself, and a note to yourself at
 * the end of the cool-down.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useImmersive, useScreenTitle } from '@/app/shell';
import { TECHNIQUE_EXERCISES, partSong, techniqueSkillId, type TechniqueExercise } from '@/content/technique';
import { playUi } from '@/core/audio';
import { keepAwake } from '@/core/platform';
import { recordActivity, useProgress, usePrefs, type ActivityResult } from '@/core/progress';
import { ActionBar, Button, Card, CountdownRing, Heading, IconButton, Kbd, LinkButton, Page, Section, Stepper, Switch, Text, TextArea, Tooltip, formatClock, useEventListener, useMediaQuery, useRafLoop } from '@/ui';
import type { TabViewHandle } from '@/ui/music/tab';
import { tickHealthClock } from '../engine/health-clock';
import { ExerciseRunner, type RunState } from '../engine/runner';
import { localDay, readRecord, type TechniqueRecord } from '../model/history';
import { clampTempo, MAX_TEMPO, MIN_TEMPO, startTempo } from '../model/ladder';
import { routineGoTo, routineStart, routineTick, routineToggle, type RoutineState } from '../model/routine';
import { newVisit, visitActivity } from '../model/session';
import styles from '../Technique.module.css';
import { Demo } from './Demo';
import { ownsKeys, SIDEWAYS_QUERY, WIDE_QUERY } from './ExerciseScreen';
import { HealthNotice } from './HealthNotice';
import { useRecordOnLeave } from './useExercise';
import { Coaching, Rungs, SummarySheet, exerciseEyebrow, nextExercise } from './Panels';

/** The routine screen. */
export function RoutineScreen({ e }: { e: TechniqueExercise }) {
  useScreenTitle(e.title);
  const prefs = usePrefs();
  const wide = useMediaQuery(WIDE_QUERY);
  const skillData = useProgress((s) => s.skills[techniqueSkillId(e.id)]?.data);
  const record = useMemo(() => readRecord(skillData), [skillData]);
  const recordRef = useRef<TechniqueRecord>(record);
  recordRef.current = record;
  const steps = e.routine ?? [];

  const [routine, setRoutineState] = useState<RoutineState>(() => routineStart(steps));
  const routineRef = useRef(routine);
  const setRoutine = useCallback((next: RoutineState) => {
    routineRef.current = next;
    setRoutineState(next);
  }, []);
  const { index, running, finished, left } = routine;
  const [tempo, setTempo] = useState(() => startTempo(e.tempo, record.best !== null ? record.best + e.tempo.step : null));
  const [guide, setGuide] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [result, setResult] = useState<ActivityResult | null>(null);
  const [runState, setRunState] = useState<RunState>('idle');
  const [current, setCurrent] = useState<{ bar: number; beat: number } | null>(null);
  const step = steps[index];
  const part = step?.part !== undefined ? e.parts[step.part] : undefined;
  const song = useMemo(() => (part ? partSong(e, part, tempo) : null), [e, part, tempo]);
  const tab = useRef<TabViewHandle>(null);
  const sideways = useMediaQuery(SIDEWAYS_QUERY);
  useImmersive(running || sideways, 'focus');

  const runnerRef = useRef<ExerciseRunner | null>(null);
  if (!runnerRef.current) runnerRef.current = new ExerciseRunner();
  const runner = runnerRef.current;
  const visit = useRef(newVisit(e.id, tempo, Date.now()));
  /** The routine ran to its end and that has not been recorded yet. */
  const completedRef = useRef(false);

  useEffect(() => runner.setSounds(prefs.sound.clickSound, prefs.sound.guitarTone), [runner, prefs.sound.clickSound, prefs.sound.guitarTone]);
  useEffect(
    () =>
      runner.subscribe((ev) => {
        if (ev.type === 'state') {
          setRunState(ev.state);
          if (ev.state === 'idle') setCurrent(null);
        } else if (ev.type === 'beat') setCurrent({ bar: ev.bar, beat: ev.beat });
      }),
    [runner],
  );
  useEffect(() => () => runner.dispose(), [runner]);

  // The step's material loops with the click while the routine runs.
  useEffect(() => {
    if (!part || !song) {
      runner.stop();
      return;
    }
    if (runner.state === 'idle') runner.load(part, song, tempo);
    else runner.setTempo(tempo, song);
  }, [runner, part, song, tempo]);
  useEffect(() => {
    if (running && part && runner.state === 'idle') void runner.start({ loop: true, guide, click: true });
    if (!running) runner.stop();
  }, [running, part, runner, guide]);
  useEffect(() => runner.configure({ guide }), [runner, guide]);

  // The countdown: one tick a second while running; the step moves on at zero.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      visit.current.activeSec += 1;
      tickHealthClock(1, true);
      const { state, event } = routineTick(routineRef.current, steps);
      if (event) runner.stop();
      if (event === 'next') playUi('countdown');
      if (event === 'done') {
        playUi('lessonComplete');
        completedRef.current = true;
      }
      setRoutine(state);
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, steps, runner, setRoutine]);
  useEffect(() => (running ? keepAwake() : undefined), [running]);

  useRafLoop(() => {
    const p = runner.position();
    if (p && p.state === 'playing' && !p.countIn) tab.current?.setPlayerPosition(p);
  }, runState !== 'idle');

  const goTo = useCallback(
    (i: number) => {
      runner.stop();
      setRoutine(routineGoTo(routineRef.current, steps, i));
    },
    [runner, steps, setRoutine],
  );
  const toggle = useCallback(() => {
    runner.stop();
    setRoutine(routineToggle(routineRef.current, steps));
  }, [runner, steps, setRoutine]);

  /** Record the visit once: a finished run counts as one clean pass, and only once. */
  const save = useCallback(
    (show: boolean) => {
      const v = visit.current;
      const completed = completedRef.current;
      if (completed) v.passes.push({ tempo, verdict: 'clean', source: 'self', partId: 'routine' });
      v.tempo = tempo;
      if (noteText.trim()) v.note = noteText.trim();
      const out = visitActivity(e, v, recordRef.current, localDay(Date.now()));
      visit.current = newVisit(e.id, tempo, Date.now());
      completedRef.current = false;
      if (show) {
        setNoteText('');
        setRoutine(routineStart(steps));
      }
      if (!out) return;
      const r = recordActivity({ ...out.input, completed: completed || out.input.completed });
      if (show) setResult(r);
    },
    [e, noteText, tempo, steps, setRoutine],
  );
  // Leaving, closing or reloading the page records what was done.
  useRecordOnLeave(() => save(false));

  useEventListener(window, 'keydown', (ev: KeyboardEvent) => {
    if (ev.defaultPrevented || ownsKeys(ev.target as Element | null)) return;
    const onButton = ev.target instanceof HTMLElement && (ev.target.tagName === 'BUTTON' || ev.target.tagName === 'A');
    if ((ev.key === ' ' || ev.code === 'Space') && !onButton) {
      ev.preventDefault();
      toggle();
    } else if (ev.key === 'ArrowRight') goTo(index + 1);
    else if (ev.key === 'ArrowLeft') goTo(index - 1);
  });

  const total = steps.reduce((s, x) => s + x.seconds, 0);
  const next = useMemo(() => {
    if (e.id === 'tech-cool-down') return null;
    return nextExercise(e, TECHNIQUE_EXERCISES.filter((x) => x.mode === 'ladder' && x.level <= 3)) ?? TECHNIQUE_EXERCISES.find((x) => x.id === 'tech-spider') ?? null;
  }, [e]);

  const controls = (
    <>
      <Tooltip content={<>Start or pause <Kbd>Space</Kbd></>}>
        <Button variant="primary" size={wide ? 'lg' : 'md'} fullWidth={wide} wrap iconLeft={running ? 'Pause' : finished ? 'RotateCcw' : 'Play'} onClick={toggle} data-technique-primary="">
          {running ? 'Pause' : finished ? 'Again from the top' : index === 0 && left === steps[0]?.seconds ? `Start the ${e.id === 'tech-warm-up' ? 'warm-up' : 'cool-down'}` : 'Carry on'}
        </Button>
      </Tooltip>
    </>
  );

  const stepCard = step && (
    <Card padding="lg" className={styles.routine} data-technique-step={step.id}>
      <div className={styles.routineNow}>
        <CountdownRing key={`${index}-${finished}`} seconds={step.seconds} running={running} size={wide ? 88 : 72} label="Time left in this step" tone="accent">
          {() => formatClock(Math.max(0, left))}
        </CountdownRing>
        <div className={styles.routineText}>
          <Text variant="eyebrow">
            Step {index + 1} of {steps.length}
          </Text>
          <Heading level={2} size="lg">
            {step.title}
          </Heading>
          <Text tone="muted">{step.text}</Text>
        </div>
      </div>
      {song && <Demo ref={tab} song={song} current={current} showFretboard={wide} diagrams={song.chords.length > 0 && part?.check.kind === 'onsets'} />}
      {step.reflect && (
        <TextArea label="One thing that felt tense today" value={noteText} onChange={setNoteText} maxLength={200} rows={2} hint="Saved with this cool-down, so you can watch for it next time." />
      )}
      {step.reflect && record.notes?.length ? (
        <Text size="sm" tone="muted">
          Last time: “{record.notes[record.notes.length - 1].text}”
        </Text>
      ) : null}
      {step.link && (
        <LinkButton variant="ghost" size="sm" to="technique" params={[step.link]} iconRight="ArrowRight">
          The full exercise
        </LinkButton>
      )}
    </Card>
  );

  const doneCard = finished && (
    <Card variant="raised" padding="lg" className={styles.today} data-technique-routine-done="">
      <Heading level={2} size="lg">
        {e.id === 'tech-warm-up' ? 'Warmed up. Your hands are ready.' : 'Cooled down. Well played today.'}
      </Heading>
      <Text tone="muted">
        {e.id === 'tech-warm-up' ? `Next time the warm-up starts at ${clampTempo(Math.min(e.tempo.goal, tempo + e.tempo.step))} BPM.` : 'Let your hands rest. See you tomorrow.'}
      </Text>
      <Button variant="primary" iconLeft="Check" onClick={() => save(true)} data-technique-finish="">
        Save and finish
      </Button>
    </Card>
  );

  const list = (
    <Card padding="lg">
      <Section title={`${Math.round(total / 60)} minutes, ${steps.length} steps`} level={3} gap={3}>
        <ol className={styles.routineSteps}>
          {steps.map((s, i) => (
            <li key={s.id} className={styles.routineStep} data-state={finished || i < index ? 'done' : i === index ? 'now' : 'next'}>
              <span className={styles.stepMark} aria-hidden="true">
                {finished || i < index ? '✓' : i + 1}
              </span>
              <span className={styles.routineStepTitle}>{s.title}</span>
              <span className={styles.stepTime}>{formatClock(s.seconds)}</span>
            </li>
          ))}
        </ol>
        <div className={styles.tempoRow}>
          <Stepper label="Tempo" value={tempo} onChange={(v) => setTempo(clampTempo(v))} min={MIN_TEMPO} max={MAX_TEMPO} step={e.tempo.step || 4} unit="BPM" />
        </div>
        <Rungs e={e} tempo={tempo} best={record.best} />
        <Switch label="Guitar plays along" checked={guide} onChange={setGuide} />
        {wide && controls}
        <div className={styles.todayLinks}>
          <Button size="sm" variant="ghost" iconLeft="SkipBack" onClick={() => goTo(index - 1)} disabled={index === 0}>
            Back a step
          </Button>
          <Button size="sm" variant="ghost" iconLeft="SkipForward" onClick={() => goTo(index + 1)} disabled={index >= steps.length - 1}>
            Skip this step
          </Button>
        </div>
      </Section>
    </Card>
  );

  return (
    <Page title={e.title} eyebrow={exerciseEyebrow(e)} subtitle={e.summary} back={{ to: 'technique', label: 'Technique' }} hideHeader={sideways}>
      <div className={styles.layout} data-technique-screen="routine" data-exercise={e.id} data-step={step?.id} data-running={running} data-finished={finished}>
        <div className={styles.main}>
          {doneCard}
          {!finished && stepCard}
          {!wide && list}
          <Coaching e={e} />
        </div>
        {wide && <aside className={styles.side}>{list}</aside>}
      </div>
      {!wide && (
        <ActionBar
          start={
            <div className={styles.barTempo}>
              <IconButton icon="SkipBack" label="Back a step" onClick={() => goTo(index - 1)} disabled={index === 0} />
              <IconButton icon="SkipForward" label="Skip this step" onClick={() => goTo(index + 1)} disabled={index >= steps.length - 1} />
            </div>
          }
          stretchOnMobile={false}
        >
          {controls}
        </ActionBar>
      )}
      <HealthNotice onPause={() => setRoutine({ ...routineRef.current, running: false })} hideCoolDown={e.id === 'tech-cool-down'} />
      <SummarySheet e={e} result={result} record={record} next={next} onClose={() => setResult(null)} />
    </Page>
  );
}

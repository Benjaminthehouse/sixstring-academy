/**
 * `#learn`: the Theory Path. Phones: the path fills the screen and "Continue" waits in the thumb
 * zone; tapping a lesson opens its card in a bottom sheet. Wide screens: the path beside a sticky
 * panel with the chosen lesson, its unit's lessons, the review and "Find my level".
 *
 * On the go: two switches (guitar at hand, sound allowed) adapt every lesson before it starts,
 * and each lesson says what it needs.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ActionBar, Button, Chip, Icon, Page, ProgressBar, Sheet, Skeleton, Text, cx, useMediaQuery, usePrefersReducedMotion } from '@/ui';
import { navigate } from '@/app/router';
import { useHearts, useProgress } from '@/core/progress';
import { FACT_CARD_KIND } from '@/lessons';
import { ReviewEntry } from '@/lessons/ui';
import { adaptLesson, conditionsLine, type Conditions } from '../model/conditions';
import { focusUnit, pathView, refillUnit, type PathLesson, type PathUnitView, type PathView } from '../model/path';
import { nextPhase } from '../model/winding';
import { useConditions, useTheory } from '../useTheory';
import { LessonDetails } from './LessonDetails';
import { StageSection, type MapHandlers } from './PathMap';
import styles from './PathScreen.module.css';

/** Two panes from this width (the shell's sidebar takes 15rem of it). */
const WIDE = '(min-width: 1080px)';

function openLesson(unit: PathUnitView | null): PathLesson | null {
  if (!unit) return null;
  return unit.lessons.find((l) => l.node.state === 'current') ?? unit.lessons.find((l) => l.node.state === 'available') ?? null;
}

/** The switches for where the learner is. */
function ConditionsBar({ conditions, onChange }: { conditions: Conditions; onChange: (c: Conditions) => void }) {
  const line = conditionsLine(conditions);
  return (
    <div className={styles.conditions} data-conditions="">
      <div className={styles.conditionsRow} role="group" aria-label="Where you are learning">
        <span className={styles.conditionsLabel}>Right now:</span>
        <Chip selected={conditions.guitar} icon="Guitar" onClick={() => onChange({ ...conditions, guitar: !conditions.guitar })} aria-pressed={conditions.guitar} data-toggle="guitar">
          Guitar at hand
        </Chip>
        <Chip selected={conditions.sound} icon={conditions.sound ? 'Volume2' : 'VolumeX'} onClick={() => onChange({ ...conditions, sound: !conditions.sound })} aria-pressed={conditions.sound} data-toggle="sound">
          Sound on
        </Chip>
      </div>
      <Text variant="caption" tone="muted" aria-live="polite" className={styles.conditionsLine}>
        {line ?? 'Lessons marked with a guitar listen to you play; you can always tap instead.'}
      </Text>
    </div>
  );
}

/** Three stages at a glance; a tap scrolls to the stage. */
function StageStrip({ view, onJump }: { view: PathView; onJump: (stageId: string) => void }) {
  return (
    <nav className={styles.strip} aria-label="Stages">
      {view.stages.map((s) => {
        const written = s.total > 0;
        const current = view.next?.unit.path.stage === s.id;
        return (
          <button key={s.id} type="button" className={cx(styles.stripItem, current && styles.stripCurrent)} onClick={() => onJump(s.id)} data-stage-jump={s.id}>
            <span className={styles.stripTitle}>{s.title}</span>
            {written ? (
              <>
                <ProgressBar value={s.done} max={Math.max(1, s.total)} size="sm" tone={current ? 'accent' : 'ok'} aria-label={`${s.title}: lessons done`} valueText={false} />
                <span className={styles.stripCount}>
                  {s.done}/{s.total}
                </span>
              </>
            ) : (
              <span className={styles.stripSoon}>Coming soon</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

/** The lessons of one unit as a compact list (wide screens' side panel). */
function UnitLessons({ unit, selected, onSelect, onCheckpoint, onPractice }: {
  unit: PathUnitView;
  selected: string | null;
  onSelect: (l: PathLesson) => void;
  onCheckpoint: (unitId: string) => void;
  onPractice: (unitId: string) => void;
}) {
  const node = unit.node;
  if (!node) return null;
  const id = unit.path.outline.id;
  const cp = node.checkpoint;
  return (
    <section className={styles.panelBlock} aria-labelledby="panel-unit-title" data-panel-unit={unit.path.outline.id}>
      <p className={styles.panelEyebrow}>Unit {unit.path.number}</p>
      <h2 className={styles.panelTitle} id="panel-unit-title">
        {node.title}
      </h2>
      <div className={styles.panelProgress}>
        <ProgressBar value={node.done} max={Math.max(1, node.total)} size="sm" tone="ok" aria-label={`${node.title}: lessons done`} valueText={false} />
        <span className={styles.panelCount}>
          {node.done} of {node.total} done
        </span>
      </div>
      <ol className={styles.lessonList}>
        {unit.lessons.map((l) => (
          <li key={l.node.id}>
            <button type="button" className={cx(styles.lessonRow, selected === l.node.id && styles.lessonRowSelected)} onClick={() => onSelect(l)} aria-pressed={selected === l.node.id} data-row={l.node.id}>
              <span className={cx(styles.rowState, styles[`rowState-${l.node.state}`])} aria-hidden="true">
                <Icon name={l.node.state === 'done' ? 'Check' : l.node.state === 'locked' ? 'Lock' : l.node.state === 'current' ? 'Play' : 'BookOpen'} size="sm" />
              </span>
              <span className={styles.rowTitle}>{l.node.title}</span>
              <span className={styles.rowMeta}>
                {l.play && <Icon name="Guitar" size="xs" label="Uses your guitar" />}
                {l.listening && <Icon name="Headphones" size="xs" label="Has listening" />}
                <span>{l.node.minutes} min</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      {((cp && cp.state !== 'passed') || node.done > 0) && (
        <div className={styles.panelActions}>
          {cp && cp.state !== 'passed' && (
            <Button size="sm" iconLeft="Trophy" onClick={() => onCheckpoint(id)} data-panel-checkpoint={id}>
              {cp.ahead ? 'Jump here' : 'Test out'}
            </Button>
          )}
          {node.done > 0 && (
            <Button size="sm" variant="ghost" iconLeft="Dumbbell" onClick={() => onPractice(id)} data-panel-practice={id}>
              Practise unit
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

/** The Theory Path map. `focus` is the unit named in the address (`#learn--<unit>`). */
export function PathScreen({ focus }: { focus: string | null }) {
  const { theory, failed, retry } = useTheory(focus);
  const progress = useProgress((s) => s);
  const hearts = useHearts();
  const [conditions, setConditions] = useConditions();
  const view = useMemo(() => pathView(theory, progress, Date.now()), [theory, progress]);
  const wide = useMediaQuery(WIDE);
  const reduced = usePrefersReducedMotion();
  const lessons = useMemo(() => view.stages.flatMap((s) => s.units).flatMap((u) => u.lessons), [view]);

  /** The lesson to show first: the open one of the unit asked for, else the next lesson, else the unit's first. */
  const pick = (unitId: string | null): string | null => {
    const unit = focusUnit(view, unitId);
    const lesson = (unitId ? openLesson(unit) : null) ?? view.next?.lesson ?? unit?.lessons[0] ?? null;
    return lesson?.node.id ?? null;
  };
  const [selectedId, setSelectedId] = useState<string | null>(() => pick(focus));
  const [focusedId, setFocusedId] = useState<string | null>(selectedId);
  const [sheetOpen, setSheetOpen] = useState(false);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());

  const selected = (selectedId && view.byLesson.get(selectedId)) || (view.next ?? null);
  const selectedUnit = selected?.unit ?? focusUnit(view, focus);

  // A new address (#learn--<unit>) moves the selection there; the screen stays mounted.
  const lastFocus = useRef(focus);
  useEffect(() => {
    if (lastFocus.current === focus) return;
    lastFocus.current = focus;
    const id = pick(focus);
    setSelectedId(id);
    setFocusedId(id);
    scrollToTarget(focus, id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  // On opening: bring the unit asked for, or the next lesson, into view when it is below the fold.
  // A brand-new learner sees the top of the page first (the switches and "Find my level").
  // A brand-new learner on a short phone: the page stays at its top unless the first lesson would sit
  // under the Continue bar, and then it moves only as far as needed to show it.
  useEffect(() => {
    if (!focus && !view.started) {
      if (wide) return undefined;
      const t = window.setTimeout(() => {
        const node = selectedId ? nodeRefs.current.get(selectedId) : null;
        const bar = document.querySelector('[data-continue-bar]');
        if (!node || !bar) return;
        const over = node.getBoundingClientRect().bottom + 12 - bar.getBoundingClientRect().top;
        if (over > 0) window.scrollBy({ top: over, behavior: 'auto' });
      }, 80);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => scrollToTarget(focus, selectedId), 80);
    return () => window.clearTimeout(t);
    // Once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Bring the chosen lesson (or, when it is not in the unit asked for, that unit's header) into view. */
  function scrollToTarget(unitId: string | null, lessonId: string | null): void {
    const node = lessonId ? (nodeRefs.current.get(lessonId) ?? null) : null;
    const inUnit = !unitId || (lessonId !== null && view.byLesson.get(lessonId)?.unit.path.outline.id === unitId);
    const unitEl = unitId ? document.querySelector<HTMLElement>(`[data-unit="${CSS.escape(unitId)}"]`) : null;
    const el = node && inUnit ? node : (unitEl ?? node);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const bottomRoom = window.innerHeight - 160;
    if (r.top < 60 || r.bottom > bottomRoom) el.scrollIntoView({ block: el === node ? 'center' : 'start', behavior: 'auto' });
  }

  const realLesson = (l: PathLesson | null) => (l ? (view.byLesson.get(l.node.id)?.unit.path.unit?.lessons.find((x) => x.id === l.node.id) ?? null) : null);
  const adapted = useMemo(() => {
    const real = realLesson(selected?.lesson ?? null);
    if (!real) return null;
    const a = adaptLesson(real, conditions);
    return { swapped: a.swapped, skipped: a.skipped, needsSound: a.needsSound };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, conditions]);

  const start = (l: PathLesson) => {
    setSheetOpen(false);
    navigate('learn', l.node.unitId, l.node.id);
  };
  const checkpoint = (unitId: string) => {
    setSheetOpen(false);
    navigate('learn', unitId, 'checkpoint');
  };
  const practice = (unitId: string) => {
    setSheetOpen(false);
    navigate('learn', unitId, 'practice');
  };
  const select = (l: PathLesson) => {
    setSelectedId(l.node.id);
    setFocusedId(l.node.id);
    if (!wide) setSheetOpen(true);
  };
  const onNodeKey = (e: ReactKeyboardEvent<HTMLButtonElement>, l: PathLesson) => {
    const index = lessons.findIndex((x) => x.node.id === l.node.id);
    if (e.key === 'Enter' && wide && selectedId === l.node.id && l.node.state !== 'locked' && !hearts.empty) {
      e.preventDefault();
      start(l);
      return;
    }
    const to =
      e.key === 'ArrowDown' || e.key === 'ArrowRight' ? index + 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? index - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? lessons.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    const target = lessons[Math.max(0, Math.min(lessons.length - 1, to))];
    if (!target) return;
    setFocusedId(target.node.id);
    if (wide) setSelectedId(target.node.id);
    nodeRefs.current.get(target.node.id)?.focus();
  };
  const handlers: MapHandlers = {
    // Phones have no selection to show: the next lesson already beckons, a tap opens its sheet.
    selected: wide ? (selected?.lesson.node.id ?? null) : null,
    onSelect: select,
    onCheckpoint: checkpoint,
    onPractice: practice,
    onNodeKey,
    focusable: (id) => id === (focusedId ?? selected?.lesson.node.id),
    nodeRefs,
  };

  // The swing of the path carries on from unit to unit.
  const phases = useMemo(() => {
    const out = new Map<string, number>();
    let phase = 0;
    for (const s of view.stages) {
      for (const u of s.units) {
        if (!u.node) continue;
        out.set(u.path.outline.id, phase);
        phase = nextPhase(phase, u.lessons.length);
      }
    }
    return out;
  }, [view]);

  const jumpToStage = (stageId: string) => document.getElementById(`stage-${stageId}`)?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  const refill = (() => {
    const id = refillUnit(view, selected?.unit.path.outline.id ?? null);
    return id ? () => practice(id) : null;
  })();
  const hasCards = useMemo(() => Object.values(progress.srs.items).some((i) => i.kind === FACT_CARD_KIND), [progress]);
  const courses = useMemo(() => [theory.course], [theory.course]);
  const review = theory.complete ? (
    <ReviewEntry courses={courses} onStart={() => navigate('learn', 'review')} hideWhenEmpty={!wide} />
  ) : hasCards ? (
    <div aria-busy="true">
      <Skeleton variant="block" height="4.5rem" />
    </div>
  ) : null;
  const placement = (
    <div className={styles.placement} data-placement-offer="">
      <span className={styles.placementIcon} aria-hidden="true">
        <Icon name="Compass" size="md" />
      </span>
      <div className={styles.placementText}>
        <Text weight="semibold">Know some theory already?</Text>
        <Text variant="caption" tone="muted">
          Answer a few questions and skip the units you know.
        </Text>
      </div>
      <Button size="sm" onClick={() => navigate('learn', 'placement')} data-placement-start="">
        Find my level
      </Button>
    </div>
  );

  const details = selected ? (
    <LessonDetails
      view={view}
      unit={selected.unit}
      lesson={selected.lesson}
      conditions={conditions}
      hearts={hearts}
      adapted={adapted}
      onStart={() => start(selected.lesson)}
      onCheckpoint={() => checkpoint(selected.unit.path.outline.id)}
      onRefill={refill}
    />
  ) : null;

  const next = view.next;
  const continueBar = (
    <ActionBar
      stretchOnMobile={false}
      className={styles.bar}
      data-continue-bar=""
      start={
        next ? (
          <div className={styles.barText}>
            <span className={styles.barEyebrow}>{view.started ? 'Up next' : 'Your first lesson'} · Unit {next.unit.path.number}</span>
            <span className={styles.barTitle}>{next.lesson.node.title}</span>
          </div>
        ) : (
          <div className={styles.barText}>
            <span className={styles.barEyebrow}>All caught up</span>
            <span className={styles.barTitle}>Every lesson written so far is done</span>
          </div>
        )
      }
    >
      {next ? (
        <Button
          variant="primary"
          size="lg"
          iconRight="ArrowRight"
          onClick={() => {
            if (hearts.empty) select(next.lesson);
            else start(next.lesson);
          }}
          data-continue={next.lesson.node.id}
        >
          {next.lesson.node.completions > 0 ? 'Continue' : 'Start'}
        </Button>
      ) : refill ? (
        <Button variant="primary" size="lg" iconLeft="Dumbbell" onClick={refill}>
          Practise
        </Button>
      ) : null}
    </ActionBar>
  );

  // A new learner on a phone sees where to start first: the first unit's path comes straight after
  // the stages, and the switches and "Find my level" follow it (they sat above it, which put the
  // first lesson about 700 px down a 390 px phone).
  const firstFirst = !wide && !view.started && next ? next.unit.path.outline.id : null;
  const conditionsBar = <ConditionsBar conditions={conditions} onChange={setConditions} />;
  const after = firstFirst
    ? {
        unitId: firstFirst,
        node: (
          <>
            {placement}
            {conditionsBar}
          </>
        ),
      }
    : null;

  return (
    <Page title="Theory Path" subtitle="Bite-sized theory, always on the neck. Two to five minutes a lesson." className={styles.page}>
      <div className={cx(styles.layout, wide && styles.wide)} data-learn-map="" data-layout={wide ? 'wide' : 'phone'} data-first-run={firstFirst ? '' : undefined}>
        <div className={styles.main}>
          {/* All three stages at 0: the first stage's own header says the same, closer to the first lesson. */}
          {!firstFirst && <StageStrip view={view} onJump={jumpToStage} />}
          {!firstFirst && conditionsBar}
          {failed.size > 0 && (
            <div className={styles.failed} role="alert">
              <Text variant="caption">Some lessons could not be loaded. Check your connection.</Text>
              <Button size="sm" onClick={retry}>
                Try again
              </Button>
            </div>
          )}
          {!wide && review}
          {!view.started && !firstFirst && placement}
          <div className={cx(styles.stages, firstFirst && styles.stagesFirst)}>
            {view.stages.map((s) => (
              <StageSection key={s.id} stage={s} phases={phases} handlers={handlers} after={after} />
            ))}
          </div>
          {!wide && view.started && (
            <div className={styles.footer}>
              <Button variant="ghost" iconLeft="Compass" onClick={() => navigate('learn', 'placement')} data-placement-start="">
                Find my level
              </Button>
            </div>
          )}
        </div>
        {wide && (
          <aside className={styles.side} aria-label="Lesson and unit">
            <div className={styles.panelBlock}>{details}</div>
            {review}
            {selectedUnit && <UnitLessons unit={selectedUnit} selected={selected?.lesson.node.id ?? null} onSelect={select} onCheckpoint={checkpoint} onPractice={practice} />}
            {view.started && (
              <Button variant="ghost" size="sm" iconLeft="Compass" onClick={() => navigate('learn', 'placement')} data-placement-start="" className={styles.panelLink}>
                Find my level
              </Button>
            )}
          </aside>
        )}
      </div>
      {!wide && continueBar}
      {!wide && (
        <Sheet open={sheetOpen && !!selected} onClose={() => setSheetOpen(false)} title={selected?.lesson.node.title ?? 'Lesson'} hideTitle>
          {details}
        </Sheet>
      )}
    </Page>
  );
}

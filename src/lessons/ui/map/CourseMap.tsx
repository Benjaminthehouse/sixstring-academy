/**
 * The course map: a winding path of lesson nodes grouped by unit, with the states the lesson
 * engine computes (locked, available, current, done, crowns, review due), a unit header with its
 * progress and the "Test out" checkpoint, and the details of the chosen lesson: in a side pane on
 * wide screens, in a bottom sheet on phones. The current lesson is obvious and scrolled into
 * view. Arrow keys walk the nodes, Enter starts the focused lesson.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Badge, Button, Heading, Icon, ProgressBar, Sheet, Text, cx, useElementSize, useMediaQuery } from '@/ui';
import { useProgress, type ProgressState } from '@/core/progress';
import { courseMap, type CourseMap as CourseMapData, type LessonNode, type UnitNode } from '../../map';
import { findLesson } from '../../session';
import type { Course, UnitTheme } from '../../types';
import { LessonProvider } from '../context';
import { moveFocus, nextPhase, pathLayout } from '../logic/path';
import { TeacherBadge } from '../player/StepViews';
import styles from './CourseMap.module.css';

/** Props of {@link CourseMap}. */
export interface CourseMapProps {
  course: Course;
  /** Start (or redo) a lesson. */
  onStartLesson: (unitId: string, lessonId: string) => void;
  /** Take a unit's checkpoint ("Test out" / "Jump here"). Without it the button is not shown. */
  onStartCheckpoint?: (unitId: string) => void;
  /** Practise a unit (a drill from its finished lessons; also refills hearts). */
  onPractice?: (unitId: string) => void;
  /** Progress to draw (default: the learner's, live). */
  progress?: ProgressState;
  /** Scroll the current lesson into view on opening (default true). */
  autoScroll?: boolean;
  className?: string;
}

const THEME_ICONS: Record<UnitTheme, string> = {
  basics: 'Guitar',
  notes: 'Music',
  fretboard: 'Grid3x3',
  rhythm: 'Drum',
  intervals: 'Ruler',
  scales: 'Music4',
  chords: 'Layers',
  keys: 'Key',
  harmony: 'Blocks',
  reading: 'BookOpen',
  ear: 'Ear',
  technique: 'Hand',
  songs: 'Music2',
  improvisation: 'Sparkles',
  composition: 'Feather',
};

const NODE = 68;

/**
 * Distance between two nodes: room for a node and a title of up to two lines below it, in rem so
 * that a learner's larger text size keeps titles clear of the next node.
 */
function rowHeight(): number {
  const rem = typeof document === 'undefined' ? 16 : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return Math.round(NODE + rem * 5);
}

function nodeIcon(node: LessonNode): string {
  if (node.state === 'done') return node.dueForReview ? 'RotateCcw' : 'Check';
  if (node.state === 'current') return 'Play';
  if (node.state === 'locked') return 'Lock';
  return 'BookOpen';
}

function stateWords(node: LessonNode, course: Course): string {
  if (node.state === 'done') {
    const crowns = `${node.crown} ${node.crown === 1 ? 'crown' : 'crowns'}`;
    return node.dueForReview ? `Done · ${crowns} · worth a review` : `Done · ${crowns}`;
  }
  if (node.state === 'current') return 'Up next';
  if (node.state === 'available') return 'Open';
  const first = node.missing[0];
  const title = first ? (findLesson(course, first)?.lesson.title ?? first) : '';
  return title ? `Locked: finish “${title}” first` : 'Locked';
}

/** The details of one lesson, with its Start button. */
function LessonDetails({ course, map, node, onStart, onCheckpoint }: { course: Course; map: CourseMapData; node: LessonNode; onStart: () => void; onCheckpoint?: () => void }) {
  const found = findLesson(course, node.id);
  const unit = map.units.find((u) => u.id === node.unitId);
  const unitIndex = map.units.findIndex((u) => u.id === node.unitId);
  if (!found || !unit) return null;
  const locked = node.state === 'locked';
  const label = node.state === 'done' ? (node.dueForReview ? 'Review it' : 'Practise again') : node.completions > 0 ? 'Continue' : 'Start lesson';
  return (
    <div className={styles.details} data-details={node.id}>
      <p className={styles.detailsEyebrow}>
        Unit {unitIndex + 1} · {unit.title}
      </p>
      <Heading level={3} size="xl" display>
        {found.lesson.title}
      </Heading>
      <Text tone="muted">{found.lesson.teaches}</Text>
      <div className={styles.detailsMeta}>
        <span>
          <Icon name="Clock" size="sm" /> {found.lesson.minutes} min
        </span>
        <span aria-label={`${node.crown} of 5 crowns`}>
          {Array.from({ length: 5 }, (_u, i) => (
            <Icon key={i} name="Crown" size="xs" className={i < node.crown ? styles.crownOn : styles.crownOff} />
          ))}
        </span>
        <span className={cx(styles.stateWord, styles[`word-${node.state}`])}>{stateWords(node, course)}</span>
      </div>
      {locked ? (
        <div className={styles.detailsActions}>
          <Button variant="primary" disabled fullWidth iconLeft="Lock">
            Locked for now
          </Button>
          {onCheckpoint && unit.checkpoint && unit.checkpoint.state !== 'passed' && (
            <Button variant="ghost" iconLeft="Trophy" onClick={onCheckpoint} fullWidth>
              Already know this unit? Test out
            </Button>
          )}
        </div>
      ) : (
        <div className={styles.detailsActions}>
          <Button variant="primary" size="lg" iconLeft={node.state === 'done' ? 'RotateCcw' : 'Play'} onClick={onStart} fullWidth data-start={node.id}>
            {label}
          </Button>
        </div>
      )}
    </div>
  );
}

/** One unit: its header and its stretch of the path. */
function UnitBlock({
  unit, index, phase, course, selected, onSelect, onStart, onCheckpoint, onPractice, nodeRefs, focusIndex, onKeyDown,
}: {
  unit: UnitNode;
  index: number;
  phase: number;
  course: Course;
  selected: string | null;
  onSelect: (node: LessonNode) => void;
  onStart: (node: LessonNode) => void;
  onCheckpoint?: (unitId: string) => void;
  onPractice?: (unitId: string) => void;
  nodeRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>;
  focusIndex: (lessonId: string) => number;
  onKeyDown: (e: ReactKeyboardEvent<HTMLButtonElement>, node: LessonNode) => void;
}) {
  const [ref, { width }] = useElementSize<HTMLDivElement>();
  const w = Math.max(260, width || 320);
  const row = useMemo(rowHeight, []);
  const pad = row / 2;
  const layout = useMemo(() => pathLayout(unit.lessons.length, { width: w, row, node: NODE, phase, pad }), [unit.lessons.length, w, row, phase, pad]);
  const lastDone = unit.lessons.reduce((acc, l, i) => (l.state === 'done' ? i : acc), -1);
  const progressD = useMemo(() => (lastDone >= 0 ? pathLayout(Math.min(unit.lessons.length, lastDone + 2), { width: w, row, node: NODE, phase, pad }).d : ''), [lastDone, unit.lessons.length, w, row, phase, pad]);
  const cp = unit.checkpoint;
  return (
    <li className={cx(styles.unit, styles[`theme-${unit.theme}`])} data-unit={unit.id} aria-labelledby={`unit-${unit.id}`}>
      <header className={styles.unitHead}>
        <span className={styles.unitIcon} aria-hidden="true">
          <Icon name={THEME_ICONS[unit.theme] ?? 'Music'} size="md" />
        </span>
        <div className={styles.unitText}>
          <p className={styles.unitEyebrow}>Unit {index + 1}</p>
          <Heading level={3} size="lg" id={`unit-${unit.id}`}>
            {unit.title}
          </Heading>
          <Text variant="caption" tone="muted">
            {unit.description}
          </Text>
          <div className={styles.unitProgress}>
            <ProgressBar value={unit.done} max={Math.max(1, unit.total)} size="sm" tone="ok" aria-label={`${unit.title}: lessons done`} valueText={false} />
            <span className={styles.unitCount}>
              {unit.done}/{unit.total}
            </span>
            {unit.crowns > 0 && (
              <span className={styles.unitCrowns} aria-label={`${unit.crowns} of ${unit.maxCrowns} crowns`}>
                <Icon name="Crown" size="xs" /> {unit.crowns}
              </span>
            )}
          </div>
          <div className={styles.unitActions}>
            {cp && cp.state === 'passed' && (
              <Badge tone="ok" icon="Trophy">
                Unit complete
              </Badge>
            )}
            {cp && cp.state !== 'passed' && onCheckpoint && (
              <Button size="sm" variant={cp.ahead ? 'ghost' : 'secondary'} iconLeft="Trophy" onClick={() => onCheckpoint(unit.id)} data-checkpoint={unit.id}>
                {cp.ahead ? 'Jump here' : 'Test out'}
              </Button>
            )}
            {onPractice && unit.done > 0 && (
              <Button size="sm" variant="ghost" iconLeft="Dumbbell" onClick={() => onPractice(unit.id)} data-practice={unit.id}>
                Practise
              </Button>
            )}
          </div>
        </div>
      </header>
      <div className={styles.path} ref={ref} style={{ height: layout.height }}>
        <svg className={styles.trail} width="100%" height={layout.height} aria-hidden="true">
          <path d={layout.d} className={styles.trailBase} />
          {progressD && <path d={progressD} className={styles.trailDone} />}
        </svg>
        <ol className={styles.nodes} aria-label={`Lessons of ${unit.title}`}>
          {unit.lessons.map((node, i) => {
            const p = layout.points[i];
            const isSelected = selected === node.id;
            // The title under a node stays inside the column, however far the trail swings.
            const room = Math.max(96, Math.min(160, 2 * Math.min(p.x, w - p.x) - 8));
            return (
              <li key={node.id} className={styles.nodeItem} style={{ left: p.x, top: p.y, width: room }}>
                {node.state === 'current' && (
                  // Beside the node, on the side with more room: above it, it would sit on the title of the lesson before.
                  <span className={cx(styles.bubble, p.x > w / 2 ? styles.bubbleLeft : styles.bubbleRight)} aria-hidden="true" data-bubble="">
                    {node.completions > 0 ? 'Continue' : 'Start'}
                  </span>
                )}
                <button
                  ref={(el) => {
                    if (el) nodeRefs.current.set(node.id, el);
                    else nodeRefs.current.delete(node.id);
                  }}
                  type="button"
                  className={cx(styles.node, styles[`node-${node.state}`], isSelected && styles.nodeSelected)}
                  onClick={() => onSelect(node)}
                  onDoubleClick={() => node.state !== 'locked' && onStart(node)}
                  onKeyDown={(e) => onKeyDown(e, node)}
                  tabIndex={focusIndex(node.id)}
                  aria-label={`${node.title}. ${stateWords(node, course)}.`}
                  aria-current={node.state === 'current' ? 'step' : undefined}
                  aria-pressed={isSelected}
                  data-node={node.id}
                  data-state={node.state}
                >
                  <Icon name={nodeIcon(node)} size="lg" />
                  {node.crown > 0 && (
                    <span className={styles.crownChip} aria-hidden="true">
                      <Icon name="Crown" size="xs" />
                      {node.crown}
                    </span>
                  )}
                  {node.dueForReview && node.state === 'done' && <span className={styles.dueDot} aria-hidden="true" />}
                </button>
                <span className={cx(styles.nodeLabel, node.state === 'locked' && styles.nodeLabelLocked)} aria-hidden="true">
                  {node.title}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </li>
  );
}

/** The course map. */
export function CourseMap({ course, onStartLesson, onStartCheckpoint, onPractice, progress, autoScroll = true, className }: CourseMapProps) {
  const live = useProgress((s) => s);
  const state = progress ?? live;
  const map = useMemo(() => courseMap(course, state, Date.now()), [course, state]);
  const wide = useMediaQuery('(min-width: 900px)');
  const all = useMemo(() => map.units.flatMap((u) => u.lessons), [map]);
  const initial = map.next?.lessonId ?? all.find((l) => l.state !== 'locked')?.id ?? all[0]?.id ?? null;
  const [selected, setSelected] = useState<string | null>(initial);
  const [focused, setFocused] = useState<string | null>(initial);
  const [sheetOpen, setSheetOpen] = useState(false);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const node = all.find((l) => l.id === selected) ?? null;

  useEffect(() => {
    if (!autoScroll || !map.next) return;
    const el = nodeRefs.current.get(map.next.lessonId);
    const t = window.setTimeout(() => el?.scrollIntoView({ block: 'center', behavior: 'auto' }), 60);
    return () => window.clearTimeout(t);
    // Once on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = (n: LessonNode) => {
    setSheetOpen(false);
    onStartLesson(n.unitId, n.id);
  };
  const select = (n: LessonNode) => {
    setSelected(n.id);
    setFocused(n.id);
    if (!wide) setSheetOpen(true);
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>, n: LessonNode) => {
    if (e.key === 'Enter' && !wide) return; // the click opens the sheet
    if (e.key === 'Enter' && wide && selected === n.id && n.state !== 'locked') {
      e.preventDefault();
      start(n);
      return;
    }
    const index = all.findIndex((l) => l.id === n.id);
    const to = moveFocus(index, e.key, all.length);
    if (to === null || to === index) return;
    e.preventDefault();
    const target = all[to];
    setFocused(target.id);
    if (wide) setSelected(target.id);
    nodeRefs.current.get(target.id)?.focus();
  };
  const focusIndex = (id: string) => (id === focused ? 0 : -1);

  let phase = 0;
  const units = map.units.map((unit, i) => {
    const block = (
      <UnitBlock
        key={unit.id}
        unit={unit}
        index={i}
        phase={phase}
        course={course}
        selected={selected}
        onSelect={select}
        onStart={start}
        onCheckpoint={onStartCheckpoint}
        onPractice={onPractice}
        nodeRefs={nodeRefs}
        focusIndex={focusIndex}
        onKeyDown={onKeyDown}
      />
    );
    phase = nextPhase(phase, unit.lessons.length);
    return block;
  });

  const details = node ? <LessonDetails course={course} map={map} node={node} onStart={() => start(node)} onCheckpoint={onStartCheckpoint ? () => { setSheetOpen(false); onStartCheckpoint(node.unitId); } : undefined} /> : null;

  return (
    <LessonProvider course={course}>
      <div className={cx(styles.root, wide && styles.wide, className)} data-course-map={course.id}>
        <div className={styles.mapColumn}>
          <div className={styles.summary}>
            {course.teacher !== 'none' && <TeacherBadge teacher={course.teacher} size="md" />}
            <div className={styles.summaryNumbers}>
              <span>
                <strong>{map.done}</strong> of {map.total} lessons
              </span>
              <span aria-label={`${map.crowns} crowns`}>
                <Icon name="Crown" size="sm" className={styles.crownOn} /> {map.crowns}
              </span>
              {map.dueCards > 0 && (
                <span>
                  <Icon name="Layers" size="sm" /> {map.dueCards} due
                </span>
              )}
            </div>
          </div>
          <ol className={styles.units}>{units}</ol>
          {map.finished && (
            <div className={styles.finished}>
              <Icon name="Trophy" size="lg" />
              <Text weight="semibold">Course complete. Keep your crowns shining with reviews and practice.</Text>
            </div>
          )}
        </div>
        {wide ? (
          <aside className={styles.side} aria-label="Lesson details">
            {details}
          </aside>
        ) : (
          <Sheet open={sheetOpen && !!node} onClose={() => setSheetOpen(false)} title={node?.title ?? 'Lesson'} hideTitle>
            {details}
          </Sheet>
        )}
      </div>
    </LessonProvider>
  );
}

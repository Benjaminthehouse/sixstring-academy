/**
 * The winding path itself: stages, unit headers (progress, crowns, "Test out", "Practise"), the
 * lesson nodes and the trail between them, and the units still being written ("coming soon"). The
 * node states come from the lesson engine's course map: locked, available, current, done.
 */
import { Fragment, useMemo, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject, type ReactNode } from 'react';
import { Badge, Button, Heading, Icon, ProgressBar, Text, cx, useElementSize } from '@/ui';
import type { PathLesson, PathStage, PathUnitView } from '../model/path';
import { windingLayout } from '../model/winding';
import { THEME_ICONS } from './themes';
import styles from './PathMap.module.css';

/** Vertical distance between nodes, node size and the room above the first one. */
export const ROW = 112;
export const NODE = 64;
const PAD = ROW / 2 + 8;

/** What the map needs from the screen. */
export interface MapHandlers {
  /**
   * The lesson shown in the side panel (wide screens), ringed and pressed on the map. Null on
   * phones: a tap there opens the lesson's sheet, so nodes are plain buttons, not toggles.
   */
  selected: string | null;
  onSelect: (lesson: PathLesson) => void;
  onCheckpoint: (unitId: string) => void;
  onPractice: (unitId: string) => void;
  /** Keyboard walking between nodes. */
  onNodeKey: (e: ReactKeyboardEvent<HTMLButtonElement>, lesson: PathLesson) => void;
  focusable: (lessonId: string) => boolean;
  nodeRefs: MutableRefObject<Map<string, HTMLButtonElement>>;
}

function nodeIcon(l: PathLesson): string {
  const n = l.node;
  if (n.state === 'done') return n.dueForReview ? 'RotateCcw' : 'Check';
  if (n.state === 'current') return 'Play';
  if (n.state === 'locked') return 'Lock';
  return 'BookOpen';
}

/** The words a screen reader hears for a node. */
export function nodeWords(l: PathLesson): string {
  const n = l.node;
  const needs = [l.play ? 'uses your guitar' : 'no guitar needed', l.listening ? 'has listening' : null].filter(Boolean).join(', ');
  const state =
    n.state === 'done'
      ? `Done, ${n.crown} ${n.crown === 1 ? 'crown' : 'crowns'}${n.dueForReview ? ', worth a review' : ''}`
      : n.state === 'current'
        ? 'Up next'
        : n.state === 'available'
          ? 'Open'
          : 'Locked';
  return `${n.title}. ${state}. ${n.minutes} minutes, ${needs}.`;
}

/** One written unit: its header and its stretch of the path. */
export function UnitBlock({ unit, phase, handlers }: { unit: PathUnitView; phase: number; handlers: MapHandlers }) {
  const [ref, { width }] = useElementSize<HTMLDivElement>();
  const w = Math.max(280, width || 340);
  const node = unit.node;
  const count = unit.lessons.length;
  const layout = useMemo(() => windingLayout(count, { width: w, row: ROW, node: NODE, pad: PAD, phase }), [count, w, phase]);
  const lastDone = unit.lessons.reduce((acc, l, i) => (l.node.state === 'done' ? i : acc), -1);
  const doneTrail = useMemo(() => (lastDone >= 0 ? windingLayout(Math.min(count, lastDone + 2), { width: w, row: ROW, node: NODE, pad: PAD, phase }).d : ''), [lastDone, count, w, phase]);
  if (!node) return null;
  const cp = node.checkpoint;
  const id = unit.path.outline.id;
  const complete = node.total > 0 && node.done === node.total;
  return (
    <li className={cx(styles.unit, complete && styles.unitComplete)} data-unit={id} data-unit-status={unit.path.status} aria-labelledby={`unit-${id}`}>
      <header className={styles.unitHead}>
        <span className={styles.unitIcon} aria-hidden="true">
          <Icon name={complete ? 'Trophy' : (THEME_ICONS[node.theme] ?? 'Music')} size="md" />
        </span>
        <div className={styles.unitText}>
          <p className={styles.eyebrow}>Unit {unit.path.number}</p>
          <Heading level={3} size="lg" id={`unit-${id}`}>
            {node.title}
          </Heading>
          <Text variant="caption" tone="muted">
            {node.description}
          </Text>
          <div className={styles.unitProgress}>
            <ProgressBar value={node.done} max={Math.max(1, node.total)} size="sm" tone="ok" aria-label={`${node.title}: lessons done`} valueText={false} />
            <span className={styles.count}>
              {node.done}/{node.total}
            </span>
            {node.crowns > 0 && (
              <span className={styles.crowns} aria-label={`${node.crowns} of ${node.maxCrowns} crowns`}>
                <Icon name="Crown" size="xs" /> {node.crowns}
              </span>
            )}
          </div>
          <div className={styles.unitActions}>
            {complete && (
              <Badge tone="ok" icon="Trophy">
                Unit complete
              </Badge>
            )}
            {cp && cp.state !== 'passed' && (
              <Button size="sm" variant={cp.ahead ? 'ghost' : 'secondary'} iconLeft="Trophy" onClick={() => handlers.onCheckpoint(id)} data-checkpoint={id}>
                {cp.ahead ? 'Jump here' : 'Test out'}
              </Button>
            )}
            {node.done > 0 && (
              <Button size="sm" variant={complete ? 'secondary' : 'ghost'} iconLeft="Dumbbell" onClick={() => handlers.onPractice(id)} data-practice={id}>
                Practise
              </Button>
            )}
          </div>
        </div>
      </header>
      <div className={styles.path} ref={ref} style={{ height: layout.height }}>
        <svg className={styles.trail} width="100%" height={layout.height} aria-hidden="true">
          <path d={layout.d} className={styles.trailBase} />
          {doneTrail && <path d={doneTrail} className={styles.trailDone} />}
        </svg>
        <ol className={styles.nodes} aria-label={`Lessons of unit ${unit.path.number}, ${node.title}`}>
          {unit.lessons.map((lesson, i) => {
            const p = layout.points[i];
            const n = lesson.node;
            const selected = handlers.selected === n.id;
            const room = Math.max(104, Math.min(176, 2 * Math.min(p.x, w - p.x) - 8));
            const bubbleRight = p.x <= w / 2;
            return (
              <li key={n.id} className={styles.nodeItem} style={{ left: p.x, top: p.y, width: room }}>
                {n.state === 'current' && (
                  <span className={cx(styles.bubble, bubbleRight ? styles.bubbleRight : styles.bubbleLeft)} aria-hidden="true">
                    {n.completions > 0 ? 'Continue' : 'Start'}
                  </span>
                )}
                <button
                  ref={(el) => {
                    if (el) handlers.nodeRefs.current.set(n.id, el);
                    else handlers.nodeRefs.current.delete(n.id);
                  }}
                  type="button"
                  className={cx(styles.node, styles[`node-${n.state}`], selected && styles.nodeSelected)}
                  onClick={() => handlers.onSelect(lesson)}
                  onKeyDown={(e) => handlers.onNodeKey(e, lesson)}
                  tabIndex={handlers.focusable(n.id) ? 0 : -1}
                  aria-label={nodeWords(lesson)}
                  aria-current={n.state === 'current' ? 'step' : undefined}
                  aria-pressed={handlers.selected === null ? undefined : selected}
                  data-node={n.id}
                  data-state={n.state}
                >
                  <Icon name={nodeIcon(lesson)} size="lg" />
                  {n.crown > 0 && (
                    <span className={styles.crownChip} aria-hidden="true">
                      <Icon name="Crown" size={11} />
                      {n.crown}
                    </span>
                  )}
                  {n.dueForReview && n.state === 'done' && <span className={styles.dueDot} aria-hidden="true" />}
                </button>
                <span className={cx(styles.nodeLabel, n.state === 'locked' && styles.nodeLabelLocked)} aria-hidden="true">
                  {n.title}
                  {(lesson.play || lesson.listening) && (
                    <span className={styles.needs}>
                      {lesson.play && <Icon name="Guitar" size={13} />}
                      {lesson.listening && <Icon name="Headphones" size={13} />}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </li>
  );
}

/** Units still being written, listed compactly in their place on the path. */
export function ComingSoon({ units }: { units: PathUnitView[] }) {
  if (units.length === 0) return null;
  const first = units[0].path.number;
  const last = units[units.length - 1].path.number;
  return (
    <li className={styles.soon} data-coming-soon={units.map((u) => u.path.outline.id).join(' ')}>
      <p className={styles.soonHead}>
        <Icon name="PenLine" size="sm" />
        <span>{units.length === 1 ? `Unit ${first} is being written` : `Units ${first} to ${last} are being written`}</span>
      </p>
      <ol className={styles.soonList}>
        {units.map((u) => (
          <li key={u.path.outline.id} className={styles.soonItem} data-unit={u.path.outline.id} data-unit-status="coming-soon">
            <span className={styles.soonIcon} aria-hidden="true">
              <Icon name={THEME_ICONS[u.path.outline.theme] ?? 'Music'} size="sm" />
            </span>
            <span className={styles.soonText}>
              <span className={styles.soonNumber}>Unit {u.path.number}</span>
              <span className={styles.soonTitle}>{u.path.outline.title}</span>
            </span>
            <span className={styles.soonCount}>{u.planned.length} lessons</span>
          </li>
        ))}
      </ol>
    </li>
  );
}

/**
 * A stage: its header, then its units in order (written ones as path, runs of unwritten ones as a
 * list). `after` puts something right after one unit's stretch of path (a new learner's "Find my
 * level" and switches follow the first unit, so the first lesson is on the first screen).
 */
export function StageSection({ stage, phases, handlers, after }: { stage: PathStage; phases: Map<string, number>; handlers: MapHandlers; after?: { unitId: string; node: ReactNode } | null }) {
  const blocks: Array<{ key: string; written: PathUnitView | null; soon: PathUnitView[] }> = [];
  for (const u of stage.units) {
    if (u.node) blocks.push({ key: u.path.outline.id, written: u, soon: [] });
    else {
      const last = blocks[blocks.length - 1];
      if (last && !last.written) last.soon.push(u);
      else blocks.push({ key: `soon-${u.path.outline.id}`, written: null, soon: [u] });
    }
  }
  const written = stage.units.filter((u) => u.node).length;
  return (
    <section className={styles.stage} id={`stage-${stage.id}`} data-stage={stage.id} aria-labelledby={`stage-title-${stage.id}`}>
      <header className={styles.stageHead}>
        <p className={styles.stageEyebrow}>Stage {stage.number}</p>
        <Heading level={2} size="xl" display id={`stage-title-${stage.id}`}>
          {stage.title}
        </Heading>
        <Text tone="muted">{stage.subtitle}</Text>
        <Text variant="caption" tone="muted" className={styles.stageCount}>
          {written > 0 ? `${stage.done} of ${stage.total} lessons done` : 'Being written'}
          {written < stage.units.length && written > 0 ? ` · ${stage.units.length - written} more units coming` : ''}
        </Text>
      </header>
      <ol className={styles.units}>
        {blocks.map((b) =>
          b.written ? (
            <Fragment key={b.key}>
              <UnitBlock unit={b.written} phase={phases.get(b.key) ?? 0} handlers={handlers} />
              {after && after.unitId === b.key && <li className={styles.after}>{after.node}</li>}
            </Fragment>
          ) : (
            <ComingSoon key={b.key} units={b.soon} />
          ),
        )}
      </ol>
    </section>
  );
}

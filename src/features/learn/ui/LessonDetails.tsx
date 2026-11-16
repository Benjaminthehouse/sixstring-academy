/**
 * The card of one lesson: what it teaches, how long it takes, its crowns, what it needs (the
 * guitar, sound) and the one button that starts it. Shown in a bottom sheet on phones and at the
 * top of the side panel on wide screens. Locked lessons say what to finish first and offer the
 * unit's test-out; with no hearts left it offers the way to refill them instead of a dead end.
 */
import { Banner, Button, Heading, Icon, Skeleton, Tag, Text, cx } from '@/ui';
import { openStats } from '@/app/shell';
import type { HeartsView } from '@/core/progress';
import type { Conditions } from '../model/conditions';
import type { PathLesson, PathUnitView, PathView } from '../model/path';
import styles from './LessonDetails.module.css';

/** Props of {@link LessonDetails}. */
export interface LessonDetailsProps {
  view: PathView;
  unit: PathUnitView;
  lesson: PathLesson;
  conditions: Conditions;
  hearts: HeartsView;
  /** Lessons it would skip or swap here (null while the unit loads). */
  adapted: { swapped: number; skipped: number; needsSound: boolean } | null;
  onStart: () => void;
  onCheckpoint: () => void;
  /** Refill hearts: practise a unit with finished lessons (null when there is none). */
  onRefill: (() => void) | null;
}

/** "14 minutes", "1 minute". */
function minutesWords(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / 60000));
  return `${m} ${m === 1 ? 'minute' : 'minutes'}`;
}

function stateWord(lesson: PathLesson): { text: string; tone: 'ok' | 'accent' | 'muted' } {
  const n = lesson.node;
  if (n.state === 'done') return { text: n.dueForReview ? 'Done · worth a review' : 'Done', tone: 'ok' };
  if (n.state === 'current') return { text: 'Up next', tone: 'accent' };
  if (n.state === 'available') return { text: 'Open', tone: 'muted' };
  return { text: 'Locked', tone: 'muted' };
}

/** The details of a lesson and its Start button. */
export function LessonDetails({ view, unit, lesson, conditions, hearts, adapted, onStart, onCheckpoint, onRefill }: LessonDetailsProps) {
  const n = lesson.node;
  const word = stateWord(lesson);
  const locked = n.state === 'locked';
  const firstMissing = n.missing[0] ? view.byLesson.get(n.missing[0])?.lesson.node.title : null;
  const cp = unit.node?.checkpoint ?? null;
  const label = n.state === 'done' ? (n.dueForReview ? 'Review this lesson' : 'Practise again') : n.completions > 0 ? 'Continue lesson' : 'Start lesson';
  const noHearts = !locked && hearts.empty;

  return (
    <div className={styles.details} data-details={n.id}>
      <p className={styles.eyebrow}>
        Unit {unit.path.number} · {unit.node?.title ?? unit.path.outline.title}
      </p>
      <Heading level={3} size="xl" display>
        {n.title}
      </Heading>
      {lesson.ready ? <Text tone="muted">{lesson.teaches}</Text> : <div aria-busy="true">
          <Skeleton variant="text" lines={2} />
        </div>}

      <div className={styles.meta}>
        <span>
          <Icon name="Clock" size="sm" /> {n.minutes} min
        </span>
        <span aria-label={`${n.crown} of 5 crowns`} className={styles.crowns}>
          {Array.from({ length: 5 }, (_u, i) => (
            <Icon key={i} name="Crown" size="xs" className={i < n.crown ? styles.crownOn : styles.crownOff} />
          ))}
        </span>
        <span className={cx(styles.word, styles[`word-${word.tone}`])}>{word.text}</span>
      </div>

      <ul className={styles.needs} aria-label="What this lesson needs">
        {lesson.play ? (
          <li>
            <Tag icon="Guitar">{conditions.guitar && conditions.sound ? 'Uses your guitar · tapping works too' : 'Guitar steps become tapping'}</Tag>
          </li>
        ) : (
          <li>
            <Tag icon="Hand">No guitar needed</Tag>
          </li>
        )}
        {lesson.listening && (
          <li>
            <Tag icon={conditions.sound ? 'Headphones' : 'VolumeX'}>
              {conditions.sound ? 'Has listening' : adapted?.needsSound ? 'Needs sound' : 'Listening left out'}
            </Tag>
          </li>
        )}
      </ul>
      {adapted?.needsSound && !conditions.sound && (
        <Text variant="caption" tone="warn" data-needs-sound="">
          This lesson is mostly listening, so it plays sound anyway. Put on headphones, or pick another lesson for now.
        </Text>
      )}

      {locked ? (
        <div className={styles.actions}>
          <Text variant="caption" tone="muted">
            {firstMissing ? `Finish “${firstMissing}” first.` : 'Finish the lessons before it first.'}
          </Text>
          <Button variant="primary" disabled fullWidth iconLeft="Lock" size="lg">
            Locked for now
          </Button>
          {cp && cp.state !== 'passed' && (
            <Button variant="ghost" iconLeft="Trophy" onClick={onCheckpoint} fullWidth wrap data-details-checkpoint="">
              {cp.ahead ? 'Already know this? Jump here' : 'Already know this unit? Test out'}
            </Button>
          )}
        </div>
      ) : noHearts ? (
        <div className={styles.actions}>
          <Banner tone="warn" icon="HeartCrack" title="No hearts left">
            Practise a unit you have finished lessons in to refill them{hearts.nextAt ? `, or wait: the next heart comes in ${minutesWords(hearts.msToNext)}` : ''}.
          </Banner>
          {onRefill && (
            <Button variant="primary" size="lg" iconLeft="Dumbbell" onClick={onRefill} fullWidth data-refill="">
              Practise to refill hearts
            </Button>
          )}
          <Button variant="ghost" iconLeft="Heart" onClick={() => openStats('hearts')} fullWidth>
            More about hearts
          </Button>
        </div>
      ) : (
        <div className={styles.actions}>
          <Button variant="primary" size="lg" iconLeft={n.state === 'done' ? 'RotateCcw' : 'Play'} onClick={onStart} fullWidth data-start={n.id}>
            {label}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * The teacher's own steps inside a lesson: a teaching card with the teacher present, a task that
 * sends the learner to a tool and welcomes them back, and the short reaction after an answer.
 */
import { useEffect, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ROUTE_BY_NAME } from '@/app/routes';
import { teacherById } from '@/app/teachers';
import { getLibrary } from '@/core/library';
import type { PracticeSession } from '@/core/progress';
import { speakable, type CardStep, type GlossaryLookup } from '@/lessons';
import { FigureView, RichText, useLessonContext } from '@/lessons/ui';
import { Callout, Heading, Icon, Tag, Text, cx } from '@/ui';
import { TASK_TOOLS, resolveTaskTarget, taskSong, type CardArt, type ResolvedTaskTarget, type TaskStep, type TaskTarget, type TeacherKey } from '@/content/teachers';
import { Art } from '../Art';
import { Portrait } from '../Portrait';
import { SpeakButton } from '../Speak';
import { describeActivity } from '../../model/tasks';
import styles from './Lesson.module.css';

/** The teacher's portrait and name, as at the top of a card. */
export function TeacherLine({ teacher, children, size = 2.5 }: { teacher: TeacherKey; children?: ReactNode; size?: number }) {
  const t = teacherById(teacher);
  return (
    <span className={styles.teacher} data-teacher-line={teacher}>
      <Portrait teacher={teacher} size={size} />
      <span className={styles.teacherWho}>
        <span className={styles.teacherName}>{t.name}</span>
        {children}
      </span>
    </span>
  );
}

function spokenOf(card: { title?: string; body: CardStep['body']; tip?: CardStep['tip'] }, glossary: GlossaryLookup): string {
  return [card.title ?? '', speakable(card.body, { glossary }), card.tip ? speakable(card.tip, { glossary }) : ''].filter(Boolean).join('. ');
}

/** Swipe left on a touch screen to move on, like the Continue button. */
function useSwipe(onNext?: () => void) {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  return {
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.pointerType !== 'mouse') setStart({ x: e.clientX, y: e.clientY });
    },
    onPointerUp: (e: ReactPointerEvent) => {
      const s = start;
      setStart(null);
      if (!s || !onNext) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (dx < -70 && Math.abs(dy) < Math.abs(dx) * 0.6) onNext();
    },
    onPointerCancel: () => setStart(null),
  };
}

/** A teaching card with the teacher present: portrait, name, read aloud, then the idea and its picture. */
export function TeacherCard({ teacher, card, art, onNext }: { teacher: TeacherKey; card: CardStep; art?: CardArt; onNext?: () => void }) {
  const { glossary } = useLessonContext();
  const swipe = useSwipe(onNext);
  const hasPicture = !!card.figure || !!art;
  return (
    <article className={cx(styles.card, hasPicture && styles.split)} data-step-kind="card" {...swipe}>
      <div className={styles.cardHead}>
        <TeacherLine teacher={teacher} />
        <SpeakButton teacher={teacher} text={spokenOf(card, glossary)} auto />
      </div>
      <div className={styles.cardMain}>
        {card.title && (
          <Heading level={2} size="2xl" display className={styles.cardTitle}>
            {card.title}
          </Heading>
        )}
        <div className={styles.cardBody}>
          <RichText text={card.body} as="p" />
        </div>
      </div>
      {art ? (
        <div className={cx(styles.cardFigure, styles.art)}>
          <Art kind={art} />
        </div>
      ) : card.figure ? (
        <div className={styles.cardFigure}>
          <FigureView figure={card.figure} />
        </div>
      ) : null}
      {card.tip && (
        <Callout tone="tip" label={`${teacherById(teacher).first}'s tip`} className={styles.tip}>
          <RichText text={card.tip} />
        </Callout>
      )}
    </article>
  );
}

/** What a task card knows about its trip out. */
export interface TaskState {
  /** Where the task leads now (its target, or its fallback when the song is missing). */
  target: TaskTarget;
  /** True when the fallback is used. */
  fallback: boolean;
  /** 'ready' before the learner went; 'back' after. */
  phase: 'ready' | 'back';
  /** What the progress log shows was done there since, when anything. */
  done: PracticeSession | null;
  /** The tool is not part of this app yet (and there is no fallback): the task can only be skipped. */
  unavailable?: boolean;
  /** Back from playing along, which the tool did not log: what Continue will log ("... count as practice"). */
  credit?: string | null;
}

/** True when the tool's screen is part of this build of the app (a newer tool may not be yet). */
export function toolAvailable(target: TaskTarget): boolean {
  return !!ROUTE_BY_NAME[TASK_TOOLS[target.tool]?.route ?? ''];
}

/**
 * Decide where a task leads: its own target, or the fallback when its song is not in the library
 * or its tool is not in the app. `unavailable`: neither can be opened (the card then offers only
 * "Skip for now").
 */
export function useTaskTarget(task: TaskStep): ResolvedTaskTarget {
  const song = taskSong(task);
  const [missing, setMissing] = useState<boolean | null>(song ? null : false);
  useEffect(() => {
    if (!song) return;
    let live = true;
    getLibrary()
      .get(song)
      .then((l) => live && setMissing(l === null))
      .catch(() => live && setMissing(true));
    return () => {
      live = false;
    };
  }, [song]);
  return resolveTaskTarget(task, { songAvailable: missing === null ? null : !missing, toolAvailable });
}

/** A task: what to do in which tool and for how long, then (back from it) what was seen. */
export function TaskCard({ teacher, task, state, backLine }: { teacher: TeacherKey; task: TaskStep; state: TaskState; backLine: string }) {
  const { glossary } = useLessonContext();
  const tool = TASK_TOOLS[state.target.tool];
  const body = state.fallback && task.fallback ? task.fallback.body : task.body;
  const title = state.fallback && task.fallback?.title ? task.fallback.title : task.title;
  const done = state.done ? describeActivity(state.done) : null;
  return (
    <article className={cx(styles.card, styles.task)} data-step-kind="card" data-task={task.id} data-task-phase={state.phase} data-task-tool={state.target.tool}>
      <div className={styles.cardHead}>
        <TeacherLine teacher={teacher} />
        <SpeakButton teacher={teacher} text={state.phase === 'back' ? backLine : spokenOf({ title, body, tip: task.tip }, glossary)} />
      </div>
      {state.phase === 'back' ? (
        <div className={styles.back} role="status" aria-live="polite">
          <span className={cx(styles.backIcon, state.done && styles.backDone)} aria-hidden="true">
            <Icon name={state.done ? 'CircleCheck' : 'CornerDownLeft'} size="lg" />
          </span>
          <div className={styles.backText}>
            <Heading level={2} size="xl" display>
              {state.done ? 'Done' : 'Welcome back'}
            </Heading>
            <Text variant="lead">{backLine}</Text>
            {state.done && (
              <Text tone="muted" data-task-done="">
                {state.done.title}
                {done ? `: ${done}` : ''}
              </Text>
            )}
            {!state.done && state.credit && (
              <Text tone="muted" data-task-credit="">
                {state.credit}
              </Text>
            )}
          </div>
        </div>
      ) : null}
      <div className={cx(styles.cardMain, state.phase === 'back' && styles.taskRecap)}>
        <div className={styles.taskMeta}>
          <Tag icon={tool.icon}>{capital(tool.name)}</Tag>
          <Tag icon="Clock">{`About ${task.minutes} min`}</Tag>
        </div>
        <Heading level={state.phase === 'back' ? 3 : 2} size={state.phase === 'back' ? 'lg' : '2xl'} display className={styles.cardTitle}>
          {title}
        </Heading>
        <div className={cx(styles.cardBody, state.phase === 'back' && styles.bodyQuiet)}>
          <RichText text={body} as="p" />
        </div>
      </div>
      {task.tip && state.phase === 'ready' && (
        <Callout tone="tip" label={`${teacherById(teacher).first}'s tip`} className={styles.tip}>
          <RichText text={task.tip} />
        </Callout>
      )}
      {state.phase === 'ready' && !state.unavailable && (
        <Text variant="caption" tone="muted" className={styles.taskNote}>
          <Icon name="Bookmark" size="xs" /> Your place in this lesson is kept. Come back here when you are done.
        </Text>
      )}
      {state.phase === 'ready' && state.unavailable && (
        <Text variant="caption" tone="muted" className={styles.taskNote} data-task-unavailable="">
          <Icon name="Info" size="xs" /> {`${capital(tool.name)} is not in this version of the app yet. Skip this one for now; the rest of the lesson works without it.`}
        </Text>
      )}
    </article>
  );
}

function capital(s: string): string {
  return s.replace(/^the /, '').replace(/^./, (c) => c.toUpperCase());
}

/** The teacher's short reaction above the feedback, read aloud with the explanation on request. */
export function Reaction({ teacher, line, explain }: { teacher: TeacherKey; line: string; explain: string }) {
  return (
    <div className={styles.reaction} data-reaction="">
      <Portrait teacher={teacher} size={2} />
      <p className={styles.reactionLine}>
        <span className={styles.reactionName}>{teacherById(teacher).first}:</span> {line}
      </p>
      <SpeakButton teacher={teacher} text={`${line} ${explain}`} />
    </div>
  );
}

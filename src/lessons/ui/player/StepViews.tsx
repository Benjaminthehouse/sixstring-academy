/**
 * The middle of the player: a teaching card, or an exercise in its frame (what kind of answer,
 * the prompt, an optional hint, the figure, then the answer area). On wide screens a step with a
 * picture puts the prompt and the picture beside the answer.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import { Avatar, Button, Callout, Heading, Icon, IconButton, Tag, Text, cx } from '@/ui';
import { getSpeechState, speak, speechAvailable, stopSpeaking, subscribeSpeech } from '@/core/platform';
import { TEACHERS } from '@/app/teachers';
import type { NoteNaming } from '@/core/theory';
import { promptOf, type Presentation } from '../../grade';
import { speakable } from '../../text';
import type { Answer, CardStep, CourseLevel, CourseTeacher, Exercise } from '../../types';
import { useLessonContext } from '../context';
import { FigureView } from '../figures/figures';
import { RichText } from '../RichText';
import { cardLayout, exerciseLayout } from '../logic/layout';
import { ExerciseBody, ExerciseStimulus, exerciseKindLabel, hasStimulus } from '../exercises/registry';
import type { ExerciseReview, PrimaryAction } from '../exercises/types';
import styles from './Player.module.css';

/** The teacher's avatar and name, when the course has a teacher. */
export function TeacherBadge({ teacher, size = 'sm' }: { teacher: CourseTeacher; size?: 'xs' | 'sm' | 'md' }) {
  const t = TEACHERS.find((x) => x.id === teacher);
  if (!t) return null;
  return (
    <span className={styles.teacher}>
      <Avatar name={t.name} tone={t.tone} size={size} decorative />
      <span className={styles.teacherName}>{t.name}</span>
    </span>
  );
}

/** Read a text aloud with the teacher's voice; hidden where no voice is available. */
function ReadAloud({ text, teacher }: { text: string; teacher: CourseTeacher }) {
  const [available, setAvailable] = useState(false);
  const speech = useSyncExternalStore(subscribeSpeech, getSpeechState, getSpeechState);
  const mine = useRef(false);
  useEffect(() => {
    let live = true;
    void speechAvailable().then((ok) => live && setAvailable(ok));
    return () => {
      live = false;
      if (mine.current) stopSpeaking();
    };
  }, []);
  if (!available) return null;
  const speaking = speech.speaking && mine.current;
  return (
    <IconButton
      icon={speaking ? 'Square' : 'Volume2'}
      label={speaking ? 'Stop reading' : 'Read aloud'}
      variant="ghost"
      data-own-enter=""
      onClick={() => {
        if (speaking) {
          stopSpeaking();
          return;
        }
        mine.current = true;
        void speak(text, { voice: teacher === 'none' ? 'narrator' : teacher });
      }}
    />
  );
}

/** Props of {@link TeachingCard}. */
export interface TeachingCardProps {
  card: CardStep;
  /** Move on (swipe left, the arrow key, or the Continue button outside). */
  onNext?: () => void;
}

/** A teaching card: one idea, its picture, a tip, read-aloud, and a swipe to move on. */
export function TeachingCard({ card, onNext }: TeachingCardProps) {
  const { teacher, glossary } = useLessonContext();
  const layout = cardLayout(card);
  const start = useRef<{ x: number; y: number } | null>(null);
  const spoken = [card.title ? speakable(card.title, { glossary }) : '', speakable(card.body, { glossary }), card.tip ? speakable(card.tip, { glossary }) : ''].filter(Boolean).join('. ');

  const onDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse') return;
    start.current = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e: ReactPointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s || !onNext) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (dx < -70 && Math.abs(dy) < Math.abs(dx) * 0.6) onNext();
  };

  return (
    <article className={cx(styles.card, styles[`layout-${layout}`])} onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => (start.current = null)} data-step-kind="card">
      <div className={styles.cardHead}>
        {teacher !== 'none' ? <TeacherBadge teacher={teacher} /> : <span className={styles.eyebrow}>Learn</span>}
        <ReadAloud text={spoken} teacher={teacher} />
      </div>
      <div className={styles.cardMain}>
        {card.title && (
          // Titles take the same markup as the body ({c:Am7}, {n:F#}); plain text stays plain.
          <Heading level={2} size="2xl" display className={styles.cardTitle}>
            <RichText text={card.title} terms={false} />
          </Heading>
        )}
        <div className={styles.cardBody}>
          <RichText text={card.body} as="p" />
        </div>
      </div>
      {card.figure && (
        <div className={styles.cardFigure}>
          <FigureView figure={card.figure} />
        </div>
      )}
      {card.tip && (
        <Callout tone="tip" label="Tip" className={styles.tip}>
          <RichText text={card.tip} />
        </Callout>
      )}
    </article>
  );
}

/** Props of {@link ExerciseFrame}. */
export interface ExerciseFrameProps {
  exercise: Exercise;
  presentation: Presentation;
  review: ExerciseReview | null;
  attempt: number;
  alternative: boolean;
  /** Why the step is a tap version (the microphone is off here), when it is one. */
  alternativeReason?: string | null;
  onDraft: (answer: Answer | null) => void;
  onSubmit: (answer: Answer) => void;
  setPrimary: (action: PrimaryAction | null) => void;
  onCantPlay?: () => void;
  onMicUnavailable?: () => void;
  /** On a tapping version: go back to playing it into the microphone (shown as a small link under the prompt). */
  onUseMic?: () => void;
  hints: boolean;
  level: CourseLevel;
  naming: NoteNaming | null;
  uid: string;
}

/** An exercise: what kind of answer, the prompt, hint and figure, then the answer area. */
export function ExerciseFrame(props: ExerciseFrameProps) {
  const { exercise, attempt, alternative, alternativeReason, review } = props;
  const [hintOpen, setHintOpen] = useState(false);
  const layout = exerciseLayout(exercise);
  const prompt = promptOf(exercise);
  const figure = exercise.figure;
  const hint = 'hint' in exercise ? exercise.hint : undefined;
  return (
    <section className={cx(styles.exercise, styles[`layout-${layout}`])} data-step-kind="exercise" data-exercise-type={exercise.type} aria-labelledby={`${props.uid}-prompt`}>
      <div className={styles.lead}>
        <div className={styles.eyebrowRow}>
          <span className={styles.eyebrow}>{exerciseKindLabel(exercise)}</span>
          {attempt > 0 && (
            <Tag icon="RotateCcw" className={styles.again}>
              Another go
            </Tag>
          )}
          {alternative && (
            <Tag icon="Hand" className={styles.again}>
              Tapping version
            </Tag>
          )}
        </div>
        <Heading level={2} size="xl" display className={styles.prompt} id={`${props.uid}-prompt`}>
          <RichText text={prompt} />
        </Heading>
        {alternative && (alternativeReason || props.onUseMic) && (
          <div className={styles.altRow}>
            {alternativeReason && (
              <Text variant="caption" tone="muted">
                {alternativeReason}
              </Text>
            )}
            {props.onUseMic && (
              <Button variant="ghost" size="sm" iconLeft="Mic" onClick={props.onUseMic} data-use-mic="" data-own-enter="">
                Play it on my guitar instead
              </Button>
            )}
          </div>
        )}
        {hint && !review && (
          <div className={styles.hint}>
            {hintOpen ? (
              <Callout tone="info" label="Hint" icon="Lightbulb">
                <RichText text={hint} />
              </Callout>
            ) : (
              <Button variant="ghost" iconLeft="Lightbulb" onClick={() => setHintOpen(true)} data-own-enter="">
                Show a hint
              </Button>
            )}
          </div>
        )}
        {hasStimulus(exercise) && <ExerciseStimulus exercise={exercise} />}
        {figure && (
          <div className={styles.promptFigure}>
            <FigureView figure={figure} />
          </div>
        )}
      </div>
      <div className={styles.answer} data-answer="">
        <ExerciseBody {...props} />
      </div>
    </section>
  );
}

/** A small "Paused" veil shown while the leave dialog is open (the clock is stopped). */
export function PausedNote() {
  return (
    <span className={styles.paused}>
      <Icon name="Pause" size="xs" /> Paused
    </span>
  );
}

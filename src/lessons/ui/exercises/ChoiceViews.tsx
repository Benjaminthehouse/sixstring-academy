/**
 * Choice, listen-choice, true/false and flashcards: answers that are picked, not built.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button, PlayButton, Text, cx } from '@/ui';
import type { ReviewGrade } from '@/core/progress';
import type { ChoiceExercise, FlashcardExercise, ListenChoiceExercise, TrueFalseExercise } from '../../types';
import { describeSound } from '../../sound';
import { FigureView } from '../figures/figures';
import { RichText } from '../RichText';
import { useStepKeys } from '../keys';
import { toggleChoice } from '../logic/drafts';
import { digitFor } from '../logic/layout';
import { canPlaySlow } from '../logic/sound';
import { soundPlan } from '../../sound';
import { useSoundPlayer } from '../useSound';
import { KeyHints, OptionButton, optionState } from './parts';
import type { ExerciseViewProps } from './types';
import styles from './Exercises.module.css';

// ── Choice / listen-choice ─────────────────────────────────────────────────────────────────────

function Options({ exercise, presentation, review, onDraft, hints }: ExerciseViewProps<ChoiceExercise | ListenChoiceExercise>) {
  const multiple = exercise.type === 'choice' && exercise.multiple === true;
  const order = presentation.options ?? exercise.options.map((_o, i) => i);
  const given = review?.answer && (review.answer.type === 'choice' || review.answer.type === 'listen-choice') ? review.answer.selected : null;
  const [selected, setSelected] = useState<number[]>(given ?? []);
  const detail = review && (review.result.feedback.detail.type === 'choice' || review.result.feedback.detail.type === 'listen-choice') ? review.result.feedback.detail : null;
  const withFigures = exercise.options.some((o) => o.figure);

  const pick = (index: number) => {
    if (review) return;
    const next = toggleChoice(selected, index, multiple);
    setSelected(next);
    onDraft(next.length > 0 ? { type: exercise.type, selected: next } : null);
  };

  useStepKeys(
    {
      digit: (p) => {
        if (p >= order.length) return false;
        pick(order[p]);
        return true;
      },
    },
    !review,
  );

  return (
    <div className={styles.answerArea}>
      {multiple && !review && (
        <Text variant="caption" tone="muted">
          Choose every answer that fits.
        </Text>
      )}
      <div className={cx(styles.options, withFigures && styles.optionsGrid)} role={multiple ? 'group' : undefined}>
        {order.map((index, position) => {
          const option = exercise.options[index];
          return (
            <OptionButton
              key={index}
              state={optionState(index, selected, detail ? { correct: detail.correct, selected: detail.selected } : null)}
              hint={hints && !review ? digitFor(position) : null}
              multiple={multiple}
              stacked={!!option.figure}
              disabled={!!review}
              onClick={() => pick(index)}
              data-option={index}
            >
              {option.figure && <FigureView figure={option.figure} size="sm" />}
              {option.text !== undefined ? <RichText text={option.text} /> : !option.figure ? `Option ${index + 1}` : null}
            </OptionButton>
          );
        })}
      </div>
      <KeyHints show={hints && !review}>Press a number to choose, Enter to check.</KeyHints>
    </div>
  );
}

/** A choice question. */
export function ChoiceView(props: ExerciseViewProps<ChoiceExercise>) {
  return <Options {...props} />;
}

/** Hear a sound, then choose what it was. A big play button, replay with Space, and a slow version. */
export function ListenChoiceView(props: ExerciseViewProps<ListenChoiceExercise>) {
  const { exercise, review, hints } = props;
  const player = useSoundPlayer();
  const plan = useMemo(() => soundPlan(exercise.sound), [exercise.sound]);
  const slow = canPlaySlow(plan);
  const [heard, setHeard] = useState(false);
  const play = (speed: 'normal' | 'slow' = 'normal') => {
    setHeard(true);
    player.play(plan, speed);
  };
  useStepKeys({
    space: () => {
      play('normal');
      return true;
    },
  });
  return (
    <div className={styles.listen}>
      <div className={styles.listenControls}>
        <PlayButton size="xl" playing={player.playing === 'normal'} label={player.playing ? 'Playing' : heard ? 'Play again' : 'Play the sound'} onClick={() => play('normal')} data-listen="" />
        <div className={styles.listenSide}>
          <Text weight="semibold">{heard ? 'Play it again as often as you like.' : 'Tap to hear it.'}</Text>
          <Text variant="caption" tone="muted">
            {review ? describeSound(exercise.sound) : hints ? 'Space plays it again.' : 'Listen first, then choose.'}
          </Text>
          {slow && (
            <Button variant="ghost" iconLeft="Turtle" pressed={player.playing === 'slow'} onClick={() => play('slow')} className={styles.slowButton}>
              Slower
            </Button>
          )}
        </div>
      </div>
      <Options {...props} />
    </div>
  );
}

// ── True / false ───────────────────────────────────────────────────────────────────────────────

/** Judge a statement: two big buttons, T / F or 1 / 2 on the keyboard. */
export function TrueFalseView({ exercise, review, onDraft, hints }: ExerciseViewProps<TrueFalseExercise>) {
  const given = review?.answer?.type === 'true-false' ? review.answer.value : null;
  const [value, setValue] = useState<boolean | null>(given);
  const pick = (v: boolean) => {
    if (review) return;
    setValue(v);
    onDraft({ type: 'true-false', value: v });
  };
  useStepKeys(
    {
      digit: (p) => (p === 0 ? (pick(true), true) : p === 1 ? (pick(false), true) : false),
      char: (k) => (k.toLowerCase() === 't' ? (pick(true), true) : k.toLowerCase() === 'f' ? (pick(false), true) : false),
    },
    !review,
  );
  const state = (v: boolean) => {
    if (!review) return value === v ? 'selected' : 'idle';
    if (value === v) return v === exercise.answer ? 'right' : 'wrong';
    return v === exercise.answer ? 'missed' : 'dimmed';
  };
  return (
    <div className={styles.answerArea}>
      <blockquote className={styles.statement}>
        <RichText text={exercise.statement} />
      </blockquote>
      <div className={styles.twoUp}>
        <OptionButton state={state(true)} hint={hints && !review ? 'T' : null} onClick={() => pick(true)} disabled={!!review} data-option="true" className={styles.tfButton}>
          True
        </OptionButton>
        <OptionButton state={state(false)} hint={hints && !review ? 'F' : null} onClick={() => pick(false)} disabled={!!review} data-option="false" className={styles.tfButton}>
          False
        </OptionButton>
      </div>
    </div>
  );
}

// ── Flashcard ──────────────────────────────────────────────────────────────────────────────────

const RATINGS: Array<{ grade: ReviewGrade; label: string; hint: string }> = [
  { grade: 'again', label: 'Again', hint: 'I did not know it' },
  { grade: 'hard', label: 'Hard', hint: 'With effort' },
  { grade: 'good', label: 'Good', hint: 'I knew it' },
  { grade: 'easy', label: 'Easy', hint: 'Instantly' },
];

/** Recall, reveal, rate yourself. Space reveals; 1–4 rate. */
export function FlashcardView({ exercise, review, onSubmit, hints, setPrimary }: ExerciseViewProps<FlashcardExercise>) {
  const [shown, setShown] = useState(!!review);
  useEffect(() => {
    if (review) setShown(true);
  }, [review]);
  // "Show the answer" is the primary button until the card is turned; then the ratings answer.
  useEffect(() => {
    if (!shown && !review) setPrimary({ label: 'Show the answer', icon: 'Eye', onClick: () => setShown(true) });
    else setPrimary(null);
  }, [shown, review, setPrimary]);
  useStepKeys(
    {
      space: () => (shown ? false : (setShown(true), true)),
      digit: (p) => (shown && p < RATINGS.length ? (onSubmit({ type: 'flashcard', rating: RATINGS[p].grade }), true) : false),
    },
    !review,
  );
  return (
    <div className={styles.answerArea}>
      {!shown ? (
        <div className={styles.flashHidden}>
          <Text tone="muted">Say the answer to yourself, then turn the card.</Text>
          <Button variant="secondary" iconLeft="Eye" onClick={() => setShown(true)} data-reveal="" data-own-enter="">
            Turn the card
          </Button>
          {hints && <p className={styles.keyHints}>Space or Enter turns the card; then 1 to 4 rate it.</p>}
        </div>
      ) : (
        <div className={styles.flashBack} aria-live="polite">
          <Text variant="lead" as="div">
            <RichText text={exercise.back} />
          </Text>
          {exercise.backFigure && <FigureView figure={exercise.backFigure} />}
          {!review && (
            <>
              <Text variant="caption" tone="muted">
                How well did you know it?
              </Text>
              <div className={styles.ratings}>
                {RATINGS.map((r, i) => (
                  <button key={r.grade} type="button" className={cx(styles.rating, styles[`rating-${r.grade}`])} onClick={() => onSubmit({ type: 'flashcard', rating: r.grade })} data-rating={r.grade}>
                    {hints && <span className={styles.ratingKey}>{i + 1}</span>}
                    <span className={styles.ratingLabel}>{r.label}</span>
                    <span className={styles.ratingHint}>{r.hint}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

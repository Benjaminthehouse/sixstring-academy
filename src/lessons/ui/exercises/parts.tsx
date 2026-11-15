/**
 * Small shared pieces of the exercise renderers: the answer option (a big, thumb-sized button
 * with an optional number-key hint and a right/wrong mark after grading) and the verdict mark.
 */
import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, Kbd, cx } from '@/ui';
import styles from './Exercises.module.css';

/** How an option looks: as the learner picks, then after grading. */
export type OptionState = 'idle' | 'selected' | 'right' | 'wrong' | 'missed' | 'dimmed';

/** Props of {@link OptionButton}. */
export interface OptionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  state: OptionState;
  /** The number key that picks it, shown on desktop. */
  hint?: string | null;
  /** Checkbox look for "choose all that apply". */
  multiple?: boolean;
  /** Content laid out as a column (an option with a figure). */
  stacked?: boolean;
  children: ReactNode;
}

/** A tappable answer option. */
export function OptionButton({ state, hint, multiple, stacked, className, children, disabled, ...rest }: OptionButtonProps) {
  const pressed = state === 'selected' || state === 'right' || state === 'wrong';
  return (
    <button
      type="button"
      className={cx(styles.option, styles[`option-${state}`], stacked && styles.optionStacked, className)}
      aria-pressed={multiple ? undefined : pressed}
      role={multiple ? 'checkbox' : undefined}
      aria-checked={multiple ? pressed : undefined}
      disabled={disabled}
      data-state={state}
      {...rest}
    >
      {hint && <Kbd className={styles.optionKey}>{hint}</Kbd>}
      <span className={styles.optionBody}>{children}</span>
      <Mark state={state} multiple={multiple} />
    </button>
  );
}

/** The mark at the end of an option: a tick, a cross, or the empty box of a checkbox. */
export function Mark({ state, multiple }: { state: OptionState; multiple?: boolean }) {
  if (state === 'right') return <Icon name="CircleCheck" className={styles.markRight} label="Right" />;
  if (state === 'wrong') return <Icon name="CircleX" className={styles.markWrong} label="Wrong" />;
  if (state === 'missed') return <Icon name="CircleCheck" className={styles.markMissed} label="The right answer" />;
  if (multiple) return <span className={cx(styles.box, state === 'selected' && styles.boxOn)} aria-hidden="true">{state === 'selected' && <Icon name="Check" size="xs" />}</span>;
  return null;
}

/** A row of key hints under an answer area ("Number keys pick, Enter checks"), desktop only. */
export function KeyHints({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return null;
  return <p className={styles.keyHints}>{children}</p>;
}

/** The state of an option at display time, from the draft or the graded detail. */
export function optionState(index: number, selected: readonly number[], review: { correct: number[]; selected: number[] } | null): OptionState {
  if (!review) return selected.includes(index) ? 'selected' : 'idle';
  const isRight = review.correct.includes(index);
  const picked = review.selected.includes(index);
  if (picked) return isRight ? 'right' : 'wrong';
  return isRight ? 'missed' : 'dimmed';
}

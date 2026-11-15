import type { CSSProperties } from 'react';
import { Icon, cx } from '@/ui';
import type { OptionInfo } from '../core/types';
import styles from './Ear.module.css';

/** The keys that pick answers 1 to 12. */
export const ANSWER_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='] as const;

/** Props of {@link AnswerPad}. */
export interface AnswerPadProps {
  options: readonly OptionInfo[];
  onAnswer: (id: string) => void;
  /** After an answer: what was chosen and what was right. */
  result: { chosen: string; answer: string } | null;
  /** Show memory-aid tunes under the labels. */
  aids: boolean;
  /** Option currently playing (comparison after a wrong answer). */
  playing?: string | null;
  disabled?: boolean;
}

/** Columns for a number of answers: big buttons when there are few, a tidy grid when there are many. */
function layout(n: number, longest: number): { cols: number; height: string; size: string } {
  if (longest > 11) return { cols: n > 4 ? 2 : Math.min(2, n), height: n > 4 ? '3.5rem' : '4.5rem', size: 'var(--text-lg)' };
  if (n <= 2) return { cols: 2, height: '6.5rem', size: 'var(--text-2xl)' };
  if (n === 3) return { cols: 3, height: '5.5rem', size: 'var(--text-xl)' };
  if (n === 4) return { cols: 2, height: '4.75rem', size: 'var(--text-xl)' };
  if (n <= 6) return { cols: 3, height: '4.25rem', size: 'var(--text-xl)' };
  if (n <= 9) return { cols: 3, height: '3.75rem', size: 'var(--text-lg)' };
  return { cols: 3, height: '3.5rem', size: 'var(--text-lg)' };
}

/** The answer buttons: thumb-sized, numbered for the keyboard, marked right and wrong after an answer. */
export function AnswerPad({ options, onAnswer, result, aids, playing, disabled }: AnswerPadProps) {
  const longest = Math.max(...options.map((o) => o.label.length));
  const { cols, height, size } = layout(options.length, longest);
  const style = { '--cols': cols, '--answer-h': height, '--answer-size': size } as CSSProperties;
  return (
    <div className={styles.pad} style={style} role="group" aria-label="Answers" data-ear-pad data-cols={cols}>
      {options.map((o, i) => {
        const right = result && o.id === result.answer;
        const wrong = result && o.id === result.chosen && result.chosen !== result.answer;
        const key = ANSWER_KEYS[i];
        return (
          <button
            key={o.id}
            type="button"
            className={cx(styles.answer, right && styles.answerRight, wrong && styles.answerWrong, result && !right && !wrong && styles.answerDim, playing === o.id && styles.answerPlaying)}
            onClick={() => onAnswer(o.id)}
            disabled={disabled || !!result}
            aria-keyshortcuts={key}
            aria-label={`${o.label}${o.detail && o.detail !== o.label ? `, ${o.detail}` : ''}${right ? ', the right answer' : wrong ? ', your answer, not right' : ''}`}
            data-ear-answer={o.id}
          >
            {key && <span className={styles.kbd} aria-hidden="true">{key}</span>}
            {(right || wrong) && (
              <span className={styles.mark} aria-hidden="true">
                <Icon name={right ? 'Check' : 'X'} size={14} strokeWidth={3} />
              </span>
            )}
            <span className={styles.answerLabel}>
              {o.icon && <Icon name={o.icon} size={20} strokeWidth={2.25} />}
              {o.label}
            </span>
            {o.detail && o.detail !== o.label && <span className={styles.answerDetail}>{o.detail}</span>}
            {aids && o.aid && <span className={styles.answerAid}>{o.aid}</span>}
          </button>
        );
      })}
    </div>
  );
}

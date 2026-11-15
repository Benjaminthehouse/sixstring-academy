/**
 * Lesson text on screen: the rich-text markup of the lesson engine rendered as React elements,
 * never as HTML. Notes, chords and keys follow the learner's naming (letters, solfège, German);
 * glossary terms are tappable for their one-line definition.
 */
import { forwardRef, useMemo, type ButtonHTMLAttributes, type ElementType, type ReactNode } from 'react';
import { Popover, cx } from '@/ui';
import { useMusicSettings } from '@/ui/music';
import { formatToken, tokenize, type TextToken } from '../text';
import type { RichText as RichTextValue } from '../types';
import { useLessonContext } from './context';
import styles from './RichText.module.css';

/** Props of {@link RichText}. */
export interface RichTextProps {
  /** The text, in the lesson markup. */
  text: RichTextValue | null | undefined;
  /** Element to render (default `span`). */
  as?: ElementType;
  /** Draws a blank of a fill-blanks text (default: a short line). */
  renderBlank?: (index: number) => ReactNode;
  /** Glossary terms open a definition (default true); false renders them as plain words. */
  terms?: boolean;
  className?: string;
  id?: string;
}

const TermButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function TermButton({ className, ...rest }, ref) {
  return <button ref={ref} type="button" className={cx(styles.term, className)} {...rest} />;
});

function Term({ token, children }: { token: Extract<TextToken, { type: 'term' }>; children: ReactNode }) {
  const { glossary } = useLessonContext();
  const entry = token.known ? glossary(token.id) : null;
  if (!entry) return <>{children}</>;
  return (
    <Popover aria-label={`What "${entry.term}" means`} trigger={<TermButton aria-haspopup="dialog" data-term="">{children}</TermButton>} placement="bottom">
      <span className={styles.definition}>
        <strong className={styles.defTerm}>{entry.term}</strong> {entry.definition}
      </span>
    </Popover>
  );
}

function wrap(token: TextToken, node: ReactNode): ReactNode {
  if (token.type === 'break' || token.type === 'blank') return node;
  let out = node;
  if (token.em) out = <em>{out}</em>;
  if (token.bold) out = <strong>{out}</strong>;
  return out;
}

/** Lesson markup as text. */
export function RichText({ text, as: Tag = 'span', renderBlank, terms = true, className, id }: RichTextProps) {
  const { glossary } = useLessonContext();
  const { naming } = useMusicSettings();
  const tokens = useMemo(() => (text === null || text === undefined ? [] : tokenize(text, { glossary })), [text, glossary]);
  const nodes = tokens.map((token, i) => {
    switch (token.type) {
      case 'break':
        return <br key={i} />;
      case 'blank':
        return <span key={i}>{renderBlank ? renderBlank(token.index) : <span className={styles.blank} aria-label="blank" />}</span>;
      case 'text':
        return <span key={i}>{wrap(token, token.text)}</span>;
      case 'term':
        return <span key={i}>{wrap(token, terms ? <Term token={token}>{token.text}</Term> : token.text)}</span>;
      default:
        return (
          <span key={i} className={styles.symbol} data-symbol={token.type}>
            {wrap(token, formatToken(token, { system: naming }))}
          </span>
        );
    }
  });
  return (
    <Tag className={cx(styles.root, className)} id={id}>
      {nodes}
    </Tag>
  );
}

/** The visible words of a text in the learner's naming, for labels and accessible names. */
export function usePlainText(text: RichTextValue | null | undefined): string {
  const { glossary } = useLessonContext();
  const { naming } = useMusicSettings();
  return useMemo(
    () => (text === null || text === undefined ? '' : tokenize(text, { glossary }).map((t) => formatToken(t, { system: naming })).join('')),
    [text, glossary, naming],
  );
}

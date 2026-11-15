import type { CSSProperties, ReactNode } from 'react';
import { formatNote, midiToNote } from '@/core/theory';
import { Button, Icon, VisuallyHidden, cx, useIsMobile } from '@/ui';
import type { SequenceQuestion } from '../core/types';
import { ANSWER_KEYS } from './AnswerPad';
import styles from './Ear.module.css';

/** Props of {@link NoteSlots}. */
export interface NoteSlotsProps {
  question: SequenceQuestion;
  entered: readonly string[];
  /** Per note, after checking: right or wrong. */
  marks: readonly boolean[] | null;
}

function slotText(q: SequenceQuestion, id: string | undefined): string {
  if (!id) return '';
  const key = q.keys.find((k) => k.id === id);
  if (key) return key.label;
  // A note heard on the guitar that is not in the row.
  const midi = Number(id.replace('heard-', ''));
  return Number.isFinite(midi) ? formatNote(midiToNote(midi), { octave: false }) : '?';
}

/** The melody so far: one slot per note, the given first note filled in. */
export function NoteSlots({ question: q, entered, marks }: NoteSlotsProps) {
  const nextIndex = entered.length;
  return (
    <div className={styles.slots} aria-label="Your melody" role="list" data-ear-slots>
      {q.target.map((id, i) => {
        const given = i < q.given;
        const value = entered[i];
        const mark = marks ? marks[i] : null;
        return (
          <span
            key={i}
            role="listitem"
            className={cx(styles.slot, given && styles.slotGiven, !given && value && styles.slotFilled, !marks && i === nextIndex && styles.slotNext, mark === true && !given && styles.slotRight, mark === false && styles.slotWrong)}
            aria-label={`Note ${i + 1}: ${value ? slotText(q, value) : 'empty'}${given ? ', given' : mark === true ? ', right' : mark === false ? `, wrong, it was ${q.keys.find((k) => k.id === id)?.label}` : ''}`}
          >
            {slotText(q, value)}
            {mark === false && !given && (
              <span className={styles.slotFix} aria-hidden="true">
                {q.keys.find((k) => k.id === id)?.label}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

/** Props of {@link NoteRow}. */
export interface NoteRowProps {
  question: SequenceQuestion;
  onTap: (id: string) => void;
  onUndo: () => void;
  canUndo: boolean;
  disabled: boolean;
  showNames: boolean;
  /** Microphone control ("Play it on my guitar"), when offered. */
  mic?: ReactNode;
}

/** The note row: the key's notes low to high, each one plays when tapped. */
export function NoteRow({ question: q, onTap, onUndo, canUndo, disabled, showNames, mic }: NoteRowProps) {
  const mobile = useIsMobile();
  // On a phone a long row folds into two, so every key stays thumb-sized.
  const cols = mobile && q.keys.length > 6 ? Math.ceil(q.keys.length / 2) : q.keys.length;
  const style = { '--keys': cols } as CSSProperties;
  return (
    <div className={styles.rowWrap} data-ear-row>
      <div className={styles.row} style={style} role="group" aria-label="Note row: tap the notes of the melody in order">
        {q.keys.map((k, i) => (
          <button
            key={k.id}
            type="button"
            className={styles.key}
            onClick={() => onTap(k.id)}
            disabled={disabled}
            aria-keyshortcuts={ANSWER_KEYS[i]}
            data-ear-key={k.id}
          >
            <span className={styles.keyDeg}>{k.label}</span>
            <span className={styles.keySub}>{showNames ? formatNote(midiToNote(k.midi), { octave: false }) : k.sub}</span>
            <VisuallyHidden>{showNames ? k.sub : ''}</VisuallyHidden>
          </button>
        ))}
      </div>
      <div className={styles.rowTools}>
        <Button size="sm" variant="ghost" iconLeft="Undo2" onClick={onUndo} disabled={!canUndo || disabled} aria-keyshortcuts="Backspace">
          Undo
        </Button>
        {mic}
        <span className={styles.muted} aria-hidden="true">
          <Icon name="Music" size="xs" /> {q.target.length} notes
        </span>
      </div>
    </div>
  );
}

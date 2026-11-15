/**
 * Typed answers: a note keypad (seven letters and the sharp and flat signs), a number pad, or a
 * text field, picked by the kind of answer. Also the shared "buttons or keypad" answer used by
 * the fretboard-name, staff-read and missing-note exercises.
 */
import { useId, useState } from 'react';
import { Icon, Kbd, Text, TextField, cx } from '@/ui';
import { formatNote, type NoteNaming } from '@/core/theory';
import { degreeText, intervalText, noteText } from '@/ui/music';
import { specValue } from '../../answers';
import type { Answer, AnswerSpec, TypeAnswerExercise } from '../../types';
import { useStepKeys } from '../keys';
import { digitFor } from '../logic/layout';
import {
  EMPTY_KEYPAD, KEYPAD_LETTERS, inputKind, keypadBackspace, keypadKey, keypadValue, noteAnswerText, pressAccidental, pressDigit, pressLetter, typingHint,
  type KeypadNote,
} from '../logic/keypad';
import { KeyHints, OptionButton } from './parts';
import type { ExerciseViewProps } from './types';
import styles from './Exercises.module.css';

/** Verdict styling of a typed answer after grading. */
function verdictClass(review: ExerciseViewProps['review']): string | undefined {
  if (!review) return undefined;
  return review.result.correct ? styles.typedRight : styles.typedWrong;
}

// ── Note keypad ────────────────────────────────────────────────────────────────────────────────

/** Props of {@link NoteKeypad}. */
export interface NoteKeypadProps {
  value: KeypadNote;
  onChange: (value: KeypadNote) => void;
  naming: NoteNaming | null;
  disabled?: boolean;
  hints?: boolean;
  /** Text shown in the display after grading (overrides the value). */
  verdict?: 'right' | 'wrong' | null;
}

/** Seven letters, sharp, flat and delete; the composed note shows above it. */
export function NoteKeypad({ value, onChange, naming, disabled, hints, verdict }: NoteKeypadProps) {
  const shown = keypadValue(value);
  const label = shown ? formatNote(shown, { system: naming ?? 'letters' }) : '';
  return (
    <div className={styles.keypad}>
      <output className={cx(styles.display, verdict === 'right' && styles.typedRight, verdict === 'wrong' && styles.typedWrong)} aria-live="polite" aria-label={label ? `Your answer: ${label}` : 'No answer yet'}>
        {label || <span className={styles.displayEmpty}>?</span>}
      </output>
      <div className={styles.letterRow} role="group" aria-label="Note letters">
        {KEYPAD_LETTERS.map((l) => (
          <button key={l} type="button" className={cx(styles.key, value.letter === l && styles.keyOn)} onClick={() => onChange(pressLetter(value, l))} disabled={disabled} aria-pressed={value.letter === l} data-key={l}>
            {noteText(l, naming ?? 'letters')}
          </button>
        ))}
      </div>
      <div className={styles.accidentalRow} role="group" aria-label="Sharp or flat">
        <button type="button" className={cx(styles.key, styles.keyWide, value.accidental === '#' && styles.keyOn)} onClick={() => onChange(pressAccidental(value, '#'))} disabled={disabled} aria-pressed={value.accidental === '#'} aria-label="Sharp" data-key="#">
          ♯{hints && <Kbd className={styles.keyHint}>#</Kbd>}
        </button>
        <button type="button" className={cx(styles.key, styles.keyWide, value.accidental === 'b' && styles.keyOn)} onClick={() => onChange(pressAccidental(value, 'b'))} disabled={disabled} aria-pressed={value.accidental === 'b'} aria-label="Flat" data-key="b">
          ♭{hints && <Kbd className={styles.keyHint}>-</Kbd>}
        </button>
        <button type="button" className={cx(styles.key, styles.keyWide)} onClick={() => onChange(keypadBackspace(value))} disabled={disabled || !value.letter} aria-label="Delete" data-key="del">
          <Icon name="Undo2" size="sm" />
        </button>
      </div>
      <KeyHints show={!!hints && !disabled}>Type a letter A–G, # for sharp, - for flat, Enter to check.</KeyHints>
    </div>
  );
}

/** The keypad's keys on a physical keyboard. */
function useKeypadKeys(value: KeypadNote, onChange: (v: KeypadNote) => void, active: boolean) {
  useStepKeys(
    {
      char: (key) => {
        const k = keypadKey(key);
        if (!k) return false;
        onChange('letter' in k ? pressLetter(value, k.letter) : pressAccidental(value, k.accidental));
        return true;
      },
      backspace: () => (value.letter ? (onChange(keypadBackspace(value)), true) : false),
    },
    active,
  );
}

// ── Number pad ─────────────────────────────────────────────────────────────────────────────────

function NumberPad({ value, onChange, disabled, verdict }: { value: string; onChange: (v: string) => void; disabled?: boolean; verdict?: 'right' | 'wrong' | null }) {
  return (
    <div className={styles.keypad}>
      <output className={cx(styles.display, verdict === 'right' && styles.typedRight, verdict === 'wrong' && styles.typedWrong)} aria-live="polite">
        {value || <span className={styles.displayEmpty}>?</span>}
      </output>
      <div className={styles.numberGrid} role="group" aria-label="Digits">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <button key={d} type="button" className={styles.key} onClick={() => onChange(pressDigit(value, d))} disabled={disabled} data-key={d}>
            {d}
          </button>
        ))}
        <button type="button" className={styles.key} onClick={() => onChange(value.slice(0, -1))} disabled={disabled || !value} aria-label="Delete" data-key="del">
          <Icon name="Undo2" size="sm" />
        </button>
        <button type="button" className={styles.key} onClick={() => onChange(pressDigit(value, 0))} disabled={disabled} data-key={0}>
          0
        </button>
        <span />
      </div>
    </div>
  );
}

// ── Type answer ────────────────────────────────────────────────────────────────────────────────

function keypadFromText(text: string): KeypadNote {
  const m = /^([A-G])([#b]?)/.exec(text);
  return m ? { letter: m[1] as KeypadNote['letter'], accidental: (m[2] || '') as KeypadNote['accidental'] } : EMPTY_KEYPAD;
}

/** Type the answer: a keypad for notes and numbers, a text field for anything else. */
export function TypeAnswerView({ exercise, review, onDraft, hints, naming }: ExerciseViewProps<TypeAnswerExercise>) {
  const kind = inputKind(exercise.answer, exercise.input);
  const given = review?.answer?.type === 'type-answer' ? review.answer.text : '';
  const [note, setNote] = useState<KeypadNote>(() => (kind === 'note' ? keypadFromText(given) : EMPTY_KEYPAD));
  const [text, setText] = useState(given);
  const id = useId();
  const verdict = review ? (review.result.correct ? 'right' : 'wrong') : null;

  const setKeypad = (v: KeypadNote) => {
    setNote(v);
    const value = keypadValue(v);
    onDraft(value ? { type: 'type-answer', text: noteAnswerText(value, naming) } : null);
  };
  const setTyped = (v: string) => {
    setText(v);
    onDraft(v.trim() ? { type: 'type-answer', text: v } : null);
  };

  useKeypadKeys(note, setKeypad, kind === 'note' && !review);
  useStepKeys(
    {
      digit: (p) => (kind === 'number' ? (setTyped(pressDigit(text, p + 1)), true) : false),
      char: (k) => (kind === 'number' && k === '0' ? (setTyped(pressDigit(text, 0)), true) : false),
      backspace: () => (kind === 'number' && text ? (setTyped(text.slice(0, -1)), true) : false),
    },
    kind === 'number' && !review,
  );

  if (kind === 'note') return <NoteKeypad value={note} onChange={setKeypad} naming={naming} disabled={!!review} hints={hints} verdict={verdict} />;
  if (kind === 'number') return <NumberPad value={text} onChange={setTyped} disabled={!!review} verdict={verdict} />;
  return (
    <div className={cx(styles.answerArea, styles.typedField, verdictClass(review))}>
      <TextField
        id={id}
        label="Your answer"
        value={text}
        onChange={setTyped}
        disabled={!!review}
        placeholder={typingHint(exercise.answer)}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        size="lg"
        data-autofocus=""
        hint={hints && !review ? 'Press Enter to check.' : undefined}
        data-typed=""
      />
    </div>
  );
}

// ── Buttons or keypad ──────────────────────────────────────────────────────────────────────────

/** How a plain answer value shows on a button: notes in the learner's naming, intervals and degrees typeset. */
export function valueLabel(value: string, kind: AnswerSpec['kind'] | 'note', naming: NoteNaming | null): string {
  try {
    if (kind === 'note') return formatNote(value, { system: naming ?? 'letters' });
    if (kind === 'interval') return intervalText(value);
    if (kind === 'degree') return degreeText(value);
  } catch {
    /* fall through */
  }
  return value;
}

/** Props of {@link AnswerButtons}. */
export interface AnswerButtonsProps {
  /** Values to offer, in display order; without them a note keypad is shown. */
  buttons: readonly string[] | undefined;
  kind: AnswerSpec['kind'] | 'note';
  /** The answer type to build. */
  type: 'fretboard-name' | 'staff-read' | 'chord-build';
  review: ExerciseViewProps['review'];
  onDraft: (answer: Answer | null) => void;
  hints: boolean;
  naming: NoteNaming | null;
  /** The right value, to mark it after a wrong pick. */
  expected?: string | null;
}

/** A row of answer buttons (or the note keypad when the exercise offers none). */
export function AnswerButtons({ buttons, kind, type, review, onDraft, hints, naming, expected }: AnswerButtonsProps) {
  const given = review?.answer && 'text' in review.answer ? (review.answer.text ?? '') : '';
  const [picked, setPicked] = useState<string | null>(() => (buttons?.find((b) => noteAnswerText(b, naming) === given || b === given) ?? null));
  const [note, setNote] = useState<KeypadNote>(() => keypadFromText(given));
  const build = (text: string): Answer => (type === 'chord-build' ? { type, text } : { type, text });
  const send = (value: string) => onDraft(value ? build(kind === 'note' ? noteAnswerText(value, naming) : value) : null);

  const pick = (value: string) => {
    if (review) return;
    setPicked(value);
    send(value);
  };
  useStepKeys({ digit: (p) => (buttons && p < buttons.length ? (pick(buttons[p]), true) : false) }, !review && !!buttons);
  const setKeypad = (v: KeypadNote) => {
    setNote(v);
    send(keypadValue(v));
  };
  useKeypadKeys(note, setKeypad, !review && !buttons && kind === 'note');

  if (!buttons) {
    return <NoteKeypad value={note} onChange={setKeypad} naming={naming} disabled={!!review} hints={hints} verdict={review ? (review.result.correct ? 'right' : 'wrong') : null} />;
  }
  return (
    <div className={styles.answerArea}>
      <div className={styles.buttonGrid}>
        {buttons.map((value, position) => {
          const isPicked = picked === value;
          const isExpected = expected !== undefined && expected !== null && value === expected;
          const state = !review ? (isPicked ? 'selected' : 'idle') : isPicked ? (review.result.correct ? 'right' : 'wrong') : isExpected && !review.result.correct ? 'missed' : 'dimmed';
          return (
            <OptionButton key={value} state={state} hint={hints && !review ? digitFor(position) : null} onClick={() => pick(value)} disabled={!!review} className={styles.valueButton} data-value={value}>
              <span className={styles.valueText}>{valueLabel(value, kind, naming)}</span>
            </OptionButton>
          );
        })}
      </div>
      <KeyHints show={hints && !review}>Press a number to choose, Enter to check.</KeyHints>
    </div>
  );
}

/** The canonical expected value of a spec, for marking the right button. */
export function expectedValue(spec: AnswerSpec | null): string | null {
  return spec ? specValue(spec) : null;
}

/** Placeholder note for screens with nothing typed yet. */
export function EmptyAnswer() {
  return (
    <Text tone="muted" variant="caption">
      Nothing entered yet.
    </Text>
  );
}

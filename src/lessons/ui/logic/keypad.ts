/**
 * The note keypad and note-valued buttons. A learner composes a note from a letter and an
 * accidental; what is sent to the grader must read the same in their naming system (in German
 * naming a bare "B" is B flat, so B natural is sent as "H").
 */
import type { NoteNaming } from '@/core/theory';
import type { AnswerSpec } from '../../types';

/** The seven letters in keypad order. */
export const KEYPAD_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

/** A keypad letter. */
export type KeypadLetter = (typeof KEYPAD_LETTERS)[number];

/** Accidentals the keypad offers, as ASCII. */
export type KeypadAccidental = '' | '#' | 'b';

/** A note being composed on the keypad. */
export interface KeypadNote {
  letter: KeypadLetter | null;
  accidental: KeypadAccidental;
}

/** Nothing typed yet. */
export const EMPTY_KEYPAD: KeypadNote = { letter: null, accidental: '' };

/** Press a letter: it replaces the letter and keeps the accidental. */
export function pressLetter(note: KeypadNote, letter: KeypadLetter): KeypadNote {
  return { ...note, letter };
}

/** Press an accidental: pressing the one already set removes it. */
export function pressAccidental(note: KeypadNote, accidental: '#' | 'b'): KeypadNote {
  return { ...note, accidental: note.accidental === accidental ? '' : accidental };
}

/** Backspace: first the accidental goes, then the letter. */
export function keypadBackspace(note: KeypadNote): KeypadNote {
  if (note.accidental) return { ...note, accidental: '' };
  return EMPTY_KEYPAD;
}

/** The ASCII note (`F#`), or '' when no letter is chosen. */
export function keypadValue(note: KeypadNote): string {
  return note.letter ? `${note.letter}${note.accidental}` : '';
}

/**
 * The text to send for an ASCII note name so the grader reads it right in the learner's naming:
 * the same text, except that German naming needs `H` for B natural (a bare `B` means B flat).
 */
export function noteAnswerText(note: string, naming: NoteNaming | null | undefined): string {
  if (naming !== 'german') return note;
  const m = /^B(#{0,2}|x)?(-?\d+)?$/.exec(note);
  return m ? `H${m[1] ?? ''}${m[2] ?? ''}` : note;
}

/** The key on a physical keyboard that types a keypad letter or accidental, or null. */
export function keypadKey(key: string): { letter: KeypadLetter } | { accidental: '#' | 'b' } | null {
  if (key === '#' || key === '+') return { accidental: '#' };
  if (key === '-' || key === '_') return { accidental: 'b' };
  const upper = key.length === 1 ? key.toUpperCase() : '';
  return (KEYPAD_LETTERS as readonly string[]).includes(upper) ? { letter: upper as KeypadLetter } : null;
}

/** What kind of input a type-answer spec gets: the note keypad, a number pad, or a text field. */
export function inputKind(spec: AnswerSpec, input?: 'keypad' | 'keyboard'): 'note' | 'number' | 'text' {
  if (spec.kind === 'note') return input === 'keyboard' ? 'text' : 'note';
  if (spec.kind === 'number') return input === 'keyboard' ? 'text' : 'number';
  return 'text';
}

/** Press a digit on the number pad (at most three digits; a leading zero is replaced). */
export function pressDigit(text: string, digit: number): string {
  if (!Number.isInteger(digit) || digit < 0 || digit > 9) return text;
  if (text === '0') return String(digit);
  return text.length >= 3 ? text : `${text}${digit}`;
}

/** Placeholder words for a typed answer, so the learner knows what form is expected. */
export function typingHint(spec: AnswerSpec): string {
  switch (spec.kind) {
    case 'interval':
      return 'For example m3 or minor third';
    case 'chord':
      return 'For example Am7';
    case 'degree':
      return 'For example b3 or flat 3';
    case 'roman':
      return 'For example IV or vi';
    case 'number':
      return 'A number';
    case 'note':
      return 'For example F# or Bb';
    default:
      return 'Type your answer';
  }
}

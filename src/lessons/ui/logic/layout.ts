/**
 * How a step uses the screen. On a phone everything is one column; on a wide screen a step with
 * a picture puts the prompt and the picture beside the answer ("split"), an instrument exercise
 * gets the full width ("wide"), and a plain question stays a comfortable reading column.
 */
import type { CardStep, Exercise } from '../../types';

/** The arrangement of a step on a wide screen. */
export type StepLayout = 'split' | 'wide' | 'narrow';

/** The layout of an exercise. */
export function exerciseLayout(exercise: Exercise): StepLayout {
  switch (exercise.type) {
    case 'fretboard-find':
    case 'fretboard-name':
    case 'play-note':
    case 'play-phrase':
    case 'tap-rhythm':
      return 'wide';
    case 'chord-build':
      return exercise.task === 'fingers' ? 'wide' : exercise.figure ? 'split' : 'narrow';
    case 'staff-read':
      return 'split';
    case 'play-chord':
      return 'narrow';
    case 'staff-place':
      return 'narrow';
    case 'flashcard':
      return exercise.figure || exercise.backFigure ? 'split' : 'narrow';
    case 'choice':
      return exercise.figure || exercise.options.some((o) => o.figure) ? 'split' : 'narrow';
    default:
      return exercise.figure ? 'split' : 'narrow';
  }
}

/** The layout of a teaching card: text beside its figure when it has one. */
export function cardLayout(card: CardStep): StepLayout {
  if (!card.figure) return 'narrow';
  return card.figure.kind === 'audio' ? 'narrow' : 'split';
}

/** The number key (1–9) for the option at a display position, or null past nine. */
export function digitFor(position: number): string | null {
  return position >= 0 && position < 9 ? String(position + 1) : null;
}

/** The display position a pressed key picks (`'3'` -> 2), or null. */
export function positionOfKey(key: string): number | null {
  if (!/^[1-9]$/.test(key)) return null;
  return Number(key) - 1;
}

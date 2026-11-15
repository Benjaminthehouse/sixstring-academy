/**
 * Every exercise type and its renderer, plus the small label that tells the learner what kind of
 * answer is wanted ("Choose one", "Match the pairs"). A type without a renderer is a type error.
 */
import type { ReactNode } from 'react';
import type { Exercise, ExerciseType } from '../../types';
import { ChoiceView, FlashcardView, ListenChoiceView, TrueFalseView } from './ChoiceViews';
import { ChordBuildView, FretFindView, FretNameView } from './NeckViews';
import { PlayView } from './PlayView';
import { StaffPlaceView, StaffReadStimulus, StaffReadView } from './StaffViews';
import { TapRhythmView } from './TapView';
import { FillView, MatchView, OrderView } from './TileViews';
import { TypeAnswerView } from './TypeViews';
import type { ExerciseViewProps } from './types';

type Renderers = { [K in ExerciseType]: (props: ExerciseViewProps<Extract<Exercise, { type: K }>>) => ReactNode };

/** The renderer of each exercise type. */
export const EXERCISE_RENDERERS: Renderers = {
  choice: ChoiceView,
  'true-false': TrueFalseView,
  'match-pairs': MatchView,
  order: OrderView,
  'fill-blanks': FillView,
  'type-answer': TypeAnswerView,
  'listen-choice': ListenChoiceView,
  'tap-rhythm': TapRhythmView,
  'fretboard-find': FretFindView,
  'fretboard-name': FretNameView,
  'chord-build': ChordBuildView,
  'staff-read': StaffReadView,
  'staff-place': StaffPlaceView,
  'play-note': PlayView,
  'play-chord': PlayView,
  'play-phrase': PlayView,
  flashcard: FlashcardView,
};

/**
 * What an exercise shows to be answered about, when it is part of the exercise rather than a
 * figure (the note on the staff to read). The player puts it beside the prompt.
 */
export function ExerciseStimulus({ exercise }: { exercise: Exercise }) {
  if (exercise.type === 'staff-read') return <StaffReadStimulus exercise={exercise} />;
  return null;
}

/** True when an exercise has a stimulus of its own. */
export function hasStimulus(exercise: Exercise): boolean {
  return exercise.type === 'staff-read';
}

/** The kind of answer an exercise wants, in two or three words. */
export function exerciseKindLabel(exercise: Exercise): string {
  switch (exercise.type) {
    case 'choice':
      return exercise.multiple ? 'Choose all that fit' : 'Choose one';
    case 'true-false':
      return 'True or false';
    case 'match-pairs':
      return 'Match the pairs';
    case 'order':
      return 'Put in order';
    case 'fill-blanks':
      return 'Fill the gaps';
    case 'type-answer':
      return 'Your answer';
    case 'listen-choice':
      return 'Listen';
    case 'tap-rhythm':
      return 'Tap the rhythm';
    case 'fretboard-find':
      return 'Find it on the neck';
    case 'fretboard-name':
      return exercise.ask === 'note' ? 'Name the note' : exercise.ask === 'interval' ? 'Name the interval' : 'Name the degree';
    case 'chord-build':
      return exercise.task === 'fingers' ? 'Build the chord' : 'Complete the chord';
    case 'staff-read':
      return 'Read the note';
    case 'staff-place':
      return 'Write the note';
    case 'play-note':
    case 'play-chord':
    case 'play-phrase':
      return 'Play it';
    case 'flashcard':
      return 'Remember';
  }
}

/** True for the types that hand in their own answer (no Check button). */
export function selfSubmitting(exercise: Exercise): boolean {
  return exercise.type === 'tap-rhythm' || exercise.type === 'flashcard' || exercise.type === 'play-note' || exercise.type === 'play-chord' || exercise.type === 'play-phrase';
}

/** Draw the answer area of any exercise. */
export function ExerciseBody(props: ExerciseViewProps) {
  const Render = EXERCISE_RENDERERS[props.exercise.type] as (p: ExerciseViewProps) => ReactNode;
  return <Render {...props} />;
}

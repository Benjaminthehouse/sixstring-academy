/**
 * The contract between the player and an exercise renderer. A renderer draws the answer area of
 * one exercise type, keeps the learner's draft, and reports it (`onDraft`) so the player's Check
 * button knows when there is something to check. Self-timed types (tap-rhythm, play, flashcard)
 * hand their answer in directly (`onSubmit`). After grading the same renderer shows the verdict
 * (`review`): right picks green, wrong ones red, the right answer marked.
 */
import type { NoteNaming } from '@/core/theory';
import type { Presentation } from '../../grade';
import type { Answer, CourseLevel, Exercise, GradeResult } from '../../types';

/** A graded answer to show. */
export interface ExerciseReview {
  result: GradeResult;
  /** The answer given (null when the step was skipped). */
  answer: Answer | null;
}

/**
 * What the player's primary (thumb-zone) button does while a self-timed exercise runs: "Start"
 * a count-in, "Start listening", "Done". Null gives the button back to the player ("Check").
 */
export interface PrimaryAction {
  label: string;
  icon?: string;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
}

/** Props every exercise renderer receives. */
export interface ExerciseViewProps<E extends Exercise = Exercise> {
  exercise: E;
  /** Display order (shuffled options, tiles, bank, buttons). */
  presentation: Presentation;
  /** Set once the answer is graded: the renderer shows the verdict and takes no more input. */
  review: ExerciseReview | null;
  /** The draft as an answer (null while it cannot be checked yet). */
  onDraft: (answer: Answer | null) => void;
  /** Hand an answer in now (types that time themselves). */
  onSubmit: (answer: Answer) => void;
  /** Show keyboard hints (desktop with a keyboard). */
  hints: boolean;
  level: CourseLevel;
  naming: NoteNaming | null;
  /** Unique per step and attempt; prefix for element ids. */
  uid: string;
  /** Take over the primary button (self-timed types); null hands it back. */
  setPrimary: (action: PrimaryAction | null) => void;
  /** Play exercises: the learner cannot play now (swap in the alternative for the session). */
  onCantPlay?: () => void;
  /** Play exercises: the microphone could not be opened and the learner chose the tapping version. */
  onMicUnavailable?: () => void;
}

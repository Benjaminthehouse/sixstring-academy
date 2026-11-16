/**
 * The lesson screens: the player that runs any session, the course map, the review entry card,
 * and the pieces they are made of (teaching cards, exercise renderers, figures, rich text).
 * `import { LessonPlayer, CourseMap, ReviewEntry } from '@/lessons/ui'`. See "Part C" of
 * `src/lessons/API.md`; the gallery is `#kit-lessons`.
 */
export { LessonPlayer, type LessonPlayerProps } from './player/LessonPlayer';
export { useLessonSession, matchOf, type LessonSession, type LessonSessionOptions, type ActionInput } from './player/useLessonSession';
export { TeachingCard, ExerciseFrame, TeacherBadge, type TeachingCardProps, type ExerciseFrameProps } from './player/StepViews';
export { FeedbackPanel, SummaryView, LeaveDialog, type FeedbackPanelProps, type SummaryViewProps, type LeaveDialogProps } from './player/Panels';
export { CourseMap, type CourseMapProps } from './map/CourseMap';
export { ReviewEntry, type ReviewEntryProps } from './review/ReviewEntry';
export { EXERCISE_RENDERERS, ExerciseBody, exerciseKindLabel, selfSubmitting } from './exercises/registry';
export type { ExerciseViewProps, ExerciseReview, PrimaryAction } from './exercises/types';
export { FIGURE_RENDERERS, FigureView, type FigureProps } from './figures/figures';
export { ScrollHint } from './figures/ScrollHint';
export { RichText, usePlainText, type RichTextProps } from './RichText';
export { LessonProvider, useLessonContext, type LessonContextValue } from './context';
export { StepKeysProvider, useKeysRegistry, useStepKeys, type StepKeyHandlers } from './keys';
export { useSoundPlayer, schedulePlan, techniqueOptions, planLine } from './useSound';
export { feedbackCopy, wrongLine, type FeedbackCopy } from './logic/feedback';
export { summaryHeadline, summaryStats, teacherLine, nextLabel, formatDuration, resumeNote, type NextStep, type SummaryStat } from './logic/summary';
export { memoryPort } from './memoryPort';

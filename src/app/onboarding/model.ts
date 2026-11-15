/**
 * The first-run flow as data: its steps, the answers collected so far (a draft that survives a
 * reload, so the flow can be resumed), and when it should open by itself. Pure, apart from the
 * two functions that read and write the draft through platform storage.
 */
import { readJSON, remove, writeJSON } from '@/core/platform/storage';
import type { DailyGoalXp, ExperienceLevel, Handedness, NoteNaming, OnboardingInput } from '@/core/progress';

/** The steps, in order. */
export const ONBOARDING_STEPS = ['welcome', 'experience', 'hand', 'names', 'goal', 'tour'] as const;
/** One step of the first-run flow. */
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** What the learner has answered so far. Every field starts at a sensible default. */
export interface OnboardingDraft {
  step: OnboardingStep;
  name: string;
  experience: ExperienceLevel;
  handedness: Handedness;
  noteNaming: NoteNaming;
  dailyGoalXp: DailyGoalXp;
}

/** What is kept between visits. `skipped` stops the flow from opening by itself again. */
export interface StoredOnboarding {
  skipped: boolean;
  draft: OnboardingDraft;
}

/** Storage key (through platform storage, so the real key is `ssa:shell.onboarding`). */
export const ONBOARDING_KEY = 'shell.onboarding';

/** The answers before the learner changes anything. */
export function defaultDraft(): OnboardingDraft {
  return { step: 'welcome', name: '', experience: 'beginner', handedness: 'right', noteNaming: 'letters', dailyGoalXp: 20 };
}

const EXPERIENCES: readonly ExperienceLevel[] = ['beginner', 'intermediate', 'expert'];
const HANDS: readonly Handedness[] = ['right', 'left'];
const NAMINGS: readonly NoteNaming[] = ['letters', 'solfege', 'german'];
const GOALS: readonly DailyGoalXp[] = [10, 20, 30, 50];

function pick<T>(allowed: readonly T[], value: unknown, fallback: T): T {
  return (allowed as readonly unknown[]).includes(value) ? (value as T) : fallback;
}

/** Make anything read from storage safe to use: unknown or damaged fields fall back to defaults. */
export function sanitizeStored(raw: unknown): StoredOnboarding {
  const base = defaultDraft();
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const d = record.draft && typeof record.draft === 'object' ? (record.draft as Record<string, unknown>) : {};
  return {
    skipped: record.skipped === true,
    draft: {
      step: pick(ONBOARDING_STEPS, d.step, base.step),
      name: typeof d.name === 'string' ? d.name.slice(0, 40) : base.name,
      experience: pick(EXPERIENCES, d.experience, base.experience),
      handedness: pick(HANDS, d.handedness, base.handedness),
      noteNaming: pick(NAMINGS, d.noteNaming, base.noteNaming),
      dailyGoalXp: pick(GOALS, d.dailyGoalXp, base.dailyGoalXp),
    },
  };
}

/** Read the saved draft (defaults when nothing is saved). */
export function loadOnboarding(): StoredOnboarding {
  return sanitizeStored(readJSON<unknown>(ONBOARDING_KEY, null));
}

/** Save the draft and whether the flow was skipped. */
export function saveOnboarding(stored: StoredOnboarding): void {
  writeJSON(ONBOARDING_KEY, stored);
}

/** Forget the draft (after the flow is finished). */
export function clearOnboarding(): void {
  remove(ONBOARDING_KEY);
}

/** Position of a step, 0-based. */
export function stepIndex(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step);
}

/** The step after `step`, or null on the last one. */
export function nextStep(step: OnboardingStep): OnboardingStep | null {
  return ONBOARDING_STEPS[stepIndex(step) + 1] ?? null;
}

/** The step before `step`, or null on the first one. */
export function previousStep(step: OnboardingStep): OnboardingStep | null {
  const i = stepIndex(step);
  return i > 0 ? ONBOARDING_STEPS[i - 1] : null;
}

/**
 * Whether the flow opens by itself: only for a learner who has neither finished nor skipped it,
 * and only on Today. Someone who followed a link straight to the tuner gets the tuner.
 */
export function shouldAutoOpen(onboarded: boolean, skipped: boolean, routeName: string): boolean {
  return !onboarded && !skipped && routeName === 'home';
}

/** What finishing the flow writes to the progress store. */
export function finishInput(draft: OnboardingDraft): { onboarding: OnboardingInput; noteNaming: NoteNaming } {
  const name = draft.name.trim();
  return {
    onboarding: {
      ...(name ? { name } : {}),
      experience: draft.experience,
      dailyGoalXp: draft.dailyGoalXp,
      handedness: draft.handedness,
    },
    noteNaming: draft.noteNaming,
  };
}

/** Daily goals with what they mean in minutes (about 2 XP per focused minute). */
export const GOAL_CHOICES: ReadonlyArray<{ xp: DailyGoalXp; label: string; minutes: number; note: string }> = [
  { xp: 10, label: 'Casual', minutes: 5, note: 'A tune-up and one short lesson.' },
  { xp: 20, label: 'Regular', minutes: 10, note: 'A lesson and a bit of playing. A good place to start.' },
  { xp: 30, label: 'Serious', minutes: 15, note: 'A lesson, a drill and a song.' },
  { xp: 50, label: 'Intense', minutes: 25, note: 'A full practice session every day.' },
];

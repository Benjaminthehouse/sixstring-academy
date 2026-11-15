/**
 * Whether the first-run flow is showing. Outside React so Today's "finish setting up" card, the Me
 * screen or anything else can reopen it with `openOnboarding()`.
 */
import { createSignal } from '../shell/signal';

/** True while the first-run flow is on screen. */
export const onboardingOpen = createSignal(false);

/** Show the first-run flow (it resumes at the step where it was left). */
export function openOnboarding(): void {
  onboardingOpen.set(true);
}

/** Hide the first-run flow without changing what was answered. */
export function closeOnboarding(): void {
  onboardingOpen.set(false);
}

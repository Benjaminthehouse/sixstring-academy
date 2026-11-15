import { Suspense, lazy, useEffect } from 'react';
import { useProgress } from '@/core/progress';
import { redirect, useRoute } from '../router';
// Imported here (not in the lazy flow) so it is already listening when the flow is opened by a key press.
import '../shell/modality';
import { useSignal } from '../shell/signal';
import { loadOnboarding, shouldAutoOpen } from './model';
import { onboardingOpen, openOnboarding } from './store';

// Only a first-time learner needs this code, so it stays out of the main bundle.
const Onboarding = lazy(() => import('./Onboarding'));

/**
 * Decides when the first-run flow shows and mounts it. It opens by itself only for a learner who
 * has neither finished nor skipped it, and only on Today: a link straight to the tuner opens the
 * tuner. `#home--setup` (or `openOnboarding()`) opens it on request.
 */
export function OnboardingHost() {
  const route = useRoute();
  const onboarded = useProgress((s) => s.profile.onboarded);
  const open = useSignal(onboardingOpen);
  const asked = route.name === 'home' && route.params[0] === 'setup';

  useEffect(() => {
    if (asked) {
      openOnboarding();
      // Drop the param so "back" and a reload do not reopen the flow.
      redirect('home');
      return;
    }
    if (shouldAutoOpen(onboarded, loadOnboarding().skipped, route.name)) openOnboarding();
  }, [asked, onboarded, route.name]);

  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <Onboarding />
    </Suspense>
  );
}

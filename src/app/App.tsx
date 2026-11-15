/**
 * The app: one shell around every screen, plus the things that live above all screens (the stats
 * sheet, feedback for progress events, the first-run flow).
 *
 * Contract other code relies on (the e2e harness included): the screen for the current route is
 * rendered inside `<main id="main" data-route={routeName}>`, lazily through the route registry,
 * inside Suspense and an error boundary that resets on navigation, and receives `params`.
 * See `API.md` in this folder for what the shell offers to screens.
 */
import { lazy, Suspense } from 'react';
import { isArtifact } from '@/core/platform/env';
import { getProgressStore } from '@/core/progress';
import { UIProvider } from '@/ui';
import './document.css';
import { GlobalFeedback } from './feedback/GlobalFeedback';
import { OnboardingHost } from './onboarding/OnboardingHost';
import { closeOnboarding } from './onboarding/store';
import { useDocumentAppearance } from './shell/appearance';
import { QuietBoundary } from './shell/QuietBoundary';
import { Shell } from './shell/Shell';
import { StatsSheet } from './shell/StatsSheet';

// Created before the first render: loading the store applies the learner's theme, motion and
// accent settings to <html>, so the first paint is already in the right theme.
getProgressStore();

// Inside a Claude artifact, progress follows the learner between devices. Standalone there is no
// cloud, so the sync code is not even loaded.
if (isArtifact()) {
  void import('@/core/platform/sync').then((m) => m.startCloudSync()).catch(() => undefined);
}

// The practice feature's "session in progress" bar, shown on every other screen while a session runs.
const PracticeSessionBar = lazy(() => import('@/features/practice/SessionBar'));

/** The root component mounted by `main.tsx`. */
export default function App() {
  useDocumentAppearance();
  return (
    <UIProvider>
      <Shell />
      <QuietBoundary name="The stats sheet">
        <StatsSheet />
      </QuietBoundary>
      <QuietBoundary name="Progress feedback">
        <GlobalFeedback />
      </QuietBoundary>
      <QuietBoundary name="The first-run flow" onError={closeOnboarding}>
        <OnboardingHost />
      </QuietBoundary>
      <QuietBoundary name="The practice session bar">
        <Suspense fallback={null}>
          <PracticeSessionBar />
        </Suspense>
      </QuietBoundary>
    </UIProvider>
  );
}

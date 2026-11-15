/**
 * Technique (`#technique`, `#technique--<exercise-id>`).
 *
 * How it is put together:
 *  - `src/content/technique` holds every exercise of the plan as playable SixTab with its tempo
 *    ladder, mistakes, strain warning and microphone check.
 *  - `model/` is pure and unit-tested: the ladder, the per-exercise record (progress skill data),
 *    timing alignment and take analysis, bends, pre-bends, vibrato, dynamics, the health clock,
 *    the visit's single `recordActivity`, what to suggest next.
 *  - `engine/` touches audio: `ExerciseRunner` (SongPlayer + this screen's own click patterns),
 *    `TakeListener` (one PitchTracker per visit), the shared health clock.
 *  - `ui/`: the hub, the exercise screen (ladder and guide exercises), routines (warm-up,
 *    cool-down), one-minute changes; health notices; panels.
 *
 * Test hooks: screens mirror their state in `data-*` attributes (`data-technique-screen`,
 * `data-mode`, `data-tempo`, `data-best`, `data-technique-take` …). In development builds
 * `window.__technique.health(seconds)` advances the health clock (the browser check uses it for
 * the break prompt). Browser check: `node e2e/technique.cjs`.
 */
import { useEffect } from 'react';
import type { RouteProps } from '@/app/routes';
import { getExercise } from '@/content/technique';
import { EmptyState, LinkButton, Page } from '@/ui';
import { tickHealthClock } from './engine/health-clock';
import { ChangesScreen } from './ui/ChangesScreen';
import { ExerciseScreen } from './ui/ExerciseScreen';
import { Hub } from './ui/Hub';
import { RoutineScreen } from './ui/RoutineScreen';

/** Development-only hook for browser checks. */
function useTestHook(): void {
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return;
    const w = window as unknown as { __technique?: { health: (sec: number) => void } };
    w.__technique = {
      health: (sec: number) => {
        for (let i = 0; i < sec; i++) tickHealthClock(1, true);
      },
    };
  }, []);
}

/** The Technique screen. */
export default function Technique({ params }: RouteProps) {
  useTestHook();
  const id = params[0];
  if (!id) return <Hub />;
  const e = getExercise(id);
  if (!e) {
    return (
      <Page title="Technique" back={{ to: 'technique', label: 'Technique' }}>
        <EmptyState icon="Hand" title="That exercise is not here" actions={<LinkButton to="technique" variant="primary">See all exercises</LinkButton>}>
          The link may be old. Every technique exercise is on the Technique page.
        </EmptyState>
      </Page>
    );
  }
  // A new exercise is a new screen: its own runner, microphone and record.
  if (e.mode === 'routine') return <RoutineScreen key={e.id} e={e} />;
  if (e.mode === 'changes') return <ChangesScreen key={e.id} e={e} />;
  return <ExerciseScreen key={e.id} e={e} />;
}

/**
 * Starting a session from anywhere on the practice screen: asks before replacing one that is
 * still running, then opens the runner.
 */
import { navigate } from '@/app/router';
import { confirmDialog } from '@/ui';
import type { PlanBlock } from '../model/planner';
import { dismissPractice, endPractice, getSessionView, startPracticeSession } from '../session/controller';

/** Start `blocks` as a session and open the runner. Resolves false when the learner kept the running one. */
export async function beginSession(blocks: readonly PlanBlock[], meta: { title: string; routineId?: string }): Promise<boolean> {
  if (blocks.length === 0) return false;
  const running = getSessionView();
  if (running && running.state.status !== 'finished') {
    const ok = await confirmDialog({
      title: 'Start a new session?',
      description: `“${running.state.title}” is still going. Starting a new one ends it and saves what you practised so far.`,
      confirmLabel: 'End it and start',
      cancelLabel: 'Keep the current one',
    });
    if (!ok) return false;
    endPractice();
  }
  if (getSessionView()) dismissPractice();
  startPracticeSession(blocks, meta);
  navigate('practice', 'session');
  return true;
}

/** "15-minute plan". */
export function planTitle(minutes: number): string {
  return `${minutes}-minute plan`;
}

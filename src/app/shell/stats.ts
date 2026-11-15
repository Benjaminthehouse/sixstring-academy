/**
 * Which panel of the stats sheet is open. Kept outside React so the top bar, the sidebar, Today
 * and the feedback toasts can all open the same sheet.
 */
import { createSignal } from './signal';

/** The four things the learner tracks day to day. */
export type StatTab = 'goal' | 'streak' | 'hearts' | 'gems';

/** The open panel, or null while the sheet is closed. */
export const statsSheet = createSignal<StatTab | null>(null);

/** Open the stats sheet on a panel (the daily goal by default). */
export function openStats(tab: StatTab = 'goal'): void {
  statsSheet.set(tab);
}

/** Close the stats sheet. */
export function closeStats(): void {
  statsSheet.set(null);
}

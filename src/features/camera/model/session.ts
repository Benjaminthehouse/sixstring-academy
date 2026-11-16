/**
 * What a visit to the live fretboard puts in the practice log. Time with the camera running is
 * camera practice; finding notes on the drawn neck (no camera) is fretboard practice. A visit is
 * logged when it ends, and also when the page is hidden for good (a phone locked, a tab closed:
 * the screen may never unmount), so only what has not been logged yet goes in each time.
 */
import type { ActivityInput } from '@/core/progress';

/** Less camera time than this is not a practice session (a look, a test of the camera). */
export const MIN_CAMERA_SECONDS = 10;

/** What has happened in this visit so far (running totals). */
export interface VisitTotals {
  /** Seconds the camera has run. */
  cameraSeconds: number;
  /** Seconds on the drawn neck (no camera). */
  drawnSeconds: number;
  /** Notes found in the drill by tapping the drawn neck, and wrong taps. */
  drawnFound: number;
  drawnMissed: number;
}

/** Nothing yet. */
export const NO_VISIT: VisitTotals = { cameraSeconds: 0, drawnSeconds: 0, drawnFound: 0, drawnMissed: 0 };

/** What to say about the visit in the log. */
export interface VisitInfo {
  title: string;
  params: string[];
  /** Notes found in the drill with the camera (heard through the microphone). */
  cameraFound: number;
}

/**
 * The activities to record now, given the totals at the last log: the camera time since then (if
 * there is enough of it) and the drawn-neck drill since then (if a note was found). Returns them
 * with the totals that count as logged afterwards.
 */
export function visitActivities(now: VisitTotals, logged: VisitTotals, info: VisitInfo): { activities: ActivityInput[]; logged: VisitTotals } {
  const activities: ActivityInput[] = [];
  const next = { ...logged };
  const camera = Math.round(now.cameraSeconds - logged.cameraSeconds);
  if (camera >= MIN_CAMERA_SECONDS) {
    activities.push({ kind: 'camera', durationSec: camera, title: `Live fretboard: ${info.title}`, route: 'camera', params: info.params, count: info.cameraFound || undefined });
    next.cameraSeconds = now.cameraSeconds;
  }
  const found = now.drawnFound - logged.drawnFound;
  const missed = now.drawnMissed - logged.drawnMissed;
  if (found > 0) {
    activities.push({
      kind: 'fretboard',
      count: found,
      accuracy: found / (found + Math.max(0, missed)),
      durationSec: Math.max(1, Math.round(now.drawnSeconds - logged.drawnSeconds)),
      title: 'Find the note on a drawn neck',
      route: 'camera',
      params: info.params,
    });
    next.drawnFound = now.drawnFound;
    next.drawnMissed = now.drawnMissed;
    next.drawnSeconds = now.drawnSeconds;
  }
  return { activities, logged: next };
}

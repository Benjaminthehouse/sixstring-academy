/**
 * Turning a finished recording into a stored take: decode it for its exact length and waveform
 * (or fall back to the meter readings), name it, store it, and report the practice time. Runs to
 * the end even when the screen has gone, so leaving mid-take never loses the take.
 */
import { recordActivity } from '@/core/progress';
import { computePeaks, resamplePeaks } from '../model/signal';
import type { TakeStore } from '../model/store';
import { MIN_PRACTICE_SEC, cleanName, newTakeId, nextTakeName, type Take } from '../model/takes';
import { channelsOf, decodeTake } from './player';
import type { FinishedRecording } from './session';

/** What the learner had chosen when the take was made. */
export interface TakeDetails {
  /** The name typed in the name field (empty = the next automatic name). */
  name: string;
  label: string | null;
}

/** Store a finished recording as a take. Returns the take and the new list; rejects with a `TakeStoreError`. */
export async function storeRecording(store: TakeStore, rec: FinishedRecording, details: TakeDetails): Promise<{ take: Take; list: Take[] }> {
  const existing = await store.list().catch(() => [] as Take[]);
  const id = newTakeId(rec.startedAt);
  const buffer = await decodeTake(id, rec.blob);
  const take: Take = {
    id,
    name: cleanName(details.name) || nextTakeName(existing, details.label),
    label: details.label,
    createdAt: rec.startedAt || Date.now(),
    durationMs: buffer ? Math.round(buffer.duration * 1000) : Math.round(rec.durationMs),
    mimeType: rec.mimeType,
    bytes: rec.blob.size,
    peaks: buffer ? computePeaks(channelsOf(buffer)) : resamplePeaks(rec.envelope),
    bpm: rec.bpm,
  };
  const list = await store.put(take, rec.blob);
  reportPractice(take);
  return { take, list };
}

/**
 * Practice time for a take: the minutes spent playing count towards the day, the time quests and
 * the log (kind `other`, from the recorder). Very short takes (a false start) are not reported.
 */
export function reportPractice(take: Take): void {
  const durationSec = Math.round(take.durationMs / 1000);
  if (durationSec < MIN_PRACTICE_SEC) return;
  try {
    recordActivity({
      kind: 'other',
      source: 'recorder',
      tag: 'practice',
      title: `Recorded “${take.name}”`,
      durationSec,
      startedAt: take.createdAt,
      meta: take.bpm ? { bpm: take.bpm } : undefined,
    });
  } catch {
    // Progress is never a reason to lose a take.
  }
}

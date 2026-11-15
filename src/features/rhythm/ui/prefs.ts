/**
 * The rhythm trainer's own small preferences (how taps arrive, what is shown), kept through the
 * platform storage layer. Progress, XP and stars are not here: they live in `core/progress`.
 */
import { useCallback } from 'react';
import { useLocalState } from '@/ui';
import type { InputSource } from '../core/calibration';

/** What the learner has chosen. */
export interface RhythmPrefs {
  /** Tap (screen and keyboard) or the microphone. */
  source: InputSource;
  /** Show timing in milliseconds next to the friendly words. */
  showMs: boolean;
  /** Show counting syllables under notation and strum grids. */
  counts: boolean;
  /** Read and tap: hear each phrase before playing it. */
  echo: boolean;
  /** Strumming: play the guitar along with the learner in a scored round. */
  guitar: boolean;
}

/** Defaults for a new learner: tap, friendly words, counts on. */
export const DEFAULT_PREFS: RhythmPrefs = { source: 'tap', showMs: false, counts: true, echo: false, guitar: true };

/** Storage key of the preferences. */
export const PREFS_KEY = 'rhythm.prefs';

/** The preferences and a function that merges a change into them. */
export function useRhythmPrefs(): [RhythmPrefs, (patch: Partial<RhythmPrefs>) => void] {
  const [stored, setStored] = useLocalState<Partial<RhythmPrefs>>(PREFS_KEY, DEFAULT_PREFS);
  const prefs: RhythmPrefs = { ...DEFAULT_PREFS, ...(stored && typeof stored === 'object' ? stored : {}) };
  if (prefs.source !== 'tap' && prefs.source !== 'mic') prefs.source = 'tap';
  const update = useCallback((patch: Partial<RhythmPrefs>) => setStored((prev) => ({ ...DEFAULT_PREFS, ...(prev && typeof prev === 'object' ? prev : {}), ...patch })), [setStored]);
  return [prefs, update];
}

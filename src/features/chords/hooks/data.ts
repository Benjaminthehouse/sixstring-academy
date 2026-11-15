/**
 * React glue for the chord screen's data: voicing sets worked out off the critical path (a grid
 * of tiles never blocks a tap), the learner's known chords, and the tuning chord shapes are drawn in.
 */
import { useEffect, useMemo, useState } from 'react';
import { STANDARD_TUNING, type Tuning } from '@/core/guitar';
import { getProgress, markSkill, setSkillData, useProgress, usePrefs } from '@/core/progress';
import { learnerTuning } from '@/core/settings';
import { knownKey, mergeChordData } from '../model/known';
import { chordSkillId } from '../model/symbols';
import { hasVoicingSet, voicingSet, type VoicingSet } from '../model/voicings';

// ---------------------------------------------------------------------------------------------
// A small work queue: voicing sets for tiles are computed a few milliseconds at a time.
// ---------------------------------------------------------------------------------------------

const queue: Array<() => void> = [];
let pumping = false;

function pump(): void {
  const start = performance.now();
  while (queue.length && performance.now() - start < 10) queue.shift()!();
  if (queue.length) setTimeout(pump, 0);
  else pumping = false;
}

function enqueue(job: () => void): () => void {
  let cancelled = false;
  queue.push(() => {
    if (!cancelled) job();
  });
  if (!pumping) {
    pumping = true;
    setTimeout(pump, 0);
  }
  return () => {
    cancelled = true;
  };
}

/** A chord's voicing set; `lazy` defers the work to idle moments (null until then). */
export function useVoicingSet(symbol: string, tuning: string, lazy = false): VoicingSet | null {
  const [set, setSet] = useState<VoicingSet | null>(() => (!lazy || hasVoicingSet(symbol, tuning) ? voicingSet(symbol, tuning) : null));
  useEffect(() => {
    if (!lazy || hasVoicingSet(symbol, tuning)) {
      setSet(voicingSet(symbol, tuning));
      return undefined;
    }
    setSet(null);
    return enqueue(() => setSet(voicingSet(symbol, tuning)));
  }, [symbol, tuning, lazy]);
  return set;
}

// ---------------------------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------------------------

/**
 * The tuning chord shapes are drawn in: the learner's own when it is a six-string guitar tuning,
 * standard otherwise (a bass or ukulele tuning would turn the chord library into something else).
 */
export function useChordTuning(): { tuning: Tuning; id: string; isStandard: boolean } {
  const prefs = usePrefs();
  return useMemo(() => {
    const t = learnerTuning(prefs);
    const usable = t.instrument === 'guitar' && t.stringCount === 6;
    const tuning = usable ? t : STANDARD_TUNING;
    return { tuning, id: tuning.id, isStandard: tuning.id === 'standard' };
  }, [prefs]);
}

// ---------------------------------------------------------------------------------------------
// Known chords
// ---------------------------------------------------------------------------------------------

/** The canonical symbols of the chords the learner knows. */
export function useKnownChords(): Set<string> {
  const key = useProgress((s) => knownKey(s.skills));
  return useMemo(() => new Set(key ? key.split(',') : []), [key]);
}

/** Mark a chord as known or take the mark back. */
export function setKnown(symbol: string, known: boolean): void {
  const id = chordSkillId(symbol);
  const record = getProgress().skills[id];
  if (known) markSkill(id, { completed: true, data: mergeChordData(record?.data, { known: true }) });
  else if (record) setSkillData(id, mergeChordData(record.data, { known: false }));
}

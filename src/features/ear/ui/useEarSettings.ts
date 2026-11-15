import { useCallback, useMemo } from 'react';
import { normalizeTone } from '@/core/audio';
import { usePrefs } from '@/core/progress';
import { useLocalState } from '@/ui';
import { cleanSettings } from '../core/settings';
import type { EarSettings } from '../core/types';

const KEY = 'ear.settings';

/** The app-wide guitar tone, mapped onto the three the ear trainer offers. */
function toneFromPrefs(guitarTone: string): EarSettings['tone'] {
  const t = normalizeTone(guitarTone, 'steel');
  return t === 'nylon' ? 'nylon' : t === 'clean' || t === 'driven' ? 'clean' : 'steel';
}

/** The learner's sound choices for ear training, with a setter that takes a partial patch. */
export function useEarSettings(): [EarSettings, (patch: Partial<EarSettings>) => void] {
  const prefs = usePrefs();
  const [raw, setRaw] = useLocalState<Partial<EarSettings>>(KEY, {});
  const fallback = toneFromPrefs(prefs.sound.guitarTone);
  const settings = useMemo(() => cleanSettings(raw, fallback), [raw, fallback]);
  const update = useCallback((patch: Partial<EarSettings>) => setRaw((prev: Partial<EarSettings>) => ({ ...prev, ...patch })), [setRaw]);
  return [settings, update];
}

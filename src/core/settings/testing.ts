/** Test helpers: default preferences with a few fields replaced. */
import { defaultPrefs, type Preferences } from '@/core/progress';

/** A tuning id that is not in the catalog. */
export const DEFAULT_TUNING_ID_FALLBACK = 'no-such-tuning';

export function prefsWith(patch: Partial<Preferences>): Preferences {
  return { ...defaultPrefs(), ...patch };
}

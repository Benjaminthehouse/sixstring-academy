/**
 * The tuner's address: route params that open it on a tuning (and a capo), so a lesson that says
 * "tune to DADGAD" can link straight there. Params are slug-safe, in any order; one the tuner
 * does not know is ignored.
 *
 *   #tuner--dadgad          a catalog tuning by id (`drop-d`, `open-g`, `half-step-down`, `standard` ...)
 *   #tuner--open-d          or by a common name, slugged (`eb-standard`, `vestapol`, `double-dropped-d`)
 *   #tuner--capo-2          tune with a capo on fret 2 (0 to 12)
 *
 * Choosing the tuning is the same as choosing it in the tuning picker: it becomes the learner's
 * tuning everywhere in the app (chord shapes, the fretboard), as the guitar now is.
 */
import { getTuning, type Tuning } from '@/core/guitar';
import { clampCapo } from './targets';

/** What a tuner address asks for. */
export interface TunerAddress {
  /** A catalog tuning. */
  tuning?: Tuning;
  /** Capo fret, 0–12. */
  capo?: number;
}

/** Read the route params; null when none of them names a tuning or a capo. */
export function parseTunerParams(params: readonly string[]): TunerAddress | null {
  const out: TunerAddress = {};
  let any = false;
  for (const raw of params) {
    const p = raw.trim().toLowerCase();
    const capo = /^capo-(\d{1,2})$/.exec(p);
    if (capo) {
      out.capo = clampCapo(Number(capo[1]));
      any = true;
      continue;
    }
    const t = p ? getTuning(p) : null;
    // Only the catalog: a custom tuning's id lives on one device and means nothing in a lesson.
    if (t && !t.custom) {
      out.tuning = t;
      any = true;
    }
  }
  return any ? out : null;
}

/** The canonical params for a tuning and capo: `['dadgad']`, `['standard', 'capo-2']`. */
export function tunerParams(a: { tuning?: string | Tuning; capo?: number }): string[] {
  const out: string[] = [];
  const t = typeof a.tuning === 'string' ? getTuning(a.tuning) : a.tuning;
  if (t) out.push(t.id);
  if (a.capo !== undefined && a.capo > 0) out.push(`capo-${clampCapo(a.capo)}`);
  return out;
}

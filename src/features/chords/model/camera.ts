/**
 * "See it on your guitar": the Live Fretboard's address for a chord and the shape on screen
 * (`#camera--chord--<slug>[--n]`, documented in `src/features/camera/model/address.ts`). The camera
 * numbers a chord's shapes in the guitar engine's own ranking (`chordVoicings`, up to fret 15), which
 * is not the chord page's order, so the shape is looked up there by its frets.
 */
import { chordVoicings, type Tuning } from '@/core/guitar';
import { chordFromSlug, chordSlug } from '@/core/theory';

/** Highest fret of the camera's shapes (`MAX_FRET` in the camera's content model). */
export const CAMERA_MAX_FRET = 15;

type Frets = ReadonlyArray<number | null>;

/** Where a shape sits on the neck: the mean of its fretted notes (0 for an all-open shape). */
function position(frets: Frets): number {
  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  return fretted.length ? fretted.reduce((a, b) => a + b, 0) / fretted.length : 0;
}

/**
 * The camera shape closest to one it does not list (a partial shape such as `320xxx`, or one past
 * fret 15): the most notes on the same strings and frets, then the nearest on the neck. So the
 * camera shows the chord where the page shows it, not the open shape at the other end of the neck.
 */
export function nearestShape(frets: Frets, list: ReadonlyArray<{ frets: Frets }>): number {
  const at = position(frets);
  let best = -1;
  let bestShared = -1;
  let bestDistance = Infinity;
  list.forEach((v, i) => {
    let shared = 0;
    for (let s = 0; s < Math.min(frets.length, v.frets.length); s++) if (frets[s] !== null && frets[s] === v.frets[s]) shared++;
    const distance = Math.abs(position(v.frets) - at);
    if (shared > bestShared || (shared === bestShared && distance < bestDistance)) {
      best = i;
      bestShared = shared;
      bestDistance = distance;
    }
  });
  return best;
}

/**
 * Route params of the camera for a chord (`['chord', 'g-major']`, `['chord', 'f-major', '2']` for its
 * second shape), or null when the camera cannot show the chord (a slash chord, or a type outside
 * the theory catalog). `frets` is the shape on screen, low string first; when the camera does not
 * list that shape it opens on the camera's shape nearest to it (`nearestShape`).
 */
export function cameraChordParams(symbol: string, frets: Frets | null, tuning: string | Tuning = 'standard'): string[] | null {
  let slug: string;
  try {
    slug = chordSlug(symbol);
  } catch {
    return null;
  }
  if (chordFromSlug(slug)?.symbol !== symbol) return null;
  if (!frets) return ['chord', slug];
  let list: ReadonlyArray<{ frets: Frets }> = [];
  try {
    list = chordVoicings(symbol, { tuning, maxFret: CAMERA_MAX_FRET });
  } catch {
    list = [];
  }
  const key = frets.join(',');
  const exact = list.findIndex((v) => v.frets.join(',') === key);
  const index = exact >= 0 ? exact : nearestShape(frets, list);
  return index > 0 ? ['chord', slug, String(index + 1)] : ['chord', slug];
}

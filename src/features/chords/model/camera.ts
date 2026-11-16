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

/**
 * Route params of the camera for a chord (`['chord', 'g-major']`, `['chord', 'f-major', '2']` for its
 * second shape), or null when the camera cannot show the chord (a slash chord, or a type outside
 * the theory catalog). `frets` is the shape on screen, low string first; when the camera does not
 * list that shape it opens on the chord's first one.
 */
export function cameraChordParams(symbol: string, frets: ReadonlyArray<number | null> | null, tuning: string | Tuning = 'standard'): string[] | null {
  let slug: string;
  try {
    slug = chordSlug(symbol);
  } catch {
    return null;
  }
  if (chordFromSlug(slug)?.symbol !== symbol) return null;
  if (!frets) return ['chord', slug];
  let list: ReadonlyArray<{ frets: ReadonlyArray<number | null> }> = [];
  try {
    list = chordVoicings(symbol, { tuning, maxFret: CAMERA_MAX_FRET });
  } catch {
    list = [];
  }
  const key = frets.join(',');
  const index = list.findIndex((v) => v.frets.join(',') === key);
  return index > 0 ? ['chord', slug, String(index + 1)] : ['chord', slug];
}

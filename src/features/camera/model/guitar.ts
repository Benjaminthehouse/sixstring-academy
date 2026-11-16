/**
 * The learner's instrument as the camera needs it: which neck model the tracker fits, the names of
 * the open strings for the overlay, and the pitch of every string (for the microphone check).
 */
import type { Tuning } from '@/core/guitar';
import { NECK_PRESETS, neckModel, type NeckModel, type NeckPresetId } from '@/core/vision';
import { pcName } from '@/core/theory';

/** Guitar types the camera knows. */
export type GuitarKind = 'steel' | 'electric' | 'classical' | 'seven' | 'bass';

/** The choices, in the order they are offered, each with a one-line description. */
export const GUITAR_KINDS: ReadonlyArray<{ id: GuitarKind; label: string; description: string }> = [
  { id: 'steel', label: 'Steel-string acoustic', description: 'Metal strings, dots on the neck, a solid headstock.' },
  { id: 'electric', label: 'Electric', description: 'A slim neck, often a light maple board.' },
  { id: 'classical', label: 'Classical (nylon)', description: 'Wide flat neck, nylon strings, an open slotted headstock.' },
  { id: 'seven', label: 'Seven-string', description: 'A guitar with an extra low string.' },
  { id: 'bass', label: 'Bass (four strings)', description: 'A long neck with four thick strings.' },
];

/** True for a known guitar kind (stored settings may hold anything). */
export function isGuitarKind(value: unknown): value is GuitarKind {
  return GUITAR_KINDS.some((g) => g.id === value);
}

/** The neck the tracker fits for a guitar kind: a preset id, or a full model for the others. */
export function neckFor(kind: GuitarKind): NeckPresetId | NeckModel {
  switch (kind) {
    case 'seven':
      return neckModel(NECK_PRESETS.electric, { stringCount: 7, nutWidth: 48, width12: 58, stringSpanNut: 41, stringSpanBridge: 62 });
    case 'bass':
      return neckModel(NECK_PRESETS.electric, { scaleLength: 864, stringCount: 4, nutWidth: 40, width12: 56, stringSpanNut: 31, stringSpanBridge: 57, fretCount: 20 });
    default:
      return kind;
  }
}

/** The guitar kind a tuning suggests: a seven-string or a bass tuning picks its own neck, everything else a steel-string. */
export function defaultGuitarKind(tuning: Pick<Tuning, 'stringCount' | 'instrument'>): GuitarKind {
  if (tuning.instrument === 'bass' && tuning.stringCount === 4) return 'bass';
  if (tuning.stringCount === 7) return 'seven';
  return 'steel';
}

/** The number of strings of a guitar kind. */
export function stringCountOf(kind: GuitarKind): number {
  return kind === 'seven' ? 7 : kind === 'bass' ? 4 : 6;
}

/**
 * Open-string names for the overlay, low to high (the overlay's order), from the tuning when it
 * fits the guitar, else the standard names for that many strings.
 */
export function stringNamesFor(tuning: Pick<Tuning, 'notes' | 'stringCount'>, kind: GuitarKind): string[] {
  const count = stringCountOf(kind);
  if (tuning.stringCount === count) return tuning.notes.map((n) => pcName(n));
  if (count === 7) return ['B', 'E', 'A', 'D', 'G', 'B', 'E'];
  if (count === 4) return ['E', 'A', 'D', 'G'];
  return ['E', 'A', 'D', 'G', 'B', 'E'];
}

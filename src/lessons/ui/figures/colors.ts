/**
 * Colours of lesson dots and keys, by what they stand for. A dot's role (root, third ...) or its
 * degree picks one of the fixed degree colours; a target is the accent; plain tones are neutral.
 */
import { degreeColor, fingerColor, type MusicColor } from '@/ui/music';
import type { DotRole } from '../../types';

/** The colour of a dot with a role and (maybe) a degree. */
export function dotColor(role: DotRole, degree: string | null, finger: number | null = null, labels: 'note' | 'degree' | 'finger' | 'none' = 'note'): MusicColor {
  if (labels === 'finger' && finger) return fingerColor(finger) as MusicColor;
  if (degree) return degreeColor(degree);
  switch (role) {
    case 'root':
      return 'deg-1';
    case 'third':
      return 'deg-3';
    case 'fifth':
      return 'deg-5';
    case 'seventh':
      return 'deg-7';
    case 'target':
      return 'accent';
    default:
      return 'neutral';
  }
}

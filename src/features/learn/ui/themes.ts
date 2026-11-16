/** The icon of each unit theme (the same set the lesson engine's course map uses). */
import type { UnitTheme } from '@/lessons';

/** Lucide icon per unit theme. */
export const THEME_ICONS: Readonly<Record<UnitTheme, string>> = {
  basics: 'Guitar',
  notes: 'Music',
  fretboard: 'Grid3x3',
  rhythm: 'Drum',
  intervals: 'Ruler',
  scales: 'Music4',
  chords: 'Layers',
  keys: 'Key',
  harmony: 'Blocks',
  reading: 'BookOpen',
  ear: 'Ear',
  technique: 'Hand',
  songs: 'Music2',
  improvisation: 'Sparkles',
  composition: 'Feather',
};

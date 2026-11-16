/**
 * Display formatting for the Reference in the learner's note naming (letters, solfège, German):
 * one memoised object handed to every section and to the search index.
 */
import { useMemo } from 'react';
import { formatChord, formatDegree, formatKey, formatNote, formatRoman } from '@/core/theory';
import { useMusicSettings, type NoteNaming } from '@/ui/music';
import type { SearchFormat } from '../model/search';

/** Formatters for ASCII music text. */
export interface Fmt extends SearchFormat {
  naming: NoteNaming;
  /** `bIII` -> `♭III`. */
  roman: (ascii: string) => string;
  /** `b3` -> `♭3`. */
  degree: (ascii: string) => string;
  /** Notes with octaves dropped, joined by spaces. */
  notes: (list: readonly string[]) => string;
}

/** Build the formatters for a naming system (pure; `useFmt` memoises it). */
export function makeFmt(naming: NoteNaming): Fmt {
  const note = (n: string) => safe(() => formatNote(n, { system: naming, octave: false }), n);
  return {
    naming,
    note,
    chord: (c) => safe(() => formatChord(c, { system: naming }), c),
    key: (k) => safe(() => formatKey(k, { system: naming }), k),
    roman: (r) => safe(() => formatRoman(r), r),
    degree: (d) => formatDegree(d),
    notes: (list) => list.map(note).join(' '),
  };
}

function safe(fn: () => string, fallback: string): string {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** The formatters for the learner's naming setting. */
export function useFmt(): Fmt {
  const { naming } = useMusicSettings();
  return useMemo(() => makeFmt(naming), [naming]);
}

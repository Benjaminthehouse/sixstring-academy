/**
 * A drill's address: route params after `#fretboard--drill--<id>` that set the drill up, so a
 * lesson that says "keep only strings 6 and 5" or "find every C" can link straight to it. Params
 * are slug-safe, in any order; one the trainer does not know is ignored.
 *
 *   strings-6-5     the strings to drill (1 = thinnest; also `string-6`)
 *   frets-4-8       the frets to drill, inclusive (also `fret-5` for one fret)
 *   naturals        natural notes only;  all-notes  all twelve
 *   note-c          one note to find (`note-f-sharp`, `note-bb`): find-the-note, find-every-note and
 *                   play-the-note ask only that note (the other drills ignore it)
 *
 * Strings, frets and the note set are stored as the drill's settings, as if set by hand with
 * "Change"; the single note is for this round only.
 */
import { noteFromSlug, noteSlug, parseNote } from '@/core/theory';
import { cleanSettings, type TrainerSettings } from './settings';
import type { DrillId } from './drills';

/** What a drill's address sets up; every field is optional. */
export interface DrillAddress {
  strings?: number[];
  frets?: [number, number];
  notes?: 'naturals' | 'all';
  /** One note to ask about: its pitch class and its spelling (ASCII). */
  note?: { pc: number; name: string };
}

/** The drills a single note makes sense for (the others ask for names, which would always be the same). */
export const SINGLE_NOTE_DRILLS: readonly DrillId[] = ['find-the-note', 'find-every-note', 'play-the-note'];

/** Read the params that follow the drill's id. */
export function parseDrillParams(params: readonly string[]): DrillAddress {
  const out: DrillAddress = {};
  for (const raw of params) {
    const p = raw.trim().toLowerCase();
    let m: RegExpExecArray | null;
    if ((m = /^strings?((?:-[1-7])+)$/.exec(p))) {
      const list = [...new Set(m[1].slice(1).split('-').map(Number))].sort((a, b) => a - b);
      if (list.length) out.strings = list;
    } else if ((m = /^frets?-(\d{1,2})(?:-(\d{1,2}))?$/.exec(p))) {
      const a = Number(m[1]);
      const b = m[2] === undefined ? a : Number(m[2]);
      if (a <= 24 && b <= 24) out.frets = [Math.min(a, b), Math.max(a, b)];
    } else if (p === 'naturals') out.notes = 'naturals';
    else if (p === 'all-notes') out.notes = 'all';
    else if ((m = /^note-(.+)$/.exec(p))) {
      const name = noteFromSlug(m[1]);
      const parsed = name ? parseNote(name) : null;
      if (name && parsed) out.note = { pc: parsed.chroma, name };
    }
  }
  return out;
}

/** The route params of a drill set up: `['drill', 'find-the-note', 'strings-5-6', 'note-c']`. */
export function drillParams(id: DrillId, a: DrillAddress = {}): string[] {
  const out: string[] = ['drill', id];
  if (a.strings?.length) out.push(`strings-${[...a.strings].sort((x, y) => x - y).join('-')}`);
  if (a.frets) out.push(a.frets[0] === a.frets[1] ? `fret-${a.frets[0]}` : `frets-${a.frets[0]}-${a.frets[1]}`);
  if (a.notes) out.push(a.notes === 'all' ? 'all-notes' : 'naturals');
  if (a.note) out.push(`note-${noteSlug(a.note.name)}`);
  return out;
}

/** True when an address changes the drill's stored settings (strings, frets or note set). */
export function changesSettings(a: DrillAddress): boolean {
  return a.strings !== undefined || a.frets !== undefined || a.notes !== undefined;
}

/** The settings with the address's strings, frets and note set, kept inside the guitar. */
export function applyDrillAddress(settings: TrainerSettings, a: DrillAddress, stringCount = 6, maxFret = 24): TrainerSettings {
  return cleanSettings(
    {
      ...settings,
      ...(a.strings ? { strings: a.strings } : {}),
      ...(a.frets ? { frets: a.frets } : {}),
      ...(a.notes ? { notes: a.notes } : {}),
    },
    stringCount,
    maxFret,
  );
}

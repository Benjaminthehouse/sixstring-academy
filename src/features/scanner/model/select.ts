/**
 * Where the proofreader's attention is, how arrows move it, what is left to check, and the undo
 * history. Pure, so the keyboard model is tested without a browser.
 */
import type { Draft } from './draft';
import { GUESS, checkBar } from './draft';

/**
 * The selection: a beat, and on it a note (`note` = index into the beat's notes) or an empty
 * string (`note` null, `string` set) where a note can be added. `beat` null = the whole bar.
 */
export interface Selection {
  bar: number;
  beat: number | null;
  note: number | null;
  string: number | null;
}

/** Nothing selected yet: the first beat. */
export function firstSelection(draft: Draft): Selection {
  return selectBeat(draft, 0, 0, 1);
}

function beatNotes(draft: Draft, bar: number, beat: number) {
  return draft.song.tracks[0]?.measures[bar]?.beats[beat]?.notes ?? [];
}

/** Select a beat, preferring the note on `string`, else the nearest note, else the empty string. */
export function selectBeat(draft: Draft, bar: number, beat: number, string: number | null): Selection {
  const notes = beatNotes(draft, bar, beat);
  if (!notes.length) return { bar, beat, note: null, string: string ?? 1 };
  const exact = string !== null ? notes.findIndex((n) => n.string === string) : -1;
  if (exact >= 0) return { bar, beat, note: exact, string };
  let best = 0;
  notes.forEach((n, i) => {
    if (string !== null && Math.abs(n.string - string) < Math.abs(notes[best].string - string)) best = i;
  });
  return { bar, beat, note: best, string: notes[best].string };
}

/** Beats of the whole song in order. */
export function beatList(draft: Draft): { bar: number; beat: number }[] {
  const out: { bar: number; beat: number }[] = [];
  draft.song.tracks[0]?.measures.forEach((m, bar) => m.beats.forEach((_, beat) => out.push({ bar, beat })));
  return out;
}

/** The string a selection points at (its note's string, or the empty string). */
export function selectedString(draft: Draft, sel: Selection): number {
  if (sel.beat !== null && sel.note !== null) return beatNotes(draft, sel.bar, sel.beat)[sel.note]?.string ?? sel.string ?? 1;
  return sel.string ?? 1;
}

/** Move with the arrow keys: left / right through beats (staying on the string), up / down through strings. */
export function moveSelection(draft: Draft, sel: Selection, dir: 'left' | 'right' | 'up' | 'down'): Selection {
  const strings = draft.song.tuning.length;
  const string = selectedString(draft, sel);
  if (dir === 'up' || dir === 'down') {
    if (sel.beat === null) return selectBeat(draft, sel.bar, 0, string);
    const s = Math.max(1, Math.min(strings, string + (dir === 'up' ? -1 : 1)));
    const notes = beatNotes(draft, sel.bar, sel.beat);
    const i = notes.findIndex((n) => n.string === s);
    return { bar: sel.bar, beat: sel.beat, note: i >= 0 ? i : null, string: s };
  }
  const list = beatList(draft);
  if (!list.length) return sel;
  let at = sel.beat === null ? list.findIndex((b) => b.bar === sel.bar) - (dir === 'right' ? 1 : 0) : list.findIndex((b) => b.bar === sel.bar && b.beat === sel.beat);
  if (at < -1) at = -1;
  const next = Math.max(0, Math.min(list.length - 1, at + (dir === 'right' ? 1 : -1)));
  const target = list[next];
  return selectBeat(draft, target.bar, target.beat, string);
}

/** One thing left to check. */
export interface CheckItem {
  kind: 'note' | 'rhythm' | 'bar';
  bar: number;
  beat: number | null;
  note: number | null;
  /** One plain sentence. */
  text: string;
}

/** Everything still worth a look, in reading order: doubtful notes and rhythms, bars that do not add up. */
export function itemsToCheck(draft: Draft): CheckItem[] {
  const out: CheckItem[] = [];
  const track = draft.song.tracks[0];
  draft.marks.forEach((bm, bar) => {
    const beats = track?.measures[bar]?.beats ?? [];
    bm.beats.forEach((m, beat) => {
      const b = beats[beat];
      if (!b) return;
      m.notes.forEach((nm, note) => {
        const n = b.notes[note];
        if (!n || nm.checked || nm.confidence >= GUESS) return;
        out.push({ kind: 'note', bar, beat, note, text: nm.reasons[0] ?? `The reader was not sure about fret ${n.fret} on string ${n.string}.` });
      });
      if (!m.checked && m.confidence < GUESS && !bm.estimated) out.push({ kind: 'rhythm', bar, beat, note: null, text: m.reasons[0] ?? 'The reader was not sure how long this lasts.' });
    });
    const c = checkBar(draft.song, bar);
    if (!c.ok) out.push({ kind: 'bar', bar, beat: null, note: null, text: `Bar ${bar + 1}: ${c.text.charAt(0).toLowerCase()}${c.text.slice(1)}.` });
  });
  return out;
}

function order(i: { bar: number; beat: number | null; note: number | null }): number {
  return i.bar * 1e6 + (i.beat ?? -1) * 100 + (i.note ?? -1);
}

/** The next thing to check after the selection (wrapping round), or null when all is checked. */
export function nextToCheck(draft: Draft, sel: Selection | null): CheckItem | null {
  const items = itemsToCheck(draft);
  if (!items.length) return null;
  if (!sel) return items[0];
  const here = order({ bar: sel.bar, beat: sel.beat, note: sel.note });
  return items.find((i) => order(i) > here) ?? items[0];
}

/** Is this note a guess the learner has not checked? */
export function isDoubtful(draft: Draft, bar: number, beat: number, note: number): boolean {
  const m = draft.marks[bar]?.beats[beat]?.notes[note];
  return !!m && !m.checked && m.confidence < GUESS;
}

// ------------------------------------------------------------------------------------------
// Undo history
// ------------------------------------------------------------------------------------------

/** Undo history of drafts. */
export interface History {
  past: Draft[];
  present: Draft;
  future: Draft[];
}

/** Most steps kept for undo. */
export const HISTORY_LIMIT = 200;

/** A history holding one draft. */
export function startHistory(draft: Draft): History {
  return { past: [], present: draft, future: [] };
}

/** Make `next` the present; it can be undone. */
export function commit(h: History, next: Draft): History {
  if (next === h.present) return h;
  const past = [...h.past, h.present];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, present: next, future: [] };
}

/** Step back. */
export function undo(h: History): History {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

/** Step forward again. */
export function redo(h: History): History {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}

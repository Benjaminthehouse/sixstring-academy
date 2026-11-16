/**
 * Find-the-note drill on the live neck: "Play C on string 5". One target at a time, drawn on its
 * fret; the microphone (or a tap on the drawn neck) confirms it, and the next one comes up.
 * Targets are random but never the same note twice in a row, and natural notes only unless the
 * learner asks for sharps and flats.
 */
import { midiAt, noteAt, type Tuning } from '@/core/guitar';
import { chroma, noteFromSlug, noteSlug, pcName } from '@/core/theory';
import type { ShowNote } from './content';

/** One target: a note on one string at one fret (from the capo). */
export interface DrillTarget {
  note: string;
  string: number;
  fret: number;
  midi: number;
}

/** What the drill picks from. */
export interface DrillOptions {
  tuning: Tuning;
  capo: number;
  /** Only this string (null = any). */
  string: number | null;
  /** Only this note (null = any). */
  note: string | null;
  /** Sharps and flats too (default natural notes only). */
  accidentals?: boolean;
  /** Highest fret to ask for (default 12). */
  maxFret?: number;
}

const NATURALS = new Set([0, 2, 4, 5, 7, 9, 11]);

/** Every place the drill could ask for, in neck order. */
export function drillCandidates(o: DrillOptions): DrillTarget[] {
  const strings = o.tuning.stringCount;
  const maxFret = o.maxFret ?? 12;
  const wanted = o.note ? chroma(o.note) : null;
  const out: DrillTarget[] = [];
  for (let s = strings; s >= 1; s--) {
    if (o.string !== null && o.string !== s) continue;
    for (let f = 0; f <= maxFret; f++) {
      const pos = { string: s, fret: f };
      const midi = midiAt(pos, { tuning: o.tuning, capo: o.capo });
      const pc = ((midi % 12) + 12) % 12;
      if (wanted !== null ? pc !== wanted : !o.accidentals && !NATURALS.has(pc)) continue;
      const spelled = wanted !== null && o.note ? pcName(o.note) : pcName(noteAt(pos, { tuning: o.tuning, capo: o.capo, octave: false }));
      out.push({ note: spelled, string: s, fret: f, midi });
    }
  }
  return out;
}

/** The next target: random, not the previous note again (when there is a choice). `random` returns 0..1. */
export function nextTarget(o: DrillOptions, previous: DrillTarget | null, random: () => number = Math.random): DrillTarget | null {
  const all = drillCandidates(o);
  if (all.length === 0) return null;
  const fresh = previous ? all.filter((t) => chroma(t.note) !== chroma(previous.note) || (o.note !== null && (t.string !== previous.string || t.fret !== previous.fret))) : all;
  const pool = fresh.length > 0 ? fresh : all;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

/** The target as a note to draw (pulsing, or an outline while the answer is hidden). */
export function drillNote(t: DrillTarget): ShowNote {
  return { string: t.string, fret: t.fret, midi: t.midi, note: t.note, degree: '', root: false, target: true };
}

/** Whether a heard pitch answers the target: the same pitch, or the same note an octave away when `anyOctave`. */
export function answers(t: DrillTarget, midi: number, anyOctave = false): boolean {
  if (midi === t.midi) return true;
  return anyOctave && ((midi - t.midi) % 12 + 12) % 12 === 0;
}

/** Params-safe spelling of a target note (`f-sharp`). */
export function noteParam(note: string): string {
  return noteSlug(note);
}

/** The note a param names, or null. */
export function noteFromParam(param: string): string | null {
  return noteFromSlug(param) ?? null;
}

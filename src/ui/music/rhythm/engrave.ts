/**
 * How the notes of one bar of a rhythm grid are engraved: which notes are beamed (and with how
 * many beams, stubs included), where tuplet numbers and brackets go, and which notes are tied in.
 * Pure: the same beaming and tuplet rules as the tab's rhythm (`../tab/rhythm`), worked out per bar
 * so every bar of a figure is drawn by the same rules, whatever came before it.
 */
import type { NoteValue } from '@/core/song';
import type { NoteValueId } from '@/core/theory';
import { beamGroups, beamSegments, tupletGroups, tupletMatchesBeam, type RhythmEvent } from '../tab/rhythm';
import type { RhythmGrid } from './model';

/** A beam drawn from a note's stem: to the next note's stem, or a short stub to one side. */
export interface BeamPiece {
  /** 1 = the main beam, 2 = the sixteenth beam … */
  level: number;
  to: 'next' | 'stub-left' | 'stub-right';
}

/** What one note that starts in a bar carries besides its head. */
export interface BarNoteMarks {
  /** Index into `grid.notes`. */
  note: number;
  /** Grid steps the note covers in this bar. */
  cols: number;
  /** Part of a beamed group: drawn without a flag. */
  beamed: boolean;
  beams: BeamPiece[];
  /** On the first note of a tuplet: its number, the steps from this stem to the last note's stem, and whether it needs a bracket (it does unless one beam holds exactly its notes). */
  tuplet?: { number: number; spanCols: number; bracket: boolean };
  /** A tie arrives at this note: from the note before in this bar (`prevCols` steps back), or across the barline. */
  tie?: { from: 'prev'; prevCols: number } | { from: 'barline' };
  /** A tie leaves this note across the barline to the next bar. */
  tieOut: boolean;
}

const BASE: Partial<Record<NoteValueId, number>> = { whole: 1, half: 2, quarter: 4, eighth: 8, sixteenth: 16, 'thirty-second': 32 };

/** The engraving marks of every note that starts in `bar` of a grid. */
export function barMarks(grid: RhythmGrid, bar: number): BarNoteMarks[] {
  const cells = grid.cells.filter((c) => c.bar === bar);
  const starts = cells.filter((c) => c.onset !== null);
  const colsOf = (note: number) => cells.filter((c) => c.note === note).length;
  const events: RhythmEvent[] = starts.map((c) => {
    const n = grid.notes[c.onset!];
    const base = BASE[n.value];
    const value: NoteValue | null = base ? { base, ...(n.dots ? { dots: n.dots } : {}), ...(n.triplet ? { tuplet: { actual: 3, normal: 2 } } : {}) } : null;
    return { start: c.inBar * grid.stepTicks, duration: n.ticks, value, rest: n.rest };
  });
  const time = { numerator: grid.time.numerator, denominator: grid.time.denominator };
  const beams = beamGroups(events, time, grid.time.barTicks);
  const out: BarNoteMarks[] = starts.map((c) => {
    const note = c.onset!;
    const n = grid.notes[note];
    const prev = grid.notes[note - 1];
    let tie: BarNoteMarks['tie'];
    if (n.tied && prev) {
      const prevStartsHere = starts.some((s) => s.onset === note - 1);
      tie = prevStartsHere ? { from: 'prev', prevCols: colsOf(note - 1) } : { from: 'barline' };
    }
    const next = grid.notes[note + 1];
    const nextStartsHere = starts.some((s) => s.onset === note + 1);
    return { note, cols: colsOf(note), beamed: false, beams: [], ...(tie ? { tie } : {}), tieOut: !!next?.tied && !nextStartsHere };
  });
  for (const group of beams) {
    for (const i of group) out[i].beamed = true;
    for (const seg of beamSegments(group, events)) {
      if (seg.stub) out[seg.from].beams.push({ level: seg.level, to: seg.stub === 'left' ? 'stub-left' : 'stub-right' });
      else for (let k = group.indexOf(seg.from); k < group.indexOf(seg.to); k++) out[group[k]].beams.push({ level: seg.level, to: 'next' });
    }
  }
  for (const t of tupletGroups(events)) {
    const first = t.events[0];
    const last = t.events[t.events.length - 1];
    const spanCols = Math.round((events[last].start - events[first].start) / grid.stepTicks);
    out[first].tuplet = { number: t.actual, spanCols, bracket: !tupletMatchesBeam(t, beams) };
  }
  return out;
}

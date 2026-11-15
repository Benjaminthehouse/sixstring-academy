/**
 * Oracle staff recognizers: they "read" a staff by looking the answer up in the ground truth.
 * Used to test the assembler and the metrics end to end, and as a worked example of what a real
 * recognizer returns (events with boxes in page px, built through `input.toPageBox` or, as here,
 * taken directly in page coordinates).
 */
import {
  type AccidentalType, type BBox, type OmrNotationEvent, type OmrNote, type OmrTabEvent, type OmrTabNote, type StaffInput, type StaffReading,
  type StaffRecognizers, type StepName, durationTicks,
} from '../types';
import type { Box, GroundTruth, GtNotationStaff, GtStaff, GtTabStaff } from './truth';
import { gtStaves } from './truth';

const box = (b: Box): BBox => ({ x: b[0], y: b[1], w: b[2], h: b[3] });
const ACC: Record<string, AccidentalType> = { '#': 'sharp', b: 'flat', n: 'natural', '##': 'double-sharp', bb: 'double-flat' };

/** The ground-truth staff whose lines the strip was cut from (by position on the page). */
export function truthStaffFor(input: StaffInput, truth: GroundTruth): GtStaff | null {
  const mid = input.toPage((input.x0 + input.x1) / 2, (input.lineYs[0] + input.lineYs[input.lineCount - 1]) / 2);
  let best: GtStaff | null = null;
  let bestD = Infinity;
  for (const { staff } of gtStaves(truth)) {
    const k = staff.lines[0].length >> 1;
    const cy = (staff.lines[0][k].y + staff.lines[staff.lineCount - 1][k].y) / 2;
    const cx = (staff.x0 + staff.x1) / 2;
    const d = Math.abs(cy - mid.y) + 0.1 * Math.abs(cx - mid.x);
    if (d < bestD) {
      bestD = d;
      best = staff;
    }
  }
  return best && bestD < 3 * best.space ? best : null;
}

/** A perfect reading of a notation staff. */
export function oracleNotation(staff: GtNotationStaff): StaffReading<OmrNotationEvent> {
  const events: OmrNotationEvent[] = [];
  for (const m of staff.measures) {
    for (const e of m.events) {
      const duration = {
        value: e.duration.value,
        dots: e.duration.dots as 0 | 1 | 2,
        tuplet: e.duration.tuplet,
        ticks: durationTicks(e.duration.value, e.duration.dots, e.duration.tuplet),
        confidence: 1,
      };
      const notes: OmrNote[] = e.notes.map((n) => ({
        id: '',
        bbox: box(n.head),
        confidence: 1,
        staffPosition: n.pos,
        head: n.headType,
        pitch: { step: n.step as StepName, alter: n.alter, octave: n.octave, written: n.written, midi: n.midi },
        accidental: n.accidental && n.accBox ? { id: '', bbox: box(n.accBox), confidence: 1, type: ACC[n.accidental] } : undefined,
        tieStart: n.tieStart || undefined,
        tieStop: n.tieStop || undefined,
      }));
      const b = e.bbox ?? e.head ?? ([e.x - 1, staff.lines[0][0].y, 2, 2] as Box);
      events.push({
        id: '',
        bbox: box(b),
        confidence: 1,
        kind: e.type === 'rest' ? 'rest' : 'chord',
        x: e.x,
        notes,
        duration,
        stem: e.stem ?? undefined,
      });
    }
  }
  const clefBox = staff.clef?.bbox;
  return {
    events,
    clef: clefBox ? { id: '', bbox: box(clefBox), confidence: 1, type: 'treble-8vb' } : undefined,
    keySignature: staff.key ? { id: '', bbox: staff.key.bbox ? box(staff.key.bbox) : { x: staff.x0, y: staff.lines[0][0].y, w: 0, h: 0 }, confidence: 1, fifths: staff.key.fifths } : undefined,
    timeSignature: staff.time?.bbox ? { id: '', bbox: box(staff.time.bbox), confidence: 1, beats: staff.time.num, beatValue: staff.time.den } : undefined,
    confidence: 1,
  };
}

/** A perfect reading of a tab staff (rhythm only when stems are printed). */
export function oracleTab(staff: GtTabStaff): StaffReading<OmrTabEvent> {
  const events: OmrTabEvent[] = [];
  for (const m of staff.measures) {
    for (const e of m.events) {
      if (e.hidden || (e.type === 'rest' && !e.bbox)) continue;
      const notes: OmrTabNote[] = e.notes.map((n) => ({ id: '', bbox: box(n.bbox), confidence: 1, string: n.string, fret: n.fret, midi: n.midi }));
      const b = e.bbox ?? ([e.x - 1, staff.lines[0][0].y, 2, 2] as Box);
      events.push({
        id: '',
        bbox: box(b),
        confidence: 1,
        kind: e.type === 'rest' ? 'tab-rest' : 'tab',
        x: e.x,
        notes,
        duration: staff.stems
          ? { value: e.duration.value, dots: e.duration.dots as 0 | 1 | 2, tuplet: e.duration.tuplet, ticks: durationTicks(e.duration.value, e.duration.dots, e.duration.tuplet), confidence: 1 }
          : undefined,
      });
    }
  }
  return { events, confidence: 1 };
}

/** Recognizers that answer from the ground truth of the page being read. */
export function oracleRecognizers(truth: GroundTruth): StaffRecognizers {
  return {
    notation: (input) => {
      const st = truthStaffFor(input, truth);
      return st && st.kind === 'notation' ? oracleNotation(st) : { events: [], confidence: 0 };
    },
    tab: (input) => {
      const st = truthStaffFor(input, truth);
      return st && st.kind === 'tab' ? oracleTab(st) : { events: [], confidence: 0 };
    },
  };
}

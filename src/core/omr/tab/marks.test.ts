/**
 * Technique marks drawn between numbers: ties and slurs (arcs), slides, bends.
 */
import { describe, expect, it } from 'vitest';
import { synthStaff } from './dev/synth';
import { readTabStaff } from './recognize';

type Ink = (x: number, y: number, value?: number) => void;

/** An arc over two numbers of a line, from x = a to x = b, rising `bow` px. */
function arc(ink: Ink, a: number, b: number, y: number, bow: number): void {
  for (let x = a; x <= b; x++) {
    const t = (x - a) / (b - a);
    const yy = y - 4 * bow * t * (1 - t);
    for (let d = 0; d < 2; d++) ink(x, yy + d);
  }
}

function line(ink: Ink, x0: number, y0: number, x1: number, y1: number): void {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  for (let i = 0; i <= n; i++) for (let d = 0; d < 2; d++) ink(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n + d);
}

describe('marks between numbers', () => {
  it('reads an arc as a tie between equal frets and as hammer-on or pull-off otherwise', () => {
    const { input } = synthStaff({
      items: [
        { line: 2, x: 150, text: '5' }, { line: 2, x: 250, text: '5' },
        { line: 3, x: 350, text: '7' }, { line: 3, x: 450, text: '9' },
        { line: 1, x: 550, text: '12' }, { line: 1, x: 660, text: '10' },
        { line: 4, x: 760, text: '3' }, { line: 4, x: 830, text: '3' }, // no arc
      ],
      draw: (ink, g) => {
        arc(ink, 157, 253, g.lineYs[2] - 13, 9);
        arc(ink, 357, 453, g.lineYs[3] - 13, 9);
        arc(ink, 563, 668, g.lineYs[1] - 13, 9);
      },
    });
    const { reading, debug } = readTabStaff(input);
    const notes = reading.events.map((e) => e.notes[0]);
    expect(notes.map((n) => n.fret)).toEqual([5, 5, 7, 9, 12, 10, 3, 3]);
    expect(notes.map((n) => `${n.tieStop ? 't' : ''}${n.technique ?? ''}`)).toEqual(['', 't', 'h', '', 'p', '', '', '']);
    expect(debug.marks.map((m) => m.kind)).toEqual(['slur', 'tie', 'slur']);
  });

  it('reads slides up and down, and no slide where the line between two numbers is bare', () => {
    const { input } = synthStaff({
      items: [
        { line: 2, x: 150, text: '5' }, { line: 2, x: 240, text: '7' },
        { line: 4, x: 350, text: '10' }, { line: 4, x: 460, text: '8' },
        { line: 1, x: 560, text: '2' }, { line: 1, x: 650, text: '4' },
      ],
      draw: (ink, g) => {
        line(ink, 167, g.lineYs[2] + 6, 234, g.lineYs[2] - 7);
        line(ink, 380, g.lineYs[4] - 7, 454, g.lineYs[4] + 6);
      },
    });
    const notes = readTabStaff(input).reading.events.map((e) => e.notes[0]);
    expect(notes.map((n) => n.fret)).toEqual([5, 7, 10, 8, 2, 4]);
    expect(notes.map((n) => n.technique ?? '')).toEqual(['/', '', '\\', '', '', '']);
  });

  it('reads a bend arrow that climbs above the staff, and does not take a bar line for one', () => {
    const { input } = synthStaff({
      bars: [600],
      items: [{ line: 1, x: 200, text: '7' }, { line: 2, x: 400, text: '9' }, { line: 0, x: 570, text: '5' }],
      draw: (ink, g) => {
        const tipY = g.lineYs[0] - 38;
        // Shaft and arrow head, a space and a half right of the 7.
        for (let y = tipY + 8; y <= g.lineYs[1] - 6; y++) for (let d = 0; d < 2; d++) ink(245 + d, y);
        for (let k = 0; k < 12; k++) for (let x = -Math.round(k * 0.55); x <= Math.round(k * 0.55) + 1; x++) ink(245 + x, tipY + k);
        for (let x = 216; x <= 245; x++) ink(x, g.lineYs[1] - 6 + Math.round(((245 - x) * (245 - x)) / 140));
      },
    });
    const notes = readTabStaff(input).reading.events.map((e) => e.notes[0]);
    expect(notes.map((n) => n.fret)).toEqual([7, 9, 5]);
    expect(notes.map((n) => n.technique ?? '')).toEqual(['b', '', '']);
  });
});

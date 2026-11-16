/**
 * Shared machinery for importers: timed onsets laid out into full bars (rests where nothing
 * sounds, a beat lasting until the next onset, notes held over a bar line continued as ties),
 * quantisation, and small text helpers.
 */
import { midiOf, restBeats, valueFromTicks } from './model';
import type { Beat, Measure, Note } from './types';

/** A note of an onset: its pitch, and string/fret when the source knows them. */
export interface OnsetNote extends Partial<Omit<Note, 'midi'>> {
  midi: number;
  /** How long it sounds in ticks (default: until the next onset). */
  sustain?: number;
}

/** Notes struck together at an absolute tick. */
export interface Onset {
  tick: number;
  notes: OnsetNote[];
  lyric?: string;
  stroke?: Beat['stroke'];
  slash?: boolean;
  /** The whole onset is accented (`Beat.accent`): an accented slash or strum. */
  accent?: boolean;
  text?: string;
  /** How long the onset lasts when nothing says otherwise (a slash has no notes to carry a sustain). */
  length?: number;
}

/** Options for `buildMeasures`. */
export interface BuildOptions {
  tuning: number[];
  capo: number;
  /** Shortest rest worth writing after a note that ends early (ticks; default a sixteenth, 240). */
  minRest?: number;
}

/**
 * Lay onsets out into bars given each bar's absolute start and length. Onsets must already be on
 * the grid you want. Notes without string/fret get string 0 (`arrangeTrack` places them later).
 */
export function buildMeasures(onsets: readonly Onset[], bars: ReadonlyArray<{ start: number; length: number }>, opts: BuildOptions): Measure[] {
  const sorted = [...onsets].sort((a, b) => a.tick - b.tick);
  const minRest = opts.minRest ?? 240;
  const measures: Measure[] = [];
  let k = 0;
  /** Notes still sounding into the next bar: what is left of them, in ticks. */
  let carry: Array<{ note: Note; left: number }> = [];
  for (const bar of bars) {
    const end = bar.start + bar.length;
    const beats: Beat[] = [];
    const inBar: Onset[] = [];
    while (k < sorted.length && sorted[k].tick < end) {
      if (sorted[k].tick >= bar.start) inBar.push(sorted[k]);
      k++;
    }
    let at = 0;
    const firstAt = inBar.length ? inBar[0].tick - bar.start : bar.length;
    let carryNext: typeof carry = [];
    if (carry.length && firstAt > 0) {
      // Continue what rings over the bar line, as ties, up to the first onset or until it ends.
      const hold = Math.min(firstAt, Math.max(...carry.map((c) => c.left)));
      const tied = carry.map((c) => {
        const { length: _l, ...rest } = c.note;
        void _l;
        return { ...rest, tie: true, legato: undefined, slide: undefined, slideIn: undefined } as Note;
      }).map(cleanNote);
      beats.push({ start: 0, duration: hold, notes: tied, ...(valueFromTicks(hold) ? { value: valueFromTicks(hold)! } : {}) });
      at = hold;
      // Still ringing at the end of an empty bar: carry on into the next one.
      if (hold === bar.length) carryNext = carry.map((c, i) => ({ note: tied[i], left: c.left - hold })).filter((c) => c.left > 0);
    }
    carry = carryNext;
    if (at < firstAt) {
      beats.push(...restBeats(at, firstAt));
      at = firstAt;
    }
    inBar.forEach((o, i) => {
      const startInBar = o.tick - bar.start;
      if (startInBar < at) return;
      const next = i + 1 < inBar.length ? inBar[i + 1].tick - bar.start : bar.length;
      const gap = next - startInBar;
      const notes: Note[] = o.notes.map((n) => toNote(n, opts));
      const longest = o.length ?? Math.max(0, ...o.notes.map((n) => n.sustain ?? gap));
      let duration = gap;
      if (longest > 0 && gap - longest >= minRest) duration = longest;
      const beat: Beat = { start: startInBar, duration, notes };
      if (o.lyric) beat.lyric = o.lyric;
      if (o.stroke) beat.stroke = o.stroke;
      if (o.slash) beat.slash = true;
      if (o.accent) beat.accent = true;
      if (o.text) beat.text = o.text;
      const v = valueFromTicks(duration);
      if (v) beat.value = v;
      // Notes held longer than their beat (a bass under a moving melody) keep their length.
      o.notes.forEach((n, j) => {
        if (n.sustain !== undefined && n.sustain > duration + minRest / 2 && i + 1 < inBar.length) notes[j].length = Math.min(n.sustain, bar.length - startInBar);
      });
      beats.push(beat);
      at = startInBar + duration;
      if (at < next) {
        beats.push(...restBeats(at, next));
        at = next;
      }
      if (i === inBar.length - 1) {
        carry = o.notes
          .map((n, j) => ({ note: notes[j], left: (n.sustain ?? 0) - (bar.length - startInBar) }))
          .filter((c) => c.left >= minRest && !c.note.dead);
      }
    });
    if (at < bar.length) beats.push(...restBeats(at, bar.length));
    measures.push({ beats });
  }
  return measures;
}

/** Drop keys whose value is undefined, so notes compare and serialise cleanly. */
function cleanNote(n: Note): Note {
  for (const k of Object.keys(n) as Array<keyof Note>) if (n[k] === undefined) delete n[k];
  return n;
}

function toNote(n: OnsetNote, opts: BuildOptions): Note {
  const { sustain: _sustain, ...rest } = n;
  void _sustain;
  const note: Note = { string: 0, fret: 0, ...rest, midi: n.midi };
  if (n.string !== undefined && n.fret !== undefined && n.string > 0) {
    const m = midiOf(n.string, n.fret, opts.tuning, opts.capo);
    if (Number.isFinite(m)) note.midi = m;
  }
  return note;
}

/** Round a tick to the nearest multiple of `grid`. */
export function quantize(tick: number, grid: number): number {
  return Math.round(tick / grid) * grid;
}

/**
 * The grid (ticks) that fits a set of onset ticks best: straight sixteenths or eighth triplets,
 * whichever leaves the smaller error (sixteenths win ties). `ppq` is the source's resolution.
 */
export function chooseGrid(ticks: readonly number[], quarter = 960): number {
  const candidates = [quarter / 4, quarter / 3, quarter / 6, quarter / 8];
  let best = candidates[0];
  let bestErr = Infinity;
  candidates.forEach((g, i) => {
    let err = 0;
    for (const t of ticks) err += Math.abs(t - quantize(t, g));
    // Finer grids always fit better: make them earn it.
    err = err / Math.max(1, ticks.length) + i * quarter * 0.012;
    if (err < bestErr - 1e-9) {
      best = g;
      bestErr = err;
    }
  });
  return best;
}

/** Replace tab characters by spaces up to the next tab stop (every 8 columns), so lines typed with tabs keep their alignment. */
export function expandTabs(line: string, size = 8): string {
  if (!line.includes('\t')) return line;
  let out = '';
  for (const c of line) {
    if (c === '\t') out += ' '.repeat(size - (out.length % size));
    else out += c;
  }
  return out;
}

/** First match of a regular expression in any of the lines, with its line index. */
export function findHint(lines: readonly string[], re: RegExp): { match: RegExpExecArray; line: number } | null {
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]);
    if (m) return { match: m, line: i };
  }
  return null;
}

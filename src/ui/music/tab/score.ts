/**
 * Standard notation for the staff above the tab, without VexFlow: each column's pitches spelled
 * in the key in force (written an octave up, treble clef 8vb), which accidentals print (key
 * signature, bar-long alterations, naturals, ties), how far notes and stems reach above and below
 * the staff, and how much room the staff needs around each column. The layout uses this to space
 * and size systems; `ScoreLayer` hands the same data to VexFlow.
 *
 * Supported: single-voice music (every song track), chords, rests, dots, ties, tuplets, beams
 * (the tab's own beam groups), accents and staccato, dead notes (x heads), natural harmonics at
 * their sounding pitch, rhythm slashes, key and time changes, repeats. Not drawn on the staff (the
 * tab shows them): bends, slides, slurs, vibrato, palm mute; a note held longer than its beat
 * (`length`, from merged voices) is written with the beat's length.
 */
import { soundingPitch } from '@/core/song';
import { keySpec, measureAccidentals, type AccidentalGlyph } from '../notation/model';
import { spellLine, type SpellEvent } from '../notation/spell';
import type { NotationSpacing } from './layout';
import type { TabColumn, TabMeasure, TabModel } from './model';

/** One column on the staff. */
export interface ScoreColumn {
  /** Spelled sounding pitches, low to high (`F#3`), or none for a rest. */
  keys: string[];
  /** Written diatonic steps (octave * 7 + letter), parallel to `keys`. */
  steps: number[];
  accidentals: AccidentalGlyph[];
  rest: boolean;
  slash: boolean;
  /** Per key: an x notehead (dead note). */
  dead: boolean[];
  /** Per key: tied from the same pitch in the column before. */
  tiedFrom: boolean[];
  duration: string;
  dots: number;
  accent: boolean;
  staccato: boolean;
}

/** One measure on the staff. */
export interface ScoreMeasure {
  columns: ScoreColumn[];
  fifths: number;
  /** VexFlow key signature name (the major key). */
  keyVex: string;
}

/** The staff model of a whole tab model. */
export interface ScoreModel {
  measures: ScoreMeasure[];
}

const DURATION: Record<number, string> = { 1: 'w', 2: 'h', 4: 'q', 8: '8', 16: '16', 32: '32', 64: '64' };
const LETTERS = 'CDEFGAB';

/** Written diatonic step of a sounding pitch name in the guitar's treble 8vb clef: `E2` (low E) is written E3. */
export function writtenStep(name: string): number {
  const m = /^([A-G])([#bx]*)(-?\d+)$/.exec(name);
  if (!m) return 34;
  return (Number(m[3]) + 1) * 7 + LETTERS.indexOf(m[1]);
}

/** Staff position of a written step: 0 = top line (F5), positive downward, in half spaces. */
export function staffOffset(step: number): number {
  return 38 - step;
}

/** Options of `buildScore`. */
export interface BuildScoreOptions {
  /** Names that win whenever their pitch class sounds (`['Bb']`): the text's spelling of a blue note, say. */
  spellings?: readonly string[];
}

/** A column's pitches as they sound, low to high, with the tab note each one comes from. */
function pitchedNotes(c: TabColumn): Array<{ midi: number; n: TabColumn['notes'][number] }> {
  if (c.rest || (c.slash && !c.notes.length)) return [];
  return c.notes
    .map((n) => ({ midi: n.note.dead ? n.note.midi : n.note.harmonic === 'natural' ? soundingPitch(n.note) ?? n.note.midi : n.note.midi, n }))
    .sort((a, b) => a.midi - b.midi);
}

/**
 * Build the staff model of a tab model (pure). Pitches are spelled along the whole line (see
 * `spellLine`): in the key, as chord tones of the chord in force, the blues' flat notes, by the
 * direction the line takes, or as `opts.spellings` says.
 */
export function buildScore(model: TabModel, opts: BuildScoreOptions = {}): ScoreModel {
  // The line: every column of every measure in order, with the key and chord in force.
  const events: SpellEvent[] = [];
  const pitched: Array<ReturnType<typeof pitchedNotes>> = [];
  let chord: string | null = null;
  for (const m of model.measures) {
    let ci = 0;
    for (const c of m.columns) {
      while (ci < m.chords.length && m.chords[ci].tick <= c.start) chord = m.chords[ci++].symbol;
      const notes = pitchedNotes(c);
      pitched.push(notes);
      events.push({ midi: notes.map((p) => p.midi), key: m.key, chord, tied: notes.map((p) => p.n.tied) });
    }
    while (ci < m.chords.length) chord = m.chords[ci++].symbol;
  }
  const names = spellLine(events, { spellings: opts.spellings });

  const measures: ScoreMeasure[] = [];
  let prevKeys: string[] = [];
  let at = 0;
  for (const m of model.measures) {
    const spec = keySpec(m.key);
    const columns: ScoreColumn[] = m.columns.map((c) => {
      const col = scoreColumn(c, pitched[at], names[at], prevKeys);
      at++;
      if (!c.rest) prevKeys = col.keys;
      else prevKeys = [];
      return col;
    });
    const acc = measureAccidentals(
      columns.map((c) => ({ keys: c.rest || c.slash ? [] : c.keys, continuation: false })),
      spec.fifths,
    );
    // A tied note keeps the accidental of the note it continues; nothing is reprinted on it.
    columns.forEach((c, i) => {
      c.accidentals = c.keys.map((_k, k) => (c.tiedFrom[k] ? null : acc[i]?.[k] ?? null));
    });
    measures.push({ columns, fifths: spec.fifths, keyVex: spec.vex });
  }
  return { measures };
}

function scoreColumn(c: TabColumn, pitched: ReturnType<typeof pitchedNotes>, spelled: readonly string[], prevKeys: readonly string[]): ScoreColumn {
  const value = c.value;
  const duration = DURATION[value?.base ?? 4] ?? 'q';
  const dots = value?.dots ?? 0;
  if (c.rest || (c.slash && !c.notes.length)) {
    return { keys: [], steps: [], accidentals: [], rest: c.rest, slash: c.slash, dead: [], tiedFrom: [], duration, dots, accent: false, staccato: false };
  }
  const seen = new Set<string>();
  const keys: string[] = [];
  const dead: boolean[] = [];
  const tiedFrom: boolean[] = [];
  pitched.forEach((p, i) => {
    const name = spelled[i];
    if (seen.has(name)) return;
    seen.add(name);
    keys.push(name);
    dead.push(!!p.n.note.dead);
    tiedFrom.push(p.n.tied && prevKeys.includes(name));
  });
  return {
    keys,
    steps: keys.map(writtenStep),
    accidentals: keys.map(() => null),
    rest: false,
    slash: c.slash && !c.notes.length,
    dead,
    tiedFrom,
    duration,
    dots,
    accent: c.flags.accent,
    staccato: c.flags.staccato,
  };
}

/** How far a column reaches above (negative) and below the staff's top line, at zoom 1 with 10 px between lines. */
export function columnReach(c: ScoreColumn): { top: number; bottom: number } {
  if (c.rest || !c.steps.length) return { top: 4, bottom: 36 };
  const ys = c.steps.map((s) => staffOffset(s) * 5);
  const hi = Math.min(...ys);
  const lo = Math.max(...ys);
  // VexFlow turns stems down when the note furthest from the middle line is above it.
  const middle = 20;
  const down = Math.abs(hi - middle) > Math.abs(lo - middle) ? hi < middle : lo < middle && hi < middle;
  const stem = c.duration === 'w' ? 0 : 36;
  let top = hi - 6;
  let bottom = lo + 6;
  if (stem) {
    if (down) bottom = Math.max(bottom, lo + stem);
    else top = Math.min(top, hi - stem);
  }
  if (c.accent || c.staccato) {
    if (down) top -= 10;
    else bottom += 10;
  }
  return { top, bottom };
}

// Measured from VexFlow 4 (Bravura): the treble clef with its 8 ends 32 px into the stave, each
// sharp adds 11.1 and each flat 10.1 after 10 px of padding, a time signature adds 32.
const CLEF_W = 34;
const KEY_ACC_W = 11.2;
const TIME_W = 32.5;
const STAFF_H = 40;

/** Vertical layout of the staff region for some measures: where the top line goes and how tall the region is (zoom 1). */
export function regionMetrics(score: ScoreModel, measureIndices: readonly number[]): { staffY: number; height: number } {
  let top = -8;
  let bottom = STAFF_H + 22; // the small 8 under the clef
  for (const i of measureIndices) {
    for (const c of score.measures[i]?.columns ?? []) {
      const r = columnReach(c);
      top = Math.min(top, r.top);
      bottom = Math.max(bottom, r.bottom);
    }
  }
  const staffY = -top + 6;
  return { staffY, height: Math.ceil(staffY + bottom + 6) };
}

/** Width of a key signature at zoom 1. */
export function keySignatureWidth(fifths: number): number {
  return fifths ? Math.abs(fifths) * KEY_ACC_W + 10 : 0;
}

/** The spacing interface the tab layout consumes. */
export function scoreSpacing(score: ScoreModel, model: TabModel): NotationSpacing {
  return {
    headerWidth: (mi) => CLEF_W + keySignatureWidth(score.measures[mi]?.fifths ?? 0) + 4,
    columnExtent: (mi, ci) => {
      const c = score.measures[mi]?.columns[ci];
      if (!c) return null;
      if (c.rest || !c.keys.length) return { left: 6, right: 6 };
      const accCols = Math.min(3, c.accidentals.filter(Boolean).length);
      const second = c.steps.some((s, k) => k > 0 && s - c.steps[k - 1] === 1);
      const flagged = ['8', '16', '32', '64'].includes(c.duration);
      // VexFlow sets an accidental about 3 px off the head and a flat or sharp is 8-10 px wide: room
      // for that and a little air, so the first note of a bar never draws its accidental over the barline.
      return { left: 6.5 + accCols * 10.5 + (accCols ? 3.5 : 0), right: 6.5 + c.dots * 5 + (second ? 10 : 0) + (flagged ? 3 : 0) };
    },
    regionHeight: (indices) => regionMetrics(score, indices).height,
    measureLead: (mi) => {
      const m = model.measures[mi];
      // The staff's time signature is wider than the tab's (32 against 22 px).
      const time = m?.showTime ? TIME_W - 22 : 0;
      if (!m?.keyChange || mi === 0) return time;
      const prev = score.measures[mi - 1]?.fifths ?? 0;
      const now = score.measures[mi]?.fifths ?? 0;
      // A key change prints the new signature, after naturals cancelling what it drops.
      const cancelled = Math.sign(prev) !== Math.sign(now) ? Math.abs(prev) : Math.max(0, Math.abs(prev) - Math.abs(now));
      return time + keySignatureWidth(now) + (cancelled ? cancelled * KEY_ACC_W + 4 : 0) + 6;
    },
  };
}

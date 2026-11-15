/**
 * Arranging a backing track: turn a chord progression (plain data) and a style into a list of
 * timed events for drums, bass, keys and a rhythm guitar. Pure and deterministic for a given seed,
 * so it is unit-tested note by note; `BackingBand` plays the result through the Transport.
 *
 * The harmony comes in as pitch classes only (this module does not depend on the theory module):
 * the bass and the voicings are derived from the chord tones that are given.
 */
import { Rng, clamp, hashSeed } from './dsp';
import { BACKING_STYLES, type BackingStyle, type BackingStyleId, type DrumBar } from './backing-styles';
import type { DrumName } from './percussion';
import { PPQ, resolveMeter, type TimeSignature } from './timeline';
import type { Articulation, BassTone, ToneName } from './tones';

/** A chord as the band needs it: pitch classes (C = 0) and a symbol to show. */
export interface BackingChord {
  /** Pitch class of the root, 0..11. */
  root: number;
  /** Pitch classes of the chord tones, root included. */
  tones: number[];
  /** Symbol for display, e.g. "Am7". */
  symbol: string;
  /** Pitch class of the bass note for slash chords (C/E -> 4). */
  bass?: number;
}

/**
 * One bar of a progression:
 *  - a chord: it lasts the whole bar;
 *  - null: the previous chord continues;
 *  - an array of chords (or nulls): the bar is split evenly between them, by beats;
 *  - an array of `{ beat, chord }`: chords placed on beats (0-based).
 */
export type BackingBar =
  | BackingChord
  | null
  | ReadonlyArray<BackingChord | null>
  | ReadonlyArray<{ beat: number; chord: BackingChord }>;

/** A stretch of time during which one chord sounds. */
export interface ChordSegment {
  chord: BackingChord;
  startTick: number;
  endTick: number;
  /** Bar index from the start of the arrangement, and beat within that bar. */
  bar: number;
  beat: number;
  /** Which pass through the progression (0-based); the ending bar belongs to the last chorus. */
  chorus: number;
  /** True for the final held chord. */
  ending: boolean;
}

/** Band members that can be mixed separately. */
export type BackingInstrument = 'drums' | 'bass' | 'keys' | 'guitar';

/** All band members. */
export const BACKING_INSTRUMENTS: readonly BackingInstrument[] = ['drums', 'bass', 'keys', 'guitar'];

/** Why the bass plays a note. */
export type BassRole = 'root' | 'chord' | 'passing' | 'approach' | 'anticipation';

/** A drum hit. */
export interface DrumEvent {
  type: 'drum';
  tick: number;
  bar: number;
  drum: DrumName;
  velocity: number;
  /** True for hits that belong to a fill. */
  fill: boolean;
}

/** A bass note. */
export interface BassEvent {
  type: 'bass';
  tick: number;
  bar: number;
  midi: number;
  /** Length in ticks. */
  duration: number;
  velocity: number;
  /** Mix gain of this style's bass part. */
  level: number;
  role: BassRole;
  tone: BassTone;
}

/** A chord (or a single arpeggio note) on the keys. */
export interface KeysEvent {
  type: 'keys';
  tick: number;
  bar: number;
  midis: number[];
  duration: number;
  velocity: number;
  /** Mix gain of this style's keys part. */
  level: number;
  voice: 'epiano' | 'organ';
}

/** A strum, pluck or chug on the rhythm guitar. */
export interface GuitarEvent {
  type: 'guitar';
  tick: number;
  bar: number;
  /** Notes low to high. */
  midis: number[];
  /** Guitarist's string numbers matching `midis`. */
  strings: number[];
  /** Length in ticks; 0 = let ring. */
  duration: number;
  velocity: number;
  direction: 'down' | 'up';
  /** Seconds between first and last string. */
  spread: number;
  /** Mix gain of this style's guitar part. */
  level: number;
  tone: ToneName;
  articulation: Articulation;
}

/** Any event of an arrangement. */
export type BackingEvent = DrumEvent | BassEvent | KeysEvent | GuitarEvent;

/** A finished arrangement. */
export interface BackingArrangement {
  style: BackingStyleId;
  timeSignature: TimeSignature;
  barTicks: number;
  beatTicks: number;
  beatsPerBar: number;
  /** Bars in one pass through the progression. */
  chorusBars: number;
  choruses: number;
  /** Total bars, ending bar included. */
  bars: number;
  /** Ticks of the choruses only (the loopable part). */
  bodyTicks: number;
  /** Ticks to the end of the last bar. */
  lengthTicks: number;
  hasEnding: boolean;
  /** Events sorted by tick. */
  events: BackingEvent[];
  /** Every chord with its position, for a chord display. */
  chords: ChordSegment[];
}

/** Options for {@link arrangeBacking}. */
export interface ArrangeOptions {
  style: BackingStyleId;
  /** Passes through the progression (default 2). */
  choruses?: number;
  /** Finish with a held final chord (default true). */
  ending?: boolean;
  /** Chord of the ending (default: the first chord of the progression). */
  endingChord?: BackingChord;
  /** Seed for fills and bass-line variation (default 1). Same seed, same arrangement. */
  seed?: number;
  /** Play drum fills at the ends of sections (default true). */
  fills?: boolean;
}

// ---------------------------------------------------------------------------------------------
// Harmony helpers
// ---------------------------------------------------------------------------------------------

const mod12 = (n: number): number => ((Math.round(n) % 12) + 12) % 12;

/** Intervals in semitones above the root that the chord contains. */
export function chordIntervals(chord: BackingChord): number[] {
  const set = new Set<number>([0]);
  for (const t of chord.tones) set.add(mod12(t - chord.root));
  return [...set].sort((a, b) => a - b);
}

interface Shape {
  third: number | null;
  fifth: number;
  seventh: number | null;
  intervals: number[];
}

function shapeOf(chord: BackingChord): Shape {
  const iv = chordIntervals(chord);
  const pick = (...opts: number[]): number | null => {
    for (const o of opts) if (iv.includes(o)) return o;
    return null;
  };
  return { third: pick(4, 3, 5, 2), fifth: pick(7, 6, 8) ?? 7, seventh: pick(10, 11, 9), intervals: iv };
}

/** True when a pitch belongs to the chord (its slash bass counts). */
export function isChordTone(chord: BackingChord, midi: number): boolean {
  const pc = mod12(midi);
  if (pc === mod12(chord.root)) return true;
  if (chord.bass !== undefined && pc === mod12(chord.bass)) return true;
  return chord.tones.some((t) => mod12(t) === pc);
}

function sameChord(a: BackingChord, b: BackingChord): boolean {
  return mod12(a.root) === mod12(b.root) && a.symbol === b.symbol && (a.bass ?? -1) === (b.bass ?? -1);
}

const BASS_LOW = 28; // E1
const BASS_HIGH = 52;

/** The bass's home note for a chord: its lowest root (or slash bass) from E1 up. */
export function bassHome(chord: BackingChord): number {
  const pc = mod12(chord.bass ?? chord.root);
  return BASS_LOW + ((pc - 4 + 12) % 12);
}

/**
 * The notes a comping hand plays for a chord, as intervals above the root.
 *
 * The bass player has the root, so the right hand leaves it out whenever keeping it would hurt:
 * next to a major seventh or a flat ninth it makes a semitone cluster, and a chord with five or
 * more notes is too thick to comp with. What must stay is the third and the seventh (they are the
 * chord); colours (9, 11, 13 and their alterations) come next, and the fifth is the first to go.
 */
function compingIntervals(shape: Shape, rootless: boolean): number[] {
  let iv = shape.intervals.slice();
  const rub = iv.includes(11) || iv.includes(1);
  if (iv.length >= 4 && (rootless || rub || iv.length > 4)) iv = iv.filter((i) => i !== 0);
  if (iv.length > 4) {
    const keep = new Set<number>();
    if (shape.third !== null) keep.add(shape.third);
    if (shape.seventh !== null) keep.add(shape.seventh);
    const colours = iv.filter((i) => !keep.has(i) && i !== shape.fifth).sort((a, b) => b - a);
    for (const c of colours) if (keep.size < 4) keep.add(c);
    if (keep.size < 4) keep.add(shape.fifth);
    iv = iv.filter((i) => keep.has(i));
  }
  return iv;
}

/** A close voicing of the chord near middle C, moving as little as possible from `prev`. */
export function keysVoicing(chord: BackingChord, kind: BackingStyle['keysVoicing'], prev?: readonly number[]): number[] {
  const shape = shapeOf(chord);
  const iv = kind === 'power' ? [0, shape.fifth] : compingIntervals(shape, kind === 'rootless');
  const pcs = iv.map((i) => mod12(chord.root + i));
  const centre = prev && prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : kind === 'power' ? 52 : 62;
  let best: number[] = [];
  let bestCost = Infinity;
  // Try every inversion in every nearby octave and keep the one closest to where the hand is.
  for (let inv = 0; inv < pcs.length; inv++) {
    for (let base = 43; base <= 67; base++) {
      if (mod12(base) !== pcs[inv]) continue;
      const notes = [base];
      for (let k = 1; k < pcs.length; k++) {
        const pc = pcs[(inv + k) % pcs.length];
        let n = notes[k - 1] + 1;
        while (mod12(n) !== pc) n++;
        notes.push(n);
      }
      const mean = notes.reduce((a, b) => a + b, 0) / notes.length;
      // Two voices a semitone apart are a cluster: another inversion puts the same notes a seventh apart.
      let clusters = 0;
      for (let k = 1; k < notes.length; k++) if (notes[k] - notes[k - 1] === 1) clusters++;
      const cost = Math.abs(mean - centre) + 14 * clusters + (notes[notes.length - 1] > 76 ? 6 : 0) + (notes[0] < 48 && kind !== 'power' ? 6 : 0);
      if (cost < bestCost) {
        bestCost = cost;
        best = notes;
      }
    }
  }
  return best;
}

/** A guitar voicing: notes low to high with the strings they are played on. */
export interface GuitarVoicing {
  midis: number[];
  strings: number[];
}

/**
 * A barre-chord-shaped guitar voicing from the chord tones: root on the sixth or fifth string, then
 * fifth, seventh (or root), third, fifth, root going up, each the nearest note above the last.
 */
export function guitarVoicing(chord: BackingChord): GuitarVoicing {
  const shape = shapeOf(chord);
  const rootPc = mod12(chord.root);
  const fretOnSixth = (rootPc - 4 + 12) % 12;
  const onSixth = fretOnSixth <= 4;
  const low = onSixth ? 40 + fretOnSixth : 45 + ((rootPc - 9 + 12) % 12);
  const third = shape.third ?? shape.fifth;
  const upper = onSixth ? [shape.fifth, shape.seventh ?? 0, third, shape.fifth, 0] : [shape.fifth, shape.seventh ?? 0, third, shape.fifth];
  const midis = [low];
  for (const iv of upper) {
    const pc = mod12(rootPc + iv);
    let n = midis[midis.length - 1] + 1;
    while (mod12(n) !== pc) n++;
    midis.push(n);
  }
  if (chord.bass !== undefined && mod12(chord.bass) !== rootPc) {
    // Slash chord: the bass note replaces the lowest note, below the rest.
    let b = midis[1] - 1;
    while (mod12(b) !== mod12(chord.bass)) b--;
    midis[0] = Math.max(40, b);
    if (midis[0] >= midis[1]) midis[0] -= 12;
    if (midis[0] < 40) midis[0] += 12;
    midis.sort((a, b2) => a - b2);
  }
  const top = onSixth ? 6 : 5;
  return { midis, strings: midis.map((_, i) => top - i) };
}

/** Root, fifth and octave on the low strings. */
export function powerChord(chord: BackingChord): GuitarVoicing {
  const rootPc = mod12(chord.root);
  const fretOnSixth = (rootPc - 4 + 12) % 12;
  const onSixth = fretOnSixth <= 6;
  const low = onSixth ? 40 + fretOnSixth : 45 + ((rootPc - 9 + 12) % 12);
  const fifth = shapeOf(chord).fifth;
  const top = onSixth ? 6 : 5;
  return { midis: [low, low + fifth, low + 12], strings: [top, top - 1, top - 2] };
}

// ---------------------------------------------------------------------------------------------
// Progression -> chord segments
// ---------------------------------------------------------------------------------------------

function isChord(x: unknown): x is BackingChord {
  return !!x && typeof x === 'object' && 'root' in x && 'tones' in x;
}

/**
 * Lay one pass of the progression out in ticks. Chords never straddle a bar line here (a chord held
 * over several bars becomes one segment per bar), which is what the pattern players want.
 */
export function layoutProgression(bars: readonly BackingBar[], style: BackingStyle): ChordSegment[] {
  const barTicks = resolveMeter(style.timeSignature).barTicks;
  const B = style.beatsPerBar;
  const out: ChordSegment[] = [];
  let current: BackingChord | null = null;
  bars.forEach((bar, barIndex) => {
    const placed: Array<{ beat: number; chord: BackingChord }> = [];
    if (Array.isArray(bar)) {
      const list = bar as ReadonlyArray<BackingChord | null | { beat: number; chord: BackingChord }>;
      if (list.length && list.every((e) => e && typeof e === 'object' && 'chord' in e)) {
        for (const e of list as ReadonlyArray<{ beat: number; chord: BackingChord }>) {
          placed.push({ beat: clamp(Math.round(e.beat), 0, B - 1), chord: e.chord });
        }
        placed.sort((a, b) => a.beat - b.beat);
      } else {
        const n = Math.min(list.length, B);
        const base = Math.floor(B / Math.max(1, n));
        const extra = B - base * n;
        let beat = 0;
        for (let i = 0; i < n; i++) {
          const e = list[i];
          if (isChord(e)) placed.push({ beat, chord: e });
          beat += base + (i < extra ? 1 : 0);
        }
      }
    } else if (isChord(bar)) {
      placed.push({ beat: 0, chord: bar });
    }
    if (!placed.length || placed[0].beat > 0) {
      if (current) placed.unshift({ beat: 0, chord: current });
    }
    for (let i = 0; i < placed.length; i++) {
      const p = placed[i];
      const endBeat = i + 1 < placed.length ? placed[i + 1].beat : B;
      if (endBeat <= p.beat) continue;
      current = p.chord;
      const last = out[out.length - 1];
      if (last && last.bar === barIndex && sameChord(last.chord, p.chord)) {
        last.endTick = barIndex * barTicks + endBeat * style.beatTicks;
        continue;
      }
      out.push({
        chord: p.chord,
        startTick: barIndex * barTicks + p.beat * style.beatTicks,
        endTick: barIndex * barTicks + endBeat * style.beatTicks,
        bar: barIndex,
        beat: p.beat,
        chorus: 0,
        ending: false,
      });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// The arranger
// ---------------------------------------------------------------------------------------------

const DRUM_VELOCITY: Record<string, number> = { X: 1, x: 0.74, o: 0.36 };

interface Ctx {
  style: BackingStyle;
  rng: Rng;
  segments: ChordSegment[];
  barTicks: number;
  stepTicks: number;
  totalBars: number;
  bodyBars: number;
  chorusBars: number;
}

function segmentAt(ctx: Ctx, tick: number): ChordSegment | null {
  const s = ctx.segments;
  let lo = 0, hi = s.length - 1, hit = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s[mid].startTick <= tick) {
      hit = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (hit < 0) return null;
  return tick < s[hit].endTick ? s[hit] : null;
}

function segmentAfter(ctx: Ctx, seg: ChordSegment): ChordSegment | null {
  const i = ctx.segments.indexOf(seg);
  return i >= 0 && i + 1 < ctx.segments.length ? ctx.segments[i + 1] : null;
}

function spanOf(pattern: string, step: number): number {
  let span = 1;
  while (step + span < pattern.length && pattern[step + span] === '-') span++;
  return span;
}

function jitter(rng: Rng, v: number, amount = 0.06): number {
  return clamp(v * (1 + amount * rng.bipolar()), 0.05, 1);
}

function barChordChangesNext(ctx: Ctx, bar: number): boolean {
  const here = segmentAt(ctx, (bar + 1) * ctx.barTicks - 1);
  const next = segmentAt(ctx, (bar + 1) * ctx.barTicks);
  return !!here && !!next && !sameChord(here.chord, next.chord);
}

/**
 * A note that leads into `target` by a semitone (usually) or a whole tone. It comes from the side
 * the line is on, so the line keeps its direction; if that would repeat the note just played, or
 * the line is already next to the target, it goes round the other side instead (an enclosure).
 */
function approachTo(rng: Rng, target: number, from: number | null): number {
  let side = from === null || from === target ? (rng.chance(0.6) ? -1 : 1) : from < target ? -1 : 1;
  let step = rng.chance(0.78) ? 1 : 2;
  // Right next to the target already: sometimes go round it rather than straight in.
  if (from !== null && Math.abs(from - target) <= 2 && rng.chance(0.2)) side = -side;
  let note = target + side * step;
  if (from !== null && note === from) {
    // Never the same note twice: try the other step size, then the other side.
    step = step === 1 ? 2 : 1;
    note = target + side * step;
    if (note === from || Math.abs(from - target) < step) note = target - side * 1;
  }
  if (note < BASS_LOW) note = target + step;
  if (note > BASS_HIGH + 4) note = target - step;
  return note;
}

/** Top of the range in which a walking line looks for a root (D3); above it the bass sounds thin. */
const WALK_ROOT_HIGH = 50;

/** The octave of pitch class `pc` (given as any note with that class) nearest to `from`, within the bass's walking range. */
function nearestOctave(note: number, from: number): number {
  let best = BASS_LOW + ((mod12(note) - 4 + 12) % 12);
  for (let m = best + 12; m <= WALK_ROOT_HIGH; m += 12) if (Math.abs(m - from) < Math.abs(best - from)) best = m;
  return best;
}

function arrangeBass(ctx: Ctx, out: BackingEvent[]): void {
  const { style, rng } = ctx;
  let prev: number | null = null;
  let pendingRoot: number | null = null;
  let forced: number | null = null;
  let dir = 1;
  let repeats = 0;
  let prevBarEnd: BackingChord | null = null;
  let first = true;

  const rootFor = (chord: BackingChord): number => {
    const home = bassHome(chord);
    if (pendingRoot !== null && mod12(pendingRoot) === mod12(home)) return pendingRoot;
    return home;
  };
  const push = (tick: number, bar: number, midi: number, duration: number, velocity: number, role: BassRole): void => {
    out.push({ type: 'bass', tick, bar, midi, duration: Math.max(40, Math.round(duration)), velocity: jitter(rng, velocity), level: style.bassLevel ?? 1, role, tone: style.bassTone });
    prev = midi;
  };

  for (let bar = 0; bar < ctx.totalBars; bar++) {
    const barStart = bar * ctx.barTicks;
    const lead = segmentAt(ctx, barStart);
    if (lead?.ending) {
      // Final bar: one long root.
      const midi = rootFor(lead.chord);
      pendingRoot = null;
      push(barStart, bar, midi, ctx.barTicks, 0.9, 'root');
      continue;
    }
    if (lead) {
      // "Same chord as the bar before" (for alternating root and fifth) means the previous bar
      // ended on this chord.
      repeats = prevBarEnd && sameChord(prevBarEnd, lead.chord) ? repeats + 1 : 0;
    }
    prevBarEnd = segmentAt(ctx, barStart + ctx.barTicks - 1)?.chord ?? lead?.chord ?? null;
    const cycle = style.bass[(bar % ctx.chorusBars) % style.bass.length];
    const turn = style.bassTurn && barChordChangesNext(ctx, bar) && rng.chance(style.bassTurnChance ?? 1);
    let pattern = turn ? style.bassTurn! : cycle;
    if (first && style.bassRootFirst && pattern[0] === '.') pattern = `R${pattern.slice(1)}`;
    if (rng.chance(0.15)) dir = -dir;

    for (let step = 0; step < style.grid; step++) {
      const token = pattern[step];
      if (token === '.' || token === '-') continue;
      const tick = barStart + step * ctx.stepTicks;
      const seg = segmentAt(ctx, tick);
      if (!seg) continue;
      first = false;
      const chord = seg.chord;
      const shape = shapeOf(chord);
      const next = segmentAfter(ctx, seg);
      const span = spanOf(pattern, step);
      const duration = span * ctx.stepTicks * style.bassGate;
      const onBeat = (step * ctx.stepTicks) % style.beatTicks === 0;
      const velocity = onBeat ? 0.84 : 0.7;
      // `root` is the note the bass calls home (the slash bass if there is one); chord tones are
      // measured from the chord's real root.
      const root = rootFor(chord);
      const trueRoot = BASS_LOW + ((mod12(chord.root) - 4 + 12) % 12);
      const above = (iv: number): number => (trueRoot + iv > BASS_HIGH ? trueRoot + iv - 12 : trueRoot + iv);
      const fifthBelow = trueRoot - 12 + shape.fifth >= BASS_LOW ? trueRoot - 12 + shape.fifth : trueRoot + shape.fifth;

      switch (token) {
        case 'R':
          pendingRoot = null;
          push(tick, bar, root, duration, velocity, 'root');
          break;
        case 'r':
          push(tick, bar, root + 12, duration, velocity, 'root');
          break;
        case '3':
          push(tick, bar, above(shape.third ?? shape.fifth), duration, velocity, 'chord');
          break;
        case '5':
          push(tick, bar, above(shape.fifth), duration, velocity, 'chord');
          break;
        case 'v':
          push(tick, bar, fifthBelow, duration, velocity, 'chord');
          break;
        case '7':
          push(tick, bar, above(shape.seventh ?? 12), duration, velocity, 'chord');
          break;
        case '6': {
          // The boogie-line sixth: a chord tone if the chord has it, otherwise a passing note that
          // steps down to the fifth that follows.
          if (shape.fifth !== 7) push(tick, bar, above(shape.seventh ?? 12), duration, velocity, 'chord');
          else if (shape.intervals.includes(9)) push(tick, bar, above(9), duration, velocity, 'chord');
          else if (shape.third === 3 && shape.intervals.includes(10)) push(tick, bar, above(10), duration, velocity, 'chord');
          else push(tick, bar, above(shape.third === 3 ? 8 : 9), duration, velocity, 'passing');
          break;
        }
        case 'Q': {
          // After an approach note the root must follow; otherwise alternate root and fifth.
          const resolve = pendingRoot !== null;
          pendingRoot = null;
          if (!resolve && repeats % 2 === 1) push(tick, bar, fifthBelow, duration, velocity, 'chord');
          else push(tick, bar, root, duration, velocity, 'root');
          break;
        }
        case 'A':
        case 'a': {
          if (next && !sameChord(next.chord, chord)) {
            const target = bassHome(next.chord);
            pendingRoot = target;
            push(tick, bar, approachTo(rng, target, prev), duration, velocity * 0.95, 'approach');
          } else if (token === 'A') {
            push(tick, bar, root, duration, velocity, 'root');
          } else {
            push(tick, bar, fifthBelow, duration, velocity, 'chord');
          }
          break;
        }
        case 'N': {
          const target = next ? bassHome(next.chord) : root;
          const anticipates = !!next && mod12(target) !== mod12(root);
          push(tick, bar, target, duration, velocity, anticipates ? 'anticipation' : 'root');
          break;
        }
        case 'W': {
          // Walking bass: root when the chord arrives, an approach note right before the next
          // chord (or bar), chord tones and passing notes in between.
          const nextTick = tick + style.beatTicks;
          const nextSeg = segmentAt(ctx, nextTick);
          const arrives = tick === seg.startTick || step === 0;
          const leaves = !nextSeg || nextSeg !== seg || nextTick % ctx.barTicks === 0;
          const accent = Math.round(step * ctx.stepTicks / style.beatTicks) % 2 === 1 ? 0.84 : 0.74;
          if (arrives) {
            // The root, in the octave the approach note led to, or else nearest to where the line is.
            const midi = pendingRoot === null && prev !== null ? nearestOctave(root, prev) : root;
            pendingRoot = null;
            forced = null;
            push(tick, bar, midi, duration, accent, 'root');
          } else if (leaves && nextSeg) {
            const home = bassHome(nextSeg.chord);
            const target = prev === null ? home : nearestOctave(home, prev);
            pendingRoot = target;
            forced = null;
            push(tick, bar, approachTo(rng, target, prev), duration, accent, 'approach');
          } else if (forced !== null) {
            const midi = forced;
            forced = null;
            push(tick, bar, midi, duration, accent, 'chord');
          } else {
            const from: number = prev ?? root;
            if (from >= 46) dir = -1;
            if (from <= 31) dir = 1;
            const tones: number[] = [];
            for (let m = BASS_LOW; m <= BASS_HIGH; m++) if (isChordTone(chord, m) && m !== from) tones.push(m);
            const ahead = tones.filter((m) => (dir > 0 ? m > from : m < from));
            const pool = ahead.length ? ahead : tones;
            pool.sort((a, b) => Math.abs(a - from) - Math.abs(b - from));
            const tone = pool[0] ?? root;
            const gap = Math.abs(tone - from);
            // If the next note is also a free one, sometimes walk there by step through a passing note.
            const afterTick = nextTick + style.beatTicks;
            const afterSeg = segmentAt(ctx, afterTick);
            const nextIsFree = nextSeg === seg && nextTick % ctx.barTicks !== 0 && afterSeg === seg && afterTick % ctx.barTicks !== 0;
            if (nextIsFree && (gap === 3 || gap === 4) && rng.chance(0.45)) {
              forced = tone;
              push(tick, bar, tone - Math.sign(tone - from) * (gap === 3 ? 1 : 2), duration, accent, 'passing');
            } else {
              push(tick, bar, tone, duration, accent, 'chord');
            }
          }
          break;
        }
        default:
          break;
      }
    }
  }
}

function arrangeKeys(ctx: Ctx, out: BackingEvent[]): void {
  const { style, rng } = ctx;
  const voicings = new Map<ChordSegment, number[]>();
  let prev: number[] | undefined;
  for (const seg of ctx.segments) {
    const before = voicings.size ? prev : undefined;
    const v = keysVoicing(seg.chord, style.keysVoicing, before);
    voicings.set(seg, v);
    prev = v;
  }
  for (let bar = 0; bar < ctx.totalBars; bar++) {
    const barStart = bar * ctx.barTicks;
    const lead = segmentAt(ctx, barStart);
    if (lead?.ending) {
      out.push({ type: 'keys', tick: barStart, bar, midis: voicings.get(lead)!, duration: ctx.barTicks, velocity: 0.7, level: style.keysLevel, voice: style.keysVoice });
      continue;
    }
    const pattern = style.keys[(bar % ctx.chorusBars) % style.keys.length];
    for (let step = 0; step < style.grid; step++) {
      const token = pattern[step];
      if (token === '.' || token === '-') continue;
      const tick = barStart + step * ctx.stepTicks;
      const seg = segmentAt(ctx, tick);
      if (!seg) continue;
      const voicing = voicings.get(seg)!;
      const span = spanOf(pattern, step);
      let duration = span * ctx.stepTicks * style.keysGate;
      let midis = voicing;
      let velocity = 0.7;
      if (token === 'C') velocity = 0.82;
      else if (token === 'c') velocity = 0.6;
      else if (token === 's') {
        velocity = 0.72;
        duration = Math.min(duration, ctx.stepTicks * 1.5);
      } else if (token >= '1' && token <= '4') {
        const i = Number(token) - 1;
        midis = [i < voicing.length ? voicing[i] : voicing[i - voicing.length] + 12];
        velocity = i === 0 ? 0.72 : 0.6;
      } else continue;
      out.push({ type: 'keys', tick, bar, midis: midis.slice(), duration: Math.max(60, Math.round(duration)), velocity: jitter(rng, velocity), level: style.keysLevel, voice: style.keysVoice });
    }
  }
}

function arrangeGuitar(ctx: Ctx, out: BackingEvent[]): void {
  const { style, rng } = ctx;
  const tone = style.guitarTone;
  const emit = (tick: number, bar: number, v: GuitarVoicing, pick: number[], duration: number, velocity: number, direction: 'down' | 'up', spread: number, articulation: Articulation): void => {
    out.push({
      type: 'guitar', tick, bar,
      midis: pick.map((i) => v.midis[i]), strings: pick.map((i) => v.strings[i]),
      duration: Math.round(duration), velocity: jitter(rng, velocity), direction, spread, level: style.guitarLevel ?? 1, tone, articulation,
    });
  };
  for (let bar = 0; bar < ctx.totalBars; bar++) {
    const barStart = bar * ctx.barTicks;
    const lead = segmentAt(ctx, barStart);
    if (lead?.ending) {
      const v = tone === 'driven' ? powerChord(lead.chord) : guitarVoicing(lead.chord);
      emit(barStart, bar, v, v.midis.map((_, i) => i), 0, 0.9, 'down', 0.04, 'normal');
      continue;
    }
    const pattern = style.guitar[(bar % ctx.chorusBars) % style.guitar.length];
    let bassTurn = 0;
    for (let step = 0; step < style.grid; step++) {
      const token = pattern[step];
      if (token === '.' || token === '-') continue;
      const tick = barStart + step * ctx.stepTicks;
      const seg = segmentAt(ctx, tick);
      if (!seg) continue;
      const full = guitarVoicing(seg.chord);
      const power = powerChord(seg.chord);
      const all = full.midis.map((_, i) => i);
      const n = all.length;
      const span = spanOf(pattern, step);
      const written = span * ctx.stepTicks;
      // gate >= 1 means "let it ring into the next strum".
      const ring = style.guitarGate >= 1 ? 0 : written * style.guitarGate;
      switch (token) {
        case 'D': emit(tick, bar, full, all, ring, 0.85, 'down', 0.024, 'normal'); break;
        case 'd': emit(tick, bar, full, all, ring, 0.6, 'down', 0.024, 'normal'); break;
        case 'U': emit(tick, bar, full, all.slice(n - 4), ring, 0.7, 'up', 0.016, 'normal'); break;
        case 'u': emit(tick, bar, full, all.slice(n - 3), ring, 0.52, 'up', 0.014, 'normal'); break;
        case 'x': emit(tick, bar, full, all.slice(n - 4), ctx.stepTicks * 0.5, 0.5, 'down', 0.01, 'dead'); break;
        case 'B': {
          // Alternating thumb: root, then the note above it (the fifth in these shapes).
          emit(tick, bar, full, [bassTurn++ % 2 === 0 ? 0 : 1], written * 0.9, 0.8, 'down', 0, 'normal');
          break;
        }
        case 'P': emit(tick, bar, full, all.slice(n - 3), written * Math.min(1, style.guitarGate * 1.2), 0.66, 'up', 0.004, 'normal'); break;
        case 'M': emit(tick, bar, power, [0, 1], ctx.stepTicks, 0.82, 'down', 0.006, 'palm-mute'); break;
        case 'A': emit(tick, bar, power, [0, 1, 2], written * 0.95, 0.95, 'down', 0.008, 'normal'); break;
        default: break;
      }
    }
  }
}

function fillKind(ctx: Ctx, bar: number, fills: boolean): 'full' | 'half' | null {
  if (!fills || bar >= ctx.bodyBars) return null;
  const inChorus = bar % ctx.chorusBars;
  if (inChorus === ctx.chorusBars - 1) return 'full';
  if (ctx.chorusBars >= 8 && (inChorus + 1) % 4 === 0) return 'half';
  return null;
}

function arrangeDrums(ctx: Ctx, out: BackingEvent[], fills: boolean): void {
  const { style, rng } = ctx;
  let crashNext = true; // open the tune with a crash
  for (let bar = 0; bar < ctx.totalBars; bar++) {
    const barStart = bar * ctx.barTicks;
    if (bar >= ctx.bodyBars) {
      // Ending: one hit together with the band.
      out.push({ type: 'drum', tick: barStart, bar, drum: 'crash', velocity: 0.95 * style.drumLevel, fill: false });
      out.push({ type: 'drum', tick: barStart, bar, drum: 'kick', velocity: 1 * style.drumLevel, fill: false });
      continue;
    }
    const main = style.drums[(bar % ctx.chorusBars) % style.drums.length];
    const kind = fillKind(ctx, bar, fills);
    const fill = kind ? rng.pick(style.fills) : null;
    // A full fill replaces the bar; a half fill only its last quarter.
    const fillFrom = kind === 'full' ? 0 : kind === 'half' ? Math.floor((style.grid * 3) / 4) : style.grid;
    const hit = (drum: DrumName, step: number, ch: string, isFill: boolean): void => {
      const v = DRUM_VELOCITY[ch];
      if (v === undefined) return;
      out.push({ type: 'drum', tick: barStart + step * ctx.stepTicks, bar, drum, velocity: jitter(rng, v * style.drumLevel, 0.07), fill: isFill });
    };
    const play = (pattern: DrumBar, from: number, to: number, isFill: boolean): void => {
      for (const drum of Object.keys(pattern) as DrumName[]) {
        const steps = pattern[drum]!;
        for (let s = from; s < to && s < steps.length; s++) {
          // The crash replaces the ride/hi-hat on the first beat after a fill.
          if (crashNext && s === 0 && (drum === 'hihatClosed' || drum === 'ride' || drum === 'shaker' || drum === 'cowbell')) continue;
          hit(drum, s, steps[s], isFill);
        }
      }
    };
    play(main, 0, fill ? fillFrom : style.grid, false);
    if (fill) play(fill, fillFrom, style.grid, true);
    if (crashNext) {
      out.push({ type: 'drum', tick: barStart, bar, drum: 'crash', velocity: 0.8 * style.drumLevel, fill: false });
      // A crash is normally hit together with the bass drum. Not in a one-drop: there the first
      // beat stays empty, and that is the whole point of the groove.
      if ((style.kickWithCrash ?? true) && !(main.kick && main.kick[0] !== '.')) {
        out.push({ type: 'drum', tick: barStart, bar, drum: 'kick', velocity: 0.85 * style.drumLevel, fill: false });
      }
    }
    crashNext = kind === 'full';
  }
}

/**
 * Arrange a backing track. `bars` is one pass through the progression in the style's meter.
 * The result is plain data: play it with `BackingBand`, draw it, or test it.
 */
export function arrangeBacking(bars: readonly BackingBar[], opts: ArrangeOptions): BackingArrangement {
  const style = BACKING_STYLES[opts.style];
  if (!style) throw new Error(`unknown backing style: ${String(opts.style)}`);
  const meter = resolveMeter(style.timeSignature);
  const barTicks = meter.barTicks;
  const chorusBars = Math.max(1, bars.length);
  const choruses = Math.max(1, Math.round(opts.choruses ?? 2));
  const hasEnding = opts.ending ?? true;
  const bodyBars = chorusBars * choruses;
  const totalBars = bodyBars + (hasEnding ? 1 : 0);
  const one = layoutProgression(bars, style);
  const segments: ChordSegment[] = [];
  for (let c = 0; c < choruses; c++) {
    for (const s of one) {
      segments.push({ ...s, startTick: s.startTick + c * chorusBars * barTicks, endTick: s.endTick + c * chorusBars * barTicks, bar: s.bar + c * chorusBars, chorus: c });
    }
  }
  if (hasEnding) {
    const chord = opts.endingChord ?? one[0]?.chord;
    if (chord) segments.push({ chord, startTick: bodyBars * barTicks, endTick: totalBars * barTicks, bar: bodyBars, beat: 0, chorus: choruses - 1, ending: true });
  }
  const ctx: Ctx = {
    style,
    rng: new Rng(hashSeed('backing', opts.style, opts.seed ?? 1, chorusBars)),
    segments,
    barTicks,
    stepTicks: barTicks / style.grid,
    totalBars,
    bodyBars,
    chorusBars,
  };
  const events: BackingEvent[] = [];
  arrangeDrums(ctx, events, opts.fills ?? true);
  ctx.rng = new Rng(hashSeed('bass', opts.style, opts.seed ?? 1));
  arrangeBass(ctx, events);
  ctx.rng = new Rng(hashSeed('keys', opts.style, opts.seed ?? 1));
  arrangeKeys(ctx, events);
  ctx.rng = new Rng(hashSeed('guitar', opts.style, opts.seed ?? 1));
  arrangeGuitar(ctx, events);
  const order: Record<BackingEvent['type'], number> = { drum: 0, bass: 1, keys: 2, guitar: 3 };
  events.sort((a, b) => a.tick - b.tick || order[a.type] - order[b.type]);
  return {
    style: style.id,
    timeSignature: style.timeSignature,
    barTicks,
    beatTicks: style.beatTicks,
    beatsPerBar: style.beatsPerBar,
    chorusBars,
    choruses,
    bars: totalBars,
    bodyTicks: bodyBars * barTicks,
    lengthTicks: totalBars * barTicks,
    hasEnding,
    events,
    chords: segments,
  };
}

/** Tempo in quarter notes per minute for a style tempo given in its felt beats per minute. */
export function styleQuarterBpm(style: BackingStyleId, beatsPerMinute: number): number {
  return (beatsPerMinute * BACKING_STYLES[style].beatTicks) / PPQ;
}

/** Build a chord from a root pitch class and intervals in semitones, for callers without the theory module. */
export function chordFromIntervals(root: number, intervals: readonly number[], symbol: string, bass?: number): BackingChord {
  const r = mod12(root);
  return { root: r, tones: [...new Set([0, ...intervals].map((i) => mod12(r + i)))], symbol, bass: bass === undefined ? undefined : mod12(bass) };
}

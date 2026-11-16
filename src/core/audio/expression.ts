/**
 * How a guitar note moves in pitch while it sounds: bends, vibrato and slides as a curve of cents
 * over the note's life, and the glide of a slide from one note to the next.
 *
 * Pure: the live synth samples these curves into a playback-rate automation of the note's buffer,
 * the unit tests check their shape, and the browser checks (`e2e/audio-expression.cjs`) measure the
 * real output against them. The timings are a player's, not a machine's: a bend takes a moment to
 * arrive and eases in and out, vibrato starts after the note has spoken, a slide-out falls away
 * towards the end of the note.
 */
import { clamp, finiteOr } from './dsp';

/** A string bend. */
export interface BendSpec {
  /** How far, in semitones (2 = a full bend, 1 = a half, 0.5 = a quarter tone). */
  amount: number;
  /** Come back down to the fretted pitch before the note ends (bend and release). */
  release?: boolean;
  /** Bent before the string is struck: the note starts at the bent pitch (pre-bend). */
  pre?: boolean;
  /** Seconds the bend takes to arrive (default: about a third of the note, 0.06–0.22 s). */
  rise?: number;
}

/** Vibrato. */
export interface VibratoSpec {
  /** Width from the lowest to the highest pitch, in cents (default 30). */
  depth?: number;
  /** Cycles per second (default 5.5). */
  rate?: number;
  /** Seconds after the note starts before it begins (default 0.12, or just after a bend arrives). */
  delay?: number;
  /**
   * `up`: the string is pushed across the fret and only goes sharp (steel and electric guitar, the
   * default); `both`: the finger rocks along the string, sharp and flat (classical guitar).
   */
  shape?: 'up' | 'both';
}

/** The pitch movements a single note can carry. */
export interface NoteExpression {
  /** A bend: semitones, or the full description. */
  bend?: number | BendSpec;
  /** Vibrato: `true` for the default, or the full description. */
  vibrato?: boolean | VibratoSpec;
  /** Slide into the note from a few frets below or above. */
  slideIn?: 'below' | 'above';
  /** Slide away from the note at its end (a fall-off down, or a rise up). */
  slideOut?: 'down' | 'up';
}

/** A note's pitch over time, in cents from its written pitch. */
export interface PitchCurve {
  /** Seconds after the note starts where the movement begins; the pitch is `initial` before. */
  start: number;
  /** Seconds after the note starts where the movement ends; the pitch holds `at(end)` after. */
  end: number;
  /** Cents at the moment the note is struck (a pre-bend, the start of a slide-in). */
  initial: number;
  /** Cents at `t` seconds after the note starts. */
  at(t: number): number;
  /** Seconds after the start where a slide-out begins to fade the note away, or null. */
  fadeFrom: number | null;
}

/** Semitones a slide-in starts away from its note. */
export const SLIDE_IN_SEMITONES = 3;
/** Semitones a slide-out falls (or rises) by the end of its note. */
export const SLIDE_OUT_SEMITONES = 7;
/** Vibrato defaults. */
export const VIBRATO_DEFAULTS = { depth: 30, rate: 5.5, delay: 0.12 } as const;

/** 0..1 with zero slope at both ends: how a bend or a slide moves. */
export function smoothstep(x: number): number {
  const u = clamp(x, 0, 1);
  return u * u * (3 - 2 * u);
}

function easeOut(x: number): number {
  const u = clamp(x, 0, 1);
  return 1 - (1 - u) * (1 - u);
}

function easeIn(x: number): number {
  const u = clamp(x, 0, 1);
  return u * u;
}

/** The bend of a note, normalised (null for none or nonsense). */
export function bendOf(bend: NoteExpression['bend']): BendSpec | null {
  if (bend === undefined || bend === null) return null;
  const spec: BendSpec = typeof bend === 'number' ? { amount: bend } : bend;
  const amount = clamp(finiteOr(spec.amount, 0), -4, 4);
  if (Math.abs(amount) < 0.01) return null;
  return { ...spec, amount };
}

/** The vibrato of a note, normalised (null for none). */
export function vibratoOf(vibrato: NoteExpression['vibrato']): Required<VibratoSpec> | null {
  if (!vibrato) return null;
  const spec: VibratoSpec = vibrato === true ? {} : vibrato;
  const depth = clamp(finiteOr(spec.depth, VIBRATO_DEFAULTS.depth), 0, 200);
  const rate = clamp(finiteOr(spec.rate, VIBRATO_DEFAULTS.rate), 0.5, 12);
  if (depth <= 0) return null;
  return { depth, rate, delay: clamp(finiteOr(spec.delay, VIBRATO_DEFAULTS.delay), 0, 4), shape: spec.shape === 'both' ? 'both' : 'up' };
}

/**
 * The pitch curve of a note that is held for `length` seconds (pass a typical length, about a
 * second, for a note that simply rings). Null when the note does not move at all.
 */
export function pitchCurve(expr: NoteExpression, length: number): PitchCurve | null {
  const len = clamp(finiteOr(length, 1), 0.02, 30);
  const bend = bendOf(expr.bend);
  const vib = vibratoOf(expr.vibrato);
  const slideIn = expr.slideIn === 'below' || expr.slideIn === 'above' ? expr.slideIn : null;
  const slideOut = expr.slideOut === 'down' || expr.slideOut === 'up' ? expr.slideOut : null;
  if (!bend && !vib && !slideIn && !slideOut) return null;

  const parts: Array<{ from: number; to: number; at: (t: number) => number }> = [];
  let movingFrom = Infinity;
  let movingTo = 0;
  let settled = 0; // when the note has arrived at its pitch (vibrato waits for this)

  // --- slide out: the last part of the note, falling away -----------------------------------
  let fadeFrom: number | null = null;
  let outStart = len;
  if (slideOut) {
    outStart = Math.max(len * 0.5, len - 0.22);
    fadeFrom = outStart;
    const span = Math.max(0.01, len - outStart);
    const target = (slideOut === 'down' ? -1 : 1) * SLIDE_OUT_SEMITONES * 100;
    parts.push({ from: outStart, to: len, at: (t) => (t <= outStart ? 0 : target * easeIn((t - outStart) / span)) });
    movingFrom = Math.min(movingFrom, outStart);
    movingTo = Math.max(movingTo, len);
  }

  // --- slide in: from a few frets away, arriving quickly ------------------------------------
  if (slideIn) {
    const from = (slideIn === 'below' ? -1 : 1) * SLIDE_IN_SEMITONES * 100;
    const glide = clamp(len * 0.3, 0.04, 0.12);
    parts.push({ from: 0, to: glide, at: (t) => from * (1 - easeOut(t / glide)) });
    movingFrom = 0;
    movingTo = Math.max(movingTo, glide);
    settled = Math.max(settled, glide);
  }

  // --- bend ------------------------------------------------------------------------------
  if (bend) {
    const cents = bend.amount * 100;
    const room = Math.min(len, outStart);
    if (bend.pre) {
      if (bend.release) {
        const fall = clamp(room * 0.35, 0.05, 0.2);
        const from = clamp(room * 0.45, 0.03, Math.max(0.03, room - fall));
        parts.push({ from, to: from + fall, at: (t) => cents * (1 - smoothstep((t - from) / fall)) });
        movingFrom = Math.min(movingFrom, from);
        movingTo = Math.max(movingTo, from + fall);
        settled = Math.max(settled, from + fall);
      } else {
        parts.push({ from: 0, to: 0, at: () => cents });
      }
    } else {
      const begin = Math.min(0.03, room * 0.1);
      const rise = clamp(finiteOr(bend.rise, clamp(room * 0.33, 0.06, 0.22)), 0.01, Math.max(0.01, room - begin));
      const top = begin + rise;
      let fallFrom = Infinity;
      let fall = 0;
      if (bend.release) {
        fall = clamp(room * 0.3, 0.05, 0.2);
        fallFrom = Math.max(top + Math.min(0.05, room * 0.1), room * 0.6);
        if (fallFrom + fall > room) fallFrom = Math.max(top, room - fall);
      }
      parts.push({
        from: begin,
        to: Number.isFinite(fallFrom) ? fallFrom + fall : top,
        at: (t) => {
          if (t <= begin) return 0;
          if (t < top) return cents * smoothstep((t - begin) / rise);
          if (t < fallFrom) return cents;
          return cents * (1 - smoothstep((t - fallFrom) / fall));
        },
      });
      movingFrom = Math.min(movingFrom, begin);
      movingTo = Math.max(movingTo, Number.isFinite(fallFrom) ? fallFrom + fall : top);
      settled = Math.max(settled, top);
    }
  }

  // --- vibrato: once the note has arrived, until it ends (or starts to slide away) -------------
  if (vib) {
    const from = Math.max(vib.delay, settled > 0 ? settled + 0.04 : 0);
    const to = Math.min(len, outStart);
    if (to > from + 0.02) {
      const w = 2 * Math.PI * vib.rate;
      const fadeIn = 1 / vib.rate; // one cycle to reach full width
      parts.push({
        from,
        to,
        at: (t) => {
          if (t <= from || t >= to) return 0;
          const k = Math.min(1, (t - from) / fadeIn);
          const phase = w * (t - from);
          return vib.shape === 'up' ? k * vib.depth * 0.5 * (1 - Math.cos(phase)) : k * vib.depth * 0.5 * Math.sin(phase);
        },
      });
      movingFrom = Math.min(movingFrom, from);
      movingTo = Math.max(movingTo, to);
    }
  }

  const at = (t: number): number => {
    let c = 0;
    for (const p of parts) c += p.at(t);
    return c;
  };
  const start = Number.isFinite(movingFrom) ? movingFrom : 0;
  const end = Math.max(start, movingTo);
  return { start, end, initial: at(0), at, fadeFrom };
}

/**
 * The glide of a slide from one fretted note to the next: `x` runs 0..1 over the glide and the
 * result goes from `fromCents` to `toCents`, easing out of the first fret and into the last.
 */
export function slideGlide(fromCents: number, toCents: number, x: number): number {
  return fromCents + (toCents - fromCents) * smoothstep(x);
}

/** How long a slide between two notes takes: part of the time between them, 0.03–0.12 s. */
export function slideGlideSeconds(gap: number): number {
  return clamp(finiteOr(gap, 0.2) * 0.45, 0.03, 0.12);
}

/**
 * One step of an ASCII-tab technique phrase: a fret and how it is reached or shaped.
 * `parseTabTechnique('5h7')` → `[{ fret: 5 }, { fret: 7, legato: 'hammer' }]`.
 */
export interface TabTechniqueStep {
  fret: number;
  /** Reached from the step before without a new pick stroke. */
  legato?: 'hammer' | 'pull' | 'slide';
  bend?: BendSpec;
  vibrato?: boolean;
  slideIn?: 'below' | 'above';
  slideOut?: 'down' | 'up';
}

/**
 * Read the techniques of one string's tab token the way guitar tab writes them: `5h7` hammer-on,
 * `7p5` pull-off, `5/7` or `5s7` slide up, `7\5` slide down, `5b7` bend up to the pitch of fret 7,
 * `5b7r5` bend and release, `5~` vibrato, `/5` slide in from below, `\5` from
 * above, `5\` fall-off, `5/` slide out up, `7pb9` pre-bend. A plain number is just that fret.
 * Returns null for anything that is not a tab token.
 */
export function parseTabTechnique(token: string): TabTechniqueStep[] | null {
  const text = String(token ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (!text) return null;
  const steps: TabTechniqueStep[] = [];
  let i = 0;
  const num = (): number | null => {
    const m = /^\d{1,2}/.exec(text.slice(i));
    if (!m) return null;
    i += m[0].length;
    return Number(m[0]);
  };
  let lead: 'below' | 'above' | undefined;
  if (text[0] === '/' || text[0] === '\\') {
    lead = text[0] === '/' ? 'below' : 'above';
    i = 1;
  }
  const first = num();
  if (first === null) return null;
  steps.push(lead ? { fret: first, slideIn: lead } : { fret: first });
  while (i < text.length) {
    const c = text[i];
    const last = steps[steps.length - 1];
    if (c === '~' || c === 'v') {
      last.vibrato = true;
      i++;
      continue;
    }
    if (c === 'h' || c === 'p' || c === 's' || c === '/' || c === '\\') {
      i++;
      const fret = num();
      if (fret === null) {
        // A slide with nowhere to go is a slide out of the note.
        if (c === '/' || c === '\\') {
          last.slideOut = c === '/' ? 'up' : 'down';
          continue;
        }
        if (c === 'p' && text[i] === 'b') {
          // "7pb9": pre-bend to the pitch of fret 9.
          i++;
          const to = num();
          if (to === null) return null;
          last.bend = { amount: to - last.fret, pre: true };
          continue;
        }
        return null;
      }
      const legato = c === 'h' ? 'hammer' : c === 'p' ? 'pull' : 'slide';
      if ((legato === 'hammer' && fret <= last.fret) || (legato === 'pull' && fret >= last.fret)) return null;
      steps.push({ fret, legato });
      continue;
    }
    if (c === 'b') {
      i++;
      const to = num();
      const amount = to === null ? 2 : to - last.fret;
      if (amount <= 0) return null;
      last.bend = { ...(last.bend ?? {}), amount };
      if (text[i] === 'r') {
        i++;
        const back = num();
        if (back !== null && back !== last.fret) return null;
        last.bend.release = true;
      }
      continue;
    }
    if (c === 'r') {
      // "5b7 r5" written without a space-free b: a release on a bent note.
      i++;
      num();
      if (!last.bend) return null;
      last.bend.release = true;
      continue;
    }
    return null;
  }
  return steps;
}

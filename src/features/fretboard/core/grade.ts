/**
 * Grading. Each answer is judged by sound (pitch class), so C♯ and D♭ are the same answer, and
 * what the learner got wrong is turned into position records for the stats: a missed name counts
 * against the place shown, a wrong tap against the place that was wanted (or, when any place
 * would have done, against the place they mistook for it).
 */
import { pcOf } from './notes';
import { midiAtPos, pcAt, posKey } from './neck';
import { recordAnswer, type NeckStats } from './stats';
import type { EveryQuestion, NameQuestion, NeckContext, PlayQuestion, Pos, Question, QuestionResult, TapQuestion } from './types';

/** Result of naming a note. */
export interface NameGrade {
  right: boolean;
  /** Where the note the learner named sits on the same string, nearest the shown fret (for "B is at fret 7"). */
  givenAt: Pos | null;
}

/** Judge a named note against a "name it" question. */
export function gradeName(q: NameQuestion, pc: number, ctx: NeckContext, maxFret = 24): NameGrade {
  const right = pcOf(pc) === q.pc;
  if (right) return { right, givenAt: null };
  let best: Pos | null = null;
  for (let fret = 0; fret <= maxFret; fret++) {
    const p = { string: q.pos.string, fret };
    if (pcAt(ctx, p) !== pcOf(pc)) continue;
    if (!best || Math.abs(fret - q.pos.fret) < Math.abs(best.fret - q.pos.fret)) best = p;
  }
  return { right, givenAt: best };
}

/** What a tap on the neck means for a tap question. */
export type TapGrade =
  /** The right note (and string, where one was asked). */
  | 'right'
  /** Another note. */
  | 'wrong'
  /** Not the string the question asked about: a nudge, not a mistake. */
  | 'other-string'
  /** "Find every": a new place found. */
  | 'found'
  /** "Find every": a place already found. */
  | 'again';

/** Judge a tap. `found` lists the places already found in a "find every" question. */
export function gradeTap(q: TapQuestion, tap: Pos, ctx: NeckContext, found: readonly Pos[] = []): TapGrade {
  const pc = pcAt(ctx, tap);
  if (q.kind === 'every') {
    if (pc !== q.pc) return 'wrong';
    return found.some((f) => f.string === tap.string && f.fret === tap.fret) ? 'again' : 'found';
  }
  if ((q.kind === 'find' || q.kind === 'octave') && tap.string !== q.string) return 'other-string';
  return pc === q.pc ? 'right' : 'wrong';
}

/** Judge a note heard through the microphone: the exact pitches asked, or the note in any octave. */
export function gradePlayed(q: PlayQuestion, midi: number, octaves: 'exact' | 'any'): boolean {
  const m = Math.round(midi);
  return octaves === 'any' ? pcOf(m) === q.pc : q.midis.includes(m);
}

/** Every place an "every" question still has to find. */
export function remaining(q: EveryQuestion, found: readonly Pos[]): Pos[] {
  const got = new Set(found.map(posKey));
  return q.targets.filter((t) => !got.has(posKey(t)));
}

/** How a question ended, as the round screen saw it. */
export interface Attempt {
  /** Answered right at the first try (name, find, octave, play). */
  right: boolean;
  /** Time to the right answer, ms (null after a miss). */
  ms: number | null;
  /** Taps on the neck that were wrong (another note). */
  wrongTaps: Pos[];
  /** "Find every": places found, in order. */
  found: Pos[];
  /** The place the learner tapped when right (find questions credit that place). */
  tapped?: Pos | null;
  /** The learner gave up ("Show me") or the time ran out. */
  gaveUp?: boolean;
}

/** Score, result line and stats updates for a finished question. */
export function settle(q: Question, a: Attempt, stats: NeckStats, ctx: NeckContext): { result: QuestionResult; stats: NeckStats } {
  let next = stats;
  const missed: Pos[] = [];
  let score: number;
  let positions: Pos[];
  switch (q.kind) {
    case 'every': {
      for (const f of a.found) next = recordAnswer(next, f, true, null);
      for (const w of a.wrongTaps) {
        next = recordAnswer(next, w, false);
        missed.push(w);
      }
      const left = remaining(q, a.found);
      for (const r of left) {
        next = recordAnswer(next, r, false);
        missed.push(r);
      }
      score = q.targets.length ? a.found.length / (q.targets.length + a.wrongTaps.length) : 1;
      positions = q.targets;
      break;
    }
    case 'find-any': {
      if (a.right) next = recordAnswer(next, a.tapped ?? q.targets[0], true, a.ms);
      for (const w of a.wrongTaps) {
        next = recordAnswer(next, w, false);
        missed.push(w);
      }
      score = a.right ? 1 : 0;
      positions = a.right && a.tapped ? [a.tapped] : q.targets;
      break;
    }
    default: {
      const wanted = q.pos;
      const credit = a.right ? (q.kind === 'find' || q.kind === 'octave' ? a.tapped ?? wanted : wanted) : wanted;
      next = recordAnswer(next, credit, a.right, a.right ? a.ms : null);
      if (!a.right) missed.push(wanted);
      score = a.right ? 1 : 0;
      positions = [credit];
    }
  }
  const result: QuestionResult = { kind: q.kind, item: q.item, pc: q.pc, name: q.name, score, right: score >= 1, ms: a.right ? a.ms : null, positions, missed };
  return { result, stats: next };
}

/** The sounding pitch of a question's place (for playing it back). */
export function questionMidi(q: Question, ctx: NeckContext): number {
  if (q.kind === 'name') return q.midi;
  if (q.kind === 'find' || q.kind === 'octave' || q.kind === 'play') return midiAtPos(ctx, q.pos);
  return midiAtPos(ctx, q.targets[0] ?? { string: 1, fret: 0 });
}

/**
 * Building questions: which items a kind of question can ask in a scope, how well the learner
 * knows each of them, and the question itself once the picker has chosen.
 */
import { spell } from './notes';
import { midiAtPos, octaveShape, octaveTarget, parsePosKey, pcAt, pcKey, placesInScope, placesOnString, posKey, scopeFrets, scopePcs, scopePositions, type OctaveShape } from './neck';
import type { ItemEstimate } from './picker';
import type { Rng } from './rng';
import { accuracyOf, slownessOf, type NeckStats } from './stats';
import type { NeckContext, Pos, Question, QuestionKind, Scope } from './types';

/** One kind of question a round asks, and how often. */
export interface Ask {
  kind: QuestionKind;
  weight: number;
  /** "Find" questions framed as barre-chord roots (strings 6 and 5). */
  flavor?: 'barre-root';
}

/** Extra inputs some kinds need. */
export interface AskOptions {
  /** Octave questions: `[from, to]` string pairs (the shape is computed from the tuning). */
  octavePairs?: ReadonlyArray<readonly [number, number]>;
}

/** The octave shapes that work in this tuning, for the pairs asked. */
export function shapesFor(ctx: NeckContext, pairs: AskOptions['octavePairs']): OctaveShape[] {
  return (pairs ?? []).map(([a, b]) => octaveShape(ctx, a, b)).filter((s): s is OctaveShape => !!s && s.to <= ctx.tuning.length && s.from <= ctx.tuning.length);
}

/** Octave shapes leading to a target position whose starting note is on the neck (fret ≥ 0, in range). */
function shapesInto(ctx: NeckContext, scope: Scope, p: Pos, shapes: OctaveShape[]): OctaveShape[] {
  const maxFret = scope.frets[1];
  return shapes.filter((s) => s.to === p.string && p.fret - s.shift >= 0 && p.fret - s.shift <= maxFret);
}

/** The items a kind of question can ask in a scope (position keys, or `pc:N` keys). */
export function candidatesFor(kind: QuestionKind, scope: Scope, ctx: NeckContext, opts: AskOptions = {}): string[] {
  if (kind === 'find-any' || kind === 'every') return scopePcs(scope, ctx).map(pcKey);
  const positions = scopePositions(scope, ctx);
  if (kind === 'octave') {
    const shapes = shapesFor(ctx, opts.octavePairs);
    return positions.filter((p) => shapesInto(ctx, scope, p, shapes).length > 0).map(posKey);
  }
  return positions.map(posKey);
}

/** How well the learner knows an item: a position directly, a note as the mean over its places in scope. */
export function estimator(stats: NeckStats, scope: Scope, ctx: NeckContext): (key: string) => ItemEstimate {
  return (key) => {
    if (key.startsWith('pc:')) {
      const places = placesInScope(scope, ctx, Number(key.slice(3)));
      if (places.length === 0) return { accuracy: 0.5, slowness: 0 };
      let acc = 0;
      let slow = 0;
      let seen = 0;
      for (const p of places) {
        const s = stats[posKey(p)];
        acc += accuracyOf(s);
        slow += slownessOf(s);
        seen += s?.n ?? 0;
      }
      return { accuracy: acc / places.length, slowness: slow / places.length, seen };
    }
    const s = stats[key];
    return { accuracy: accuracyOf(s), slowness: slownessOf(s), seen: s?.n ?? 0 };
  };
}

/** Build the question for a chosen item. */
export function buildQuestion(ask: Ask, item: string, index: number, scope: Scope, ctx: NeckContext, rng: Rng, opts: AskOptions = {}): Question {
  const flat = ctx.spelling === 'both' ? rng.chance() : false;
  if (item.startsWith('pc:')) {
    const pc = Number(item.slice(3));
    const name = spell(pc, ctx.spelling, flat);
    const targets = placesInScope(scope, ctx, pc);
    return ask.kind === 'every' ? { kind: 'every', index, item, pc, name, targets } : { kind: 'find-any', index, item, pc, name, targets };
  }
  const pos = parsePosKey(item);
  if (!pos) throw new RangeError(`buildQuestion: bad item ${item}`);
  const pc = pcAt(ctx, pos);
  const name = spell(pc, ctx.spelling, flat);
  const frets = scopeFrets({ ...scope, onlyFrets: undefined });
  switch (ask.kind) {
    case 'find':
      return { kind: 'find', index, item, pc, name, pos, string: pos.string, targets: placesOnString(ctx, pos.string, pc, frets), flavor: ask.flavor };
    case 'play':
      return { kind: 'play', index, item, pc, name, pos, string: pos.string, midis: placesOnString(ctx, pos.string, pc, frets).map((p) => midiAtPos(ctx, p)) };
    case 'octave': {
      const shapes = shapesInto(ctx, scope, pos, shapesFor(ctx, opts.octavePairs));
      const shape = shapes.length ? rng.pick(shapes) : null;
      if (!shape) return { kind: 'name', index, item, pc, name, pos, midi: midiAtPos(ctx, pos) };
      const from = { string: shape.from, fret: pos.fret - shape.shift };
      const target = octaveTarget(ctx, shape, from.fret) ?? pos;
      return { kind: 'octave', index, item, pc, name, from, string: pos.string, pos: target, targets: placesOnString(ctx, pos.string, pc, frets), shift: shape.shift, octaves: shape.octaves };
    }
    default:
      return { kind: 'name', index, item, pc, name, pos, midi: midiAtPos(ctx, pos) };
  }
}

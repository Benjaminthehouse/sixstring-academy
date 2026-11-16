/**
 * Chord shapes for a progression, chosen together so the hand moves as little as possible.
 *
 * Every distinct chord gets one shape (the chart shows one diagram per chord). The choice weighs
 * how hard each shape is, how far down the engine's ranking it sits, and how hard every change in
 * the progression is (`voicingTransition`, counted as often as the change happens, the loop back
 * to the top included). It starts from the standard shapes and improves one chord at a time until
 * nothing gets better: a few passes, a few milliseconds.
 */
import { beginnerVoicing, chordVoicings, voicingTransition, type TuningInput, type Voicing } from '@/core/guitar';

/** How shapes are picked. */
export type ShapeMode = 'smooth' | 'standard';

/** Options for {@link planVoicings}. */
export interface PlanOptions {
  tuning?: TuningInput;
  /** Capo fret: shapes are fingered behind it (frets count from the capo). */
  capo?: number;
  /** `smooth` (default) keeps changes small; `standard` takes each chord's usual shape. */
  mode?: ShapeMode;
  /** Prefer the easy versions a beginner learns first (the small F). */
  beginner?: boolean;
  /** Count the change from the last chord back to the first (default true: progressions loop). */
  loop?: boolean;
  /** Shapes considered per chord (default 6). */
  candidates?: number;
}

/** One change of the progression with the shapes chosen for it. */
export interface PlannedChange {
  from: string;
  to: string;
  /** 1–10. */
  difficulty: number;
  /** The engine's advice for this change ("Keep your middle finger down …"). */
  tips: string[];
  /** How many times the progression makes this change in one pass. */
  count: number;
}

/** The shapes for a progression. */
export interface VoicingPlan {
  /** Shape per chord symbol (null only when the engine has none). */
  bySymbol: Map<string, Voicing | null>;
  /** Distinct changes in order of first appearance. */
  changes: PlannedChange[];
  /** The hardest change: the one to practise. */
  hardest: PlannedChange | null;
  /** Total cost of the plan (lower is smoother); comparable between plans of the same chords. */
  cost: number;
}

const OWN_WEIGHT = 0.5;
const RANK_WEIGHT = 0.6;

function candidatesFor(symbol: string, opts: PlanOptions): Voicing[] {
  const n = Math.max(1, opts.candidates ?? 6);
  let list: Voicing[] = [];
  try {
    list = chordVoicings(symbol, { tuning: opts.tuning, capo: opts.capo, maxResults: n });
  } catch {
    list = [];
  }
  if (opts.beginner) {
    const easy = beginnerVoicing(symbol, { tuning: opts.tuning, capo: opts.capo });
    if (easy) list = [easy, ...list.filter((v) => v.id !== easy.id)].slice(0, n);
  }
  return list;
}

/** The changes between neighbouring different chords, with how often each happens. */
export function changePairs(sequence: readonly string[], loop = true): Array<{ from: string; to: string; count: number }> {
  const counts = new Map<string, { from: string; to: string; count: number }>();
  const add = (from: string, to: string) => {
    if (from === to) return;
    const key = `${from}\u0000${to}`;
    const held = counts.get(key);
    if (held) held.count++;
    else counts.set(key, { from, to, count: 1 });
  };
  for (let i = 1; i < sequence.length; i++) add(sequence[i - 1], sequence[i]);
  if (loop && sequence.length > 1) add(sequence[sequence.length - 1], sequence[0]);
  return [...counts.values()];
}

/**
 * Pick one shape per chord for a progression given as the chords in playing order (repeats
 * included, so frequent changes weigh more): `planVoicings(['C', 'Am', 'F', 'G'])`.
 */
export function planVoicings(sequence: readonly string[], opts: PlanOptions = {}): VoicingPlan {
  const symbols = [...new Set(sequence)];
  const cands = new Map(symbols.map((s) => [s, candidatesFor(s, opts)]));
  const pairs = changePairs(sequence, opts.loop ?? true);
  const neighbours = new Map<string, Array<{ other: string; count: number; outgoing: boolean }>>();
  for (const s of symbols) neighbours.set(s, []);
  for (const p of pairs) {
    neighbours.get(p.from)!.push({ other: p.to, count: p.count, outgoing: true });
    neighbours.get(p.to)!.push({ other: p.from, count: p.count, outgoing: false });
  }

  const memo = new Map<string, number>();
  const trans = (a: Voicing, b: Voicing): number => {
    const key = `${a.id}>${b.id}`;
    let d = memo.get(key);
    if (d === undefined) {
      d = voicingTransition(a, b).difficulty;
      memo.set(key, d);
    }
    return d;
  };
  // A beginner strums all the strings: shapes with a muted top string or only three notes are awkward.
  const strumPenalty = (v: Voicing) => (!opts.beginner ? 0 : (v.frets[v.frets.length - 1] === null ? 1.2 : 0) + (v.midi.length < 4 ? 1.2 : 0));
  const own = (v: Voicing, rank: number) => OWN_WEIGHT * v.difficulty + RANK_WEIGHT * rank + strumPenalty(v);

  const choice = new Map<string, number>(symbols.map((s) => [s, 0]));
  const voicingOf = (s: string): Voicing | null => cands.get(s)?.[choice.get(s) ?? 0] ?? null;

  if ((opts.mode ?? 'smooth') === 'smooth') {
    for (let pass = 0; pass < 6; pass++) {
      let changed = false;
      for (const s of symbols) {
        const list = cands.get(s)!;
        if (list.length < 2) continue;
        let bestIndex = choice.get(s)!;
        let bestCost = Infinity;
        list.forEach((v, rank) => {
          let cost = own(v, rank);
          for (const n of neighbours.get(s)!) {
            const other = voicingOf(n.other);
            if (!other) continue;
            cost += n.count * (n.outgoing ? trans(v, other) : trans(other, v));
          }
          if (cost < bestCost - 1e-9) {
            bestCost = cost;
            bestIndex = rank;
          }
        });
        if (bestIndex !== choice.get(s)) {
          choice.set(s, bestIndex);
          changed = true;
        }
      }
      if (!changed) break;
    }
  }

  const bySymbol = new Map<string, Voicing | null>(symbols.map((s) => [s, voicingOf(s)]));
  let cost = 0;
  for (const s of symbols) {
    const v = bySymbol.get(s);
    if (v) cost += own(v, choice.get(s)!);
  }
  const changes: PlannedChange[] = [];
  for (const p of pairs) {
    const a = bySymbol.get(p.from);
    const b = bySymbol.get(p.to);
    if (!a || !b) continue;
    const t = voicingTransition(a, b);
    cost += p.count * t.difficulty;
    changes.push({ from: p.from, to: p.to, difficulty: t.difficulty, tips: t.tips, count: p.count });
  }
  const hardest = changes.reduce<PlannedChange | null>((h, c) => (!h || c.difficulty > h.difficulty ? c : h), null);
  return { bySymbol, changes, hardest, cost: Math.round(cost * 100) / 100 };
}

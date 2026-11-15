/**
 * Shared pieces of the generators: placing a root in range, spelling it, and assembling a question
 * so that its sound is always the plan of its right answer.
 */
import { formatNote, midiToNote } from '@/core/theory';
import type { Rng } from './rng';
import { planNotes, subjectEvents } from './sound';
import type { ChoiceQuestion, DrillId, EarSettings, GenContext, OptionInfo, QuestionOption, SoundPlan, Truth } from './types';

/** Root names for chords and major keys, one spelling per pitch class (the commonest). */
export const ROOT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
/** Tonic names for minor keys (C♯ minor and G♯ minor are the usual spellings, not D♭ and A♭). */
export const MINOR_TONICS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'] as const;

/** Pitch class of a MIDI note, 0..11. */
export const pcOf = (midi: number): number => ((Math.round(midi) % 12) + 12) % 12;

/**
 * A note in [lo, hi]: anywhere in that range when the root is random, or the fixed root's pitch
 * class in the octave nearest the middle of the range.
 */
export function placeNote(rng: Rng, settings: Pick<EarSettings, 'root' | 'fixedRoot'>, lo: number, hi: number): number {
  const a = Math.ceil(Math.min(lo, hi));
  const b = Math.floor(Math.max(lo, hi));
  if (settings.root !== 'fixed') return rng.int(a, b);
  const pc = pcOf(settings.fixedRoot);
  const mid = (a + b) / 2;
  // Inside the range when the pitch class occurs there; otherwise the nearest one just outside it
  // (a range narrower than an octave may not contain every pitch class).
  let best = a;
  let bestCost = Infinity;
  for (let m = a - 6; m <= b + 6; m++) {
    if (pcOf(m) !== pc) continue;
    const outside = m < a ? a - m : m > b ? m - b : 0;
    const cost = outside * 100 + Math.abs(m - mid);
    if (cost < bestCost) {
      best = m;
      bestCost = cost;
    }
  }
  return best;
}

/** A display name for a sounding note (`C♯3`). */
export function noteLabel(midi: number, prefer: 'sharps' | 'flats' = 'sharps'): string {
  return formatNote(midiToNote(midi, { prefer }));
}

/** Map a 0..1 difficulty onto a range: 0 gives `easy`, 1 gives `hard`, with a little jitter. */
export function byDifficulty(rng: Rng, easy: number, hard: number, difficulty: number): number {
  const d = Math.max(0, Math.min(1, difficulty + (rng.next() - 0.5) * 0.4));
  return Math.round(easy + (hard - easy) * d);
}

/** Inputs of {@link buildChoice}. */
export interface ChoiceSpec {
  drill: DrillId;
  level: number;
  ctx: GenContext;
  prompt: string;
  /** Options in display order. The right one is `ctx.answer`. */
  options: Array<OptionInfo & { plan: SoundPlan }>;
  /** What the question plays. Default: the plan of the right option. Its subject must equal it. */
  plan?: SoundPlan;
  canSlow: boolean;
  canSpread: boolean;
  truth: Truth;
  keyName?: string;
}

/** Assemble a multiple-choice question. Throws if the right answer is not among the options. */
export function buildChoice(spec: ChoiceSpec): ChoiceQuestion {
  const { ctx } = spec;
  const right = spec.options.find((o) => o.id === ctx.answer);
  if (!right) throw new RangeError(`answer ${ctx.answer} is not an option of ${spec.drill} level ${spec.level}`);
  const plan = spec.plan ?? right.plan;
  const subject = planNotes(plan, 'subject');
  const first = subjectEvents(plan)[0];
  const options: QuestionOption[] = spec.options.map((o) => ({ ...o }));
  return {
    kind: 'choice',
    id: `${spec.drill}:${spec.level}:${ctx.seed}:${ctx.index}`,
    drill: spec.drill,
    level: spec.level,
    index: ctx.index,
    seed: ctx.seed,
    prompt: spec.prompt,
    plan,
    subject,
    firstNote: first ? Math.min(...first.midis) : null,
    ...(spec.keyName ? { keyName: spec.keyName } : {}),
    canSlow: spec.canSlow,
    canSpread: spec.canSpread,
    truth: spec.truth,
    options,
    answer: ctx.answer,
  };
}

/** "a" or "an" before a word, by its sound (an octave, a minor 6th, an 11th). */
export function article(word: string): string {
  const w = word.trim().toLowerCase();
  if (/^(11|18|8)/.test(w)) return 'an';
  if (/^(uni|one|eu|u[bcfhjkqrstn][aeiou])/.test(w)) return 'a';
  return /^[aeiou]/.test(w) ? 'an' : 'a';
}

/** "an octave", "a major 3rd". */
export function withArticle(word: string): string {
  return `${article(word)} ${word}`;
}

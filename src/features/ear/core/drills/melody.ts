/**
 * Melody playback: hear a short phrase that starts on the tonic, then rebuild it note by note on a
 * row of the key's notes (or play it back on the guitar through the microphone). The row keys are
 * all different pitches, so there is exactly one right sequence.
 */
import { formatDegree, formatKey, formatNote } from '@/core/theory';
import { MINOR_TONICS, ROOT_NAMES, pcOf, placeNote } from '../question';
import { melodic, planNotes } from '../sound';
import type { DrillDef, GenContext, LevelDef, OptionInfo, RowKey, SequenceQuestion, SoundEvent, SoundPlan } from '../types';
import { SOLFEGE, degreeSemitones } from './degrees';

/** Row degrees: `1'` is the octave above the tonic, `5,` the fifth below it. */
function rowKeyFor(degree: string, tonic: number): RowKey {
  const octave = degree.endsWith("'") ? 12 : degree.endsWith(',') ? -12 : 0;
  const base = degree.replace(/[',]$/, '');
  const syllable = SOLFEGE[base] ?? '';
  return { id: degree, midi: tonic + degreeSemitones(base) + octave, label: formatDegree(base), sub: octave > 0 ? `high ${syllable}` : octave < 0 ? `low ${syllable}` : syllable };
}

/** Label and name of a row note, for the confusion record. */
export function melodyInfo(id: string): OptionInfo {
  const base = id.replace(/[',]$/, '');
  const label = formatDegree(base);
  const syllable = SOLFEGE[base] ?? '';
  const sub = id.endsWith("'") ? `high ${syllable}` : id.endsWith(',') ? `low ${syllable}` : syllable;
  return { id, label, name: `${label} (${sub})`, detail: sub };
}

/** The plan of a sequence of row keys (in `tone` when the drill has an instrument of its own, the bass). */
export function sequencePlan(keys: readonly RowKey[], ids: readonly string[], gap: number, tone?: SoundEvent['tone']): SoundPlan {
  const midis = ids.map((id) => keys.find((k) => k.id === id)?.midi).filter((m): m is number => m !== undefined);
  const plan = melodic(midis, { gap, dur: gap * 1.5, tail: 0.6 });
  return tone ? { ...plan, events: plan.events.map((e) => ({ ...e, tone })) } : plan;
}

interface MelodyParams {
  n: number;
  title: string;
  blurb: string;
  row: string[];
  mode: 'major' | 'minor';
  length: number;
  /** Largest step in row positions. */
  maxStep: number;
  repeats: boolean;
}

/** A random walk over the row that starts on the tonic and contains `focus` when it can. */
function phrase(ctx: GenContext, p: MelodyParams): string[] {
  const { rng } = ctx;
  const start = p.row.indexOf('1');
  let best: string[] = [];
  for (let attempt = 0; attempt < 24; attempt++) {
    const idx = [start];
    while (idx.length < p.length) {
      const here = idx[idx.length - 1];
      const moves: number[] = [];
      for (let d = -p.maxStep; d <= p.maxStep; d++) {
        if (d === 0 && !p.repeats) continue;
        const to = here + d;
        if (to >= 0 && to < p.row.length) moves.push(to);
      }
      idx.push(rng.pick(moves));
    }
    best = idx.map((i) => p.row[i]);
    if (ctx.answer === '1' || best.slice(1).includes(ctx.answer)) break;
  }
  return best;
}

function level(p: MelodyParams): LevelDef {
  return {
    n: p.n,
    title: p.title,
    blurb: p.blurb,
    pool: p.row.filter((d) => d !== '1'),
    questions: 8,
    make(ctx): SequenceQuestion {
      const { rng, settings } = ctx;
      const pc = pcOf(placeNote(rng, settings, 45, 56));
      const lowest = Math.min(...p.row.map((d) => rowKeyFor(d, 0).midi));
      // The tonic sits so that the whole row lies between D3 and A4.
      let tonic = 50 + ((pc - 50 + 1200) % 12);
      if (tonic + lowest < 47) tonic += 12;
      const keys = p.row.map((d) => rowKeyFor(d, tonic));
      const target = phrase(ctx, p);
      const gap = 0.6;
      const plan = sequencePlan(keys, target, gap);
      const tonicName = (p.mode === 'major' ? ROOT_NAMES : MINOR_TONICS)[pc];
      const keyName = `${tonicName} ${p.mode}`;
      return {
        kind: 'sequence',
        id: `melody:${p.n}:${ctx.seed}:${ctx.index}`,
        drill: 'melody',
        level: p.n,
        index: ctx.index,
        seed: ctx.seed,
        prompt: 'Play it back: tap the notes in order.',
        plan,
        subject: planNotes(plan, 'subject'),
        firstNote: tonic,
        keyName: `${formatKey(keyName)} · starts on ${formatNote(`${tonicName}${Math.floor(tonic / 12) - 1}`)}`,
        canSlow: true,
        canSpread: false,
        truth: { tonic, notes: plan.events.map((e) => e.midis[0]), mode: p.mode },
        keys,
        target,
        given: 1,
        noteGap: gap,
      };
    },
  };
}

const MAJOR = ['1', '2', '3', '4', '5', '6', '7', "1'"];
const MINOR = ['1', '2', 'b3', '4', '5', 'b6', 'b7', "1'"];

/** The melody-playback drill. */
export const melodyDrill: DrillDef = {
  id: 'melody',
  title: 'Melody playback',
  trains: 'Hearing a tune and finding it: how you learn songs without tab.',
  icon: 'Music',
  prompt: 'Play it back: tap the notes in order.',
  path: { start: 10, pace: 6.5 },
  levels: [
    level({ n: 1, title: 'Do, re, mi', blurb: 'Three notes from 1, 2, 3', row: ['1', '2', '3'], mode: 'major', length: 3, maxStep: 1, repeats: false }),
    level({ n: 2, title: 'Up to sol', blurb: 'Three notes, steps from 1 to 5', row: ['1', '2', '3', '4', '5'], mode: 'major', length: 3, maxStep: 1, repeats: false }),
    level({ n: 3, title: 'Steps and skips', blurb: 'Four notes, 1 to 5', row: ['1', '2', '3', '4', '5'], mode: 'major', length: 4, maxStep: 2, repeats: false }),
    level({ n: 4, title: 'Pentatonic leaps', blurb: 'Four notes of the major pentatonic', row: ['1', '2', '3', '5', '6', "1'"], mode: 'major', length: 4, maxStep: 2, repeats: false }),
    level({ n: 5, title: 'The whole scale', blurb: 'Five notes, the major scale', row: MAJOR, mode: 'major', length: 5, maxStep: 2, repeats: false }),
    level({ n: 6, title: 'In a minor key', blurb: 'Five notes, natural minor', row: MINOR, mode: 'minor', length: 5, maxStep: 2, repeats: false }),
    level({ n: 7, title: 'Longer phrases', blurb: 'Six notes, leaps and repeats', row: ['5,', '6,', '7,', ...MAJOR], mode: 'major', length: 6, maxStep: 3, repeats: true }),
  ],
  info: melodyInfo,
  mixSentence: (answer, chosen) => `In a melody, you often hear ${answer.name} as ${chosen.name}.`,
};

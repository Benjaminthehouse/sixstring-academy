/**
 * Bass lines: a short line on a bass guitar, an octave or two below the guitar's melodies, starting
 * on the tonic; rebuild it on the note row. Low notes are harder to pin down than high ones (the ear
 * hears their overtones more than their fundamental), which is exactly why a band player trains them.
 * Row keys are all different pitches, so there is exactly one right sequence.
 */
import { formatDegree, formatKey, formatNote, spellInKey } from '@/core/theory';
import { MINOR_TONICS, ROOT_NAMES, pcOf, placeNote } from '../question';
import { melodic, planNotes } from '../sound';
import type { DrillDef, GenContext, LevelDef, OptionInfo, RowKey, SequenceQuestion, SoundPlan } from '../types';
import { SOLFEGE } from './degrees';
import { idSemitones } from './dictation';

/** Lowest note of a four-string bass (E1) and the highest a bass line here reaches. */
export const BASS_LOW = 28;
export const BASS_HIGH = 57;
/** The bass voice the drill plays. */
export const BASS_TONE = 'bass-finger' as const;

/** A row key of a bass line: `1`, `5,` (the fifth below), `1'` (the octave above). */
function bassKey(degree: string, tonic: number): RowKey {
  const base = degree.replace(/[',]$/, '');
  const syllable = SOLFEGE[base] ?? '';
  const sub = degree.endsWith("'") ? `high ${syllable}` : degree.endsWith(',') ? `low ${syllable}` : syllable;
  return { id: degree, midi: tonic + idSemitones(degree), label: formatDegree(base) + (degree.endsWith("'") ? "'" : degree.endsWith(',') ? ',' : ''), sub };
}

/** Label and name of a note of a bass line, for the confusion record. */
export function bassInfo(id: string): OptionInfo {
  const base = id.replace(/[',]$/, '');
  const syllable = SOLFEGE[base] ?? '';
  const sub = id.endsWith("'") ? `high ${syllable}` : id.endsWith(',') ? `low ${syllable}` : syllable;
  return { id, label: formatDegree(base), name: `${formatDegree(base)} (${sub})`, detail: sub };
}

/** A bass line (or the learner's version of it) on the bass. */
export function bassPlan(midis: readonly number[], gap: number): SoundPlan {
  const plan = melodic(midis, { gap, dur: gap * 0.95, tail: 0.7, velocity: 0.85 });
  return { ...plan, events: plan.events.map((e) => ({ ...e, tone: BASS_TONE })) };
}

interface BassParams {
  n: number;
  title: string;
  blurb: string;
  row: string[];
  mode: 'major' | 'minor';
  length: number;
  maxStep: number;
}

/** A walk over the row from the tonic that contains `answer` when it can. */
function line(ctx: GenContext, p: BassParams): string[] {
  const start = p.row.indexOf('1');
  let best: string[] = [];
  for (let attempt = 0; attempt < 24; attempt++) {
    const idx = [start];
    while (idx.length < p.length) {
      const here = idx[idx.length - 1];
      const moves: number[] = [];
      for (let d = -p.maxStep; d <= p.maxStep; d++) if (d !== 0 && here + d >= 0 && here + d < p.row.length) moves.push(here + d);
      idx.push(ctx.rng.pick(moves));
    }
    best = idx.map((i) => p.row[i]);
    if (best.slice(1).includes(ctx.answer)) break;
  }
  return best;
}

function level(p: BassParams): LevelDef {
  return {
    n: p.n,
    title: p.title,
    blurb: p.blurb,
    pool: p.row.filter((d) => d !== '1'),
    questions: 8,
    make(ctx): SequenceQuestion {
      const { rng, settings } = ctx;
      const pc = pcOf(placeNote(rng, settings, 33, 44));
      // A1 to G#2: a fifth below stays on the bass (E1 and up), an octave above stays under A3.
      const tonic = 33 + ((pc - 33 + 1200) % 12);
      const keys = p.row.map((d) => bassKey(d, tonic));
      const target = line(ctx, p);
      const gap = 0.55;
      const midis = target.map((id) => keys.find((k) => k.id === id)!.midi);
      const plan = bassPlan(midis, gap);
      const tonicName = (p.mode === 'major' ? ROOT_NAMES : MINOR_TONICS)[pc];
      const keyName = `${tonicName} ${p.mode}`;
      return {
        kind: 'sequence',
        id: `bass:${p.n}:${ctx.seed}:${ctx.index}`,
        drill: 'bass',
        level: p.n,
        index: ctx.index,
        seed: ctx.seed,
        prompt: 'What did the bass play? Tap its notes in order.',
        plan,
        subject: planNotes(plan, 'subject'),
        firstNote: tonic,
        keyName: `${formatKey(keyName)} · starts on ${formatNote(spellInKey(tonic, keyName, { octave: true }), { octave: true })}`,
        canSlow: true,
        canSpread: false,
        truth: { tonic, notes: midis, mode: p.mode },
        keys,
        target,
        given: 1,
        noteGap: gap,
        tone: BASS_TONE,
      };
    },
  };
}

/** The bass-line drill. */
export const bassDrill: DrillDef = {
  id: 'bass',
  title: 'Bass lines',
  trains: 'Hearing the low end: what the bass plays under every song.',
  icon: 'AudioWaveform',
  prompt: 'What did the bass play? Tap its notes in order.',
  path: { start: 18, pace: 7 },
  levels: [
    level({ n: 1, title: 'Root, four, five', blurb: 'Three notes from 1, 4, 5', row: ['1', '4', '5'], mode: 'major', length: 3, maxStep: 2 }),
    level({ n: 2, title: 'Steps up to five', blurb: 'Four notes, steps from 1 to 5', row: ['1', '2', '3', '4', '5'], mode: 'major', length: 4, maxStep: 1 }),
    level({ n: 3, title: 'Fifths and octaves', blurb: 'Four notes: the fifth below, root, fifth, octave', row: ['5,', '1', '5', "1'"], mode: 'major', length: 4, maxStep: 3 }),
    level({ n: 4, title: 'A walking line', blurb: 'Five notes, low 5 up to 5', row: ['5,', '6,', '7,', '1', '2', '3', '4', '5'], mode: 'major', length: 5, maxStep: 2 }),
    level({ n: 5, title: 'A minor groove', blurb: 'Five notes in a minor key', row: ['5,', 'b7,', '1', 'b3', '4', '5', 'b7'], mode: 'minor', length: 5, maxStep: 2 }),
  ],
  info: bassInfo,
  mixSentence: (answer, chosen) => `In a bass line, you often hear ${answer.name} as ${chosen.name}.`,
};

/**
 * Melodic dictation on the neck: hear a short phrase in a key, then find it on the guitar: tap its
 * notes on a neck (or play them, through the microphone). The first note is given. Every pitch of
 * the neck area is a key, named by its degree in the key and its octave, so exactly one sequence of
 * taps is right, and a note an octave off is a different (wrong) note.
 */
import { formatDegree, formatKey, formatNote, spellInKey } from '@/core/theory';
import { MINOR_TONICS, ROOT_NAMES, pcOf, placeNote } from '../question';
import { melodic, planNotes } from '../sound';
import type { DrillDef, GenContext, LevelDef, NeckArea, OptionInfo, RowKey, SequenceQuestion, SoundPlan } from '../types';
import { SOLFEGE, degreeSemitones } from './degrees';

/** The twelve degrees from the tonic, by semitone. */
const CHROMATIC = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'] as const;

/** Lowest and highest sounding note of the open strings in standard tuning. */
const OPEN_LOW = 40;
const OPEN_HIGH = 64;

/** Id of the note `semis` above the tonic: its degree, with `'` per octave up and `,` per octave down. */
export function degreeId(semis: number): string {
  const octave = Math.floor(semis / 12);
  const degree = CHROMATIC[((semis % 12) + 12) % 12];
  return degree + (octave > 0 ? "'".repeat(octave) : ",".repeat(-octave));
}

/** Semitones above the tonic of a degree id (inverse of {@link degreeId}). */
export function idSemitones(id: string): number {
  const ups = (id.match(/'/g) ?? []).length;
  const downs = (id.match(/,/g) ?? []).length;
  return degreeSemitones(id.replace(/[',]/g, '')) + 12 * (ups - downs);
}

/** Label and name of a note of the dictation, for the confusion record ("5 (sol), an octave up"). */
export function dictationInfo(id: string): OptionInfo {
  const base = id.replace(/[',]/g, '');
  const ups = (id.match(/'/g) ?? []).length;
  const downs = (id.match(/,/g) ?? []).length;
  const label = formatDegree(base) + "'".repeat(ups) + ','.repeat(downs);
  const where = ups ? (ups > 1 ? `${ups} octaves up` : 'an octave up') : downs ? (downs > 1 ? `${downs} octaves down` : 'an octave down') : '';
  const syllable = SOLFEGE[base] ?? '';
  return { id, label, name: `${formatDegree(base)} (${syllable})${where ? `, ${where}` : ''}`, detail: syllable };
}

/** The pitches of a neck area in standard tuning, lowest first. */
export function neckPitches(area: NeckArea): number[] {
  const out: number[] = [];
  for (let m = OPEN_LOW + area.frets[0]; m <= OPEN_HIGH + area.frets[1]; m++) out.push(m);
  return out;
}

/** Every pitch of a neck area as a key: named in the key (`G3`), with its degree underneath. */
export function neckKeys(tonic: number, keyName: string, area: NeckArea): RowKey[] {
  return neckPitches(area).map((midi) => {
    const id = degreeId(midi - tonic);
    return { id, midi, label: formatNote(spellInKey(midi, keyName, { octave: true }), { octave: true }), sub: formatDegree(id.replace(/[',]/g, '')) };
  });
}

interface DictationParams {
  n: number;
  title: string;
  blurb: string;
  /** Degrees the phrase may use (`1'` the octave), low to high. */
  row: string[];
  mode: 'major' | 'minor';
  length: number;
  /** Largest step in row positions. */
  maxStep: number;
  area: NeckArea;
}

/** A walk over the row from the tonic, containing the picker's `answer` when it can. */
function phrase(ctx: GenContext, p: DictationParams): string[] {
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

/** Plays a dictation (or what the learner tapped): one note after another. */
export function dictationPlan(midis: readonly number[], gap: number): SoundPlan {
  return melodic(midis, { gap, dur: gap * 1.5, tail: 0.6 });
}

function level(p: DictationParams): LevelDef {
  return {
    n: p.n,
    title: p.title,
    blurb: p.blurb,
    pool: p.row.filter((d) => d !== '1'),
    questions: 8,
    make(ctx): SequenceQuestion {
      const { rng, settings } = ctx;
      const pc = pcOf(placeNote(rng, settings, 45, 56));
      // A2 to G#3: the phrase (at most an octave above) stays inside the first five frets.
      const tonic = 45 + ((pc - 45 + 1200) % 12);
      const tonicName = (p.mode === 'major' ? ROOT_NAMES : MINOR_TONICS)[pc];
      const keyName = `${tonicName} ${p.mode}`;
      const keys = neckKeys(tonic, keyName, p.area);
      const midis = phrase(ctx, p).map((d) => tonic + idSemitones(d));
      const target = midis.map((m) => degreeId(m - tonic));
      const gap = 0.6;
      const plan = dictationPlan(midis, gap);
      return {
        kind: 'sequence',
        id: `dictation:${p.n}:${ctx.seed}:${ctx.index}`,
        drill: 'dictation',
        level: p.n,
        index: ctx.index,
        seed: ctx.seed,
        prompt: 'Find it on the neck: tap the notes in order.',
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
        input: 'neck',
        neck: p.area,
      };
    },
  };
}

const OPEN: NeckArea = { frets: [0, 5] };
const FIFTH: NeckArea = { frets: [4, 9] };

/** The melodic-dictation drill. */
export const dictationDrill: DrillDef = {
  id: 'dictation',
  title: 'Melodic dictation',
  trains: 'Hearing a tune and finding it on the neck: playing what you hear.',
  icon: 'Guitar',
  prompt: 'Find it on the neck: tap the notes in order.',
  path: { start: 12, pace: 6 },
  levels: [
    level({ n: 1, title: 'Three notes', blurb: 'Steps from 1 to 3', row: ['1', '2', '3'], mode: 'major', length: 3, maxStep: 1, area: OPEN }),
    level({ n: 2, title: 'Up to sol', blurb: 'Four notes, steps from 1 to 5', row: ['1', '2', '3', '4', '5'], mode: 'major', length: 4, maxStep: 1, area: OPEN }),
    level({ n: 3, title: 'Steps and skips', blurb: 'Four notes, 1 to 5', row: ['1', '2', '3', '4', '5'], mode: 'major', length: 4, maxStep: 2, area: OPEN }),
    level({ n: 4, title: 'The major scale', blurb: 'Five notes, 1 to the octave', row: ['1', '2', '3', '4', '5', '6', '7', "1'"], mode: 'major', length: 5, maxStep: 2, area: OPEN }),
    level({ n: 5, title: 'In a minor key', blurb: 'Five notes, natural minor', row: ['1', '2', 'b3', '4', '5', 'b6', 'b7', "1'"], mode: 'minor', length: 5, maxStep: 2, area: OPEN }),
    level({ n: 6, title: 'A pentatonic lick', blurb: 'Five notes, minor pentatonic, up the neck', row: ['1', 'b3', '4', '5', 'b7', "1'"], mode: 'minor', length: 5, maxStep: 2, area: FIFTH }),
  ],
  info: dictationInfo,
  mixSentence: (answer, chosen) => `In a dictation, you often play ${answer.name} as ${chosen.name}.`,
};

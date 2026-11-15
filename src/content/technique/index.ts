/**
 * The technique exercises: every exercise of the plan written out as playable SixTab with its
 * tempo ladder, common mistakes, health warnings and microphone check. Read API.md next to this
 * file. Tests: `npx vitest run src/content/technique`.
 */
import { sixTab, type Song } from '@/core/song';
import { BENDS } from './exercises/bends';
import { BOTH } from './exercises/both';
import { CHORDS } from './exercises/chords';
import { FINGERSTYLE } from './exercises/fingerstyle';
import { FRETTING } from './exercises/fretting';
import { HEALTH } from './exercises/health';
import { PICKING } from './exercises/picking';
import { SETUP } from './exercises/setup';
import { SHAPES } from './exercises/shapes';
import { TONE } from './exercises/tone';
import { header } from './generate';
import type { ChordPair, ExercisePart, Hand, SkillGroup, TechniqueExercise } from './types';

export type * from './types';
export { MAJOR_KEYS, MELODIC_MINOR_KEYS } from './exercises/both';

/** What each skill group is called and is about, in browsing order. */
export const SKILL_GROUPS: ReadonlyArray<{ id: SkillGroup; name: string; description: string; icon: string }> = [
  { id: 'health', name: 'Healthy playing', description: 'Posture, warming up, cooling down and playing without pain.', icon: 'Heart' },
  { id: 'setup', name: 'Tuning and the capo', description: 'Tune by ear and move your shapes into any key.', icon: 'Gauge' },
  { id: 'independence', name: 'Finger independence', description: 'One finger per fret, every finger order, holding and reaching.', icon: 'Hand' },
  { id: 'alternate-picking', name: 'Alternate picking', description: 'The pick, strict down-up strokes, string crossing and tremolo.', icon: 'ArrowUpDown' },
  { id: 'strumming', name: 'Strumming', description: 'Constant motion, accuracy, subdivisions and the rasgueado.', icon: 'AudioWaveform' },
  { id: 'fingerstyle', name: 'Fingerstyle', description: 'p i m a, rest strokes, the thumb, Travis, tremolo and hybrid picking.', icon: 'Fingerprint' },
  { id: 'legato', name: 'Legato and tapping', description: 'Hammer-ons, pull-offs, trills and two-handed tapping.', icon: 'Spline' },
  { id: 'bends', name: 'Bends', description: 'Half, whole and wider bends, unison bends and pre-bends, in tune.', icon: 'TrendingUp' },
  { id: 'vibrato', name: 'Vibrato', description: 'Bending vibrato in time and classical vibrato.', icon: 'Waves' },
  { id: 'chords', name: 'Chord changes and barre', description: 'One-minute changes, barre strength and barre changes.', icon: 'Grid3x3' },
  { id: 'shapes', name: 'Octaves, double stops and triads', description: 'Two- and three-note shapes for melody and harmony.', icon: 'Layers' },
  { id: 'shifts', name: 'Shifts and slides', description: 'Moving along the neck cleanly, slides and the bottleneck.', icon: 'MoveHorizontal' },
  { id: 'muting', name: 'Muting', description: 'Palm muting and silencing strings with either hand.', icon: 'VolumeX' },
  { id: 'sweep', name: 'Economy and sweep picking', description: 'One stroke across several strings.', icon: 'ChevronsRight' },
  { id: 'tone', name: 'Tone, dynamics and harmonics', description: 'Loud and soft on purpose, and the three kinds of harmonics.', icon: 'Sparkles' },
  { id: 'time', name: 'Sync, time and speed', description: 'Both hands together, time feel, speed bursts and every key.', icon: 'Timer' },
];

/** The hands, as the screen names them. */
export const HANDS: ReadonlyArray<{ id: Hand; name: string; short: string }> = [
  { id: 'fretting', name: 'Fretting hand', short: 'Fretting' },
  { id: 'picking', name: 'Picking hand', short: 'Picking' },
  { id: 'both', name: 'Both hands', short: 'Both' },
];

const ALL: TechniqueExercise[] = [...HEALTH, ...SETUP, ...FRETTING, ...PICKING, ...FINGERSTYLE, ...BENDS, ...CHORDS, ...SHAPES, ...TONE, ...BOTH];

/** Every exercise, easiest first (by level, then in authored order). */
export const TECHNIQUE_EXERCISES: readonly TechniqueExercise[] = ALL.map((e, i) => ({ e, i }))
  .sort((a, b) => a.e.level - b.e.level || a.i - b.i)
  .map((x) => x.e);

const BY_ID = new Map(TECHNIQUE_EXERCISES.map((e) => [e.id, e]));

/** The exercise with this id; the `tech-` prefix may be left out (`spider` finds `tech-spider`). */
export function getExercise(id: string): TechniqueExercise | null {
  return BY_ID.get(id) ?? BY_ID.get(`tech-${id}`) ?? null;
}

/** Exercises of one skill group, easiest first. */
export function exercisesBySkill(skill: SkillGroup): TechniqueExercise[] {
  return TECHNIQUE_EXERCISES.filter((e) => e.skill === skill);
}

/** The progress skill id of an exercise (`technique:tech-spider`). */
export function techniqueSkillId(id: string): string {
  return `technique:${id}`;
}

/** The progress skill id of a one-minute-changes pair (`chord-change:em-g`). */
export function chordChangeSkillId(pair: ChordPair): string {
  return `chord-change:${pair.id}`;
}

/** Whether the tempo ladder climbs (false for fixed-tempo exercises such as bends). */
export function hasLadder(e: TechniqueExercise): boolean {
  return e.tempo.step > 0 && e.tempo.goal > e.tempo.start;
}

/** The rungs of an exercise's ladder, start to goal. */
export function ladderRungs(e: TechniqueExercise): number[] {
  if (!hasLadder(e)) return [e.tempo.start];
  const out: number[] = [];
  for (let t = e.tempo.start; t <= e.tempo.goal; t += e.tempo.step) out.push(t);
  return out;
}

/** The song tempo (quarter notes per minute) for a ladder tempo: the ladder counts eighths in 7/8. */
export function songBpm(part: ExercisePart, ladderBpm: number): number {
  return ladderBpm * (part.tempoScale ?? (part.pulse === 'eighth' ? 0.5 : 1));
}

/** The whole SixTab file of a part at a ladder tempo. */
export function partSixTab(e: TechniqueExercise, part: ExercisePart, ladderBpm: number): string {
  const key = part.key ? `key: ${part.key}\n` : '';
  const capo = part.capo ? `capo: ${part.capo}\n` : '';
  return `${header(`${e.title}: ${part.name}`, songBpm(part, ladderBpm), part.time ?? '4/4')}${key}${capo}\n${part.tab}\n`;
}

const songCache = new Map<string, Song>();

/** A part as a Song at a ladder tempo (parsed once per exercise, part and tempo). */
export function partSong(e: TechniqueExercise, part: ExercisePart, bpm: number): Song {
  const key = `${e.id}/${part.id}/${Math.round(bpm)}`;
  let song = songCache.get(key);
  if (!song) {
    song = sixTab(partSixTab(e, part, bpm));
    song.meta.id = `${e.id}-${part.id}`;
    if (songCache.size > 64) songCache.clear();
    songCache.set(key, song);
  }
  return song;
}

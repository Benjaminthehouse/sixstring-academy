/**
 * Scale degrees in a key (functional hearing). A cadence or a drone sets the key, then one note
 * (or a short run ending on it) is played: which degree was it? The degree is the distance of the
 * note above the tonic, so every degree on offer is a different number of semitones.
 */
import { degreeToInterval, formatDegree, formatKey, progressionToChords, semitones } from '@/core/theory';
import { MINOR_TONICS, ROOT_NAMES, buildChoice, pcOf, placeNote } from '../question';
import { joinPlans, melodic, together, withRole } from '../sound';
import type { DrillDef, LevelDef, OptionInfo, SoundEvent, SoundPlan } from '../types';
import { playableShape } from './chords';

/** Movable-do syllables, by degree. */
export const SOLFEGE: Record<string, string> = {
  '1': 'do', b2: 'ra', '2': 're', b3: 'me', '3': 'mi', '4': 'fa', '#4': 'fi', '5': 'sol', b6: 'le', '6': 'la', b7: 'te', '7': 'ti',
};

/** Semitones of a degree above the tonic. */
export const degreeSemitones = (degree: string): number => semitones(degreeToInterval(degree));

/** Label, name and syllable of a degree answer. */
export function degreeInfo(id: string): OptionInfo {
  const label = formatDegree(id);
  const sub = SOLFEGE[id] ?? '';
  return { id, label, name: `${label} (${sub})`, detail: sub };
}

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];

type Mode = 'major' | 'minor';

/** The key-setting cadence (I IV V I, or i iv V i) strummed on guitar shapes, as context. */
export function cadencePlan(keyName: string, mode: Mode, bassNear: number): SoundPlan {
  const chords = progressionToChords(mode === 'major' ? 'I IV V I' : 'i iv V i', keyName);
  const events: SoundEvent[] = chords.map((symbol, i) => {
    const shape = playableShape(symbol, bassNear);
    return { at: i * 0.85, midis: shape.midis, strings: shape.strings, dur: i === chords.length - 1 ? 1.5 : 0.85, strike: 'strum', direction: 'down', role: 'context', velocity: 0.7 };
  });
  return { events, length: (chords.length - 1) * 0.85 + 1.5 };
}

/** The tonic chord alone (short context for comparisons). */
function tonicChord(keyName: string, mode: Mode, bassNear: number): SoundPlan {
  const symbol = progressionToChords(mode === 'major' ? 'I' : 'i', keyName)[0];
  const shape = playableShape(symbol, bassNear);
  return withRole(together(shape.midis, { strike: 'strum', strings: shape.strings, dur: 1.2, velocity: 0.7 }), 'context');
}

function level(n: number, title: string, pool: string[], mode: Mode, run: boolean, blurb?: string): LevelDef {
  return {
    n,
    title,
    blurb: blurb ?? `${pool.map((d) => formatDegree(d)).join(' · ')}${mode === 'minor' ? ' in a minor key' : ''}`,
    pool,
    questions: 10,
    make(ctx) {
      const { rng, settings } = ctx;
      const pc = pcOf(placeNote(rng, settings, 45, 56));
      const keyName = `${(mode === 'major' ? ROOT_NAMES : MINOR_TONICS)[pc]} ${mode}`;
      // The tonic the notes are measured from sits between E3 and D♯4; the chords sit an octave below.
      const tonic = 52 + ((pc - 52 + 1200) % 12);
      const steps = mode === 'major' ? MAJOR_STEPS : MINOR_STEPS;
      const target = (degree: string) => tonic + degreeSemitones(degree);
      // A run: two scale notes stepping toward the target from above or below, then the target.
      const fromAbove = rng.chance();
      const runNotes = (degree: string): number[] => {
        const t = target(degree);
        if (!run) return [t];
        const idx = steps.indexOf(degreeSemitones(degree));
        const at = (k: number) => tonic + 12 * Math.floor(k / 7) + steps[((k % 7) + 7) % 7];
        const dir = fromAbove ? 1 : -1;
        return [at(idx + 2 * dir), at(idx + dir), t];
      };
      const subject = (degree: string) => melodic(runNotes(degree), { gap: 0.6, dur: run ? 0.8 : 1.6, tail: 0.6 });
      const drone = settings.keySetter === 'drone';
      const context: SoundPlan = drone ? { events: [], length: 1.8 } : cadencePlan(keyName, mode, tonic - 12);
      let plan = joinPlans(context, subject(ctx.answer), drone ? 0.2 : 0.45);
      if (drone) plan = { ...plan, drone: { midi: tonic - 12, from: 0, to: plan.length } };
      const options = pool.map((id) => {
        const short = drone ? ({ events: [], length: 1.2 } as SoundPlan) : tonicChord(keyName, mode, tonic - 12);
        let p = joinPlans(short, subject(id), 0.35);
        if (drone) p = { ...p, drone: { midi: tonic - 12, from: 0, to: p.length } };
        return { ...degreeInfo(id), plan: p };
      });
      return buildChoice({
        drill: 'degrees',
        level: n,
        ctx,
        prompt: run ? 'Which degree was the last note?' : 'Which degree of the key was the note?',
        options,
        plan,
        canSlow: run,
        canSpread: false,
        keyName: formatKey(keyName),
        truth: { tonic, target: target(ctx.answer), offset: degreeSemitones(ctx.answer), mode, key: keyName, notes: runNotes(ctx.answer) },
      });
    },
  };
}

const MAJOR = ['1', '2', '3', '4', '5', '6', '7'];

/** The scale-degree drill. */
export const degreesDrill: DrillDef = {
  id: 'degrees',
  title: 'Scale degrees',
  trains: 'Hearing where a note sits in the key: the skill behind playing by ear.',
  icon: 'Key',
  prompt: 'Which degree of the key was the note?',
  path: { start: 8, pace: 6 },
  levels: [
    level(1, 'Home or the fifth', ['1', '5'], 'major', false),
    level(2, 'The major triad', ['1', '3', '5'], 'major', false),
    level(3, 'The first five', ['1', '2', '3', '4', '5'], 'major', false),
    level(4, 'The whole major scale', MAJOR, 'major', false, 'All seven degrees'),
    level(5, 'A minor key', ['1', '2', 'b3', '4', '5', 'b6', 'b7'], 'minor', false, 'Seven degrees in a minor key'),
    level(6, 'Every note', ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'], 'major', false, 'All twelve, in and out of the key'),
    level(7, 'Short runs', MAJOR, 'major', true, 'Three notes: name the last one'),
  ],
  info: degreeInfo,
  mixSentence: (answer, chosen) => `In a key, you often hear degree ${answer.label} (${answer.detail}) as ${chosen.label} (${chosen.detail}).`,
};

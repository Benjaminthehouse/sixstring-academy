/**
 * Mode Match: hear a mode over a drone and name it, or see its pattern on the neck (root marked)
 * and name it. The levels grow from major against minor to all seven modes of the major scale.
 */
import { getScale, scaleMidi, scaleNotes, simplestTonic, noteToMidi } from '@/core/theory';
import { scalePatterns, type ScalePattern, type Tuning, STANDARD_TUNING } from '@/core/guitar';
import { makeRng, pick, randInt, rotation, shuffle } from './rng';

/** The seven modes, in the order of the major scale. */
export const MODES = [
  { id: 'major', name: 'Ionian', plain: 'Major', colour: 'Bright and settled. The 7th sits a half step under the root and pulls home.' },
  { id: 'dorian', name: 'Dorian', plain: 'Dorian', colour: 'Minor, with a major 6th that sounds hopeful.' },
  { id: 'phrygian', name: 'Phrygian', plain: 'Phrygian', colour: 'Minor, with a ♭2 right above the root: dark, Spanish-sounding.' },
  { id: 'lydian', name: 'Lydian', plain: 'Lydian', colour: 'Major, with a ♯4: dreamy and floating.' },
  { id: 'mixolydian', name: 'Mixolydian', plain: 'Mixolydian', colour: 'Major, with a ♭7: bluesy, the sound of rock and folk.' },
  { id: 'minor', name: 'Aeolian', plain: 'Minor', colour: 'Minor, with a ♭6: sad and serious. This is the natural minor scale.' },
  { id: 'locrian', name: 'Locrian', plain: 'Locrian', colour: 'A ♭2 and a ♭5: unstable, with no solid home chord.' },
] as const;

/** A mode id (`major`, `dorian` …, `minor`, `locrian`). */
export type ModeId = (typeof MODES)[number]['id'];

/** The mode's entry in {@link MODES}. */
export function modeInfo(id: string): (typeof MODES)[number] {
  return MODES.find((m) => m.id === id) ?? MODES[0];
}

/** What a mode is called on an answer button: "Major", "Minor" on the first level, the Greek names after. */
export function modeLabel(id: string, plain: boolean): string {
  const m = modeInfo(id);
  if (plain) return m.plain;
  return m.id === 'major' ? 'Ionian (major)' : m.id === 'minor' ? 'Aeolian (minor)' : m.name;
}

/** One level of Mode Match. */
export interface ModeLevel {
  n: number;
  title: string;
  goal: string;
  modes: readonly ModeId[];
  /** Share of questions you see rather than hear (0 = all by ear, 1 = all on the neck). */
  eye: number;
  questions: number;
  /** Name the modes plainly ("Major", "Minor") instead of by their Greek names. */
  plain: boolean;
}

/** The levels, easiest first. */
export const MODE_LEVELS: readonly ModeLevel[] = [
  { n: 1, title: 'Major or minor', goal: 'Hear a scale over a drone: is it major or minor?', modes: ['major', 'minor'], eye: 0, questions: 8, plain: true },
  { n: 2, title: 'The bluesy major', goal: 'Major, minor, and Mixolydian (major with a ♭7).', modes: ['major', 'mixolydian', 'minor'], eye: 0, questions: 10, plain: false },
  { n: 3, title: 'The hopeful minor', goal: 'Add Dorian (minor with a major 6th). Some you will see on the neck.', modes: ['major', 'dorian', 'mixolydian', 'minor'], eye: 0.2, questions: 10, plain: false },
  { n: 4, title: 'Brightest and darkest', goal: 'Add Lydian and Phrygian.', modes: ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'minor'], eye: 0.3, questions: 10, plain: false },
  { n: 5, title: 'All seven', goal: 'Every mode of the major scale, Locrian too.', modes: ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'minor', 'locrian'], eye: 0.3, questions: 12, plain: false },
  { n: 6, title: 'Read the neck', goal: 'See a mode’s shape around its root and name it.', modes: ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'minor', 'locrian'], eye: 1, questions: 10, plain: false },
];

/** One question. */
export interface ModeQuestion {
  index: number;
  kind: 'ear' | 'eye';
  mode: ModeId;
  /** Spelled tonic. */
  tonic: string;
  /** Answer choices: the level's modes, in the order of the major scale (the same keys every time). */
  options: ModeId[];
  /** Ear: the drone note and the scale, up and back, as MIDI numbers. */
  drone: number;
  notes: number[];
  /** Eye: the shape shown (root marked, no labels). */
  pattern: ScalePattern | null;
}

/** A round of Mode Match. */
export interface ModeRound {
  level: ModeLevel;
  questions: ModeQuestion[];
  seed: number;
}

// Tonics that keep the drone (octave 2) and the scale (octave 3) in the guitar's range.
const TONIC_PCS = [4, 5, 7, 9, 10, 11, 0, 2];

/** Build a round. `tonic` pins every question to one tonic (the learner's current key). */
export function makeModeRound(level: ModeLevel, seed: number, opts: { size?: number; tonic?: string; tuning?: Tuning } = {}): ModeRound {
  const rng = makeRng(seed);
  const count = Math.max(1, opts.size ?? level.questions);
  const modes = rotation(rng, level.modes, count);
  const eyeCount = Math.round(count * level.eye);
  const eyeAt = new Set(shuffle(rng, Array.from({ length: count }, (_, i) => i)).slice(0, eyeCount));
  const options = MODES.map((m) => m.id).filter((id) => level.modes.includes(id));
  const questions = modes.map((mode, index): ModeQuestion => {
    const pc = opts.tonic ? noteToMidi(opts.tonic, 0) % 12 : pick(rng, TONIC_PCS);
    const tonic = simplestTonic(pc, mode);
    // Octave 3 for the scale, the drone an octave below: E3…D4 lies well inside the guitar.
    const base = 48 + ((pc - 0 + 12) % 12) + (pc < 4 ? 12 : 0);
    const up = scaleMidi(base, mode, 1);
    const notes = [...up, ...up.slice(0, -1).reverse()];
    const kind = eyeAt.has(index) ? 'eye' : 'ear';
    let pattern: ScalePattern | null = null;
    if (kind === 'eye') {
      const shapes = scalePatterns(tonic, mode, { system: 'caged', tuning: opts.tuning ?? STANDARD_TUNING, maxFret: 15 });
      pattern = shapes.length ? shapes[randInt(rng, shapes.length)] : null;
    }
    return { index, kind: pattern || kind === 'ear' ? kind : 'ear', mode, tonic, options, drone: base - 12, notes, pattern };
  });
  return { level, questions, seed };
}

/** The spelled notes of the question's mode, for the explanation after an answer. */
export function questionNotes(q: Pick<ModeQuestion, 'tonic' | 'mode'>): string[] {
  return scaleNotes(q.tonic, q.mode);
}

/** The degrees that make a mode different from plain major or minor, for the explanation. */
export function modeDegrees(id: string): string[] {
  return getScale(id)?.degrees ?? [];
}

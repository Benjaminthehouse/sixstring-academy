/**
 * Intervals: going up, going down, together (harmonic), and compound intervals for experts.
 * Every level offers only intervals of different sizes (A4 stands for the tritone; d5 is never
 * offered beside it), so a question always has exactly one right answer by ear.
 */
import { intervalName, parseInterval, semitones } from '@/core/theory';
import { buildChoice, placeNote, withArticle } from '../question';
import { melodic, together } from '../sound';
import type { DrillDef, DrillId, LevelDef, OptionInfo, SoundPlan } from '../types';

type Direction = 'up' | 'down' | 'together';

/**
 * Memory aids: well-known traditional or public-domain tunes whose first change of note is this
 * interval (a repeated first note is allowed, as in Twinkle, Twinkle). Intervals with no tune that
 * is both old enough and widely known have none, rather than a doubtful one.
 */
export const MEMORY_TUNES: Record<'up' | 'down', Partial<Record<string, string>>> = {
  up: {
    m2: 'The Entertainer',
    M2: 'Frère Jacques',
    m3: 'Greensleeves',
    M3: 'When the Saints Go Marching In',
    P4: 'Amazing Grace',
    P5: 'Twinkle, Twinkle, Little Star',
    M6: 'My Bonnie Lies over the Ocean',
  },
  down: {
    m2: 'Für Elise',
    M2: 'Mary Had a Little Lamb',
    m3: 'This Old Man',
    M3: "Beethoven's Fifth Symphony",
    P4: 'Eine kleine Nachtmusik',
  },
};

const ORDINAL = (n: number): string => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${s}`;
};

/** Short spoken name of an interval: "major 3rd", "octave", "tritone". Derived from the theory engine. */
export function intervalWords(id: string): string {
  if (id === 'P8') return 'octave';
  if (id === 'P15') return 'two octaves';
  if (id === 'A4') return 'tritone';
  const quality = intervalName(id).split(' ')[0];
  return `${quality} ${ORDINAL(parseInterval(id)?.number ?? 0)}`;
}

/** Label and name of an interval answer. */
export function intervalInfo(id: string, direction: Direction = 'up'): OptionInfo {
  const words = intervalWords(id);
  const aid = direction === 'together' ? undefined : MEMORY_TUNES[direction][id];
  return { id, label: id === 'A4' ? 'TT' : id, name: words, detail: id === 'A4' ? 'tritone (A4)' : words, ...(aid ? { aid } : {}) };
}

const PROMPTS: Record<Direction, string> = {
  up: 'Which interval went up?',
  down: 'Which interval went down?',
  together: 'Which interval sounded together?',
};

function level(drill: DrillId, direction: Direction, n: number, title: string, pool: string[]): LevelDef {
  const blurb = pool.length === 12 && drill !== 'compound' ? 'All twelve' : pool.map((id) => (id === 'A4' ? 'TT' : id)).join(' · ');
  return {
    n,
    title,
    blurb,
    pool,
    questions: 10,
    make(ctx) {
      const { rng } = ctx;
      const size = semitones(ctx.answer);
      const widest = Math.max(...pool.map((id) => semitones(id)));
      // The first note is placed so that every option of the level fits on the guitar from it.
      const first =
        direction === 'down'
          ? placeNote(rng, ctx.settings, Math.max(52, 45 + widest), Math.min(76, 52 + widest + 12))
          : placeNote(rng, ctx.settings, drill === 'compound' ? 43 : 45, Math.min(64, 79 - widest));
      const second = (id: string) => first + (direction === 'down' ? -semitones(id) : semitones(id));
      const plan = (id: string): SoundPlan =>
        direction === 'together' ? together([first, second(id)], { dur: 2.4 }) : melodic([first, second(id)], { gap: 0.9, dur: 1.3 });
      const options = pool.map((id) => ({ ...intervalInfo(id, direction), plan: plan(id) }));
      return buildChoice({
        drill,
        level: n,
        ctx,
        prompt: PROMPTS[direction],
        options,
        canSlow: direction !== 'together',
        canSpread: direction === 'together',
        truth: { first, second: second(ctx.answer), semitones: size, direction },
      });
    },
  };
}

const ALL = ['m2', 'M2', 'm3', 'M3', 'P4', 'A4', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8'];

const mix = (answer: OptionInfo, chosen: OptionInfo) => `You often hear ${withArticle(answer.name)} as ${withArticle(chosen.name)}.`;

/** Intervals going up: the classic ladder from two very different sounds to all twelve. */
export const intervalsUpDrill: DrillDef = {
  id: 'intervals-up',
  title: 'Intervals going up',
  trains: 'The distance between two notes, the building block of every tune.',
  icon: 'ArrowUpRight',
  prompt: 'Which interval went up?',
  path: { start: 3.5, pace: 4 },
  levels: [
    level('intervals-up', 'up', 1, 'Third or octave', ['M3', 'P8']),
    level('intervals-up', 'up', 2, 'Add the fifth', ['M3', 'P5', 'P8']),
    level('intervals-up', 'up', 3, 'Add the fourth', ['M3', 'P4', 'P5', 'P8']),
    level('intervals-up', 'up', 4, 'Minor or major third', ['m3', 'M3', 'P4', 'P5', 'P8']),
    level('intervals-up', 'up', 5, 'Steps and sixths', ['M2', 'm3', 'M3', 'P4', 'P5', 'M6', 'P8']),
    level('intervals-up', 'up', 6, 'Half steps and minor sixths', ['m2', 'M2', 'm3', 'M3', 'P4', 'P5', 'm6', 'M6', 'P8']),
    level('intervals-up', 'up', 7, 'The sevenths', ['m2', 'M2', 'm3', 'M3', 'P4', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8']),
    level('intervals-up', 'up', 8, 'All twelve', ALL),
  ],
  info: (id) => intervalInfo(id, 'up'),
  mixSentence: mix,
};

/** Intervals going down. */
export const intervalsDownDrill: DrillDef = {
  id: 'intervals-down',
  title: 'Intervals going down',
  trains: 'The same distances, falling: how most phrases come home.',
  icon: 'TrendingDown',
  prompt: 'Which interval went down?',
  path: { start: 16, pace: 7 },
  levels: [
    level('intervals-down', 'down', 1, 'Third or octave', ['M3', 'P8']),
    level('intervals-down', 'down', 2, 'Thirds and fifths', ['m3', 'M3', 'P5', 'P8']),
    level('intervals-down', 'down', 3, 'Steps, fourths and sixths', ['M2', 'm3', 'M3', 'P4', 'P5', 'M6', 'P8']),
    level('intervals-down', 'down', 4, 'Eleven intervals', ALL.filter((i) => i !== 'A4')),
    level('intervals-down', 'down', 5, 'All twelve', ALL),
  ],
  info: (id) => intervalInfo(id, 'down'),
  mixSentence: mix,
};

/** Harmonic intervals: two notes struck together, as in a double stop. */
export const intervalsTogetherDrill: DrillDef = {
  id: 'intervals-together',
  title: 'Intervals together',
  trains: 'Two notes at once: double stops, power chords and harmony.',
  icon: 'Layers',
  prompt: 'Which interval sounded together?',
  path: { start: 24, pace: 8 },
  levels: [
    level('intervals-together', 'together', 1, 'Third or octave', ['M3', 'P8']),
    level('intervals-together', 'together', 2, 'Thirds and fifths', ['m3', 'M3', 'P5', 'P8']),
    level('intervals-together', 'together', 3, 'Add steps, fourths, sixths', ['M2', 'm3', 'M3', 'P4', 'P5', 'M6', 'P8']),
    level('intervals-together', 'together', 4, 'Eleven intervals', ALL.filter((i) => i !== 'A4')),
    level('intervals-together', 'together', 5, 'All twelve', ALL),
  ],
  info: (id) => intervalInfo(id, 'together'),
  mixSentence: mix,
};

/** Compound intervals (wider than an octave), for experts. */
export const compoundDrill: DrillDef = {
  id: 'compound',
  title: 'Compound intervals',
  trains: 'Leaps wider than an octave: ninths, tenths, twelfths, as in arpeggios across the neck.',
  icon: 'MoveVertical',
  prompt: 'Which compound interval went up?',
  path: { start: 52, pace: 8 },
  levels: [
    level('compound', 'up', 1, 'Tenth or twelfth', ['M10', 'P12']),
    level('compound', 'up', 2, 'Four wide leaps', ['M9', 'M10', 'P12', 'P15']),
    level('compound', 'up', 3, 'Ninths to thirteenths', ['m9', 'M9', 'm10', 'M10', 'P11', 'P12', 'm13', 'M13', 'P15']),
    level('compound', 'up', 4, 'All twelve, octave two', ['m9', 'M9', 'm10', 'M10', 'P11', 'A11', 'P12', 'm13', 'M13', 'm14', 'M14', 'P15']),
  ],
  info: (id) => intervalInfo(id, 'up'),
  mixSentence: mix,
};

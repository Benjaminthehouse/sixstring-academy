/**
 * The arcade's games: what each is called, what it trains, how it is played, and its levels for
 * the scale being practised.
 */
import { STANDARD_TUNING, type Tuning } from '@/core/guitar';
import { shapesFor, type Focus } from './focus';
import { NOTE_HUNT_LEVELS } from './noteHunt';
import { shapeBuilderLevels } from './shapeBuilder';
import { RUN_LEVELS } from './runScale';
import { DARTS_LEVELS } from './degreeDarts';
import { MODE_LEVELS } from './modeMatch';
import { LICK_LEVELS } from './lickEcho';
import { SPRINT_LEVELS } from './sprint';

/** Game ids, which are also route params: `#arcade--note-hunt`. */
export type GameId = 'note-hunt' | 'shape-builder' | 'run-the-scale' | 'degree-darts' | 'mode-match' | 'lick-echo' | 'fretboard-sprint';

/** What a level shows in lists. */
export interface LevelInfo {
  n: number;
  title: string;
  goal: string;
}

/** A game of the arcade. */
export interface GameDef {
  id: GameId;
  title: string;
  /** One line for its card. */
  blurb: string;
  /** Three short steps: how to play. */
  how: [string, string, string];
  /** lucide icon name. */
  icon: string;
  /** What it trains. */
  trains: Array<'fingers' | 'eyes' | 'ears'>;
  /** Can be played on the guitar through the microphone. */
  mic: boolean;
  /** Levels are kept per scale type, or (for the mode game) once for everything. */
  scope: 'scale' | 'modes';
}

/** Every game, in the order they appear in the arcade. */
export const GAMES: readonly GameDef[] = [
  {
    id: 'note-hunt',
    title: 'Note Hunt',
    blurb: 'Notes light up in the shape. Find each one, fast.',
    how: ['A note of the scale lights up or is named.', 'Play it on your guitar or tap it.', 'Quick, clean finds build your combo.'],
    icon: 'Crosshair',
    trains: ['fingers', 'eyes'],
    mic: true,
    scope: 'scale',
  },
  {
    id: 'shape-builder',
    title: 'Shape Builder',
    blurb: 'Rebuild a scale shape from memory, note by note.',
    how: ['Study the shape.', 'It disappears; only the roots stay.', 'Tap every note back into place.'],
    icon: 'Blocks',
    trains: ['eyes'],
    mic: false,
    scope: 'scale',
  },
  {
    id: 'run-the-scale',
    title: 'Run the Scale',
    blurb: 'Play the shape in time with the click. Clean runs go faster.',
    how: ['Four clicks count you in.', 'Play the next note on every click.', 'A clean run raises the tempo.'],
    icon: 'Gauge',
    trains: ['fingers'],
    mic: true,
    scope: 'scale',
  },
  {
    id: 'degree-darts',
    title: 'Degree Darts',
    blurb: 'Hit the ♭3, the 5th, the root: learn what each note does.',
    how: ['A degree is called: “the 5th”.', 'Hit it anywhere in the shape.', 'Each hit tells you what that note does.'],
    icon: 'Target',
    trains: ['eyes', 'ears'],
    mic: true,
    scope: 'scale',
  },
  {
    id: 'mode-match',
    title: 'Mode Match',
    blurb: 'Hear a mode over a drone, or see it on the neck, and name it.',
    how: ['A scale plays over a low drone.', 'Pick the mode it is.', 'Number keys answer, Space plays it again.'],
    icon: 'AudioLines',
    trains: ['ears', 'eyes'],
    mic: false,
    scope: 'modes',
  },
  {
    id: 'lick-echo',
    title: 'Lick Echo',
    blurb: 'Hear a short phrase from the scale and play it back.',
    how: ['Listen to the phrase (and read its tab).', 'Play it back on your guitar or tap it.', 'Every note is checked in order.'],
    icon: 'Repeat',
    trains: ['ears', 'fingers'],
    mic: true,
    scope: 'scale',
  },
  {
    id: 'fretboard-sprint',
    title: 'Fretboard Sprint',
    blurb: 'Find every place one note of the scale sits on the neck.',
    how: ['A note of the scale is named.', 'Tap every place it is, frets 0 to 12.', 'Beat the clock for a time bonus.'],
    icon: 'Timer',
    trains: ['eyes'],
    mic: false,
    scope: 'scale',
  },
];

const BY_ID = new Map(GAMES.map((g) => [g.id, g]));

/** A game by id, or null. */
export function gameById(id: string | undefined): GameDef | null {
  return (id && BY_ID.get(id as GameId)) || null;
}

/** True when a route param names a game. */
export function isGameId(id: string | undefined): id is GameId {
  return !!id && BY_ID.has(id as GameId);
}

/** The levels of a game for a focus (Shape Builder's levels are the scale's shapes; `frets`: the learner's neck setting). */
export function levelsOf(game: GameId, focus: Focus, tuning: Tuning = STANDARD_TUNING, frets?: number): LevelInfo[] {
  switch (game) {
    case 'note-hunt':
      return [...NOTE_HUNT_LEVELS];
    case 'shape-builder':
      return shapeBuilderLevels(shapesFor(focus.tonic, focus.scale, tuning, frets));
    case 'run-the-scale':
      return [...RUN_LEVELS];
    case 'degree-darts':
      return [...DARTS_LEVELS];
    case 'mode-match':
      return [...MODE_LEVELS];
    case 'lick-echo':
      return [...LICK_LEVELS];
    case 'fretboard-sprint':
      return [...SPRINT_LEVELS];
  }
}

/** Where a game keeps its level records: per scale type, or one shared set for the mode game. */
export function scopeOf(game: GameId, focus: Pick<Focus, 'scale'>): string {
  return BY_ID.get(game)?.scope === 'modes' ? 'modes' : focus.scale;
}

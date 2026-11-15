/**
 * The size limits content must respect, in one place. `validateCourse` enforces them and the
 * authoring guide quotes them. Text lengths count VISIBLE characters (markup removed), chosen so
 * that every text fits a 360 px wide phone without scrolling inside a lesson step.
 */

/** Longest visible text per place, in characters. */
export const TEXT_LIMITS = {
  courseTitle: 40,
  courseDescription: 160,
  unitTitle: 32,
  unitDescription: 140,
  lessonTitle: 40,
  teaches: 110,
  cardTitle: 40,
  cardBody: 320,
  cardTip: 160,
  prompt: 140,
  statement: 160,
  hint: 120,
  explain: 240,
  option: 48,
  optionWhy: 140,
  pairSide: 28,
  tile: 16,
  fillText: 120,
  bankWord: 16,
  flashFront: 120,
  flashBack: 220,
  caption: 80,
  audioLabel: 28,
  glossaryTerm: 28,
  glossaryDefinition: 160,
} as const;

/** A named text limit. */
export type TextLimit = keyof typeof TEXT_LIMITS;

/** How many items each exercise type may hold: `[fewest, most]`. */
export const COUNT_LIMITS = {
  /** Options of a choice or listen-choice exercise. */
  options: [2, 6],
  /** Pairs of a match-pairs exercise. */
  pairs: [3, 6],
  /** Tiles of an order exercise (distractors not counted). */
  tiles: [3, 8],
  /** Extra tiles of an order exercise. */
  orderDistractors: [0, 3],
  /** Blanks of a fill-blanks exercise. */
  blanks: [1, 4],
  /** Words in a fill-blanks bank (right words and distractors together). */
  bank: [2, 8],
  /** Positions an `all` fretboard-find may ask for. */
  findTargets: [1, 12],
  /** Notes of a play-phrase. */
  phraseNotes: [2, 16],
  /** Struck notes of a tap-rhythm. */
  rhythmNotes: [2, 16],
  /** Bars of a rhythm. */
  rhythmBars: [1, 2],
  /** Frets a fretboard figure or exercise may span. */
  fretSpan: [1, 13],
} as const;

/** Bounds of a lesson. */
export const LESSON_LIMITS = {
  /** Declared and estimated length in minutes. */
  minutes: [2, 5],
  /** Steps in a lesson. */
  steps: [6, 20],
  /** Exercises (steps that are not cards) in a lesson. */
  exercises: [4, 16],
  /** Different exercise types in a lesson. Fewer than this is a warning, not an error. */
  types: [3, 6],
  /** Teaching cards in a row before a question must come. */
  cardsInARow: 2,
  /** Facts a lesson may add to spaced repetition. */
  facts: [0, 6],
} as const;

/** Bounds of a unit and a course. */
export const COURSE_LIMITS = {
  lessonsPerUnit: [2, 12],
  checkpointSteps: [6, 20],
} as const;

/** Tempo range of anything that is played or tapped, in beats per minute. */
export const TEMPO_LIMITS = [40, 200] as const;

/** Highest fret content may refer to. */
export const MAX_FRET = 22;

/**
 * The lesson content model: Course > Unit > Lesson > Step, the figures a step can show, every
 * exercise type with its answer and feedback shapes, and generated steps.
 *
 * Everything here is plain JSON-serialisable data (no functions, no classes, no HTML strings), so
 * content can be authored as object literals, validated with `validateCourse`, stored inside a
 * saved session and rendered by any screen. The authoring guide in `API.md` explains each field
 * with examples; this file is the exact shape.
 *
 * Conventions are the app's: notes are ASCII (`F#`, `Bb3`) and always SOUNDING pitch, strings are
 * numbered 1 (thinnest) to 6, fret 0 is the open string, per-string arrays run low to high.
 */
import type { ReviewGrade, TeacherId } from '@/core/progress';
import type { GeneratorParamsMap } from './generators/params';

// ── Rich text ──────────────────────────────────────────────────────────────────────────────────

/**
 * Text with the inline markup of `text.ts` (`**bold**`, `*emphasis*`, `{n:F#}`, `{c:Am7}`,
 * `{i:m3}`, `{d:b3}`, `{r:bVII}`, `{k:A minor}`, `{t:barre}`). Give the object form with `say`
 * when text-to-speech needs different words than the screen.
 */
export type RichText = string | { text: string; say?: string };

// ── Shared small types ─────────────────────────────────────────────────────────────────────────

/** A place on the neck: `string` 1 = thinnest, `fret` 0 = open (same shape as the guitar engine's). */
export interface NeckPosition {
  string: number;
  fret: number;
}

/** Frets of a chord shape, low string to high: `'x32010'` or `[null, 3, 2, 0, 1, 0]` (null = muted). */
export type FretsInput = string | ReadonlyArray<number | null>;

/** The level content is written for; it sets timing tolerances and the starting difficulty. */
export type CourseLevel = 'beginner' | 'intermediate' | 'expert';

/** Whose course it is: one of the three teachers, or `none` for the Theory Path. */
export type CourseTeacher = TeacherId | 'none';

/** How a note answer is compared. `exact`: the spelling matters (C# is not Db). `any`: the pitch matters. */
export type SpellingPolicy = 'exact' | 'any';

/** How octaves are compared. `exact`: that very pitch. `any`: the same note name in any octave. */
export type OctavePolicy = 'exact' | 'any';

/**
 * A note length in the compact rhythm notation: `w` whole, `h` half, `q` quarter, `e` eighth,
 * `s` sixteenth; add `.` for a dot (`q.`) and `t` for a triplet (`et`).
 */
export type DurationCode = string;

// ── Figures ────────────────────────────────────────────────────────────────────────────────────

/** What a dot on a fretboard figure stands for; the renderer picks colour and shape from it. */
export type DotRole = 'root' | 'third' | 'fifth' | 'seventh' | 'tone' | 'target' | 'ghost' | 'muted';

/** One dot of a fretboard figure. */
export interface FretDot extends NeckPosition {
  /** Text inside the dot. Default: decided by the figure's `labels` setting. */
  label?: string;
  role?: DotRole;
  /** The note this dot is claimed to be (`C`, `F#3`). Checked against the neck by `validateCourse`. */
  note?: string;
  /** The degree this dot is claimed to be against the figure's `root` (`b3`). Checked too. */
  degree?: string;
  /** Fretting finger 1–4. */
  finger?: 1 | 2 | 3 | 4;
}

/** Dots computed by the engine instead of typed by hand. */
export type FretboardDerive =
  | { scale: string; tonic: string }
  | { chord: string }
  | { note: string };

/** A fretboard diagram: dots at string and fret, over a range of frets. */
export interface FretboardFigure {
  kind: 'fretboard';
  /** Hand-placed dots. */
  dots?: FretDot[];
  /** Dots worked out by the engine inside `frets` (every scale note, chord tone or note of a name). */
  derive?: FretboardDerive;
  /** First and last fret shown, inclusive. Default `[0, 4]`, widened to hold every dot. */
  frets?: [number, number];
  /** Only these strings get derived dots (all strings are always drawn). */
  strings?: number[];
  /** Tuning id or name understood by the guitar engine. Default `standard`. */
  tuning?: string;
  /** A capo on this fret: dots and `frets` count from the capo (fret 0 sits on it). */
  capo?: number;
  /** Root note for degree labels and for checking `degree` claims. */
  root?: string;
  /** What unlabelled dots show. Default `note`. */
  labels?: 'note' | 'degree' | 'finger' | 'none';
  /**
   * Key that spells the note names of the dots (`A major`: C♯, not D♭). Default: the derived
   * chord or scale, else the key the dots imply.
   */
  key?: string;
  caption?: RichText;
}

/** A chord diagram: a shape, or a symbol looked up in the chord library. Give at least one. */
export interface ChordFigure {
  kind: 'chord';
  /** Chord symbol (`Am7`). With `frets` the shape is checked against it. */
  symbol?: string;
  /** The shape. Without it the first library voicing of `symbol` is used. */
  frets?: FretsInput;
  /** Fingers per string, low to high (`'x32010'`); worked out when omitted. */
  fingers?: string;
  tuning?: string;
  capo?: number;
  caption?: RichText;
}

/** One note of a staff figure. */
export interface StaffNote {
  /** Sounding pitch with octave (`E3`). Guitar notation draws it an octave higher. */
  note: string;
  duration?: DurationCode;
  /** Text under the note head. */
  label?: string;
}

/** Notes on a staff. Guitar music is written in treble clef and sounds an octave lower. */
export interface StaffFigure {
  kind: 'staff';
  /** `treble` (default) is the guitar's treble clef. */
  clef?: 'treble' | 'bass';
  /** Key for the key signature (`G major`). Default: none (C major). */
  key?: string;
  /** Sounding pitches with octaves, or note objects for a short phrase. May be empty to show just a key signature. */
  notes: Array<string | StaffNote>;
  /** Time signature to draw (`4/4`). Default: none. */
  time?: string;
  /** False for notes that are already written pitch (non-guitar examples). Default true. */
  guitar?: boolean;
  caption?: RichText;
}

/** One highlighted key of a keyboard figure. */
export interface KeyboardKey {
  /** Pitch with octave (`C4`). */
  note: string;
  label?: string;
  role?: DotRole;
}

/** A piano keyboard with highlighted keys: the clearest picture of half and whole steps. */
export interface KeyboardFigure {
  kind: 'keyboard';
  keys: Array<string | KeyboardKey>;
  /** First and last key shown (`C3`, `B4`). Default: the octave(s) around the keys. */
  from?: string;
  to?: string;
  caption?: RichText;
}

/** The circle of fifths with one key selected. */
export interface CircleFigure {
  kind: 'circle';
  /** The selected key (`G major`, `E minor`). */
  key: string;
  /** Other keys to mark (the neighbours, the relative ...). */
  highlight?: string[];
  /** Which ring to show. Default `both`. */
  show?: 'major' | 'minor' | 'both';
  caption?: RichText;
}

/** A rhythm of one or two bars in the compact notation: `'q q e e q'`, `'h q qr | e e e e h'`. */
export interface RhythmSpec {
  /** Notes separated by spaces, bars by `|`. See `rhythm.ts` for the codes. */
  pattern: string;
  /** Time signature. Default `4/4`. */
  time?: string;
}

/** A rhythm written out. */
export interface RhythmFigure extends RhythmSpec {
  kind: 'rhythm';
  /** Tempo in beats per minute, when the figure can be played. */
  tempo?: number;
  /** Show the counting ("1 & 2 &") under the notes. Default true. */
  counting?: boolean;
  caption?: RichText;
}

/** How the targets of a play exercise are labelled: by note name (`E2`) or by place (`string 6, open`). */
export type PlayLabels = 'note' | 'place';

/** One event of a tab phrase: a fretted note, or a rest. */
export type TabNote = { string: number; fret: number; duration: DurationCode } | { rest: true; duration: DurationCode };

/** A short phrase in tablature. */
export interface TabFigure {
  kind: 'tab';
  notes: TabNote[];
  tuning?: string;
  capo?: number;
  /** Key that spells the phrase's note names. Default: the key its notes imply. */
  key?: string;
  /** Time signature. Default `4/4`. */
  time?: string;
  tempo?: number;
  caption?: RichText;
}

/**
 * Something to listen to. Every form is resolved to plain timed events by `soundPlan`, so a screen
 * only schedules plucks, strums and clicks.
 */
export type Sound =
  /** Notes with octaves, one after another (or all at once with `together`). */
  | { kind: 'notes'; notes: string[]; together?: boolean; tempo?: number }
  /** Two notes an interval apart. */
  | { kind: 'interval'; from: string; interval: string; play?: 'up' | 'down' | 'together' }
  /** A chord: as a guitar voicing (default) or in close position from `octave` (best for comparing qualities). */
  | { kind: 'chord'; chord: string; frets?: FretsInput; voicing?: 'guitar' | 'close'; octave?: number; style?: 'strum' | 'arpeggio' | 'block' }
  /** A scale from a tonic with an octave (`A2`). */
  | { kind: 'scale'; tonic: string; scale: string; direction?: 'up' | 'down' | 'up-down'; tempo?: number }
  /** A strumming pattern on one chord: `'D-DU-UDU'` (D down, U up, X muted, - miss). */
  | { kind: 'strum'; chord: string; pattern: string; grid?: 'eighth' | 'sixteenth'; tempo?: number; repeat?: number }
  /** A chord progression, strummed once per `beats`. */
  | { kind: 'progression'; chords: string[]; tempo?: number; beats?: number; voicing?: 'guitar' | 'close' }
  /** A rhythm clicked out. */
  | { kind: 'rhythm'; pattern: string; time?: string; tempo?: number }
  /** A tab phrase. */
  | { kind: 'tab'; notes: TabNote[]; tempo?: number; tuning?: string; capo?: number };

/** A play button: notes, a chord, a strum pattern, a progression ... */
export interface AudioFigure {
  kind: 'audio';
  sound: Sound;
  /** What the button says ("Hear the chord"). */
  label?: RichText;
  caption?: RichText;
}

/** Anything a step can show. The UI renders it; `figureProblems` validates it; `resolveFigure` computes it. */
export type Figure =
  | FretboardFigure
  | ChordFigure
  | StaffFigure
  | KeyboardFigure
  | CircleFigure
  | RhythmFigure
  | TabFigure
  | AudioFigure;

/** The figure kinds. */
export type FigureKind = Figure['kind'];

// ── Steps: teaching cards ──────────────────────────────────────────────────────────────────────

/** A teaching card: one idea, shown before it is asked about. */
export interface CardStep {
  type: 'card';
  /** Unique inside the lesson. Optional: steps are also addressed by position. */
  id?: string;
  title?: string;
  body: RichText;
  figure?: Figure;
  /** A practical tip shown under the body (what it should feel or sound like, the common mistake). */
  tip?: RichText;
}

// ── Steps: exercises ───────────────────────────────────────────────────────────────────────────

/** Fields every exercise shares. */
export interface ExerciseBase {
  /** Unique inside the lesson. Optional. */
  id?: string;
  /** What the learner is asked. */
  prompt: RichText;
  /** Shown with the prompt. */
  figure?: Figure;
  /** One nudge the learner may ask for. */
  hint?: RichText;
  /** Why the right answer is right. Shown after every answer, correct or not. */
  explain: RichText;
  /** Id of the lesson fact this exercise tests (so a review can ask it instead of a flashcard). */
  fact?: string;
}

/** One option of a choice exercise: text, a figure, or both. */
export interface ChoiceOption {
  text?: RichText;
  figure?: Figure;
  correct?: boolean;
  /** Shown when this wrong option is picked: why it is tempting and why it is not the answer. */
  why?: RichText;
}

/** Pick one option, or every correct option. */
export interface ChoiceExercise extends ExerciseBase {
  type: 'choice';
  options: ChoiceOption[];
  /** True when several options are correct and all must be picked. Default false. */
  multiple?: boolean;
  /** False keeps the authored order (numbers, "higher / lower"). Default true. */
  shuffle?: boolean;
  /**
   * Set to `exact` when two options are the same pitch under different names on purpose (a
   * key-signature question). Without it `validateCourse` rejects enharmonic twins among options.
   */
  spelling?: SpellingPolicy;
}

/** A statement to judge. `prompt` defaults to "True or false?". */
export interface TrueFalseExercise extends Omit<ExerciseBase, 'prompt'> {
  type: 'true-false';
  prompt?: RichText;
  statement: RichText;
  answer: boolean;
}

/** Pair each left item with its right item. */
export interface MatchPairsExercise extends ExerciseBase {
  type: 'match-pairs';
  pairs: Array<{ left: RichText; right: RichText }>;
}

/** Arrange tiles in the right order. */
export interface OrderExercise extends ExerciseBase {
  type: 'order';
  /** The tiles in their CORRECT order. They are shuffled for the learner. */
  tiles: RichText[];
  /** Extra tiles that do not belong in the answer. */
  distractors?: RichText[];
}

/** Fill the blanks of a sentence or sequence from a word bank. */
export interface FillBlanksExercise extends ExerciseBase {
  type: 'fill-blanks';
  /** The text with `___` for every blank: `'C  D  ___  F  G  ___  B'`. */
  text: RichText;
  /** The right word for each blank, in order. */
  blanks: string[];
  /** Wrong words added to the bank. */
  bank?: string[];
  /** True when the blanks may be filled in any order (the notes of a chord). Default false. */
  unordered?: boolean;
  /** `exact` when the bank offers the same pitch under two names on purpose. */
  spelling?: SpellingPolicy;
}

/** What a typed (or keypad-picked) answer is compared with. */
export type AnswerSpec =
  /** A note name. `spelling` is the enharmonic policy and must be stated. */
  | { kind: 'note'; value: string; spelling: SpellingPolicy; accept?: string[] }
  /** An interval (`m3`). `any` also accepts the same size under another name (A4 for d5). */
  | { kind: 'interval'; value: string; spelling: SpellingPolicy; accept?: string[] }
  /** A chord symbol. `any` accepts an enharmonic root (Db for C#). */
  | { kind: 'chord'; value: string; spelling: SpellingPolicy; accept?: string[] }
  /** A scale degree (`b3`). `any` accepts #4 for b5 and the like. */
  | { kind: 'degree'; value: string; spelling: SpellingPolicy; accept?: string[] }
  /** A roman numeral (`IV`, `vi`). Case matters: it carries the chord quality. */
  | { kind: 'roman'; value: string; accept?: string[] }
  /** A whole number (a fret, a count of sharps, a number of beats). */
  | { kind: 'number'; value: number; accept?: number[] }
  /** A word or short phrase, compared without case, accents or punctuation. */
  | { kind: 'text'; value: string; accept?: string[] };

/** Type the answer, or pick it on a keypad. */
export interface TypeAnswerExercise extends ExerciseBase {
  type: 'type-answer';
  answer: AnswerSpec;
  /** Input the screen should offer. Default: `keypad` for notes and numbers, `keyboard` otherwise. */
  input?: 'keypad' | 'keyboard';
}

/** Hear something and choose what it was. */
export interface ListenChoiceExercise extends ExerciseBase {
  type: 'listen-choice';
  sound: Sound;
  options: ChoiceOption[];
  shuffle?: boolean;
}

/** Tap a rhythm that is shown, heard, or both. */
export interface TapRhythmExercise extends ExerciseBase {
  type: 'tap-rhythm';
  rhythm: RhythmSpec;
  /** Beats per minute (40–160). */
  tempo: number;
  /** What the learner gets: the notation, a played example, or both. */
  show: 'notation' | 'audio' | 'both';
  /** Timing strictness. Default: the course level. */
  level?: CourseLevel;
  /**
   * `count-in` (default): taps are timed against the click that counted the learner in.
   * `first-tap`: the learner starts when ready and the first tap is taken as beat one.
   */
  start?: 'count-in' | 'first-tap';
  /** Show the counting ("1 & 2 &") under the notation. Default true; false when counts would confuse (a pickup, a pad count of its own). */
  counting?: boolean;
}

/** What to find on the neck. */
export type FindTarget =
  /** A note: `C` (any octave) or `C4` (needed for `octave: 'exact'`). */
  | { note: string }
  /** Every tone of a chord. */
  | { chord: string }
  /** Every note of a scale. */
  | { scale: string; tonic: string }
  /** The note an interval above a shown position. */
  | { interval: string; from: NeckPosition };

/** Tap notes on the fretboard. */
export interface FretboardFindExercise extends ExerciseBase {
  type: 'fretboard-find';
  find: FindTarget;
  /** `one`: any single right position. `all`: every right position in the region. */
  mode: 'one' | 'all';
  /** Stated per exercise: must the octave match (`exact`) or does any octave count (`any`)? */
  octave: OctavePolicy;
  /** First and last fret of the region, inclusive. */
  frets: [number, number];
  /** Strings of the region. Default: all. */
  strings?: number[];
  /** Dots already on the neck (the root of an interval question ...). */
  shown?: FretDot[];
  tuning?: string;
  capo?: number;
  /** Key that spells the notes named in the feedback (`A major`: C♯, not D♭). Default: the chord, scale or note asked for. */
  key?: string;
}

/** A position is shown: name its note, its interval from a root, or its scale degree. */
export interface FretboardNameExercise extends ExerciseBase {
  type: 'fretboard-name';
  position: NeckPosition;
  ask: 'note' | 'interval' | 'degree';
  /** The root the interval or degree is measured from (required for those). It must not be higher than `position`. */
  root?: NeckPosition;
  /** Enharmonic policy. `exact` needs `key` (the key decides the spelling). */
  spelling: SpellingPolicy;
  /** Key that spells the note (`D major`), for `spelling: 'exact'`. */
  key?: string;
  /** Answers to offer as buttons. Without them the screen shows a keypad. */
  options?: string[];
  tuning?: string;
  capo?: number;
}

/** Build a chord: place the fingers, or pick the missing note. */
export interface ChordBuildExercise extends ExerciseBase {
  type: 'chord-build';
  chord: string;
  task: 'fingers' | 'missing-note';
  /** `fingers`: the reference shape. Default: the first library voicing of `chord`. */
  frets?: FretsInput;
  /** `fingers`: accept any correct voicing of the chord (default) or only the reference shape. */
  accept?: 'any-voicing' | 'this-shape';
  /** `missing-note`: the chord tones already shown. Exactly one tone of the chord must be missing. */
  given?: string[];
  /** `missing-note`: notes offered as buttons. */
  options?: string[];
  /** `missing-note`: enharmonic policy. Default `any`. */
  spelling?: SpellingPolicy;
  tuning?: string;
  capo?: number;
}

/** A note is shown on the staff: name it. Guitar treble clef (sounds an octave lower than written). */
export interface StaffReadExercise extends ExerciseBase {
  type: 'staff-read';
  /** Sounding pitch with octave (`G3`). */
  note: string;
  /** Key signature in force (`G major`). The answer is the note AS ALTERED by it. */
  key?: string;
  clef?: 'treble' | 'bass';
  /** Note names to offer as buttons. Without them the screen shows a note keypad. */
  options?: string[];
}

/** Put the asked note on the staff. */
export interface StaffPlaceExercise extends ExerciseBase {
  type: 'staff-place';
  /** The note to place: with an octave (`G3`, sounding) for `octave: 'exact'`, or a bare name for `any`. */
  note: string;
  octave: OctavePolicy;
  key?: string;
  clef?: 'treble' | 'bass';
}

/** Anything that is not a microphone exercise (what a play exercise may fall back to). */
export type ExerciseStep = Exercise | GeneratedStep;

/** Fields of the three microphone exercises. */
export interface PlayBase extends ExerciseBase {
  /**
   * The same skill without a microphone. Used when the microphone is unavailable or the learner
   * taps "I can't play right now". Required, and it must not itself be a play exercise.
   */
  alternative: ExerciseStep;
}

/** Play one note on the guitar. */
export interface PlayNoteExercise extends PlayBase {
  type: 'play-note';
  /** Sounding pitch with octave (`E2`). */
  note: string;
  octave: OctavePolicy;
  /** Where to play it (shown on the neck). Checked against `note`. */
  where?: NeckPosition;
  /** How far off still counts, in cents. Default 45. */
  toleranceCents?: number;
  /** Key that spells the notes it names (the one heard when it is not the one asked for). Default: as `note` is written. */
  key?: string;
  /** Label the target by note name (`E2`, default) or by place (`string 6, open`: friendlier before octaves are taught). */
  labels?: PlayLabels;
  /** Show no note names (a "find it by ear" or reading test). The feedback still names them. */
  hideNames?: boolean;
  /** Show the note on a staff only: no neck, no names (a reading test). Implies `hideNames`. */
  staffOnly?: boolean;
}

/** Strum a chord. */
export interface PlayChordExercise extends PlayBase {
  type: 'play-chord';
  chord: string;
  /** The shape to show, and the one graded. Default: the first library voicing. */
  frets?: FretsInput;
  /** Fingers per string, low to high (`'x32010'`); the box draws them. Default: worked out. */
  fingers?: string;
  /** Hide the chord box: the learner finds the shape on the neck (the box is shown after the answer). */
  hideDiagram?: boolean;
  tuning?: string;
  /** A capo on this fret: `frets` count from it and `chord` names what SOUNDS. */
  capo?: number;
}

/** Play a short phrase, note by note. */
export interface PlayPhraseExercise extends PlayBase {
  type: 'play-phrase';
  notes: TabNote[];
  octave: OctavePolicy;
  tempo?: number;
  /** Share of the notes that must be right. Default 0.8. */
  pass?: number;
  tuning?: string;
  capo?: number;
  /** Key that spells the note names. Default: the key the phrase's notes imply. */
  key?: string;
  /** Label the notes by name (default) or by place (`string 5, fret 3`). */
  labels?: PlayLabels;
  /** Show no note names under the tab (the feedback still names them). */
  hideNames?: boolean;
  /** Show the phrase on a staff only: no tab, no names (a reading test). Implies `hideNames`. */
  staffOnly?: boolean;
}

/** A flashcard: recall the back from the front and rate yourself. Used in reviews. */
export interface FlashcardExercise extends Omit<ExerciseBase, 'prompt' | 'explain'> {
  type: 'flashcard';
  front: RichText;
  back: RichText;
  /** Shown with the back. */
  backFigure?: Figure;
}

/** Every literal exercise. */
export type Exercise =
  | ChoiceExercise
  | TrueFalseExercise
  | MatchPairsExercise
  | OrderExercise
  | FillBlanksExercise
  | TypeAnswerExercise
  | ListenChoiceExercise
  | TapRhythmExercise
  | FretboardFindExercise
  | FretboardNameExercise
  | ChordBuildExercise
  | StaffReadExercise
  | StaffPlaceExercise
  | PlayNoteExercise
  | PlayChordExercise
  | PlayPhraseExercise
  | FlashcardExercise;

/** The exercise type names. */
export type ExerciseType = Exercise['type'];

/** The three exercise types that listen to the guitar. */
export type PlayExercise = PlayNoteExercise | PlayChordExercise | PlayPhraseExercise;

/** Names of the generators. */
export type GeneratorKind = keyof GeneratorParamsMap;

/**
 * An exercise produced by a generator: `{ generate: 'interval-name', params: { intervals: ['m3', 'M3'] } }`.
 * With a `seed` the same exercise comes out every time; without one each session draws a new one.
 */
export type GeneratedStep = {
  [K in GeneratorKind]: { generate: K; params?: GeneratorParamsMap[K]; seed?: number; id?: string; fact?: string };
}[GeneratorKind];

/** One step of a lesson. */
export type Step = CardStep | Exercise | GeneratedStep;

// ── Lessons, units, courses ────────────────────────────────────────────────────────────────────

/** Something worth remembering for good: becomes a spaced-repetition card when the lesson is finished. */
export interface Fact {
  /** Unique inside the course. */
  id: string;
  /** The question side. */
  front: RichText;
  /** The answer side. */
  back: RichText;
  figure?: Figure;
  /** Ask it as a real exercise in reviews instead of a self-rated flashcard. */
  ask?: ExerciseStep;
}

/** A lesson: two to five minutes on one idea. */
export interface Lesson {
  /** Slug, unique inside the course. */
  id: string;
  title: string;
  /** The one thing it teaches, as a sentence the learner could repeat. */
  teaches: string;
  /** Estimated time, 2 to 5. */
  minutes: number;
  /** The skill it advances: `theory:<unit>:<lesson>` or `teacher:<mia|dev|elena>:<lesson>`. */
  skill: string;
  /**
   * Lesson ids that must be finished first. Omit for "the lesson before this one" (a path);
   * `[]` opens the lesson from the start.
   */
  requires?: string[];
  steps: Step[];
  facts?: Fact[];
}

/** A checkpoint quiz: pass it to test out of the whole unit. */
export interface Checkpoint {
  /** Authored questions (no cards). */
  steps?: ExerciseStep[];
  /** Or: draw this many exercises from the unit's lessons. Used when `steps` is absent. Default 10. */
  sample?: number;
  /** Mistakes allowed. Default 3. */
  maxMistakes?: number;
}

/** What a unit is about; the map picks its icon and colour from it. */
export type UnitTheme =
  | 'basics'
  | 'notes'
  | 'fretboard'
  | 'rhythm'
  | 'intervals'
  | 'scales'
  | 'chords'
  | 'keys'
  | 'harmony'
  | 'reading'
  | 'ear'
  | 'technique'
  | 'songs'
  | 'improvisation'
  | 'composition';

/** A unit: a handful of lessons around one theme. */
export interface Unit {
  /** Slug, unique inside the course. */
  id: string;
  title: string;
  theme: UnitTheme;
  /** One or two short sentences. */
  description: string;
  lessons: Lesson[];
  checkpoint?: Checkpoint;
}

/** A glossary entry: a term and its one-line explanation. */
export interface GlossaryTerm {
  /** Slug used in `{t:id}`. */
  id: string;
  term: string;
  definition: string;
}

/** A course: the Theory Path, or one teacher's course. */
export interface Course {
  /** Slug. */
  id: string;
  title: string;
  teacher: CourseTeacher;
  level: CourseLevel;
  description?: string;
  units: Unit[];
  /** Terms this course adds to the built-in glossary. */
  glossary?: GlossaryTerm[];
}

// ── Answers ────────────────────────────────────────────────────────────────────────────────────

/** An accidental the learner can put before a note on the staff. */
export type StaffAccidental = 'sharp' | 'flat' | 'natural';

/** What the learner did, one shape per exercise type. Indexes refer to the AUTHORED arrays, not the shuffled display. */
export type Answer =
  | { type: 'choice'; selected: number[] }
  | { type: 'true-false'; value: boolean }
  /** Every pairing the learner committed, as [left index, right index]. */
  | { type: 'match-pairs'; pairs: Array<[number, number]> }
  /** Tile indexes in the learner's order; indexes past the tiles refer to distractors. */
  | { type: 'order'; order: number[] }
  /** The word put in each blank (null = left empty). */
  | { type: 'fill-blanks'; blanks: Array<string | null> }
  | { type: 'type-answer'; text: string }
  | { type: 'listen-choice'; selected: number[] }
  /** Tap times in seconds, measured from beat one of the rhythm (after the count-in). */
  | { type: 'tap-rhythm'; taps: number[] }
  | { type: 'fretboard-find'; positions: NeckPosition[] }
  | { type: 'fretboard-name'; text: string }
  /** `frets` (low to high, null = not played) for the fingers task, `text` for the missing note. */
  | { type: 'chord-build'; frets?: Array<number | null>; text?: string }
  | { type: 'staff-read'; text: string }
  /** Staff position (0 = bottom line, 1 = first space ...) and an optional accidental. */
  | { type: 'staff-place'; position: number; accidental?: StaffAccidental | null }
  /** The note that was heard (MIDI), or null when none was; from `waitForNote`. */
  | { type: 'play-note'; midi: number | null; cents?: number }
  /** What `waitForChord` reported. */
  | { type: 'play-chord'; matched: boolean; score: number; missing?: number[]; extra?: number[] }
  /** The notes that were heard (MIDI), in order; from `NoteRecorder`. */
  | { type: 'play-phrase'; played: number[] }
  | { type: 'flashcard'; rating: ReviewGrade };

// ── Grading results ────────────────────────────────────────────────────────────────────────────

/** Why a wrong answer was close; lets the screen be kind and specific. */
export type NearMiss = 'enharmonic' | 'octave' | 'timing' | 'incomplete' | 'extra' | 'case';

/** How one typed answer compared. */
export type TextVerdict = 'correct' | 'enharmonic' | 'wrong' | 'invalid';

/** One expected note of a tapped rhythm and what happened to it. */
export interface TapVerdict {
  /** When the note falls, in seconds from beat one. */
  time: number;
  /** The tap matched to it (seconds), or null. */
  tap: number | null;
  /** Timing error in ms after latency correction (negative = early), or null when missed. */
  errorMs: number | null;
  verdict: 'hit' | 'early' | 'late' | 'missed';
}

/** A neck position with what it sounds. */
export interface NamedPosition extends NeckPosition {
  midi: number;
  note: string;
}

/** Type-specific facts for the feedback panel. */
export type FeedbackDetail =
  | { type: 'choice' | 'listen-choice'; correct: number[]; selected: number[]; why: Array<{ option: number; text: RichText }> }
  | { type: 'true-false'; answer: boolean }
  | { type: 'match-pairs'; solution: Array<[number, number]>; right: Array<[number, number]>; wrong: Array<[number, number]>; unmatched: number[] }
  | { type: 'order'; solution: number[]; wrongAt: number[] }
  | { type: 'fill-blanks'; solution: string[]; ok: boolean[] }
  | { type: 'type-answer' | 'fretboard-name' | 'staff-read'; expected: string; given: string | null; verdict: TextVerdict }
  | { type: 'tap-rhythm'; onsets: TapVerdict[]; extra: number[]; toleranceMs: number; offsetMs: number; needed: number; hits: number }
  | { type: 'fretboard-find'; targets: NamedPosition[]; hits: NeckPosition[]; wrong: NamedPosition[]; missed: NeckPosition[] }
  | { type: 'chord-build'; task: 'fingers'; frets: Array<number | null>; built: string | null; problem: string | null; wrongStrings: number[] }
  | { type: 'chord-build'; task: 'missing-note'; expected: string; given: string | null; verdict: TextVerdict }
  | { type: 'staff-place'; position: number; accidental: StaffAccidental | null; placed: string | null }
  | { type: 'play-note'; expected: number; played: number | null; cents: number | null }
  | { type: 'play-chord'; chord: string; missing: string[]; extra: string[]; score: number }
  | { type: 'play-phrase'; expected: number[]; played: number[]; correct: number; missed: number[]; extra: number[] }
  | { type: 'flashcard'; rating: ReviewGrade };

/** What to show after an answer: the right answer and why. */
export interface Feedback {
  /** The right answer as rich-text markup, ready to render (`{n:F#}`, `major third`). */
  answer: string;
  /** Why it is right (the exercise's `explain`). Null only for flashcards. */
  explain: RichText | null;
  /** A line about THIS answer ("Right pitch, but the key spells it {n:C#}."), as rich-text markup. */
  note?: string;
  detail: FeedbackDetail;
}

/** The outcome of grading one answer. */
export interface GradeResult {
  correct: boolean;
  /** Partial credit, 0 to 1 (1 when correct). */
  score: number;
  /** Set on a wrong answer that was close. */
  near?: NearMiss;
  /** True when the answer had the wrong shape for the exercise (a programming error, or a skipped step). */
  invalid?: boolean;
  feedback: Feedback;
}

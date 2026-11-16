/**
 * Parameter types of every exercise generator. A generated step is written
 * `{ generate: '<kind>', params: { ... } }`; this map is what makes the params type-checked.
 *
 * Every parameter is optional and has a sensible default for a beginner. Lists are pools the
 * generator draws from, EASIEST FIRST: at low difficulty only the start of a list is used, and the
 * rest joins as the learner succeeds (see `adaptive.ts`).
 */

/** `interval-name`: two notes are named, choose the interval between them. */
export interface IntervalNameParams {
  /** Interval pool, easiest first (`['P5', 'M3', 'm3']`). */
  intervals?: string[];
  /** Lower-note pool (`['C', 'G', 'D']`). */
  roots?: string[];
  /**
   * Also offer the other name of the same size as a wrong option (A2 beside m3, d5 beside A4), so
   * the letters decide. Default false: every option is a different size.
   */
  twins?: boolean;
}

/** `interval-note`: choose the note an interval above (or below) a given note. Spelling counts. */
export interface IntervalNoteParams {
  intervals?: string[];
  roots?: string[];
  /** Measure upwards (default) or downwards. */
  direction?: 'up' | 'down';
}

/** `semitones-match`: match interval names with their size in half steps. */
export interface SemitonesMatchParams {
  /** Interval pool, easiest first. Compound intervals (M9, P11, M13 ... up to P15) are allowed. */
  intervals?: string[];
  /** Pairs per exercise, 3 to 5. Default 4. */
  pairs?: number;
}

/** `interval-on-neck`: a root is shown on the fretboard; find or name another note against it. */
export interface IntervalOnNeckParams {
  /** Interval pool, easiest first. Compound intervals (M9, M10, P11, M13 ... up to P15) are allowed where the neck fits them. */
  intervals?: string[];
  /**
   * `find`: tap the note that interval above the root. `name`: a second dot is shown, name the
   * interval. `degree`: name its scale degree (1, b3, 5 ...).
   */
  ask?: 'find' | 'name' | 'degree';
  /** Strings the root may be on. Default `[6, 5]`. */
  strings?: number[];
  /**
   * Frets the root may be on, inclusive. Default `[0, 7]`. The picture (and the region of a `find`)
   * widens past it so the usual shape of every answer near the root is on it.
   */
  frets?: [number, number];
}

/** How the notes between the natural notes are named. */
export type SpellingChoice = 'sharps' | 'flats';

/** `note-on-string`: notes along one string. */
export interface NoteOnStringParams {
  /** Strings to draw from. Default `[6]`. */
  strings?: number[];
  /** Fret range, inclusive. Default `[0, 5]`. */
  frets?: [number, number];
  /** Only ask about natural notes (no sharps or flats). Default false. */
  naturals?: boolean;
  /**
   * `name`: a position is shown, choose its note. `find`: tap the named note on the string.
   * `fret`: type the fret number of the named note.
   */
  ask?: 'name' | 'find' | 'fret';
  /** Name the in-between notes with sharps (default), flats, or `both` (each question picks one). */
  spelling?: SpellingChoice | 'both';
}

/** `open-strings`: the names of the open strings. */
export interface OpenStringsParams {
  /** `order`: arrange them low to high. `name`: which note is string N? `number`: which string is the open N? */
  ask?: 'order' | 'name' | 'number';
  /** Tuning id. Default `standard`. */
  tuning?: string;
}

/** `step-up`: the note one or more frets (half steps) above a note. */
export interface StepUpParams {
  /** Distances in half steps to draw from. Default `[1, 2]`. */
  steps?: number[];
  /** Starting-note pool. Default: the natural notes. */
  roots?: string[];
  /** Name the in-between notes with sharps (default) or flats. */
  spelling?: SpellingChoice;
}

/** `enharmonic`: which note sounds the same as this one? */
export interface EnharmonicParams {
  /** Notes to ask about. Default: C# D# F# G# A#. */
  notes?: string[];
}

/** `scale-notes`: the notes of a scale. */
export interface ScaleNotesParams {
  /** Scale ids, easiest first, 5 to 8 notes (whole-tone and diminished included). Default `['major']`. */
  scales?: string[];
  /** Tonic pool, easiest first. Default: C G D F A E Bb. */
  tonics?: string[];
  /** `order`: arrange the notes. `fill`: complete the scale. `odd-one-out`: spot the note that is not in it. */
  form?: 'order' | 'fill' | 'odd-one-out';
}

/** `scale-formula`: the pattern of whole and half steps of a scale. */
export interface ScaleFormulaParams {
  /** Scale ids, easiest first. Default `['major', 'minor']`. */
  scales?: string[];
}

/** `key-signature`: sharps and flats of a key. Spelling counts. */
export interface KeySignatureParams {
  /** `count`: how many sharps or flats? `key`: which key has this signature? `accidentals`: which notes are altered? */
  ask?: 'count' | 'key' | 'accidentals';
  /** Modes to draw keys from. Default `['major']`. */
  modes?: Array<'major' | 'minor'>;
  /** Largest signature used, 1 to 7. Default 4. */
  maxAccidentals?: number;
}

/** `relative-key`: the relative minor of a major key, or the other way round. */
export interface RelativeKeyParams {
  /** Which relative is asked for. Default `minor`. */
  direction?: 'minor' | 'major' | 'both';
  maxAccidentals?: number;
}

/** `degree-in-key`: scale degrees of a key. */
export interface DegreeInKeyParams {
  /** `note`: which note is degree N? `degree`: which degree is this note? */
  ask?: 'note' | 'degree';
  modes?: Array<'major' | 'minor'>;
  maxAccidentals?: number;
  /** Degrees to ask about, 1 to 7. Default 2 to 7. */
  degrees?: number[];
  /** An explicit key pool, easiest first (`['C major', 'G major', 'A major']`). Replaces `modes` and `maxAccidentals`. */
  keys?: string[];
}

/** `fifths-order`: the circle of fifths and the order of sharps and flats. */
export interface FifthsOrderParams {
  /** `keys`: major keys clockwise. `sharps` / `flats`: the order they are written in a signature. */
  ask?: 'keys' | 'sharps' | 'flats';
  /** Tiles per exercise, 3 to 7. Default 4. */
  count?: number;
}

/** `chord-tones`: the notes inside a chord. */
export interface ChordTonesParams {
  /** Chord type ids, easiest first. Default `['major', 'minor']`. */
  types?: string[];
  /** Root pool, easiest first. */
  roots?: string[];
  /**
   * `notes`: which notes make up the chord? `tone`: what is its third / fifth / seventh?
   * `missing`: pick the missing note. `name`: the notes are given, name the chord.
   */
  ask?: 'notes' | 'tone' | 'missing' | 'name';
}

/** `diatonic-chord`: the chords that belong to a key. */
export interface DiatonicChordParams {
  /** `chord`: which chord sits on degree N? `quality`: is it major, minor or diminished? */
  ask?: 'chord' | 'quality';
  modes?: Array<'major' | 'minor'>;
  maxAccidentals?: number;
  /** Seventh chords instead of triads. Default false. */
  sevenths?: boolean;
  /** An explicit key pool, easiest first (`['C major', 'G major', 'A major', 'E major']`). Replaces `modes` and `maxAccidentals`. */
  keys?: string[];
}

/** `roman-chord`: roman numerals and the chords they stand for. */
export interface RomanChordParams {
  /** `to-chord`: numeral given, choose the chord. `to-roman`: chord given, choose the numeral. */
  direction?: 'to-chord' | 'to-roman';
  /**
   * Numeral pool, easiest first. Default: I IV V vi ii iii vii°. Plain numerals (with ♭ or ♯ for
   * borrowed chords) and secondary chords (V/V, V7/ii, vii°/V) are explained; others are refused.
   */
  numerals?: string[];
  modes?: Array<'major' | 'minor'>;
  maxAccidentals?: number;
  /** An explicit key pool, easiest first. Replaces `modes` and `maxAccidentals`. */
  keys?: string[];
}

/** `chord-shape`: build an open chord on the fretboard. */
export interface ChordShapeParams {
  /** Chord pool, easiest first. Default: Em Am E A D G C Dm. */
  chords?: string[];
  /** Accept any correct voicing (default) or only the library shape. */
  accept?: 'any-voicing' | 'this-shape';
}

/** `neck-tones`: tap every note of a chord or scale inside a small region of the neck. */
export interface NeckTonesParams {
  /** What to find. Default `chord`. */
  what?: 'chord' | 'scale';
  /** Chord pool for `chord`. Default: C G D A E Am Em Dm. */
  chords?: string[];
  /** Scale ids for `scale`. Default `['minor-pentatonic', 'major']`. */
  scales?: string[];
  /** Tonic pool for `scale`. */
  tonics?: string[];
  /** Width of the region in frets, 3 to 5. Default 4. */
  span?: number;
  /** Strings of the region. Default `[6, 5, 4]`. */
  strings?: number[];
}

/** `note-value-math`: how long notes last and how they add up. */
export interface NoteValueMathParams {
  /** `fit`: how many X fit in a Y? `beats`: how many beats does X last? `sum`: X plus Y equals? */
  ask?: 'fit' | 'beats' | 'sum';
  /** Note values to draw from, easiest first. Default: quarter, half, whole, eighth, sixteenth. */
  values?: Array<'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth'>;
  /** Include dotted notes. Default false. */
  dotted?: boolean;
}

/** `meter`: time signatures. */
export interface MeterParams {
  /** `beats`: how many beats in a bar? `unit`: which note gets the beat? `fill`: how many X fill a bar? */
  ask?: 'beats' | 'unit' | 'fill';
  /** Time-signature pool, easiest first. Default: 4/4 3/4 2/4 6/8. */
  signatures?: string[];
}

/** `rhythm-tap`: tap a generated rhythm. */
export interface RhythmTapParams {
  /** Note values allowed, easiest first. Default `['quarter', 'half', 'eighth']`. */
  values?: Array<'half' | 'quarter' | 'eighth' | 'sixteenth'>;
  /** Bars, 1 or 2. Default 1. */
  bars?: number;
  /** Allow quarter rests. Default false. */
  rests?: boolean;
  /** Beats per minute. Default 80. */
  tempo?: number;
  /** What the learner gets. Default `both`. */
  show?: 'notation' | 'audio' | 'both';
}

/** `rhythm-ear`: hear a one-bar rhythm and choose its notation. */
export interface RhythmEarParams {
  values?: Array<'half' | 'quarter' | 'eighth' | 'sixteenth'>;
  tempo?: number;
}

/** `higher-lower`: two notes are played; is the second higher or lower? */
export interface HigherLowerParams {
  /** Largest gap in half steps (easiest). Default 12. */
  maxSemitones?: number;
  /** Smallest gap in half steps (hardest). Default 1. */
  minSemitones?: number;
  /** How the explanation names black keys: the everyday name of each (`auto`, default: C♯ E♭ F♯ A♭ B♭), sharps, or flats. */
  spelling?: 'auto' | SpellingChoice;
}

/** `interval-ear`: hear an interval and name it. */
export interface IntervalEarParams {
  /** Interval pool, easiest first. Default: P8 P5 M3 m3 P4 M2 m2 M6 m6 m7 M7 A4. */
  intervals?: string[];
  /** How the two notes are played. Default `up`. */
  play?: 'up' | 'down' | 'together';
}

/** `chord-quality-ear`: hear a chord and name its quality. */
export interface ChordQualityEarParams {
  /** Chord type ids, easiest first. Default `['major', 'minor']`. */
  types?: string[];
}

/** `scale-ear`: hear a scale and name it. */
export interface ScaleEarParams {
  /** Scale ids, easiest first. Default `['major', 'minor']`. */
  scales?: string[];
}

/** `cadence-ear`: hear a four-chord phrase and name how it ends. */
export interface CadenceEarParams {
  /** Cadence pool, easiest first. Default `['authentic', 'half']`. */
  types?: Array<'authentic' | 'half' | 'plagal' | 'deceptive'>;
  /** Keys the phrases are in. Default `['major']`; minor phrases use the major V (i iv V i). */
  modes?: Array<'major' | 'minor'>;
}

/** `staff-note`: notes on the guitar's treble staff. */
export interface StaffNoteParams {
  /** `read`: name the shown note. `place`: put the named note on the staff. */
  ask?: 'read' | 'place';
  /** Lowest sounding note. Default `E3` (the bottom line as the guitar reads it). */
  low?: string;
  /** Highest sounding note. Default `F4` (the top line). */
  high?: string;
  /** Include sharps and flats. Default false. */
  accidentals?: boolean;
}

/** `play-note`: play a note of a string into the microphone (with a tap-the-fretboard fallback). */
export interface PlayNoteParams {
  /** Strings to draw from. Default `[6, 5, 4, 3, 2, 1]`. */
  strings?: number[];
  /** Fret range, inclusive. Default `[0, 3]`. */
  frets?: [number, number];
  /** Only natural notes. Default true. */
  naturals?: boolean;
}

/** `tab-read`: a bar of tab is shown; name its notes, one of them, or find one on the neck. */
export interface TabReadParams {
  /** `notes`: which notes does the bar play? `note`: which is the Nth note? `find`: tap where the Nth note is played. Default `notes`. */
  ask?: 'notes' | 'note' | 'find';
  /** Strings the bar uses. Default `[1, 2]`. */
  strings?: number[];
  /** Fret range, inclusive. Default `[0, 3]`. */
  frets?: [number, number];
  /** Notes in the bar, 3 to 8. Default 4. */
  length?: number;
  /** Only natural notes. Default true. */
  naturals?: boolean;
}

/** `tab-play`: play a generated bar of tab into the microphone (falls back to naming its notes). */
export interface TabPlayParams {
  strings?: number[];
  frets?: [number, number];
  length?: number;
  naturals?: boolean;
  /** Beats per minute, 40 to 120. Default 70. */
  tempo?: number;
}

/** The five CAGED shapes. */
export type CagedLetter = 'C' | 'A' | 'G' | 'E' | 'D';

/** `caged-shape`: a chord shape is drawn up the neck; name its CAGED shape or the chord it plays. */
export interface CagedShapeParams {
  /** `shape`: which CAGED shape is it? `chord`: which chord does it play? Default `shape`. */
  ask?: 'shape' | 'chord';
  /** Shapes in play, easiest first. Default `['E', 'A', 'D', 'C', 'G']`. */
  shapes?: CagedLetter[];
  /** Chord roots, easiest first. Default: C D G A E F Bb. */
  roots?: string[];
  /** Major chords, minor chords, or both. Default `['major']`. */
  qualities?: Array<'major' | 'minor'>;
}

/** `capo-math`: what sounds with a capo, which shape to play, or where the capo goes. */
export interface CapoMathParams {
  /** `sounds`: capo and shape given, which chord sounds? `shape`: which shape gives this chord? `capo`: which fret? Default `sounds`. */
  ask?: 'sounds' | 'shape' | 'capo';
  /** Open shapes, easiest first. Default: G C D A E Em Am Dm. */
  shapes?: string[];
  /** Capo frets, easiest first, 1 to 9. Default `[2, 3, 1, 4, 5, 7]`. */
  capos?: number[];
}

/** `nashville`: the Nashville number system (1 4 5 6m) in a major key. */
export interface NashvilleParams {
  /** `to-chord`: which chord is 4? `to-number`: which number is this chord? `chart`: play a four-chord chart. Default `to-chord`. */
  ask?: 'to-chord' | 'to-number' | 'chart';
  /** Major keys, easiest first. Default: C G D A E F Bb. */
  keys?: string[];
  /** Numbers in play, easiest first. Default `['1', '4', '5', '6m', '2m', '3m', '7°']`; also b7, 2, 57, 1maj7 ... */
  numbers?: string[];
}

/** `rhythm-read`: triplets and compound meters (6/8, 9/8, 12/8): tap, count or hear them. */
export interface RhythmReadParams {
  /** `tap`: tap the bar. `count`: on which counts do the notes start? `ear`: hear it and choose it. Default `tap`. */
  ask?: 'tap' | 'count' | 'ear';
  /** Feels in play, easiest first: `triplets` (in 4/4), `6/8`, `9/8`, `12/8`. Default `['6/8', 'triplets']`. */
  feels?: Array<'triplets' | '6/8' | '9/8' | '12/8'>;
  /** Allow rests. Default false. */
  rests?: boolean;
  /** The felt beat per minute (the dotted quarter in compound time), 40 to 100. Default 60. */
  tempo?: number;
}

/** `staff-key`: key signatures on the staff. */
export interface StaffKeyParams {
  /** `name`: which key has this signature? `pick`: which staff shows this key? `read`: name a note the signature alters. Default `name`. */
  ask?: 'name' | 'pick' | 'read';
  modes?: Array<'major' | 'minor'>;
  /** Largest signature used, 1 to 7. Default 4. */
  maxAccidentals?: number;
  /** An explicit key pool, easiest first. Replaces `modes` and `maxAccidentals`. */
  keys?: string[];
}

/** `natural-harmonic`: which note a natural harmonic sounds, or where it is. */
export interface NaturalHarmonicParams {
  /** `note`: which note rings at fret N? `fret`: where does this harmonic ring? Default `note`. */
  ask?: 'note' | 'fret';
  /** Harmonic frets, easiest first: 12, 7, 5, 19, 4, 9, 16. Default `[12, 7, 5]`. */
  frets?: number[];
  /** Strings to draw from. Default all six. */
  strings?: number[];
}

/** `sight-reading`: a short passage on the staff that stays in a key and in one hand position. */
export interface SightReadingParams {
  /** `notes`: which notes are these? `tab`: which tab plays it in this position? Default `notes`. */
  ask?: 'notes' | 'tab';
  /** Hand positions (fret of the index finger), easiest first; 1 is first position with the open strings. Default `[1]`. */
  positions?: number[];
  /** Keys, easiest first. Default: C major, A minor, G major, E minor, F major, D major. */
  keys?: string[];
  /** Bars of 4/4, 1 or 2. Default 2 (1 for a tab question, which takes one bar so each tab answer fits its button). */
  bars?: number;
  /** Note values allowed, easiest first. Default `['quarter']`. */
  values?: Array<'half' | 'quarter' | 'eighth'>;
}

/** `sight-play`: play a passage from the staff alone (no tab, no names) into the microphone. */
export interface SightPlayParams {
  positions?: number[];
  keys?: string[];
  /** Bars of 4/4, 1 or 2. Default 1. */
  bars?: number;
  values?: Array<'half' | 'quarter' | 'eighth'>;
  /** Beats per minute, 40 to 120. Default 60. */
  tempo?: number;
}

/** Every generator and its params. The keys are the generator names. */
export interface GeneratorParamsMap {
  'interval-name': IntervalNameParams;
  'interval-note': IntervalNoteParams;
  'semitones-match': SemitonesMatchParams;
  'interval-on-neck': IntervalOnNeckParams;
  'note-on-string': NoteOnStringParams;
  'open-strings': OpenStringsParams;
  'step-up': StepUpParams;
  enharmonic: EnharmonicParams;
  'scale-notes': ScaleNotesParams;
  'scale-formula': ScaleFormulaParams;
  'key-signature': KeySignatureParams;
  'relative-key': RelativeKeyParams;
  'degree-in-key': DegreeInKeyParams;
  'fifths-order': FifthsOrderParams;
  'chord-tones': ChordTonesParams;
  'diatonic-chord': DiatonicChordParams;
  'roman-chord': RomanChordParams;
  'chord-shape': ChordShapeParams;
  'neck-tones': NeckTonesParams;
  'note-value-math': NoteValueMathParams;
  meter: MeterParams;
  'rhythm-tap': RhythmTapParams;
  'rhythm-ear': RhythmEarParams;
  'higher-lower': HigherLowerParams;
  'interval-ear': IntervalEarParams;
  'chord-quality-ear': ChordQualityEarParams;
  'scale-ear': ScaleEarParams;
  'cadence-ear': CadenceEarParams;
  'staff-note': StaffNoteParams;
  'play-note': PlayNoteParams;
  'tab-read': TabReadParams;
  'tab-play': TabPlayParams;
  'caged-shape': CagedShapeParams;
  'capo-math': CapoMathParams;
  nashville: NashvilleParams;
  'rhythm-read': RhythmReadParams;
  'staff-key': StaffKeyParams;
  'natural-harmonic': NaturalHarmonicParams;
  'sight-reading': SightReadingParams;
  'sight-play': SightPlayParams;
}

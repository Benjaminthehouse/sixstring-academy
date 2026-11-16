/**
 * Sheet recognition (OMR): the output model and the contract between the stages.
 *
 *   image ──preprocess──▶ normalised page ──detectLayout──▶ staves / systems / bar lines
 *         ──extractStaff──▶ one cleaned strip per staff ──recognize*Staff──▶ events
 *         ──assemblePage──▶ OmrPage (this file) ──▶ Song model / proofreading screen
 *
 * Conventions
 * - Every box, point and x position in the OUTPUT MODEL is in pixels of the ORIGINAL page image
 *   (continuous coordinates: pixel (i, j) covers [i, i+1) x [j, j+1)), so it can be drawn straight
 *   over the picture the user took.
 * - Confidence is 0..1. Below 0.5 means "a guess": show it as uncertain, never as fact.
 *   `alternatives` lists other readings, best first, for one-tap correction.
 * - Pitch is sounding MIDI (guitar sounds an octave below the treble clef); the written pitch is
 *   kept beside it. Strings are numbered 1 = high E = top tab line. Ticks are 960 per quarter.
 * - Ids are unique within a page and stable for a given recognition run ("s0.st1.m3.e2.n0").
 */
import type { BinaryImage, GrayImage, Point } from './image/gray';

export type { Point } from './image/gray';

/** Axis-aligned box: top-left corner and size, in page px. */
export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Another possible reading of an element. */
export interface Alternative<T> {
  value: T;
  confidence: number;
}

/** Who produced a reading. */
export type OmrSource = 'image' | 'ai' | 'merged' | 'inferred' | 'user';

/**
 * Why an element deserves a look from the user. Set by the page pipeline (linking notation and
 * tab, rhythm checks) and by the AI fusion; the proofreading list is built from these.
 */
export type OmrIssueCode =
  /** The notation staff and the tab staff of one system read different pitches here. */
  | 'staves-disagree'
  /** The notation rhythm and the stems under the tab disagree. */
  | 'rhythm-disagree'
  /** Found on one staff of a notation + tab pair only. */
  | 'unlinked'
  /** Durations worked out from the horizontal spacing (nothing printed to read them from). */
  | 'rhythm-estimated'
  /** A disagreement was settled by a rule (agreement with an alternative); worth a glance. */
  | 'resolved'
  /** The AI reading differs from the picture reading. */
  | 'ai-disagree'
  /** Only the AI saw this. */
  | 'ai-only'
  /** A fret number was read past the last fret and replaced by a reading of its digits on the neck. */
  | 'past-the-neck'
  /** The measure does not fit its time signature; its rhythm needs a look. */
  | 'measure-does-not-fit';

/** One reason to check an element. */
export interface OmrIssue {
  code: OmrIssueCode;
  /** One plain sentence for the proofreading screen. */
  message: string;
}

/** Fields every recognised element carries. */
export interface OmrElement {
  id: string;
  /** Where it is on the original page. */
  bbox: BBox;
  /** 0..1. */
  confidence: number;
  source?: OmrSource;
  /** Reasons to check this element (absent when nothing is known to be wrong). */
  issues?: OmrIssue[];
}

// ------------------------------------------------------------------------------------------
// Vocabulary
// ------------------------------------------------------------------------------------------

/** 'notation' = five-line staff; 'tab' = tablature (six lines for guitar, four for bass). */
export type StaffKind = 'notation' | 'tab';

/** Undotted note / rest values. */
export type DurationValue = 'whole' | 'half' | 'quarter' | 'eighth' | '16th' | '32nd';

/** Ticks of each undotted value (960 per quarter). */
export const DURATION_TICKS: Record<DurationValue, number> = {
  whole: 3840, half: 1920, quarter: 960, eighth: 480, '16th': 240, '32nd': 120,
};

/** What a bar line (or group of strokes and dots) means. */
export type BarlineType = 'single' | 'double' | 'end' | 'repeat-begin' | 'repeat-end' | 'repeat-both';

/** Clefs the reader distinguishes; guitar notation is 'treble-8vb' whether or not the 8 is printed. */
export type ClefType = 'treble' | 'treble-8vb' | 'bass' | 'percussion' | 'tab';

/** Printed accidental signs. */
export type AccidentalType = 'sharp' | 'flat' | 'natural' | 'double-sharp' | 'double-flat';

/** Note-head shapes. */
export type NoteHeadType = 'filled' | 'open' | 'whole' | 'x' | 'diamond';

/** Letter name of a pitch. */
export type StepName = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

// ------------------------------------------------------------------------------------------
// Output model
// ------------------------------------------------------------------------------------------

/** A rhythmic value. */
export interface OmrDuration {
  value: DurationValue;
  dots: 0 | 1 | 2;
  /** e.g. { actual: 3, normal: 2 } for a triplet. */
  tuplet?: { actual: number; normal: number };
  /** Length in ticks with dots and tuplet applied. */
  ticks: number;
  confidence: number;
  alternatives?: Alternative<{ value: DurationValue; dots: 0 | 1 | 2 }>[];
  /** 'image' = read; 'merged' = copied from the linked staff; 'inferred' = estimated (spacing, measure length). */
  source?: OmrSource;
}

/** Length in ticks of a value with dots and an optional tuplet ratio. */
export function durationTicks(value: DurationValue, dots = 0, tuplet?: { actual: number; normal: number }): number {
  let t = DURATION_TICKS[value];
  if (dots === 1) t *= 1.5; else if (dots === 2) t *= 1.75;
  if (tuplet) t = (t * tuplet.normal) / tuplet.actual;
  return Math.round(t);
}

/** A pitch read from a notation staff. */
export interface OmrPitch {
  step: StepName;
  /** -2..2, with key signature and accidentals of the measure applied. */
  alter: number;
  /** Octave as written (C4 = middle C on the first ledger line below the treble staff). */
  octave: number;
  /** MIDI as written. */
  written: number;
  /** Sounding MIDI (written - 12 for guitar notation). */
  midi: number;
}

/** A printed accidental. */
export interface OmrAccidental extends OmrElement {
  type: AccidentalType;
  alternatives?: Alternative<AccidentalType>[];
}

/** One note head on a notation staff. */
export interface OmrNote extends OmrElement {
  /** Half spaces above the bottom staff line: 0 = bottom line (E4 in treble clef), 8 = top line. */
  staffPosition: number;
  head: NoteHeadType;
  pitch: OmrPitch;
  alternatives?: Alternative<OmrPitch>[];
  /** Accidental printed directly in front of this head, if any. */
  accidental?: OmrAccidental;
  /** A tie starts / ends on this head. */
  tieStart?: boolean;
  tieStop?: boolean;
  /** Filled in when the event is aligned with the tab staff of the same system. */
  string?: number;
  fret?: number;
}

/** A note, chord or rest on a notation staff. */
export interface OmrNotationEvent extends OmrElement {
  kind: 'chord' | 'rest';
  /** Horizontal position in page px (centre of the heads / of the rest). Events are ordered by it. */
  x: number;
  /** Low to high; empty for a rest. */
  notes: OmrNote[];
  duration: OmrDuration;
  stem?: 'up' | 'down';
  /** Number of beams (when beamed) or flags (when flagged) on the stem. */
  beams?: number;
  flags?: number;
  /** Voice when two voices share the staff (1 = upper / stems up). */
  voice?: number;
  grace?: boolean;
  /** Id of the tab event that plays this event (linked staves). */
  linkedEventId?: string;
}

/** One fret number on a tab staff. */
export interface OmrTabNote extends OmrElement {
  /** 1 = top line of the tab staff. */
  string: number;
  fret: number;
  alternatives?: Alternative<number>[];
  /** Sounding MIDI under the staff's tuning. */
  midi: number;
  /** Printed in parentheses (tied or ghost note). */
  parenthesized?: boolean;
  tieStop?: boolean;
  /** Technique letters printed next to it: 'h', 'p', '/', 'b', '~' ... */
  technique?: string;
}

/** One column of fret numbers (or a rest drawn in the tab staff). */
export interface OmrTabEvent extends OmrElement {
  kind: 'tab' | 'tab-rest';
  x: number;
  /** Top string first. */
  notes: OmrTabNote[];
  /** Rhythm read from stems / beams under the tab, or copied from the linked notation event. */
  duration?: OmrDuration;
  linkedEventId?: string;
}

/** Anything that takes time on a staff. */
export type OmrEvent = OmrNotationEvent | OmrTabEvent;

/** True for an event of a notation staff. */
export function isNotationEvent(e: OmrEvent): e is OmrNotationEvent {
  return e.kind === 'chord' || e.kind === 'rest';
}

/** True for an event of a tab staff. */
export function isTabEvent(e: OmrEvent): e is OmrTabEvent {
  return e.kind === 'tab' || e.kind === 'tab-rest';
}

/** A clef at the start of a staff. */
export interface OmrClef extends OmrElement {
  type: ClefType;
  alternatives?: Alternative<ClefType>[];
}

/** A key signature. */
export interface OmrKeySignature extends OmrElement {
  /** Sharps positive, flats negative, -7..7. */
  fifths: number;
  alternatives?: Alternative<number>[];
}

/** A time signature. */
export interface OmrTimeSignature extends OmrElement {
  beats: number;
  beatValue: number;
  symbol?: 'common' | 'cut';
  alternatives?: Alternative<{ beats: number; beatValue: number }>[];
}

/** A bar line of one staff. */
export interface OmrBarline extends OmrElement {
  /** Centre of the bar line (group) in page px, at the middle of the staff. */
  x: number;
  type: BarlineType;
  alternatives?: Alternative<BarlineType>[];
  /** The line continues into the other staves of the system. */
  systemWide?: boolean;
}

/** One measure of one staff: the stretch between two bar lines. */
export interface OmrMeasure extends OmrElement {
  /** 0-based within the staff. */
  index: number;
  /** Left and right limit in page px. */
  x0: number;
  x1: number;
  /** Events in time order. */
  events: OmrEvent[];
  /** Ids of the bar lines that open / close the measure (absent at an open staff end). */
  startBarlineId?: string;
  endBarlineId?: string;
  /** Changes printed inside this measure. */
  clef?: OmrClef;
  keySignature?: OmrKeySignature;
  timeSignature?: OmrTimeSignature;
  /** Filled by the page pipeline: ticks of the events (one voice), what the metre asks for, and whether they agree. */
  ticks?: number;
  expectedTicks?: number;
  /** true / false when checked; absent when it could not be checked (no rhythm, unknown metre, two voices). */
  addsUp?: boolean;
  /** The first measure of a staff that is shorter than the metre (an upbeat). */
  pickup?: boolean;
}

/** Where a key or time in force on a staff comes from. */
export type OmrContextSource = 'printed' | 'carried' | 'given' | 'assumed';

/** One staff line as a polyline in page px, left to right. */
export type OmrStaffLine = Point[];

/** Geometry of a staff on the original page. */
export interface OmrStaffGeometry {
  /** Top to bottom. */
  lines: OmrStaffLine[];
  /** Mean distance between adjacent lines, page px. */
  space: number;
  /** Line thickness, page px. */
  lineThickness: number;
  /** Left / right end of the lines (page px, at the middle line). */
  x0: number;
  x1: number;
  /** Box around the staff lines only. */
  bbox: BBox;
  /** Box around everything that belongs to the staff (ledger notes, stems, text above and below). */
  contentBox: BBox;
}

/** A staff with everything read from it. */
export interface OmrStaff extends OmrElement {
  kind: StaffKind;
  kindAlternatives?: Alternative<StaffKind>[];
  lineCount: number;
  geometry: OmrStaffGeometry;
  clef?: OmrClef;
  keySignature?: OmrKeySignature;
  timeSignature?: OmrTimeSignature;
  barlines: OmrBarline[];
  measures: OmrMeasure[];
  /** Tab staves: sounding MIDI of the open strings, low to high (default standard tuning). */
  tuning?: number[];
  /** Id of the other staff of the same system that shows the same music (notation <-> tab). */
  linkedStaffId?: string;
  /** Time signature in force on this staff (printed here, carried from a staff above or a previous page, or assumed 4/4). */
  timeInForce?: { beats: number; beatValue: number; source: OmrContextSource };
  /** Key signature in force (notation staves). */
  keyInForce?: { fifths: number; source: OmrContextSource };
}

/** What a piece of text on the page is. */
export type OmrTextKind = 'chord-symbol' | 'tempo' | 'section' | 'title' | 'composer' | 'lyric' | 'fingering' | 'other';

/** Text read from the page. */
export interface OmrText extends OmrElement {
  kind: OmrTextKind;
  text: string;
  alternatives?: Alternative<string>[];
  /** Staff the text sits above, and the measure it starts in. */
  staffId?: string;
  measureIndex?: number;
  /** Horizontal anchor in page px. */
  x?: number;
}

/** One system: the staves that sound together, top to bottom. */
export interface OmrSystem extends OmrElement {
  index: number;
  staves: OmrStaff[];
  /** Chord symbols, tempo and section text attached to this system. */
  texts: OmrText[];
}

/** What the reader thinks of the picture itself. */
export interface OmrPageQuality {
  /** Guess at the kind of source. */
  source: 'render' | 'scan' | 'photo';
  /** Rotation that was corrected, in degrees. */
  skewDegrees: number;
  /** How the geometry was corrected. */
  correction: 'none' | 'scale' | 'similarity' | 'mesh';
  /** Staff space of the source image in px (larger = more detail). */
  sourceStaffSpace: number;
  /** Pixel noise (grey levels) and ink contrast 0..1 after flattening. */
  noise: number;
  contrast: number;
  /** 0..1 overall: below ~0.5 the result needs careful proofreading or a retake. */
  score: number;
}

/** A non-fatal problem worth showing to the user. */
export interface OmrWarning {
  code: 'no-staves' | 'low-resolution' | 'low-quality' | 'kind-uncertain' | 'measure-mismatch' | 'ai-unavailable' | 'other';
  message: string;
  staffId?: string;
}

/** Everything read from one page image. */
export interface OmrPage {
  /** Size of the original image in px. */
  width: number;
  height: number;
  /** Typical notation staff space in page px (tab staff space when the page has only tab). */
  staffSpace: number;
  systems: OmrSystem[];
  /** Text not attached to a system (title, composer, footers). */
  texts: OmrText[];
  quality: OmrPageQuality;
  warnings: OmrWarning[];
  /** Position in a multi-page document (0-based), when read as part of one. */
  pageIndex?: number;
  /** Milliseconds per stage of the run that produced it. */
  timings?: Record<string, number>;
}

// ------------------------------------------------------------------------------------------
// Recognizer contract
// ------------------------------------------------------------------------------------------

/** A bar line inside a staff strip. */
export interface StripBarline {
  /** Centre in strip px. */
  x: number;
  /** Ink extent in strip px. */
  x0: number;
  x1: number;
  type: BarlineType;
  confidence: number;
}

/** A measure inside a staff strip. */
export interface StripMeasure {
  index: number;
  x0: number;
  x1: number;
}

/**
 * Everything a staff recognizer needs: a cleaned, straightened image of ONE staff and its geometry.
 *
 * The strip is resampled from the original page so that the staff lines are perfectly horizontal,
 * evenly spaced and exactly `space` px apart. `lineYs[i]` is the centre of line i (top first), so
 * the staff position of a point is `(lineYs[lineCount - 1] - y) / (space / 2)` half spaces above
 * the bottom line, and tab string `s` sits at `lineYs[s - 1]`.
 */
export interface StaffInput {
  /** Index of the staff on the page (reading order) and its id in the output model. */
  index: number;
  staffId: string;
  kind: StaffKind;
  /** Confidence of `kind` (line count, "TAB" letters, digits vs note heads). */
  kindConfidence: number;
  lineCount: number;

  /** The strip: flattened grey (0 = black, 255 = white). */
  gray: GrayImage;
  /** Binarised strip, staff lines included (1 = ink). */
  binary: BinaryImage;
  /** Binarised strip with the staff lines removed and symbols kept. */
  noLines: BinaryImage;
  /** The pixels that were removed as staff line. */
  lineMask: BinaryImage;

  /** Distance between adjacent staff lines in strip px (constant over the strip). */
  space: number;
  /** Staff-line thickness in strip px. */
  lineThickness: number;
  /** y of each staff line in the strip, top first. */
  lineYs: number[];
  /** First and last column covered by the staff lines. */
  x0: number;
  x1: number;
  /** Bar lines and measures found by the layout stage, in strip px. */
  barlines: StripBarline[];
  measures: StripMeasure[];
  /** Strip px per page px (how much the strip was magnified from the original image). */
  scale: number;
  /** Staff space of this staff in the original image, px. A proxy for how much detail there is. */
  sourceSpace: number;

  /** Strip point -> page px. */
  toPage(x: number, y: number): Point;
  /** Strip box -> bounding box in page px. */
  toPageBox(x: number, y: number, w: number, h: number): BBox;
  /** Page point -> strip px. */
  fromPage(x: number, y: number): Point;

  /** The staff of the same system showing the same music (tab under notation), if any. */
  partnerIndex?: number;
  /** The whole original page, for recognizers that send a crop to the vision model. */
  page: { gray: GrayImage; width: number; height: number };
}

/** Options common to both staff recognizers. */
export interface RecognizeOptions {
  /** Optional second opinion from a vision model; a recognizer must work without it. */
  ai?: OmrVisionModel | null;
  /** Abort long work (the user left the screen). */
  signal?: AbortSignal;
  /** Tuning for tab staves: sounding MIDI low to high (default 40 45 50 55 59 64). */
  tuning?: number[];
  /** Key and time carried over from the previous system (staves after the first rarely repeat the time signature). */
  context?: { fifths?: number; beats?: number; beatValue?: number; clef?: ClefType };
}

/** Minimal vision-model interface (implemented over `@/core/platform/ai` by the app). */
export interface OmrVisionModel {
  /** Ask a question about an image; resolves with parsed JSON or null when unavailable. */
  ask(image: { gray: GrayImage } | { rgba: Uint8ClampedArray; width: number; height: number }, prompt: string, signal?: AbortSignal): Promise<unknown | null>;
}

/**
 * What a staff recognizer returns. Coordinates are PAGE px (use `input.toPageBox`). Events are in
 * time order; the assembler assigns them to measures by `x`, so `measureIndex` is optional.
 */
export interface StaffReading<E extends OmrEvent = OmrEvent> {
  events: (E & { measureIndex?: number })[];
  clef?: OmrClef;
  keySignature?: OmrKeySignature;
  timeSignature?: OmrTimeSignature;
  /** Text found in the strip (chord symbols above the staff, tempo, section names). */
  texts?: OmrText[];
  /** Overall confidence of the reading, 0..1. */
  confidence: number;
  warnings?: OmrWarning[];
  /** Tab staves: the tuning the frets were read with (sounding MIDI, low to high). */
  tuning?: number[];
}

/**
 * Reads a tablature staff: fret numbers per string with their x position, and the rhythm when
 * stems / beams are printed with the tab. To be implemented in `src/core/omr/tab/`.
 */
export type RecognizeTabStaff = (input: StaffInput, options?: RecognizeOptions) => StaffReading<OmrTabEvent> | Promise<StaffReading<OmrTabEvent>>;

/**
 * Reads a five-line staff: clef, key and time signature, notes / chords / rests with pitch,
 * duration and ties. To be implemented in `src/core/omr/notation/`.
 */
export type RecognizeNotationStaff = (input: StaffInput, options?: RecognizeOptions) => StaffReading<OmrNotationEvent> | Promise<StaffReading<OmrNotationEvent>>;

/** The two staff recognizers, as passed to `recognizePage`. Either may be missing. */
export interface StaffRecognizers {
  tab?: RecognizeTabStaff;
  notation?: RecognizeNotationStaff;
}

/** Standard guitar tuning, sounding MIDI, low to high (string 6 to string 1). */
export const STANDARD_TUNING: readonly number[] = [40, 45, 50, 55, 59, 64];

/** The usual tuning of a tab staff with this many lines (sounding MIDI, low to high), with its name. */
export const TAB_TUNINGS: Readonly<Record<number, { tuning: readonly number[]; name: string; bass: boolean }>> = {
  4: { tuning: [28, 33, 38, 43], name: 'bass tab in standard tuning (E A D G)', bass: true },
  5: { tuning: [23, 28, 33, 38, 43], name: 'five-string bass tab (B E A D G)', bass: true },
  6: { tuning: STANDARD_TUNING, name: 'guitar tab in standard tuning', bass: false },
  7: { tuning: [35, 40, 45, 50, 55, 59, 64], name: 'seven-string guitar tab (B E A D G B E)', bass: false },
};

/** The tuning a tab staff of `lines` lines is read with when none is given (guitar tuning for an unusual count). */
export function tabTuningFor(lines: number): number[] {
  return (TAB_TUNINGS[lines]?.tuning ?? STANDARD_TUNING).slice();
}

/** The highest fret a reading may hold: a number past it is a misreading (two numbers side by side, a smudge). */
export const MAX_READ_FRET = 24;

const STEP_SEMITONES: Record<StepName, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const STEPS: StepName[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/**
 * Pitch of a staff position in treble clef (0 = bottom line = written E4), with an alteration
 * applied. `octaveShift` is -12 for guitar notation (the default), 0 for music at concert pitch.
 */
export function pitchAtStaffPosition(staffPosition: number, alter = 0, octaveShift = -12): OmrPitch {
  // Diatonic index of E4 is 4 * 7 + 2 = 30.
  const d = 30 + staffPosition;
  const step = STEPS[((d % 7) + 7) % 7];
  const octave = Math.floor(d / 7);
  const written = (octave + 1) * 12 + STEP_SEMITONES[step] + alter;
  return { step, alter, octave, written, midi: written + octaveShift };
}

/** Sounding MIDI of a fret on a string (1 = high E) under a tuning given low to high. */
export function midiAtFret(string: number, fret: number, tuning: readonly number[] = STANDARD_TUNING): number {
  return tuning[tuning.length - string] + fret;
}

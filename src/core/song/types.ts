/**
 * The song model: what every song screen, importer, exporter and practice game agrees on.
 *
 * Conventions (shared with the rest of the app):
 *  - Time is in ticks, 960 per quarter note (`PPQ`). A beat's `start` is relative to its bar.
 *  - Pitch is sounding MIDI (standard tuning 40 45 50 55 59 64). Guitar notation transposes only on display.
 *  - Strings are numbered the guitarist's way (1 = thinnest); per-string arrays run low to high.
 *  - With a capo, frets count from the capo (as tab does): midi = tuning[index] + capo + fret.
 *  - Bars are 0-based indices everywhere in data; screens print bar n as n + 1.
 */

/** Ticks per quarter note in every song (the same as `PPQ` in theory and audio). */
export const PPQ = 960;

/** A time signature: `{ numerator: 6, denominator: 8 }`. */
export interface TimeSig {
  numerator: number;
  denominator: number;
}

/** Notation of a duration: base value (1 = whole … 32 = thirty-second), dots and tuplet. `duration` in ticks stays the truth. */
export interface NoteValue {
  /** 1 whole, 2 half, 4 quarter, 8 eighth, 16 sixteenth, 32 thirty-second, 64. */
  base: number;
  /** 0, 1 or 2 augmentation dots. */
  dots?: number;
  /** `{ actual: 3, normal: 2 }`: three in the time of two (a triplet). */
  tuplet?: { actual: number; normal: number };
}

/** A string bend. */
export interface Bend {
  /** How far the note is bent, in semitones (1 = half step, 2 = full bend, 0.5 = quarter tone). */
  amount: number;
  /** The bend comes back down to the fretted pitch within this note (bend and release). */
  release?: boolean;
  /** Bent before the string is struck: the note starts at the bent pitch (pre-bend). */
  pre?: boolean;
}

/** Fretting-hand finger: 1 index … 4 little, 0 open string, 'T' thumb over the neck. */
export type LeftFinger = 0 | 1 | 2 | 3 | 4 | 'T';

/** Picking-hand finger in classical notation: p thumb, i index, m middle, a ring, c little. */
export type RightFinger = 'p' | 'i' | 'm' | 'a' | 'c';

/** Pick or strum direction. */
export type Stroke = 'down' | 'up';

/**
 * One note of a beat. Techniques that connect two notes (tie, hammer-on, pull-off, legato slide)
 * are stored on the **destination** note: "this note is reached from the previous note on its string".
 */
export interface Note {
  /** String number, 1 = thinnest. */
  string: number;
  /** Fret counted from the capo; 0 = open (or the capo). Dead notes keep the fret the hand is on (often 0). */
  fret: number;
  /** Sounding MIDI pitch of the fretted note: tuning + capo + fret (bends and harmonics not included). */
  midi: number;
  /** Continues the previous note on this string without striking it again. */
  tie?: boolean;
  /** Sounded from the previous note on this string by a hammer-on or a pull-off. */
  legato?: 'hammer' | 'pull';
  /** Reached by sliding from the previous note on this string; the direction follows the frets. */
  slide?: 'up' | 'down';
  /** Slide into this note from an undefined point below or above. */
  slideIn?: 'below' | 'above';
  /** Slide out of this note to an undefined point (fall-off down or up). */
  slideOut?: 'down' | 'up';
  bend?: Bend;
  vibrato?: boolean;
  palmMute?: boolean;
  /** Muted, percussive "x" note without pitch. */
  dead?: boolean;
  /** Ghost note: played very softly, written in parentheses. */
  ghost?: boolean;
  harmonic?: 'natural' | 'artificial';
  letRing?: boolean;
  staccato?: boolean;
  accent?: boolean;
  /** Tapped with a picking-hand finger. */
  tap?: boolean;
  /** Fretting-hand finger. */
  finger?: LeftFinger;
  /** Picking-hand finger (fingerstyle). */
  pluck?: RightFinger;
  /**
   * Ticks this note sounds when that differs from its beat's duration: a bass note held under a
   * moving melody after two voices were merged into one. Omitted = the beat's duration.
   */
  length?: number;
}

/** A rhythmic event in a bar: a rest (no notes, not a slash) or notes struck together. */
export interface Beat {
  /** Ticks from the start of the bar. */
  start: number;
  /** Length in ticks. */
  duration: number;
  /** How the duration is written (optional; derived from `duration` when missing). */
  value?: NoteValue;
  /** Notes struck on this beat; empty for a rest or a slash. */
  notes: Note[];
  /** Rhythm slash: strum the current chord symbol (chord tracks). */
  slash?: boolean;
  /** Muted strum (a slash with every string damped): the percussive "chk". */
  mutedStrum?: boolean;
  /** Pick direction for a single note, strum direction for a chord or slash. */
  stroke?: Stroke;
  /** Lyric syllable sung on this beat; a syllable that continues the word ends with `-` (`A-`, `maz-`, `ing`). */
  lyric?: string;
  /** Short text attached to the beat (a performance hint). */
  text?: string;
}

/** One bar of one track. */
export interface Measure {
  beats: Beat[];
}

/** Bar-level information shared by all tracks (a "master bar"). */
export interface BarInfo {
  time: TimeSig;
  /** Explicit length in ticks when the bar is shorter than its time signature (a pickup bar). */
  length?: number;
  /** A repeat begins at this bar. */
  repeatStart?: boolean;
  /** A repeat ends after this bar; the number is how many times the passage is played in all (2 = once more). */
  repeatEnd?: number;
  /** First/second-time ending: the passes (1-based) on which this bar is played. */
  ending?: number[];
  /** A key change starting at this bar (key name as `getKey` reads it). */
  key?: string;
}

/** A chord symbol on the song's timeline; it lasts until the next one. */
export interface ChordEvent {
  bar: number;
  /** Ticks from the start of the bar. */
  tick: number;
  /** Chord symbol (`Am7`, `C/E`) or `N.C.`. */
  symbol: string;
  /** Chosen shape: fret per string low to high, null = not played (`x32010` = [null,3,2,0,1,0]). */
  voicing?: Array<number | null>;
}

/** A text annotation placed in the score ("let ring", "swing feel"). */
export interface Annotation {
  bar: number;
  tick: number;
  text: string;
}

/** A tempo change. Tempo is always in quarter notes per minute (a dotted quarter in 6/8 at 60 is 90). */
export interface TempoChange {
  bar: number;
  /** Ticks from the start of the bar (default 0). */
  tick?: number;
  bpm: number;
  /** Glide linearly from here to the next tempo change. */
  ramp?: boolean;
}

/** A strumming pattern: one character per step, the bar divided evenly. `D` down, `U` up, `X` muted, `-` or `.` no strum. */
export interface StrumPattern {
  /** `D-DU-UDU` (eight steps in 4/4 = eighth notes). */
  pattern: string;
  /** Optional name ("Folk", "Calypso"). */
  name?: string;
}

/** A named part of the song: bars [start, end). */
export interface Section {
  name: string;
  start: number;
  end: number;
  /** How the chords are strummed in this section. */
  strum?: StrumPattern;
}

/** What a track is for. `lead`: melody or riff tab; `rhythm`: chords and strumming; `bass`: a bass line. */
export type TrackRole = 'lead' | 'rhythm' | 'bass';

/** One instrument part: a list of bars, one per `Song.bars` entry. */
export interface Track {
  /** Unique within the song, slug-safe. */
  id: string;
  name: string;
  role: TrackRole;
  /** Own tuning (a bass track); otherwise the song's. */
  tuning?: number[];
  /** Own capo; otherwise the song's. */
  capo?: number;
  measures: Measure[];
}

/** Metadata shown in the library. */
export interface SongMeta {
  id: string;
  title: string;
  composer?: string;
  artist?: string;
  /** Where the music comes from ("Traditional, 18th-century Scottish"). */
  source?: string;
  /** Licence note ("Public domain", "Original exercise for Sixstring Academy"). */
  licence?: string;
  /** Authored difficulty 1–10; `estimateDifficulty` computes one when missing. */
  difficulty?: number;
  tags?: string[];
  /** Who arranged or transcribed it. */
  arranger?: string;
}

/** A whole song. */
export interface Song {
  meta: SongMeta;
  /** Open-string sounding MIDI pitches, low to high. */
  tuning: number[];
  capo: number;
  /** Key at the start (`G`, `E minor`, `F#m`). */
  key?: string;
  /** At least one entry, the first at bar 0. */
  tempo: TempoChange[];
  bars: BarInfo[];
  sections: Section[];
  tracks: Track[];
  chords: ChordEvent[];
  annotations: Annotation[];
}

/** A problem found in a song or in an imported file. */
export interface SongIssue {
  level: 'error' | 'warning';
  /** Stable machine-readable code (`bar-length`, `pitch-mismatch` …). */
  code: string;
  message: string;
  track?: string;
  bar?: number;
  beat?: number;
}

/** A remark from an importer: something guessed, ignored or repaired. */
export interface ImportWarning {
  message: string;
  /** 0–1: how sure the importer is about what it did here (1 = certain). */
  confidence?: number;
  bar?: number;
  /** 1-based line of the source text, where there is one. */
  line?: number;
}

/** What every importer returns. */
export interface ImportResult {
  song: Song;
  warnings: ImportWarning[];
  /** Overall confidence 0–1 that the song is what the file meant. */
  confidence: number;
  /** True when rhythm was estimated (from spacing or line structure), not read. */
  estimatedRhythm?: boolean;
}

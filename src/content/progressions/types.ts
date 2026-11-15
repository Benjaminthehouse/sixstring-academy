/**
 * Types of the chord-progression catalog. Authors write a `ProgressionSpec` (with the chart as
 * text); `index.ts` turns each into a `Progression` (the chart split into bars). Everything that
 * can be computed (chords in a key, the band's input) comes from the theory engine at runtime.
 */
import type { BackingStyleId } from '@/core/audio';

/** A musical style a progression belongs to, for browsing ("show me blues"). */
export type ProgressionStyle =
  | 'pop' | 'rock' | 'blues' | 'folk' | 'country' | 'jazz' | 'classical' | 'flamenco' | 'latin'
  | 'funk' | 'soul' | 'rnb' | 'gospel' | 'reggae' | 'ska' | 'metal' | 'modal' | 'doo-wop';

/** The data file (and catalog section) a progression lives in. */
export type ProgressionFamily =
  | 'pop-rock' | 'fifties' | 'blues' | 'folk-country' | 'jazz' | 'classical' | 'flamenco' | 'latin'
  | 'funk-soul' | 'reggae-ska' | 'metal' | 'modal' | 'minor-pop' | 'borrowed' | 'secondary';

/**
 * Where the progression's home chord sits. `major` is Ionian and `minor` is Aeolian (natural
 * minor; a major V borrowed from harmonic minor is still `minor`). `phrygian-dominant` is the
 * flamenco mode: Phrygian with a major home chord.
 */
export type Tonality =
  | 'major' | 'minor' | 'dorian' | 'phrygian' | 'phrygian-dominant' | 'lydian' | 'mixolydian' | 'locrian';

/** Time signature as text; always the backing style's own meter. */
export type Meter = '4/4' | '3/4' | '6/8' | '12/8';

/** How to play a progression with the backing band. */
export interface ProgressionFeel {
  /** A `BackingStyleId` of `@/core/audio`, used verbatim by `BackingBand.load()`. */
  backing: BackingStyleId;
  /** Suggested tempo range [slow, fast] in the backing style's felt beats per minute. */
  tempo: readonly [number, number];
  /** The backing style's meter, spelled out for the screen. */
  meter: Meter;
}

/**
 * A scale to solo with, placed on a degree of the key: `{ degree: '6', scale: 'minor-pentatonic' }`
 * in C major is A minor pentatonic. `scale` is a theory-engine scale id (`getScale`).
 */
export interface ScaleTip {
  degree: string;
  scale: string;
}

/** Practical advice for playing and improvising over a progression. */
export interface TryThis {
  /** One or two scales that fit for soloing, first = the one to start with. */
  scales: readonly ScaleTip[];
  /** A strumming or comping feel in plain words. */
  strum: string;
  /** One extra idea: a target note, a voicing, the common mistake. */
  tip?: string;
}

/** A well-known recording or piece that uses the progression (named, never transcribed). */
export interface HeardIn {
  title: string;
  /** Artist, composer, or "traditional". */
  by: string;
  /** Where in the piece, or how it differs (key, a changed chord). */
  note?: string;
}

/** A labelled part of a longer form, in bars: the A and B of an AABA tune. */
export interface ProgressionSection {
  label: string;
  bars: number;
}

/**
 * What an author writes for one progression.
 *
 * `chart` lays the numerals out by bar: bars are separated by `|`, chords within a bar by
 * spaces, and a bar with two chords splits evenly (`'I | ii7 V7 | I'`). Numerals use the theory
 * engine's syntax (`I ii7 V7/V bVII iiø7 vii°7 subV7 Imaj7 I5`), accidentals measured against
 * the major scale in every key (A minor is `i ii° bIII iv v bVI bVII`). A slash followed by a
 * degree **of the key** puts that note in the bass: `V/7` is V with the leading tone in the bass
 * (G/B in C), `iv/b6` is Dm/F in A minor, `IV/5` is F/G in C. A slash followed by a numeral is an
 * applied chord as usual (`V7/ii`), and both can combine (`V7/IV/3` = C7/E in C).
 */
export interface ProgressionSpec {
  /** Slug-safe, unique: lowercase letters, digits, single hyphens. Stable: lessons link to it. */
  id: string;
  /** The common name where one exists ("Andalusian cadence"), else a plain description. */
  name: string;
  /** Other names people use for it (search uses them too). */
  aka?: readonly string[];
  chart: string;
  tonality: Tonality;
  /** Styles for browsing, most typical first. */
  styles: readonly ProgressionStyle[];
  /** 1 (first weeks) to 10 (expert). */
  level: number;
  /** The default way to hear it. */
  feel: ProgressionFeel;
  /** Other feels that suit it (the screen may offer them). */
  altFeels?: readonly ProgressionFeel[];
  /** Exactly two sentences: why it works, in functional terms a learner can follow. */
  why: string;
  tryThis: TryThis;
  /** Variations and relatives, by id. */
  related: readonly string[];
  /** Guitar-friendly tonics, the first one is the default. Spelled for this tonality. */
  keys: readonly string[];
  /** Optional remark per key in `keys` (flamenco: "por arriba"). */
  keyNotes?: Readonly<Record<string, string>>;
  /** Optional form labels for long forms; the bar counts add up to the chart. */
  sections?: readonly ProgressionSection[];
  /** A few very famous uses, only when certain; omitted rather than guessed. */
  heardIn?: readonly HeardIn[];
}

/** A catalog entry: the spec plus its family and the chart split into bars of numeral tokens. */
export interface Progression extends ProgressionSpec {
  family: ProgressionFamily;
  /** One array per bar; each token is a numeral, optionally with `/degree` for the bass. */
  bars: readonly (readonly string[])[];
}

/** A chart token split into the engine numeral and the bass degree (null = root position). */
export interface ChordSlot {
  numeral: string;
  bass: string | null;
}

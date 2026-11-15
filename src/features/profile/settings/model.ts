/**
 * The choices the settings screen offers, as data. Ids are the values the progress store keeps;
 * the audio and guitar modules understand them (a test cross-checks every id against those
 * modules, so a renamed tone or click set fails here rather than playing the wrong sound).
 */
import type { AccidentalPref, DailyGoalXp, ExperienceLevel, FretLabelMode, Handedness, MotionPref, NotationPref, NoteNaming, ThemePref, WeekStart } from '@/core/progress';

/** One choice of a setting. */
export interface Choice<T extends string | number> {
  value: T;
  label: string;
  /** A line that says what choosing it means. */
  description?: string;
}

/** Guitar tones a learner can pick as the default sound. Values are tone names of the audio engine. */
export const TONE_CHOICES: ReadonlyArray<Choice<string>> = [
  { value: 'steel', label: 'Steel-string acoustic', description: 'Bright and full. The classic campfire guitar.' },
  { value: 'nylon', label: 'Nylon-string classical', description: 'Soft and round.' },
  { value: 'clean', label: 'Clean electric', description: 'Clear, with a long sustain.' },
  { value: 'driven', label: 'Overdriven electric', description: 'Crunchy. Power chords love it.' },
];

/** Words stored by older versions and other screens for the tones above. */
const TONE_ALIASES: Readonly<Record<string, string>> = {
  acoustic: 'steel',
  'steel-string': 'steel',
  classical: 'nylon',
  'nylon-string': 'nylon',
  electric: 'clean',
  'clean-electric': 'clean',
  overdrive: 'driven',
  overdriven: 'driven',
  distortion: 'driven',
  distorted: 'driven',
};

/** The tone choice a stored `guitarTone` stands for (steel when it is unknown). */
export function toneChoice(stored: string): string {
  const key = stored.trim().toLowerCase();
  if (TONE_CHOICES.some((c) => c.value === key)) return key;
  return TONE_ALIASES[key] ?? 'steel';
}

/** Metronome click sounds. Values are click sets of the audio engine. */
export const CLICK_CHOICES: ReadonlyArray<Choice<string>> = [
  { value: 'woodblock', label: 'Woodblock' },
  { value: 'beep', label: 'Beep' },
  { value: 'tick', label: 'Tick' },
  { value: 'hihat', label: 'Hi-hat' },
  { value: 'rim', label: 'Rim click' },
  { value: 'cowbell', label: 'Cowbell' },
  { value: 'clave', label: 'Clave' },
];

const CLICK_ALIASES: Readonly<Record<string, string>> = { wood: 'woodblock', block: 'woodblock', classic: 'woodblock', click: 'tick', hat: 'hihat', 'hi-hat': 'hihat', rimshot: 'rim', bell: 'cowbell', claves: 'clave' };

/** The click choice a stored `clickSound` stands for (woodblock when it is unknown). */
export function clickChoice(stored: string): string {
  const key = stored.trim().toLowerCase();
  if (CLICK_CHOICES.some((c) => c.value === key)) return key;
  return CLICK_ALIASES[key] ?? 'woodblock';
}

/** Levels, with what each one means. */
export const EXPERIENCE_CHOICES: ReadonlyArray<Choice<ExperienceLevel>> = [
  { value: 'beginner', label: 'Beginner', description: 'New to the guitar, or just starting out.' },
  { value: 'intermediate', label: 'Intermediate', description: 'Open chords are fine. The rest of the neck is next.' },
  { value: 'expert', label: 'Expert', description: 'You play well and want depth.' },
];

/** Which hand frets. */
export const HAND_CHOICES: ReadonlyArray<Choice<Handedness>> = [
  { value: 'right', label: 'Right-handed' },
  { value: 'left', label: 'Left-handed' },
];

/** How notes are named. */
export const NAMING_CHOICES: ReadonlyArray<Choice<NoteNaming>> = [
  { value: 'letters', label: 'C D E', description: 'Letter names, as in most guitar books.' },
  { value: 'solfege', label: 'Do Re Mi', description: 'Fixed do: C is always Do.' },
  { value: 'german', label: 'C D E … H', description: 'German names: H for B, and B for B flat.' },
];

/** How accidentals are spelled when the key does not decide. */
export const ACCIDENTAL_CHOICES: ReadonlyArray<Choice<AccidentalPref>> = [
  { value: 'auto', label: 'By key' },
  { value: 'sharps', label: 'Sharps ♯' },
  { value: 'flats', label: 'Flats ♭' },
];

/** Daily goals. */
export const GOAL_CHOICES: ReadonlyArray<Choice<DailyGoalXp> & { minutes: number }> = [
  { value: 10, label: 'Casual', minutes: 5, description: '10 XP · about 5 minutes a day' },
  { value: 20, label: 'Regular', minutes: 10, description: '20 XP · about 10 minutes a day' },
  { value: 30, label: 'Serious', minutes: 15, description: '30 XP · about 15 minutes a day' },
  { value: 50, label: 'Intense', minutes: 25, description: '50 XP · about 25 minutes a day' },
];

/** Colour theme. */
export const THEME_CHOICES: ReadonlyArray<Choice<ThemePref>> = [
  { value: 'system', label: 'Device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Motion. */
export const MOTION_CHOICES: ReadonlyArray<Choice<MotionPref>> = [
  { value: 'system', label: 'Device' },
  { value: 'reduce', label: 'Reduced' },
  { value: 'full', label: 'Full' },
];

/** What fretboard dots are labelled with. */
export const FRET_LABEL_CHOICES: ReadonlyArray<Choice<FretLabelMode>> = [
  { value: 'notes', label: 'Note names' },
  { value: 'degrees', label: 'Scale degrees' },
];

/** Tab alone or with standard notation. */
export const NOTATION_CHOICES: ReadonlyArray<Choice<NotationPref>> = [
  { value: 'tab', label: 'Tab only' },
  { value: 'tab+notation', label: 'Tab and notation' },
];

/** First day of the week. */
export const WEEK_START_CHOICES: ReadonlyArray<Choice<WeekStart>> = [
  { value: 'monday', label: 'Monday' },
  { value: 'sunday', label: 'Sunday' },
];

/** Lowest and highest reference pitch the store accepts, in Hz. */
export const A4_RANGE = { min: 415, max: 466, standard: 440 } as const;

/** What a reference pitch means, in words. */
export function a4Text(a4: number): string {
  if (a4 === 440) return 'Concert pitch. Nearly all modern music uses 440 Hz.';
  if (a4 === 432) return 'A little lower than concert pitch. Recordings and other instruments will sound sharp next to you.';
  if (a4 === 415) return 'Baroque pitch: a half step below concert pitch.';
  if (a4 > 440) return `${a4 - 440} Hz above concert pitch. Some orchestras tune here; recordings will sound flat next to you.`;
  return `${440 - a4} Hz below concert pitch. Recordings and other instruments will sound sharp next to you.`;
}

/** A tuning as the picker needs it (a slice of the guitar module's `Tuning`). */
export interface TuningLike {
  id: string;
  name: string;
  label: string;
  instrument: string;
  category: string;
  stringCount: number;
}

const GROUP_TITLES: ReadonlyArray<[string, string]> = [
  ['standard', 'Standard'],
  ['lowered', 'Tuned down'],
  ['drop', 'Drop tunings'],
  ['open', 'Open tunings'],
  ['modal', 'Modal'],
  ['other', 'Other six-string tunings'],
  ['extended', 'Seven-string and baritone'],
];

/** Options for a grouped `<Select>`: guitar tunings under plain headings, then bass and ukulele. */
export function tuningOptions(tunings: readonly TuningLike[]): Array<{ group: string; options: Array<{ value: string; label: string }> }> {
  const option = (t: TuningLike) => ({ value: t.id, label: `${t.name} (${t.label})` });
  const groups: Array<{ group: string; options: Array<{ value: string; label: string }> }> = [];
  for (const [category, title] of GROUP_TITLES) {
    const options = tunings.filter((t) => t.instrument === 'guitar' && t.category === category).map(option);
    if (options.length > 0) groups.push({ group: title, options });
  }
  for (const [instrument, title] of [
    ['bass', 'Bass'],
    ['ukulele', 'Ukulele'],
  ] as const) {
    const options = tunings.filter((t) => t.instrument === instrument).map(option);
    if (options.length > 0) groups.push({ group: title, options });
  }
  return groups;
}

/** The longest name the store keeps. */
export const NAME_MAX = 40;

/** Storage key (through platform storage) of the "read explanations aloud" switch. */
export const SPEECH_PREF_KEY = 'prefs.speech';

/** What the AI helper says after a key was checked with Anthropic. */
export type KeyCheck = { state: 'ok' } | { state: 'rejected'; message: string } | { state: 'unsure'; message: string };

/** What to do once a key check has answered: forget the key or not, switch the helper on or off (null: leave it), and what to say. */
export interface KeyCheckOutcome {
  forget: boolean;
  enabled: boolean | null;
  check: KeyCheck;
}

/**
 * Decide what a key check means. An accepted key switches the helper on; a key Anthropic rejects
 * is forgotten and the helper switched off; anything else (no network, an outage) keeps the key
 * and says it could not be checked.
 */
export function keyCheckOutcome(result: { ok: true } | { ok: false; error: { kind: string; message: string } }): KeyCheckOutcome {
  if (result.ok) return { forget: false, enabled: true, check: { state: 'ok' } };
  if (result.error.kind === 'bad-key') {
    return {
      forget: true,
      enabled: false,
      check: { state: 'rejected', message: 'Anthropic did not accept that key. It may be mistyped, expired or revoked. It was not saved. Copy the whole key again and paste it here.' },
    };
  }
  return { forget: false, enabled: null, check: { state: 'unsure', message: result.error.message } };
}

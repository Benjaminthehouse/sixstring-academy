/**
 * The shape of one built-in song's metadata (`<id>/meta.ts`). The notes live beside it in
 * `<id>/song.sixtab`; the folder name is the song's id. README.md explains how to add a song.
 */

/** Musical style, for the Songs screen's style filter. Pick the one a learner would look under. */
export const SONG_STYLES = [
  'folk',
  'children',
  'classical',
  'blues',
  'ragtime',
  'spiritual',
  'celtic',
  'latin',
  'country',
  'jazz',
  'rock',
  'holiday',
  'world',
] as const;
/** One of `SONG_STYLES`. */
export type SongStyle = (typeof SONG_STYLES)[number];

/** Display names of the styles. */
export const STYLE_NAMES: Readonly<Record<SongStyle, string>> = {
  folk: 'Folk',
  children: "Children's songs",
  classical: 'Classical',
  blues: 'Blues',
  ragtime: 'Ragtime',
  spiritual: 'Spirituals',
  celtic: 'Celtic',
  latin: 'Latin',
  country: 'Country',
  jazz: 'Jazz',
  rock: 'Rock',
  holiday: 'Holiday',
  world: 'World',
};

/** How the piece is arranged for the guitar (the repertoire plan's "arrangement"). */
export const SONG_KINDS = ['melody', 'strum-and-sing', 'melody-with-chords', 'fingerstyle', 'classical-solo', 'flatpicking', 'duet', 'riff', 'study'] as const;
/** One of `SONG_KINDS`. */
export type SongKind = (typeof SONG_KINDS)[number];

/** Display names of the arrangement kinds. */
export const KIND_NAMES: Readonly<Record<SongKind, string>> = {
  melody: 'Single-line melody',
  'strum-and-sing': 'Strum and sing',
  'melody-with-chords': 'Melody with chords',
  fingerstyle: 'Fingerstyle solo',
  'classical-solo': 'Classical solo',
  flatpicking: 'Flatpicking',
  duet: 'Duet',
  riff: 'Riff',
  study: 'Study',
};

/** What a song trains, for the "What it teaches" filter. A song names one to four. */
export const SONG_SKILLS = ['melody', 'chords', 'strumming', 'fingerpicking', 'rhythm', 'singing', 'technique', 'form'] as const;
/** One of `SONG_SKILLS`. */
export type SongSkill = (typeof SONG_SKILLS)[number];

/** Learner-facing names of the skills (filter chips). */
export const SKILL_NAMES: Readonly<Record<SongSkill, string>> = {
  melody: 'Playing a tune',
  chords: 'Chords and changes',
  strumming: 'Strumming',
  fingerpicking: 'Fingerpicking',
  rhythm: 'Rhythm and timing',
  singing: 'Singing while you play',
  technique: 'Techniques',
  form: 'Song forms',
};

/** Difficulty 1 (first week) to 10 (concert level), as in the repertoire plan. */
export type SongLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/** What an author writes in `meta.ts` (`export default defineSong({ ... })`). */
export interface SongMetaInput {
  /** Exactly the SixTab file's `title:`. */
  title: string;
  /** Composer, or the tradition for anonymous music: "Traditional English", "Ferdinando Carulli". */
  composer: string;
  /** When and where it comes from, in a few words: "In print by the late 18th century". */
  origin?: string;
  /** Why it is free to use, one or two plain sentences (music and words separately when it has words). */
  publicDomain: string;
  /** 1–10; equal to the SixTab file's `difficulty:`. */
  level: SongLevel;
  style: SongStyle;
  kind: SongKind;
  /** Same musical key as the SixTab file's `key:`, written for people: "G major", "A minor". */
  key: string;
  /** What a learner gets out of it, two to four short phrases: "Your first chord: a one-finger G". */
  teaches: string[];
  /** One to four filter categories. */
  skills: SongSkill[];
  /** Free search words (lower case): "round", "12-bar", "waltz". */
  tags: string[];
  /**
   * Two to four sentences for a learner with no teacher in the room: what it should feel and sound
   * like, the common mistake, and how to fix it.
   */
  about: string;
  /** The repertoire plan id (src/content/plan/repertoire.json) when the song comes from the plan. */
  plan?: string;
  /** Date the song was added, `YYYY-MM-DD` (newest first in "Recently added"). */
  added: string;
}

/** A registered built-in song: the metadata plus its id (the folder name). */
export interface SongEntry extends SongMetaInput {
  id: string;
}

/** Declare a song's metadata. Only gives the object its type; the registry adds the id. */
export function defineSong(meta: SongMetaInput): SongMetaInput {
  return meta;
}

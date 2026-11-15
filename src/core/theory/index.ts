/**
 * Music theory engine: notes, intervals, scales, chords, keys, harmony, rhythm and staff helpers,
 * plus fast per-pitch lookups for drawing, display formatting, and exercise building blocks.
 * Pure functions, no side effects, usable in the browser and in Node. Import everything from here
 * (`@/core/theory`), never from the inner files. `API.md` beside this file is the digest.
 *
 * Conventions: note names are ASCII (`F#`, `Bb3`); MIDI C4 = 60; intervals `M3`, `d5`, `m13`;
 * degrees `b3`, `#4`; chord symbols `Cm7b5`, `C/E`; roman numerals with accidentals against the
 * major scale in every key (`bVII`, `iiø7`, `V7/ii`); time in ticks, 960 per quarter note.
 * Functions named `parse…` and `get…` return null for input they cannot read; the short accessors
 * `note()`, `interval()`, `chord()`, `key()` and `roman()` and every computing function throw a
 * RangeError instead, so pass them validated input.
 */
export * from './note';
export * from './interval';
export * from './chord';
export * from './scale';
export * from './roman';
export * from './key';
export * from './harmony';
export * from './rhythm';
export * from './staff';
export * from './lookup';
export * from './display';
export * from './exercise';

/**
 * The guitar engine: tunings, fretboard mapping and geometry, scales on the neck (positions,
 * patterns, practice sequences), chord voicings (curated library, generator, identification,
 * arpeggios) and the helpers built on them (capo, transposition, hand-movement cost).
 *
 * Pure functions on top of `@/core/theory`; usable in the browser and in Node. Import everything
 * from here (`@/core/guitar`), never from the inner files. `API.md` beside this file is the digest.
 *
 * Conventions: string 1 = thinnest; per-string arrays run low to high; fret 0 = open; with a capo,
 * frets count from the capo; pitch is sounding MIDI (standard tuning 40 45 50 55 59 64).
 */
export * from './types';
export * from './tunings';
export * from './fretboard';
export * from './geometry';
export * from './fingering';
export * from './scale-patterns';
export * from './sequences';
export * from './voicing';
export * from './chord-shapes';
export * from './chord-library';
export * from './chord-generator';
export * from './chord-identify';
export * from './arpeggio';
export * from './capo';
export * from './hand';
export * from './chord-changes';

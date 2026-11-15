/** Flamenco and Spanish: the Andalusian cadence (two ways of hearing it) and Phrygian-dominant moves. */
import type { ProgressionSpec } from '../types';
import { STRUM, feel, sc } from './common';

const FLAMENCO_KEY_NOTES: Readonly<Record<string, string>> = {
  E: 'Por arriba: the home key of flamenco guitar, with E, F, G and Am in open position.',
  A: 'Por medio: the second flamenco key, with A, Bb, C and Dm shapes.',
  B: 'The key of the granaína.',
  'F#': 'The key of the taranta.',
};

/** The key notes for the keys an entry actually lists. */
function notesFor(keys: readonly string[]): Readonly<Record<string, string>> {
  return Object.fromEntries(keys.filter((k) => k in FLAMENCO_KEY_NOTES).map((k) => [k, FLAMENCO_KEY_NOTES[k]]));
}

export const FLAMENCO: readonly ProgressionSpec[] = [
  {
    id: 'flamenco-andalusian',
    name: 'Andalusian cadence',
    aka: ['Andalusian progression', 'i–bVII–bVI–V'],
    chart: 'i | bVII | bVI | V',
    tonality: 'minor',
    styles: ['flamenco', 'pop', 'rock', 'latin'],
    level: 3,
    feel: feel('pop-rock', 96, 150),
    altFeels: [feel('waltz', 100, 150), feel('latin', 90, 120)],
    why: 'The roots step down the scale (1, b7, b6, 5) from the minor home to a major V, which belongs to harmonic minor and pulls back to i with its leading tone. The descent through bVII and bVI uses the natural minor\'s own chords, so the line sounds inevitable and unmistakably Spanish.',
    tryThis: {
      scales: [sc('1', 'minor'), sc('5', 'phrygian-dominant')],
      strum: STRUM.rasgueado,
      tip: 'Natural minor fits the first three chords; over V switch to the Phrygian dominant scale on V (the harmonic minor of the key), and land on the leading tone.',
    },
    related: ['flamenco-cadence-phrygian', 'minor-i-bvii-bvi-bvii', 'classical-lament-diatonic'],
    keys: ['A', 'E', 'D', 'B'],
    heardIn: [
      { title: 'Hit the Road Jack', by: 'Ray Charles' },
      { title: 'Runaway', by: 'Del Shannon', note: 'verse' },
      { title: 'Sultans of Swing', by: 'Dire Straits', note: 'verse, in D minor' },
    ],
  },
  {
    id: 'flamenco-cadence-phrygian',
    name: 'Andalusian cadence, flamenco view (iv–bIII–bII–I)',
    aka: ['flamenco cadence', 'Phrygian cadence'],
    chart: 'iv | bIII | bII | I',
    tonality: 'phrygian-dominant',
    styles: ['flamenco'],
    level: 4,
    feel: feel('waltz', 100, 150),
    altFeels: [feel('latin', 90, 120)],
    why: 'In flamenco the same four chords end on home: the last chord is I, the major tonic of the Phrygian mode, and bII falls onto it by a half step. The resolution comes from above (b2 to 1) instead of from a leading tone below, which is the sound of Andalusia.',
    tryThis: {
      scales: [sc('1', 'phrygian-dominant'), sc('1', 'phrygian')],
      strum: STRUM.rasgueado,
      tip: 'Play Phrygian with a raised third (Phrygian dominant) over the I chord and plain Phrygian over the rest; end your phrases on the home note with a half step down from b2.',
    },
    related: ['flamenco-andalusian', 'flamenco-phrygian-vamp', 'flamenco-climb', 'classical-phrygian-half'],
    keys: ['E', 'A', 'B', 'F#'],
    keyNotes: notesFor(['E', 'A', 'B', 'F#']),
  },
  {
    id: 'flamenco-phrygian-vamp',
    name: 'Phrygian vamp (I–bII)',
    chart: 'I | bII | bII | I',
    tonality: 'phrygian-dominant',
    styles: ['flamenco', 'latin'],
    level: 3,
    feel: feel('latin', 90, 120),
    altFeels: [feel('waltz', 100, 150)],
    why: 'Two major chords a half step apart: bII leans on the home chord from above and falls back onto it, the same pull that ends the Andalusian cadence. Rumba and flamenco-pop grooves can vamp on this pair for minutes.',
    tryThis: {
      scales: [sc('1', 'phrygian-dominant'), sc('1', 'phrygian')],
      strum: STRUM.rasgueado,
      tip: 'In E it is E and F. Flamenco guitarists often play the F by moving the E shape\'s three fretted notes up one fret and leaving the open B and E strings ringing: the rub is part of the colour.',
    },
    related: ['flamenco-cadence-phrygian', 'phrygian-i-bii', 'metal-phrygian'],
    keys: ['E', 'A', 'B'],
    keyNotes: notesFor(['E', 'A', 'B']),
  },
  {
    id: 'flamenco-climb',
    name: 'Spanish climb (I–bII–bIII–bII)',
    chart: 'I | bII | bIII bII | I',
    tonality: 'phrygian-dominant',
    styles: ['flamenco'],
    level: 4,
    feel: feel('waltz', 100, 150),
    altFeels: [feel('latin', 90, 120)],
    why: 'From the major home the chords climb the Phrygian scale (I, bII, bIII) and fall back by half step, bII to I: tension builds on the way up and releases with the characteristic semitone. Accented with rasgueados on the arrival, it is the classic flourish of Spanish guitar.',
    tryThis: {
      scales: [sc('1', 'phrygian-dominant'), sc('1', 'phrygian')],
      strum: STRUM.rasgueado,
      tip: 'In E the chords are E, F, G and F: keep the open high strings ringing under all of them for the flamenco shimmer.',
    },
    related: ['flamenco-phrygian-vamp', 'phrygian-climb', 'flamenco-cadence-phrygian'],
    keys: ['E', 'A'],
    keyNotes: notesFor(['E', 'A']),
  },
];

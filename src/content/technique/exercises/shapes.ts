/** Two- and three-note shapes: octaves, double stops in thirds and sixths, triad inversions. */
import { music } from '../generate';
import type { TechniqueExercise } from '../types';

/** G major in octaves on strings 6 and 4: string 6 frets, the octave two frets higher on string 4. */
const G_OCTAVES = [3, 5, 7, 8, 10, 12, 14, 15];

function octaveScale(): string {
  const up = G_OCTAVES.map((f) => `(6:${f} 5:x 4:${f + 2})`);
  const down = [...up].reverse().slice(1);
  const all = [...up, ...down];
  return music([`q ${all.slice(0, 4).join(' ')}`, `q ${all.slice(4, 8).join(' ')}`, `q ${all.slice(8, 12).join(' ')}`, `q ${all.slice(12, 15).join(' ')} r`]);
}

/** Thirds in G major on strings 3 and 2, as [string 3 fret, string 2 fret]. */
const THIRDS: Array<[number, number]> = [[0, 0], [2, 1], [4, 3], [5, 5], [7, 7], [9, 8], [11, 10], [12, 12]];
/** Sixths in G major on strings 3 and 1 (string 2 muted). */
const SIXTHS: Array<[number, number]> = [[4, 3], [5, 5], [7, 7], [9, 8], [11, 10], [12, 12]];

const third = ([a, b]: [number, number], slide = ''): string => `(3:${a}${slide} 2:${b}${slide})`;
const sixth = ([a, b]: [number, number]): string => `(3:${a} 2:x 1:${b})`;

function thirdsQuarters(): string {
  const all = [...THIRDS, ...[...THIRDS].reverse().slice(1)].map((p) => third(p));
  return music([`q ${all.slice(0, 4).join(' ')}`, `q ${all.slice(4, 8).join(' ')}`, `q ${all.slice(8, 12).join(' ')}`, `q ${all.slice(12, 15).join(' ')} r`]);
}

function thirdsEighths(): string {
  const down = [...THIRDS].reverse().slice(1).map((p) => third(p));
  return music([`e ${THIRDS.map((p) => third(p)).join(' ')}`, `e ${down.join(' ')} r`]);
}

function sixthsQuarters(): string {
  const all = [...SIXTHS, ...[...SIXTHS].reverse().slice(1)].map(sixth);
  return music([`q ${all.slice(0, 4).join(' ')}`, `q ${all.slice(4, 8).join(' ')}`, `q ${all.slice(8, 11).join(' ')} r`]);
}

export const SHAPES: TechniqueExercise[] = [
  {
    id: 'tech-octaves',
    title: 'Octave Shapes with Muting',
    hand: 'both',
    level: 6,
    skill: 'shapes',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 112 },
    teaches: ['octaves', 'muting', 'jazz and rock melody'],
    summary: 'A melody doubled in octaves, with the string in between silenced: the big, round sound of jazz and rock leads.',
    steps: [
      'Root on string 6 with finger 1, the octave two frets higher on string 4 with finger 3 or 4: string 6 fret 3 (G) with string 4 fret 5 (G).',
      'Root on string 5, octave on string 3: string 5 fret 3 (C) with string 3 fret 5 (C).',
      'From string 4 to 2 and from string 3 to 1 the octave is three frets higher, because of the B string: string 4 fret 5 (G) with string 2 fret 8 (G), string 3 fret 5 (C) with string 1 fret 8 (C).',
      'Finger 1 lies lightly against the string in between to mute it, so you can strum all three strings or pick both notes together.',
      'Play the G major scale in octaves on strings 6 and 4, then make up a short melody of your own.',
    ],
    feel: 'One fat, clear note in two octaves at once. You can strum through three strings and the middle one makes no sound at all.',
    mistakes: [
      { watch: 'the muted middle string sounding', fix: 'Let the underside of finger 1 touch the middle string lightly. Strum slowly and listen for it.' },
      { watch: 'open strings ringing under the octave', fix: 'Rest the picking palm on the low strings and let the fretting fingers touch the strings above the shape.' },
      { watch: 'finger 1 pressing the middle string down instead of touching it', fix: 'Touch, do not press: a pressed middle string sounds a note; a touched one stays silent.' },
    ],
    parts: [
      {
        id: 'four-shapes',
        name: 'The four shapes',
        note: 'Strings 6-4 and 5-3 (two frets apart), then 4-2 and 3-1 (three frets apart).',
        tab: music(['q (6:3 5:x 4:5) (6:3 5:x 4:5) (5:3 4:x 3:5) (5:3 4:x 3:5)', 'q (4:5 3:x 2:8) (4:5 3:x 2:8) (3:5 2:x 1:8) (3:5 2:x 1:8)']),
        check: { kind: 'onsets' },
      },
      { id: 'g-major', name: 'G major in octaves', note: 'Strings 6 and 4, up and back.', tab: octaveScale(), check: { kind: 'onsets' } },
    ],
  },
  {
    id: 'tech-double-stops',
    title: 'Double Stops: Thirds and Sixths',
    hand: 'both',
    level: 5,
    skill: 'shapes',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 100 },
    teaches: ['double stops', 'thirds and sixths', 'harmonising a melody'],
    summary: 'Two notes at once in sweet thirds and sixths: the sound of country, soul and harmonised melodies.',
    steps: [
      'Thirds in G major on strings 3 and 2, both strings together, moving up the neck: the open strings 3 and 2 (G and B), then string 3 fret 2 (A) with string 2 fret 1 (C), and on up to string 3 fret 12 (G) with string 2 fret 12 (B).',
      'Then sixths on strings 3 and 1, with string 2 muted by the underside of the finger on string 3: from string 3 fret 4 (B) with string 1 fret 3 (G) up to string 3 fret 12 (G) with string 1 fret 12 (E).',
      'Pick both strings at once, or pluck with thumb and finger.',
      'Quarter notes, then eighths, then slide between neighbouring pairs.',
    ],
    feel: 'Two notes that blend into one sweet sound, both equally loud, moving together like two singers in harmony.',
    mistakes: [
      { watch: 'string 2 ringing during the sixths', fix: 'Let the finger on string 3 lean slightly so its underside touches string 2.' },
      { watch: 'one note of the pair louder than the other', fix: 'Strike both strings with one even stroke, or pinch them equally with thumb and finger.' },
      { watch: 'pressing hard while sliding between pairs', fix: 'Ease the pressure while you slide, keep the fingers in contact, and press again on arrival.' },
    ],
    parts: [
      { id: 'thirds', name: 'Thirds', note: 'Strings 3 and 2, up the neck and back.', tab: thirdsQuarters(), check: { kind: 'onsets' } },
      { id: 'thirds-eighths', name: 'Thirds in eighths', tab: thirdsEighths(), check: { kind: 'onsets' } },
      { id: 'sixths', name: 'Sixths', note: 'Strings 3 and 1, string 2 muted (x).', tab: sixthsQuarters(), check: { kind: 'onsets' } },
      {
        id: 'slides',
        name: 'Sliding thirds',
        note: 'Slide both fingers together between neighbouring pairs.',
        tab: music([`q ${third([4, 3])} ${third([5, 5], 's')} ${third([7, 7], 's')} ${third([9, 8], 's')}`, `q ${third([7, 7], 's')} ${third([5, 5], 's')} h ${third([4, 3], 's')}`]),
        check: { kind: 'onsets' },
      },
    ],
  },
  {
    id: 'tech-triad-inversions',
    title: 'Triad Inversions on the Top Strings',
    hand: 'fretting',
    level: 6,
    skill: 'shapes',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 96 },
    teaches: ['triads', 'inversions', 'voice leading on the top strings'],
    summary: 'Three small shapes for every major chord on the top three strings, and how to move between them without moving the hand.',
    steps: [
      'Major triads on strings 3, 2 and 1, three shapes for each chord up the neck.',
      'C: C (xxx553) root position, C (xxx988) first inversion (E at the bottom), C (x-x-x-12-13-12) second inversion (G at the bottom).',
      'F: F (xxx211) first inversion, F (xxx565) second inversion, F (x-x-x-10-10-8) root position. G: G (xxx433) first inversion, G (xxx787) second inversion, G (x-x-x-12-12-10) root position.',
      'Strum strings 3 to 1 only, one chord per beat, naming the top note.',
      'Then join C, F, G and C by the nearest shapes, C (xxx553), F (xxx565), G (xxx787), C (xxx988): the top note climbs G, A, B, C while the hand barely moves.',
    ],
    feel: 'Small, bright, clear chords, with the top note singing a little melody as you change shape.',
    mistakes: [
      { watch: 'strumming strings 4 to 6 as well', fix: 'Start each strum on string 3, with a small stroke. Rest the picking palm on the low strings if it helps.' },
      { watch: 'one string of the triad dead under a finger', fix: 'Pick the three strings one by one to find the dead one, then arch that finger or roll it slightly.' },
      { watch: 'hunting for each shape instead of hearing the top note move', fix: 'Sing the top note as you play. The shapes follow the melody; you will start to hear where the next one is.' },
    ],
    parts: [
      {
        id: 'three-shapes',
        name: 'Three shapes each',
        note: 'Each chord’s three shapes, low to high on the neck. C starts in root position; F and G start in first inversion.',
        time: '3/4',
        tab: music([
          '"C=xxx553" q D "C/E=xxx988" D "C/G=x-x-x-12-13-12" D',
          '"F/A=xxx211" q D "F/C=xxx565" D "F=x-x-x-10-10-8" D',
          '"G/B=xxx433" q D "G/D=xxx787" D "G=x-x-x-12-12-10" D',
        ]),
        check: { kind: 'onsets' },
      },
      {
        id: 'nearest',
        name: 'Nearest shapes',
        note: 'C, F, G, C: the top note climbs G, A, B, C.',
        tab: music(['"C=xxx553" q D "F/C=xxx565" D "G/D=xxx787" D "C/E=xxx988" D', '%']),
        check: { kind: 'onsets' },
      },
    ],
  },
];

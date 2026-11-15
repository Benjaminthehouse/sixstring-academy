/** Setting up: tuning by ear and the capo. */
import { music } from '../generate';
import type { TechniqueExercise } from '../types';

const TUNER = { route: 'tuner', label: 'Open the tuner', icon: 'Gauge' };

export const SETUP: TechniqueExercise[] = [
  {
    id: 'tech-tune-by-ear',
    title: 'Tuning by Ear (Fifth-Fret Method)',
    hand: 'both',
    level: 2,
    skill: 'setup',
    mode: 'guide',
    tempo: { start: 60, step: 0, goal: 60 },
    teaches: ['tuning by ear', 'hearing beats', 'unisons'],
    summary: 'Tune every string from the one below it by ear, so you can tune anywhere and hear when a guitar is out.',
    steps: [
      'Tune string 6 first, with the tuner or the reference E below.',
      'Play string 6 fret 5 (A), then the open string 5 (A). Turn the string 5 peg until the two match.',
      'The same for the next strings: string 5 fret 5 (D) for the open string 4 (D), string 4 fret 5 (G) for the open string 3 (G).',
      'String 3 is the exception: use string 3 fret 4 (B), not fret 5, for the open string 2 (B).',
      'Then string 2 fret 5 (E) for the open string 1 (E).',
      'Listen for the wobble (beats) when the two notes sound together: it slows down as they get closer and stops when they match.',
      'Always tune up to the note: if a string is sharp, loosen it below the note and come back up. Check with a G (320003) chord and the tuner.',
    ],
    feel: 'The two notes melt into one, with no wobble. The G chord at the end sounds sweet rather than sour.',
    mistakes: [
      { watch: 'using fret 5 on string 3 (string 3 to string 2 needs fret 4)', fix: 'Remember the one exception: from string 3 to string 2 use fret 4, because those two strings are only four frets apart.' },
      { watch: 'tuning down to the note instead of up to it', fix: 'If you go past the note, loosen the string clearly below it and come back up slowly. Strings hold their pitch better that way.' },
      { watch: 'turning the wrong peg: pluck while you turn and follow the pitch', fix: 'Keep the string ringing while you turn, and follow its pitch with your ears. If nothing changes, it is the wrong peg.' },
      { watch: 'winding a string far above its note, which can break it: turn slowly', fix: 'Turn in small amounts and pluck again after each one. A string that sounds very high is close to breaking: loosen it.' },
    ],
    checklist: [
      'String 6 tuned to the tuner or the reference E',
      'Fret 5 for strings 5, 4 and 3; fret 4 on string 3 for string 2; fret 5 again for string 1',
      'Listen for the wobble to stop',
      'Tune up to each note, never down to it',
      'Check with a G chord and the tuner',
    ],
    reference: { midi: 40, label: 'Reference low E' },
    tools: [TUNER],
    parts: [
      {
        id: 'string-by-string',
        name: 'String by string',
        note: 'Each fretted note, then the open string it tunes. Then a G chord to check.',
        tab: music(['h 6:5 5:0', 'h 5:5 4:0', 'h 4:5 3:0', 'h 3:4 2:0', 'h 2:5 1:0', '"G=320003" w D']),
        check: { kind: 'notes', intonation: true },
      },
    ],
  },
  {
    id: 'tech-capo',
    title: 'Using a Capo',
    hand: 'both',
    level: 3,
    skill: 'setup',
    mode: 'guide',
    tempo: { start: 60, step: 0, goal: 60 },
    teaches: ['using a capo', 'transposing with the same shapes', 'choosing a singing key'],
    summary: 'A capo moves the shapes you know into any key: the same fingers, a higher sound.',
    steps: [
      'Clip the capo straight across the neck, just behind a fret wire (on the headstock side, as close to the wire as it sits).',
      'Use just enough pressure to stop buzzing. A capo can pull strings sharp, so check every string with the tuner after clipping it on.',
      'With the capo at fret 2, play G (320003), C (x32010) and D (xx0232): the shapes keep their names but sound a whole step higher, as A, D and E.',
      'With the capo at fret 5 the same shapes sound as C, F and G. Each fret of capo raises everything one half step.',
      'Play one song’s chords at three capo positions and choose the one that suits your voice.',
    ],
    feel: 'The familiar shapes, every string clear, and the whole song suddenly brighter and higher. No buzz and no sour strings.',
    mistakes: [
      { watch: 'the capo in the middle of the fret space or on top of the fret wire (buzzing or sharp notes)', fix: 'Move it right up behind the fret wire, on the headstock side, and clip it straight.' },
      { watch: 'a capo clamped so hard that it bends the strings sharp', fix: 'Loosen it until the strings just stop buzzing; then retune if needed.' },
      { watch: 'forgetting to retune after clipping it on', fix: 'Make the tuner the first thing you do after every capo change.' },
      { watch: 'telling other players the shape name instead of the chord that actually sounds', fix: 'Say both: "G shape, capo 2, so it sounds in A". The other players need the sounding chord.' },
    ],
    checklist: [
      'Capo straight, just behind the fret wire',
      'Just enough pressure to stop buzzing',
      'Retune after clipping it on',
      'Shapes keep their names; the sound moves up a half step per fret',
    ],
    tools: [TUNER],
    parts: [
      {
        id: 'capo-2',
        name: 'Capo at fret 2',
        note: 'G, C and D shapes, sounding A, D and E.',
        capo: 2,
        tab: music(['"A=320003" q D D D D', '"D=x32010" q D D D D', '"E=xx0232" q D D D D', '"A=320003" q D D D D']),
        check: { kind: 'none', why: 'With a capo, check each string with the tuner instead.' },
      },
      {
        id: 'capo-5',
        name: 'Capo at fret 5',
        note: 'The same shapes, sounding C, F and G.',
        capo: 5,
        tab: music(['"C=320003" q D D D D', '"F=x32010" q D D D D', '"G=xx0232" q D D D D', '"C=320003" q D D D D']),
        check: { kind: 'none', why: 'With a capo, check each string with the tuner instead.' },
      },
    ],
  },
];

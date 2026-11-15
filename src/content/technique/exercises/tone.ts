/** Tone: dynamics and the three kinds of harmonics. */
import { music, times } from '../generate';
import type { TechniqueExercise } from '../types';

const ARP = 'e 5:0 3:2 2:1 1:0 5:0 3:2 2:1 1:0';

/** Natural harmonics on all six strings over one fret: two bars. */
function harmonicsAt(fret: number): string[] {
  return [`q 6:<${fret}> 5:<${fret}> 4:<${fret}> 3:<${fret}>`, `q 2:<${fret}> 1:<${fret}> h r`];
}

export const TONE: TechniqueExercise[] = [
  {
    id: 'tech-dynamics',
    title: 'Dynamic Control',
    hand: 'picking',
    level: 5,
    skill: 'tone',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 80 },
    teaches: ['dynamics', 'tone control', 'expression'],
    summary: 'Five clear levels from very soft to very loud, and smooth swells between them: music, not just notes.',
    steps: [
      'One arpeggio pattern on Am (x02210): p on string 5, then strings 3, 2 and 1.',
      'One bar each at pp (very soft), p (soft), mf (medium), f (loud) and ff (very loud).',
      'Then a crescendo (getting louder) over four bars and a diminuendo (getting softer) over four bars.',
      'With the microphone on, the level meter shows each bar.',
    ],
    feel: 'Five steps you can clearly hear apart, with the tempo exactly the same in all of them. The swell is smooth, with no sudden jumps.',
    mistakes: [
      { watch: 'all levels sounding the same', fix: 'Exaggerate: make pp barely audible and ff as loud as you can play cleanly. Then fill in the middle.' },
      { watch: 'speeding up when getting louder', fix: 'Keep the click on and listen for it most during the crescendo; loud is not fast.' },
    ],
    parts: [
      {
        id: 'five-levels',
        name: 'Five levels',
        note: 'pp, p, mf, f, ff: one bar each.',
        tab: music([`"Am=x02210" ^"pp" ${ARP}`, `^"p" ${ARP}`, `^"mf" ${ARP}`, `^"f" ${ARP}`, `^"ff" ${ARP}`]),
        check: { kind: 'level', shape: 'steps' },
      },
      {
        id: 'swell',
        name: 'Swell',
        note: 'Four bars getting louder, four bars getting softer.',
        tab: music([`"Am=x02210" ^"cresc." ${ARP}`, ...times(ARP, 3), `^"dim." ${ARP}`, ...times(ARP, 3)]),
        check: { kind: 'level', shape: 'swell' },
      },
    ],
  },
  {
    id: 'tech-natural-harmonics',
    title: 'Natural Harmonics',
    hand: 'both',
    level: 4,
    skill: 'tone',
    mode: 'ladder',
    tempo: { start: 60, step: 4, goal: 72 },
    teaches: ['natural harmonics', 'the harmonic series', 'tuning by ear'],
    summary: 'Bell-like notes from a light touch over the fret wire, and a first look at the harmonic series.',
    steps: [
      'Touch the string lightly, directly over the fret wire. Do not press it down.',
      'Pick, then lift the touching finger straight away.',
      'Over fret 12 the harmonic sounds an octave above the open string, over fret 7 an octave and a fifth, over fret 5 two octaves.',
      'All six strings at frets 12, 7 and 5.',
    ],
    feel: 'A clear, chiming, bell-like note that keeps ringing after you lift the finger. Fret 5 is the hardest to make ring: aim exactly over the wire.',
    mistakes: [
      { watch: 'touching between the frets instead of over the wire', fix: 'Line your fingertip up with the metal wire itself, not the space where you would fret a note.' },
      { watch: 'pressing the string down', fix: 'Touch as lightly as a feather: the string should not reach the fret.' },
      { watch: 'leaving the finger on too long', fix: 'Lift the finger just after you pick, so the harmonic can ring on.' },
    ],
    parts: [
      { id: 'fret-12', name: 'Fret 12', tab: music(harmonicsAt(12)), check: { kind: 'notes' } },
      { id: 'fret-7', name: 'Fret 7', tab: music(harmonicsAt(7)), check: { kind: 'notes' } },
      { id: 'fret-5', name: 'Fret 5', tab: music(harmonicsAt(5)), check: { kind: 'notes' } },
    ],
  },
  {
    id: 'tech-artificial-harmonics',
    title: 'Artificial (Harp) Harmonics',
    hand: 'both',
    level: 8,
    skill: 'tone',
    mode: 'ladder',
    tempo: { start: 50, step: 6, goal: 92 },
    teaches: ['artificial harmonics', 'harp harmonics', 'classical colour'],
    summary: 'A harmonic on any fretted note, made by the picking hand twelve frets higher, and the harp effect it allows.',
    steps: [
      'Fret a note, for example string 5 fret 3 (C).',
      'With the picking-hand index finger, touch the same string 12 frets higher (over fret 15), exactly over the wire.',
      'Pluck behind it with a (or with the thumb), then lift the index finger.',
      'For the harp effect, alternate harmonics and ordinary notes on neighbouring strings of a chord.',
    ],
    feel: 'The harmonic sounds an octave above the fretted note, soft and bell-like. In the harp pattern, the harmonics and plain notes ring together like a harp.',
    mistakes: [
      { watch: 'touching at the wrong distance (count exactly 12 frets)', fix: 'Count up from the fretted note: fret 3 means touch over fret 15. Move the touch point if you change fret.' },
      { watch: 'harmonics much quieter than ordinary notes', fix: 'Pluck the harmonics a little more firmly and the ordinary notes a little softer, so they match.' },
    ],
    parts: [
      {
        id: 'one-harmonic',
        name: 'One harmonic',
        note: 'The plain note, then its harmonic, on C and then E.',
        tab: music(['"C=x32010" q 5:3 5:3{ah} 5:3 5:3{ah}', 'q 4:2 4:2{ah} 4:2 4:2{ah}']),
        check: { kind: 'notes' },
      },
      {
        id: 'harp',
        name: 'Harp pattern',
        note: 'Harmonic, plain note, harmonic, plain note across the C chord.',
        tab: music(times('"C=x32010" e 5:3{ah} 3:0 4:2{ah} 2:1 3:0{ah} 1:0 2:1{ah} 1:0', 2)),
        check: { kind: 'notes' },
      },
    ],
  },
  {
    id: 'tech-pinch-harmonics',
    title: 'Pinch Harmonics',
    hand: 'both',
    level: 7,
    skill: 'tone',
    mode: 'ladder',
    tempo: { start: 60, step: 0, goal: 60 },
    teaches: ['pinch harmonics', 'rock lead colour', 'picking-hand control'],
    summary: 'The rock "squeal": the edge of the thumb brushes the string just after the pick.',
    steps: [
      'Choke up on the pick so the edge of your thumb sits right next to its tip.',
      'Pick string 3 fret 7 (D) so the edge of the thumb brushes the string just after the pick.',
      'Move the picking point toward and away from the neck to find the squeal; each spot gives a different harmonic.',
      'It is easiest with an overdriven tone.',
    ],
    feel: 'A high, whistling squeal jumps out of the note. When you find the spot it happens almost every time.',
    mistakes: [
      { watch: 'the thumb muting the note completely', fix: 'The thumb only grazes the string for an instant. Turn the pick slightly so the thumb follows rather than leads.' },
      { watch: 'searching in one spot only', fix: 'Move the picking hand a centimetre at a time between the neck pickup and the bridge, a few picks at each spot.' },
    ],
    parts: [
      {
        id: 'squeal',
        name: 'Find the squeal',
        note: 'P.H. on every note; move the picking point a little each bar.',
        tab: music(['^"P.H." q 3:7 3:7 3:7 3:7', 'q 3:7 3:7 3:7 3:7']),
        check: { kind: 'none', why: 'A pinch harmonic sounds a different overtone each time, so there is no single pitch to check. Listen for the squeal.' },
      },
    ],
  },
];

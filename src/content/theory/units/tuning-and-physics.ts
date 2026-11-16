/**
 * Theory Path, unit 43: Tuning, harmonics and the physics of the string. Written from the syllabus
 * entries in `src/content/plan/theory-path.json` (unit `tuning-and-physics`), one lesson per entry,
 * in order: each lesson opens with its "on the guitar" picture, asks the planned exercises, and
 * turns every planned fact into a review card.
 *
 * Every number the text quotes (frequencies, harmonics, cents, fret distances, retuning steps) is
 * recomputed from the engines in `tuning-and-physics.test.ts`.
 *
 * What the lesson engine cannot draw or play is taught another way:
 * - No figure draws a vibrating string, a tuning peg, a saddle or a to-scale ruler: fretboard
 *   figures mark the nodes and frets, and the words carry the rest.
 * - A lesson `Sound` cannot change brightness or detune a note, so two planned listening questions
 *   could not be played truthfully ("bright or warm tone", "pure or tempered major third"). They
 *   are replaced by questions the synth plays exactly: the pitch of the 3rd harmonic above its
 *   fundamental, and the tempered fifth and major third of the figure. The ideas themselves are
 *   asked without sound too.
 * - A `play-chord` exercise has no tuning, so its chord box is always drawn in standard tuning. The
 *   drop D lesson therefore strums the D5 shape that is the same in both tunings (strings 4 to 2),
 *   and plays the one-finger drop D power chords as a `play-phrase`, which does take a tuning.
 * - The synth plays the pitch of a harmonic as an ordinary note: the sounds are labelled as pitches.
 */
import type { Lesson, TabNote, Unit } from '@/lessons';

const U = 'tuning-and-physics';

/** Open strings, string 6 to 1, as a quick arpeggio. */
const openStrings = (duration = 'e'): TabNote[] => [6, 5, 4, 3, 2, 1].map((string) => ({ string, fret: 0, duration }));

/** The one-finger drop D power chords: strings 6, 5, 4 open (D5), then all three at fret 2 (E5). */
export const DROP_D_POWER: TabNote[] = [
  { string: 6, fret: 0, duration: 'q' }, { string: 5, fret: 0, duration: 'q' }, { string: 4, fret: 0, duration: 'h' },
  { string: 6, fret: 2, duration: 'q' }, { string: 5, fret: 2, duration: 'q' }, { string: 4, fret: 2, duration: 'h' },
];

const frequencyAndConcertPitch: Lesson = {
  id: 'frequency-and-concert-pitch',
  title: 'Frequency and concert pitch',
  teaches: 'Concert pitch fixes A4 at 440 Hz, and every octave doubles the frequency.',
  minutes: 3,
  skill: `theory:${U}:frequency-and-concert-pitch`,
  steps: [
    {
      type: 'card',
      title: 'One agreed A',
      body: 'Most musicians tune to one reference, {t:concert-pitch}: {n:A4} = **440 {t:hertz|Hz}**. That {n:A}, the one above {t:middle-c|middle C}, vibrates 440 times a second. On your guitar it is string 1, fret 5.',
      figure: {
        kind: 'fretboard',
        frets: [0, 5],
        dots: [{ string: 1, fret: 5, note: 'A4', role: 'root' }],
        caption: 'String 1, fret 5: {n:A4}, 440 Hz, the note tuners are set by.',
      },
    },
    {
      type: 'card',
      title: 'Octaves double',
      body: 'Go up an {t:octave} and the frequency doubles; go down one and it halves. {n:A4} is 440 Hz, {n:A3} is 220 Hz, and your open string 5, {n:A2}, is 110 Hz.',
      figure: { kind: 'audio', sound: { kind: 'notes', notes: ['A2', 'A3', 'A4'], tempo: 70 }, label: 'Hear A2, A3 and A4' },
    },
    {
      type: 'choice',
      prompt: 'What frequency is {n:A3}, one octave below {n:A4}?',
      options: [
        { text: '110 Hz', why: 'That is {n:A2}, two octaves down: the open string 5.' },
        { text: '220 Hz', correct: true },
        { text: '330 Hz', why: 'That is three times 110 Hz: about {n:E4}, not an {n:A}.' },
        { text: '440 Hz', why: 'That is {n:A4} itself.' },
      ],
      shuffle: false,
      explain: 'One octave down halves the frequency: 440 ÷ 2 = 220 Hz.',
      fact: 'physics-octave-doubles',
    },
    {
      type: 'true-false',
      statement: '{n:A5}, one octave above {n:A4}, vibrates at 880 Hz.',
      answer: true,
      explain: 'One octave up doubles the frequency: 440 × 2 = 880 Hz. On the guitar that is string 1, fret 17.',
      fact: 'physics-octave-doubles',
    },
    {
      type: 'card',
      title: 'Your open strings in hertz',
      body: 'Every other note follows from {n:A4} = 440. From string 6 to string 1 the open strings sound about 82.4, 110, 146.8, 196, 246.9 and 329.6 Hz. A {t:tuner} compares your string with these numbers.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        dots: [
          { string: 6, fret: 0, note: 'E2' }, { string: 5, fret: 0, note: 'A2' }, { string: 4, fret: 0, note: 'D3' },
          { string: 3, fret: 0, note: 'G3' }, { string: 2, fret: 0, note: 'B3' }, { string: 1, fret: 0, note: 'E4' },
        ],
        caption: 'Strings 6 to 1: 82.4, 110, 146.8, 196, 246.9 and 329.6 Hz.',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each open string with its frequency.',
      pairs: [
        { left: 'String 6 ({n:E})', right: '82.4 Hz' },
        { left: 'String 5 ({n:A})', right: '110 Hz' },
        { left: 'String 3 ({n:G})', right: '196 Hz' },
        { left: 'String 1 ({n:E})', right: '329.6 Hz' },
      ],
      explain: 'The open strings run 82.4, 110, 146.8, 196, 246.9 and 329.6 Hz from string 6 to string 1. String 1 is exactly four times string 6: two octaves.',
      fact: 'physics-open-string-hz',
    },
    {
      type: 'choice',
      prompt: 'A tuner set to {n:A4} = 440 reads 112 Hz on your open string 5. What should you do?',
      options: [
        { text: 'Loosen it a little: it is sharp', correct: true },
        { text: 'Tighten it a little: it is flat', why: 'Flat would be below 110 Hz. 112 Hz is above, so the string is sharp.' },
        { text: 'Nothing: it is in tune', why: 'In tune is 110 Hz. 112 Hz is about a third of a half step too high.' },
      ],
      shuffle: false,
      explain: 'The open {n:A} string should read 110 Hz. 112 Hz is too high, so it is sharp: loosen it until it reads 110.',
    },
    {
      type: 'choice',
      prompt: 'The open string 6, {n:E2}, is 82.4 Hz. What is the {n:E} at string 6, fret 12?',
      options: [
        { text: '41.2 Hz', why: 'That is an octave below the open string, lower than the guitar can play.' },
        { text: '92.4 Hz', why: 'An octave doubles the frequency; it does not add 10 Hz.' },
        { text: '164.8 Hz', correct: true },
        { text: '329.6 Hz', why: 'That is two octaves up: the open string 1.' },
      ],
      shuffle: false,
      explain: 'Fret 12 is one octave up, so the frequency doubles: 82.4 × 2 = 164.8 Hz.',
      fact: 'physics-octave-doubles',
    },
    {
      type: 'play-note',
      prompt: 'Play {n:A4}, the note an orchestra tunes to: string 1, fret 5.',
      note: 'A4',
      octave: 'exact',
      where: { string: 1, fret: 5 },
      explain: 'String 1, fret 5 is {n:A4}: 440 vibrations a second when your guitar is tuned to concert pitch.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap {n:A4}, the 440 Hz note an orchestra tunes to, on string 1.',
        find: { note: 'A4' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 7],
        strings: [1],
        explain: 'String 1, fret 5: {n:A4}, 440 Hz.',
      },
    },
  ],
  facts: [
    {
      id: 'physics-concert-pitch',
      front: 'What is concert pitch?',
      back: '{n:A4} = 440 Hz: the {n:A} above middle C vibrates 440 times a second. On the guitar it is string 1, fret 5.',
      ask: {
        type: 'choice',
        prompt: 'Concert pitch tunes which note to 440 Hz?',
        options: [
          { text: '{n:A4}', correct: true },
          { text: '{n:A3}', why: '{n:A3} is an octave lower: 220 Hz.' },
          { text: '{n:C4}', why: 'Middle C is about 261.6 Hz.' },
          { text: '{n:E4}', why: 'The open string 1 is about 329.6 Hz.' },
        ],
        explain: 'Concert pitch is {n:A4} = 440 Hz: string 1, fret 5 on the guitar.',
      },
    },
    {
      id: 'physics-octave-doubles',
      front: 'What happens to the frequency each octave up?',
      back: 'It doubles: {n:A2} (open string 5) is 110 Hz, {n:A3} 220 Hz and {n:A4} 440 Hz.',
    },
    {
      id: 'physics-open-string-hz',
      front: 'About what frequencies do the open strings sound, from string 6 to string 1?',
      back: 'About 82.4, 110, 146.8, 196, 246.9 and 329.6 Hz.',
    },
  ],
};

const whatSetsThePitch: Lesson = {
  id: 'what-sets-the-pitch',
  title: 'Length, tension and mass',
  teaches: 'A string sounds higher when it is shorter, tighter or lighter.',
  minutes: 3,
  skill: `theory:${U}:what-sets-the-pitch`,
  steps: [
    {
      type: 'card',
      title: 'Length',
      body: 'Three things set a string\'s pitch. The first is **length**: a shorter string vibrates faster. Press string 6 at fret 12 and only half of it vibrates. Half the length, twice the frequency: one octave up, {n:E2} to {n:E3}.',
      figure: {
        kind: 'fretboard',
        frets: [0, 12],
        dots: [{ string: 6, fret: 0, note: 'E2', role: 'root' }, { string: 6, fret: 12, note: 'E3', role: 'root' }],
        caption: 'String 6, open and at fret 12: half the length, one octave up.',
      },
    },
    {
      type: 'choice',
      prompt: 'You fret a string at fret 12, so only half of it vibrates. What happens to its frequency?',
      options: [
        { text: 'It doubles: one octave up', correct: true },
        { text: 'It halves: one octave down', why: 'A shorter string vibrates faster, not slower.' },
        { text: 'It stays the same', why: 'Length sets the frequency: half the length vibrates twice as fast.' },
      ],
      shuffle: false,
      explain: 'Frequency goes up as the vibrating length goes down, in proportion: half the length gives twice the frequency.',
      fact: 'physics-length-octave',
    },
    {
      type: 'card',
      title: 'Tension',
      body: 'The second is **tension**: how tightly the string is pulled. Turn a {t:tuning-peg} to tighten it and the pitch rises; loosen it and the pitch falls. Tuning is nothing more than setting the tension.',
      figure: { kind: 'audio', sound: { kind: 'notes', notes: ['E2', 'F2', 'F#2'], tempo: 60 }, label: 'Tighter each time', caption: 'String 6 tightened a little at a time sounds {n:E}, then {n:F}, then {n:F#}.' },
    },
    {
      type: 'choice',
      prompt: 'To make a string sound higher without fretting it, do you tighten it or loosen it?',
      options: [{ text: 'Tighten it', correct: true }, { text: 'Loosen it', why: 'A looser string vibrates more slowly, so it sounds lower.' }],
      shuffle: false,
      explain: 'More tension makes the string vibrate faster, so the pitch rises.',
      fact: 'physics-three-factors',
    },
    {
      type: 'card',
      title: 'Tension works slowly',
      body: 'Frequency grows only with the **square root** of the tension. Double the tension and the pitch rises six half steps, a {t:tritone}, not an octave. Raising a string an octave by tension alone would take **four times** the pull.',
    },
    {
      type: 'true-false',
      statement: 'Doubling the tension of a string raises it by an octave.',
      answer: false,
      explain: 'Frequency follows the square root of the tension: double the tension and the frequency rises only about 1.41 times, six half steps. An octave takes four times the tension.',
      fact: 'physics-tension-root',
    },
    {
      type: 'card',
      title: 'Mass',
      body: 'The third is **mass**: a heavier string vibrates more slowly. Strings 6 and 1 are the same length and pulled with roughly the same tension, yet string 1 sounds two octaves higher, because it is so much lighter.',
      figure: { kind: 'audio', sound: { kind: 'notes', notes: ['E2', 'E4'], tempo: 60 }, label: 'Hear string 6, then 1' },
    },
    {
      type: 'choice',
      prompt: 'Why are the low strings thicker?',
      options: [
        { text: 'Extra mass gives a low pitch at a firm tension', correct: true },
        { text: 'To make them louder', why: 'Thickness sets the pitch range. Loudness comes from how hard you play.' },
        { text: 'To make them easier to press', why: 'Thick strings are harder to press, not easier.' },
      ],
      explain: 'A thin string tuned down to low {n:E} would be so slack that it flopped and buzzed. A heavier string reaches that low pitch at a tension like the other strings.',
      fact: 'physics-three-factors',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each change with what it does to the pitch.',
      pairs: [
        { left: 'Fret it higher up', right: 'Shorter: higher' },
        { left: 'Tighten the peg', right: 'Tighter: higher' },
        { left: 'Loosen the peg', right: 'Looser: lower' },
        { left: 'Use a thicker string', right: 'Heavier: lower' },
      ],
      explain: 'Shorter, tighter or lighter raises the pitch; longer, looser or heavier lowers it.',
      fact: 'physics-three-factors',
    },
    {
      type: 'play-note',
      prompt: 'Halve string 6: play it at fret 12.',
      note: 'E3',
      octave: 'exact',
      where: { string: 6, fret: 12 },
      explain: 'Fret 12 leaves half the string vibrating: {n:E3}, 164.8 Hz, twice the frequency of the open string.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the place on string 6 that leaves exactly half the string vibrating.',
        find: { note: 'E3' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 12],
        strings: [6],
        explain: 'Fret 12 sits halfway along the string: {n:E3}, one octave above the open string.',
      },
    },
  ],
  facts: [
    {
      id: 'physics-three-factors',
      front: 'What three changes make a string sound higher?',
      back: 'Making it shorter, tighter or lighter.',
      ask: {
        type: 'choice',
        prompt: 'Which change makes a string sound lower?',
        options: [
          { text: 'Loosening it', correct: true },
          { text: 'Fretting it higher up', why: 'That shortens the string, so it sounds higher.' },
          { text: 'Using a lighter string', why: 'A lighter string vibrates faster, so it sounds higher.' },
        ],
        explain: 'Less tension makes the string vibrate more slowly: the pitch falls.',
      },
    },
    {
      id: 'physics-length-octave',
      front: 'How does a string\'s vibrating length set its frequency?',
      back: 'In inverse proportion: half the length gives twice the frequency, one octave up. That is why fret 12 sits halfway along the string.',
    },
    {
      id: 'physics-tension-root',
      front: 'How much tension would it take to raise a string an octave by tension alone?',
      back: 'Four times the tension: frequency follows the square root of the tension.',
    },
  ],
};

const theHarmonicSeries: Lesson = {
  id: 'the-harmonic-series',
  title: 'The harmonic series',
  teaches: 'A string sounds whole-number multiples of its fundamental at once, and their mix shapes its tone.',
  minutes: 3,
  skill: `theory:${U}:the-harmonic-series`,
  steps: [
    {
      type: 'card',
      title: 'One note, many pitches',
      body: 'A plucked string vibrates as a whole, giving the pitch you hear: the {t:fundamental}. At the same time it vibrates in halves, thirds, quarters and smaller parts, each a quieter, higher pitch at 2, 3, 4, 5 and more times the frequency. Together they are the {t:harmonic-series}.',
      figure: {
        kind: 'fretboard',
        frets: [0, 12],
        dots: [
          { string: 6, fret: 5, label: '×4', role: 'target' },
          { string: 6, fret: 7, label: '×3', role: 'target' },
          { string: 6, fret: 12, label: '×2', role: 'target' },
        ],
        caption: 'Where string 6 divides: halves at fret 12, thirds at 7, quarters at 5.',
      },
    },
    {
      type: 'card',
      title: 'The series on the low E',
      body: 'On string 6, {n:E2} at 82.4 Hz, harmonic 2 is {n:E3} (164.8 Hz), an octave up. Harmonic 3 is {n:B3} (247.2 Hz), an octave and a fifth. Harmonic 4 is {n:E4} (329.6 Hz), two octaves. Harmonic 5, at 412 Hz, is two octaves and a major third, a little below {n:G#4}.',
      figure: { kind: 'audio', sound: { kind: 'notes', notes: ['E2', 'E3', 'B3', 'E4', 'G#4'], tempo: 70 }, label: 'Hear the nearest notes', caption: 'The nearest fretted notes: {n:G#4} is a shade above harmonic 5.' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each harmonic with its distance above the fundamental.',
      pairs: [
        { left: 'Harmonic 2', right: 'An octave' },
        { left: 'Harmonic 3', right: 'An octave and a fifth' },
        { left: 'Harmonic 4', right: 'Two octaves' },
        { left: 'Harmonic 5', right: '2 octaves + a major 3rd' },
      ],
      explain: '2 times the frequency is an octave, 3 times an octave and a fifth, 4 times two octaves, 5 times two octaves and a major third.',
      fact: 'physics-harmonic-intervals',
    },
    {
      type: 'choice',
      prompt: 'The open string 5, {n:A2}, vibrates at 110 Hz. At what frequency is its 3rd harmonic?',
      options: [
        { text: '165 Hz', why: 'That is 1.5 times. Harmonics are whole-number multiples: 2, 3, 4 times.' },
        { text: '220 Hz', why: 'That is the 2nd harmonic, one octave up.' },
        { text: '330 Hz', correct: true },
        { text: '440 Hz', why: 'That is the 4th harmonic, two octaves up.' },
      ],
      shuffle: false,
      explain: '3 × 110 = 330 Hz, close to {n:E4}: an octave and a fifth above {n:A2}.',
      fact: 'physics-harmonic-series',
    },
    {
      type: 'true-false',
      statement: 'The harmonics of a string are whole-number multiples of its fundamental frequency.',
      answer: true,
      explain: 'A string can only vibrate in whole halves, thirds, quarters and so on, so its harmonics sit at exactly 2, 3, 4 ... times the fundamental.',
      fact: 'physics-harmonic-series',
    },
    {
      type: 'card',
      title: 'The mix is the colour',
      body: 'Every instrument sounds these harmonics, but each in its own balance. Strong upper harmonics sound **bright**; a strong fundamental with weak upper ones sounds **warm**. That balance is a large part of {t:timbre}. Plucking near the bridge boosts the upper harmonics: brighter.',
    },
    {
      type: 'choice',
      prompt: 'A guitar and a flute play the same {n:A4}. What makes them sound different?',
      options: [
        { text: 'A different mix of harmonics', correct: true },
        { text: 'A different fundamental', why: 'Same note, same fundamental: 440 Hz for both.' },
        { text: 'Only how loud they are', why: 'Even at the same volume you can tell them apart.' },
      ],
      explain: 'Both sound 440 Hz plus its harmonics, but in different strengths. That balance is the timbre.',
      fact: 'physics-harmonic-timbre',
    },
    {
      type: 'listen-choice',
      prompt: 'Hear the open low {n:E}, then the pitch of its 3rd harmonic. How far apart are they?',
      sound: { kind: 'notes', notes: ['E2', 'B3'], tempo: 60 },
      options: [{ text: 'An octave' }, { text: 'An octave and a fifth', correct: true }, { text: 'Two octaves' }],
      shuffle: false,
      explain: 'The 3rd harmonic is three times the frequency: {n:E2} to {n:B3}, an octave and a fifth.',
    },
    {
      type: 'choice',
      prompt: 'Which harmonic of the low {n:E} string sounds {n:E4}, two octaves up?',
      options: [
        { text: 'The 2nd', why: 'The 2nd harmonic is one octave up: {n:E3}.' },
        { text: 'The 3rd', why: 'The 3rd harmonic is an octave and a fifth up: {n:B3}.' },
        { text: 'The 4th', correct: true },
        { text: 'The 5th', why: 'The 5th harmonic is two octaves and a major third up, near {n:G#4}.' },
      ],
      shuffle: false,
      explain: 'Two octaves up is four times the frequency: 4 × 82.4 = 329.6 Hz, the {n:E4} of the open string 1.',
      fact: 'physics-harmonic-intervals',
    },
  ],
  facts: [
    {
      id: 'physics-harmonic-series',
      front: 'What is the harmonic series of a string?',
      back: 'Its {t:fundamental} (the pitch you hear) plus quieter overtones at 2, 3, 4, 5 and more times that frequency, all sounding at once.',
    },
    {
      id: 'physics-harmonic-intervals',
      front: 'Name the intervals of harmonics 2, 3, 4 and 5 above the fundamental.',
      back: '2: an octave. 3: an octave and a fifth. 4: two octaves. 5: two octaves and a major third.',
    },
    {
      id: 'physics-harmonic-timbre',
      front: 'What does the balance of the harmonics shape?',
      back: 'The {t:timbre}: much of what makes an instrument sound like itself, bright or warm.',
    },
  ],
};

const naturalHarmonics: Lesson = {
  id: 'natural-harmonics',
  title: 'Natural harmonics on the neck',
  teaches: 'A light touch over a node sounds a harmonic: fret 12 an octave up, 7 an octave and a fifth, 5 two octaves.',
  minutes: 4,
  skill: `theory:${U}:natural-harmonics`,
  steps: [
    {
      type: 'card',
      title: 'Touch, do not press',
      body: 'Rest a fingertip on string 6 directly over the fret 12 wire, without pressing it down, and pluck. You hear a bell-like {t:natural-harmonic}. The light touch stops the whole string from swinging but lets the halves ring, because fret 12 is a {t:node}: a point that stays still.',
      figure: {
        kind: 'fretboard',
        frets: [0, 12],
        dots: [
          { string: 6, fret: 5, label: '×4', role: 'target' },
          { string: 6, fret: 7, label: '×3', role: 'target' },
          { string: 6, fret: 12, label: '×2', role: 'target' },
        ],
        caption: 'String 6 harmonics: {n:E4} at fret 5, {n:B3} at fret 7, {n:E3} at fret 12.',
      },
      tip: 'Touch right above the fret wire, not between the frets, and lift the finger just after you pluck.',
    },
    {
      type: 'card',
      title: 'Three harmonics',
      body: 'Fret 12 halves the string: an octave above the open string, {n:E3} on string 6. Fret 7 is a third of the way along: an octave and a fifth, {n:B3}. Fret 5 is a quarter of the way: two octaves, {n:E4}.',
      figure: { kind: 'audio', sound: { kind: 'notes', notes: ['E3', 'B3', 'E4'], tempo: 70 }, label: 'Hear their pitches' },
    },
    {
      type: 'choice',
      prompt: 'Which fret gives a harmonic two octaves above the open string?',
      options: [
        { text: 'Fret 5', correct: true },
        { text: 'Fret 7', why: 'Fret 7 divides the string in thirds: an octave and a fifth.' },
        { text: 'Fret 12', why: 'Fret 12 halves the string: one octave.' },
        { text: 'Fret 19', why: 'Fret 19 is the other thirds node: an octave and a fifth, like fret 7.' },
      ],
      shuffle: false,
      explain: 'Fret 5 is a quarter of the way along, so the string rings in quarters: four times the frequency, two octaves up.',
      fact: 'physics-harmonic-frets',
    },
    {
      type: 'true-false',
      statement: 'To sound a natural harmonic you press the string down onto the fret.',
      answer: false,
      explain: 'Pressing gives the ordinary fretted note. For a harmonic you only touch the string lightly, directly over the fret wire.',
      fact: 'physics-harmonic-touch',
    },
    {
      type: 'match-pairs',
      prompt: 'On string 6, match each harmonic with the note it sounds.',
      pairs: [
        { left: 'Fret 12 harmonic', right: '{n:E3}' },
        { left: 'Fret 7 harmonic', right: '{n:B3}' },
        { left: 'Fret 5 harmonic', right: '{n:E4}' },
      ],
      explain: 'From the open {n:E2}: an octave up is {n:E3}, an octave and a fifth {n:B3}, two octaves {n:E4}.',
      fact: 'physics-harmonic-low-e',
    },
    {
      type: 'card',
      title: 'Frets 7 and 19',
      body: 'A string divided in thirds has two nodes: one a third of the way along, over fret 7, and one two thirds along, over fret 19. Both give the same harmonic, an octave and a fifth up. In the same way, fret 24 (where a guitar has one) matches fret 5.',
      figure: {
        kind: 'fretboard',
        frets: [7, 19],
        dots: [{ string: 6, fret: 7, label: '×3', role: 'target' }, { string: 6, fret: 19, label: '×3', role: 'target' }],
        caption: 'Frets 7 and 19 of string 6: the same harmonic, {n:B3}.',
      },
    },
    {
      type: 'choice',
      prompt: 'Which note does the harmonic at fret 19 of string 6 sound?',
      options: [
        { text: '{n:B3}', correct: true },
        { text: '{n:E3}', why: 'That is the fret 12 harmonic: the halves.' },
        { text: '{n:E4}', why: 'That is the fret 5 harmonic: the quarters.' },
        { text: '{n:B2}', why: 'That is the fretted note at fret 7; the harmonic is an octave higher.' },
      ],
      explain: 'Fret 19 lies on a thirds node, like fret 7, so both ring an octave and a fifth above the open {n:E2}: {n:B3}.',
      fact: 'physics-harmonic-fret-19',
    },
    {
      type: 'type-answer',
      prompt: 'Which note does the fret 7 harmonic on string 4 sound? Type its name.',
      answer: { kind: 'note', value: 'A', spelling: 'any' },
      input: 'keypad',
      explain: 'Open string 4 is {n:D3}. The fret 7 harmonic is an octave and a fifth higher: {n:A4}.',
      fact: 'physics-harmonic-frets',
    },
    {
      type: 'card',
      title: 'Harmonics in tab',
      body: 'Tab writes a natural harmonic as its fret in angle brackets, such as <12>, or adds "N.H." or "Harm." above it. A diamond-shaped note head does the same job on the staff.',
    },
    {
      type: 'play-note',
      prompt: 'Play the fret 7 harmonic on string 5: touch the string right over the fret 7 wire, pluck, and lift.',
      note: 'E4',
      octave: 'exact',
      explain: 'Open string 5 is {n:A2}. Its fret 7 harmonic rings an octave and a fifth higher: {n:E4}, the same pitch as the open string 1.',
      alternative: {
        type: 'choice',
        prompt: 'Which note does the fret 7 harmonic on string 5 sound?',
        options: [
          { text: '{n:E4}', correct: true },
          { text: '{n:E3}', why: 'That is the note you get by pressing fret 7. The harmonic is an octave higher.' },
          { text: '{n:A3}', why: 'That is the fret 12 harmonic of string 5.' },
          { text: '{n:A4}', why: 'That is the fret 5 harmonic of string 5, two octaves up.' },
        ],
        explain: 'An octave and a fifth above the open {n:A2}: {n:E4}.',
      },
    },
    {
      type: 'fretboard-find',
      prompt: 'The fret 12 harmonic of string 4 sounds the same as a fretted note on that string. Tap it.',
      find: { note: 'D4' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 12],
      strings: [4],
      explain: 'Fret 12 of string 4: {n:D4}, one octave above the open {n:D3}, the same pitch as the harmonic there.',
    },
  ],
  facts: [
    {
      id: 'physics-harmonic-touch',
      front: 'How do you play a natural harmonic?',
      back: 'Touch the string lightly, directly over a {t:node} such as the fret 12 wire, and pluck it.',
    },
    {
      id: 'physics-harmonic-frets',
      front: 'What do the natural harmonics at frets 12, 7 and 5 sound?',
      back: 'Fret 12: an octave above the open string. Fret 7: an octave and a fifth. Fret 5: two octaves.',
    },
    {
      id: 'physics-harmonic-low-e',
      front: 'Which notes are the harmonics at frets 12, 7 and 5 of the low {n:E} string?',
      back: '{n:E3}, {n:B3} and {n:E4}.',
    },
    {
      id: 'physics-harmonic-fret-19',
      front: 'Why does the harmonic at fret 19 sound the same as at fret 7?',
      back: 'Both lie on the nodes that divide the string into thirds.',
    },
  ],
};

const fretSpacingAndIntonation: Lesson = {
  id: 'fret-spacing-and-intonation',
  title: 'Fret spacing and intonation',
  teaches: 'Each fret shortens the string by the same ratio, so frets get closer up the neck; the saddle sets intonation.',
  minutes: 3,
  skill: `theory:${U}:fret-spacing-and-intonation`,
  steps: [
    {
      type: 'card',
      title: 'Why frets get closer',
      body: 'Every fret raises the note a half step, and a half step always means the same **ratio** of length: each fret leaves about 94.4% of the string and cuts off 5.6%. Near the nut, 5.6% of a long string is a wide gap. Higher up the string is shorter, so the gaps shrink.',
      figure: {
        kind: 'fretboard',
        frets: [0, 12],
        dots: [{ string: 1, fret: 1, note: 'F4' }, { string: 1, fret: 12, note: 'E5' }],
        caption: 'On a real neck, the space before fret 1 is nearly twice as wide as fret 12\'s.',
      },
    },
    {
      type: 'true-false',
      statement: 'All frets are the same distance apart.',
      answer: false,
      explain: 'Each fret cuts the same share, 5.6%, of what is left of the string, so the gaps shrink as the string gets shorter up the neck.',
      fact: 'physics-fret-ratio',
    },
    {
      type: 'card',
      title: 'Measured on a real neck',
      body: 'On a 648 mm {t:scale-length} (25½ inches), fret 1 sits 36.4 mm from the nut and fret 12 at **324 mm**: exactly halfway to the {t:saddle}. Fret 24 would sit at 486 mm, three quarters of the way. The gap from fret 1 to 2 is 34.3 mm; from 11 to 12, only 19.3 mm.',
    },
    {
      type: 'choice',
      prompt: 'On a 648 mm scale, how far from the nut is fret 12?',
      options: [
        { text: '162 mm', why: 'That is a quarter of the way, near fret 5.' },
        { text: '324 mm', correct: true },
        { text: '432 mm', why: 'That is two thirds of the way, near fret 19.' },
        { text: '486 mm', why: 'That is three quarters of the way: fret 24.' },
      ],
      shuffle: false,
      explain: 'Fret 12 sits exactly halfway between the nut and the saddle: 648 ÷ 2 = 324 mm. Half the length, one octave up.',
      fact: 'physics-fret-12-halfway',
    },
    {
      type: 'choice',
      prompt: 'Each fret shortens the vibrating string by about how much?',
      options: [
        { text: '5.6% of what is left', correct: true },
        { text: 'One twelfth of the whole string', why: 'Equal lengths would put fret 12 at the saddle. The steps are an equal ratio, not an equal length.' },
        { text: 'Exactly 10 mm', why: 'The gaps shrink up the neck: about 36 mm at fret 1, about 19 mm at fret 12.' },
      ],
      explain: 'Each fret keeps about 94.4% of the vibrating length, cutting 5.6%. Twelve of those steps make exactly half: one octave.',
      fact: 'physics-fret-ratio',
    },
    {
      type: 'card',
      title: 'Intonation',
      body: '{t:intonation|Intonation} is how well fretted notes stay in tune up the neck. Check it at fret 12: tune the open string, then compare the **fret 12 harmonic** with the **fretted note at fret 12**. They should match. If the fretted note is sharp, move the saddle away from the neck; if flat, toward it.',
      tip: 'Moving the saddle away from the neck makes the string longer, which lowers the fretted notes.',
    },
    {
      type: 'choice',
      prompt: 'The fretted note at fret 12 is flat against the harmonic. Which way should the saddle move?',
      options: [
        { text: 'Toward the neck', correct: true },
        { text: 'Away from the neck', why: 'That lengthens the string and makes the fretted note even flatter.' },
      ],
      shuffle: false,
      explain: 'Flat means the string is a little too long. Moving the saddle toward the neck shortens it, which raises the fretted note.',
      fact: 'physics-intonation-saddle',
    },
    {
      type: 'choice',
      prompt: 'Why is the fret 12 harmonic a good reference for the fretted note at fret 12?',
      options: [
        { text: 'The harmonic is always exactly an octave up', correct: true },
        { text: 'The harmonic is louder', why: 'It is usually quieter. What matters is that it is exactly in tune.' },
        { text: 'Harmonics never go out of tune', why: 'They follow the open string. Tune the open string first.' },
      ],
      explain: 'The harmonic comes from the true middle of the string, so it is exactly an octave above the open string, wherever the frets are. The fretted note should match it.',
    },
    {
      type: 'play-note',
      prompt: 'Check your own guitar: play string 1 fretted at fret 12, then compare it in your head with the harmonic there.',
      note: 'E5',
      octave: 'exact',
      where: { string: 1, fret: 12 },
      explain: 'String 1 at fret 12 is {n:E5}, one octave above the open string. If it sounds sharper than the harmonic, the saddle needs to move back.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the fretted note that should match the fret 12 harmonic of string 1.',
        find: { note: 'E5' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 12],
        strings: [1],
        explain: 'String 1, fret 12: {n:E5}, an octave above the open string, like the harmonic.',
      },
    },
  ],
  facts: [
    {
      id: 'physics-fret-ratio',
      front: 'Why do frets get closer together up the neck?',
      back: 'Each fret shortens the vibrating string by the same ratio, about 5.6%, and that share of a shorter string is a smaller gap.',
    },
    {
      id: 'physics-fret-12-halfway',
      front: 'Where do fret 12 and fret 24 sit along the string?',
      back: 'Fret 12 exactly halfway between the nut and the saddle; fret 24 three quarters of the way.',
    },
    {
      id: 'physics-intonation-saddle',
      front: 'The fretted note at fret 12 is sharp compared with the fret 12 harmonic. What do you adjust?',
      back: 'Move the {t:saddle} away from the neck, lengthening the string.',
      ask: {
        type: 'true-false',
        statement: 'If the fretted note at fret 12 is sharp against the harmonic, the saddle moves away from the neck.',
        answer: true,
        explain: 'Sharp means the string is a little too short. Moving the saddle away from the neck lengthens it and lowers the fretted notes.',
      },
    },
  ],
};

const equalTemperament: Lesson = {
  id: 'equal-temperament',
  title: 'Equal temperament',
  teaches: 'Equal temperament makes 12 equal half steps of 100 cents: every key works, but intervals are slightly impure.',
  minutes: 4,
  skill: `theory:${U}:equal-temperament`,
  steps: [
    {
      type: 'card',
      title: 'Twelve equal steps',
      body: 'Our tuning system, {t:equal-temperament}, splits the octave into **twelve equal half steps**. Musicians measure them in {t:cent|cents}: 100 cents to a half step, **1200** to the octave. Every fret on your guitar is one of these 100-cent steps.',
      figure: {
        kind: 'keyboard',
        keys: [
          { note: 'C4', label: '0', role: 'root' },
          { note: 'E4', label: '400', role: 'third' },
          { note: 'G4', label: '700', role: 'fifth' },
          { note: 'C5', label: '1200', role: 'root' },
        ],
        from: 'C4',
        to: 'C5',
        caption: 'Cents above {n:C}: {n:E} is 400, {n:G} 700, the octave 1200.',
      },
    },
    {
      type: 'choice',
      prompt: 'How many cents are in an octave?',
      options: [
        { text: '12', why: 'There are 12 half steps in an octave, each 100 cents.' },
        { text: '100', why: 'That is one half step: one fret.' },
        { text: '700', why: 'That is a fifth: seven half steps.' },
        { text: '1200', correct: true },
      ],
      shuffle: false,
      explain: '12 half steps × 100 cents = 1200 cents in an octave.',
      fact: 'physics-temperament-cents',
    },
    {
      type: 'card',
      title: 'Pure intervals',
      body: 'A {t:pure-interval} comes straight from the harmonic series. A pure fifth is the ratio 3:2, about 702 cents; a pure major third is 5:4, about 386. Equal temperament rounds them to 700 and 400: its fifth is 2 cents narrower than pure, its major third 14 cents wider.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        dots: [
          { string: 5, fret: 0, note: 'A2', role: 'root' },
          { string: 4, fret: 2, note: 'E3', role: 'fifth' },
          { string: 3, fret: 1, note: 'G#3', role: 'third' },
        ],
        caption: 'The fifth {n:A2}–{n:E3}, and the major third {n:E3}–{n:G#3}.',
      },
    },
    {
      type: 'true-false',
      statement: 'An equal-tempered major third is slightly wider than a pure one.',
      answer: true,
      explain: 'The tempered major third is 400 cents; the pure one, ratio 5:4, is about 386. So the tempered third is about 14 cents wider.',
      fact: 'physics-temperament-pure',
    },
    {
      type: 'choice',
      prompt: 'Of these three, which interval does equal temperament move furthest from pure?',
      options: [
        { text: 'The major third', correct: true },
        { text: 'The fifth', why: 'The fifth is only about 2 cents away from pure.' },
        { text: 'The octave', why: 'The octave stays exactly pure: 2:1, 1200 cents.' },
      ],
      explain: 'The tempered major third is about 14 cents wider than pure; the fifth is only 2 cents narrower, and the octave is exact.',
      fact: 'physics-temperament-pure',
    },
    {
      type: 'fretboard-find',
      prompt: 'Find the major third above {n:E3} at string 4, fret 2, within the first four frets.',
      find: { interval: 'M3', from: { string: 4, fret: 2 } },
      shown: [{ string: 4, fret: 2, note: 'E3', role: 'root', label: 'R' }],
      mode: 'one',
      octave: 'exact',
      frets: [0, 4],
      explain: 'String 3, fret 1: {n:G#3}, four half steps above {n:E3}. Those 400 cents are the tempered major third.',
    },
    {
      type: 'listen-choice',
      prompt: 'Two notes played together, tuned the way your frets tune them. Which interval is it?',
      sound: { kind: 'interval', from: 'E3', interval: 'M3', play: 'together' },
      options: [{ text: 'The fifth, {n:A2} and {n:E3}' }, { text: 'The major third, {n:E3} and {n:G#3}', correct: true }],
      shuffle: false,
      explain: 'That was the major third {n:E3}–{n:G#3}. Listen closely and it shimmers a little: that is the 14 cents it is wider than pure. A tempered fifth sounds almost still.',
    },
    {
      type: 'card',
      title: 'Why the guitar uses it',
      body: 'Each fret runs straight across all six strings, so every string gets the same half steps. A fret cannot be pure for one key and different for another. So the guitar is built in equal temperament: every key is equally in tune, and no key is perfectly pure.',
    },
    {
      type: 'choice',
      prompt: 'Why do fretted instruments use equal temperament?',
      options: [
        { text: 'Frets fix the same half steps in every key', correct: true },
        { text: 'It makes the major thirds pure', why: 'It does the opposite: tempered thirds are 14 cents wider than pure.' },
        { text: 'Strings cannot sound pure intervals', why: 'A string\'s harmonics are pure. It is the frets that fix the steps.' },
      ],
      explain: 'A fret serves every key at once, so the steps between frets must be equal: twelve half steps of 100 cents.',
      fact: 'physics-temperament-frets',
    },
    {
      type: 'card',
      title: 'Why tuning by harmonics drifts',
      body: 'A popular trick tunes string 5 by matching its fret 7 harmonic with the fret 5 harmonic of string 6. Those harmonics are pure, so they set the strings a pure fourth apart, ratio 4:3, about 498 cents instead of 500. Each string ends up about 2 cents flat, and the error adds up string by string.',
    },
    {
      type: 'choice',
      prompt: 'You match the fret 5 harmonic of string 6 with the fret 7 harmonic of string 5. How far apart does that tune the strings?',
      options: [
        { text: 'A pure fourth: about 498 cents', correct: true },
        { text: 'A tempered fourth: exactly 500 cents', why: 'Harmonics are pure, so the fourth they give is pure, ratio 4:3.' },
        { text: 'A pure fifth: about 702 cents', why: 'Strings 6 and 5 are a fourth apart, not a fifth.' },
      ],
      explain: '4 × the low {n:E} and 3 × the {n:A} meet on one pitch, so the strings stand 4:3 apart: a pure fourth, 2 cents narrower than the tempered one.',
      fact: 'physics-temperament-harmonic-tuning',
    },
    {
      type: 'true-false',
      statement: 'In equal temperament every half step is the same size: 100 cents.',
      answer: true,
      explain: 'That is the whole idea: twelve identical half steps of 100 cents fill the 1200-cent octave.',
      fact: 'physics-temperament-cents',
    },
  ],
  facts: [
    {
      id: 'physics-temperament-cents',
      front: 'How does equal temperament divide the octave?',
      back: 'Into twelve equal half steps of 100 cents each: 1200 cents in all.',
    },
    {
      id: 'physics-temperament-pure',
      front: 'How do a pure fifth and a pure major third compare with the tempered ones?',
      back: 'A pure fifth (3:2) is about 2 cents wider than the tempered fifth; a pure major third (5:4) is about 14 cents narrower.',
    },
    {
      id: 'physics-temperament-frets',
      front: 'Why do fretted instruments use equal temperament?',
      back: 'Each fret runs across every string, so the frets fix the same half steps in every key.',
    },
    {
      id: 'physics-temperament-harmonic-tuning',
      front: 'Why does tuning by matching the harmonics at frets 5 and 7 leave each string about 2 cents off?',
      back: 'It tunes neighbouring strings a pure fourth apart (ratio 4:3, about 498 cents), not a tempered one (500 cents).',
    },
  ],
};

const alternateTunings: Lesson = {
  id: 'alternate-tunings',
  title: 'Alternate tunings',
  teaches: 'Alternate tunings retune the open strings for new sounds, and in them the usual chord and scale shapes change.',
  minutes: 3,
  skill: `theory:${U}:alternate-tunings`,
  steps: [
    {
      type: 'card',
      title: 'Drop D',
      body: 'An {t:alternate-tuning} sets some open strings to other notes. The most common is **drop D**: lower string 6 a whole step, from {n:E} to {n:D}, and leave the rest. The open strings now read {n:D} {n:A} {n:D} {n:G} {n:B} {n:E}.',
      figure: {
        kind: 'fretboard',
        tuning: 'drop-d',
        frets: [0, 4],
        dots: [
          { string: 6, fret: 0, note: 'D2', role: 'root' }, { string: 5, fret: 0, note: 'A2' }, { string: 4, fret: 0, note: 'D3', role: 'root' },
          { string: 3, fret: 0, note: 'G3' }, { string: 2, fret: 0, note: 'B3' }, { string: 1, fret: 0, note: 'E4' },
        ],
        caption: 'Drop D: string 6 tuned down a whole step, to {n:D}.',
      },
    },
    {
      type: 'true-false',
      statement: 'In drop D, the open strings 6, 5 and 4 form a {c:D5} power chord.',
      answer: true,
      explain: 'They sound {n:D}, {n:A} and {n:D}: root, fifth and root. That is {c:D5}, with no fingers at all.',
    },
    {
      type: 'card',
      title: 'DADGAD and open G',
      body: '**DADGAD** lowers strings 6, 2 and 1 a whole step: {n:D} {n:A} {n:D} {n:G} {n:A} {n:D}. **Open G** lowers strings 6, 5 and 1 a whole step: {n:D} {n:G} {n:D} {n:G} {n:B} {n:D}. In an {t:open-tuning} the open strings sound a chord: open G strums a {c:G} chord.',
      figure: { kind: 'audio', sound: { kind: 'tab', tuning: 'open-g', notes: openStrings(), tempo: 100 }, label: 'Hear open G' },
    },
    {
      type: 'choice',
      prompt: 'Which strings change from standard tuning to open G?',
      options: [
        { text: 'Strings 6, 5 and 1, each down a whole step', correct: true },
        { text: 'Strings 6, 2 and 1, each down a whole step', why: 'That is DADGAD.' },
        { text: 'Only string 6, down a whole step', why: 'That is drop D.' },
      ],
      explain: 'Open G is {n:D} {n:G} {n:D} {n:G} {n:B} {n:D}: string 6 goes {n:E} to {n:D}, string 5 {n:A} to {n:G}, string 1 {n:E} to {n:D}.',
      fact: 'physics-tunings-common',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each tuning with its open strings, string 6 to 1.',
      pairs: [
        { left: 'Standard', right: 'E A D G B E' },
        { left: 'Drop D', right: 'D A D G B E' },
        { left: 'DADGAD', right: 'D A D G A D' },
        { left: 'Open G', right: 'D G D G B D' },
      ],
      explain: 'Drop D changes string 6; DADGAD changes strings 6, 2 and 1; open G changes strings 6, 5 and 1. Each move is down a whole step.',
      fact: 'physics-tunings-common',
    },
    {
      type: 'choice',
      prompt: 'In open G, what do the six open strings sound when you strum them?',
      options: [
        { text: 'A {c:G} major chord', correct: true },
        { text: 'A {c:D} major chord', why: 'Three strings are {n:D}, but the strings spell {n:G} {n:B} {n:D}: a {c:G} chord.' },
        { text: 'A {c:G5} power chord', why: 'Open G keeps the {n:B} string, the third, so the chord is full {c:G} major.' },
      ],
      explain: '{n:D} {n:G} {n:D} {n:G} {n:B} {n:D} holds only {n:G}, {n:B} and {n:D}: a {c:G} major chord, with its fifth, {n:D}, in the bass.',
      fact: 'physics-tunings-open-chord',
    },
    {
      type: 'card',
      title: 'The shapes change',
      body: 'Retuning moves the notes, so the shapes you know move too. In drop D the power chord on strings 6, 5 and 4 takes **one finger** laid across one fret: open it is {c:D5}, at fret 2 {c:E5}. The {t:caged|CAGED} shapes assume standard tuning; in other tunings you learn the shapes anew.',
      figure: {
        kind: 'fretboard',
        tuning: 'drop-d',
        frets: [0, 4],
        dots: [
          { string: 6, fret: 2, note: 'E2', finger: 1, role: 'root' },
          { string: 5, fret: 2, note: 'B2', finger: 1, role: 'fifth' },
          { string: 4, fret: 2, note: 'E3', finger: 1, role: 'root' },
        ],
        caption: 'Drop D: one finger across fret 2 on strings 6, 5 and 4 is {c:E5}.',
      },
    },
    {
      type: 'true-false',
      statement: 'The CAGED chord shapes work unchanged in any tuning.',
      answer: false,
      explain: 'CAGED assumes standard tuning. Retune a string and every shape that uses it changes: in drop D the E-shape and the open {c:E} chord lose their low {n:E}.',
      fact: 'physics-tunings-shapes',
    },
    {
      type: 'play-chord',
      prompt: 'Drop D changes only string 6, so this {c:D5} shape on strings 4, 3 and 2 is the same in both tunings. Strum those three.',
      chord: 'D5',
      frets: 'xx023x',
      explain: 'Open string 4 ({n:D}), fret 2 on string 3 ({n:A}) and fret 3 on string 2 ({n:D}): {c:D5}. Shapes that avoid string 6 do not change in drop D.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'D5',
        frets: 'xx023x',
        prompt: 'Build {c:D5} on strings 4, 3 and 2.',
        explain: '{c:D5} is {n:D} and {n:A}: the open string 4, fret 2 on string 3 and fret 3 on string 2.',
      },
    },
    {
      type: 'play-phrase',
      prompt: 'Now tune string 6 down to {n:D}. Pluck strings 6, 5 and 4 open ({c:D5}), then all three at fret 2 under one finger ({c:E5}).',
      notes: DROP_D_POWER,
      tuning: 'drop-d',
      octave: 'exact',
      tempo: 70,
      explain: 'Open: {n:D} {n:A} {n:D}. One finger across fret 2: {n:E} {n:B} {n:E}. In standard tuning the same three-string power chord is a shape like 1-3-3, played with two or three fingers.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'In drop D, tap the three notes of the one-finger {c:E5} power chord on strings 6, 5 and 4.',
        find: { chord: 'E5' },
        tuning: 'drop-d',
        mode: 'all',
        octave: 'any',
        frets: [0, 2],
        strings: [6, 5, 4],
        explain: 'All three at fret 2: {n:E} on string 6, {n:B} on string 5, {n:E} on string 4. One finger covers them.',
      },
    },
  ],
  facts: [
    {
      id: 'physics-tunings-common',
      front: 'Name the open strings of drop D, DADGAD and open G.',
      back: 'Drop D: D A D G B E (string 6 down a whole step). DADGAD: D A D G A D. Open G: D G D G B D.',
      ask: {
        type: 'match-pairs',
        prompt: 'Match each tuning with its open strings, string 6 to 1.',
        pairs: [
          { left: 'Drop D', right: 'D A D G B E' },
          { left: 'DADGAD', right: 'D A D G A D' },
          { left: 'Open G', right: 'D G D G B D' },
        ],
        explain: 'Each starts from standard E A D G B E and lowers some strings a whole step: drop D string 6; DADGAD strings 6, 2 and 1; open G strings 6, 5 and 1.',
      },
    },
    {
      id: 'physics-tunings-open-chord',
      front: 'What is special about an open tuning?',
      back: 'Its open strings form a chord: open G sounds a {c:G} major chord.',
    },
    {
      id: 'physics-tunings-shapes',
      front: 'Do chord and scale shapes stay the same in other tunings?',
      back: 'No: outside standard tuning the shapes change. The CAGED shapes assume standard tuning.',
    },
  ],
};

/** Unit 43 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Tuning, harmonics and physics',
  theme: 'basics',
  description: 'Concert pitch, what sets a string\'s pitch, the harmonic series, natural harmonics, fret spacing, equal temperament and alternate tunings.',
  lessons: [frequencyAndConcertPitch, whatSetsThePitch, theHarmonicSeries, naturalHarmonics, fretSpacingAndIntonation, equalTemperament, alternateTunings],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'choice',
        prompt: 'Concert pitch sets {n:A4} at what frequency?',
        options: [{ text: '220 Hz' }, { text: '432 Hz', why: 'Some players like 432, but concert pitch is 440.' }, { text: '440 Hz', correct: true }, { text: '880 Hz' }],
        shuffle: false,
        explain: 'Concert pitch is {n:A4} = 440 Hz: string 1, fret 5.',
      },
      {
        type: 'choice',
        prompt: 'The open string 1, {n:E4}, is about 329.6 Hz. What is the {n:E} one octave lower?',
        options: [
          { text: 'About 82.4 Hz', why: 'That is two octaves lower: the open string 6.' },
          { text: 'About 164.8 Hz', correct: true },
          { text: 'About 319.6 Hz', why: 'An octave halves the frequency; it does not take away 10 Hz.' },
          { text: 'About 659.3 Hz', why: 'That is one octave higher.' },
        ],
        shuffle: false,
        explain: 'One octave down halves the frequency: 329.6 ÷ 2 = 164.8 Hz, string 6 at fret 12.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each open string with its frequency.',
        pairs: [
          { left: 'String 6', right: '82.4 Hz' },
          { left: 'String 4', right: '146.8 Hz' },
          { left: 'String 2', right: '246.9 Hz' },
        ],
        explain: 'Strings 6 to 1: 82.4, 110, 146.8, 196, 246.9 and 329.6 Hz.',
      },
      {
        type: 'choice',
        prompt: 'Which change makes a string sound higher?',
        options: [
          { text: 'Tightening it', correct: true },
          { text: 'Using a heavier string', why: 'More mass makes the string vibrate more slowly: lower.' },
          { text: 'Letting a longer part vibrate', why: 'A longer vibrating length sounds lower.' },
        ],
        explain: 'Shorter, tighter or lighter raises the pitch.',
      },
      {
        type: 'true-false',
        statement: 'Doubling the tension of a string raises it by an octave.',
        answer: false,
        explain: 'Frequency follows the square root of the tension: an octave takes four times the tension.',
      },
      {
        type: 'choice',
        prompt: 'The open string 5 vibrates at 110 Hz. At what frequency is its 5th harmonic?',
        options: [{ text: '220 Hz' }, { text: '330 Hz' }, { text: '440 Hz' }, { text: '550 Hz', correct: true }],
        shuffle: false,
        explain: '5 × 110 = 550 Hz: two octaves and a major third above {n:A2}, near {n:C#5}.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each natural harmonic with how far it sounds above the open string.',
        pairs: [
          { left: 'Fret 12', right: 'An octave' },
          { left: 'Fret 7', right: 'An octave and a fifth' },
          { left: 'Fret 5', right: 'Two octaves' },
        ],
        explain: 'Fret 12 halves the string, fret 7 divides it in thirds, fret 5 in quarters.',
      },
      {
        type: 'choice',
        prompt: 'The harmonic at fret 19 sounds the same as the harmonic at which fret?',
        options: [{ text: 'Fret 5', why: 'Fret 5 matches fret 24: the quarters.' }, { text: 'Fret 7', correct: true }, { text: 'Fret 12', why: 'Fret 12 is the halfway node: the octave.' }],
        shuffle: false,
        explain: 'Frets 7 and 19 are the two nodes that divide the string into thirds.',
      },
      {
        type: 'choice',
        prompt: 'On a 648 mm scale, where is fret 12?',
        options: [{ text: '162 mm from the nut' }, { text: '324 mm from the nut', correct: true }, { text: '486 mm from the nut', why: 'That is fret 24, three quarters of the way.' }],
        shuffle: false,
        explain: 'Fret 12 sits exactly halfway: 648 ÷ 2 = 324 mm.',
      },
      {
        type: 'choice',
        prompt: 'The fretted note at fret 12 is sharp against the fret 12 harmonic. What do you do?',
        options: [
          { text: 'Move the saddle away from the neck', correct: true },
          { text: 'Move the saddle toward the neck', why: 'That shortens the string and makes the fretted note even sharper.' },
          { text: 'Tune the open string down', why: 'The harmonic follows the open string, so the two stay just as far apart.' },
        ],
        explain: 'Sharp means the string is a little too short: lengthen it by moving the saddle back, away from the neck.',
      },
      {
        type: 'choice',
        prompt: 'How many cents are in one equal-tempered half step?',
        options: [{ text: '12' }, { text: '50' }, { text: '100', correct: true }, { text: '1200', why: 'That is the whole octave.' }],
        shuffle: false,
        explain: 'Twelve half steps of 100 cents make the 1200-cent octave.',
      },
      {
        type: 'true-false',
        statement: 'A pure fifth (ratio 3:2) is about 2 cents wider than the equal-tempered fifth.',
        answer: true,
        explain: 'Pure: about 702 cents. Tempered: 700.',
      },
      {
        type: 'choice',
        prompt: 'Compared with a pure major third (ratio 5:4), how wide is the equal-tempered major third?',
        options: [
          { text: 'About 14 cents wider', correct: true },
          { text: 'About 14 cents narrower', why: 'It is the other way round: the pure third, about 386 cents, is the narrower one.' },
          { text: 'Exactly the same', why: 'Equal temperament keeps only the octave pure. Its major third is 400 cents.' },
        ],
        shuffle: false,
        explain: 'Tempered: 400 cents. Pure: about 386. So the tempered major third is about 14 cents wider than pure.',
      },
      {
        type: 'choice',
        prompt: 'Why does tuning by matching the harmonics at frets 5 and 7 leave the strings slightly off?',
        options: [
          { text: 'It sets a pure fourth, not a tempered one', correct: true },
          { text: 'Harmonics are always out of tune', why: 'Harmonics are pure, which is exactly the problem: the frets are tempered.' },
          { text: 'Fret 7 is not where the harmonic is', why: 'The fret 7 wire sits almost exactly on the thirds node.' },
        ],
        explain: 'The harmonics meet at a pure fourth (4:3, about 498 cents), 2 cents narrower than the tempered 500: each string ends up about 2 cents flat.',
      },
      {
        type: 'choice',
        prompt: 'Which strings change from standard tuning to open G?',
        options: [
          { text: 'Strings 6, 5 and 1, each down a whole step', correct: true },
          { text: 'Strings 6, 2 and 1, each down a whole step', why: 'That is DADGAD.' },
          { text: 'Only string 6, down a whole step', why: 'That is drop D.' },
        ],
        explain: 'Open G is {n:D} {n:G} {n:D} {n:G} {n:B} {n:D}.',
      },
      {
        type: 'choice',
        prompt: 'How do you get from standard tuning to drop D?',
        options: [
          { text: 'Lower string 6 a whole step, to {n:D}', correct: true },
          { text: 'Lower string 1 a whole step, to {n:D}', why: 'String 1 stays {n:E} in drop D. It drops to {n:D} in DADGAD and open G.' },
          { text: 'Raise string 6 a whole step, to {n:F#}', why: 'Drop means lower: string 6 goes down from {n:E} to {n:D}.' },
        ],
        explain: 'Drop D lowers only string 6, {n:E} to {n:D}: {n:D} {n:A} {n:D} {n:G} {n:B} {n:E}. Strings 6, 5 and 4 then ring a {c:D5} power chord.',
      },
      {
        type: 'true-false',
        statement: 'The CAGED chord shapes work unchanged in DADGAD.',
        answer: false,
        explain: 'CAGED assumes standard tuning. In DADGAD strings 6, 2 and 1 are retuned, so the shapes change.',
      },
    ],
  },
};

export default unit;

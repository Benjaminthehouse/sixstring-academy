/**
 * Theory Path, unit 1: Sound and pitch. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `sound-and-pitch`), one lesson per entry, in order:
 * each lesson opens with the "on the guitar" picture, asks the planned exercises, ends with the
 * planned drill, and turns every planned fact into a review card.
 *
 * This file is the model the other unit authors copy. `sound-and-pitch.test.ts` cross-checks its
 * numbers (frequencies, frets, the tune) against the engines.
 *
 * Two planned sounds cannot be played yet, because a lesson `Sound` has no loudness or pick
 * position (README, "Known limits"). "Loud is not high" and "Tone colour" ask the learner to try
 * those two on the guitar and use listening questions the synth can play truthfully: the same
 * pitch twice, and the same pitch on two strings.
 */
import type { Lesson, Unit } from '@/lessons';

const U = 'sound-and-pitch';

const aSoundIsAVibration: Lesson = {
  id: 'a-sound-is-a-vibration',
  title: 'A sound is a vibration',
  teaches: 'Every sound is something vibrating, and a guitar note is a vibrating string made loud by the guitar.',
  minutes: 2,
  skill: `theory:${U}:a-sound-is-a-vibration`,
  requires: [],
  steps: [
    {
      type: 'card',
      title: 'Everything you hear is moving',
      body: 'Every sound starts with something {t:vibration|vibrating}: moving back and forth, very fast. The movement shakes the air, and the air carries it to your ear.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        dots: [{ string: 6, fret: 0, note: 'E', role: 'root' }],
        caption: 'String 6, the thickest string, played open: the low {n:E}.',
      },
    },
    {
      type: 'card',
      title: 'Watch a string',
      body: 'Pluck string 6, the thickest one, and look closely: it blurs as it swings back and forth. Touch it lightly and it stops. So does the sound.',
      figure: { kind: 'audio', sound: { kind: 'notes', notes: ['E2'], tempo: 60 }, label: 'Hear the open low E' },
      tip: 'Look along the string from the side, near the middle: that is where it swings widest.',
    },
    {
      type: 'true-false',
      statement: 'A guitar string has to vibrate to make a sound.',
      answer: true,
      explain: 'No vibration, no sound. When you touch the string and it stops swinging, the note stops with it.',
      fact: 'sound-is-vibration',
    },
    {
      type: 'choice',
      prompt: 'What does a string do after you pluck it?',
      options: [
        { text: 'Swings back and forth, many times a second', correct: true },
        { text: 'Stretches longer and stays there', why: 'Its length stays the same: it moves from side to side.' },
        { text: 'Stays still while the wood rings', why: 'The wood rings only because the moving string shakes it.' },
      ],
      explain: 'A plucked string swings back and forth many times every second. That fast movement is the vibration you hear as a note.',
      fact: 'string-swings',
    },
    {
      type: 'card',
      title: 'Making it loud',
      body: 'A string on its own is quiet: it is thin and moves little air. On an **acoustic** guitar it shakes the wooden top, and the hollow body makes the sound big. An **electric** guitar uses a pickup and an amplifier instead.',
    },
    {
      type: 'choice',
      prompt: 'What makes an acoustic guitar loud enough to hear?',
      options: [
        { text: 'Its hollow body', correct: true },
        { text: 'Its tuning pegs', why: 'The pegs set how tight each string is, not how loud it sounds.' },
        { text: 'Its frets', why: 'Frets choose which note sounds, not how loud it is.' },
      ],
      explain: 'The string shakes the wooden top, and the hollow body makes that vibration loud enough to fill a room.',
      fact: 'body-makes-it-loud',
    },
    {
      type: 'true-false',
      statement: 'An electric guitar uses a pickup and an amplifier to be heard.',
      answer: true,
      explain: 'An electric guitar usually has a solid body that adds little volume. Its pickup turns the string\'s vibration into a signal, and the amplifier makes it loud.',
    },
    {
      type: 'play-note',
      prompt: 'Pluck open string 6 and let it ring. Watch it blur.',
      note: 'E2',
      octave: 'exact',
      where: { string: 6, fret: 0 },
      explain: 'Open string 6 is the low {n:E}: the thickest string and the lowest note of the guitar. Let it ring and it slowly fades as the swing gets smaller.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap open string 6, the thickest string.',
        find: { note: 'E2' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 3],
        explain: 'String 6, played open, is the low {n:E}.',
      },
    },
  ],
  facts: [
    {
      id: 'sound-is-vibration',
      front: 'What is a sound, physically?',
      back: 'A {t:vibration}: something moving back and forth fast. The vibration travels through the air to your ear.',
      ask: {
        type: 'choice',
        prompt: 'What carries the sound of a guitar to your ear?',
        options: [
          { text: 'The vibrating air', correct: true },
          { text: 'Light from the strings', why: 'Light lets you see the string move; the sound travels through the air.' },
          { text: 'Nothing: it stays in the guitar', why: 'You hear it across the room, so something carries it: the air.' },
        ],
        explain: 'Sound is a vibration that travels through the air to your ear.',
      },
    },
    { id: 'string-swings', front: 'What does a plucked guitar string do?', back: 'It swings back and forth many times every second.' },
    {
      id: 'body-makes-it-loud',
      front: 'What makes an acoustic guitar loud enough to hear? And an electric guitar?',
      back: 'The acoustic\'s hollow body makes the string\'s vibration loud. An electric guitar uses a pickup and an amplifier instead.',
    },
  ],
};

const pitchHighAndLow: Lesson = {
  id: 'pitch-high-and-low',
  title: 'Pitch: high and low',
  teaches: 'Pitch is how high or low a note sounds, and a faster vibration sounds higher.',
  minutes: 3,
  skill: `theory:${U}:pitch-high-and-low`,
  steps: [
    {
      type: 'card',
      title: 'High and low',
      body: '{t:pitch|Pitch} is how high or low a note sounds. Play open string 6, the thickest, then open string 1, the thinnest. Both are called {n:E}, but string 1 sounds much higher.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        dots: [
          { string: 6, fret: 0, note: 'E2', role: 'root' },
          { string: 1, fret: 0, note: 'E4', role: 'target' },
        ],
        caption: 'Open string 6 (low {n:E}) and open string 1 (high {n:E}).',
      },
    },
    {
      type: 'card',
      title: 'Hear the difference',
      body: 'Listen: string 6 first, then string 1. Same letter, very different height.',
      figure: { kind: 'audio', sound: { kind: 'notes', notes: ['E2', 'E4'], tempo: 60 }, label: 'Play string 6, then 1' },
    },
    {
      type: 'listen-choice',
      prompt: 'Listen to two notes. Is the second one higher or lower than the first?',
      sound: { kind: 'notes', notes: ['E2', 'E4'], tempo: 70 },
      options: [{ text: 'Higher', correct: true }, { text: 'Lower' }],
      shuffle: false,
      explain: 'The second note was open string 1, the high {n:E}: much higher than the low {n:E} of string 6.',
    },
    {
      type: 'card',
      title: 'Faster means higher',
      body: 'A plucked string vibrates many times every second. The **faster** it vibrates, the **higher** the pitch. Thin, light string 1 vibrates about four times as fast as thick, heavy string 6.',
      tip: 'At the same length, a heavier string vibrates more slowly. That is why the thick strings are the low ones.',
    },
    {
      type: 'choice',
      prompt: 'Which vibrates faster: open string 6 or open string 1?',
      options: [
        { text: 'String 1, the thinnest', correct: true },
        { text: 'String 6, the thickest', why: 'Thick, heavy strings vibrate more slowly. That is why string 6 sounds low.' },
        { text: 'Both at the same speed', why: 'They share a name, but string 1 sounds higher, so it vibrates faster.' },
      ],
      shuffle: false,
      explain: 'String 1 sounds higher, so it vibrates faster: about 330 times a second, against about 82 for string 6.',
      fact: 'faster-is-higher',
    },
    {
      type: 'card',
      title: 'Counting vibrations',
      body: 'Vibrations per second are counted in {t:hertz} (Hz). The open low {n:E} string vibrates about **82 times a second**: 82.4 Hz. Far too fast to count, but just right to hear.',
    },
    {
      type: 'true-false',
      statement: 'A note that vibrates 220 times per second sounds lower than one that vibrates 110 times per second.',
      answer: false,
      explain: '220 vibrations a second is faster than 110, so that note sounds higher, not lower.',
    },
    {
      type: 'choice',
      prompt: 'About how many times a second does the open low {n:E} string vibrate?',
      options: [
        { text: 'About 8' },
        { text: 'About 82', correct: true },
        { text: 'About 820', why: 'That is a high note, far above anything on string 6.' },
        { text: 'About 8,200' },
      ],
      shuffle: false,
      explain: 'The open low {n:E} vibrates about 82 times a second: 82.4 Hz.',
      fact: 'low-e-hertz',
    },
    { generate: 'higher-lower', params: { maxSemitones: 12, minSemitones: 3 } },
    { generate: 'higher-lower', params: { maxSemitones: 12, minSemitones: 2 } },
  ],
  facts: [
    { id: 'pitch-meaning', front: 'What is pitch?', back: 'How high or low a sound is.' },
    {
      id: 'faster-is-higher',
      front: 'A string vibrates faster. Does it sound higher or lower?',
      back: 'Higher. A faster vibration sounds higher; a slower vibration sounds lower.',
      ask: {
        type: 'choice',
        prompt: 'Which string sounds higher: one vibrating 300 times a second, or one vibrating 150 times?',
        options: [
          { text: 'The one vibrating 300 times', correct: true },
          { text: 'The one vibrating 150 times', why: 'Slower vibrations sound lower.' },
          { text: 'They sound the same height', why: 'Different speeds give different pitches.' },
        ],
        shuffle: false,
        explain: 'A faster vibration sounds higher: 300 times a second is faster than 150.',
      },
    },
    { id: 'hertz-meaning', front: 'What does hertz (Hz) measure?', back: 'Vibrations per second: 82 Hz means 82 vibrations every second.' },
    { id: 'low-e-hertz', front: 'About how fast does the open low {n:E} string vibrate?', back: 'About 82 times a second: 82.4 Hz.' },
  ],
};

const loudIsNotHigh: Lesson = {
  id: 'loud-is-not-high',
  title: 'Loud is not high',
  teaches: 'Volume (how loud) and pitch (how high) are separate: plucking harder makes a note louder, not higher.',
  minutes: 2,
  skill: `theory:${U}:loud-is-not-high`,
  steps: [
    {
      type: 'card',
      title: 'How loud, not how high',
      body: '{t:volume|Volume} is how loud a sound is. Pluck string 5 very softly, then firmly: the string swings in a narrow arc, then a wide one. It is the same note, {n:A}, both times. Only the volume changes.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        dots: [{ string: 5, fret: 0, note: 'A2', role: 'root' }],
        caption: 'Open string 5: {n:A}, soft or loud.',
      },
      tip: 'Pluck firmly, not wildly: a string pulled too far slaps the frets and buzzes.',
    },
    {
      type: 'listen-choice',
      prompt: 'String 5 is plucked twice. Did the pitch change?',
      sound: { kind: 'tab', notes: [{ string: 5, fret: 0, duration: 'h' }, { string: 5, fret: 0, duration: 'h' }], tempo: 80 },
      options: [
        { text: 'No: the same note both times', correct: true },
        { text: 'Yes: the second was higher' },
        { text: 'Yes: the second was lower' },
      ],
      shuffle: false,
      explain: 'Both plucks were the open {n:A} string. However softly or firmly you pluck, it stays {n:A}; only the volume can change.',
    },
    {
      type: 'true-false',
      statement: 'Plucking a string harder changes which note it plays.',
      answer: false,
      explain: 'A harder pluck makes the string swing wider, so the note is louder. It still vibrates at the same speed, so the pitch stays the same.',
      fact: 'harder-is-louder',
    },
    {
      type: 'card',
      title: 'Wide, not fast',
      body: 'Pitch depends on how **fast** the string vibrates. Volume depends on how **wide** it swings. A firm pluck gives a wider swing at the same speed: louder, same note.',
    },
    {
      type: 'choice',
      prompt: 'You pluck the open {n:A} string harder. What changes?',
      options: [
        { text: 'Only the volume', correct: true },
        { text: 'Only the pitch', why: 'The string still vibrates at the same speed, so the pitch stays put.' },
        { text: 'Both the pitch and the volume', why: 'Only the width of the swing changes, not its speed: louder, same note.' },
      ],
      shuffle: false,
      explain: 'A harder pluck makes a wider swing, which sounds louder. The speed of the vibration, and so the pitch, stays the same.',
      fact: 'volume-is-width',
    },
    {
      type: 'card',
      title: 'Dynamics',
      body: 'Musicians call changes of volume {t:dynamics}. Playing a quiet verse and then a loud chorus is using dynamics.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each word with its meaning.',
      pairs: [
        { left: 'Pitch', right: 'How high or low' },
        { left: 'Volume', right: 'How loud or soft' },
        { left: 'Dynamics', right: 'Changes of volume' },
      ],
      explain: 'Pitch is how high or low a note is; volume is how loud it is; dynamics are the changes of volume in a piece of music.',
      fact: 'dynamics-meaning',
    },
    {
      type: 'listen-choice',
      prompt: 'Listen again. Did the pitch change this time?',
      sound: { kind: 'tab', notes: [{ string: 5, fret: 0, duration: 'h' }, { string: 5, fret: 2, duration: 'h' }], tempo: 80 },
      options: [
        { text: 'No: the same note both times' },
        { text: 'Yes: the second was higher', correct: true },
        { text: 'Yes: the second was lower' },
      ],
      shuffle: false,
      explain: 'The second note was {n:B}, a little higher than the open {n:A}. That is a change of pitch: a new note, not just a louder one.',
    },
  ],
  facts: [
    {
      id: 'volume-is-width',
      front: 'What is volume, and what sets it on a string?',
      back: 'How loud a sound is. It depends on how widely the string swings, not how fast.',
    },
    {
      id: 'harder-is-louder',
      front: 'You pluck a string harder. Does the note change?',
      back: 'No. It gets louder, but it stays the same note.',
      ask: {
        type: 'true-false',
        statement: 'Plucking a string harder makes it louder but keeps it the same note.',
        answer: true,
        explain: 'A harder pluck widens the swing (louder) without changing its speed (the same pitch).',
      },
    },
    { id: 'dynamics-meaning', front: 'What are dynamics in music?', back: 'Changes of volume: playing softer or louder.' },
  ],
};

const fretsShortenTheString: Lesson = {
  id: 'frets-shorten-the-string',
  title: 'Frets make the string shorter',
  teaches: 'Pressing a string behind a fret shortens the part that vibrates, so the note sounds higher.',
  minutes: 4,
  skill: `theory:${U}:frets-shorten-the-string`,
  requires: ['loud-is-not-high', 'pitch-high-and-low'],
  steps: [
    {
      type: 'card',
      title: 'Frets',
      body: 'The metal strips across the neck are {t:fret|frets}. Press a string just behind a fret and only the part from that fret to the {t:bridge} can vibrate. Fret 1 is the one nearest the {t:nut}, at the end with the tuning pegs.',
      figure: {
        kind: 'fretboard',
        frets: [0, 5],
        dots: [
          { string: 1, fret: 0, note: 'E' },
          { string: 1, fret: 1, note: 'F' },
          { string: 1, fret: 2, note: 'F#' },
          { string: 1, fret: 3, note: 'G' },
        ],
        caption: 'String 1: open, then frets 1, 2 and 3.',
      },
    },
    {
      type: 'card',
      title: 'Shorter is higher',
      body: 'A shorter vibrating string vibrates **faster**, so it sounds **higher**. Each fret toward the body shortens the string a little more and raises the note by the same small step, a {t:half-step|half step}.',
      figure: { kind: 'audio', sound: { kind: 'tab', notes: [{ string: 1, fret: 0, duration: 'q' }, { string: 1, fret: 1, duration: 'q' }, { string: 1, fret: 2, duration: 'q' }, { string: 1, fret: 3, duration: 'q' }], tempo: 70 }, label: 'Hear open, frets 1, 2, 3' },
      tip: 'Press just behind the fret, not on top of it: less effort and no buzz.',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap fret 3 on string 1.',
      find: { note: 'G4' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 5],
      strings: [1],
      explain: 'Count from the nut: fret 1, fret 2, fret 3. String 1 at fret 3 sounds {n:G}.',
      fact: 'fret-numbers',
    },
    {
      type: 'order',
      prompt: 'Put these string 1 positions in order, from the lowest pitch to the highest.',
      tiles: ['Open', 'Fret 1', 'Fret 3', 'Fret 5'],
      explain: 'On one string, a higher fret leaves a shorter part to vibrate, so the note is higher: open, fret 1, fret 3, fret 5.',
      fact: 'shorter-is-higher',
    },
    {
      type: 'true-false',
      statement: 'Fret 1 is the fret nearest the body of the guitar.',
      answer: false,
      explain: 'Fret numbers count from the nut, at the headstock end with the tuning pegs: fret 1 is the one nearest the nut.',
      fact: 'fret-numbers',
    },
    {
      type: 'play-note',
      prompt: 'Play string 1 at fret 3: press just behind the third fret and pluck.',
      note: 'G4',
      octave: 'exact',
      where: { string: 1, fret: 3 },
      explain: 'String 1 at fret 3 is {n:G}, three half steps above the open {n:E}: {n:F}, {n:F#}, {n:G}.',
      alternative: {
        type: 'choice',
        prompt: 'You press string 1 at fret 3 instead of playing it open. What happens to the note?',
        options: [
          { text: 'It sounds higher', correct: true },
          { text: 'It sounds lower', why: 'A fret makes the vibrating part shorter, and a shorter string sounds higher.' },
          { text: 'It stays the same', why: 'Each fret raises the note by a half step: fret 3 is three half steps up.' },
        ],
        shuffle: false,
        explain: 'Fret 3 shortens the vibrating part of the string, so it vibrates faster and sounds higher: {n:G} instead of {n:E}.',
      },
    },
    {
      type: 'card',
      title: 'Your first tune',
      body: 'Play **Hot Cross Buns**, a traditional tune, on string 1 alone. It uses three places: fret 4, fret 2 and the open string. The higher frets give the higher notes, so the tune starts high and steps down.',
      figure: {
        kind: 'tab',
        tempo: 100,
        notes: [
          { string: 1, fret: 4, duration: 'q' }, { string: 1, fret: 2, duration: 'q' }, { string: 1, fret: 0, duration: 'h' },
          { string: 1, fret: 4, duration: 'q' }, { string: 1, fret: 2, duration: 'q' }, { string: 1, fret: 0, duration: 'h' },
        ],
        caption: 'String 1 only. Each number is a fret; 0 is the open string.',
      },
    },
    {
      type: 'play-phrase',
      prompt: 'Play the start of Hot Cross Buns on string 1: fret 4, fret 2, open; then again.',
      notes: [
        { string: 1, fret: 4, duration: 'q' }, { string: 1, fret: 2, duration: 'q' }, { string: 1, fret: 0, duration: 'h' },
        { string: 1, fret: 4, duration: 'q' }, { string: 1, fret: 2, duration: 'q' }, { string: 1, fret: 0, duration: 'h' },
      ],
      octave: 'exact',
      tempo: 80,
      explain: 'Fret 4, fret 2, open: three notes stepping down, played twice. Higher fret, higher note.',
      alternative: {
        type: 'order',
        prompt: 'Hot Cross Buns starts high and steps down on string 1. Put its first three notes in order.',
        tiles: ['Fret 4', 'Fret 2', 'Open'],
        distractors: ['Fret 5'],
        explain: 'Fret 4, then fret 2, then the open string: each note lower than the one before.',
      },
    },
    {
      type: 'play-phrase',
      prompt: 'Now the end: four open notes, four at fret 2, then fret 4, fret 2, open.',
      notes: [
        { string: 1, fret: 0, duration: 'e' }, { string: 1, fret: 0, duration: 'e' }, { string: 1, fret: 0, duration: 'e' }, { string: 1, fret: 0, duration: 'e' },
        { string: 1, fret: 2, duration: 'e' }, { string: 1, fret: 2, duration: 'e' }, { string: 1, fret: 2, duration: 'e' }, { string: 1, fret: 2, duration: 'e' },
        { string: 1, fret: 4, duration: 'q' }, { string: 1, fret: 2, duration: 'q' }, { string: 1, fret: 0, duration: 'h' },
      ],
      octave: 'exact',
      tempo: 80,
      explain: 'Open four times, fret 2 four times, then the opening three notes again: that is the whole tune.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Hot Cross Buns ends on the open string 1. Tap it.',
        find: { note: 'E4' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 5],
        strings: [1],
        explain: 'The tune ends on the open string 1, its lowest note: {n:E}.',
      },
    },
    { generate: 'play-note', params: { strings: [1], frets: [0, 5], naturals: true } },
  ],
  facts: [
    {
      id: 'fret-shortens',
      front: 'What does pressing a string just behind a fret do?',
      back: 'It lets the string vibrate only from that fret to the {t:bridge}: a shorter vibrating length.',
    },
    {
      id: 'shorter-is-higher',
      front: 'Does a shorter vibrating string sound higher or lower?',
      back: 'Higher: a shorter string vibrates faster.',
      ask: {
        type: 'order',
        prompt: 'Put these string 1 positions in order, from the lowest pitch to the highest.',
        tiles: ['Open', 'Fret 2', 'Fret 4', 'Fret 7'],
        explain: 'The higher the fret, the shorter the vibrating string and the higher the note.',
      },
    },
    {
      id: 'fret-numbers',
      front: 'Which fret is fret 1?',
      back: 'The one nearest the {t:nut}, the end with the tuning pegs. Fret numbers count up from there toward the body.',
    },
    { id: 'fret-half-step', front: 'How much does each fret raise a note?', back: 'By the same small step every time: a {t:half-step|half step}.' },
  ],
};

const theOctave: Lesson = {
  id: 'the-octave',
  title: 'The octave: the same note, higher',
  teaches: 'Notes an octave apart sound like one note at two heights: the higher vibrates exactly twice as fast.',
  minutes: 3,
  skill: `theory:${U}:the-octave`,
  steps: [
    {
      type: 'card',
      title: 'The same note, higher',
      body: 'Play open string 6, then string 6 at fret 12, usually marked by a double dot. The two sound like **the same note** at two heights. That distance is an {t:octave}, and both notes are called {n:E}.',
      figure: {
        kind: 'fretboard',
        frets: [0, 12],
        dots: [
          { string: 6, fret: 0, note: 'E2', role: 'root' },
          { string: 6, fret: 12, note: 'E3', role: 'root' },
        ],
        caption: 'String 6: open and fret 12, one octave apart.',
      },
    },
    {
      type: 'listen-choice',
      prompt: 'Are these two notes an octave apart?',
      sound: { kind: 'interval', from: 'E2', interval: 'P8' },
      options: [{ text: 'Yes: the same note, higher', correct: true }, { text: 'No: two different notes' }],
      shuffle: false,
      explain: 'That was open string 6 and its fret 12: the low {n:E} and the {n:E} an octave above. They blend as if they were one note.',
    },
    {
      type: 'card',
      title: 'Twice as fast',
      body: 'The higher note of an octave vibrates **exactly twice as fast** as the lower one. The open {n:A} string vibrates 110 times a second; the {n:A} an octave above it, 220 times.',
    },
    {
      type: 'choice',
      prompt: 'An {n:A} vibrates 110 times a second. How fast does the {n:A} one octave higher vibrate?',
      options: [
        { text: '55 times a second', why: 'That is the {n:A} an octave lower: half as fast.' },
        { text: '120 times a second', why: 'An octave doubles the speed; it does not add a little.' },
        { text: '220 times a second', correct: true },
        { text: '330 times a second', why: 'That is three times as fast: higher than one octave.' },
      ],
      shuffle: false,
      explain: 'One octave up means exactly twice as fast: 110 × 2 = 220 times a second.',
      fact: 'octave-twice-as-fast',
    },
    {
      type: 'listen-choice',
      prompt: 'And these two: an octave apart, or two different notes?',
      sound: { kind: 'interval', from: 'A2', interval: 'M6' },
      options: [{ text: 'Yes: the same note, higher' }, { text: 'No: two different notes', correct: true }],
      shuffle: false,
      explain: 'These were {n:A} and {n:F#}: two different notes. An octave sounds smoother, as if the two notes melt into one.',
    },
    {
      type: 'true-false',
      statement: 'A note an octave higher has a different letter name.',
      answer: false,
      explain: 'Notes an octave apart share their letter name: open string 6 and its fret 12 are both {n:E}.',
      fact: 'octave-same-name',
    },
    {
      type: 'card',
      title: 'Fret 12',
      body: 'On every string, **fret 12** sounds one octave above the open string. It sits halfway between the nut and the bridge: half the length, twice the speed.',
      figure: {
        kind: 'fretboard',
        frets: [9, 12],
        dots: [
          { string: 1, fret: 12, note: 'E' },
          { string: 2, fret: 12, note: 'B' },
          { string: 3, fret: 12, note: 'G' },
          { string: 4, fret: 12, note: 'D' },
          { string: 5, fret: 12, note: 'A' },
          { string: 6, fret: 12, note: 'E' },
        ],
        caption: 'Fret 12 repeats the open strings, one octave up.',
      },
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the note one octave above open string 5.',
      find: { note: 'A3' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 12],
      strings: [5],
      explain: 'Open string 5 is {n:A}. Halve the string at fret 12 and it vibrates twice as fast: the {n:A} one octave up.',
      fact: 'fret-12-octave',
    },
    {
      type: 'choice',
      prompt: 'Where is fret 12 on the string?',
      options: [
        { text: 'Halfway between the nut and the bridge', correct: true },
        { text: 'A quarter of the way from the nut', why: 'Half the length gives twice the speed: fret 12 is at the halfway point.' },
        { text: 'Right next to the bridge', why: 'Fret 12 is halfway along the string, often near where the neck joins the body.' },
      ],
      shuffle: false,
      explain: 'Fret 12 halves the vibrating string, so the note vibrates twice as fast: one octave up.',
      fact: 'fret-12-halfway',
    },
  ],
  facts: [
    { id: 'octave-same-name', front: 'Two notes are an octave apart. What do they share?', back: 'Their letter name: they sound like the same note at two heights.' },
    {
      id: 'octave-twice-as-fast',
      front: 'How much faster does the higher note of an octave vibrate?',
      back: 'Exactly twice as fast: an {n:A} at 110 Hz has its octave at 220 Hz.',
    },
    {
      id: 'fret-12-octave',
      front: 'Which fret sounds one octave above the open string?',
      back: 'Fret 12, on every string. Most guitars mark it with a double dot.',
      ask: {
        type: 'fretboard-find',
        prompt: 'Tap the note one octave above open string 6.',
        find: { note: 'E3' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 12],
        strings: [6],
        explain: 'Fret 12 of string 6: the {n:E} one octave above the open low {n:E}.',
      },
    },
    { id: 'fret-12-halfway', front: 'Where does fret 12 sit on the string?', back: 'Halfway between the nut and the bridge: half the length, so twice the speed.' },
  ],
};

const toneColour: Lesson = {
  id: 'tone-colour',
  title: 'Tone colour',
  teaches: 'Timbre (tone colour) is the character of a sound: it changes with the instrument and where you pluck.',
  minutes: 3,
  skill: `theory:${U}:tone-colour`,
  steps: [
    {
      type: 'card',
      title: 'Same note, different sound',
      body: 'Play {n:A} on a guitar and the same {n:A} on a piano: you can tell them apart at once. That character of a sound is its {t:timbre}, or **tone colour**. It is neither pitch nor volume.',
      figure: { kind: 'keyboard', keys: [{ note: 'A3', label: 'A', role: 'root' }], from: 'C3', to: 'B3', caption: 'The same {n:A} on a piano sounds unlike a guitar.' },
    },
    {
      type: 'true-false',
      statement: 'A guitar and a piano playing the same note have the same pitch but a different timbre.',
      answer: true,
      explain: 'Same note, same pitch; what tells them apart is their tone colour, the timbre.',
      fact: 'timbre-meaning',
    },
    {
      type: 'card',
      title: 'Where you pluck',
      body: 'Play string 3 at fret 2 and pluck it near the bridge, then over the end of the neck. Near the bridge it sounds **brighter** and thinner; over the neck, **warmer** and rounder. Same note, new colour.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        dots: [{ string: 3, fret: 2, note: 'A3', role: 'root' }],
        caption: 'String 3, fret 2: {n:A}.',
      },
      tip: 'Move your picking hand a few centimetres at a time from the bridge toward the neck and listen to the colour change.',
    },
    {
      type: 'true-false',
      statement: 'Changing where you pluck changes the name of the note.',
      answer: false,
      explain: 'Where you pluck changes the colour, never the note: string 3 at fret 2 is {n:A} wherever you pluck it.',
      fact: 'pluck-position',
    },
    {
      type: 'card',
      title: 'Why the colour changes',
      body: 'A plucked string vibrates in several ways at once: as a whole, in halves, in thirds and more. The mix of those vibrations is the colour. Plucking near the bridge adds more of the fast, small ones, so the sound gets brighter.',
    },
    {
      type: 'choice',
      prompt: 'You pluck near the bridge instead of over the neck. What changes?',
      options: [
        { text: 'The tone colour: it gets brighter', correct: true },
        { text: 'The pitch: it gets higher', why: 'The string still vibrates at the same speed, so the pitch stays the same.' },
        { text: 'The note name', why: 'Same fret, same string, same note: only its colour changes.' },
      ],
      shuffle: false,
      explain: 'Plucking near the bridge changes the mix of vibrations, so the tone colour gets brighter. The note stays the same.',
      fact: 'pluck-position',
    },
    {
      type: 'listen-choice',
      prompt: 'The same {n:A} is played on two different strings. Listen: is it the same note?',
      sound: { kind: 'tab', notes: [{ string: 3, fret: 2, duration: 'h' }, { string: 5, fret: 12, duration: 'h' }], tempo: 70 },
      options: [
        { text: 'Yes: the same note, a different colour', correct: true },
        { text: 'No: the second was higher' },
        { text: 'No: the second was lower' },
      ],
      shuffle: false,
      explain: 'Both were {n:A} at the same pitch: string 3 at fret 2, then string 5 at fret 12. The thick string, played high up, sounds warmer and rounder.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each word with what it describes.',
      pairs: [
        { left: 'Pitch', right: 'High or low' },
        { left: 'Volume', right: 'Loud or soft' },
        { left: 'Timbre', right: 'Tone colour' },
      ],
      explain: 'Three different things about one sound: how high (pitch), how loud (volume) and what colour (timbre).',
    },
    {
      type: 'choice',
      prompt: 'What gives each instrument its own tone colour?',
      options: [
        { text: 'The mix of ways it vibrates at once', correct: true },
        { text: 'How loudly it is played', why: 'Volume changes how loud it is, not whose sound it is.' },
        { text: 'How high its notes are', why: 'A guitar and a piano can play the very same pitch and still sound different.' },
      ],
      shuffle: false,
      explain: 'Every instrument vibrates in several ways at once, and its own mix of those vibrations is its colour.',
      fact: 'timbre-mix',
    },
  ],
  facts: [
    { id: 'timbre-meaning', front: 'What is timbre?', back: 'Tone colour: what lets you tell a guitar from a piano playing the same note.' },
    {
      id: 'timbre-mix',
      front: 'Why does each instrument have its own tone colour?',
      back: 'Its string vibrates in several ways at once, and the mix of those vibrations gives it its colour.',
    },
    {
      id: 'pluck-position',
      front: 'How does plucking near the bridge sound, compared with over the end of the neck?',
      back: 'Near the bridge: brighter and thinner. Over the end of the neck: warmer and rounder. The note stays the same.',
    },
  ],
};

/** Unit 1 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Sound and pitch',
  theme: 'basics',
  description: 'What a musical note is, why some notes sound high and others low, and what a fret does to a string.',
  lessons: [aSoundIsAVibration, pitchHighAndLow, loudIsNotHigh, fretsShortenTheString, theOctave, toneColour],
  checkpoint: {
    maxMistakes: 2,
    steps: [
      {
        type: 'match-pairs',
        prompt: 'Match each word with what it describes.',
        pairs: [
          { left: 'Pitch', right: 'High or low' },
          { left: 'Volume', right: 'Loud or soft' },
          { left: 'Timbre', right: 'Tone colour' },
          { left: 'Dynamics', right: 'Changes of volume' },
        ],
        explain: 'Pitch is height, volume is loudness, timbre is colour, and dynamics are the changes of volume in music.',
      },
      {
        type: 'choice',
        prompt: 'A string starts to vibrate faster. What happens to its sound?',
        options: [
          { text: 'It sounds higher', correct: true },
          { text: 'It sounds lower', why: 'Slower vibrations sound lower; faster ones sound higher.' },
          { text: 'It only gets louder', why: 'Loudness comes from how wide the string swings, not how fast.' },
        ],
        shuffle: false,
        explain: 'A faster vibration sounds higher.',
      },
      {
        type: 'true-false',
        statement: 'A string vibrating 200 times a second sounds lower than one vibrating 100 times a second.',
        answer: false,
        explain: '200 times a second is faster, so it sounds higher: one octave higher, in fact.',
      },
      {
        type: 'order',
        prompt: 'Put these string 2 positions in order, from the lowest pitch to the highest.',
        tiles: ['Open', 'Fret 2', 'Fret 5', 'Fret 7'],
        explain: 'The higher the fret, the shorter the vibrating part of the string and the higher the note.',
      },
      {
        type: 'true-false',
        statement: 'Fret 1 is the fret nearest the nut.',
        answer: true,
        explain: 'Frets are numbered from the nut, at the headstock end, toward the body.',
      },
      {
        type: 'choice',
        prompt: 'You pluck a string harder. What changes?',
        options: [
          { text: 'Only the volume', correct: true },
          { text: 'Only the pitch', why: 'The vibration keeps its speed, so the pitch stays the same.' },
          { text: 'The note name', why: 'Same string, same fret, same note: only louder.' },
        ],
        shuffle: false,
        explain: 'A harder pluck makes a wider swing at the same speed: louder, same note.',
      },
      {
        type: 'choice',
        prompt: 'An {n:E} vibrates about 82 times a second. About how fast does the {n:E} one octave higher vibrate?',
        options: [
          { text: 'About 41 times a second', why: 'That is the octave below: half as fast.' },
          { text: 'About 92 times a second', why: 'An octave doubles the speed; it does not add a little.' },
          { text: 'About 165 times a second', correct: true },
          { text: 'About 330 times a second', why: 'That is four times as fast: two octaves up.' },
        ],
        shuffle: false,
        explain: 'One octave up is exactly twice as fast: 82.4 × 2 = 164.8, about 165 times a second.',
      },
      {
        type: 'fretboard-find',
        prompt: 'Tap the note one octave above open string 4.',
        find: { note: 'D4' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 12],
        strings: [4],
        explain: 'Fret 12 of string 4 is the {n:D} one octave above the open string.',
      },
      {
        type: 'true-false',
        statement: 'Two notes an octave apart have the same letter name.',
        answer: true,
        explain: 'An octave is the same note at another height, so the letter name is the same.',
      },
      {
        type: 'choice',
        prompt: 'What changes when you pluck near the bridge instead of over the neck?',
        options: [
          { text: 'The tone colour', correct: true },
          { text: 'The pitch', why: 'The string vibrates at the same speed wherever you pluck it.' },
          { text: 'The note name', why: 'Same string, same fret, same note.' },
        ],
        shuffle: false,
        explain: 'Near the bridge the tone is brighter, over the neck warmer: the timbre changes, the note does not.',
      },
      { generate: 'higher-lower', params: { maxSemitones: 12, minSemitones: 3 } },
      { generate: 'higher-lower', params: { maxSemitones: 7, minSemitones: 2 } },
    ],
  },
};

export default unit;

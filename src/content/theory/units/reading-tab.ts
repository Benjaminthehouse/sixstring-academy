/**
 * Theory Path, unit 5: Reading tab. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `reading-tab`), one lesson per entry, in order: each
 * lesson opens with the "on the guitar" picture, asks the planned exercises and turns every planned
 * fact into a review card. `reading-tab.test.ts` cross-checks every fret, pitch and rhythm the text
 * quotes against the engines.
 *
 * What the tab figure cannot draw, and what these lessons do instead (README, "Known limits"):
 * - a column of stacked numbers (a chord): the column is spelled out in words and shown on the
 *   neck, which is drawn the same way up as tab (string 1 on top), and strummed as audio;
 * - technique marks (h p / \ b ~) and the x of a muted note: written in the text as tab writes
 *   them (5h7, 7p5, 5/7, 7\5, 7b9, 7~), with the frets on the neck; no audio, because the synth
 *   would pick every note and a hammer-on, slide or bend would sound wrong;
 * - rhythm stems under the numbers: the tab is paired with a rhythm figure of the same line.
 */
import type { Lesson, TabNote, Unit } from '@/lessons';

const U = 'reading-tab';

const note = (string: number, fret: number, duration = 'q'): TabNote => ({ string, fret, duration });

/** The six open strings, one per line, from the top line (string 1) down. */
const OPEN_STRINGS: TabNote[] = [1, 2, 3, 4, 5, 6].map((s) => note(s, 0));
/** The numbers-are-frets snippet: E4 F4 G4 C4. */
const SNIPPET: TabNote[] = [note(1, 0), note(1, 1), note(1, 3), note(2, 1)];
/** The C chord column read as a row, string 5 up to string 1. */
const C_SPREAD: TabNote[] = [note(5, 3, 'e'), note(4, 2, 'e'), note(3, 0, 'e'), note(2, 1, 'e'), note(1, 0, 'h.')];
/** The tab-and-rhythm line on string 1: 0 1 3 1 as quarter, quarter, half | whole. */
const RHYTHM_LINE: TabNote[] = [note(1, 0), note(1, 1), note(1, 3, 'h'), note(1, 1, 'w')];

/** Beethoven's "Ode to Joy" (public domain), first four-bar phrase, in C on strings 1 and 2. */
const ODE_BAR_1: TabNote[] = [note(1, 0), note(1, 0), note(1, 1), note(1, 3)];
const ODE_BAR_2: TabNote[] = [note(1, 3), note(1, 1), note(1, 0), note(2, 3)];
const ODE_BAR_3: TabNote[] = [note(2, 1), note(2, 1), note(2, 3), note(1, 0)];
const ODE_BAR_4: TabNote[] = [note(1, 0, 'q.'), note(2, 3, 'e'), note(2, 3, 'h')];
const ODE: TabNote[] = [...ODE_BAR_1, ...ODE_BAR_2, ...ODE_BAR_3, ...ODE_BAR_4];

const sixLinesSixStrings: Lesson = {
  id: 'six-lines-six-strings',
  title: 'Six lines, six strings',
  teaches: 'Tab has six lines, one per string, with string 1 (high E) on top.',
  minutes: 2,
  skill: `theory:${U}:six-lines-six-strings`,
  steps: [
    {
      type: 'card',
      title: 'Six lines, six strings',
      body: '{t:tab|Tab}, short for tablature, is the quickest way to write guitar music. It has **six lines**, one for each string. The **top line is string 1**, the thin high {n:E}. The **bottom line is string 6**, the thick low {n:E}.',
      figure: { kind: 'tab', tempo: 70, notes: OPEN_STRINGS, caption: 'One open string on each line: string 1 at the top, string 6 at the bottom.' },
    },
    {
      type: 'card',
      title: 'High strings on high lines',
      body: 'An easy way to remember it: the **highest-sounding** string sits on the **top** line. That is upside down from your view while you play, where string 6 is nearest your face. Neck pictures in this app are drawn like tab, string 1 on top.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        dots: [
          { string: 1, fret: 0, note: 'E4' },
          { string: 2, fret: 0, note: 'B3' },
          { string: 3, fret: 0, note: 'G3' },
          { string: 4, fret: 0, note: 'D3' },
          { string: 5, fret: 0, note: 'A2' },
          { string: 6, fret: 0, note: 'E2' },
        ],
        caption: 'The six open strings on the neck, string 1 on top.',
      },
      tip: 'Reading tab upside down is the most common first mistake. If a tune sounds wrong, check you started on the right line.',
    },
    {
      type: 'choice',
      prompt: 'Which string is the bottom line of tab?',
      options: [
        { text: 'String 6, the thickest', correct: true },
        { text: 'String 1, the thinnest', why: 'String 1 is the top line: the highest-sounding string sits on the highest line.' },
        { text: 'String 5', why: 'String 5 is the line just above the bottom one.' },
        { text: 'String 2' },
      ],
      explain: 'The bottom line is string 6, the low {n:E}: the lowest-sounding string sits on the lowest line.',
      fact: 'tab-top-line',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each tab line with its string.',
      pairs: [
        { left: 'Top line', right: 'String 1' },
        { left: 'Second line', right: 'String 2' },
        { left: 'Third line', right: 'String 3' },
        { left: 'Bottom line', right: 'String 6' },
      ],
      explain: 'Count down from the top: the lines are strings 1, 2, 3, 4, 5 and 6, so the bottom line is string 6.',
      fact: 'tab-six-lines',
    },
    {
      type: 'true-false',
      statement: 'The top line of tab is the thickest string.',
      answer: false,
      explain: 'The top line is string 1, the thinnest and highest. The thickest string, string 6, is the bottom line.',
      fact: 'tab-top-line',
    },
    {
      type: 'choice',
      prompt: 'Which string is this note on?',
      figure: { kind: 'tab', tempo: 70, notes: [note(2, 0, 'h')] },
      options: [
        { text: 'String 2', correct: true },
        { text: 'String 5', why: 'String 5 is the second line from the bottom. Count from the top line, which is string 1.' },
        { text: 'String 1', why: 'String 1 is the top line; this note is one line lower.' },
        { text: 'String 3' },
      ],
      explain: 'The note sits on the second line from the top, so it is on string 2, the {n:B} string.',
    },
    {
      type: 'order',
      prompt: 'Tab often labels its lines with the string names. Put them in order, top line first.',
      tiles: ['{n:E}', '{n:B}', '{n:G}', '{n:D}', '{n:A}', '{n:E}'],
      explain: 'From the top line down: e B G D A E, strings 1 to 6. The top one is often written as a small e, to tell the high {n:E} from the low one.',
      fact: 'tab-line-labels',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the open string that the fifth line from the top stands for.',
      find: { note: 'A2' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 3],
      explain: 'The fifth line from the top is string 5, the {n:A} string: one line above the bottom.',
    },
  ],
  facts: [
    { id: 'tab-six-lines', front: 'What do the six lines of tab stand for?', back: 'The six strings of the guitar: one line for each string.' },
    {
      id: 'tab-top-line',
      front: 'In tab, which string is the top line? Which is the bottom line?',
      back: 'The top line is string 1, the high {n:E}. The bottom line is string 6, the low {n:E}.',
      ask: {
        type: 'choice',
        prompt: 'Which string is the top line of tab?',
        options: [
          { text: 'String 1, the thinnest', correct: true },
          { text: 'String 6, the thickest', why: 'String 6 is the bottom line: the lowest-sounding string sits on the lowest line.' },
          { text: 'String 2' },
          { text: 'String 5' },
        ],
        explain: 'The top line is string 1, the high {n:E}: the highest-sounding string sits on the highest line.',
      },
    },
    {
      id: 'tab-line-labels',
      front: 'Tab often labels its lines with letters. Which ones, from the top line down?',
      back: 'e B G D A E: strings 1 to 6. The small e is the high {n:E} string.',
      ask: {
        type: 'order',
        prompt: 'Put the string names in the order tab labels its lines, top line first.',
        tiles: ['{n:E}', '{n:B}', '{n:G}', '{n:D}', '{n:A}', '{n:E}'],
        explain: 'From the top line down: e B G D A E, strings 1 to 6.',
      },
    },
  ],
};

const numbersAreFrets: Lesson = {
  id: 'numbers-are-frets',
  title: 'Numbers are frets',
  teaches: 'A number on a tab line is the fret to press on that string, and 0 means play it open.',
  minutes: 3,
  skill: `theory:${U}:numbers-are-frets`,
  steps: [
    {
      type: 'card',
      title: 'Numbers are frets',
      body: 'A number on a tab line tells you two things. The **line** is the string; the **number** is the {t:fret} to press. A **0** means play the string open, with no finger down. Read tab from **left to right**, like a sentence.',
      figure: { kind: 'tab', tempo: 70, notes: SNIPPET, caption: 'String 1: open, fret 1, fret 3. Then string 2, fret 1.' },
    },
    {
      type: 'card',
      title: 'The same notes on the neck',
      body: 'Here are those four notes on the neck. The open string 1 is {n:E}. Frets 1 and 3 give {n:F} and {n:G}. String 2 at fret 1 is {n:C}. Press just behind each fret.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        dots: [
          { string: 1, fret: 0, note: 'E4' },
          { string: 1, fret: 1, note: 'F4' },
          { string: 1, fret: 3, note: 'G4' },
          { string: 2, fret: 1, note: 'C4' },
        ],
        caption: 'The four notes of the tab, on strings 1 and 2.',
      },
    },
    {
      type: 'choice',
      prompt: 'What does a 0 on the bottom line mean?',
      options: [
        { text: 'Play string 6 open', correct: true },
        { text: 'Play string 1 open', why: 'The bottom line is string 6. String 1 is the top line.' },
        { text: 'Do not play string 6', why: 'A 0 is a note to play: the open string. A string you skip has no number at all.' },
        { text: 'Press string 6 at fret 10', why: 'Fret 10 would be written 10. A 0 means no fret: the open string.' },
      ],
      explain: '0 means fret zero: the string played open, with no finger down. On the bottom line, that is string 6, the low {n:E}.',
      fact: 'tab-zero-open',
    },
    {
      type: 'choice',
      prompt: 'What does this tab tell you to play?',
      figure: { kind: 'tab', tempo: 70, notes: [note(6, 3, 'h')] },
      options: [
        { text: 'String 6, fret 3', correct: true },
        { text: 'String 1, fret 3', why: 'The number is on the bottom line, which is string 6.' },
        { text: 'String 6, three times', why: 'The number is a fret, not how many times to play.' },
        { text: 'String 3, fret 6', why: 'The line is the string and the number is the fret, not the other way round.' },
      ],
      explain: 'The 3 sits on the bottom line, string 6, so press string 6 at fret 3. That note is {n:G}.',
      fact: 'tab-number-is-fret',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the note this tab shows.',
      figure: { kind: 'tab', tempo: 70, notes: [note(2, 3, 'h')] },
      find: { note: 'D4' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 5],
      explain: 'The 3 is on the second line from the top: string 2, fret 3. That note is {n:D}.',
      fact: 'tab-number-is-fret',
    },
    {
      type: 'true-false',
      statement: 'Tab is read from left to right, like words on a page.',
      answer: true,
      explain: 'Left to right, one number after another, the way you read a sentence. A number further to the right is played later.',
      fact: 'tab-left-to-right',
    },
    {
      type: 'play-phrase',
      prompt: 'Play this tab from left to right, one note at a time.',
      notes: SNIPPET,
      octave: 'exact',
      tempo: 60,
      explain: 'String 1 open ({n:E}), fret 1 ({n:F}), fret 3 ({n:G}), then string 2 at fret 1 ({n:C}).',
      alternative: {
        type: 'order',
        prompt: 'Read the tab and put its notes in playing order.',
        figure: { kind: 'tab', tempo: 70, notes: SNIPPET },
        tiles: ['String 1, open', 'String 1, fret 1', 'String 1, fret 3', 'String 2, fret 1'],
        explain: 'Read left to right: string 1 open, fret 1, fret 3, then string 2 at fret 1.',
      },
    },
    {
      type: 'fretboard-find',
      prompt: 'One more: tap the note this tab shows.',
      figure: { kind: 'tab', tempo: 70, notes: [note(5, 2, 'h')] },
      find: { note: 'B2' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 5],
      explain: 'The 2 is on the fifth line from the top: string 5, fret 2. That note is {n:B}.',
    },
  ],
  facts: [
    {
      id: 'tab-number-is-fret',
      front: 'What does a number on a tab line tell you?',
      back: 'The fret to press on that string. The line it sits on is the string.',
      ask: {
        type: 'fretboard-find',
        prompt: 'Tap the note this tab shows.',
        figure: { kind: 'tab', tempo: 70, notes: [note(3, 2, 'h')] },
        find: { note: 'A3' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 5],
        explain: 'The 2 is on the third line from the top: string 3, fret 2. That note is {n:A}.',
      },
    },
    {
      id: 'tab-zero-open',
      front: 'What does a 0 in tab mean?',
      back: 'Play that string open, with no fret pressed.',
      ask: {
        type: 'choice',
        prompt: 'What does a 0 on the top line mean?',
        options: [
          { text: 'Play string 1 open', correct: true },
          { text: 'Play string 6 open', why: 'The top line is string 1. String 6 is the bottom line.' },
          { text: 'Do not play string 1', why: 'A 0 is a note to play: the open string.' },
          { text: 'Rest for one beat', why: 'A 0 is a note, not a rest: the open string.' },
        ],
        explain: '0 means fret zero: play string 1 open, the high {n:E}.',
      },
    },
    { id: 'tab-left-to-right', front: 'Which way do you read tab?', back: 'From left to right, like text.' },
  ],
};

const stackedNumbers: Lesson = {
  id: 'stacked-numbers',
  title: 'Numbers in a column',
  teaches: 'Numbers lined up in one column are played together, which is how tab writes a chord.',
  minutes: 3,
  skill: `theory:${U}:stacked-numbers`,
  steps: [
    {
      type: 'card',
      title: 'Numbers in a column',
      body: 'When numbers sit **one above another**, in a single column, you play them **at the same time**. That is how tab writes a {t:chord}. A common one reads 0, 1, 0, 2, 3 from the top line down, with nothing on the bottom line: string 6 stays silent.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        dots: [
          { string: 1, fret: 0, note: 'E4' },
          { string: 2, fret: 1, note: 'C4' },
          { string: 3, fret: 0, note: 'G3' },
          { string: 4, fret: 2, note: 'E3' },
          { string: 5, fret: 3, note: 'C3' },
        ],
        caption: 'The column 0 1 0 2 3 on the neck: a {c:C} chord. String 6 is not played.',
      },
    },
    {
      type: 'choice',
      prompt: 'Three numbers sit in one column. How do you play them?',
      options: [
        { text: 'All together, at the same time', correct: true },
        { text: 'One after another, top line first', why: 'Numbers that follow each other from left to right are played in turn. A column means together.' },
        { text: 'One after another, bottom line first', why: 'Order only runs from left to right. Numbers in one column sound together.' },
      ],
      shuffle: false,
      explain: 'Numbers lined up in one column are played at the same time, strummed or plucked together. That is how tab writes a chord.',
      fact: 'tab-column-together',
    },
    {
      type: 'card',
      title: 'Spread out, one at a time',
      body: 'Spread the same numbers out from left to right and you play them **one after another** instead. Same notes, different timing: a column sounds together, a row sounds in turn.',
      figure: { kind: 'tab', tempo: 80, notes: C_SPREAD, caption: 'The same five notes spread out: one after another.' },
    },
    {
      type: 'listen-choice',
      prompt: 'Listen. Were these notes played together, like a column, or one after another?',
      sound: { kind: 'chord', chord: 'C', frets: 'x32010', style: 'strum' },
      options: [{ text: 'Together, like a column', correct: true }, { text: 'One after another, like a row' }],
      shuffle: false,
      explain: 'That was the column strummed at once: {n:C} {n:E} {n:G} {n:C} {n:E}, a {c:C} chord.',
    },
    {
      type: 'card',
      title: 'The same chord, standing up',
      body: 'Chord pictures stand the neck upright: the strings run down the page, **string 6 on the left** and **string 1 on the right**, with the nut at the top. Here is that column again as a chord picture. The × above string 6 means it is not played.',
      figure: { kind: 'chord', symbol: 'C', frets: 'x32010', fingers: 'x32010', caption: 'The column 0 1 0 2 3, upright: string 1 is on the right.' },
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'C',
      frets: 'x32010',
      accept: 'this-shape',
      prompt: 'Place your fingers for this column: 0 1 0 2 3 from the top line down, nothing on string 6. String 1 is on the right.',
      hint: 'Work from the right: string 1 is open, string 2 gets fret 1, string 3 is open, and so on.',
      explain: 'Top line down: string 1 open, string 2 fret 1, string 3 open, string 4 fret 2, string 5 fret 3. String 6 has no number, so it is not played. That is a {c:C} chord.',
      fact: 'tab-chord-column',
    },
    {
      type: 'card',
      title: 'x means a muted note',
      body: 'An **x** on a line is a **muted note**. Rest a finger lightly on the string, without pressing it down to the fret, and strike it: you hear a short, dead **click** instead of a note. Players use muted notes to add rhythm.',
      figure: { kind: 'audio', sound: { kind: 'strum', chord: 'C', pattern: 'D-X-D-X-', tempo: 80 }, label: 'Hear strums and muted strums' },
      tip: 'In tab, a string with no number is not played, and an x is played but muted. Chord pictures use × only for a string you do not play.',
    },
    {
      type: 'true-false',
      statement: 'An x on a tab line means play that string open.',
      answer: false,
      explain: 'An open string is written 0. An x is a muted note: the string is touched lightly to deaden it and struck for a percussive click.',
      fact: 'tab-x-muted',
    },
    {
      type: 'choice',
      prompt: 'In a chord column, string 6 has no number at all. What do you do with it?',
      options: [
        { text: 'Leave it out: do not play it', correct: true },
        { text: 'Play it open', why: 'An open string is written 0. No number means it stays silent.' },
        { text: 'Play it muted', why: 'A muted note is written x. No number at all: leave the string out.' },
      ],
      shuffle: false,
      explain: 'Only the strings with a number sound. With nothing on the bottom line, string 6 is not played: for this {c:C} chord you strum from string 5.',
      fact: 'tab-chord-column',
    },
  ],
  facts: [
    {
      id: 'tab-column-together',
      front: 'Numbers are stacked in one tab column. How do you play them?',
      back: 'At the same time, together.',
      ask: {
        type: 'choice',
        prompt: 'Two numbers sit in one tab column. How do you play them?',
        options: [
          { text: 'Together, at the same time', correct: true },
          { text: 'One after another, top line first', why: 'Only numbers placed left to right are played in turn.' },
          { text: 'One after another, bottom line first', why: 'Only numbers placed left to right are played in turn.' },
        ],
        shuffle: false,
        explain: 'Numbers in one column are played at the same time.',
      },
    },
    {
      id: 'tab-chord-column',
      front: 'How does tab write a chord?',
      back: 'As a column of numbers, one for each string that sounds. A string with no number is not played.',
      ask: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Am',
        frets: 'x02210',
        accept: 'this-shape',
        prompt: 'Place your fingers for this column: 0 1 2 2 0 from the top line down, nothing on string 6. String 1 is on the right.',
        explain: 'Top line down: string 1 open, string 2 fret 1, strings 3 and 4 fret 2, string 5 open, string 6 not played. That is an {c:Am} chord.',
      },
    },
    {
      id: 'tab-x-muted',
      front: 'What does an x on a tab line mean?',
      back: 'A muted note: touch the string lightly to deaden it and strike it for a percussive click.',
      ask: {
        type: 'true-false',
        statement: 'In tab, an x is a muted note: a short, dead click instead of a pitch.',
        answer: true,
        explain: 'An x is played but muted: the string is touched lightly, not pressed, so it only clicks.',
      },
    },
  ],
};

const techniqueSymbols: Lesson = {
  id: 'technique-symbols',
  title: 'Slides, hammers and bends',
  teaches: 'Tab marks playing techniques with letters and symbols between or after the fret numbers.',
  minutes: 4,
  skill: `theory:${U}:technique-symbols`,
  steps: [
    {
      type: 'card',
      title: 'h: hammer-on',
      body: 'Tab adds letters and signs to show **how** to play. **h** is a {t:hammer-on}. In 5h7, pick fret 5, then bring another finger down hard on fret 7 of the same string. The string keeps ringing, so the second note sounds **without picking again**.',
      figure: {
        kind: 'fretboard',
        frets: [4, 9],
        labels: 'finger',
        dots: [
          { string: 3, fret: 5, note: 'C4', finger: 1 },
          { string: 3, fret: 7, note: 'D4', finger: 3 },
        ],
        caption: '5h7 on string 3: pick {n:C} at fret 5, hammer {n:D} at fret 7.',
      },
    },
    {
      type: 'choice',
      prompt: 'In 5h7, how many times do you pick the string?',
      options: [
        { text: 'Once', correct: true },
        { text: 'Twice', why: 'Two picks would be written 5 7, two separate numbers. The h means the hammering finger sounds the second note.' },
        { text: 'Three times' },
      ],
      shuffle: false,
      explain: 'Once: pick fret 5, and the hammering finger sounds fret 7 by itself.',
      fact: 'tab-hammer-on',
    },
    {
      type: 'card',
      title: 'p: pull-off',
      body: '**p** is a {t:pull-off}, a hammer-on in reverse. In 7p5, put fingers on frets 5 and 7, pick, then pull the fret 7 finger off with a slight flick. Fret 5, already pressed, rings **without picking again**.',
      figure: {
        kind: 'fretboard',
        frets: [4, 9],
        labels: 'finger',
        dots: [
          { string: 3, fret: 5, note: 'C4', finger: 1 },
          { string: 3, fret: 7, note: 'D4', finger: 3 },
        ],
        caption: '7p5 on string 3: pick {n:D} at fret 7, pull off to {n:C} at fret 5.',
      },
    },
    {
      type: 'true-false',
      statement: 'In 7p5 you pick the string again to play the note at fret 5.',
      answer: false,
      explain: 'The pull-off itself sounds fret 5: lifting the finger with a little flick sets the string ringing. You pick only once, at fret 7.',
      fact: 'tab-pull-off',
    },
    {
      type: 'card',
      title: 'Slides: / and \\',
      body: '**/** means **slide up**. In 5/7, pick fret 5 and keep pressing as you glide the same finger up to fret 7: the pitch rises smoothly. **\\\\** means **slide down**: 7\\\\5 glides from fret 7 back to fret 5.',
      figure: {
        kind: 'fretboard',
        frets: [4, 9],
        dots: [
          { string: 3, fret: 5, note: 'C4' },
          { string: 3, fret: 7, note: 'D4' },
        ],
        caption: '5/7: one pick, one finger gliding from fret 5 to fret 7.',
      },
    },
    {
      type: 'choice',
      prompt: 'What does 5/7 tell you to do?',
      options: [
        { text: 'Pick fret 5, then slide up to fret 7', correct: true },
        { text: 'Pick fret 5, then pick fret 7', why: 'Two picks would be written 5 7. The / means you glide there without picking again.' },
        { text: 'Slide down from fret 7 to fret 5', why: 'Sliding down uses the other slash: 7\\\\5. The / climbs, like the sign.' },
        { text: 'Play frets 5 and 7 together', why: 'Notes played together sit in one column.' },
      ],
      explain: 'The / leans upward: slide up. Pick fret 5 and glide the same finger to fret 7, keeping it pressed so the note keeps ringing.',
      fact: 'tab-slide',
    },
    {
      type: 'card',
      title: 'b: bend, and ~: vibrato',
      body: '**b** is a {t:bend}. In 7b9, pick fret 7 and push the string sideways across the neck until it sounds like fret 9. **~** is {t:vibrato}: a quick, even wobble of the pitch, often on a long note, as in 7~.',
      figure: {
        kind: 'fretboard',
        frets: [4, 9],
        dots: [
          { string: 3, fret: 7, note: 'D4', role: 'root' },
          { string: 3, fret: 9, note: 'E4', role: 'ghost' },
        ],
        caption: '7b9: press fret 7 ({n:D}) and bend until it sounds like fret 9 ({n:E}).',
      },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each tab mark with its technique.',
      pairs: [
        { left: '5h7', right: 'Hammer-on' },
        { left: '7p5', right: 'Pull-off' },
        { left: '5/7', right: 'Slide up' },
        { left: '7b9', right: 'Bend' },
        { left: '7~', right: 'Vibrato' },
      ],
      explain: 'h hammers on, p pulls off, / slides up (and \\\\ slides down), b bends and ~ adds vibrato.',
    },
    {
      type: 'choice',
      prompt: 'In 7b9, which fret do you press?',
      options: [
        { text: 'Fret 7 only', correct: true },
        { text: 'Fret 9 only', why: '9 is the pitch to reach. Your finger stays on fret 7 and the push raises the note.' },
        { text: 'Fret 7, then fret 9', why: 'Moving to fret 9 would be a hammer-on or a slide. In a bend the finger never leaves fret 7.' },
      ],
      shuffle: false,
      explain: 'Press fret 7 and push the string sideways: the note rises until it sounds like fret 9, though your finger never moves to fret 9.',
      fact: 'tab-bend',
    },
    {
      type: 'play-phrase',
      prompt: 'Play 5h7 on string 3: pick fret 5 once, then hammer fret 7.',
      notes: [note(3, 5), note(3, 7, 'h')],
      octave: 'exact',
      tempo: 60,
      explain: 'One pick: {n:C} at fret 5 rings, then your third finger lands hard on fret 7 and {n:D} sounds without a second pick.',
      alternative: {
        type: 'choice',
        prompt: 'You play 5h7 on string 3. What do you do after picking fret 5?',
        options: [
          { text: 'Bring a finger down hard on fret 7', correct: true },
          { text: 'Pick fret 7', why: 'That would be written 5 7. The h means no second pick.' },
          { text: 'Slide up to fret 7', why: 'A slide is written 5/7.' },
          { text: 'Bend fret 5 until it sounds like fret 7', why: 'A bend is written with b: 5b7.' },
        ],
        explain: 'In a hammer-on the fretting finger sounds the second note: bring it down hard on fret 7 and the string keeps ringing.',
      },
    },
    {
      type: 'choice',
      prompt: 'A long note is written 7~. What does the ~ ask for?',
      options: [
        { text: 'Vibrato: a quick, even wobble of the pitch', correct: true },
        { text: 'A slide up from fret 7', why: 'A slide up is written with /, as in 7/9.' },
        { text: 'A second pick of fret 7', why: 'Picking again would be written as another 7.' },
        { text: 'Letting the note fade out', why: 'Long notes do fade, but ~ asks for movement: a gentle, even wobble.' },
      ],
      explain: 'The wavy line looks like what it asks for: wobble the string slightly with your fretting finger so the pitch moves quickly and evenly.',
      fact: 'tab-vibrato',
    },
  ],
  facts: [
    {
      id: 'tab-hammer-on',
      front: 'What does h mean in tab, as in 5h7?',
      back: 'Hammer-on: pick fret 5, then bring a finger down hard on fret 7 of the same string, so it sounds without picking again.',
      ask: {
        type: 'choice',
        prompt: 'In 5h7, how many times do you pick the string?',
        options: [{ text: 'Once', correct: true }, { text: 'Twice', why: 'Two picks would be written 5 7.' }, { text: 'Three times' }],
        shuffle: false,
        explain: 'Once: the hammering finger sounds fret 7 by itself.',
      },
    },
    {
      id: 'tab-pull-off',
      front: 'What does p mean in tab, as in 7p5?',
      back: 'Pull-off: with fret 5 already pressed, pick fret 7 and pull that finger off, so fret 5 sounds without picking again.',
    },
    {
      id: 'tab-slide',
      front: 'In tab, what do / and \\\\ mean?',
      back: '/ is a slide up and \\\\ a slide down: keep pressing and glide along the string, as in 5/7 or 7\\\\5.',
    },
    {
      id: 'tab-bend',
      front: 'What does 7b9 mean in tab?',
      back: 'Bend: pick fret 7 and push the string sideways until it sounds like fret 9.',
      ask: {
        type: 'choice',
        prompt: 'In 7b9, which fret do you press?',
        options: [
          { text: 'Fret 7 only', correct: true },
          { text: 'Fret 9 only', why: '9 is the pitch to reach; the finger stays on fret 7.' },
          { text: 'Fret 7, then fret 9', why: 'In a bend the finger never leaves fret 7.' },
        ],
        shuffle: false,
        explain: 'Press fret 7 and push the string sideways until it sounds like fret 9.',
      },
    },
    { id: 'tab-vibrato', front: 'What does ~ mean in tab?', back: 'Vibrato: a quick, even wobble of the pitch.' },
  ],
};

const tabAndRhythm: Lesson = {
  id: 'tab-and-rhythm',
  title: 'What tab does not tell you',
  teaches: 'Plain tab shows where to play but usually not how long; rhythm comes from stems, notation or listening.',
  minutes: 3,
  skill: `theory:${U}:tab-and-rhythm`,
  steps: [
    {
      type: 'card',
      title: 'Where, not how long',
      body: 'Tab tells you **where** to play: the string and the fret. Plain tab usually does **not** tell you **how long** each note lasts. The gaps between the numbers can hint at it, but only roughly.',
      figure: { kind: 'tab', tempo: 70, notes: RHYTHM_LINE, caption: 'Plain tab: string 1, frets 0 1 3 1. How long is each note?' },
    },
    {
      type: 'card',
      title: 'Rhythm under the tab',
      body: 'Some tab adds **stems** and beams under the numbers, written like ordinary {t:note-value|note values}. Under this line they read: quarter, quarter, half, then a whole note in the next bar. Now you know exactly how long each note lasts.',
      figure: { kind: 'rhythm', pattern: 'q q h | w', tempo: 70, caption: 'The rhythm printed under the same four numbers.' },
    },
    {
      type: 'true-false',
      statement: 'Plain tab always shows the exact rhythm.',
      answer: false,
      explain: 'Plain tab shows the string and fret. How long each note lasts usually comes from stems under the tab, from notation, or from listening.',
      fact: 'tab-no-rhythm',
    },
    {
      type: 'choice',
      prompt: 'This rhythm is printed under a four-note tab line. How long is the third note?',
      figure: { kind: 'rhythm', pattern: 'q q h | w', tempo: 70 },
      options: [
        { text: 'A half note: two beats', correct: true },
        { text: 'A quarter note: one beat', why: 'The first two notes are quarter notes; the third is longer.' },
        { text: 'A whole note: four beats', why: 'The whole note is the fourth one, filling the next bar.' },
      ],
      shuffle: false,
      explain: 'Quarter, quarter, then a half note of two beats. The fourth note is a whole note that fills the next bar.',
      fact: 'tab-rhythm-stems',
    },
    {
      type: 'choice',
      prompt: 'In plain tab, two numbers have a wide gap between them. What does that tell you for sure?',
      options: [
        { text: 'Nothing exact: spacing is only a rough guide', correct: true },
        { text: 'The first note lasts exactly two beats', why: 'It may well be longer, but plain tab cannot say how long. Stems or notation can.' },
        { text: 'There is a rest between them', why: 'Maybe, maybe not: plain tab spacing is too rough to tell.' },
      ],
      explain: 'Spacing in plain tab is only a rough guide. Wider often means longer, but for the exact rhythm you need stems, notation or a recording.',
      fact: 'tab-spacing-rough',
    },
    {
      type: 'choice',
      prompt: 'A tab shows only numbers. Where can the rhythm come from? Pick every right answer.',
      multiple: true,
      options: [
        { text: 'Stems and beams under the tab', correct: true },
        { text: 'Standard notation printed above it', correct: true },
        { text: 'Listening to the music', correct: true },
        { text: 'The size of the numbers', why: 'Every number is printed the same size; it only names a fret.' },
      ],
      explain: 'Rhythm can come from stems under the tab, from standard notation, or from listening. The numbers themselves only say where to play.',
    },
    {
      type: 'listen-choice',
      prompt: 'Listen to this line on string 1. Which rhythm matches it?',
      sound: { kind: 'tab', notes: RHYTHM_LINE, tempo: 70 },
      options: [
        { figure: { kind: 'rhythm', pattern: 'q q h | w' }, correct: true },
        { figure: { kind: 'rhythm', pattern: 'h q q | w' } },
        { figure: { kind: 'rhythm', pattern: 'q h q | w' } },
      ],
      explain: 'Quarter, quarter, half, then a whole note: two short notes, a longer one, and the last note held for a whole bar.',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap the rhythm under this tab: quarter, quarter, half.',
      figure: { kind: 'tab', tempo: 70, notes: [note(1, 0), note(1, 1), note(1, 3, 'h')] },
      rhythm: { pattern: 'q q h' },
      tempo: 70,
      show: 'both',
      explain: 'Count 1, 2, 3, 4: tap on 1 and on 2, then tap on 3 and let it last through 4.',
    },
    { generate: 'rhythm-ear', params: { values: ['quarter', 'half'], tempo: 70 } },
  ],
  facts: [
    {
      id: 'tab-no-rhythm',
      front: 'What does plain tab usually leave out?',
      back: 'How long each note lasts: it shows the string and fret, not the rhythm.',
      ask: {
        type: 'true-false',
        statement: 'Plain tab usually shows how long each note lasts.',
        answer: false,
        explain: 'Plain tab shows the string and fret; the rhythm comes from stems, notation or listening.',
      },
    },
    { id: 'tab-rhythm-stems', front: 'How can tab show rhythm?', back: 'Some tab adds stems and beams under the numbers, written like ordinary note values.' },
    {
      id: 'tab-spacing-rough',
      front: 'How exact is the spacing between numbers in plain tab?',
      back: 'Only a rough guide to timing. For the exact rhythm you need stems, notation or a recording.',
      ask: {
        type: 'choice',
        prompt: 'In plain tab, two numbers have a wide gap between them. What does that tell you for sure?',
        options: [
          { text: 'Nothing exact: spacing is only a rough guide', correct: true },
          { text: 'The first note lasts exactly two beats', why: 'Plain tab cannot say how long; stems or notation can.' },
          { text: 'There is a rest between them', why: 'Plain tab spacing is too rough to tell.' },
        ],
        explain: 'Spacing in plain tab is only a rough guide to timing.',
      },
    },
  ],
};

const firstTabTune: Lesson = {
  id: 'first-tab-tune',
  title: 'Your first tab tune',
  teaches: 'A melody is a line of single notes built from phrases; tab lets you play one, string and fret for each note.',
  minutes: 4,
  skill: `theory:${U}:first-tab-tune`,
  steps: [
    {
      type: 'card',
      title: 'A melody in tab',
      body: 'A {t:melody} is a line of **single notes** heard as a tune: the part you could sing. Here is the start of *Ode to Joy* by Beethoven, on strings 1 and 2. Read it one number at a time: the line gives the string, the number gives the fret.',
      figure: { kind: 'tab', tempo: 70, notes: ODE, caption: 'Ode to Joy, first phrase, at 70 beats per minute.' },
    },
    {
      type: 'choice',
      prompt: 'What is a melody?',
      options: [
        { text: 'A line of single notes heard as a tune', correct: true },
        { text: 'Several notes played at the same time', why: 'Notes played together make a chord. A melody is one note after another.' },
        { text: 'The steady beat you tap your foot to', why: 'That is the beat. The melody is the tune on top of it.' },
      ],
      explain: 'A melody is a series of single notes heard as a tune, like this one from *Ode to Joy*.',
      fact: 'tab-melody',
    },
    {
      type: 'card',
      title: 'Phrases',
      body: 'Melodies are built from {t:phrase|phrases}: musical sentences, each ending with a small pause or a longer note. Many melodies use **four-bar phrases**. This one is four bars long and ends on a long {n:D}, like a comma before the next sentence.',
    },
    {
      type: 'true-false',
      statement: 'Many melodies are built from four-bar phrases.',
      answer: true,
      explain: 'Four bars is the most common phrase length. The first phrase of *Ode to Joy* is four bars long, and so is each phrase after it.',
      fact: 'tab-phrase',
    },
    {
      type: 'order',
      prompt: 'This is bar 2 of the tune. Put its notes in playing order.',
      figure: { kind: 'tab', tempo: 70, notes: ODE_BAR_2 },
      tiles: ['String 1, fret 3', 'String 1, fret 1', 'String 1, open', 'String 2, fret 3'],
      explain: 'Left to right: string 1 at fret 3 ({n:G}), fret 1 ({n:F}), open ({n:E}), then down to string 2, fret 3 ({n:D}).',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the highest note of the phrase.',
      figure: { kind: 'tab', tempo: 70, notes: ODE },
      find: { note: 'G4' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 5],
      explain: 'The highest note is string 1, fret 3: {n:G}. String 1 is the highest string, and fret 3 is the highest fret the tune uses on it.',
    },
    {
      type: 'choice',
      prompt: 'The tune moves between strings 1 and 2. How do you know which string each note is on?',
      options: [
        { text: 'From the line the number sits on', correct: true },
        { text: 'From the size of the number', why: 'Every number is printed the same size; it names the fret.' },
        { text: 'You choose any string you like', why: 'A note can often be played elsewhere too, but the tab has chosen for you: the line says which string.' },
      ],
      explain: 'The line is the string. The tune dips down to string 2 for its low notes, {n:D} and {n:C}, then comes back to string 1.',
      fact: 'tab-melody-strings',
    },
    {
      type: 'play-phrase',
      prompt: 'Play the first phrase of *Ode to Joy* from the tab, slowly and evenly.',
      notes: ODE,
      octave: 'exact',
      tempo: 70,
      explain: 'Bar 1: {n:E} {n:E} {n:F} {n:G}. Bar 2: {n:G} {n:F} {n:E} {n:D}. Bar 3: {n:C} {n:C} {n:D} {n:E}. Bar 4: {n:E}, {n:D}, and a long {n:D}.',
      alternative: {
        type: 'order',
        prompt: 'This is bar 3. Put its notes in playing order.',
        figure: { kind: 'tab', tempo: 70, notes: ODE_BAR_3 },
        tiles: ['String 2, fret 1', 'String 2, fret 1', 'String 2, fret 3', 'String 1, open'],
        explain: 'Left to right: string 2 at fret 1 twice ({n:C} {n:C}), fret 3 ({n:D}), then the open string 1 ({n:E}).',
      },
    },
  ],
  facts: [
    {
      id: 'tab-melody',
      front: 'What is a melody?',
      back: 'A series of single notes heard as a tune.',
      ask: {
        type: 'choice',
        prompt: 'What is a melody?',
        options: [
          { text: 'A line of single notes heard as a tune', correct: true },
          { text: 'Several notes played at the same time', why: 'Notes played together make a chord.' },
          { text: 'The steady beat you tap your foot to', why: 'That is the beat.' },
        ],
        explain: 'A melody is a series of single notes heard as a tune.',
      },
    },
    { id: 'tab-phrase', front: 'What is a phrase in music?', back: 'A musical sentence. Many melodies are built from four-bar phrases.' },
    {
      id: 'tab-melody-strings',
      front: 'A melody moves between strings. How does tab tell you which string each note is on?',
      back: 'By the line each number sits on: the line is the string, the number is the fret.',
    },
  ],
};

/** Unit 5 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Reading tab',
  theme: 'reading',
  description: 'Read guitar tablature: strings, frets, chords, technique symbols and rhythm.',
  lessons: [sixLinesSixStrings, numbersAreFrets, stackedNumbers, techniqueSymbols, tabAndRhythm, firstTabTune],
  checkpoint: {
    maxMistakes: 2,
    steps: [
      {
        type: 'choice',
        prompt: 'Which string is the top line of tab?',
        options: [
          { text: 'String 1, the thinnest', correct: true },
          { text: 'String 6, the thickest', why: 'String 6 is the bottom line.' },
          { text: 'String 2' },
          { text: 'String 5' },
        ],
        explain: 'The top line is string 1, the high {n:E}; the bottom line is string 6.',
      },
      {
        type: 'choice',
        prompt: 'What does this tab tell you to play?',
        figure: { kind: 'tab', tempo: 70, notes: [note(4, 2, 'h')] },
        options: [
          { text: 'String 4, fret 2', correct: true },
          { text: 'String 3, fret 2', why: 'Count the lines from the top: this one is the fourth.' },
          { text: 'String 2, fret 4', why: 'The line is the string and the number is the fret.' },
          { text: 'String 4, twice', why: 'The number is a fret, not a count.' },
        ],
        explain: 'The 2 sits on the fourth line from the top: string 4, fret 2. That note is {n:E}.',
      },
      {
        type: 'fretboard-find',
        prompt: 'Tap the note this tab shows.',
        figure: { kind: 'tab', tempo: 70, notes: [note(5, 3, 'h')] },
        find: { note: 'C3' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 5],
        explain: 'The 3 is on the fifth line from the top: string 5, fret 3. That note is {n:C}.',
      },
      {
        type: 'choice',
        prompt: 'What does a 0 on a tab line mean?',
        options: [
          { text: 'Play that string open', correct: true },
          { text: 'Do not play that string', why: 'A string you skip has no number. A 0 is the open string.' },
          { text: 'Rest for one beat', why: 'A 0 is a note: the open string.' },
        ],
        shuffle: false,
        explain: '0 means fret zero: the string played open.',
      },
      {
        type: 'choice',
        prompt: 'Four numbers sit in one column. How do you play them?',
        options: [
          { text: 'All together, at the same time', correct: true },
          { text: 'One after another, top line first', why: 'Only numbers placed left to right are played in turn.' },
          { text: 'One after another, bottom line first', why: 'Only numbers placed left to right are played in turn.' },
        ],
        shuffle: false,
        explain: 'A column is played together: that is how tab writes a chord.',
      },
      {
        type: 'true-false',
        statement: 'An x on a tab line is a muted note: a short, dead click instead of a pitch.',
        answer: true,
        explain: 'An x is played but muted: the string is touched lightly, not pressed, and struck.',
      },
      {
        type: 'match-pairs',
        prompt: 'Match each tab mark with its technique.',
        pairs: [
          { left: '5h7', right: 'Hammer-on' },
          { left: '7p5', right: 'Pull-off' },
          { left: '5/7', right: 'Slide up' },
          { left: '7\\\\5', right: 'Slide down' },
          { left: '7b9', right: 'Bend' },
          { left: '7~', right: 'Vibrato' },
        ],
        explain: 'h hammers on, p pulls off, / slides up, \\\\ slides down, b bends and ~ adds vibrato.',
      },
      {
        type: 'choice',
        prompt: 'In 5h7, how many times do you pick the string?',
        options: [{ text: 'Once', correct: true }, { text: 'Twice', why: 'Two picks would be written 5 7.' }, { text: 'Three times' }],
        shuffle: false,
        explain: 'Once: the hammering finger sounds fret 7 without a second pick.',
      },
      {
        type: 'true-false',
        statement: 'Plain tab usually shows how long each note lasts.',
        answer: false,
        explain: 'Plain tab shows the string and the fret. The rhythm comes from stems under the tab, from notation, or from listening.',
      },
      {
        type: 'order',
        prompt: 'Read this tab and put its notes in playing order.',
        figure: { kind: 'tab', tempo: 70, notes: ODE_BAR_1 },
        tiles: ['String 1, open', 'String 1, open', 'String 1, fret 1', 'String 1, fret 3'],
        explain: 'Left to right: the open string 1 twice, then fret 1 and fret 3: {n:E} {n:E} {n:F} {n:G}.',
      },
      {
        type: 'fretboard-find',
        prompt: 'Tap the last note of this phrase.',
        figure: { kind: 'tab', tempo: 70, notes: ODE },
        find: { note: 'D4' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 5],
        explain: 'The phrase ends on string 2, fret 3: a long {n:D}.',
      },
      {
        type: 'play-phrase',
        prompt: 'Play this four-bar phrase from the tab: the start of *Ode to Joy*.',
        notes: ODE,
        octave: 'exact',
        tempo: 70,
        explain: '{n:E} {n:E} {n:F} {n:G}, {n:G} {n:F} {n:E} {n:D}, {n:C} {n:C} {n:D} {n:E}, {n:E} {n:D} {n:D}.',
        alternative: {
          type: 'order',
          prompt: 'Read bar 2 of the tune and put its notes in playing order.',
          figure: { kind: 'tab', tempo: 70, notes: ODE_BAR_2 },
          tiles: ['String 1, fret 3', 'String 1, fret 1', 'String 1, open', 'String 2, fret 3'],
          explain: 'Left to right: string 1 at frets 3, 1 and 0, then string 2 at fret 3: {n:G} {n:F} {n:E} {n:D}.',
        },
      },
    ],
  },
};

export default unit;

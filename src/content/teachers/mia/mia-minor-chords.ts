/**
 * Mia, unit 6: Minor chords, minor songs (plan: `mia/mia-minor-chords` in src/content/plan/teachers.json).
 *
 * The C to Am change with two fingers that stay, Dm and E again (the chord that leads home to Am),
 * a minor-key song on Am, Dm and E7, B7 with finger 2 as the anchor, the three chords of E minor,
 * and a review of major and minor: one note, the third, one fret apart. Every lesson follows its
 * plan entry: the plan's `explain` in Mia's voice on the cards, its `show` as figures, its
 * `practice` as exercises (`Mic` with a tapping alternative) or tasks that send the learner to the
 * Player, Rhythm, Ear Training, Progressions or the chord trainer and back.
 *
 * Music from the song library: Change: C-Am and Am-Dm (72 BPM), Change: Am-E and E-B7 (72),
 * Change: Em-Am and Em-B7 (80) and Korobeiniki (100). Four planned songs are not in the library:
 * their tasks name the planned song and fall back until it lands. Go, Down Moses jams on Am, Dm and
 * E7 (`classical-minor-cadence` in A minor: i iv V7 i), Wade in the Water on Em, Am and B7 (the
 * same progression in E minor), God Rest Ye Merry, Gentlemen plays O Come, All Ye Faithful (a
 * level-3 carol on five of its six chords) and We Three Kings jams on Em, C, G and D
 * (`minor-i-bvi-biii-bvii` in E minor, the minor key leaning toward its relative major).
 * `mia-minor-chords.test.ts` checks the shapes, the shared and changed notes, the keys and the
 * library's studies.
 */
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, toolTask } from '../tasks';

// ── 1. C to Am: the finger that moves ───────────────────────────────────────────────────────────

const amAndC: TeacherLesson = {
  id: 'am-and-c',
  title: 'C to A minor: the finger that moves',
  teaches: 'From C to A minor, fingers 1 and 2 stay put and only finger 3 moves: the chords share C and E.',
  minutes: 5,
  skill: 'teacher:mia:am-and-c',
  steps: [
    {
      type: 'card',
      title: 'C meets A minor',
      body: 'You know {c:Am} from your first week; today it meets {c:C}. Put them side by side: fingers 1 and 2 stay in exactly the same place, string 2, fret 1 ({n:C}) and string 4, fret 2 ({n:E}). Only finger 3 moves, from string 5, fret 3 ({n:C}) to string 3, fret 2 ({n:A}).',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        labels: 'finger',
        dots: [
          { string: 2, fret: 1, note: 'C4', finger: 1 },
          { string: 4, fret: 2, note: 'E3', finger: 2 },
          { string: 5, fret: 3, note: 'C3', finger: 3, role: 'ghost' },
          { string: 3, fret: 2, note: 'A3', finger: 3, role: 'target' },
        ],
        caption: 'Fingers 1 and 2 stay. Finger 3 moves from the faint dot ({c:C}) to string 3 ({c:Am}).',
      },
    },
    {
      type: 'choice',
      prompt: 'Going from {c:C} to {c:Am}, which finger moves?',
      options: [
        { text: 'Finger 3, from string 5 to string 3', correct: true },
        { text: 'Finger 1, from string 2 to string 1', why: 'Finger 1 stays on string 2, fret 1 in both chords.' },
        { text: 'All three fingers', why: 'Fingers 1 and 2 are in the same place in both chords. Only finger 3 moves.' },
      ],
      explain: 'Fingers 1 and 2 stay pressed. Finger 3 lifts from string 5, fret 3 and lands on string 3, fret 2.',
      fact: 'c-am-move',
    },
    {
      type: 'fill-blanks',
      prompt: 'Which two notes do {c:C} and {c:Am} share?',
      text: '{c:C} is {n:C} {n:E} {n:G}. {c:Am} is {n:A} {n:C} {n:E}. Both have ___ and ___.',
      blanks: ['{n:C}', '{n:E}'],
      unordered: true,
      bank: ['{n:G}', '{n:A}'],
      explain: 'They share two of their three notes, {n:C} and {n:E}: the notes under fingers 1 and 2. That is why the change sounds so smooth.',
      fact: 'c-am-share',
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:C} from string 5. From now on, keep fingers 1 and 2 pressed.',
      chord: 'C',
      frets: 'x32010',
      explain: '{c:C}: finger 3 on string 5, fret 3, finger 2 on string 4, fret 2, finger 1 on string 2, fret 1. Fingers 1 and 2 now stay put.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'C',
        frets: 'x32010',
        accept: 'this-shape',
        prompt: 'Build {c:C}.',
        explain: 'String 5 fret 3, string 4 fret 2, string 2 fret 1, with strings 3 and 1 open.',
      },
    },
    {
      type: 'play-chord',
      prompt: 'Now move only finger 3, to string 3, fret 2, and strum {c:Am}. Then back to {c:C}: four times each way.',
      chord: 'Am',
      frets: 'x02210',
      explain: '{c:Am}: the same fingers 1 and 2, with finger 3 on string 3, fret 2. Strum it from the open string 5.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Am',
        frets: 'x02210',
        accept: 'this-shape',
        prompt: 'Build {c:Am}.',
        explain: 'String 4 fret 2, string 3 fret 2, string 2 fret 1, with strings 5 and 1 open.',
      },
    },
    {
      type: 'card',
      title: 'Major and minor',
      body: '{c:C} is a {t:major-chord|major chord}: it sounds bright and settled. {c:Am} is a {t:minor-chord|minor chord}: darker, more thoughtful. Listen to them one after the other: two of the three notes stay, and the mood changes.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['C', 'Am', 'C', 'Am'], beats: 4, tempo: 60 }, label: 'Hear {c:C}, {c:Am}, {c:C}, {c:Am}' },
    },
    {
      type: 'listen-choice',
      prompt: 'Is this {c:C} or {c:Am}: major or minor?',
      sound: { kind: 'chord', chord: 'C' },
      options: [{ text: '{c:C}: major, bright', correct: true }, { text: '{c:Am}: minor, darker' }],
      shuffle: false,
      explain: 'That was {c:C}, major: bright and settled. {c:Am} has the same {n:C} and {n:E} with an {n:A} below them, and sounds darker.',
    },
    playerTask({
      id: 'c-am-ladder',
      title: 'Change ladder: C and A minor',
      song: 'st-change-c-am-am-dm',
      bars: [1, 8],
      tempo: 83,
      minutes: 4,
      body: 'Bars 1 to 8 of the change study at about 60 BPM: {c:C} and {c:Am}, one strum a bar, then two, then four, then a change every two beats. Fingers 1 and 2 never lift. Then raise it to 100 % (72 BPM).',
    }),
    {
      type: 'listen-choice',
      prompt: 'And this one: {c:C} or {c:Am}?',
      sound: { kind: 'chord', chord: 'Am' },
      options: [{ text: '{c:C}: major, bright' }, { text: '{c:Am}: minor, darker', correct: true }],
      shuffle: false,
      explain: 'That was {c:Am}, minor: the darker sound. Listen for the mood rather than the notes; your ear learns it quickly.',
    },
    {
      type: 'true-false',
      statement: 'Looking for fingers that can stay down is the secret of smooth chord changes.',
      answer: true,
      explain: 'Every finger that stays is one less to move. Before any new change, look for notes the two chords share.',
      fact: 'fingers-that-stay',
    },
  ],
  facts: [
    { id: 'c-am-move', front: '{c:C} to {c:Am}: which finger moves?', back: 'Only finger 3, from string 5 fret 3 to string 3 fret 2. Fingers 1 and 2 stay.' },
    { id: 'c-am-share', front: 'Which notes do {c:C} and {c:Am} share?', back: '{n:C} and {n:E}: two of their three notes.' },
    { id: 'fingers-that-stay', front: 'The secret of every smooth chord change?', back: 'Look for fingers that can stay where they are, and move only the others.' },
  ],
};

// ── 2. Dm, and E again ──────────────────────────────────────────────────────────────────────────

const dmAndE: TeacherLesson = {
  id: 'dm-and-e',
  title: 'D minor, and E again',
  teaches: 'D minor sits at frets 2, 3 and 1 of strings 3, 2 and 1; in songs built around A minor, E leads home.',
  minutes: 5,
  skill: 'teacher:mia:dm-and-e',
  steps: [
    {
      type: 'card',
      title: 'The D minor chord',
      body: '{c:Dm}: finger 2 on string 3, fret 2 ({n:A}), finger 3 on string 2, fret 3 ({n:D}) and finger 1 on string 1, fret 1 ({n:F}). Strum strings 4 to 1, as for {c:D}. From {c:Am}, the note on string 3, fret 2 stays, but the finger changes from 3 to 2.',
      figure: { kind: 'chord', symbol: 'Dm', frets: 'xx0231', fingers: 'xx0231', caption: '{c:Dm}: strings 4 to 1, strings 6 and 5 left out.' },
    },
    {
      type: 'fretboard-name',
      prompt: 'Finger 1 presses string 1, fret 1 in {c:Dm}. Which note is it?',
      position: { string: 1, fret: 1 },
      ask: 'note',
      spelling: 'any',
      options: ['F', 'E', 'G', 'F#'],
      explain: 'String 1, fret 1 is {n:F}, one fret above the open {n:E}. In {c:D} that string has {n:F#} at fret 2: one fret is all that makes {c:Dm} minor.',
      fact: 'dm-shape',
    },
    {
      type: 'play-phrase',
      prompt: 'Hold {c:Dm} and play it string by string, from the open string 4 to string 1.',
      notes: [
        { string: 4, fret: 0, duration: 'q' },
        { string: 3, fret: 2, duration: 'q' },
        { string: 2, fret: 3, duration: 'q' },
        { string: 1, fret: 1, duration: 'q' },
      ],
      octave: 'exact',
      tempo: 60,
      explain: 'Open string 4 ({n:D}), string 3 fret 2 ({n:A}), string 2 fret 3 ({n:D}), string 1 fret 1 ({n:F}). If string 1 is dull, finger 1 needs to stand on its tip.',
      alternative: {
        type: 'order',
        prompt: 'Put the notes of {c:Dm} in order, from the open string 4 to string 1.',
        tiles: ['{n:D}', '{n:A}', '{n:D}', '{n:F}'],
        distractors: ['{n:F#}'],
        explain: 'Open string 4 is {n:D}, string 3 fret 2 {n:A}, string 2 fret 3 {n:D}, string 1 fret 1 {n:F}.',
      },
    },
    {
      type: 'play-chord',
      prompt: 'Now strum {c:Dm} once, from the open string 4.',
      chord: 'Dm',
      frets: 'xx0231',
      explain: 'Four strings ring in {c:Dm}: {n:D}, {n:A}, {n:D} and {n:F}. Miss strings 6 and 5.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Dm',
        frets: 'xx0231',
        accept: 'this-shape',
        prompt: 'Build {c:Dm}: three fingers on strings 3, 2 and 1.',
        explain: 'String 3 fret 2, string 2 fret 3, string 1 fret 1, over the open string 4.',
      },
    },
    {
      type: 'choice',
      prompt: 'From {c:Am} to {c:Dm}, what happens on string 3, fret 2?',
      options: [
        { text: 'The note stays; the finger changes from 3 to 2', correct: true },
        { text: 'Finger 3 stays there', why: 'In {c:Dm} finger 3 is needed on string 2, fret 3, so finger 2 takes over string 3.' },
        { text: 'Nothing is there in {c:Dm}', why: 'String 3, fret 2 ({n:A}) is in both chords.' },
      ],
      explain: 'Both chords have {n:A} on string 3, fret 2. In {c:Am} finger 3 plays it; in {c:Dm} finger 2 does, so finger 3 is free for string 2, fret 3.',
      fact: 'am-dm-change',
    },
    {
      type: 'card',
      title: 'E: the A minor shape, one string over',
      body: 'You met {c:E} in your first week: the {c:Am} shape moved one string toward string 6. Finger 2 on string 5, fret 2 ({n:B}), finger 3 on string 4, fret 2 ({n:E}), finger 1 on string 3, fret 1 ({n:G#}). In songs built around {c:Am}, {c:E} is the chord that leads back home to {c:Am}.',
      figure: { kind: 'chord', symbol: 'E', frets: '022100', fingers: '023100', caption: '{c:E}: the {c:Am} shape, one string toward string 6. All six strings.' },
    },
    {
      type: 'listen-choice',
      prompt: 'Mia plays {c:E}, then {c:Em}. One note changes: {n:G#} becomes {n:G}. Which chord sounded darker?',
      sound: { kind: 'progression', chords: ['E', 'Em'], beats: 4, tempo: 60 },
      options: [{ text: 'The first, {c:E}' }, { text: 'The second, {c:Em}', correct: true }],
      shuffle: false,
      explain: '{c:Em} is the darker, minor one. Lift finger 1 off string 3, fret 1 and {n:G#} becomes the open {n:G}: one fret turns {c:E} into {c:Em}.',
    },
    playerTask({
      id: 'am-dm-ladder',
      title: 'Change ladder: A minor and D minor',
      song: 'st-change-c-am-am-dm',
      bars: [9, 16],
      tempo: 83,
      minutes: 3,
      body: 'Bars 9 to 16 of the change study at about 60 BPM: {c:Am} and {c:Dm}. Finger 2 takes over string 3, fret 2 as finger 3 moves to string 2. One strum a bar, then two, then four, then every two beats.',
    }),
    {
      type: 'choice',
      prompt: 'In a song built around {c:Am}, which chord leads back home to {c:Am}?',
      options: [
        { text: '{c:E}', correct: true },
        { text: '{c:Dm}', why: '{c:Dm} goes well with {c:Am}, but the chord that pulls home is {c:E}, with its {n:G#}.' },
        { text: '{c:C}', why: '{c:C} shares two notes with {c:Am}, so it sits beside it. {c:E} is the one that leads home.' },
      ],
      explain: '{c:E} has {n:G#}, one fret below {n:A}, and it pulls up to it. {c:E} to {c:Am} sounds like coming home.',
      fact: 'e-leads-to-am',
    },
    playerTask({
      id: 'am-e-ladder',
      title: 'Change ladder: A minor and E',
      song: 'st-change-am-e-e-b7',
      bars: [1, 8],
      tempo: 83,
      minutes: 3,
      body: 'Bars 1 to 8 of the next change study at about 60 BPM: {c:Am} and {c:E}. Keep the three fingers together and move the whole shape one string over. Strum {c:E} on all six strings.',
    }),
    toolTask({
      id: 'am-dm-minute',
      title: 'One-minute changes: A minor to D minor',
      tool: 'chords',
      params: ['trainer', 'a-minor', 'd-minor'],
      minutes: 3,
      body: 'One minute of {c:Am} to {c:Dm} and back, then pick {c:Am} and {c:E} for another minute. Count the changes where every string rang, and note both scores.',
    }),
    { generate: 'chord-shape', params: { chords: ['Dm', 'Am', 'E'] } },
  ],
  facts: [
    { id: 'dm-shape', front: 'Where do the fingers go for {c:Dm}?', back: 'Finger 2 on string 3 fret 2, finger 3 on string 2 fret 3, finger 1 on string 1 fret 1. Strum strings 4 to 1.' },
    { id: 'am-dm-change', front: '{c:Am} to {c:Dm}: what happens on string 3, fret 2?', back: 'The note ({n:A}) stays, but the finger changes from 3 to 2.' },
    { id: 'e-leads-to-am', front: 'In a song built around {c:Am}, which chord leads home to it?', back: '{c:E}: its {n:G#} pulls up to {n:A}.' },
  ],
};

// ── 3. Go Down, Moses ───────────────────────────────────────────────────────────────────────────

const goDownMoses: TeacherLesson = {
  id: 'go-down-moses',
  title: 'Go Down, Moses',
  teaches: 'In A minor, the G sharp in E seven pulls back up to A, so E seven to A minor sounds like coming home.',
  minutes: 5,
  skill: 'teacher:mia:go-down-moses',
  steps: [
    {
      type: 'card',
      title: 'A spiritual in A minor',
      body: 'Go Down, Moses is a spiritual, first printed in 1862 as Oh! Let My People Go. It is in {k:A minor}: {c:Am} is its home chord. It uses {c:Am}, {c:Dm} and {c:E7}, and {c:E7} rather than {c:Em}, because {c:E7} has {n:G#}, on string 3, fret 1: the note that pulls back up to {n:A}.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        dots: [
          { string: 6, fret: 0, note: 'E2' },
          { string: 5, fret: 2, note: 'B2' },
          { string: 4, fret: 0, note: 'D3' },
          { string: 3, fret: 1, note: 'G#3', role: 'target' },
          { string: 2, fret: 0, note: 'B3' },
          { string: 1, fret: 0, note: 'E4' },
        ],
        caption: '{c:E7}: the {n:G#} on string 3, fret 1 pulls up to {n:A}.',
      },
    },
    {
      type: 'choice',
      prompt: 'Which note of {c:E7} pulls back up to {n:A}?',
      options: [
        { text: '{n:G#}, on string 3, fret 1', correct: true },
        { text: '{n:B}, on string 5, fret 2', why: '{n:B} is in {c:E7}, but it is two frets above {n:A}. The pull comes from {n:G#}, one fret below.' },
        { text: '{n:D}, the open string 4', why: '{n:D} is the 7 of {c:E7}. The note that rises to {n:A} is {n:G#}.' },
      ],
      explain: '{n:G#} is one fret below {n:A}, and it leans up into it. {c:Em} has a plain {n:G} instead, which pulls much less.',
      fact: 'e7-pulls-home',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the {n:G#} in your {c:E7} shape: the note that pulls up to {n:A}.',
      find: { note: 'G#3' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 4],
      explain: 'String 3, fret 1, under finger 1. One fret higher, at fret 2, is the {n:A} it wants to reach.',
    },
    {
      type: 'listen-choice',
      prompt: 'Mia plays {c:E7} then {c:Am}, and then {c:Em} then {c:Am}. Which return sounded more like coming home?',
      sound: { kind: 'progression', chords: ['E7', 'Am', 'Em', 'Am'], beats: 4, tempo: 72 },
      options: [{ text: 'The first: {c:E7} to {c:Am}', correct: true }, { text: 'The second: {c:Em} to {c:Am}' }],
      shuffle: false,
      explain: '{c:E7} to {c:Am} lands like coming home, because {n:G#} rises to {n:A}. {c:Em} has {n:G}, and its return sounds softer, less settled.',
    },
    {
      type: 'card',
      title: 'Slow and heavy',
      body: 'Play it slowly, one heavy downstrum on every beat: "1, 2, 3, 4". Let each chord ring and fill the room. The song has time; so do you.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Am', 'Dm', 'E7', 'Am'], beats: 4, tempo: 72 }, label: 'Hear {c:Am}, {c:Dm}, {c:E7}, {c:Am}' },
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:E7} once, heavily, on all six strings.',
      chord: 'E7',
      frets: '020100',
      explain: '{c:E7}: finger 2 on string 5, fret 2, finger 1 on string 3, fret 1 ({n:G#}), every string ringing.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'E7',
        frets: '020100',
        accept: 'this-shape',
        prompt: 'Build {c:E7}: two fingers, all six strings.',
        explain: 'String 5 fret 2 and string 3 fret 1, with strings 6, 4, 2 and 1 open.',
      },
    },
    playerTask({
      id: 'moses',
      title: 'Go Down, Moses',
      song: 'go-down-moses',
      tempo: 83,
      minutes: 4,
      body: 'Play it at about 60 BPM, one heavy downstrum per beat on {c:Am}, {c:Dm} and {c:E7}. Then 100 % (72 BPM). Listen for the moment {c:E7} turns back to {c:Am}.',
      fallback: {
        tool: 'progressions',
        params: ['classical-minor-cadence', 'a', 'jam'],
        title: 'Jam on A minor, D minor and E seven',
        body: 'Go Down, Moses is not in the Songs library yet, so jam on its three chords with the band: {c:Am}, {c:Dm}, {c:E7}, {c:Am}, over and over. One heavy downstrum per beat, with the band at 60 to 72 BPM. Listen for {c:E7} turning back home to {c:Am}.',
      },
    }),
    {
      type: 'tap-rhythm',
      prompt: 'Tap two bars of heavy downstrums: one on every click, counting "1, 2, 3, 4".',
      rhythm: { pattern: 'q q q q | q q q q' },
      tempo: 72,
      show: 'both',
      explain: 'One strum per beat, every one the same weight. Slow and steady is the whole feel of this song.',
    },
    toolTask({
      id: 'am-e7-minute',
      title: 'One-minute changes: A minor to E seven',
      tool: 'chords',
      params: ['trainer', 'a-minor', 'e-7'],
      minutes: 2,
      body: 'One minute of {c:Am} to {c:E7} and back, then pick {c:Dm} and {c:E7} for another minute. Count the clean changes and note both scores.',
    }),
    {
      type: 'true-false',
      statement: '{c:Em} would pull home to {c:Am} just as strongly as {c:E7}.',
      answer: false,
      explain: '{c:Em} has {n:G}, two frets below {n:A}. {c:E7} has {n:G#}, just one fret below, and that is the note that pulls.',
    },
    playerTask({
      id: 'korobeiniki',
      title: 'Korobeiniki: strum the three chords',
      song: 'korobeiniki',
      tempo: 72,
      minutes: 4,
      body: 'Korobeiniki is a Russian folk melody in {k:A minor} on the same three chords. In Options, pick the Strum part, and strum {c:Am}, {c:E7} and {c:Dm} at 72 BPM while the app plays the tune. The melody itself can wait for another day.',
      tip: 'It starts on {c:E7}, not {c:Am}. Have the shape ready before the count-in ends.',
    }),
    {
      type: 'choice',
      prompt: 'Go Down, Moses and Korobeiniki share which three chords?',
      options: [
        { text: '{c:Am}, {c:Dm} and {c:E7}', correct: true },
        { text: '{c:Am}, {c:Dm} and {c:Em}', why: 'Both use {c:E7}, with the {n:G#} that leads home to {c:Am}.' },
        { text: '{c:C}, {c:Am} and {c:Dm}', why: '{c:C} is not in either song. The chord that leads home is {c:E7}.' },
      ],
      explain: 'Both are in {k:A minor}, on {c:Am}, {c:Dm} and {c:E7}. {c:E7} is the one that leads home.',
    },
  ],
  facts: [
    { id: 'e7-pulls-home', front: 'In {k:A minor}, why use {c:E7} rather than {c:Em}?', back: '{c:E7} has {n:G#} (string 3, fret 1), one fret below {n:A}, and it pulls back up: {c:E7} to {c:Am} sounds like home.' },
    { id: 'a-minor-chords', front: 'Three chords of an {k:A minor} song?', back: '{c:Am} (home), {c:Dm} and {c:E7}.' },
  ],
};

// ── 4. B7, your first four-finger chord ─────────────────────────────────────────────────────────

const b7AndAnchors: TeacherLesson = {
  id: 'b7-and-anchors',
  title: 'B seven, your first four-finger chord',
  teaches: 'B seven uses all four fingers; from E minor or E, finger 2 stays on string 5, fret 2 as the anchor.',
  minutes: 5,
  skill: 'teacher:mia:b7-and-anchors',
  steps: [
    {
      type: 'card',
      title: 'Four fingers',
      body: '{c:B7} uses all four fingers: finger 2 on string 5, fret 2 ({n:B}), finger 1 on string 4, fret 1 ({n:D#}), finger 3 on string 3, fret 2 ({n:A}) and finger 4 on string 1, fret 2 ({n:F#}). String 2 rings open; string 6 is left out.',
      figure: { kind: 'chord', symbol: 'B7', frets: 'x21202', fingers: 'x21304', caption: '{c:B7}: four fingers, string 2 open, string 6 left out.' },
    },
    {
      type: 'choice',
      prompt: 'Which string rings open in {c:B7}?',
      options: [
        { text: 'String 2', correct: true },
        { text: 'String 1', why: 'String 1 has finger 4 on it, at fret 2.' },
        { text: 'String 6', why: 'String 6 is left out of {c:B7}: start the strum on string 5.' },
      ],
      explain: 'String 2, the open {n:B}, rings between fingers 3 and 4. Arch finger 3 so it does not touch it.',
      fact: 'b7-shape',
    },
    {
      type: 'play-phrase',
      prompt: 'Hold {c:B7} and play it string by string, from string 5 to string 1. Check that the open string 2 rings.',
      notes: [
        { string: 5, fret: 2, duration: 'q' },
        { string: 4, fret: 1, duration: 'q' },
        { string: 3, fret: 2, duration: 'q' },
        { string: 2, fret: 0, duration: 'q' },
        { string: 1, fret: 2, duration: 'q' },
      ],
      octave: 'exact',
      tempo: 60,
      explain: '{n:B}, {n:D#}, {n:A}, the open {n:B}, and {n:F#} on top. If the open string 2 was silent, finger 3 or 4 is leaning on it.',
      alternative: {
        type: 'order',
        prompt: 'Put the notes of {c:B7} in order, from string 5 to string 1.',
        tiles: ['{n:B}', '{n:D#}', '{n:A}', '{n:B}', '{n:F#}'],
        distractors: ['{n:D}'],
        explain: 'String 5 fret 2 is {n:B}, string 4 fret 1 {n:D#}, string 3 fret 2 {n:A}, the open string 2 {n:B}, and string 1 fret 2 {n:F#}.',
      },
    },
    {
      type: 'play-chord',
      prompt: 'Now strum {c:B7} once, from string 5.',
      chord: 'B7',
      frets: 'x21202',
      explain: 'Five strings ring in {c:B7}. Four fingers take time: it is normal for this one to feel slow for a week or two.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'B7',
        frets: 'x21202',
        accept: 'this-shape',
        prompt: 'Build {c:B7}: four fingers, string 2 open, string 6 left out.',
        explain: 'String 5 fret 2, string 4 fret 1, string 3 fret 2 and string 1 fret 2, with the open string 2.',
      },
    },
    {
      type: 'card',
      title: 'Finger 2 is the anchor',
      body: 'In {c:Em} played with fingers 2 and 3, and in {c:E}, finger 2 sits on string 5, fret 2 ({n:B}): exactly where {c:B7} needs it. So put finger 2 down first, keep it there, and build the rest of {c:B7} around it.',
      figure: {
        kind: 'fretboard',
        frets: [0, 4],
        labels: 'finger',
        dots: [{ string: 5, fret: 2, note: 'B2', finger: 2, role: 'target' }],
        caption: 'The anchor: finger 2 on string 5, fret 2, in {c:Em}, {c:E} and {c:B7}.',
      },
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the anchor: the note finger 2 keeps pressed from {c:Em} to {c:B7}.',
      find: { note: 'B2' },
      mode: 'one',
      octave: 'exact',
      frets: [0, 4],
      explain: 'String 5, fret 2 is {n:B}, in {c:Em}, in {c:E} and in {c:B7}. It is also the note {c:B7} is named after.',
      fact: 'b7-anchor',
    },
    {
      type: 'listen-choice',
      prompt: 'Mia plays {c:B7}, then {c:Em}. Which chord sounded like home?',
      sound: { kind: 'progression', chords: ['B7', 'Em'], beats: 4, tempo: 60 },
      options: [{ text: 'The first, {c:B7}' }, { text: 'The second, {c:Em}', correct: true }],
      shuffle: false,
      explain: '{c:B7} leans forward and {c:Em} settles it. {c:B7} leads home to {c:Em} just as {c:E7} leads home to {c:Am}.',
    },
    playerTask({
      id: 'e-b7-ladder',
      title: 'Change ladder: E and B seven',
      song: 'st-change-am-e-e-b7',
      bars: [9, 16],
      tempo: 83,
      minutes: 3,
      body: 'Bars 9 to 16 of the change study at about 60 BPM: {c:E} and {c:B7}, with finger 2 staying on string 5, fret 2. One strum a bar, then two, then four, then every two beats.',
    }),
    playerTask({
      id: 'em-b7-ladder',
      title: 'Change ladder: E minor, A minor, B seven',
      song: 'st-change-em-am-em-b7',
      tempo: 75,
      minutes: 4,
      body: 'Both halves of the next study at 60 BPM: {c:Em} and {c:Am}, then {c:Em} and {c:B7}. Play {c:Em} with fingers 2 and 3 so finger 2 is already on its anchor.',
      tip: 'Late on {c:B7}? Put finger 2 down first and strum on the beat, even if the others are still landing.',
    }),
    {
      type: 'choice',
      prompt: 'Which chord leads home to {c:Em}?',
      options: [
        { text: '{c:B7}', correct: true },
        { text: '{c:E7}', why: '{c:E7} leads home to {c:Am}. For {c:Em} it is {c:B7}.' },
        { text: '{c:Am}', why: '{c:Am} sits well beside {c:Em}, but it does not pull home the way {c:B7} does.' },
      ],
      explain: '{c:B7} leads home to {c:Em} just as {c:E7} leads home to {c:Am}. Its {n:D#}, on string 4, fret 1, sits just below {n:E} and pulls up to it.',
      fact: 'b7-leads-to-em',
    },
    toolTask({
      id: 'em-b7-minute',
      title: 'One-minute changes: E minor to B seven',
      tool: 'chords',
      params: ['trainer', 'e-minor', 'b-7'],
      minutes: 2,
      body: 'One minute of {c:Em} to {c:B7} and back, finger 2 first every time. Your first score will be low: four fingers take a while. Note it; it climbs fast.',
      tip: 'If your hand aches, stop and rest. Sore fingertips are normal; aching joints are not.',
    }),
    { generate: 'chord-shape', params: { chords: ['B7', 'Em', 'E'] } },
  ],
  facts: [
    { id: 'b7-shape', front: 'Where do the fingers go for {c:B7}?', back: 'Finger 2 on string 5 fret 2, finger 1 on string 4 fret 1, finger 3 on string 3 fret 2, finger 4 on string 1 fret 2; string 2 open.' },
    { id: 'b7-anchor', front: 'The anchor from {c:Em} or {c:E} to {c:B7}?', back: 'Finger 2 on string 5, fret 2 ({n:B}): put it down first and build {c:B7} around it.' },
    { id: 'b7-leads-to-em', front: 'Which chord leads home to {c:Em}?', back: '{c:B7}, just as {c:E7} leads home to {c:Am}.' },
  ],
};

// ── 5. Wade in the Water ────────────────────────────────────────────────────────────────────────

const wadeInTheWater: TeacherLesson = {
  id: 'wade-in-the-water',
  title: 'Wade in the Water',
  teaches: 'E minor, A minor and B seven are the three main chords of E minor: slow and heavy, leaning on 2 and 4.',
  minutes: 5,
  skill: 'teacher:mia:wade-in-the-water',
  steps: [
    {
      type: 'card',
      title: 'Three chords of E minor',
      body: 'Wade in the Water is a spiritual printed in 1901. It moves between {c:Em}, {c:Am} and {c:B7}, the three main chords of {k:E minor}: {c:Em} is home, and {c:B7} leads back to it.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Em', 'Am', 'B7', 'Em'], beats: 4, tempo: 84 }, label: 'Hear {c:Em}, {c:Am}, {c:B7}, {c:Em}' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord with the fingers it uses.',
      pairs: [
        { left: '{c:Em}', right: 'Two fingers' },
        { left: '{c:Am}', right: 'Three fingers' },
        { left: '{c:B7}', right: 'All four fingers' },
      ],
      explain: '{c:Em} needs two fingers at fret 2, {c:Am} three, and {c:B7} all four. The changes to {c:B7} are the ones to practise.',
    },
    {
      type: 'choice',
      prompt: 'In {k:E minor}, which chord leads back home to {c:Em}?',
      options: [
        { text: '{c:B7}', correct: true },
        { text: '{c:Am}', why: '{c:Am} is the third chord of the family. The one that leans home to {c:Em} is {c:B7}.' },
        { text: '{c:E7}', why: '{c:E7} leads home to {c:Am}, in {k:A minor}.' },
      ],
      explain: '{c:B7} leans toward {c:Em}, just as {c:E7} leans toward {c:Am}. With {c:Em} and {c:Am} they make the family of {k:E minor}.',
      fact: 'e-minor-chords',
    },
    {
      type: 'card',
      title: 'Slow and heavy, leaning on 2 and 4',
      body: 'Strum it slow and heavy with the down-up eighths you know, leaning on beats 2 and 4. The strum is familiar, so all your attention can go to the new {c:B7} changes. The song has a swaying strum of its own: you will learn it, and come back to this song, in the strumming unit.',
      figure: { kind: 'rhythm', pattern: 'e e e e e e e e', time: '4/4', tempo: 72, caption: 'Down-up eighths: lean a little on 2 and 4.' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap down-up eighths with the click at 72 BPM, leaning a little on beats 2 and 4.',
      rhythm: { pattern: 'e e e e e e e e' },
      tempo: 72,
      show: 'both',
      explain: 'Eight even taps, a little stronger on 2 and 4. The lean gives it weight; the timing never changes.',
      fact: 'lean-on-two-four',
    },
    toolTask({
      id: 'backbeat-72',
      title: 'Accents on 2 and 4, at 72 BPM',
      tool: 'rhythm',
      params: ['strum', 'backbeat'],
      minutes: 3,
      body: 'Set the tempo to 72 and strum or tap down-up eighths with the trainer, digging in a little on beats 2 and 4. Keep going until the accents feel natural, then come back.',
    }),
    {
      type: 'play-chord',
      prompt: 'Change from {c:Em} to {c:B7}, finger 2 first, and let {c:B7} ring.',
      chord: 'B7',
      frets: 'x21202',
      explain: 'Finger 2 stays on string 5, fret 2; fingers 1, 3 and 4 land around it. Strum {c:B7} from string 5.',
      alternative: { generate: 'chord-shape', params: { chords: ['B7', 'Am', 'Em'] } },
    },
    playerTask({
      id: 'wade',
      title: 'Wade in the Water',
      song: 'wade-in-the-water',
      tempo: 86,
      minutes: 4,
      body: 'Play it at about 72 BPM: down-up eighths, leaning on 2 and 4, on {c:Em}, {c:Am} and {c:B7}. Then go up to 100 % (84 BPM). Every change to {c:B7} lands on the beat.',
      fallback: {
        tool: 'progressions',
        params: ['classical-minor-cadence', 'e', 'jam'],
        title: 'Jam on E minor, A minor and B seven',
        body: 'Wade in the Water is not in the Songs library yet, so jam on its three chords with the band: {c:Em}, {c:Am}, {c:B7}, {c:Em}, over and over. Down-up eighths, leaning on 2 and 4, around 72 BPM, every change to {c:B7} on the beat.',
      },
    }),
    {
      type: 'true-false',
      statement: 'Wade in the Water has a swaying strum of its own, which comes later, in the strumming unit.',
      answer: true,
      explain: 'Today you play it with the down-up eighths you know, so your attention can go to {c:B7}. Its own strum comes in the strumming unit.',
    },
    toolTask({
      id: 'em-am-b7-minute',
      title: 'One-minute changes: E minor to A minor',
      tool: 'chords',
      params: ['trainer', 'e-minor', 'a-minor'],
      minutes: 2,
      body: 'One minute of {c:Em} to {c:Am} and back, then pick {c:Am} and {c:B7} for another minute. Count the clean changes and note both scores.',
    }),
    {
      type: 'choice',
      prompt: 'Which are the three main chords of {k:E minor}?',
      options: [
        { text: '{c:Em}, {c:Am} and {c:B7}', correct: true },
        { text: '{c:Am}, {c:Dm} and {c:E7}', why: 'Those are the three chords of {k:A minor}, as in Go Down, Moses.' },
        { text: '{c:Em}, {c:D} and {c:G}', why: '{c:D} and {c:G} are major chords that go well with {c:Em}, but the chord that leads home is {c:B7}.' },
      ],
      explain: '{c:Em} is home, {c:Am} the second chord, and {c:B7} the one that leads back home.',
      fact: 'e-minor-chords',
    },
  ],
  facts: [
    { id: 'e-minor-chords', front: 'The three main chords of {k:E minor}?', back: '{c:Em} (home), {c:Am} and {c:B7}, the chord that leads home.' },
    { id: 'lean-on-two-four', front: 'How do you make down-up eighths sound heavy and swaying?', back: 'Lean a little on beats 2 and 4: louder, never earlier.' },
  ],
};

// ── 6. Major or minor? (review) ─────────────────────────────────────────────────────────────────

const majorOrMinor: TeacherLesson = {
  id: 'major-or-minor',
  title: 'Major or minor?',
  teaches: 'Lowering a chord\'s third by one fret turns major into minor: E to E minor, A to A minor, D to D minor.',
  minutes: 5,
  skill: 'teacher:mia:major-or-minor',
  steps: [
    {
      type: 'card',
      title: 'One note, one fret',
      body: '{c:E} and {c:Em}, {c:A} and {c:Am}, {c:D} and {c:Dm}: each pair differs by one note, the chord\'s {t:chord-third|third}. Lower that note by one fret and the bright major chord turns into its darker minor twin. Listen to the three pairs.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['E', 'Em', 'A', 'Am', 'D', 'Dm'], beats: 2, tempo: 60 }, label: 'Hear three pairs' },
    },
    {
      type: 'choice',
      prompt: 'Which chord box is {c:Am}?',
      options: [
        { figure: { kind: 'chord', symbol: 'Am', frets: 'x02210', fingers: 'x02310' }, correct: true },
        { figure: { kind: 'chord', symbol: 'A', frets: 'x02220', fingers: 'x01230' }, why: 'This is {c:A}: string 2 at fret 2 ({n:C#}). One fret lower, at fret 1 ({n:C}), it becomes {c:Am}.' },
        { figure: { kind: 'chord', symbol: 'Dm', frets: 'xx0231', fingers: 'xx0231' }, why: 'This is {c:Dm}, on strings 4 to 1.' },
      ],
      explain: '{c:Am} has fret 1 on string 2 ({n:C}); {c:A} has fret 2 there ({n:C#}). That one fret is the third.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each pair with the note that changes.',
      pairs: [
        { left: '{c:E} to {c:Em}', right: 'String 3: {n:G#} to {n:G}' },
        { left: '{c:A} to {c:Am}', right: 'String 2: {n:C#} to {n:C}' },
        { left: '{c:D} to {c:Dm}', right: 'String 1: {n:F#} to {n:F}' },
      ],
      explain: 'In each pair the third drops one fret: {n:G#} to {n:G} on string 3, {n:C#} to {n:C} on string 2, {n:F#} to {n:F} on string 1.',
      fact: 'third-one-fret',
    },
    { generate: 'chord-quality-ear', params: { types: ['major', 'minor'] } },
    {
      type: 'play-chord',
      prompt: 'Mia names a chord from your twelve: {c:Dm}. Play it.',
      chord: 'Dm',
      frets: 'xx0231',
      explain: '{c:Dm}: string 3 fret 2, string 2 fret 3, string 1 fret 1, strummed from the open string 4.',
      alternative: { generate: 'chord-shape', params: { chords: ['Dm', 'D'] } },
    },
    {
      type: 'play-chord',
      prompt: 'Next: {c:E}. Play it.',
      chord: 'E',
      frets: '022100',
      explain: '{c:E}: string 5 fret 2, string 4 fret 2, string 3 fret 1, all six strings ringing.',
      alternative: { generate: 'chord-shape', params: { chords: ['E', 'Em'] } },
    },
    {
      type: 'play-chord',
      prompt: 'And {c:A}. Play it.',
      chord: 'A',
      frets: 'x02220',
      explain: '{c:A}: three fingers in a row at fret 2, strummed from the open string 5.',
      alternative: { generate: 'chord-shape', params: { chords: ['A', 'Am'] } },
    },
    toolTask({
      id: 'quality-drill',
      title: 'Major or minor: ten rounds',
      tool: 'ear',
      params: ['chords', '1'],
      minutes: 3,
      body: 'Ten chords, each major or minor. Listen for the mood: bright and settled, or darker. Aim for 8 out of 10, and do not worry if it takes two or three rounds to get there.',
    }),
    {
      type: 'card',
      title: 'Twelve chords, and a carol',
      body: 'You can now play twelve chords: {c:Em}, {c:E}, {c:Am}, {c:A}, {c:E7}, {c:D}, {c:A7}, {c:G}, {c:C}, {c:D7}, {c:Dm} and {c:B7}. God Rest Ye Merry, Gentlemen uses six of them. Its refrain leans from {k:E minor} toward {k:G major}, its {t:relative-major|relative major}, before coming home.',
    },
    {
      type: 'true-false',
      statement: '{k:G major} is the relative major of {k:E minor}: the two keys use the same notes.',
      answer: true,
      explain: '{k:E minor} is {n:E} {n:F#} {n:G} {n:A} {n:B} {n:C} {n:D}; {k:G major} is the same seven notes, starting on {n:G}. That is why the carol can lean from one to the other.',
      fact: 'relative-major-e-minor',
    },
    playerTask({
      id: 'god-rest-ye',
      title: 'God Rest Ye Merry, Gentlemen',
      song: 'god-rest-ye-merry-gentlemen',
      tempo: 84,
      minutes: 4,
      body: 'Play it at about 84 BPM, on {c:Em}, {c:B7}, {c:C}, {c:D}, {c:G} and {c:Am}, then at 100 %. Listen for the refrain leaning toward {k:G major} and the verse coming home to {k:E minor}.',
      fallback: {
        tool: 'player',
        params: ['o-come-all-ye-faithful', 't95'],
        title: 'A carol: O Come, All Ye Faithful',
        body: 'God Rest Ye is not in the Songs library yet, so play another carol on five of its six chords: O Come, All Ye Faithful, at about 84 BPM. It is in {k:G major}, and its {c:Em} and {c:Am} are the minor chords of that key. Listen for where they darken it.',
      },
    }),
    playerTask({
      id: 'we-three-kings',
      title: 'We Three Kings, in 3/4',
      song: 'we-three-kings',
      minutes: 4,
      body: 'A minor verse on {c:Em}, {c:B7}, {c:Am} and {c:D}, then a major refrain on {c:G}, {c:C} and {c:D}, in 3/4 at 96 BPM. Bass on 1, strums on 2 and 3. Hear the mood change as the refrain begins.',
      fallback: {
        tool: 'progressions',
        params: ['minor-i-bvi-biii-bvii', 'e', 'jam'],
        title: 'Jam: E minor turning bright',
        body: 'We Three Kings is not in the Songs library yet, so jam on {c:Em}, {c:C}, {c:G} and {c:D} with the band. It starts dark on {c:Em} and brightens on {c:G}, the home chord of the relative major. Under Band, pick the waltz feel and count "1 2 3".',
      },
    }),
    {
      type: 'choice',
      prompt: 'You play {c:E} and lower the note on string 3 by one fret. Which chord do you get?',
      options: [
        { text: '{c:Em}', correct: true },
        { text: '{c:E7}', why: '{c:E7} keeps the {n:G#}. Lowering string 3 from fret 1 to open turns {n:G#} into {n:G}: {c:Em}.' },
        { text: '{c:Am}', why: '{c:Am} is the whole shape moved one string over. One note lower makes {c:Em}.' },
      ],
      explain: 'String 3 goes from fret 1 ({n:G#}) to open ({n:G}): the third drops one fret, and {c:E} becomes {c:Em}.',
      fact: 'third-one-fret',
    },
  ],
  facts: [
    { id: 'third-one-fret', front: 'What turns {c:E} into {c:Em}, {c:A} into {c:Am}, {c:D} into {c:Dm}?', back: 'Lowering the chord\'s third by one fret: {n:G#} to {n:G}, {n:C#} to {n:C}, {n:F#} to {n:F}.' },
    { id: 'relative-major-e-minor', front: 'What is the relative major of {k:E minor}?', back: '{k:G major}: the major key with the same notes.' },
  ],
};

/** Unit 6 of Mia's course. */
const unit: TeacherUnit = {
  id: 'mia-minor-chords',
  title: 'Minor chords, minor songs',
  theme: 'chords',
  description: 'Add D minor and B seven to A minor and E, and use them in minor-key songs.',
  lessons: [amAndC, dmAndE, goDownMoses, b7AndAnchors, wadeInTheWater, majorOrMinor],
  checkpoint: { sample: 8, maxMistakes: 2 },
  glossary: [
    { id: 'chord-third', term: 'third', definition: 'The middle note of a chord like {c:E}: count three letter names from E (E F G) to reach it. It is {n:G#} in {c:E} and {n:G} in {c:Em}.' },
    { id: 'relative-major', term: 'relative major', definition: 'The major key that uses the same notes as a minor key: G major for E minor, C major for A minor.' },
  ],
};

export default unit;

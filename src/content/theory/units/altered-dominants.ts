/**
 * Theory Path, unit 35: Altered dominants and substitutions. Written from the syllabus entries in
 * `src/content/plan/theory-path.json` (unit `altered-dominants`), one lesson per entry, in order:
 * each lesson opens with the "on the guitar" picture, asks the planned exercises, ends with a
 * drill or a play step, and turns every planned fact into a review card.
 *
 * Every tension, spelling, scale, substitute and shared note is cross-checked against
 * `@/core/theory` (`chordNotes`, `chordTones`, `scaleNotes`, `tritoneSubstitute`, `romanToChord`)
 * and every shape against `@/core/guitar` in `altered-dominants.test.ts`.
 *
 * Notes for readers of the code:
 * - Altered tensions are named for their job over the dominant, not by the altered scale's own
 *   degree spelling: in G altered, Bb is the #9 and Cb is the 3rd (the engine lists them as b3
 *   and b4), as players and the syllabus name them.
 * - A diminished seventh chord's pitches are shared by four rootless dominant 7 flat 9 chords a
 *   minor third apart. Questions that ask which dominant a dim7 hides offer no other dominant of
 *   that family, so no distractor is right by sound.
 * - A play-chord step listens for one chord, so a progression is shown on a card and the play step
 *   asks for its altered or substitute chord.
 */
import type { Lesson, Unit } from '@/lessons';

const U = 'altered-dominants';

const alteredTensions: Lesson = {
  id: 'altered-tensions',
  title: 'Altered tensions',
  teaches: 'A dominant 7th can take altered tensions, flat or sharp 9, sharp 11 and flat 13, which resolve by half step.',
  minutes: 3,
  skill: `theory:${U}:altered-tensions`,
  steps: [
    {
      type: 'card',
      title: 'Tension that leans',
      body: 'Over a dominant 7th, players often push the 9th, 11th and 13th out of the key: the {t:altered-tension|altered tensions} {d:b9}, {d:#9}, {d:#11} and {d:b13}. Play {c:G7} (3x343x), {c:G7b9} (3231xx), then {c:Cmaj7} (x3545x): the {n:Ab} on string 3 falls a half step to {n:G}, on string 4.',
      figure: {
        kind: 'fretboard',
        frets: [0, 5],
        root: 'G',
        labels: 'degree',
        dots: [
          { string: 6, fret: 3, note: 'G', degree: '1', role: 'root' },
          { string: 5, fret: 2, note: 'B', degree: '3', role: 'third' },
          { string: 4, fret: 3, note: 'F', degree: 'b7', role: 'seventh' },
          { string: 3, fret: 1, note: 'Ab', degree: 'b9', role: 'target' },
        ],
        caption: '{c:G7b9} (3231xx): the {d:b9}, {n:Ab}, on string 3.',
      },
    },
    {
      type: 'card',
      title: 'A half step from home',
      body: 'Each altered tension sits a half step from a note of the next chord, so it leans into it. The {d:#11} is the same pitch as the {d:b5}, and the {d:b13} the same pitch as the {d:#5}: named as tensions, they sit above the chord. Hear {c:G7} to {c:Cmaj7}, then {c:G7b9} to {c:Cmaj7}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['G7', 'Cmaj7', 'G7b9', 'Cmaj7'], beats: 4, tempo: 70 }, label: 'Plain, then with the flat 9' },
    },
    {
      type: 'type-answer',
      prompt: 'Type the {d:b13} of {c:C7}.',
      answer: { kind: 'note', value: 'Ab', spelling: 'exact' },
      input: 'keypad',
      explain: 'A 13th above {n:C} is {n:A}; flatten it: {n:Ab}. It sounds like {n:G#}, the {d:#5}, but a 13th is a kind of A.',
    },
    {
      type: 'choice',
      prompt: 'In {c:G7b9} to {c:C}, where does the {d:b9}, {n:Ab}, usually go?',
      options: [
        { text: 'Down a half step to {n:G}', correct: true },
        { text: 'Up a half step to {n:A}', why: '{n:A} is not in {c:C}. {n:Ab} falls to {n:G}, the 5th of {c:C}.' },
        { text: 'Up to {n:C}', why: 'From {n:Ab} up to {n:C} is a major 3rd, not a half step.' },
      ],
      explain: '{n:Ab} falls a half step to {n:G}, the 5th of {c:C}. Altered tensions usually resolve by half step like this.',
      fact: 'altered-resolve-half-step',
    },
    {
      type: 'listen-choice',
      prompt: 'Plain {c:G7}, or {c:G7b9}?',
      sound: { kind: 'chord', chord: 'G7b9', frets: '3231xx' },
      options: [{ text: 'Plain {c:G7}' }, { text: '{c:G7b9}', correct: true }],
      shuffle: false,
      explain: 'That was {c:G7b9}: the {n:Ab} rubs a half step above the root, {n:G}, which gives the darker, tense colour.',
    },
    {
      type: 'fill-blanks',
      prompt: 'Spell {c:G7#9}.',
      text: '{n:G}  {n:B}  {n:D}  {n:F}  ___',
      blanks: ['{n:A#}'],
      bank: ['{n:Bb}', '{n:A}', '{n:Ab}'],
      spelling: 'exact',
      explain: 'A 9th above {n:G} is {n:A}; raise it: {n:A#}. It sounds like {n:Bb}, but a 9th above {n:G} is always a kind of A.',
      fact: 'altered-g7-spellings',
    },
    {
      type: 'choice',
      prompt: 'Over {c:G7}, the {d:#11} is the same pitch as which other degree?',
      options: [
        { text: 'The {d:b5}', correct: true },
        { text: 'The {d:#5}', why: 'The {d:#5} is the same pitch as the {d:b13}, {n:Eb}.' },
        { text: 'The {d:b9}', why: 'The {d:b9} is {n:Ab}, a half step above the root.' },
      ],
      shuffle: false,
      explain: 'The {d:#11} of {n:G} is {n:C#}, the same pitch as the {d:b5}, {n:Db}. Named as a tension it sits above the chord, and the plain 5th may stay.',
      fact: 'altered-tensions-list',
    },
    {
      type: 'match-pairs',
      prompt: 'Over {c:G7}, match each altered tension with its note.',
      pairs: [
        { left: '{d:b9}', right: '{n:Ab}' },
        { left: '{d:#9}', right: '{n:A#}' },
        { left: '{d:#11}', right: '{n:C#}' },
        { left: '{d:b13}', right: '{n:Eb}' },
      ],
      explain: 'Above {n:G}: the 9th {n:A} lowered or raised, the 11th {n:C} raised, the 13th {n:E} lowered.',
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:G7b9} (3231xx), then let it fall to {c:C}.',
      chord: 'G7b9',
      frets: '3231xx',
      explain: '3231xx: {n:G}, {n:B}, {n:F} and the {d:b9}, {n:Ab}, on string 3. There is no 5th, and nobody misses it.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'G7b9',
        frets: '3231xx',
        accept: 'this-shape',
        prompt: 'Build {c:G7b9} on strings 6 to 3.',
        explain: '3231xx: {n:G} at fret 3, {n:B} at fret 2, {n:F} at fret 3, {n:Ab} at fret 1 of string 3.',
      },
    },
    { generate: 'chord-tones', params: { types: ['7b9', '7sharp9'], roots: ['G', 'C', 'D', 'A', 'F', 'Bb'], ask: 'notes' } },
  ],
  facts: [
    {
      id: 'altered-tensions-list',
      front: 'Name the altered tensions of a dominant 7th chord.',
      back: '{d:b9}, {d:#9}, {d:#11} (the same pitch as {d:b5}) and {d:b13} (the same pitch as {d:#5}).',
      ask: {
        type: 'match-pairs',
        prompt: 'Over {c:C7}, match each altered tension with its note.',
        pairs: [
          { left: '{d:b9}', right: '{n:Db}' },
          { left: '{d:#9}', right: '{n:D#}' },
          { left: '{d:#11}', right: '{n:F#}' },
          { left: '{d:b13}', right: '{n:Ab}' },
        ],
        explain: 'Above {n:C}: the 9th {n:D} lowered or raised, the 11th {n:F} raised, the 13th {n:A} lowered.',
      },
    },
    {
      id: 'altered-resolve-half-step',
      front: 'How do altered tensions usually resolve?',
      back: 'By half step into the next chord: the {d:b9} of {c:G7}, {n:Ab}, falls to {n:G}, the 5th of {c:C}.',
    },
    {
      id: 'altered-g7-spellings',
      front: 'Spell {c:G7b9} and {c:G7#9}.',
      back: '{c:G7b9}: {n:G} {n:B} {n:D} {n:F} {n:Ab}. {c:G7#9}: {n:G} {n:B} {n:D} {n:F} {n:A#}.',
      ask: {
        type: 'fill-blanks',
        prompt: 'Spell {c:G7b9}.',
        text: '{n:G}  {n:B}  {n:D}  {n:F}  ___',
        blanks: ['{n:Ab}'],
        bank: ['{n:G#}', '{n:A}', '{n:A#}'],
        spelling: 'exact',
        explain: 'A 9th above {n:G} is {n:A}; lower it: {n:Ab}, a kind of A, never {n:G#}.',
      },
    },
  ],
};

const theSharpNineChord: Lesson = {
  id: 'the-sharp-nine-chord',
  title: 'The sharp-nine chord',
  teaches: 'A dominant 7 sharp 9 has a major 3rd and a sharp 9 that sounds like a minor 3rd: a gritty, bluesy clash.',
  minutes: 3,
  skill: `theory:${U}:the-sharp-nine-chord`,
  steps: [
    {
      type: 'card',
      title: 'Major and minor at once',
      body: '{c:E7#9} (x7678x) holds a major 3rd, {n:G#}, and a {d:#9} that sounds like a minor 3rd an octave up. The two rub against each other: the gritty, bluesy sound of so much blues-rock and funk.',
      figure: {
        kind: 'fretboard',
        frets: [5, 9],
        root: 'E',
        labels: 'degree',
        dots: [
          { string: 5, fret: 7, note: 'E', degree: '1', role: 'root' },
          { string: 4, fret: 6, note: 'G#', degree: '3', role: 'third' },
          { string: 3, fret: 7, note: 'D', degree: 'b7', role: 'seventh' },
          { string: 2, fret: 8, note: 'F##', degree: '#9', role: 'target' },
        ],
        caption: '{c:E7#9} (x7678x): 1, 3, {d:b7}, then the {d:#9} on string 2.',
      },
    },
    {
      type: 'card',
      title: 'Spelled as a 9th',
      body: 'The {d:#9} of {c:E7} is spelled {n:F##}: it is a 9th above {n:E}, so it must be a kind of F, even though it sounds like {n:G}. Slide the whole shape down two frets and it is {c:D7#9} (x5456x).',
      figure: { kind: 'audio', sound: { kind: 'chord', chord: 'E7#9', frets: 'x7678x' }, label: 'Hear {c:E7#9}' },
    },
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'E7#9',
      frets: 'x7678x',
      accept: 'this-shape',
      prompt: 'Place {c:E7#9} with the root on string 5, fret 7.',
      explain: 'x7678x: {n:E} at fret 7, {n:G#} at fret 6, {n:D} at fret 7, and the {d:#9}, {n:F##}, at fret 8 of string 2.',
      fact: 'altered-e7sharp9-shape',
    },
    {
      type: 'true-false',
      statement: 'In {c:E7#9}, the {d:#9} is correctly spelled {n:G}.',
      answer: false,
      explain: 'It sounds like {n:G}, but a 9th above {n:E} is a kind of F. Raised, it is {n:F##}. {n:G} would be a 3rd, the minor 3rd the chord does not have.',
      fact: 'altered-sharp-nine-spelling',
    },
    {
      type: 'type-answer',
      prompt: 'Type the {d:#9} of {c:C7#9}.',
      answer: { kind: 'note', value: 'D#', spelling: 'exact' },
      input: 'keypad',
      explain: 'A 9th above {n:C} is {n:D}; raise it: {n:D#}. It sounds like {n:Eb}, the minor 3rd, but as a 9th it is spelled with D.',
    },
    {
      type: 'choice',
      prompt: 'Why does {c:E7#9} sound so gritty?',
      options: [
        { text: 'A minor-3rd sound rubs on its major 3rd', correct: true },
        { text: 'It has no 3rd at all', why: 'It has a major 3rd, {n:G#}, on string 4.' },
        { text: 'Its 5th is lowered', why: 'x7678x has no 5th at all.' },
      ],
      explain: 'The {d:#9}, {n:F##}, sounds like the minor 3rd {n:G}, an octave above the major 3rd {n:G#}. Major and minor at once: that is the grit.',
      fact: 'altered-sharp-nine-sound',
    },
    {
      type: 'listen-choice',
      prompt: 'Plain {c:D7}, or {c:D7#9}?',
      sound: { kind: 'chord', chord: 'D7#9', frets: 'x5456x' },
      options: [{ text: 'Plain {c:D7}' }, { text: '{c:D7#9}', correct: true }],
      shuffle: false,
      explain: 'That was {c:D7#9}, x5456x. On top, the {d:#9}, {n:E#}, sounds like {n:F}, a minor 3rd, while {n:F#} lower down is the major 3rd.',
    },
    {
      type: 'play-chord',
      prompt: 'Slide the shape down two frets and strum {c:D7#9} (x5456x).',
      chord: 'D7#9',
      frets: 'x5456x',
      explain: 'x5456x: {n:D}, {n:F#}, {n:C} and the {d:#9}, {n:E#}, on string 2. The same shape, two frets lower.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'D7#9',
        frets: 'x5456x',
        accept: 'this-shape',
        prompt: 'Place {c:D7#9}: the {c:E7#9} shape, two frets lower.',
        explain: 'x5456x: {n:D} at fret 5, {n:F#} at fret 4, {n:C} at fret 5, {n:E#} at fret 6 of string 2.',
      },
    },
    { generate: 'chord-tones', params: { types: ['7sharp9'], roots: ['C', 'G', 'D', 'A', 'F', 'Bb'], ask: 'notes' } },
  ],
  facts: [
    {
      id: 'altered-sharp-nine-sound',
      front: 'Why does a dominant 7 sharp 9 sound gritty and bluesy?',
      back: 'It has a major 3rd and a {d:#9} that sounds like a minor 3rd an octave higher: major and minor at once.',
    },
    {
      id: 'altered-e7sharp9-shape',
      front: 'Give a common {c:E7#9} shape and its notes.',
      back: 'x7678x: root {n:E}, 3rd {n:G#}, {d:b7} {n:D}, and the {d:#9}, {n:F##}, on string 2.',
      ask: {
        type: 'choice',
        prompt: 'Which shape is {c:E7#9}?',
        options: [
          { text: 'x7678x', correct: true },
          { text: 'x7677x', why: 'String 2 at fret 7 is {n:F#}, the plain 9th: that is {c:E9}.' },
          { text: 'x7675x', why: 'String 2 at fret 5 is {n:E}, the root again: that is plain {c:E7}.' },
        ],
        explain: 'x7678x: the {d:#9}, {n:F##}, sits at fret 8 of string 2.',
      },
    },
    {
      id: 'altered-sharp-nine-spelling',
      front: 'How is the {d:#9} of {c:E7#9} spelled, and why?',
      back: '{n:F##}: a 9th above {n:E} is a kind of F, even though it sounds like {n:G}.',
      ask: {
        type: 'true-false',
        statement: 'The {d:#9} of {c:E7#9} is spelled {n:F##}.',
        answer: true,
        explain: 'A 9th above {n:E} is a kind of F. Raised, it is {n:F##}, which sounds like {n:G}.',
      },
    },
  ],
};

const sevenAltAndTheAlteredScale: Lesson = {
  id: 'seven-alt-and-the-altered-scale',
  title: 'The alt chord and the altered scale',
  teaches: 'An alt chord is a dominant 7th with altered tensions of the player\'s choice; the altered scale holds them all.',
  minutes: 4,
  skill: `theory:${U}:seven-alt-and-the-altered-scale`,
  steps: [
    {
      type: 'card',
      title: 'Alt: you choose',
      body: 'A chord written {c:G7alt} is a dominant 7th whose altered tensions are left to you: any of {d:b9}, {d:#9}, {d:#11} and {d:b13}. To have them all at once, use the {t:altered-scale}: {n:G} {n:Ab} {n:Bb} {n:Cb} {n:Db} {n:Eb} {n:F}.',
      figure: {
        kind: 'fretboard',
        frets: [1, 4],
        root: 'G',
        labels: 'degree',
        dots: [
          { string: 6, fret: 1, note: 'F', degree: 'b7' },
          { string: 6, fret: 3, note: 'G', degree: '1', role: 'root' },
          { string: 6, fret: 4, note: 'Ab', degree: 'b9' },
          { string: 5, fret: 1, note: 'Bb', degree: '#9' },
          { string: 5, fret: 2, note: 'Cb', degree: '3' },
          { string: 5, fret: 4, note: 'Db', degree: '#11' },
          { string: 4, fret: 1, note: 'Eb', degree: 'b13' },
          { string: 4, fret: 3, note: 'F', degree: 'b7' },
          { string: 3, fret: 1, note: 'Ab', degree: 'b9' },
          { string: 3, fret: 3, note: 'Bb', degree: '#9' },
          { string: 3, fret: 4, note: 'Cb', degree: '3' },
          { string: 2, fret: 2, note: 'Db', degree: '#11' },
          { string: 2, fret: 4, note: 'Eb', degree: 'b13' },
          { string: 1, fret: 1, note: 'F', degree: 'b7' },
          { string: 1, fret: 3, note: 'G', degree: '1', role: 'root' },
          { string: 1, fret: 4, note: 'Ab', degree: 'b9' },
        ],
        caption: '{n:G} altered around fret 3, each note named for its job over {c:G7}.',
      },
    },
    {
      type: 'card',
      title: 'Where it comes from',
      body: 'The altered scale is the 7th mode of {t:melodic-minor}, in its rising form. {n:G} altered has the notes of {n:Ab} melodic minor, {n:Ab} {n:Bb} {n:Cb} {n:Db} {n:Eb} {n:F} {n:G}, started on {n:G}. Over {c:G7} it holds the root, 3rd ({n:Cb}) and {d:b7}, plus every altered tension.',
      figure: { kind: 'audio', sound: { kind: 'scale', tonic: 'G3', scale: 'altered', direction: 'up' }, label: 'Hear {n:G} altered' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete {n:G} altered.',
      text: '{n:G}  {n:Ab}  {n:Bb}  ___  {n:Db}  {n:Eb}  {n:F}',
      blanks: ['{n:Cb}'],
      bank: ['{n:B}', '{n:C}', '{n:C#}'],
      spelling: 'exact',
      explain: 'Each letter appears once, so after {n:Bb} comes a kind of C: {n:Cb}. It is the same pitch as {n:B}, the 3rd of {c:G7}.',
      fact: 'altered-scale-notes',
    },
    {
      type: 'type-answer',
      prompt: 'Which melodic minor has the same notes as {n:E} altered? Type its tonic.',
      answer: { kind: 'note', value: 'F', spelling: 'exact' },
      input: 'keypad',
      explain: 'Altered is the 7th mode, so its parent starts a half step higher: {n:F} melodic minor, {n:F} {n:G} {n:Ab} {n:Bb} {n:C} {n:D} {n:E}.',
    },
    {
      type: 'true-false',
      statement: 'The altered scale is the 7th mode of melodic minor.',
      answer: true,
      explain: 'Start {n:Ab} melodic minor on its 7th note, {n:G}, and you get {n:G} altered.',
    },
    {
      type: 'choice',
      prompt: 'A chart says {c:G7alt}. What does that ask for?',
      options: [
        { text: 'A {c:G7} with altered tensions you choose', correct: true },
        { text: 'A {c:G7} with no 3rd', why: 'An alt chord keeps its 3rd and {d:b7}: they make it a dominant.' },
        { text: 'A {c:Gm7}', why: 'It is a dominant 7th: major 3rd, {d:b7}, plus tensions.' },
        { text: 'Only the {d:b9}', why: 'Any of the four: {d:b9}, {d:#9}, {d:#11}, {d:b13}.' },
      ],
      explain: 'Alt means altered dominant: {n:G} {n:B} {n:F} with any mix of {d:b9}, {d:#9}, {d:#11} and {d:b13}, chosen by the player.',
      fact: 'altered-seven-alt',
    },
    {
      type: 'listen-choice',
      prompt: 'Two scales fit {c:G7}. Which is this: Mixolydian or altered?',
      sound: { kind: 'scale', tonic: 'G3', scale: 'altered', direction: 'up' },
      options: [{ text: 'Mixolydian' }, { text: 'Altered', correct: true }],
      shuffle: false,
      explain: 'Altered: the second note, {n:Ab}, came only a half step above {n:G}, and the scale stayed dark and tense. Mixolydian would climb {n:G} {n:A} {n:B}.',
    },
    {
      type: 'choice',
      prompt: 'Which melodic minor has the same notes as {n:G} altered?',
      options: [
        { text: '{n:Ab} melodic minor', correct: true },
        { text: '{n:G} melodic minor', why: '{n:G} melodic minor is {n:G} {n:A} {n:Bb} {n:C} {n:D} {n:E} {n:F#}: other notes.' },
        { text: '{n:F} melodic minor', why: '{n:F} melodic minor holds {n:E}, the parent of {n:E} altered.' },
        { text: '{n:Db} melodic minor', why: '{n:Db} melodic minor holds {n:C} and {n:Fb}: other notes.' },
      ],
      explain: 'Altered is the 7th mode of melodic minor, so the parent starts a half step above: {n:Ab}.',
      fact: 'altered-scale-parent',
    },
    { generate: 'scale-notes', params: { scales: ['altered'], tonics: ['G', 'E', 'A', 'B', 'D', 'C'], form: 'fill' } },
    { generate: 'scale-ear', params: { scales: ['mixolydian', 'altered'] } },
  ],
  facts: [
    {
      id: 'altered-seven-alt',
      front: 'What does {c:G7alt} mean on a chart?',
      back: 'A {c:G7} whose altered tensions, any of {d:b9}, {d:#9}, {d:#11} and {d:b13}, are chosen by the player.',
    },
    {
      id: 'altered-scale-notes',
      front: 'Where does the altered scale come from? Spell {n:G} altered.',
      back: 'It is the 7th mode of melodic minor: {n:G} {n:Ab} {n:Bb} {n:Cb} {n:Db} {n:Eb} {n:F}.',
      ask: {
        type: 'fill-blanks',
        prompt: 'Complete {n:G} altered.',
        text: '{n:G}  ___  {n:Bb}  {n:Cb}  {n:Db}  ___  {n:F}',
        blanks: ['{n:Ab}', '{n:Eb}'],
        bank: ['{n:A}', '{n:G#}', '{n:E}', '{n:D#}'],
        spelling: 'exact',
        explain: 'One of each letter: {n:G} {n:Ab} {n:Bb} {n:Cb} {n:Db} {n:Eb} {n:F}.',
      },
    },
    {
      id: 'altered-scale-parent',
      front: 'Which melodic minor has the same notes as {n:G} altered?',
      back: '{n:Ab} melodic minor: start it on its 7th note, {n:G}.',
    },
  ],
};

const tritoneSubstitution: Lesson = {
  id: 'tritone-substitution',
  title: 'Tritone substitution',
  teaches: 'A dominant 7th can be swapped for the dominant 7th a tritone away, because the two chords share one tritone.',
  minutes: 4,
  skill: `theory:${U}:tritone-substitution`,
  steps: [
    {
      type: 'card',
      title: 'Same tritone, other root',
      body: '{c:G7} holds a {t:tritone}: {n:B} and {n:F}, its 3rd and 7th. {c:Db7} holds the same two pitches, spelled {n:Cb} and {n:F}: its 7th and 3rd. So {c:Db7} can stand in for {c:G7}. That is {t:tritone-substitution}, written {r:subV7}.',
      figure: {
        kind: 'fretboard',
        frets: [2, 7],
        root: 'Db',
        labels: 'degree',
        dots: [
          { string: 5, fret: 4, note: 'Db', degree: '1', role: 'root' },
          { string: 3, fret: 4, note: 'Cb', degree: 'b7', role: 'target' },
          { string: 2, fret: 6, note: 'F', degree: '3', role: 'target' },
        ],
        caption: '{c:Db7} shell (x4x46x): its {n:Cb} and {n:F} are the {n:B} and {n:F} of {c:G7}.',
      },
    },
    {
      type: 'card',
      title: 'A bass that slides',
      body: 'In {k:C major} play {c:Dm7} (x5x56x), {c:Db7} (x4x46x), {c:Cmaj7} (x3x45x). The root slides down a fret at a time, {n:D} {n:Db} {n:C}: a chromatic bass line in place of the leap {n:D} {n:G} {n:C}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Dm7', 'Db7', 'Cmaj7'], beats: 4, tempo: 80 }, label: 'Hear the slide' },
    },
    {
      type: 'type-answer',
      prompt: 'Type the tritone substitute of {c:D7}.',
      answer: { kind: 'chord', value: 'Ab7', spelling: 'exact' },
      input: 'keyboard',
      explain: 'A tritone from {n:D} is {n:Ab}, spelled to sit a half step above the target, {n:G}: {c:Ab7}. It shares {n:C} and {n:F#} (as {n:Gb}) with {c:D7}.',
    },
    {
      type: 'choice',
      prompt: 'Which two notes do {c:G7} and {c:Db7} share in sound?',
      options: [
        { text: '{n:B} (or {n:Cb}) and {n:F}', correct: true },
        { text: '{n:G} and {n:Db}', why: 'Those are the two roots, a tritone apart.' },
        { text: '{n:D} and {n:Ab}', why: 'Those are the two 5ths.' },
        { text: '{n:B} and {n:D}', why: '{n:D} is the 5th of {c:G7}; {c:Db7} has no {n:D}.' },
      ],
      spelling: 'exact',
      explain: '{c:G7} is {n:G} {n:B} {n:D} {n:F}; {c:Db7} is {n:Db} {n:F} {n:Ab} {n:Cb}. The 3rd and 7th of one are the 7th and 3rd of the other.',
      fact: 'altered-shared-tritone',
    },
    {
      type: 'listen-choice',
      prompt: 'In {k:C major}: {r:ii}–{r:V7}–{r:I}, or {r:ii}–{r:subV7}–{r:I}?',
      sound: { kind: 'progression', chords: ['Dm7', 'Db7', 'Cmaj7'], beats: 4, tempo: 80 },
      options: [{ text: '{r:ii}–{r:V7}–{r:I}' }, { text: '{r:ii}–{r:subV7}–{r:I}', correct: true }],
      shuffle: false,
      explain: 'The bass slid down by half steps, {n:D} {n:Db} {n:C}: that is {c:Db7}, the {r:subV7}. {c:G7} would have leapt to {n:G}.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each dominant 7th with its tritone substitute.',
      pairs: [
        { left: '{c:G7}', right: '{c:Db7}' },
        { left: '{c:D7}', right: '{c:Ab7}' },
        { left: '{c:A7}', right: '{c:Eb7}' },
        { left: '{c:E7}', right: '{c:Bb7}' },
      ],
      explain: 'Each pair of roots is a tritone apart, and each pair of chords shares its 3rd and 7th.',
      fact: 'altered-tritone-sub',
    },
    {
      type: 'choice',
      prompt: 'In {c:Dm7} {c:Db7} {c:Cmaj7}, how does the bass move?',
      options: [
        { text: 'Down a half step each time', correct: true },
        { text: 'Down a fifth, then down a fifth', why: 'That is the plain two-five-one, {n:D} {n:G} {n:C}.' },
        { text: 'It stays on {n:D}', why: 'Each chord has its own root: {n:D}, {n:Db}, {n:C}.' },
      ],
      shuffle: false,
      explain: '{n:D}, {n:Db}, {n:C}: a chromatic line, one fret at a time on string 5.',
      fact: 'altered-chromatic-bass',
    },
    {
      type: 'fill-blanks',
      prompt: 'In {k:G major}, swap the {r:V7} of this two-five-one for its tritone substitute.',
      text: '{c:Am7}  ___  {c:Gmaj7}',
      blanks: ['{c:Ab7}'],
      bank: ['{c:D7}', '{c:G7}', '{c:Eb7}'],
      explain: 'The {r:V7} of {k:G major} is {c:D7}; its tritone substitute is {c:Ab7}. The bass then falls {n:A} {n:Ab} {n:G}.',
    },
    {
      type: 'play-chord',
      prompt: 'Strum the {c:Db7} shell (x4x46x), the {r:subV7} of {k:C major}.',
      chord: 'Db7',
      frets: 'x4x46x',
      explain: 'x4x46x: {n:Db}, {n:Cb} and {n:F}. Keep string 3 where it is and move the other two fingers down a fret: x3x45x, {c:Cmaj7}.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Db7',
        frets: 'x4x46x',
        accept: 'this-shape',
        prompt: 'Build the {c:Db7} shell, root on string 5.',
        explain: 'x4x46x: {n:Db} at fret 4 of string 5, {n:Cb} at fret 4 of string 3, {n:F} at fret 6 of string 2.',
      },
    },
  ],
  facts: [
    {
      id: 'altered-tritone-sub',
      front: 'What is a tritone substitute?',
      back: 'The dominant 7th a tritone away, used in place of the original: {c:Db7} for {c:G7}, written {r:subV7}.',
      ask: {
        type: 'type-answer',
        prompt: 'Type the tritone substitute of {c:A7}.',
        answer: { kind: 'chord', value: 'Eb7', spelling: 'exact' },
        input: 'keyboard',
        explain: 'A tritone from {n:A} is {n:Eb}, a half step above the target {n:D}: {c:Eb7}.',
      },
    },
    {
      id: 'altered-shared-tritone',
      front: 'Why can {c:Db7} replace {c:G7}?',
      back: 'They share a tritone: {n:B} and {n:F} in {c:G7}, spelled {n:Cb} and {n:F} in {c:Db7}.',
    },
    {
      id: 'altered-chromatic-bass',
      front: 'What bass line does {c:Dm7} {c:Db7} {c:Cmaj7} make?',
      back: 'A chromatic one, falling a half step at a time: {n:D}, {n:Db}, {n:C}.',
    },
  ],
};

const backdoorDominant: Lesson = {
  id: 'backdoor-dominant',
  title: 'The backdoor dominant',
  teaches: 'The dominant 7th on the flat 7th can lead home like a dominant, often after the minor four: the backdoor.',
  minutes: 3,
  skill: `theory:${U}:backdoor-dominant`,
  steps: [
    {
      type: 'card',
      title: 'Home by the back door',
      body: 'The front door home in {k:C major} is {c:G7}. The {t:backdoor-dominant} is {c:Bb7}, the {r:bVII7}, rising a whole step to {c:C}. It often follows the minor {r:iv}: {c:Fm7} (131111), {c:Bb7} (x13131), {c:Cmaj7} (x3545x).',
      figure: { kind: 'chord', symbol: 'Bb7', frets: 'x13131', caption: '{c:Bb7} (x13131): the backdoor dominant of {k:C major}.' },
    },
    {
      type: 'card',
      title: 'Front door, back door',
      body: 'First the front door, {c:Dm7} {c:G7} {c:Cmaj7}, then the back door, {c:Fm7} {c:Bb7} {c:Cmaj7}. The second arrives more softly. {r:iv7}–{r:bVII7}–{r:I} is called the backdoor two-five.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Dm7', 'G7', 'Cmaj7', 'Fm7', 'Bb7', 'Cmaj7'], beats: 2, tempo: 84 }, label: 'Front door, then back' },
    },
    {
      type: 'type-answer',
      prompt: 'In {k:G major}, type the backdoor dominant.',
      answer: { kind: 'chord', value: 'F7', spelling: 'exact' },
      input: 'keyboard',
      explain: 'A whole step below {n:G} is {n:F}: the backdoor dominant is {c:F7}, the {r:bVII7}, rising to {c:G}.',
    },
    {
      type: 'choice',
      prompt: 'Which notes does {c:Bb7} share with {c:G7b9}?',
      options: [
        { text: '{n:D}, {n:F} and {n:Ab}', correct: true },
        { text: '{n:Bb}, {n:D} and {n:F}', why: '{c:G7b9} has no {n:Bb}: it is {n:G} {n:B} {n:D} {n:F} {n:Ab}.' },
        { text: '{n:G}, {n:B} and {n:D}', why: '{c:Bb7} has no {n:G} or {n:B}.' },
        { text: '{n:F}, {n:Ab} and {n:B}', why: '{c:Bb7} has no {n:B}: it is {n:Bb} {n:D} {n:F} {n:Ab}.' },
      ],
      explain: '{c:Bb7} is {n:Bb} {n:D} {n:F} {n:Ab}; {c:G7b9} is {n:G} {n:B} {n:D} {n:F} {n:Ab}. Three shared notes, so {c:Bb7} can lead home like a dominant.',
      fact: 'altered-backdoor-shared-notes',
    },
    {
      type: 'listen-choice',
      prompt: 'Front door ({r:V7}–{r:I}) or backdoor ({r:bVII7}–{r:I})?',
      sound: { kind: 'progression', chords: ['Fm7', 'Bb7', 'Cmaj7'], beats: 4, tempo: 80 },
      options: [{ text: 'Front door' }, { text: 'Backdoor', correct: true }],
      shuffle: false,
      explain: 'Backdoor: {c:Fm7}, {c:Bb7}, then {c:Cmaj7}. The last chord change rose a whole step in the bass instead of falling a fifth.',
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete the backdoor two-five in {k:C major}.',
      text: '{c:Fm7}  ___  {c:Cmaj7}',
      blanks: ['{c:Bb7}'],
      bank: ['{c:B7}', '{c:Bbmaj7}', '{c:Eb7}'],
      explain: '{r:iv7}–{r:bVII7}–{r:I}: {c:Fm7} {c:Bb7} {c:Cmaj7}. {c:Bbmaj7} has {n:A}, not the {n:Ab} that pulls toward {n:G}.',
      fact: 'altered-backdoor-ii-v',
    },
    {
      type: 'true-false',
      statement: 'The backdoor dominant of {k:C major} is {c:Bb7}, resolving up a whole step to {c:C}.',
      answer: true,
      explain: '{c:Bb7} is the {r:bVII7}, borrowed from {k:C minor}: its root rises a whole step to {n:C}.',
      fact: 'altered-backdoor-dominant',
    },
    {
      type: 'choice',
      prompt: 'Which chord usually comes just before the backdoor dominant?',
      options: [
        { text: 'The minor {r:iv7}: {c:Fm7} in {k:C major}', correct: true },
        { text: 'The {r:ii7}: {c:Dm7} in {k:C major}', why: '{c:Dm7} leads to {c:G7}, the front door.' },
        { text: 'The {r:V7}: {c:G7} in {k:C major}', why: '{c:G7} already leads home; the backdoor replaces it.' },
      ],
      explain: '{r:iv7}–{r:bVII7}–{r:I}, the backdoor two-five: {c:Fm7} {c:Bb7} {c:C}.',
    },
    {
      type: 'play-chord',
      prompt: 'Play {c:Fm7}, {c:Bb7}, {c:Cmaj7}. Strum the {c:Bb7} (x13131).',
      chord: 'Bb7',
      frets: 'x13131',
      explain: 'x13131: {n:Bb}, {n:F}, {n:Ab}, {n:D} and {n:F}. The {n:Ab} on string 3 falls to {n:G} in {c:Cmaj7}.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Bb7',
        frets: 'x13131',
        accept: 'any-voicing',
        prompt: 'Build {c:Bb7}, the backdoor dominant of {k:C major}.',
        explain: 'x13131: the A-shape barre at fret 1, with {n:F} and {n:D} at fret 3.',
      },
    },
  ],
  facts: [
    {
      id: 'altered-backdoor-dominant',
      front: 'What is the backdoor dominant?',
      back: '{r:bVII7} resolving to {r:I}: {c:Bb7} to {c:C} in {k:C major}.',
      ask: {
        type: 'type-answer',
        prompt: 'In {k:D major}, type the backdoor dominant.',
        answer: { kind: 'chord', value: 'C7', spelling: 'exact' },
        input: 'keyboard',
        explain: 'A whole step below {n:D} is {n:C}: {c:C7}, the {r:bVII7}.',
      },
    },
    {
      id: 'altered-backdoor-ii-v',
      front: 'What is the backdoor two-five?',
      back: '{r:iv7}–{r:bVII7}–{r:I}: {c:Fm7} {c:Bb7} {c:C} in {k:C major}.',
    },
    {
      id: 'altered-backdoor-shared-notes',
      front: 'Why can {c:Bb7} lead home like {c:G7}?',
      back: 'It holds {n:D}, {n:F} and {n:Ab}: three of the notes of {c:G7b9}.',
    },
  ],
};

const diminishedAsDominant: Lesson = {
  id: 'diminished-as-dominant',
  title: 'The diminished seventh as a dominant',
  teaches: 'A diminished 7th on the leading tone is a rootless dominant 7 flat 9, so it can stand in for the dominant.',
  minutes: 3,
  skill: `theory:${U}:diminished-as-dominant`,
  steps: [
    {
      type: 'card',
      title: 'A dominant without its root',
      body: '{c:G7b9} is {n:G} {n:B} {n:D} {n:F} {n:Ab}. Take away the {n:G} and what is left, {n:B} {n:D} {n:F} {n:Ab}, is {c:Bdim7}: the {r:vii°7} of {k:C major}, its {n:Ab} borrowed from {k:C minor}. So {c:Bdim7} to {c:C} works like {c:G7b9} to {c:C}.',
      figure: {
        kind: 'keyboard',
        keys: [{ note: 'G3', role: 'ghost' }, 'B3', 'D4', 'F4', { note: 'Ab4', role: 'target' }],
        from: 'G3',
        to: 'A4',
        caption: '{c:G7b9}: take away the {n:G} and {c:Bdim7} is left.',
      },
    },
    {
      type: 'card',
      title: 'Hear them both',
      body: 'Play {c:Bdim7} (x2313x), {c:C} (x32010), then {c:G7b9} (3231xx), {c:C}. Four notes are the same in both chords, and both lead home the same way: {n:B} rises to {n:C}, {n:Ab} falls to {n:G}.',
      figure: { kind: 'audio', sound: { kind: 'progression', chords: ['Bdim7', 'C', 'G7b9', 'C'], beats: 4, tempo: 72 }, label: 'Hear both resolve' },
    },
    {
      type: 'choice',
      prompt: '{c:Bdim7} is which dominant chord without its root?',
      options: [
        { text: '{c:G7b9}', correct: true },
        { text: '{c:G7}', why: '{c:G7} without its root is {n:B} {n:D} {n:F}: no {n:Ab}, so not a diminished 7th.' },
        { text: '{c:C7b9}', why: '{c:C7b9} without its root is {n:E} {n:G} {n:Bb} {n:Db}: {c:Edim7}.' },
        { text: '{c:A7b9}', why: '{c:A7b9} without its root is {n:C#} {n:E} {n:G} {n:Bb}: {c:C#dim7}.' },
      ],
      explain: '{c:G7b9} is {n:G} {n:B} {n:D} {n:F} {n:Ab}. Without the {n:G}: {n:B} {n:D} {n:F} {n:Ab}, which is {c:Bdim7}.',
      fact: 'altered-bdim7-is-g7b9',
    },
    {
      type: 'true-false',
      statement: '{c:Bdim7} can stand in for {c:G7} in a cadence to {c:C}.',
      answer: true,
      explain: '{c:Bdim7} is {c:G7b9} without its root, so it holds the same tritone, {n:B} and {n:F}, and leads to {c:C} the same way.',
      fact: 'altered-vii7-for-v7',
    },
    {
      type: 'type-answer',
      prompt: 'Type the diminished 7th chord that leads to {c:D}.',
      answer: { kind: 'chord', value: 'C#dim7', spelling: 'exact' },
      input: 'keyboard',
      explain: 'A half step below {n:D} is {n:C#}: {c:C#dim7}, {n:C#} {n:E} {n:G} {n:Bb}, which is {c:A7b9} without its root.',
      fact: 'altered-dim7-leads-up',
    },
    {
      type: 'listen-choice',
      prompt: 'Listen to the bass. Did the diminished 7th resolve up a half step?',
      sound: { kind: 'progression', chords: ['C', 'C#dim7', 'Dm7'], voicing: 'close', beats: 4, tempo: 72 },
      options: [{ text: 'Yes: up a half step', correct: true }, { text: 'No: down a fifth' }],
      shuffle: false,
      explain: 'The bass went {n:C}, {n:C#}, {n:D}: {c:C#dim7} climbed a half step into {c:Dm7}, like the rootless {c:A7b9} it is.',
    },
    {
      type: 'card',
      title: 'One for any chord',
      body: 'A diminished 7th a half step below any chord can lead into it: {c:F#dim7} to {c:G}, {c:G#dim7} to {c:Am}, {c:C#dim7} to {c:Dm}. Each is the rootless {r:V7b9} of the chord it leads to.',
      figure: { kind: 'chord', symbol: 'Bdim7', frets: 'x2313x', caption: '{c:Bdim7} (x2313x): {n:B} in the bass, a half step under {n:C}.' },
    },
    {
      type: 'fill-blanks',
      prompt: 'Complete {c:C#dim7}, the rootless {c:A7b9}.',
      text: '{n:C#}  {n:E}  {n:G}  ___',
      blanks: ['{n:Bb}'],
      bank: ['{n:A#}', '{n:B}', '{n:A}'],
      spelling: 'exact',
      explain: 'Minor 3rds stacked on {n:C#}: {n:E}, {n:G}, then {n:Bb}. A 7th above {n:C#} is a kind of B, so {n:Bb}, not {n:A#}.',
    },
    {
      type: 'play-chord',
      prompt: 'Strum {c:Bdim7} (x2313x), then let it rise into {c:C}.',
      chord: 'Bdim7',
      frets: 'x2313x',
      explain: 'x2313x: {n:B}, {n:F}, {n:Ab} and {n:D}. Every note is a step from a note of {c:C}.',
      alternative: {
        type: 'chord-build',
        task: 'fingers',
        chord: 'Bdim7',
        frets: 'x2313x',
        accept: 'this-shape',
        prompt: 'Build {c:Bdim7} on strings 5 to 2.',
        explain: 'x2313x: {n:B} at fret 2, {n:F} at fret 3, {n:Ab} at fret 1, {n:D} at fret 3 of string 2.',
      },
    },
    { generate: 'chord-tones', params: { types: ['dim7', '7b9'], roots: ['B', 'C#', 'F#', 'G#', 'G', 'A'], ask: 'notes' } },
  ],
  facts: [
    {
      id: 'altered-bdim7-is-g7b9',
      front: 'How is {c:Bdim7} related to {c:G7b9}?',
      back: 'It is {c:G7b9} without its root: {n:B} {n:D} {n:F} {n:Ab}, against {n:G} {n:B} {n:D} {n:F} {n:Ab}.',
    },
    {
      id: 'altered-vii7-for-v7',
      front: 'Can {r:vii°7} stand in for {r:V7}?',
      back: 'Yes: {c:Bdim7} to {c:C} works like {c:G7b9} to {c:C}.',
    },
    {
      id: 'altered-dim7-leads-up',
      front: 'Which diminished 7th can lead into a chord?',
      back: 'The one a half step below its root: the rootless dominant 7 flat 9 of that chord. {c:C#dim7} leads into {c:D}.',
      ask: {
        type: 'type-answer',
        prompt: 'Type the diminished 7th chord that leads to {c:A}.',
        answer: { kind: 'chord', value: 'G#dim7', spelling: 'exact' },
        input: 'keyboard',
        explain: 'A half step below {n:A} is {n:G#}: {c:G#dim7}, the rootless {c:E7b9}.',
      },
    },
  ],
};

/** Unit 35 of the Theory Path. */
const unit: Unit = {
  id: U,
  title: 'Altered dominants, substitutions',
  theme: 'harmony',
  description: 'Altered tensions, the sharp-nine and alt chords, tritone substitution, the backdoor dominant and the diminished seventh as a dominant.',
  lessons: [alteredTensions, theSharpNineChord, sevenAltAndTheAlteredScale, tritoneSubstitution, backdoorDominant, diminishedAsDominant],
  checkpoint: {
    maxMistakes: 3,
    steps: [
      {
        type: 'match-pairs',
        prompt: 'Over {c:G7}, match each altered tension with its note.',
        pairs: [
          { left: '{d:b9}', right: '{n:Ab}' },
          { left: '{d:#9}', right: '{n:A#}' },
          { left: '{d:#11}', right: '{n:C#}' },
          { left: '{d:b13}', right: '{n:Eb}' },
        ],
        explain: 'Above {n:G}: {n:A} lowered or raised, {n:C} raised, {n:E} lowered.',
      },
      {
        type: 'choice',
        prompt: 'In {c:G7b9} to {c:C}, where does the {n:Ab} usually go?',
        options: [
          { text: 'Down a half step to {n:G}', correct: true },
          { text: 'Up a half step to {n:A}', why: '{n:A} is not in {c:C}.' },
          { text: 'Up to {n:C}', why: 'That is a major 3rd up.' },
        ],
        explain: 'The {d:b9} falls a half step to {n:G}, the 5th of {c:C}.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Spell {c:G7#9}.',
        text: '{n:G}  {n:B}  {n:D}  {n:F}  ___',
        blanks: ['{n:A#}'],
        bank: ['{n:Bb}', '{n:A}', '{n:Ab}'],
        spelling: 'exact',
        explain: 'A raised 9th above {n:G} is {n:A#}, a kind of A.',
      },
      {
        type: 'true-false',
        statement: 'The {d:#9} of {c:E7#9} is spelled {n:F##}, though it sounds like {n:G}.',
        answer: true,
        explain: 'A 9th above {n:E} is a kind of F; raised, it is {n:F##}.',
      },
      {
        type: 'choice',
        prompt: 'Which shape is {c:E7#9}?',
        options: [
          { text: 'x7678x', correct: true },
          { text: 'x7677x', why: 'String 2 at fret 7 is {n:F#}: that is {c:E9}.' },
          { text: 'x7675x', why: 'String 2 at fret 5 is {n:E}: that is plain {c:E7}.' },
        ],
        explain: 'x7678x: {n:E}, {n:G#}, {n:D}, and the {d:#9} {n:F##} on string 2.',
      },
      {
        type: 'type-answer',
        prompt: 'Type the {d:#9} of {c:F7#9}.',
        answer: { kind: 'note', value: 'G#', spelling: 'exact' },
        input: 'keypad',
        explain: 'A 9th above {n:F} is {n:G}; raised: {n:G#}, which sounds like {n:Ab}, the minor 3rd.',
      },
      {
        type: 'choice',
        prompt: 'Where does the altered scale come from?',
        options: [
          { text: 'It is the 7th mode of melodic minor', correct: true },
          { text: 'It is the 5th mode of the major scale', why: 'That is Mixolydian.' },
          { text: 'It is the 5th mode of harmonic minor', why: 'That is Phrygian dominant.' },
        ],
        explain: '{n:G} altered is {n:Ab} melodic minor started on {n:G}, its 7th note.',
      },
      {
        type: 'fill-blanks',
        prompt: 'Complete {n:A} altered.',
        text: '{n:A}  {n:Bb}  {n:C}  ___  {n:Eb}  {n:F}  {n:G}',
        blanks: ['{n:Db}'],
        bank: ['{n:C#}', '{n:D}', '{n:B}'],
        spelling: 'exact',
        explain: 'One of each letter: {n:A} {n:Bb} {n:C} {n:Db} {n:Eb} {n:F} {n:G}, the notes of {n:Bb} melodic minor.',
      },
      {
        type: 'type-answer',
        prompt: 'Type the tritone substitute of {c:A7}.',
        answer: { kind: 'chord', value: 'Eb7', spelling: 'exact' },
        input: 'keyboard',
        explain: 'A tritone from {n:A} is {n:Eb}, a half step above the target {n:D}: {c:Eb7}.',
      },
      {
        type: 'choice',
        prompt: 'Which two notes do {c:D7} and {c:Ab7} share in sound?',
        options: [
          { text: '{n:F#} (or {n:Gb}) and {n:C}', correct: true },
          { text: '{n:D} and {n:Ab}', why: 'Those are the roots, a tritone apart.' },
          { text: '{n:A} and {n:Eb}', why: 'Those are the two 5ths.' },
        ],
        spelling: 'exact',
        explain: '{c:D7} is {n:D} {n:F#} {n:A} {n:C}; {c:Ab7} is {n:Ab} {n:C} {n:Eb} {n:Gb}. They share the tritone {n:C} and {n:F#}.',
      },
      {
        type: 'type-answer',
        prompt: 'In {k:F major}, type the backdoor dominant.',
        answer: { kind: 'chord', value: 'Eb7', spelling: 'exact' },
        input: 'keyboard',
        explain: 'A whole step below {n:F} is {n:Eb}: {c:Eb7}, the {r:bVII7}.',
      },
      {
        type: 'choice',
        prompt: 'What is {c:Fm7} {c:Bb7} {c:C} in {k:C major}?',
        options: [
          { text: 'The backdoor two-five', correct: true },
          { text: 'A tritone substitution', why: 'The tritone substitute of {c:G7} would be {c:Db7}.' },
          { text: 'A plain two-five-one', why: 'That would be {c:Dm7} {c:G7} {c:C}.' },
        ],
        explain: '{r:iv7}–{r:bVII7}–{r:I}: the backdoor two-five.',
      },
      {
        type: 'choice',
        prompt: '{c:Bdim7} is which dominant chord without its root?',
        options: [
          { text: '{c:G7b9}', correct: true },
          { text: '{c:C7b9}', why: 'Without its root that is {c:Edim7}.' },
          { text: '{c:D7b9}', why: 'Without its root that is {c:F#dim7}.' },
        ],
        explain: '{c:G7b9} minus {n:G} is {n:B} {n:D} {n:F} {n:Ab}: {c:Bdim7}.',
      },
      {
        type: 'type-answer',
        prompt: 'Type the diminished 7th chord that leads to {c:A}.',
        answer: { kind: 'chord', value: 'G#dim7', spelling: 'exact' },
        input: 'keyboard',
        explain: 'A half step below {n:A} is {n:G#}: {c:G#dim7}, the rootless {c:E7b9}.',
      },
      {
        type: 'listen-choice',
        prompt: 'In {k:C major}: {r:ii}–{r:V7}–{r:I}, or {r:ii}–{r:subV7}–{r:I}?',
        sound: { kind: 'progression', chords: ['Dm7', 'G7', 'Cmaj7'], beats: 4, tempo: 80 },
        options: [{ text: '{r:ii}–{r:V7}–{r:I}', correct: true }, { text: '{r:ii}–{r:subV7}–{r:I}' }],
        shuffle: false,
        explain: 'The bass leapt {n:D} {n:G} {n:C}: the front-door {c:G7}, not the sliding {c:Db7}.',
      },
      { generate: 'scale-ear', params: { scales: ['mixolydian', 'altered'] } },
    ],
  },
};

export default unit;

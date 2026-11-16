/**
 * Prof. Varga, unit 10: Classical repertoire (plan: `elena/elena-classical-repertoire` in
 * src/content/plan/teachers.json).
 *
 * Elena's voice: rigorous, dry, respectful. Studies, Baroque dances, Romantic rubato, longer forms,
 * Bach, Asturias, and a summit piece with a three-month plan. Every fact of the plan's `explain` is on
 * the cards; the figures are rhythms, shapes and passages of library pieces (cross-checked in
 * `elena-classical-repertoire.test.ts`) and one original pedal exercise in the manner of Asturias.
 *
 * None of the classical solos this unit names is in the song library: each must be read from a
 * printed edition, which this project cannot consult. So the first lesson teaches the learner to
 * bring their own edition in (Tools > Scan & Import: photograph or drop in a PDF, read, proofread,
 * save and play), every lesson names the piece and what to do with it once scanned, and each task
 * goes to the nearest library piece for the same skill:
 *   Carcassi Op. 60 No. 7, Sor Op. 35 No. 22  -> Fingerstyle: p i m a m i in 3/4 (`st-pimami-3-4`)
 *   de Visee and Handel sarabandes            -> the Metronome, beat 2 accented (no sarabande in the library)
 *   Bach's Bourree in E minor                 -> Two-Voice Invention (`st-two-voice-invention`) while it
 *                                                lands, then the Baroque-style duo (`st-duet-baroque`)
 *   Sanz's Canarios (hemiola)                 -> Flamenco Rhythm: the 12-Beat Cycle (`st-solea-compas`)
 *   Lagrima (rubato)                          -> Fur Elise, the theme (`fur-elise-theme`)
 *   Mertz's Romanze (song without words)      -> Chord Melody: First Ballad (`st-chord-melody-1`)
 *   Gran Vals (sections and joins)            -> DADGAD Air (`st-dadgad-air`)
 *   Coste Op. 38 No. 1 (position playing)     -> Reading: Seventh Position (`st-read-seventh-position`)
 *   Sor's Folies (variations on a ground)     -> Canon in D (`canon-in-d`)
 *   Jesu, Joy (voices inside triplets)        -> Two-Voice Invention / the duo, as above
 *   Gavotte en Rondeau (a rondo refrain)      -> Rondo alla Turca, the theme (`rondo-alla-turca`)
 *   Asturias (pedal, Phrygian colour)         -> the pedal exercise on the card; the solea falseta
 *   The four summit pieces                    -> the Concert Tremolo Etude for Recuerdos (fallback:
 *                                                Classical Tremolo), the learner's own scans for the rest
 * The unit's performance is the subject of the Two-Voice Invention (bar 1), the line the learner
 * took in wait mode in lessons 2 and 5: one line implying its harmony, as the Cello Suite Prelude
 * does. (The Rondo alla Turca theme was already played to tempo in unit 8, so it is not the show.)
 */
import type { TabNote } from '@/lessons';
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, toolTask } from '../tasks';

/** One tab note. */
function t(string: number, fret: number, duration: string): TabNote {
  return { string, fret, duration };
}

/** The sarabande rhythm, two bars of 3/4: the long note on beat 2. */
export const SARABANDE = 'q h | q q. e';

/** The bourree: an upbeat before the bar, then two half-note beats (2/2). */
export const BOURREE = 'hr qr q | q q h';

/** The canarios' hemiola: six eighths in two, then in three (6/8). */
export const HEMIOLA = 'q. q. | q q q';

/** Jesu, Joy's flowing triplets: nine notes to a bar of 3/4. */
export const TRIPLETS = 'et et et et et et et et et';

/** An original pedal exercise in the manner of Asturias: a line on strings 4 and 3, the open B between. */
export const PEDAL: TabNote[] = [4, 4, 3, 4].flatMap((s, i) => [t(s, [2, 3, 1, 3][i], 'et'), t(2, 0, 'et'), t(2, 0, 'et')]);

/**
 * The Two-Voice Invention's subject, bar 1, the treble alone, as the library has it (seventh
 * position): E up to B, A G F# E running down, D# and the low B, home to E. One line that implies
 * Em, B7, Em: the unit's performance.
 */
export const INVENTION_SUBJECT: TabNote[] = [
  t(3, 9, 'e'), t(1, 7, 'e'), t(2, 10, 's'), t(2, 8, 's'), t(2, 7, 's'), t(3, 9, 's'), t(3, 8, 'e'), t(4, 9, 'e'), t(3, 9, 'q'),
];

// ── 1. Studies of the masters ───────────────────────────────────────────────────────────────────

const studiesOfTheMasters: TeacherLesson = {
  id: 'studies-of-the-masters',
  title: 'Studies of the masters',
  teaches: 'A study has a technical purpose and real music in it; your own edition comes in through Scan & Import.',
  minutes: 5,
  skill: 'teacher:elena:studies-of-the-masters',
  steps: [
    {
      type: 'card',
      title: 'Studies',
      body: 'A {t:study} is a piece with a technical purpose and real music in it. Carcassi\'s A minor study, Op. 60 No. 7, builds right-hand stamina with repeated treble notes inside arpeggios; most guitarists play those with i-m-a. Sor\'s B minor study, Op. 35 No. 22, asks for a singing melody inside arpeggiated chords.',
    },
    {
      type: 'choice',
      prompt: 'A treble note repeats inside an arpeggio, as in Carcassi\'s study. The usual fingering?',
      options: [
        { text: 'i, m and a in turn', correct: true },
        { text: 'The same finger each time', why: 'One finger must replant on a ringing string for every repetition: slower, and it tires.' },
        { text: 'The thumb', why: 'The thumb is busy with the bass.' },
      ],
      explain: 'Rotating i, m and a lets each finger recover while the others play. That is the stamina the study builds.',
      fact: 'repeated-notes-ima',
    },
    {
      type: 'card',
      id: 'scan-import',
      title: 'Bring in your edition',
      body: 'None of this unit\'s solos is in the library: each must be read from a printed edition. So bring yours in. In Tools, open Scan & Import: photograph each page flat and in good light, or drop in a PDF. Read the music, then proofread the reading against your page, bar by bar. Save and play: it opens in the Player.',
      tip: 'The reader makes mistakes. Check every bar before you trust it: a wrong note learned is slow to unlearn.',
    },
    {
      type: 'order',
      prompt: 'Put the steps of bringing in a printed study in order.',
      tiles: ['Photograph it', 'Read the music', 'Proofread it', 'Save and play'],
      explain: 'Photograph each page (or drop in a PDF), read the music, proofread the reading against the page, then save and play. Proofreading is not optional.',
      fact: 'scan-import',
    },
    {
      type: 'card',
      title: 'Sor\'s melody, and his tempo',
      body: 'In Sor\'s study the melody hides inside the chords: find it, then voice it above them, a little firmer on the melody finger and lighter on the rest. He marks it Allegretto, so do not let it drag. In the library\'s {k:A minor} study, the a finger carries a tune in the same way:',
      figure: {
        kind: 'staff',
        key: 'A minor',
        time: '3/4',
        notes: ['E4', 'F4', 'G#4', 'E4', 'G4', 'F4', 'E4'].map((note) => ({ note, duration: 'h.' })),
        caption: 'The tune on top of bars 9 to 15, one note a bar.',
      },
    },
    {
      type: 'true-false',
      statement: 'Sor marks the B minor study Allegretto, so a slow, lingering tempo suits it.',
      answer: false,
      explain: 'Allegretto is moderately quick. Let the melody sing, but do not let it drag: singing and walking are not in conflict.',
      fact: 'sor-allegretto',
    },
    playerTask({
      id: 'tune-inside',
      title: 'A tune inside the arpeggio, wait mode',
      song: 'st-pimami-3-4',
      mode: 'wait',
      bars: [9, 16],
      minutes: 5,
      body: 'Neither study is in the library. Its nearest relation for both is this {k:A minor} study: i, m and a on the treble strings for stamina, and in bars 9 to 16 a tune for the a finger above the arpeggio, as in Sor. Those bars in wait mode first.',
    }),
    playerTask({
      id: 'study-recorded',
      title: 'The whole study, recorded',
      song: 'st-pimami-3-4',
      minutes: 5,
      body: 'Then the whole study at 100 % (66 BPM), and record it on your phone. Listen back for one thing: is the melody louder than the accompaniment? Your scans: Carcassi in wait mode, then at 72, 88 and 100 BPM; Sor in wait mode, then at 60 and 76.',
    }),
    {
      type: 'choice',
      prompt: 'Your recording: the tune in bars 9 to 16 is lost in the arpeggio. What do you change?',
      options: [
        { text: 'A firmer a finger, lighter i and m', correct: true },
        { text: 'A slower tempo', why: 'Slower does not make the tune louder. Balance does.' },
        { text: 'Everything louder', why: 'Then the balance is unchanged, merely louder.' },
      ],
      explain: 'Voicing is balance: the melody finger a little firmer, the accompaniment a little lighter, until the tune sits clearly on top.',
      fact: 'voice-the-melody',
    },
    {
      type: 'chord-build',
      task: 'missing-note',
      chord: 'Bm',
      given: ['B', 'F#'],
      options: ['D', 'D#', 'C#', 'E'],
      prompt: 'Sor\'s study is in {k:B minor}. Its tonic chord {c:Bm} has {n:B} and {n:F#}. The third?',
      explain: '{c:Bm} is {n:B}, {n:D}, {n:F#}: a minor third above {n:B} is {n:D}. {n:D#} would make it major.',
    },
  ],
  facts: [
    { id: 'repeated-notes-ima', front: 'A treble note repeats inside an arpeggio. How is it fingered?', back: 'With i, m and a in rotation, as in Carcassi\'s A minor study, Op. 60 No. 7.' },
    { id: 'scan-import', front: 'How do you bring a printed piece into the app?', back: 'Tools > Scan & Import: photograph each page or drop in a PDF, read the music, proofread it against the page, then save and play in the Player.' },
    { id: 'sor-allegretto', front: 'Sor\'s B minor study, Op. 35 No. 22: what does it ask, and how fast?', back: 'A singing melody inside arpeggiated chords. He marks it Allegretto: do not let it drag.' },
    { id: 'voice-the-melody', front: 'The melody is lost in the arpeggio. The remedy?', back: 'Balance: a firmer melody finger, a lighter accompaniment.' },
  ],
};

// ── 2. Baroque dances ───────────────────────────────────────────────────────────────────────────

const baroqueDances: TeacherLesson = {
  id: 'baroque-dances',
  title: 'Baroque dances',
  teaches: 'Play the dance: a sarabande leans on beat 2, a bourree starts on an upbeat, a canarios mixes two and three.',
  minutes: 5,
  skill: 'teacher:elena:baroque-dances',
  steps: [
    {
      type: 'card',
      title: 'Dances keep their steps',
      body: 'Each Baroque dance has its step pattern, and the music keeps it. Sarabandes, in 3/4, often lean on beat 2. Bourrees start on an upbeat and move in two. Canarios alternate groupings of 6/8 and 3/4. Play the dance, not just the notes.',
      figure: { kind: 'rhythm', pattern: SARABANDE, time: '3/4', tempo: 60, caption: 'A sarabande rhythm: the long note on beat 2 takes the weight.' },
    },
    {
      type: 'choice',
      prompt: 'In a sarabande, which beat often takes the weight?',
      options: [
        { text: 'Beat 1', why: 'That is the minuet\'s lean. The sarabande, slower and graver, often leans on 2.' },
        { text: 'Beat 2', correct: true },
        { text: 'Beat 3', why: 'Beat 3 leads on to the next bar; it is rarely the weight.' },
      ],
      shuffle: false,
      explain: 'Beat 2: often a longer note, as in the figure, and always the step the dancer leans into.',
      fact: 'sarabande-beat-2',
    },
    toolTask({
      id: 'sarabande-metronome',
      title: 'A metronome that leans on 2',
      tool: 'metronome',
      minutes: 4,
      body: 'Set the Metronome to 3/4 and tap beat 2 until it is the strong one, beat 1 medium. At 50 {t:bpm|BPM}, then 60, tap or play the rhythm on the card, leaning on 2. The de Visee and Handel sarabandes, from your editions through Scan & Import, are the real test.',
    }),
    {
      type: 'card',
      title: 'The bourree, from its upbeat',
      body: 'A bourree starts on an upbeat, a quarter before the bar, and moves in two: two half-note beats to the bar. Bach\'s Bourree in {k:E minor}, BWV 996, is also true two-part counterpoint: two lines, each one finished.',
      figure: { kind: 'rhythm', pattern: BOURREE, time: '2/2', tempo: 120, caption: 'The bourree: an upbeat, then two beats to the bar.' },
      tip: 'Two lines stay independent by moving in different directions. The Theory Path\'s "Parallel, similar, contrary, oblique" names the four kinds of motion.',
    },
    {
      type: 'choice',
      prompt: 'Where does a bourree begin?',
      options: [
        { text: 'On an upbeat before the bar', correct: true },
        { text: 'On beat 1, heavily', why: 'That is how it does not begin: the upbeat leads into beat 1.' },
        { text: 'On beat 2, like a sarabande', why: 'The lean on 2 belongs to the sarabande.' },
      ],
      explain: 'On an upbeat, a quarter before the bar, then in two: the dancers step into the bar rather than land on it.',
      fact: 'bourree-upbeat',
    },
    playerTask({
      id: 'two-lines',
      title: 'Two finished lines, wait mode',
      song: 'st-two-voice-invention',
      mode: 'wait',
      bars: [1, 4],
      minutes: 5,
      body: 'Bach\'s Bourree is not in the library; scan your edition and take its first half in wait mode. Here, a two-voice invention in {k:E minor}, the Bourree\'s key: bars 1 to 4 in wait mode, every line finished, the lower one never a mere accompaniment.',
      fallback: {
        tool: 'player',
        params: ['st-duet-baroque', 'm9-16', 'wait'],
        title: 'Two finished lines, wait mode',
        body: 'Bach\'s Bourree is not in the library; scan your edition and take its first half in wait mode. Here, the Baroque-style duo: bars 9 to 16 in wait mode, listening to the bass as a line in its own right, with its own shape and its own cadence.',
      },
    }),
    playerTask({
      id: 'duo-in-two',
      title: 'The duo at 80 BPM, then at tempo',
      song: 'st-duet-baroque',
      tempo: 74,
      minutes: 4,
      body: 'Then the Baroque-style duo complete, at about 80 BPM, then 100 % (108 BPM), both halves and their repeats. For your Bourree: 80, then 112 BPM.',
    }),
    {
      type: 'true-false',
      statement: 'In two-part counterpoint the lower line is an accompaniment and may be played less carefully.',
      answer: false,
      explain: 'Each line is finished: its own shape, its own cadences, its own rests. Neither serves the other.',
      fact: 'counterpoint-lines',
    },
    {
      type: 'card',
      title: 'Canarios: two against three',
      body: 'The canarios alternates groupings: six eighths heard as two dotted-quarter beats (6/8), then as three quarter beats (3/4). That shift of the beat is a {t:hemiola}. Sanz\'s Canarios lives on it, and so does flamenco, whose solea cycle groups its twelve counts three, three, two, two, two.',
      figure: { kind: 'rhythm', pattern: HEMIOLA, time: '6/8', tempo: 90, caption: 'Six eighths in two, then in three: the hemiola.' },
      tip: 'The arithmetic, at length: the Theory Path\'s "Mixed meter and hemiola".',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap the hemiola: two dotted quarters, then three quarters.',
      rhythm: { pattern: HEMIOLA, time: '6/8' },
      tempo: 90,
      show: 'both',
      explain: 'Two long beats, then three shorter ones, in the same six eighths. Same bar length, different pulse.',
    },
    playerTask({
      id: 'solea-hemiola',
      title: 'Two and three in the solea cycle',
      song: 'st-solea-compas',
      bars: [1, 16],
      tempo: 67,
      minutes: 5,
      body: 'Sanz\'s Canarios is not in the library; scan it in and play it at 56, then 66 BPM, counting the dotted-quarter beat. Here, its nearest relation: the solea cycle, counts 1 to 6 in threes, 7 to 12 in twos. At about 72 BPM, then 100 % (108 BPM), count aloud.',
    }),
    {
      type: 'choice',
      prompt: 'The solea\'s twelve counts are accented on 3, 6, 8, 10 and 12. How do they group?',
      options: [
        { text: '3 + 3 + 2 + 2 + 2', correct: true },
        { text: '4 + 4 + 4', why: 'That would be three bars of 4/4, with no hemiola at all.' },
        { text: '2 + 2 + 2 + 3 + 3', why: 'The threes come first: accents on 3 and 6, then every second count.' },
      ],
      explain: 'Accents on 3 and 6 close two groups of three; 8, 10 and 12 close three groups of two. Six in two, then six in three: the canarios\' hemiola, in Spanish dress.',
      fact: 'hemiola',
    },
  ],
  facts: [
    { id: 'sarabande-beat-2', front: 'Which beat does a sarabande often lean on?', back: 'Beat 2, in 3/4.' },
    { id: 'bourree-upbeat', front: 'How does a bourree begin and move?', back: 'On an upbeat, and in two: two half-note beats to the bar.' },
    { id: 'counterpoint-lines', front: 'Bach\'s Bourree in E minor, BWV 996: what kind of texture?', back: 'True two-part counterpoint: two lines, each one finished.' },
    { id: 'hemiola', front: 'What is a hemiola?', back: 'Six beats regrouped: two groups of three become three groups of two, as when 6/8 alternates with 3/4 in a canarios.' },
  ],
};

// ── 3. Romantic guitar and rubato ───────────────────────────────────────────────────────────────

const romanticGuitar: TeacherLesson = {
  id: 'romantic-guitar',
  title: 'Romantic guitar and rubato',
  teaches: 'Rubato borrows time and pays it back within the phrase: by the phrase\'s end you are back on the beat.',
  minutes: 4,
  skill: 'teacher:elena:romantic-guitar',
  steps: [
    {
      type: 'card',
      title: 'Borrowed time',
      body: 'Romantic music asks for {t:rubato}: time borrowed and paid back within the phrase, never simply lost. Stretch toward the top of a phrase, then move on, and arrive at its end with the beat. A phrase that only slows down is not rubato; it is a phrase running out of fuel.',
      tip: 'Where a phrase begins and ends is the first question. The Theory Path\'s "Phrases and periods" answers it.',
    },
    {
      type: 'choice',
      prompt: 'You lingered on the high note of a phrase. What happens next?',
      options: [
        { text: 'Move on, and arrive with the beat', correct: true },
        { text: 'Stay slower to the end', why: 'Then the time is lost, not borrowed: the phrase sags.' },
        { text: 'Jump straight to the next beat', why: 'That drops the time instead of repaying it smoothly.' },
      ],
      explain: 'Borrowed time is paid back: a little faster after the stretch, so the phrase ends where the beat would have put it.',
      fact: 'rubato',
    },
    {
      type: 'card',
      title: 'Lagrima: major, minor, major',
      body: 'Tarrega\'s Lagrima moves from {k:E major} to {k:E minor} and back. Let the minor section darken in tone as well as in harmony: a little nearer the neck, a little softer, the rubato a little more inward. Then let the major return like daylight.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        strings: [3],
        dots: [
          { string: 3, fret: 1, note: 'G#', label: 'G#' },
          { string: 3, fret: 0, note: 'G', label: 'G' },
        ],
        caption: 'String 3: {n:G#} in {c:E}, the open {n:G} in {c:Em}.',
      },
    },
    {
      type: 'choice',
      prompt: 'Lagrima turns from {k:E major} to {k:E minor}. Which note of the tonic chord changes?',
      options: [
        { text: '{n:G#} becomes {n:G}', correct: true },
        { text: '{n:E} becomes {n:Eb}', why: 'The root stays: both keys are on {n:E}.' },
        { text: '{n:B} becomes {n:Bb}', why: 'The fifth stays; a lowered fifth would make the chord diminished.' },
      ],
      explain: '{c:E} is {n:E} {n:G#} {n:B}; {c:Em} is {n:E} {n:G} {n:B}. The key signature also loses {n:C#} and {n:D#}, which is why the whole section darkens.',
      fact: 'lagrima-keys',
    },
    playerTask({
      id: 'rubato-line',
      title: 'Rubato inside the phrase',
      song: 'fur-elise-theme',
      minutes: 5,
      body: 'Lagrima is not in the library; scan your edition and play it complete at 56, then 66 BPM. Here, a single line for the same work: Beethoven\'s Fur Elise theme at 100 % (60 BPM). Free the tempo only inside phrases, and land each phrase on its beat.',
    }),
    {
      type: 'true-false',
      statement: 'Rubato means you may slow down wherever the music is beautiful.',
      answer: false,
      explain: 'Rubato borrows and repays within the phrase; the beat returns by its end. Slowing wherever it is beautiful is not rubato but a lost tempo.',
      fact: 'rubato',
    },
    {
      type: 'card',
      title: 'A song without words',
      body: 'Mertz\'s Romanze in {k:E minor} is a song without words: its melody must sing above the arpeggios as a voice would, breathing at the ends of phrases. Find the melody first and play it alone; sing it, if you can. Then add the arpeggios beneath it, quieter.',
    },
    playerTask({
      id: 'song-without-words',
      title: 'A song with no singer, wait mode',
      song: 'st-chord-melody-1',
      mode: 'wait',
      minutes: 5,
      body: 'The Romanze is not in the library either; scan it in and take it section by section in wait mode. Here, its nearest relation: the chord-melody ballad, a song with no singer, the tune on top of every chord. Phrase by phrase in wait mode, the melody above the rest.',
    }),
    {
      type: 'choice',
      prompt: 'You hear the arpeggio clearly, but not the tune. The fix?',
      options: [
        { text: 'The tune alone first, then the rest quieter', correct: true },
        { text: 'Faster, so the tune connects', why: 'Speed joins nothing that balance has not already separated.' },
        { text: 'Rest strokes on every note', why: 'On the tune, yes; on the arpeggio a rest stroke damps the next string.' },
      ],
      explain: 'Know the tune on its own, then add the accompaniment beneath it, lighter. A melody that sings is a matter of balance first.',
      fact: 'song-without-words',
    },
    playerTask({
      id: 'ballad-recorded',
      title: 'The ballad at 54 BPM, recorded',
      song: 'st-chord-melody-1',
      tempo: 82,
      minutes: 5,
      body: 'Then complete at about 54 BPM, and record it. Listen back with one question: does each phrase come back to the beat by its end? Chopin\'s Prelude No. 7, a short companion piece in the same spirit, is worth scanning in from your edition.',
    }),
    {
      type: 'fill-blanks',
      prompt: 'Complete the definition.',
      text: 'Rubato: time ___ and paid ___ within the ___.',
      blanks: ['borrowed', 'back', 'phrase'],
      bank: ['lost', 'piece'],
      explain: 'Borrowed and paid back within the phrase. Lost time is not rubato, and a whole piece is too long to repay it in.',
      fact: 'rubato',
    },
  ],
  facts: [
    { id: 'rubato', front: 'What is rubato?', back: 'Time borrowed and paid back within the phrase, never simply lost: by its end the phrase is back on the beat.' },
    { id: 'lagrima-keys', front: 'Lagrima: its keys, and what the tone should do?', back: '{k:E major} to {k:E minor} and back. The minor section darkens in tone as well as in harmony.' },
    { id: 'song-without-words', front: 'Mertz\'s Romanze in E minor: what must the melody do?', back: 'Sing above the arpeggios, as in a song without words.' },
  ],
};

// ── 4. Longer forms: Gran Vals and Coste ────────────────────────────────────────────────────────

const longerForms: TeacherLesson = {
  id: 'longer-forms',
  title: 'Longer forms: Gran Vals and Coste',
  teaches: 'A long piece needs a plan: sections, a dynamic each, places to breathe; hardest bars first, then the joins.',
  minutes: 5,
  skill: 'teacher:elena:longer-forms',
  steps: [
    {
      type: 'card',
      title: 'A plan before the notes',
      body: 'Longer pieces need a plan: know the sections, decide the dynamic of each, and mark where you breathe. Tarrega\'s Gran Vals has several themes; Coste\'s A minor study, Op. 38 No. 1, about 67 bars long, is a Romantic study in position playing. Both are learned the same way.',
      tip: 'Sections are named by letter, A B A and so on. The Theory Path\'s "Forms by letter" has the common ones.',
    },
    {
      type: 'card',
      title: 'The order of work',
      body: 'Practise the hardest bars first, then the joins between sections, and only then the whole. A run-through from the top practises the opening thirty times and the ending once, which is why so many performances end worse than they began.',
    },
    {
      type: 'order',
      prompt: 'Put the work on a long piece in order.',
      tiles: ['Map the form', 'Hardest bars', 'The joins', 'The whole'],
      explain: 'The map first, then the hardest bars, then the joins between sections, and only then the whole.',
      fact: 'long-form-order',
    },
    {
      type: 'card',
      title: 'A form map',
      body: 'Gran Vals is not in the library; scan your edition and map its themes. To practise the method, the library\'s DADGAD Air: A, bars 1 to 8, mostly in second position; B, bars 9 to 15, in seventh position; bar 16, home on the open D chord. The join is the leap up at bar 9.',
    },
    {
      type: 'match-pairs',
      prompt: 'Map the DADGAD Air.',
      pairs: [
        { left: 'Bars 1 to 8', right: 'A, mostly second position' },
        { left: 'Bars 9 to 15', right: 'B, seventh position' },
        { left: 'Bar 16', right: 'Home: the open D chord' },
        { left: 'Bars 8 to 9', right: 'The join: a leap up' },
      ],
      explain: 'Two sections and a close, and one join that decides whether the piece holds together: the leap from the open D chord to seventh position.',
    },
    playerTask({
      id: 'hardest-bars',
      title: 'The hardest four bars, on loop',
      song: 'st-dadgad-air',
      bars: [9, 12],
      tempo: 79,
      minutes: 5,
      body: 'Retune strings 6, 2 and 1 down a whole step, to D A D G A D. Then loop bars 9 to 12 at about 60 BPM: seventh position, the harmonic in bar 10, the hammer-and-pull triplet in bar 11. With your Gran Vals: its hardest 4 bars on loop at 60 BPM, then its joins.',
    }),
    playerTask({
      id: 'the-join',
      title: 'The join, on loop',
      song: 'st-dadgad-air',
      bars: [7, 10],
      tempo: 79,
      minutes: 4,
      body: 'Then the join: bars 7 to 10, at about 60 BPM, across the leap from the open D chord to seventh position; it is where performances come apart. Then the whole air at 100 % (76 BPM), a dynamic for each section, and tune back to standard. Gran Vals complete: 90, then 120 BPM.',
    }),
    {
      type: 'choice',
      prompt: 'Every section is learned. What remains before the whole?',
      options: [
        { text: 'The joins between sections', correct: true },
        { text: 'More run-throughs from the top', why: 'Those practise the opening most and the ending least.' },
        { text: 'A faster tempo', why: 'Speed comes after the joins, not instead of them.' },
      ],
      explain: 'The joins: two bars either side of each boundary, on loop, until the piece no longer has seams.',
      fact: 'long-form-order',
    },
    playerTask({
      id: 'position-study',
      title: 'Coste\'s method: section by section',
      song: 'st-read-seventh-position',
      mode: 'wait',
      bars: [1, 8],
      minutes: 5,
      body: 'Coste\'s Op. 38 No. 1 is not in the library; scan it in, learn it section by section, then play it complete at 72 and 96 BPM. Its nearest study here is in seventh position: {k:G major} in 4/4, then {k:E minor} in 6/8 from bar 9. Bars 1 to 8 in wait mode first.',
    }),
    {
      type: 'choice',
      prompt: 'Coste\'s Op. 38 No. 1 is a Romantic study in what?',
      options: [
        { text: 'Position playing', correct: true },
        { text: 'Tremolo', why: 'That is Recuerdos, and Tarrega.' },
        { text: 'Rasgueado', why: 'Rasgueado belongs to flamenco, not to Coste.' },
      ],
      explain: 'Position playing, over about 67 bars in {k:A minor}: long enough that it needs a plan, as every long piece does.',
      fact: 'coste-study',
    },
    {
      type: 'card',
      title: 'Variations',
      body: 'A third long form: variations. Sor\'s Variations on Les Folies d\'Espagne, Op. 15a, set a theme and variations over the Folia, a repeating harmony in sarabande rhythm, so keep the lean on beat 2 in every one. A plan for variations is a plan of contrasts: each its own colour and dynamic.',
    },
    playerTask({
      id: 'ground-variations',
      title: 'Variations over a ground',
      song: 'canon-in-d',
      minutes: 4,
      body: 'Sor\'s Folies are not in the library; scan your edition and take the theme and first variation. Meanwhile, an older form of the idea, a ground bass: Pachelbel\'s Canon, your bass repeating its two bars while the lines above it change. Play it through, and listen to the variety above a ground that never moves.',
    }),
    {
      type: 'choice',
      prompt: 'In Sor\'s Folies variations, what stays the same from one variation to the next?',
      options: [
        { text: 'The repeating harmony beneath', correct: true },
        { text: 'The melody, note for note', why: 'The melody is exactly what the variations vary.' },
        { text: 'Nothing at all', why: 'Then they would not be variations on anything.' },
      ],
      explain: 'The Folia\'s harmony repeats beneath each variation, in sarabande rhythm; the figuration above it changes. Hence the lean on beat 2 throughout.',
      fact: 'folia-variations',
    },
  ],
  facts: [
    { id: 'long-form-order', front: 'The order of work on a long piece?', back: 'Map the form; the hardest bars first; then the joins between sections; only then the whole.' },
    { id: 'coste-study', front: 'Coste\'s Study in A minor, Op. 38 No. 1?', back: 'A Romantic study in position playing, about 67 bars long.' },
    { id: 'folia-variations', front: 'Sor\'s Folies d\'Espagne, Op. 15a: what is varied over what?', back: 'A theme and variations over the Folia, a repeating harmony in sarabande rhythm: keep the lean on beat 2.' },
  ],
};

// ── 5. Bach: chorale and rondo ──────────────────────────────────────────────────────────────────

const bachOnGuitar: TeacherLesson = {
  id: 'bach-on-guitar',
  title: 'Bach: chorale and rondo',
  teaches: 'With Bach, clarity of voices comes first: voice the chorale or the refrain above everything around it.',
  minutes: 4,
  skill: 'teacher:elena:bach-on-guitar',
  steps: [
    {
      type: 'card',
      title: 'Jesu, Joy',
      body: 'In Jesu, Joy of Man\'s Desiring the flowing triplets are written in 3/4, so the line feels like 9/8: three beats, each split in three. Inside it lies the chorale melody, which must be voiced louder so it is heard. With Bach: clarity of voices first, beauty second, speed a distant third.',
      figure: { kind: 'rhythm', pattern: TRIPLETS, time: '3/4', tempo: 60, caption: 'Triplets in 3/4: nine notes to the bar, three to each beat.' },
      tip: 'Compound meters at length: the Theory Path\'s "9/8 and 12/8".',
    },
    {
      type: 'choice',
      prompt: 'Triplet eighths in 3/4 feel like which time signature?',
      options: [
        { text: '9/8', correct: true },
        { text: '6/8', why: 'Six eighths in two groups; here there are nine, in three.' },
        { text: '3/8', why: 'Three eighths make one beat of it, not the bar.' },
      ],
      explain: 'Three beats, each of three eighths: 9/8. Bach writes 3/4 with triplets; the feel is the same.',
      fact: 'jesu-joy-9-8',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap one bar of the triplets: three even taps to each click.',
      rhythm: { pattern: TRIPLETS, time: '3/4' },
      tempo: 60,
      show: 'both',
      explain: 'Three to each beat, every one the same length: the flow inside which the chorale must sing.',
    },
    {
      type: 'card',
      title: 'The Gavotte en Rondeau',
      body: 'The Gavotte en Rondeau comes from Bach\'s third partita for solo violin: a {t:rondo} whose refrain returns between episodes. Guitarists play it in {k:E major}, the violin\'s key, with a light bass added. The refrain must be recognisable every time it returns: the same shape, the same voicing.',
      tip: 'Rondo is one of the forms by letter: A B A C A. The Theory Path\'s "Forms by letter" maps it.',
    },
    {
      type: 'order',
      prompt: 'A rondo in its simplest shape: put it in order.',
      tiles: ['Refrain', 'Episode 1', 'Refrain', 'Episode 2', 'Refrain'],
      explain: 'Refrain, episode, refrain, episode, refrain: the refrain is home, and each episode a journey away from it. Longer rondos add episodes; the principle stays.',
      fact: 'rondo-form',
    },
    playerTask({
      id: 'rondo-refrain',
      title: 'A rondo refrain at 80 BPM',
      song: 'rondo-alla-turca',
      tempo: 74,
      minutes: 5,
      body: 'The Gavotte is not in the library; scan your edition and take its refrain at 50, then 66 BPM, counting half-note beats. Here, the refrain of another rondo, Mozart\'s Alla Turca theme, which you know from the minor-key unit: now give it the same shape on every return, at about 80 BPM, then 100 % (108 BPM).',
    }),
    {
      type: 'true-false',
      statement: 'With Bach, speed comes first: the counterpoint only becomes clear at tempo.',
      answer: false,
      explain: 'Clarity of voices first, beauty second, speed a distant third. Counterpoint that is unclear slowly is unclear fast.',
      fact: 'bach-priorities',
    },
    playerTask({
      id: 'clear-voices',
      title: 'Two voices, each clear',
      song: 'st-two-voice-invention',
      mode: 'wait',
      bars: [1, 2],
      minutes: 5,
      body: 'Scan your Jesu, Joy and play its first 8 bars in wait mode, then at 60 and 72 BPM, the chorale above the triplets. Here, an invention in the manner of Bach: the subject alone in bar 1, imitated in the bass in bar 2. Wait mode, every voice clear; then record one section and listen.',
      fallback: {
        tool: 'player',
        params: ['st-duet-baroque', 'm17-24', 'wait'],
        title: 'Two voices, each clear',
        body: 'Scan your Jesu, Joy and play its first 8 bars in wait mode, then at 60 and 72 BPM, the chorale above the triplets. Here, the Baroque-style duo\'s last eight bars in wait mode: your line clear, the bass a line of its own.',
      },
    }),
    {
      type: 'choice',
      prompt: 'Your recording: the chorale is lost in the triplets. What do you change?',
      options: [
        { text: 'Firmer chorale notes, lighter triplets', correct: true },
        { text: 'Slower triplets', why: 'Slower changes the tempo, not the balance.' },
        { text: 'Leave some triplets out', why: 'Bach wrote them. The balance is yours to find, not the notes to cut.' },
      ],
      explain: 'Voice the chorale: its notes firmer, the triplets around them lighter, until the melody is heard through the flow.',
      fact: 'jesu-joy-9-8',
    },
  ],
  facts: [
    { id: 'jesu-joy-9-8', front: 'Jesu, Joy of Man\'s Desiring: the meter, and the hidden voice?', back: 'Triplets written in 3/4, so it feels like 9/8; the chorale melody inside them must be voiced louder.' },
    { id: 'rondo-form', front: 'What is a rondo?', back: 'A form whose refrain returns between episodes: refrain, episode, refrain, episode, refrain.' },
    { id: 'bach-priorities', front: 'Playing Bach: the order of priorities?', back: 'Clarity of voices first, beauty second, speed a distant third.' },
  ],
};

// ── 6. A Spanish masterpiece: Asturias ──────────────────────────────────────────────────────────

const spanishMasterpiece: TeacherLesson = {
  id: 'spanish-masterpiece',
  title: 'A Spanish masterpiece: Asturias',
  teaches: 'Build Asturias from its pedal outward: the open B must be metronomic before the moving line can be free.',
  minutes: 4,
  skill: 'teacher:elena:spanish-masterpiece',
  steps: [
    {
      type: 'card',
      title: 'From piano to guitar',
      body: 'Asturias began as a piano piece by Albeniz, in 1892, and became a guitar piece through transcription; guitarists play it in {k:E minor}. Its opening alternates a moving line with the open B string as a {t:pedal}, fast and even; the middle section slows down and sings.',
    },
    {
      type: 'true-false',
      statement: 'Albeniz wrote Asturias for the guitar.',
      answer: false,
      explain: 'He wrote it for the piano, in 1892. It became a guitar piece through transcription, and guitarists play it in {k:E minor}, where the open B can be its pedal.',
      fact: 'asturias-origin',
    },
    {
      type: 'choice',
      prompt: 'In the opening of Asturias, what is the open B?',
      options: [
        { text: 'A pedal, repeated against the line', correct: true },
        { text: 'The melody', why: 'The melody is the moving line; the B stays put.' },
        { text: 'A bass note held throughout', why: 'It is repeated, fast and evenly, not held; and the middle section leaves it behind.' },
      ],
      explain: 'A pedal: one note repeated while the line moves against it. The piece is built on it, so it must be the steadiest thing in the room.',
      fact: 'asturias-pedal',
    },
    {
      type: 'card',
      title: 'Build from the pedal',
      body: 'Build it from the pedal outward. First the open B alone, i and m strictly alternating, metronomic, every note the same. Only then add the moving line. Here is an original exercise in that manner: p takes the line on strings 4 and 3, i and m the open B between its notes.',
      figure: { kind: 'tab', tempo: 80, notes: PEDAL, caption: 'The line {n:E} {n:F} {n:G#} {n:F} against the open {n:B}, in triplets.' },
      tip: 'The line uses Phrygian dominant on {n:E}: {n:E} {n:F} {n:G#}. The Theory Path\'s "Phrygian dominant" has the whole scale.',
    },
    {
      type: 'true-false',
      statement: 'In this music the pedal may follow the line\'s rubato.',
      answer: false,
      explain: 'The pedal is the metronome inside the piece: it must be even before the line can be free. Free over steady, never free over free.',
      fact: 'asturias-pedal',
    },
    toolTask({
      id: 'pedal-alone',
      title: 'The pedal alone at 80 BPM',
      tool: 'metronome',
      minutes: 4,
      body: 'In the Metronome, 80 {t:bpm|BPM} with triplet subdivisions: the open B (string 2) alone, i and m strictly alternating, two notes to each click and a gap where the line will go. Free strokes: a rest stroke would land on string 3, where the line is. When a minute is even, add the line with p.',
    }),
    {
      type: 'play-phrase',
      prompt: 'The pedal exercise, one bar at 80 BPM: p on the line, i and m on the open B.',
      notes: PEDAL,
      octave: 'exact',
      tempo: 80,
      explain: '{n:E} {n:F} {n:G#} {n:F} under the open {n:B}, which repeats evenly between them. Even B first; the line can breathe only over a steady pedal.',
      alternative: {
        type: 'tap-rhythm',
        prompt: 'No guitar to hand? Tap the exercise: three even triplets to each click.',
        rhythm: { pattern: 'et et et et et et et et et et et et' },
        tempo: 80,
        show: 'both',
        explain: 'Line, B, B on every beat, all three the same length: the pedal does not hurry and does not wait.',
      },
    },
    playerTask({
      id: 'singing-falseta',
      title: 'A singing line in E Phrygian',
      song: 'st-solea-compas',
      bars: [17, 24],
      tempo: 67,
      minutes: 5,
      body: 'Asturias is not in the library: scan your edition, loop its opening at 80, 100, then 120 BPM, and give the middle section a slow, singing tempo; then the whole. Here, the same world: the solea falseta, bars 17 to 24, an E Phrygian melody in thumb rest strokes. At about 72 BPM, singing.',
    }),
    {
      type: 'choice',
      prompt: 'Asturias is in {k:E minor} on the guitar. Which degree of the key is its pedal, the open B?',
      options: [
        { text: '{d:5}', correct: true },
        { text: '{d:b3}', why: 'That is {n:G}.' },
        { text: '{d:1}', why: 'That is {n:E}.' },
        { text: '{d:4}', why: 'That is {n:A}.' },
      ],
      explain: '{n:B} is the fifth of {k:E minor}: a pedal on the fifth, the classic way to hold tension for a long time. The Theory Path\'s "Pedal points" says why it works.',
    },
    {
      type: 'fretboard-find',
      prompt: 'Tap the notes of {n:E} Phrygian dominant on string 3, from the open string to fret 5.',
      find: { scale: 'phrygian-dominant', tonic: 'E' },
      mode: 'all',
      octave: 'any',
      strings: [3],
      frets: [0, 5],
      explain: '{n:G#} at fret 1, {n:A} at 2, {n:B} at 4 and {n:C} at 5. Not the open {n:G}: this scale has the major third.',
    },
  ],
  facts: [
    { id: 'asturias-origin', front: 'Asturias: where does it come from, and in which key do guitarists play it?', back: 'A piano piece by Albeniz (1892), a guitar piece by transcription, played in {k:E minor}.' },
    { id: 'asturias-pedal', front: 'How do you build the opening of Asturias?', back: 'From the pedal outward: the open B alone, i and m alternating, metronomic first; then the moving line.' },
  ],
};

// ── 7. Choose a summit (milestone) ──────────────────────────────────────────────────────────────

const summitPieces: TeacherLesson = {
  id: 'summit-pieces',
  title: 'Choose a summit',
  teaches: 'A summit piece is divided into sections and planned week by week: learn, then shape, then perform.',
  minutes: 4,
  skill: 'teacher:elena:summit-pieces',
  steps: [
    {
      type: 'card',
      title: 'Pieces that take months',
      body: 'These pieces take months and repay years. The Cello Suite Prelude is a single line that implies its harmony and builds to a long climax. The {k:E major} Prelude from BWV 1006a races through long passages that alternate a moving line with the open string 1. Recuerdos is the tremolo piece.',
    },
    {
      type: 'card',
      title: 'And the Chaconne',
      body: 'The Chaconne is a set of variations on a repeating harmony, well over ten minutes of music. Choose one of the four. Divide it into sections and plan weekly targets in three stages: learn, then shape, then perform.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each summit with what it asks of you.',
      pairs: [
        { left: 'Cello Suite Prelude', right: 'One line implying harmony' },
        { left: 'Prelude, BWV 1006a', right: 'Line against open string 1' },
        { left: 'Recuerdos', right: 'Tremolo' },
        { left: 'Chaconne', right: 'Variations, over ten minutes' },
      ],
      explain: 'The Prelude implies its harmony in one line; BWV 1006a alternates a line with the open string 1; Recuerdos is tremolo; the Chaconne is variations on a repeating harmony.',
      fact: 'summit-pieces',
    },
    {
      type: 'card',
      title: 'Twelve weeks',
      body: 'The plan: weeks 1 to 4, learn the notes section by section; weeks 5 to 8, tempo and voicing; weeks 9 to 12, shaping and performance run-throughs. Scan your edition in, play its first section in wait mode, and record that section at the end of week 1. Keep the recording: week 12 will want to know how far you came.',
    },
    {
      type: 'order',
      prompt: 'Put the three stages of the plan in order.',
      tiles: ['Learn the notes', 'Tempo, voicing', 'Shape, perform'],
      explain: 'Weeks 1 to 4 learn the notes, 5 to 8 bring tempo and voicing, 9 to 12 shape the piece and run it as a performance.',
      fact: 'summit-plan',
    },
    toolTask({
      id: 'summit-goal',
      title: 'Plan your summit',
      tool: 'practice',
      params: ['goals'],
      minutes: 5,
      body: 'In the Practice Plan\'s Goals, add a goal: your summit piece, area Songs, with a target date twelve weeks from today. Each week, write that week\'s target, section by section, in the note of a session in the journal, and mark the goal\'s progress as the weeks pass.',
    }),
    playerTask({
      id: 'tremolo-etude',
      title: 'For Recuerdos: the tremolo etude',
      song: 'st-concert-tremolo-etude',
      mode: 'wait',
      bars: [1, 16],
      minutes: 5,
      body: 'If your summit is Recuerdos, prepare with the Concert Tremolo Etude: its first section, bars 1 to 16, in wait mode this week, every group even. The other three summits begin with your own scan, its first section in wait mode.',
      fallback: {
        tool: 'technique',
        params: ['tech-tremolo-pami'],
        title: 'For Recuerdos: Classical Tremolo',
        body: 'If your summit is Recuerdos, prepare with Classical Tremolo while the Concert Tremolo Etude is not yet in the library: the moving melody, every group even. The other three summits begin with your own scan, its first section in wait mode.',
      },
    }),
    {
      type: 'choice',
      prompt: 'Week 1 of your plan. What is the target?',
      options: [
        { text: 'The first section\'s notes, learned', correct: true },
        { text: 'The whole piece, slowly', why: 'Weeks 1 to 4 learn section by section; the whole comes later.' },
        { text: 'A performance for a friend', why: 'Performance run-throughs belong to weeks 9 to 12.' },
      ],
      explain: 'Learn, section by section. And at the end of the week, a recording of that first section, to compare with week 12.',
      fact: 'summit-plan',
    },
    playerTask({
      id: 'show-band',
      title: 'Rehearse your recital opener',
      song: 'st-two-voice-invention',
      mode: 'flow',
      bars: [1, 1],
      minutes: 4,
      body: 'Before the summit, a performance from this unit: the invention\'s subject, bar 1, the treble alone, in Flow mode at the piece\'s own 56 BPM, start to finish. Seventh position, finger 1 on fret 7. The microphone listens and scores each note. Then come back for the show.',
    }),
    {
      type: 'play-phrase',
      id: 'show',
      prompt: 'Your recital opener: the invention\'s subject, bar 1, one line, without stopping.',
      notes: INVENTION_SUBJECT,
      octave: 'exact',
      tempo: 56,
      pass: 0.8,
      explain: '{n:E} leaps to {n:B}, runs down {n:A} {n:G} {n:F#} {n:E}, then {n:D#} and the low {n:B} lead home to {n:E}: one line implying {c:Em}, {c:B7}, {c:Em}. Eight notes in ten is a pass; a stop is not.',
      alternative: {
        type: 'order',
        prompt: 'Put the subject\'s first six notes in order: the leap, then the run down.',
        tiles: ['{n:E}', '{n:B}', '{n:A}', '{n:G}', '{n:F#}', '{n:E}'],
        distractors: ['{n:F}'],
        explain: '{n:E} up to {n:B}, then down the scale of {k:E minor}: {n:A} {n:G} {n:F#} {n:E}. String 3 fret 9, string 1 fret 7, then string 2 frets 10, 8 and 7, and string 3 fret 9 again.',
      },
    },
  ],
  facts: [
    { id: 'summit-pieces', front: 'Name the four summit pieces and what each asks.', back: 'Cello Suite Prelude: one line implying harmony. Prelude, BWV 1006a: a line against the open string 1. Recuerdos: tremolo. Chaconne: variations on a repeating harmony.' },
    { id: 'summit-plan', front: 'The three-month plan for a summit piece?', back: 'Weeks 1 to 4 learn the notes section by section; 5 to 8 tempo and voicing; 9 to 12 shaping and performance run-throughs.' },
  ],
};

/** Unit 10 of Prof. Varga's course. */
const unit: TeacherUnit = {
  id: 'elena-classical-repertoire',
  title: 'Classical repertoire',
  theme: 'songs',
  description: 'Studies, Baroque dances, Romantic rubato, long forms, Bach and Asturias, then a summit piece and a three-month plan.',
  lessons: [studiesOfTheMasters, baroqueDances, romanticGuitar, longerForms, bachOnGuitar, spanishMasterpiece, summitPieces],
  checkpoint: { sample: 8, maxMistakes: 2 },
  milestone: {
    lesson: 'summit-pieces',
    step: 'show',
    piece: 'Two-Voice Invention (subject)',
    song: 'st-two-voice-invention',
    celebrate: 'One line that implies its own harmony, cleanly and without stopping: that is a performance, and the first thing every summit asks of you. Record week 1; in week 12 you will hear what deliberate work does.',
  },
  glossary: [
    { id: 'study', term: 'study', definition: 'A piece with a technical purpose and real music in it; also called an etude.' },
    { id: 'hemiola', term: 'hemiola', definition: 'Six beats regrouped: two groups of three heard as three groups of two, as when 6/8 alternates with 3/4.' },
    { id: 'rubato', term: 'rubato', definition: 'Time stretched for expression and given back within the phrase, so the music breathes and the phrase still lands on the beat.' },
    { id: 'rondo', term: 'rondo', definition: 'A form in which a refrain returns between contrasting episodes: A B A C A.' },
    // Not `pedal-point`: unit 8 defines that one first, as a bass note, and the course keeps the
    // first definition; the Asturias pedal is the open B above or inside the moving line.
    { id: 'pedal', term: 'pedal', definition: 'A note held or repeated while the harmony or a line moves against it: in the bass, or, as in Asturias, above or inside the texture.' },
  ],
};

export default unit;

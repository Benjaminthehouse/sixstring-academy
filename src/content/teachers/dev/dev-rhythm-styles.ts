/**
 * Dev, unit 6: Rhythm guitar in every style (plan: `dev/dev-rhythm-styles` in
 * src/content/plan/teachers.json).
 *
 * Rock (the palm-muted gallop), funk (sixteenths and scratches on E9), reggae (the offbeat chop),
 * country and bluegrass (alternating bass and the G run), swing (long-short, the click on 2 and 4)
 * and folk colour (sus chords). Dev's voice: a bandmate who ties every idea to something to play
 * tonight.
 *
 * Music from the song library: Power Chords: Palm-Muted Gallop, Strumming: Sixteenth-Note Funk,
 * Strumming: Offbeat Chops, Bluegrass Rhythm and the G Run, Sus Chords and Chord Embellishments,
 * and the technique exercises Palm Muting and Metronome on 2 and 4. Shenandoah is not in the song
 * library yet: its task falls back to Clementine, a folk song in D with long D chords.
 * `dev-rhythm-styles.test.ts` checks every shape, fret and note the text names, the patterns and
 * the G run against the library's studies, and each Player tempo against the song's own.
 */
import type { TabNote } from '@/lessons';
import type { TeacherLesson, TeacherUnit } from '../types';
import { playerTask, techniqueTask, toolTask } from '../tasks';

/** One tab note. */
function t(string: number, fret: number, duration: string): TabNote {
  return { string, fret, duration };
}

/** The gallop on every beat of a bar: an eighth and two sixteenths. */
export const GALLOP_BAR = 'e s s e s s e s s e s s';

/** Funk pattern A, bar 1, as the study strums it: D/U hit the chord, X scratches muted strings. */
export const FUNK_A_BAR_1 = 'DXDXXUXUXXDXDXXU';

/** The chord hits of funk pattern A, bar 1, as a rhythm (the scratches as rests). */
export const FUNK_A_HITS = 's sr s sr sr s sr s sr sr s sr s sr sr s';

/** The G run as the study plays it: bass, (strum), G E D, A hammered to B, landing on G. */
export const G_RUN: TabNote[] = [t(3, 0, 'e'), t(4, 2, 'e'), t(4, 0, 'e'), t(5, 0, 'e'), t(5, 2, 'e'), t(6, 3, 'h.')];

/** Swung eighths: each beat a triplet with the middle note tied, long-short. */
export const SWUNG_EIGHTHS = 'et ~et et et ~et et et ~et et et ~et et';

/** The folk pattern: down, down-up, (miss), up, down-up. */
export const FOLK_PATTERN = 'q e e er e e e';

// ── 1. Rock: the palm-muted gallop ─────────────────────────────────────────────────────────────

const rockRhythm: TeacherLesson = {
  id: 'rock-rhythm',
  title: 'Rock: the palm-muted gallop',
  teaches: 'The gallop is an eighth and two sixteenths, picked down, down-up, palm-muted, with open accented power chords.',
  minutes: 5,
  skill: 'teacher:dev:rock-rhythm',
  steps: [
    {
      type: 'card',
      title: 'Da, da-da',
      body: 'Rock rhythm is all about tightness: every chug exactly with the drums. Its engine is the {t:gallop}: an eighth note and two sixteenths, picked down, down-up, over and over. Da, da-da, da, da-da.',
      figure: { kind: 'rhythm', pattern: GALLOP_BAR, tempo: 100, caption: 'The gallop on every beat: an eighth, then two sixteenths.' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap the gallop: an eighth and two sixteenths on every beat.',
      rhythm: { pattern: GALLOP_BAR },
      tempo: 80,
      show: 'both',
      explain: 'Long, short-short on every beat: "1, & a, 2, & a". The first note gets half the beat, the two quick ones a quarter each.',
      fact: 'gallop-rhythm',
    },
    {
      type: 'card',
      title: 'Palm on, palm off',
      body: '{t:palm-mute|Palm-mute} the open string 6 for the gallop: rest the edge of your picking hand on the strings right where they leave the bridge. Then lift the palm and hit an accented power chord with a downstroke: {c:A5} (577xxx), {c:G5} (355xxx), {c:C5} (x355xx) or {c:D5} (x577xx).',
      figure: { kind: 'chord', symbol: 'A5', frets: '577xxx', caption: '{c:A5}: index on string 6, ring and little fingers at fret 7.' },
      tip: 'If your forearm burns, stop and shake it out. Speed comes from a loose wrist, not more force.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each power chord with its shape.',
      pairs: [
        { left: '{c:A5}', right: '577xxx' },
        { left: '{c:G5}', right: '355xxx' },
        { left: '{c:C5}', right: 'x355xx' },
        { left: '{c:D5}', right: 'x577xx' },
      ],
      explain: 'Root, fifth and octave every time. {c:A5} and {c:G5} have their root on string 6, {c:C5} and {c:D5} on string 5, with the same fingers.',
      fact: 'gallop-power-chords',
    },
    toolTask({
      id: 'gallop-rhythm',
      title: 'Tap the gallop in Rhythm',
      tool: 'rhythm',
      params: ['strum', 'gallop'],
      minutes: 3,
      body: 'Open the Gallop pattern in Rhythm: down, (miss), down-up on every beat, counted "1 & a". Tap along until you get two clean rounds in a row.',
      tip: 'The gap after the first stroke is real. It is not a triplet.',
    }),
    techniqueTask({
      id: 'palm-mute',
      title: 'Palm Muting, then the gallop',
      exercise: 'tech-palm-mute',
      minutes: 4,
      body: 'Downstroke eighths on {c:E5}, two bars muted, two open. Climb the ladder to 96, then 104 BPM. Then play the gallop on the palm-muted open string 6: down, down-up, every beat.',
      tip: 'Muted, the string still has pitch. If the note disappears, slide your palm back toward the bridge.',
    }),
    {
      type: 'true-false',
      statement: 'In the gallop, the two sixteenths are picked down-up.',
      answer: true,
      explain: 'Down on the eighth, then down-up on the sixteenths. The hand moves in sixteenths, so the strokes land on "1", "&" and "a".',
      fact: 'gallop-rhythm',
    },
    playerTask({
      id: 'gallop-player',
      title: 'Power Chords: Palm-Muted Gallop',
      song: 'st-power-chords-gallop',
      tempo: 80,
      minutes: 5,
      body: 'Play the riff at 80 % (80 BPM), then 100 % (100 BPM). Gallops palm-muted on the open string 6, accented chords open and loud. Every jump to a chord comes after a beat of gallops, so the hand has time to get there.',
    }),
    {
      type: 'choice',
      prompt: 'In the riff, which chord is the shape x355xx?',
      options: [
        { text: '{c:C5}', correct: true },
        { text: '{c:G5}', why: '{c:G5} is 355xxx: the same frets, one string lower, rooted on string 6.' },
        { text: '{c:D5}', why: '{c:D5} is x577xx: the same shape two frets higher.' },
      ],
      explain: 'String 5, fret 3 is {n:C}, with the fifth and octave at fret 5 of strings 4 and 3: {c:C5}.',
      fact: 'gallop-power-chords',
    },
    toolTask({
      id: 'gallop-jam',
      title: 'Jam: gallop on E5',
      tool: 'progressions',
      params: ['metal-aeolian', 'e', 'jam'],
      minutes: 4,
      body: 'Set the band to 100 BPM: {c:E5} {c:C5} {c:D5} {c:E5}. Gallop on the palm-muted open string 6 under {c:E5}, and hit an open, accented {c:C5} or {c:D5} right on each change.',
    }),
    {
      type: 'tap-rhythm',
      prompt: 'Now the riff\'s bar: three gallops, then a chord on beat 4.',
      rhythm: { pattern: 'e s s e s s e s s q' },
      tempo: 100,
      show: 'both',
      explain: 'Gallop, gallop, gallop, then one accented chord on beat 4: bar 1 of the riff, with the palm off for the chord.',
    },
  ],
  facts: [
    { id: 'gallop-rhythm', front: 'What is the gallop, and how is it picked?', back: 'An eighth note and two sixteenths on every beat (da, da-da), picked down, down-up.' },
    { id: 'palm-mute-where', front: 'Where does the palm rest for a palm mute?', back: 'The edge of the picking hand lightly on the strings, right where they leave the bridge.' },
    { id: 'gallop-power-chords', front: 'The shapes of {c:A5}, {c:G5}, {c:C5} and {c:D5} in the gallop riff?', back: '577xxx, 355xxx, x355xx and x577xx: root, fifth and octave.' },
  ],
};

// ── 2. Funk: sixteenths and scratches ──────────────────────────────────────────────────────────

const funk: TeacherLesson = {
  id: 'funk',
  title: 'Funk: sixteenths and scratches',
  teaches: 'In funk the strumming hand never stops its sixteenths: you choose which strokes hit the chord, which scratch.',
  minutes: 5,
  skill: 'teacher:dev:funk',
  steps: [
    {
      type: 'card',
      title: 'A drum part with notes',
      body: 'Funk guitar is a drum part with notes. The strumming hand moves in sixteenths the whole time, four strokes per beat, down, up, down, up, and you decide which strokes hit the chord and which hit muted strings: the {t:scratch}. {c:E9} is the classic funk chord.',
      figure: { kind: 'chord', symbol: 'E9', frets: 'x76777', fingers: 'x21333', caption: '{c:E9}: finger 3 flat across strings 3, 2 and 1 at fret 7.' },
    },
    {
      type: 'choice',
      prompt: 'In funk, what does the strumming hand do between chord hits?',
      options: [
        { text: 'Keeps moving, scratching muted strings', correct: true },
        { text: 'Stops and waits for the next hit', why: 'Stopping breaks the groove. The hand keeps its sixteenths going; only the pressure changes.' },
        { text: 'Plays the chord again, softer', why: 'Between hits the chord does not ring at all: the strings are muted.' },
      ],
      explain: 'The hand is the drummer: it never stops. The fretting hand decides what sounds, squeezing for hits and relaxing for scratches.',
      fact: 'funk-hand',
    },
    {
      type: 'card',
      title: 'Hits and scratches',
      body: 'Down on the beat and the "and", up on the "e" and the "a". Squeeze {c:E9} only for the hits, then release the fretting pressure at once, fingers still touching the strings, so every other stroke is a dry, percussive click.',
      figure: { kind: 'audio', sound: { kind: 'strum', chord: 'E9', pattern: FUNK_A_BAR_1, grid: 'sixteenth', tempo: 70, repeat: 2 }, label: 'Hear pattern 1, bar 1' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap only the chord hits of that bar, while your hand counts the sixteenths in between.',
      rhythm: { pattern: FUNK_A_HITS },
      tempo: 70,
      show: 'both',
      explain: 'Seven hits: 1, the "and" of 1, the "e" and "a" of 2, the "and" of 3, 4 and the "a" of 4. Every other sixteenth is a scratch.',
    },
    {
      type: 'true-false',
      statement: 'You make the scratch by relaxing the fretting fingers, not by stopping the strumming hand.',
      answer: true,
      explain: 'Relaxed fingers still touch the strings, so a stroke gives a click instead of a chord. The strumming hand never changes what it does.',
      fact: 'funk-release',
    },
    toolTask({
      id: 'funk-metronome',
      title: 'One minute of sixteenths',
      tool: 'metronome',
      minutes: 2,
      body: 'Set the Metronome to 70 BPM. For one whole minute, strum sixteenths on muted strings without stopping: down, up, down, up on every click, the fretting hand resting lightly across the strings.',
      tip: 'Loose wrist, small motion. If the forearm tightens, make the strokes smaller, not slower.',
    }),
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'E9',
      frets: 'x76777',
      accept: 'this-shape',
      prompt: 'Build the funk {c:E9} (x76777).',
      explain: 'Finger 2 on string 5, fret 7, finger 1 on string 4, fret 6, finger 3 flat across strings 3 to 1 at fret 7. The tip of finger 2 mutes string 6.',
      fact: 'funk-e9',
    },
    playerTask({
      id: 'funk-player',
      title: 'Strumming: Sixteenth-Note Funk',
      song: 'st-strum-funk',
      tempo: 76,
      bars: [1, 4],
      minutes: 5,
      body: 'Pattern 1 is bars 1 to 4: play it at 76 % (70 BPM), then 98 % (90 BPM). Then set the loop to bars 5 to 8 for pattern 2. Squeeze for the hits, release for everything else.',
    }),
    {
      type: 'fill-blanks',
      prompt: 'Count the four sixteenths of one beat.',
      text: '1  ___  &  ___',
      blanks: ['e', 'a'],
      bank: ['and', 'trip'],
      explain: 'Sixteenths are counted "1 e & a, 2 e & a": the down strokes on the number and the "&", the up strokes on "e" and "a".',
    },
    toolTask({
      id: 'funk-jam',
      title: 'Jam: your own funk pattern',
      tool: 'progressions',
      params: ['funk-one-chord-dominant', 'e', 'jam'],
      minutes: 4,
      body: 'Set the band to 96 BPM on {c:E9}. Invent your own pattern: keep the hand moving in sixteenths, squeeze three or four strokes a bar for hits, scratch the rest. Every few bars, move one hit.',
    }),
    {
      type: 'choice',
      prompt: 'Your chord hits ring long and sound messy. What do you fix?',
      options: [
        { text: 'Release the fretting pressure after each hit', correct: true },
        { text: 'Strum harder', why: 'Harder strums ring longer. Shortness comes from the fretting hand letting go.' },
        { text: 'Stop the strumming hand after each hit', why: 'The strumming hand never stops in funk. The fretting hand cuts the chord.' },
      ],
      explain: 'Squeeze, hit, release: the fingers stay on the strings but stop pressing, so the chord dies at once and the scratches stay dry.',
      fact: 'funk-release',
    },
  ],
  facts: [
    { id: 'funk-hand', front: 'What does the strumming hand do in funk?', back: 'Moves in sixteenths the whole time (down, up, down, up); you choose which strokes hit the chord and which scratch muted strings.' },
    { id: 'funk-e9', front: 'The classic funk {c:E9} shape?', back: 'x76777: finger 2 on string 5, fret 7, finger 1 on string 4, fret 6, finger 3 flat across strings 3 to 1 at fret 7.' },
    { id: 'funk-release', front: 'How do you keep funk chords short and percussive?', back: 'Release the fretting pressure right after each hit, fingers still touching the strings.' },
  ],
};

// ── 3. Reggae: the offbeat chop ────────────────────────────────────────────────────────────────

const reggae: TeacherLesson = {
  id: 'reggae',
  title: 'Reggae: the offbeat chop',
  teaches: 'Reggae guitar chops short chords on the "and" of each beat, on strings 4, 3 and 2, and leaves the beats alone.',
  minutes: 4,
  skill: 'teacher:dev:reggae',
  steps: [
    {
      type: 'card',
      title: 'Off the beat',
      body: 'In reggae the guitar plays short, crisp {t:chop|chops} off the beat, on the "and" of each beat. The beats themselves belong to the bass and drums. Count the same music twice as fast and those chops fall on beats 2 and 4.',
      figure: { kind: 'rhythm', pattern: 'er e er e er e er e', tempo: 76, caption: 'A chop on every "and", silence on every beat.' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap only the "and"s: four chops a bar, nothing on the beat.',
      rhythm: { pattern: 'er e er e er e er e' },
      tempo: 70,
      show: 'both',
      explain: 'Foot on the click, hand in the gap: "1 AND 2 AND 3 AND 4 AND". The chop lands exactly halfway between two beats.',
      fact: 'reggae-chop-where',
    },
    {
      type: 'card',
      title: 'Short and crisp',
      body: 'Chop on strings 4, 3 and 2 only. The chop is short because you release the fretting pressure right after the strum: the fingers stay on the strings and stop pressing. In the Offbeat Chops study the chords sit high on the neck, starting with {c:Am} (xx755x).',
      figure: { kind: 'chord', symbol: 'Am', frets: 'xx755x', caption: '{c:Am} on strings 4, 3 and 2 at frets 7 and 5.' },
    },
    {
      type: 'choice',
      prompt: 'How do you make a reggae chop short?',
      options: [
        { text: 'Release the fretting pressure right after it', correct: true },
        { text: 'Palm-mute at the bridge', why: 'That is the rock chug. A chop rings for an instant, then the fretting hand stops it.' },
        { text: 'Strum more softly', why: 'Softer is quieter, not shorter. The fretting hand makes it short.' },
      ],
      explain: 'Strum, then ease the fingers off the frets while they keep touching the strings: the chord stops at once.',
      fact: 'reggae-chop-short',
    },
    {
      type: 'true-false',
      statement: 'Count the reggae groove twice as fast and the chops fall on beats 2 and 4.',
      answer: true,
      explain: 'Each eighth becomes a beat: "1 & 2 &" turns into "1 2 3 4", and the old "and"s become 2 and 4, the backbeat.',
      fact: 'reggae-chop-where',
    },
    toolTask({
      id: 'reggae-ands',
      title: 'Clap on the "and"',
      tool: 'rhythm',
      params: ['drill', 'offbeat-1'],
      minutes: 2,
      body: 'The click plays the beat; you tap only the "and". Count "1 and 2 and" out loud, foot down on the click, hand answering in the gap.',
    }),
    playerTask({
      id: 'reggae-player',
      title: 'Strumming: Offbeat Chops',
      song: 'st-strum-reggae',
      tempo: 88,
      minutes: 4,
      body: 'Play it at 88 % (70 BPM), then 105 % (84 BPM). Bars 1 to 8 chop on every "and" with up-strums; bars 9 to 16 switch to the half-time feel, a down-strum chop on 2 and 4.',
      tip: 'Your hand keeps swinging down on the beats without touching the strings. Only the up-strums land.',
    }),
    {
      type: 'match-pairs',
      prompt: 'Match each reggae chord with its shape on strings 4, 3 and 2.',
      pairs: [
        { left: '{c:Am}', right: 'xx755x' },
        { left: '{c:G}', right: 'xx543x' },
        { left: '{c:C/G}', right: 'xx555x' },
      ],
      explain: '{c:Am} is the study\'s first chord. For a major groove, {c:G} (xx543x) and {c:C/G} (xx555x) sit right next to each other at fret 5.',
      fact: 'reggae-shapes',
    },
    toolTask({
      id: 'reggae-jam',
      title: 'Jam: chops on G and C',
      tool: 'progressions',
      params: ['reggae-i-iv', 'g', 'jam'],
      minutes: 4,
      body: 'Set the band to 72 BPM: {c:G} and {c:C}. Chop on every "and" with {c:G} (xx543x) and {c:C/G} (xx555x), a finger move apart at fret 5. Leave every beat to the bass and drums.',
    }),
    {
      type: 'chord-build',
      task: 'fingers',
      chord: 'C/G',
      frets: 'xx555x',
      accept: 'this-shape',
      prompt: 'Build {c:C/G} on strings 4, 3 and 2 at fret 5.',
      explain: 'Fret 5 on strings 4, 3 and 2: {n:G}, {n:C} and {n:E}. One finger flat across all three works; the {n:G} on the bottom makes it {c:C/G}.',
    },
  ],
  facts: [
    { id: 'reggae-chop-where', front: 'Where does the reggae guitar chop fall?', back: 'On the "and" of every beat; count twice as fast and it is on 2 and 4. The beats belong to the bass and drums.' },
    { id: 'reggae-chop-short', front: 'What makes a reggae chop short?', back: 'Releasing the fretting pressure right after the strum, on strings 4, 3 and 2.' },
    { id: 'reggae-shapes', front: 'High reggae shapes for {c:G} and {c:C/G}?', back: '{c:G} xx543x and {c:C/G} xx555x, side by side at fret 5.' },
  ],
};

// ── 4. Country and bluegrass rhythm ────────────────────────────────────────────────────────────

const countryAndBluegrass: TeacherLesson = {
  id: 'country-and-bluegrass',
  title: 'Country and bluegrass rhythm',
  teaches: 'Bluegrass rhythm alternates root and fifth in the bass under the strum, and ends phrases with the G run.',
  minutes: 5,
  skill: 'teacher:dev:country-and-bluegrass',
  steps: [
    {
      type: 'card',
      title: 'Boom-chick, with legs',
      body: 'Country and bluegrass rhythm is boom-chick with more motion: the bass notes alternate, and phrases end with a quick run. On {c:G}: bass on string 6, fret 3 ({n:G}), strum, then the open string 4 ({n:D}), strum. Bass on 1 and 3, strums on 2 and 4.',
      figure: { kind: 'chord', symbol: 'G', frets: '320003', fingers: '320004', caption: '{c:G} with fingers 3, 2 and 4: finger 1 stays free.' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord with its two alternating bass notes.',
      pairs: [
        { left: '{c:G}', right: '{n:G}, then {n:D}' },
        { left: '{c:C}', right: '{n:C}, then {n:G}' },
        { left: '{c:D}', right: '{n:D}, then {n:A}' },
      ],
      explain: 'Root, then fifth. {c:G}: string 6, fret 3 and the open string 4. {c:C}: string 5, fret 3 and string 6, fret 3. {c:D}: the open strings 4 and 5.',
      fact: 'bluegrass-bass',
    },
    {
      type: 'card',
      title: 'The G run',
      body: 'Phrases end with the {t:g-run|G run}: the open string 3 ({n:G}), string 4, fret 2 ({n:E}), the open string 4 ({n:D}), then a hammer-on from the open string 5 to fret 2 ({n:B}), landing on string 6, fret 3 ({n:G}) on beat 1. Pick it with alternate strokes, strictly in time.',
      figure: { kind: 'tab', tempo: 90, notes: G_RUN, caption: 'The G run: the open {n:A} is hammered on to {n:B}, then {n:G} lands on beat 1.' },
    },
    {
      type: 'play-phrase',
      prompt: 'Play the G run, slowly: open 3, string 4 fret 2, open 4, open 5 hammered to fret 2, string 6 fret 3.',
      notes: G_RUN,
      octave: 'exact',
      tempo: 60,
      explain: '{n:G} {n:E} {n:D}, {n:A} to {n:B} with the hammer-on, and {n:G}. Finger 1 takes string 4, fret 2, finger 2 hammers string 5, finger 3 lands on string 6.',
      alternative: {
        type: 'order',
        prompt: 'Put the notes of the G run in order.',
        tiles: ['{n:G}', '{n:E}', '{n:D}', '{n:A}', '{n:B}', '{n:G}'],
        distractors: ['{n:C}'],
        explain: 'Down from the open {n:G} string: {n:G} {n:E} {n:D} {n:A}, then up a step to {n:B} and home to the low {n:G}.',
      },
    },
    {
      type: 'choice',
      prompt: 'Where does the G run land?',
      options: [
        { text: '{n:G} at string 6, fret 3, on beat 1', correct: true },
        { text: '{n:B} at string 5, fret 2', why: '{n:B} is the hammer-on, the last note before the landing.' },
        { text: 'The open string 6', why: 'The open string 6 is {n:E}. The run lands on {n:G}, the root, back in the {c:G} chord.' },
      ],
      explain: 'The run ends on the low {n:G}, string 6, fret 3, right on beat 1: finger 3 lands, and the {c:G} chord is back under your hand.',
      fact: 'g-run-notes',
    },
    playerTask({
      id: 'g-run-loop',
      title: 'Loop the G run',
      song: 'st-bluegrass-g-run',
      bars: [7, 8],
      tempo: 50,
      minutes: 4,
      body: 'Bars 7 and 8 hold the first G run and its landing. Loop them at 50 % (60 BPM), then 75 % (90 BPM). Up on the "and" of 2, down on 3, up, down on 4, and the hammer-on needs no pick.',
    }),
    {
      type: 'true-false',
      statement: 'Under {c:A7}, the bass can alternate the open string 5 ({n:A}) and the open string 6 ({n:E}).',
      answer: true,
      explain: '{n:A} is the root of {c:A7} and {n:E} its fifth: root, then fifth, as with every chord in this style.',
    },
    playerTask({
      id: 'bluegrass-player',
      title: 'Bluegrass Rhythm and the G Run',
      song: 'st-bluegrass-g-run',
      tempo: 75,
      minutes: 5,
      body: 'The whole study at 75 % (90 BPM), then 92 % (110 BPM): bass on 1 and 3, strums on 2 and 4, a G run at the end of each phrase. Before each {c:C} the bass steps up from {n:B} to {n:C}.',
    }),
    {
      type: 'fretboard-name',
      prompt: 'The hammer-on of the G run lands on string 5, fret 2. Which note is it?',
      position: { string: 5, fret: 2 },
      ask: 'note',
      spelling: 'any',
      options: ['B', 'A', 'C', 'G'],
      explain: 'String 5, fret 2 is {n:B}, the third of {c:G}: the open {n:A} hammers up to it, and the run steps on to {n:G}.',
      fact: 'g-run-notes',
    },
    toolTask({
      id: 'country-jam',
      title: 'Jam: bass-strum and the run',
      tool: 'progressions',
      params: ['country-ii7', 'g', 'jam'],
      minutes: 5,
      body: 'Set the band to 110 BPM: {c:G}, {c:A7}, {c:D7}, {c:G}, two bars each. Bass-strum all the way and end every 8 bars with the G run. Under {c:A7}, alternate the open string 5 ({n:A}) and the open string 6 ({n:E}).',
    }),
    {
      type: 'choice',
      prompt: 'How do you pick the G run?',
      options: [
        { text: 'Strict alternate strokes, in time', correct: true },
        { text: 'All downstrokes, as fast as you can', why: 'Downstrokes alone are too slow for eighths at bluegrass tempos, and speed is not the point: time is.' },
        { text: 'Freely, slowing down for the hammer-on', why: 'The run has to land on beat 1. Keep it strictly in time.' },
      ],
      explain: 'Alternate strokes keep the eighths even, and the hammer-on keeps the pattern going without a stroke. Land on beat 1, every time.',
    },
  ],
  facts: [
    { id: 'bluegrass-bass', front: 'How is bluegrass rhythm more than plain boom-chick?', back: 'The bass alternates root and fifth ({c:G}: {n:G} then {n:D}), and phrases end with a quick run.' },
    { id: 'g-run-notes', front: 'The notes of the G run?', back: 'Open string 3 ({n:G}), string 4, fret 2 ({n:E}), open string 4 ({n:D}), open string 5 hammered to fret 2 ({n:B}), landing on string 6, fret 3 ({n:G}) on beat 1.' },
  ],
};

// ── 5. Swing, and the click on 2 and 4 ─────────────────────────────────────────────────────────

const swingAndShuffle: TeacherLesson = {
  id: 'swing-and-shuffle',
  title: 'Swing, and the click on 2 and 4',
  teaches: 'Swing makes pairs of eighths long-short, and a click on 2 and 4 only makes you carry 1 and 3 yourself.',
  minutes: 5,
  skill: 'teacher:dev:swing-and-shuffle',
  steps: [
    {
      type: 'card',
      title: 'Long-short',
      body: '{t:swing|Swing} turns pairs of eighth notes into long-short, like a {t:triplet} with the middle note left out. Jazz, blues and rockabilly all live on it. Here are the two ingredients: straight eighths, then triplets.',
      figure: { kind: 'rhythm', pattern: 'e e e e e e e e | et et et et et et et et et et et et', tempo: 80, caption: 'Bar 1: straight eighths, two to a beat. Bar 2: triplets, three.' },
    },
    {
      type: 'card',
      title: 'Leave out the middle',
      body: 'Tie the first two notes of each triplet together and you get swing: a long note on the beat, a short one just before the next beat. Say it "doo-ba, doo-ba".',
      figure: { kind: 'rhythm', pattern: SWUNG_EIGHTHS, tempo: 80, caption: 'Swung eighths: each beat a triplet with the middle note tied.' },
    },
    {
      type: 'listen-choice',
      prompt: 'Listen. Are these eighths straight or swung?',
      sound: { kind: 'rhythm', pattern: SWUNG_EIGHTHS, tempo: 80 },
      options: [{ text: 'Swung: long-short', correct: true }, { text: 'Straight: even' }],
      shuffle: false,
      explain: 'Long-short, long-short: the second note of each pair came late, on the last third of the beat. That is swing.',
      fact: 'swing-feel',
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap swung eighths: long-short on every beat.',
      rhythm: { pattern: SWUNG_EIGHTHS },
      tempo: 80,
      show: 'both',
      explain: 'Down on the beat, the short note on the last third of it. If it starts to sound even, exaggerate the long note.',
      fact: 'swing-feel',
    },
    {
      type: 'card',
      title: 'The click on 2 and 4',
      body: 'Now the secret weapon: set the click on beats 2 and 4 only, where the snare drum plays. You feel 1 and 3 yourself, and your time gets much stronger.',
      figure: { kind: 'rhythm', pattern: 'qr q qr q', tempo: 72, caption: 'The click on 2 and 4 only. You carry 1 and 3.' },
    },
    {
      type: 'tap-rhythm',
      prompt: 'Tap only beats 2 and 4, the snare beats, for two bars.',
      rhythm: { pattern: 'qr q qr q | qr q qr q' },
      tempo: 72,
      show: 'both',
      explain: 'Count "1 TWO 3 FOUR" and tap the loud numbers. Beats 1 and 3 still happen: they are in your head and your foot.',
      fact: 'click-2-4',
    },
    toolTask({
      id: 'swing-rhythm',
      title: 'Straight, then swung',
      tool: 'rhythm',
      params: ['strum', 'swung-eighths'],
      minutes: 3,
      body: 'Play Swung down-up in Rhythm: long down, short up. Then open the Down-up pattern, the straight version, and tap that. Go back and forth until you can hear the difference in your hand.',
    }),
    techniqueTask({
      id: 'metronome-2-4',
      title: 'Metronome on 2 and 4',
      exercise: 'tech-metronome-2-4',
      minutes: 5,
      body: 'Start at 60 BPM with the click on 2 and 4 only: swung eighths on {c:A7}, feeling 1 and 3 yourself. Climb the ladder 4 BPM at a time toward 100.',
      tip: 'If you start hearing the click as beat 1, count "one, TWO, three, FOUR" out loud and keep counting.',
    }),
    {
      type: 'choice',
      prompt: 'Why put the click on 2 and 4 only?',
      options: [
        { text: 'You carry 1 and 3 yourself, like the band', correct: true },
        { text: 'It makes the tempo easier', why: 'It is harder at first. That is the point: half the beats come from you.' },
        { text: 'It hides your mistakes', why: 'The opposite: with fewer clicks, any drift shows up at once.' },
      ],
      explain: 'Beats 2 and 4 are where the snare drum plays. With only those clicks, the other beats have to come from you, and your time gets much stronger.',
      fact: 'click-2-4',
    },
    toolTask({
      id: 'slow-blues-jam',
      title: 'Jam: a slow 12/8 blues',
      tool: 'progressions',
      params: ['blues-slow-12-8', 'a', 'jam'],
      minutes: 4,
      body: 'Set the band to 56 BPM for a slow blues in 12/8: each beat splits into three. Play {c:A7}, {c:D7} and {c:E7} with one strum on every beat, and feel the three pulses inside each one.',
    }),
    {
      type: 'true-false',
      statement: 'In swing, the second eighth of each pair falls on the last third of the beat.',
      answer: true,
      explain: 'A swung pair is a triplet with the middle note tied: long for two thirds of the beat, short for the last third.',
      fact: 'swing-feel',
    },
  ],
  facts: [
    { id: 'swing-feel', front: 'What does swing do to a pair of eighth notes?', back: 'Makes it long-short, like a triplet with the middle note left out.' },
    { id: 'click-2-4', front: 'Why practise with the click on 2 and 4?', back: 'Those are the snare drum\'s beats. You feel 1 and 3 yourself, which makes your time much stronger.' },
  ],
};

// ── 6. Folk colour: sus chords ─────────────────────────────────────────────────────────────────

const folkColour: TeacherLesson = {
  id: 'folk-colour',
  title: 'Folk colour: sus chords',
  teaches: 'Keep a chord ringing and move one finger: the sus note wants to fall back to the third, a push and release.',
  minutes: 5,
  skill: 'teacher:dev:folk-colour',
  steps: [
    {
      type: 'card',
      title: 'One finger of colour',
      body: 'Folk players keep a chord ringing and move one finger to add colour. From {c:D}, lift finger 2 for {c:Dsus2} (xx0230), or add finger 4 for {c:Dsus4} (xx0233), then come back. The {t:sus-chord|suspended} note wants to fall back to the chord\'s third: a gentle push and release.',
      figure: { kind: 'chord', symbol: 'Dsus4', frets: 'xx0233', fingers: 'xx0134', caption: '{c:Dsus4}: your {c:D} with finger 4 added at string 1, fret 3.' },
    },
    {
      type: 'choice',
      prompt: 'In {c:Dsus4}, which note takes the place of the third, {n:F#}?',
      options: [
        { text: '{n:G}, the fourth', correct: true },
        { text: '{n:E}, the second', why: '{n:E} replaces the third in {c:Dsus2}. In {c:Dsus4} it is the fourth, {n:G}.' },
        { text: '{n:A}, the fifth', why: '{n:A} is already in {c:D}: the fifth stays.' },
      ],
      explain: '{c:D} is {n:D} {n:F#} {n:A}. In {c:Dsus4} the third, {n:F#}, gives way to the fourth, {n:G}, which wants to fall back to {n:F#}.',
      fact: 'sus-what',
    },
    {
      type: 'card',
      title: 'Same trick on A',
      body: 'On {c:A} (fingers 1, 2, 3 on strings 4, 3, 2), lift finger 3 for {c:Asus2} (x02200), or add finger 4 at string 2, fret 3 for {c:Asus4} (x02230). And {c:Cadd9} (x32030) keeps its third and adds the ninth on top.',
      figure: { kind: 'chord', symbol: 'Asus2', frets: 'x02200', fingers: 'x01200', caption: '{c:Asus2}: {c:A} with finger 3 lifted off string 2.' },
    },
    {
      type: 'match-pairs',
      prompt: 'Match each chord with its shape.',
      pairs: [
        { left: '{c:Dsus2}', right: 'xx0230' },
        { left: '{c:Dsus4}', right: 'xx0233' },
        { left: '{c:Asus2}', right: 'x02200' },
        { left: '{c:Asus4}', right: 'x02230' },
      ],
      explain: 'Each one is its plain chord with one finger moved: sus2 lifts a finger, sus4 adds the little finger a fret above the third.',
      fact: 'd-sus-moves',
    },
    {
      type: 'play-chord',
      prompt: 'From {c:D}, add finger 4 and strum {c:Dsus4} (xx0233).',
      chord: 'Dsus4',
      frets: 'xx0233',
      explain: '{n:D} {n:A} {n:D} {n:G}: the {n:G} on string 1 is the suspended fourth. Lift finger 4 and the {n:F#} under it brings the chord home.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Dsus4', frets: 'xx0233', accept: 'this-shape', prompt: 'Build {c:Dsus4}: your {c:D} with one finger added.', explain: '{c:Dsus4} is xx0233: finger 4 at string 1, fret 3, on top of the {c:D} shape.' },
    },
    {
      type: 'play-chord',
      prompt: 'Back to {c:D}, then lift finger 2 and strum {c:Dsus2} (xx0230).',
      chord: 'Dsus2',
      frets: 'xx0230',
      explain: '{n:D} {n:A} {n:D} {n:E}: the open string 1 is the suspended second. Put finger 2 back and {n:F#} returns.',
      alternative: { type: 'chord-build', task: 'fingers', chord: 'Dsus2', frets: 'xx0230', accept: 'this-shape', prompt: 'Build {c:Dsus2}: your {c:D} with one finger lifted.', explain: '{c:Dsus2} is xx0230: the {c:D} shape with finger 2 lifted off string 1.' },
    },
    {
      type: 'card',
      title: 'Where the finger moves',
      body: 'Use the folk pattern: down, down-up, (miss), up, down-up. The plain chord rings on beats 1 and 2. On the silent beat 3 one finger moves, so the up-strum right after it rings the sus chord; on beat 4 the finger goes back home.',
      figure: { kind: 'rhythm', pattern: FOLK_PATTERN, tempo: 84, caption: 'The folk pattern. The finger moves in the gap on beat 3.' },
    },
    playerTask({
      id: 'sus-player',
      title: 'Sus Chords and Chord Embellishments',
      song: 'st-sus-embellish',
      tempo: 85,
      minutes: 5,
      body: 'Play it at 85 % (71 BPM), then 100 % (84 BPM): {c:D} with {c:Dsus4} and {c:Dsus2}, {c:A} with {c:Asus4} and {c:Asus2}, and {c:C} with {c:Cadd9}, which keeps its third and adds the ninth.',
      tip: 'Nothing else moves. If two fingers move, the chord sounds like a new chord instead of a colour.',
    }),
    {
      type: 'true-false',
      statement: '{c:Cadd9} keeps the third of {c:C} and adds the ninth.',
      answer: true,
      explain: '{c:Cadd9} (x32030) still has {n:E}, the third, and adds {n:D}, the ninth, at string 2, fret 3. A sus chord would drop the third.',
      fact: 'add9-keeps-third',
    },
    toolTask({
      id: 'folk-sus-jam',
      title: 'Jam: the sus shimmer',
      tool: 'progressions',
      params: ['folk-sus', 'd', 'jam'],
      minutes: 4,
      body: 'Set the band to 90 BPM: {c:D}, {c:Dsus4}, {c:D}, {c:Dsus2}, a bar each. The folk pattern all the way; only one finger moves.',
    }),
    { generate: 'chord-quality-ear', params: { types: ['major', 'sus4', 'sus2'] } },
    playerTask({
      id: 'shenandoah',
      title: 'Shenandoah with sus colour',
      song: 'shenandoah',
      tempo: 87,
      minutes: 5,
      body: 'Play Shenandoah at 87 % (about 52 BPM), then 100 % (60 BPM). On the long {c:D} and {c:A} chords, add your own sus decorations: move one finger, then back to the chord.',
      fallback: {
        tool: 'player',
        params: ['clementine', 't65'],
        title: 'Decorate a folk song in D',
        body: 'Shenandoah is not in the Songs library yet, so decorate another folk song in D: Clementine, at 65 % (about 70 BPM). On the long {c:D} bars, move one finger for {c:Dsus4} or {c:Dsus2} and come back; leave {c:A7} as it is.',
      },
    }),
    {
      type: 'choice',
      prompt: 'From {c:D} (xx0232), how do you get {c:Dsus2}?',
      options: [
        { text: 'Lift finger 2 off string 1', correct: true },
        { text: 'Add finger 4 at string 1, fret 3', why: 'That gives {c:Dsus4}, with {n:G} on top.' },
        { text: 'Lift finger 1 off string 3', why: 'That takes away the {n:A}, not the third. The third is on string 1.' },
      ],
      explain: 'The third of {c:D}, {n:F#}, is under finger 2 on string 1. Lift it and the open {n:E}, the second, rings instead.',
      fact: 'd-sus-moves',
    },
  ],
  facts: [
    { id: 'sus-what', front: 'What do sus2 and sus4 chords do to the third?', back: 'They replace it: sus2 with the second, sus4 with the fourth. The suspended note wants to fall back to the third.' },
    { id: 'd-sus-moves', front: 'From {c:D} (xx0232), how do you play {c:Dsus2} and {c:Dsus4}?', back: 'Lift finger 2 for {c:Dsus2} (xx0230); add finger 4 at string 1, fret 3 for {c:Dsus4} (xx0233).' },
    { id: 'add9-keeps-third', front: 'How is {c:Cadd9} different from a sus chord?', back: 'It keeps the third and adds the ninth: x32030, with {n:D} on string 2.' },
  ],
};

/** Unit 6 of Dev's course. */
const unit: TeacherUnit = {
  id: 'dev-rhythm-styles',
  title: 'Rhythm guitar in every style',
  theme: 'rhythm',
  description: 'Convincing rhythm in rock, funk, reggae, country and bluegrass, swing and folk: the right hand of every style.',
  lessons: [rockRhythm, funk, reggae, countryAndBluegrass, swingAndShuffle, folkColour],
  checkpoint: { sample: 8, maxMistakes: 2 },
  glossary: [
    { id: 'gallop', term: 'gallop', definition: 'A rhythm of an eighth note and two sixteenths on each beat, picked down, down-up: da, da-da.' },
    { id: 'palm-mute', term: 'palm mute', definition: 'Resting the edge of the picking hand on the strings by the bridge, so notes sound short and chunky but keep their pitch.' },
    { id: 'scratch', term: 'scratch', definition: 'A strum on strings muted by relaxed fretting fingers: a dry click with no pitch, the drum sound of funk guitar.' },
    { id: 'chop', term: 'chop', definition: 'A short, crisp chord cut off at once by releasing the fretting pressure, as reggae guitar plays it.' },
    { id: 'g-run', term: 'G run', definition: 'A quick bass run that ends a phrase on G in bluegrass: G E D on strings 3 and 4, A hammered to B, landing on the low G.' },
    { id: 'swing', term: 'swing', definition: 'A feel that turns pairs of eighth notes into long-short, like a triplet with the middle note left out.' },
    { id: 'sus-chord', term: 'sus chord', definition: 'A chord whose third is replaced by the second (sus2) or the fourth (sus4). The new note wants to fall back to the third.' },
  ],
};

export default unit;

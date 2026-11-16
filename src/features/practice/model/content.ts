/**
 * The exercises a practice block can hold, per area and level. Original material written for this
 * app: what to do, what it should feel or sound like, and the usual mistake. Fret positions are in
 * standard tuning and are cross-checked against the pitch maths in `content.test.ts`.
 */
import type { ExperienceLevel } from '@/core/progress';
import { AREA_INFO, target, type Area, type BlockTarget } from './areas';

/** One exercise. */
export interface ContentItem {
  /** Stable slug, unique across the pool. */
  id: string;
  area: Area;
  /** Levels it suits. */
  levels: readonly ExperienceLevel[];
  /** What to do, starting with a verb or naming the exercise. */
  title: string;
  /** One or two sentences: how, and what good feels like. */
  goal: string;
  /** Short steps shown in the session runner. */
  steps?: readonly string[];
  /** The screen to open; the area's own screen when left out. */
  target?: BlockTarget;
  /** A second, optional screen (the tuner, the metronome). */
  extra?: BlockTarget;
  /** Skill id the exercise trains, when there is one. */
  skillId?: string;
  /**
   * For a beginner, offered only once they have practised on this many days. The beginner level
   * runs from the first day to the first songs: a teacher brings in the F barre chord in the
   * second month, not the first week.
   */
  beginnerFrom?: number;
  /** A Theory Path unit id: the item is offered only once a lesson of that unit is done (its drill). */
  unit?: string;
}

const ALL: readonly ExperienceLevel[] = ['beginner', 'intermediate', 'expert'];
const B: readonly ExperienceLevel[] = ['beginner'];
const BI: readonly ExperienceLevel[] = ['beginner', 'intermediate'];
const I: readonly ExperienceLevel[] = ['intermediate'];
const IE: readonly ExperienceLevel[] = ['intermediate', 'expert'];
const E: readonly ExperienceLevel[] = ['expert'];

const TUNER = target('tuner', 'Open the tuner');
const METRONOME = target('metronome', 'Open the metronome');

/** The whole pool. */
export const CONTENT: readonly ContentItem[] = [
  // ---------------------------------------------------------------- warm-up
  {
    id: 'tune-and-loosen',
    area: 'warmup',
    levels: ALL,
    title: 'Tune up and loosen your hands',
    goal: 'Tune all six strings, then open and close each hand slowly ten times. Drop your shoulders: tension there ends up in your fingers.',
    steps: ['Tune the six strings', 'Open and close each hand ten times', 'Roll your shoulders back twice'],
    target: TUNER,
  },
  {
    id: 'finger-walk',
    area: 'warmup',
    levels: B,
    title: 'Walk your fingers up one string',
    goal: 'On the high E string play frets 1, 2, 3 and 4 with fingers 1 to 4, then walk back down. Press just behind each fret: it takes less force than you think.',
    steps: ['High E string, frets 1 to 4, one finger per fret', 'Walk back down', 'Repeat on the B string'],
    extra: TUNER,
  },
  {
    id: 'spider-1234',
    area: 'warmup',
    levels: IE,
    title: 'Chromatic spider, 1-2-3-4',
    goal: 'Frets 1 to 4 on every string, low E to high E and back, one note per click at 60 BPM. Keep each finger hovering close to the string after it lifts.',
    steps: ['One finger per fret, frets 1 to 4', 'Low E to high E, then back', 'One note per click at 60 BPM'],
    extra: METRONOME,
  },
  {
    id: 'spider-permutations',
    area: 'warmup',
    levels: E,
    title: 'Spider permutations: 1-3-2-4 and 1-4-2-3',
    goal: 'The same four frets in harder finger orders, alternate picked. Keep the click slow enough that every note is clean, then nudge it up by 4 BPM.',
    extra: METRONOME,
  },
  {
    id: 'legato-warmup',
    area: 'warmup',
    levels: E,
    title: 'Legato warm-up',
    goal: 'At the 5th fret of each string, pick once and hammer on to the 7th and 8th frets, then pull off back down. The hammered notes should be as loud as the picked one.',
  },

  // ---------------------------------------------------------------- technique
  {
    id: 'clean-fretting',
    area: 'technique',
    levels: B,
    title: 'Make every fretted note ring',
    goal: 'Play frets 1, 3 and 5 on each string. If a note buzzes, move your fingertip closer to the fret rather than pressing harder. Keep your thumb behind the neck.',
    steps: ['Frets 1, 3 and 5 on each string', 'A buzz? Slide closer to the fret', 'Thumb behind the neck, not over it'],
  },
  {
    id: 'alternate-open',
    area: 'technique',
    levels: B,
    title: 'Alternate picking on an open string',
    goal: 'Down, up, down, up on the open G string, one stroke per click at 70 BPM. Small movements from the wrist; the pick barely leaves the string.',
    extra: METRONOME,
  },
  {
    id: 'hammer-pull',
    area: 'technique',
    levels: BI,
    beginnerFrom: 7,
    title: 'Hammer-ons and pull-offs',
    goal: 'Pick the 5th fret, then hammer the 7th without picking. Pull off back to the 5th by flicking the string slightly toward the floor. Both notes should sound equally loud.',
  },
  {
    id: 'picking-ladder',
    area: 'technique',
    levels: IE,
    title: 'Alternate picking tempo ladder',
    goal: 'Four notes per string across a scale shape. Start at 70 BPM and add 5 BPM after each clean pass. When it gets messy, drop back 10 and finish there.',
    extra: METRONOME,
  },
  {
    id: 'bends-in-tune',
    area: 'technique',
    levels: IE,
    title: 'Bend in tune',
    goal: 'Play the 7th fret of the G string (D) as your target, then bend the 5th fret (C) up until it matches. Push with three fingers together and stop exactly on the pitch.',
    steps: ['Play G string, 7th fret: the target', 'Bend the 5th fret up a whole step', 'Match the target, then hold it steady'],
  },
  {
    id: 'vibrato',
    area: 'technique',
    levels: IE,
    title: 'Even vibrato',
    goal: 'Hold the 8th fret of the B string and rock from the wrist, not the finger. Aim for a steady wobble, two pulses per click at 60 BPM.',
    extra: METRONOME,
  },
  {
    id: 'string-skipping',
    area: 'technique',
    levels: IE,
    title: 'String skipping',
    goal: 'Alternate between notes on the A and G strings with strict down-up picking. Mute the strings you skip with the side of your picking hand so nothing rings in between.',
  },
  {
    id: 'economy-picking',
    area: 'technique',
    levels: E,
    title: 'Economy picking across strings',
    goal: 'Three notes per string; when you cross to the next string in the same direction, push the pick through in one motion. Check against the click that the crossing never rushes.',
    extra: METRONOME,
  },
  {
    id: 'sweep-arpeggio',
    area: 'technique',
    levels: E,
    title: 'Sweep a three-string arpeggio',
    goal: 'A minor at the 12th fret: G string 14, B string 13, high E 12, and back. One smooth push down through the strings and one pull back up; roll each fingertip off as the next note starts.',
  },

  // ---------------------------------------------------------------- theory and the neck
  {
    id: 'theory-lesson',
    area: 'theory',
    levels: ALL,
    title: 'Do one theory lesson',
    goal: 'The next small step on the Theory Path. Once it clicks, say the new idea out loud in your own words.',
    target: target('learn', 'Open the Theory Path'),
  },
  {
    id: 'notes-low-e',
    area: 'theory',
    levels: B,
    title: 'Learn the notes on the low E string',
    goal: 'E, F, G, A, B, C, D, E sit at frets 0, 1, 3, 5, 7, 8, 10 and 12. Say each name as you play it, then play them in a random order.',
    target: target('fretboard', 'Open Fretboard'),
  },
  {
    id: 'notes-a-string',
    area: 'theory',
    levels: BI,
    title: 'Learn the notes on the A string',
    goal: 'A, B, C, D, E, F, G, A sit at frets 0, 2, 3, 5, 7, 8, 10 and 12. Between B and C, and between E and F, there is only one fret.',
    target: target('fretboard', 'Open Fretboard'),
  },
  {
    id: 'find-every-c',
    area: 'theory',
    levels: I,
    title: 'Find every C on the neck',
    goal: 'Below the 12th fret: low E 8, A 3, D 10, G 5, B 1, high E 8. Find them all, then do it again without looking at this list.',
    target: target('fretboard', 'Open Fretboard'),
  },
  {
    id: 'chord-tones',
    area: 'theory',
    levels: IE,
    title: 'Name the notes in the chords you play',
    goal: 'For each chord of a song you know, name its root, third and fifth. C major is C, E, G; A minor is A, C, E. Then find those notes inside your chord shape.',
    target: target('reference', 'Open Reference'),
  },
  {
    id: 'circle-of-fifths',
    area: 'theory',
    levels: IE,
    title: 'Walk the circle of fifths',
    goal: 'Clockwise with sharps: C (none), G (1), D (2), A (3), E (4), B (5), F♯ (6). Anticlockwise with flats: F (1), B♭ (2), E♭ (3), A♭ (4). Say it, then play each key note.',
    target: target('reference', 'Open Reference'),
  },
  {
    id: 'roman-numerals',
    area: 'theory',
    levels: IE,
    title: 'Analyse a progression in Roman numerals',
    goal: 'Write each chord as a numeral in its key: in G major, G–Em–C–D is I–vi–IV–V. Then play the same numerals in D major from memory.',
    target: target('progressions', 'Open Progressions'),
  },
  {
    id: 'harmonic-function',
    area: 'theory',
    levels: E,
    title: 'Tonic, subdominant, dominant',
    goal: 'Play I–IV–V–I in three keys and name what each chord does: home, away, tension, home. Then replace IV with ii and V with vii°: the same jobs in new colours.',
    target: target('progressions', 'Open Progressions'),
  },

  // ---------------------------------------------------------------- scales
  {
    id: 'c-major-open',
    area: 'scales',
    levels: B,
    title: 'C major scale in open position',
    goal: 'C D E F G A B C: A string 3; D string 0, 2, 3; G string 0, 2; B string 0, 1. One note per click, saying the names as you go.',
    extra: METRONOME,
  },
  {
    id: 'g-major-two-octaves',
    area: 'scales',
    levels: B,
    beginnerFrom: 7,
    title: 'G major scale, two octaves',
    goal: 'From the low E string 3rd fret to the high E string 3rd fret, open position. Remember the F♯: D string 4th fret and high E 2nd fret.',
    extra: METRONOME,
  },
  {
    id: 'am-pentatonic-box-1',
    area: 'scales',
    levels: BI,
    beginnerFrom: 14,
    title: 'A minor pentatonic, box 1',
    goal: 'Frets 5 and 8 on both E strings and the B string; frets 5 and 7 on A, D and G. Up and down, one note per click at 60 BPM, first finger on every 5th-fret note.',
    skillId: 'scale:a-minor-pentatonic:box-1',
    extra: METRONOME,
  },
  {
    id: 'am-pentatonic-box-2',
    area: 'scales',
    levels: I,
    title: 'Connect pentatonic boxes 1 and 2',
    goal: 'Play box 1 at the 5th fret, then slide up into box 2 (frets 7 to 10) and come back down. Land on an A every time you change box.',
    skillId: 'scale:a-minor-pentatonic:box-2',
  },
  {
    id: 'g-major-three-places',
    area: 'scales',
    levels: I,
    title: 'G major in three places',
    goal: 'Start G major from the low E string 3rd fret, then from the A string 10th fret, then from the D string 5th fret. The same notes, three neighbourhoods of the neck.',
  },
  {
    id: 'scale-in-thirds',
    area: 'scales',
    levels: IE,
    title: 'Play a scale in thirds',
    goal: 'C major in thirds: C–E, D–F, E–G, F–A and on up the scale, then back down. It turns a scale exercise into melody.',
    extra: METRONOME,
  },
  {
    id: 'three-notes-per-string',
    area: 'scales',
    levels: E,
    title: 'Three-notes-per-string G major',
    goal: 'Three notes on every string from the 3rd fret, strictly alternate picked. Start at 80 BPM in eighth notes and add 4 BPM after each clean pass.',
    extra: METRONOME,
  },
  {
    id: 'dorian-drone',
    area: 'scales',
    levels: IE,
    title: 'D Dorian over a drone',
    goal: 'Over a D drone, play D to D using only the notes of C major. Lean on the B: that natural sixth is the colour of Dorian.',
  },
  {
    id: 'melodic-minor',
    area: 'scales',
    levels: E,
    title: 'A melodic minor in two positions',
    goal: 'A B C D E F♯ G♯: minor with a major sixth and seventh. Play it in two positions and let the G♯ resolve up to A.',
  },

  // ---------------------------------------------------------------- chords and changes
  {
    id: 'first-chords-ring',
    area: 'chords',
    levels: B,
    title: 'Make E minor and A minor ring',
    goal: 'Play each string of the chord one at a time. A dead note means a finger is touching its neighbour: arch it more and press with the very tip.',
    skillId: 'chord:em',
  },
  {
    id: 'change-g-c',
    area: 'chords',
    levels: B,
    title: 'One-minute changes: G to C',
    goal: 'Switch between G and C for a minute and count the clean changes. Move all fingers together, and picture the next shape before you leave the old one.',
    skillId: 'chord-change:g-c',
  },
  {
    id: 'change-em-am',
    area: 'chords',
    levels: B,
    title: 'One-minute changes: E minor to A minor',
    goal: 'Fingers 2 and 3 move together as a pair, one string over, and finger 1 lands on the B string. Count the clean changes in one minute.',
    skillId: 'chord-change:em-am',
  },
  {
    id: 'change-d-a',
    area: 'chords',
    levels: B,
    title: 'One-minute changes: D to A',
    goal: 'Lift all three fingers at once, keep them low over the strings, and land the A shape in one movement. Count the clean changes in one minute.',
    skillId: 'chord-change:d-a',
  },
  {
    id: 'f-barre',
    area: 'chords',
    levels: BI,
    beginnerFrom: 21,
    title: 'F barre chord in four steps',
    goal: 'First finger flat across fret 1, rolled slightly onto its bony side; middle finger on the G string 2nd fret; ring and little fingers on the A and D strings 3rd fret. Play each string and fix the one that buzzes.',
    steps: ['Barre fret 1 with the side of your first finger', 'Middle finger: G string, 2nd fret', 'Ring and little: A and D strings, 3rd fret', 'Pick each string; fix the buzz'],
    skillId: 'chord:f',
  },
  {
    id: 'barre-around-neck',
    area: 'chords',
    levels: I,
    title: 'Move one barre shape around the neck',
    goal: 'The E-shape barre is G at the 3rd fret, A at the 5th and C at the 8th. Say the chord name as you land each one, four strums per chord.',
  },
  {
    id: 'dominant-sevenths',
    area: 'chords',
    levels: I,
    title: 'Dominant sevenths: G7, C7, D7',
    goal: 'G7–C7–D7–G7, four strums each. Listen to the seventh in each chord: it leans toward the next one.',
  },
  {
    id: 'ii-v-i',
    area: 'chords',
    levels: IE,
    title: 'Voice-lead a ii–V–I',
    goal: 'Dm7–G7–Cmaj7 with the smallest finger moves you can find. The seventh of each chord falls a half step to the next third; the third stays and becomes the next seventh.',
  },
  {
    id: 'drop-2',
    area: 'chords',
    levels: E,
    title: 'Drop-2 voicings on the top four strings',
    goal: 'Cmaj7 in all four inversions on strings 1 to 4, climbing the neck. Name the lowest note of each before you play it.',
  },
  {
    id: 'chord-melody',
    area: 'chords',
    levels: E,
    title: 'Harmonise a melody',
    goal: 'Take a simple tune and put a chord under each strong-beat note, keeping the melody on top. Start with I, IV and V, then try a substitute.',
  },

  // ---------------------------------------------------------------- rhythm
  {
    id: 'down-strums',
    area: 'rhythm',
    levels: B,
    title: 'Down strums on every beat',
    goal: 'One down strum per click at 70 BPM, counting out loud: one, two, three, four. Keep the arm swinging evenly, even while you change chords.',
    extra: METRONOME,
  },
  {
    id: 'count-and-rest',
    area: 'rhythm',
    levels: B,
    title: 'Strum, count and rest',
    goal: 'Strum on beats 1 and 3 only and stay silent on 2 and 4 while you keep counting. The silences are part of the rhythm.',
    extra: METRONOME,
  },
  {
    id: 'd-du-udu',
    area: 'rhythm',
    levels: BI,
    title: 'The strum pattern D, DU, UDU',
    goal: 'Down, down-up, up-down-up over one bar. Your hand keeps moving down and up the whole time; on the silent stroke it simply misses the strings.',
    steps: ['Hand moves down-up all the time', 'Strum: 1, 2-and, and-4-and', 'Miss the strings on beat 3'],
    extra: METRONOME,
  },
  {
    id: 'chucks',
    area: 'rhythm',
    levels: I,
    title: 'Muted strums on 2 and 4',
    goal: 'Strum the chord on 1 and 3; on 2 and 4 relax the fretting hand so the strings go dead and you get a short, percussive chuck.',
  },
  {
    id: 'sixteenths-accents',
    area: 'rhythm',
    levels: IE,
    title: 'Sixteenth-note strumming with accents',
    goal: 'Steady sixteenths at 70 BPM, accenting the "and" of each beat: 1 e AND a. Then move the accent to the "a". The hand never stops.',
    extra: METRONOME,
  },
  {
    id: 'seven-eight',
    area: 'rhythm',
    levels: E,
    title: '7/8 grouped 2+2+3',
    goal: 'Count 1-2, 1-2, 1-2-3 and strum on every 1. The long group must not rush: feel it as one beat and a half.',
    extra: METRONOME,
  },
  {
    id: 'behind-ahead',
    area: 'rhythm',
    levels: E,
    title: 'Play behind and ahead of the click',
    goal: 'Strum quarter notes a hair late for eight bars, then a hair early, then dead on. Notice how each placement changes the feel.',
    extra: METRONOME,
  },

  // ---------------------------------------------------------------- ear
  {
    id: 'high-or-low',
    area: 'ear',
    levels: B,
    title: 'Higher or lower?',
    goal: 'One round: is the second note higher or lower than the first? Then sing the two notes back before you answer the next one.',
  },
  {
    id: 'match-a-note',
    area: 'ear',
    levels: B,
    title: 'Match a note with your voice',
    goal: 'Play an open string, hum it while it rings, and slide your voice until the buzz between you and the string disappears.',
    target: target('tuner', 'Open the tuner'),
  },
  {
    id: 'major-or-minor',
    area: 'ear',
    levels: BI,
    title: 'Major or minor?',
    goal: 'One round of chord qualities: major sounds bright and settled, minor darker. Afterwards play E and E minor and hear the one note that changes.',
  },
  {
    id: 'fourths-fifths',
    area: 'ear',
    levels: I,
    title: 'Fourths and fifths',
    goal: 'One round of perfect fourths and fifths. A rising fourth opens "Here Comes the Bride"; a rising fifth opens "Twinkle, Twinkle".',
  },
  {
    id: 'find-a-melody',
    area: 'ear',
    levels: IE,
    title: 'Find a melody by ear',
    goal: 'Hum the first phrase of a tune you know and find it on one string. Sing each note before you look for it.',
  },
  {
    id: 'seventh-qualities',
    area: 'ear',
    levels: E,
    title: 'Seventh chords by ear',
    goal: 'maj7, 7, m7 and m7♭5: one round. Name what you hear before you check, then sing the seventh of each.',
  },

  // ---------------------------------------------------------------- songs
  {
    id: 'play-a-song',
    area: 'repertoire',
    levels: ALL,
    title: 'Play a song',
    goal: 'Pick one from the library or one you know, and play it through at an easy tempo without stopping, even when you slip.',
  },
  {
    id: 'two-chord-song',
    area: 'repertoire',
    levels: B,
    title: 'Strum a two-chord song',
    goal: 'E minor and G carry dozens of folk tunes. Strum D, DU, UDU and hum the melody while you play.',
  },
  {
    id: 'song-through',
    area: 'repertoire',
    levels: I,
    title: 'Play one song start to finish',
    goal: 'No stopping to fix mistakes: keep the rhythm going and fix it on the next pass. That is what playing for people asks of you.',
  },
  {
    id: 'jam-progression',
    area: 'repertoire',
    levels: IE,
    title: 'Jam over a progression',
    goal: 'Pick a style, play rhythm for one chorus and solo over the next. Aim your phrases at the notes of each chord.',
    target: target('progressions', 'Open Progressions'),
  },
  {
    id: 'hard-passage',
    area: 'repertoire',
    levels: IE,
    title: 'Polish one hard passage',
    goal: 'Loop the bars that trip you up at 80% tempo until they are clean three times in a row, then put them back into the song.',
  },
  {
    id: 'perform',
    area: 'repertoire',
    levels: E,
    title: 'Perform a piece as if someone is listening',
    goal: 'Start to finish, from the first note to the last ring-out. No restarts; mistakes are part of the performance.',
  },

  // ---------------------------------------------------------------- free play
  {
    id: 'free-play',
    area: 'free',
    levels: ALL,
    title: 'Free play',
    goal: 'Play whatever you like: noodle, write a riff, play the song you love. No goals; this is why you practise.',
  },
];

/** Items by id. */
export const CONTENT_BY_ID: Readonly<Record<string, ContentItem>> = Object.fromEntries(CONTENT.map((c) => [c.id, c]));

/** The screen an item opens. */
export function targetOf(item: ContentItem): BlockTarget {
  return item.target ?? AREA_INFO[item.area].target;
}

/** Whether an item suits a learner now: their level, a beginner's practice days, a unit they have studied. */
function suits(c: ContentItem, level: ExperienceLevel, practiceDays: number, studiedUnits: ReadonlySet<string>): boolean {
  if (!c.levels.includes(level)) return false;
  if (level === 'beginner' && (c.beginnerFrom ?? 0) > practiceDays) return false;
  return c.unit === undefined || studiedUnits.has(c.unit);
}

/**
 * Items for an area that suit a level and, for a beginner, how far along they are (`practiceDays`:
 * days with any practice; leave it out when unknown), from this pool and the app's content
 * (`library`, see `library.ts`; a unit drill only for a unit in `studiedUnits`). Falls back to the
 * nearest level of this pool when an area has nothing for this one, so a pool is never empty.
 */
export function poolFor(
  area: Area,
  level: ExperienceLevel,
  practiceDays = Number.POSITIVE_INFINITY,
  library: readonly ContentItem[] = [],
  studiedUnits: readonly string[] = [],
): ContentItem[] {
  const studied = new Set(studiedUnits);
  const all = CONTENT.filter((c) => c.area === area);
  const exact = [...all, ...library.filter((c) => c.area === area)].filter((c) => suits(c, level, practiceDays, studied));
  return exact.length > 0 ? exact : all;
}

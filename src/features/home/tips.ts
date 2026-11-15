/**
 * Practice tips for the "tip of the day" card on Today. Each one is something a teacher would say
 * across the room: concrete, short, and true for any guitar. Where the app has a tool for it, the
 * tip links there.
 */

/** One tip. */
export interface Tip {
  id: string;
  text: string;
  /** Route to offer with the tip, and the words for the link. */
  route?: string;
  action?: string;
}

/** The tips. Order is the rotation order; add new ones at the end so the rotation stays put. */
export const TIPS: readonly Tip[] = [
  { id: 'tune-every-time', text: 'Tune every time you pick up the guitar. Strings drift with temperature and playing, and practising out of tune teaches your ear to accept it.', route: 'tuner', action: 'Open the tuner' },
  { id: 'tune-up-to-pitch', text: 'Always tune up to the note. If you overshoot, drop below it and come back up: the string holds its pitch better when the gear is pulling.', route: 'tuner', action: 'Open the tuner' },
  { id: 'little-and-often', text: 'Five focused minutes every day beat an hour once a week. Your hands improve between sessions, so give them something to work on daily.' },
  { id: 'slow-is-fast', text: 'If you cannot play it slowly, you cannot play it fast. Find the tempo where it is clean and relaxed, then raise the click by about 5 BPM.', route: 'metronome', action: 'Open the metronome' },
  { id: 'behind-the-fret', text: 'Press just behind the fret, not on top of it and not in the middle of the space. You need far less force there and the note rings clear.' },
  { id: 'buzz-or-dead', text: 'A buzzing note usually means the finger is too far from the fret or not pressing enough. A dead note usually means another finger is leaning on the string.' },
  { id: 'sore-vs-pain', text: 'Sore fingertips in the first weeks are normal and pass. Sharp pain in the wrist or hand is not: stop, shake it out and come back later.' },
  { id: 'thumb-position', text: 'For barre chords and wide stretches, drop your thumb behind the neck, roughly opposite the middle finger. Hooking it over the top is for bends and vibrato.' },
  { id: 'one-minute-changes', text: 'When a chord change is slow, practise only the change: back and forth between the two chords, in time, for one minute. Count the clean ones and beat it tomorrow.', route: 'chords', action: 'Open the chord trainer' },
  { id: 'move-as-shape', text: 'Move all the fingers of a chord together, as one shape. Placing them one after another is what makes a change arrive late.' },
  { id: 'anchor-fingers', text: 'Look for fingers that do not need to move. From C to A minor the index and middle fingers stay exactly where they are; only the ring finger moves.', route: 'chords', action: 'See both chords' },
  { id: 'pendulum-hand', text: 'Keep the strumming hand swinging down and up like a pendulum, even on the strums you leave out. The steady motion is where the rhythm lives.', route: 'rhythm', action: 'Try a strumming pattern' },
  { id: 'count-aloud', text: 'Count out loud: one and two and three and four and. It feels awkward for a week and then it fixes your timing for good.' },
  { id: 'tap-your-foot', text: 'Tap your foot on the beat. If the foot stumbles when the part gets hard, the tempo is too fast for today.' },
  { id: 'record-yourself', text: 'Record thirty seconds of your playing and listen back. You will hear things you cannot notice while your hands are busy.' },
  { id: 'low-strings-first', text: 'Learn the notes on the sixth and fifth strings first. They name the common barre chords and are where most scale shapes start.', route: 'fretboard', action: 'Open the fretboard trainer' },
  { id: 'twelfth-fret', text: 'The twelfth fret is the open string again, one octave higher. Everything above it repeats the neck from the start.' },
  { id: 'five-frets-up', text: 'Any note is also found five frets higher on the next thicker string. The one exception is between the B and G strings, where it is four frets.' },
  { id: 'octave-shape', text: 'From any note on the sixth or fifth string, go two strings toward the thin side and two frets higher: the same note, one octave up. It is the quickest way to find your way around.' },
  { id: 'movable-box', text: 'Box one of the minor pentatonic starts with your index finger on the root, on the sixth string. Slide the whole shape and the key moves with it: fifth fret is A minor, eighth fret is C minor.', route: 'scales', action: 'Open the scales' },
  { id: 'major-formula', text: 'The major scale is one pattern of steps: whole, whole, half, whole, whole, whole, half. Start it on any note and you have that note’s major scale.', route: 'learn', action: 'Open the Theory Path' },
  { id: 'relative-minor', text: 'Every major key has a relative minor made of the same seven notes: start from the sixth note. C major and A minor share every note.' },
  { id: 'triad-recipe', text: 'A major chord is the first, third and fifth notes of its major scale. Lower the third by one fret and the chord turns minor.' },
  { id: 'one-four-five', text: 'In any major key the chords on the first, fourth and fifth notes are major. That is I, IV and V, and thousands of songs use nothing else.', route: 'progressions', action: 'Hear it in a progression' },
  { id: 'name-what-you-play', text: 'When you practise a scale, say the note names or the degree numbers as you play. A shape you can name is a shape you can use.' },
  { id: 'scales-in-rhythm', text: 'Practise scales in rhythm, not as a race. Two notes per click, then three, then four, all at the same tempo.', route: 'metronome', action: 'Open the metronome' },
  { id: 'land-on-the-root', text: 'A phrase that ends on the root sounds finished. A phrase that ends anywhere else sounds like a question. Try both when you improvise.' },
  { id: 'leave-gaps', text: 'When you improvise, leave gaps. Play a short idea, rest for as long as it lasted, then answer it.', route: 'progressions', action: 'Jam over a backing band' },
  { id: 'sing-first', text: 'Hum a note before you play it. Tying your voice to the fretboard is the fastest ear training there is.', route: 'ear', action: 'Open ear training' },
  { id: 'interval-songs', text: 'Learn each interval from a tune you could sing in your sleep. Its first two notes become a reference you carry everywhere.', route: 'ear', action: 'Practise intervals' },
  { id: 'alternate-picking', text: 'Alternate picking means strict down, up, down, up, whichever string comes next. Get it even on one open string before you add the fretting hand.', route: 'technique', action: 'Open technique' },
  { id: 'hammer-on', text: 'For a hammer-on the finger lands fast and close to the fret, like a small hammer. Speed makes the note loud, not pressure.', route: 'technique', action: 'Open technique' },
  { id: 'bend-in-tune', text: 'Bend with two or three fingers on the string and turn from the wrist. Before you bend, play the note two frets higher: that is the pitch a whole-step bend has to reach.' },
  { id: 'mute-the-rest', text: 'Mute the strings you are not playing. The edge of your picking hand rests on the thicker strings, and the underside of your fretting fingers touches the thinner ones.' },
  { id: 'barre-on-the-edge', text: 'For a barre, roll the index finger slightly onto its bony edge, set it right behind the fret, and pull back with the arm rather than squeezing with the thumb.' },
  { id: 'small-session', text: 'Short on time? Tune up, do one lesson and play one song. A small complete session beats a skipped day.' },
  { id: 'warm-start', text: 'Start each session with something you can already play. Warm hands and a quick win make the hard part easier.' },
  { id: 'end-clean', text: 'Make the last run of a passage a clean one, even if you have to slow down for it. That is the version your hands take away.' },
  { id: 'loop-the-hard-bars', text: 'Do not replay the whole song to fix two bars. Loop just those bars, slow them down, and speed up only after three clean passes in a row.', route: 'songs', action: 'Open your songs' },
  { id: 'scan-your-books', text: 'Have a printed songbook or a PDF of tabs? Scan a page and it becomes a play-along track you can slow down and loop.', route: 'scan', action: 'Scan a sheet' },
  { id: 'check-on-your-neck', text: 'Not sure your fingers are on the right frets? Open the live fretboard and point the camera at your guitar: the notes are drawn on your own neck.', route: 'camera', action: 'Open the live fretboard' },
  { id: 'fresh-strings', text: 'Change strings when they sound dull or will not stay in tune. New ones need a few gentle stretches and retunes before they settle.' },
  { id: 'stay-loose', text: 'Drop your shoulders and keep the fretting wrist as straight as the chord allows. Tension slows you down and, over time, hurts.' },
  { id: 'short-nails', text: 'Keep the nails on your fretting hand short. A long nail stops the fingertip from coming down straight on the string.' },
  { id: 'hold-the-pick', text: 'Hold the pick between the side of your index finger and the pad of your thumb, with only a little of the tip showing. Grip it as lightly as you can without dropping it.' },
  { id: 'capo-maths', text: 'A capo raises every open string by one semitone per fret. Play G shapes with a capo on the second fret and you are in A.' },
  { id: 'circle-of-fifths', text: 'The circle of fifths is a map of keys. Starting from C, each step clockwise adds one sharp and each step the other way adds one flat.', route: 'reference', action: 'Open the circle of fifths' },
  { id: 'twelve-bar', text: 'A twelve-bar blues is three chords in a fixed order. In A: four bars of A7, two of D7, two of A7, then one bar each of E7, D7, A7 and E7.', route: 'progressions', action: 'Play a twelve-bar blues' },
  { id: 'clap-it-first', text: 'Stuck on a rhythm? Put the guitar down and clap it. If you cannot clap it yet, your strumming hand cannot play it yet.', route: 'rhythm', action: 'Open rhythm' },
  { id: 'clear-your-reviews', text: 'Review cards take two minutes and decide what you still know next month. Clear them before you start something new.', route: 'learn', action: 'Open the Theory Path' },
];

/** The tip for a day number (days since 1970), stepped on by `offset` when the learner asks for another. */
export function tipForDay(day: number, offset = 0): Tip {
  const count = TIPS.length;
  const index = (((Math.floor(day) + Math.floor(offset)) % count) + count) % count;
  return TIPS[index];
}

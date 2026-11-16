/**
 * Terms the Theory Path adds to the lesson engine's built-in glossary (`GLOSSARY` in
 * `src/lessons/glossary.ts`). Link them in lesson text with `{t:id}`; the learner taps the word for
 * its one-line definition.
 *
 * Before adding a term, check the built-in list (API.md, B3): a course term with the same id
 * replaces the built-in one, and the validator warns about it. Add your unit's terms in a block
 * under a comment with the unit id. A definition is one line (at most 160 characters), in plain
 * words, never relying on a harder term than the one it defines.
 */
import type { GlossaryTerm } from '@/lessons';

const T = (id: string, term: string, definition: string): GlossaryTerm => ({ id, term, definition });

/** The Theory Path's own glossary terms. */
export const THEORY_GLOSSARY: readonly GlossaryTerm[] = [
  // sound-and-pitch
  T('vibration', 'vibration', 'A quick movement back and forth. Every sound starts with something vibrating.'),
  T('hertz', 'hertz (Hz)', 'Vibrations per second. The open low E string vibrates about 82 times a second: 82 Hz.'),
  T('volume', 'volume', 'How loud or soft a sound is. A string that swings wider sounds louder.'),
  T('dynamics', 'dynamics', 'Changes of volume in music, from very soft to very loud.'),
  T('timbre', 'timbre', 'Tone colour: the character of a sound that tells a guitar from a piano playing the same note.'),
  T('bridge', 'bridge', 'The part on the guitar body that holds the strings. They vibrate between it and the nut or a fret.'),
  // the-six-strings
  T('tuner', 'tuner', 'A device or app that hears one string and shows its nearest note, and whether it is flat (too low) or sharp (too high).'),
  T('headstock', 'headstock', 'The end of the neck, past the nut, that holds the tuning pegs.'),
  T('tuning-peg', 'tuning peg', 'A knob on the headstock that a string is wound round. Turn it to tighten or loosen the string.'),
  T('beating', 'beating', 'The wobble you hear when two notes are almost the same pitch. It slows down as they get closer and stops when they match.'),
  // pulse-and-beat
  T('flag', 'flag', 'The little tail on the stem of a single eighth note. Each flag halves the note\'s length.'),
  T('beam', 'beam', 'The thick line that joins the stems of eighth notes in a group, in place of their flags.'),
  // reading-tab
  T('hammer-on', 'hammer-on', 'Sounding a higher note on the same string by bringing a finger down hard on its fret, without picking again. Tab writes it h, as in 5h7.'),
  T('pull-off', 'pull-off', 'Sounding a lower note on the same string by pulling a finger off with a slight flick, without picking again. Tab writes it p, as in 7p5.'),
  T('slide', 'slide', 'Gliding a pressed finger along the string to another fret while the note rings. Tab writes / for up and \\ for down.'),
  T('bend', 'bend', 'Pushing a pressed string sideways across the neck so its pitch rises. Tab writes it b: 7b9 bends fret 7 until it sounds like fret 9.'),
  T('vibrato', 'vibrato', 'A quick, even wobble of a note\'s pitch, made by moving the fretting finger slightly. Tab writes it ~.'),
  T('phrase', 'phrase', 'A musical sentence: a short group of notes that ends with a small pause or a longer note. Many melodies use four-bar phrases.'),
  // notes-on-the-neck
  T('fret-marker', 'fret marker', 'A dot set into the neck to show where you are: usually at frets 3, 5, 7 and 9, with a double dot at 12. Also called a position marker.'),
  // major-and-minor-chords
  T('chord-box', 'chord box', 'A picture of a chord shape with the neck upright: strings run down (string 6 on the left), frets run across, dots show the fingers.'),
  T('major-third', 'major third', 'The distance of four half steps: four frets up one string. A major third above the root makes a chord major.'),
  T('minor-third', 'minor third', 'The distance of three half steps: three frets up one string. A minor third above the root makes a chord minor.'),
  // strumming-rhythm
  T('slur', 'slur', 'A curved line joining notes of different pitches: play them smoothly. In guitar music it usually marks a hammer-on or pull-off.'),
  T('waltz', 'waltz', 'A swaying dance in 3/4 time, counted 1 2 3 with the strongest beat on 1.'),
  T('pickup', 'pickup', 'Notes that come before the first full bar of a tune, also called an anacrusis.'),
  T('accent', 'accent', 'Playing one note louder than the notes around it. Written as > over the note.'),
  T('backbeat', 'backbeat', 'A stress on beats 2 and 4 of a bar of 4/4: the feel behind much pop and rock.'),
  T('slash-chart', 'slash chart', 'A chord chart with one mark per beat: the chord symbol on the beat where it starts and a slash (/) on each beat it carries on.'),
  // functional-harmony
  T('predominant', 'predominant', 'Another name for the subdominant job: the chords that usually come just before the dominant chord, such as the chord on degree 4.'),
  T('leading-tone', 'leading tone', 'The note a half step below the tonic, which pulls up to it: B in C major, or G sharp in A minor when the 7th is raised.'),
  // reading-first-position
  T('natural-sign', 'natural sign', 'A sign that cancels a sharp or a flat, so the note is played plain: F instead of F sharp.'),
  T('repeat-sign', 'repeat sign', 'A thick and a thin bar line with two dots. Play the music between the two repeat signs again.'),
  T('da-capo', 'D.C. (da capo)', 'Italian for "from the head": go back to the beginning of the piece.'),
  T('dal-segno', 'D.S. (dal segno)', 'Italian for "from the sign": go back to the sign, a slanted S with two dots.'),
  T('coda', 'coda', 'A closing section, marked with a circle and a cross. "To Coda" tells you when to jump to it.'),
  T('crescendo', 'crescendo', 'Getting gradually louder. Written cresc. or as a wedge that opens out.'),
  T('diminuendo', 'diminuendo', 'Getting gradually softer. Written dim. or as a wedge that closes.'),
  T('staccato', 'staccato', 'Short and detached. Shown by a dot above or below the note head.'),
  T('tenuto', 'tenuto', 'Held for its full length. Shown by a short line above or below the note head.'),
  // minor-key-harmony
  T('subtonic', 'subtonic', 'The 7th note of natural minor, a whole step below the tonic: G in A minor. Unlike a leading tone, it does not pull up.'),
  T('picardy-third', 'Picardy third', 'A major tonic chord at the end of a minor-key piece: an A major chord to end a piece in A minor.'),
  T('andalusian-cadence', 'Andalusian cadence', 'A minor progression that walks down from the tonic chord: Am, G, F, E in A minor. Central to flamenco.'),
  // seventh-chords
  T('half-diminished', 'half-diminished', 'A seventh chord of root, minor 3rd, flat 5th and minor 7th, such as Bm7b5 (B D F A). Also written with a slashed circle.'),
  T('diminished-seventh', 'diminished seventh chord', 'Three minor thirds stacked on a root, such as Cdim7 (C Eb Gb Bbb). Also written with a small circle.'),
  T('minor-major-seventh', 'minor-major seventh', 'A minor triad with a major 7th on top, such as AmMaj7 (A C E G#).'),
  // modes
  T('drone', 'drone', 'One low note held or repeated under the music, so that it sounds like home.'),
  T('vamp', 'vamp', 'A short chord pattern, often just two chords, repeated over and over.'),
  T('characteristic-note', 'characteristic note', 'The note that gives a mode its own colour: the one that differs from plain major or natural minor.'),
  T('parent-scale', 'parent scale', 'The major scale a mode is taken from. D Dorian\'s parent is C major, because D is its 2nd note.'),
  // colour-chords
  T('suspended-chord', 'suspended chord', 'A chord with its 3rd replaced by the 2nd (sus2) or the 4th (sus4), so it is neither major nor minor.'),
  T('resolve', 'resolve', 'To move from a tense note or chord to a settled one, as a sus4 chord does when its 4th falls to the 3rd.'),
  T('added-note-chord', 'add chord', 'A triad with one extra note added, such as the 9th, but no 7th. C add 9 is C E G plus D.'),
  T('sixth-chord', 'sixth chord', 'A triad with the major 6th added: C6 is C E G plus A.'),
  T('slash-chord', 'slash chord', 'A chord written chord/bass: the chord, then its lowest note. D/F# is a D chord with F sharp in the bass.'),
  T('bass-line', 'bass line', 'The line made by the lowest notes, one under each chord.'),
  T('pedal-point', 'pedal point', 'One note, usually in the bass, held or repeated while the chords above it change.'),
  // capo-and-transposition
  T('transpose', 'transpose', 'To move music into a new key by moving every note and chord by the same interval.'),
  T('nashville-numbers', 'Nashville number system', 'Chords written as numbers of the key, 1 to 7, so one chart works in any key. A minus sign marks a minor chord.'),
  // improvising-1
  T('chord-tone', 'chord tone', 'A note that belongs to the chord being played: its root, 3rd, 5th or 7th.'),
  T('strong-beat', 'strong beat', 'A beat that is felt more than the others. In 4/4 the strong beats are 1 and 3.'),
  T('target-note', 'target note', 'A chord tone you aim to land on at the moment the chord changes. The 3rd of the new chord is the strongest.'),
  T('motif', 'motif', 'A short musical idea, a few notes or a rhythm, that is repeated and developed.'),
  T('melodic-sequence', 'sequence', 'A motif repeated starting on another note, keeping its shape: A C D, then C D E.'),
  T('call-and-response', 'call and response', 'A phrase answered by another phrase, like a question followed by its answer.'),
  // compound-and-odd-meters
  T('simple-meter', 'simple meter', 'A meter whose beats each divide into two, such as 2/4, 3/4 and 4/4.'),
  T('compound-meter', 'compound meter', 'A meter whose beats each divide into three, such as 6/8, 9/8 and 12/8. Its beat is a dotted note.'),
  T('odd-meter', 'odd meter', 'A meter that cannot be split into equal groups of two or three, such as 5/4 or 7/8. It is felt as a mix of twos and threes.'),
  T('common-time', 'common time', 'A big C written in place of a time signature. It means 4/4.'),
  T('cut-time', 'cut time', 'A C with a vertical line through it, written in place of a time signature. It means 2/2: two half-note beats in each bar.'),
  T('mixed-meter', 'mixed meter', 'Music whose time signature changes from bar to bar, such as a bar of 3/4, then 2/4, then 3/4 again.'),
  T('hemiola', 'hemiola', 'Accents on every second beat that make two bars of three beats sound like three bars of two.'),
  T('polyrhythm', 'polyrhythm', 'Two different even divisions of the same span played at once, such as three notes against two.'),
  // extended-chords
  T('extended-chord', 'extended chord', 'A seventh chord with more thirds stacked on top: a 9th, an 11th or a 13th.'),
  T('extension', 'extension', 'A note stacked above the 7th of a chord: the 9th, 11th or 13th, which are the 2nd, 4th and 6th an octave higher.'),
  // secondary-dominants
  T('secondary-dominant', 'secondary dominant', 'The dominant chord of a chord other than the tonic, such as D7 leading to G in C major. Written V7/V: five-seven of five.'),
  T('tonicization', 'tonicization', 'Making a chord other than the tonic sound like home for a moment, usually by putting its own dominant before it.'),
  T('leading-tone-chord', 'leading-tone chord', 'A diminished chord built a half step below a chord\'s root, leading up into it: F#dim7 into G.'),
  // intervals-1
  T('melodic-interval', 'melodic interval', 'Two notes played one after the other, as in a tune.'),
  T('harmonic-interval', 'harmonic interval', 'Two notes played at the same time, as in a chord.'),
  T('perfect-interval', 'perfect interval', 'The unison, fourth, fifth or octave. Their usual sizes are called perfect, never major or minor.'),
  T('chord-formula', 'chord formula', 'A chord written as the intervals above its root: 1 3 5 for a major triad, 1 flat-3 5 for a minor one, 1 5 for a power chord.'),
  // major-scale
  T('solfege', 'do re mi', 'Syllables singers give the degrees of the major scale: do re mi fa sol la ti, with do on the tonic.'),
  T('movable-shape', 'movable shape', 'A fingering with no open strings. Slide it along the neck and the same shape plays in a new key.'),
  // chords-in-a-key
  T('diminished-chord', 'diminished chord', 'A triad of two minor thirds stacked on its root, such as B D F. Its fifth is a half step smaller than a perfect fifth.'),
  // reading-the-staff
  T('standard-notation', 'standard notation', 'Music written as notes on a five-line staff, showing both pitch and rhythm. Guitarists often read it alongside tab.'),
  T('middle-c', 'middle C', 'The C near the middle of a piano, C4. On the guitar it is string 2, fret 1, written in space 3 of the staff.'),
  // intervals-2
  T('interval-quality', 'quality', 'The first word of an interval\'s name: perfect, major, minor, augmented or diminished. It gives the exact size.'),
  T('augmented', 'augmented', 'A half step wider than a major or perfect interval, with the same letter names: C to G sharp is an augmented fifth.'),
  T('diminished', 'diminished', 'A half step narrower than a minor or perfect interval, with the same letter names: C to G flat is a diminished fifth.'),
  T('enharmonic-interval', 'enharmonic intervals', 'Two intervals of the same size with different names, because they span different letters: C to D sharp and C to E flat.'),
  T('interval-inversion', 'inverting an interval', 'Turning an interval upside down by moving its lower note up an octave: C up to E becomes E up to C.'),
  T('compound-interval', 'compound interval', 'An interval wider than an octave, such as a ninth: an octave plus a second.'),
  T('consonance', 'consonance', 'Notes that sound stable together, as if they could rest there: unisons, octaves, fifths, thirds and sixths.'),
  T('dissonance', 'dissonance', 'Notes that sound tense together and seem to want to move: seconds, sevenths and the tritone.'),
  // modal-harmony-and-borrowing
  T('characteristic-chord', 'characteristic chord', 'The chord of a mode that holds its characteristic note, such as the major chord on 4 in Dorian. Vamped with the tonic chord, it makes the mode clear.'),
  T('quartal-voicing', 'quartal voicing', 'A chord stacked in fourths instead of thirds, such as D G C. With no third above its bass, it sounds neither major nor minor.'),
  T('modal-interchange', 'modal interchange', 'Borrowing a chord from a key or mode with the same tonic, such as F minor from C minor in C major. The key stays the same.'),
  T('neapolitan-chord', 'Neapolitan chord', 'A major chord on the flat 2nd degree, such as D flat major in C. Usually played with its 3rd in the bass, it leads to the dominant.'),
  // jazz-harmony
  T('two-five-one', 'two-five-one', 'The chords on degrees 2, 5 and 1 of a key, one after another: Dm7 G7 Cmaj7 in C major. The building block of jazz harmony.'),
  T('guide-tone', 'guide tone', 'The 3rd or the 7th of a chord. Together they tell its quality, and they move by small steps from chord to chord.'),
  T('shell-voicing', 'shell voicing', 'A chord played with only its root, 3rd and 7th. The 5th is left out, and the three notes still say exactly which chord it is.'),
  T('close-position', 'close position', 'A chord voiced with its notes as close together as they go, all within one octave, such as G B C E.'),
  T('drop-2', 'drop 2', 'A voicing made from a close four-note chord by moving its second-highest note down an octave. It fits on four neighbouring strings.'),
  T('drop-3', 'drop 3', 'A voicing made from a close four-note chord by moving its third-highest note down an octave. It skips the string above the bass.'),
  T('turnaround', 'turnaround', 'A short chord progression at the end of a section that leads back to the start, usually to the tonic chord.'),
  T('comping', 'comping', 'Accompanying a soloist or singer with chords, placed in rhythm to support them.'),
  // circle-of-fifths
  T('order-of-sharps', 'order of sharps', 'F C G D A E B: the fixed order sharps are written in a key signature. Flats come in the reverse order, B E A D G C F.'),
  T('enharmonic-key', 'enharmonic keys', 'Two keys that sound the same but are written differently, such as F sharp major (six sharps) and G flat major (six flats).'),
  // minor-scales
  T('parallel-key', 'parallel keys', 'A major and a minor key on the same tonic, such as C major and C minor. They share the tonic but not all their notes.'),
  T('harmonic-minor', 'harmonic minor', 'Natural minor with its 7th raised a half step, such as A B C D E F G sharp. The raised 7th leads up to the tonic.'),
  T('melodic-minor', 'melodic minor', 'Natural minor with its 6th and 7th raised, such as A B C D E F sharp G sharp: the major scale with a flat 3rd.'),
  T('augmented-second', 'augmented second', 'A step of three half steps between neighbouring letters, such as F up to G sharp: wider than a whole step.'),
  // triplets-swing-syncopation
  T('swing', 'swing', 'A feel where each pair of eighth notes is played long-short instead of evenly, close to the first and last notes of a triplet.'),
  T('shuffle', 'shuffle', 'A swung groove kept up through a whole song, as in blues and boogie. On guitar, often a two-string pattern on the root.'),
  T('anticipation', 'anticipation', 'A note or chord that arrives a little before the beat it belongs to, often on the "and" before it, and is held over.'),
  T('ritardando', 'ritardando (rit.)', 'Gradually slow down. Written rit.; rallentando (rall.) means the same.'),
  T('accelerando', 'accelerando (accel.)', 'Gradually speed up. Written accel.'),
  T('a-tempo', 'a tempo', 'Go back to the original speed, after a ritardando or an accelerando.'),
  // altered-dominants
  T('altered-tension', 'altered tension', 'A flat or sharp 9th, a sharp 11th or a flat 13th added to a dominant 7th chord. Each leans by a half step into the next chord.'),
  T('altered-scale', 'altered scale', 'The 7th mode of melodic minor. Over a dominant 7th it holds the root, 3rd and 7th plus every altered tension: G Ab Bb Cb Db Eb F over G7.'),
  T('tritone-substitution', 'tritone substitution', 'Playing the dominant 7th a tritone away in place of the original, such as D flat 7 for G7. The two chords share their 3rd and 7th.'),
  T('backdoor-dominant', 'backdoor dominant', 'The dominant 7th on the flat 7th degree, such as B flat 7 in C major, rising a whole step to the tonic instead of falling a fifth.'),
  // symmetric-sounds
  T('passing-chord', 'passing chord', 'A chord that links two others on the way, often with the bass moving by half steps: C sharp dim7 between C and Dm7.'),
  T('common-tone-diminished', 'common-tone diminished', 'A diminished seventh chord on the same root as the chord around it, which it decorates: C, Cdim7, C.'),
  T('diminished-scale', 'diminished scale', 'An eight-note scale of half and whole steps in turn. Half-whole fits dominant chords with a flat 9; whole-half fits dim7 chords.'),
  T('augmented-triad', 'augmented triad', 'A triad of two major thirds, such as C E G sharp. Its 5th is a half step higher than in a major triad.'),
  T('whole-tone-scale', 'whole-tone scale', 'A six-note scale made only of whole steps, such as C D E F sharp G sharp B flat.'),
  // scales-beyond
  T('chord-scale', 'chord scale', 'The scale matched to a chord: it holds the chord tones plus the tensions that suit it, such as D Dorian over Dm7.'),
  T('avoid-note', 'avoid note', 'A scale note a half step above a chord tone, which clashes if held over the chord: F over Cmaj7. It is fine passing through.'),
  T('lydian-dominant', 'Lydian dominant', 'Mode 4 of melodic minor: a major scale with a raised 4th and a flat 7th. It fits dominant chords with a sharp 11.'),
  T('phrygian-dominant', 'Phrygian dominant', 'Mode 5 of harmonic minor: Phrygian with a major 3rd. E F G sharp A B C D is E Phrygian dominant.'),
  T('bebop-scale', 'bebop scale', 'A seven-note scale plus one chromatic passing note, so that eighth-note runs keep chord tones on the beats.'),
  T('superimposition', 'superimposition', 'Playing a scale or arpeggio built on another root over a chord, to bring out chosen colour notes.'),
  // voice-leading
  T('voice-leading', 'voice leading', 'How each note of one chord moves to a note of the next chord.'),
  T('voice', 'voice', 'One line of notes, followed from chord to chord: the top note of each chord, the bass, or a line in between.'),
  T('common-tone', 'common tone', 'A note two chords share. Keeping it in the same voice, often on the same string, makes the change smooth.'),
  T('parallel-motion', 'parallel motion', 'Two voices moving the same way by the same interval, so they stay the same distance apart.'),
  T('similar-motion', 'similar motion', 'Two voices moving the same way by different intervals, so the distance between them changes.'),
  T('contrary-motion', 'contrary motion', 'Two voices moving in opposite directions: one goes up while the other goes down.'),
  T('oblique-motion', 'oblique motion', 'One voice holds its note while the other moves.'),
  T('parallel-fifths', 'parallel fifths', 'Two voices moving in parallel a perfect fifth apart, as in power-chord riffs. Classical part writing avoids them.'),
  T('line-cliche', 'line cliché', 'A chord held while one voice moves by half steps, often an inner voice or the bass: Am, AmMaj7, Am7, Am6.'),
  T('non-chord-tone', 'non-chord tone', 'A melody note that is not in the chord sounding with it, named by how it moves in and out.'),
  T('passing-tone', 'passing tone', 'A non-chord tone that moves by step between two different chord tones: D between C and E over a C chord.'),
  T('neighbour-tone', 'neighbour tone', 'A non-chord tone that steps away from a chord tone and back to it: F in E F E over a C chord.'),
  T('suspension', 'suspension', 'A note held over from the chord before, where it clashes with the new chord, that then resolves down by step.'),
  T('appoggiatura', 'appoggiatura', 'A non-chord tone reached by a leap on a strong beat, which then resolves by step.'),
];

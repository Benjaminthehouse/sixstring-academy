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
];

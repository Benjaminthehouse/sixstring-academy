/**
 * The built-in glossary: every term a lesson may link with `{t:id}`, each with a one-line
 * explanation in plain words. A course can add its own terms (`course.glossary`).
 *
 * Definitions never rely on a term that is harder than the one being defined.
 */
import type { Course, GlossaryTerm } from './types';

const T = (id: string, term: string, definition: string): GlossaryTerm => ({ id, term, definition });

/** The terms every course may use. */
export const GLOSSARY: readonly GlossaryTerm[] = [
  // The instrument
  T('fret', 'fret', 'One of the metal strips across the neck. Pressing a string just behind a fret sets its note.'),
  T('fretboard', 'fretboard', 'The front of the neck, where your fingers press the strings.'),
  T('nut', 'nut', 'The slotted strip where the neck meets the headstock. The strings rest on it; it acts as fret zero.'),
  T('open-string', 'open string', 'A string played without pressing any fret.'),
  T('string-numbers', 'string numbers', 'Strings are numbered 1 to 6 from the thinnest (highest) to the thickest (lowest).'),
  T('tuning', 'tuning', 'The notes the open strings are set to. Standard tuning is E A D G B E, low to high.'),
  T('capo', 'capo', 'A clamp across one fret that raises every open string by the same amount.'),
  T('position', 'position', 'Where your fretting hand sits on the neck, named by the fret under your index finger.'),
  T('fingering', 'fingering', 'Which finger plays which note: 1 index, 2 middle, 3 ring, 4 little finger.'),
  T('barre', 'barre', 'One finger laid flat across several strings at the same fret.'),
  T('mute', 'mute', 'To stop a string from ringing by touching it lightly without pressing it down.'),
  T('strum', 'strum', 'To brush across several strings in one motion.'),
  T('downstroke', 'downstroke', 'A strum or pick stroke that moves toward the floor.'),
  T('upstroke', 'upstroke', 'A strum or pick stroke that moves toward the ceiling.'),
  T('pick', 'pick', 'The small flat piece held between thumb and index finger to strike the strings.'),
  // Pitch
  T('pitch', 'pitch', 'How high or low a sound is.'),
  T('note', 'note', 'A single musical sound with a name, such as A or F sharp.'),
  T('musical-alphabet', 'musical alphabet', 'The seven note names A B C D E F G, which then start again.'),
  T('octave', 'octave', 'The distance from a note to the next note with the same name, twelve half steps higher or lower.'),
  T('natural', 'natural note', 'A note with no sharp or flat: A, B, C, D, E, F or G.'),
  T('sharp', 'sharp', 'One half step higher than the note it is named after. Written with the sign after the letter.'),
  T('flat', 'flat', 'One half step lower than the note it is named after. Written with the sign after the letter.'),
  T('accidental', 'accidental', 'A sharp, flat or natural sign that changes a note.'),
  T('enharmonic', 'enharmonic', 'Two names for the same pitch, such as C sharp and D flat.'),
  T('half-step', 'half step', 'The smallest distance between two notes: one fret on the guitar. Also called a semitone.'),
  T('whole-step', 'whole step', 'Two half steps: two frets on the guitar. Also called a tone.'),
  T('interval', 'interval', 'The distance between two notes, named by its size (third, fifth) and quality (major, minor, perfect).'),
  T('unison', 'unison', 'Two notes at exactly the same pitch.'),
  T('tritone', 'tritone', 'An interval of six half steps, exactly half an octave.'),
  T('chromatic', 'chromatic', 'Moving by half steps, through all twelve notes.'),
  // Scales and keys
  T('scale', 'scale', 'A set of notes in order of pitch, starting and ending on the same note name.'),
  T('major-scale', 'major scale', 'The seven-note scale built whole, whole, half, whole, whole, whole, half. It sounds bright and settled.'),
  T('minor-scale', 'minor scale', 'The seven-note scale built whole, half, whole, whole, half, whole, whole. It sounds darker than major.'),
  T('pentatonic', 'pentatonic scale', 'A five-note scale. The minor pentatonic is the first scale most guitarists solo with.'),
  T('degree', 'scale degree', 'The place of a note in a scale, counted from the first note: 1, 2, 3 and so on.'),
  T('tonic', 'tonic', 'The first note of a scale and the home note of a key.'),
  T('root', 'root', 'The note a chord or scale is built on and named after.'),
  T('key', 'key', 'The scale a piece of music is built from, named after its home note.'),
  T('key-signature', 'key signature', 'The sharps or flats written at the start of each staff line, which apply to the whole piece.'),
  T('relative-minor', 'relative minor', 'The minor key that uses the same notes as a major key. It starts on the sixth note of the major scale.'),
  T('circle-of-fifths', 'circle of fifths', 'The twelve keys arranged so that each step clockwise adds one sharp (or removes one flat).'),
  T('mode', 'mode', 'A scale made by starting a parent scale from a different one of its notes.'),
  // Chords and harmony
  T('chord', 'chord', 'Several notes sounded together, usually three or more.'),
  T('triad', 'triad', 'A three-note chord: a root, a third and a fifth.'),
  T('major-chord', 'major chord', 'A triad with a major third and a perfect fifth above the root. It sounds bright.'),
  T('minor-chord', 'minor chord', 'A triad with a minor third and a perfect fifth above the root. It sounds darker.'),
  T('seventh-chord', 'seventh chord', 'A triad with one more note added a seventh above the root.'),
  T('power-chord', 'power chord', 'A chord of just the root and fifth (often with the root doubled), with no third.'),
  T('arpeggio', 'arpeggio', 'The notes of a chord played one after another instead of together.'),
  T('voicing', 'voicing', 'One particular way of arranging the notes of a chord on the neck.'),
  T('inversion', 'inversion', 'A chord played with a note other than its root at the bottom.'),
  T('progression', 'chord progression', 'A series of chords played in order.'),
  T('roman-numerals', 'roman numerals', 'A way to name chords by the scale degree they are built on, so a progression works in any key.'),
  T('diatonic', 'diatonic', 'Belonging to the key: using only the notes of its scale.'),
  T('cadence', 'cadence', 'The two chords that end a musical phrase, like punctuation at the end of a sentence.'),
  T('dominant', 'dominant', 'The fifth degree of a scale and the chord built on it, which pulls back toward home.'),
  T('subdominant', 'subdominant', 'The fourth degree of a scale and the chord built on it.'),
  T('harmony', 'harmony', 'Notes sounding together, and the way chords follow one another.'),
  T('melody', 'melody', 'A line of single notes: the part you would sing.'),
  // Rhythm
  T('rhythm', 'rhythm', 'The pattern of long and short sounds in time.'),
  T('beat', 'beat', 'The steady pulse you tap your foot to.'),
  T('tempo', 'tempo', 'The speed of the beat, measured in beats per minute.'),
  T('bpm', 'BPM', 'Beats per minute: 60 BPM is one beat every second.'),
  T('bar', 'bar', 'A group of beats between two bar lines. Also called a measure.'),
  T('time-signature', 'time signature', 'Two numbers at the start of the music: how many beats are in a bar, and which note value gets one beat.'),
  T('note-value', 'note value', 'How long a note lasts, such as a whole, half, quarter or eighth note.'),
  T('whole-note', 'whole note', 'A note that lasts four beats in 4/4 time.'),
  T('half-note', 'half note', 'A note that lasts two beats in 4/4 time.'),
  T('quarter-note', 'quarter note', 'A note that lasts one beat in 4/4 time.'),
  T('eighth-note', 'eighth note', 'A note that lasts half a beat in 4/4 time. Two fill one beat.'),
  T('sixteenth-note', 'sixteenth note', 'A note that lasts a quarter of a beat in 4/4 time. Four fill one beat.'),
  T('rest', 'rest', 'A measured silence. Every note value has a rest of the same length.'),
  T('dotted-note', 'dotted note', 'A note with a dot after it lasts half as long again.'),
  T('tie', 'tie', 'A curved line joining two notes of the same pitch into one longer note.'),
  T('triplet', 'triplet', 'Three notes played evenly in the time of two.'),
  T('downbeat', 'downbeat', 'The first beat of a bar.'),
  T('offbeat', 'offbeat', 'The halfway point between two beats: the "and" when you count "1 and 2 and".'),
  T('syncopation', 'syncopation', 'Accents that fall between the beats instead of on them.'),
  T('metronome', 'metronome', 'A device or app that clicks a steady beat at the tempo you choose.'),
  // Reading
  T('tab', 'tab', 'Tablature: six lines for the six strings, with numbers telling you which fret to play.'),
  T('staff', 'staff', 'The five lines that notes are written on. Higher on the staff means higher in pitch.'),
  T('treble-clef', 'treble clef', 'The sign at the start of the staff used for guitar music. It curls around the G line.'),
  T('ledger-line', 'ledger line', 'A short extra line for a note above or below the staff.'),
];

const BUILT_IN = new Map(GLOSSARY.map((term) => [term.id, term]));

/** A built-in term by id, or null. */
export function glossaryTerm(id: string): GlossaryTerm | null {
  return BUILT_IN.get(id) ?? null;
}

/** Looks a term up by id; text parsing takes one of these. */
export type GlossaryLookup = (id: string) => GlossaryTerm | null;

/** The lookup for a course: its own terms first, then the built-in ones. */
export function glossaryFor(course?: Pick<Course, 'glossary'> | null): GlossaryLookup {
  const own = new Map((course?.glossary ?? []).map((term) => [term.id, term]));
  return (id) => own.get(id) ?? BUILT_IN.get(id) ?? null;
}

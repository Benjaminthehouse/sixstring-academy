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
];

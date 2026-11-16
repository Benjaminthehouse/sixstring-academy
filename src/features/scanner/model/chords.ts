/**
 * Chord names as OCR returns them: the characters to expect (so a lone "C" is not read as "("),
 * and a clean-up that keeps only real chord symbols.
 */
import { isChordWord } from '@/core/song';

/** Every character a chord name uses. */
export const CHORD_CHARS = 'ABCDEFGHmajdinsuMb#/()+-0123456789';

/**
 * Normalise what OCR made of a chord symbol ("Am7", "F♯m" -> "F#m"); null when it is not one. Two
 * slips OCR makes on a lone chord name in a photo are undone when what is left is a chord: a speck
 * or the edge of a stem read before it ("dD", "o.D" -> "D", at most two characters, never a
 * capital), and its root read twice ("Dd" -> "D").
 */
export function cleanChordText(raw: string): string | null {
  const t = raw.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/[“”"'`’|]/g, '').replace(/\s+/g, '').trim();
  if (!t) return null;
  const fixed = t.replace(/^([A-G])(?:0|O)$/, '$1o').replace(/^8b/, 'Bb');
  const word = fixed.replace(/^[(\[]|[)\]]$/g, '');
  if (isChordWord(word)) return word;
  const lead = /^[^A-Z]{1,2}([A-G].*)$/.exec(word);
  if (lead && isChordWord(lead[1])) return lead[1];
  const twice = /^([A-G])([a-g])$/.exec(word);
  if (twice && twice[2] === twice[1].toLowerCase()) return twice[1];
  return null;
}

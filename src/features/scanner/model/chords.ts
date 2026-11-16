/**
 * Chord names as OCR returns them: the characters to expect (so a lone "C" is not read as "("),
 * and a clean-up that keeps only real chord symbols.
 */
import { isChordWord } from '@/core/song';

/** Every character a chord name uses. */
export const CHORD_CHARS = 'ABCDEFGHmajdinsuMb#/()+-0123456789';

/** Normalise what OCR made of a chord symbol ("Am7", "F♯m" -> "F#m"); null when it is not one. */
export function cleanChordText(raw: string): string | null {
  const t = raw.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/[“”"'`’|]/g, '').replace(/\s+/g, '').trim();
  if (!t) return null;
  const fixed = t.replace(/^([A-G])(?:0|O)$/, '$1o').replace(/^8b/, 'Bb');
  const word = fixed.replace(/^[(\[]|[)\]]$/g, '');
  return isChordWord(word) ? word : null;
}

/**
 * The chord shapes a song uses, for the diagrams in its details: the shape written in the song
 * when it gives one, else the easiest common shape, both as the learner plays them behind a capo.
 */
import { beginnerVoicing, chordVoicings } from '@/core/guitar';
import { capoShape, type Song } from '@/core/song';

/** One chord to draw: the name of the shape played, and its frets low to high (null = not played). */
export interface ChordShape {
  /** The symbol that sounds (as stored in the song). */
  sounding: string;
  /** The name of the shape the hand makes (differs with a capo). */
  shape: string;
  frets: Array<number | null>;
}

/** Distinct chords of a song in order of appearance, with a playable shape each (at most `max`). */
export function songChordShapes(song: Song, max = 8): ChordShape[] {
  const out: ChordShape[] = [];
  const seen = new Set<string>();
  for (const c of song.chords) {
    if (out.length >= max) break;
    if (seen.has(c.symbol) || /^n\.?c\.?$/i.test(c.symbol)) continue;
    seen.add(c.symbol);
    const shape = capoShape(c.symbol, song.capo);
    let frets: Array<number | null> | null = c.voicing ? [...c.voicing] : null;
    if (!frets) {
      try {
        const v = beginnerVoicing(c.symbol, { tuning: song.tuning, capo: song.capo }) ?? chordVoicings(shape, { tuning: song.tuning })[0] ?? null;
        frets = v ? [...v.frets] : null;
      } catch {
        frets = null;
      }
    }
    if (frets && frets.length === song.tuning.length) out.push({ sounding: c.symbol, shape, frets });
  }
  return out;
}

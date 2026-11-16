/**
 * The song as the learner plays it: moved to their capo and transposed for their voice.
 *
 *  capo        "My capo is on fret 2": the shapes stay as written and everything sounds two
 *              semitones higher, so the app plays along in the key the capo gives (a G shape
 *              sounds A). Parts with their own tuning or capo (a bass) are moved with it.
 *  transpose   "Two semitones lower suits my voice": every part moves; the tab and the chord
 *              shapes change to match (frets shifted when the whole part stays on the neck, else
 *              re-arranged by the song core).
 *
 * The sounding key is the written key moved by both. Pure: unit-tested.
 */
import { cloneSong, retuneSong, transposeKey, transposeSong, type Song } from '@/core/song';
import { formatKey, parseKey } from '@/core/theory';
import { clampCapo, clampTranspose, type Arrangement } from './types';

/** The arranged song and what changed. */
export interface Arranged {
  song: Song;
  /** Semitones the music sounds above the written song (capo change + transposition). */
  sounding: number;
  /** The capo the learner plays with. */
  capo: number;
  /** Notes from the arranger ("The part was moved 1 octave up to fit the guitar."). */
  warnings: string[];
}

/** No change: the song as written. */
export const AS_WRITTEN: Arrangement = { transpose: 0, capo: null };

/** True when an arrangement changes nothing for this song. */
export function isAsWritten(song: Pick<Song, 'capo'>, a: Arrangement): boolean {
  const capo = clampCapo(a.capo);
  return clampTranspose(a.transpose) === 0 && (capo === null || capo === song.capo);
}

/** Move a song to the learner's capo and transposition (a new song; the input is never changed). */
export function arrangeForPlayer(song: Song, a: Arrangement): Arranged {
  const t = clampTranspose(a.transpose);
  const capo = clampCapo(a.capo) ?? song.capo;
  const c = capo - song.capo;
  if (!t && !c) return { song, sounding: 0, capo, warnings: [] };
  const warnings: string[] = [];
  let out = song;
  if (c) {
    // The shapes stay; the guitar parts on the song's tuning sound c semitones higher.
    const shaped = retuneSong(song, { capo, keep: 'shapes' });
    out = shaped.song;
    warnings.push(...shaped.warnings);
    // A part with its own tuning or capo (a bass) does not follow the guitar's capo: move it too.
    const own = song.tracks.map((tr, i) => (tr.tuning || tr.capo !== undefined ? i : -1)).filter((i) => i >= 0);
    if (own.length) {
      const moved = transposeSong(song, c).song;
      out = cloneSong(out);
      for (const i of own) out.tracks[i] = moved.tracks[i];
    }
  }
  if (t) {
    const r = transposeSong(out, t);
    out = r.song;
    warnings.push(...r.warnings);
  }
  return { song: out, sounding: c + t, capo, warnings: [...new Set(warnings)] };
}

/** A key name for reading: `F#m` -> `F♯ minor`, `A dorian` -> `A Dorian`. Unknown text is returned as it is. */
export function keyName(key: string | null | undefined): string | null {
  if (!key || !key.trim()) return null;
  try {
    const k = parseKey(key.trim());
    return k ? formatKey(k) : key.trim();
  } catch {
    return key.trim();
  }
}

/** What the "Key and capo" panel says about an arrangement. */
export interface ArrangementWords {
  /** The key the music sounds in ("A major"), or null when the song names none. */
  sounds: string | null;
  /** The key of the shapes played ("G major"): the sounding key less the capo. */
  shapes: string | null;
  /** One sentence: "Sounds in A major. You play G major shapes with a capo on fret 2." */
  line: string;
  /** Semitones from the written song, signed ("+2"), or "" when it sounds as written. */
  shift: string;
}

/** Describe an arrangement of a song for the panel and the header. */
export function arrangementWords(song: Pick<Song, 'key' | 'capo'>, a: Arrangement): ArrangementWords {
  const t = clampTranspose(a.transpose);
  const capo = clampCapo(a.capo) ?? song.capo;
  const sounding = capo - song.capo + t;
  const written = song.key ?? null;
  const soundingKey = written ? transposeKey(written, sounding) : null;
  const shapesKey = soundingKey && capo ? transposeKey(soundingKey, -capo) : soundingKey;
  const sounds = keyName(soundingKey);
  const shapes = keyName(shapesKey);
  const shift = sounding ? `${sounding > 0 ? '+' : '−'}${Math.abs(sounding)}` : '';
  const capoWords = capo ? ` with a capo on fret ${capo}` : ' with no capo';
  let line: string;
  if (sounds && shapes) line = capo ? `Sounds in ${sounds}. You play ${shapes} shapes${capoWords}.` : `Sounds in ${sounds}, no capo.`;
  else line = sounding ? `Sounds ${Math.abs(sounding)} ${Math.abs(sounding) === 1 ? 'semitone' : 'semitones'} ${sounding > 0 ? 'higher' : 'lower'} than written${capo ? `, capo on fret ${capo}` : ''}.` : capo ? `Capo on fret ${capo}.` : 'As written, no capo.';
  return { sounds, shapes, line, shift };
}

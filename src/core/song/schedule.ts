/**
 * The playback schedule, as pure data: every pluck and strum of a song's timeline with its tick,
 * length, velocity, articulation and techniques. Tied notes are joined into one sounding note,
 * slashes are strummed with the chord in force (its chosen voicing, or the guitar engine's first
 * voicing), harmonics sound at their pitch. Techniques are handed to the guitar voice, which plays
 * them for real: a bend is a pitch curve to its target (and back for a release), a slide glides
 * between frets, a hammer-on or pull-off carries the string on without a new pick stroke, vibrato,
 * slides in and out, let ring. Accents (`note.accent`, `beat.accent`) and the place a stroke falls
 * in the beat decide how hard it is played.
 */
import { chordVoicings } from '@/core/guitar';
import { isNoChord } from '@/core/theory';
import { soundingPitch, trackCapo, trackTuning } from './model';
import type { SongTimeline } from './timeline';
import type { Beat, Note } from './types';
import { PPQ } from './types';

/** How a note is played (the audio engine's articulations). */
export type PlayArticulation = 'normal' | 'palm-mute' | 'dead' | 'harmonic';

/** One plucked note. */
export interface PlayNote {
  kind: 'note';
  tick: number;
  /** Length in ticks (ties joined; staccato halved). */
  ticks: number;
  track: string;
  instrument: 'guitar' | 'bass';
  /** Sounding pitch as struck (a harmonic at its pitch; a bend is in `bend`, not here). */
  midi: number;
  string: number;
  velocity: number;
  articulation: PlayArticulation;
  letRing: boolean;
  /** Detune in cents. */
  cents?: number;
  /** Reached from the previous note on its string without a new pick stroke. */
  legato?: 'hammer' | 'pull' | 'slide';
  /** A bend in semitones; `release` comes back down within the note, `pre` is bent before it is struck. */
  bend?: { amount: number; release?: boolean; pre?: boolean };
  vibrato?: boolean;
  slideIn?: 'below' | 'above';
  slideOut?: 'down' | 'up';
  /** An accented note (played harder and brighter). */
  accent?: boolean;
}

/** One strum. */
export interface PlayStrum {
  kind: 'strum';
  tick: number;
  ticks: number;
  track: string;
  instrument: 'guitar' | 'bass';
  /** Pitches low to high, with their strings. */
  midis: number[];
  strings: number[];
  direction: 'down' | 'up';
  /** How hard the stroke is (accents and the place in the beat included). */
  velocity: number;
  /** A muted "chk" strum. */
  muted: boolean;
  /** The chord symbol strummed (for display). */
  symbol: string | null;
  /** An accented stroke. */
  accent?: boolean;
  /** Every note of the chord rings on (let ring). */
  letRing?: boolean;
}

/** Anything the player sounds. */
export type PlayEvent = PlayNote | PlayStrum;

/** Options for `buildPlayEvents`. */
export interface ScheduleOptions {
  /** Shape for a chord symbol (frets low to high); default the guitar engine's first voicing. */
  voicing?: (symbol: string, tuning: number[], capo: number) => Array<number | null> | null;
}

const voicingCache = new Map<string, Array<number | null> | null>();

/** The guitar engine's first voicing of a chord in a tuning and capo (cached), or null when there is none. */
export function defaultVoicing(symbol: string, tuning: number[], capo: number): Array<number | null> | null {
  const key = `${symbol}|${tuning.join(',')}|${capo}`;
  if (voicingCache.has(key)) return voicingCache.get(key)!;
  let frets: Array<number | null> | null = null;
  try {
    const v = chordVoicings(symbol, { tuning: [...tuning], capo })[0];
    frets = v ? [...v.frets] : null;
  } catch {
    frets = null;
  }
  voicingCache.set(key, frets);
  return frets;
}

function velocityOf(n: Note, beatAccent: boolean): number {
  let v = 0.78;
  if (n.ghost) v = 0.35;
  if (n.legato || n.slide) v *= 0.72;
  if (n.accent || beatAccent) v = Math.min(1, v * 1.25);
  return Math.round(v * 100) / 100;
}

/**
 * How hard a strum is: a down-stroke on the beat is the strongest, one between the beats a little
 * lighter, an up-stroke lighter still (the hand's natural swing); an accent lifts any of them.
 */
export function strumVelocity(direction: 'down' | 'up', tickInBar: number, accent: boolean): number {
  const onBeat = Math.abs(tickInBar % PPQ) < 1e-6;
  const base = direction === 'down' ? (onBeat ? 0.8 : 0.72) : 0.62;
  return accent ? Math.min(1, Math.round(base * 1.3 * 100) / 100) : base;
}

function articulationOf(n: Note): PlayArticulation {
  if (n.dead) return 'dead';
  if (n.harmonic) return 'harmonic';
  if (n.palmMute) return 'palm-mute';
  return 'normal';
}

type Techniques = Pick<PlayNote, 'legato' | 'bend' | 'vibrato' | 'slideIn' | 'slideOut' | 'accent'>;

/** The techniques of a note as the guitar voice takes them. */
function techniquesOf(n: Note): Techniques {
  const t: Techniques = {};
  if (n.legato) t.legato = n.legato;
  else if (n.slide) t.legato = 'slide';
  if (n.bend && !n.dead && Number.isFinite(n.bend.amount) && n.bend.amount !== 0) {
    t.bend = { amount: n.bend.amount, ...(n.bend.release ? { release: true } : {}), ...(n.bend.pre ? { pre: true } : {}) };
  }
  if (n.vibrato) t.vibrato = true;
  if (n.slideIn) t.slideIn = n.slideIn;
  if (n.slideOut) t.slideOut = n.slideOut;
  if (n.accent) t.accent = true;
  return t;
}

/** The accent of a whole beat (`beat.accent`). */
function beatAccent(beat: Beat): boolean {
  return beat.accent === true;
}

/** Every pluck and strum of a timeline, in time order. */
export function buildPlayEvents(timeline: SongTimeline, opts: ScheduleOptions = {}): PlayEvent[] {
  const song = timeline.song;
  const voicing = opts.voicing ?? defaultVoicing;
  const out: PlayEvent[] = [];
  for (const track of song.tracks) {
    const beats = timeline.trackBeats(track.id);
    if (!beats.length) continue;
    const tuning = trackTuning(song, track);
    const capo = trackCapo(song, track);
    const instrument = track.role === 'bass' ? 'bass' : 'guitar';
    /** The note sounding on each string, so ties can lengthen it and legato can carry on from it. */
    const ringing = new Map<number, PlayNote>();
    for (const b of beats) {
      const src = b.source;
      const accent = beatAccent(src);
      if (src.slash) {
        const chord = timeline.chordAt(b.tick);
        const symbol = chord && !isNoChord(chord.symbol) ? chord.symbol : null;
        const frets = symbol ? chord!.voicing ?? voicing(symbol, tuning, capo) : null;
        const shape = frets ?? (src.mutedStrum ? tuning.map(() => 0) : null);
        if (shape) {
          const midis: number[] = [];
          const strings: number[] = [];
          shape.forEach((f, i) => {
            if (f === null) return;
            midis.push(tuning[i] + capo + f);
            strings.push(tuning.length - i);
          });
          if (midis.length) {
            const direction = src.stroke ?? 'down';
            out.push({
              kind: 'strum', tick: b.tick, ticks: b.duration, track: track.id, instrument, midis, strings, direction,
              velocity: strumVelocity(direction, src.start, accent), muted: !!src.mutedStrum, symbol, ...(accent ? { accent: true } : {}),
            });
          }
        }
        ringing.clear();
        continue;
      }
      if (!src.notes.length) {
        // A rest damps what was ringing (unless it was let ring).
        ringing.clear();
        continue;
      }
      const struck = src.notes.filter((n) => !n.tie);
      for (const n of src.notes.filter((x) => x.tie)) {
        const prev = ringing.get(n.string);
        if (prev) prev.ticks += n.length ?? b.duration;
      }
      if (struck.length >= 3 && src.stroke) {
        const sorted = [...struck].sort((a, c) => a.midi - c.midi);
        const strong = accent || sorted.some((n) => n.accent);
        out.push({
          kind: 'strum', tick: b.tick, ticks: b.duration, track: track.id, instrument, midis: sorted.map((n) => soundingPitch(n) ?? n.midi), strings: sorted.map((n) => n.string),
          direction: src.stroke, velocity: strumVelocity(src.stroke, src.start, strong), muted: sorted.every((n) => n.dead), symbol: null,
          ...(strong ? { accent: true } : {}), ...(sorted.every((n) => n.letRing) ? { letRing: true } : {}),
        });
        for (const n of struck) ringing.delete(n.string);
        continue;
      }
      for (const n of struck) {
        const ticks = Math.max(1, (n.length ?? b.duration) * (n.staccato ? 0.5 : 1));
        // The unbent pitch (a harmonic at its sounding pitch): the guitar voice plays the bend itself.
        const pitch = soundingPitch({ ...n, bend: undefined }) ?? n.midi;
        const e: PlayNote = {
          kind: 'note', tick: b.tick, ticks, track: track.id, instrument, midi: pitch, string: n.string,
          velocity: velocityOf(n, accent), articulation: articulationOf(n), letRing: !!n.letRing, ...techniquesOf(n),
        };
        if (accent) e.accent = true;
        out.push(e);
        ringing.set(n.string, e);
      }
    }
  }
  return out.sort((a, b) => a.tick - b.tick || a.track.localeCompare(b.track));
}

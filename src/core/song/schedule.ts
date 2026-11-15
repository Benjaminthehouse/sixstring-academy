/**
 * The playback schedule, as pure data: every pluck and strum of a song's timeline with its tick,
 * length, velocity and articulation. Tied notes are joined into one sounding note, slashes are
 * strummed with the chord in force (its chosen voicing, or the guitar engine's first voicing),
 * hammer-ons and slides sound softer, harmonics at their sounding pitch. The synth has no pitch
 * glide, so a bend is approximated by soft steps to the bent pitch (and back for a release).
 */
import { chordVoicings } from '@/core/guitar';
import { isNoChord } from '@/core/theory';
import { soundingPitch, trackCapo, trackTuning } from './model';
import type { SongTimeline } from './timeline';
import type { Note } from './types';

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
  midi: number;
  string: number;
  velocity: number;
  articulation: PlayArticulation;
  letRing: boolean;
  /** Detune in cents (a pre-bend). */
  cents?: number;
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
  velocity: number;
  /** A muted "chk" strum. */
  muted: boolean;
  /** The chord symbol strummed (for display). */
  symbol: string | null;
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

function velocityOf(n: Note): number {
  let v = 0.78;
  if (n.ghost) v = 0.35;
  if (n.legato || n.slide) v *= 0.72;
  if (n.accent) v = Math.min(1, v * 1.25);
  return Math.round(v * 100) / 100;
}

function articulationOf(n: Note): PlayArticulation {
  if (n.dead) return 'dead';
  if (n.harmonic) return 'harmonic';
  if (n.palmMute) return 'palm-mute';
  return 'normal';
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
    /** The note sounding on each string, so ties can lengthen it. */
    const ringing = new Map<number, PlayNote>();
    for (const b of beats) {
      const src = b.source;
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
            out.push({ kind: 'strum', tick: b.tick, ticks: b.duration, track: track.id, instrument, midis, strings, direction, velocity: direction === 'down' ? 0.8 : 0.62, muted: !!src.mutedStrum, symbol });
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
        out.push({
          kind: 'strum', tick: b.tick, ticks: b.duration, track: track.id, instrument, midis: sorted.map((n) => soundingPitch(n) ?? n.midi), strings: sorted.map((n) => n.string),
          direction: src.stroke, velocity: src.stroke === 'down' ? 0.8 : 0.62, muted: sorted.every((n) => n.dead), symbol: null,
        });
        for (const n of struck) ringing.delete(n.string);
        continue;
      }
      for (const n of struck) {
        const ticks = Math.max(1, (n.length ?? b.duration) * (n.staccato ? 0.5 : 1));
        // The unbent pitch (a harmonic at its sounding pitch); a bend is added on top of it, once.
        const pitch = soundingPitch({ ...n, bend: undefined }) ?? n.midi;
        const e: PlayNote = {
          kind: 'note', tick: b.tick, ticks, track: track.id, instrument, midi: pitch, string: n.string,
          velocity: velocityOf(n), articulation: articulationOf(n), letRing: !!n.letRing,
        };
        if (n.bend?.pre) e.cents = Math.round(n.bend.amount * 100);
        out.push(e);
        ringing.set(n.string, e);
        if (n.bend && !n.dead) {
          // Soft steps standing in for the bend (and its release): the synth cannot glide.
          const step = Math.max(1, Math.floor(ticks / 3));
          if (!n.bend.pre) out.push({ ...e, tick: b.tick + step, ticks: ticks - step, midi: e.midi + Math.round(n.bend.amount), velocity: 0.42, cents: Math.round((n.bend.amount - Math.round(n.bend.amount)) * 100) || undefined });
          if (n.bend.release) out.push({ ...e, tick: b.tick + 2 * step, ticks: ticks - 2 * step, midi: e.midi, velocity: 0.38, cents: undefined });
        }
      }
    }
  }
  for (const e of out) if (e.kind === 'note' && e.cents === undefined) delete e.cents;
  return out.sort((a, b) => a.tick - b.tick || a.track.localeCompare(b.track));
}

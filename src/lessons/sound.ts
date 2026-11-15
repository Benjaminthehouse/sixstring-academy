/**
 * Sounds as data. A lesson says WHAT should be heard (`{ kind: 'interval', from: 'C3', interval: 'M3' }`);
 * `soundPlan` turns it into plain timed events (plucks, strums, clicks) that a screen schedules
 * with `pluck` / `strum` / `playClick` from `@/core/audio`. Nothing here touches Web Audio, so
 * every sound in the course can be validated and tested in Node.
 */
import { chordVoicings, midiAt, tryBuildVoicing, tuning as resolveTuning } from '@/core/guitar';
import { chordMidi, getScale, interval, parseChord, parseInterval, parseNote, scaleMidi } from '@/core/theory';
import { TEMPO_LIMITS } from './limits';
import { parseDuration, parseRhythm, parseStrum, tickSeconds } from './rhythm';
import type { FretsInput, Sound, TabNote } from './types';

/** One thing to schedule. Times are seconds from the start of the sound. */
export interface SoundEvent {
  at: number;
  /** `pluck`: the notes in `midi` together. `strum`: `midi` low to high across the strings. `click`: a metronome-style tick. */
  type: 'pluck' | 'strum' | 'click';
  /** Sounding MIDI notes (empty for a click). */
  midi: number[];
  /** Seconds the sound should ring. */
  duration: number;
  /** Strum direction. */
  direction?: 'down' | 'up';
  /** A muted, percussive strum. */
  muted?: boolean;
  /** A click on the first beat of a bar. */
  accent?: boolean;
  /** The string a plucked note is played on, when known (tab). */
  string?: number;
}

/** A sound resolved to events. */
export interface SoundPlan {
  events: SoundEvent[];
  /** Total length in seconds, including the ring-out of the last event. */
  duration: number;
  /** Beats per minute the plan was laid out at. */
  tempo: number;
}

const DEFAULT_TEMPO: Record<Sound['kind'], number> = {
  notes: 90,
  interval: 75,
  chord: 80,
  scale: 132,
  strum: 80,
  progression: 80,
  rhythm: 80,
  tab: 80,
};

function tuningOrNull(input: string | undefined): ReturnType<typeof resolveTuning> | null {
  try {
    return resolveTuning(input);
  } catch {
    return null;
  }
}

/** MIDI notes of a chord, low to high: a given shape, the first guitar voicing, or close position. */
export function chordSoundMidi(symbol: string, opts: { frets?: FretsInput; voicing?: 'guitar' | 'close'; octave?: number; tuning?: string; capo?: number } = {}): number[] | null {
  const chord = parseChord(symbol);
  if (!chord) return null;
  try {
    if (opts.frets !== undefined) {
      return tryBuildVoicing(chord, opts.frets, { tuning: opts.tuning, capo: opts.capo })?.midi ?? null;
    }
    if (opts.voicing !== 'close') {
      const voicing = chordVoicings(chord.symbol, { tuning: opts.tuning, capo: opts.capo })[0];
      if (voicing) return [...voicing.midi];
    }
    return chordMidi(chord, { octave: opts.octave ?? 3 });
  } catch {
    return null;
  }
}

function tempoProblem(tempo: number | undefined): string[] {
  if (tempo === undefined) return [];
  return Number.isFinite(tempo) && tempo >= TEMPO_LIMITS[0] && tempo <= TEMPO_LIMITS[1]
    ? []
    : [`Tempo ${tempo} is outside ${TEMPO_LIMITS[0]}–${TEMPO_LIMITS[1]} beats per minute. Choose a tempo in that range.`];
}

function noteWithOctave(name: string, what: string): string[] {
  const n = parseNote(name);
  if (!n) return [`"${name}" is not a note. Write ${what} like E2, F#3 or Bb3.`];
  if (n.midi === null) return [`"${name}" has no octave. A sound needs an exact pitch: write ${what} with its octave (E2 is the low E string, E4 the high one).`];
  if (n.midi < 28 || n.midi > 96) return [`"${name}" is outside the range that can be played (E1 to C7). Choose an octave between 1 and 6.`];
  return [];
}

/** Problems of a tab phrase: positions that do not exist and durations that do not parse. */
export function tabProblems(notes: readonly TabNote[], opts: { tuning?: string; capo?: number } = {}): string[] {
  const problems: string[] = [];
  const t = tuningOrNull(opts.tuning);
  if (!t) return [`"${opts.tuning}" is not a tuning the guitar engine knows. Use an id such as standard or drop-d.`];
  const maxFret = 22 - (opts.capo ?? 0);
  if (notes.length === 0) problems.push('The phrase has no notes. Add at least one { string, fret, duration }.');
  notes.forEach((n, index) => {
    if (!parseDuration(n.duration) || parseDuration(n.duration)!.tied) {
      problems.push(`Note ${index + 1} has the duration "${n.duration}", which is not a duration code. Use w h q e s, optionally with "." or "t".`);
    }
    if ('rest' in n) return;
    if (!Number.isInteger(n.string) || n.string < 1 || n.string > t.stringCount) {
      problems.push(`Note ${index + 1} is on string ${n.string}, but ${t.name} tuning has strings 1 to ${t.stringCount}. String 1 is the thinnest.`);
    } else if (!Number.isInteger(n.fret) || n.fret < 0 || n.fret > maxFret) {
      problems.push(`Note ${index + 1} is at fret ${n.fret}, which is not on the neck (0 to ${maxFret}). Fret 0 is the open string.`);
    }
  });
  return problems;
}

/** Everything that is wrong with a sound (empty when it can be played). Each entry says how to fix it. */
export function soundProblems(sound: Sound): string[] {
  switch (sound.kind) {
    case 'notes': {
      const problems = sound.notes.flatMap((n) => noteWithOctave(n, 'each note'));
      if (sound.notes.length === 0) problems.push('The sound has no notes. List at least one note with its octave.');
      return [...problems, ...tempoProblem(sound.tempo)];
    }
    case 'interval': {
      const problems = noteWithOctave(sound.from, 'the starting note');
      if (!parseInterval(sound.interval)) problems.push(`"${sound.interval}" is not an interval. Write it like m3, P5 or M7.`);
      return problems;
    }
    case 'chord': {
      if (!parseChord(sound.chord)) return [`"${sound.chord}" is not a chord symbol. Write it like Am, G7 or Cmaj7.`];
      if (sound.frets !== undefined && !chordSoundMidi(sound.chord, { frets: sound.frets })) {
        return [`The shape ${JSON.stringify(sound.frets)} is not a voicing of ${sound.chord}. Check each fret, or leave "frets" out to use the library shape.`];
      }
      return [];
    }
    case 'scale': {
      const problems = noteWithOctave(sound.tonic, 'the tonic');
      if (!getScale(sound.scale)) problems.push(`"${sound.scale}" is not a scale id. Use an id from the theory engine such as major, minor or minor-pentatonic.`);
      return [...problems, ...tempoProblem(sound.tempo)];
    }
    case 'strum': {
      const problems = parseChord(sound.chord) ? [] : [`"${sound.chord}" is not a chord symbol. Write it like Am, G7 or Cmaj7.`];
      problems.push(...parseStrum(sound.pattern, sound.grid).problems, ...tempoProblem(sound.tempo));
      if (!parseStrum(sound.pattern, sound.grid).slots.some((s) => s.stroke)) problems.push('The strumming pattern has no strums. Use D or U in at least one slot.');
      return problems;
    }
    case 'progression': {
      const problems = sound.chords.filter((c) => !parseChord(c)).map((c) => `"${c}" is not a chord symbol. Write it like Am, G7 or Cmaj7.`);
      if (sound.chords.length < 2) problems.push('A progression needs at least two chords.');
      return [...problems, ...tempoProblem(sound.tempo)];
    }
    case 'rhythm': {
      const parsed = parseRhythm(sound);
      const problems = [...parsed.problems, ...tempoProblem(sound.tempo)];
      if (parsed.problems.length === 0 && parsed.onsets.length === 0) problems.push('The rhythm has only rests. Add at least one note.');
      return problems;
    }
    case 'tab':
      return [...tabProblems(sound.notes, sound), ...tempoProblem(sound.tempo)];
    default:
      return [`"${String((sound as { kind?: unknown }).kind)}" is not a sound kind. Use notes, interval, chord, scale, strum, progression, rhythm or tab.`];
  }
}

const EMPTY: SoundPlan = { events: [], duration: 0, tempo: 0 };

/**
 * Lay a sound out as timed events. Never throws: a sound with problems gives an empty plan (run
 * `soundProblems` at authoring time; `validateCourse` does).
 */
export function soundPlan(sound: Sound): SoundPlan {
  if (soundProblems(sound).length > 0) return EMPTY;
  const tempo = ('tempo' in sound ? sound.tempo : undefined) ?? DEFAULT_TEMPO[sound.kind];
  const beat = 60 / tempo;
  const events: SoundEvent[] = [];
  const ring = 1.6;

  switch (sound.kind) {
    case 'notes': {
      const midi = sound.notes.map((n) => parseNote(n)!.midi!);
      if (sound.together) events.push({ at: 0, type: 'pluck', midi, duration: ring });
      else midi.forEach((m, i) => events.push({ at: i * beat, type: 'pluck', midi: [m], duration: i === midi.length - 1 ? ring : beat }));
      break;
    }
    case 'interval': {
      const from = parseNote(sound.from)!.midi!;
      const size = Math.abs(interval(sound.interval).semitones);
      const low = from;
      const high = from + size;
      if (sound.play === 'together') {
        events.push({ at: 0, type: 'pluck', midi: [low, high], duration: ring });
      } else {
        const [first, second] = sound.play === 'down' ? [high, low] : [low, high];
        events.push({ at: 0, type: 'pluck', midi: [first], duration: beat }, { at: beat, type: 'pluck', midi: [second], duration: ring });
      }
      break;
    }
    case 'chord': {
      const midi = chordSoundMidi(sound.chord, sound);
      if (!midi) return EMPTY;
      if (sound.style === 'arpeggio') {
        midi.forEach((m, i) => events.push({ at: i * (beat / 2), type: 'pluck', midi: [m], duration: ring + (midi.length - 1 - i) * (beat / 2) }));
      } else if (sound.style === 'block') {
        events.push({ at: 0, type: 'pluck', midi, duration: ring + 0.4 });
      } else {
        events.push({ at: 0, type: 'strum', midi, direction: 'down', duration: ring + 0.4 });
      }
      break;
    }
    case 'scale': {
      const up = scaleMidi(parseNote(sound.tonic)!.midi!, sound.scale, 1);
      const line = sound.direction === 'down' ? [...up].reverse() : sound.direction === 'up-down' ? [...up, ...[...up].reverse().slice(1)] : up;
      line.forEach((m, i) => events.push({ at: i * beat, type: 'pluck', midi: [m], duration: i === line.length - 1 ? ring : beat }));
      break;
    }
    case 'strum': {
      const midi = chordSoundMidi(sound.chord);
      if (!midi) return EMPTY;
      const parsed = parseStrum(sound.pattern, sound.grid);
      const repeat = Math.max(1, Math.min(8, Math.round(sound.repeat ?? 2)));
      for (let r = 0; r < repeat; r++) {
        for (const slot of parsed.slots) {
          if (!slot.stroke) continue;
          events.push({
            at: tickSeconds(r * parsed.totalTicks + slot.tick, tempo),
            type: 'strum',
            midi,
            direction: slot.stroke === 'up' ? 'up' : 'down',
            duration: tickSeconds(parsed.slotTicks, tempo) * 2,
            ...(slot.stroke === 'mute' ? { muted: true } : {}),
          });
        }
      }
      break;
    }
    case 'progression': {
      const beats = Math.max(1, Math.min(8, sound.beats ?? 2));
      for (let i = 0; i < sound.chords.length; i++) {
        const midi = chordSoundMidi(sound.chords[i], { voicing: sound.voicing });
        if (!midi) return EMPTY;
        const last = i === sound.chords.length - 1;
        events.push({ at: i * beats * beat, type: 'strum', midi, direction: 'down', duration: last ? beats * beat + 1.2 : beats * beat });
      }
      break;
    }
    case 'rhythm': {
      const parsed = parseRhythm(sound);
      for (const e of parsed.events) {
        if (!e.attack) continue;
        events.push({ at: tickSeconds(e.tick, tempo), type: 'click', midi: [], duration: 0.08, ...(e.tick % parsed.barTicks === 0 ? { accent: true } : {}) });
      }
      const total = tickSeconds(parsed.totalTicks, tempo);
      return { events, duration: total, tempo };
    }
    case 'tab': {
      let tick = 0;
      for (const n of sound.notes) {
        const d = parseDuration(n.duration)!;
        if (!('rest' in n)) {
          events.push({
            at: tickSeconds(tick, tempo),
            type: 'pluck',
            midi: [midiAt({ string: n.string, fret: n.fret }, { tuning: sound.tuning, capo: sound.capo })],
            duration: tickSeconds(d.ticks, tempo),
            string: n.string,
          });
        }
        tick += d.ticks;
      }
      break;
    }
  }
  const duration = events.reduce((end, e) => Math.max(end, e.at + e.duration), 0);
  return { events, duration, tempo };
}

/** A short description of a sound for screen readers and logs ("C3 then E3", "A minor chord"). */
export function describeSound(sound: Sound): string {
  switch (sound.kind) {
    case 'notes':
      return sound.together ? `${sound.notes.length} notes together` : `${sound.notes.length} notes`;
    case 'interval':
      return sound.play === 'together' ? 'two notes together' : 'two notes';
    case 'chord':
      return 'a chord';
    case 'scale':
      return 'a scale';
    case 'strum':
      return 'a strumming pattern';
    case 'progression':
      return `${sound.chords.length} chords`;
    case 'rhythm':
      return 'a rhythm';
    case 'tab':
      return 'a phrase';
  }
}

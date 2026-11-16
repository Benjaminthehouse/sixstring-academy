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
import type { FretsInput, Sound, SoundDrone, SoundOver, TabNote, TabTechnique } from './types';

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
  /** How a tab note is played: bend, vibrato, hammer-on/pull-off/slide from the note before, slide in or out. */
  technique?: TabTechnique;
}

/** A sound resolved to events. */
export interface SoundPlan {
  events: SoundEvent[];
  /** Total length in seconds, including the ring-out of the last event. */
  duration: number;
  /** Beats per minute the plan was laid out at. */
  tempo: number;
  /** A drone under the whole sound (sounding MIDI root; the engine folds it into a comfortable register). */
  drone?: { midi: number; fifth: boolean };
  /** A chord held under the whole sound while its notes play over it. */
  hold?: { midi: number[]; voice: 'guitar' | 'epiano' | 'organ' };
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

const TECHNIQUE_KEYS = ['bend', 'release', 'vibrato', 'legato', 'slideIn', 'slideOut'] as const;

/** True when a tab note carries any technique (bend, slide, hammer-on ...). */
export function hasTechnique(note: TabNote): boolean {
  if ('rest' in note) return false;
  return TECHNIQUE_KEYS.some((k) => (note as TabTechnique)[k] !== undefined);
}

/** Problems of one note's techniques, given the note sounding just before it (null after a rest or at the start). */
function techniqueProblems(n: { string: number; fret: number } & TabTechnique, prev: { string: number; fret: number } | null, index: number): string[] {
  const problems: string[] = [];
  const at = `Note ${index + 1}`;
  if (n.bend !== undefined && !(Number.isFinite(n.bend) && n.bend >= 0.5 && n.bend <= 3 && Number.isInteger(n.bend * 2))) {
    problems.push(`${at} bends by ${n.bend}. A bend is 0.5 to 3 semitones in halves: 2 is a full bend, 1 a half, 0.5 a quarter tone.`);
  }
  if (n.release !== undefined && n.bend === undefined) problems.push(`${at} has "release" without a bend. Add "bend" (how far it goes up first), or leave "release" out.`);
  if (n.legato !== undefined) {
    if (n.legato !== 'hammer' && n.legato !== 'pull' && n.legato !== 'slide') {
      problems.push(`${at} has the legato "${String(n.legato)}". Use hammer, pull or slide.`);
    } else if (!prev || prev.string !== n.string) {
      problems.push(`${at} is a ${n.legato === 'hammer' ? 'hammer-on' : n.legato === 'pull' ? 'pull-off' : 'slide'}, but the note just before it is not ringing on string ${n.string}. A legato note comes from the note right before it on the same string, with no rest between.`);
    } else if (n.legato === 'hammer' && !(n.fret > prev.fret)) {
      problems.push(`${at} hammers on from fret ${prev.fret} to fret ${n.fret}. A hammer-on goes to a higher fret; going down is a pull-off.`);
    } else if (n.legato === 'pull' && !(n.fret < prev.fret)) {
      problems.push(`${at} pulls off from fret ${prev.fret} to fret ${n.fret}. A pull-off goes to a lower fret; going up is a hammer-on.`);
    } else if (n.legato === 'slide' && (n.fret === prev.fret || n.fret === 0 || prev.fret === 0)) {
      problems.push(`${at} slides from fret ${prev.fret} to fret ${n.fret}. A slide moves a fretting finger between two different fretted notes (not to or from an open string).`);
    }
  }
  if (n.slideIn !== undefined) {
    if (n.slideIn !== 'below' && n.slideIn !== 'above') problems.push(`${at} slides in from "${String(n.slideIn)}". Use below or above.`);
    else if (n.fret === 0) problems.push(`${at} slides into an open string, which a finger cannot do. Slide into a fretted note.`);
    if (n.legato !== undefined) problems.push(`${at} has both "slideIn" and "legato". Pick one: slideIn starts from nowhere in particular, legato from the note before.`);
  }
  if (n.slideOut !== undefined) {
    if (n.slideOut !== 'down' && n.slideOut !== 'up') problems.push(`${at} slides out "${String(n.slideOut)}". Use down or up.`);
    else if (n.fret === 0) problems.push(`${at} slides off an open string, which a finger cannot do. Slide off a fretted note.`);
  }
  if (n.vibrato !== undefined && typeof n.vibrato !== 'boolean') problems.push(`${at} has the vibrato "${String(n.vibrato)}". Write vibrato: true.`);
  return problems;
}

/**
 * Problems of a tab phrase: positions that do not exist, durations that do not parse, and
 * techniques that cannot be played (a hammer-on from a different string, a bend of 7 semitones).
 * With `techniques: false` (play-phrase targets) any technique is a problem.
 */
export function tabProblems(notes: readonly TabNote[], opts: { tuning?: string; capo?: number; techniques?: boolean } = {}): string[] {
  const problems: string[] = [];
  const t = tuningOrNull(opts.tuning);
  if (!t) return [`"${opts.tuning}" is not a tuning the guitar engine knows. Use an id such as standard or drop-d.`];
  const maxFret = 22 - (opts.capo ?? 0);
  if (notes.length === 0) problems.push('The phrase has no notes. Add at least one { string, fret, duration }.');
  let prev: { string: number; fret: number } | null = null;
  notes.forEach((n, index) => {
    if (!parseDuration(n.duration) || parseDuration(n.duration)!.tied) {
      problems.push(`Note ${index + 1} has the duration "${n.duration}", which is not a duration code. Use w h q e s, optionally with "." or "t".`);
    }
    if ('rest' in n) {
      prev = null;
      return;
    }
    if (!Number.isInteger(n.string) || n.string < 1 || n.string > t.stringCount) {
      problems.push(`Note ${index + 1} is on string ${n.string}, but ${t.name} tuning has strings 1 to ${t.stringCount}. String 1 is the thinnest.`);
    } else if (!Number.isInteger(n.fret) || n.fret < 0 || n.fret > maxFret) {
      problems.push(`Note ${index + 1} is at fret ${n.fret}, which is not on the neck (0 to ${maxFret}). Fret 0 is the open string.`);
    } else if (hasTechnique(n)) {
      if (opts.techniques === false) {
        problems.push(`Note ${index + 1} has a technique (bend, slide, hammer-on, vibrato). The listener hears a bend or a slide as other notes: show techniques in a tab figure or a tab sound, and ask for plain notes here.`);
      } else {
        problems.push(...techniqueProblems(n, prev, index));
      }
    }
    prev = { string: n.string, fret: n.fret };
  });
  return problems;
}

function droneProblems(drone: SoundDrone | undefined): string[] {
  if (drone === undefined) return [];
  if (!drone || typeof drone !== 'object' || typeof drone.root !== 'string') return ['"drone" must be { root: "D3" } (a note with its octave), optionally with fifth: true.'];
  const problems = noteWithOctave(drone.root, 'the drone root');
  if (drone.fifth !== undefined && typeof drone.fifth !== 'boolean') problems.push('"drone.fifth" must be true or false.');
  return problems;
}

function overProblems(over: SoundOver | undefined, kind: Sound['kind'], together: boolean, opts: { tuning?: string; capo?: number } = {}): string[] {
  if (over === undefined) return [];
  if (!over || typeof over !== 'object' || typeof over.chord !== 'string') return ['"over" must be { chord: "Am" } (a chord symbol), optionally with frets and voice.'];
  if (!parseChord(over.chord)) return [`"${over.chord}" (the chord under the line) is not a chord symbol. Write it like Am, G7 or Cmaj7.`];
  const problems: string[] = [];
  if (over.frets !== undefined && !chordSoundMidi(over.chord, { frets: over.frets, tuning: opts.tuning, capo: opts.capo })) {
    problems.push(`The shape ${JSON.stringify(over.frets)} is not a voicing of ${over.chord}. Check each fret, or leave "frets" out to use the library shape.`);
  }
  if (over.voice !== undefined && over.voice !== 'guitar' && over.voice !== 'epiano' && over.voice !== 'organ') problems.push(`"over.voice" is "${String(over.voice)}". Use guitar, epiano or organ.`);
  if (kind === 'notes' && together) problems.push('A chord held under notes played together is just a bigger chord. Leave out "together", or "over".');
  return problems;
}

/** Problems of what sounds under a line: a drone or a held chord (one of them, not both). */
function underProblems(sound: Sound): string[] {
  const drone = 'drone' in sound ? sound.drone : undefined;
  const over = 'over' in sound ? sound.over : undefined;
  const problems = [...droneProblems(drone), ...overProblems(over, sound.kind, sound.kind === 'notes' && sound.together === true, sound.kind === 'tab' ? sound : {})];
  if (drone !== undefined && over !== undefined) problems.push('The sound has both a drone and a chord under it. Pick one: "drone" for a single held note, "over" for a chord.');
  return problems;
}

/** Everything that is wrong with a sound (empty when it can be played). Each entry says how to fix it. */
export function soundProblems(sound: Sound): string[] {
  switch (sound.kind) {
    case 'notes': {
      const problems = sound.notes.flatMap((n) => noteWithOctave(n, 'each note'));
      if (sound.notes.length === 0) problems.push('The sound has no notes. List at least one note with its octave.');
      return [...problems, ...tempoProblem(sound.tempo), ...underProblems(sound)];
    }
    case 'interval': {
      const problems = noteWithOctave(sound.from, 'the starting note');
      if (!parseInterval(sound.interval)) problems.push(`"${sound.interval}" is not an interval. Write it like m3, P5 or M7.`);
      return [...problems, ...underProblems(sound)];
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
      return [...problems, ...tempoProblem(sound.tempo), ...underProblems(sound)];
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
      return [...tabProblems(sound.notes, sound), ...tempoProblem(sound.tempo), ...underProblems(sound)];
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
          const technique = techniqueOf(n);
          // A hammer-on, pull-off or legato slide carries on the note before: keep that one ringing into it.
          if (technique?.legato && events.length > 0) events[events.length - 1].duration += LEGATO_OVERLAP;
          events.push({
            at: tickSeconds(tick, tempo),
            type: 'pluck',
            midi: [midiAt({ string: n.string, fret: n.fret }, { tuning: sound.tuning, capo: sound.capo })],
            duration: tickSeconds(d.ticks, tempo),
            string: n.string,
            ...(technique ? { technique } : {}),
          });
        }
        tick += d.ticks;
      }
      break;
    }
  }
  const duration = events.reduce((end, e) => Math.max(end, e.at + e.duration), 0);
  const plan: SoundPlan = { events, duration, tempo };
  const drone = 'drone' in sound ? sound.drone : undefined;
  if (drone) plan.drone = { midi: parseNote(drone.root)!.midi!, fifth: drone.fifth === true };
  const over = 'over' in sound ? sound.over : undefined;
  if (over) {
    const midi = chordSoundMidi(over.chord, { frets: over.frets, ...(sound.kind === 'tab' ? { tuning: sound.tuning, capo: sound.capo } : {}) });
    if (midi) plan.hold = { midi, voice: over.voice ?? 'guitar' };
  }
  return plan;
}

/** Seconds a note keeps ringing past the next one's start when that next one is hammered, pulled or slid from it. */
const LEGATO_OVERLAP = 0.08;

/** The techniques written on a tab note, or null for a plain note. */
function techniqueOf(n: { string: number; fret: number } & TabTechnique): TabTechnique | null {
  const t: TabTechnique = {};
  if (n.bend !== undefined) t.bend = n.bend;
  if (n.release) t.release = true;
  if (n.vibrato) t.vibrato = true;
  if (n.legato !== undefined) t.legato = n.legato;
  if (n.slideIn !== undefined) t.slideIn = n.slideIn;
  if (n.slideOut !== undefined) t.slideOut = n.slideOut;
  return Object.keys(t).length > 0 ? t : null;
}

/** A short description of a sound for screen readers and logs ("two notes", "a scale over a drone"). */
export function describeSound(sound: Sound): string {
  const what = describeLine(sound);
  if ('drone' in sound && sound.drone) return `${what} over a drone`;
  if ('over' in sound && sound.over) return `${what} over a chord`;
  return what;
}

function describeLine(sound: Sound): string {
  switch (sound.kind) {
    case 'notes': {
      const n = sound.notes.length;
      if (n === 1) return 'one note';
      return sound.together ? `${n} notes together` : `${n} notes`;
    }
    case 'interval':
      return sound.play === 'together' ? 'two notes together' : 'two notes';
    case 'chord':
      return 'a chord';
    case 'scale':
      return 'a scale';
    case 'strum':
      return 'a strumming pattern';
    case 'progression':
      return sound.chords.length === 1 ? 'one chord' : `${sound.chords.length} chords`;
    case 'rhythm':
      return 'a rhythm';
    case 'tab':
      return 'a phrase';
  }
}

/**
 * Phrases: a few notes with their techniques, played as one gesture on the guitar voice. A lesson
 * sound plays `tabPhrase('5b7', 3)` (a bend) or `tabPhrase('5h7p5', 3)` (a hammer-on and a pull-off)
 * exactly as the song player would; an ear drill plays a line over a held chord, or over a drone,
 * on the audio clock.
 */
import { clamp, finiteOr } from './dsp';
import { audioSupported, getEngine, onAudioClosed, type AudioEngine } from './engine';
import { parseTabTechnique } from './expression';
import { GuitarSynth, getGuitar, type PlayOptions, type VoiceHandle } from './guitar';
import type { ToneName } from './tones';
import { playChord, type ToneHandle } from './voices';

/** One note of a phrase: when it sounds (seconds after the phrase starts) and how it is played. */
export interface PhraseNote extends PlayOptions {
  midi: number;
  /** Seconds after the start of the phrase. */
  at: number;
}

/** A phrase that is playing (or scheduled). */
export interface PhraseHandle {
  /** Audio-clock time the phrase starts. */
  readonly startTime: number;
  /** Audio-clock time its last note has ended (a ringing note is counted for 1.5 s). */
  readonly endTime: number;
  /** True when it was requested before audio could start (dropped if no tap follows at once). */
  readonly queued: boolean;
  /** Stop everything it plays, now or at audio time `when`. */
  stop(when?: number): void;
}

/** Options for {@link playPhrase}. */
export interface PhraseOptions {
  /** Synth to play on (default: the shared guitar). */
  synth?: GuitarSynth;
  /** Tone for notes that do not name one. */
  tone?: ToneName;
  /** Velocity for notes that do not give one (default 0.8). */
  velocity?: number;
}

/** Standard tuning, sounding pitches low to high. */
const STANDARD = [40, 45, 50, 55, 59, 64];
/** How long a note that only rings is counted in a phrase's length. */
const RING_OUT = 1.5;

/**
 * Play a phrase starting at audio time `when` (default now). Bends, slides, vibrato, hammer-ons and
 * pull-offs work as on `pluck`: a legato note carries on the note before it on its string.
 */
export function playPhrase(notes: readonly PhraseNote[], when?: number, opts: PhraseOptions = {}): PhraseHandle {
  const list = notes.filter((n) => n && Number.isFinite(n.midi) && Number.isFinite(n.at)).slice().sort((a, b) => a.at - b.at);
  const synth = opts.synth ?? (audioSupported() ? getGuitar() : null);
  if (!synth || !list.length) return { startTime: 0, endTime: 0, queued: false, stop: () => undefined };
  // Every note is rendered before the clock is read, so a phrase played for the first time keeps its timing.
  // (Each with what it is played with: an accented note or a hammer-on is a buffer of its own.)
  synth.renderNow(list.map((n) => ({ ...n, tone: n.tone ?? opts.tone, velocity: n.velocity ?? opts.velocity })));
  const t0 = synth.engine.startTime(when);
  const handles: VoiceHandle[] = [];
  let end = t0;
  let queued = false;
  for (const n of list) {
    const at = t0 + Math.max(0, n.at);
    const { at: _at, midi, ...rest } = n;
    const h = synth.pluck(midi, at, { ...rest, tone: n.tone ?? opts.tone, velocity: n.velocity ?? opts.velocity });
    handles.push(h);
    queued ||= h.queued;
    const d = finiteOr(n.duration, NaN);
    end = Math.max(end, at + (d >= 0 && !n.letRing ? d : RING_OUT));
  }
  return {
    startTime: t0,
    endTime: end,
    queued,
    stop: (at?: number) => {
      for (const h of handles) h.stop(at, 0.05);
    },
  };
}

/** Options for {@link tabPhrase}. */
export interface TabPhraseOptions {
  /** Sounding pitches of the open strings, low to high (default standard tuning). */
  tuning?: readonly number[];
  capo?: number;
  /** Seconds each step of the phrase lasts (default 0.45); a bend gets twice as long to be heard. */
  noteSeconds?: number;
}

/**
 * The notes of one string's tab token, ready for `playPhrase`: `tabPhrase('5b7', 3)` is fret 5 on
 * the G string bent up a whole tone (to the pitch of fret 7), `tabPhrase('5h7', 3)` fret 5 then a
 * hammer-on to fret 7, `'7p5'` a pull-off, `'5/7'` a slide, `'5b7r5'` bend and release, `'7~'`
 * vibrato. Null when the token is not tab or the string is not on the instrument.
 */
export function tabPhrase(token: string, string: number, opts: TabPhraseOptions = {}): PhraseNote[] | null {
  const steps = parseTabTechnique(token);
  const tuning = opts.tuning && opts.tuning.length ? opts.tuning : STANDARD;
  const s = Math.round(finiteOr(string, NaN));
  if (!steps || !(s >= 1 && s <= tuning.length)) return null;
  const open = tuning[tuning.length - s] + clamp(Math.round(finiteOr(opts.capo, 0)), 0, 12);
  const step = clamp(finiteOr(opts.noteSeconds, 0.45), 0.05, 4);
  const out: PhraseNote[] = [];
  let at = 0;
  steps.forEach((st, i) => {
    const long = st.bend || st.vibrato ? 2 : 1;
    const last = i === steps.length - 1;
    const duration = step * long * (last ? 1.6 : 1);
    // A slide down ("7\5"): if the string cannot be carried on, the fresh note slides in from above.
    const slideIn = st.slideIn ?? (st.legato === 'slide' && i > 0 && st.fret < steps[i - 1].fret ? 'above' : undefined);
    out.push({
      midi: open + st.fret,
      string: s,
      at,
      duration,
      ...(st.legato ? { legato: st.legato } : {}),
      ...(st.bend ? { bend: st.bend } : {}),
      ...(st.vibrato ? { vibrato: true } : {}),
      ...(slideIn ? { slideIn } : {}),
      ...(st.slideOut ? { slideOut: st.slideOut } : {}),
    });
    at += step * long;
  });
  return out;
}

/** Options for {@link playLineOverChord}. */
export interface LineOverChordOptions {
  /**
   * What holds the chord: `guitar` (a second guitar strums it and lets it ring, a little to the left
   * so the line stands out), or the keys (`epiano`, `organ`). Default `guitar`.
   */
  chordVoice?: 'guitar' | 'epiano' | 'organ';
  /** Seconds the chord is held (default: until the line has finished). */
  hold?: number;
  /** Level of the chord, 0..1.5 (default 0.6: under the line). */
  chordLevel?: number;
  /** Tone of the line (and of the chord guitar). */
  tone?: ToneName;
  /** Seconds the line starts after the chord (default 0: together). */
  lineDelay?: number;
  /** Play into this engine (an offline render) instead of the shared one. */
  engine?: AudioEngine;
}

let sharedAccompanist: GuitarSynth | null = null;
onAudioClosed(() => {
  sharedAccompanist = null;
});

/**
 * A line over a held chord: the chord sounds at `when` and is held while the line plays on top
 * ("hear the third over the chord", "which note of the scale is this?"). The chord is on its own
 * instrument, so the line never cuts its strings. Returns one handle for both.
 */
export function playLineOverChord(chord: readonly number[], line: readonly PhraseNote[], when?: number, opts: LineOverChordOptions = {}): PhraseHandle {
  if (!opts.engine && !audioSupported()) return { startTime: 0, endTime: 0, queued: false, stop: () => undefined };
  const engine = opts.engine ?? getEngine();
  const lineSynth = opts.engine ? new GuitarSynth({ engine, tone: opts.tone }) : getGuitar();
  const midis = chord.filter((m) => Number.isFinite(m)).slice().sort((a, b) => a - b);
  const onKeys = opts.chordVoice === 'epiano' || opts.chordVoice === 'organ';
  const accompanist = onKeys ? null : opts.engine ? new GuitarSynth({ engine, tone: opts.tone, pan: -0.2 }) : (sharedAccompanist ??= new GuitarSynth({ pan: -0.2 }));
  if (accompanist && opts.tone) accompanist.tone = opts.tone;
  const strumOpts = { direction: 'down' as const, velocity: 0.7, choke: false };
  // Render the chord and the line before reading the clock: played "now" for the first time, the
  // strings take a few milliseconds each, and the chord would come in after the line's first note.
  accompanist?.renderNow(accompanist.strumNotes(midis, strumOpts));
  lineSynth.renderNow(line.filter((n) => n && Number.isFinite(n.midi)).map((n) => ({ ...n, tone: n.tone ?? opts.tone })));
  const t0 = engine.startTime(when);
  const delay = clamp(finiteOr(opts.lineDelay, 0), 0, 30);
  const phrase = playPhrase(line, t0 + delay, { synth: lineSynth, tone: opts.tone });
  const hold = finiteOr(opts.hold, NaN) > 0 ? finiteOr(opts.hold, 1) : Math.max(1, phrase.endTime - t0);
  const level = clamp(finiteOr(opts.chordLevel, 0.6), 0, 1.5);
  let chordHandles: Array<VoiceHandle | ToneHandle> = [];
  if (!accompanist) {
    chordHandles = playChord(midis, t0, { voice: opts.chordVoice as 'epiano' | 'organ', duration: hold, gain: level, bus: 'keys' }, engine);
  } else {
    chordHandles = accompanist.strum(midis, t0, { ...strumOpts, gain: level, duration: hold });
  }
  return {
    startTime: t0,
    endTime: Math.max(phrase.endTime, t0 + hold),
    queued: phrase.queued,
    stop: (at?: number) => {
      phrase.stop(at);
      for (const h of chordHandles) h.stop(at);
    },
  };
}

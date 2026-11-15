/**
 * Turning chart sounds into audio: metronome clicks, synthesised strums over a chord, and the
 * plucked guide note that demonstrates a written rhythm.
 */
import { getGuitar, normalizeClickSet, normalizeTone, playClick, pluck, preloadClicks, strum, strumPlan, type ClickSet, type PlayStrumOptions, type ToneName } from '@/core/audio';
import { chordVoicings } from '@/core/guitar';
import type { ChartSound } from '../core/charts';

/** A chord ready to strum: MIDI notes low to high with the string each is played on. */
export interface StrumChord {
  symbol: string;
  midi: number[];
  strings: number[];
}

/** Open E minor, used when the chord library cannot be asked (it never fails for the chords offered here). */
const FALLBACK: StrumChord = { symbol: 'Em', midi: [40, 47, 52, 55, 59, 64], strings: [6, 5, 4, 3, 2, 1] };

const chordCache = new Map<string, StrumChord>();

/** The easiest open voicing of a chord symbol, from the guitar module. */
export function strumChord(symbol: string): StrumChord {
  const hit = chordCache.get(symbol);
  if (hit) return hit;
  let chord = FALLBACK;
  try {
    const voicing = chordVoicings(symbol)[0];
    const notes = voicing ? [...voicing.notes].sort((a, b) => a.midi - b.midi) : [];
    if (notes.length >= 3) chord = { symbol, midi: notes.map((n) => n.midi), strings: notes.map((n) => n.string) };
  } catch {
    // An unknown symbol: keep the fallback rather than break playback.
  }
  chordCache.set(symbol, chord);
  return chord;
}

/** Chords offered for strumming, all open shapes a beginner meets early. */
export const STRUM_CHORDS = ['Em', 'G', 'C', 'D', 'Am', 'A', 'E', 'Dm'] as const;

/** How a round should sound. */
export interface SoundSettings {
  click: ClickSet;
  tone: ToneName;
  /** Chord for strums. */
  chord: StrumChord;
  /** Cut strums short. */
  staccato: boolean;
  /** Seconds one strum slot lasts: bounds how wide a strum is spread. */
  slotSeconds: number;
  /** Seconds per tick, to give the guide note its written length. */
  secondsPerTick: number;
  /** 0..1 loudness of the click. */
  clickGain: number;
}

/** Settings from the learner's preferences. Unknown names fall back to the defaults. */
export function soundSettings(prefs: { clickSound?: string; guitarTone?: string }, extra: Partial<SoundSettings> = {}): SoundSettings {
  return {
    click: normalizeClickSet(prefs.clickSound ?? 'woodblock'),
    tone: normalizeTone(prefs.guitarTone ?? 'steel', 'steel'),
    chord: FALLBACK,
    staccato: false,
    slotSeconds: 0.25,
    secondsPerTick: 0.0005,
    clickGain: 1,
    ...extra,
  };
}

type StrumSound = Extract<ChartSound, { type: 'strum' }>;

/** The notes and options of one strum: which strings, how hard, how wide. */
function strumArgs(sound: StrumSound, s: SoundSettings): { midi: number[]; opts: PlayStrumOptions } {
  const up = sound.dir === 'U';
  // An upstroke only catches the thin strings; a downstroke takes the whole chord.
  const from = up ? Math.max(0, s.chord.midi.length - 4) : 0;
  const muted = sound.kind === 'mute';
  return {
    midi: s.chord.midi.slice(from),
    opts: {
      direction: up ? 'up' : 'down',
      velocity: sound.kind === 'accent' ? 1 : muted ? 0.72 : up ? 0.56 : 0.76,
      spread: Math.min(up ? 0.014 : 0.02, s.slotSeconds * 0.2),
      strings: s.chord.strings.slice(from),
      align: 'start',
      tone: s.tone,
      articulation: muted ? 'dead' : 'normal',
      duration: muted ? 0.08 : s.staccato ? Math.min(0.14, s.slotSeconds * 0.8) : undefined,
    },
  };
}

/**
 * Render what a round will need before the clock starts, so the first bar never stalls the page:
 * the clicks, the guide note, and every string of every kind of strum the chart contains at the
 * loudness it will be played.
 */
export async function prepareSounds(settings: SoundSettings, sounds: readonly ChartSound[]): Promise<void> {
  try {
    preloadClicks(settings.click);
    const seen = new Set<string>();
    for (const sound of sounds) {
      if (sound.type === 'click') continue;
      const key = sound.type === 'guide' ? `guide:${sound.accent}` : `${sound.dir}:${sound.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (sound.type === 'guide') {
        await getGuitar().preload([{ midi: GUIDE_MIDI, string: 2, velocity: sound.accent ? 0.95 : 0.78 }], { tone: settings.tone });
        continue;
      }
      const { midi, opts } = strumArgs(sound, settings);
      const plan = strumPlan(midi, opts);
      await getGuitar().preload(
        plan.map((p) => ({ midi: p.midi, string: p.string, velocity: p.velocity })),
        { tone: opts.tone, articulation: opts.articulation, direction: opts.direction },
      );
    }
  } catch {
    // Preloading is an optimisation: playback renders on demand if it did not happen.
  }
}

/** The guide note that demonstrates a written rhythm: the open B string. */
const GUIDE_MIDI = 59;

/**
 * Play one chart sound at audio time `time`. Returns a function that takes it back if it has not
 * been heard yet (a round stopped with sounds still scheduled).
 */
export function playChartSound(sound: ChartSound, time: number, s: SoundSettings): () => void {
  if (sound.type === 'click') return playClick(s.click, sound.level, time, s.clickGain);
  if (sound.type === 'guide') {
    const h = pluck(GUIDE_MIDI, time, { tone: s.tone, string: 2, velocity: sound.accent ? 0.95 : 0.78, duration: Math.max(0.09, sound.ticks * s.secondsPerTick * 0.92) });
    return () => h.stop(undefined, 0.02);
  }
  const { midi, opts } = strumArgs(sound, s);
  const handles = strum(midi, time, opts);
  return () => handles.forEach((h) => h.stop(undefined, 0.02));
}

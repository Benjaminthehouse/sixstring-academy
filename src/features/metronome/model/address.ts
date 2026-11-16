/**
 * The metronome's address: route params that open it set up, so a lesson can say "80 BPM in 3/4"
 * with a link instead of a list of things to tap. Params are slug-safe, in any order; one the
 * metronome does not know is ignored (an old link never breaks the screen).
 *
 *   #metronome--t80                     80 BPM (a bare `80` works too)
 *   #metronome--3-4                     a time signature; `7-8-2-2-3` adds the grouping (7/8 as 2+2+3)
 *   #metronome--eighth                  a subdivision: beats, eighth, triplet, sixteenth, swing, quintuplet, sextuplet
 *   #metronome--swing-60                swung eighths, the long one 60 % of the beat (50 to 75; implies `swing`)
 *   #metronome--accents-2-3-1           each beat's accent: 0 silent, 1 normal, 2 medium, 3 strong
 *   #metronome--gap-1-1                 silent bars: 1 bar played, 1 bar silent
 *
 *   #metronome--t50--3-4--accents-2-3-1 a sarabande: 3/4 at 50, beat 2 strong, beat 1 medium
 *
 * An address is a whole setup, like a preset: what it does not name goes back to plain (4/4, beats
 * only, the usual accents, speed trainer and silent bars off). The learner's own things stay:
 * volume, count-in, timer, flash-only and vibration. Accents that do not fit the time signature
 * are ignored.
 */
import { SUBDIVISIONS, type AccentLevel, type Subdivision } from '@/core/audio';
import { meterKey, meterOf, normalizeMeterKey, parseMeterKey } from './meters';
import { cleanAccents, DEFAULT_SETTINGS, sanitizeSettings, type MetronomeSettings } from './settings';
import { clampSwing } from './subdivisions';
import { clampTempo } from './tempo';

/** What an address asks for; every field is optional. */
export interface MetronomeAddress {
  /** Beats per minute of the meter's tempo beat. */
  tempo?: number;
  /** Meter key ("3/4", "7/8(2+2+3)"). */
  meter?: string;
  subdivision?: Subdivision;
  /** Share of the beat taken by the first of two swung eighths (0.5 to 0.75). */
  swing?: number;
  accents?: AccentLevel[];
  /** Silent bars: bars played, then bars silent. */
  gap?: { play: number; mute: number };
}

/** Words accepted for each subdivision (the engine's ids, plus `beats` for none). */
const SUBDIVISION_WORDS: Readonly<Record<string, Subdivision>> = {
  beats: 'none',
  none: 'none',
  ...Object.fromEntries(SUBDIVISIONS.map((s) => [s, s])),
};

/** Read the route params; null when none of them names a setting. */
export function parseMetronomeParams(params: readonly string[]): MetronomeAddress | null {
  const out: MetronomeAddress = {};
  let any = false;
  for (const raw of params) {
    const p = raw.trim().toLowerCase();
    let m: RegExpExecArray | null;
    if ((m = /^t?(\d{2,3})$/.exec(p))) {
      out.tempo = clampTempo(Number(m[1]));
      any = true;
    } else if ((m = /^(\d{1,2})-(\d{1,2})((?:-\d)+)?$/.exec(p))) {
      const grouping = m[3] ? `(${m[3].slice(1).split('-').join('+')})` : '';
      const ts = parseMeterKey(`${m[1]}/${m[2]}${grouping}`);
      if (ts) {
        out.meter = meterKey(ts);
        any = true;
      }
    } else if (SUBDIVISION_WORDS[p]) {
      out.subdivision = SUBDIVISION_WORDS[p];
      any = true;
    } else if ((m = /^swing-(\d{2})$/.exec(p))) {
      out.swing = clampSwing(Number(m[1]) / 100);
      any = true;
    } else if ((m = /^accents((?:-[0-3])+)$/.exec(p))) {
      out.accents = m[1].slice(1).split('-').map((n) => Number(n) as AccentLevel);
      any = true;
    } else if ((m = /^gap-(\d{1,2})-(\d{1,2})$/.exec(p))) {
      const play = Number(m[1]);
      const mute = Number(m[2]);
      if (play >= 1 && play <= 16 && mute >= 1 && mute <= 16) {
        out.gap = { play, mute };
        any = true;
      }
    }
  }
  return any ? out : null;
}

/** The canonical params of an address (what a lesson links to). */
export function metronomeParams(a: MetronomeAddress): string[] {
  const out: string[] = [];
  if (a.tempo !== undefined) out.push(`t${clampTempo(a.tempo)}`);
  if (a.meter !== undefined) {
    const ts = parseMeterKey(normalizeMeterKey(a.meter));
    if (ts) out.push([ts.numerator, ts.denominator, ...(normalizeMeterKey(a.meter).includes('(') ? ts.grouping ?? [] : [])].join('-'));
  }
  if (a.subdivision !== undefined && !(a.subdivision === 'swing' && a.swing !== undefined)) out.push(a.subdivision === 'none' ? 'beats' : a.subdivision);
  if (a.swing !== undefined) out.push(`swing-${Math.round(clampSwing(a.swing) * 100)}`);
  if (a.accents?.length) out.push(`accents-${a.accents.join('-')}`);
  if (a.gap) out.push(`gap-${a.gap.play}-${a.gap.mute}`);
  return out;
}

/**
 * The settings with an address applied: its musical setup over plain defaults, the learner's own
 * volume, count-in, timer, flash-only and vibration kept. The speed trainer is switched off (the
 * address names the tempo to play) but keeps its range.
 */
export function applyAddress(settings: MetronomeSettings, a: MetronomeAddress): MetronomeSettings {
  const meter = a.meter ? normalizeMeterKey(a.meter) : DEFAULT_SETTINGS.meter;
  const tempo = a.tempo ?? settings.tempo;
  const subdivision = a.subdivision ?? (a.swing !== undefined ? 'swing' : DEFAULT_SETTINGS.subdivision);
  const accents = a.accents && a.accents.length === meterOf(meter).beats.length ? cleanAccents(a.accents, meter) : null;
  return sanitizeSettings({
    ...settings,
    tempo,
    meter,
    accents,
    subdivision,
    swing: a.swing ?? DEFAULT_SETTINGS.swing,
    trainer: { ...settings.trainer, on: false, start: tempo },
    gap: a.gap ? { on: true, play: a.gap.play, mute: a.gap.mute } : { ...settings.gap, on: false },
  });
}

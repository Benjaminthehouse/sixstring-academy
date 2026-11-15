/**
 * Everything the learner sets on the metronome, as plain JSON: the defaults, the clean-up applied
 * to whatever comes back from storage, presets (built-in and their own), and short descriptions.
 * The click sound is not here: it is the app-wide preference `prefs.sound.clickSound`.
 */
import { SUBDIVISIONS, defaultAccents, type AccentLevel, type Subdivision } from '@/core/audio';
import { meterLabel, meterOf, normalizeMeterKey } from './meters';
import { SUBDIVISION_INFO, clampSwing } from './subdivisions';
import { clampTempo } from './tempo';

/** Speed trainer: start, target, step and how often to step. */
export interface TrainerSettings {
  on: boolean;
  start: number;
  target: number;
  step: number;
  /** Bars at each tempo before the next step. */
  every: number;
}

/** Gap trainer ("silent bars"): play some bars, then stay silent for some. */
export interface GapSettings {
  on: boolean;
  play: number;
  mute: number;
}

/** The whole setup of the metronome. */
export interface MetronomeSettings {
  /** Beats per minute of the meter's tempo beat (a dotted quarter in 6/8). */
  tempo: number;
  /** Meter key: "4/4", "7/8(3+2+2)". */
  meter: string;
  /** Accent of each beat (0 silent .. 3 strong); null = the meter's usual accents. */
  accents: AccentLevel[] | null;
  subdivision: Subdivision;
  /** Share of the beat taken by the first of two swung eighths (0.5 straight .. 0.75 hard). */
  swing: number;
  /** Click volume, 0..1.5 (1 = normal). */
  volume: number;
  /** Bars of count-in before the first bar. */
  countIn: number;
  trainer: TrainerSettings;
  gap: GapSettings;
  /** Stop after this many minutes; 0 = no limit. */
  timerMinutes: number;
  /** Flash only, no sound. */
  visualOnly: boolean;
  /** Buzz the phone on every beat where the browser can. */
  vibrate: boolean;
}

/** The setup a first visit opens with: a steady 4/4 at a comfortable practice tempo. */
export const DEFAULT_SETTINGS: MetronomeSettings = {
  tempo: 80,
  meter: '4/4',
  accents: null,
  subdivision: 'none',
  swing: 2 / 3,
  volume: 1,
  countIn: 0,
  trainer: { on: false, start: 80, target: 120, step: 5, every: 4 },
  gap: { on: false, play: 2, mute: 2 },
  timerMinutes: 0,
  visualOnly: false,
  vibrate: false,
};

/** Session timer lengths offered, in minutes (0 = off). */
export const TIMER_CHOICES: readonly number[] = [0, 2, 5, 10, 15, 20, 30, 45, 60];

/** Count-in lengths offered, in bars. */
export const COUNT_IN_CHOICES: readonly number[] = [0, 1, 2];

function num(value: unknown, fallback: number, min: number, max: number, whole = true): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const v = whole ? Math.round(value) : value;
  return Math.max(min, Math.min(max, v));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Accents that fit the meter, or null when they are missing, the wrong length or the usual ones. */
export function cleanAccents(value: unknown, meterKey: string): AccentLevel[] | null {
  if (!Array.isArray(value)) return null;
  const meter = meterOf(meterKey);
  if (value.length !== meter.beats.length) return null;
  if (!value.every((v) => v === 0 || v === 1 || v === 2 || v === 3)) return null;
  const usual = defaultAccents(meter);
  return value.every((v, i) => v === usual[i]) ? null : (value.slice() as AccentLevel[]);
}

/** Turn anything (stored JSON from an older version, a damaged value) into valid settings. */
export function sanitizeSettings(raw: unknown): MetronomeSettings {
  const r = obj(raw);
  const d = DEFAULT_SETTINGS;
  const meter = normalizeMeterKey(r.meter ?? d.meter);
  const t = obj(r.trainer);
  const g = obj(r.gap);
  const subdivision = (SUBDIVISIONS as readonly string[]).includes(r.subdivision as string) ? (r.subdivision as Subdivision) : d.subdivision;
  return {
    tempo: clampTempo(typeof r.tempo === 'number' ? r.tempo : NaN, d.tempo),
    meter,
    accents: cleanAccents(r.accents, meter),
    subdivision,
    swing: clampSwing(typeof r.swing === 'number' ? r.swing : d.swing),
    volume: num(r.volume, d.volume, 0, 1.5, false),
    countIn: num(r.countIn, d.countIn, 0, 2),
    trainer: {
      on: bool(t.on, d.trainer.on),
      start: clampTempo(typeof t.start === 'number' ? t.start : NaN, d.trainer.start),
      target: clampTempo(typeof t.target === 'number' ? t.target : NaN, d.trainer.target),
      step: num(t.step, d.trainer.step, 1, 50),
      every: num(t.every, d.trainer.every, 1, 32),
    },
    gap: {
      on: bool(g.on, d.gap.on),
      play: num(g.play, d.gap.play, 1, 16),
      mute: num(g.mute, d.gap.mute, 1, 16),
    },
    timerMinutes: TIMER_CHOICES.includes(r.timerMinutes as number) ? (r.timerMinutes as number) : d.timerMinutes,
    visualOnly: bool(r.visualOnly, d.visualOnly),
    vibrate: bool(r.vibrate, d.vibrate),
  };
}

/** The accent of every beat with the usual ones filled in. */
export function accentsOf(settings: Pick<MetronomeSettings, 'meter' | 'accents'>): AccentLevel[] {
  const meter = meterOf(settings.meter);
  const usual = defaultAccents(meter);
  return settings.accents && settings.accents.length === usual.length ? settings.accents.slice() : usual;
}

/** Next accent when a beat is tapped: normal -> medium -> strong -> silent -> normal (as the engine's `cycleAccent`). */
export function nextAccent(level: AccentLevel): AccentLevel {
  return (((level + 1) % 4) as AccentLevel);
}

/** The settings with one beat's accent stepped on. */
export function cycleBeatAccent(settings: MetronomeSettings, beat: number): MetronomeSettings {
  const levels = accentsOf(settings);
  if (beat < 0 || beat >= levels.length) return settings;
  levels[beat] = nextAccent(levels[beat]);
  return { ...settings, accents: cleanAccents(levels, settings.meter) };
}

/** Words for an accent level, for labels and screen readers. */
export const ACCENT_WORDS: Readonly<Record<AccentLevel, string>> = { 0: 'silent', 1: 'normal', 2: 'medium', 3: 'strong' };

// --- presets -------------------------------------------------------------------------------------

/** The part of the settings a preset stores: the musical setup, not the volume or the timer. */
export type PresetSetup = Pick<MetronomeSettings, 'tempo' | 'meter' | 'accents' | 'subdivision' | 'swing' | 'countIn' | 'trainer' | 'gap'>;

/** A named setup. */
export interface Preset {
  id: string;
  name: string;
  /** One line under the name ("For slow, clean practice"). */
  note?: string;
  builtIn?: boolean;
  setup: PresetSetup;
}

const OFF_TRAINER: TrainerSettings = { ...DEFAULT_SETTINGS.trainer };
const OFF_GAP: GapSettings = { ...DEFAULT_SETTINGS.gap };

function setup(partial: Partial<PresetSetup> & Pick<PresetSetup, 'tempo' | 'meter'>): PresetSetup {
  return { accents: null, subdivision: 'none', swing: 2 / 3, countIn: 0, trainer: OFF_TRAINER, gap: OFF_GAP, ...partial };
}

/** Presets that come with the app. */
export const BUILT_IN_PRESETS: readonly Preset[] = [
  { id: 'builtin-slow-60', builtIn: true, name: 'Slow practice 60', note: 'Clean and relaxed first, speed later. One bar to count in.', setup: setup({ tempo: 60, meter: '4/4', countIn: 1 }) },
  { id: 'builtin-two-four', builtIn: true, name: 'Click on 2 and 4', note: 'The click only on the backbeat: you feel beats 1 and 3 yourself.', setup: setup({ tempo: 90, meter: '4/4', accents: [0, 3, 0, 3] }) },
  { id: 'builtin-swing-120', builtIn: true, name: 'Swing 120', note: 'Long-short eighths for blues and jazz.', setup: setup({ tempo: 120, meter: '4/4', subdivision: 'swing' }) },
  { id: 'builtin-waltz', builtIn: true, name: 'Waltz 3/4', note: 'Strong, weak, weak, at a gentle 96.', setup: setup({ tempo: 96, meter: '3/4' }) },
  { id: 'builtin-ballad-68', builtIn: true, name: '6/8 ballad', note: 'Two slow big beats, with all six eighths ticking.', setup: setup({ tempo: 46, meter: '6/8', subdivision: 'eighth' }) },
  { id: 'builtin-seven-eight', builtIn: true, name: '7/8 groove', note: 'Count 1-2 1-2 1-2-3, with the eighths clicking.', setup: setup({ tempo: 110, meter: '7/8', subdivision: 'eighth' }) },
  { id: 'builtin-speed-builder', builtIn: true, name: 'Speed builder 60 to 100', note: '5 BPM faster every 4 bars, from 60 up to 100.', setup: setup({ tempo: 60, meter: '4/4', countIn: 1, trainer: { on: true, start: 60, target: 100, step: 5, every: 4 } }) },
  { id: 'builtin-inner-clock', builtIn: true, name: 'Inner clock', note: '2 bars of click, 2 bars of silence. Keep the beat going.', setup: setup({ tempo: 80, meter: '4/4', gap: { on: true, play: 2, mute: 2 } }) },
];

/** The preset part of the current settings. */
export function setupOf(settings: MetronomeSettings): PresetSetup {
  return {
    tempo: settings.tempo,
    meter: settings.meter,
    accents: settings.accents ? settings.accents.slice() : null,
    subdivision: settings.subdivision,
    swing: settings.swing,
    countIn: settings.countIn,
    trainer: { ...settings.trainer },
    gap: { ...settings.gap },
  };
}

/** Settings with a preset applied: its musical setup; volume, timer, visual mode and vibration stay. */
export function applyPreset(settings: MetronomeSettings, preset: Preset): MetronomeSettings {
  return sanitizeSettings({ ...settings, ...setupOf(sanitizeSettings({ ...settings, ...preset.setup })) });
}

/** True when the settings are exactly what the preset sets up (to mark it as the current one). */
export function presetMatches(settings: MetronomeSettings, preset: Preset): boolean {
  const a = setupOf(settings);
  const b = setupOf(sanitizeSettings({ ...settings, ...preset.setup }));
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A short description of a setup: "92 BPM · 7/8 · 2+2+3 · Eighths · speed trainer". */
export function describeSetup(s: PresetSetup): string {
  const parts = [`${s.trainer.on ? `${s.trainer.start} to ${s.trainer.target}` : s.tempo} BPM`, meterLabel(s.meter)];
  if (s.subdivision !== 'none') parts.push(SUBDIVISION_INFO[s.subdivision].label);
  if (s.trainer.on) parts.push('speed trainer');
  if (s.gap.on) parts.push(`${s.gap.mute} silent ${s.gap.mute === 1 ? 'bar' : 'bars'}`);
  return parts.join(' · ');
}

/** A name for the current setup, offered when saving: "92 BPM 7/8 eighths". */
export function suggestPresetName(s: PresetSetup): string {
  const parts = [`${s.trainer.on ? `${s.trainer.start}-${s.trainer.target}` : s.tempo} BPM`, meterLabel(s.meter).replace(' · ', ' ')];
  if (s.subdivision !== 'none') parts.push(SUBDIVISION_INFO[s.subdivision].label.toLowerCase());
  return parts.join(' ');
}

/** Longest preset name kept. */
export const PRESET_NAME_MAX = 40;

/** A new preset of the learner's own. `existing` ids are avoided. */
export function makePreset(name: string, settings: MetronomeSettings, existing: readonly Preset[], now = Date.now()): Preset {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, PRESET_NAME_MAX) || suggestPresetName(setupOf(settings));
  let id = `p-${now.toString(36)}`;
  let n = 1;
  while (existing.some((p) => p.id === id)) id = `p-${now.toString(36)}-${n++}`;
  return { id, name: clean, setup: setupOf(settings) };
}

/** Most presets of their own a learner can keep. */
export const MAX_PRESETS = 40;

/** Clean up the learner's stored presets (bad entries are dropped, never shown). */
export function sanitizePresets(raw: unknown): Preset[] {
  if (!Array.isArray(raw)) return [];
  const out: Preset[] = [];
  const ids = new Set<string>();
  for (const item of raw) {
    const p = obj(item);
    if (typeof p.id !== 'string' || !p.id || ids.has(p.id) || p.id.startsWith('builtin-')) continue;
    if (typeof p.name !== 'string' || !p.name.trim()) continue;
    const s = sanitizeSettings({ ...DEFAULT_SETTINGS, ...obj(p.setup) });
    ids.add(p.id);
    out.push({ id: p.id, name: p.name.trim().slice(0, PRESET_NAME_MAX), setup: setupOf(s) });
    if (out.length >= MAX_PRESETS) break;
  }
  return out;
}

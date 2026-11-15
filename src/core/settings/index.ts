/**
 * The learner's settings, turned into the options each engine takes, so every screen honours
 * Settings the same way. Components from `@/ui/music` already follow note naming, handedness,
 * fretboard wood, inlays and labels by themselves; this module covers the rest.
 *
 *   const tracker = new PitchTracker({ ...micOptions(), chroma: true });
 *   const t = learnerTuning();                // the learner's tuning (a Tuning object)
 *   if (!aiAllowed()) offerSettingsLink();    // before any ai.ask / ai.askJson
 *
 * Every function reads the store at call time; pass `prefs` (for example from `usePrefs()`) to
 * use a value you already hold and to re-render when it changes.
 */
import { tuning as resolveTuning, STANDARD_TUNING, type Tuning } from '@/core/guitar';
import { getProgressStore, type Preferences } from '@/core/progress';
import { readJSON } from '@/core/platform/storage';
import type { PitchTrackerOptions } from '@/core/pitch';

/** The current preferences from the app's progress store. */
export function learnerPrefs(): Preferences {
  return getProgressStore().getState().prefs;
}

/**
 * Microphone options for `new PitchTracker(...)`: the learner's reference pitch (A4), chosen input
 * device and sensitivity. Sensitivity 0 hears only loud playing, 1 very quiet playing; the default
 * 0.5 gives the pitch module's own defaults. Spread the result first, then your own options.
 */
export function micOptions(prefs: Preferences = learnerPrefs()): Pick<PitchTrackerOptions, 'a4' | 'deviceId' | 'onset'> {
  const s = clamp01(prefs.mic.sensitivity);
  const out: Pick<PitchTrackerOptions, 'a4' | 'deviceId' | 'onset'> = {
    a4: prefs.a4,
    // -55 dBFS at 0.5 (the onset detector's default), -40 at 0 (loud only), -70 at 1 (very quiet).
    onset: { minLevelDb: Math.round(-40 - 30 * s) },
  };
  if (prefs.mic.deviceId) out.deviceId = prefs.mic.deviceId;
  return out;
}

/** The learner's tuning as a `Tuning` (standard when the saved id is unknown). */
export function learnerTuning(prefs: Preferences = learnerPrefs()): Tuning {
  try {
    return resolveTuning(prefs.tuningId);
  } catch {
    return STANDARD_TUNING;
  }
}

/** The learner's reference pitch for A4, in Hz (415–466, default 440). */
export function learnerA4(prefs: Preferences = learnerPrefs()): number {
  return prefs.a4;
}

/** Storage key (platform storage) of the "read explanations aloud" switch, kept outside the progress store. */
export const SPEECH_PREF_KEY = 'prefs.speech';

/** Whether the learner wants explanations read aloud (default yes). Check it before any automatic speech. */
export function speechWanted(): boolean {
  return readJSON<boolean>(SPEECH_PREF_KEY, true) !== false;
}

/**
 * Whether the learner allowed the AI helper. Check this before every `ai.ask` / `ai.askJson`: when
 * it is false nothing may be sent. Offer instead a link to `#profile--settings--ai` that says what
 * turning it on would do, so the screen is never a dead end.
 */
export function aiAllowed(prefs: Preferences = learnerPrefs()): boolean {
  return prefs.ai.enabled === true;
}

/** Route params that open Settings on the AI helper group: `href('profile', ...AI_SETTINGS_PARAMS)`. */
export const AI_SETTINGS_PARAMS = ['settings', 'ai'] as const;

/** Whether the camera view should be mirrored (as a selfie camera usually is). */
export function cameraMirrored(prefs: Preferences = learnerPrefs()): boolean {
  return prefs.camera.mirrored;
}

/** The camera the learner chose, or undefined for the system default. */
export function cameraDeviceId(prefs: Preferences = learnerPrefs()): string | undefined {
  return prefs.camera.deviceId ?? undefined;
}

/** Whether to show standard notation under tab (the learner chose "Tab and notation"). */
export function showNotation(prefs: Preferences = learnerPrefs()): boolean {
  return prefs.notation === 'tab+notation';
}

/** Highest fret to draw on a full-neck view (12–24). */
export function fretCount(prefs: Preferences = learnerPrefs()): number {
  return prefs.fretboard.frets;
}

/** The learner's chosen guitar sound and click, under the audio engine's own names. */
export function soundPrefs(prefs: Preferences = learnerPrefs()): { guitarTone: string; clickSound: string; volume: number } {
  return { guitarTone: prefs.sound.guitarTone, clickSound: prefs.sound.clickSound, volume: prefs.sound.volume };
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
}

/**
 * The app-wide default guitar tone and metronome click: what the shared guitar (`pluck`, `strum`,
 * `getGuitar()`, the song player) plays and what a new `Metronome` clicks with when a screen does
 * not choose. They follow the learner's Settings (`prefs.sound.guitarTone` / `clickSound`), so no
 * screen has to remember to pass them. A screen that offers its own choice still wins: a `tone` on
 * the note, `getGuitar().tone = …`, or `metronome.sound = …`.
 *
 * The values come from a source function. In the running app the module connects itself to
 * `@/core/settings` (`soundPrefs()`); it is loaded lazily because the progress store already
 * depends on this module, so a static import would be a cycle.
 */
import { normalizeClickSet, type ClickSet } from './percussion';
import { normalizeTone, type ToneName } from './tones';

/** The defaults in force, under the engine's own names. */
export interface SoundDefaults {
  guitarTone: ToneName;
  clickSound: ClickSet;
}

/** Where the defaults come from: stored setting names (aliases such as `acoustic` or `wood` are fine). */
export type SoundDefaultsSource = () => { guitarTone?: unknown; clickSound?: unknown } | null | undefined;

/** The defaults when nothing says otherwise (the engine's own: a steel-string guitar, a woodblock). */
export const BUILT_IN_SOUND_DEFAULTS: Readonly<SoundDefaults> = { guitarTone: 'steel', clickSound: 'woodblock' };

let source: SoundDefaultsSource | null = null;
let wiring: Promise<void> | null = null;

/** Replace where the defaults come from (null = the built-in ones). Tests and galleries use this. */
export function setSoundDefaultsSource(next: SoundDefaultsSource | null): void {
  source = next;
}

/** The default guitar tone and click right now. Never throws; unknown names fall back to the built-in ones. */
export function soundDefaults(): SoundDefaults {
  let raw: ReturnType<SoundDefaultsSource> = null;
  try {
    raw = source ? source() : null;
  } catch {
    raw = null;
  }
  return {
    guitarTone: normalizeTone(raw?.guitarTone, BUILT_IN_SOUND_DEFAULTS.guitarTone),
    clickSound: normalizeClickSet(raw?.clickSound, BUILT_IN_SOUND_DEFAULTS.clickSound),
  };
}

/**
 * Follow the learner's Settings (`soundPrefs()` from `@/core/settings`). Runs by itself when this
 * module loads in the app; call and await it where that does not happen (unit tests). A source set
 * with `setSoundDefaultsSource` first is kept.
 */
export function connectSoundDefaults(): Promise<void> {
  wiring ??= import('@/core/settings').then(
    (settings) => {
      source ??= () => settings.soundPrefs();
    },
    () => {
      // Settings could not load (a broken build, a test without it): the built-in defaults stay.
      wiring = null;
    },
  );
  return wiring;
}

// In the running app (not in unit tests, which connect explicitly, nor in Node or a worker).
if (typeof window !== 'undefined' && typeof document !== 'undefined' && import.meta.env.MODE !== 'test') void connectSoundDefaults();

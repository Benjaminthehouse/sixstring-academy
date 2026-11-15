/**
 * Interface sounds for the shell's feedback, through the audio engine if it is there.
 *
 * The engine is a big lazy chunk that not every build or test has, so it is loaded with a dynamic
 * import that is allowed to fail: without it the app is simply silent. Nothing here creates an
 * AudioContext by itself; the engine's own unlock hook does that on the learner's first tap.
 */
import type { FeedbackSound } from './digest';

/** The few engine functions the shell uses. Every one is optional: the engine may be older or absent. */
interface AudioModule {
  playUi?: (name: string, options?: { volume?: number }) => void;
  installAudioUnlock?: () => unknown;
  hasEngine?: () => boolean;
  setMasterVolume?: (volume: number) => void;
  setBusMuted?: (bus: string, muted: boolean) => void;
}

let loading: Promise<AudioModule | null> | null = null;
let loaded: AudioModule | null = null;

function loadAudio(): Promise<AudioModule | null> {
  if (!loading) {
    loading = import('@/core/audio')
      .then((mod) => {
        loaded = mod as unknown as AudioModule;
        return loaded;
      })
      .catch(() => null);
  }
  return loading;
}

/**
 * Get the engine ready in the background: load it when the browser is idle and let it unlock
 * itself on the first tap or key press. Safe to call more than once.
 */
export function prepareShellSounds(): void {
  if (typeof window === 'undefined') return;
  const start = () => {
    void loadAudio().then((mod) => {
      try {
        mod?.installAudioUnlock?.();
      } catch {
        // Sounds are optional.
      }
    });
  };
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(start, { timeout: 3000 });
  else window.setTimeout(start, 1200);
}

/** Play a feedback sound if sounds are on and the engine is running. Never throws. */
export function playShellSound(name: FeedbackSound, enabled: boolean, volume = 1): void {
  if (!enabled) return;
  const play = (mod: AudioModule | null) => {
    try {
      // No engine yet means the learner has not touched the page: nothing may sound anyway.
      if (!mod?.playUi || mod.hasEngine?.() === false) return;
      mod.playUi(name, { volume });
    } catch {
      // A feedback sound is never worth an error.
    }
  };
  if (loaded) play(loaded);
  else void loadAudio().then(play);
}

/** The learner's sound settings the shell keeps the engine in line with. */
export interface SoundSettings {
  /** Master volume, 0 to 1. */
  volume: number;
  /** Interface sounds (answers, rewards) on or off. */
  uiSounds: boolean;
}

/**
 * Hand the learner's sound settings to the engine: the master volume, and the interface-sound bus
 * muted when those sounds are switched off (so the setting holds for every screen's `playUi`, not
 * only the shell's). Returns false while there is no engine yet; it is never created from here.
 */
export function applySoundSettings(settings: SoundSettings): boolean {
  try {
    if (!loaded?.hasEngine?.()) return false;
    loaded.setMasterVolume?.(Math.min(1, Math.max(0, settings.volume)));
    loaded.setBusMuted?.('ui', !settings.uiSounds);
    return true;
  } catch {
    return false;
  }
}

/**
 * The engine only comes to life on the learner's first tap (or when a screen first plays
 * something), so the settings cannot be applied at startup. This waits for it: after each tap or
 * key press it tries once more, and stops as soon as it has succeeded. Returns the cleanup.
 */
export function applySoundSettingsWhenReady(getSettings: () => SoundSettings): () => void {
  if (typeof window === 'undefined') return () => undefined;
  let stopped = false;
  const events = ['pointerdown', 'keydown'] as const;
  const stop = () => {
    stopped = true;
    for (const type of events) window.removeEventListener(type, onGesture, true);
  };
  function onGesture(): void {
    // After the other listeners of this event: the engine's own unlock hook creates it there.
    window.setTimeout(() => {
      if (!stopped && applySoundSettings(getSettings())) stop();
    }, 0);
  }
  for (const type of events) window.addEventListener(type, onGesture, { capture: true, passive: true });
  return stop;
}

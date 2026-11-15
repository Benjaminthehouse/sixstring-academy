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

import { useState } from 'react';
import { audioState, isMuted, setMuted, unlockAudio, type AudioState } from '@/core/audio';
import { setPrefs, useProgress } from '@/core/progress';
import { Banner, Button, useInterval } from '@/ui';

/** What stands between the learner and hearing anything. */
export type SoundProblem = 'unsupported' | 'locked' | 'muted' | null;

/** The current sound problem, kept up to date (the engine has no change event to subscribe to, so it is polled gently). */
export function useSoundProblem(): SoundProblem {
  const volume = useProgress((s) => s.prefs.sound.volume);
  const [state, setState] = useState<AudioState>(() => audioState());
  const [muted, setMutedState] = useState(() => isMuted());
  useInterval(() => {
    setState(audioState());
    setMutedState(isMuted());
  }, 800);
  if (state === 'unsupported') return 'unsupported';
  if (volume <= 0 || muted) return 'muted';
  if (state === 'locked') return 'locked';
  return null;
}

/** Turn sound on: unmute, a sensible volume if it was at zero, and start audio (call from a tap). */
export async function fixSound(volume: number): Promise<void> {
  if (volume <= 0) setPrefs({ sound: { volume: 0.8 } });
  setMuted(false);
  await unlockAudio();
}

/** A banner that says plainly why nothing can be heard, with a one-tap fix. Renders nothing when sound is fine. */
export function SoundStatus({ problem }: { problem: SoundProblem }) {
  const volume = useProgress((s) => s.prefs.sound.volume);
  if (!problem) return null;
  if (problem === 'unsupported') {
    return (
      <Banner tone="warn" title="This browser cannot play sound" icon="VolumeX" live>
        Ear training needs sound. Open the app in a current version of Chrome, Safari, Edge or Firefox.
      </Banner>
    );
  }
  if (problem === 'muted') {
    return (
      <Banner
        tone="warn"
        title="Your sound is off"
        icon="VolumeX"
        live
        actions={
          <Button size="sm" variant="primary" iconLeft="Volume2" onClick={() => void fixSound(volume)} data-ear-fix-sound>
            Turn sound on
          </Button>
        }
      >
        The app’s volume is at zero, so the questions would be silent.
      </Banner>
    );
  }
  return (
    <Banner
      tone="info"
      title="Sound has not started yet"
      icon="Volume2"
      live
      actions={
        <Button size="sm" variant="primary" iconLeft="Play" onClick={() => void fixSound(volume)} data-ear-fix-sound>
          Start sound
        </Button>
      }
    >
      Browsers wait for a tap before they play anything. One tap and you are set.
    </Banner>
  );
}

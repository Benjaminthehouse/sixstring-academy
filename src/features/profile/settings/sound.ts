/**
 * The sounds the settings screen makes: applying the master volume and the test buttons. The audio
 * engine is a large lazy chunk, so it is loaded the first time a control here needs it. Nothing
 * here throws: without Web Audio the functions resolve and stay silent.
 */
type AudioModule = typeof import('@/core/audio');

let loading: Promise<AudioModule | null> | null = null;

function loadAudio(): Promise<AudioModule | null> {
  if (!loading) loading = import('@/core/audio').catch(() => null);
  return loading;
}

/** Load the engine and wake it (call from a click or key handler). Null when there is no audio. */
async function ready(): Promise<AudioModule | null> {
  const audio = await loadAudio();
  if (!audio) return null;
  try {
    await audio.unlockAudio();
  } catch {
    // A refused unlock leaves the context suspended; the play functions then stay silent.
  }
  return audio;
}

/** E major, low to high: a full, familiar chord to judge a tone and a volume by. */
const E_MAJOR = [40, 47, 52, 56, 59, 64];

/**
 * Hand the master volume to the engine right away. The engine remembers it even before it has
 * started, so the first note of the session already plays at the chosen level.
 */
export async function applyVolume(volume: number): Promise<void> {
  const audio = await loadAudio();
  audio?.setMasterVolume(Math.min(1, Math.max(0, volume)));
}

/** Mute or unmute the interface-sound bus right away. */
export async function applyUiSounds(on: boolean): Promise<void> {
  const audio = await loadAudio();
  audio?.setBusMuted('ui', !on);
}

/** Strum a chord in a guitar tone at the current volume. */
export async function playToneTest(tone: string): Promise<void> {
  const audio = await ready();
  if (!audio) return;
  audio.stopAll();
  audio.strum(E_MAJOR, undefined, { direction: 'down', velocity: 0.8, tone: audio.normalizeTone(tone), spread: 0.035 });
}

/** One bar of a metronome click sound: an accent and three beats at 120 BPM. */
export async function playClickTest(set: string): Promise<void> {
  const audio = await ready();
  if (!audio) return;
  const sound = audio.normalizeClickSet(set);
  const start = audio.audioNow() + 0.05;
  for (let beat = 0; beat < 4; beat++) audio.playClick(sound, beat === 0 ? 'accent' : 'beat', start + beat * 0.5);
}

/** The "correct answer" chime, as a sample of the interface sounds. */
export async function playUiTest(): Promise<void> {
  const audio = await ready();
  audio?.playUi('correct');
}

/** The reference note A4 at a concert pitch, for two seconds. */
export async function playReferenceTest(a4: number): Promise<void> {
  const audio = await ready();
  if (!audio) return;
  audio.playTone(69, undefined, { voice: 'reference', a4, duration: 2 });
}

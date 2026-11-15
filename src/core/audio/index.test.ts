import { describe, expect, it } from 'vitest';
import * as audio from './index';

describe('audio barrel', () => {
  it('imports in Node without touching Web Audio', () => {
    // Nothing here may have created a context: there is no AudioContext in Node at all.
    expect((globalThis as { AudioContext?: unknown }).AudioContext).toBeUndefined();
    expect(audio.audioSupported()).toBe(false);
    expect(audio.hasEngine()).toBe(false);
    expect(audio.audioNow()).toBe(0);
    expect(audio.getMasterVolume()).toBeGreaterThan(0);
    expect(audio.isMuted()).toBe(false);
    expect(audio.getOutputLevel()).toEqual({ rms: 0, peak: 0 });
    expect(audio.offlineSupported()).toBe(false);
  });

  it('fails clearly, not mysteriously, when live audio is asked for without a browser', () => {
    expect(() => audio.getEngine()).toThrow(/Web Audio/);
    expect(() => audio.pluck(60)).toThrow(/Web Audio/);
    // Interface sounds never throw: UI code calls them unconditionally.
    expect(() => audio.playUi('correct')).not.toThrow();
  });

  it('unlockAudio resolves false where there is no audio', async () => {
    await expect(audio.unlockAudio()).resolves.toBe(false);
  });

  it('renders a WAV in Node', () => {
    const samples = audio.renderPluck({ midi: 45, sampleRate: 44100, tone: 'steel' });
    const wav = audio.encodeWav(samples, 44100);
    expect(wav.length).toBe(44 + samples.length * 2);
    const back = audio.decodeWav(wav);
    const est = audio.estimatePitch(back.channels[0], 44100, { start: 4410, length: 16384 });
    expect(Math.abs(audio.centsFromMidi(est!.hz, 45))).toBeLessThan(0.5);
  });

  it('exports the documented surface', () => {
    const names = [
      'unlockAudio', 'installAudioUnlock', 'getEngine', 'getAudioContext', 'audioNow', 'audioSoundingNow', 'setMasterVolume', 'setMuted', 'setBusVolume', 'setBusMuted',
      'getAnalyser', 'getOutputLevel', 'scheduleVisual', 'renderOffline', 'pluck', 'strum', 'stopAll', 'playBass', 'GuitarSynth', 'getGuitar', 'renderPluck', 'renderStrum',
      'renderSequence', 'encodeWav', 'decodeWav', 'playDrum', 'playClick', 'playTone', 'playChord', 'playUi', 'startDrone', 'DrumKit', 'Transport', 'Timeline', 'Metronome',
      'TapTempo', 'BackingBand', 'arrangeBacking', 'BACKING_STYLES', 'BACKING_STYLE_IDS', 'PPQ', 'estimatePitch', 'measureFundamental',
    ];
    for (const n of names) expect(audio, n).toHaveProperty(n);
    expect(audio.PPQ).toBe(960);
    expect(audio.BACKING_STYLE_IDS.length).toBe(14);
    expect(audio.DRUM_NAMES.length).toBeGreaterThanOrEqual(13);
    expect(audio.CLICK_SETS.length).toBeGreaterThanOrEqual(4);
  });
});

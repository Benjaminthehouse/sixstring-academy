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

  it('where there is no Web Audio, playing is a silent no-op with a clear answer, never an exception', () => {
    expect(audio.audioState()).toBe('unsupported');
    // Asking for the engine itself has no sensible fallback: that fails, clearly.
    expect(() => audio.getEngine()).toThrow(/Web Audio/);
    expect(() => audio.getAudioContext()).toThrow(/Web Audio/);
    // Everything a screen calls to make sound just does nothing (a component under test in jsdom,
    // a prerender, a browser without audio).
    const h = audio.pluck(60, 1, { duration: 0.2 });
    expect(h.queued).toBe(false);
    expect(() => h.stop()).not.toThrow();
    expect(audio.strum([40, 47, 52]).length).toBe(3);
    expect(() => audio.stopAll()).not.toThrow();
    expect(() => audio.playBass(33).stop()).not.toThrow();
    expect(audio.playDrum('kick')).toBe(false);
    expect(audio.playUi('correct')).toBe(false);
    expect(() => audio.playClick('woodblock', 'accent')()).not.toThrow();
    expect(audio.playTone(57).freq).toBe(0);
    expect(audio.playChord([57, 60, 64]).length).toBe(3);
    const drone = audio.startDrone({ root: 45 });
    expect(drone.running).toBe(false);
    expect(() => { drone.setRoot(47); drone.stop(); }).not.toThrow();
    expect(audio.hasEngine()).toBe(false);
  });

  it('volumes set before the engine exists are remembered, and do not create it', () => {
    audio.setMasterVolume(0.4);
    audio.setMuted(true);
    audio.setBusVolume('guitar', 0.5);
    audio.setBusMuted('ui', true);
    audio.setBusVolume('nope' as never, 2);
    audio.setMasterVolume(NaN);
    expect(audio.hasEngine()).toBe(false);
    expect(audio.getMasterVolume()).toBe(0.4);
    expect(audio.isMuted()).toBe(true);
    audio.setMuted(false);
    audio.setMasterVolume(0.85);
    expect(audio.isMuted()).toBe(false);
  });

  it('a metronome and a transport still run (silently, on the wall clock) without Web Audio', () => {
    const m = new audio.Metronome({ tempo: 120, timer: 'manual' });
    const beats: number[] = [];
    m.onSchedule((b) => beats.push(b.time));
    expect(() => { m.start(); m.transport.process(); }).not.toThrow();
    expect(m.running).toBe(true);
    expect(beats.length).toBeGreaterThan(0);
    expect(Number.isFinite(beats[0])).toBe(true);
    expect(() => { m.setTempo(90); m.stop(); m.dispose(); }).not.toThrow();
    const band = new audio.BackingBand({ timer: 'manual' });
    const C = audio.chordFromIntervals(0, [4, 7], 'C');
    expect(() => {
      band.load([C, C], { style: 'pop-rock' });
      band.start();
      band.transport.process();
      band.pause();
      band.resume();
      band.stop();
      band.dispose();
    }).not.toThrow();
    let ran = false;
    audio.scheduleVisual(0, () => { ran = true; });
    expect(ran).toBe(false); // asynchronously, never inside the caller
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
      'audioState', 'audioRunning', 'audioSupported', 'hasEngine', 'onAudioUnlocked', 'onAudioClosed', 'normalizeTone', 'normalizeClickSet', 'isDrumName', 'TONE_NAMES',
      'finiteOr', 'AudioEngine', 'BufferCache', 'engineClock', 'closeAudio', 'renderRawPluck', 'renderDrum', 'renderClick', 'renderTone', 'renderDrone', 'renderUiSound',
    ];
    for (const n of names) expect(audio, n).toHaveProperty(n);
    expect(audio.PPQ).toBe(960);
    expect(audio.BACKING_STYLE_IDS.length).toBe(14);
    expect(audio.DRUM_NAMES.length).toBeGreaterThanOrEqual(13);
    expect(audio.CLICK_SETS.length).toBeGreaterThanOrEqual(4);
  });
});

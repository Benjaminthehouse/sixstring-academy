/**
 * Audio engine barrel. Import from `@/core/audio`; read API.md next to this file first.
 * Importing this never touches Web Audio: the AudioContext is created on first use, and the pure
 * renderers (renderPluck, encodeWav, arrangeBacking, Timeline ...) work in Node.
 */

// Context, mixer, unlock, analysis tap
export {
  AudioEngine, BUS_NAMES, BufferCache,
  audioNow, audioRunning, audioSoundingNow, audioState, audioSupported, closeAudio, engineClock, getAnalyser, getAudioContext, getEngine,
  getMasterVolume, getOutputLevel, hasEngine, installAudioUnlock, isMuted, makeRoomImpulse, onAudioClosed, onAudioUnlocked, scheduleVisual, setBusMuted, setBusVolume,
  setMasterVolume, setMuted, unlockAudio,
} from './engine';
export type { AudioState, BusName, EngineOptions, OutputLevel } from './engine';
export { offlineSupported, renderOffline } from './offline';
export type { OfflineRender, OfflineRenderOptions } from './offline';

// The learner's default guitar tone and click (Settings), used when a screen does not choose
export { BUILT_IN_SOUND_DEFAULTS, connectSoundDefaults, setSoundDefaultsSource, soundDefaults } from './defaults';
export type { SoundDefaults, SoundDefaultsSource } from './defaults';

// Guitar and bass synth
export { GuitarSynth, getBass, getGuitar, playBass, pluck, stopAll, strum } from './guitar';
export type { GuitarSynthOptions, PlayOptions, PlayStrumOptions, VoiceHandle } from './guitar';
export { applyFx, renderPluck, renderRawPluck, renderSequence, renderStrum, strumPlan } from './pluck';
export type { PluckOptions, PluckSpec, RawPluck, SequenceNote, SequenceOptions, StrumNote, StrumOptions, StrumRenderOptions } from './pluck';
export { INSTRUMENTS, TONE_NAMES, locateOnNeck, normalizeTone, resolveTone, velocityGain } from './tones';
export type { Articulation, BassTone, GuitarTone, InstrumentDef, StringInstrument, ToneName } from './tones';
export { designLoop, loopT60 } from './string-model';
export type { LoopDesign, LoopTargets } from './string-model';

// Drums, clicks, tones, drone, interface sounds
export { DrumKit, drumGain, getDrums, playChord, playClick, playDrum, playTone, playUi, preloadClicks, startDrone } from './voices';
export type { DroneHandle, DroneStartOptions, ToneHandle, ToneOptions, UiSoundOptions } from './voices';
export { CLICK_SETS, DRUM_NAMES, isDrumName, normalizeClickSet, renderClick, renderDrum } from './percussion';
export type { ClickLevel, ClickSet, DrumName } from './percussion';
export { TONE_VOICES, droneLayers, renderDrone, renderTone } from './keys';
export type { DroneLayer, DroneOptions, ToneSpec, ToneVoice } from './keys';
export { UI_SOUNDS, renderUiSound } from './ui-sounds';
export type { UiSound } from './ui-sounds';

// Musical time
export { PPQ, Timeline, defaultAccents, defaultGrouping, formatPosition, fromQuarterBpm, parseTimeSignature, resolveMeter, toQuarterBpm } from './timeline';
export type { AccentLevel, BarBeatTick, Meter, MeterBeat, MeterChange, MusicalPosition, Swing, TempoPoint, TimeSignature, TimelineInit } from './timeline';
export { Transport, beatTempo } from './transport';
export type { BarEvent, BeatEvent, EventSource, ScheduledCallback, TickLike, TransportClock, TransportEventMap, TransportOptions, TransportPosition, TransportState } from './transport';
export { VisualQueue } from './visual-sync';
export { MAX_TEMPO, MIN_TEMPO, Metronome, SUBDIVISIONS, TapTempo, clickPattern, isSilentBar, speedTrainerBpm, speedTrainerLength, subdivisionOffsets } from './metronome';
export type { Click, MetronomeBeat, MetronomeOptions, MetronomeOutput, SilentBarsConfig, SpeedTrainerConfig, Subdivision } from './metronome';

// Backing band
export { BACKING_INSTRUMENTS, arrangeBacking, bassHome, chordFromIntervals, chordIntervals, guitarVoicing, isChordTone, keysVoicing, layoutProgression, powerChord, styleQuarterBpm } from './backing';
export type { ArrangeOptions, BackingArrangement, BackingBar, BackingChord, BackingEvent, BackingInstrument, BassEvent, BassRole, ChordSegment, DrumEvent, GuitarEvent, GuitarVoicing, KeysEvent } from './backing';
export { BACKING_STYLES, BACKING_STYLE_IDS } from './backing-styles';
export type { BackingStyle, BackingStyleId } from './backing-styles';
export { BackingBand, liveBandOutput } from './backing-band';
export type { BackingBandOptions, BackingOptions, BandOutput, ChordChange } from './backing-band';

// Files and measurement
export { decodeWav, encodeWav } from './wav';
export type { DecodedWav, WavOptions } from './wav';
export { attackTime, centsFromMidi, decaySlopeDb, decayTime, envelope, estimatePitch, findOnsets, harmonicAmplitudes, hasBadSamples, measureFundamental, spectralCentroid } from './analysis';
export type { PitchEstimate } from './analysis';
export { Rng, biquadCoeffs, biquadFilter, dbToGain, fft, finiteOr, gainToDb, hashSeed, magnitudeSpectrum, peakOf, rmsOf } from './dsp';
export type { BiquadCoeffs, BiquadSpec, BiquadType } from './dsp';

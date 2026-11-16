/**
 * Pitch detection, the live microphone pipeline, tuner logic, onsets, chord checking, game
 * helpers and test signals. Read API.md next to this file before using the module.
 */
export { FFT, fftPlan, hannWindow, magnitudeSpectrum, nextPow2 } from './fft';
export { type PitchDetectorOptions, type PitchEstimate, PitchDetector, detectPitch } from './detector';
export { type NoiseGateOptions, NoiseGate, fromDb, toDb } from './level';
export { type OnsetOptions, OnsetDetector, detectOnsets } from './onset';
export { type NoteTrackerOptions, type TrackerFrame, NoteTracker, isMainsPitch } from './note-tracker';
export { type ChromaFrame, type ChromaOptions, ChromaExtractor, computeChroma } from './chroma';
export {
  type ChordMatch,
  type ChordMatchOptions,
  type ChordSpec,
  averageChroma,
  matchChord,
  pitchClassesOf,
  rankChords,
  requiredTones,
} from './chords';
export { type AnalyzeOptions, type EngineConfigPatch, type PitchEngineOptions, PitchEngine, analyze } from './engine';
export {
  type PitchTrackerOptions,
  type TrackerFault,
  type TrackerInfo,
  type TrackerStartResult,
  type TrackerStatus,
  PitchTracker,
} from './tracker';
export {
  type TunerHint,
  type TunerHintCode,
  type TunerMode,
  type TunerOptions,
  type TunerReading,
  type TunerState,
  STANDARD_TUNING_MIDI,
  Tuner,
  attachTuner,
  tuningFrequencies,
} from './tuner';
export {
  type Cancelable,
  type ChordWaitResult,
  type NoteAlignment,
  type NoteComparison,
  type NoteRecorderOptions,
  type NoteWaitResult,
  type RecordedNote,
  type WaitFailure,
  type WaitForChordOptions,
  type WaitForNoteOptions,
  type WaitOptions,
  NoteRecorder,
  compareNotes,
  waitForChord,
  waitForNote,
} from './expect';
export {
  type ChromaEvent,
  type LevelEvent,
  type NoteOffEvent,
  type NoteOnEvent,
  type OnsetEvent,
  type PitchEvent,
  type PitchEventMap,
  type PitchEventType,
  type PitchReading,
  type PitchSource,
  type SilenceEvent,
  EventHub,
} from './types';
export {
  type HarmonicToneOptions,
  type HumOptions,
  type PluckOptions,
  type StrumOptions,
  type WavData,
  type WavOptions,
  addHum,
  addNoise,
  concat,
  decodeWav,
  encodeWav,
  gaussian,
  harmonicTone,
  mix,
  partialFrequency,
  pluckedString,
  rmsOf,
  seededRandom,
  silence,
  strum,
  whiteNoise,
} from './signals';

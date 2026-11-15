/**
 * The song core: model, SixTab authoring format, importers (text tab, chord sheets, MusicXML,
 * MIDI, Guitar Pro), arranger, exporters, statistics and difficulty, the SongPlayer and the
 * wait/flow practice modes. Import from `@/core/song`; read API.md beside this file first.
 *
 * Heavy libraries (alphaTab, @tonejs/midi, jszip) load on demand inside the importers. Importing
 * this barrel never touches Web Audio: the player creates sound only when it plays.
 */

// Model
export * from './types';
export {
  MAX_FRET, WHOLE, barCapacity, barLength, capoShape, chordAt, cloneSong, createSong, findTrack, formatTimeSig, isRest, measureTicks, midiOf,
  parseTimeSig, restBeats, slugify, sortSongLists, soundingPitch, splitTicks, tempoAtBar, trackCapo, trackTuning, tupletNormal, uniqueId,
  valueFromTicks, valueTicks,
} from './model';
export type { CreateSongInit } from './model';
export { assertValidSong, describeTicks, isValidSong, validateSong } from './validate';
export type { ValidateOptions } from './validate';
export { SongTimeline, TempoMap, flattenSong, playbackOrder, songDuration } from './timeline';
export type { FlattenOptions, TempoPoint as TimelineTempoPoint, TimelineBar, TimelineBeat, TimelineChord, TimelineSection } from './timeline';

// SixTab
export { SixTabSyntaxError, formatSixTabError, parseSixTab, sixTab } from './sixtab-parse';
export type { SixTabError, SixTabParseOptions, SixTabResult } from './sixtab-parse';
export { durationToken, sixTabLosses, toSixTab } from './sixtab-write';
export type { SixTabWriteOptions } from './sixtab-write';
export { AMAZING_GRACE, CAMPFIRE_GROOVE, ODE_TO_JOY, SONG_EXAMPLES, TECHNIQUE_SAMPLER } from './examples';

// Transformations, statistics, difficulty
export { allNotes, extractBars, extractSection, practiceVariants, retuneSong, strumBeats, transposeKey, transposeSong, withStrumTrack, withTempoPercent } from './transform';
export type { ExtractOptions, RetuneOptions, TransposeOptions } from './transform';
export { bandName, difficultyBand, estimateDifficulty, getTrackStats, noteTechniques, songStats } from './stats';
export type { DifficultyBand, DifficultyEstimate, DifficultyFactors, SongStats, TechniqueName, TrackStats } from './stats';

// Arranger
export { arrangeLine, arrangeSong, arrangeTrack, spellTrack } from './arranger';
export type { ArrangeOptions, ArrangeResult, SpelledNote } from './arranger';

// Importers
export { buildMeasures, chooseGrid, quantize } from './import-util';
export type { BuildOptions, Onset, OnsetNote } from './import-util';
export { importAsciiTab, isChordLine, isChordWord } from './import-ascii';
export type { AsciiTabOptions } from './import-ascii';
export { importChordPro, importChordSheet, isChordPro, isNashvilleChart, nashvilleChord } from './import-chords';
export type { ChordSheetOptions } from './import-chords';
export { harmonySymbol, importMusicXml, importMxl } from './import-musicxml';
export type { MusicXmlOptions } from './import-musicxml';
export { importMidi, listMidiTracks } from './import-midi';
export type { MidiImportOptions, MidiTrackInfo } from './import-midi';
export { convertAlphaTabScore, importGuitarPro, loadGuitarProScore } from './import-gp';
export type { GuitarProOptions } from './import-gp';
export { FORMAT_NAMES, SONG_FILE_ACCEPT, decodeText, detectFormat, detectTextFormat, importSong } from './import-any';
export type { ImportSongOptions, SongFormat, SongInput } from './import-any';

// Exporters
export { toMusicXml } from './export-musicxml';
export { SONG_JSON_FORMAT, SONG_JSON_VERSION, songFromJson, songToJson, toAsciiTab } from './export-text';
export type { AsciiTabWriteOptions } from './export-text';

// Playback and practice
export { buildPlayEvents, defaultVoicing } from './schedule';
export type { PlayArticulation, PlayEvent, PlayNote, PlayStrum, ScheduleOptions } from './schedule';
export { SongPlayer, liveOutput } from './song-player';
export type { LiveOutputOptions, PlayerPosition, PlayerState, SongPlayerEvent, SongPlayerOptions, SongPlayerOutput, TempoRamp } from './song-player';
export {
  DEFAULT_FLOW_WINDOWS, FlowMode, WaitMode, centsOff, chromaMatches, chromaScore, flowTargets, matchNote, pitchClassScore, practiceTargets, weakBarRanges,
} from './practice';
export type {
  BarHeat, FlowGrade, FlowJudgement, FlowModeOptions, FlowResult, FlowTarget, FlowWindows, FretPositionLike, HeardChroma, HeardNote,
  PracticeTarget, WaitModeOptions, WaitRecord, WaitResult,
} from './practice';

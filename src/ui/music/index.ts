/**
 * The music UI kit: the fretboard, chord diagrams, the circle of fifths, standard notation, a
 * piano keyboard, rhythm and strumming grids, and small note / interval / degree / tuning pieces.
 * Import from here: `import { Fretboard, scaleMarkers, ChordDiagram } from '@/ui/music'`.
 * `API.md` beside this file is the digest; `#kit-music` is the live gallery.
 *
 * Tablature lives in `@/ui/music/tab` (its own module).
 */
export * from './types';
export * from './format';
export * from './settings';

export { Fretboard, Marker, MarkerShape, TargetPulses, coveredInlays, markerDescription, type FretboardProps, type FretCell, type FretBox, type FretboardSize, type MarkerProps } from './fretboard/Fretboard';
export * from './fretboard/markers';
export {
  boardLayout,
  fitFrets,
  fretFractions,
  fretNumbersFor,
  inlaysInRange,
  moveOnBoard,
  stringLook,
  type BoardLayout,
  type BoardLayoutInput,
  type BoardOrientation,
  type BoardDirection,
  type FitInput,
  type FitResult,
  type FretSpacing,
  type StringLook,
} from './fretboard/layout';

export { ChordDiagram, type ChordDiagramProps, type ChordDiagramSize } from './chord/ChordDiagram';
export { chordBoxLayout, chordBoxGrid, type ChordBoxLayout, type ChordBoxInput, type ChordBoxDot, type ChordBoxBarre, type ChordBoxGrid } from './chord/layout';

export { CircleOfFifths, type CircleOfFifthsProps } from './circle/CircleOfFifths';
export { circleWedges, circleSlots, slotOfKey, signatureText, signatureWords, wedgeLabel, wedgePath, polar, moveOnCircle, type CircleRing, type WedgeInfo } from './circle/model';

export { NotationView, loadVexFlow, type NotationViewProps, type NotationClef } from './notation/NotationView';
export {
  parseNotation,
  normaliseItems,
  splitMeasures,
  measureAccidentals,
  signatureAlterations,
  keySpec,
  vexKey,
  breakLines,
  stretchLine,
  durationCode,
  noteTicks,
  type NotationNote,
  type NotationItem,
  type NotationDuration,
  type ParsedNote,
  type Measure,
  type AccidentalGlyph,
} from './notation/model';
export { spellLine, isBluesLine, type SpellEvent, type SpellLineOptions } from './notation/spell';

export { PianoKeys, type PianoKeysProps, type PianoHighlight, type PianoKeyPress } from './piano/PianoKeys';
export { pianoLayout, rangeAround, isBlackKey, type PianoKey } from './piano/layout';

export { RhythmView, rhythmNoteName, type RhythmViewProps } from './rhythm/RhythmView';
export { StrumPattern, type StrumPatternProps } from './rhythm/StrumPattern';
export { NoteGlyph, StrokeGlyph } from './rhythm/glyphs';
export {
  parseRhythm,
  rhythmGrid,
  gridStep,
  countSyllables,
  tripletSyllables,
  stepAt,
  parseStrum,
  strumSlotsPerBeat,
  strumSyllables,
  type RhythmNote,
  type RhythmGrid,
  type RhythmCell,
  type StrumStep,
  type StrokeKind,
  type StrumGridKind,
} from './rhythm/model';
export { barMarks, type BarNoteMarks, type BeamPiece } from './rhythm/engrave';

export { NoteBadge, IntervalBadge, DegreeLegend, TuningLabel, degreeName, type NoteBadgeProps, type IntervalBadgeProps, type DegreeLegendProps, type TuningLabelProps, type BadgeSize } from './badges/Badges';
export { TabView, TabSnippet, ScoreView, noteKey, type TabViewProps, type ScoreViewProps, type TabViewHandle, type TabSnippetProps, type TabCursor, type TabRange, type TabSeek, type TabNoteState, type TabSize } from './tab';

/**
 * Tablature: `TabView` (a track of a song as engraved tab, with rhythm, techniques, chords,
 * lyrics, an optional standard staff, a playback cursor, practice states, loops and selection),
 * `TabSnippet` (a few bars of SixTab inside lesson text) and the pure layout engine behind them.
 * Read API.md in `src/ui/music` (section "Tab").
 */
export { TabView, type TabViewProps, type TabViewHandle, type TabCursor, type TabRange, type TabSeek, type TabSize, type TabNoteState } from './TabView';
export { TabSnippet, snippetSource, type TabSnippetProps } from './TabSnippet';
export { ScoreView, type ScoreViewProps } from './ScoreView';
export { buildTabModel, noteKey, isBarRest, tempoText, type TabModel, type TabMeasure, type TabColumn, type TabNote, type TabChord, type TabModelOptions, type NoteRef, type ColumnFlags } from './model';
export {
  layoutTab,
  breakSystems,
  idealWidth,
  columnExtent,
  columnAtTick,
  xAtTick,
  locate,
  hitTest,
  columnSpan,
  barRangeRects,
  barBoundaryAt,
  measureOfBar,
  placeEffects,
  collectEffects,
  columnRuns,
  regionTop,
  regionBottom,
  systemAtY,
  type TabLayout,
  type TabLayoutOptions,
  type LaidMeasure,
  type LaidSystem,
  type LaidColumn,
  type LaidRow,
  type TabTile,
  type NotationSpacing,
  type EffectItem,
  type PlacedEffect,
} from './layout';
export { drawSystem, glyphsIn, type TabGlyph, type SystemDrawing, type GlyphClass } from './draw';
export { beamGroups, beamSegments, beamBoundaries, beamCount, tupletGroups, bendText, writtenTicks, type BeamSegment, type TupletGroup, type RhythmEvent } from './rhythm';
export { buildScore, scoreSpacing, writtenStep, regionMetrics, columnReach, type ScoreModel, type ScoreColumn, type ScoreMeasure } from './score';
export { RIVERSIDE_MORNING, longStudy } from './demo';
export { tabMetrics, estimateText, FONT_PX, EFFECT_H, ROW_ORDER, type TabMetrics, type TabFont, type TextMeasurer, type RowKind, type EffectKind } from './metrics';

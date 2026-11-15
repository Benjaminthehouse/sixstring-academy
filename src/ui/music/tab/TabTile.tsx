/**
 * One tile of the tab: a system (or a stretch of the single line) drawn as an SVG from the
 * layout's display list, with its chord diagrams and its notation staff. Memoised: it re-renders
 * only when the layout, its visibility or the states of its own notes change; the cursor and
 * highlights live in a separate layer.
 */
import { memo, useMemo, type ReactNode } from 'react';
import { chordVoicings } from '@/core/guitar';
import { capoShape } from '@/core/song';
import { ChordDiagram } from '../chord/ChordDiagram';
import { drawSystem, glyphsIn, type TabGlyph, type TabNoteGlyph } from './draw';
import type { TabLayout, TabTile as Tile } from './layout';
import { FONT_PX } from './metrics';
import styles from './TabView.module.css';

/** A learner's state for a note in practice modes. */
export type TabNoteState = 'upcoming' | 'target' | 'hit' | 'miss';

/** Props of `TabTile`. */
export interface TabTileProps {
  layout: TabLayout;
  tile: Tile;
  visible: boolean;
  /** States of notes on this tile, by `bar:beat:string` or `bar:beat`. */
  states: ReadonlyMap<string, TabNoteState> | null;
  /** Bumped when `states` changes (memo key). */
  statesKey: string;
  label: string;
  notation?: ReactNode;
}

const f1 = (v: number) => Math.round(v * 10) / 10;

function parenPath(x: number, y: number, half: number, z: number): string {
  const h = 5.4 * z;
  const l = x - half + 2.4 * z;
  const r = x + half - 2.4 * z;
  return `M${f1(l)} ${f1(y - h)}Q${f1(l - 2.6 * z)} ${f1(y)} ${f1(l)} ${f1(y + h)}M${f1(r)} ${f1(y - h)}Q${f1(r + 2.6 * z)} ${f1(y)} ${f1(r)} ${f1(y + h)}`;
}

function bracketPath(x: number, y: number, half: number, z: number): string {
  const h = 5 * z;
  const l = x - half + 2.8 * z;
  const r = x + half - 2.8 * z;
  return `M${f1(l)} ${f1(y - h)}L${f1(l - 2.4 * z)} ${f1(y)}L${f1(l)} ${f1(y + h)}M${f1(r)} ${f1(y - h)}L${f1(r + 2.4 * z)} ${f1(y)}L${f1(r)} ${f1(y + h)}`;
}

function NoteGlyph({ g, z, state }: { g: TabNoteGlyph; z: number; state?: TabNoteState }) {
  const fs = FONT_PX.fret * z;
  const pillH = fs * 0.76 + 4.4 * z;
  const pillW = g.half * 2 + 4 * z;
  return (
    <g className={styles.note} data-beat={g.beatKey} data-state={state}>
      {state && <rect className={styles.pill} x={f1(g.x - pillW / 2)} y={f1(g.y - pillH / 2)} width={f1(pillW)} height={f1(pillH)} rx={f1(pillH / 2.4)} />}
      {g.paren && <path className={styles.paren} d={parenPath(g.x, g.y, g.half, z)} />}
      {g.harmonic && <path className={styles.paren} d={bracketPath(g.x, g.y, g.half, z)} />}
      <text className={g.tied ? styles.fretTied : g.dead ? styles.fretDead : styles.fret} x={g.x} y={f1(g.y + fs * 0.36)}>
        {g.text}
      </text>
    </g>
  );
}

function renderGlyph(g: TabGlyph, i: number, z: number, states: ReadonlyMap<string, TabNoteState> | null): ReactNode {
  switch (g.k) {
    case 'path':
      return <path key={i} className={styles[g.c]} d={g.d} />;
    case 'text':
      return (
        <text key={i} className={styles[g.c]} x={g.x} y={g.y} textAnchor={g.anchor} style={g.fs ? { fontSize: g.fs } : undefined}>
          {g.text}
        </text>
      );
    case 'rect':
      return <rect key={i} className={styles[g.c]} x={f1(g.x)} y={f1(g.y)} width={f1(g.w)} height={f1(g.h)} rx={g.r ? f1(g.r) : undefined} />;
    case 'circle':
      return <circle key={i} className={styles[g.c]} cx={f1(g.cx)} cy={f1(g.cy)} r={f1(g.r)} />;
    case 'note':
      return <NoteGlyph key={i} g={g} z={z} state={states?.get(g.key) ?? states?.get(g.beatKey)} />;
  }
}

function useDiagramVoicing(symbol: string, shapeSymbol: string, frets: Array<number | null> | undefined, tuning: number[], capo: number) {
  return useMemo(() => {
    if (frets) return { frets };
    try {
      const v = chordVoicings(shapeSymbol, { tuning })[0];
      return v ? { voicing: v } : null;
    } catch {
      return null;
    }
    // capo and symbol are folded into shapeSymbol.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, shapeSymbol, frets, tuning, capo]);
}

function Diagram({ x, y, w, symbol, text, frets, layout }: { x: number; y: number; w: number; symbol: string; text: string; frets?: Array<number | null>; layout: TabLayout }) {
  const model = layout.model;
  const shapeSymbol = model.capo > 0 ? capoShape(symbol, model.capo) : symbol;
  const v = useDiagramVoicing(symbol, shapeSymbol, frets, model.tuning, model.capo);
  if (!v) return null;
  return (
    <div className={styles.diagram} style={{ left: x - w / 2, top: y, width: w }}>
      {'voicing' in v ? <ChordDiagram voicing={v.voicing} size="xs" title={false} aria-label={`${text} chord shape`} /> : <ChordDiagram frets={v.frets} chord={shapeSymbol} tuning={model.tuning} size="xs" title={false} aria-label={`${text} chord shape`} />}
    </div>
  );
}

/** One tile. See the module comment. */
export const TabTile = memo(
  function TabTile({ layout, tile, visible, states, label, notation }: TabTileProps) {
    const style = { left: tile.x, top: tile.y, width: tile.width, height: tile.height };
    if (!visible) return <div className={styles.tile} style={style} aria-hidden="true" />;
    const drawing = drawSystem(layout, tile.system);
    const line = layout.mode === 'line';
    const glyphs = line ? glyphsIn(drawing, tile.x - 4, tile.x + tile.width + 4) : drawing.glyphs;
    const z = layout.metrics.zoom;
    const diagrams = layout.options.diagrams ? drawing.diagrams.filter((d) => !line || (d.x >= tile.x && d.x < tile.x + tile.width)) : [];
    return (
      <div className={styles.tile} style={style} data-tile={tile.index}>
        {notation}
        <svg className={styles.svg} width={tile.width} height={tile.height} viewBox={`${f1(tile.x)} 0 ${f1(tile.width)} ${tile.height}`} role="img" aria-label={label}>
          {glyphs.map((g, i) => renderGlyph(g, i, z, states))}
        </svg>
        {diagrams.map((d, i) => (
          <Diagram key={i} x={d.x - tile.x} y={d.y} w={(layout.options.diagrams?.width ?? 56) * z} symbol={d.symbol} text={d.text} frets={d.voicing} layout={layout} />
        ))}
      </div>
    );
  },
  (a, b) => a.layout === b.layout && a.tile === b.tile && a.visible === b.visible && a.statesKey === b.statesKey && a.label === b.label && a.notation === b.notation,
);

/**
 * The fretboard: the instrument drawn in real materials (rosewood, nickel frets, a bone nut, pearl
 * inlays, strings that thicken toward the bass and turn bronze where they are wound), with note
 * markers, barres, a position box, a path between notes, open/muted marks at the nut and, for
 * tap-the-note games, a real focusable button on every string × fret cell.
 *
 * The static board is memoised and only redrawn when its geometry changes; markers and cells are
 * separate layers, so a game that changes a marker's state per tap re-renders only that layer.
 *
 *   <Fretboard frets={[5, 8]} markers={patternMarkers(box1)} />
 *   <Fretboard frets={[0, 12]} markers={scaleMarkers('C', 'major', { maxFret: 12 })} />
 *   <Fretboard frets={[0, 5]} onCellClick={(cell) => answer(cell.note)} cellLabels="position" />
 */
import { memo, useCallback, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { midiAt, noteAt, tuning as resolveTuning, type FretPosition, type SpellContext, type TuningInput } from '@/core/guitar';
import { cx, useElementSize } from '@/ui';
import { labelFontSize, noteText } from '../format';
import { useMusicSettings } from '../settings';
import tone from '../tone.module.css';
import type { FretboardInlay, FretboardWood, NoteNaming } from '../types';
import { boardLayout, fretNumbersFor, inlaysInRange, moveOnBoard, stringLook, type BoardLayout, type BoardOrientation, type FretSpacing, type Point } from './layout';
import { cellLabel, type FretBarre, type FretMarker } from './markers';
import styles from './Fretboard.module.css';

/** A tapped cell: where it is and what it sounds. `fret` counts from the capo. */
export interface FretCell extends FretPosition {
  midi: number;
  /** Spelled without octave, by `noteContext` when given. */
  note: string;
}

/** A highlighted span of frets: a scale position, a CAGED shape, "your hand goes here". */
export interface FretBox {
  /** First and last fret space covered (frets on the wood). */
  from: number;
  to: number;
  /** Strings covered, default all: `[1, 4]`. */
  strings?: readonly [number, number];
  /** A short caption above the box: `Box 1`, `5th position`. */
  label?: string;
}

/** Sizes: the distance between strings. `xl` gives 44 px touch rows. */
export type FretboardSize = 'sm' | 'md' | 'lg' | 'xl';

const STRING_GAP: Record<FretboardSize, number> = { sm: 20, md: 28, lg: 36, xl: 44 };

/** Props of `<Fretboard>`. Every prop is optional; the defaults draw frets 0–12 in standard tuning. */
export interface FretboardProps {
  /** Tuning id, name, notes or MIDI numbers (default standard). The string count follows it. */
  tuning?: TuningInput;
  /** Frets shown on the wood, inclusive: `[0, 12]` (default; with the open strings and nut), `[5, 9]`, `[0, 24]`. */
  frets?: readonly [number, number];
  /** Real fret spacing (default) or even spacing. Real spacing blends toward even when the high frets would get too narrow to read. */
  spacing?: FretSpacing;
  /** `horizontal` (default) or `vertical` (nut on top, like a chord box). */
  orientation?: BoardOrientation;
  /** Mirror for left-handed players (default: the learner's setting). */
  leftHanded?: boolean;
  /** String spacing (default `md`; `xl` when the cells are tappable). */
  size?: FretboardSize;
  /** Fret numbers under the board: the marker frets (default), every fret, or none. */
  fretNumbers?: 'inlays' | 'all' | 'none';
  /** Open-string names beside the nut (default true). */
  stringLabels?: boolean;
  /** A capo on this fret. Marker and cell frets then count from the capo, as tab and the guitar engine do. */
  capo?: number;
  /** The notes to show. */
  markers?: readonly FretMarker[];
  /** Barres drawn under the markers. */
  barres?: readonly FretBarre[];
  /** Strings marked `o` (played open) at the nut. */
  open?: readonly number[];
  /** Strings marked `×` (not played) at the nut. */
  muted?: readonly number[];
  /** A highlighted fret span. */
  box?: FretBox | null;
  /** Connect positions in order with a line: a list, or `markers` for the markers in their order. */
  path?: readonly FretPosition[] | 'markers' | null;
  /** Arrow heads on the path (default true). */
  pathArrows?: boolean;
  /** Makes every string × fret cell a button and reports taps. */
  onCellClick?: (cell: FretCell) => void;
  /** What a cell's accessible name says: the note too (default) or only the position (for "find the note" games). */
  cellLabels?: 'note' | 'position';
  /** Spelling of note names in cell labels and taps (`{ key: 'Eb major' }`); default the commonest name. */
  noteContext?: SpellContext;
  /** Note naming for string labels and cells (default: the learner's setting). */
  naming?: NoteNaming;
  /** Board wood (default: the learner's equipped wood). */
  wood?: FretboardWood;
  /** Inlay style (default: the learner's equipped inlays). */
  inlay?: FretboardInlay;
  /** Narrowest fret space in px before the board scrolls (default: room for a dot; 44 when tappable). */
  minFretWidth?: number;
  /** Widest fret space in px (default 3.9 string gaps). */
  maxFretWidth?: number;
  /** Accessible name of the drawing (default: "Fretboard, frets 0 to 12, 7 notes marked"). */
  'aria-label'?: string;
  className?: string;
}

/** The fretboard. See the module comment and `API.md`. */
export function Fretboard(props: FretboardProps) {
  const settings = useMusicSettings();
  const {
    tuning: tuningInput,
    frets = [0, 12] as const,
    spacing = 'proportional',
    orientation = 'horizontal',
    leftHanded = settings.leftHanded,
    fretNumbers = 'inlays',
    stringLabels = true,
    capo = 0,
    markers,
    barres,
    open,
    muted,
    box,
    path,
    pathArrows = true,
    onCellClick,
    cellLabels = 'note',
    noteContext,
    naming = settings.naming,
    wood = settings.wood,
    inlay = settings.inlay,
    minFretWidth,
    maxFretWidth,
    className,
  } = props;
  const interactive = !!onCellClick;
  const size = props.size ?? (interactive ? 'xl' : 'md');
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [sizeRef, { width: measured }] = useElementSize<HTMLDivElement>();
  const tuningObj = useMemo(() => resolveTuning(tuningInput), [tuningInput]);
  const stringCount = tuningObj.stringCount;

  // Room for the longest open-string name in the reader's naming (`Sol` is wider than `G`).
  const labelWidth = useMemo(() => Math.max(...tuningObj.notes.map((n) => [...noteText(n, naming)].length)) * 7.6 + 8, [tuningObj, naming]);
  const needsOpenColumn = (markers ?? []).some((m) => m.fret === 0 && capo === 0) || (open?.length ?? 0) > 0 || (muted?.length ?? 0) > 0;
  const [fromFret, toFret] = frets;
  const layout = useMemo(
    () =>
      boardLayout({
        stringCount,
        frets: [fromFret, toFret],
        width: measured,
        orientation,
        leftHanded,
        spacing,
        stringGap: STRING_GAP[size],
        minFret: minFretWidth ?? (interactive ? 44 : undefined),
        // Tappable boards are tall already; long frets would only spread the targets.
        maxFret: maxFretWidth ?? (interactive ? STRING_GAP[size] * 3 : undefined),
        stringLabels,
        labelWidth,
        fretNumbers: fretNumbers !== 'none',
        openColumn: needsOpenColumn,
        topGutter: box?.label && orientation === 'horizontal' ? 20 : 0,
        capo,
      }),
    [stringCount, fromFret, toFret, measured, orientation, leftHanded, spacing, size, minFretWidth, maxFretWidth, interactive, stringLabels, labelWidth, fretNumbers, needsOpenColumn, box?.label, capo],
  );

  const shownMarkers = useMemo(() => (markers ?? []).filter((m) => onBoard(layout, m.fret, capo)), [markers, layout, capo]);
  const ariaLabel = props['aria-label'] ?? describeBoard(layout, shownMarkers.length, capo);
  const covered = useMemo(() => coveredInlays(shownMarkers, stringCount, capo), [shownMarkers, stringCount, capo]);

  return (
    <div ref={sizeRef} className={cx(styles.root, className)} data-wood={wood} data-inlay={inlay} data-orientation={orientation}>
      <div
        className={styles.scroller}
        // A board that scrolls must be reachable by keyboard; one with buttons already is.
        tabIndex={layout.overflow && !interactive ? 0 : undefined}
        role={layout.overflow && !interactive ? 'region' : undefined}
        aria-label={layout.overflow && !interactive ? `${ariaLabel} (scrolls sideways)` : undefined}
      >
        <div className={styles.stage} style={{ width: layout.width, height: layout.height }}>
          <svg
            className={styles.svg}
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            role="img"
            aria-label={ariaLabel}
            aria-hidden={interactive ? true : undefined}
          >
            <BoardDefs uid={uid} orientation={orientation} />
            <BoardLayer uid={uid} layout={layout} tuningMidi={tuningObj.midi} tuningNotes={tuningObj.notes} naming={naming} fretNumbers={fretNumbers} inlay={inlay} covered={covered} />
            {layout.capoBar && <Capo uid={uid} layout={layout} />}
            <NutMarks layout={layout} open={open} muted={muted} />
            {box && <BoxLayer layout={layout} box={box} />}
            {barres && barres.length > 0 && <BarreLayer layout={layout} barres={barres} capo={capo} />}
            {path && <PathLayer uid={uid} layout={layout} capo={capo} points={path === 'markers' ? shownMarkers : path} arrows={pathArrows} />}
            <MarkerLayer layout={layout} markers={shownMarkers} capo={capo} naming={naming} />
            {shownMarkers.length > 0 && <desc>{markerDescription(shownMarkers, naming)}</desc>}
          </svg>
          {interactive && (
            <CellLayer
              layout={layout}
              tuning={tuningObj.midi}
              capo={capo}
              naming={naming}
              noteContext={noteContext}
              cellLabels={cellLabels}
              onCellClick={onCellClick}
              label={ariaLabel}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Dot inlays that sit between two strings which both carry a marker at that fret: hiding them
 * avoids a sliver of pearl peeking out between the dots. Keys are `fret.c` for a centre dot and
 * `fret.0` / `fret.1` for the two dots of a double marker.
 */
export function coveredInlays(markers: readonly FretPosition[], stringCount: number, capo = 0): string {
  const taken = new Set(markers.filter((m) => m.fret > 0).map((m) => `${m.string}:${m.fret + capo}`));
  const out: string[] = [];
  const centre = (stringCount + 1) / 2;
  const quarter = (stringCount - 1) / 4;
  const both = (pos: number, fret: number) => taken.has(`${Math.floor(pos)}:${fret}`) && taken.has(`${Math.ceil(pos)}:${fret}`);
  for (const fret of [3, 5, 7, 9, 15, 17, 19, 21]) if (both(centre, fret)) out.push(`${fret}.c`);
  for (const fret of [12, 24]) {
    if (stringCount <= 2) {
      if (both(centre, fret)) out.push(`${fret}.c`);
      continue;
    }
    if (both(centre - quarter, fret)) out.push(`${fret}.0`);
    if (both(centre + quarter, fret)) out.push(`${fret}.1`);
  }
  return out.join(',');
}

/** True when a marker fret (counted from the capo) is on the drawn part of the board. */
function onBoard(layout: BoardLayout, fret: number, capo: number): boolean {
  if (fret === 0) return capo > 0 ? !!layout.capoBar : layout.openColumn;
  const physical = fret + capo;
  return physical >= layout.fromFret && physical <= layout.toFret;
}

/** Where a marker fret (counted from the capo) is drawn. */
function pointFor(layout: BoardLayout, string: number, fret: number, capo: number): Point {
  return layout.point(string, fret === 0 ? 0 : fret + capo);
}

function describeBoard(layout: BoardLayout, count: number, capo: number): string {
  const range = `${layout.showsOpen ? 0 : layout.fromFret} to ${layout.toFret}`;
  const parts = [`Fretboard, frets ${range}`];
  if (capo > 0) parts.push(`capo on fret ${capo}`);
  if (count > 0) parts.push(`${count} ${count === 1 ? 'note' : 'notes'} marked`);
  return parts.join(', ');
}

function markerDescription(markers: readonly FretMarker[], naming: NoteNaming): string {
  const items = markers.slice(0, 48).map((m) => {
    const where = m.fret === 0 ? `string ${m.string} open` : `string ${m.string} fret ${m.fret}`;
    const what = m.note ? noteText(m.note, naming) : m.label || 'note';
    return `${what} on ${where}${m.description ? ` (${m.description})` : ''}${m.state && m.state !== 'normal' ? `, ${m.state}` : ''}`;
  });
  return items.join('; ') + (markers.length > 48 ? `; and ${markers.length - 48} more` : '');
}

// ── static board ─────────────────────────────────────────────────────────────────────────────────

/** Gradients for wood, frets, nut and pearl. Colours come from CSS classes on the stops. */
const BoardDefs = memo(function BoardDefs({ uid, orientation }: { uid: string; orientation: BoardOrientation }) {
  const across = orientation === 'horizontal' ? { x1: 0, y1: 0, x2: 0, y2: 1 } : { x1: 0, y1: 0, x2: 1, y2: 0 };
  const along = orientation === 'horizontal' ? { x1: 0, y1: 0, x2: 1, y2: 0 } : { x1: 0, y1: 0, x2: 0, y2: 1 };
  return (
    <defs>
      <linearGradient id={`${uid}-wood`} {...across}>
        <stop offset="0" className={styles.woodStop1} />
        <stop offset="0.16" className={styles.woodStop2} />
        <stop offset="0.84" className={styles.woodStop2} />
        <stop offset="1" className={styles.woodStop1} />
      </linearGradient>
      <linearGradient id={`${uid}-head`} {...across}>
        <stop offset="0" className={styles.headStop1} />
        <stop offset="0.5" className={styles.headStop2} />
        <stop offset="1" className={styles.headStop1} />
      </linearGradient>
      <linearGradient id={`${uid}-fret`} {...along}>
        <stop offset="0" className={styles.fretStop1} />
        <stop offset="0.38" className={styles.fretStop2} />
        <stop offset="0.55" className={styles.fretStop3} />
        <stop offset="1" className={styles.fretStop1} />
      </linearGradient>
      <linearGradient id={`${uid}-nut`} {...along}>
        <stop offset="0" className={styles.nutStop2} />
        <stop offset="0.6" className={styles.nutStop2} />
        <stop offset="1" className={styles.nutStop1} />
      </linearGradient>
      <radialGradient id={`${uid}-pearl`} cx="0.38" cy="0.35" r="0.75">
        <stop offset="0" className={styles.pearlStop1} />
        <stop offset="0.55" className={styles.pearlStop2} />
        <stop offset="1" className={styles.pearlStop3} />
      </radialGradient>
      <marker id={`${uid}-arrow`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" className={styles.arrowHead} />
      </marker>
    </defs>
  );
});

interface BoardLayerProps {
  uid: string;
  layout: BoardLayout;
  tuningMidi: readonly number[];
  tuningNotes: readonly string[];
  naming: NoteNaming;
  fretNumbers: 'inlays' | 'all' | 'none';
  inlay: FretboardInlay;
  /** Inlays hidden because markers sit on both strings around them (`'5,7'`): no pearl slivers between dots. */
  covered: string;
}

/** Wood, grain, inlays, frets, nut, strings, capo and the labels around the board. */
const BoardLayer = memo(function BoardLayer({ uid, layout, tuningMidi, tuningNotes, naming, fretNumbers, inlay, covered }: BoardLayerProps) {
  const { board, headstock, nut, orientation, stringCount, stringGap } = layout;
  const horizontal = orientation === 'horizontal';
  const scale = stringGap / 28;
  const grain = useMemo(() => grainPaths(board, horizontal, stringGap), [board, horizontal, stringGap]);
  const shadowOffset = 2;
  return (
    <g>
      {/* A soft contact shadow under the neck. */}
      <rect className={styles.shadow} x={board.x + (horizontal ? 0 : shadowOffset)} y={board.y + (horizontal ? shadowOffset : 0)} width={board.w} height={board.h} rx={3} />
      {headstock && <rect x={headstock.x} y={headstock.y} width={headstock.w} height={headstock.h} rx={4} fill={`url(#${uid}-head)`} />}
      <rect x={board.x} y={board.y} width={board.w} height={board.h} rx={2} fill={`url(#${uid}-wood)`} />
      <g>
        {grain.map((g, i) => (
          <path key={i} className={styles.grain} d={g.d} strokeWidth={g.w} />
        ))}
      </g>
      <Inlays uid={uid} layout={layout} style={inlay} covered={covered} />
      {layout.wires.map(({ fret, line }) => {
        const w = layout.wireWidth;
        const r = horizontal
          ? { x: line.x1 - w / 2, y: line.y1, width: w, height: line.y2 - line.y1 }
          : { x: Math.min(line.x1, line.x2), y: line.y1 - w / 2, width: Math.abs(line.x2 - line.x1), height: w };
        const sh = horizontal ? { ...r, x: r.x + (layout.leftHanded ? -1.2 : 1.2) } : { ...r, y: r.y + 1.2 };
        return (
          <g key={fret}>
            <rect className={styles.wireShadow} {...sh} />
            <rect {...r} rx={w / 2} fill={`url(#${uid}-fret)`} />
          </g>
        );
      })}
      {nut && (
        <g>
          <rect x={nut.x} y={nut.y} width={nut.w} height={nut.h} rx={1.5} fill={`url(#${uid}-nut)`} />
          <rect
            className={styles.nutEdge}
            x={horizontal ? (layout.leftHanded ? nut.x : nut.x + nut.w - 1) : nut.x}
            y={horizontal ? nut.y : nut.y + nut.h - 1}
            width={horizontal ? 1 : nut.w}
            height={horizontal ? nut.h : 1}
          />
        </g>
      )}
      {/* Strings: a shadow on the wood, the string, its winding, a thin shine. Thinnest on top. */}
      {Array.from({ length: stringCount }, (_unused, i) => {
        const string = i + 1;
        const midi = tuningMidi[stringCount - string] ?? 64;
        const look = stringLook(midi);
        const w = look.width * Math.max(0.8, scale);
        const line = layout.stringLine(string);
        const off = horizontal ? { x: 0, y: w * 0.6 + 1 } : { x: (layout.leftHanded ? -1 : 1) * (w * 0.6 + 1), y: 0 };
        return (
          <g key={string}>
            <line className={styles.stringShadow} x1={line.x1 + off.x} y1={line.y1 + off.y} x2={line.x2 + off.x} y2={line.y2 + off.y} strokeWidth={w} />
            <line className={styles.string} data-wound={look.wound} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} strokeWidth={w} />
            {look.wound && <line className={styles.winding} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} strokeWidth={w} strokeDasharray={`${0.7 * scale} ${1.1 * scale}`} />}
            <line
              className={styles.stringShine}
              x1={line.x1 - (horizontal ? 0 : w * 0.18)}
              y1={line.y1 - (horizontal ? w * 0.18 : 0)}
              x2={line.x2 - (horizontal ? 0 : w * 0.18)}
              y2={line.y2 - (horizontal ? w * 0.18 : 0)}
              strokeWidth={Math.max(0.4, w * 0.28)}
            />
          </g>
        );
      })}
      {/* Labels around the board, on the page. */}
      {Array.from({ length: stringCount }, (_unused, i) => {
        const string = i + 1;
        const at = layout.stringLabelAt(string);
        const name = tuningNotes[stringCount - string];
        return at && name ? (
          <text key={`s${string}`} className={styles.stringLabel} x={at.x} y={at.y}>
            {noteText(name, naming)}
          </text>
        ) : null;
      })}
      {/* With a capo its label takes the place of the fret number (and of the neighbours when frets are narrow). */}
      {fretNumbersFor(layout.fromFret, layout.toFret, fretNumbers)
        .filter((fret) => !layout.capo || (fret !== layout.capo && (Math.abs(fret - layout.capo) > 1 || layout.fretSize(layout.capo) >= 48)))
        .map((fret) => {
          const at = layout.fretNumberAt(fret);
          return at ? (
            <text key={`f${fret}`} className={styles.fretNumber} x={at.x} y={at.y}>
              {fret}
            </text>
          ) : null;
        })}
    </g>
  );
});

/** Long, slightly wavy grain lines along the board, the same every time for the same board. */
function grainPaths(board: { x: number; y: number; w: number; h: number }, horizontal: boolean, gap: number): Array<{ d: string; w: number }> {
  const out: Array<{ d: string; w: number }> = [];
  const across = horizontal ? board.h : board.w;
  const along = horizontal ? board.w : board.h;
  let seed = Math.round(across * 7 + along * 3) || 1;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const count = Math.max(6, Math.round(across / (gap * 0.32)));
  for (let i = 0; i < count; i++) {
    const v = (across * (i + 0.5 + (rand() - 0.5) * 0.6)) / count;
    const amp = 0.6 + rand() * 1.6;
    const waves = 2 + Math.round(rand() * 3);
    const steps = Math.max(8, Math.round(along / 40));
    let d = '';
    for (let s = 0; s <= steps; s++) {
      const u = (along * s) / steps;
      const vv = v + Math.sin((s / steps) * Math.PI * waves + i) * amp;
      const x = horizontal ? board.x + u : board.x + vv;
      const y = horizontal ? board.y + vv : board.y + u;
      d += `${s === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    out.push({ d, w: 0.5 + rand() * 0.9 });
  }
  return out;
}

/** Position markers in the chosen style. */
function Inlays({ uid, layout, style, covered }: { uid: string; layout: BoardLayout; style: FretboardInlay; covered: string }) {
  const horizontal = layout.orientation === 'horizontal';
  const fill = `url(#${uid}-pearl)`;
  const frets = inlaysInRange(layout.fromFret, layout.toFret);
  const { board } = layout;
  if (style === 'vine') {
    // One vine climbing the whole board, with a leaf at every marker fret.
    const along = horizontal ? board.w : board.h;
    const mid = horizontal ? board.y + board.h / 2 : board.x + board.w / 2;
    const amp = (horizontal ? board.h : board.w) * 0.22;
    let d = '';
    const steps = Math.max(24, Math.round(along / 12));
    for (let s = 0; s <= steps; s++) {
      const u = (along * s) / steps;
      const v = mid + Math.sin(u / 46) * amp;
      d += `${s === 0 ? 'M' : 'L'}${(horizontal ? board.x + u : v).toFixed(1)} ${(horizontal ? v : board.y + u).toFixed(1)}`;
    }
    return (
      <g>
        <path className={styles.vine} d={d} />
        {frets.map(({ fret }) => {
          const { points, r } = layout.inlays(fret);
          const c = points.length === 2 ? { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 } : points[0];
          const u = horizontal ? c.x - board.x : c.y - board.y;
          const v = mid + Math.sin(u / 46) * amp;
          const p = horizontal ? { x: c.x, y: v } : { x: v, y: c.y };
          return <ellipse key={fret} className={styles.inlay} cx={p.x} cy={p.y} rx={r * 1.5} ry={r * 0.75} transform={`rotate(${horizontal ? -30 : 60} ${p.x} ${p.y})`} fill={fill} />;
        })}
      </g>
    );
  }
  return (
    <g>
      {frets.map(({ fret, double }) => {
        const { points, r, space } = layout.inlays(fret);
        const along = horizontal ? space.w : space.h;
        const across = horizontal ? space.h : space.w;
        if (style === 'blocks') {
          const l = along * 0.46;
          const c = { x: space.x + space.w / 2, y: space.y + space.h / 2 };
          const w = horizontal ? l : across * 0.66;
          const h = horizontal ? across * 0.66 : l;
          return <rect key={fret} className={styles.inlay} x={c.x - w / 2} y={c.y - h / 2} width={w} height={h} rx={1.5} fill={fill} />;
        }
        if (style === 'diamonds') {
          const c = { x: space.x + space.w / 2, y: space.y + space.h / 2 };
          const a = along * 0.24;
          const b = across * 0.4;
          const d = horizontal
            ? `M${c.x} ${c.y - b} L${c.x + a} ${c.y} L${c.x} ${c.y + b} L${c.x - a} ${c.y} Z`
            : `M${c.x - b} ${c.y} L${c.x} ${c.y + a} L${c.x + b} ${c.y} L${c.x} ${c.y - a} Z`;
          return <path key={fret} className={styles.inlay} d={d} fill={fill} />;
        }
        if (style === 'sharkfin') {
          // A fin rising from the bass edge, slanted toward the body.
          const len = along * 0.62;
          const start = (horizontal ? space.x : space.y) + (along - len) / 2;
          const bass = horizontal ? space.y + space.h : layout.leftHanded ? space.x + space.w : space.x;
          const dir = horizontal ? -1 : layout.leftHanded ? -1 : 1;
          const tip = across * 0.7;
          const toward = layout.leftHanded && horizontal ? -1 : 1;
          const p = (u: number, v: number) => (horizontal ? `${u} ${v}` : `${v} ${u}`);
          const u0 = horizontal && layout.leftHanded ? start + len : start;
          const u1 = horizontal && layout.leftHanded ? start : start + len;
          const d = `M${p(u0, bass)} L${p(u1, bass)} L${p(u1 - toward * len * 0.18, bass + dir * tip)} Z`;
          return <path key={fret} className={styles.inlay} d={d} fill={fill} />;
        }
        if (style === 'offset-dots') {
          const rr = r * 0.62;
          const bassV = horizontal ? space.y + space.h - layout.stringGap * 0.27 : layout.leftHanded ? space.x + space.w - layout.stringGap * 0.27 : space.x + layout.stringGap * 0.27;
          const centre = horizontal ? space.x + space.w / 2 : space.y + space.h / 2;
          const us = double ? [centre - rr * 1.6, centre + rr * 1.6] : [centre];
          return (
            <g key={fret}>
              {us.map((u, i) => (
                <circle key={i} className={styles.inlay} cx={horizontal ? u : bassV} cy={horizontal ? bassV : u} r={rr} fill={fill} />
              ))}
            </g>
          );
        }
        const hidden = covered.split(',');
        return (
          <g key={fret}>
            {points.map((p, i) =>
              hidden.includes(`${fret}.${points.length === 2 ? i : 'c'}`) ? null : <circle key={i} className={styles.inlay} cx={p.x} cy={p.y} r={r} fill={fill} />,
            )}
          </g>
        );
      })}
    </g>
  );
}

/** A capo clamped across the strings (metal bar, rubber edge, its fret named), and a shade over the frets behind it. */
function Capo({ uid, layout }: { uid: string; layout: BoardLayout }) {
  const bar = layout.capoBar!;
  const horizontal = layout.orientation === 'horizontal';
  const shade = horizontal
    ? layout.leftHanded
      ? { x: bar.x + bar.w, y: layout.board.y, w: layout.board.x + layout.board.w - (bar.x + bar.w), h: layout.board.h }
      : { x: layout.board.x, y: layout.board.y, w: bar.x - layout.board.x, h: layout.board.h }
    : { x: layout.board.x, y: layout.board.y, w: layout.board.w, h: bar.y - layout.board.y };
  const label = layout.fretNumberAt(layout.capo);
  const shine = horizontal ? { x: bar.x + bar.w * 0.25, y: bar.y + 2, w: Math.max(1.5, bar.w * 0.18), h: bar.h - 4 } : { x: bar.x + 2, y: bar.y + bar.h * 0.25, w: bar.w - 4, h: Math.max(1.5, bar.h * 0.18) };
  return (
    <g>
      {shade.w > 0 && shade.h > 0 && <rect className={styles.capoShade} x={shade.x} y={shade.y} width={shade.w} height={shade.h} />}
      <rect className={styles.capo} x={bar.x - 1.5} y={bar.y - 1.5} width={bar.w + 3} height={bar.h + 3} rx={Math.min(bar.w, bar.h) / 2.2} />
      <rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} rx={Math.min(bar.w, bar.h) / 2.5} fill={`url(#${uid}-fret)`} />
      <rect className={styles.capoShine} x={shine.x} y={shine.y} width={shine.w} height={shine.h} rx={1} />
      {label && (
        <text className={styles.capoLabel} x={label.x} y={label.y}>
          capo {layout.capo}
        </text>
      )}
    </g>
  );
}

/** `o` and `×` at the nut for open and muted strings. */
function NutMarks({ layout, open, muted }: { layout: BoardLayout; open?: readonly number[]; muted?: readonly number[] }) {
  if (!layout.openColumn || (!open?.length && !muted?.length)) return null;
  const r = Math.min(7, layout.stringGap * 0.24);
  return (
    <g>
      {open?.map((s) => {
        const p = layout.point(s, 0);
        return <circle key={`o${s}`} className={styles.mark} cx={p.x} cy={p.y} r={r} />;
      })}
      {muted?.map((s) => {
        const p = layout.point(s, 0);
        return <path key={`x${s}`} className={styles.mark} d={`M${p.x - r} ${p.y - r} L${p.x + r} ${p.y + r} M${p.x + r} ${p.y - r} L${p.x - r} ${p.y + r}`} />;
      })}
    </g>
  );
}

/** The highlighted position box and its caption. */
function BoxLayer({ layout, box }: { layout: BoardLayout; box: FretBox }) {
  const r = layout.span(box.from, box.to, { strings: box.strings, pad: 4 });
  const horizontal = layout.orientation === 'horizontal';
  return (
    <g>
      <rect className={styles.box} x={r.x} y={r.y} width={r.w} height={r.h} rx={8} />
      {box.label && horizontal && (
        <text className={styles.boxLabel} x={layout.leftHanded ? r.x + r.w - 2 : r.x + 2} y={Math.max(9, r.y - 10)} textAnchor={layout.leftHanded ? 'end' : 'start'}>
          {box.label}
        </text>
      )}
    </g>
  );
}

/** Barres: rounded bars across the strings a finger holds down. */
function BarreLayer({ layout, barres, capo }: { layout: BoardLayout; barres: readonly FretBarre[]; capo: number }) {
  const r = layout.markerRadius * 0.86;
  return (
    <g>
      {barres.map((b, i) => {
        if (!onBoard(layout, b.fret, capo)) return null;
        const a = pointFor(layout, b.fromString, b.fret, capo);
        const c = pointFor(layout, b.toString, b.fret, capo);
        const x = Math.min(a.x, c.x) - r;
        const y = Math.min(a.y, c.y) - r;
        const w = Math.abs(c.x - a.x) + r * 2;
        const h = Math.abs(c.y - a.y) + r * 2;
        return (
          <g key={i} className={cx(tone.tone, styles.marker)} data-c={b.color ?? 'neutral'} data-state={b.state ?? 'normal'}>
            <g className={styles.markerBody}>
              <rect className={styles.barre} x={x} y={y} width={w} height={h} rx={r} />
            </g>
          </g>
        );
      })}
    </g>
  );
}

/** A line through positions in order, with arrow heads, stopping short of each dot. */
function PathLayer({ uid, layout, points, capo, arrows }: { uid: string; layout: BoardLayout; points: readonly FretPosition[]; capo: number; arrows: boolean }) {
  const r = layout.markerRadius + 3;
  const segments: string[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = pointFor(layout, points[i - 1].string, points[i - 1].fret, capo);
    const b = pointFor(layout, points[i].string, points[i].fret, capo);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len <= r * 2 + 2) continue;
    const ux = dx / len;
    const uy = dy / len;
    segments.push(`M${(a.x + ux * r).toFixed(1)} ${(a.y + uy * r).toFixed(1)} L${(b.x - ux * r).toFixed(1)} ${(b.y - uy * r).toFixed(1)}`);
  }
  return (
    <g>
      {segments.map((d, i) => (
        <path key={i} className={styles.path} d={d} markerEnd={arrows ? `url(#${uid}-arrow)` : undefined} />
      ))}
    </g>
  );
}

/** The note markers. */
const MarkerLayer = memo(function MarkerLayer({ layout, markers, capo, naming }: { layout: BoardLayout; markers: readonly FretMarker[]; capo: number; naming: NoteNaming }) {
  const base = layout.markerRadius;
  return (
    <g>
      {markers.map((m) => {
        const p = pointFor(layout, m.string, m.fret, capo);
        const label = m.noteLabel && m.note ? noteText(m.note, naming) : m.label;
        return <Marker key={m.id ?? `${m.string}:${m.fret}`} marker={label === m.label ? m : { ...m, label }} x={p.x} y={p.y} r={m.root ? base * 1.06 : base} />;
      })}
    </g>
  );
});

/** One note marker: shape, label, root halo, state decoration. */
export const Marker = memo(function Marker({ marker, x, y, r }: { marker: FretMarker; x: number; y: number; r: number }) {
  const shape = marker.shape ?? 'circle';
  const state = marker.state ?? 'normal';
  const label = marker.label ?? '';
  const fontSize = labelFontSize(label, r);
  return (
    <g className={cx(tone.tone, styles.marker)} data-c={marker.color ?? 'neutral'} data-shape={shape} data-state={state} data-root={marker.root || undefined} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`}>
      {state === 'target' && <circle className={styles.pulse} r={r * 1.18} />}
      <g className={styles.markerBody}>
        {marker.root && <MarkerShape shape={shape} r={r + 3} className={styles.halo} />}
        <MarkerShape shape={shape} r={r} className={styles.dot} strokeWidth={shape === 'ring' ? Math.max(2, r * 0.26) : undefined} />
        {state === 'target' && <circle className={styles.targetRing} r={r + 3.5} />}
        {label && (
          <text className={styles.label} y={0.5} fontSize={fontSize}>
            {label}
          </text>
        )}
      </g>
      {(state === 'hit' || state === 'miss') && (
        <g transform={`translate(${(r * 0.78).toFixed(2)} ${(-r * 0.78).toFixed(2)})`}>
          <circle className={styles.badge} data-kind={state} r={Math.max(5.5, r * 0.5)} />
          <path
            className={styles.badgeMark}
            d={state === 'hit' ? `M${-r * 0.22} 0 L${-r * 0.05} ${r * 0.18} L${r * 0.25} ${-r * 0.18}` : `M${-r * 0.18} ${-r * 0.18} L${r * 0.18} ${r * 0.18} M${r * 0.18} ${-r * 0.18} L${-r * 0.18} ${r * 0.18}`}
          />
        </g>
      )}
    </g>
  );
});

/** A marker's outline as an SVG shape centred on 0,0. */
export function MarkerShape({ shape, r, className, strokeWidth }: { shape: string; r: number; className?: string; strokeWidth?: number }) {
  if (shape === 'square') return <rect className={className} x={-r * 0.92} y={-r * 0.92} width={r * 1.84} height={r * 1.84} rx={r * 0.32} strokeWidth={strokeWidth} />;
  if (shape === 'diamond') {
    const d = r * 1.18;
    return <path className={className} d={`M0 ${-d} L${d} 0 L0 ${d} L${-d} 0 Z`} strokeLinejoin="round" strokeWidth={strokeWidth} />;
  }
  return <circle className={className} r={r} strokeWidth={strokeWidth} />;
}

// ── touch cells ──────────────────────────────────────────────────────────────────────────────────

interface CellLayerProps {
  layout: BoardLayout;
  tuning: readonly number[];
  capo: number;
  naming: NoteNaming;
  noteContext?: SpellContext;
  cellLabels: 'note' | 'position';
  onCellClick: (cell: FretCell) => void;
  label: string;
}

/** Every string × fret cell as a button; arrow keys move between them the way the board looks. */
const CellLayer = memo(function CellLayer({ layout, tuning, capo, naming, noteContext, cellLabels, onCellClick, label }: CellLayerProps) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const minFret = layout.openColumn && (layout.showsOpen || capo > 0) ? 0 : Math.max(1, layout.fromFret - capo);
  const maxFret = layout.toFret - capo;
  const [focus, setFocus] = useState<FretPosition>({ string: 1, fret: minFret });
  const current = { string: Math.min(layout.stringCount, focus.string), fret: Math.min(maxFret, Math.max(minFret, focus.fret)) };

  const cells = useMemo(() => {
    const out: Array<FretCell & { key: string; rect: { x: number; y: number; w: number; h: number }; aria: string }> = [];
    for (let string = 1; string <= layout.stringCount; string++) {
      for (let fret = minFret; fret <= maxFret; fret++) {
        const pos = { string, fret };
        const midi = midiAt(pos, { tuning, capo });
        const note = noteAt(pos, { tuning, capo, context: noteContext, octave: false });
        const rect = layout.cell(string, fret === 0 ? (capo > 0 ? capo : 0) : fret + capo);
        out.push({ ...pos, midi, note, key: `${string}:${fret}`, rect, aria: cellLabel(pos, cellLabels === 'note' ? note : null, naming) });
      }
    }
    return out;
  }, [layout, tuning, capo, noteContext, cellLabels, naming, minFret, maxFret]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const dirs: Record<string, 'left' | 'right' | 'up' | 'down'> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
      let next: FretPosition | null = null;
      if (dirs[e.key]) {
        next = moveOnBoard(current, dirs[e.key], { stringCount: layout.stringCount, minFret, maxFret, orientation: layout.orientation, leftHanded: layout.leftHanded });
      } else if (e.key === 'Home') next = { string: current.string, fret: minFret };
      else if (e.key === 'End') next = { string: current.string, fret: maxFret };
      if (!next) return;
      e.preventDefault();
      setFocus(next);
      refs.current.get(`${next.string}:${next.fret}`)?.focus();
    },
    [current, layout, minFret, maxFret],
  );

  const hoverD = Math.round(layout.markerRadius * 2);
  return (
    <div className={styles.cells} role="group" aria-label={`${label}. Tap a string and fret; arrow keys move.`} onKeyDown={onKeyDown}>
      {cells.map((c) => (
        <button
          key={c.key}
          ref={(el) => {
            if (el) refs.current.set(c.key, el);
            else refs.current.delete(c.key);
          }}
          type="button"
          className={styles.cell}
          style={{ left: c.rect.x, top: c.rect.y, width: c.rect.w, height: c.rect.h, ['--hover-d' as string]: `${hoverD}px` }}
          tabIndex={c.string === current.string && c.fret === current.fret ? 0 : -1}
          aria-label={c.aria}
          onFocus={() => setFocus({ string: c.string, fret: c.fret })}
          onClick={() => onCellClick({ string: c.string, fret: c.fret, midi: c.midi, note: c.note })}
        />
      ))}
    </div>
  );
});

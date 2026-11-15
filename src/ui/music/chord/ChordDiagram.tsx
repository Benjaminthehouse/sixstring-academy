/**
 * The chord box: strings down, frets across, the nut (or the base fret) on top, `×` and `o` above
 * the nut, dots with finger numbers, barres, and optionally the notes or degrees under the strings.
 * From a guitar-engine voicing, or from a shape like `x32010`.
 *
 *   <ChordDiagram voicing={chordVoicings('G')[0]} />
 *   <ChordDiagram chord="F" frets="133211" size="lg" footer="notes" />
 *   <ChordDiagram voicing={v} size="xs" />           // a chip in a list
 */
import { memo, useMemo } from 'react';
import { parseFrets, tuning as resolveTuning, voicingFromFrets, type TuningInput, type Voicing } from '@/core/guitar';
import { formatChord } from '@/core/theory';
import { cx } from '@/ui';
import { degreeColor, degreeText, fingerColor, fingerText, noteText } from '../format';
import { useMusicSettings } from '../settings';
import tone from '../tone.module.css';
import type { MusicColor, NoteNaming } from '../types';
import { chordBoxGrid, chordBoxLayout } from './layout';
import styles from './ChordDiagram.module.css';

/** Sizes, from a list chip to a lesson figure. */
export type ChordDiagramSize = 'xs' | 'sm' | 'md' | 'lg';

/** Props of `<ChordDiagram>`. Give a `voicing`, or `frets` (with an optional `chord` symbol and `fingers`). */
export interface ChordDiagramProps {
  voicing?: Voicing | null;
  /** The shape, low to high: `'x32010'`, `'8-10-10-9-8-8'` or `[null, 3, 2, 0, 1, 0]`. */
  frets?: string | ReadonlyArray<number | null>;
  /** Fingers, low to high: `'x32010'` style (`x`, `0` or `-` for none) or numbers. Worked out when omitted. */
  fingers?: string | ReadonlyArray<number | null>;
  /** Chord symbol: the title, and how the shape is named. */
  chord?: string;
  tuning?: TuningInput;
  /** Title above the box: the chord's name by default; `false` for none. */
  title?: string | false;
  /** Default `md`. `xs` hides the title and the text in the dots. */
  size?: ChordDiagramSize;
  /** Text inside the dots (default `fingers`). */
  dots?: 'fingers' | 'notes' | 'degrees' | 'none';
  /** Dot colours: finger colours (default), degree colours, or plain ink. */
  color?: 'finger' | 'degree' | 'ink';
  /** Labels under the strings (default none). */
  footer?: 'notes' | 'degrees' | 'none';
  /** Minimum fret rows (default 4). */
  rows?: number;
  leftHanded?: boolean;
  naming?: NoteNaming;
  'aria-label'?: string;
  className?: string;
}

interface Resolved {
  frets: Array<number | null>;
  fingers: Array<number | null>;
  barres: Voicing['barres'];
  notes: Map<number, { note: string; degree: string; isRoot: boolean }>;
  chord: string | null;
  capo: number;
}

function parseFingerText(input: string | ReadonlyArray<number | null> | undefined, count: number): Array<number | null> | null {
  if (!input) return null;
  if (typeof input !== 'string') return [...input];
  const chars = input.replace(/[\s-]/g, (c) => (c === '-' ? 'x' : '')).split('');
  if (chars.length !== count) return null;
  return chars.map((c) => (/[1-4]/.test(c) ? Number(c) : c === 't' || c === 'T' ? 5 : c === '0' ? 0 : null));
}

function resolve(props: ChordDiagramProps): Resolved | null {
  let v: Voicing | null = props.voicing ?? null;
  let frets: Array<number | null> | null = null;
  if (!v && props.frets !== undefined) {
    try {
      frets = typeof props.frets === 'string' ? parseFrets(props.frets) : [...props.frets];
    } catch {
      return null;
    }
    v = voicingFromFrets(frets, { as: props.chord, tuning: props.tuning });
  }
  if (v) {
    const given = parseFingerText(props.fingers, v.frets.length);
    return {
      frets: [...v.frets],
      fingers: given ?? [...v.fingers],
      barres: given ? [] : v.barres,
      notes: new Map(v.notes.map((n) => [n.string, { note: n.note, degree: n.degree, isRoot: n.isRoot }])),
      chord: props.chord ?? v.chord,
      capo: v.capo,
    };
  }
  if (!frets) return null;
  const count = resolveTuning(props.tuning).stringCount;
  if (frets.length !== count) return null;
  return { frets, fingers: parseFingerText(props.fingers, count) ?? frets.map(() => null), barres: [], notes: new Map(), chord: props.chord ?? null, capo: 0 };
}

/** The chord box. See the module comment. */
export const ChordDiagram = memo(function ChordDiagram(props: ChordDiagramProps) {
  const settings = useMusicSettings();
  const { size = 'md', dots = 'fingers', color = 'finger', footer = 'none', leftHanded = settings.leftHanded, naming = settings.naming, rows, className } = props;
  const resolved = useMemo(() => resolve(props), [props.voicing, props.frets, props.fingers, props.chord, props.tuning]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!resolved) return null;
  const titleText = props.title === false || size === 'xs' ? null : props.title ?? (resolved.chord ? safeChordName(resolved.chord, naming) : null);
  const layout = chordBoxLayout({ frets: resolved.frets, fingers: resolved.fingers, barres: resolved.barres, minRows: rows, leftHanded });
  const grid = chordBoxGrid(layout, { title: !!titleText, footer: footer !== 'none', capo: resolved.capo > 0 && size !== 'xs', leftHanded, compact: size === 'xs' || size === 'sm' });
  const { x0, y0, colW, rowH, dotR } = grid;
  const cx0 = (col: number) => x0 + col * colW;
  const rowY = (row: number) => y0 + (row + 0.5) * rowH;
  const gridW = (layout.stringCount - 1) * colW;
  const showText = size !== 'xs' && dots !== 'none';
  const covered = (string: number, fret: number) => layout.barres.some((b) => b.fret === fret && string <= b.fromString && string >= b.toString);

  const dotColor = (string: number, finger: number | null): MusicColor | 'ink' => {
    if (color === 'ink') return 'ink';
    if (color === 'degree') {
      const n = resolved.notes.get(string);
      return n ? degreeColor(n.degree) : 'neutral';
    }
    return fingerColor(finger);
  };
  const dotText = (string: number, finger: number | null) => {
    if (dots === 'fingers') return fingerText(finger);
    const n = resolved.notes.get(string);
    if (!n) return '';
    return dots === 'notes' ? noteText(n.note, naming) : degreeText(n.degree);
  };
  const label = props['aria-label'] ?? describe(resolved, titleText, layout.baseFret, naming);

  return (
    <svg
      className={cx(styles.root, className)}
      data-size={size}
      viewBox={`0 0 ${grid.width} ${grid.height}`}
      role="img"
      aria-label={label}
    >
      {titleText && (
        <text className={styles.title} x={x0 + gridW / 2} y={grid.titleY!}>
          {titleText}
        </text>
      )}
      {/* frets and strings */}
      {Array.from({ length: layout.rows + 1 }, (_unused, i) => (
        <line key={`f${i}`} className={styles.fret} x1={x0} x2={x0 + gridW} y1={y0 + i * rowH} y2={y0 + i * rowH} />
      ))}
      {Array.from({ length: layout.stringCount }, (_unused, i) => (
        <line key={`s${i}`} className={styles.string} x1={cx0(i)} x2={cx0(i)} y1={y0} y2={y0 + layout.rows * rowH} />
      ))}
      {layout.showNut ? (
        <rect className={styles.nut} x={x0 - 0.6} y={y0 - 2.6} width={gridW + 1.2} height={2.8} rx={0.6} />
      ) : (
        <text className={styles.baseFret} x={leftHanded ? x0 + gridW + dotR + 1.2 : x0 - dotR - 1.2} y={rowY(0)} textAnchor={leftHanded ? 'start' : 'end'}>
          {layout.baseFret}
          <tspan className={styles.fr}>fr</tspan>
        </text>
      )}
      {grid.capoY !== null && (
        <text className={styles.capo} x={x0 + gridW / 2} y={grid.capoY}>
          capo {resolved.capo}
        </text>
      )}
      {/* open and muted strings */}
      {layout.openCols.map((col) => (
        <circle key={`o${col}`} className={styles.mark} cx={cx0(col)} cy={grid.marksY} r={2.3} />
      ))}
      {layout.mutedCols.map((col) => {
        const x = cx0(col);
        const y = grid.marksY;
        return <path key={`x${col}`} className={styles.mark} d={`M${x - 2} ${y - 2} L${x + 2} ${y + 2} M${x + 2} ${y - 2} L${x - 2} ${y + 2}`} />;
      })}
      {/* barres */}
      {layout.barres.map((b, i) => {
        const c = dotColor(b.fromString, b.finger);
        const text = showText && dots === 'fingers' ? fingerText(b.finger) : '';
        return (
          <g key={`b${i}`} className={cx(tone.tone, styles.dotGroup)} data-c={c}>
            <rect className={styles.dot} x={cx0(b.fromCol) - dotR} y={rowY(b.row) - dotR * 0.92} width={(b.toCol - b.fromCol) * colW + dotR * 2} height={dotR * 1.84} rx={dotR * 0.92} />
            {text && (
              <text className={styles.dotText} x={(cx0(b.fromCol) + cx0(b.toCol)) / 2} y={rowY(b.row) + 0.2} fontSize={5.4 * (dotR / 4.3)}>
                {text}
              </text>
            )}
          </g>
        );
      })}
      {/* dots */}
      {layout.dots.map((d) => {
        if (covered(d.string, d.fret) && dots === 'fingers') return null;
        const c = dotColor(d.string, d.finger);
        const text = showText ? dotText(d.string, d.finger) : '';
        const root = resolved.notes.get(d.string)?.isRoot;
        return (
          <g key={`d${d.string}`} className={cx(tone.tone, styles.dotGroup)} data-c={c} data-root={root || undefined}>
            <circle className={styles.dot} cx={cx0(d.col)} cy={rowY(d.row)} r={dotR} />
            {text && (
              <text className={styles.dotText} x={cx0(d.col)} y={rowY(d.row) + 0.2} fontSize={(text.length > 2 ? 3.6 : text.length > 1 ? 4.4 : 5.4) * (dotR / 4.3)}>
                {text}
              </text>
            )}
          </g>
        );
      })}
      {/* labels under the strings */}
      {footer !== 'none' &&
        Array.from({ length: layout.stringCount }, (_unused, i) => {
          const string = layout.stringCount - i;
          const n = resolved.notes.get(string);
          if (!n) return null;
          const text = footer === 'notes' ? noteText(n.note, naming) : degreeText(n.degree);
          return (
            <text key={`l${string}`} className={styles.footer} data-root={n.isRoot || undefined} x={cx0(layout.colOf(string))} y={grid.footerY!}>
              {text}
            </text>
          );
        })}
    </svg>
  );
});

function safeChordName(symbol: string, naming: NoteNaming): string {
  try {
    return formatChord(symbol, { system: naming });
  } catch {
    return symbol;
  }
}

function describe(r: Resolved, title: string | null, baseFret: number, naming: NoteNaming): string {
  const count = r.frets.length;
  const parts = r.frets.map((fret, index) => {
    const string = count - index;
    if (fret === null) return `string ${string} not played`;
    const n = r.notes.get(string);
    const note = n ? ` (${noteText(n.note, naming)})` : '';
    if (fret === 0) return `string ${string} open${note}`;
    const finger = r.fingers[index];
    return `string ${string} fret ${fret}${finger ? `, finger ${finger}` : ''}${note}`;
  });
  const name = title ?? 'Chord';
  return `${name} chord diagram${baseFret > 1 ? ` from fret ${baseFret}` : ''}: ${parts.join('; ')}`;
}

/**
 * A chord box with marks on top: a solid ring around a finger that stays down (anchor), a dashed
 * ring around one that slides along its string (guide), and an outline around strings the
 * microphone hint is about. The overlay uses the music kit's own box geometry, so the rings sit
 * exactly on the dots. Every mark also has words beside the diagram; colour is never alone.
 */
import type { Voicing } from '@/core/guitar';
import { cx } from '@/ui';
import { chordBoxGrid, chordBoxLayout, ChordDiagram, useMusicSettings, type ChordDiagramSize } from '@/ui/music';
import type { FingerRole } from '../model/tips';
import styles from './MarkedDiagram.module.css';

/** A mark on one fretted note. */
export interface DiagramMark {
  string: number;
  fret: number;
  role: FingerRole;
}

/** Props of the marked diagram. */
export interface MarkedDiagramProps {
  voicing: Voicing;
  size?: ChordDiagramSize;
  title?: string | false;
  dots?: 'fingers' | 'notes' | 'degrees';
  footer?: 'notes' | 'degrees' | 'none';
  marks?: readonly DiagramMark[];
  /** Strings to outline (a hint is about them). */
  strings?: readonly number[];
  className?: string;
  'aria-label'?: string;
}

/** A chord diagram with role rings and string outlines. */
export function MarkedDiagram({ voicing, size = 'md', title, dots = 'fingers', footer = 'none', marks = [], strings = [], className, ...rest }: MarkedDiagramProps) {
  const { leftHanded } = useMusicSettings();
  const showTitle = title !== false && size !== 'xs';
  const layout = chordBoxLayout({ frets: voicing.frets, fingers: voicing.fingers, barres: voicing.barres, leftHanded });
  const grid = chordBoxGrid(layout, { title: showTitle, footer: footer !== 'none', capo: voicing.capo > 0 && size !== 'xs', leftHanded, compact: size === 'xs' || size === 'sm' });
  const x = (string: number) => grid.x0 + layout.colOf(string) * grid.colW;
  const y = (fret: number) => grid.y0 + (fret - layout.baseFret + 0.5) * grid.rowH;
  const bottom = grid.y0 + layout.rows * grid.rowH;
  const hasOverlay = marks.some((m) => m.role !== 'move') || strings.length > 0;
  return (
    <div className={cx(styles.wrap, className)} data-size={size}>
      <ChordDiagram voicing={voicing} size={size} title={title} dots={dots} footer={footer} aria-label={rest['aria-label']} />
      {hasOverlay && (
        <svg className={styles.overlay} viewBox={`0 0 ${grid.width} ${grid.height}`} aria-hidden>
          {strings.map((s) => (
            <rect key={`s${s}`} className={styles.string} x={x(s) - grid.colW * 0.42} y={grid.marksY - 4.6} width={grid.colW * 0.84} height={bottom - grid.marksY + 6} rx={grid.colW * 0.42} />
          ))}
          {marks
            .filter((m) => m.role !== 'move' && m.fret >= layout.baseFret)
            .map((m) => (
              <circle key={`${m.string}:${m.fret}`} className={m.role === 'anchor' ? styles.anchor : styles.guide} cx={x(m.string)} cy={y(m.fret)} r={grid.dotR + 1.9} />
            ))}
        </svg>
      )}
    </div>
  );
}

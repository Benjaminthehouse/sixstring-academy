import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { cx, useElementSize } from '@/ui';
import { VALUE_NAMES, type Rhythm } from '../core/rhythm';
import type { Verdict } from '../core/scoring';
import { DIGITS, GLYPHS, type Glyph } from './glyphs';
import { ABOVE, BEAM_GAP, BEAM_THICKNESS, STEM, layoutRhythm, xAtTick, type PlacedItem, type PlacedSystem, type RhythmLayout } from './layout';
import styles from './Notation.module.css';

/** How a note was played: colours the note and draws a small sign under it. */
export interface NoteMark {
  verdict: Verdict;
  errorMs: number;
}

/** Props of {@link RhythmStaff}. */
export interface RhythmStaffProps {
  rhythm: Rhythm;
  /** One entry per onset of the rhythm (rests and tied-to notes have none). */
  marks?: ReadonlyArray<NoteMark | undefined>;
  /** Show the counting syllables under the notes. */
  counts?: boolean;
  /** Keep room for the marks row even while it is empty, so nothing jumps when the first mark appears. */
  reserveMarks?: boolean;
  /** Largest staff space in px (default 13). */
  maxScale?: number;
  /** Height in px to stay within (a short screen): the notation shrinks or stays on one line to fit. */
  maxHeight?: number;
  className?: string;
}

/** Imperative handle: move the playhead without re-rendering. */
export interface RhythmStaffHandle {
  /** Put the playhead at a written tick from the start of the rhythm, or hide it with null. */
  setPlayhead(tick: number | null): void;
}

/** A sentence for screen readers: the note values bar by bar. */
export function describeRhythm(rhythm: Rhythm): string {
  const bars = rhythm.bars.map((bar) =>
    bar.items
      .map((i) => `${i.tuplet ? 'triplet ' : ''}${i.dots ? 'dotted ' : ''}${VALUE_NAMES[i.value].replace(' note', '')}${i.rest ? ' rest' : ''}${i.tie ? ' tied' : ''}`)
      .join(', '),
  );
  return `Rhythm in ${rhythm.meter}${rhythm.swing ? ', swung' : ''}: ${bars.join('; ')}.`;
}

const TONE: Partial<Record<Verdict, string>> = { perfect: styles.hit, good: styles.near, ok: styles.off, miss: styles.miss };

function G({ glyph, x, y, s }: { glyph: Glyph; x: number; y: number; s: number }) {
  return <path d={glyph.d} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${s})`} />;
}

function Mark({ mark, x, y, s }: { mark: NoteMark; x: number; y: number; s: number }) {
  const u = s * 0.55;
  const w = s * 0.2;
  let d: string;
  if (mark.verdict === 'perfect') d = `M${x - u} ${y} l${u * 0.7} ${u * 0.7} l${u * 1.3} ${-u * 1.5}`;
  else if (mark.verdict === 'miss') d = `M${x - u} ${y - u} l${u * 2} ${u * 2} M${x + u} ${y - u} l${-u * 2} ${u * 2}`;
  else {
    // A chevron pointing the way the tap was off: left for early, right for late; doubled when far off.
    const dir = mark.errorMs < 0 ? -1 : 1;
    const one = (cx0: number) => `M${cx0 - dir * u * 0.45} ${y - u} l${dir * u * 0.9} ${u} l${-dir * u * 0.9} ${u}`;
    d = mark.verdict === 'good' ? one(x) : `${one(x - u * 0.55)} ${one(x + u * 0.55)}`;
  }
  return <path d={d} fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />;
}

function Item({ p, y, s, mark }: { p: PlacedItem; y: number; s: number; mark: NoteMark | undefined }) {
  const { item } = p;
  if (item.rest) {
    const glyph = item.value === 'w' ? GLYPHS.restWhole : item.value === 'h' ? GLYPHS.restHalf : item.value === 'q' ? GLYPHS.restQuarter : item.value === 'e' ? GLYPHS.rest8 : GLYPHS.rest16;
    const dy = item.value === 's' ? -0.5 * s : 0;
    return (
      <g className={styles.rest}>
        <G glyph={glyph} x={p.x} y={y + dy} s={s} />
        {item.dots ? <circle cx={p.x + glyph.w * s + 0.4 * s} cy={y - 0.5 * s} r={0.2 * s} /> : null}
      </g>
    );
  }
  const head = item.value === 'w' ? GLYPHS.noteheadWhole : item.value === 'h' ? GLYPHS.noteheadHalf : GLYPHS.noteheadBlack;
  const stemW = Math.max(1, 0.13 * s);
  return (
    <g className={cx(styles.note, mark && TONE[mark.verdict])}>
      <G glyph={head} x={p.x} y={y} s={s} />
      {p.stemX !== null && <rect x={p.stemX - stemW} y={y - STEM * s} width={stemW} height={STEM * s - 0.16 * s} />}
      {p.flags > 0 && p.stemX !== null && <G glyph={p.flags === 2 ? GLYPHS.flag16 : GLYPHS.flag8} x={p.stemX - stemW} y={y - STEM * s} s={s} />}
      {item.dots ? <circle cx={p.x + head.w * s + 0.42 * s} cy={y - 0.5 * s} r={0.2 * s} /> : null}
      {item.accent && <G glyph={GLYPHS.accent} x={p.cx - (GLYPHS.accent.w * s) / 2} y={y - (STEM + 0.55) * s} s={s} />}
    </g>
  );
}

function System({ system, layout, marks, counts, markY }: { system: PlacedSystem; layout: RhythmLayout; marks: RhythmStaffProps['marks']; counts: boolean; markY: number }) {
  const s = layout.scale;
  const y = Math.round(system.y) + 0.5;
  const thin = Math.max(1, s * 0.12);
  const ts = system.timeSignature;
  const digits = (n: number, cxAt: number, cy: number) => {
    const list = String(n).split('').map((d) => DIGITS[Number(d)]);
    const total = list.reduce((sum, g) => sum + g.w * s, 0);
    let x = cxAt - total / 2;
    return list.map((g, i) => {
      const el = <G key={`${cy}-${i}`} glyph={g} x={x} y={cy} s={s} />;
      x += g.w * s;
      return el;
    });
  };
  const countSize = Math.max(11, s * 1.42);
  return (
    <g>
      <rect className={styles.line} x={system.x0} y={y - thin / 2} width={system.x1 - system.x0} height={thin} />
      {ts && (
        <g className={styles.note}>
          {digits(ts.numerator, ts.x + 1.3 * s, y - s)}
          {digits(ts.denominator, ts.x + 1.3 * s, y + s)}
        </g>
      )}
      {system.barlines.map((b, i) =>
        b.final ? (
          <g key={i} className={styles.line}>
            <rect x={b.x - 0.95 * s} y={y - 1.5 * s} width={thin} height={3 * s} />
            <rect x={b.x - 0.45 * s} y={y - 1.5 * s} width={0.45 * s} height={3 * s} />
          </g>
        ) : (
          <rect key={i} className={styles.line} x={b.x - thin / 2} y={y - 1.5 * s} width={thin} height={3 * s} />
        ),
      )}
      {system.beams.map((b, i) => (
        <rect key={i} className={styles.beam} x={b.x1 - Math.max(1, 0.13 * s)} y={y - STEM * s + (b.level - 1) * BEAM_GAP * s} width={b.x2 - b.x1 + Math.max(1, 0.13 * s)} height={BEAM_THICKNESS * s} />
      ))}
      {system.ties.map((t, i) => {
        const y0 = y + 0.95 * s;
        const mid = (t.x1 + t.x2) / 2;
        const sag = Math.min(1.5 * s, 0.7 * s + (t.x2 - t.x1) * 0.04);
        return <path key={i} className={styles.note} d={`M${t.x1} ${y0} Q${mid} ${y0 + sag + 0.22 * s} ${t.x2} ${y0} Q${mid} ${y0 + sag - 0.12 * s} ${t.x1} ${y0}Z`} />;
      })}
      {system.tuplets.map((t, i) => {
        const ty = y - (STEM + 0.75) * s;
        const mid = (t.x1 + t.x2) / 2;
        const gap = 0.9 * s;
        return (
          <g key={i} className={styles.tuplet}>
            {t.bracket && (
              <path
                d={`M${t.x1} ${ty + 0.5 * s} V${ty} H${mid - gap} M${mid + gap} ${ty} H${t.x2} V${ty + 0.5 * s}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={thin}
              />
            )}
            <text x={mid} y={ty + 0.5 * s} textAnchor="middle" fontSize={1.5 * s}>
              3
            </text>
          </g>
        );
      })}
      {system.items.map((p) => (
        <Item key={`${p.bar}-${p.index}`} p={p} y={y} s={s} mark={p.onset !== null ? marks?.[p.onset] : undefined} />
      ))}
      {counts && (
        <g className={styles.counts} fontSize={countSize}>
          {system.items.map((p) =>
            p.count.text && (p.item.rest || p.onset !== null) ? (
              <text key={`${p.bar}-${p.index}`} x={p.cx} y={y + 3.75 * s} textAnchor="middle" className={p.item.rest ? styles.countFaint : p.count.strong ? styles.countStrong : undefined}>
                {p.count.text}
              </text>
            ) : null,
          )}
          {system.held.map((h, i) => (
            <text key={`h${i}`} x={h.x} y={y + 3.75 * s} textAnchor="middle" className={styles.countFaint}>
              {h.text}
            </text>
          ))}
        </g>
      )}
      {marks &&
        system.items.map((p) => {
          const mark = p.onset !== null ? marks[p.onset] : undefined;
          return mark ? (
            <g key={`m${p.bar}-${p.index}`} className={TONE[mark.verdict]}>
              <Mark mark={mark} x={p.cx} y={y + markY * s} s={s} />
            </g>
          ) : null;
        })}
    </g>
  );
}

/**
 * A rhythm in standard notation on a one-line staff, sized to its container. Notes can be marked
 * as they are played, and a playhead can be moved along the line from an animation frame.
 */
export const RhythmStaff = forwardRef<RhythmStaffHandle, RhythmStaffProps>(function RhythmStaff({ rhythm, marks, counts = true, reserveMarks = false, maxScale, maxHeight, className }, ref) {
  const [box, size] = useElementSize<HTMLDivElement>();
  const playhead = useRef<HTMLDivElement | null>(null);
  const showMarks = reserveMarks || !!marks;
  const layout = useMemo(() => (size.width > 0 ? layoutRhythm(rhythm, { width: size.width, counts, marks: showMarks, maxScale, maxHeight }) : null), [rhythm, size.width, counts, showMarks, maxScale, maxHeight]);
  const layoutRef = useRef<RhythmLayout | null>(null);
  layoutRef.current = layout;

  useImperativeHandle(
    ref,
    () => ({
      setPlayhead(tick: number | null) {
        const el = playhead.current;
        const l = layoutRef.current;
        if (!el) return;
        if (tick === null || !l) {
          el.style.opacity = '0';
          return;
        }
        const at = xAtTick(l, tick);
        const system = l.systems[at.system];
        el.style.opacity = '1';
        el.style.height = `${(ABOVE + 1.9) * l.scale}px`;
        el.style.transform = `translate(${at.x.toFixed(1)}px, ${(system.y - (ABOVE - 0.6) * l.scale).toFixed(1)}px)`;
      },
    }),
    [],
  );

  // A new rhythm starts without a playhead until the caller places it.
  useEffect(() => {
    if (playhead.current) playhead.current.style.opacity = '0';
  }, [rhythm]);

  const markY = counts ? 5.7 : 3.7;
  return (
    <div ref={box} className={cx(styles.staff, className)} style={{ minHeight: layout ? layout.height : Math.min(140, maxHeight ?? 140) }}>
      {layout && (
        <svg className={styles.svg} width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label={describeRhythm(rhythm)}>
          {layout.systems.map((system, i) => (
            <System key={i} system={system} layout={layout} marks={marks} counts={counts} markY={markY} />
          ))}
        </svg>
      )}
      <div ref={playhead} className={styles.playhead} aria-hidden="true" />
    </div>
  );
});

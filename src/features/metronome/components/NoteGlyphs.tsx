/**
 * Small pictures of rhythms, drawn with `currentColor` so they follow the text colour in both
 * themes: one beat of each subdivision (beamed notes, tuplet numbers, the swing figure), and the
 * note a tempo counts (a quarter, a dotted quarter ...).
 */
import type { ReactNode } from 'react';
import type { Subdivision } from '@/core/audio';
import type { BeatNote } from '../model/meters';

const W = 56;
const H = 34;
const HEAD_Y = 27;
const STEM_TOP = 9;

function Head({ x, open = false }: { x: number; open?: boolean }) {
  return <ellipse cx={x} cy={HEAD_Y} rx={3.6} ry={2.6} transform={`rotate(-22 ${x} ${HEAD_Y})`} fill={open ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth={open ? 1.3 : 0} />;
}

function Stem({ x, top = STEM_TOP }: { x: number; top?: number }) {
  return <line x1={x + 3.2} y1={HEAD_Y - 1} x2={x + 3.2} y2={top} stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />;
}

function Flag({ x, top = STEM_TOP }: { x: number; top?: number }) {
  const sx = x + 3.2;
  return <path d={`M${sx} ${top} c 1.5 3.5 6 4.5 4.6 9.5`} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />;
}

function TupletNumber({ value, from, to }: { value: number; from: number; to: number }) {
  const mid = (from + to) / 2;
  return (
    <text x={mid} y={6} textAnchor="middle" fontSize={7.5} fontWeight={700} fill="currentColor" fontFamily="var(--font-mono)">
      {value}
    </text>
  );
}

/** Props for {@link SubdivisionPicture}. */
export interface SubdivisionPictureProps {
  subdivision: Subdivision;
  /** Clicks in one beat of the current meter (eighths in 6/8 are three). */
  count: number;
  /** The beat is a dotted note (compound meters): the plain beat is drawn dotted. */
  dottedBeat?: boolean;
  className?: string;
}

/** One beat of a subdivision as notation. Decorative: always label it in text beside it. */
export function SubdivisionPicture({ subdivision, count, dottedBeat = false, className }: SubdivisionPictureProps) {
  const svg = (children: ReactNode) => (
    <svg viewBox={`0 0 ${W} ${H}`} width="3.5em" height="2.125em" aria-hidden="true" focusable="false" className={className}>
      {children}
    </svg>
  );
  if (subdivision === 'none' || count <= 1) {
    const x = W / 2 - 3;
    return svg(
      <>
        <Head x={x} />
        <Stem x={x} />
        {dottedBeat && <circle cx={x + 8} cy={HEAD_Y} r={1.4} fill="currentColor" />}
      </>,
    );
  }
  if (subdivision === 'swing') {
    // A quarter and an eighth under a triplet bracket: the long-short of swung eighths.
    const a = 14;
    const b = 38;
    return svg(
      <>
        <path d={`M${a} 9 V6.5 H${a + 6} M${b + 2} 6.5 H${b + 8} V9`} fill="none" stroke="currentColor" strokeWidth={1} />
        <TupletNumber value={3} from={a} to={b + 8} />
        <Head x={a} />
        <Stem x={a} top={12} />
        <Head x={b} />
        <Stem x={b} top={12} />
        <Flag x={b} top={12} />
      </>,
    );
  }
  const shown = Math.min(count, 6);
  const left = 8;
  const right = W - 12;
  const xs = Array.from({ length: shown }, (_, i) => left + (i * (right - left)) / (shown - 1));
  const beams = subdivision === 'eighth' || subdivision === 'triplet' ? 1 : 2;
  const tuplet = subdivision === 'triplet' || subdivision === 'quintuplet' || subdivision === 'sextuplet';
  const top = tuplet ? 12 : STEM_TOP;
  return svg(
    <>
      {tuplet && <TupletNumber value={count} from={xs[0] + 3} to={xs[shown - 1] + 3} />}
      {xs.map((x) => (
        <g key={x}>
          <Head x={x} />
          <Stem x={x} top={top} />
        </g>
      ))}
      {Array.from({ length: beams }, (_, i) => (
        <rect key={i} x={xs[0] + 2.5} y={top - 0.6 + i * 4} width={xs[shown - 1] - xs[0] + 1.4} height={2.6} fill="currentColor" />
      ))}
    </>,
  );
}

/** The note a tempo counts, small, for "BPM" labels. Decorative: pair it with words. */
export function BeatNoteGlyph({ note, className }: { note: BeatNote; className?: string }) {
  const x = 7;
  const open = note === 'half' || note === 'dotted-half';
  const dotted = note === 'dotted-quarter' || note === 'dotted-half';
  return (
    <svg viewBox="0 6 22 26" width="0.85em" height="1em" aria-hidden="true" focusable="false" className={className}>
      <Head x={x} open={open} />
      <Stem x={x} />
      {note === 'eighth' && <Flag x={x} />}
      {dotted && <circle cx={x + 8.5} cy={HEAD_Y} r={1.5} fill="currentColor" />}
    </svg>
  );
}

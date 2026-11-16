/**
 * Small drawings of the signs on the notation sheet (repeats, road signs, dynamics, articulation)
 * in `currentColor`, on a few faint staff lines for context. Each is decorative: the card around
 * it names the sign in words.
 */
import type { ReactNode } from 'react';
import styles from './Sections.module.css';

const LINES = [10, 16, 22, 28, 34];

function Staff({ from = 2, to = 94 }: { from?: number; to?: number }) {
  return (
    <g className={styles.glyphStaff}>
      {LINES.map((y) => (
        <line key={y} x1={from} x2={to} y1={y} y2={y} />
      ))}
    </g>
  );
}

/** A quarter note at (x, line y), stem up. */
function Note({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <ellipse cx={x} cy={y} rx={4.2} ry={3} transform={`rotate(-20 ${x} ${y})`} fill="currentColor" />
      <line x1={x + 3.8} y1={y - 1} x2={x + 3.8} y2={y - 20} stroke="currentColor" strokeWidth={1.4} />
    </g>
  );
}

function Text({ x, y, children, size = 15 }: { x: number; y: number; children: ReactNode; size?: number }) {
  return (
    <text x={x} y={y} textAnchor="middle" fontSize={size} className={styles.glyphText}>
      {children}
    </text>
  );
}

function RepeatBar({ x, end }: { x: number; end?: boolean }) {
  const dir = end ? -1 : 1;
  return (
    <g>
      <rect x={end ? x - 3 : x} y={10} width={3} height={24} fill="currentColor" />
      <line x1={x + dir * 6} x2={x + dir * 6} y1={10} y2={34} stroke="currentColor" strokeWidth={1.2} />
      <circle cx={x + dir * 10} cy={19} r={1.8} fill="currentColor" />
      <circle cx={x + dir * 10} cy={25} r={1.8} fill="currentColor" />
    </g>
  );
}

const DRAW: Record<string, () => ReactNode> = {
  repeat: () => (
    <>
      <Staff />
      <RepeatBar x={10} />
      <Note x={36} y={22} />
      <Note x={58} y={19} />
      <RepeatBar x={86} end />
    </>
  ),
  endings: () => (
    <>
      <Staff />
      <polyline points="6,8 6,2 46,2 46,8" fill="none" stroke="currentColor" strokeWidth={1.2} />
      <text x={9} y={8} fontSize={7} className={styles.glyphText}>1.</text>
      <polyline points="52,8 52,2 92,2" fill="none" stroke="currentColor" strokeWidth={1.2} />
      <text x={55} y={8} fontSize={7} className={styles.glyphText}>2.</text>
      <rect x={43} y={10} width={3} height={24} fill="currentColor" />
      <line x1={40} x2={40} y1={10} y2={34} stroke="currentColor" strokeWidth={1.2} />
      <circle cx={36} cy={19} r={1.6} fill="currentColor" />
      <circle cx={36} cy={25} r={1.6} fill="currentColor" />
      <Note x={22} y={22} />
      <Note x={70} y={22} />
    </>
  ),
  simile: () => (
    <>
      <Staff />
      <line x1={30} x2={30} y1={10} y2={34} stroke="currentColor" strokeWidth={1.2} />
      <line x1={66} x2={66} y1={10} y2={34} stroke="currentColor" strokeWidth={1.2} />
      <line x1={42} y1={28} x2={54} y2={16} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <circle cx={42} cy={17} r={2} fill="currentColor" />
      <circle cx={54} cy={27} r={2} fill="currentColor" />
    </>
  ),
  dc: () => <Text x={48} y={27} size={16}>D.C.</Text>,
  fine: () => <Text x={48} y={27} size={16}>Fine</Text>,
  segno: () => (
    <g transform="translate(48 22)">
      <path d="M7 -9 C 2 -15 -10 -12 -7 -5 C -4 2 7 -1 7 6 C 7 13 -5 14 -8 8" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" />
      <line x1={-10} y1={12} x2={10} y2={-12} stroke="currentColor" strokeWidth={1.6} />
      <circle cx={-9} cy={-4} r={2} fill="currentColor" />
      <circle cx={9} cy={4} r={2} fill="currentColor" />
    </g>
  ),
  coda: () => (
    <g transform="translate(48 22)">
      <ellipse cx={0} cy={0} rx={8} ry={10} fill="none" stroke="currentColor" strokeWidth={2.4} />
      <line x1={-14} x2={14} y1={0} y2={0} stroke="currentColor" strokeWidth={1.6} />
      <line x1={0} x2={0} y1={-15} y2={15} stroke="currentColor" strokeWidth={1.6} />
    </g>
  ),
  barlines: () => (
    <>
      <Staff />
      <line x1={36} x2={36} y1={10} y2={34} stroke="currentColor" strokeWidth={1.2} />
      <line x1={40} x2={40} y1={10} y2={34} stroke="currentColor" strokeWidth={1.2} />
      <line x1={80} x2={80} y1={10} y2={34} stroke="currentColor" strokeWidth={1.2} />
      <rect x={84} y={10} width={4} height={24} fill="currentColor" />
      <Note x={18} y={22} />
      <Note x={58} y={19} />
    </>
  ),
  cresc: () => <polyline points="16,16 80,22 16,28" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" transform="rotate(180 48 22)" />,
  dim: () => <polyline points="16,16 80,22 16,28" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />,
  staccato: () => (
    <>
      <Staff from={20} to={76} />
      <Note x={46} y={25} />
      <circle cx={46} cy={34} r={2} fill="currentColor" />
    </>
  ),
  accent: () => (
    <>
      <Staff from={20} to={76} />
      <Note x={46} y={25} />
      <polyline points="40,32 52,35 40,38" fill="none" stroke="currentColor" strokeWidth={1.5} />
    </>
  ),
  tenuto: () => (
    <>
      <Staff from={20} to={76} />
      <Note x={46} y={25} />
      <line x1={40} x2={52} y1={34} y2={34} stroke="currentColor" strokeWidth={2} />
    </>
  ),
  marcato: () => (
    <>
      <Staff from={20} to={76} />
      <Note x={46} y={31} />
      <polyline points="45,8 50,1 55,8" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
    </>
  ),
  fermata: () => (
    <>
      <Staff from={20} to={76} />
      <Note x={46} y={31} />
      <path d="M40 8 A 10 7 0 0 1 60 8" fill="none" stroke="currentColor" strokeWidth={2} />
      <circle cx={50} cy={6} r={1.6} fill="currentColor" />
    </>
  ),
  slur: () => (
    <>
      <Staff from={14} to={82} />
      <Note x={30} y={25} />
      <Note x={50} y={22} />
      <Note x={70} y={19} />
      <path d="M28 33 Q 50 42 72 29" fill="none" stroke="currentColor" strokeWidth={1.5} />
    </>
  ),
};

/** The dynamics marks are letters, drawn in the italic of the display face. */
const LETTERS = new Set(['pp', 'p', 'mp', 'mf', 'f', 'ff', 'sfz']);

/** A sign from the sheet by glyph id (`repeat`, `coda`, `mf`, `staccato` …). */
export function SignGlyph({ glyph }: { glyph: string }) {
  const body = LETTERS.has(glyph) ? <Text x={48} y={29} size={22}>{glyph}</Text> : DRAW[glyph]?.() ?? null;
  return (
    <svg className={styles.glyph} viewBox="0 0 96 44" aria-hidden="true" focusable="false">
      {body}
    </svg>
  );
}

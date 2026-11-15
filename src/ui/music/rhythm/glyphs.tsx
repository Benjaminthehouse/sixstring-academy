/**
 * Small note, rest and stroke glyphs for beat grids, drawn as plain SVG in `currentColor` (no
 * notation engine needed for a single symbol). Each glyph is decorative: the grid around it says
 * in words what it is.
 */
import type { NoteValueId } from '@/core/theory';

/** A note or rest symbol, about 1 em wide and 1.6 em tall. */
export function NoteGlyph({ value, dots = 0, rest = false, className }: { value: NoteValueId; dots?: number; rest?: boolean; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 36" width="1em" height="1.5em" aria-hidden="true" focusable="false">
      {rest ? <RestShape value={value} /> : <NoteShape value={value} />}
      {Array.from({ length: dots }, (_unused, i) => (
        <circle key={i} cx={19 + i * 4} cy={rest ? 16 : 29} r={1.6} fill="currentColor" />
      ))}
    </svg>
  );
}

function NoteShape({ value }: { value: NoteValueId }) {
  const hollow = value === 'whole' || value === 'half' || value === 'double-whole';
  const head = <ellipse cx={value === 'whole' ? 12 : 10} cy={29} rx={5.6} ry={4} transform={`rotate(-22 ${value === 'whole' ? 12 : 10} 29)`} fill={hollow ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth={hollow ? 2 : 1} />;
  if (value === 'whole' || value === 'double-whole') return head;
  const flags = value === 'eighth' ? 1 : value === 'sixteenth' ? 2 : value === 'thirty-second' ? 3 : 0;
  return (
    <g>
      {head}
      <line x1={15} y1={28} x2={15} y2={3} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      {Array.from({ length: flags }, (_unused, i) => (
        <path key={i} d={`M15 ${3 + i * 6} c1 5 8 6 6 13`} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      ))}
    </g>
  );
}

function RestShape({ value }: { value: NoteValueId }) {
  switch (value) {
    case 'whole':
    case 'double-whole':
      return (
        <g>
          <line x1={3} y1={12} x2={21} y2={12} stroke="currentColor" strokeWidth={1.2} />
          <rect x={7} y={12} width={10} height={5} fill="currentColor" />
        </g>
      );
    case 'half':
      return (
        <g>
          <line x1={3} y1={18} x2={21} y2={18} stroke="currentColor" strokeWidth={1.2} />
          <rect x={7} y={13} width={10} height={5} fill="currentColor" />
        </g>
      );
    case 'quarter':
      return <path d="M9 5 L15 12 L10 17 L15 23 C10 21 8 24 12 29 C5 26 6 20 11 21 L6 16 L11 11 Z" fill="currentColor" />;
    default: {
      const flags = value === 'eighth' ? 1 : value === 'sixteenth' ? 2 : 3;
      return (
        <g>
          <line x1={16} y1={9} x2={10} y2={30} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
          {Array.from({ length: flags }, (_unused, i) => (
            <g key={i}>
              <circle cx={9} cy={10 + i * 6} r={2.4} fill="currentColor" />
              <path d={`M9 ${12 + i * 6} C11 ${13 + i * 6} 14 ${12 + i * 6} ${16 - i * 1.6} ${9 + i * 6}`} fill="none" stroke="currentColor" strokeWidth={1.4} />
            </g>
          ))}
        </g>
      );
    }
  }
}

/** A tie: the note before is held on, nothing new is played. */
export function TieGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 36" width="1em" height="1.5em" aria-hidden="true" focusable="false">
      <path d="M1 25 C6 33 18 33 23 25 C18 30 6 30 1 25 Z" fill="currentColor" stroke="currentColor" strokeWidth={1} strokeLinejoin="round" />
    </svg>
  );
}

/** A strum arrow. `down` points down (a downstroke: low strings to high). */
export function StrokeGlyph({ dir, kind, className }: { dir: 'down' | 'up'; kind: 'strum' | 'accent' | 'mute' | 'ghost'; className?: string }) {
  const down = dir === 'down';
  const top = 6;
  const bottom = 34;
  const tip = down ? bottom : top;
  const tail = down ? top : bottom;
  const head = down ? `M5 ${tip - 9} L12 ${tip} L19 ${tip - 9}` : `M5 ${tip + 9} L12 ${tip} L19 ${tip + 9}`;
  const width = kind === 'accent' ? 3.6 : 2.4;
  return (
    <svg className={className} viewBox="0 0 24 40" width="1.2em" height="2em" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={kind === 'ghost' ? '3 4' : undefined}>
        <line x1={12} y1={tail} x2={12} y2={tip} />
        <path d={head} />
        {kind === 'mute' && <path d="M5 13 L19 27 M19 13 L5 27" strokeWidth={2.4} strokeDasharray="none" />}
      </g>
    </svg>
  );
}

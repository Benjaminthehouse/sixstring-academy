/**
 * Example music for the tab gallery and the layout tests: an original song with techniques,
 * chords and lyrics, and a generator for long original arpeggio studies (a 200-bar one is the
 * performance fixture). All written for Sixstring Academy.
 */

/** An original folk song in G: melody with hammer-ons, pull-offs, a bend, a slide, vibrato, let ring, palm mute, harmonics, chords and words. */
export const RIVERSIDE_MORNING = `title: Riverside Morning
composer: Sixstring Academy
licence: Original song for Sixstring Academy
difficulty: 4
tags: melody, lyrics, techniques
tempo: 84
time: 4/4
key: G

[Verse]
| "G" q 2:3 e 2:0 2:0 q 2:3 1:0 | "Em" q 2:3 e 2:0 2:1h q 2:0p 3:2 | "C" h 3:0~ q 4:2{lr} e 3:0{lr} 2:1{lr} | "D" e 1:2{1} 1:3h{2} 1:2p{1} 2:3{3} q 2:3b /3:4 |
lyrics: Down by the ri- ver the mor- _ ning is slow
| "G" q 1:0 e 2:3 2:0 q 2:3 1:0 | "Em" e (6:0 5:2){pm dn} (6:0 5:2){pm dn} q 2:0 e 2:1 2:3 q 2:3 | "C" h 1:0~ q 1:<12> 3:<12> | "G" w (6:3 4:0 3:0 2:0){lr dn} ||
lyrics: Wa- ter keeps sing- ing _ _ wher- ev- er I go
`;

interface Shape {
  symbol: string;
  bass: string;
  /** Treble notes on strings 3, 2, 1. */
  t3: string;
  t2: string;
  t1: string;
}

const SHAPES: Shape[] = [
  { symbol: 'C', bass: '5:3', t3: '3:0', t2: '2:1', t1: '1:0' },
  { symbol: 'Am', bass: '5:0', t3: '3:2', t2: '2:1', t1: '1:0' },
  { symbol: 'F', bass: '4:3', t3: '3:2', t2: '2:1', t1: '1:1' },
  { symbol: 'G', bass: '6:3', t3: '3:0', t2: '2:0', t1: '1:3' },
  { symbol: 'Em', bass: '6:0', t3: '3:0', t2: '2:0', t1: '1:0' },
  { symbol: 'Am', bass: '5:0', t3: '3:2', t2: '2:1', t1: '1:0' },
  { symbol: 'Dm', bass: '4:0', t3: '3:2', t2: '2:3', t1: '1:1' },
  { symbol: 'G', bass: '6:3', t3: '3:0', t2: '2:0', t1: '1:3' },
];

const PATTERNS: Array<(s: Shape) => string> = [
  (s) => `e ${s.bass} ${s.t3} ${s.t2} ${s.t1} ${s.t2} ${s.t3} ${s.t2} ${s.t3}`,
  (s) => `s ${s.bass} ${s.t3} ${s.t2} ${s.t3} ${s.t1} ${s.t3} ${s.t2} ${s.t3} ${s.bass} ${s.t3} ${s.t2} ${s.t3} ${s.t1} ${s.t3} ${s.t2} ${s.t3}`,
  (s) => `e3 ${s.bass} ${s.t3} ${s.t2} ${s.t1} ${s.t2} ${s.t3} ${s.bass} ${s.t3} ${s.t2} ${s.t1} ${s.t2} ${s.t3}`,
  (s) => `q ${s.bass} e ${s.t3} ${s.t2} q (${s.t2} ${s.t1}) e ${s.t3} ${s.t2}`,
  (s) => `q. ${s.bass} e ${s.t1} q (${s.t3} ${s.t2} ${s.t1}){dn} e (${s.t3} ${s.t2} ${s.t1}){up} r`,
  (s) => `h (${s.bass} ${s.t3} ${s.t2} ${s.t1}){lr} q ${s.t2} ${s.t3}`,
];

/**
 * An original arpeggio study of `bars` bars (default 200) in C: an eight-chord cycle, a new
 * picking pattern every 8 bars, a section name every 16, tempo changes every 48, a 3/4 passage.
 */
export function longStudy(bars = 200): string {
  const lines: string[] = [
    'title: Long Study in C',
    'composer: Sixstring Academy',
    'licence: Original study for Sixstring Academy',
    'tempo: 92',
    'time: 4/4',
    'key: C',
    '',
  ];
  let line: string[] = [];
  const flush = () => {
    if (line.length) lines.push(`| ${line.join(' | ')} |`);
    line = [];
  };
  for (let b = 0; b < bars; b++) {
    if (b % 16 === 0) {
      flush();
      lines.push(`[Part ${b / 16 + 1}]`);
      if (b > 0 && b % 48 === 0) lines.push(`tempo: ${92 + ((b / 48) % 3) * 8}`);
    }
    const waltz = b >= 96 && b < 104;
    if (b === 96 || b === 104) {
      flush();
      lines.push(`time: ${waltz ? '3/4' : '4/4'}`);
    }
    const shape = SHAPES[b % SHAPES.length];
    const body = waltz ? `e ${shape.bass} ${shape.t3} ${shape.t2} ${shape.t1} ${shape.t2} ${shape.t3}` : PATTERNS[Math.floor(b / 8) % PATTERNS.length](shape);
    line.push(`"${shape.symbol}" ${body}`);
    if (line.length === 4) flush();
  }
  flush();
  // Close the piece with a final barline.
  const last = lines.length - 1;
  lines[last] = lines[last].replace(/\|$/, '||');
  return `${lines.join('\n')}\n`;
}

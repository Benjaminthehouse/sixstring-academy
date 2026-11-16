/**
 * Drawings for teaching cards that the lesson engine's figures cannot make: the parts of the
 * guitar, how to sit, how to hold a pick, where to press. Flat, labelled, in the instrument's own
 * materials (the fretboard woods, frets and strings) and the app's type, so they sit with the
 * fretboard and tab figures in both themes. Every label is text, never colour alone.
 */
import type { CardArt } from '@/content/teachers';
import styles from './Art.module.css';

const TITLES: Record<CardArt, string> = {
  'guitar-parts': 'The parts of a guitar: headstock with tuning pegs, nut, neck with frets, body with soundhole and bridge.',
  posture: 'Sitting with the guitar: its waist on your right thigh, neck pointing slightly up, back upright, shoulders down, picking forearm over the top edge.',
  'pick-grip': 'Holding a pick: between the pad of the thumb and the side of the index finger, with 2 to 3 millimetres showing.',
  fretting: 'Where to press: just behind the fret wire gives a clear note; on top of the wire or in the middle of the space does not.',
};

/** A drawing by name. */
export function Art({ kind }: { kind: CardArt }) {
  return (
    <figure className={styles.art} data-art={kind}>
      {kind === 'guitar-parts' ? <GuitarParts /> : kind === 'posture' ? <Posture /> : kind === 'pick-grip' ? <PickGrip /> : <Fretting />}
      <figcaption className="sr-only">{TITLES[kind]}</figcaption>
    </figure>
  );
}

/** Label text with a leader line from (x1, y1) to (x2, y2). */
function Label({ x, y, text, to, anchor = 'middle' }: { x: number; y: number; text: string; to?: [number, number]; anchor?: 'start' | 'middle' | 'end' }) {
  return (
    <g>
      {to && <line className={styles.leader} x1={to[0]} y1={to[1]} x2={x + (anchor === 'start' ? -2 : anchor === 'end' ? 2 : 0)} y2={y > to[1] ? y - 11 : y + 4} />}
      {to && <circle className={styles.leaderDot} cx={to[0]} cy={to[1]} r="2.2" />}
      <text className={styles.label} x={x} y={y} textAnchor={anchor}>
        {text}
      </text>
    </g>
  );
}

const NUT_X = 300;
const SADDLE_X = 46;
/** Fret wire x positions from the real fret rule (each fret 2^(-1/12) of the string left). */
const FRETS = Array.from({ length: 14 }, (_, i) => NUT_X - (NUT_X - SADDLE_X) * (1 - 2 ** (-(i + 1) / 12)));

function GuitarParts() {
  const strings = [77.5, 80.5, 83.5, 86.5, 89.5, 92.5].reverse();
  const between = (a: number, b: number) => (FRETS[a - 2] ?? NUT_X) / 2 + FRETS[b - 1] / 2;
  return (
    <svg viewBox="0 0 360 168" aria-hidden="true" focusable="false">
      {/* Body: two bouts, the outline drawn first, a little larger. */}
      <circle className={styles.woodDark} cx="62" cy="86" r="54.5" />
      <circle className={styles.woodDark} cx="130" cy="86" r="42.5" />
      <circle className={styles.top} cx="62" cy="86" r="52" />
      <circle className={styles.top} cx="130" cy="86" r="40" />
      <circle className={styles.rosette} cx="124" cy="86" r="19.5" />
      <circle className={styles.hole} cx="124" cy="86" r="16" />
      <rect className={styles.woodDeep} x="38" y="68" width="14" height="36" rx="3" />
      <rect className={styles.bone} x="45" y="70" width="2.5" height="32" rx="1" />
      {/* Neck, frets and dots. */}
      <rect className={styles.wood} x="158" y="76" width={NUT_X - 158} height="20" />
      {FRETS.filter((x) => x > 160).map((x) => (
        <line key={x} className={styles.fret} x1={x} y1="76" x2={x} y2="96" />
      ))}
      {[3, 5, 7, 9].map((n) => (
        <circle key={n} className={styles.inlay} cx={between(n, n)} cy="86" r="2" />
      ))}
      <circle className={styles.inlay} cx={between(12, 12)} cy="81" r="2" />
      <circle className={styles.inlay} cx={between(12, 12)} cy="91" r="2" />
      <rect className={styles.bone} x={NUT_X - 1} y="75" width="4" height="22" rx="1" />
      {/* Headstock and pegs. */}
      <path className={styles.wood} d={`M${NUT_X + 3} 74 L346 67 Q352 86 346 105 L${NUT_X + 3} 98 Z`} />
      {[314, 327, 340].map((x) => (
        <g key={x}>
          <rect className={styles.metal} x={x - 2} y="62" width="4" height="8" />
          <ellipse className={styles.metal} cx={x} cy="59" rx="5" ry="3.5" />
          <rect className={styles.metal} x={x - 2} y="102" width="4" height="8" />
          <ellipse className={styles.metal} cx={x} cy="113" rx="5" ry="3.5" />
        </g>
      ))}
      {/* Strings from the bridge over the nut to the pegs. */}
      {strings.map((y, i) => (
        <g key={y}>
          <line className={i < 3 ? styles.stringWound : styles.string} x1="46" y1={y} x2={NUT_X + 2} y2={y} />
          <line className={i < 3 ? styles.stringWound : styles.string} x1={NUT_X + 2} y1={y} x2={[314, 327, 340][i % 3]} y2={i < 3 ? 70 : 102} />
        </g>
      ))}
      <Label x={46} y={18} text="Bridge" to={[46, 72]} />
      <Label x={124} y={18} text="Soundhole" to={[124, 70]} />
      <Label x={233} y={18} text="Frets" to={[FRETS[4], 78]} />
      <Label x={300} y={42} text="Nut" to={[NUT_X + 1, 75]} />
      <Label x={358} y={18} text="Tuning pegs" anchor="end" to={[340, 56]} />
      <Label x={62} y={160} text="Body" to={[62, 128]} />
      <Label x={205} y={160} text="Neck" to={[205, 96]} />
      <Label x={330} y={160} text="Headstock" to={[330, 100]} />
    </svg>
  );
}

function Posture() {
  return (
    <svg viewBox="0 0 280 230" aria-hidden="true" focusable="false">
      {/* Chair. */}
      <rect className={styles.chair} x="72" y="150" width="116" height="10" rx="4" />
      <rect className={styles.chair} x="80" y="160" width="6" height="62" />
      <rect className={styles.chair} x="174" y="160" width="6" height="62" />
      {/* Legs. */}
      <path className={styles.trousers} d="M98 146 L124 146 L120 222 L100 222 Z" />
      <path className={styles.trousers} d="M136 146 L162 146 L160 222 L140 222 Z" />
      {/* Torso, upright. */}
      <path className={styles.shirt} d="M100 62 Q130 52 160 62 L166 150 L94 150 Z" />
      <rect className={styles.skin} x="123" y="44" width="14" height="16" rx="5" />
      <circle className={styles.skin} cx="130" cy="32" r="17" />
      <path className={styles.hair} d="M113 30 Q114 12 130 13 Q147 12 147 30 Q140 22 130 22 Q119 22 113 30 Z" />
      {/* Guitar: body on the right thigh (the viewer's left), neck rising to the viewer's right. */}
      <g transform="rotate(-14 130 132)">
        <circle className={styles.woodDark} cx="96" cy="134" r="35" />
        <circle className={styles.woodDark} cx="140" cy="134" r="27" />
        <circle className={styles.top} cx="96" cy="134" r="33" />
        <circle className={styles.top} cx="140" cy="134" r="25" />
        <circle className={styles.hole} cx="136" cy="134" r="10" />
        <rect className={styles.wood} x="162" y="129" width="92" height="10" />
        <path className={styles.wood} d="M254 128 L274 125 L274 143 L254 140 Z" />
        <rect className={styles.woodDeep} x="80" y="124" width="7" height="20" rx="2" />
      </g>
      {/* Picking arm over the top edge; fretting hand on the neck. */}
      <path className={styles.shirt} d="M102 64 Q82 80 80 104 L90 108 Q96 86 112 74 Z" />
      <path className={styles.skin} d="M82 102 Q96 116 120 122 L118 130 Q92 126 78 110 Z" />
      <path className={styles.shirt} d="M158 64 Q186 82 206 92 L200 102 Q178 92 156 80 Z" />
      <path className={styles.skin} d="M200 92 Q214 90 226 92 L224 102 Q212 104 200 102 Z" />
      {/* Checks. */}
      <Check x={198} y={44} text="Neck slightly up" />
      <Check x={6} y={52} text="Shoulders down" />
      <Check x={6} y={84} text="Back upright" />
      <Check x={176} y={196} text="Waist on your thigh" />
      <line className={styles.leader} x1="96" y1="60" x2="104" y2="64" />
      <line className={styles.leader} x1="242" y1="56" x2="248" y2="84" />
      <line className={styles.leader} x1="174" y1="192" x2="150" y2="160" />
    </svg>
  );
}

function Check({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle className={styles.okDot} cx="7" cy="-4" r="7" />
      <path className={styles.okMark} d="M3.5 -4 L6 -1.5 L10.5 -7" />
      <text className={styles.label} x="18" y="0" textAnchor="start">
        {text}
      </text>
    </g>
  );
}

function PickGrip() {
  return (
    <svg viewBox="0 0 280 170" aria-hidden="true" focusable="false">
      {/* Index finger, curled, seen from the side. */}
      <path className={styles.skinShade} d="M0 92 C60 82 118 84 150 98 C172 108 176 132 160 140 C144 147 124 132 104 128 C72 122 32 126 0 130 Z" />
      {/* The pick, pointing at the strings; only its tip shows. */}
      <path className={styles.pick} d="M118 96 L176 100 Q182 101 180 106 L156 150 Q152 156 148 150 L114 104 Q112 97 118 96 Z" />
      {/* Thumb, pad down on the pick. */}
      <path className={styles.skin} d="M20 52 C76 40 130 56 156 80 C168 92 160 108 144 106 C120 103 96 92 66 88 C40 84 16 76 20 52 Z" />
      <path className={styles.nail} d="M138 78 C148 84 154 92 152 98 C146 96 138 90 134 84 Z" />
      {/* The 2 to 3 mm that show. */}
      <path className={styles.measure} d="M163 141 L172 146 M154 157 L163 162 M168 143.5 L158.5 159.5" />
      <Label x={30} y={20} text="Pad of the thumb" anchor="start" to={[96, 60]} />
      <Label x={10} y={160} text="Side of the index finger" anchor="start" to={[110, 128]} />
      <Label x={274} y={160} text="2 to 3 mm showing" anchor="end" to={[166, 152]} />
      <Label x={274} y={64} text="Pick" anchor="end" to={[174, 103]} />
    </svg>
  );
}

function Fretting() {
  const strings = [52, 64, 76, 88, 100, 112];
  const wires = [48, 150, 238];
  return (
    <svg viewBox="0 0 320 196" aria-hidden="true" focusable="false">
      <text className={styles.dir} x="6" y="24">
        Headstock
      </text>
      <text className={styles.dir} x="314" y="24" textAnchor="end">
        Body
      </text>
      <rect className={styles.wood} x="0" y="40" width="320" height="84" />
      {wires.map((x) => (
        <rect key={x} className={styles.fretWire} x={x - 2.5} y="40" width="5" height="84" rx="1.5" />
      ))}
      {strings.map((y, i) => (
        <line key={y} className={i > 2 ? styles.stringWound : styles.string} x1="0" y1={y} x2="320" y2={y} />
      ))}
      {/* A fingertip pressing string 3 just behind the wire (the headstock side of it). */}
      <path className={styles.skin} d="M126 196 L126 98 Q126 70 139 70 Q152 70 152 98 L152 196 Z" />
      <path className={styles.nail} d="M131 84 Q139 74 147 84 L147 96 Q139 92 131 96 Z" />
      <circle className={styles.press} cx="139" cy="76" r="4" />
      {/* Where to press, and where not to. */}
      <Mark x={139} ok />
      <Mark x={99} />
      <Mark x={150} far />
      <text className={styles.labelOk} x="139" y="150" textAnchor="middle">
        Just behind: clear
      </text>
      <text className={styles.labelBad} x="70" y="174" textAnchor="middle">
        Middle: buzzes
      </text>
      <text className={styles.labelBad} x="240" y="174" textAnchor="middle">
        On the wire: muffled
      </text>
      <line className={styles.leader} x1="99" y1="136" x2="80" y2="162" />
      <line className={styles.leader} x1="154" y1="136" x2="226" y2="162" />
    </svg>
  );
}

function Mark({ x, ok = false, far = false }: { x: number; ok?: boolean; far?: boolean }) {
  const y = 132;
  return ok ? (
    <g transform={`translate(${x - 7} ${y - 7})`} data-far={far || undefined}>
      <circle className={styles.okDot} cx="7" cy="7" r="7" />
      <path className={styles.okMark} d="M3.5 7 L6 9.5 L10.5 4" />
    </g>
  ) : (
    <g transform={`translate(${x - 7} ${y - 7})`}>
      <circle className={styles.badDot} cx="7" cy="7" r="7" />
      <path className={styles.badMark} d="M4.5 4.5 L9.5 9.5 M9.5 4.5 L4.5 9.5" />
    </g>
  );
}

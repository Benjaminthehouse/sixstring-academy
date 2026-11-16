/**
 * How to take a photo the reader can read: four small pictures (one good, three common mistakes)
 * and the tips in words. Drawn in SVG from the theme's tokens.
 */
import { Icon, Stack, Text, cx } from '@/ui';
import styles from './Tips.module.css';

/** A sheet of music drawn small: staff lines and a few notes. */
function MiniSheet({ x, y, w, h, tilt = 0, curl = false, blur = false }: { x: number; y: number; w: number; h: number; tilt?: number; curl?: boolean; blur?: boolean }) {
  const rows = [0.24, 0.5, 0.76];
  return (
    <g transform={`rotate(${tilt} ${x + w / 2} ${y + h / 2})`} className={blur ? styles.blurred : undefined}>
      <rect className={styles.paper} x={x} y={y} width={w} height={h} rx={2} />
      {rows.map((r) =>
        [0, 1, 2, 3, 4].map((l) => {
          const yy = y + h * r + (l - 2) * (h * 0.028);
          const sag = curl ? h * 0.05 : 0;
          return <path key={`${r}-${l}`} className={styles.staff} d={`M${x + w * 0.1} ${yy} Q${x + w / 2} ${yy + sag} ${x + w * 0.9} ${yy}`} />;
        }),
      )}
      {rows.map((r) =>
        [0.25, 0.42, 0.6, 0.78].map((c, i) => <ellipse key={`${r}-${c}`} className={styles.head} cx={x + w * c} cy={y + h * r + ((i % 3) - 1) * h * 0.03} rx={w * 0.028} ry={h * 0.016} />),
      )}
    </g>
  );
}

function Frame({ ok, label, children }: { ok: boolean; label: string; children: React.ReactNode }) {
  return (
    <figure className={styles.frame}>
      <svg viewBox="0 0 100 120" className={styles.svg} role="img" aria-label={label}>
        <rect className={styles.desk} x={0} y={0} width={100} height={120} rx={8} />
        {children}
      </svg>
      <figcaption className={cx(styles.caption, ok ? styles.good : styles.bad)}>
        <Icon name={ok ? 'CircleCheck' : 'CircleX'} size="sm" />
        {label}
      </figcaption>
    </figure>
  );
}

/** The four pictures. */
export function TipsPicture() {
  return (
    <div className={styles.pictures}>
      <Frame ok label="Flat, filling the frame">
        <MiniSheet x={10} y={8} w={80} h={104} />
      </Frame>
      <Frame ok={false} label="Too far away">
        <MiniSheet x={34} y={38} w={32} h={42} />
      </Frame>
      <Frame ok={false} label="Shadow across it">
        <MiniSheet x={10} y={8} w={80} h={104} />
        <path className={styles.shadow} d="M0 50 L100 30 L100 92 L0 112 Z" />
      </Frame>
      <Frame ok={false} label="Curled or blurred">
        <MiniSheet x={12} y={10} w={76} h={100} tilt={-7} curl blur />
      </Frame>
    </div>
  );
}

const TIPS: { icon: string; text: string }[] = [
  { icon: 'Layers', text: 'Lay the page flat. A darker table around it helps the edges show.' },
  { icon: 'Scan', text: 'Hold the phone straight above the page and let the page fill the picture.' },
  { icon: 'Sun', text: 'Use daylight or a bright lamp, with no shadow of your hand or phone on the music.' },
  { icon: 'Focus', text: 'Hold still and tap the screen to focus: the fret numbers must be sharp.' },
  { icon: 'Files', text: 'One page per photo. Add the next page after it; they become one song.' },
  { icon: 'PenOff', text: 'Printed tab and printed notation read best. Handwriting is not supported.' },
];

/** Pictures and tips together (for the tips sheet). */
export function CaptureTips() {
  return (
    <Stack gap={5}>
      <TipsPicture />
      <ul className={styles.list}>
        {TIPS.map((t) => (
          <li key={t.text} className={styles.item}>
            <span className={styles.icon} aria-hidden="true">
              <Icon name={t.icon} size="sm" />
            </span>
            <Text>{t.text}</Text>
          </li>
        ))}
      </ul>
    </Stack>
  );
}

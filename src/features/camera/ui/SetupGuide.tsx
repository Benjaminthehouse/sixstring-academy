/**
 * What the stage shows before the camera starts: a picture of how to set up (the neck across the
 * frame, nut in view, the camera at chest height) and the one button that starts it all.
 */
import { Button, Icon } from '@/ui';
import styles from './Stage.module.css';

/** The setup picture: a viewfinder with a neck across it, nut at the right, a light above. */
function SetupPicture() {
  const frets = Array.from({ length: 16 }, (_, i) => i);
  const x = (n: number) => 262 - 232 * (1 - Math.pow(2, -n / 12)) * 1.55;
  return (
    <svg className={styles.picture} viewBox="0 0 320 180" role="img" aria-label="A guitar neck held across the camera picture, the nut on one side, in good light.">
      <g className={styles.finder}>
        <path d="M14 38 V14 H38" />
        <path d="M282 14 H306 V38" />
        <path d="M306 142 V166 H282" />
        <path d="M38 166 H14 V142" />
      </g>
      <g className={styles.sun}>
        <circle cx="52" cy="40" r="9" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
          const r = (a * Math.PI) / 180;
          return <line key={a} x1={52 + Math.cos(r) * 13} y1={40 + Math.sin(r) * 13} x2={52 + Math.cos(r) * 18} y2={40 + Math.sin(r) * 18} />;
        })}
      </g>
      <g transform="rotate(-6 160 100)">
        <path className={styles.neckWood} d="M30 86 L262 80 L262 116 L30 112 Z" />
        <rect className={styles.headstock} x="262" y="74" width="34" height="48" rx="6" />
        <rect className={styles.nut} x="259" y="79" width="5" height="38" rx="1" />
        {frets.slice(1).map((n) => (
          <line key={n} className={styles.fret} x1={x(n)} y1={80.5 + (262 - x(n)) * 0.026} x2={x(n)} y2={116 - (262 - x(n)) * 0.017} />
        ))}
        {[3, 5, 7, 9, 15].map((n) => (
          <circle key={n} className={styles.inlay} cx={(x(n) + x(n - 1)) / 2} cy="98" r="2.4" />
        ))}
        {[0, 1, 2, 3, 4, 5].map((s) => (
          <line key={s} className={styles.string} x1="30" y1={89 + s * 4.4} x2="262" y2={84 + s * 5.6} />
        ))}
        <circle className={styles.dot1} cx={(x(5) + x(4)) / 2} cy="88.5" r="5" />
        <circle className={styles.dot3} cx={(x(7) + x(6)) / 2} cy="98" r="5" />
        <circle className={styles.dot5} cx={(x(7) + x(6)) / 2} cy="108" r="5" />
      </g>
    </svg>
  );
}

/** Tips beside the picture: four short lines a learner can follow without reading twice. */
export const SETUP_TIPS: ReadonlyArray<{ icon: string; title: string; text: string }> = [
  { icon: 'MoveHorizontal', title: 'Neck across the picture', text: 'Hold the guitar so the neck runs from side to side and fills most of the picture.' },
  { icon: 'ScanLine', title: 'Nut in view', text: 'Show the end by the headstock if you can: that is how the frets get their numbers.' },
  { icon: 'Sun', title: 'Good light', text: 'Light on the neck, and no bright window behind you.' },
  { icon: 'Smartphone', title: 'Camera at chest height', text: 'About an arm’s length away, facing you. On a phone, use the main lens, not the ultra-wide one.' },
];

/** The idle stage: picture, title, the start button. */
export function SetupGuide({ onStart, starting, onDrawn }: { onStart: () => void; starting: boolean; onDrawn: () => void }) {
  return (
    <div className={styles.guide}>
      <SetupPicture />
      <div className={styles.guideText}>
        <p className={styles.guideTitle}>See the notes on your own frets</p>
        <p className={styles.guideLead}>Point the camera at your guitar’s neck and the dots appear where your fingers go.</p>
      </div>
      <div className={styles.guideActions}>
        <Button variant="primary" size="lg" iconLeft="Camera" loading={starting} onClick={onStart}>
          Start camera
        </Button>
        <button type="button" className={styles.quiet} onClick={onDrawn}>
          No camera? Use a drawn neck
        </button>
      </div>
      <p className={styles.privacyOnStage}>
        <Icon name="ShieldCheck" size="xs" /> The video stays on this device. Nothing is recorded or sent.
      </p>
    </div>
  );
}

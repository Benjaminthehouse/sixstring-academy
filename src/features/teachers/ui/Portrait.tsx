/**
 * The three teachers as drawn portraits: flat, warm, in the app's materials (skin and hair are
 * mixed from the fretboard woods, clothes from each teacher's colour slot), so they read the same
 * in both themes and never need a photo. Sizes in rem so they grow with the learner's text size.
 *
 *   <Portrait teacher="mia" size={6} />          decorative by default (the name is beside it)
 *   <Portrait teacher="dev" size={2.5} label />  announced as "Dev Okafor"
 */
import { useId, type CSSProperties } from 'react';
import { cx } from '@/ui';
import { teacherById } from '@/app/teachers';
import type { TeacherKey } from '@/content/teachers';
import styles from './Portrait.module.css';

/** Props of {@link Portrait}. */
export interface PortraitProps {
  teacher: TeacherKey;
  /** Diameter in rem (default 3, or whatever `--portrait-size` a class sets when this is left out). */
  size?: number;
  /** Announce the teacher's name (default: decorative). */
  label?: boolean;
  /** A ring in the selection colour. */
  ring?: boolean;
  className?: string;
}

/** A teacher's drawn portrait in a circle. */
export function Portrait({ teacher, size, label = false, ring = false, className }: PortraitProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const clip = `pc${uid}`;
  const name = teacherById(teacher).name;
  return (
    <span className={cx(styles.portrait, styles[teacher], ring && styles.ring, className)} style={size !== undefined ? ({ ['--portrait-size' as string]: `${size}rem` } as CSSProperties) : undefined} data-portrait={teacher}>
      <svg viewBox="0 0 120 120" role={label ? 'img' : undefined} aria-label={label ? name : undefined} aria-hidden={label ? undefined : true} focusable="false">
        <defs>
          <clipPath id={clip}>
            <circle cx="60" cy="60" r="60" />
          </clipPath>
        </defs>
        <circle className={styles.bg} cx="60" cy="60" r="60" />
        <g clipPath={`url(#${clip})`}>{teacher === 'mia' ? <Mia /> : teacher === 'dev' ? <Dev /> : <Elena />}</g>
      </svg>
    </span>
  );
}

/** Head, ears and neck shared by all three (the hair and clothes make the person). */
function Head({ jaw = 0 }: { jaw?: number }) {
  return (
    <>
      <path className={styles.skinShade} d="M50 68 h20 v22 q-10 6 -20 0 Z" />
      <ellipse className={styles.skin} cx="39.5" cy="57" rx="4.5" ry="6" />
      <ellipse className={styles.skin} cx="80.5" cy="57" rx="4.5" ry="6" />
      <path className={styles.skin} d={`M39 52 C39 36 48 29 60 29 C72 29 81 36 81 52 C81 66 ${74 + jaw} 79 60 80 C${46 - jaw} 79 39 66 39 52 Z`} />
    </>
  );
}

function Eyes({ y = 56, lift = 0 }: { y?: number; lift?: number }) {
  return (
    <>
      <circle className={styles.ink} cx="51.5" cy={y} r="2.4" />
      <circle className={styles.ink} cx="68.5" cy={y} r="2.4" />
      <path className={styles.brow} d={`M47 ${y - 6 - lift} q4.5 -3 9 -0.5`} />
      <path className={styles.brow} d={`M64 ${y - 6.5} q4.5 -2.5 9 0.5`} />
    </>
  );
}

function Mia() {
  return (
    <>
      {/* Hair behind: shoulder length, auburn. */}
      <path className={styles.hair} d="M34 54 C32 30 46 20 60 20 C76 20 89 30 87 56 C86 70 90 80 86 92 L34 92 C30 80 35 68 34 54 Z" />
      {/* Cardigan over a light top. */}
      <path className={styles.cloth} d="M10 122 C12 100 30 88 60 88 C90 88 108 100 110 122 Z" />
      <path className={styles.under} d="M48 88 L60 108 L72 88 Z" />
      <path className={styles.clothShade} d="M48 88 L60 108 L54 122 L44 122 Z M72 88 L60 108 L66 122 L76 122 Z" />
      <Head />
      {/* Fringe swept to one side, and a loose bun. */}
      <circle className={styles.hair} cx="66" cy="22" r="9" />
      <path className={styles.hair} d="M38 54 C36 34 48 26 62 26 C74 26 83 34 82 50 C76 42 66 37 54 40 C47 42 42 47 38 54 Z" />
      <Eyes />
      <circle className={styles.blush} cx="46" cy="65" r="4" />
      <circle className={styles.blush} cx="74" cy="65" r="4" />
      <path className={styles.ink} d="M52 68 Q60 76 68 68 Q60 72 52 68 Z" />
      <path className={styles.nose} d="M60 58 q-2.5 5 1 6" />
      {/* A guitar-pick earring. */}
      <path className={styles.gem} d="M37 64 h6 l-3 6 Z" />
    </>
  );
}

function Dev() {
  return (
    <>
      {/* Shirt, open collar, and a guitar strap across the chest. */}
      <path className={styles.cloth} d="M8 122 C10 100 30 87 60 87 C90 87 110 100 112 122 Z" />
      <path className={styles.under} d="M50 87 L60 101 L70 87 Z" />
      <path className={styles.clothShade} d="M50 87 L60 101 L52 106 L44 92 Z M70 87 L60 101 L68 106 L76 92 Z" />
      <path className={styles.strap} d="M22 98 L30 92 L98 122 L84 122 Z" />
      <Head jaw={2} />
      {/* Short hair with a flat top. */}
      <path className={styles.hair} d="M38 50 C37 34 44 25 60 25 C76 25 83 34 82 50 C79 44 77 39 74 37 C66 35 54 35 46 37 C43 40 40 44 38 50 Z" />
      {/* Trimmed beard along the jaw. */}
      <path className={styles.hair} d="M40 58 C42 72 50 82 60 82 C70 82 78 72 80 58 C78 64 76 70 72 72 C66 70 54 70 48 72 C44 70 42 64 40 58 Z" />
      <Eyes y={55} />
      <path className={styles.lip} d="M52 70 Q60 77 68 70 Q60 73 52 70 Z" />
      <path className={styles.nose} d="M60 57 q-2.5 5 1 6.5" />
    </>
  );
}

function Elena() {
  return (
    <>
      {/* Blazer with lapels over a light blouse, and a small brooch. */}
      <path className={styles.cloth} d="M10 122 C12 100 30 88 60 88 C90 88 108 100 110 122 Z" />
      <path className={styles.under} d="M50 88 L60 100 L70 88 Z" />
      <path className={styles.clothShade} d="M50 88 L60 100 L56 122 L40 122 L42 96 Z M70 88 L60 100 L64 122 L80 122 L78 96 Z" />
      <circle className={styles.gem} cx="77" cy="104" r="2.6" />
      {/* A bun at the back. */}
      <circle className={styles.hair} cx="80" cy="34" r="10" />
      <Head jaw={-1} />
      {/* Silver hair, swept back with a side parting. */}
      <path className={styles.hair} d="M38 52 C36 34 46 25 60 25 C75 25 84 35 82 52 C80 44 76 38 70 36 C62 34 56 36 52 33 C46 37 41 44 38 52 Z" />
      <Eyes lift={1} />
      {/* Round glasses. */}
      <circle className={styles.glasses} cx="51.5" cy="56" r="6.2" />
      <circle className={styles.glasses} cx="68.5" cy="56" r="6.2" />
      <path className={styles.glasses} d="M57.7 56 q2.3 -2 4.6 0" />
      <path className={styles.ink} d="M53 70 Q61 74 68 68 Q61 71.5 53 70 Z" />
      <path className={styles.nose} d="M60 59 q-2.5 5 1 6" />
    </>
  );
}

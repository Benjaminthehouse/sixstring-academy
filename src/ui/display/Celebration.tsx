import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
import { useLatest } from '../hooks/useLatest';
import { cx } from '../util/cx';
import { BURST_COUNTS, createBurst, launchPowerFor, particleAlpha, stepParticles, type Particle } from './confetti';
import styles from './Celebration.module.css';

/** Tokens the confetti is drawn in: the scale-degree colours plus the accent. */
const PALETTE_TOKENS = ['--accent', '--deg-1', '--deg-2', '--deg-3', '--deg-4', '--deg-5', '--deg-6', '--deg-7'];

/** Props for `<Celebration>`. */
export interface CelebrationProps {
  /**
   * Launches a burst whenever this changes to a truthy value (and on mount if already truthy).
   * Pass a counter (`wins`) to celebrate repeatedly, or a boolean (`passed`).
   */
  fire: unknown;
  /** How much confetti: low 36, medium 80 (default), high 150 pieces. */
  intensity?: keyof typeof BURST_COUNTS;
  /** Launch point as fractions of the area. Default bottom centre `{ x: 0.5, y: 0.9 }`. */
  origin?: { x: number; y: number };
  /** Fill the nearest positioned ancestor instead of the whole viewport. */
  contained?: boolean;
  /** Called when the last piece has gone (or at once under reduced motion). */
  onDone?: () => void;
  className?: string;
}

/**
 * A confetti burst on a canvas, for real milestones (lesson passed, level up, three stars), not for
 * every correct answer. Purely decorative: pair it with visible text. With reduced motion nothing
 * moves and `onDone` fires straight away.
 *   <Celebration fire={passed} />
 */
export function Celebration({ fire, intensity = 'medium', origin, contained, onDone, className }: CelebrationProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particles = useRef<Particle[]>([]);
  const raf = useRef(0);
  const reduced = usePrefersReducedMotion();
  const onDoneRef = useLatest(onDone);
  const originX = origin?.x ?? 0.5;
  const originY = origin?.y ?? 0.9;

  useEffect(() => {
    if (!fire) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (reduced || !canvas || !ctx) {
      onDoneRef.current?.();
      return;
    }
    // Canvas needs literal colours, so resolve the tokens for the current theme at launch time.
    const css = getComputedStyle(canvas);
    const palette = PALETTE_TOKENS.map((t) => css.getPropertyValue(t).trim()).filter(Boolean);
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    // Launch speed follows the room above the origin, so the burst fills a small card and a whole screen alike.
    const power = launchPowerFor(Math.min(900, rect.height * originY * 0.85));
    particles.current.push(...createBurst({ count: BURST_COUNTS[intensity], x: rect.width * originX, y: rect.height * originY, colors: palette.length, power }));

    // One loop serves overlapping bursts: a new burst while one is running just adds particles.
    if (raf.current) return;
    let last = -1;
    const frame = (time: number) => {
      const dt = last < 0 ? 0 : Math.min(0.05, (time - last) / 1000);
      last = time;
      particles.current = stepParticles(particles.current, dt, rect.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      for (const p of particles.current) {
        ctx.save();
        ctx.globalAlpha = particleAlpha(p);
        ctx.fillStyle = palette[p.color % palette.length] ?? '';
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        // Squash along one axis to fake the paper tumbling in 3D.
        ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.cos(p.wobble)));
        const s = p.size;
        ctx.beginPath();
        if (p.shape === 1) ctx.arc(0, 0, s / 2, 0, Math.PI * 2);
        else if (p.shape === 2) {
          ctx.moveTo(0, s * 0.6);
          ctx.quadraticCurveTo(-s * 0.7, -s * 0.1, -s * 0.45, -s * 0.5);
          ctx.quadraticCurveTo(0, -s * 0.75, s * 0.45, -s * 0.5);
          ctx.quadraticCurveTo(s * 0.7, -s * 0.1, 0, s * 0.6);
        } else ctx.rect(-s / 2, -s / 3, s, s / 1.5);
        ctx.fill();
        ctx.restore();
      }
      if (particles.current.length > 0) {
        raf.current = requestAnimationFrame(frame);
      } else {
        raf.current = 0;
        ctx.clearRect(0, 0, rect.width, rect.height);
        onDoneRef.current?.();
      }
    };
    raf.current = requestAnimationFrame(frame);
  }, [fire, intensity, originX, originY, reduced, onDoneRef]);

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      particles.current = [];
    },
    [],
  );

  return <canvas ref={canvasRef} className={cx(styles.canvas, contained && styles.contained, className)} aria-hidden="true" />;
}

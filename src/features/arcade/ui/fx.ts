/**
 * The arcade's little bits of juice: a burst of sparks where a note was hit, a score that floats
 * up, a shake on a miss. They are drawn straight into a layer element (no React state per frame),
 * last under half a second, never block input, and stay still under reduced motion.
 */
import { useCallback, useRef } from 'react';
import { usePrefersReducedMotion } from '@/ui';
import styles from './Fx.module.css';

/** Colour family of an effect. */
export type FxTone = 'ok' | 'accent' | 'bad' | 'streak';

/** Where an effect starts: a point inside the layer, or an element on the page. */
export type FxAt = { x: number; y: number } | Element | null | undefined;

/** The effects API. */
export interface Fx {
  /** Attach to the positioned element the effects are drawn in. */
  layerRef: (el: HTMLDivElement | null) => void;
  burst: (at: FxAt, tone?: FxTone, size?: 'sm' | 'lg') => void;
  pop: (at: FxAt, text: string, tone?: FxTone) => void;
  shake: (el: Element | null | undefined) => void;
}

/** The centre of `at` relative to the layer. */
function pointIn(layer: HTMLElement, at: FxAt): { x: number; y: number } | null {
  if (!at) return null;
  if ('x' in at && 'y' in at && typeof (at as { x: unknown }).x === 'number') return at as { x: number; y: number };
  const el = at as Element;
  if (typeof el.getBoundingClientRect !== 'function') return null;
  const a = el.getBoundingClientRect();
  const b = layer.getBoundingClientRect();
  return { x: a.left + a.width / 2 - b.left, y: a.top + a.height / 2 - b.top };
}

/** Effects for one screen. */
export function useFx(): Fx {
  const layer = useRef<HTMLDivElement | null>(null);
  const reduced = usePrefersReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const layerRef = useCallback((el: HTMLDivElement | null) => {
    layer.current = el;
  }, []);

  const add = useCallback((node: HTMLElement, ms: number) => {
    layer.current?.appendChild(node);
    window.setTimeout(() => node.remove(), ms);
  }, []);

  const burst = useCallback(
    (at: FxAt, tone: FxTone = 'ok', size: 'sm' | 'lg' = 'sm') => {
      const host = layer.current;
      if (!host) return;
      const p = pointIn(host, at);
      if (!p) return;
      const ring = document.createElement('span');
      ring.className = `${styles.ring} ${styles[tone]}`;
      ring.style.left = `${p.x}px`;
      ring.style.top = `${p.y}px`;
      add(ring, 600);
      if (reducedRef.current) return;
      const count = size === 'lg' ? 16 : 10;
      const reach = size === 'lg' ? 64 : 42;
      for (let i = 0; i < count; i++) {
        const spark = document.createElement('span');
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
        const dist = reach * (0.6 + Math.random() * 0.5);
        spark.className = `${styles.spark} ${styles[tone]} ${i % 3 === 0 ? styles.alt : ''}`;
        spark.style.left = `${p.x}px`;
        spark.style.top = `${p.y}px`;
        spark.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
        spark.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
        add(spark, 700);
      }
    },
    [add],
  );

  const pop = useCallback(
    (at: FxAt, text: string, tone: FxTone = 'ok') => {
      const host = layer.current;
      if (!host) return;
      const p = pointIn(host, at);
      if (!p) return;
      const el = document.createElement('span');
      el.className = `${styles.pop} ${styles[`${tone}Text`]} ${reducedRef.current ? styles.still : ''}`;
      el.textContent = text;
      el.setAttribute('aria-hidden', 'true');
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      add(el, 900);
    },
    [add],
  );

  const shake = useCallback((el: Element | null | undefined) => {
    if (!el || reducedRef.current) return;
    el.classList.remove(styles.shake);
    // Restart the animation on a repeat miss.
    void (el as HTMLElement).offsetWidth;
    el.classList.add(styles.shake);
    window.setTimeout(() => el.classList.remove(styles.shake), 400);
  }, []);

  return { layerRef, burst, pop, shake };
}

/** The class of the effects layer (absolutely positioned over its parent, ignores pointer events). */
export const fxLayerClass = styles.layer;

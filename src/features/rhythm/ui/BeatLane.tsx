import { useCallback, useEffect, useRef } from 'react';
import { cx, useElementSize, useLatest, useRafLoop } from '@/ui';
import type { Chart } from '../core/charts';
import { countAt } from '../core/counting';
import { meterInfo, secondsPerTick } from '../core/meter';
import type { Judgement, Verdict } from '../core/scoring';
import type { RhythmSession } from '../engine/session';
import styles from './Rhythm.module.css';

/** Props of {@link BeatLane}. */
export interface BeatLaneProps {
  chart: Chart;
  /** The running session; null draws a still preview of the start of the chart. */
  session: RhythmSession | null;
  marks: ReadonlyMap<number, Judgement>;
  judgements: readonly Judgement[];
  /** Write the counting syllable under each expected note. */
  counts?: boolean;
  /** No scrolling: show one bar at a time and step a highlight from beat to beat. */
  reduced?: boolean;
  className?: string;
}

interface Palette {
  fg: string;
  muted: string;
  faint: string;
  line: string;
  surface: string;
  sunken: string;
  accent: string;
  ok: string;
  info: string;
  warn: string;
  bad: string;
  mono: string;
}

const TOKENS: Record<Exclude<keyof Palette, 'mono'>, string> = {
  fg: '--fg',
  muted: '--fg-muted',
  faint: '--fg-faint',
  line: '--line-strong',
  surface: '--surface',
  sunken: '--surface-2',
  accent: '--accent',
  ok: '--ok',
  info: '--info',
  warn: '--warn',
  bad: '--bad',
};

function readPalette(el: Element): Palette {
  const cs = getComputedStyle(el);
  const out = { mono: cs.getPropertyValue('--font-mono').trim() || 'monospace' } as Palette;
  for (const key of Object.keys(TOKENS) as Array<keyof typeof TOKENS>) out[key] = cs.getPropertyValue(TOKENS[key]).trim() || 'gray';
  return out;
}

const verdictColour = (p: Palette, v: Verdict): string => (v === 'perfect' ? p.ok : v === 'good' ? p.info : v === 'ok' ? p.warn : p.bad);

/**
 * The moving picture of the beat. Time runs right to left past a fixed line: clicks are ticks on
 * the floor, expected notes are rings, and every tap leaves a mark exactly where it fell. A tap on
 * the beat sits inside its ring; an early one is left of it, a late one right of it. Drawn on a
 * canvas from the audio clock, never through React state.
 */
export function BeatLane({ chart, session, marks, judgements, counts = false, reduced = false, className }: BeatLaneProps) {
  const [box, size] = useElementSize<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const palette = useRef<Palette | null>(null);
  const state = useLatest({ chart, session, marks, judgements, counts, reduced });

  const draw = useCallback(() => {
    const el = canvas.current;
    if (!el || size.width < 10 || size.height < 10) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const W = size.width;
    const H = size.height;
    if (el.width !== Math.round(W * dpr) || el.height !== Math.round(H * dpr)) {
      el.width = Math.round(W * dpr);
      el.height = Math.round(H * dpr);
    }
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const p = (palette.current ??= readPalette(el));
    const s = state.current;
    const meter = meterInfo(s.chart.meter);
    const spt = s.session ? s.session.secondsPerTick : secondsPerTick(s.chart.bpm, meter);
    const beatSec = spt * meter.tempoBeatTicks;
    const live = s.session && s.session.state !== 'idle' ? s.session : null;
    const timeOf = (tick: number) => (live ? live.timeOfTick(tick) : tick * spt);
    const targetTime = (id: number, tick: number) => (live ? live.targetTime(id) : tick * spt);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const cy = Math.round(H * 0.44);

    // Size of the rings: as large as the closest pair of notes allows.
    let minGap = Infinity;
    for (let i = 1; i < s.chart.targets.length; i++) minGap = Math.min(minGap, s.chart.targets[i].tick - s.chart.targets[i - 1].tick);
    if (!Number.isFinite(minGap)) minGap = meter.tempoBeatTicks;

    let X: (t: number) => number;
    let from: number;
    let to: number;
    let nowX: number | null = null;
    const now = live ? live.now() : -beatSec * 0.6;
    if (s.reduced) {
      // One bar, standing still.
      const tick = live ? Math.max(0, live.tickNow()) : 0;
      const bar = Math.floor(tick / meter.barTicks);
      const barStart = timeOf(bar * meter.barTicks);
      const barSec = meter.barTicks * spt;
      const pad = 28;
      X = (t) => pad + ((t - barStart) / barSec) * (W - pad * 2);
      from = barStart - 0.001;
      to = barStart + barSec - 0.001;
      // Step a highlight to the beat that is sounding.
      const within = tick - bar * meter.barTicks;
      let beat = 0;
      meter.beatStarts.forEach((start, i) => {
        if (within >= start) beat = i;
      });
      const x0 = X(barStart + meter.beatStarts[beat] * spt) - 16;
      const x1 = X(barStart + (meter.beatStarts[beat] + meter.beatTicks[beat]) * spt) - 16;
      ctx.fillStyle = p.sunken;
      ctx.beginPath();
      // roundRect is missing in older Safari: a plain rectangle is a fine stand-in.
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x0, 8, Math.max(8, x1 - x0 - 4), H - 16, 10);
      else ctx.rect(x0, 8, Math.max(8, x1 - x0 - 4), H - 16);
      ctx.fill();
    } else {
      const span = Math.max(2.2, Math.min(4.6, beatSec * 4.25));
      nowX = Math.round(W * 0.24);
      const pps = (W - nowX - 14) / span;
      X = (t) => nowX! + (t - now) * pps;
      from = now - (nowX + 20) / pps;
      to = now + span + 0.4;
    }
    const pps = Math.abs(X(1) - X(0));
    const r = Math.max(4.5, Math.min(15, minGap * spt * pps * 0.36));

    // Stretches without a click are shaded, so "the click is off" is visible as well as audible.
    ctx.font = `600 11px ${p.mono}`;
    ctx.textBaseline = 'alphabetic';
    for (const seg of s.chart.segments) {
      const a = timeOf(seg.startTick);
      const b = timeOf(seg.endTick);
      if (b < from || a > to) continue;
      if (seg.silent) {
        const x0 = Math.max(0, X(a));
        const x1 = Math.min(W, X(b));
        ctx.fillStyle = p.sunken;
        ctx.fillRect(x0, 6, x1 - x0, H - 12);
        ctx.fillStyle = p.muted;
        ctx.textAlign = 'left';
        if (x1 - x0 > 70) ctx.fillText('click off', x0 + 8, 21);
      }
    }

    // The floor.
    ctx.strokeStyle = p.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cy + 0.5);
    ctx.lineTo(W, cy + 0.5);
    ctx.stroke();

    // Clicks, and the count-in numbers above them.
    ctx.textAlign = 'center';
    const floor = cy + r + 9;
    for (const sound of s.chart.sounds) {
      if (sound.type !== 'click') continue;
      const t = timeOf(sound.tick);
      if (t < from || t > to) continue;
      const x = X(t);
      const h = sound.level === 'accent' ? 13 : sound.level === 'medium' ? 10 : sound.level === 'beat' ? 8 : 4;
      ctx.fillStyle = sound.level === 'accent' ? p.fg : p.faint;
      ctx.fillRect(Math.round(x) - 1, floor, 2, h);
      if (sound.level !== 'sub') {
        const seg = s.chart.segments.find((g) => sound.tick >= g.startTick && sound.tick < g.endTick);
        if (seg?.kind === 'count') {
          ctx.font = `700 15px ${p.mono}`;
          ctx.fillStyle = p.muted;
          ctx.fillText(countAt((sound.tick - seg.startTick) % meter.barTicks, meter).text, x, cy - r - 12);
        }
      }
    }

    // Expected notes.
    ctx.font = `600 11px ${p.mono}`;
    for (const target of s.chart.targets) {
      const t = targetTime(target.id, target.tick);
      if (t < from || t > to) continue;
      const mark = s.marks.get(target.id);
      // Inside a silent stretch the rings stay hidden until they are behind the line: no reading ahead.
      if (target.silent && !mark && (nowX === null || t > now - 0.05)) continue;
      const x = X(t);
      ctx.beginPath();
      ctx.arc(x, cy, r, 0, Math.PI * 2);
      if (mark && mark.verdict !== 'miss') {
        ctx.fillStyle = verdictColour(p, mark.verdict);
        ctx.fill();
      } else {
        ctx.fillStyle = p.surface;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = mark ? p.bad : p.muted;
        ctx.stroke();
        if (mark) {
          const k = r * 0.42;
          ctx.beginPath();
          ctx.moveTo(x - k, cy - k);
          ctx.lineTo(x + k, cy + k);
          ctx.moveTo(x + k, cy - k);
          ctx.lineTo(x - k, cy + k);
          ctx.stroke();
        }
      }
      if (s.counts && target.label && pps * minGap * spt > 15) {
        ctx.fillStyle = p.muted;
        ctx.fillText(target.label, x, floor + 28);
      }
    }

    // Where the taps fell.
    for (const j of s.judgements) {
      if (j.verdict === 'miss' || j.time < from || j.time > to) continue;
      const x = Math.round(X(j.time));
      ctx.fillStyle = j.verdict === 'extra' ? p.bad : p.fg;
      const half = j.verdict === 'extra' ? r + 3 : r + 8;
      ctx.fillRect(x - 1.5, cy - half, 3, half * 2);
    }

    // The line everything is measured against.
    if (nowX !== null) {
      ctx.fillStyle = p.accent;
      ctx.fillRect(nowX - 1, 4, 2, H - 8);
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(nowX, cy, r + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [size.width, size.height, state]);

  const running = !!session && session.state === 'running';
  useRafLoop(draw, running);

  // Still frames: before the round, after it, and whenever the size or the data changes.
  useEffect(() => {
    if (!running) draw();
  }, [draw, running, chart, marks, judgements, counts, reduced]);

  // Colours come from the theme tokens; read them again when the theme changes.
  useEffect(() => {
    const refresh = () => {
      palette.current = null;
      draw();
    };
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent', 'class'] });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', refresh);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', refresh);
    };
  }, [draw]);

  return (
    <div ref={box} className={cx(styles.lane, className)}>
      <canvas ref={canvas} className={styles.laneCanvas} aria-hidden="true" />
    </div>
  );
}

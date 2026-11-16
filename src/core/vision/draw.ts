/**
 * The camera overlay, drawn on a 2D canvas laid over the `<video>`: board outline, fret wires and
 * fret numbers, string names, note markers in the degree colours with their labels, a pulse on the
 * note to play next, and a confidence indicator. Call `drawVisionOverlay` from `onRender` of the
 * pipeline (once per video frame); it clears and redraws everything.
 *
 * Geometry is in CSS pixels of the canvas box; the device-pixel ratio is applied here (size the
 * canvas with `fitOverlayCanvas`). A mirrored (selfie) display mirrors positions, never the text.
 * Colours come from the design tokens (`readOverlayPalette(canvas)`), every colour with a label.
 */
import { boardEdgeY, cameraCentre, fretX, inlayPositions, projectPlanePoint, stringSpacingAt, stringY } from './geometry';
import { placeMarkers, poseForDisplay, type DisplayView, type MarkerPlacement } from './overlay';
import type { TrackerState } from './tracker';
import type { FretPosition, FretboardPose } from './types';

/** A note to show on the neck. */
export interface OverlayNote extends FretPosition {
  /** Short text in the dot: a degree ('R', 'b3', '5'), a note name ('C#') or a finger number. */
  label?: string;
  /** Scale degree 1..7 for the dot colour (`--deg-N`); omit (or 0) for the neutral colour. */
  degree?: number;
  /** The note to play next: drawn with a pulse. */
  target?: boolean;
  /** Draw as an outline only (a passing note, a hint). */
  ghost?: boolean;
}

/** Colours and fonts of the overlay (read from the design tokens). */
export interface OverlayPalette {
  /** Dot fill per degree: index 0 = neutral (`--deg-x`), 1..7 = `--deg-1`..`--deg-7`. */
  degree: string[];
  /** Label colour on each dot fill (`--deg-N-fg`). */
  degreeText: string[];
  /** Board outline and target pulse (`--accent`). */
  accent: string;
  /** Pills behind text (`--surface`) and their text (`--fg`). */
  surface: string;
  text: string;
  /** Ring around dots, separating them from the video (`--bg`). */
  ring: string;
  /** Confidence indicator states (`--ok`, `--warn`, `--bad`). */
  ok: string;
  warn: string;
  bad: string;
  /** Font families (`--font-mono`, `--font-body`). */
  mono: string;
  body: string;
}

/** A palette from named colours, for tests and pages without the design tokens. */
export const PLAIN_PALETTE: OverlayPalette = {
  degree: ['gray', 'crimson', 'darkorange', 'gold', 'seagreen', 'dodgerblue', 'slateblue', 'orchid'],
  degreeText: ['black', 'white', 'black', 'black', 'black', 'black', 'black', 'black'],
  accent: 'orange',
  surface: 'black',
  text: 'white',
  ring: 'black',
  ok: 'seagreen',
  warn: 'orange',
  bad: 'crimson',
  mono: 'monospace',
  body: 'sans-serif',
};

/** The overlay palette from the CSS custom properties in effect at `element` (call again when the theme changes). */
export function readOverlayPalette(element: Element): OverlayPalette {
  const css = getComputedStyle(element);
  const read = (name: string, fallback: string): string => css.getPropertyValue(name).trim() || fallback;
  const degree: string[] = [read('--deg-x', PLAIN_PALETTE.degree[0])];
  const degreeText: string[] = [read('--deg-x-fg', PLAIN_PALETTE.degreeText[0])];
  for (let d = 1; d <= 7; d++) {
    degree.push(read(`--deg-${d}`, PLAIN_PALETTE.degree[d]));
    degreeText.push(read(`--deg-${d}-fg`, PLAIN_PALETTE.degreeText[d]));
  }
  return {
    degree,
    degreeText,
    accent: read('--accent', PLAIN_PALETTE.accent),
    surface: read('--surface', PLAIN_PALETTE.surface),
    text: read('--fg', PLAIN_PALETTE.text),
    ring: read('--bg', PLAIN_PALETTE.ring),
    ok: read('--ok', PLAIN_PALETTE.ok),
    warn: read('--warn', PLAIN_PALETTE.warn),
    bad: read('--bad', PLAIN_PALETTE.bad),
    mono: read('--font-mono', PLAIN_PALETTE.mono),
    body: read('--font-body', PLAIN_PALETTE.body),
  };
}

/**
 * Give the canvas a backing store for its CSS size at the device-pixel ratio (only when it changed,
 * so calling it every frame is cheap). Returns the ratio to pass to `drawVisionOverlay`.
 */
export function fitOverlayCanvas(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number, dpr: number = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1): number {
  const ratio = Math.max(1, Math.min(3, dpr || 1));
  const w = Math.max(1, Math.round(cssWidth * ratio));
  const h = Math.max(1, Math.round(cssHeight * ratio));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  return ratio;
}

/** What to draw. Only `view` and `pose` are needed; everything else has a sensible default. */
export interface OverlayOptions {
  /** The canvas box in CSS pixels and how the video is shown in it (mirrored, object-fit). */
  view: DisplayView;
  /** The pose to draw (pixels of the tracker's frame), e.g. `render.pose` from the pipeline. Null: nothing but the indicator. */
  pose: FretboardPose | null;
  /** Notes to mark. */
  notes?: readonly OverlayNote[];
  /** Tracker state and smoothed confidence, for the styling and the indicator. */
  state?: TrackerState;
  confidence?: number;
  /** The fret numbers are a guess: fret numbers get a question mark. */
  numberingGuess?: boolean;
  /** Animation clock in ms (the pulse), e.g. `render.timeMs`. */
  timeMs?: number;
  /** Colours and fonts (default `PLAIN_PALETTE`; use `readOverlayPalette`). */
  palette?: OverlayPalette;
  /** Device-pixel ratio of the canvas backing store (the value `fitOverlayCanvas` returned). Default 1. */
  dpr?: number;
  /** Open-string names, low to high (default standard tuning E A D G B E). */
  stringNames?: readonly string[];
  /** No pulse animation (respect `prefers-reduced-motion`). */
  reducedMotion?: boolean;
  /** What to show (all default true except `allFretNumbers`). */
  outline?: boolean;
  wires?: boolean;
  fretNumbers?: boolean;
  /** Number every visible fret instead of the inlay frets only. */
  allFretNumbers?: boolean;
  stringLabels?: boolean;
  indicator?: boolean;
  /** Clear the canvas first (default true). */
  clear?: boolean;
}

/** What `drawVisionOverlay` drew (CSS pixels of the canvas box), e.g. for hit-testing taps on notes. */
export interface OverlayResult {
  markers: (MarkerPlacement & { note: OverlayNote })[];
  /** The display pose used (null when nothing was drawn). */
  pose: FretboardPose | null;
}

const STANDARD_NAMES = ['E', 'A', 'D', 'G', 'B', 'E'];

function stateAlpha(state: TrackerState | undefined, confidence: number): number {
  if (state === 'lost') return 0.2 + 0.6 * Math.min(1, Math.max(0, confidence));
  if (state === 'candidate') return 0.8;
  return 1;
}

function finite(...v: number[]): boolean {
  return v.every(Number.isFinite);
}

/** Draw the overlay. The context's transform is reset; nothing else of its state is kept. */
export function drawVisionOverlay(ctx: CanvasRenderingContext2D, options: OverlayOptions): OverlayResult {
  const dpr = options.dpr ?? 1;
  const palette = options.palette ?? PLAIN_PALETTE;
  const view = options.view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (options.clear !== false) ctx.clearRect(0, 0, view.width, view.height);
  const state = options.state;
  const confidence = options.confidence ?? options.pose?.confidence ?? 0;
  const result: OverlayResult = { markers: [], pose: null };
  const source = options.pose;
  if (source && state !== 'searching') {
    const pose = poseForDisplay(source, view);
    result.pose = pose;
    ctx.save();
    ctx.globalAlpha = stateAlpha(state, confidence);
    drawBoard(ctx, pose, options, palette);
    // Notes sit on the strings as the camera sees them (raised above the wood), from the camera
    // position recovered on the tracked frame (it does not change with the display transform).
    result.markers = drawNotes(ctx, pose, options, palette, cameraCentre(source));
    ctx.restore();
  }
  if (options.indicator !== false) drawIndicator(ctx, view.width, state, confidence, palette);
  return result;
}

/** The fret range worth drawing: the visible wires plus one either side. */
function drawRange(pose: FretboardPose): { lo: number; hi: number } | null {
  const v = pose.visibleFrets;
  if (v.max < v.min) return null;
  return { lo: Math.max(0, v.min - 1), hi: Math.min(pose.model.fretCount, v.max + 1) };
}

function drawBoard(ctx: CanvasRenderingContext2D, pose: FretboardPose, o: OverlayOptions, palette: OverlayPalette): void {
  const range = drawRange(pose);
  if (!range) return;
  const m = pose.model;
  const guess = o.numberingGuess ?? false;
  if (o.outline !== false) {
    const x0 = fretX(m, range.lo);
    const x1 = fretX(m, range.hi);
    const pts = [
      projectPlanePoint(pose, x0, boardEdgeY(m, x0, 'bass')),
      projectPlanePoint(pose, x1, boardEdgeY(m, x1, 'bass')),
      projectPlanePoint(pose, x1, boardEdgeY(m, x1, 'treble')),
      projectPlanePoint(pose, x0, boardEdgeY(m, x0, 'treble')),
    ];
    if (pts.every((p) => finite(p.x, p.y))) {
      ctx.save();
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      if (o.state === 'candidate') ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }
  if (o.wires !== false) {
    ctx.save();
    ctx.strokeStyle = palette.accent;
    ctx.globalAlpha *= 0.45;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let f = range.lo; f <= range.hi; f++) {
      const x = fretX(m, f);
      const a = projectPlanePoint(pose, x, boardEdgeY(m, x, 'bass'));
      const b = projectPlanePoint(pose, x, boardEdgeY(m, x, 'treble'));
      if (!finite(a.x, a.y, b.x, b.y)) continue;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.restore();
  }
  if (o.fretNumbers !== false) {
    const frets: number[] = [];
    if (o.allFretNumbers) for (let f = Math.max(1, range.lo + 1); f <= range.hi; f++) frets.push(f);
    else for (const inlay of inlayPositions(m)) if (inlay.fret > range.lo && inlay.fret <= range.hi && !frets.includes(inlay.fret)) frets.push(inlay.fret);
    for (const f of frets) {
      const x = 0.5 * (fretX(m, f - 1) + fretX(m, f));
      // Just outside the treble edge (below the neck in the usual view).
      const p = projectPlanePoint(pose, x, boardEdgeY(m, x, 'treble') + 1.1 * stringSpacingAt(m, x));
      const a = projectPlanePoint(pose, fretX(m, f - 1), m.nutWidth / 2);
      const b = projectPlanePoint(pose, fretX(m, f), m.nutWidth / 2);
      if (!finite(p.x, p.y, a.x, b.x)) continue;
      const cell = Math.hypot(b.x - a.x, b.y - a.y);
      const size = Math.max(10, Math.min(16, cell * 0.45));
      pill(ctx, `${f}${guess ? '?' : ''}`, p.x, p.y, size, palette, palette.mono);
    }
  }
  if (o.stringLabels !== false) {
    const names = o.stringNames ?? STANDARD_NAMES;
    // Behind the nut when it is in view, else just before the first visible wire.
    const atNut = pose.visibleFrets.min === 0;
    const x = atNut ? -9 : fretX(m, range.lo + 1) - 0.2 * (fretX(m, range.lo + 1) - fretX(m, range.lo));
    const gap = (() => {
      const a = projectPlanePoint(pose, Math.max(0, x), stringY(m, 1, Math.max(0, x)));
      const b = projectPlanePoint(pose, Math.max(0, x), stringY(m, 2, Math.max(0, x)));
      return Math.hypot(a.x - b.x, a.y - b.y);
    })();
    const size = Math.max(9, Math.min(14, gap * 0.9));
    for (let s = 1; s <= m.stringCount; s++) {
      const name = names[m.stringCount - s] ?? '';
      if (!name) continue;
      const p = projectPlanePoint(pose, x, stringY(m, s, Math.max(0, x)));
      if (!finite(p.x, p.y)) continue;
      pill(ctx, name, p.x, p.y, size, palette, palette.mono, 0.65);
    }
  }
}

function drawNotes(ctx: CanvasRenderingContext2D, pose: FretboardPose, o: OverlayOptions, palette: OverlayPalette, camera: [number, number, number] | null): OverlayResult['markers'] {
  const notes = o.notes ?? [];
  if (notes.length === 0) return [];
  const placed = placeMarkers(pose, notes, camera);
  const out: OverlayResult['markers'] = [];
  const t = o.timeMs ?? 0;
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i];
    const note = notes[i];
    if (!p.visible || !(p.radius > 0)) continue;
    const r = Math.max(6, p.radius);
    out.push({ ...p, radius: r, note });
    const d = note.degree && note.degree >= 1 && note.degree <= 7 ? Math.round(note.degree) : 0;
    const fill = palette.degree[d] ?? palette.degree[0];
    const ink = palette.degreeText[d] ?? palette.degreeText[0];
    if (note.target) {
      ctx.save();
      ctx.strokeStyle = palette.accent;
      if (o.reducedMotion) {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 1.55, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // One pulse a second: a ring grows from the dot and fades.
        const phase = ((t % 1000) + 1000) % 1000 / 1000;
        ctx.globalAlpha *= 1 - phase;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * (1.15 + 1.1 * phase), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    const open = note.fret <= 0;
    if (note.ghost || open) {
      ctx.lineWidth = Math.max(2, r * 0.28);
      ctx.strokeStyle = palette.ring;
      ctx.stroke();
      ctx.lineWidth = Math.max(1.5, r * 0.2);
      ctx.strokeStyle = fill;
      ctx.stroke();
    } else {
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.14);
      ctx.strokeStyle = palette.ring;
      ctx.stroke();
    }
    if (note.label) {
      const size = Math.max(8, Math.min(r * (note.label.length > 2 ? 0.8 : 1.05), 20));
      ctx.font = `700 ${size.toFixed(1)}px ${palette.mono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (note.ghost || open) {
        // An outlined dot shows the video through it: label on a small pill.
        pill(ctx, note.label, p.x, p.y, size, palette, palette.mono, 0.8);
      } else {
        ctx.fillStyle = ink;
        ctx.fillText(note.label, p.x, p.y + size * 0.04);
      }
    }
    ctx.restore();
  }
  return out;
}

/** Text on a rounded pill (legible over any video). */
function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, palette: OverlayPalette, family: string, alpha = 0.72): void {
  ctx.save();
  ctx.font = `600 ${size.toFixed(1)}px ${family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + size * 0.7;
  const h = size * 1.35;
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = palette.surface;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.globalAlpha /= alpha;
  ctx.fillStyle = palette.text;
  ctx.fillText(text, x, y + size * 0.04);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

/** Words for the indicator (the screen should also say it in an aria-live region). */
export const STATE_WORDS: Record<TrackerState, string> = { searching: 'Looking for the neck', candidate: 'Checking', locked: 'Locked', lost: 'Lost it' };

/** Confidence pill in the top-right corner: five bars and the state in words. */
function drawIndicator(ctx: CanvasRenderingContext2D, width: number, state: TrackerState | undefined, confidence: number, palette: OverlayPalette): void {
  const word = STATE_WORDS[state ?? 'searching'];
  const size = 12;
  ctx.save();
  ctx.font = `600 ${size}px ${palette.body}`;
  const textW = ctx.measureText(word).width;
  const bars = 5;
  const barW = 4;
  const gap = 2;
  const w = 10 + bars * (barW + gap) + 6 + textW + 10;
  const h = 24;
  const x = width - w - 8;
  const y = 8;
  ctx.globalAlpha = 0.78;
  ctx.fillStyle = palette.surface;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  const level = Math.round(Math.min(1, Math.max(0, confidence)) * bars);
  const tone = state === 'locked' ? palette.ok : state === 'candidate' ? palette.warn : palette.bad;
  for (let i = 0; i < bars; i++) {
    const bh = 5 + i * 2;
    ctx.fillStyle = i < level ? tone : palette.degree[0];
    ctx.globalAlpha = i < level ? 1 : 0.45;
    ctx.fillRect(x + 10 + i * (barW + gap), y + h - 6 - bh, barW, bh);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(word, x + 10 + bars * (barW + gap) + 6, y + h / 2 + 0.5);
  ctx.restore();
}

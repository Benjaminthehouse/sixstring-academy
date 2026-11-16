/**
 * One frame of the live overlay: the vision module's drawing (board outline, wires, fret numbers,
 * string names, the note dots) plus what this screen adds on top: the "Is this fret N?" ring, the
 * green flash of a note the microphone heard, and the experimental fingertip markers.
 * Called from the pipeline's `onRender` for every displayed video frame; no React involved.
 */
import {
  drawVisionOverlay,
  frameToDisplay,
  readOverlayPalette,
  type FretboardPose,
  type OverlayNote,
  type OverlayPalette,
  type OverlayResult,
  type TrackerState,
} from '@/core/vision';
import type { FingerReading } from '../model/hands';
import type { NoteMode } from '../model/status';

/** Colours for the screen's own marks (read from tokens like the overlay palette). */
export interface StagePalette extends OverlayPalette {
  ok: string;
  fingers: string[];
  fingerText: string[];
}

/** The overlay palette for the stage: the tokens, with dark scrims under text whatever the theme (the picture is a camera feed). */
export function readStagePalette(el: Element): StagePalette {
  const base = readOverlayPalette(el);
  const css = getComputedStyle(el);
  const read = (name: string, fallback: string): string => css.getPropertyValue(name).trim() || fallback;
  return {
    ...base,
    surface: read('--fb-wood-2', base.surface),
    text: read('--fb-label', base.text),
    ring: read('--fb-dot-edge', base.ring),
    fingers: [1, 2, 3, 4].map((n) => read(`--finger-${n}`, base.accent)),
    fingerText: [1, 2, 3, 4].map((n) => read(`--finger-${n}-fg`, base.text)),
  };
}

/** A note the microphone just heard (on the wood: fret from the nut). */
export interface Flash {
  string: number;
  fret: number;
  until: number;
}

/** Everything one frame draws from. */
export interface OverlayFrame {
  view: { width: number; height: number; mirrored: boolean; fit: 'contain' };
  pose: FretboardPose | null;
  state: TrackerState;
  confidence: number;
  numberingGuess: boolean;
  notes: readonly OverlayNote[];
  noteMode: NoteMode;
  /** "Is this fret N?": the cell's centre in the pose's frame. */
  question: { x: number; y: number } | null;
  flashes: readonly Flash[];
  fingers: readonly FingerReading[] | null;
  stringNames: readonly string[];
  timeMs: number;
  dpr: number;
  reducedMotion: boolean;
  palette: StagePalette;
}

/** Draw one frame. Returns what the vision overlay placed (for hit tests and the browser check). */
export function drawFrame(ctx: CanvasRenderingContext2D, f: OverlayFrame): OverlayResult {
  const notes: OverlayNote[] =
    f.noteMode === 'solid' ? [...f.notes] : f.noteMode === 'ghost' ? f.notes.map((n) => ({ ...n, ghost: true, target: false })) : [];
  const res = drawVisionOverlay(ctx, {
    view: f.view,
    pose: f.pose,
    notes,
    state: f.state,
    confidence: f.confidence,
    numberingGuess: f.numberingGuess,
    timeMs: f.timeMs,
    palette: f.palette,
    dpr: f.dpr,
    stringNames: f.stringNames,
    reducedMotion: f.reducedMotion,
    // The screen shows the state in words beside the picture.
    indicator: false,
    allFretNumbers: f.state === 'locked',
  });
  const pose = f.pose;
  if (!pose) return res;
  ctx.save();
  if (f.question && f.state !== 'searching') {
    const p = frameToDisplay(f.question, f.view, pose.frameWidth, pose.frameHeight);
    const phase = f.reducedMotion ? 0.5 : ((f.timeMs % 1200) + 1200) % 1200 / 1200;
    ctx.strokeStyle = f.palette.accent;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.95 - 0.5 * phase;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 16 + 10 * phase, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  const now = f.timeMs;
  for (const fl of f.flashes) {
    if (fl.until < now) continue;
    const m = res.markers.find((k) => k.string === fl.string && k.note.fret === fl.fret);
    if (!m) continue;
    const left = Math.min(1, (fl.until - now) / 700);
    ctx.globalAlpha = left;
    ctx.fillStyle = f.palette.ok;
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.radius * (1.6 - 0.4 * left), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 3;
    ctx.strokeStyle = f.palette.ok;
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.radius * (2.2 - 0.6 * left), 0, Math.PI * 2);
    ctx.stroke();
  }
  if (f.fingers) {
    for (const finger of f.fingers) {
      const p = frameToDisplay(finger.point, f.view, pose.frameWidth, pose.frameHeight);
      const r = 9;
      ctx.globalAlpha = finger.onBoard ? 1 : 0.55;
      ctx.fillStyle = f.palette.fingers[finger.finger - 1];
      ctx.strokeStyle = finger.advice === 'far' ? f.palette.warn : f.palette.ring;
      ctx.lineWidth = finger.advice === 'far' ? 3 : 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = f.palette.fingerText[finger.finger - 1];
      ctx.font = `700 11px ${f.palette.mono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(finger.finger), p.x, p.y + 0.5);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  return res;
}

/** Clear the canvas (nothing drawn: searching with the camera off, or a still picture being marked). */
export function clearOverlay(canvas: HTMLCanvasElement | null): void {
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

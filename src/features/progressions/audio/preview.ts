/**
 * A strummed walk through a progression's chords on the app's guitar voice: what a card plays when
 * tapped, and "Hear the chords" on a progression page. One preview plays at a time across the
 * screen (starting another stops the first). Strums are scheduled a little ahead on the audio
 * clock and the step being *heard* is reported through `scheduleVisual`, so the lit chord matches
 * the sound.
 */
import { audioNow, normalizeTone, scheduleVisual, strum, unlockAudio, type ToneName, type VoiceHandle } from '@/core/audio';
import { beginnerVoicing } from '@/core/guitar';
import { soundPrefs } from '@/core/settings';

/** One chord to strum. */
export interface PreviewStep {
  symbol: string;
  /** Beats it rings. */
  beats: number;
  /** Shape to strum (low to high MIDI); computed from the chord when missing. */
  midi?: readonly number[];
}

/** What a preview reports while it plays. */
export interface PreviewListener {
  /** The step now heard (index into the steps), or null when the preview ends or is stopped. */
  (step: number | null): void;
}

const LOOKAHEAD = 0.35;
const TICK_MS = 60;

/** Strum timing within one beat: a down-strum on every beat, an up-strum on the off-beat of every second one. */
function strokes(beats: number): Array<{ at: number; direction: 'down' | 'up'; velocity: number }> {
  const out: Array<{ at: number; direction: 'down' | 'up'; velocity: number }> = [];
  for (let b = 0; b < beats; b++) {
    out.push({ at: b, direction: 'down', velocity: b === 0 ? 0.85 : 0.6 });
    if (b % 2 === 1) out.push({ at: b + 0.5, direction: 'up', velocity: 0.45 });
  }
  return out;
}

/** Shape of a chord for the preview (the beginner's shape), cached. */
const shapes = new Map<string, readonly number[]>();
function shapeOf(symbol: string): readonly number[] {
  let s = shapes.get(symbol);
  if (!s) {
    s = beginnerVoicing(symbol)?.midi ?? [];
    shapes.set(symbol, s);
  }
  return s;
}

interface Running {
  owner: object;
  timer: ReturnType<typeof setInterval> | null;
  handles: VoiceHandle[];
  listener: PreviewListener;
  version: number;
}

let running: Running | null = null;
let version = 0;

/** Stop whatever preview is playing (silently if none). */
export function stopPreview(owner?: object): void {
  const r = running;
  if (!r || (owner && r.owner !== owner)) return;
  running = null;
  if (r.timer) clearInterval(r.timer);
  for (const h of r.handles) h.stop(undefined, 0.08);
  r.listener(null);
}

/** Is this owner's preview playing? */
export function previewPlaying(owner: object): boolean {
  return running?.owner === owner;
}

/**
 * Strum the steps at a tempo (beats per minute). `owner` identifies who asked (a card, the page),
 * so a second tap on the same card can stop it. Call from a tap: it unlocks audio first.
 */
export async function playPreview(owner: object, steps: readonly PreviewStep[], bpm: number, listener: PreviewListener): Promise<void> {
  stopPreview();
  if (!steps.length) return;
  const my = ++version;
  const r: Running = { owner, timer: null, handles: [], listener, version: my };
  running = r;
  await unlockAudio();
  if (running !== r) return;
  const tone: ToneName = normalizeTone(soundPrefs().guitarTone, 'steel');
  const beat = 60 / Math.max(40, Math.min(220, bpm));
  // Every stroke on one timeline, with the step it belongs to.
  const plan: Array<{ time: number; step: number; first: boolean; direction: 'down' | 'up'; velocity: number; midi: readonly number[] }> = [];
  const t0 = audioNow() + 0.12;
  let t = t0;
  steps.forEach((s, i) => {
    const midi = s.midi?.length ? s.midi : shapeOf(s.symbol);
    for (const k of strokes(Math.max(1, s.beats))) plan.push({ time: t + k.at * beat, step: i, first: k.at === 0, direction: k.direction, velocity: k.velocity, midi });
    t += Math.max(1, s.beats) * beat;
  });
  const end = t;
  let next = 0;
  const pump = () => {
    if (running !== r) return;
    const horizon = audioNow() + LOOKAHEAD;
    while (next < plan.length && plan[next].time < horizon) {
      const e = plan[next++];
      if (e.midi.length) {
        const midis = e.direction === 'up' ? e.midi.slice(-4) : e.midi;
        r.handles.push(...strum(midis, e.time, { direction: e.direction, velocity: e.velocity, tone, spread: e.direction === 'up' ? 0.012 : 0.02 }));
      }
      if (e.first) {
        const step = e.step;
        scheduleVisual(e.time, () => {
          if (running === r) r.listener(step);
        });
      }
    }
    if (r.handles.length > 64) r.handles.splice(0, r.handles.length - 64);
    if (next >= plan.length && r.timer) {
      clearInterval(r.timer);
      r.timer = null;
      scheduleVisual(end, () => {
        if (running === r) {
          running = null;
          r.listener(null);
        }
      });
    }
  };
  r.timer = setInterval(pump, TICK_MS);
  pump();
}

/** Strum one chord once, now (a tapped chart bar or chord diagram). */
export async function strumChord(symbol: string, midi?: readonly number[]): Promise<void> {
  stopPreview();
  await unlockAudio();
  const shape = midi?.length ? midi : shapeOf(symbol);
  if (!shape.length) return;
  strum(shape, undefined, { direction: 'down', velocity: 0.8, tone: normalizeTone(soundPrefs().guitarTone, 'steel') });
}

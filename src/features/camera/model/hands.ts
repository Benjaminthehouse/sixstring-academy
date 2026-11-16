/**
 * Experimental hand feedback: where the fretting fingertips are on the neck, from MediaPipe hand
 * landmarks (21 points per hand, normalised to the camera frame) and the tracked board pose.
 *
 * A fingertip is read through the pose (`locatePixel`): the fret cell it is in, the nearest
 * string, and how far it sits behind the fret wire in front of it. A note sounds cleanest pressed
 * close behind the wire, so a fingertip in the back half of its cell gets a nudge. The camera sees
 * the fingertip from the front, a little above the string: this is coaching, not measurement.
 */
import { locatePixel, type FretboardPose, type Point } from '@/core/vision';

/** Landmark indices of the fingertips (MediaPipe hand model): index, middle, ring, little finger. */
export const FINGERTIPS: ReadonlyArray<{ finger: 1 | 2 | 3 | 4; landmark: number; name: string }> = [
  { finger: 1, landmark: 8, name: 'index' },
  { finger: 2, landmark: 12, name: 'middle' },
  { finger: 3, landmark: 16, name: 'ring' },
  { finger: 4, landmark: 20, name: 'little' },
];

/** A landmark as MediaPipe gives it: x, y in 0..1 of the frame. */
export interface Landmark {
  x: number;
  y: number;
}

/** Where one fingertip is. */
export interface FingerReading {
  finger: 1 | 2 | 3 | 4;
  /** The fingertip in pixels of the pose's frame. */
  point: Point;
  onBoard: boolean;
  string: number;
  /** Fret cell (0 = behind the nut). */
  fret: number;
  /** Distance behind the wire in front, as a share of the cell (0 = on the wire, 1 = at the wire behind). */
  behindWire: number;
  /** 'good' close to the wire, 'far' in the back half of the cell, 'off' not on the board. */
  advice: 'good' | 'far' | 'off';
}

/** From this share of the cell behind the wire on, a fingertip is told to move up to the wire. */
export const FAR_FROM_WIRE = 0.55;

/** Read the four fingertips of one hand through the pose. */
export function readFingers(hand: readonly Landmark[], pose: FretboardPose): FingerReading[] {
  const out: FingerReading[] = [];
  for (const tip of FINGERTIPS) {
    const lm = hand[tip.landmark];
    if (!lm || !Number.isFinite(lm.x) || !Number.isFinite(lm.y)) continue;
    const point = { x: lm.x * pose.frameWidth, y: lm.y * pose.frameHeight };
    const loc = locatePixel(pose, point);
    if (!loc) {
      out.push({ finger: tip.finger, point, onBoard: false, string: 0, fret: 0, behindWire: 0, advice: 'off' });
      continue;
    }
    // In cell n (between wire n-1 and wire n) the wire in front is n.
    const behind = loc.fret >= 1 ? Math.min(1, Math.max(0, loc.fret - loc.fretExact)) : 0;
    const onBoard = loc.onBoard && loc.fret >= 1 && Math.abs(loc.stringOffset) <= 0.75;
    out.push({ finger: tip.finger, point, onBoard, string: loc.string, fret: loc.fret, behindWire: behind, advice: !onBoard ? 'off' : behind >= FAR_FROM_WIRE ? 'far' : 'good' });
  }
  return out;
}

/** Of the hands in view, the fretting hand: the one with the most fingertips on the board (null when none is). */
export function frettingHand(hands: readonly (readonly Landmark[])[], pose: FretboardPose): { index: number; fingers: FingerReading[] } | null {
  let best: { index: number; fingers: FingerReading[]; on: number } | null = null;
  hands.forEach((hand, index) => {
    const fingers = readFingers(hand, pose);
    const on = fingers.filter((f) => f.onBoard).length;
    if (on > 0 && (!best || on > best.on)) best = { index, fingers, on };
  });
  const chosen = best as { index: number; fingers: FingerReading[]; on: number } | null;
  return chosen ? { index: chosen.index, fingers: chosen.fingers } : null;
}

/** One line of advice for the fingers on the board (the worst first), or a description when all is fine. */
export function handAdvice(fingers: readonly FingerReading[]): { tone: 'ok' | 'warn' | 'info'; text: string } {
  const on = fingers.filter((f) => f.onBoard);
  if (on.length === 0) return { tone: 'info', text: 'No fingertips on the frets yet.' };
  const far = on.filter((f) => f.advice === 'far').sort((a, b) => b.behindWire - a.behindWire)[0];
  if (far) return { tone: 'warn', text: `Finger ${far.finger} is far from the fret wire: slide it up close behind fret ${far.fret}'s wire.` };
  const where = on.map((f) => `${f.finger} on fret ${f.fret}`).join(', ');
  return { tone: 'ok', text: `Fingers close to the wires (finger ${where}).` };
}

/**
 * Bends, pre-bends and vibrato judged from the microphone's pitch readings. A bend is a note that
 * starts at its fret's pitch and rises; what counts is the pitch it is held at, against the target.
 * Pure: the screen collects `pitch` readings and `onset` times from `@/core/pitch` and calls these.
 */
import type { Verdict } from './takes';

/** One pitch reading: time (seconds, any clock), frequency in Hz and clarity 0..1. */
export interface PitchSample {
  time: number;
  freq: number;
  clarity: number;
}

/** The result of a bend check. */
export interface BendResult {
  found: boolean;
  /** Held pitch against the target, in cents (negative = short of it). */
  reachedCents: number;
  /** How long it was held steady, in ms. */
  heldMs: number;
  /** How far it went past the held pitch before settling, in cents (0 if not). */
  overshootCents: number;
  /** How far the pitch sank from the start of the hold to its end, in cents (positive = sank). */
  sinkingCents: number;
  verdict: Verdict;
  messages: string[];
}

/** The result of a pre-bend check. */
export interface PrebendResult {
  found: boolean;
  /** The first steady pitch against the bent target, in cents. */
  startCents: number;
  /** The last steady pitch against the fret's own note, in cents. */
  endCents: number;
  /** How long the fall from the bent pitch to the fret's took, in ms. */
  releaseMs: number;
  verdict: Verdict;
  messages: string[];
}

/** The result of a vibrato check. */
export interface VibratoResult {
  found: boolean;
  /** Waves per second, and per beat at the tempo. */
  rateHz: number;
  perBeat: number;
  /** Median peak-to-trough width, in cents. */
  widthCents: number;
  /** Lowest point of the typical wave against the note, in cents (bending vibrato must stay at or above 0). */
  lowCents: number;
  /** Middle of the wave against the note, in cents. */
  centreCents: number;
  /** How much the wave lengths vary (0 = perfectly even). */
  unevenness: number;
  verdict: Verdict;
  messages: string[];
}

/** Frequency of a MIDI note for a reference A4. */
export function midiFreq(midi: number, a4 = 440): number {
  return a4 * 2 ** ((midi - 69) / 12);
}

/** Cents from `ref` Hz to `f` Hz. */
export function centsBetween(f: number, ref: number): number {
  return 1200 * Math.log2(f / ref);
}

function median(xs: readonly number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
}

function mean(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
}

function stdev(xs: readonly number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

interface Point {
  t: number;
  c: number;
}

/** Clear readings as cents against a reference, split into notes at onsets (or at gaps without onsets). */
function segments(samples: readonly PitchSample[], onsets: readonly number[], refHz: number, minClarity = 0.6): Point[][] {
  const pts = samples.filter((s) => s.clarity >= minClarity && s.freq > 0).map((s) => ({ t: s.time, c: centsBetween(s.freq, refHz) }));
  pts.sort((a, b) => a.t - b.t);
  const cuts = [...onsets].sort((a, b) => a - b);
  const out: Point[][] = [];
  let cur: Point[] = [];
  let k = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    let cut = false;
    while (k < cuts.length && cuts[k] <= p.t) {
      cut = true;
      k++;
    }
    if (i > 0 && p.t - pts[i - 1].t > 0.15) cut = true;
    if (cut && cur.length) {
      out.push(cur);
      cur = [];
    }
    cur.push(p);
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * The held part of a note: the highest stretch of at least `minSec` whose readings stay within
 * `maxStd` cents, grown to both sides for as long as the pitch moves smoothly and stays within
 * 50 cents of it (so a hold that slowly sinks is still one hold).
 */
function highestPlateau(seg: readonly Point[], minSec: number, maxStd: number, above: number): { from: number; to: number; level: number } | null {
  let best: { from: number; to: number; level: number } | null = null;
  let j = 0;
  for (let i = 0; i < seg.length; i++) {
    while (j < seg.length && seg[j].t - seg[i].t < minSec) j++;
    if (j >= seg.length) break;
    const win = seg.slice(i, j + 1).map((p) => p.c);
    if (win.length < 6) continue;
    const m = mean(win);
    if (m < above) continue;
    if (stdev(win) > maxStd) continue;
    if (!best || m > best.level + 3) best = { from: i, to: j, level: m };
  }
  if (!best) return null;
  let { from, to } = best;
  const level0 = best.level;
  while (from > 0 && Math.abs(seg[from - 1].c - level0) <= 15) from--;
  while (to < seg.length - 1 && Math.abs(seg[to + 1].c - seg[to].c) <= 8 && Math.abs(seg[to + 1].c - level0) <= 50) to++;
  const level = median(seg.slice(from, to + 1).map((p) => p.c));
  return { from, to, level };
}

/** Note name for messages, with ♯. */
export function noteName(midi: number): string {
  const names = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];
  return names[((Math.round(midi) % 12) + 12) % 12];
}

/**
 * Judge a bend from `fromMidi` (the fret) up to `toMidi` (the target).
 * The last note in the take that starts near the fret's pitch and rises is the attempt.
 */
export function analyzeBend(samples: readonly PitchSample[], onsets: readonly number[], spec: { fromMidi: number; toMidi: number; toleranceCents: number; a4?: number }): BendResult {
  const a4 = spec.a4 ?? 440;
  const target = midiFreq(spec.toMidi, a4);
  const startAt = (spec.fromMidi - spec.toMidi) * 100; // e.g. -200 for a whole step
  const tol = spec.toleranceCents;
  const none = (msg: string): BendResult => ({ found: false, reachedCents: NaN, heldMs: 0, overshootCents: 0, sinkingCents: 0, verdict: 'not-yet', messages: [msg] });

  let attemptSeg: Point[] | null = null;
  for (const seg of segments(samples, onsets, target)) {
    if (seg.length < 8) continue;
    const t0 = seg[0].t;
    const early = seg.filter((p) => p.t >= t0 + 0.03 && p.t <= t0 + 0.15).map((p) => p.c);
    const start = median(early.length ? early : seg.slice(0, 5).map((p) => p.c));
    if (Math.abs(start - startAt) > 60) continue; // not starting at the fret: the target note, or something else
    const top = Math.max(...seg.map((p) => p.c));
    if (top < start + 35) continue; // never bent
    attemptSeg = seg;
  }
  if (!attemptSeg) {
    return none(`No bend came through. Pick the note at the fret, then push it up toward ${noteName(spec.toMidi)} and hold it.`);
  }
  const seg = attemptSeg;
  const plateau = highestPlateau(seg, 0.25, 10, startAt + 35);
  if (!plateau) {
    const top = Math.max(...seg.map((p) => p.c));
    return { ...none(`The bend moved but never settled. Push up to ${noteName(spec.toMidi)} and hold it still for two beats.`), found: true, reachedCents: top };
  }
  const hold = seg.slice(plateau.from, plateau.to + 1);
  const heldMs = Math.round((hold[hold.length - 1].t - hold[0].t) * 1000);
  const before = seg.slice(0, plateau.from).map((p) => p.c);
  const overshoot = before.length ? Math.max(0, Math.max(...before) - plateau.level) : 0;
  const third = Math.max(1, Math.floor(hold.length / 3));
  const sinking = mean(hold.slice(0, third).map((p) => p.c)) - mean(hold.slice(-third).map((p) => p.c));
  const reached = plateau.level;

  let verdict: Verdict;
  if (Math.abs(reached) <= tol) verdict = heldMs >= 300 ? 'clean' : 'close';
  else if (Math.abs(reached) <= 25) verdict = 'close';
  else verdict = 'not-yet';

  const name = noteName(spec.toMidi);
  const messages: string[] = [];
  const r = Math.round(reached);
  if (Math.abs(reached) <= tol) messages.push(`In tune: your bend held ${Math.abs(r)} cents from ${name}.`);
  else if (reached < 0) messages.push(`Your bend stopped ${Math.abs(r)} cents short of ${name}: push a little further.`);
  else messages.push(`Your bend went ${r} cents past ${name}: stop a little sooner.`);
  if (heldMs < 300) messages.push('Hold the bent note steady for two beats.');
  else messages.push(`Held steady for ${(heldMs / 1000).toFixed(1)} s.`);
  if (overshoot > 20) messages.push(`It overshot by ${Math.round(overshoot)} cents before settling: bend more slowly and stop on the target.`);
  if (sinking > 12) messages.push(`The pitch sank ${Math.round(sinking)} cents while held: keep the push steady from the wrist.`);
  return { found: true, reachedCents: reached, heldMs, overshootCents: overshoot, sinkingCents: sinking, verdict, messages };
}

/** Judge a pre-bend: picked already bent to `bentMidi`, released to `fretMidi`. */
export function analyzePrebend(samples: readonly PitchSample[], onsets: readonly number[], spec: { fretMidi: number; bentMidi: number; toleranceCents: number; beatSec: number; a4?: number }): PrebendResult {
  const a4 = spec.a4 ?? 440;
  const fret = midiFreq(spec.fretMidi, a4);
  const span = (spec.bentMidi - spec.fretMidi) * 100;
  const tol = spec.toleranceCents;
  let found: Point[] | null = null;
  for (const seg of segments(samples, onsets, fret)) {
    if (seg.length < 10) continue;
    const t0 = seg[0].t;
    const early = seg.filter((p) => p.t >= t0 + 0.03 && p.t <= t0 + 0.15).map((p) => p.c);
    const start = median(early);
    if (!(Math.abs(start - span) <= 60)) continue;
    const low = Math.min(...seg.map((p) => p.c));
    if (low > span - 80) continue;
    found = seg;
  }
  if (!found) {
    return { found: false, startCents: NaN, endCents: NaN, releaseMs: 0, verdict: 'not-yet', messages: [`No pre-bend came through. Bend the string up to ${noteName(spec.bentMidi)} first, then pick it and let it down to ${noteName(spec.fretMidi)}.`] };
  }
  const seg = found;
  const t0 = seg[0].t;
  const startCents = median(seg.filter((p) => p.t >= t0 + 0.03 && p.t <= t0 + 0.15).map((p) => p.c)) - span;
  const lastT = seg[seg.length - 1].t;
  const endCents = median(seg.filter((p) => p.t >= lastT - 0.15).map((p) => p.c));
  const leave = seg.find((p) => p.c < span - 40);
  const arrive = seg.find((p) => leave && p.t > leave.t && p.c < 30);
  const releaseMs = leave && arrive ? Math.round((arrive.t - leave.t) * 1000) : 0;
  const startOk = Math.abs(startCents) <= tol;
  const endOk = Math.abs(endCents) <= tol;
  const smooth = releaseMs >= spec.beatSec * 1000 * 0.4;
  let verdict: Verdict = startOk && endOk && smooth ? 'clean' : Math.abs(startCents) <= 30 && Math.abs(endCents) <= 30 ? 'close' : 'not-yet';
  if (!arrive) verdict = 'not-yet';
  const messages: string[] = [];
  const sc = Math.round(startCents);
  messages.push(startOk ? `It started in tune on ${noteName(spec.bentMidi)}.` : sc < 0 ? `It started ${Math.abs(sc)} cents under ${noteName(spec.bentMidi)}: pre-bend a little further.` : `It started ${sc} cents over ${noteName(spec.bentMidi)}: pre-bend a little less.`);
  if (!arrive) messages.push(`It never came back down to ${noteName(spec.fretMidi)}. Let the string all the way down.`);
  else {
    const ec = Math.round(endCents);
    messages.push(endOk ? `It ended in tune on ${noteName(spec.fretMidi)}.` : `It ended ${Math.abs(ec)} cents ${ec < 0 ? 'under' : 'over'} ${noteName(spec.fretMidi)}.`);
    messages.push(smooth ? `A smooth release over ${(releaseMs / 1000).toFixed(2)} s.` : `The release took only ${releaseMs} ms: let it fall over the whole beat.`);
  }
  return { found: true, startCents, endCents, releaseMs, verdict, messages };
}

/**
 * Judge vibrato on a held note: speed against the beat, width, evenness, and where it sits
 * against the note (bending vibrato only goes up; classical vibrato goes both ways).
 */
export function analyzeVibrato(samples: readonly PitchSample[], spec: { midi: number; style: 'bend' | 'classical'; wavesPerBeat: number; bpm: number; a4?: number }): VibratoResult {
  const a4 = spec.a4 ?? 440;
  const ref = midiFreq(spec.midi, a4);
  const none = (msg: string): VibratoResult => ({ found: false, rateHz: 0, perBeat: 0, widthCents: 0, lowCents: 0, centreCents: 0, unevenness: 0, verdict: 'not-yet', messages: [msg] });
  // The longest stretch of readings near the note.
  const segs = segments(samples, [], ref).map((s) => s.filter((p) => Math.abs(p.c) < 90)).filter((s) => s.length > 20);
  if (!segs.length) return none(`No held ${noteName(spec.midi)} came through. Hold the note for the whole bar while you add the vibrato.`);
  const seg = segs.reduce((a, b) => (b[b.length - 1].t - b[0].t > a[a.length - 1].t - a[0].t ? b : a));
  // Skip the pluck, then smooth lightly.
  const body = seg.filter((p) => p.t >= seg[0].t + 0.12);
  const sm = body.map((p, i) => ({ t: p.t, c: mean(body.slice(Math.max(0, i - 1), i + 2).map((q) => q.c)) }));
  // Turning points with hysteresis, so noise is not a wave.
  const hyst = 3;
  const turns: Array<{ t: number; c: number; kind: 'peak' | 'trough' }> = [];
  let dir = 0;
  let hi = sm[0];
  let lo = sm[0];
  let ext = sm[0];
  for (const p of sm) {
    if (dir === 0) {
      if (p.c > hi.c) hi = p;
      if (p.c < lo.c) lo = p;
      if (hi.c - lo.c > hyst) {
        dir = hi.t > lo.t ? 1 : -1;
        ext = dir > 0 ? hi : lo;
      }
      continue;
    }
    if (dir > 0) {
      if (p.c > ext.c) ext = p;
      else if (p.c < ext.c - hyst) {
        turns.push({ ...ext, kind: 'peak' });
        dir = -1;
        ext = p;
      }
    } else if (p.c < ext.c) ext = p;
    else if (p.c > ext.c + hyst) {
      turns.push({ ...ext, kind: 'trough' });
      dir = 1;
      ext = p;
    }
  }
  const peaks = turns.filter((x) => x.kind === 'peak');
  const troughs = turns.filter((x) => x.kind === 'trough');
  if (peaks.length < 3 || troughs.length < 2) {
    return { ...none('The note was steady, with hardly any vibrato. Add small, even waves: push and release in time with the click.'), found: true };
  }
  const periods: number[] = [];
  for (let i = 1; i < peaks.length; i++) periods.push(peaks[i].t - peaks[i - 1].t);
  const period = median(periods);
  const rateHz = 1 / period;
  const perBeat = rateHz * (60 / spec.bpm);
  const widths: number[] = [];
  for (const p of peaks) {
    const near = troughs.filter((tr) => Math.abs(tr.t - p.t) < period);
    if (near.length) widths.push(p.c - Math.min(...near.map((x) => x.c)));
  }
  const widthCents = median(widths);
  const lowCents = median(troughs.map((x) => x.c));
  const centreCents = (median(peaks.map((x) => x.c)) + lowCents) / 2;
  const unevenness = periods.length > 1 ? stdev(periods) / mean(periods) : 0;

  const rateOk = Math.abs(perBeat - spec.wavesPerBeat) <= spec.wavesPerBeat * 0.2;
  const evenOk = unevenness <= 0.25;
  const [minW, maxW] = spec.style === 'bend' ? [15, 80] : [6, 45];
  const widthOk = widthCents >= minW && widthCents <= maxW;
  const sideOk = spec.style === 'bend' ? lowCents >= -10 : Math.abs(centreCents) <= 10;
  const good = [rateOk, evenOk, widthOk, sideOk].filter(Boolean).length;
  const verdict: Verdict = good === 4 ? 'clean' : good >= 3 ? 'close' : 'not-yet';

  const messages: string[] = [];
  const pb = perBeat.toFixed(1);
  messages.push(rateOk ? `In time: ${pb} waves per beat (aiming for ${spec.wavesPerBeat}).` : `${pb} waves per beat; aim for ${spec.wavesPerBeat}: ${perBeat > spec.wavesPerBeat ? 'slow the waves down' : 'make the waves quicker'}.`);
  messages.push(widthOk ? `Width ${Math.round(widthCents)} cents: musical.` : widthCents > maxW ? `Width ${Math.round(widthCents)} cents: make it narrower.` : `Width ${Math.round(widthCents)} cents: make it a little wider.`);
  if (!evenOk) messages.push('The waves were uneven: keep each one the same length, locked to the click.');
  if (spec.style === 'bend' && !sideOk) messages.push(`It dipped ${Math.abs(Math.round(lowCents))} cents below ${noteName(spec.midi)}: only push up, and let the string come back to rest.`);
  if (spec.style === 'classical' && !sideOk) messages.push(`The waves sat ${Math.abs(Math.round(centreCents))} cents ${centreCents > 0 ? 'above' : 'below'} the note: rock evenly both ways along the string.`);
  return { found: true, rateHz, perBeat, widthCents, lowCents, centreCents, unevenness, verdict, messages };
}

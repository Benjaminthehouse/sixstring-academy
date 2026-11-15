/**
 * Charts: a round laid out on one tick line. A chart says what is heard (clicks, strums, a guide
 * sound), what the learner is expected to play (targets) and how the round is divided into
 * stretches (count-in, listen, play). The session plays a chart; it knows nothing about which
 * activity it came from.
 *
 * Ticks are 960 per quarter note and start at 0 with the first count-in click. Target and sound
 * ticks are the positions as played: swing is already applied.
 */
import { PPQ } from '@/core/theory';
import { countAt, type CountPart } from './counting';
import { meterInfo, type MeterInfo } from './meter';
import { rhythmOnsets, type Rhythm } from './rhythm';
import { sounds as strokeSounds, strokes, type StrokeKind, type StrumPattern } from './strum';

/** Loudness of a metronome click (the audio engine's levels). */
export type ClickLevel = 'accent' | 'medium' | 'beat' | 'sub';

/** Something the app plays. */
export type ChartSound =
  | { tick: number; type: 'click'; level: ClickLevel }
  | { tick: number; type: 'strum'; dir: 'D' | 'U'; kind: Exclude<StrokeKind, 'ghost'>; bar: number }
  | { tick: number; type: 'guide'; ticks: number; accent: boolean };

/** A note the learner is expected to play. */
export interface Target {
  id: number;
  tick: number;
  part: CountPart;
  /** The counting syllable. */
  label: string;
  /** Index of the segment it belongs to. */
  seg: number;
  /** Index inside the segment's display: the onset in a written rhythm, the slot in a strum pattern, the beat in a pulse. */
  ref: number;
  dir?: 'D' | 'U';
  /** The click is silent here. */
  silent?: boolean;
}

/** A stretch of the round. */
export interface Segment {
  index: number;
  kind: 'count' | 'listen' | 'play';
  startTick: number;
  endTick: number;
  /** Which phrase / pattern / cue this belongs to (count-ins belong to what follows them). */
  phrase: number;
  /** A word for the learner at the start of the stretch ("Eighths", "Click off"). */
  cue?: string;
  /** The click is silent in this stretch. */
  silent?: boolean;
  bars: number;
}

/** A whole round. */
export interface Chart {
  meter: string;
  /** Felt beats per minute. */
  bpm: number;
  lengthTicks: number;
  targets: Target[];
  sounds: ChartSound[];
  segments: Segment[];
  /** Repeat this stretch until stopped (listening to a strum pattern). */
  loop?: { start: number; end: number };
}

/** How the click marks a bar. */
export type ClickStyle = 'beats' | 'units' | 'flat-units' | 'none';

/**
 * The clicks of `bars` bars starting at `from`. `beats`: one per felt beat, the first accented,
 * with soft eighths in compound time so the three-feel is audible. `units`: one per written unit
 * with accents on the groups (odd meters). `flat-units`: the same clicks with no accents at all.
 */
export function clicks(meter: MeterInfo, from: number, bars: number, style: ClickStyle = 'beats'): ChartSound[] {
  const out: ChartSound[] = [];
  if (style === 'none') return out;
  for (let b = 0; b < bars; b++) {
    const base = from + b * meter.barTicks;
    if (style === 'beats') {
      meter.beatStarts.forEach((start, i) => {
        out.push({ tick: base + start, type: 'click', level: i === 0 ? 'accent' : 'beat' });
        if (meter.compound) {
          for (let u = 1; u < 3; u++) out.push({ tick: base + start + u * meter.ts.unitTicks, type: 'click', level: 'sub' });
        }
      });
    } else {
      meter.ts.accents.forEach((accent, u) => {
        const level: ClickLevel = style === 'flat-units' ? 'beat' : accent === 'strong' ? 'accent' : accent === 'medium' ? 'medium' : 'sub';
        out.push({ tick: base + u * meter.ts.unitTicks, type: 'click', level });
      });
    }
  }
  return out;
}

class Builder {
  readonly meter: MeterInfo;
  targets: Target[] = [];
  sounds: ChartSound[] = [];
  segments: Segment[] = [];
  at = 0;

  constructor(readonly meterId: string, readonly bpm: number) {
    this.meter = meterInfo(meterId);
  }

  segment(kind: Segment['kind'], bars: number, phrase: number, extra: { cue?: string; silent?: boolean; click?: ClickStyle } = {}): Segment {
    const seg: Segment = { index: this.segments.length, kind, startTick: this.at, endTick: this.at + bars * this.meter.barTicks, phrase, bars, cue: extra.cue, silent: extra.silent };
    this.segments.push(seg);
    this.sounds.push(...clicks(this.meter, this.at, bars, extra.silent ? 'none' : extra.click ?? 'beats'));
    this.at = seg.endTick;
    return seg;
  }

  target(seg: Segment, tickInSeg: number, ref: number, extra: { dir?: 'D' | 'U'; writtenTick?: number } = {}): void {
    const written = extra.writtenTick ?? tickInSeg;
    const count = countAt(((written % this.meter.barTicks) + this.meter.barTicks) % this.meter.barTicks, this.meter);
    this.targets.push({ id: this.targets.length, tick: seg.startTick + tickInSeg, part: count.part, label: count.text, seg: seg.index, ref, dir: extra.dir, silent: seg.silent });
  }

  done(loop?: Chart['loop']): Chart {
    this.sounds.sort((a, b) => a.tick - b.tick);
    return { meter: this.meterId, bpm: this.bpm, lengthTicks: this.at, targets: this.targets, sounds: this.sounds, segments: this.segments, loop };
  }
}

/** Which beats of the bar are tapped in "Feel the beat". */
export type PulseHit = 'all' | 'backbeat' | 'one';

/** A steady pulse to tap along with: a bar of count-in, then `bars` bars. */
export function pulseChart(opts: { meter?: string; bpm: number; bars: number; hit?: PulseHit }): Chart {
  const b = new Builder(opts.meter ?? '4/4', opts.bpm);
  b.segment('count', 1, 0);
  const seg = b.segment('play', opts.bars, 0);
  const hit = opts.hit ?? 'all';
  let ref = 0;
  for (let bar = 0; bar < opts.bars; bar++) {
    b.meter.beatStarts.forEach((start, beat) => {
      const wanted = hit === 'all' || (hit === 'one' && beat === 0) || (hit === 'backbeat' && beat % 2 === 1);
      if (wanted) b.target(seg, bar * b.meter.barTicks + start, ref);
      ref++;
    });
  }
  return b.done();
}

/**
 * Read and tap: every phrase gets a bar of count-in, then its bars. With `echo` the phrase is
 * played first (a guide sound on every note) and counted in again before the learner's turn.
 */
export function readChart(phrases: readonly Rhythm[], opts: { bpm: number; echo?: boolean }): Chart {
  if (!phrases.length) throw new RangeError('A round needs at least one phrase');
  const b = new Builder(phrases[0].meter, opts.bpm);
  phrases.forEach((rhythm, p) => {
    const onsets = rhythmOnsets(rhythm);
    if (opts.echo) {
      b.segment('count', 1, p, { cue: 'Listen' });
      const listen = b.segment('listen', rhythm.bars.length, p);
      for (const o of onsets) b.sounds.push({ tick: listen.startTick + o.playTick, type: 'guide', ticks: o.ticks, accent: o.accent });
    }
    b.segment('count', 1, p, { cue: opts.echo ? 'Your turn' : undefined });
    const play = b.segment('play', rhythm.bars.length, p);
    onsets.forEach((o, i) => b.target(play, o.playTick, i, { writtenTick: o.tick }));
  });
  return b.done();
}

/** What a strumming round is for. */
export type StrumMode = 'listen' | 'play';

/**
 * A strumming pattern repeated for `bars` bars after a bar of count-in. `guitar` adds the
 * synthesised strums; in `play` mode every sounding stroke is a target. `listen` loops for ever.
 */
export function strumChart(pattern: StrumPattern, opts: { bpm: number; bars: number; mode: StrumMode; guitar: boolean }): Chart {
  const b = new Builder(pattern.meter, opts.bpm);
  b.segment('count', 1, 0);
  const seg = b.segment('play', opts.bars, 0);
  const list = strokes(pattern).filter(strokeSounds);
  for (let bar = 0; bar < opts.bars; bar++) {
    const base = bar * b.meter.barTicks;
    for (const s of list) {
      if (opts.guitar) b.sounds.push({ tick: seg.startTick + base + s.playTick, type: 'strum', dir: s.dir, kind: s.kind as Exclude<StrokeKind, 'ghost'>, bar });
      if (opts.mode === 'play') b.target(seg, base + s.playTick, s.slot, { dir: s.dir, writtenTick: s.tick });
    }
  }
  return b.done(opts.mode === 'listen' ? { start: seg.startTick, end: seg.endTick } : undefined);
}

/** A subdivision of the beat the learner can be asked to tap. */
export type Subdivision = 'quarter' | 'eighth' | 'triplet' | 'sixteenth';

/** Notes per beat and the name of each subdivision. */
export const SUBDIVISIONS: Record<Subdivision, { per: number; name: string; say: string }> = {
  quarter: { per: 1, name: 'Quarters', say: '1  2  3  4' },
  eighth: { per: 2, name: 'Eighths', say: '1 & 2 &' },
  triplet: { per: 3, name: 'Triplets', say: '1 trip let' },
  sixteenth: { per: 4, name: 'Sixteenths', say: '1 e & a' },
};

/** Switch on cue: every bar names a subdivision and the learner taps it for that bar (4/4). */
export function switchChart(opts: { bpm: number; sequence: readonly Subdivision[] }): Chart {
  const b = new Builder('4/4', opts.bpm);
  b.segment('count', 1, 0, { cue: SUBDIVISIONS[opts.sequence[0]].name });
  opts.sequence.forEach((sub, i) => {
    const seg = b.segment('play', 1, i, { cue: SUBDIVISIONS[sub].name });
    const per = SUBDIVISIONS[sub].per;
    for (let beat = 0; beat < 4; beat++) for (let k = 0; k < per; k++) b.target(seg, beat * PPQ + Math.round((k * PPQ) / per), beat * per + k);
  });
  return b.done();
}

/** A seeded sequence of subdivisions that never repeats the same one twice running. */
export function switchSequence(pool: readonly Subdivision[], bars: number, random: () => number): Subdivision[] {
  const out: Subdivision[] = [];
  for (let i = 0; i < bars; i++) {
    const options = pool.filter((s) => s !== out[i - 1]);
    const from = options.length ? options : pool;
    // Open on the calmest subdivision so the first bar sets the pulse.
    out.push(i === 0 ? pool[0] : from[Math.floor(random() * from.length)]);
  }
  return out;
}

/** Which off-beat is tapped in the off-beat drill. */
export type OffbeatPart = 'and' | 'a' | 'e';

/** Clap between the clicks: the click plays the beats, the learner plays only the chosen off-beat (4/4). */
export function offbeatChart(opts: { bpm: number; bars: number; part: OffbeatPart }): Chart {
  const b = new Builder('4/4', opts.bpm);
  b.segment('count', 1, 0);
  const seg = b.segment('play', opts.bars, 0);
  const offset = opts.part === 'and' ? PPQ / 2 : opts.part === 'a' ? (PPQ * 3) / 4 : PPQ / 4;
  let ref = 0;
  for (let bar = 0; bar < opts.bars; bar++) for (let beat = 0; beat < 4; beat++) b.target(seg, bar * b.meter.barTicks + beat * PPQ + offset, ref++);
  return b.done();
}

/**
 * Find beat one. Every written unit clicks. For the first `guided` bars the groups are accented;
 * then the accents vanish and only counting tells where the bar starts. The learner taps beat one
 * of every bar.
 */
export function findOneChart(opts: { meter: string; bpm: number; guided: number; blind: number }): Chart {
  const b = new Builder(opts.meter, opts.bpm);
  b.segment('count', 1, 0, { click: 'units', cue: 'Listen for the accent' });
  const guided = b.segment('play', opts.guided, 0, { click: 'units', cue: 'Tap on 1' });
  for (let bar = 0; bar < opts.guided; bar++) b.target(guided, bar * b.meter.barTicks, bar);
  const blind = b.segment('play', opts.blind, 1, { click: 'flat-units', cue: 'Accents off: keep counting' });
  for (let bar = 0; bar < opts.blind; bar++) b.target(blind, bar * b.meter.barTicks, bar);
  return b.done();
}

/**
 * Inner clock: tap every beat. The click plays for `on` bars and drops out for `off` bars,
 * `cycles` times, and comes back for one closing bar so the learner hears where they landed.
 */
export function clockChart(opts: { bpm: number; on: number; off: number; cycles: number; meter?: string }): Chart {
  const b = new Builder(opts.meter ?? '4/4', opts.bpm);
  b.segment('count', 1, 0);
  const beats = (seg: Segment, bars: number) => {
    let ref = 0;
    for (let bar = 0; bar < bars; bar++) for (const start of b.meter.beatStarts) b.target(seg, bar * b.meter.barTicks + start, ref++);
  };
  for (let cycle = 0; cycle < opts.cycles; cycle++) {
    beats(b.segment('play', opts.on, cycle * 2, { cue: 'Click on' }), opts.on);
    beats(b.segment('play', opts.off, cycle * 2 + 1, { cue: 'Click off: keep going', silent: true }), opts.off);
  }
  beats(b.segment('play', 1, opts.cycles * 2, { cue: 'Click back' }), 1);
  return b.done();
}

/** Tempo of the calibration round: 100 BPM, so sixteen taps take just under ten seconds. */
export const CALIBRATION_BPM = 100;

/** Ticks (inside the probe bar) of the unevenly spaced clicks that test whether the microphone hears the speakers. */
export const PROBE_TICKS = [0, 880, 1570, 2990] as const;

/**
 * The calibration round: a bar of count-in and four bars of clicks to tap or clap with. With
 * `probe` (microphone) it opens with a bar of four unevenly spaced clicks during which the learner
 * stays quiet; nobody claps along with those by accident, so whatever the microphone hears of them
 * is the speakers.
 */
export function calibrationChart(opts: { probe?: boolean } = {}): Chart {
  const b = new Builder('4/4', CALIBRATION_BPM);
  if (opts.probe) {
    const probe = b.segment('listen', 1, 0, { click: 'none', cue: 'Stay quiet for a moment' });
    for (const tick of PROBE_TICKS) b.sounds.push({ tick: probe.startTick + tick, type: 'click', level: 'beat' });
  }
  b.segment('count', 1, 0, { cue: 'Get ready' });
  const seg = b.segment('play', 4, 0, { cue: 'With every click' });
  let ref = 0;
  for (let bar = 0; bar < 4; bar++) for (const start of b.meter.beatStarts) b.target(seg, bar * b.meter.barTicks + start, ref++);
  return b.done();
}

/** Seconds a chart lasts at its tempo. */
export function chartSeconds(chart: Chart): number {
  const meter = meterInfo(chart.meter);
  return (chart.lengthTicks * 60) / (chart.bpm * meter.tempoBeatTicks);
}
